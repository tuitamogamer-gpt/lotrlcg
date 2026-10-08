import type { Card, Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  putPlayerDeck,
  shuffle,
  stats,
} from "./core";
import {
  attachmentChoice,
  discardCharacter,
  discardPlayerDeck,
  engage,
  enemyAddedToStaging,
  questDefeated,
  takePlayerDiscard,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { allQuestUnits, attachToQuest, currentQuestUnit } from "./quest-state";
import {
  DIKE as D,
  DIKE_RECIPES,
  dikeLocationTime,
} from "./deadmens-dike-support";
import { choosePlayerResponse } from "./player-ability-triggers";
export { dikeCannotLeaveDiscard } from "./deadmens-discard";

const isDike = (s: GameState) =>
  s.scenarioId === "deadmens-dike" && !!s.deadmensDike;
const undead = (u: Unit) =>
  (card(u.code).traits ?? "").split(".").some((t) => t.trim() === "Undead");
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location",
  );
const active = (s: GameState, code: string) =>
  allActiveLocations(s).filter((u) => u.code === code && !u.blanked);
const boss = (s: GameState) => enemies(s).find((u) => u.code === D.thaurdir);
const printedCost = (code?: string) => {
  const n = code ? Number(card(code).cost) : 0;
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};
const sameTitle = (pile: string[], code: string) =>
  pile.some((c) => card(c).name === card(code).name);
const topEnemy = (s: GameState, onlyUndead = false) => {
  for (let i = s.encounterDiscard.length - 1; i >= 0; i--) {
    const code = s.encounterDiscard[i];
    if (
      card(code).type_code === "enemy" &&
      (!onlyUndead || undead({ code } as Unit))
    )
      return i;
  }
  return -1;
};
const skip: Option = { id: "skip", label: "Skip the response", effects: [] };

function ordered(s: GameState, effects: Effect[], text: string) {
  if (!effects.length) return;
  if (effects.length === 1) prepend(s, effects[0]);
  else
    prepend(s, fx("fangornOrder", { effects, text, player: firstPlayer(s) }));
}
function putDiscardEnemy(s: GameState, engaged: boolean, onlyUndead = false) {
  const index = topEnemy(s, onlyUndead);
  if (index < 0) return;
  const u = make(s, s.encounterDiscard.splice(index, 1)[0]);
  if (engaged) engage(s, u);
  else {
    s.staging.push(u);
    enemyAddedToStaging(s, u);
  }
  log(
    s,
    `${name(u)} returns from the encounter discard pile${engaged ? ` engaged with ${seatName(s, activeSeat(s))}` : " to the staging area"}.`,
    "danger",
  );
}
function returnEnemy(s: GameState, enemy: Unit) {
  if (!allEngaged(s).some((u) => u.id === enemy.id)) return;
  forOwner(s, ownerOf(s, enemy), () => {
    s.engaged = s.engaged.filter((u) => u.id !== enemy.id);
  });
  s.encounterDiscard.push(...enemy.shadows);
  enemy.shadows = [];
  delete enemy.faceupShadows;
  enemy.revealedShadowCount = 0;
  delete enemy.shadowCancelsDamage;
  delete enemy.shadowCancelsCombatDamage;
  s.staging.push(enemy);
  enemyAddedToStaging(s, enemy);
}
function assignedDamage(effects: Effect[]) {
  const result: Effect[] = [];
  for (const e of effects) {
    const previous = result.find(
      (x) =>
        x.kind === "damage" &&
        e.kind === "damage" &&
        x.target === e.target &&
        x.player === e.player,
    );
    if (previous) previous.value = (previous.value ?? 0) + (e.value ?? 0);
    else result.push({ ...e });
  }
  return result;
}
function squareTokens(s: GameState) {
  for (const u of locations(s).filter(
    (u) => u.code === D.square && !u.blanked,
  )) {
    u.resources++;
    log(s, `${name(u)} gains 1 resource token.`, "danger");
  }
}
function mill(
  s: GameState,
  count: number,
  player: number,
  effects: Effect[] = [],
) {
  prepend(s, fx("dikeMill", { count, ids: [], effects, player }));
}

