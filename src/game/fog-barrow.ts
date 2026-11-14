import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { FliesSpidersArea } from "./flies-spiders-types";
import { card, name } from "./cards";
import {
  choose,
  random,
  enqueue,
  fx,
  get,
  log,
  make,
  prepend,
  questWill,
  requireRule,
  shuffle,
  stagingThreat,
  stats,
  threatOf,
} from "./core";
import {
  characterLeftPlay,
  charactersCommitted,
  destroy,
  discardAttachment,
  enemyAddedToStaging,
  engage,
  progressLocation,
  questDefeated,
  raiseThreat,
  removeFromQuest,
  win,
} from "./board";
import {
  activeSeat,
  firstPlayer,
  forOwner,
  globalCharacters,
  globalEngaged,
  globalPlayerOrder,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
  selectSeat,
} from "./table";
import { isAlly, isHero, unitType } from "./card-types";
import { effectiveTraits, hasTrait } from "./expansion-passives";
import { isEnemy } from "./ships";
import { mainQuestUnit } from "./quest-state";
import { fasSelectArea, fasSyncArea } from "./flies-spiders-support";
import { lotrSagaCheck } from "./lotr-saga";
import {
  FB,
  FB_ARM,
  FB_STAGE_THREE,
  FOG_BARROW_RECIPES,
  fbArea,
  fbAreaUnits,
  fbBarrowArea,
  fbCurrentQuest,
  fbTrapped,
  fogBarrowStageInfo,
} from "./fog-barrow-support";
export * from "./fog-barrow-support";

const TREACHERIES: readonly string[] = [
  FB.song,
  FB.arm,
  FB.chill,
  FB.waiting,
  FB.frozen,
];
type Combat = NonNullable<GameState["combat"]>;
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked;
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const isWight = (u: Unit) => isEnemy(u) && hasTrait(u, "Wight");
const isWightCard = (code: string) =>
  card(code).type_code === "enemy" &&
  (card(code).traits ?? "").split(".").some((t) => t.trim() === "Wight");
const isLocation = (u: Unit) => card(u.code).type_code === "location";
const inStaging = (s: GameState, u: Unit) =>
  s.staging.some((x) => x.id === u.id);
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const verb = (s: GameState, base: string) => (s.table ? `${base}s` : base);
/** Trapped Inside a Barrow (4B) is defeated with 9 progress. */
const BARROW_QUEST = 9;
/** Lost in the Fog (3B) is defeated with 16 progress. */
const LOST_QUEST = 16;

function emptyArea(
  id: string,
  players: number[],
  questCode: string,
): FliesSpidersArea {
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
const firstOf = (s: GameState, area: FliesSpidersArea) =>
  globalPlayerOrder(s).find((p) => area.players.includes(p)) ?? area.players[0];
/** Staging areas with a living player, in first-player order. */
const orderedAreas = (s: GameState) =>
  (s.fogBarrow?.areas ?? [])
    .filter((a) => globalPlayerOrder(s).some((p) => a.players.includes(p)))
    .sort(
      (a, b) =>
        globalPlayerOrder(s).indexOf(firstOf(s, a)) -
        globalPlayerOrder(s).indexOf(firstOf(s, b)),
    );
const projected = (s: GameState, area: FliesSpidersArea) =>
  s.fogBarrow?.activeArea === area.id && area.players.includes(activeSeat(s));
/** An area's staging area, projected when it is the active area. */
const areaStaging = (s: GameState, area: FliesSpidersArea) =>
  projected(s, area) ? s.staging : area.staging;
const areaProgress = (s: GameState, area: FliesSpidersArea) =>
  projected(s, area) ? s.progress : area.progress;
const stageThreeArea = (s: GameState) =>
  s.fogBarrow?.areas.find((a) => a.id === FB_STAGE_THREE);
/** The staging area of the stage a player is at. */
function playerStaging(s: GameState, p: number): Unit[] {
  const q = s.fogBarrow;
  if (!q?.split) return s.staging;
  const area = fbArea(s, p);
  return area ? areaStaging(s, area) : [];
}
/** The living players at the same stage as a player. */
function stagePlayers(s: GameState, p: number): number[] {
  const q = s.fogBarrow;
  if (!q?.split) return globalPlayerOrder(s);
  const area = fbArea(s, p);
  return globalPlayerOrder(s).filter((x) => !!area?.players.includes(x));
}
/** Remove a unit from whichever staging area holds it. */
function takeFromStaging(s: GameState, u: Unit) {
  const q = s.fogBarrow!;
  if (inStaging(s, u)) {
    s.staging = s.staging.filter((x) => x.id !== u.id);
    return true;
  }
  for (const a of q.areas) {
    const i = a.staging.findIndex((x) => x.id === u.id);
    if (i >= 0) {
      a.staging.splice(i, 1);
      return true;
    }
  }
  return false;
}
const greatBarrowInPlay = (s: GameState) =>
  fbAreaUnits(s).some((u) => u.code === FB.great);
/** A unit anywhere in play, in any player's area. */
const findUnit = (s: GameState, id?: string) =>
  id === undefined
    ? undefined
    : (get(s, id) ??
      [...globalCharacters(s), ...globalEngaged(s), ...fbAreaUnits(s)].find(
        (u) => u.id === id,
      ));
/** The player an enemy is engaged with, if any. */
const engagedPlayer = (s: GameState, u: Unit) =>
  globalPlayerOrder(s).find((p) =>
    seatView(s, p).engaged.some((x) => x.id === u.id),
  );
const engagedWights = (s: GameState, p: number) =>
  seatView(s, p).engaged.filter((u) => isWight(u));
const stoneRings = (s: GameState, p: number) =>
  playerStaging(s, p).filter((u) => live(u, FB.stoneRing)).length;
/**
 * The first sentence of a Wight's text applies to a player engaged with it,
 * and, while Stone Ring is in the staging area, to each player at its stage.
 */
function wightApplies(s: GameState, p: number, code: string) {
  if (!s.fogBarrow) return false;
  if (engagedWights(s, p).some((u) => live(u, code))) return true;
  if (!stoneRings(s, p)) return false;
  return stagePlayers(s, p).some((x) =>
    engagedWights(s, x).some((u) => live(u, code)),
  );
}
/** Frozen by Fear: the player cannot trigger Action or Response effects. */
const frozen = (s: GameState, p: number) =>
  !!s.fogBarrow &&
  s.fogBarrow.frozen.round === s.round &&
  s.fogBarrow.frozen.players.includes(p);
const FROZEN_REASON =
  "Frozen by Fear: until the end of the round, you cannot trigger Action or Response effects.";

// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupFogBarrow(s: GameState) {
  const r = FOG_BARROW_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, section("sharedEncounterDeck"));
  s.fogBarrow = {
    currentQuest: FB.house,
    advancing: false,
    setAside: section("sharedSetAside"),
    resolving: [],
    split: false,
    areas: [],
    resolvedAreas: [],
    travelPassedAreas: [],
    ended: [],
    escaped: [],
    buried: [],
    tom: false,
    frozen: { round: 0, players: [] },
  };
  log(
    s,
    "The House of Tom Bombadil: each copy of Great Barrow, Standing Stones and Hollow Circle is set aside, out of play, and the encounter deck is shuffled.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.fogBarrow;
  if (!q) return false;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length
  )
    return true;
  // 4B: each barrow whose stage is defeated returns at the next travel phase.
  if (q.split)
    for (const area of q.areas)
      if (
        area.questCode === FB.trapped &&
        !q.escaped.includes(area.id) &&
        areaProgress(s, area) >= BARROW_QUEST
      ) {
        q.escaped.push(area.id);
        prepend(s, fx("fbEscaped", { text: area.id, player: area.players[0] }));
        return true;
      }
  if (q.split) return true;
  // Stage 1: 1 progress placed at the end of the round.
  if (q.currentQuest === FB.house && stageLive(s) && s.progress >= 1) {
    q.advancing = true;
    prepend(s, fx("fbDefeat", { player: firstPlayer(s) }));
    return true;
  }
  // Stage 2: 14 progress, once Hollow Circle is in the victory display.
  if (
    q.currentQuest === FB.across &&
    stageLive(s) &&
    s.progress >= 14 &&
    (s.victoryCards ?? []).includes(FB.hollow)
  ) {
    q.advancing = true;
    prepend(s, fx("fbDefeat", { player: firstPlayer(s) }));
    return true;
  }
  // Stage 3: 16 progress with each player at this stage and Standing
  // Stones in the victory display wins the game.
  if (
    q.currentQuest === FB.lost &&
    stageLive(s) &&
    s.progress >= LOST_QUEST &&
    (s.victoryCards ?? []).includes(FB.standing)
  ) {
    win(s);
    s.reason =
      "Lost in the Fog is defeated: the hobbits find their way off the Barrow-downs to the East Road.";
  }
  return true;
}

