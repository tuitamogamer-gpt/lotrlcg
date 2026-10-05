// Original/easy Foundations of Stone, including independent stage-four areas.
import type { Effect, GameState, Unit } from "./types";
import {
  FOUNDATIONS_STONE as F,
  FOUNDATIONS_STAGE_FOUR,
  foundationsArea,
  foundationsCurrentQuest,
  foundationsRecipe,
  foundationsSelectArea,
  foundationsState,
  foundationsSyncArea,
  isFoundationsStone,
  type FoundationsStoneArea,
  type FoundationsStoneState,
} from "./foundations-stone-support";
export * from "./foundations-stone-support";
import { card, name } from "./cards";
import {
  choose,
  enqueue,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  putPlayerDeck,
  questWill,
  requireRule,
  shuffle,
  skip,
  stagingThreat,
  stats,
  takePlayerDeck,
  units,
} from "./core";
import {
  advanceQuest,
  characterLeftPlay,
  discardAttachment,
  discardCharacter,
  discardHandCard,
  discardPlayerDeck,
  exhaustCharacter,
  questDefeated,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allEngaged,
  globalCharacters,
  globalPlayerOrder,
  hasKeyword,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
  selectSeat,
  startPhase,
} from "./table";
import { effectiveTraits, hasTrait } from "./expansion-passives";
import { KHAZAD, khazadCannotExhaust, khazadBeforeStaging } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { isSacked } from "./carrock";
import { rohanRevealReduction } from "./rohan-player-cards";
import { emynPlayerRevealReduction } from "./emyn-player-cards";

const state = (s: GameState): FoundationsStoneState =>
  (s.foundationsStone ??= {
    setAside: [],
    removedEncounter: [],
    areas: [],
    split: false,
    resolvedAreas: [],
    travelPassedAreas: [],
    lostHeroes: [],
    removedQuests: [],
  });
const first = (s: GameState) => playerOrder(s)[0] ?? activeSeat(s);
const orderedAreas = (s: GameState) => {
  foundationsSyncArea(s);
  const areas = state(s).areas;
  return [
    ...new Set(globalPlayerOrder(s).map((p) => foundationsArea(s, p))),
  ].filter((a): a is FoundationsStoneArea => !!a && areas.includes(a));
};
const readyForCost = (u: Unit) =>
  !u.exhausted &&
  !isSacked(u) &&
  !khazadCannotExhaust(u) &&
  !watcherWaterCannotExhaust(u);
const nameless = (u: Unit) => hasTrait(u, "Nameless");
const objectives = (s: GameState) =>
  s.staging.filter(
    (u) => [F.axe, F.helm].includes(u.code as typeof F.axe) && !u.guarding,
  );

export function setupFoundationsStone(s: GameState) {
  const recipe = foundationsRecipe(!!s.easyMode),
    d = state(s);
  d.setAside = [...recipe.setAside];
  s.encounterDeck = shuffle(s, [...recipe.initial]);
  prepend(
    s,
    fx("khazadAttachSetup", {
      code: KHAZAD.torch,
      player: s.table?.first ?? 0,
    }),
    ...globalPlayerOrder(s).map((player) => fx("reveal", { player })),
  );
}

export function advanceFoundationsStone(s: GameState): boolean {
  if (!isFoundationsStone(s)) return false;
  if (s.stage === 4 && !s.stageRevealing && s.status === "playing") {
    const area = foundationsArea(s),
      q = foundationsCurrentQuest(s);
    if (area && q && s.progress >= (card(q).quest ?? 0)) area.completed = true;
    foundationsSyncArea(s);
    return true;
  }
  if (
    s.status !== "playing" ||
    s.phase === "setup" ||
    s.stageRevealing ||
    s.choice ||
    s.queue.length
  )
    return true;
  if (s.stage === 1 && s.progress >= 9) {
    if (questDefeated(s, F.walls)) return true;
    s.stage = 2;
    s.progress = 0;
    log(
      s,
      "The Water's Edge · After committing, each player discards the top two cards of their deck.",
      "chapter",
    );
  } else if (s.stage === 2 && s.progress >= 12) {
    if (questDefeated(s, F.edge)) return true;
    s.stage = 3;
    s.progress = 0;
    s.stageRevealing = true;
    prepend(s, fx("foundationsWashedAway", { player: s.table?.first ?? 0 }));
    log(
      s,
      "Washed Away! · The flood carries the fellowships below the mines.",
      "chapter",
    );
  } else if (s.stage === 5 && s.progress >= 11) win(s);
  return true;
}

