import type { Attachment, Effect, GameState, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  choose,
  cannotReady,
  encounterDraw,
  fx,
  get,
  make,
  prepend,
  random,
  shuffle,
  stats,
  takePlayerDeck,
} from "./core";
import {
  discardHandCard,
  discardPlayerDeck,
  enemyAddedToStaging,
  engage,
  exhaustCharacter,
  placeEncounter,
  questDefeated,
  win,
} from "./board";
import {
  activeSeat,
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
import {
  ROAM_RHOVANION as R,
  ROAM_RHOVANION_RECIPES,
  roamRhovanionStageInfo,
} from "./roam-rhovanion-support";
export * from "./roam-rhovanion-support";

type RoamCombat = NonNullable<GameState["combat"]> & {
  roamWargs?: boolean;
  roamWeather?: boolean;
  roamDestroyedCharacter?: boolean;
};
const own = (s: GameState, p: number) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === p);
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const stageLive = (s: GameState, code: string) =>
  s.roamRhovanion?.currentQuest === code && !mainQuestUnit(s)?.blanked;
const trait = (u: Unit | string, t: string) =>
  (card(typeof u === "string" ? u : u.code).traits ?? "")
    .split(".")
    .some((v) => v.trim() === t);
const guarded = (s: GameState, id: string) =>
  !!s.roamRhovanion?.guarded.some((g) => g.guardId === id) ||
  !!s.roamRhovanion?.guardedPlayerCards.some((g) => g.guardId === id);
const objective = (s: GameState, code: string) =>
  allCharacters(s).find((u) => u.code === code);
const held = (u: Unit, code: string) =>
  u.attachments.some((a) => a.code === code && !a.blanked && !a.facedown);
const phase = (s: GameState) =>
  ["staging", "quest"].includes(s.phase)
    ? "quest"
    : ["defense", "attack"].includes(s.phase)
      ? "combat"
      : s.phase;
const maxCharacters = (s: GameState) =>
  Math.max(0, ...playerOrder(s).map((p) => own(s, p).length));
const decline = { id: "skip", label: "Decline response", effects: [] };
function add(s: GameState, u: Unit) {
  s.staging.push(u);
  if (card(u.code).type_code === "enemy") enemyAddedToStaging(s, u);
  roamRhovanionCardEntered(s, u);
}
function takeAside(s: GameState, code: string) {
  const q = s.roamRhovanion!,
    i = q.setAside.findIndex((u) => u.code === code);
  return i < 0 ? undefined : q.setAside.splice(i, 1)[0];
}
function attach(u: Unit, a: Unit) {
  u.attachments.push({
    id: a.id,
    code: a.code,
    exhausted: a.exhausted,
    ...(a.owner === undefined ? {} : { owner: a.owner }),
    ...(a.blanked ? { blanked: true } : {}),
  });
}
function control(s: GameState, u: Unit, p = firstPlayer(s)) {
  for (const n of playerOrder(s))
    forOwner(s, n, () => {
      s.allies = s.allies.filter((c) => c.id !== u.id);
      s.committedIds = s.committedIds.filter((id) => id !== u.id);
    });
  s.staging = s.staging.filter((c) => c.id !== u.id);
  u.owner = p;
  u.controller = p;
  forOwner(s, p, () => s.allies.push(u));
}
function shuffleDiscard(s: GameState) {
  s.encounterDeck = shuffle(s, [
    ...s.encounterDeck,
    ...s.encounterDiscard.splice(0),
  ]);
}
function discardUntil(s: GameState, predicate: (code: string) => boolean) {
  while (s.encounterDeck.length) {
    const c = s.encounterDeck.shift()!;
    s.encounterDiscard.push(c);
    if (predicate(c)) return c;
  }
  return undefined;
}
function search(s: GameState, code: string) {
  for (const pile of [
    s.encounterDeck,
    s.encounterDiscard,
    s.victoryCards ?? [],
  ]) {
    const i = pile.indexOf(code);
    if (i >= 0) {
      pile.splice(i, 1);
      return make(s, code);
    }
  }
  return undefined;
}
function consume(s: GameState, code: string, discard = true) {
  const q = s.roamRhovanion!,
    i = q.resolving.indexOf(code);
  if (i < 0) return false;
  q.resolving.splice(i, 1);
  if (discard) s.encounterDiscard.push(code);
  return true;
}
function discardWholeHand(s: GameState, p: number) {
  forOwner(s, p, () => {
    for (const u of [...s.hand]) {
      if (u.code === R.lost) {
        s.hand = s.hand.filter((v) => v.id !== u.id);
        s.encounterDiscard.push(u.code);
      } else discardHandCard(s, u.id, { encounterEffect: true });
    }
  });
}
function free(s: GameState, u: Unit) {
  if ([R.urdug, R.tiny].includes(u.code)) control(s, u);
  else if (u.code === R.horn) {
    const urdug =
      objective(s, R.urdug) ??
      s.roamRhovanion?.guarded.find((g) => g.card.code === R.urdug)?.card;
    if (urdug) attach(urdug, u);
    else s.staging.push(u);
  } else if (u.code === R.key) {
    s.staging.push(u);
    prepend(
      s,
      fx("roamRhovanionClaimKey", { source: u.id, player: firstPlayer(s) }),
    );
  }
}
function returnEnemy(s: GameState, u: Unit) {
  for (const p of playerOrder(s))
    forOwner(s, p, () => (s.engaged = s.engaged.filter((v) => v.id !== u.id)));
  if (!s.staging.some((v) => v.id === u.id)) {
    s.staging.push(u);
    enemyAddedToStaging(s, u);
  }
}