// ---------------------------------------------------------------------------
// Separate staging areas: the barrows.

/**
 * Great Barrow: the player removes his characters from the quest, creates
 * his own staging area and advances to a separate stage 4A by himself.
 */
function trap(s: GameState, p: number) {
  const q = s.fogBarrow!;
  forOwner(s, p, () => {
    for (const c of [...s.heroes, ...s.allies])
      if (c.committed || s.committedIds.includes(c.id)) removeFromQuest(s, c);
    s.committedIds = [];
  });
  fasSyncArea(s);
  if (!q.split) {
    const stageThree: FliesSpidersArea = {
      ...emptyArea(
        FB_STAGE_THREE,
        globalPlayerOrder(s).filter((x) => x !== p),
        FB.lost,
      ),
      staging: s.staging,
      activeLocation: s.activeLocation,
      extraActiveLocations: s.extraActiveLocations ?? [],
      progress: s.progress,
      questDebuff: s.questDebuff,
      fog: s.fog ?? 0,
      threatModifier: s.threatModifier,
      ...(s.lastQuest !== undefined ? { lastQuest: s.lastQuest } : {}),
    };
    q.areas = [stageThree];
    q.split = true;
  } else {
    const from = fbArea(s, p);
    if (from) from.players = from.players.filter((x) => x !== p);
  }
  q.areas.push(emptyArea(fbBarrowArea(p), [p], FB.trapped));
  q.activeArea = undefined;
  s.staging = [];
  s.activeLocation = null;
  s.extraActiveLocations = [];
  s.progress = 0;
  fasSelectArea(s, activeSeat(s));
  log(
    s,
    `Great Barrow: ${who(s, p)} ${s.table ? "is" : "are"} trapped inside a barrow, with ${s.table ? "their" : "your"} own staging area at a separate stage 4A.`,
    "chapter",
  );
}
/** 4B is defeated: the barrow rejoins stage 3B, combining the staging areas. */
function combine(s: GameState, area: FliesSpidersArea) {
  const q = s.fogBarrow!;
  fasSyncArea(s);
  const stageThree = stageThreeArea(s);
  if (!stageThree) return;
  const p = area.players[0];
  stageThree.staging.push(
    ...area.staging,
    ...(area.activeLocation ? [area.activeLocation] : []),
    ...area.extraActiveLocations,
  );
  stageThree.players = globalPlayerOrder(s).filter(
    (x) => stageThree.players.includes(x) || x === p,
  );
  q.areas = q.areas.filter((a) => a.id !== area.id);
  for (const key of [
    "resolvedAreas",
    "travelPassedAreas",
    "ended",
    "escaped",
  ] as const)
    q[key] = q[key].filter((id) => id !== area.id);
  if (q.areas.length === 1) unsplit(s);
  else {
    q.activeArea = undefined;
    fasSelectArea(s, activeSeat(s));
  }
}
/** Every player is back at stage 3B: one staging area again. */
function unsplit(s: GameState) {
  const q = s.fogBarrow!;
  const stageThree = stageThreeArea(s)!;
  s.staging = stageThree.staging;
  s.activeLocation = stageThree.activeLocation;
  s.extraActiveLocations = stageThree.extraActiveLocations;
  s.progress = stageThree.progress;
  s.questDebuff = stageThree.questDebuff;
  s.fog = stageThree.fog;
  s.threatModifier = stageThree.threatModifier;
  if (stageThree.lastQuest !== undefined) s.lastQuest = stageThree.lastQuest;
  q.split = false;
  q.areas = [];
  q.activeArea = undefined;
  q.resolvedAreas = [];
  q.travelPassedAreas = [];
  q.ended = [];
  q.escaped = [];
}
/** The next area to resolve its quest; areas whose quest phase ended are skipped. */
function selectNextArea(s: GameState) {
  const q = s.fogBarrow!;
  for (;;) {
    const next = orderedAreas(s).find((a) => !q.resolvedAreas.includes(a.id));
    if (!next) {
      prepend(s, fx("finishQuestPhase", { player: s.table?.first ?? 0 }));
      return;
    }
    if (q.ended.includes(next.id)) {
      q.resolvedAreas.push(next.id);
      log(
        s,
        `${card(next.questCode).name}: the quest phase ended at this stage without resolving the quest.`,
      );
      continue;
    }
    const p = firstOf(s, next);
    selectSeat(s, p);
    if (s.table) s.table.turn = p;
    return;
  }
}
function passTravel(s: GameState) {
  const q = s.fogBarrow!;
  const area = fbArea(s);
  if (area && !q.travelPassedAreas.includes(area.id))
    q.travelPassedAreas.push(area.id);
  const next = orderedAreas(s).find((a) => !q.travelPassedAreas.includes(a.id));
  if (next) {
    const p = firstOf(s, next);
    selectSeat(s, p);
    if (s.table) s.table.turn = p;
  } else
    enqueue(
      s,
      fx("phaseEnd", { player: s.table?.first ?? 0 }),
      fx("startEncounter", { player: s.table?.first ?? 0 }),
    );
}
/** Discard a player's barrow and the encounter cards in its staging area. */
function discardBarrow(s: GameState, player: number) {
  const q = s.fogBarrow!;
  const area = q.areas.find(
    (a) => a.id === fbBarrowArea(player) && a.players.includes(player),
  );
  if (!area) return;
  fasSyncArea(s);
  const cards = [
    ...area.staging,
    ...(area.activeLocation ? [area.activeLocation] : []),
    ...area.extraActiveLocations,
  ];
  for (const u of cards) {
    for (const a of [...u.attachments]) discardAttachment(s, u, a, true, false);
    s.encounterDiscard.push(...u.shadows, u.code);
  }
  q.areas = q.areas.filter((a) => a.id !== area.id);
  for (const key of [
    "resolvedAreas",
    "travelPassedAreas",
    "ended",
    "escaped",
  ] as const)
    q[key] = q[key].filter((id) => id !== area.id);
  if (q.activeArea === area.id) {
    s.staging = [];
    s.activeLocation = null;
    s.extraActiveLocations = [];
    s.progress = 0;
    q.activeArea = undefined;
  }
  log(
    s,
    "Trapped Inside a Barrow and the encounter cards in its staging area are discarded.",
    "danger",
  );
  if (q.areas.length === 1) unsplit(s);
  else fasSelectArea(s, activeSeat(s));
}
/** Discard from the encounter deck until a Wight enemy is discarded. */
function discardUntilWight(s: GameState) {
  const discarded: string[] = [];
  while (s.encounterDeck.length) {
    const c = s.encounterDeck.shift()!;
    if (isWightCard(c)) {
      if (discarded.length)
        log(
          s,
          `Trapped Inside a Barrow: ${discarded.map((x) => card(x).name).join(", ")} ${discarded.length === 1 ? "is" : "are"} discarded before ${card(c).name}.`,
        );
      return c;
    }
    s.encounterDiscard.push(c);
    discarded.push(c);
  }
  log(
    s,
    `Trapped Inside a Barrow: the encounter deck runs out (${discarded.length} card${discarded.length === 1 ? "" : "s"} discarded) without a Wight enemy.`,
  );
  return undefined;
}