export function foundationsCharactersCommitted(
  s: GameState,
  committed: Unit[],
) {
  if (isFoundationsStone(s) && s.stage === 2 && committed.length)
    prepend(s, fx("foundationsWaterDiscard", { player: activeSeat(s) }));
}
export function foundationsCommitProblem(s: GameState): string | null {
  if (!isFoundationsStone(s) || s.stage !== 5) return null;
  const selected = [...s.heroes, ...s.allies].filter((u) =>
    s.committedIds.includes(u.id),
  );
  return selected.filter((u) => card(u.code).type_code === "ally").length >
    selected.filter((u) => card(u.code).type_code === "hero").length
    ? "Out of the Depths: commit no more allies than heroes from your own fellowship."
    : null;
}

/** The final global commit begins one staging step per surviving common area. */
export function foundationsBeginStaging(s: GameState): boolean {
  if (!isFoundationsStone(s) || !state(s).split) return false;
  state(s).resolvedAreas = [];
  const areas = orderedAreas(s);
  for (const area of areas) {
    const player = globalPlayerOrder(s).find((p) => area.players.includes(p))!;
    enqueue(s, fx("foundationsAreaStaging", { text: area.id, player }));
  }
  enqueue(
    s,
    fx("questReady", {
      player:
        areas[0]?.players.find((p) => globalPlayerOrder(s).includes(p)) ?? 0,
    }),
  );
  return true;
}
export function foundationsResolveQuest(s: GameState): boolean {
  if (!isFoundationsStone(s) || !state(s).split) return false;
  const area = foundationsArea(s);
  requireRule(
    area && !state(s).resolvedAreas.includes(area.id),
    "This area has already resolved its quest.",
  );
  requireRule(
    activeSeat(s) === first(s),
    "The first player in this staging area resolves its quest.",
  );
  const will = questWill(s),
    threat = stagingThreat(s),
    net = will - threat;
  s.lastQuest = { will, threat, net };
  log(
    s,
    `${card(area.questCode).back_name ?? card(area.questCode).name} · ${will} willpower − ${threat} threat = ${net}.`,
    net < 0 ? "danger" : "good",
  );
  if (net > 0)
    enqueue(s, fx("questSucceeded", { value: net, player: first(s) }));
  else if (net < 0)
    enqueue(s, fx("failedQuest", { value: -net, player: first(s) }));
  enqueue(
    s,
    fx("foundationsAreaQuestDone", { text: area.id, player: first(s) }),
  );
  return true;
}
export function foundationsTravelNext(s: GameState): boolean {
  if (!isFoundationsStone(s) || !state(s).split) return false;
  const area = foundationsArea(s);
  requireRule(
    area && activeSeat(s) === first(s),
    "The first player in this staging area makes its travel decision.",
  );
  if (!state(s).travelPassedAreas.includes(area.id))
    state(s).travelPassedAreas.push(area.id);
  const next = orderedAreas(s).find(
    (a) => !state(s).travelPassedAreas.includes(a.id),
  );
  if (next) {
    const p = globalPlayerOrder(s).find((p) => next.players.includes(p))!;
    selectSeat(s, p);
    if (s.table) s.table.turn = p;
  } else
    enqueue(
      s,
      fx("phaseEnd", { player: s.table?.first ?? 0 }),
      fx("startEncounter", { player: s.table?.first ?? 0 }),
    );
  return true;
}

