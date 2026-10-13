import type { Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { encodeDamageContext } from "./damage-context";
import type { LeaveDestination } from "./mirkwood-player-cards";
import { card, name } from "./cards";
import {
  canGainResources,
  choose,
  encounterDraw,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  putPlayerDeck,
  random,
  reorderPlayerDeck,
  skip,
  spendResources,
  stats,
  threatOf,
} from "./core";
import {
  discardHandCard,
  discardPlayerDeck,
  enemyAddedToStaging,
  engage,
  exhaustCharacter,
  raiseThreat,
} from "./board";
import {
  activeSeat,
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { isHero, unitType } from "./card-types";
import { heirsCanSpendResources, heirsShadowDealt } from "./heirs-numenor";
import { carnShadowDealt } from "./carn-dum";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { resolveDoomed } from "./voice-isengard";
import { stormcallerEffectiveThreat as effectiveThreat } from "./threat-read";
import {
  TEMPLE as T,
  templeActiveLocation,
  templeAdjacent,
  templeCell,
  templeLocationsLeft,
  templeState,
} from "./temple-support";

export type TempleCombat = NonNullable<GameState["combat"]> & {
  /** One instruction for each independently resolved Rainstorm shadow. */
  templeRainOnKill?: number;
};
const live = (s: GameState) =>
  s.scenarioId === "temple-of-the-deceived" && !!s.temple;
const trait = (u: Unit, t: string) =>
  (card(u.code).traits ?? "").split(".").some((x) => x.trim() === t);
const active = (s: GameState, code: string) =>
  live(s) &&
  templeActiveLocation(s)?.code === code &&
  !templeActiveLocation(s)?.blanked;
const ruins = (s: GameState) => {
  const u = templeActiveLocation(s);
  return !!u && trait(u, "Ruins");
};
const uncharted = (s: GameState) =>
  s.staging.filter((u) => [T.lost, T.temple].includes(u.code));
const own = (s: GameState, p: number) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === p);
const ready = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
const cost = (code: string) => Number(card(code).cost) || 0;
const samePhase = (a: string | null, b: string) =>
  a === b || (!!a && [a, b].every((p) => ["quest", "staging"].includes(p)));
const undead = (code: string) =>
  card(code).type_code === "enemy" &&
  (card(code).traits ?? "").split(".").some((x) => x.trim() === "Undead");
const removeOne = (pile: string[], code: string) => {
  const index = pile.lastIndexOf(code);
  if (index >= 0) pile.splice(index, 1);
};
function lose(s: GameState, reason: string) {
  s.status = "lost";
  s.reason = reason;
  s.queue = [];
  s.choice = null;
  log(s, reason, "danger");
}
function bottomDiscard(s: GameState, player: number) {
  let code: string | undefined;
  forOwner(s, player, () => {
    const n = s.deck.length;
    if (!n) return;
    reorderPlayerDeck(s, 0, [
      n - 1,
      ...Array.from({ length: n - 1 }, (_, i) => i),
    ]);
    code = discardPlayerDeck(s, 1, player)[0];
  });
  return code;
}
function handToBottom(s: GameState, u: Unit, player: number) {
  forOwner(s, player, () => (s.hand = s.hand.filter((h) => h.id !== u.id)));
  forOwner(s, u.owner ?? player, () => putPlayerDeck(s, u));
}

/** Only the printed keyword line applies before When Revealed cancellation. */
export function templePrintedDoomed(s: GameState, code: string) {
  return live(s) && [T.deeper, T.supplies, T.wandering].includes(code)
    ? 0
    : undefined;
}
export function templeEncounterStats(s: GameState, u: Unit) {
  const sahir =
    live(s) && u.code === T.sahirAlly && !u.blanked
      ? Math.min(6, u.resources)
      : 0;
  const halls =
    active(s, T.halls) &&
    ["hero", "ally", "objective-ally", "ship-objective"].includes(unitType(u))
      ? -1
      : 0;
  return {
    will: sahir,
    attack: sahir + halls,
    defense: halls,
    threat: templeEncounterThreatBonus(s, u),
  };
}
export function templeEncounterThreatBonus(s: GameState, u: Unit) {
  const q = templeState(s);
  if (!live(s) || !q) return 0;
  return (
    (u.code === T.guardian && !u.blanked ? playerOrder(s).length : 0) +
    (samePhase(q.sunkenPhase, s.phase)
      ? q.sunkenBoosts
          .filter((b) => b.locationId === u.id)
          .reduce((n, b) => n + b.value, 0)
      : 0)
  );
}
export function templeEncounterThreat(s: GameState) {
  if (!live(s)) return 0;
  const q = templeState(s)!;
  const flooded = active(s, T.flooded)
    ? threatOf(s, templeActiveLocation(s)!)
    : 0;
  return (
    flooded +
    allEngaged(s)
      .filter((u) => u.code === T.desecrator && !u.blanked)
      .reduce((n, u) => n + threatOf(s, u), 0) +
    (samePhase(q.phaseThreatPhase, s.phase) ? q.phaseThreat : 0)
  );
}
export function templeEncounterEngagement(s: GameState, u: Unit) {
  if (!live(s) || card(u.code).type_code !== "enemy") return 0;
  return (
    (active(s, T.caverns) ? 10 : 0) +
    (u.code === T.guardian && !u.blanked && active(s, T.cursed) ? -50 : 0)
  );
}
export const templeCannotOptionallyEngage = (s: GameState, u: Unit) =>
  live(s) && !u.blanked && [T.guardian, T.watcher].includes(u.code);
export const templeCannotSearch = (s: GameState, player = activeSeat(s)) =>
  live(s) &&
  seatView(s, player).engaged.some((u) => u.code === T.cadaver && !u.blanked);
export const templeCannotRefreshReady = (s: GameState, u: Unit) =>
  active(s, T.cursed) && s.phase === "refresh" && stats(s, u).will < 2;
export function templeEncounterPhaseEnd(s: GameState) {
  const q = templeState(s);
  if (!q) return;
  q.phaseThreat = 0;
  q.phaseThreatPhase = null;
  q.sunkenBoosts = [];
  q.sunkenPhase = null;
}

export function templeLocationFlipped(s: GameState, u: Unit): Effect[] {
  if (!live(s) || u.blanked) return [];
  const player = firstPlayer(s);
  if (u.code === T.cliffs)
    return templeAdjacent(s, u.id)
      .filter((u) => u.code === T.lost)
      .map((u) => fx("templeLook", { target: u.id, flag: true, player }));
  if (u.code === T.jungle)
    return playerOrder(s).map((p) =>
      fx("templeECJungle", { player: p, code: u.code }),
    );
  if (u.code === T.graves)
    return [
      fx("templeECGraves", {
        value: playerOrder(s).length + 2,
        player,
        code: u.code,
      }),
    ];
  if ([T.halls, T.grotto].includes(u.code))
    return [fx("templeECGuardianReturn", { player, code: u.code })];
  return [];
}
export function templeAfterMapMove(
  s: GameState,
  fromId: string,
  toId: string,
): Effect[] {
  if (
    !live(s) ||
    (templeCell(s, toId)?.column ?? 0) <= (templeCell(s, fromId)?.column ?? 0)
  )
    return [];
  return allEngaged(s)
    .filter((u) => u.code === T.profane && !u.blanked)
    .map((u) =>
      fx("templeECProfaneAttack", {
        target: u.id,
        player: ownerOf(s, u),
        code: u.code,
        text: `${name(u)} · Immediate attack against ${seatName(s, ownerOf(s, u))}`,
      }),
    );
}
export function templeEncounterStart(s: GameState): Effect[] {
  return live(s) && ruins(s)
    ? s.staging
        .filter((u) => u.code === T.watcher && !u.blanked)
        .map((u) =>
          fx("templeECWatcher", {
            target: u.id,
            player: firstPlayer(s),
            code: u.code,
            text: "Island Watcher · Engage the player with the highest threat",
          }),
        )
    : [];
}
export function templeEngaged(s: GameState, u: Unit) {
  if (live(s) && u.code === T.cadaver && !u.blanked)
    prepend(s, fx("templeECCadaver", { target: u.id, player: ownerOf(s, u) }));
}
/** Called after complete physical removal, before optional destruction Responses. */
export function templeEnemyDestroyed(
  s: GameState,
  u: Unit,
  wasEngaged: boolean,
  _lastKnownThreat?: number,
) {
  const q = templeState(s);
  if (!live(s) || !q) return;
  if (
    u.code === T.guardian &&
    s.victoryCards?.includes(u.code) &&
    !q.victoryEnemies.some((e) => e.id === u.id)
  )
    q.victoryEnemies.push(u);
  if (u.code === T.throngs && !u.blanked && wasEngaged) {
    const bottom = bottomDiscard(s, ownerOf(s, u));
    if (bottom && cost(bottom) <= 2 && s.encounterDiscard.includes(u.code)) {
      removeOne(s.encounterDiscard, u.code);
      s.encounterDeck.unshift(u.code);
    }
  }
}
export function templeCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  const q = templeState(s);
  if (!live(s) || !q) return;
  if (s.combat && context.combatDamage && context.enemyId === s.combat.enemyId)
    s.combat.raidKilledCharacter = true;
  if (unitType(u) !== "ally") return;
  const enemy = get(s, context.enemyId);
  if (
    context.fateBottomOnDestroy ||
    (context.combatDamage &&
      ((enemy?.code === T.drowned && !enemy.blanked) ||
        !!s.combat?.fateBottomOnAllyKill))
  )
    if (!q.bottomOnDestroy.includes(u.id)) q.bottomOnDestroy.push(u.id);
}
export function templeCharacterLeft(
  s: GameState,
  u: Unit,
  destination: LeaveDestination,
) {
  const q = templeState(s);
  if (
    !live(s) ||
    !q?.bottomOnDestroy.includes(u.id) ||
    destination.zone !== "discard"
  )
    return;
  q.bottomOnDestroy = q.bottomOnDestroy.filter((id) => id !== u.id);
  forOwner(s, destination.player, () => {
    const i = destination.index ?? s.discard.lastIndexOf(u.code);
    if (s.discard[i] !== u.code) return;
    s.discard.splice(i, 1);
    putPlayerDeck(s, u);
    destination.zone = "deck";
    destination.index = s.deck.length - 1;
    destination.id = u.id;
    log(s, `${name(u)} is placed on the bottom of its owner's deck.`, "danger");
  });
}
export function templeCharacterLeaves(s: GameState, u: Unit) {
  if (!live(s) || ![T.sahirAlly, T.naasiyahAlly].includes(u.code)) return;
  if (u.blanked) {
    const q = templeState(s)!;
    if (!q.blankedDepartures.includes(u.code)) q.blankedDepartures.push(u.code);
  } else lose(s, `${name(u)} leaves play. The players lose the game.`);
}
/** The original double-sided companions never enter an encounter/player discard. */
export function templeCompanionRemoved(s: GameState, u: Unit) {
  if (!live(s) || ![T.sahirAlly, T.naasiyahAlly].includes(u.code)) return false;
  const q = templeState(s)!;
  if (!q.removedUnits.some((x) => x.id === u.id)) q.removedUnits.push(u);
  return true;
}
export function templeFirstPlayerChanged(s: GameState) {
  if (!live(s)) return;
  for (const [code, p] of [
    [T.sahirAlly, firstPlayer(s)],
    [T.naasiyahAlly, playerOrder(s).at(-1)!],
  ] as const) {
    const u = allCharacters(s).find((u) => u.code === code && !u.blanked);
    if (!u || ownerOf(s, u) === p) continue;
    forOwner(
      s,
      ownerOf(s, u),
      () => (s.allies = s.allies.filter((x) => x.id !== u.id)),
    );
    u.owner = p;
    u.controller = p;
    forOwner(s, p, () => s.allies.push(u));
  }
}
export function templeEncounterCheck(s: GameState) {
  const q = templeState(s);
  if (!live(s) || !q?.initialized || s.status !== "playing") return;
  for (const code of [T.sahirAlly, T.naasiyahAlly]) {
    const u = allCharacters(s).find((u) => u.code === code);
    if (u) {
      if (u.blanked && !q.blankedDepartures.includes(code))
        q.blankedDepartures.push(code);
      if (!u.blanked)
        q.blankedDepartures = q.blankedDepartures.filter((c) => c !== code);
    } else if (!q.blankedDepartures.includes(code)) {
      lose(s, `${card(code).name} leaves play. The players lose the game.`);
      return;
    }
  }
  templeFirstPlayerChanged(s);
}