export function setupRoamRhovanion(s: GameState) {
  const recipe = ROAM_RHOVANION_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const pile = (section: string) =>
    recipe.cards
      .filter((c) => c.section === section)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, pile("sharedEncounterDeck"));
  s.roamRhovanion = {
    initialized: false,
    advancing: false,
    currentQuest: R.task,
    questDeck: [...shuffle(s, [R.rescue, R.hornQuest, R.keyQuest]), R.gambit],
    completedQuests: [],
    setAside: pile("sharedSetAside").map((c) => make(s, c)),
    guarded: [],
    removed: [],
    storedCards: [],
    guardedPlayerCards: [],
    resolving: [],
    locationProgress: [],
    threatModifiers: [],
    attackModifiers: [],
    keyPeek: [],
    wildEngaged: [],
  };
}
export function roamRhovanionOpeningHandsKept(s: GameState) {
  if (!s.roamRhovanion || s.roamRhovanion.initialized) return false;
  prepend(
    s,
    fx("roamRhovanionSetup", { player: firstPlayer(s) }),
    fx("nextRound"),
  );
  return true;
}
export function roamRhovanionCheck(s: GameState) {
  const q = s.roamRhovanion;
  if (!q || s.status !== "playing") return;
  if (q.initialized && s.stage !== 3)
    for (const code of [R.urdug, R.tiny]) {
      const u = objective(s, code);
      if (u && ownerOf(s, u) !== firstPlayer(s)) control(s, u);
    }
  if (stageLive(s, R.gambit)) {
    const urdug = enemies(s).find((u) => u.code === R.urdugEnemy);
    if (urdug && urdug.damage >= stats(s, urdug).health) {
      win(s);
      s.reason = "Urdug's treachery is defeated and Durin's Key is recovered.";
    }
  }
}
export function roamRhovanionAdvance(s: GameState) {
  const q = s.roamRhovanion;
  if (!q) return false;
  if (
    !q.initialized ||
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.stage !== 2 ||
    s.progress < 5
  )
    return true;
  const urdug = objective(s, R.urdug),
    tiny = objective(s, R.tiny),
    p = firstPlayer(s);
  if (!urdug || ownerOf(s, urdug) !== p) return true;
  if (q.currentQuest === R.rescue && (!tiny || ownerOf(s, tiny) !== p))
    return true;
  if (q.currentQuest === R.hornQuest && !held(urdug, R.horn)) return true;
  if (
    q.currentQuest === R.keyQuest &&
    !allHeroes(s).some((u) => ownerOf(s, u) === p && held(u, R.key))
  )
    return true;
  if (questDefeated(s, q.currentQuest)) return true;
  q.advancing = true;
  prepend(s, fx("roamRhovanionAdvance", { player: p }));
  return true;
}
export function roamRhovanionStats(s: GameState, u: Unit) {
  const q = s.roamRhovanion;
  if (!q) return {};
  let attack = q.attackModifiers
      .filter(
        (m) => m.id === u.id && m.round === s.round && m.phase === phase(s),
      )
      .reduce((n, m) => n + m.amount, 0),
    defense = 0;
  if (!u.blanked && u.code === R.hobgoblin) {
    const g = q.guardedPlayerCards.find((g) => g.guardId === u.id),
      cost = g ? Number(card(g.card.code).cost) || 0 : 0;
    attack += cost;
    defense += cost;
  }
  if (
    stageLive(s, R.hornQuest) &&
    card(u.code).type_code === "enemy" &&
    guarded(s, u.id)
  )
    defense += 2;
  return { attack, defense };
}
export function roamRhovanionThreatBonus(s: GameState, u: Unit) {
  const q = s.roamRhovanion;
  if (!q) return 0;
  let n = q.threatModifiers
    .filter((m) => m.id === u.id && m.round === s.round && m.phase === phase(s))
    .reduce((n, m) => n + m.amount, 0);
  if (!u.blanked && u.code === R.hills) n += maxCharacters(s);
  if (!u.blanked && u.code === R.lonely)
    n +=
      2 *
      q.storedCards
        .filter((g) => g.locationId === u.id)
        .reduce((n, g) => n + g.cards.length, 0);
  if (!u.blanked && u.code === R.hobgoblin) {
    const g = q.guardedPlayerCards.find((g) => g.guardId === u.id);
    n += g ? Number(card(g.card.code).cost) || 0 : 0;
  }
  if (
    stageLive(s, R.hornQuest) &&
    card(u.code).type_code === "enemy" &&
    guarded(s, u.id)
  )
    n += 2;
  if (card(u.code).type_code === "location")
    n += q.threatModifiers
      .filter(
        (m) =>
          m.id === undefined &&
          m.round === s.round &&
          m.phase === phase(s) &&
          m.amount < 0,
      )
      .reduce((n, m) => n + m.amount, 0);
  return n;
}
export function roamRhovanionLocationProgressAmount(
  s: GameState,
  u: Unit,
  n: number,
) {
  const q = s.roamRhovanion;
  if (!q || !s.staging.some((v) => v.id === u.id)) return n;
  if (stageLive(s, R.task)) return 0;
  if (s.staging.some((l) => l.code === R.ravine && !l.blanked)) {
    const m = q.locationProgress.find(
        (m) => m.id === u.id && m.round === s.round,
      ),
      placed = Math.min(n, Math.max(0, 1 - (m?.amount ?? 0)));
    if (placed > 0) {
      if (m) m.amount += placed;
      else
        q.locationProgress.push({ id: u.id, round: s.round, amount: placed });
    }
    return placed;
  }
  return n;
}
export function roamRhovanionFailedQuest(s: GameState, n: number) {
  if (!stageLive(s, R.gambit)) return false;
  s.progress += Math.max(0, n);
  if (s.progress >= 5) {
    s.status = "lost";
    s.reason = "Urdug escapes while the fellowship loses the trail.";
    return true;
  }
  roamRhovanionCheck(s);
  return true;
}
export function roamRhovanionCharacterExhausted(s: GameState, u: Unit) {
  if (s.roamRhovanion && u.code === R.tiny && !u.blanked)
    prepend(s, fx("threat", { player: ownerOf(s, u), value: 2 }));
}
export function roamRhovanionImmune(s: GameState, u: Unit) {
  return (
    !!s.roamRhovanion &&
    ([R.urdug, R.tiny, R.urdugEnemy, R.tinyEnemy].includes(u.code) ||
      (stageLive(s, R.keyQuest) && guarded(s, u.id)))
  );
}
export function roamRhovanionCannotLeave(s: GameState, u: Unit) {
  return !!s.roamRhovanion && u.code === R.urdugEnemy && !u.blanked;
}
export function roamRhovanionDamageAmount(
  s: GameState,
  u: Unit,
  n: number,
  _context: DamageContext,
) {
  if (!s.roamRhovanion) return n;
  if (
    u.code === R.urdugEnemy &&
    enemies(s).some((e) => e.code === R.tinyEnemy && !e.blanked)
  )
    return 0;
  if (
    stageLive(s, R.hornQuest) &&
    u.code === R.giant &&
    s.roamRhovanion.guarded.some(
      (g) => g.guardId === u.id && g.card.code === R.horn,
    ) &&
    s.progress < 5
  )
    return 0;
  return n;
}
export function roamRhovanionCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  if (
    s.roamRhovanion &&
    s.combat &&
    context.combatDamage &&
    context.enemyId === s.combat.enemyId &&
    allCharacters(s).some((c) => c.id === u.id)
  )
    (s.combat as RoamCombat).roamDestroyedCharacter = true;
  if (s.roamRhovanion && [R.urdug, R.tiny].includes(u.code)) {
    s.status = "lost";
    s.reason = `${name(u)} is destroyed.`;
  }
}
export function roamRhovanionHostLeaves(s: GameState, u: Unit) {
  const q = s.roamRhovanion;
  if (!q) return;
  const freed = q.guarded.filter((g) => g.guardId === u.id);
  q.guarded = q.guarded.filter((g) => g.guardId !== u.id);
  for (const g of freed) free(s, g.card);
  const cards = q.guardedPlayerCards.filter((g) => g.guardId === u.id);
  q.guardedPlayerCards = q.guardedPlayerCards.filter((g) => g.guardId !== u.id);
  for (const g of cards) forOwner(s, g.player, () => s.hand.push(g.card));
  // Facedown events remain physical until their host leaves, then enter their owners' discards.
  const stored = q.storedCards.filter((g) => g.locationId === u.id);
  q.storedCards = q.storedCards.filter((g) => g.locationId !== u.id);
  for (const g of stored)
    forOwner(s, g.player, () => s.discard.push(...g.cards.map((c) => c.code)));
}
export function roamRhovanionExplored(
  s: GameState,
  u: Unit,
  wasActive: boolean,
) {
  roamRhovanionHostLeaves(s, u);
  if (
    wasActive &&
    stageLive(s, R.task) &&
    objective(s, R.urdug) &&
    ownerOf(s, objective(s, R.urdug)!) === firstPlayer(s) &&
    !s.roamRhovanion!.advancing
  ) {
    s.roamRhovanion!.advancing = true;
    prepend(s, fx("roamRhovanionAdvance", { player: firstPlayer(s) }));
  } else roamRhovanionAdvance(s);
}
export function roamRhovanionAttachmentLeaves(
  s: GameState,
  _u: Unit,
  a: Attachment,
) {
  if (!s.roamRhovanion || ![R.key, R.horn].includes(a.code)) return false;
  const physical = make(s, a.code);
  physical.id = a.id;
  physical.exhausted = a.exhausted;
  free(s, physical);
  return true;
}
export function roamRhovanionEngaged(s: GameState, u: Unit) {
  if (!s.roamRhovanion) return;
  const p = ownerOf(s, u);
  if (u.code === R.giant && !u.blanked)
    prepend(s, fx("roamRhovanionGiant", { player: p }));
  if (u.code === R.urdugEnemy) {
    const tiny = enemies(s).find((v) => v.code === R.tinyEnemy && !v.blanked);
    if (tiny)
      prepend(s, fx("roamRhovanionEngageTiny", { target: tiny.id, player: p }));
  }
}
export function roamRhovanionEncounterBegin(s: GameState) {
  for (const u of s.staging.filter((e) => e.code === R.eagle && !e.blanked))
    prepend(
      s,
      fx("roamRhovanionEagle", { target: u.id, player: firstPlayer(s) }),
    );
}
export function roamRhovanionQuestBegin(s: GameState): Effect[] {
  if (!s.roamRhovanion) return [];
  const effects: Effect[] = [];
  for (const u of allHeroes(s))
    for (const a of u.attachments.filter((a) => a.code === R.key && !a.blanked))
      effects.push(
        fx("roamRhovanionKeyPeek", { source: a.id, player: ownerOf(s, u) }),
      );
  for (const u of allEngaged(s).filter(
    (u) => u.code === R.urdugEnemy && !u.blanked,
  ))
    effects.push(
      fx("roamRhovanionUrdugAttack", { target: u.id, player: ownerOf(s, u) }),
    );
  return effects;
}
export function roamRhovanionEnemyAttackStarted(
  s: GameState,
  u: Unit,
  _p: number,
) {
  if (!s.roamRhovanion) return;
  if (u.code === R.urdugEnemy && !u.blanked && held(u, R.horn))
    hornAttack(s, u);
}
function hornAttack(s: GameState, u: Unit) {
  const c = encounterDraw(s);
  if (c) {
    s.encounterDiscard.push(c);
    s.roamRhovanion!.attackModifiers.push({
      id: u.id,
      round: s.round,
      phase: phase(s),
      amount: c === R.hills ? maxCharacters(s) : (card(c).threat ?? 0),
    });
  }
}
export function roamRhovanionPlayerAttackDeclared(
  s: GameState,
  _enemy: Unit,
  ids: string[],
) {
  for (const id of ids) {
    const u = get(s, id);
    if (u && u.code === R.urdug && !u.blanked && held(u, R.horn))
      hornAttack(s, u);
  }
  return true;
}
export function roamRhovanionShadowResolved(
  s: GameState,
  u: Unit,
  code: string,
) {
  if (
    s.roamRhovanion &&
    s.combat &&
    u.code === R.wargs &&
    !u.blanked &&
    !card(code).shadow
  )
    (s.combat as RoamCombat).roamWargs = true;
}
export function roamRhovanionAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
  skipped = false,
): Effect[] {
  if (!s.roamRhovanion) return [];
  const urdugQuestAttack = s.roamRhovanion.urdugQuestAttack === combat.enemyId;
  if (urdugQuestAttack) delete s.roamRhovanion.urdugQuestAttack;
  if (skipped) return [];
  const c = combat as RoamCombat,
    u = get(s, c.enemyId),
    p = c.attackPlayer ?? activeSeat(s),
    effects: Effect[] = [];
  if (u && c.roamWargs && u.code === R.wargs && !u.blanked)
    effects.push(
      fx("immediateAttack", {
        target: u.id,
        player: p,
        text: "desert-no-shadow",
      }),
    );
  if (
    c.roamWeather &&
    (c.damageDealt ?? 0) > 0 &&
    (c.roamDestroyedCharacter || (c.defenderId && !get(s, c.defenderId)))
  )
    effects.push(fx("roamRhovanionExhaustCharacter", { player: p }));
  if (urdugQuestAttack && (c.damageDealt ?? 0) > 0)
    effects.push(fx("roamRhovanionReturnPair"));
  return effects;
}
export function roamRhovanionDamageDealt(
  s: GameState,
  u: Unit,
  _amount: number,
  context: DamageContext,
) {
  if (!s.roamRhovanion || !context.combatDamage || !context.enemyId) return;
  const enemy = get(s, context.enemyId);
  if (
    enemy?.code === R.troll &&
    !enemy.blanked &&
    u.damage > stats(s, u).health
  )
    prepend(
      s,
      fx("roamRhovanionDiscardHand", {
        player: ownerOf(s, u),
        value: u.damage - stats(s, u).health,
      }),
    );
}
export function roamRhovanionTravelProblem(s: GameState, u: Unit) {
  const q = s.roamRhovanion;
  if (!q || s.progress >= 5) return null;
  if (
    stageLive(s, R.rescue) &&
    q.guarded.some((g) => g.guardId === u.id && g.card.code === R.tiny)
  )
    return "Place 5 progress on Rescue Tiny before travelling to Tiny's Grey Moorland.";
  if (
    stageLive(s, R.keyQuest) &&
    q.guarded.some((g) => g.guardId === u.id && g.card.code === R.key)
  )
    return "Place 5 progress on Find Durin's Key before travelling to its Deep Ravine.";
  return null;
}
export function roamRhovanionTravelEffects(
  s: GameState,
  u: Unit,
): Effect[] | undefined {
  return s.roamRhovanion && u.code === R.ravine && !u.blanked
    ? [fx("roamRhovanionRavine", { player: firstPlayer(s) })]
    : undefined;
}
export function roamRhovanionTravelEntered(
  s: GameState,
  u: Unit,
  actual = true,
) {
  if (!s.roamRhovanion || u.blanked) return;
  if (u.code === R.moor)
    prepend(s, fx("roamRhovanionMoor", { player: firstPlayer(s) }));
  if (actual && u.code === R.slopes)
    prepend(s, fx("roamRhovanionSlopes", { player: firstPlayer(s) }));
}
export function roamRhovanionCardEntered(
  s: GameState,
  u: Unit,
  fromReveal = false,
  cancelled = false,
) {
  if (!s.roamRhovanion || u.blanked) return;
  if (u.code === R.hobgoblin)
    prepend(
      s,
      fx("roamRhovanionHobgoblin", { target: u.id, player: firstPlayer(s) }),
    );
  if (u.code === R.bear && fromReveal && !cancelled)
    prepend(
      s,
      fx("roamRhovanionBear", { target: u.id, player: firstPlayer(s) }),
    );
}
const treacheries = [
  R.sneaking,
  R.weather,
  R.creatures,
  R.supplies,
  R.lost,
  R.weighed,
];
export function roamRhovanionEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!s.roamRhovanion || !treacheries.includes(code)) return false;
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(code);
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.indexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.roamRhovanion.resolving.push(code);
  prepend(s, fx("roamRhovanionTreachery", { code, player: firstPlayer(s) }));
  return true;
}
export function roamRhovanionShadow(s: GameState, code: string) {
  const c = s.combat as RoamCombat | null;
  if (!s.roamRhovanion || !c) return false;
  const p = c.attackPlayer ?? activeSeat(s),
    u = get(s, c.enemyId);
  if (code === R.eagle) c.attackBonus += u && trait(u, "Creature") ? 2 : 1;
  else if (code === R.slopes) {
    const urdug = objective(s, R.urdug);
    if (urdug && ownerOf(s, urdug) === firstPlayer(s))
      prepend(s, fx("exhaust", { target: urdug.id, player: firstPlayer(s) }));
  } else if (code === R.weather) {
    c.attackBonus++;
    c.roamWeather = true;
  } else if ([R.moor, R.wargs].includes(code)) c.returnToStaging = true;
  else if (code === R.supplies)
    prepend(
      s,
      fx("threat", { player: p, value: seatView(s, p).engaged.length }),
    );
  else if (code === R.troll)
    prepend(s, fx("roamRhovanionDiscardAttachment", { player: p }));
  else return false;
  return true;
}
export function roamRhovanionEventPlayed(s: GameState, u: Unit) {
  if (
    s.roamRhovanion &&
    ["quest", "staging"].includes(s.phase) &&
    s.staging.some((v) => v.code === R.lonely && !v.blanked)
  )
    prepend(
      s,
      fx("roamRhovanionCaptureEvent", { source: u.id, player: activeSeat(s) }),
    );
}
export function roamRhovanionPlayerCardPlayed(s: GameState, _u: Unit) {
  const p = activeSeat(s);
  if (s.roamRhovanion && seatView(s, p).hand.some((u) => u.code === R.lost))
    prepend(s, fx("roamRhovanionDiscardWholeHand", { player: p }));
}
export function roamRhovanionCharacterReadied(s: GameState, u: Unit) {
  if (s.roamRhovanion && held(u, R.weighed))
    prepend(
      s,
      fx("roamRhovanionWeighedDiscard", {
        target: u.id,
        player: ownerOf(s, u),
      }),
    );
}
export const roamRhovanionAbilityLabel = (code: string) =>
  code === R.key
    ? "Exhaust Durin's Key to reduce location threat"
    : code === R.hills
      ? "Exhaust a character to reduce threat"
      : undefined;