function removeEncounter(s: GameState, u: Unit) {
  for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
  s.encounterDiscard.push(...u.shadows);
  u.shadows = [];
  s.staging = s.staging.filter((x) => x.id !== u.id);
  if (s.activeLocation?.id === u.id) s.activeLocation = null;
  s.extraActiveLocations = (s.extraActiveLocations ?? []).filter(
    (x) => x.id !== u.id,
  );
  if (s.table) {
    for (const p of s.table.seats)
      p.engaged = p.engaged.filter((x) => x.id !== u.id);
    s.engaged = s.engaged.filter((x) => x.id !== u.id);
  } else s.engaged = s.engaged.filter((x) => x.id !== u.id);
  s.encounterDiscard.push(u.code);
}
function emptyArea(
  id: string,
  players: number[],
  questCode: string,
): FoundationsStoneArea {
  return {
    id,
    players,
    questCode,
    progress: 0,
    staging: [],
    activeLocation: null,
    extraActiveLocations: [],
    questDebuff: 0,
    fog: 0,
    threatModifier: 0,
  };
}
function splitPlayers(s: GameState) {
  const d = state(s),
    players = globalPlayerOrder(s),
    quests = shuffle(s, [...FOUNDATIONS_STAGE_FOUR]);
  const remainingPlayerCards = s.staging.filter(
    (u) => card(u.code).sphere_code !== "encounter",
  );
  d.areas = players.map((p, i) =>
    emptyArea(`foundations-area-${p}`, [p], quests[i]),
  );
  d.removedQuests.push(...quests.slice(players.length));
  d.split = true;
  d.activeArea = undefined;
  s.stage = 4;
  s.progress = 0;
  for (const u of remainingPlayerCards) {
    const a = foundationsArea(s, u.owner ?? players[0]);
    if (a) a.staging.push(u);
  }
  foundationsSelectArea(s, activeSeat(s));
  prepend(
    s,
    ...players.map((player) => fx("foundationsStageFourEntry", { player })),
    fx("foundationsStageReady", { player: players[0] }),
  );
}
function enterStageFive(s: GameState) {
  const d = state(s);
  foundationsSyncArea(s);
  const area = d.areas[0];
  if (area) {
    s.staging = area.staging;
    s.activeLocation = area.activeLocation;
    s.extraActiveLocations = area.extraActiveLocations;
  }
  d.split = false;
  d.activeArea = undefined;
  d.removedQuests.push(...d.areas.map((a) => a.questCode));
  d.areas = [];
  d.resolvedAreas = [];
  d.travelPassedAreas = [];
  s.stage = 5;
  s.progress = 0;
  s.questDebuff = 0;
  s.fog = 0;
  s.threatModifier = 0;
  s.stageRevealing = true;
  const p = s.table?.first ?? 0;
  log(
    s,
    "Out of the Depths · The fellowships reunite. Each player may commit no more allies than heroes.",
    "chapter",
  );
  prepend(
    s,
    ...globalPlayerOrder(s).map((player) => fx("reveal", { player })),
    fx("foundationsStageReady", { player: p }),
  );
}
function joiningOrder(s: GameState) {
  return orderedAreas(s)
    .filter((a) => a.completed)
    .map((a) => a.id);
}

/** Lost heroes only re-enter when drawn, preserving their physical deck identity. */
export function foundationsDrawHero(s: GameState, u: Unit): boolean {
  if (!isFoundationsStone(s) || card(u.code).type_code !== "hero") return false;
  const d = state(s),
    index = d.lostHeroes.findIndex(
      (h) => h.player === activeSeat(s) && h.code === u.code,
    );
  if (index < 0) return false;
  d.lostHeroes.splice(index, 1);
  u.owner ??= activeSeat(s);
  s.heroes.push(u);
  log(
    s,
    `${name(u)} is drawn and returns to play, ready and without damage or resources.`,
    "good",
  );
  return true;
}
export function foundationsHeroMissingAllowed(
  s: GameState,
  player: number,
): boolean {
  if (!isFoundationsStone(s)) return false;
  const p = seatView(s, player);
  return (foundationsState(s)?.lostHeroes ?? []).some(
    (h) => h.player === player && !p.discard.includes(h.code),
  );
}
function shuffleHero(s: GameState, hero: Unit) {
  const controller = ownerOf(s, hero),
    physical = hero.owner ?? controller;
  const lastAttack = stats(s, hero).attack,
    lastTraits = effectiveTraits(hero);
  const d = state(s);
  d.lostHeroes.push({ id: hero.id, code: hero.code, player: physical });
  // Leave play before attachments leave; losing a hit-point bonus cannot destroy an absent hero.
  s.heroes = s.heroes.filter((u) => u.id !== hero.id);
  for (const a of [...hero.attachments]) discardAttachment(s, hero, a, true);
  const fresh = { ...make(s, hero.code), id: hero.id, owner: physical };
  const previous = activeSeat(s);
  selectSeat(s, physical);
  putPlayerDeck(s, fresh);
  shuffle(s, s.deck);
  selectSeat(s, previous);
  characterLeftPlay(
    s,
    hero,
    controller,
    { zone: "deck", player: physical },
    lastAttack,
    lastTraits,
  );
  log(
    s,
    `${name(hero)} is lost in the depths and shuffled into its owner's deck.`,
    "danger",
  );
}