export function templeEncounterAbilityLabel(s: GameState, u: Unit) {
  return live(s) && !u.blanked && [T.sahirAlly, T.naasiyahAlly].includes(u.code)
    ? "Spend 1 hero resource · Add 1 resource here · Once per round"
    : null;
}
export function templeEncounterAbilityProblem(s: GameState, u: Unit) {
  if (!templeEncounterAbilityLabel(s, u))
    return "This card has no available action.";
  const p = ownerOf(s, u);
  if (p !== activeSeat(s)) return "Only the controller may use this action.";
  if (seatView(s, p).used.includes(`round:temple-deposit:${u.id}`))
    return "This action has already been used this round.";
  if (!canGainResources(s, u)) return "This card cannot gain resources.";
  return own(s, p).some(
    (h) => isHero(h) && h.resources > 0 && heirsCanSpendResources(s, h),
  )
    ? null
    : "A hero resource is required.";
}
export function useTempleEncounterAbility(s: GameState, u: Unit) {
  if (!templeEncounterAbilityLabel(s, u)) return false;
  if (!templeEncounterAbilityProblem(s, u))
    prepend(s, fx("templeECDeposit", { target: u.id, player: ownerOf(s, u) }));
  return true;
}
export function templePlayerAttackEffects(
  s: GameState,
  enemy: Unit,
  ids: string[],
): Effect[] {
  return live(s)
    ? ids.flatMap((id) =>
        get(s, id)?.code === T.naasiyahAlly
          ? [
              fx("templeECNaasiyahWindow", {
                target: id,
                source: enemy.id,
                flag: true,
                player: ownerOf(s, get(s, id)!),
              }),
            ]
          : [],
      )
    : [];
}
export function templeDefendersDeclared(
  s: GameState,
  enemy: Unit,
  defenders: Unit[],
): Effect[] {
  return live(s)
    ? defenders
        .filter((u) => u.code === T.naasiyahAlly)
        .map((u) =>
          fx("templeECNaasiyahWindow", {
            target: u.id,
            source: enemy.id,
            flag: false,
            player: ownerOf(s, u),
          }),
        )
    : [];
}
function clearBoosts(s: GameState, enemyId: string, playerAttack: boolean) {
  const q = templeState(s);
  if (!q) return;
  for (const b of q.combatBoosts.filter(
    (b) => b.enemyId === enemyId && b.playerAttack === playerAttack,
  )) {
    const u = get(s, b.characterId);
    if (u) {
      u.tempAttack = (u.tempAttack ?? 0) - b.attack;
      u.tempDefense = (u.tempDefense ?? 0) - b.defense;
    }
  }
  q.combatBoosts = q.combatBoosts.filter(
    (b) => b.enemyId !== enemyId || b.playerAttack !== playerAttack,
  );
}
export function templePlayerAttackFinished(s: GameState, enemy: Unit) {
  if (live(s)) clearBoosts(s, enemy.id, true);
}
export function templeAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
  skipped = false,
) {
  if (!live(s)) return;
  const c = combat as TempleCombat;
  if (!skipped && c.raidKilledCharacter && c.templeRainOnKill) {
    const enemy = get(s, c.enemyId);
    if (enemy)
      forOwner(s, c.attackPlayer ?? activeSeat(s), () =>
        raiseThreat(s, threatOf(s, enemy) * c.templeRainOnKill!, "encounter"),
      );
  }
  clearBoosts(s, c.enemyId, false);
  // FAQ 1.42: the scheduled additional attack replaces every previous shadow,
  // including faceup cards held by the ordinary combat framework.
  const enemy = get(s, c.enemyId);
  if (!skipped && enemy && (c.extraAttacks ?? 0) > 0) {
    s.encounterDiscard.push(...enemy.shadows);
    enemy.shadows = [];
    delete enemy.faceupShadows;
    enemy.revealedShadowCount = 0;
  }
  delete c.templeRainOnKill;
}

