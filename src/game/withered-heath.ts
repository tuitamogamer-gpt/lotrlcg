import type { Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  encounterDraw,
  fx,
  get,
  log,
  make,
  prepend,
  shuffle,
  stats,
  takePlayerDeck,
} from "./core";
import {
  discardAttachment,
  discardHandCard,
  discardLocation,
  enemyAddedToStaging,
  questDefeated,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  allHeroes,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { mainQuestUnit } from "./quest-state";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import {
  WITHERED_HEATH as H,
  WITHERED_HEATH_MAIN_QUESTS,
  WITHERED_HEATH_RECIPES,
  witheredHeathDragon,
  witheredHeathSigns,
  witheredHeathStageInfo,
} from "./withered-heath-support";
export * from "./withered-heath-support";
type HeathCombat = NonNullable<GameState["combat"]> & {
  heathSpiderDamageIds?: string[];
};

const live = (s: GameState) => !!s.witheredHeath;
const trait = (u: Unit | string, t: string) =>
  (card(typeof u === "string" ? u : u.code).traits ?? "")
    .split(".")
    .some((v) => v.trim() === t);
const own = (s: GameState, p: number) => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];
const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location",
  );
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const canExhaust = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
const dark = (s: GameState) =>
  allActiveLocations(s).some((l) => trait(l, "Dark"));
const stageLive = (s: GameState, n: number) =>
  live(s) && s.stage === n && !mainQuestUnit(s)?.blanked;
const noReady = (s: GameState, id: string) => {
  const q = s.witheredHeath!;
  q.noReady = q.noReady.filter((m) => m.id !== id);
  q.noReady.push({ id, round: s.round });
};
function detach(s: GameState, u: Unit) {
  s.staging = s.staging.filter((x) => x.id !== u.id);
  if (s.activeLocation?.id === u.id) s.activeLocation = null;
  s.extraActiveLocations = s.extraActiveLocations?.filter((x) => x.id !== u.id);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.engaged = s.engaged.filter((x) => x.id !== u.id);
    });
}
function add(s: GameState, code: string) {
  const u = make(s, code);
  s.staging.push(u);
  if (card(code).type_code === "enemy") enemyAddedToStaging(s, u);
  return u;
}
function aside(s: GameState, code: string) {
  const pile = s.witheredHeath!.setAside,
    i = pile.findIndex((u) => u.code === code);
  return i < 0 ? undefined : pile.splice(i, 1)[0];
}
function shuffleDiscard(s: GameState) {
  s.encounterDeck = shuffle(s, [
    ...s.encounterDeck,
    ...s.encounterDiscard.splice(0),
  ]);
}
function find(s: GameState, type: string) {
  while (s.encounterDeck.length) {
    const code = s.encounterDeck.shift()!;
    if (card(code).type_code === type) return add(s, code);
    s.encounterDiscard.push(code);
  }
}
function scoreSign(s: GameState, sign: Unit) {
  s.victoryCards ??= [];
  s.victoryCards.push(sign.code);
  s.victory += card(sign.code).victory ?? 0;
  log(
    s,
    "Dragon Sign is free of encounters and enters the victory display.",
    "good",
  );
}
function guardSign(s: GameState, sign: Unit, host?: Unit) {
  const guard = host ?? find(s, "enemy");
  if (!guard) {
    scoreSign(s, sign);
    return;
  }
  s.witheredHeath!.guards.push({ sign, guardId: guard.id });
  log(
    s,
    `${name(guard)} guards Dragon Sign and is immune to player card effects.`,
  );
}
function returnDragon(s: GameState) {
  const dragon = witheredHeathDragon(s);
  if (!dragon) return;
  s.witheredHeath!.setAside = s.witheredHeath!.setAside.filter(
    (u) => u.id !== dragon.id,
  );
  detach(s, dragon);
  s.staging.push(dragon);
  enemyAddedToStaging(s, dragon);
  return dragon;
}
const attacks = (s: GameState, dragon: Unit) =>
  playerOrder(s).map((player) =>
    fx("immediateAttack", { target: dragon.id, player }),
  );