function attachTop(s: GameState, enemy: Unit, player: number, count: number) {
  const previous = activeSeat(s);
  selectSeat(s, player);
  for (let i = 0; i < count && s.deck.length; i++) {
    const u = takePlayerDeck(s);
    enemy.attachments.push({
      id: u.id,
      code: u.code,
      owner: u.owner ?? player,
      exhausted: false,
      namelessCard: true,
    });
  }
  selectSeat(s, previous);
}
export function foundationsEngaged(s: GameState, enemy: Unit) {
  if (
    !enemy.blanked &&
    [F.nameless, F.elder].includes(enemy.code as typeof F.nameless)
  )
    prepend(
      s,
      fx("foundationsFeed", {
        target: enemy.id,
        value: enemy.code === F.elder ? 3 : 2,
        player: ownerOf(s, enemy),
      }),
    );
}
export function foundationsEnemyX(
  _s: GameState,
  enemy: Unit,
): number | undefined {
  if (![F.nameless, F.elder].includes(enemy.code as typeof F.nameless))
    return undefined;
  if (enemy.blanked) return 0;
  return enemy.attachments.length
    ? enemy.attachments.reduce(
        (sum, a) =>
          sum +
          (Number.isFinite(Number(card(a.code).cost))
            ? Number(card(a.code).cost)
            : 0),
        0,
      )
    : enemy.code === F.elder
      ? 4
      : 3;
}
export function foundationsCanFight(enemy: Unit, character: Unit): boolean {
  return (
    enemy.code !== F.bats || !!enemy.blanked || hasKeyword(character, "Ranged")
  );
}
export function foundationsStats(s: GameState, u: Unit) {
  const a = u.attachments.filter((a) => !a.blanked && !a.facedown);
  const dwarf = hasTrait(u, "Dwarf");
  return {
    will: a.filter((a) => a.code === F.axe).length * (dwarf ? 1 : 0),
    attack:
      a.filter((a) => a.code === F.axe).length * 3 +
      (u.code === F.bats && !u.blanked && !s.staging.some((e) => e.id === u.id)
        ? seatView(s, ownerOf(s, u)).engaged.filter((e) => e.id !== u.id).length
        : 0),
    defense: a.filter((a) => a.code === F.helm).length,
    health: a.filter((a) => a.code === F.helm).length * (dwarf ? 2 : 0),
  };
}