/** Printed setup pools are separate; Thaurdir retains his physical set-aside identity. */
export function setupDeadmensDike(s: GameState) {
  const recipe = DIKE_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const pile = (section: string) =>
    recipe.cards
      .filter((r) => r.section === section)
      .flatMap((r) => Array<string>(r.quantity).fill(r.code));
  s.encounterDeck = pile("sharedEncounterDeck");
  s.deadmensDike = {
    initialized: false,
    setAside: pile("sharedSetAside").map((code) => make(s, code)),
    undeadRevealRound: -1,
    terrorRound: -1,
    terrorThreat: 0,
  };
}
export function dikeOpeningHandsKept(s: GameState) {
  if (!isDike(s) || s.deadmensDike!.initialized) return false;
  prepend(s, fx("dikeSetup", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
export function dikeCardEntered(s: GameState, u: Unit, fromReveal: boolean) {
  if (isDike(s) && dikeLocationTime(u.code))
    u.timeCounters = fromReveal ? dikeLocationTime(u.code) : 0;
}
/** A reveal before travelling to the Keep still consumes the round's first Undead reveal. */
export function dikeRevealSurge(
  s: GameState,
  code: string,
  origin: Effect["revealOrigin"] = "encounter",
) {
  if (
    !isDike(s) ||
    origin !== "encounter" ||
    card(code).type_code !== "enemy" ||
    !undead({ code } as Unit)
  )
    return false;
  const q = s.deadmensDike!,
    first = q.undeadRevealRound !== s.round;
  q.undeadRevealRound = s.round;
  return first && active(s, D.keep).length > 0;
}
export function dikeAfterReveal(
  s: GameState,
  code: string,
  origin: Effect["revealOrigin"] = "encounter",
) {
  const enemy = boss(s);
  if (
    isDike(s) &&
    origin === "encounter" &&
    enemy &&
    !enemy.blanked &&
    card(code).type_code === "treachery" &&
    (card(code).traits ?? "").split(".").some((t) => t.trim() === "Sorcery")
  )
    prepend(
      s,
      fx("dikeThaurdirSorcery", { target: enemy.id, player: firstPlayer(s) }),
    );
}
export function dikeLocationThreat(s: GameState, u: Unit): number | undefined {
  return isDike(s) && u.code === D.square && !u.blanked
    ? (card(u.code).threat ?? 0) + u.resources
    : undefined;
}
export const dikeStagingThreat = (s: GameState) =>
  isDike(s) && s.deadmensDike!.terrorRound === s.round
    ? s.deadmensDike!.terrorThreat
    : 0;
export const dikePlayerDeckEmpty = (s: GameState, player: number) =>
  isDike(s) && s.deadmensDike!.initialized && !seatView(s, player).deck.length;
export const dikeIndestructible = (s: GameState, u: Unit) =>
  isDike(s) && u.code === D.thaurdir && !u.blanked;
export const dikeCannotAttach = (s: GameState, u: Unit) =>
  isDike(s) && u.code === D.thaurdir && !u.blanked;
export function dikePlayCost(s: GameState, c: Card, owner = activeSeat(s)) {
  if (!isDike(s) || !sameTitle(seatView(s, owner).discard, c.code)) return 0;
  return allQuestUnits(s).reduce(
    (n, u) =>
      n + u.attachments.filter((a) => a.code === D.curse && !a.blanked).length,
    0,
  );
}
export function dikeDeckDiscarded(
  s: GameState,
  codes: string[],
  player: number,
) {
  if (!isDike(s) || !codes.length || player !== firstPlayer(s)) return;
  squareTokens(s);
}
/** The caller distinguishes actual printed Actions/Responses from framework actions and Forced effects. */
export function dikePlayerTriggered(s: GameState, player = activeSeat(s)) {
  if (isDike(s))
    prepend(
      s,
      ...active(s, D.gate).map((u) =>
        fx("dikeGateDiscard", { source: u.id, player }),
      ),
    );
}
export function dikeEngaged(s: GameState, u: Unit) {
  if (!isDike(s) || u.blanked) return;
  if (u.code === D.damned)
    prepend(s, fx("dikeDamned", { target: u.id, player: ownerOf(s, u) }));
  if (u.code === D.lord)
    prepend(s, fx("dikeLord", { target: u.id, player: ownerOf(s, u) }));
}
export function dikeAttackDeclared(
  s: GameState,
  u: Unit,
  player = activeSeat(s),
) {
  if (isDike(s) && u.code === D.shade && !u.blanked)
    prepend(s, fx("dikeShadeAttack", { target: u.id, player }));
}
export function dikeCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  const c = s.combat;
  if (
    !isDike(s) ||
    !c ||
    !context.combatDamage ||
    context.enemyId !== c.enemyId ||
    !["hero", "ally", "objective-ally"].includes(card(u.code).type_code)
  )
    return;
  c.dikeCharacterKilled = true;
  if (get(s, c.enemyId)?.code === D.thaurdir && s.stage === 2)
    (c.dikeDestroyedPlayers ??= []).push(ownerOf(s, u));
}
export function dikeAttackFinished(
  s: GameState,
  c: NonNullable<GameState["combat"]>,
) {
  if (!isDike(s)) return;
  const effects: Effect[] = (c.dikeDestroyedPlayers ?? []).map((player) =>
    fx("dikeThaurdirChoice", { target: c.enemyId, player }),
  );
  if (c.dikeCharacterKilled)
    for (let i = 0; i < (c.dikeRevealOnCharacterKill ?? 0); i++)
      effects.push(fx("reveal", { player: firstPlayer(s) }));
  if (effects.length)
    prepend(s, fx("dikeAttackEffects", { effects, player: firstPlayer(s) }));
}
export function dikeExplored(s: GameState, u: Unit, wasActive: boolean) {
  if (isDike(s) && wasActive && u.code === D.tombs && !u.blanked)
    prepend(
      s,
      fx("dikeTombsResponse", {
        source: u.id,
        code: u.code,
        player: firstPlayer(s),
      }),
    );
}
export function dikeSideDefeated(s: GameState, u: Unit) {
  if (isDike(s) && u.code === D.power && !u.blanked)
    prepend(s, fx("dikePowerRefill", { player: firstPlayer(s) }));
}
export function dikeRefreshEnd(s: GameState) {
  if (!isDike(s)) return;
  const effects: Effect[] =
    s.stage === 1
      ? [
          fx("dikeDiscardDeck", {
            value: 1,
            ids: playerOrder(s).map(String),
            player: firstPlayer(s),
          }),
        ]
      : [];
  for (const u of s.staging.filter((u) => !u.blanked)) {
    if (u.code === D.world)
      effects.push(fx("dikeWorld", { source: u.id, player: firstPlayer(s) }));
    if (u.code === D.seal)
      effects.push(fx("dikeSeal", { source: u.id, player: firstPlayer(s) }));
  }
  for (const u of locations(s)) {
    if (!u.timeCounters || !dikeLocationTime(u.code)) continue;
    u.timeCounters--;
    if (!u.timeCounters && !u.blanked)
      effects.push(
        fx("dikeBattlements", { target: u.id, player: firstPlayer(s) }),
      );
  }
  ordered(s, effects, "Choose the next end-of-refresh Forced effect");
}
export function dikeTravelProblem(s: GameState, u: Unit) {
  if (!isDike(s) || u.blanked) return null;
  if (u.code === D.tombs && topEnemy(s) < 0)
    return "Norbury Tombs requires an enemy in the encounter discard pile.";
  if (
    u.code === D.battlements &&
    playerOrder(s).some((p) => !seatView(s, p).deck.length)
  )
    return "Every player must discard the top card of their deck to travel here.";
  return null;
}
export function dikeTravel(s: GameState, u: Unit): Effect[] | undefined {
  if (!isDike(s) || u.blanked) return undefined;
  if (u.code === D.tombs)
    return [fx("dikeReturnEnemy", { player: firstPlayer(s) })];
  if (u.code === D.battlements)
    return [
      fx("dikeDiscardDeck", {
        value: 1,
        ids: playerOrder(s).map(String),
        player: firstPlayer(s),
      }),
    ];
  return undefined;
}
export function dikeAdvance(s: GameState) {
  if (!isDike(s)) return false;
  const q = s.deadmensDike!;
  if (
    !q.initialized ||
    s.stageRevealing ||
    s.queue.length ||
    s.choice ||
    s.status !== "playing"
  )
    return true;
  if (s.stage === 1 && s.progress >= 11) {
    if (questDefeated(s, D.shades)) return true;
    s.stage = 2;
    s.progress = 0;
    s.stageRevealing = true;
    log(s, "A Fell Wraith · Thaurdir reveals his true nature.", "chapter");
    prepend(s, fx("dikeStageTwo", { player: firstPlayer(s) }));
  } else if (s.stage === 2 && s.progress >= 13) {
    const enemy = boss(s);
    if (
      (!enemy || enemy.damage >= stats(s, enemy).health) &&
      !questDefeated(s, D.wraith)
    )
      win(s);
  }
  return true;
}

export function dikeEncounter(s: GameState, code: string, replay = false) {
  if (!isDike(s)) return false;
  if (code === D.cursed) {
    for (let i = s.encounterDiscard.length - 1; i >= 0; i--)
      if (s.encounterDiscard[i] === D.cursed) {
        const u = make(s, s.encounterDiscard.splice(i, 1)[0]);
        s.staging.push(u);
        enemyAddedToStaging(s, u);
      }
  } else if (code === D.restless) {
    const targets = enemies(s).filter(undead);
    if (!targets.length)
      prepend(
        s,
        fx("amonSurgeWindow", { code }),
        fx("reveal", { player: firstPlayer(s) }),
      );
    for (const u of targets) {
      u.roundThreat = (u.roundThreat ?? 0) + 1;
      u.roundAttack = (u.roundAttack ?? 0) + 1;
      u.roundDefense = (u.roundDefense ?? 0) + 1;
    }
  } else if (code === D.fog)
    prepend(s, ...playerOrder(s).map((player) => fx("dikeFog", { player })));
  else if (code === D.sorcery)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("dikeDarkSorcery", { player })),
    );
  else if (code === D.terror)
    prepend(s, fx("dikeTerror", { player: firstPlayer(s) }));
  else if (code === D.curse)
    prepend(s, fx("dikeCurseAttach", { player: firstPlayer(s) }));
  else if (
    ![
      D.shade,
      D.damned,
      D.lord,
      D.thaurdir,
      D.square,
      D.battlements,
      D.keep,
      D.tombs,
      D.gate,
      D.world,
      D.seal,
      D.power,
    ].includes(code)
  )
    return false;
  if (!replay && card(code).type_code === "treachery" && code !== D.curse)
    s.encounterDiscard.push(code);
  return true;
}
export function dikeShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!isDike(s) || !c) return false;
  const defenders = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
  if (code === D.cursed)
    c.attackBonus += defenders.some((u) =>
      sameTitle(seatView(s, u.owner ?? ownerOf(s, u)).discard, u.code),
    )
      ? 2
      : 1;
  else if (code === D.restless) {
    for (const u of s.engaged.filter(undead)) {
      u.roundAttack = (u.roundAttack ?? 0) + 1;
      u.roundDefense = (u.roundDefense ?? 0) + 1;
    }
  } else if (code === D.gate) attachmentChoice(s);
  else if (code === D.keep) {
    const [discarded] = discardPlayerDeck(s, 1);
    c.attackBonus += printedCost(discarded);
  } else if (code === D.terror) {
    mill(s, 3, c.attackPlayer ?? activeSeat(s), [
      fx("dikeShadowTerrorBonus", {
        target: c.enemyId,
        ids: [],
        player: c.attackPlayer ?? activeSeat(s),
      }),
    ]);
  } else if (code === D.lord) {
    c.attackBonus++;
    c.dikeRevealOnCharacterKill = (c.dikeRevealOnCharacterKill ?? 0) + 1;
  } else if (code === D.sorcery) {
    const targets = defenders.filter((u) =>
      sameTitle(seatView(s, u.owner ?? ownerOf(s, u)).discard, u.code),
    );
    if (targets.length === 1) discardCharacter(s, targets[0]);
    else if (targets.length > 1)
      choose(
        s,
        "Dark Sorcery · Discard a defending character",
        opts(targets, (u) => [
          fx("dikeDiscardCharacter", { target: u.id, player: ownerOf(s, u) }),
        ]),
      );
  } else if (code === D.shade) {
    const targets = [...s.heroes, ...s.allies].filter((u) => !u.exhausted);
    choose(
      s,
      "Baleful Shade · Exhaust a character you control",
      opts(targets, (u) => [fx("exhaust", { target: u.id })]),
    );
  } else return false;
  return true;
}