// ---------------------------------------------------------------------------
// Ancient Barrow: allies facedown under it.

function buryAlly(s: GameState, u: Unit, location: string) {
  const q = s.fogBarrow!;
  const controller = ownerOf(s, u),
    owner = u.owner ?? controller;
  const lastKnownAttack = stats(s, u).attack;
  const lastKnownTraits = effectiveTraits(u);
  const lastKnownType = unitType(u);
  for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
  forOwner(s, controller, () => {
    removeFromQuest(s, u);
    s.allies = s.allies.filter((a) => a.id !== u.id);
    s.committedIds = s.committedIds.filter((id) => id !== u.id);
  });
  q.buried.push({ location, id: u.id, code: u.code, owner });
  log(s, `Ancient Barrow: ${name(u)} is placed facedown under it.`, "danger");
  characterLeftPlay(
    s,
    u,
    controller,
    { zone: "removed", player: owner },
    lastKnownAttack,
    lastKnownTraits,
    false,
    lastKnownType,
  );
}
/** The facedown allies leave with the Ancient Barrow: to the hand if explored. */
function releaseBuried(s: GameState, location: Unit, explored: boolean) {
  const q = s.fogBarrow;
  if (!q) return;
  const under = q.buried.filter((b) => b.location === location.id);
  if (!under.length) return;
  q.buried = q.buried.filter((b) => b.location !== location.id);
  for (const b of under)
    forOwner(s, b.owner, () => {
      if (explored) {
        const returned = make(s, b.code);
        returned.owner = b.owner;
        s.hand.push(returned);
      } else s.discard.push(b.code);
    });
  log(
    s,
    explored
      ? `Ancient Barrow is explored: ${under.map((b) => card(b.code).name).join(", ")} ${under.length === 1 ? "returns" : "return"} to ${under.length === 1 ? "its owner's hand" : "their owners' hands"}.`
      : `Ancient Barrow leaves play: the facedown ${under.length === 1 ? "ally is" : "allies are"} discarded.`,
    explored ? "good" : "danger",
  );
}

// ---------------------------------------------------------------------------
// Encounter cards and shadows.