export function setupWitheredHeath(s: GameState) {
  if (s.scenarioId !== "the-withered-heath") return;
  const recipe = WITHERED_HEATH_RECIPES.find(
    (r) => r.id === (s.easyMode ? "E08.4" : "Q08.4"),
  )!;
  const codes = (section: string) =>
    recipe.cards
      .filter((c) => c.section === section)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.witheredHeath = {
    initialized: false,
    advancing: false,
    currentQuest: H.search,
    questDeck: WITHERED_HEATH_MAIN_QUESTS.slice(1),
    completedQuests: [],
    setAside: codes("sharedSetAside").map((c) => make(s, c)),
    cavesDeck: codes("sharedEncounterDeck2").map((c) => make(s, c)),
    resolving: [],
    removed: [],
    guards: [],
    peeked: [],
    noReady: [],
    noDamage: [],
    damageRound: 0,
    damageTaken: 0,
    usedResponses: [],
  };
  s.encounterDeck = shuffle(s, codes("sharedEncounterDeck"));
}
export function witheredHeathOpeningHandsKept(s: GameState) {
  if (!live(s) || s.witheredHeath!.initialized) return false;
  prepend(s, fx("heathSetup", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
export function witheredHeathCheck(s: GameState) {
  if (!live(s)) return;
  const q = s.witheredHeath!;
  if (q.damageRound !== s.round) {
    q.damageRound = s.round;
    q.damageTaken = 0;
  }
  q.noReady = q.noReady.filter((m) => m.round === s.round);
  q.noDamage = q.noDamage.filter(
    (m) => m.round === s.round && m.phase === s.phase,
  );
  // Every guarded sign follows its actual encounter card until that card leaves play.
  for (const g of [...q.guards])
    if (
      !locations(s)
        .concat(enemies(s))
        .some((u) => u.id === g.guardId)
    ) {
      q.guards = q.guards.filter((x) => x.sign.id !== g.sign.id);
      scoreSign(s, g.sign);
    }
}
export function witheredHeathAdvance(s: GameState) {
  if (!live(s)) return false;
  const q = s.witheredHeath!;
  if (
    !q.initialized ||
    q.advancing ||
    s.stageRevealing ||
    s.phase === "setup" ||
    s.status !== "playing" ||
    s.stage === 4
  )
    return true;
  const need = witheredHeathStageInfo(s)!.quest;
  if (
    s.progress < need ||
    (s.stage === 1 && witheredHeathSigns(s) < 1) ||
    (s.stage === 2 && (witheredHeathDragon(s)?.damage ?? 0) < 18) ||
    (s.stage === 3 && witheredHeathSigns(s) < 3)
  )
    return true;
  if (questDefeated(s, q.currentQuest)) return true;
  q.advancing = true;
  prepend(s, fx("heathAdvance", { player: firstPlayer(s) }));
  return true;
}
export function witheredHeathStats(s: GameState, u: Unit) {
  if (!live(s) || u.blanked) return {};
  return {
    attack:
      u.code === H.hatchling
        ? witheredHeathSigns(s)
        : u.code === H.werewolf
          ? u.damage
          : 0,
    defense: u.code === H.drake ? witheredHeathSigns(s) : 0,
  };
}
export function witheredHeathThreatBonus(s: GameState, u: Unit) {
  if (!live(s) || u.blanked) return 0;
  if ([H.drake, H.hatchling, H.entrance].includes(u.code))
    return witheredHeathSigns(s);
  if (u.code === H.falls)
    return s.staging.filter((l) => card(l.code).type_code === "location")
      .length;
  if (u.code === H.lake)
    return Math.max(0, ...playerOrder(s).map((p) => own(s, p).length));
  return 0;
}
export const witheredHeathLocationQuestBonus = (s: GameState, u: Unit) =>
  live(s) && !u.blanked && u.code === H.lake
    ? Math.max(0, ...playerOrder(s).map((p) => own(s, p).length))
    : 0;
export const witheredHeathImmune = (s: GameState, u: Unit) =>
  !!s.witheredHeath?.guards.some((g) => g.guardId === u.id && !g.sign.blanked);
export const witheredHeathCannotLeave = (s: GameState, u: Unit) =>
  stageLive(s, 2) && u.code === H.drake;
export const witheredHeathCannotEngage = witheredHeathCannotLeave;
export const witheredHeathConsideredEngaged = (
  s: GameState,
  u: Unit,
  _player: number,
) =>
  stageLive(s, 2) && u.code === H.drake && s.staging.some((e) => e.id === u.id);
export const witheredHeathCannotAttach = (
  s: GameState,
  u: Unit,
  code: string,
) =>
  live(s) &&
  !u.blanked &&
  (u.code === H.drake ||
    (u.code === H.troll && card(code).sphere_code !== "encounter"));
export const witheredHeathCannotReady = (s: GameState, u: Unit) =>
  !!s.witheredHeath?.noReady.some((m) => m.id === u.id && m.round === s.round);
export const witheredHeathCannotPlayerReady = (s: GameState) =>
  !!s.witheredHeath && s.witheredHeath.playerReadyBlockedRound === s.round;
export const witheredHeathLocationProgressBlocked = (s: GameState, u: Unit) =>
  live(s) &&
  !u.blanked &&
  u.code === H.door &&
  s.staging.some((l) => l.id === u.id);
export function witheredHeathCannotCancel(
  s: GameState,
  shadow = false,
  code?: string,
) {
  return (
    live(s) &&
    !shadow &&
    !!code &&
    trait(code, "Weather") &&
    s.staging.some((u) => u.code === H.pass && !u.blanked)
  );
}
export function witheredHeathDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  context: DamageContext,
) {
  if (!live(s)) return amount;
  if (!u.blanked && u.code === H.bats && dark(s)) return 0;
  if (
    s.witheredHeath!.noDamage.some(
      (m) => m.id === u.id && m.round === s.round && m.phase === s.phase,
    )
  )
    return 0;
  if (u.code !== H.drake) return amount;
  if (!u.blanked && !context.combatDamage) return 0;
  const q = s.witheredHeath!,
    taken = q.damageRound === s.round ? q.damageTaken : 0;
  if (stageLive(s, 2))
    return Math.min(amount, Math.max(0, 6 - taken), Math.max(0, 18 - u.damage));
  if (stageLive(s, 4))
    return Math.min(amount, Math.max(0, witheredHeathSigns(s) - taken));
  return amount;
}
export function witheredHeathDamageDealt(
  s: GameState,
  u: Unit,
  amount: number,
  context: DamageContext,
) {
  if (!live(s) || amount <= 0) return;
  const q = s.witheredHeath!;
  if (u.code === H.drake) {
    if (q.damageRound !== s.round) {
      q.damageRound = s.round;
      q.damageTaken = 0;
    }
    q.damageTaken += amount;
  }
  if (!context.combatDamage || !context.enemyId) return;
  const enemy = get(s, context.enemyId);
  if (!enemy || enemy.blanked || !allCharacters(s).some((c) => c.id === u.id))
    return;
  if (enemy.code === H.spider && s.combat?.enemyId === enemy.id) {
    const combat = s.combat as HeathCombat;
    combat.heathSpiderDamageIds = [
      ...new Set([...(combat.heathSpiderDamageIds ?? []), u.id]),
    ];
  }
  if (
    enemy.code === H.troll &&
    u.damage >= stats(s, u).health &&
    s.combat?.enemyId === enemy.id
  )
    s.combat.returnToStaging = true;
}
export function witheredHeathHostLeaves(
  s: GameState,
  u: Unit,
  defeated = true,
) {
  if (!live(s)) return;
  const q = s.witheredHeath!;
  for (const g of q.guards.filter((g) => g.guardId === u.id))
    scoreSign(s, g.sign);
  q.guards = q.guards.filter((g) => g.guardId !== u.id);
  if (u.code === H.drake && defeated && s.stage === 4) {
    win(s);
    s.reason =
      "The Cold-Drake is defeated. The heroes can continue their hunt for Dagnir.";
  }
}
export function witheredHeathAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
  skipped = false,
): Effect[] {
  if (!live(s) || skipped) return [];
  for (const id of (combat as HeathCombat).heathSpiderDamageIds ?? [])
    if (get(s, id)) noReady(s, id);
  return [];
}
export function witheredHeathExplored(
  s: GameState,
  _u: Unit,
  wasActive: boolean,
) {
  if (live(s) && wasActive && (stageLive(s, 1) || stageLive(s, 3)))
    prepend(s, fx("heathPeek", { player: firstPlayer(s) }));
}
export function witheredHeathTravelProblem(s: GameState, u: Unit) {
  if (live(s) && !u.blanked && u.code === H.falls) {
    const n = s.staging.filter(
      (l) => card(l.code).type_code === "location",
    ).length;
    if (
      allCharacters(s).reduce(
        (sum, c) => sum + Math.max(0, stats(s, c).health - c.damage),
        0,
      ) < n
    )
      return "High Falls requires assigning damage equal to the number of staging locations.";
  }
  return null;
}
export function witheredHeathTravelEffects(
  s: GameState,
  u: Unit,
): Effect[] | undefined {
  if (!live(s) || u.blanked) return;
  if (u.code === H.entrance)
    return playerOrder(s).map((player) => fx("threat", { player, value: 1 }));
  if (u.code === H.falls)
    return [
      fx("heathAssignDamage", {
        player: firstPlayer(s),
        flag: true,
        value: s.staging.filter((l) => card(l.code).type_code === "location")
          .length,
      }),
    ];
  if (u.code === H.creatureDen)
    return [
      fx("heathFindEnemies", { player: firstPlayer(s), value: 1, flag: true }),
    ];
}
export function witheredHeathTravelEntered(
  s: GameState,
  u: Unit,
  actualTravel = true,
) {
  if (!live(s) || u.blanked) return;
  const q = s.witheredHeath!,
    effects: Effect[] = [];
  if (u.code === H.cavern)
    effects.push(
      ...playerOrder(s).map((player) =>
        fx("heathAssignDamage", { player, value: own(s, player).length }),
      ),
    );
  if (u.code === H.frightful)
    effects.push(
      fx("heathFindEnemies", {
        player: firstPlayer(s),
        value: playerOrder(s).length,
        flag: true,
      }),
    );
  if (
    [H.treasury, H.armory].includes(u.code) &&
    !q.usedResponses.includes(u.code)
  )
    effects.push(
      fx("heathLocationResponse", {
        target: u.id,
        code: u.code,
        player: firstPlayer(s),
      }),
    );
  if (
    actualTravel &&
    u.code === H.creatureDen &&
    q.cavesDeck.some((c) => c.code === H.sign)
  )
    effects.push(
      fx("heathDenResponse", { target: u.id, player: firstPlayer(s) }),
    );
  if (
    actualTravel &&
    !stageLive(s, 2) &&
    [H.door, H.entrance, H.falls].includes(u.code) &&
    q.cavesDeck.length
  )
    effects.push(fx("heathDeep", { target: u.id, player: firstPlayer(s) }));
  prepend(s, ...effects);
}
export function witheredHeathBeginQuest(s: GameState): Effect[] {
  return stageLive(s, 4)
    ? [fx("heathDragonAttack", { player: firstPlayer(s) })]
    : [];
}
export const witheredHeathRoundEnd = (s: GameState): Effect[] =>
  stageLive(s, 3) ? [fx("heathHealDragon")] : [];
export function witheredHeathCommitted(s: GameState) {
  if (live(s))
    prepend(
      s,
      ...locations(s)
        .filter((l) => l.code === H.grotto && !l.blanked)
        .map(() => fx("heathGrotto", { player: firstPlayer(s) })),
    );
}
export function witheredHeathAllyEntered(s: GameState, u: Unit) {
  if (live(s) && locations(s).some((l) => l.code === H.lake && !l.blanked))
    u.exhausted = true;
  return false;
}
export function witheredHeathPlayerCardPlayed(s: GameState, _u: Unit) {
  const player = activeSeat(s);
  if (live(s) && seatView(s, player).hand.some((u) => u.code === H.lost))
    prepend(s, fx("heathDiscardWholeHand", { player }));
}
export const witheredHeathCannotDiscardHand = (
  s: GameState,
  u: Unit,
  byPlayer: boolean,
) => live(s) && byPlayer && u.code === H.lost;
export const witheredHeathHandDiscardDestination = (s: GameState, u: Unit) => {
  if (!live(s) || u.code !== H.lost) return false;
  s.encounterDiscard.push(u.code);
  return true;
};
export function witheredHeathCharacterReadied(s: GameState, u: Unit) {
  if (live(s) && u.attachments.some((a) => a.code === H.weighed && !a.blanked))
    prepend(
      s,
      fx("heathWeighedDiscard", { target: u.id, player: ownerOf(s, u) }),
    );
}
export function witheredHeathShadowResolved(
  s: GameState,
  u: Unit,
  code: string,
) {
  if (!live(s) || u.blanked || !s.combat || card(code).shadow) return;
  const defenders =
    s.combat.defenderIds ?? (s.combat.defenderId ? [s.combat.defenderId] : []);
  if (u.code === H.drake) for (const id of defenders) noReady(s, id);
  if (u.code === H.werewolf)
    prepend(
      s,
      fx("damage", { target: u.id, value: 1 }),
      ...defenders.map((target) =>
        fx("damage", { target, value: 1, player: ownerOf(s, get(s, target)!) }),
      ),
    );
}
/** FAQ 1.42: subsequent attacks discard their former shadows and receive a new one. */
export function witheredHeathBeginShadows(s: GameState, u: Unit) {
  if (!stageLive(s, 2) || u.code !== H.drake) return false;
  // Preserve the ordinary combat-framework deal for the first player's attack.
  if (!u.shadows.length || (u.revealedShadowCount ?? 0) > 0) {
    s.encounterDiscard.push(...u.shadows);
    const code = encounterDraw(s, true);
    u.shadows = code ? [code] : [];
    u.revealedShadowCount = 0;
    delete u.faceupShadows;
    delete u.shadowCancelsDamage;
    delete u.shadowCancelsCombatDamage;
  }
  return true;
}
export function witheredHeathFinishShadows(s: GameState, u: Unit) {
  if (!stageLive(s, 2) || u.code !== H.drake) return false;
  s.encounterDiscard.push(...u.shadows);
  u.shadows = [];
  u.revealedShadowCount = 0;
  delete u.faceupShadows;
  delete u.shadowCancelsDamage;
  delete u.shadowCancelsCombatDamage;
  return true;
}
export function witheredHeathShadow(s: GameState, code: string) {
  if (!live(s) || !s.combat) return false;
  const c = s.combat,
    player = c.attackPlayer ?? activeSeat(s),
    defenders = c.defenderIds ?? (c.defenderId ? [c.defenderId] : []),
    enemy = get(s, c.enemyId);
  if (code === H.snow) prepend(s, fx("heathExhaust", { player }));
  else if (code === H.cold)
    c.attackBonus += defenders.some((id) => (get(s, id)?.damage ?? 0) > 0)
      ? 2
      : 1;
  else if (code === H.troll) c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  else if (code === H.hatchling) {
    if (enemy) {
      const n = witheredHeathSigns(s);
      enemy.tempAttack = (enemy.tempAttack ?? 0) + n;
      enemy.tempDefense = (enemy.tempDefense ?? 0) + n;
    }
  } else if (code === H.supplies)
    prepend(
      s,
      fx("threat", { player, value: seatView(s, player).engaged.length }),
    );
  else if (code === H.werewolf)
    prepend(
      s,
      ...defenders.map((target) => fx("damage", { target, value: 1, player })),
    );
  else if (code === H.spider) for (const id of defenders) noReady(s, id);
  else if (code === H.bats) {
    if (dark(s))
      s.witheredHeath!.noDamage.push({
        id: c.enemyId,
        round: s.round,
        phase: s.phase,
      });
  } else return false;
  return true;
}
export function witheredHeathEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (
    !live(s) ||
    ![H.snow, H.cold, H.supplies, H.lost, H.weighed].includes(code)
  )
    return false;
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(code);
    return true;
  }
  if (code === H.lost || code === H.weighed) {
    if (replay) {
      const i = s.encounterDiscard.indexOf(code);
      if (i >= 0) s.encounterDiscard.splice(i, 1);
    }
    const physical = make(s, code);
    s.witheredHeath!.resolving.push(physical);
    prepend(
      s,
      fx("heathTreachery", {
        code,
        source: physical.id,
        player: firstPlayer(s),
      }),
    );
  } else {
    if (!replay) s.encounterDiscard.push(code);
    prepend(s, fx("heathTreachery", { code, player: firstPlayer(s) }));
  }
  return true;
}
export const witheredHeathSharedEffect = (e: Effect) =>
  e.kind.startsWith("heath") &&
  ![
    "heathAssignDamage",
    "heathDamageNext",
    "heathSupplies",
    "heathColdCharacter",
    "heathExhaust",
    "heathDiscardWholeHand",
    "heathArmory",
    "heathArmoryTake",
    "heathTreasury",
    "heathLostTake",
    "heathCondition",
    "heathWeighedDiscard",
  ].includes(e.kind);
