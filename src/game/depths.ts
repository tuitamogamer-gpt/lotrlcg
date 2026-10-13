import type { Effect, GameState, Option, Unit } from "./types";
import { encounterCharacterEntered } from "./encounter-character-uniqueness";
import { card, name } from "./cards";
import {
  choose,
  encounterDraw,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  shuffle,
  stats,
  threatOf,
  removeShadowCard,
  canGainResources,
  units,
  spendResources,
} from "./core";
import {
  damage,
  destroy,
  discardAttachment,
  discardCharacter,
  enemyAddedToStaging,
  engage,
  exhaustCharacter,
  questDefeated,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  defendersFor,
  selectSeat,
} from "./table";
import { beginEnemyAttack, enemyAttackStarted } from "./combat";
import { mainQuestUnit } from "./quest-state";
import { isAlly, isHero } from "./card-types";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { heirsCanSpendResources } from "./heirs-numenor";
import {
  DEPTHS as D,
  DEPTHS_RECIPES,
  DEPTHS_MAIN_QUESTS,
  DEPTHS_TENTACLES,
  DEPTHS_CORSAIR_RAIDERS,
  depthsState,
  depthsGrappledWith,
  type DepthsCombat,
  type DepthsState,
} from "./depths-support";

const live = (s: GameState) =>
  s.scenarioId === "the-thing-in-the-depths" && !!depthsState(s);
const trait = (u: Unit, t: string) =>
  (card(u.code).traits ?? "").split(".").some((v) => v.trim() === t);
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location",
  );