function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.fogBarrow;
  if (!q) return false;
  const player = activeSeat(s);
  if (code === FB.tom) {
    if (!fromReveal) return true;
    const target = [...s.staging].reverse().find((u) => u.code === code);
    if (target) prepend(s, fx("fbTom", { target: target.id, player }));
    return true;
  }
  if (!TREACHERIES.includes(code)) return false;
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(code);
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  const u = make(s, code);
  q.resolving.push(u);
  prepend(
    s,
    fx("fbTreachery", { code, source: u.id, player }),
    fx("fbTreacheryDone", { source: u.id, player }),
  );
  return true;
}
function surge(s: GameState, code: string, p: number, reason: string) {
  log(s, `${card(code).name}: ${reason}, so it gains surge.`, "danger");
  prepend(
    s,
    fx("amonSurgeWindow", { code, player: p }),
    fx("reveal", { player: p }),
  );
}
/** "Search the encounter deck and discard pile for a Wight enemy": one option per card and zone. */
function wightOptions(s: GameState, kind: string, player: number): Option[] {
  const options: Option[] = [];
  for (const [zone, cards] of [
    ["deck", s.encounterDeck],
    ["discard", s.encounterDiscard],
  ] as const)
    for (const code of [...new Set(cards.filter((c) => isWightCard(c)))])
      options.push({
        id: `${zone}-${code}`,
        code,
        label: `${card(code).name} · ${zone === "deck" ? "encounter deck" : "discard pile"}`,
        effects: [fx(kind, { code, text: zone, player })],
      });
  return options;
}
function treachery(s: GameState, code: string, source: string) {
  const q = s.fogBarrow!;
  const p = activeSeat(s);
  switch (code) {
    case FB.song: {
      const heroes = s.heroes.filter(
        (h) =>
          (h.committed || s.committedIds.includes(h.id)) &&
          !h.attachments.some((a) => a.code === FB.song),
      );
      if (!heroes.length) {
        log(
          s,
          `Dreadful Song: ${who(s, p)} ${s.table ? "has" : "have"} no questing hero to attach it to.`,
        );
        return;
      }
      choose(
        s,
        `Dreadful Song · Attach to a questing hero you control${seatLabel(s, p)}`,
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [fx("fbSong", { target: h.id, source, player: p })],
        })),
        "Peril. Counts as a Condition attachment: limit 1 per hero, the hero's willpower is reduced to 0, and at the end of the round you raise your threat by 1 for each Wight enemy engaged with you.",
      );
      return;
    }
    case FB.arm: {
      if (!s.used.includes(FB_ARM)) s.used.push(FB_ARM);
      log(
        s,
        `Long Groping Arm: until the end of the phase, each Wight enemy engaged with ${who(s, p)} contributes its threat to the staging area.`,
        "danger",
      );
      if (s.engaged.some((u) => isEnemy(u))) return;
      const options = wightOptions(s, "fbArmWight", p);
      if (!options.length) {
        shuffle(s, s.encounterDeck);
        log(
          s,
          "Long Groping Arm: no Wight enemy is in the encounter deck or discard pile; the encounter deck is shuffled.",
        );
        return;
      }
      choose(
        s,
        `Long Groping Arm · Put a Wight enemy into play engaged with you${seatLabel(s, p)}`,
        options,
        "No enemy is engaged with you. Then the encounter deck is shuffled.",
      );
      return;
    }
    case FB.chill: {
      let total = 0;
      for (const x of playerOrder(s))
        forOwner(s, x, () => {
          let n = 0;
          for (const u of [...s.heroes, ...s.allies]) {
            n += u.resources;
            u.resources = 0;
          }
          total += n;
          if (n) {
            raiseThreat(s, n, "encounter");
            log(
              s,
              `Chill Fog: ${who(s, x)} ${verb(s, "discard")} ${n} resource${n === 1 ? "" : "s"} and ${verb(s, "raise")} ${s.table ? "their" : "your"} threat by ${n}.`,
              "danger",
            );
          }
        });
      for (const u of [
        ...s.staging,
        ...(s.activeLocation ? [s.activeLocation] : []),
      ])
        u.resources = 0;
      if (!total) surge(s, code, p, "no resources were discarded");
      return;
    }
    case FB.waiting: {
      const attacks = playerOrder(s).flatMap((x) =>
        engagedWights(s, x).map((u) =>
          fx("immediateAttack", { target: u.id, player: x }),
        ),
      );
      if (!attacks.length) {
        surge(s, code, p, "no Wight enemy is engaged with a player");
        return;
      }
      log(
        s,
        "I'm Waiting for You!: each Wight enemy engaged with a player makes an immediate attack.",
        "danger",
      );
      prepend(s, ...attacks);
      return;
    }
    case FB.frozen: {
      const players = playerOrder(s);
      if (q.frozen.round !== s.round)
        q.frozen = { round: s.round, players: [] };
      q.frozen.players = [...new Set([...q.frozen.players, ...players])].sort();
      log(
        s,
        "Frozen by Fear: until the end of the round, the players at this stage cannot trigger Action or Response effects.",
        "danger",
      );
      return;
    }
  }
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !s.fogBarrow) return false;
  const enemy = get(s, c.enemyId);
  switch (code) {
    case FB.chill:
      c.fbChill = true;
      log(
        s,
        "Chill Fog: the defending player raises his threat by 1 for each damage dealt by this attack.",
        "danger",
      );
      return true;
    case FB.waiting: {
      const defender = get(s, c.defenderIds?.[0] ?? c.defenderId ?? undefined);
      const bonus = defender && isAlly(defender) ? 3 : 1;
      c.attackBonus += bonus;
      log(
        s,
        `I'm Waiting for You!: the attacking enemy gets +${bonus} attack.`,
        "danger",
      );
      return true;
    }
    case FB.frozen:
      if (enemy) enemy.roundCannotTakeDamage = true;
      log(
        s,
        "Frozen by Fear: until the end of the round, the attacking enemy cannot take damage.",
        "danger",
      );
      return true;
    case FB.northDowns:
      c.attackBonus += 2;
      c.fbNorth = true;
      log(
        s,
        "North Downs: the attacking enemy gets +2 attack; if this attack destroys a character, each player raises his threat by 2.",
        "danger",
      );
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Effects.

export function fogBarrowEffect(s: GameState, e: Effect): boolean {
  const q = s.fogBarrow;
  if (!q) return false;
  // Each separate stage makes its own travel decision.
  if (e.kind === "travelDone" && q.split) {
    passTravel(s);
    return true;
  }
  if (!e.kind.startsWith("fb")) return false;
  const first = firstPlayer(s);
  const p = e.player ?? activeSeat(s),
    u = findUnit(s, e.target);
  switch (e.kind) {
    case "fbDefeat": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(
        s,
        ...responses,
        fx(q.currentQuest === FB.house ? "fbStageTwo" : "fbStageThree", {
          player: first,
        }),
      );
      return true;
    }
    case "fbHouse":
      if (q.currentQuest !== FB.house || !stageLive(s)) return true;
      s.progress += 1;
      log(
        s,
        "The House of Tom Bombadil: at the end of the round, 1 progress is placed on this stage.",
        "good",
      );
      return true;
    case "fbStageTwo": {
      q.advancing = false;
      s.stage = 2;
      s.progress = 0;
      q.currentQuest = FB.across;
      log(s, "Across the Downs begins.", "chapter");
      const i = q.setAside.indexOf(FB.hollow);
      if (i >= 0) {
        q.setAside.splice(i, 1);
        s.staging.push(make(s, FB.hollow));
        log(s, "Across the Downs: Hollow Circle is added to the staging area.");
      }
      prepend(s, ...playerOrder(s).map((player) => fx("reveal", { player })));
      return true;
    }
    case "fbAcrossThreat":
      if (q.currentQuest !== FB.across || !stageLive(s) || q.split) return true;
      for (const x of playerOrder(s))
        forOwner(s, x, () => raiseThreat(s, 1, "quest-card"));
      log(
        s,
        "Across the Downs: at the end of the refresh phase, each player raises his threat by 1.",
        "danger",
      );
      return true;
    case "fbStageThree": {
      q.advancing = false;
      s.stage = 3;
      s.progress = 0;
      q.currentQuest = FB.lost;
      log(s, "Lost in the Fog begins.", "chapter");
      const i = q.setAside.indexOf(FB.standing);
      if (i >= 0) {
        q.setAside.splice(i, 1);
        forOwner(s, first, () => s.staging.push(make(s, FB.standing)));
        log(
          s,
          "Lost in the Fog: the first player adds Standing Stones to the staging area.",
        );
      }
      prepend(
        s,
        ...playerOrder(s)
          .filter((x) => x !== first)
          .map((player) => fx("reveal", { player })),
        fx("fbShuffleBarrows", { player: first }),
      );
      return true;
    }
    case "fbShuffleBarrows": {
      const barrows = q.setAside.filter((c) => c === FB.great);
      q.setAside = q.setAside.filter((c) => c !== FB.great);
      const discard = s.encounterDiscard.splice(0);
      s.encounterDeck.push(...discard, ...barrows);
      shuffle(s, s.encounterDeck);
      log(
        s,
        `Lost in the Fog: the encounter discard pile (${discard.length} card${discard.length === 1 ? "" : "s"}) and ${barrows.length} ${barrows.length === 1 ? "copy" : "copies"} of Great Barrow are shuffled into the encounter deck.`,
        "danger",
      );
      return true;
    }
    case "fbTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (held) treachery(s, held.code, held.id);
      return true;
    }
    case "fbTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      return true;
    }
    case "fbSong": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (!u || i < 0 || !isHero(u)) return true;
      if (u.attachments.some((a) => a.code === FB.song)) return true;
      const [held] = q.resolving.splice(i, 1);
      u.attachments.push({ id: held.id, code: FB.song, exhausted: false });
      log(
        s,
        `Dreadful Song attaches to ${name(u)}: its willpower is reduced to 0.`,
        "danger",
      );
      return true;
    }
    case "fbSongThreat": {
      const songs = s.heroes.flatMap((h) =>
        h.attachments.filter((a) => a.code === FB.song && !a.blanked),
      ).length;
      const wights = engagedWights(s, p).length;
      if (!songs || !wights) return true;
      raiseThreat(s, songs * wights, "encounter");
      log(
        s,
        `Dreadful Song: ${who(s, p)} ${verb(s, "raise")} ${s.table ? "their" : "your"} threat by ${songs * wights} for the Wight enem${wights === 1 ? "y" : "ies"} engaged with ${s.table ? "them" : "you"}.`,
        "danger",
      );
      return true;
    }
    case "fbArmWight":
    case "fbHollowWight": {
      const zone = e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
      const i = e.code ? zone.indexOf(e.code) : -1;
      if (i >= 0) {
        zone.splice(i, 1);
        const wight = make(s, e.code!);
        s.staging.push(wight);
        engage(s, wight);
        log(
          s,
          `${e.kind === "fbArmWight" ? "Long Groping Arm" : "Hollow Circle"}: ${card(e.code!).name} is put into play engaged with ${who(s, p)}.`,
          "danger",
        );
      }
      if (e.kind === "fbArmWight") shuffle(s, s.encounterDeck);
      return true;
    }
    case "fbHollow": {
      const players = playerOrder(s);
      prepend(
        s,
        ...players.map((player) => fx("fbHollowSearch", { player })),
        fx("fbShuffle", { text: "Hollow Circle", player: p }),
      );
      return true;
    }
    case "fbHollowSearch": {
      const options = wightOptions(s, "fbHollowWight", p);
      if (!options.length) {
        log(
          s,
          `Hollow Circle: ${who(s, p)} ${verb(s, "find")} no Wight enemy in the encounter deck or discard pile.`,
        );
        return true;
      }
      choose(
        s,
        `Hollow Circle · Put a Wight enemy into play engaged with you${seatLabel(s, p)}`,
        options,
        "Each player searches the encounter deck and discard pile for a Wight enemy.",
      );
      return true;
    }
    case "fbShuffle":
      shuffle(s, s.encounterDeck);
      log(s, `${e.text}: the encounter deck is shuffled.`);
      return true;
    case "fbStanding": {
      const options: Option[] = [];
      for (const [zone, cards] of [
        ["deck", s.encounterDeck],
        ["discard", s.encounterDiscard],
        ["victory", s.victoryCards ?? []],
      ] as const)
        if (cards.includes(FB.great))
          options.push({
            id: zone,
            code: FB.great,
            label: `Great Barrow · ${zone === "deck" ? "encounter deck" : zone === "discard" ? "discard pile" : "victory display"}`,
            effects: [fx("fbStandingBarrow", { text: zone, player: p })],
          });
      if (!options.length) {
        shuffle(s, s.encounterDeck);
        log(
          s,
          "Standing Stones: no Great Barrow is in the encounter deck, discard pile or victory display; the encounter deck is shuffled.",
        );
        return true;
      }
      choose(
        s,
        `Standing Stones · Add a Great Barrow to the staging area${seatLabel(s, p)}`,
        options,
        "The first player searches the encounter deck, discard pile and victory display for a Great Barrow. Then the encounter deck is shuffled.",
      );
      return true;
    }
    case "fbStandingBarrow": {
      let taken = false;
      if (e.text === "victory") {
        const list = s.victoryCards ?? [];
        const i = list.lastIndexOf(FB.great);
        if (i >= 0) {
          list.splice(i, 1);
          s.victory -= card(FB.great).victory ?? 0;
          taken = true;
        }
      } else {
        const zone =
          e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
        const i = zone.indexOf(FB.great);
        if (i >= 0) {
          zone.splice(i, 1);
          taken = true;
        }
      }
      shuffle(s, s.encounterDeck);
      if (!taken) return true;
      const barrow = make(s, FB.great);
      s.staging.push(barrow);
      log(
        s,
        "Standing Stones: a Great Barrow is added to the staging area; the encounter deck is shuffled.",
        "danger",
      );
      prepend(s, fx("fbGreatBarrow", { target: barrow.id, player: p }));
      return true;
    }
    case "fbGreatBarrow":
      if (!u || u.code !== FB.great || fbTrapped(s, p)) return true;
      trap(s, p);
      prepend(s, fx("fb4A", { player: p }));
      return true;
    case "fb4A": {
      const area = fbArea(s, p);
      if (!area) return true;
      if (["quest", "staging"].includes(s.phase)) {
        if (!q.ended.includes(area.id)) q.ended.push(area.id);
        log(
          s,
          "Trapped Inside a Barrow: it is the quest phase, so the quest phase ends at this stage without resolving the quest.",
        );
      }
      const wight = discardUntilWight(s);
      if (wight) {
        const enemy = make(s, wight);
        s.staging.push(enemy);
        enemyAddedToStaging(s, enemy);
        log(
          s,
          `Trapped Inside a Barrow: ${card(wight).name} is added to the staging area.`,
          "danger",
        );
      }
      prepend(s, fx("fbKeepAllies", { player: p }));
      return true;
    }
    case "fbKeepAllies": {
      const keep = s.engaged.filter((x) => isEnemy(x)).length;
      if (s.allies.length <= keep) return true;
      choose(
        s,
        `Trapped Inside a Barrow · Discard an ally${seatLabel(s, p)}`,
        s.allies.map((a) => ({
          id: a.id,
          code: a.code,
          label: `Discard ${name(a)}`,
          effects: [fx("fbDiscardAlly", { target: a.id, player: p })],
        })),
        `Discard all but ${keep} all${keep === 1 ? "y" : "ies"} you control (1 for each enemy engaged with you).`,
      );
      return true;
    }
    case "fbDiscardAlly":
      if (u && s.allies.some((a) => a.id === u.id)) {
        destroy(s, u, false);
        prepend(s, fx("fbKeepAllies", { player: p }));
      }
      return true;
    case "fbEscaped": {
      const area = q.areas.find((a) => a.id === e.text);
      if (!area) return true;
      const before = s.queue.length;
      questDefeated(s, FB.trapped);
      const responses = s.queue.splice(0, s.queue.length - before);
      log(
        s,
        `Trapped Inside a Barrow is defeated: ${who(s, p)} will advance to Lost in the Fog at the beginning of the travel phase.`,
        "good",
      );
      prepend(s, ...responses);
      return true;
    }
    case "fbReturn": {
      const area = q.areas.find((a) => a.id === e.text);
      if (!area || !q.escaped.includes(area.id)) return true;
      combine(s, area);
      log(
        s,
        `Trapped Inside a Barrow: ${who(s, p)} ${verb(s, "advance")} to Lost in the Fog, combining the staging areas.`,
        "chapter",
      );
      prepend(s, fx("fbBarrowProgress", { player: p }));
      return true;
    }
    case "fbBarrowProgress": {
      const barrow = s.staging.find((x) => x.code === FB.great);
      if (!barrow) {
        log(
          s,
          "Trapped Inside a Barrow: no Great Barrow is at Lost in the Fog.",
        );
        return true;
      }
      log(
        s,
        "Trapped Inside a Barrow: 1 progress is placed on a Great Barrow at Lost in the Fog.",
        "good",
      );
      progressLocation(s, barrow, 1);
      return true;
    }
    case "fbAncient": {
      if (!u || !inStaging(s, u)) return true;
      const order = playerOrder(s);
      prepend(
        s,
        ...order.map((player) =>
          fx("fbAncientChoose", { target: u.id, player }),
        ),
      );
      return true;
    }
    case "fbAncientChoose": {
      if (!u || !inStaging(s, u)) return true;
      const allies = s.allies.filter(
        (a) => card(a.code).sphere_code !== "encounter",
      );
      if (!allies.length) return true;
      choose(
        s,
        `Ancient Barrow · Place an ally you control facedown under it${seatLabel(s, p)}`,
        allies.map((a) => ({
          id: a.id,
          code: a.code,
          label: name(a),
          effects: [fx("fbBury", { target: a.id, source: u.id, player: p })],
        })),
        "When Ancient Barrow leaves play as an explored location, each ally under it returns to its owner's hand.",
      );
      return true;
    }
    case "fbBury": {
      const location = findUnit(s, e.source);
      if (!u || !location || !s.allies.some((a) => a.id === u.id)) return true;
      buryAlly(s, u, location.id);
      return true;
    }
    case "fbTom": {
      if (!u || !inStaging(s, u)) return true;
      const order = playerOrder(s);
      if (order.length === 1) {
        prepend(s, fx("fbTomControl", { target: u.id, player: order[0] }));
        return true;
      }
      choose(
        s,
        `Tom Bombadil · Choose a player${seatLabel(s, p)}`,
        order.map((player) => ({
          id: `player-${player}`,
          label: seatName(s, player),
          effects: [fx("fbTomControl", { target: u.id, player })],
        })),
        "That player gains control of Tom Bombadil, ready and committed to the quest.",
      );
      return true;
    }
    case "fbTomControl": {
      if (!u || !takeFromStaging(s, u)) return true;
      forOwner(s, p, () => {
        u.owner = p;
        u.controller = p;
        u.exhausted = false;
        u.committed = true;
        s.allies.push(u);
        charactersCommitted(s, [u]);
      });
      q.tom = true;
      log(
        s,
        `Tom Bombadil: ${who(s, p)} ${verb(s, "gain")} control of Tom Bombadil, ready and committed to the quest.`,
        "good",
      );
      return true;
    }
    case "fbTomLeaves": {
      if (!q.tom) return true;
      q.tom = false;
      const tom = globalCharacters(s).find((x) => x.code === FB.tom);
      if (tom) forOwner(s, ownerOf(s, tom), () => destroy(s, tom, false));
      const count = s.encounterDiscard.length;
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      log(
        s,
        `Tom Bombadil: ${tom ? "Tom Bombadil is discarded, then " : ""}the encounter discard pile (${count} card${count === 1 ? "" : "s"}) is shuffled into the encounter deck.`,
        "danger",
      );
      return true;
    }
    case "fbAreaStaging": {
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("reveal", { player })),
        fx("khazadStagingEnd", { player: p }),
      );
      return true;
    }
    case "fbAreaQuestDone": {
      fasSyncArea(s);
      if (
        q.areas.some((a) => a.id === e.text) &&
        !q.resolvedAreas.includes(e.text!)
      )
        q.resolvedAreas.push(e.text!);
      selectNextArea(s);
      return true;
    }
    case "fbVictims": {
      // Wight forced effects after the attack destroyed characters.
      const enemy = findUnit(s, e.source);
      const code = e.code ?? enemy?.code;
      const victims = e.ids ?? [];
      for (const owner of victims.map(Number))
        forOwner(s, owner, () => {
          if (code === FB.barrowWight) {
            raiseThreat(s, 2, "encounter");
            log(
              s,
              `Barrow-wight: ${who(s, owner)} ${verb(s, "raise")} ${s.table ? "their" : "your"} threat by 2.`,
              "danger",
            );
          } else if (code === FB.darkWight) {
            for (const h of s.heroes) h.resources = 0;
            log(
              s,
              `Dark-wight: ${who(s, owner)} ${verb(s, "discard")} all resources from each hero ${s.table ? "they control" : "you control"}.`,
              "danger",
            );
          } else if (code === FB.coldWight && s.hand.length) {
            const i = Math.floor(random(s) * s.hand.length);
            const [discarded] = s.hand.splice(i, 1);
            s.discard.push(discarded.code);
            log(
              s,
              `Cold-wight: ${who(s, owner)} ${verb(s, "discard")} a random card from ${s.table ? "their" : "your"} hand (${name(discarded)}).`,
              "danger",
            );
          }
        });
      return true;
    }
    case "fbChillThreat":
      if ((e.value ?? 0) > 0) {
        raiseThreat(s, e.value!, "encounter");
        log(
          s,
          `Chill Fog: ${who(s, p)} ${verb(s, "raise")} ${s.table ? "their" : "your"} threat by ${e.value} for the damage dealt by this attack.`,
          "danger",
        );
      }
      return true;
    case "fbNorthThreat":
      for (const x of playerOrder(s))
        forOwner(s, x, () => raiseThreat(s, 2, "encounter"));
      log(
        s,
        "North Downs: the attack destroyed a character, so each player raises his threat by 2.",
        "danger",
      );
      return true;
    case "fbEliminated":
      for (const x of e.ids?.map(Number) ?? [])
        if (globalPlayerOrder(s).includes(x))
          forOwner(s, x, () => raiseThreat(s, 10, "quest-card"));
      if (e.ids?.length)
        log(
          s,
          "Lost in the Fog: a player was eliminated, so each player at this stage raises his threat by 10.",
          "danger",
        );
      return true;
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Hooks.