export function templeEncounter(s: GameState, code: string, replay = false) {
  if (!live(s)) return false;
  const kind =
    code === T.supplies
      ? "templeECSupplies"
      : code === T.sunken
        ? "templeECSunken"
        : code === T.rain
          ? "templeECRain"
          : code === T.deeper
            ? "templeECDeeper"
            : code === T.curse
              ? "templeECCurse"
              : code === T.wandering
                ? "templeECWandering"
                : undefined;
  if (!kind) return false;
  if (!replay) s.encounterDiscard.push(code);
  if (code === T.rain)
    prepend(s, ...playerOrder(s).map((p) => fx(kind, { player: p })));
  else
    prepend(
      s,
      fx(kind, {
        player: firstPlayer(s),
        ...(code === T.wandering ? { value: uncharted(s).length } : {}),
      }),
    );
  return true;
}
export function templeShadow(s: GameState, code: string) {
  if (!live(s) || !s.combat) return false;
  const c = s.combat as TempleCombat;
  if (code === T.supplies) c.defensePenalty = (c.defensePenalty ?? 0) - 2;
  else if (code === T.profane) {
    if (
      allCharacters(s).some((u) => u.attachments.some((a) => a.code === T.key))
    )
      c.attackBonus += 3;
  } else if (code === T.desecrator) c.attackBonus += ruins(s) ? 2 : 1;
  else if (code === T.rain) c.templeRainOnKill = (c.templeRainOnKill ?? 0) + 1;
  else if (code === T.drowned) c.fateBottomOnAllyKill = true;
  else if (code === T.curse) {
    const bottom = bottomDiscard(s, c.attackPlayer ?? activeSeat(s));
    if (bottom && cost(bottom) <= 2) c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  } else return false;
  return true;
}