const own = (s: GameState, player: number) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === player);
const ready = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
const questLive = (s: GameState) => !mainQuestUnit(s)?.blanked;
const boss = (s: GameState) => s.staging.find((u) => u.code === D.thing);
const aside = (s: GameState, code: string) => {
  const q = depthsState(s)!;
  const u = q.setAside.find((u) => u.code === code);
  q.setAside = q.setAside.filter((x) => x.id !== u?.id);
  return u;
};
const add = (s: GameState, u: Unit) => {
  s.staging.push(u);
  if (card(u.code).type_code === "enemy") enemyAddedToStaging(s, u);
};
function lose(s: GameState, reason: string) {
  s.status = "lost";
  s.reason = reason;
  s.queue = [];
  s.choice = null;
  log(s, reason, "danger");
}
function order(s: GameState, effects: Effect[], title: string) {
  if (effects.length === 1) prepend(s, effects[0]);
  else if (effects.length)
    prepend(
      s,
      fx("fangornOrder", { effects, text: title, player: firstPlayer(s) }),
    );
}
export function setupDepths(s: GameState) {
  const r = DEPTHS_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const pile = (section: string) =>
    r.cards
      .filter((c) => c.section === section)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, pile("sharedEncounterDeck"));
  const q: DepthsState = {
    initialized: false,
    advancing: false,
    currentQuest: D.take,
    questDeck: DEPTHS_MAIN_QUESTS.slice(1),
    completedQuests: [],
    setAside: [...pile("sharedSetAside"), ...pile("sharedStagingArea")].map(
      (c) => make(s, c),
    ),
    beastDeck: pile("sharedEncounterDeck2"),
    grappled: [],
    pendingEnemies: [],
    removed: [],
    removedUnits: [],
    travelUsed: false,
    blankedDepartures: [],
    combatBoosts: [],
  };
  s.depths = q;
}
export function depthsOpeningHandsKept(s: GameState) {
  if (!live(s) || depthsState(s)!.initialized) return false;
  prepend(s, fx("depthsSetup", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
export const depthsQuestProgressBlocked = (s: GameState) =>
  live(s) && s.stage === 1 && questLive(s) && !s.victoryCards?.includes(D.helm);
export const depthsThreatBonus = (s: GameState, u: Unit) =>
  live(s) ? 2 * depthsGrappledWith(s, u.id).length : 0;
export const depthsLocationQuest = (s: GameState, u: Unit) =>
  live(s) && u.code === D.helm && !u.blanked
    ? (card(u.code).quest ?? 0) +
      enemies(s)
        .filter((u) => trait(u, "Raider"))
        .reduce((n, u) => n + u.resources, 0)
    : undefined;
export const depthsStats = (s: GameState, u: Unit) => ({
  will:
    live(s) && u.code === D.sahirAlly && !u.blanked
      ? Math.min(6, u.resources)
      : 0,
  attack:
    live(s) && u.code === D.sahirAlly && !u.blanked
      ? Math.min(6, u.resources)
      : 0,
  defense:
    live(s) && card(u.code).type_code === "enemy"
      ? allActiveLocations(s).filter((l) => l.code === D.cargo && !l.blanked)
          .length
      : 0,
  health:
    live(s) && u.code === D.thing && !u.blanked ? 3 * playerOrder(s).length : 0,
});
export const depthsCannotLeave = (s: GameState, u: Unit) =>
  live(s) &&
  (depthsState(s)!.grappled.some((g) => g.enemy.id === u.id) ||
    depthsState(s)!.pendingEnemies.some((x) => x.id === u.id));
export const depthsCannotEngage = (s: GameState, u: Unit) =>
  depthsCannotLeave(s, u) || (live(s) && u.code === D.thing && !u.blanked);
export const depthsCannotAttack = (s: GameState, u: Unit) =>
  live(s) && u.code === D.eye && !u.blanked;
export const depthsIndestructible = (s: GameState, u: Unit) =>
  live(s) &&
  s.stage === 1 &&
  questLive(s) &&
  [D.sahir, D.naasiyah].includes(u.code);
export const depthsEngagementPlayer = (s: GameState, u: Unit) =>
  !live(s) || u.blanked
    ? undefined
    : u.code === D.sahir
      ? firstPlayer(s)
      : u.code === D.naasiyah
        ? playerOrder(s).at(-1)
        : undefined;
export function depthsDamageAmount(s: GameState, u: Unit, amount: number) {
  if (!live(s) || u.code !== D.sahir || u.blanked) return amount;
  const cancelled = Math.min(amount, u.resources);
  u.resources -= cancelled;
  return amount - cancelled;
}
export function depthsEngaged(s: GameState, u: Unit) {
  if (live(s) && u.code === D.naasiyah && !u.blanked)
    prepend(
      s,
      fx("raidNaasiyahEvents", { target: u.id, player: ownerOf(s, u) }),
    );
}
function naasiyahStart(u: Unit) {
  if (u.raidCombatResourceBonus !== undefined) return;
  u.raidCombatResourceBonus = u.resources;
  u.tempAttack = (u.tempAttack ?? 0) + u.resources;
  u.tempDefense = (u.tempDefense ?? 0) + u.resources;
}
function naasiyahEnd(u: Unit) {
  if (u.raidCombatResourceBonus === undefined) return;
  u.tempAttack = (u.tempAttack ?? 0) - u.raidCombatResourceBonus;
  u.tempDefense = (u.tempDefense ?? 0) - u.raidCombatResourceBonus;
  delete u.raidCombatResourceBonus;
  u.resources = Math.max(0, u.resources - 1);
}
export function depthsAttackStarted(s: GameState, u: Unit, player: number) {
  if (!live(s) || u.blanked) return;
  if (u.code === D.naasiyah) naasiyahStart(u);
  if (u.code === D.grasping)
    prepend(s, fx("depthsExhaust", { player, code: u.code }));
}
/** Attack-start effects resolve before the player declares actual defenders. */
export function depthsBeforeNormalDefense(s: GameState, u: Unit) {
  if (!live(s) || u.code !== D.grasping || u.blanked) return false;
  prepend(
    s,
    fx("depthsChooseDefenders", {
      target: u.id,
      ids: [],
      player: activeSeat(s),
    }),
  );
  enemyAttackStarted(s, u, activeSeat(s));
  return true;
}
export function depthsAttackBonus(s: GameState, u: Unit, defenders: Unit[]) {
  return live(s) && u.code === D.giant && !u.blanked && defenders.some(isAlly)
    ? 2
    : 0;
}
export function depthsPlayerAttackStarted(s: GameState, u: Unit) {
  if (live(s) && u.code === D.naasiyah && !u.blanked) naasiyahStart(u);
}
function clearBoosts(s: GameState, enemyId: string, playerAttack: boolean) {
  const q = depthsState(s);
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
export function depthsPlayerAttackFinished(s: GameState, u: Unit) {
  if (!live(s)) return;
  if (u.code === D.naasiyah) naasiyahEnd(u);
  clearBoosts(s, u.id, true);
}
export function depthsAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
  skipped = false,
) {
  if (!live(s)) return;
  const enemy = get(s, combat.enemyId);
  if (!skipped && enemy && !enemy.blanked && enemy.code === D.sahir)
    enemy.resources += combat.raidKilledCharacter ? 4 : 2;
  if (enemy?.code === D.naasiyah) naasiyahEnd(enemy);
  clearBoosts(s, combat.enemyId, false);
  order(
    s,
    (combat as DepthsCombat).depthsAfterAttack ?? [],
    "Choose the next after-attack shadow effect",
  );
  delete (combat as DepthsCombat).depthsAfterAttack;
}
export function depthsCharacterLeaves(
  s: GameState,
  u: Unit,
  destruction: boolean,
  _lastKnownThreat?: number,
) {
  if (!live(s)) return;
  if ([D.sahirAlly, D.naasiyahAlly].includes(u.code)) {
    if (u.blanked) {
      const q = depthsState(s)!;
      if (!q.blankedDepartures.includes(u.code))
        q.blankedDepartures.push(u.code);
    } else {
      lose(s, `${name(u)} leaves play. The players lose the game.`);
      return;
    }
  }
  if (!destruction) return;
  if (u.code === D.thing && s.stage === 3 && questLive(s)) {
    win(s);
    s.reason =
      "The Thing in the Depths is destroyed and the Stormcaller is saved.";
    return;
  }
}
/** The enemy has physically left play; Forced damage precedes optional destruction responses. */
export function depthsEnemyDestroyed(
  s: GameState,
  u: Unit,
  lastKnownThreat: number,
) {
  if (!live(s) || s.status !== "playing" || !trait(u, "Creature")) return;
  const thing = boss(s);
  if (thing && !thing.blanked) damage(s, thing.id, lastKnownThreat);
}
export function depthsFirstPlayerChanged(s: GameState) {
  if (!live(s)) return;
  for (const [code, player] of [
    [D.sahirAlly, firstPlayer(s)],
    [D.naasiyahAlly, playerOrder(s).at(-1)!],
  ] as const) {
    const u = allCharacters(s).find((u) => u.code === code && !u.blanked);
    if (!u || ownerOf(s, u) === player) continue;
    forOwner(s, ownerOf(s, u), () => {
      s.allies = s.allies.filter((x) => x.id !== u.id);
    });
    u.owner = player;
    u.controller = player;
    forOwner(s, player, () => s.allies.push(u));
  }
}
export function depthsAdvance(s: GameState) {
  if (!live(s)) return false;
  const q = depthsState(s)!;
  if (
    !q.initialized ||
    q.advancing ||
    s.stageRevealing ||
    s.queue.length ||
    s.choice ||
    s.status !== "playing"
  )
    return true;
  if (s.stage === 1 && s.progress >= 4) {
    if (questDefeated(s, D.take)) return true;
    q.advancing = true;
    q.completedQuests.push(q.currentQuest);
    q.currentQuest = q.questDeck.shift()!;
    s.stage = 2;
    s.progress = 0;
    s.stageRevealing = true;
    prepend(s, fx("depthsStageTwo", { player: firstPlayer(s) }));
  }
  return true;
}
export function depthsCheck(s: GameState) {
  const q = depthsState(s);
  if (
    !live(s) ||
    !q?.initialized ||
    q.advancing ||
    s.stage !== 3 ||
    s.status !== "playing"
  )
    return;
  for (const code of [D.sahirAlly, D.naasiyahAlly]) {
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
  // Elimination can reduce the boss's continuous per-player health in this action.
  const thing = boss(s);
  if (thing && thing.damage >= stats(s, thing).health) destroy(s, thing);
}
export function depthsTravelStart(s: GameState) {
  if (live(s)) depthsState(s)!.travelUsed = false;
}
export const depthsCanReplaceActive = (s: GameState) =>
  live(s) && s.stage === 3 && questLive(s) && !depthsState(s)!.travelUsed;
const weatherCosts = (s: GameState, u: Unit) =>
  !live(s) || !trait(u, "Deck")
    ? 0
    : s.staging.filter(
        (l) => l.code === D.weather && l.id !== u.id && !l.blanked,
      ).length;
export function depthsTravelProblem(s: GameState, u: Unit) {
  if (!live(s)) return null;
  if (depthsState(s)!.travelUsed)
    return "The players have already travelled during this travel phase.";
  const count = weatherCosts(s, u);
  if (
    count &&
    playerOrder(s).some((p) => own(s, p).filter(ready).length < count)
  )
    return "Weather Deck requires each player to exhaust a character for each granted Travel cost.";
  return null;
}
export function depthsTravelEffects(
  s: GameState,
  u: Unit,
): Effect[] | undefined {
  if (!live(s)) return undefined;
  const effects: Effect[] = [];
  for (let i = 0; i < weatherCosts(s, u); i++)
    for (const player of playerOrder(s))
      effects.push(fx("depthsExhaust", { player, code: D.weather }));
  if (u.code === D.crew && !u.blanked) effects.push(fx("depthsCrewResources"));
  return effects;
}
export function depthsBeforeTravelEnter(s: GameState, u: Unit) {
  if (!live(s) || !depthsCanReplaceActive(s)) return;
  for (const old of allActiveLocations(s))
    if (old.id !== u.id) {
      s.staging.push(old);
      log(s, `${name(old)} returns to staging.`);
    }
  s.activeLocation = null;
  s.extraActiveLocations = [];
}
export function depthsTravelEntered(
  s: GameState,
  u: Unit,
  ordinaryTravel = true,
) {
  if (!live(s)) return;
  if (ordinaryTravel) depthsState(s)!.travelUsed = true;
  depthsDetach(s, u);
  const effects: Effect[] = [];
  if (u.code === D.helm && !u.blanked)
    effects.push(fx("depthsHelmCaptains", { player: firstPlayer(s) }));
  if (u.code === D.forecastle && !u.blanked)
    effects.push(fx("depthsForecastle", { player: firstPlayer(s) }));
  prepend(s, ...effects);
}
export function depthsLocationLeft(
  s: GameState,
  u: Unit,
  explored: boolean,
  wasActive: boolean,
) {
  if (!live(s)) return;
  if (explored && !wasActive) depthsDetach(s, u);
  else if (!explored) {
    const q = depthsState(s)!;
    s.encounterDiscard.push(
      ...q.grappled
        .filter((g) => g.locationId === u.id)
        .map((g) => g.enemy.code),
    );
    q.grappled = q.grappled.filter((g) => g.locationId !== u.id);
  }
}
export function depthsDetach(s: GameState, location: Unit) {
  const q = depthsState(s);
  if (!q) return;
  const detached = q.grappled
    .filter((g) => g.locationId === location.id)
    .map((g) => g.enemy);
  q.grappled = q.grappled.filter((g) => g.locationId !== location.id);
  const effects = detached.map((u) =>
    fx("depthsDetachEnemy", {
      target: u.id,
      code: u.code,
      text: `${name(u)} · detach from ${name(location)}`,
      player: firstPlayer(s),
    }),
  );
  q.pendingEnemies.push(...detached);
  order(s, effects, "Choose the next grappled enemy to detach");
}
export function depthsCardEntered(
  s: GameState,
  u: Unit,
  fromReveal: boolean,
  _cancel = false,
) {
  if (
    !live(s) ||
    !fromReveal ||
    !DEPTHS_TENTACLES.includes(u.code) ||
    (u.blanked && !u.printedKeywordsPreserved)
  )
    return false;
  depthsState(s)!.pendingEnemies.push(u);
  prepend(s, fx("depthsGrappleHeld", { target: u.id, player: firstPlayer(s) }));
  return true;
}
function grappleLocations(s: GameState, u: Unit) {
  const ls = s.staging.filter((l) => card(l.code).type_code === "location");
  if (!ls.length) return [];
  const byQuest = [D.crushing, D.giant].includes(u.code),
    highest = [D.crushing, D.grasping].includes(u.code);
  const printed = (l: Unit) =>
    Number(byQuest ? (card(l.code).quest ?? 0) : (card(l.code).threat ?? 0));
  const target = (highest ? Math.max : Math.min)(...ls.map(printed));
  return ls.filter((l) => printed(l) === target);
}
export function depthsGrapple(s: GameState, u: Unit) {
  const q = depthsState(s);
  if (!q) return;
  if (!q.pendingEnemies.some((e) => e.id === u.id)) q.pendingEnemies.push(u);
  const ls = grappleLocations(s, u);
  if (!ls.length) {
    q.pendingEnemies = q.pendingEnemies.filter((x) => x.id !== u.id);
    add(s, u);
    return;
  }
  if (ls.length === 1) {
    attachGrapple(s, u, ls[0]);
    return;
  }
  choose(
    s,
    `${name(u)} · Grapple`,
    opts(
      ls,
      (l) => [
        fx("depthsAttachGrapple", {
          target: u.id,
          source: l.id,
          player: firstPlayer(s),
        }),
      ],
      () => "Attach the enemy facedown · +2 location threat",
    ),
    "The first player chooses between locations tied for the printed value.",
  );
}
function attachGrapple(s: GameState, u: Unit, location: Unit) {
  const q = depthsState(s)!;
  q.pendingEnemies = q.pendingEnemies.filter((x) => x.id !== u.id);
  s.staging = s.staging.filter((x) => x.id !== u.id);
  q.grappled.push({ enemy: u, locationId: location.id });
  log(s, `An enemy grapples ${name(location)} facedown, adding 2 threat.`);
}
export function depthsCombatStart(s: GameState) {
  if (!live(s)) return;
  const extras = allActiveLocations(s).filter(
    (l) => l.code === D.quarter && !l.blanked,
  ).length;
  for (const u of enemies(s))
    for (let i = 0; i < extras; i++) {
      const code = encounterDraw(s, true);
      if (code) u.shadows.push(code);
    }
  const effects = allEngaged(s)
    .filter((u) => u.code === D.eye && !u.blanked)
    .flatMap((u) =>
      boss(s)
        ? [
            fx("depthsBossAttack", {
              player: ownerOf(s, u),
            }),
          ]
        : [],
    );
  prepend(s, ...effects);
}
export function depthsCombatEnd(s: GameState): Effect[] {
  if (!live(s)) return [];
  return [
    ...allEngaged(s)
      .filter((u) => u.code === D.thrashing && !u.blanked)
      .map((u) =>
        fx("chooseDamage", { value: 3, source: u.id, player: ownerOf(s, u) }),
      ),
    fx("depthsCombatCleanup"),
  ];
}
export function depthsRoundEnd(s: GameState): Effect[] {
  if (!live(s)) return [];
  return s.stage === 1 && questLive(s)
    ? [fx("depthsCaptainRound", { player: firstPlayer(s) })]
    : s.stage === 3 && questLive(s)
      ? [fx("depthsShipRound", { player: firstPlayer(s) })]
      : [];
}
export function depthsAbilityLabel(code: string) {
  return [D.sahirAlly, D.naasiyahAlly].includes(code)
    ? "Add 1 resource"
    : undefined;
}
export function depthsAbilityProblem(s: GameState, u: Unit) {
  if (!live(s) || ![D.sahirAlly, D.naasiyahAlly].includes(u.code) || u.blanked)
    return "This card has no available action.";
  if (ownerOf(s, u) !== activeSeat(s))
    return "Only the controller may use this action.";
  if (seatView(s, ownerOf(s, u)).used.includes(`round:depths-deposit:${u.id}`))
    return "This action has already been used this round.";
  if (!canGainResources(s, u)) return "This card cannot gain resources.";
  return own(s, ownerOf(s, u)).some(
    (h) => isHero(h) && h.resources > 0 && heirsCanSpendResources(s, h),
  )
    ? null
    : "A hero resource is required.";
}
export function useDepthsAbility(s: GameState, u: Unit) {
  if (!live(s) || ![D.sahirAlly, D.naasiyahAlly].includes(u.code)) return false;
  if (depthsAbilityProblem(s, u)) return true;
  prepend(s, fx("depthsDeposit", { target: u.id, player: ownerOf(s, u) }));
  return true;
}
export function depthsPlayerAttackEffects(
  s: GameState,
  enemy: Unit,
  ids: string[],
): Effect[] {
  if (!live(s)) return [];
  return ids.flatMap((id) =>
    get(s, id)?.code === D.naasiyahAlly
      ? [
          fx("depthsNaasiyahWindow", {
            target: id,
            source: enemy.id,
            flag: true,
            player: ownerOf(s, get(s, id)!),
          }),
        ]
      : [],
  );
}
export function depthsDefendersDeclared(
  s: GameState,
  enemy: Unit,
  defenders: Unit[],
): Effect[] {
  return live(s)
    ? defenders
        .filter((u) => u.code === D.naasiyahAlly)
        .map((u) =>
          fx("depthsNaasiyahWindow", {
            target: u.id,
            source: enemy.id,
            flag: false,
            player: ownerOf(s, u),
          }),
        )
    : [];
}
export function depthsEncounter(s: GameState, code: string) {
  if (!live(s)) return false;
  if (code === D.steady) {
    for (const u of allCharacters(s))
      if (stats(s, u).defense <= 1) exhaustCharacter(s, u);
    return true;
  }
  if (code === D.from) {
    prepend(s, fx("depthsFrom", { player: firstPlayer(s) }));
    return true;
  }
  if (code === D.lashing) {
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("depthsBossAttack", { player })),
    );
    return true;
  }
  return false;
}
export function depthsShadow(s: GameState, code: string) {
  if (!live(s)) return false;
  const combat = s.combat as DepthsCombat | null;
  if (!combat) return false;
  const enemy = get(s, combat.enemyId),
    defs = (
      combat.defenderIds ?? (combat.defenderId ? [combat.defenderId] : [])
    )
      .map((id) => get(s, id))
      .filter((u): u is Unit => !!u);
  if (code === D.forecastle) {
    combat.attackBonus += defs.some((d) => d.resources === 0) ? 2 : 1;
    return true;
  }
  if (code === D.crew) {
    combat.attackBonus += 2;
    return true;
  }
  if (code === D.cargo) {
    if (enemy) enemy.tempDefense = (enemy.tempDefense ?? 0) + 2;
    return true;
  }
  if (code === D.weather) {
    prepend(
      s,
      fx("depthsExhaust", { player: combat.attackPlayer ?? activeSeat(s) }),
    );
    return true;
  }
  if (code === D.quarter) {
    prepend(
      s,
      fx("depthsDiscardAttachment", {
        player: combat.attackPlayer ?? activeSeat(s),
      }),
    );
    return true;
  }
  if (code === D.steady) {
    const zero = defs.filter((d) => stats(s, d).defense === 0);
    for (const d of zero) discardCharacter(s, d);
    if (defs.some((d) => !zero.includes(d)))
      combat.defensePenalty = (combat.defensePenalty ?? 0) - 2;
    return true;
  }
  if (code === D.from) {
    prepend(
      s,
      fx("depthsAssignDamage", {
        value: depthsState(s)!.grappled.length,
        player: combat.attackPlayer ?? activeSeat(s),
      }),
    );
    return true;
  }
  if (code === D.grasping && !defs.length && enemy) {
    const index = (enemy.revealedShadowCount ?? 0) - 1;
    if (enemy.shadows[index] === code) {
      removeShadowCard(enemy, index);
      const u = make(s, code);
      depthsState(s)!.pendingEnemies.push(u);
      prepend(
        s,
        fx("depthsGrappleHeld", { target: u.id, player: firstPlayer(s) }),
      );
    }
    return true;
  }
  if (code === D.giant && enemy) {
    const index = (enemy.revealedShadowCount ?? 0) - 1;
    if (enemy.shadows[index] === code) {
      removeShadowCard(enemy, index);
      const u = make(s, code);
      depthsState(s)!.pendingEnemies.push(u);
      (combat.depthsAfterAttack ??= []).push(
        fx("depthsGiantChoice", {
          target: u.id,
          player: combat.attackPlayer ?? activeSeat(s),
          code: D.giant,
          text: "Giant Arm · choose engagement or Grapple",
        }),
      );
    }
    return true;
  }
  if (code === D.lashing) {
    (combat.depthsAfterAttack ??= []).push(
      fx("depthsBossAttack", {
        player: combat.attackPlayer ?? activeSeat(s),
        code: D.lashing,
        text: "Lashing Tentacles · the boss attacks the defending player",
      }),
    );
    return true;
  }
  return false;
}
export const depthsSharedEffect = (e: Effect) =>
  e.kind.startsWith("depths") &&
  !e.kind.startsWith("depthsPlayer") &&
  ![
    "depthsDeposit",
    "depthsDepositPay",
    "depthsNaasiyahWindow",
    "depthsNaasiyahBoost",
    "depthsExhaust",
    "depthsAssignDamage",
    "depthsDiscardAttachment",
    "depthsChooseDefenders",
    "depthsDefend",
    "depthsGiantEngage",
  ].includes(e.kind);
export function depthsEffect(s: GameState, e: Effect) {
  if (!live(s) || !e.kind.startsWith("depths")) return false;
  const q = depthsState(s)!,
    u = get(s, e.target) ?? q.pendingEnemies.find((u) => u.id === e.target);
  switch (e.kind) {
    case "depthsSetup":
      q.initialized = true;
      for (const code of [D.helm, D.raider]) {
        const u = aside(s, code);
        if (u) add(s, u);
      }
      break;
    case "depthsCaptainRound": {
      const captains = [D.sahir, D.naasiyah].map((c) =>
        q.setAside.find((u) => u.code === c),
      );
      if (captains.every(Boolean)) for (const u of captains) u!.resources++;
      break;
    }
    case "depthsHelmCaptains": {
      const entering = [D.sahir, D.naasiyah]
        .map((c) => aside(s, c))
        .filter((u): u is Unit => !!u);
      for (const u of entering) s.staging.push(u);
      order(
        s,
        entering.map((u) =>
          fx("depthsEnemyAdded", {
            target: u.id,
            code: u.code,
            text: `${name(u)} · entrance responses`,
            player: firstPlayer(s),
          }),
        ),
        "Choose the next Captain's entrance responses",
      );
      break;
    }
    case "depthsEnemyAdded":
      if (u) enemyAddedToStaging(s, u);
      break;
    case "depthsStageTwo":
      stageTwo(s);
      break;
    case "depthsStageThree":
      q.completedQuests.push(q.currentQuest);
      q.currentQuest = q.questDeck.shift()!;
      s.stage = 3;
      s.progress = 0;
      prepend(
        s,
        fx("depthsDiscardTentacles", {
          value: playerOrder(s).length + 1,
          player: firstPlayer(s),
        }),
        fx("depthsStageReady"),
      );
      break;
    case "depthsStageReady":
      q.advancing = false;
      s.stageRevealing = false;
      break;
    case "depthsDiscardTentacles": {
      if ((e.value ?? 0) <= 0) break;
      if (
        ![
          ...s.encounterDeck,
          ...(["quest", "staging"].includes(s.phase) ? s.encounterDiscard : []),
        ].some((c) => DEPTHS_TENTACLES.includes(c))
      )
        break;
      const c = encounterDraw(s);
      if (!c) break;
      if (DEPTHS_TENTACLES.includes(c)) {
        const u = make(s, c);
        q.pendingEnemies.push(u);
        prepend(
          s,
          fx("depthsGrappleHeld", { target: u.id, player: firstPlayer(s) }),
          { ...e, value: (e.value ?? 0) - 1 },
        );
      } else {
        s.encounterDiscard.push(c);
        prepend(s, e);
      }
      break;
    }
    case "depthsGrappleHeld":
      if (u) depthsGrapple(s, u);
      break;
    case "depthsAttachGrapple": {
      const location = s.staging.find(
        (l) => l.id === e.source && card(l.code).type_code === "location",
      );
      if (u && location) attachGrapple(s, u, location);
      else if (u) depthsGrapple(s, u);
      break;
    }
    case "depthsDetachEnemy":
      if (u) {
        q.pendingEnemies = q.pendingEnemies.filter((x) => x.id !== u.id);
        const before = s.queue.length;
        add(s, u);
        const entrance = s.queue.splice(0, s.queue.length - before);
        if (u.code === D.crushing && !u.blanked)
          prepend(
            s,
            ...entrance,
            fx("immediateAttack", { target: u.id, player: firstPlayer(s) }),
          );
        else prepend(s, ...entrance);
      }
      break;
    case "depthsFrom": {
      const effects: Effect[] = [];
      for (let i = 0; i < 3; i++) {
        const c = encounterDraw(s);
        if (!c) break;
        if (DEPTHS_TENTACLES.includes(c)) {
          const u = make(s, c);
          q.pendingEnemies.push(u);
          effects.push(
            fx("depthsGrappleHeld", {
              target: u.id,
              code: c,
              text: `${name(u)} · resolve Grapple`,
              player: firstPlayer(s),
            }),
          );
        } else s.encounterDiscard.push(c);
      }
      order(s, effects, "Choose the next discarded enemy's Grapple keyword");
      break;
    }
    case "depthsThingDamage":
      if (boss(s)) damage(s, boss(s)!.id, e.value ?? 0);
      break;
    case "depthsBossAttack":
      if (boss(s) && !s.table?.seats[e.player ?? activeSeat(s)].eliminated) {
        const thing = boss(s)!;
        // FAQ 1.42: an additional attack discards previously dealt shadows first.
        s.encounterDiscard.push(...thing.shadows);
        thing.shadows = [];
        delete thing.faceupShadows;
        thing.revealedShadowCount = 0;
        delete thing.shadowCancelsDamage;
        delete thing.shadowCancelsCombatDamage;
        prepend(
          s,
          fx("immediateAttack", {
            target: thing.id,
            player: e.player ?? activeSeat(s),
          }),
        );
      }
      break;
    case "depthsGiantChoice":
      if (u) {
        if (!s.table?.seats[e.player ?? activeSeat(s)].eliminated)
          selectSeat(s, e.player ?? activeSeat(s));
        choose(s, "Giant Arm · After this attack", [
          ...(!s.table?.seats[e.player ?? activeSeat(s)].eliminated
            ? [
                {
                  id: "engage",
                  label:
                    "Put Giant Arm into play engaged with you and deal a shadow card",
                  code: u.code,
                  effects: [
                    fx("depthsGiantEngage", {
                      target: u.id,
                      player: e.player ?? activeSeat(s),
                    }),
                  ],
                },
              ]
            : []),
          {
            id: "grapple",
            label: "Resolve Giant Arm's Grapple keyword",
            code: u.code,
            effects: [
              fx("depthsGrappleHeld", { target: u.id, player: firstPlayer(s) }),
            ],
          },
        ]);
      }
      break;
    case "depthsGiantEngage":
      if (u) {
        q.pendingEnemies = q.pendingEnemies.filter((x) => x.id !== u.id);
        forOwner(s, e.player ?? activeSeat(s), () => engage(s, u));
        const c = encounterDraw(s, true);
        if (c) u.shadows.push(c);
      }
      break;
    case "depthsChooseDefenders": {
      if (!u) break;
      const selected = (e.ids ?? []).filter((id) =>
        defendersFor(s, u).some((d) => d.id === id),
      );
      const options: Option[] = defendersFor(s, u)
        .filter(
          (d) =>
            !selected.includes(d.id) &&
            (!selected.length || ownerOf(s, d) === activeSeat(s)),
        )
        .map((d) => ({
          id: d.id,
          code: d.code,
          label: name(d),
          effects: [
            fx(
              s.standTogether && ownerOf(s, d) === activeSeat(s)
                ? "depthsChooseDefenders"
                : "depthsDefend",
              { target: u.id, ids: [...selected, d.id], player: activeSeat(s) },
            ),
          ],
        }));
      if (selected.length)
        options.push({
          id: "defend",
          label: "Defend with the selected characters",
          effects: [
            fx("depthsDefend", {
              target: u.id,
              ids: selected,
              player: activeSeat(s),
            }),
          ],
        });
      options.push({
        id: "undefended",
        label: "Leave the attack undefended",
        effects: [
          fx("depthsDefend", { target: u.id, ids: [], player: activeSeat(s) }),
        ],
      });
      choose(
        s,
        "Grasping Arm · Declare defenders",
        options,
        "The attack's forced exhaustion has resolved. Choose a ready defender.",
      );
      break;
    }
    case "depthsDefend":
      if (u) beginEnemyAttack(s, u, e.ids ?? [], false, false, true);
      break;
    case "depthsCrewResources":
      for (const u of [...enemies(s), ...allCharacters(s)].filter((u) =>
        trait(u, "Raider"),
      ))
        u.resources++;
      break;
    case "depthsExhaust":
      choose(
        s,
        "Exhaust a character",
        opts(own(s, e.player ?? activeSeat(s)).filter(ready), (u) => [
          fx("exhaust", { target: u.id, player: ownerOf(s, u) }),
        ]),
        "Exhaust a character you control.",
      );
      break;
    case "depthsForecastle":
      choose(
        s,
        "Forecastle Deck · Choose an enemy to reveal",
        [
          ...s.encounterDeck.map((c, index) => ({ c, index, deck: true })),
          ...s.encounterDiscard.map((c, index) => ({ c, index, deck: false })),
        ]
          .filter((x) => card(x.c).type_code === "enemy")
          .map((x) => ({
            id: `${x.deck ? "deck" : "discard"}-${x.index}`,
            label: card(x.c).name,
            code: x.c,
            effects: [
              fx("depthsForecastleTake", {
                code: x.c,
                count: x.index,
                flag: x.deck,
                player: firstPlayer(s),
              }),
            ],
          })),
      );
      break;
    case "depthsForecastleTake": {
      const pile = e.flag ? s.encounterDeck : s.encounterDiscard;
      if (pile[e.count ?? -1] === e.code) {
        pile.splice(e.count!, 1);
        prepend(
          s,
          fx("revealCard", { code: e.code!, player: firstPlayer(s) }),
          fx("depthsForecastleShuffle"),
        );
      }
      break;
    }
    case "depthsForecastleShuffle":
      shuffle(s, s.encounterDeck);
      break;
    case "depthsDiscardAttachment": {
      const player = e.player ?? activeSeat(s);
      choose(
        s,
        "Discard an attachment you control",
        allCharacters(s).flatMap((host) =>
          host.attachments
            .filter((a) => (a.controller ?? ownerOf(s, host)) === player)
            .map((a) => ({
              id: a.id,
              label: card(a.code).name,
              code: a.code,
              effects: [
                fx("depthsRemoveAttachment", {
                  target: host.id,
                  source: a.id,
                  player,
                }),
              ],
            })),
        ),
      );
      break;
    }
    case "depthsRemoveAttachment":
      if (u) {
        const a = u.attachments.find((a) => a.id === e.source);
        if (a) discardAttachment(s, u, a);
      }
      break;
    case "depthsAssignDamage":
      if ((e.value ?? 0) > 0)
        choose(
          s,
          `Assign ${e.value} damage among your characters`,
          opts(own(s, e.player ?? activeSeat(s)), (u) => [
            fx("damage", { target: u.id, value: 1, player: ownerOf(s, u) }),
            { ...e, value: (e.value ?? 0) - 1 },
          ]),
        );
      break;
    case "depthsShipRound": {
      const ship = locations(s).find(
        (u) => trait(u, "Ship") && threatOf(s, u) >= 9,
      );
      if (ship)
        lose(
          s,
          `${name(ship)} has 9 or more threat. The Stormcaller is destroyed.`,
        );
      break;
    }
    case "depthsCombatCleanup":
      for (const u of s.staging.filter(
        (u) => card(u.code).type_code === "enemy",
      )) {
        s.encounterDiscard.push(...u.shadows);
        u.shadows = [];
        delete u.faceupShadows;
        u.revealedShadowCount = 0;
      }
      break;
    case "depthsDeposit":
      if (u && !depthsAbilityProblem(s, u))
        choose(
          s,
          `${name(u)} · Spend 1 hero resource`,
          opts(
            own(s, ownerOf(s, u)).filter(
              (h) =>
                isHero(h) && h.resources > 0 && heirsCanSpendResources(s, h),
            ),
            (h) => [
              fx("depthsDepositPay", {
                target: u.id,
                source: h.id,
                player: ownerOf(s, u),
              }),
              ...(e.effects ?? []),
            ],
          ),
          "Spend 1 resource from a hero you control to add 1 resource here. You may use this action once per round.",
        );
      break;
    case "depthsDepositPay": {
      const h = get(s, e.source);
      if (u && h && h.resources > 0 && !depthsAbilityProblem(s, u)) {
        spendResources(s, h, 1);
        u.resources++;
        seatView(s, ownerOf(s, u)).used.push(`round:depths-deposit:${u.id}`);
      }
      break;
    }
    case "depthsNaasiyahWindow":
      naasiyahWindow(s, e, u);
      break;
    case "depthsNaasiyahBoost":
      if (u && u.resources > 0 && !u.blanked) {
        u.resources--;
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
  if (u.resources > 0)
    for (const stat of ["attack", "defense"] as const)
      options.push({
        id: stat,
        label: `Spend 1 Na'asiyah resource · +2 ${stat} for this attack`,
        code: u.code,
        ability,
        effects: [{ ...e, kind: "depthsNaasiyahBoost", text: stat }, e],
      });
  if (!depthsAbilityProblem(s, u))
    options.push({
      id: "deposit",
      label:
        "Spend 1 hero resource · Add 1 resource to Na'asiyah · Once per round",
      code: u.code,
      ability,
      effects: [
        fx("depthsDeposit", {
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
      "Her resource actions may be used while she is attacking or defending.",
    );
}
function stageTwo(s: GameState) {
  const q = depthsState(s)!;
  for (const [front, back, player] of [
    [D.sahir, D.sahirAlly, firstPlayer(s)],
    [D.naasiyah, D.naasiyahAlly, playerOrder(s).at(-1)!],
  ] as const) {
    let u = aside(s, front) ?? enemies(s).find((u) => u.code === front);
    if (!u)
      for (const pile of [s.encounterDeck, s.encounterDiscard]) {
        const i = pile.indexOf(front);
        if (i >= 0) {
          pile.splice(i, 1);
          u = make(s, front);
          break;
        }
      }
    if (!u) continue;
    s.staging = s.staging.filter((x) => x.id !== u!.id);
    for (const owner of playerOrder(s))
      forOwner(s, owner, () => {
        s.engaged = s.engaged.filter((x) => x.id !== u!.id);
      });
    s.encounterDiscard.push(...u.shadows);
    u.shadows = [];
    delete u.faceupShadows;
    u.revealedShadowCount = 0;
    for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
    u.code = back;
    u.damage = 0;
    u.progress = 0;
    u.resources = 0;
    u.owner = player;
    u.controller = player;
    if (u.raidCombatResourceBonus !== undefined) {
      u.tempAttack = (u.tempAttack ?? 0) - u.raidCombatResourceBonus;
      u.tempDefense = (u.tempDefense ?? 0) - u.raidCombatResourceBonus;
    }
    delete u.raidCombatResourceBonus;
    forOwner(s, player, () => s.allies.push(u!));
    encounterCharacterEntered(s, u);
    if (s.status !== "playing") return;
  }
  const purge = (pile: string[]) => {
    const removed = pile.filter((c) => DEPTHS_CORSAIR_RAIDERS.includes(c));
    q.removed.push(...removed);
    return pile.filter((c) => !DEPTHS_CORSAIR_RAIDERS.includes(c));
  };
  s.encounterDeck = purge(s.encounterDeck);
  s.encounterDiscard = purge(s.encounterDiscard);
  const doomed = enemies(s).filter((u) =>
    DEPTHS_CORSAIR_RAIDERS.includes(u.code),
  );
  for (const u of doomed) {
    s.staging = s.staging.filter((x) => x.id !== u.id);
    for (const owner of playerOrder(s))
      forOwner(s, owner, () => {
        s.engaged = s.engaged.filter((x) => x.id !== u.id);
      });
    for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
    s.encounterDiscard.push(...u.shadows);
    u.shadows = [];
    q.removedUnits.push(u);
  }
  for (const u of [
    ...units(s),
    ...[mainQuestUnit(s)].filter((u): u is Unit => !!u),
  ]) {
    for (let i = u.shadows.length - 1; i >= 0; i--)
      if (DEPTHS_CORSAIR_RAIDERS.includes(u.shadows[i])) {
        q.removed.push(u.shadows[i]);
        removeShadowCard(u, i);
      }
    u.attachments = u.attachments.filter((a) => {
      if (!DEPTHS_CORSAIR_RAIDERS.includes(a.code)) return true;
      q.removed.push(a.code);
      return false;
    });
  }
  for (const combat of [
    ...s.suspendedCombats,
    ...(s.combat ? [s.combat] : []),
  ]) {
    const held = combat.immediatePreviousShadows;
    if (!held) continue;
    for (let i = held.length - 1; i >= 0; i--)
      if (DEPTHS_CORSAIR_RAIDERS.includes(held[i])) {
        q.removed.push(held.splice(i, 1)[0]);
        combat.immediatePreviousFaceupShadows?.splice(i, 1);
        if (i < (combat.immediatePreviousRevealedShadowCount ?? 0))
          combat.immediatePreviousRevealedShadowCount = Math.max(
            0,
            (combat.immediatePreviousRevealedShadowCount ?? 0) - 1,
          );
      }
  }
  s.encounterDiscard = purge(s.encounterDiscard);
  const thing = aside(s, D.thing);
  if (thing) add(s, thing);
  s.encounterDeck = shuffle(s, [
    ...s.encounterDeck,
    ...s.encounterDiscard.splice(0),
    ...q.beastDeck.splice(0),
  ]);
  prepend(s, fx("depthsStageThree", { player: firstPlayer(s) }));
}