function beginStaging(s: GameState) {
  const q = s.fogBarrow;
  if (!q?.split) return false;
  q.resolvedAreas = [];
  const areas = orderedAreas(s);
  for (const area of areas)
    enqueue(
      s,
      fx("fbAreaStaging", { text: area.id, player: firstOf(s, area) }),
    );
  enqueue(s, fx("questReady", { player: firstOf(s, areas[0]) }));
  return true;
}
function resolveQuest(s: GameState) {
  const q = s.fogBarrow;
  if (!q?.split) return false;
  let area = fbArea(s);
  // The first player of the next stage to resolve resolves its quest.
  if (
    !area ||
    q.resolvedAreas.includes(area.id) ||
    activeSeat(s) !== firstOf(s, area)
  ) {
    const next = orderedAreas(s).find((a) => !q.resolvedAreas.includes(a.id));
    if (!next) {
      enqueue(s, fx("finishQuestPhase", { player: s.table?.first ?? 0 }));
      return true;
    }
    selectSeat(s, firstOf(s, next));
    if (s.table) s.table.turn = firstOf(s, next);
    area = next;
  }
  const player = activeSeat(s);
  if (q.ended.includes(area.id)) {
    log(
      s,
      `${card(area.questCode).name}: the quest is not resolved this round.`,
    );
    enqueue(s, fx("fbAreaQuestDone", { text: area.id, player }));
    return true;
  }
  const will = questWill(s),
    threat = stagingThreat(s),
    net = will - threat;
  s.lastQuest = { will, threat, net };
  log(
    s,
    `${card(area.questCode).name} · ${will} willpower − ${threat} threat = ${net}.`,
    net < 0 ? "danger" : "good",
  );
  if (net > 0) enqueue(s, fx("questSucceeded", { value: net, player }));
  else if (net < 0) enqueue(s, fx("failedQuest", { value: -net, player }));
  enqueue(s, fx("fbAreaQuestDone", { text: area.id, player }));
  return true;
}
function travelNext(s: GameState) {
  const q = s.fogBarrow;
  if (!q?.split) return false;
  const area = fbArea(s);
  requireRule(
    area && activeSeat(s) === firstOf(s, area),
    "The first player at this stage makes its travel decision.",
  );
  passTravel(s);
  return true;
}
function attackFinished(s: GameState, combat: Combat, skipped = false) {
  if (!s.fogBarrow || skipped) return [];
  const p = combat.attackPlayer ?? firstPlayer(s);
  const effects: Effect[] = [];
  const enemy = findUnit(s, combat.enemyId);
  if (combat.fbVictims?.length && enemy && isWight(enemy) && !enemy.blanked)
    effects.push(
      fx("fbVictims", {
        source: enemy.id,
        code: enemy.code,
        ids: combat.fbVictims.map(String),
        player: p,
      }),
    );
  if (combat.fbChill && (combat.damageDealt ?? 0) > 0)
    effects.push(fx("fbChillThreat", { value: combat.damageDealt, player: p }));
  if (combat.fbNorth && combat.fbVictims?.length)
    effects.push(fx("fbNorthThreat", { player: p }));
  return effects;
}