export function dikeEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("dike")) return false;
  if (!isDike(s)) return true;
  const q = s.deadmensDike!,
    u = get(s, e.target);
  switch (e.kind) {
    case "dikeSetup": {
      if (q.initialized) break;
      const ally = make(s, D.iarion);
      delete ally.owner;
      ally.controller = firstPlayer(s);
      forOwner(s, firstPlayer(s), () => s.allies.push(ally));
      s.staging.push(make(s, D.square));
      q.initialized = true;
      s.stageRevealing = true;
      shuffle(s, s.encounterDeck);
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("dikeSetupShade", { player })),
        fx("dikeShuffle"),
        fx("dikeSetupReveal", { player: firstPlayer(s) }),
      );
      break;
    }
    case "dikeSetupShade": {
      const i = s.encounterDeck.indexOf(D.shade);
      if (i >= 0) engage(s, make(s, s.encounterDeck.splice(i, 1)[0]));
      break;
    }
    case "dikeSetupReveal":
      prepend(
        s,
        ...playerOrder(s).map(() => fx("reveal", { player: firstPlayer(s) })),
        fx("dikeStageReady", { player: firstPlayer(s) }),
      );
      break;
    case "dikeStageTwo": {
      const enemy = q.setAside.find((u) => u.code === D.thaurdir);
      if (enemy) {
        q.setAside = q.setAside.filter((u) => u.id !== enemy.id);
        s.staging.push(enemy);
        enemyAddedToStaging(s, enemy);
        prepend(
          s,
          ...playerOrder(s).map(() => fx("reveal", { player: firstPlayer(s) })),
          fx("dikeStageReady", { player: firstPlayer(s) }),
        );
      } else prepend(s, fx("dikeStageReady", { player: firstPlayer(s) }));
      break;
    }
    case "dikeStageReady":
      s.stageRevealing = false;
      break;
    case "dikeShuffle":
      shuffle(s, s.encounterDeck);
      break;
    case "dikeDiscardDeck":
      prepend(
        s,
        ...(e.ids ?? [String(activeSeat(s))]).map(Number).map((player) =>
          fx("dikeMill", {
            count: e.value ?? 1,
            ids: [],
            effects: [],
            player,
          }),
        ),
      );
      break;
    case "dikeGateDiscard":
      discardPlayerDeck(s, 1);
      break;
    case "dikeFog": {
      const targets = [...s.heroes, ...s.allies].filter(
        (u) => u.committed || s.committedIds.includes(u.id),
      );
      if (!targets.length) break;
      const options: Option[] = [
        {
          id: "remove",
          label: `Remove your ${targets.length} questing characters from the quest`,
          effects: [
            fx("dikeRemoveQuesters", { ids: targets.map((u) => u.id) }),
          ],
        },
      ];
      if (s.deck.length >= targets.length)
        options.unshift({
          id: "discard",
          label: `Discard the top ${targets.length} cards of your deck`,
          effects: [fx("dikeDiscardDeck", { value: targets.length })],
        });
      choose(
        s,
        "Unnatural Fog · Discard deck cards or leave the quest",
        options,
      );
      break;
    }
    case "dikeRemoveQuesters":
      for (const id of e.ids ?? []) {
        const target = get(s, id);
        if (target) target.committed = false;
      }
      s.committedIds = s.committedIds.filter(
        (id) => !(e.ids ?? []).includes(id),
      );
      break;
    case "dikeDamned": {
      mill(s, 2, activeSeat(s), [
        fx("dikeDamnedDamage", { ids: [], player: activeSeat(s) }),
      ]);
      break;
    }
    case "dikeDamnedDamage": {
      const amount = (e.ids ?? []).reduce(
        (n, code) => n + printedCost(code),
        0,
      );
      prepend(
        s,
        fx("dikeAssignDamage", {
          value: amount,
          ids: [...s.heroes, ...s.allies].map((u) => u.id),
          effects: [],
          player: activeSeat(s),
        }),
      );
      break;
    }
    case "dikeMill": {
      const player = e.player ?? activeSeat(s);
      const first = e.flag ?? player === firstPlayer(s);
      if (
        !(e.count ?? 0) ||
        !s.deck.length ||
        s.table?.seats[player].eliminated
      ) {
        if ((e.ids ?? []).length && first) squareTokens(s);
        prepend(
          s,
          fx("dikeMillDone", { ids: e.ids, effects: e.effects, player }),
        );
        break;
      }
      const before = s.queue.length;
      const cards = discardPlayerDeck(s, 1, player, true, false);
      const responses = s.queue.splice(0, s.queue.length - before);
      const ids = [...(e.ids ?? []), ...cards],
        count = (e.count ?? 0) - cards.length;
      // Continuous deck exhaustion eliminates a player before optional responses.
      // Credit a completed/terminal discard batch before that state check.
      if (!count || !s.deck.length) {
        if (ids.length && first) squareTokens(s);
        prepend(
          s,
          ...responses,
          fx("dikeMillDone", { ids, effects: e.effects, player }),
        );
      } else
        prepend(
          s,
          ...responses,
          fx("dikeMill", { ...e, ids, count, flag: first, player }),
        );
      break;
    }
    case "dikeMillDone":
      prepend(
        s,
        ...(e.effects ?? []).map((next) =>
          [
            "dikeDamnedDamage",
            "dikeShadowTerrorBonus",
            "dikeTerrorCollect",
          ].includes(next.kind)
            ? { ...next, ids: [...(next.ids ?? []), ...(e.ids ?? [])] }
            : next,
        ),
      );
      break;
    case "dikeShadowTerrorBonus":
      if (s.combat && s.combat.enemyId === e.target)
        s.combat.attackBonus += new Set(
          (e.ids ?? []).map((c) => card(c).type_code),
        ).size;
      break;
    case "dikeAssignDamage": {
      const amount = e.value ?? 0,
        effects = assignedDamage(e.effects ?? []);
      const targets = (e.ids ?? [])
        .map((id) => get(s, id))
        .filter((u): u is Unit => !!u);
      const options: Option[] = [];
      for (const target of targets) {
        const reserved = effects
          .filter((x) => x.target === target.id)
          .reduce((n, x) => n + (x.value ?? 0), 0);
        const capacity = Math.max(
          0,
          stats(s, target).health - target.damage - reserved,
        );
        for (let n = 1; n <= Math.min(amount, capacity); n++)
          options.push({
            id: `${target.id}:${n}`,
            code: target.code,
            label: `${name(target)} · ${n} damage`,
            effects: [
              fx("dikeAssignDamage", {
                value: amount - n,
                ids: e.ids,
                effects: [
                  ...effects,
                  fx("damage", {
                    target: target.id,
                    value: n,
                    player: ownerOf(s, target),
                  }),
                ],
                player: activeSeat(s),
              }),
            ],
          });
      }
      if (!amount || !options.length) prepend(s, ...effects);
      else
        choose(
          s,
          `Thaurdir's Damned · Assign ${amount} remaining damage`,
          options,
          "Assign damage among characters you control, up to each character's remaining hit points.",
        );
      break;
    }
    case "dikeLord":
      putDiscardEnemy(s, true, true);
      break;
    case "dikeReturnEnemy":
      putDiscardEnemy(s, false, false);
      break;
    case "dikeShadeAttack": {
      if (!s.combat || s.combat.enemyId !== e.target) break;
      const [code] = discardPlayerDeck(s, 1);
      if (code && card(code).type_code === "ally") s.combat.attackBonus += 2;
      break;
    }
    case "dikeThaurdirSorcery":
      if (u) {
        u.damage = Math.max(0, u.damage - 3);
        log(
          s,
          `${name(u)} heals 3 damage and attacks the first player.`,
          "danger",
        );
        prepend(
          s,
          fx("immediateAttack", { target: u.id, player: firstPlayer(s) }),
        );
      }
      break;
    case "dikeThaurdirChoice":
      if (u) {
        const canReturn = allEngaged(s).some((x) => x.id === u.id),
          canDiscard = s.deck.length >= 3;
        const options: Option[] = [];
        if (canDiscard || !canReturn)
          options.push({
            id: "discard",
            label: `Discard the top ${Math.min(3, s.deck.length)} cards of your deck`,
            effects: [fx("dikeDiscardDeck", { value: 3 })],
          });
        if (canReturn || !canDiscard)
          options.push({
            id: "return",
            label: canReturn
              ? "Return Thaurdir to the staging area"
              : "Thaurdir is already in the staging area",
            effects: [fx("dikeThaurdirReturn", { target: u.id })],
          });
        choose(
          s,
          "A Fell Wraith · Discard deck cards or return Thaurdir",
          options,
        );
      }
      break;
    case "dikeThaurdirReturn":
      if (u) returnEnemy(s, u);
      break;
    case "dikeAttackEffects":
      prepend(
        s,
        fx("fangornOrder", {
          effects: e.effects,
          player: firstPlayer(s),
          text: "Choose the next after-attack Forced effect",
        }),
        fx("dikeAttackFinished"),
      );
      break;
    case "dikeAttackFinished":
      break;
    case "dikeSeal":
      for (let i = 0; i < 3 && s.encounterDeck.length; i++)
        s.encounterDiscard.push(s.encounterDeck.shift()!);
      putDiscardEnemy(s, false, true);
      break;
    case "dikeWorld":
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("dikeWorldPlayer", { player })),
      );
      break;
    case "dikeWorldPlayer":
      mill(s, s.engaged.filter(undead).length, activeSeat(s));
      break;
    case "dikeBattlements": {
      if (!u) break;
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("dikeMill", {
            count: 5,
            ids: [],
            effects: [fx("dikeBattlementsCounter", { target: u.id, player })],
            player,
          }),
        ),
      );
      break;
    }
    case "dikeBattlementsCounter":
      if (u) u.timeCounters = (u.timeCounters ?? 0) + 1;
      break;
    case "dikeTombsResponse":
      choosePlayerResponse(
        s,
        e.source!,
        D.tombs,
        "Norbury Tombs · Shuffle discarded cards back into each deck?",
        [
          {
            id: "resolve",
            label:
              "Each player shuffles their top 5 discard cards into their deck",
            effects: [fx("dikeTombsRefill", { player: firstPlayer(s) })],
          },
          skip,
        ],
        undefined,
        firstPlayer(s),
      );
      break;
    case "dikeTombsRefill":
      prepend(s, fx("dikePowerRefill", { player: firstPlayer(s) }));
      break;
    case "dikePowerRefill":
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("dikeRefillDiscard", { player })),
      );
      break;
    case "dikeRefillDiscard":
      for (let i = 0; i < 5 && s.discard.length; i++)
        putPlayerDeck(
          s,
          takePlayerDiscard(s, s.discard.length - 1, { encounterEffect: true }),
        );
      shuffle(s, s.deck);
      break;
    case "dikeTerror": {
      prepend(
        s,
        fx("dikeTerrorCollect", {
          ids: [],
          effects: playerOrder(s).map((player) =>
            fx("dikeDiscardDeck", { value: 3, player }),
          ),
          player: firstPlayer(s),
        }),
      );
      break;
    }
    case "dikeTerrorCollect": {
      const [next, ...effects] = e.effects ?? [];
      if (next) {
        mill(s, 3, next.player!, [
          fx("dikeTerrorCollect", {
            ids: e.ids,
            effects,
            player: firstPlayer(s),
          }),
        ]);
        break;
      }
      if (q.terrorRound !== s.round) {
        q.terrorRound = s.round;
        q.terrorThreat = 0;
      }
      q.terrorThreat +=
        2 * new Set((e.ids ?? []).map((c) => card(c).type_code)).size;
      break;
    }
    case "dikeDarkSorcery": {
      const targets = s.allies.filter((u) => sameTitle(s.discard, u.code));
      for (const target of targets) discardCharacter(s, target);
      break;
    }
    case "dikeDiscardCharacter":
      if (u) discardCharacter(s, u);
      break;
    case "dikeCurseAttach": {
      const quest = currentQuestUnit(s);
      if (quest)
        attachToQuest(s, quest.code, {
          id: `a${s.nextId++}`,
          code: D.curse,
          exhausted: false,
        });
      break;
    }
    default:
      throw new Error(`Unknown Deadmen's Dike effect ${e.kind}`);
  }
  return true;
}