export function witheredHeathEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("heath")) return false;
  const q = s.witheredHeath;
  if (!q) return true;
  const player = e.player ?? firstPlayer(s),
    u = get(s, e.target);
  const finish = (id: string, discard = true) => {
    const i = q.resolving.findIndex((c) => c.id === id);
    if (i < 0) return;
    const physical = q.resolving.splice(i, 1)[0];
    if (discard) s.encounterDiscard.push(physical.code);
    return physical;
  };
  switch (e.kind) {
    case "heathSetup":
      q.cavesDeck = shuffle(s, [
        ...q.cavesDeck,
        ...[aside(s, H.sign), aside(s, H.sign)].filter((u): u is Unit => !!u),
      ]);
      for (const _p of playerOrder(s)) find(s, "location");
      q.initialized = true;
      break;
    case "heathAdvance":
      // Keep the eighteen-damage dragon out of the lethal-damage checkpoint
      // between changing stages and resolving the next quest's front face.
      if (s.stage === 2) {
        const dragon = witheredHeathDragon(s);
        if (dragon) {
          detach(s, dragon);
          if (!q.setAside.some((u) => u.id === dragon.id))
            q.setAside.push(dragon);
        }
      }
      q.completedQuests.push(q.currentQuest);
      q.currentQuest = q.questDeck.shift()!;
      s.stage++;
      s.progress = 0;
      q.advancing = false;
      s.stageRevealing = true;
      prepend(
        s,
        fx("heathStageReveal", { player: firstPlayer(s) }),
        fx("stageRevealed"),
      );
      break;
    case "heathStageReveal":
      if (s.stage === 2) returnDragon(s);
      if (s.stage === 3) {
        q.cavesDeck = shuffle(s, [
          ...q.cavesDeck,
          ...[aside(s, H.sign), aside(s, H.sign)].filter((u): u is Unit => !!u),
        ]);
        const dragon = witheredHeathDragon(s);
        if (dragon) {
          detach(s, dragon);
          if (!q.setAside.some((u) => u.id === dragon.id))
            q.setAside.push(dragon);
        }
        shuffleDiscard(s);
        for (const _p of playerOrder(s)) find(s, "location");
      }
      if (s.stage === 4) {
        const dragon = returnDragon(s);
        if (dragon) prepend(s, ...attacks(s, dragon));
      }
      break;
    case "heathDragonAttack": {
      const dragon = returnDragon(s);
      if (dragon) prepend(s, ...attacks(s, dragon));
      break;
    }
    case "heathHealDragon": {
      const dragon = q.setAside.find((u) => u.code === H.drake);
      if (dragon) dragon.damage = Math.max(0, dragon.damage - 3);
      break;
    }
    case "heathDeep":
      if (
        u &&
        s.activeLocation?.id === u.id &&
        q.cavesDeck.length &&
        !stageLive(s, 2)
      ) {
        discardLocation(s, u);
        const next = q.cavesDeck.shift()!;
        if (next.code === H.sign) guardSign(s, next);
        else {
          s.activeLocation = next;
          witheredHeathTravelEntered(s, next, false);
        }
      }
      break;
    case "heathDenResponse":
      if (u && q.cavesDeck.some((c) => c.code === H.sign))
        choose(s, "Creature Den · Search the Caves deck for Dragon Sign?", [
          {
            id: "use",
            label: "Attach Dragon Sign to Creature Den as a guarded objective",
            effects: [fx("heathDenUse", { target: u.id })],
          },
          { id: "skip", label: "Continue without searching", effects: [] },
        ]);
      break;
    case "heathDenUse":
      if (u) {
        const i = q.cavesDeck.findIndex((c) => c.code === H.sign);
        if (i >= 0) guardSign(s, q.cavesDeck.splice(i, 1)[0], u);
        q.cavesDeck = shuffle(s, q.cavesDeck);
      }
      break;
    case "heathFindEnemies":
      if (e.flag) shuffleDiscard(s);
      for (let i = 0; i < (e.value ?? 1); i++) find(s, "enemy");
      break;
    case "heathPeek":
      q.peeked = s.encounterDeck.splice(0, 3);
      if (q.peeked.length)
        choose(
          s,
          "Searching for Dragon Sign · Reveal one of the top 3 cards",
          q.peeked.map((code, i) => ({
            id: String(i),
            code,
            label: `Reveal ${card(code).name}; discard the rest`,
            effects: [
              fx("heathPeekReveal", { value: i, player: firstPlayer(s) }),
            ],
          })),
        );
      break;
    case "heathPeekReveal": {
      const top = q.peeked.splice(0),
        chosen = top.splice(e.value ?? 0, 1)[0];
      s.encounterDiscard.push(...top);
      if (chosen)
        prepend(s, fx("revealCard", { code: chosen, player: firstPlayer(s) }));
      break;
    }
    case "heathGrotto": {
      let code: string | undefined;
      while (s.encounterDeck.length) {
        const c = s.encounterDeck.shift()!;
        s.encounterDiscard.push(c);
        if (card(c).type_code === "treachery") {
          code = c;
          break;
        }
      }
      if (code)
        prepend(
          s,
          fx("resolvePrintedWhenRevealed", { code, player: firstPlayer(s) }),
        );
      break;
    }
    case "heathAssignDamage": {
      const n = e.value ?? 0;
      if (n <= 0) break;
      const targets = (e.flag ? allCharacters(s) : own(s, player)).filter(
        (u) => u.damage < stats(s, u).health,
      );
      if (targets.length)
        choose(
          s,
          `Assign ${n} damage ${e.flag ? "among characters in play" : "among your characters"}`,
          targets.map((u) => ({
            id: u.id,
            code: u.code,
            label: `Deal 1 damage to ${name(u)}`,
            effects: [
              fx("damage", { target: u.id, value: 1, player: ownerOf(s, u) }),
              fx("heathAssignDamage", { player, flag: e.flag, value: n - 1 }),
            ],
          })),
        );
      break;
    }
    case "heathLocationResponse":
      if (u && !q.usedResponses.includes(e.code!))
        choose(s, `${name(u)} · Use the response?`, [
          {
            id: "use",
            label:
              e.code === H.armory
                ? "Each player may search for a Weapon or Armor"
                : "Each player may choose a benefit",
            effects: [
              fx("heathLocationUse", { code: e.code, player: firstPlayer(s) }),
            ],
          },
          {
            id: "skip",
            label: "Save the response for another visit",
            effects: [],
          },
        ]);
      break;
    case "heathLocationUse":
      if (!q.usedResponses.includes(e.code!)) {
        q.usedResponses.push(e.code!);
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx(e.code === H.armory ? "heathArmory" : "heathTreasury", {
              player,
            }),
          ),
        );
      }
      break;
    case "heathArmory": {
      const deck = seatView(s, player).deck;
      choose(s, "Lost Armory · Search for a Weapon or Armor attachment", [
        ...deck.flatMap((code, i) =>
          card(code).type_code === "attachment" &&
          (trait(code, "Weapon") || trait(code, "Armor"))
            ? [
                {
                  id: `deck:${i}`,
                  code,
                  label: card(code).name,
                  effects: [fx("heathArmoryTake", { player, code, value: i })],
                },
              ]
            : [],
        ),
        {
          id: "skip",
          label: "Finish searching and shuffle your deck",
          effects: [fx("heathArmoryTake", { player, value: -1 })],
        },
      ]);
      break;
    }
    case "heathArmoryTake":
      forOwner(s, player, () => {
        if ((e.value ?? -1) >= 0 && s.deck[e.value!] === e.code)
          s.hand.push(takePlayerDeck(s, e.value!));
        s.deck = shuffle(s, s.deck);
      });
      break;
    case "heathTreasury":
      choose(s, "Ancient Treasury · Choose a benefit", [
        {
          id: "threat",
          label: "Reduce your threat by 3",
          effects: [fx("threat", { player, value: -3 })],
        },
        {
          id: "draw",
          label: "Draw 2 cards",
          effects: [fx("draw", { player, value: 2 })],
        },
        ...allHeroes(s).map((h) => ({
          id: h.id,
          code: h.code,
          label: `Add 1 resource to ${name(h)}`,
          effects: [
            fx("resource", { target: h.id, player: ownerOf(s, h), value: 1 }),
          ],
        })),
        { id: "skip", label: "Decline the benefit", effects: [] },
      ]);
      break;
    case "heathTreachery": {
      if (e.code === H.snow) {
        q.playerReadyBlockedRound = s.round;
        prepend(s, fx("heathExhaust", { player: firstPlayer(s), flag: true }));
      }
      if (e.code === H.cold)
        prepend(
          s,
          ...playerOrder(s).flatMap((player) =>
            own(s, player)
              .filter((u) => !u.exhausted)
              .map((u) => fx("heathColdCharacter", { target: u.id, player })),
          ),
        );
      if (e.code === H.supplies)
        prepend(
          s,
          ...playerOrder(s).map((player) => fx("heathSupplies", { player })),
        );
      if (e.code === H.lost) {
        const players = playerOrder(s).filter(
          (p) => !seatView(s, p).hand.some((u) => u.code === H.lost),
        );
        const max = Math.max(
          -1,
          ...players.map((p) => seatView(s, p).hand.length),
        );
        const targets = players.filter(
          (p) => seatView(s, p).hand.length === max,
        );
        if (targets.length)
          choose(
            s,
            "Lost in the Wild · Player with the most cards",
            targets.map((p) => ({
              id: String(p),
              label: `Player ${p + 1} · ${max} cards`,
              effects: [fx("heathLostTake", { source: e.source, player: p })],
            })),
          );
        else finish(e.source!);
      }
      if (e.code === H.weighed) {
        const heroes = allHeroes(s).filter(
            (u) => !u.attachments.some((a) => a.code === H.weighed),
          ),
          max = Math.max(-1, ...heroes.map((u) => u.attachments.length));
        const targets = heroes.filter((u) => u.attachments.length === max);
        if (targets.length)
          choose(
            s,
            "Weighed Down · Hero with the most attachments",
            targets.map((u) => ({
              id: u.id,
              code: u.code,
              label: name(u),
              effects: [
                fx("heathCondition", {
                  target: u.id,
                  source: e.source,
                  player: ownerOf(s, u),
                }),
                fx("exhaust", { target: u.id, player: ownerOf(s, u) }),
              ],
            })),
          );
        else finish(e.source!);
      }
      break;
    }
    case "heathExhaust": {
      const targets = (e.flag ? allCharacters(s) : own(s, player)).filter(
        canExhaust,
      );
      if (targets.length)
        choose(
          s,
          "Heavy Snow · Exhaust a character",
          targets.map((u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: [fx("exhaust", { target: u.id, player: ownerOf(s, u) })],
          })),
        );
      break;
    }
    case "heathColdCharacter":
      if (u && !u.exhausted && own(s, player).some((c) => c.id === u.id))
        choose(s, `Deadly Cold · ${name(u)}`, [
          ...(canExhaust(u)
            ? [
                {
                  id: "exhaust",
                  label: `Exhaust ${name(u)}`,
                  effects: [fx("exhaust", { target: u.id, player })],
                },
              ]
            : []),
          {
            id: "damage",
            label: `Deal 1 damage to ${name(u)}`,
            effects: [fx("damage", { target: u.id, player, value: 1 })],
          },
        ]);
      break;
    case "heathSupplies": {
      const allies = seatView(s, player).allies;
      choose(s, "Ruined Supplies · Choose one", [
        {
          id: "threat",
          label: `Raise your threat by ${allies.length}`,
          effects: [fx("threat", { player, value: allies.length })],
        },
        {
          id: "damage",
          label: "Deal 1 damage to each ally you control",
          effects: allies.map((u) =>
            fx("damage", { target: u.id, value: 1, player }),
          ),
        },
      ]);
      break;
    }
    case "heathLostTake": {
      const physical = finish(e.source!, false);
      if (physical) forOwner(s, player, () => s.hand.push(physical));
      break;
    }
    case "heathCondition": {
      const physical = finish(e.source!, !u);
      if (u && physical)
        u.attachments.push({
          id: physical.id,
          code: physical.code,
          exhausted: false,
        });
      break;
    }
    case "heathDiscardWholeHand":
      forOwner(s, player, () => {
        for (const u of [...s.hand]) {
          if (u.code === H.lost) {
            s.hand = s.hand.filter((x) => x.id !== u.id);
            s.encounterDiscard.push(u.code);
          } else discardHandCard(s, u.id);
        }
      });
      break;
    case "heathWeighedDiscard":
      if (u) {
        const other = u.attachments.filter(
          (a) =>
            a.code !== H.weighed &&
            !card(a.code).type_code.startsWith("objective"),
        );
        const options = other.length
          ? u.attachments.filter((a) => a.code !== H.weighed)
          : u.attachments;
        if (options.length)
          choose(
            s,
            "Weighed Down · Discard an attachment from this hero",
            options.map((a) => ({
              id: a.id,
              code: a.code,
              label: card(a.code).name,
              effects: [
                fx("heathDiscardAttachment", {
                  target: u.id,
                  source: a.id,
                  player,
                }),
              ],
            })),
          );
      }
      break;
    case "heathDiscardAttachment": {
      const a = u?.attachments.find((a) => a.id === e.source);
      if (u && a) discardAttachment(s, u, a, true);
      break;
    }
    default:
      return false;
  }
  return true;
}