/** Only group decisions are rerouted to the first player; owned decisions keep their seat. */
export function templeEncounterSharedEffect(e: Effect) {
  return [
    "templeECGuardianReturn",
    "templeECHighest",
    "templeECWatcher",
    "templeECGraves",
    "templeECSupplies",
    "templeECSunken",
    "templeECDeeper",
    "templeECCurse",
    "templeECWandering",
    "templeECWanderingRemove",
    "templeECWanderingLook",
    "templeECWanderingDoomed",
  ].includes(e.kind);
}
function highest(s: GameState, e: Effect) {
  const ps = playerOrder(s),
    max = Math.max(...ps.map((p) => effectiveThreat(s, p))),
    tied = ps.filter((p) => effectiveThreat(s, p) === max);
  if (tied.length === 1)
    prepend(s, { ...e, kind: "templeECEngageHighest", player: tied[0] });
  else if (tied.length)
    choose(
      s,
      `${e.code === T.watcher ? "Island Watcher" : "Temple Guardian"} · Highest threat tie`,
      tied.map((p) => ({
        id: `player-${p}`,
        label: `${seatName(s, p)} · ${effectiveThreat(s, p)} threat`,
        effects: [{ ...e, kind: "templeECEngageHighest", player: p }],
      })),
    );
}
function naasiyahWindow(s: GameState, e: Effect, u?: Unit) {
  if (!u || u.blanked || ownerOf(s, u) !== (e.player ?? activeSeat(s))) return;
  const ability = {
    player: ownerOf(s, u),
    source: u.id,
    code: u.code,
    type: "action" as const,
  };
  const options: Option[] = [
    { id: "continue", label: "Continue the attack", effects: [] },
  ];
  if (u.resources > 0 && heirsCanSpendResources(s, u))
    for (const stat of ["attack", "defense"] as const)
      options.push({
        id: stat,
        label: `Spend 1 Na'asiyah resource · +2 ${stat} for this attack`,
        code: u.code,
        ability,
        effects: [{ ...e, kind: "templeECNaasiyahBoost", text: stat }, e],
      });
  if (!templeEncounterAbilityProblem(s, u))
    options.push({
      id: "deposit",
      label:
        "Spend 1 hero resource · Add 1 resource to Na'asiyah · Once per round",
      code: u.code,
      ability,
      effects: [
        fx("templeECDeposit", {
          target: u.id,
          player: ownerOf(s, u),
          effects: [e],
        }),
      ],
    });
  if (options.length > 1)
    choose(
      s,
      "Na'asiyah · Combat actions",
      options,
      "Resource actions may be used while she is attacking or defending.",
    );
}
export function templeEncounterEffect(s: GameState, e: Effect) {
  const q = templeState(s);
  if (!live(s) || !q) return false;
  const player = e.player ?? activeSeat(s),
    u =
      get(s, e.target) ??
      seatView(s, player).hand.find((h) => h.id === e.target);
  switch (e.kind) {
    case "templeECJungle": {
      const eligible = own(s, player).filter(
        (u) => ready(u) && stats(s, u).attack >= 2,
      );
      if (eligible.length)
        choose(
          s,
          `${seatName(s, player)} · Jungle Path · Exhaust a character`,
          opts(eligible, (u) => [
            fx("templeECExhaust", { target: u.id, player }),
          ]),
        );
      break;
    }
    case "templeECExhaust":
      if (u && ready(u) && ownerOf(s, u) === player && stats(s, u).attack >= 2)
        exhaustCharacter(s, u);
      break;
    case "templeECProfaneAttack":
      if (
        u &&
        !u.blanked &&
        seatView(s, player).engaged.some((x) => x.id === u.id)
      ) {
        // FAQ 1.42: additional attacks discard previously dealt physical shadows.
        s.encounterDiscard.push(...u.shadows);
        u.shadows = [];
        delete u.faceupShadows;
        u.revealedShadowCount = 0;
        prepend(s, fx("immediateAttack", { target: u.id, player }));
      }
      break;
    case "templeECGuardianReturn":
      if (q.victoryEnemies.length && s.victoryCards?.includes(T.guardian))
        highest(
          s,
          fx("templeECHighest", {
            target: q.victoryEnemies[0].id,
            code: T.guardian,
            player: firstPlayer(s),
          }),
        );
      break;
    case "templeECWatcher":
      if (u && !u.blanked && ruins(s) && s.staging.some((x) => x.id === u.id))
        highest(s, { ...e, count: 2 });
      break;
    case "templeECHighest":
      highest(s, e);
      break;
    case "templeECEngageHighest": {
      let enemy = u;
      if (!enemy && e.code === T.guardian) {
        enemy = q.victoryEnemies.find((x) => x.id === e.target);
        if (!enemy || !s.victoryCards?.includes(T.guardian)) break;
        q.victoryEnemies = q.victoryEnemies.filter((x) => x.id !== enemy!.id);
        removeOne(s.victoryCards, T.guardian);
        s.victory = Math.max(0, s.victory - (card(T.guardian).victory ?? 0));
        enemy.damage = 0;
        enemy.resources = 0;
        enemy.progress = 0;
        enemy.exhausted = false;
        enemy.attacked = false;
        enemy.attackedBy = [];
        enemy.shadows = [];
        delete enemy.faceupShadows;
        enemy.revealedShadowCount = 0;
        delete enemy.guarding;
        s.staging.push(enemy);
      }
      if (!enemy) break;
      forOwner(s, player, () => engage(s, enemy!, true));
      for (let i = 0; i < (e.count ?? 0); i++) {
        const shadow = encounterDraw(s, true);
        if (shadow) {
          enemy.shadows.push(shadow);
          heirsShadowDealt(s, enemy);
          carnShadowDealt(s, enemy);
        }
      }
      break;
    }
    case "templeECGraves": {
      const pool: string[] = [];
      for (let i = 0; i < (e.value ?? 0) && s.encounterDeck.length; i++) {
        const code = s.encounterDeck.shift()!;
        s.encounterDiscard.push(code);
        if (undead(code)) pool.push(code);
      }
      prepend(
        s,
        fx("templeECGravesChoose", {
          ids: pool,
          count: 0,
          player: playerOrder(s)[0],
        }),
      );
      break;
    }
    case "templeECGravesChoose": {
      const pool = e.ids ?? [],
        ps = playerOrder(s),
        index = e.count ?? 0;
      if (index >= ps.length) break;
      const available = [...new Set(pool)].filter((code) =>
        s.encounterDiscard.includes(code),
      );
      if (available.length)
        choose(
          s,
          `${seatName(s, player)} · Drowned Graves · Add a discarded Undead enemy`,
          available.map((code) => ({
            id: code,
            code,
            label: card(code).name,
            effects: [{ ...e, kind: "templeECGravesAdd", code }],
          })),
        );
      else if (index + 1 < ps.length)
        prepend(
          s,
          fx("templeECGravesChoose", {
            ids: pool,
            count: index + 1,
            player: ps[index + 1],
          }),
        );
      break;
    }
    case "templeECGravesAdd": {
      const pool = [...(e.ids ?? [])];
      if (
        e.code &&
        pool.includes(e.code) &&
        s.encounterDiscard.includes(e.code)
      ) {
        removeOne(pool, e.code);
        removeOne(s.encounterDiscard, e.code);
        const enemy = make(s, e.code);
        s.staging.push(enemy);
        const index = (e.count ?? 0) + 1,
          ps = playerOrder(s);
        if (index < ps.length)
          prepend(
            s,
            fx("templeECGravesChoose", {
              ids: pool,
              count: index,
              player: ps[index],
            }),
          );
        enemyAddedToStaging(s, enemy);
      }
      break;
    }
    case "templeECCadaver": {
      const cards = seatView(s, player).hand.filter((h) => cost(h.code) <= 2);
      if (cards.length)
        choose(
          s,
          "Soulless Cadaver · Put low-cost cards on the bottom",
          opts(cards, (h) => [
            fx("templeECHandBottom", { target: h.id, player }),
            e,
          ]),
        );
      break;
    }
    case "templeECHandBottom":
      if (u && seatView(s, player).hand.some((h) => h.id === u.id))
        handToBottom(s, u, player);
      break;
    case "templeECSupplies": {
      let discarded = 0;
      for (const p of playerOrder(s))
        forOwner(s, p, () => {
          while (s.hand.length > 3) {
            discardHandCard(
              s,
              s.hand[Math.floor(random(s) * s.hand.length)].id,
            );
            discarded++;
          }
        });
      if (!discarded) resolveDoomed(s, 2, "encounter");
      break;
    }
    case "templeECSunken":
      if (!samePhase(q.sunkenPhase, s.phase)) q.sunkenBoosts = [];
      q.sunkenPhase = s.phase;
      q.sunkenBoosts.push(
        ...uncharted(s).map((u) => ({ locationId: u.id, value: 1 })),
      );
      if (ruins(s))
        for (const c of allCharacters(s).filter(
          (u) => isHero(u) || unitType(u) === "objective-ally",
        ))
          c.resources = Math.max(0, c.resources - 1);
      break;
    case "templeECRain": {
      const committed = own(s, player).filter((u) => u.committed);
      choose(s, `${seatName(s, player)} · Furious Rainstorm`, [
        {
          id: "threat",
          label: `Raise your threat by ${committed.length}`,
          effects: [
            fx("templeECRainThreat", { value: committed.length, player }),
          ],
        },
        {
          id: "damage",
          label: "Deal 1 damage to each committed character",
          effects: committed.map((u) =>
            fx("damage", { target: u.id, value: 1, player }),
          ),
        },
      ]);
      break;
    }
    case "templeECRainThreat":
      forOwner(s, player, () => raiseThreat(s, e.value ?? 0, "encounter"));
      break;
    case "templeECDeeper": {
      const value = templeLocationsLeft(s).reduce(
        (n, u) => n + threatOf(s, u),
        0,
      );
      if (!samePhase(q.phaseThreatPhase, s.phase)) q.phaseThreat = 0;
      q.phaseThreatPhase = s.phase;
      q.phaseThreat += value;
      if (!value) resolveDoomed(s, 1, "encounter");
      break;
    }
    case "templeECCurse":
      prepend(
        s,
        ...allCharacters(s)
          .filter((u) => unitType(u) === "ally" && cost(u.code) <= 2)
          .map((u) =>
            fx("damage", {
              target: u.id,
              value: 1,
              text: encodeDamageContext({ fateBottomOnDestroy: true }),
              player: ownerOf(s, u),
            }),
          ),
      );
      break;
    case "templeECWandering": {
      const committed = allCharacters(s).filter((u) => u.committed);
      if ((e.value ?? 0) <= 0 || !committed.length) {
        prepend(s, fx("templeECWanderingLook", { player: firstPlayer(s) }));
        break;
      }
      choose(
        s,
        `Aimless Wandering · Remove at least ${e.value} willpower`,
        committed.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Remove ${name(u)} · ${stats(s, u).will} willpower`,
          effects: [
            fx("templeECWanderingRemove", {
              target: u.id,
              value: e.value,
              player: firstPlayer(s),
            }),
          ],
        })),
      );
      break;
    }
    case "templeECWanderingRemove":
      if (u?.committed) {
        const value = stats(s, u).will;
        u.committed = false;
        prepend(
          s,
          fx("templeECWandering", {
            value: Math.max(0, (e.value ?? 0) - value),
            player: firstPlayer(s),
          }),
        );
      }
      break;
    case "templeECWanderingLook":
      if (uncharted(s).length)
        choose(s, "Aimless Wandering · Look at an Uncharted location?", [
          {
            id: "doomed",
            label: "Doomed 2 · Look at a facedown side",
            effects: [
              fx("templeECWanderingDoomed", { player: firstPlayer(s) }),
            ],
          },
          skip,
        ]);
      break;
    case "templeECWanderingDoomed":
      // Select before optional Doomed Responses, then resolve their queue before the look.
      choose(
        s,
        "Aimless Wandering · Choose an Uncharted location",
        uncharted(s).map((u, i) => ({
          id: u.id,
          code: u.code,
          label: `${name(u)} ${i + 1}`,
          effects: [
            fx("templeECWanderingPay", {
              target: u.id,
              player: firstPlayer(s),
            }),
          ],
        })),
      );
      break;
    case "templeECWanderingPay":
      if (u && uncharted(s).some((x) => x.id === u.id)) {
        prepend(s, fx("templeLook", { target: u.id, player: firstPlayer(s) }));
        resolveDoomed(s, 2, "encounter");
      }
      break;
    case "templeECDeposit":
      if (u && !templeEncounterAbilityProblem(s, u))
        choose(
          s,
          `${name(u)} · Spend 1 hero resource`,
          opts(
            own(s, ownerOf(s, u)).filter(
              (h) =>
                isHero(h) && h.resources > 0 && heirsCanSpendResources(s, h),
            ),
            (h) => [
              fx("templeECDepositPay", {
                target: u.id,
                source: h.id,
                player: ownerOf(s, u),
              }),
              ...(e.effects ?? []),
            ],
          ),
        );
      break;
    case "templeECDepositPay": {
      const h = get(s, e.source);
      if (
        u &&
        h &&
        isHero(h) &&
        ownerOf(s, h) === ownerOf(s, u) &&
        h.resources > 0 &&
        heirsCanSpendResources(s, h) &&
        !templeEncounterAbilityProblem(s, u)
      ) {
        spendResources(s, h, 1);
        u.resources++;
        seatView(s, ownerOf(s, u)).used.push(`round:temple-deposit:${u.id}`);
      }
      break;
    }
    case "templeECNaasiyahWindow":
      naasiyahWindow(s, e, u);
      break;
    case "templeECNaasiyahBoost":
      if (
        u &&
        u.resources > 0 &&
        !u.blanked &&
        ownerOf(s, u) === player &&
        heirsCanSpendResources(s, u)
      ) {
        spendResources(s, u, 1);
        const attack = e.text === "attack" ? 2 : 0,
          defense = e.text === "defense" ? 2 : 0;
        u.tempAttack = (u.tempAttack ?? 0) + attack;
        u.tempDefense = (u.tempDefense ?? 0) + defense;
        q.combatBoosts.push({
          characterId: u.id,
          enemyId: e.source!,
          playerAttack: !!e.flag,
          attack,
          defense,
        });
      }
      break;
    default:
      return false;
  }
  return true;
}