export function foundationsEncounter(s: GameState, code: string): boolean {
  if (code === F.deep) {
    const ids = [...s.staging, ...allEngaged(s)]
      .filter(nameless)
      .map((u) => u.id);
    if (ids.length)
      prepend(s, fx("foundationsDeepOrder", { ids, player: first(s) }));
    return true;
  }
  if (code === F.lost) {
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("foundationsLostHero", { player })),
    );
    return true;
  }
  return false;
}
export function foundationsShadow(
  s: GameState,
  enemy: Unit,
  code: string,
): boolean {
  if (![F.deep, F.lost].includes(code as typeof F.deep)) return false;
  if (nameless(enemy))
    prepend(
      s,
      fx("foundationsDiscardHand", {
        player: s.combat?.attackPlayer ?? ownerOf(s, enemy),
      }),
    );
  return true;
}
export function foundationsLocationExplored(s: GameState, u: Unit) {
  if (u.code === F.treasury && !u.blanked)
    prepend(
      s,
      fx("foundationsTreasuryExplored", { ids: playerOrder(s).map(String) }),
    );
}
export function foundationsObjectiveFree(
  s: GameState,
  u: Unit,
): boolean | undefined {
  if (![F.axe, F.helm].includes(u.code as typeof F.axe)) return undefined;
  return s.staging.some((o) => o.id === u.id) && !u.guarding;
}
function claimObjective(
  s: GameState,
  objective: Unit,
  hero: Unit,
  free = false,
) {
  requireRule(
    foundationsObjectiveFree(s, objective) &&
      s.heroes.some((h) => h.id === hero.id),
    "Choose this free objective and a hero you control.",
  );
  if (!free)
    requireRule(
      exhaustCharacter(s, hero),
      "Exhaust a ready hero to claim this objective.",
    );
  s.staging = s.staging.filter((u) => u.id !== objective.id);
  hero.attachments.push({
    id: objective.id,
    code: objective.code,
    owner: objective.owner ?? activeSeat(s),
    exhausted: false,
  });
  log(s, `${name(hero)} claims ${name(objective)}.`, "good");
}
export function foundationsClaim(
  s: GameState,
  objective: Unit,
  hero: Unit,
): boolean {
  if (![F.axe, F.helm].includes(objective.code as typeof F.axe)) return false;
  claimObjective(s, objective, hero);
  return true;
}
export const foundationsAbilityLabel = (code: string) =>
  code === F.mithril
    ? "Exhaust a character · place its willpower on the quest"
    : undefined;
export function foundationsAbilityProblem(
  s: GameState,
  u: Unit,
): string | undefined {
  if (u.code !== F.mithril) return undefined;
  if (s.phase !== "refresh") return "Mithril Lode is a Refresh Action.";
  if (u.blanked || !allActiveLocations(s).some((l) => l.id === u.id))
    return "Mithril Lode must be the active location with its text active.";
  if (
    globalPlayerOrder(s).some((p) =>
      seatView(s, p).used.includes(
        `round:foundations-mithril:${u.id}:${s.round}`,
      ),
    )
  )
    return "This Mithril Lode has been used this round.";
  if (
    ![...s.heroes, ...s.allies].some(
      (c) => readyForCost(c) && stats(s, c).will > 0,
    )
  )
    return "Exhaust a character you control with positive willpower.";
  return undefined;
}
export function useFoundationsAbility(s: GameState, u: Unit): boolean {
  if (u.code !== F.mithril) return false;
  const problem = foundationsAbilityProblem(s, u);
  requireRule(!problem, problem ?? "");
  choose(
    s,
    "Mithril Lode · Exhaust a character",
    opts(
      [...s.heroes, ...s.allies].filter(
        (c) => readyForCost(c) && stats(s, c).will > 0,
      ),
      (c) => [fx("foundationsMithrilProgress", { source: u.id, target: c.id })],
    ),
  );
  return true;
}

/** An eliminated area's encounter cards are discarded; surviving groups remain isolated. */
export function foundationsCheck(s: GameState) {
  if (!isFoundationsStone(s) || !state(s).split || s.status !== "playing")
    return;
  foundationsSyncArea(s);
  const alive = globalPlayerOrder(s),
    d = state(s);
  for (const a of [...d.areas]) {
    const surviving = a.players.filter((p) => alive.includes(p));
    if (!surviving.length) {
      const previous = activeSeat(s);
      selectSeat(s, a.players[0]);
      for (const u of [
        ...a.staging,
        ...(a.activeLocation ? [a.activeLocation] : []),
        ...a.extraActiveLocations,
      ])
        removeEncounter(s, u);
      d.removedQuests.push(a.questCode);
      d.areas = d.areas.filter((other) => other.id !== a.id);
      d.resolvedAreas = d.resolvedAreas.filter((id) => id !== a.id);
      d.travelPassedAreas = d.travelPassedAreas.filter((id) => id !== a.id);
      selectSeat(s, alive.includes(previous) ? previous : alive[0]);
    } else a.players = surviving;
  }
}