export const FOG_BARROW_HOOKS: Batch4ScenarioHooks = {
  setup: setupFogBarrow,
  advance,
  stageInfo: fogBarrowStageInfo,
  check: (s) => {
    if (s.fogBarrow) lotrSagaCheck(s);
  },
  encounter,
  shadow,
  questBegin: (s) => {
    const q = s.fogBarrow;
    if (q) q.ended = [];
    return [];
  },
  // 1B: skip the quest phase.
  skipQuestPhase: (s) =>
    !!s.fogBarrow &&
    !s.fogBarrow.split &&
    s.fogBarrow.currentQuest === FB.house &&
    stageLive(s),
  roundEnd: (s) => {
    const q = s.fogBarrow;
    if (!q) return [];
    const effects: Effect[] = [];
    const first = firstPlayer(s);
    if (!q.split && q.currentQuest === FB.house && stageLive(s))
      effects.push(fx("fbHouse", { player: first }));
    if (!q.split && q.currentQuest === FB.across && stageLive(s))
      effects.push(fx("fbAcrossThreat", { player: first }));
    for (const x of playerOrder(s))
      if (
        seatView(s, x).heroes.some((h) =>
          h.attachments.some((a) => a.code === FB.song && !a.blanked),
        )
      )
        effects.push(fx("fbSongThreat", { player: x }));
    if (q.tom) effects.push(fx("fbTomLeaves", { player: first }));
    return effects;
  },
  travelBegin: (s) => {
    const q = s.fogBarrow;
    if (!q?.split || !q.escaped.length) return;
    const areas = orderedAreas(s).filter((a) => q.escaped.includes(a.id));
    prepend(
      s,
      ...areas.map((a) => fx("fbReturn", { text: a.id, player: a.players[0] })),
    );
  },
  beginStaging,
  resolveQuest,
  travelNext,
  // 3B: progress cannot be placed while Great Barrow is in play.
  progress: (s, amount, quest) => {
    const q = s.fogBarrow;
    if (!q || amount <= 0 || quest.id !== mainQuestUnit(s)?.id) return amount;
    if (fbCurrentQuest(s) !== FB.lost || !stageLive(s)) return amount;
    if (!greatBarrowInPlay(s)) return amount;
    log(
      s,
      "Lost in the Fog: progress cannot be placed here while Great Barrow is in play.",
    );
    return 0;
  },
  // Ancient Barrow: X is 1 plus the number of facedown cards under it.
  threatBonus: (s, u) =>
    s.fogBarrow && live(u, FB.ancient)
      ? 1 + s.fogBarrow.buried.filter((b) => b.location === u.id).length
      : 0,
  // Stone Ring: each Wight engaged with a player at its stage gets +1/+1.
  stats: (s, u) => {
    if (!s.fogBarrow || !isWight(u)) return {};
    const p = engagedPlayer(s, u);
    if (p === undefined) return {};
    const rings = stoneRings(s, p);
    return rings ? { attack: rings, defense: rings } : {};
  },
  // Long Groping Arm: Wights engaged with its player contribute their threat.
  stagingThreat: (s) => {
    if (!s.fogBarrow) return 0;
    return playerOrder(s).reduce((n, p) => {
      const v = seatView(s, p);
      if (!v.used.includes(FB_ARM)) return n;
      return n + engagedWights(s, p).reduce((m, w) => m + threatOf(s, w), 0);
    }, 0);
  },
  // Barrow-wight: that player's threat cannot be reduced.
  cannotReduceThreat: (s) => wightApplies(s, activeSeat(s), FB.barrowWight),
  // Dark-wight: that player's heroes cannot gain resources from card effects.
  cannotGainResources: (s, u) =>
    isHero(u) && wightApplies(s, ownerOf(s, u), FB.darkWight),
  // Cold-wight: that player cannot draw cards from card effects.
  cannotDraw: (s) => wightApplies(s, activeSeat(s), FB.coldWight),
  abilitiesBlocked: (s, player) => frozen(s, player),
  playProblem: (s, code) =>
    frozen(s, activeSeat(s)) && card(code).type_code === "event"
      ? FROZEN_REASON
      : null,
  // North Downs: characters defend against Wights with their willpower.
  defenseOverride: (s, defender, enemy) => {
    if (!s.fogBarrow || !isWight(enemy)) return undefined;
    const p = engagedPlayer(s, enemy) ?? ownerOf(s, defender);
    if (!playerStaging(s, p).some((u) => live(u, FB.northDowns)))
      return undefined;
    return stats(s, defender).will;
  },
  // Dreadful Song: the attached hero's willpower is reduced to 0.
  willpowerOverride: (s, u) =>
    s.fogBarrow && u.attachments.some((a) => a.code === FB.song && !a.blanked)
      ? 0
      : undefined,
  travelProblem: (s, u) =>
    s.fogBarrow && u.code === FB.great
      ? "Great Barrow: the players cannot travel here."
      : null,
  travelEffects: (s, u) => {
    if (!s.fogBarrow || u.blanked) return undefined;
    if (u.code === FB.hollow)
      return [fx("fbHollow", { player: firstPlayer(s) })];
    if (u.code === FB.standing)
      return [fx("fbStanding", { player: firstPlayer(s) })];
    return undefined;
  },
  cardEntered: (s, u, fromReveal, cancelled) => {
    const q = s.fogBarrow;
    if (!q || !inStaging(s, u)) return;
    const p = activeSeat(s);
    // 4B: a location revealed at this stage is cancelled and discarded.
    if (fromReveal && isLocation(u) && fbTrapped(s, p) && stageLive(s)) {
      const threat = threatOf(s, u);
      takeFromStaging(s, u);
      s.encounterDiscard.push(u.code);
      log(
        s,
        `Trapped Inside a Barrow: ${name(u)}'s effects are cancelled and it is discarded; ${who(s, p)} ${verb(s, "raise")} ${s.table ? "their" : "your"} threat by ${threat}.`,
        "danger",
      );
      if (threat > 0) raiseThreat(s, threat, "quest-card");
      return;
    }
    if (cancelled) return;
    if (live(u, FB.great))
      prepend(s, fx("fbGreatBarrow", { target: u.id, player: p }));
    if (live(u, FB.ancient))
      prepend(s, fx("fbAncient", { target: u.id, player: p }));
  },
  explored: (s, u) => {
    if (s.fogBarrow && u.code === FB.ancient) releaseBuried(s, u, true);
  },
  hostLeaves: (s, u) => {
    const q = s.fogBarrow;
    if (!q || u.code !== FB.ancient) return;
    // An explored Ancient Barrow returns the allies when it is explored.
    if (u.progress >= (card(u.code).quest ?? 0)) return;
    releaseBuried(s, u, false);
  },
  // A Wight's forced effect: the attack destroyed a character.
  characterDestroyed: (s, u, context) => {
    const c = s.combat;
    if (
      !s.fogBarrow ||
      !c ||
      !(isHero(u) || isAlly(u)) ||
      !context.combatDamage ||
      context.enemyId !== c.enemyId
    )
      return;
    c.fbVictims = [...(c.fbVictims ?? []), ownerOf(s, u)];
  },
  attackFinished,
  playerEliminated: (s, player) => {
    const q = s.fogBarrow;
    if (!q) return;
    const atLost =
      q.currentQuest === FB.lost ||
      q.areas.some((a) => a.id === FB_STAGE_THREE);
    if (q.split) {
      if (fbArea(s, player)?.id === fbBarrowArea(player))
        discardBarrow(s, player);
      else {
        const stageThree = stageThreeArea(s);
        if (stageThree)
          stageThree.players = stageThree.players.filter((x) => x !== player);
      }
    }
    if (!atLost) return;
    // 3B: after a player is eliminated (at any stage), each player at this
    // stage raises his threat by 10.
    const atStageThree = q.split
      ? (stageThreeArea(s)?.players ?? [])
      : globalPlayerOrder(s);
    const living = atStageThree.filter(
      (x) => x !== player && globalPlayerOrder(s).includes(x),
    );
    if (living.length)
      prepend(
        s,
        fx("fbEliminated", {
          ids: living.map(String),
          player: living[0],
        }),
      );
  },
  effect: fogBarrowEffect,
  sharedEffect: (e) =>
    [
      "fbDefeat",
      "fbStageTwo",
      "fbStageThree",
      "fbShuffleBarrows",
      "fbHouse",
      "fbAcrossThreat",
      "fbTomLeaves",
      "fbAreaQuestDone",
      "fbEliminated",
      "fbReturn",
      "fbEscaped",
    ].includes(e.kind),
};