export const WITHERED_HEATH_HOOKS: Batch4ScenarioHooks = {
  setup: setupWitheredHeath,
  openingHandsKept: witheredHeathOpeningHandsKept,
  check: witheredHeathCheck,
  advance: witheredHeathAdvance,
  stageInfo: witheredHeathStageInfo,
  stats: witheredHeathStats,
  threatBonus: witheredHeathThreatBonus,
  locationQuestBonus: witheredHeathLocationQuestBonus,
  immune: witheredHeathImmune,
  cannotLeave: witheredHeathCannotLeave,
  cannotEngage: witheredHeathCannotEngage,
  consideredEngaged: witheredHeathConsideredEngaged,
  cannotAttach: witheredHeathCannotAttach,
  damageAmount: witheredHeathDamageAmount,
  damageDealt: witheredHeathDamageDealt,
  attackFinished: witheredHeathAttackFinished,
  hostLeaves: witheredHeathHostLeaves,
  explored: witheredHeathExplored,
  cannotReady: witheredHeathCannotReady,
  cannotPlayerReady: witheredHeathCannotPlayerReady,
  locationProgressBlocked: witheredHeathLocationProgressBlocked,
  cannotCancel: witheredHeathCannotCancel,
  travelProblem: witheredHeathTravelProblem,
  travelEffects: witheredHeathTravelEffects,
  travelEntered: witheredHeathTravelEntered,
  questBegin: witheredHeathBeginQuest,
  roundEnd: witheredHeathRoundEnd,
  committed: witheredHeathCommitted,
  allyEntered: witheredHeathAllyEntered,
  playerCardPlayed: witheredHeathPlayerCardPlayed,
  cannotDiscardHand: witheredHeathCannotDiscardHand,
  handDiscardDestination: witheredHeathHandDiscardDestination,
  characterReadied: witheredHeathCharacterReadied,
  shadowResolved: witheredHeathShadowResolved,
  beginShadows: witheredHeathBeginShadows,
  finishShadows: witheredHeathFinishShadows,
  shadow: witheredHeathShadow,
  encounter: witheredHeathEncounter,
  effect: witheredHeathEffect,
  sharedEffect: witheredHeathSharedEffect,
};