export function roamRhovanionAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  if (attachmentId) {
    const a = u.attachments.find((a) => a.id === attachmentId);
    if (a?.code !== R.key) return null;
    return activeSeat(s) !== (a.controller ?? ownerOf(s, u))
      ? "Only Durin's Key's controller can trigger this ability."
      : a.blanked
        ? "Durin's Key's text is blank."
        : a.exhausted
          ? "Durin's Key is exhausted."
          : null;
  }
  return u.code === R.hills
    ? u.blanked
      ? "This location's text is blank."
      : s.phase !== "quest"
        ? "Use this Quest Action during the quest phase."
        : activeSeat(s) !== firstPlayer(s)
          ? "Only the first player can trigger this ability."
          : !own(s, firstPlayer(s)).some((u) => !u.exhausted)
            ? "Exhaust a ready character to pay this cost."
            : null
    : null;
}
export function roamRhovanionAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  if (!s.roamRhovanion) return false;
  if (roamRhovanionAbilityProblem(s, u, attachmentId)) return false;
  if (attachmentId) {
    const a = u.attachments.find(
      (a) => a.id === attachmentId && a.code === R.key && !a.blanked,
    );
    if (!a || a.exhausted) return false;
    a.exhausted = true;
    s.roamRhovanion.threatModifiers.push({
      round: s.round,
      phase: phase(s),
      amount: -1,
    });
    return true;
  }
  if (u.code !== R.hills) return false;
  prepend(s, fx("roamRhovanionHills", { target: u.id, player: activeSeat(s) }));
  return true;
}