export function handleFoundationsStoneEffect(s: GameState, e: Effect): boolean {
  if (e.kind === "finishQuestPhase" && isFoundationsStone(s)) {
    const players = state(s).split ? globalPlayerOrder(s) : playerOrder(s);
    const effects: Effect[] = [];
    const seen = new Set<string>();
    for (const player of players) {
      const view = seatView(s, player);
      for (const l of allActiveLocations(view).filter(
        (l) => l.code === F.treasury && !l.blanked,
      )) {
        const key = `${l.id}:${player}`;
        if (!seen.has(key))
          effects.push(
            fx("foundationsTreasuryDiscard", { source: l.id, player }),
          );
        seen.add(key);
      }
    }
    prepend(
      s,
      ...effects,
      fx("foundationsFinishQuest", { player: s.table?.first ?? 0 }),
    );
    return true;
  }
  if (e.kind === "startTravel" && isFoundationsStone(s) && state(s).split) {
    state(s).resolvedAreas = [];
    state(s).travelPassedAreas = [];
    prepend(
      s,
      fx("foundationsJoinOrder", {
        ids: joiningOrder(s),
        player: s.table?.first ?? 0,
      }),
    );
    return true;
  }
  switch (e.kind) {
    case "foundationsTreasuryExplored": {
      // Quest overflow is already placed when this deferred Response window runs.
      // FAQ: next-stage When Revealed effects precede the explored location's Response.
      const remaining = s.queue.splice(0);
      advanceQuest(s);
      const advancement = s.queue.splice(0);
      s.queue.push(
        ...advancement,
        ...(s.pendingQuestDefeat
          ? [e]
          : (e.ids ?? []).map((id) =>
              fx("foundationsTreasuryReward", { player: Number(id) }),
            )),
        ...remaining,
      );
      return true;
    }
    case "foundationsWaterDiscard":
      discardPlayerDeck(s, 2);
      return true;
    case "foundationsWashedAway": {
      const d = state(s);
      for (const u of [...units(s)])
        for (const a of [...u.attachments]) {
          const traits = (card(a.code).traits ?? "")
            .split(".")
            .map((t) => t.trim());
          if (
            card(a.code).sphere_code === "encounter" ||
            traits.some((t) => ["Item", "Armor", "Weapon", "Light"].includes(t))
          )
            discardAttachment(s, u, a, true);
        }
      for (const u of [...units(s)]) {
        const c = card(u.code),
          traits = (c.traits ?? "").split(".").map((t) => t.trim());
        if (c.sphere_code === "encounter") removeEncounter(s, u);
        else if (
          traits.some((t) =>
            ["Item", "Armor", "Weapon", "Light"].includes(t),
          ) &&
          ["hero", "ally"].includes(c.type_code)
        )
          discardCharacter(s, u);
      }
      const returning = s.encounterDiscard.filter((code) =>
        ["enemy", "treachery"].includes(card(code).type_code),
      );
      d.removedEncounter.push(
        ...s.encounterDeck,
        ...s.encounterDiscard.filter(
          (code) => !["enemy", "treachery"].includes(card(code).type_code),
        ),
      );
      s.encounterDiscard = [];
      s.encounterDeck = shuffle(s, [...returning, ...d.setAside]);
      d.setAside = [];
      d.removedQuests.push(F.washed);
      splitPlayers(s);
      return true;
    }
    case "foundationsStageFourEntry": {
      const q = foundationsArea(s)!.questCode;
      if (q === F.caves) for (const h of s.heroes) h.resources = 0;
      if (q === F.bank) for (const u of [...s.hand]) discardHandCard(s, u.id);
      const count =
        q === F.lair
          ? 4
          : [F.rocks, F.bank].includes(q as typeof F.rocks)
            ? 2
            : 0;
      prepend(
        s,
        ...Array.from({ length: count }, () =>
          fx("reveal", { player: activeSeat(s) }),
        ),
      );
      log(
        s,
        `Below the Mines · ${card(q).back_name}. ${seatName(s, activeSeat(s))} has a separate staging area.`,
        "chapter",
      );
      return true;
    }
    case "foundationsStageReady":
      s.stageRevealing = false;
      return true;
    case "foundationsAreaStaging": {
      khazadBeforeStaging(s);
      const count = rohanRevealReduction(
        s,
        emynPlayerRevealReduction(s, playerOrder(s).length),
      );
      prepend(
        s,
        ...Array.from({ length: count }, () =>
          fx("reveal", { player: first(s) }),
        ),
        fx("khazadStagingEnd", { player: first(s) }),
      );
      return true;
    }
    case "foundationsAreaQuestDone": {
      const d = state(s);
      foundationsSyncArea(s);
      if (!d.resolvedAreas.includes(e.text!)) d.resolvedAreas.push(e.text!);
      const next = orderedAreas(s).find((a) => !d.resolvedAreas.includes(a.id));
      if (next) {
        const p = globalPlayerOrder(s).find((p) => next.players.includes(p))!;
        selectSeat(s, p);
        if (s.table) s.table.turn = p;
      } else
        prepend(s, fx("finishQuestPhase", { player: s.table?.first ?? 0 }));
      return true;
    }
    case "foundationsFinishQuest":
      globalCharacters(s).forEach((u) => (u.committed = false));
      prepend(
        s,
        fx("phaseEnd", { player: s.table?.first ?? 0 }),
        fx("startTravel", { player: s.table?.first ?? 0 }),
      );
      return true;
    case "foundationsJoinOrder": {
      const ids = (e.ids ?? []).filter((id) =>
        state(s).areas.some((a) => a.id === id),
      );
      if (!ids.length) {
        state(s).travelPassedAreas = [];
        startPhase(s, "travel");
        return true;
      }
      const source = state(s).areas.find((a) => a.id === ids[0])!;
      const p = globalPlayerOrder(s).find((p) => source.players.includes(p))!;
      selectSeat(s, p);
      const other = orderedAreas(s).filter((a) => a.id !== source.id);
      if (!other.length) {
        enterStageFive(s);
        enqueue(
          s,
          fx("foundationsTravelReady", { player: s.table?.first ?? 0 }),
        );
      } else
        choose(
          s,
          "Below the Mines · Join another staging area",
          other.map((a) => ({
            id: a.id,
            code: a.questCode,
            label: `${card(a.questCode).back_name} · ${a.players.map((p) => seatName(s, p)).join("; ")}`,
            effects: [
              fx("foundationsJoin", {
                source: source.id,
                target: a.id,
                ids: ids.slice(1),
                player: p,
              }),
            ],
          })),
          "Carry your staging cards to the chosen area. Keep engaged enemies; discard your former active location.",
        );
      return true;
    }
    case "foundationsJoin": {
      foundationsSyncArea(s);
      const d = state(s),
        from = d.areas.find((a) => a.id === e.source),
        to = d.areas.find((a) => a.id === e.target);
      requireRule(
        from && to && from.id !== to.id && from.completed,
        "Join a different existing staging area after completing your quest.",
      );
      for (const l of [...allActiveLocations(s)]) removeEncounter(s, l);
      foundationsSyncArea(s);
      to.staging.push(...from.staging);
      to.players.push(...from.players);
      d.removedQuests.push(from.questCode);
      d.areas = d.areas.filter((a) => a.id !== from.id);
      foundationsSelectArea(s, activeSeat(s));
      log(
        s,
        `The fellowships join at ${card(to.questCode).back_name}.`,
        "chapter",
      );
      prepend(
        s,
        fx("foundationsJoinOrder", { ids: e.ids, player: s.table?.first ?? 0 }),
      );
      return true;
    }
    case "foundationsTravelReady":
      startPhase(s, "travel");
      return true;
    case "foundationsFeed": {
      const enemy = get(s, e.target);
      if (enemy && !enemy.blanked)
        attachTop(s, enemy, e.player ?? activeSeat(s), e.value ?? 0);
      return true;
    }
    case "foundationsDeepOrder": {
      const ids = (e.ids ?? []).filter((id) => {
        const u = get(s, id);
        return u && nameless(u);
      });
      if (!ids.length || !s.deck.length) return true;
      if (ids.length === 1) attachTop(s, get(s, ids[0])!, activeSeat(s), 1);
      else
        choose(
          s,
          "Deep Deep Dark · Choose the next Nameless enemy",
          opts(
            ids.map((id) => get(s, id)!),
            (enemy) => [
              fx("foundationsFeed", {
                target: enemy.id,
                value: 1,
                player: activeSeat(s),
              }),
              fx("foundationsDeepOrder", {
                ids: ids.filter((id) => id !== enemy.id),
                player: activeSeat(s),
              }),
            ],
          ),
          "The first player chooses the order. Attach one actual top card to each enemy, if able.",
        );
      return true;
    }
    case "foundationsDiscardHand":
      for (const u of [...s.hand]) discardHandCard(s, u.id);
      return true;
    case "foundationsLostHero":
      if (s.heroes.length)
        choose(
          s,
          "Lost and Alone · Shuffle a hero into your deck",
          opts(s.heroes, (hero) => [
            fx("foundationsShuffleHero", { target: hero.id }),
          ]),
        );
      return true;
    case "foundationsShuffleHero": {
      const hero = s.heroes.find((u) => u.id === e.target);
      requireRule(hero, "Choose a hero you control to shuffle into your deck.");
      shuffleHero(s, hero);
      return true;
    }
    case "foundationsTreasuryDiscard":
      if (s.heroes.length || s.allies.length)
        choose(
          s,
          "Drowned Treasury · Discard a character",
          opts([...s.heroes, ...s.allies], (u) => [
            fx("foundationsDiscardCharacter", { target: u.id }),
          ]),
        );
      return true;
    case "foundationsDiscardCharacter": {
      const u = [...s.heroes, ...s.allies].find((u) => u.id === e.target);
      requireRule(u, "Choose a character you control to discard.");
      discardCharacter(s, u);
      return true;
    }
    case "foundationsTreasuryReward":
      choose(s, "Drowned Treasury · Explored", [
        {
          id: "draw",
          label: "Draw 2 cards",
          effects: [fx("draw", { value: 2 })],
        },
        ...(objectives(s).length && s.heroes.length
          ? [
              {
                id: "claim",
                label: "Claim one free objective",
                effects: [fx("foundationsTreasuryObjective")],
              },
            ]
          : []),
        skip,
      ]);
      return true;
    case "foundationsTreasuryObjective":
      choose(
        s,
        "Drowned Treasury · Choose an objective",
        opts(objectives(s), (o) => [
          fx("foundationsTreasuryHero", { target: o.id }),
        ]),
      );
      return true;
    case "foundationsTreasuryHero":
      choose(
        s,
        "Drowned Treasury · Attach the objective to a hero",
        opts(s.heroes, (h) => [
          fx("foundationsTreasuryClaim", { target: e.target, source: h.id }),
        ]),
      );
      return true;
    case "foundationsTreasuryClaim": {
      const objective = objectives(s).find((u) => u.id === e.target),
        hero = s.heroes.find((u) => u.id === e.source);
      requireRule(
        objective && hero,
        "The objective and your hero must remain available.",
      );
      claimObjective(s, objective, hero, true);
      return true;
    }
    case "foundationsMithrilProgress": {
      const l = get(s, e.source),
        c = [...s.heroes, ...s.allies].find((u) => u.id === e.target);
      requireRule(
        l && !foundationsAbilityProblem(s, l) && c && readyForCost(c),
        "Mithril Lode and your ready character must remain legal.",
      );
      const will = stats(s, c).will;
      requireRule(
        exhaustCharacter(s, c),
        "This character must exhaust to place its willpower as progress.",
      );
      s.used.push(`round:foundations-mithril:${l.id}:${s.round}`);
      s.progress += will;
      log(
        s,
        `Mithril Lode places ${will} progress directly on the quest, bypassing the active location.`,
        "good",
      );
      advanceQuest(s);
      return true;
    }
    default:
      return false;
  }
}