export function roamRhovanionEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("roamRhovanion")) return false;
  const q = s.roamRhovanion;
  if (!q) return true;
  const p = e.player ?? firstPlayer(s),
    u = get(s, e.target),
    source = get(s, e.source);
  switch (e.kind) {
    case "roamRhovanionSetup": {
      const urdug = takeAside(s, R.urdug);
      if (urdug) control(s, urdug, p);
      for (let n = 0; n < playerOrder(s).length; n++) {
        const c = discardUntil(s, (c) => card(c).type_code === "location");
        if (c) {
          s.encounterDiscard.pop();
          add(s, make(s, c));
        }
      }
      q.initialized = true;
      break;
    }
    case "roamRhovanionAdvance": {
      q.completedQuests.push(q.currentQuest);
      q.currentQuest = q.questDeck.shift()!;
      s.stage = q.currentQuest === R.gambit ? 3 : 2;
      s.progress = 0;
      q.advancing = false;
      s.stageRevealing = true;
      prepend(
        s,
        fx("roamRhovanionStageReveal", { player: firstPlayer(s) }),
        fx("stageRevealed"),
      );
      break;
    }
    case "roamRhovanionStageReveal": {
      if (s.stage === 2) {
        const spec =
            q.currentQuest === R.rescue
              ? [R.moor, R.tiny]
              : q.currentQuest === R.hornQuest
                ? [R.giant, R.horn]
                : [R.ravine, R.key],
          host = search(s, spec[0]),
          obj = host ? takeAside(s, spec[1]) : undefined;
        if (host) {
          add(s, host);
          if (obj) q.guarded.push({ card: obj, guardId: host.id });
        }
        s.encounterDeck = shuffle(s, s.encounterDeck);
      } else if (s.stage === 3)
        for (const [front, back] of [
          [R.urdug, R.urdugEnemy],
          [R.tiny, R.tinyEnemy],
        ]) {
          const ally = objective(s, front);
          if (ally) {
            for (const n of playerOrder(s))
              forOwner(s, n, () => {
                s.allies = s.allies.filter((v) => v.id !== ally.id);
                s.committedIds = s.committedIds.filter((id) => id !== ally.id);
              });
            ally.code = back;
            ally.damage = 0;
            ally.committed = false;
            ally.exhausted = false;
            delete ally.controller;
            delete ally.owner;
            add(s, ally);
          }
        }
      prepend(
        s,
        ...playerOrder(s)
          .filter((n) => n !== firstPlayer(s))
          .map((player) => fx("reveal", { player })),
      );
      break;
    }
    case "roamRhovanionClaimKey": {
      const key = s.staging.find((v) => v.id === e.source);
      if (!key) break;
      choose(
        s,
        "Durin's Key · Attach to a hero you control",
        seatView(s, p).heroes.map((h) => ({
          id: h.id,
          label: name(h),
          code: h.code,
          effects: [
            fx("roamRhovanionClaimKeyTake", {
              source: key.id,
              target: h.id,
              player: p,
            }),
          ],
        })),
      );
      break;
    }
    case "roamRhovanionClaimKeyTake": {
      const key = s.staging.find((v) => v.id === e.source);
      if (key && u) {
        s.staging = s.staging.filter((v) => v.id !== key.id);
        attach(u, key);
      }
      break;
    }
    case "roamRhovanionKeyPeek": {
      if (q.keyPeek.length) break;
      q.keyPlayer = p;
      // A look is not a reveal. Only the controller's decision shows these faces.
      q.keyPeek = s.encounterDeck.splice(0, 3);
      if (!q.keyPeek.length) {
        delete q.keyPlayer;
        break;
      }
      choose(
        s,
        "Durin's Key · Choose 1 of the top 3 encounter cards to reveal",
        q.keyPeek.map((code, i) => ({
          id: `key-${i}`,
          label: card(code).name,
          code,
          effects: [fx("roamRhovanionKeyReveal", { count: i, player: p })],
        })),
      );
      break;
    }
    case "roamRhovanionKeyReveal": {
      const peek = q.keyPeek.splice(0),
        code = peek.splice(e.count ?? 0, 1)[0];
      delete q.keyPlayer;
      s.encounterDiscard.push(...peek);
      if (code) placeEncounter(s, code, false, p, undefined, true);
      break;
    }
    case "roamRhovanionUrdugAttack":
      if (u) {
        q.urdugQuestAttack = u.id;
        prepend(s, fx("immediateAttack", { target: u.id, player: p }));
      }
      break;
    case "roamRhovanionReturnPair":
      for (const enemy of enemies(s).filter((v) =>
        [R.urdugEnemy, R.tinyEnemy].includes(v.code),
      ))
        returnEnemy(s, enemy);
      break;
    case "roamRhovanionEngageTiny":
    case "roamRhovanionEagle":
      if (u) forOwner(s, p, () => engage(s, u));
      break;
    case "roamRhovanionGiant": {
      const n = discardPlayerDeck(s, 5, p).filter(
        (code) => card(code).type_code === "ally",
      ).length;
      if (n)
        prepend(s, fx("roamRhovanionAssignDamage", { player: p, value: n }));
      break;
    }
    case "roamRhovanionAssignDamage": {
      const n = e.value ?? 0;
      if (n <= 0) break;
      choose(
        s,
        "Grey Mountain Giant · Assign 1 damage among your characters",
        own(s, p).map((c) => ({
          id: c.id,
          label: name(c),
          code: c.code,
          effects: [
            fx("damage", { target: c.id, value: 1, player: p }),
            fx("roamRhovanionAssignDamage", { player: p, value: n - 1 }),
          ],
        })),
      );
      break;
    }
    case "roamRhovanionMoor": {
      shuffleDiscard(s);
      const code = discardUntil(s, (c) => card(c).type_code === "treachery");
      if (code) roamRhovanionEncounter(s, code, true, true);
      break;
    }
    case "roamRhovanionSlopes":
      choose(s, "Slopes of Ered Mithrin · Ready a character", [
        ...own(s, p)
          .filter((c) => c.exhausted && !cannotReady(c, s))
          .map((c) => ({
            id: c.id,
            label: name(c),
            code: c.code,
            effects: [fx("ready", { target: c.id, player: p })],
          })),
        decline,
      ]);
      break;
    case "roamRhovanionRavine": {
      const urdug = objective(s, R.urdug);
      choose(s, "Deep Ravine · Pay the travel cost", [
        ...(urdug && ownerOf(s, urdug) === p && !urdug.exhausted
          ? [
              {
                id: "urdug",
                label: "Exhaust Urdug",
                effects: [fx("exhaust", { target: urdug.id, player: p })],
              },
            ]
          : []),
        {
          id: "threat",
          label: "Raise each player's threat by 2",
          effects: playerOrder(s).map((player) =>
            fx("threat", { player, value: 2 }),
          ),
        },
      ]);
      break;
    }
    case "roamRhovanionHobgoblin":
      if (u)
        forOwner(s, p, () => {
          if (s.deck.length) {
            const physical = takePlayerDeck(s);
            physical.owner = p;
            q.guardedPlayerCards.push({
              guardId: u.id,
              player: p,
              card: physical,
            });
          }
        });
      break;
    case "roamRhovanionBear":
      if (u)
        choose(s, "Wilderland Bear · Choose one", [
          {
            id: "attack",
            label: "The Bear immediately attacks the first player",
            effects: [fx("immediateAttack", { target: u.id, player: p })],
          },
          {
            id: "discard",
            label: "Each player discards 1 random card",
            effects: playerOrder(s).map((player) =>
              fx("roamRhovanionRandomDiscard", { player }),
            ),
          },
        ]);
      break;
    case "roamRhovanionRandomDiscard":
      forOwner(s, p, () => {
        const a = s.hand;
        if (a.length) {
          const c = a[Math.floor(random(s) * a.length)];
          discardHandCard(s, c.id, { encounterEffect: true });
        }
      });
      break;
    case "roamRhovanionTreachery": {
      const code = e.code!;
      if (code === R.sneaking) {
        consume(s, code, false);
        q.removed.push(make(s, code));
        const urdug = objective(s, R.urdug),
          lands = s.staging.filter(
            (v) => card(v.code).type_code === "location",
          );
        if (urdug && ownerOf(s, urdug) === firstPlayer(s) && lands.length)
          choose(
            s,
            "Sneaking Off · Attach Urdug to a location",
            lands.map((l) => ({
              id: l.id,
              label: name(l),
              code: l.code,
              effects: [
                fx("roamRhovanionSneakAttach", {
                  source: urdug.id,
                  target: l.id,
                  player: p,
                }),
              ],
            })),
          );
        else
          q.threatModifiers.push({
            round: s.round,
            phase: phase(s),
            amount: 5,
          });
      } else if (code === R.weather) {
        consume(s, code);
        prepend(
          s,
          ...playerOrder(s).flatMap((player) =>
            own(s, player)
              .filter((c) => !c.exhausted)
              .map((c) =>
                fx("roamRhovanionWeatherCharacter", { target: c.id, player }),
              ),
          ),
        );
      } else if (code === R.creatures) {
        consume(s, code);
        q.wildEngaged = [];
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("roamRhovanionWildEngage", { player }),
          ),
          fx("roamRhovanionWildFinish"),
        );
      } else if (code === R.supplies) {
        consume(s, code);
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("roamRhovanionSupplies", { player }),
          ),
        );
      } else if (code === R.lost) {
        const ps = playerOrder(s).filter(
            (p) => !seatView(s, p).hand.some((c) => c.code === R.lost),
          ),
          most = Math.max(-1, ...ps.map((p) => seatView(s, p).hand.length)),
          eligible = ps.filter((p) => seatView(s, p).hand.length === most);
        if (eligible.length)
          choose(
            s,
            "Lost in the Wild · Choose a player with the most cards",
            eligible.map((player) => ({
              id: `p${player}`,
              label: `Player ${player + 1}`,
              effects: [fx("roamRhovanionLostTake", { player, code })],
            })),
          );
        else consume(s, code);
      } else if (code === R.weighed) {
        const hs = allHeroes(s).filter((h) => !held(h, R.weighed)),
          max = Math.max(-1, ...hs.map((h) => h.attachments.length));
        choose(
          s,
          "Weighed Down · Attach to a hero with the most attachments",
          hs
            .filter((h) => h.attachments.length === max)
            .map((h) => ({
              id: h.id,
              label: name(h),
              code: h.code,
              effects: [
                fx("roamRhovanionWeighedAttach", {
                  target: h.id,
                  player: ownerOf(s, h),
                  code,
                }),
              ],
            })),
        );
        if (!hs.length) consume(s, code);
      }
      break;
    }
    case "roamRhovanionSneakAttach":
      if (source && u) {
        for (const n of playerOrder(s))
          forOwner(s, n, () => {
            s.allies = s.allies.filter((v) => v.id !== source.id);
            s.committedIds = s.committedIds.filter((id) => id !== source.id);
          });
        delete source.controller;
        source.committed = false;
        q.guarded.push({ card: source, guardId: u.id });
      }
      break;
    case "roamRhovanionWeatherCharacter":
      if (u && !u.exhausted)
        choose(s, "Harsh Weather · Exhaust this character or raise threat", [
          {
            id: "exhaust",
            label: `Exhaust ${name(u)}`,
            effects: [fx("exhaust", { target: u.id, player: p })],
          },
          {
            id: "threat",
            label: "Raise your threat by 1",
            effects: [fx("threat", { player: p, value: 1 })],
          },
        ]);
      break;
    case "roamRhovanionWildEngage": {
      const list = s.staging.filter((v) => card(v.code).type_code === "enemy");
      if (list.length)
        choose(
          s,
          "Wild Creatures · Choose an enemy to engage",
          list.map((v) => ({
            id: v.id,
            label: name(v),
            code: v.code,
            effects: [
              fx("roamRhovanionWildEngageTake", { target: v.id, player: p }),
            ],
          })),
        );
      break;
    }
    case "roamRhovanionWildEngageTake":
      if (u && s.staging.some((v) => v.id === u.id)) {
        q.wildEngaged.push(p);
        forOwner(s, p, () => engage(s, u));
      }
      break;
    case "roamRhovanionWildFinish":
      if (q.wildEngaged.length < playerOrder(s).length) {
        const c = discardUntil(
          s,
          (c) => card(c).type_code === "enemy" && trait(c, "Creature"),
        );
        if (c) {
          s.encounterDiscard.pop();
          add(s, make(s, c));
        }
      }
      q.wildEngaged = [];
      break;
    case "roamRhovanionSupplies":
      choose(s, "Ruined Supplies · Choose one", [
        {
          id: "threat",
          label: `Raise threat by ${seatView(s, p).allies.length}`,
          effects: [
            fx("threat", { player: p, value: seatView(s, p).allies.length }),
          ],
        },
        {
          id: "damage",
          label: "Deal 1 damage to each ally you control",
          effects: seatView(s, p).allies.map((a) =>
            fx("damage", { target: a.id, value: 1, player: p }),
          ),
        },
      ]);
      break;
    case "roamRhovanionLostTake":
      if (consume(s, R.lost, false))
        forOwner(s, p, () => {
          const c = make(s, R.lost);
          c.owner = p;
          s.hand.push(c);
        });
      break;
    case "roamRhovanionWeighedAttach":
      if (u && consume(s, R.weighed, false)) {
        attach(u, make(s, R.weighed));
        exhaustCharacter(s, u);
      }
      break;
    case "roamRhovanionWeighedDiscard":
      if (u) {
        const nonObjective = u.attachments.filter(
            (a) =>
              a.code !== R.weighed &&
              !card(a.code).type_code.startsWith("objective"),
          ),
          list = nonObjective.length
            ? nonObjective
            : u.attachments.filter((a) => a.code === R.weighed);
        choose(
          s,
          "Weighed Down · Discard an attachment",
          list.map((a) => ({
            id: a.id,
            label: card(a.code).name,
            code: a.code,
            effects: [
              fx("discardAttachment", {
                target: u.id,
                source: a.id,
                player: p,
              }),
            ],
          })),
        );
      }
      break;
    case "roamRhovanionDiscardWholeHand":
      discardWholeHand(s, p);
      break;
    case "roamRhovanionDiscardHand":
      if ((e.value ?? 0) > 0 && seatView(s, p).hand.length)
        choose(
          s,
          "Stone Troll · Discard a card for excess damage",
          seatView(s, p).hand.map((c) => ({
            id: c.id,
            label: name(c),
            code: c.code,
            effects: [
              fx("roamRhovanionDiscardHandTake", {
                target: c.id,
                player: p,
                value: e.value,
              }),
            ],
          })),
        );
      break;
    case "roamRhovanionDiscardHandTake":
      if (u) {
        forOwner(s, p, () =>
          discardHandCard(s, u.id, { encounterEffect: true }),
        );
        prepend(
          s,
          fx("roamRhovanionDiscardHand", {
            player: p,
            value: (e.value ?? 1) - 1,
          }),
        );
      }
      break;
    case "roamRhovanionDiscardAttachment": {
      const list = own(s, p).flatMap((c) =>
        c.attachments
          .filter((a) => (a.controller ?? a.owner ?? ownerOf(s, c)) === p)
          .map((a) => ({
            id: a.id,
            label: `${card(a.code).name} on ${name(c)}`,
            code: a.code,
            effects: [
              fx("discardAttachment", {
                target: c.id,
                source: a.id,
                player: p,
              }),
            ],
          })),
      );
      choose(s, "Stone Troll shadow · Discard an attachment you control", list);
      break;
    }
    case "roamRhovanionExhaustCharacter":
      choose(
        s,
        "Harsh Weather shadow · Exhaust a character",
        own(s, p)
          .filter((c) => !c.exhausted)
          .map((c) => ({
            id: c.id,
            label: name(c),
            code: c.code,
            effects: [fx("exhaust", { target: c.id, player: p })],
          })),
      );
      break;
    case "roamRhovanionHills":
      if (u)
        choose(
          s,
          "Hills of Wilderland · Exhaust a character",
          own(s, p)
            .filter((c) => !c.exhausted)
            .map((c) => ({
              id: c.id,
              label: name(c),
              code: c.code,
              effects: [
                fx("roamRhovanionHillsPay", {
                  target: c.id,
                  source: u.id,
                  player: p,
                }),
              ],
            })),
        );
      break;
    case "roamRhovanionHillsPay":
      if (u && source && exhaustCharacter(s, u))
        q.threatModifiers.push({
          id: source.id,
          round: s.round,
          phase: phase(s),
          amount: -1,
        });
      break;
    case "roamRhovanionCaptureEvent": {
      const event = s.resolvingEvents?.find((v) => v.unit.id === e.source),
        lands = s.staging.filter((l) => l.code === R.lonely && !l.blanked);
      if (event && lands.length)
        choose(
          s,
          "Lonely Lands · Place the event facedown under a location",
          lands.map((l) => ({
            id: l.id,
            label: name(l),
            code: l.code,
            effects: [
              fx("roamRhovanionCaptureEventTake", {
                source: event.unit.id,
                target: l.id,
                player: event.player,
              }),
            ],
          })),
        );
      break;
    }
    case "roamRhovanionCaptureEventTake": {
      const event = s.resolvingEvents?.find((v) => v.unit.id === e.source);
      if (event && u) {
        event.destination = "spent";
        q.storedCards.push({
          locationId: u.id,
          player: event.player,
          cards: [event.unit],
        });
      }
      break;
    }
  }
  return true;
}
export const ROAM_RHOVANION_HOOKS: Batch4ScenarioHooks = {
  setup: setupRoamRhovanion,
  openingHandsKept: roamRhovanionOpeningHandsKept,
  check: roamRhovanionCheck,
  advance: roamRhovanionAdvance,
  stageInfo: roamRhovanionStageInfo,
  stats: roamRhovanionStats,
  threatBonus: roamRhovanionThreatBonus,
  stagingThreat: (s) =>
    s.roamRhovanion?.threatModifiers
      .filter(
        (m) =>
          m.id === undefined &&
          m.amount > 0 &&
          m.round === s.round &&
          m.phase === phase(s),
      )
      .reduce((n, m) => n + m.amount, 0) ?? 0,
  locationQuestBonus: (s, u) =>
    s.roamRhovanion && u.code === R.hills && !u.blanked ? maxCharacters(s) : 0,
  locationProgressAmount: roamRhovanionLocationProgressAmount,
  failedQuest: roamRhovanionFailedQuest,
  characterExhausted: roamRhovanionCharacterExhausted,
  successfulQuestProgressBlocked: (s) => stageLive(s, R.gambit),
  progress: (s, n, u) =>
    stageLive(s, R.task) && u.id === mainQuestUnit(s)?.id ? 0 : n,
  immune: roamRhovanionImmune,
  indestructible: roamRhovanionCannotLeave,
  cannotOptionallyEngage: (s, u) =>
    !!s.roamRhovanion && u.code === R.eagle && !u.blanked,
  cannotAttach: (s, u, code) =>
    !!s.roamRhovanion &&
    !u.blanked &&
    (u.code === R.troll
      ? !code || card(code).sphere_code !== "encounter"
      : u.code === R.giant
        ? !code || !card(code).type_code.startsWith("objective")
        : false),
  cannotCancel: (s, shadow = false, code) =>
    !shadow &&
    stageLive(s, R.rescue) &&
    !!code &&
    card(code).type_code === "treachery",
  damageAmount: roamRhovanionDamageAmount,
  damageDealt: roamRhovanionDamageDealt,
  characterDestroyed: roamRhovanionCharacterDestroyed,
  hostLeaves: roamRhovanionHostLeaves,
  attachmentLeaves: roamRhovanionAttachmentLeaves,
  explored: roamRhovanionExplored,
  engaged: roamRhovanionEngaged,
  questBegin: roamRhovanionQuestBegin,
  encounterBegin: roamRhovanionEncounterBegin,
  enemyAttackStarted: roamRhovanionEnemyAttackStarted,
  playerAttackDeclared: roamRhovanionPlayerAttackDeclared,
  attackFinished: roamRhovanionAttackFinished,
  shadowResolved: roamRhovanionShadowResolved,
  travelProblem: roamRhovanionTravelProblem,
  travelEffects: roamRhovanionTravelEffects,
  travelEntered: roamRhovanionTravelEntered,
  cardEntered: roamRhovanionCardEntered,
  encounter: roamRhovanionEncounter,
  shadow: roamRhovanionShadow,
  effect: roamRhovanionEffect,
  abilityLabel: roamRhovanionAbilityLabel,
  abilityProblem: roamRhovanionAbilityProblem,
  ability: roamRhovanionAbility,
  eventPlayed: roamRhovanionEventPlayed,
  playerCardPlayed: roamRhovanionPlayerCardPlayed,
  characterReadied: roamRhovanionCharacterReadied,
  cannotDiscardHand: (s, u, byPlayer = true) =>
    !!s.roamRhovanion && u.code === R.lost && byPlayer,
  handDiscardDestination: (s, u) => {
    if (!s.roamRhovanion || u.code !== R.lost) return false;
    s.encounterDiscard.push(u.code);
    return true;
  },
};
