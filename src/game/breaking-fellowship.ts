import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { FliesSpidersArea } from "./flies-spiders-types";
import { card, name } from "./cards";
import {
  choose,
  draw,
  encounterDraw,
  enemyAttackPrevented,
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
} from "./core";
import {
  damage,
  destroy,
  discardAttachment,
  enemyAddedToStaging,
  engage,
  questDefeated,
  raiseThreat,
  readyCharacter,
  removeFromQuest,
  win,
} from "./board";
import {
  activeSeat,
  allCharacters,
  attachmentController,
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
  startPhase,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { reduceThreat } from "./threat-reduction";
import { isEnemy } from "./ships";
import { mainQuestUnit } from "./quest-state";
import { fasSelectArea, fasSyncArea } from "./flies-spiders-support";
import { lotrSagaCheck, ringBearer } from "./lotr-saga";
import { FALLEN_INTO_EVIL } from "./enemy-conditions";
import {
  BF,
  BF_POOL,
  BF_STAGE_THREE,
  BF_STAGE_THREE_THREAT,
  BREAKING_FELLOWSHIP_RECIPES,
  bfArea,
  bfAreaUnits,
  bfCurrentQuest,
  breakingFellowshipStageInfo,
} from "./breaking-fellowship-support";
export * from "./breaking-fellowship-support";

const TREACHERIES: readonly string[] = [
  BF.growing,
  BF.whiteHand,
  BF.arrows,
  BF.fallen,
];
type Combat = NonNullable<GameState["combat"]>;
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked;
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const isEnemyCard = (code: string) => card(code).type_code === "enemy";
const isLocationCard = (code: string) => card(code).type_code === "location";
const inStaging = (s: GameState, u: Unit) =>
  s.staging.some((x) => x.id === u.id);
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const printedHealth = (u: Unit) => card(u.code).health ?? 0;
const toughness = (u: Unit) =>
  u.blanked
    ? 0
    : Number(/\bToughness (\d+)/.exec(card(u.code).text ?? "")?.[1] ?? 0);
/** The first player of the game (not only of an area). */
const globalFirst = (s: GameState) =>
  globalPlayerOrder(s)[0] ?? s.table?.first ?? 0;
const isStageThree = (c: string | undefined) =>
  !!c && BF_STAGE_THREE.includes(c);
/** The active player's stage card. */
const currentStage = (s: GameState) => bfCurrentQuest(s) ?? "";
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
  (s.breakingFellowship?.areas ?? [])
    .filter((a) => globalPlayerOrder(s).some((p) => a.players.includes(p)))
    .sort(
      (a, b) =>
        globalPlayerOrder(s).indexOf(firstOf(s, a)) -
        globalPlayerOrder(s).indexOf(firstOf(s, b)),
    );
/** An area's staging area, projected when it is the active area. */
function areaStaging(s: GameState, area: FliesSpidersArea) {
  const q = s.breakingFellowship!;
  return q.activeArea === area.id && area.players.includes(activeSeat(s))
    ? s.staging
    : area.staging;
}
/** Remove a unit from whichever staging area holds it. */
function takeFromStaging(s: GameState, u: Unit) {
  const q = s.breakingFellowship!;
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
/** Every staging-area unit of every area. */
function allStaging(s: GameState): Unit[] {
  const q = s.breakingFellowship;
  if (!q?.split) return [...s.staging];
  return q.areas.flatMap((a) => [...areaStaging(s, a)]);
}
/** Put a unit into a player's staging area. */
function addToStaging(s: GameState, u: Unit, player: number) {
  forOwner(s, player, () => {
    s.staging.push(u);
    if (isEnemy(u)) enemyAddedToStaging(s, u);
  });
}
/** A player engages an enemy from any staging area. */
function engageAcross(s: GameState, u: Unit, player: number) {
  if (!takeFromStaging(s, u)) return;
  forOwner(s, player, () => {
    s.staging.push(u);
    engage(s, u);
  });
}
const parthInPlay = (s: GameState) =>
  allStaging(s).some((u) => live(u, BF.parth)) ||
  bfAreaUnits(s).some((u) => live(u, BF.parth));
/** Frodo's Choice is attached to the Ring-bearer once revealed. */
const choiceInPlay = (s: GameState) =>
  globalCharacters(s).some((u) =>
    u.attachments.some((a) => a.code === BF.choice),
  );
const fallenRecord = (s: GameState, u: Unit) =>
  s.breakingFellowship?.fallen.find((x) => x.id === u.id);
const isFallen = (u: Unit) =>
  u.attachments.some((a) => a.code === FALLEN_INTO_EVIL && !a.blanked);

// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupBreakingFellowship(s: GameState) {
  const r = BREAKING_FELLOWSHIP_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, section("sharedEncounterDeck"));
  for (const c of section("sharedStagingArea")) s.staging.push(make(s, c));
  s.breakingFellowship = {
    currentQuest: BF.river,
    advancing: false,
    setAside: section("sharedSetAside"),
    resolving: [],
    ringBearerOut: null,
    zeroEngagementRound: 0,
    skipTravelRound: 0,
    split: false,
    areas: [],
    resolvedAreas: [],
    travelPassedAreas: [],
    frodoPlayer: null,
    engagedRound: 0,
    engagedPlayers: [],
    arrows: [],
    whiteHand: [],
    fallen: [],
    ended: [],
  };
  log(
    s,
    "The Great River: Frodo's Choice, Seat of Seeing and Parth Galen are set aside, out of play; The Argonath and Sarn Gebir enter the staging area.",
    "chapter",
  );
}
function stageFourArea(s: GameState) {
  return s.breakingFellowship?.areas.find((a) => a.questCode === BF.setsOut);
}
function advance(s: GameState) {
  const q = s.breakingFellowship;
  if (!q) return false;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length
  )
    return true;
  // Stage 1: 12 progress, once The Argonath has left play.
  if (!q.split && q.currentQuest === BF.river) {
    if (s.progress < 12 || stageLive(s) === false) return true;
    if (bfAreaUnits(s).some((u) => u.code === BF.argonath)) return true;
    q.advancing = true;
    prepend(s, fx("btfDefeatQuest", { player: firstPlayer(s) }));
    return true;
  }
  // Stage 4: 16 progress wins, unless Parth Galen is in play.
  const area = stageFourArea(s);
  const atFour = q.split ? !!area : q.currentQuest === BF.setsOut;
  if (!atFour) return true;
  const progress =
    !q.split ||
    (area!.id === q.activeArea && area!.players.includes(activeSeat(s)))
      ? s.progress
      : area!.progress;
  if (progress < 16 || parthInPlay(s)) return true;
  win(s);
  s.reason =
    "The Ring-bearer Sets Out is defeated: Frodo leaves the Company and sets out for Mordor.";
  return true;
}
function check(s: GameState) {
  const q = s.breakingFellowship;
  if (!q || s.status !== "playing") return;
  // The One Ring left with the Ring-bearer while removed from the game.
  if (!q.ringBearerOut) lotrSagaCheck(s);
}

// ---------------------------------------------------------------------------
// Encounter cards and shadows.

function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.breakingFellowship;
  if (!q) return false;
  const player = activeSeat(s);
  if (code === BF.choice) {
    const u = [...s.staging].reverse().find((x) => x.code === code);
    if (u) prepend(s, fx("btfChoice", { target: u.id, player }));
    return true;
  }
  if ([BF.hunter, BF.archer].includes(code as never)) {
    if (!fromReveal) return true;
    const u = [...s.staging].reverse().find((x) => x.code === code);
    prepend(
      s,
      fx(code === BF.hunter ? "btfHunter" : "btfArcher", {
        target: u?.id,
        player,
      }),
    );
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
    fx("btfTreachery", { code, source: u.id, player }),
    fx("btfTreacheryDone", { source: u.id, player }),
  );
  return true;
}
/** "+1 attack (+2 instead if the defending character has fewer printed hit points)". */
function weakerDefender(s: GameState, c: Combat) {
  const enemy = get(s, c.enemyId);
  const defender = get(s, c.defenderIds?.[0] ?? c.defenderId ?? undefined);
  return (
    !!enemy && !!defender && printedHealth(defender) < printedHealth(enemy)
  );
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !s.breakingFellowship) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  switch (code) {
    case BF.slopes:
    case BF.arrows: {
      const bonus = weakerDefender(s, c) ? 2 : 1;
      c.attackBonus += bonus;
      log(
        s,
        `${card(code).name}: the attacking enemy gets +${bonus} attack.`,
        "danger",
      );
      return true;
    }
    case BF.whiteHand:
      if (weakerDefender(s, c)) {
        c.defenderId = null;
        c.defenderIds = [];
        log(
          s,
          "Orcs of the White Hand: the defending character has fewer printed hit points than the attacking enemy, so this attack is considered undefended.",
          "danger",
        );
      } else log(s, "Orcs of the White Hand: the shadow has no effect.");
      return true;
    case BF.tracker:
      prepend(s, fx("btfDiscardAttachment", { player: p }));
      return true;
    case BF.captain:
      c.extraAttacks = (c.extraAttacks ?? 0) + 1;
      log(
        s,
        "Uruk-hai Captain: the attacking enemy makes an additional attack after this one.",
        "danger",
      );
      return true;
    case BF.growing:
      c.btfGrowing = true;
      log(
        s,
        "Growing Threat: after this attack, the attacking enemy moves to the first player's staging area.",
        "danger",
      );
      return true;
  }
  return false;
}
function treachery(s: GameState, code: string, source: string) {
  const q = s.breakingFellowship!;
  const p = activeSeat(s);
  switch (code) {
    case BF.growing: {
      const engaged = seatView(s, p).engaged.filter((u) => isEnemy(u));
      const doomed: Option = {
        id: "doomed",
        label: "Growing Threat gains doomed 2 and surge",
        effects: [fx("btfGrowingDoomed", { code, player: p })],
      };
      if (!engaged.length) {
        log(
          s,
          `Growing Threat: no enemy is engaged with ${who(s, p)}, so it gains doomed 2 and surge.`,
          "danger",
        );
        prepend(s, ...doomed.effects);
        return;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Growing Threat · Choose${seatLabel(s, p)}`,
          [
            ...engaged.map((u) => ({
              id: u.id,
              code: u.code,
              label: `Move ${name(u)} to the first player's staging area`,
              effects: [fx("btfMoveToFirst", { target: u.id, player: p })],
            })),
            doomed,
          ],
          "Peril.",
        ),
      );
      return;
    }
    case BF.whiteHand: {
      const enemies = [
        ...s.staging.filter((u) => isEnemy(u)),
        ...playerOrder(s).flatMap((x) => seatView(s, x).engaged),
      ];
      for (const u of enemies) {
        u.damage = 0;
        q.whiteHand = q.whiteHand.filter((x) => x.round === s.round);
        if (!q.whiteHand.some((x) => x.id === u.id))
          q.whiteHand.push({ id: u.id, round: s.round });
      }
      log(
        s,
        `Orcs of the White Hand: ${enemies.length ? `${enemies.map((u) => name(u)).join(", ")} ${enemies.length === 1 ? "loses" : "lose"} all damage and ${enemies.length === 1 ? "gets" : "get"} +1 threat, +1 attack and +1 defense until the end of the round` : "there is no enemy at this stage"}.`,
        "danger",
      );
      return;
    }
    case BF.arrows: {
      const allies = allCharacters(s).filter(isAlly).length;
      const area = bfArea(s)?.id ?? "shared";
      q.arrows = q.arrows.filter((x) => x.round === s.round);
      if (allies) q.arrows.push({ area, round: s.round, value: allies });
      log(
        s,
        `Black Feathered Arrows: ${allies} ${allies === 1 ? "ally is" : "allies are"} at this stage; the archery total here gets +${allies} until the end of the round.`,
        allies ? "danger" : "normal",
      );
      return;
    }
    case BF.fallen: {
      const heroes = globalCharacters(s).filter(
        (u) => isHero(u) && card(u.code).sphere_code !== "fellowship",
      );
      if (!heroes.length) {
        log(s, "Fallen into Evil: there is no non-Fellowship hero in play.");
        return;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Fallen into Evil · Attach to a non-Fellowship hero${seatLabel(s, p)}`,
          heroes.map((h) => ({
            id: h.id,
            code: h.code,
            label: `${name(h)}${s.table ? ` · ${seatName(s, ownerOf(s, h))}` : ""}`,
            effects: [fx("btfFallen", { target: h.id, source, player: p })],
          })),
          "The hero becomes an enemy in the first player's staging area, with threat equal to its willpower and engagement cost equal to its threat cost.",
        ),
      );
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Effects.

function divide(s: GameState) {
  const q = s.breakingFellowship!;
  // Seat of Seeing and Frodo's Choice join the discard pile, which goes to
  // the bottom of the encounter deck.
  for (const c of [BF.seeing, BF.choice]) {
    const i = q.setAside.indexOf(c);
    if (i >= 0) {
      q.setAside.splice(i, 1);
      s.encounterDiscard.push(c);
    }
  }
  shuffle(s, s.encounterDiscard);
  s.encounterDeck.push(...s.encounterDiscard.splice(0));
  log(
    s,
    "The Company Divided: Seat of Seeing and Frodo's Choice are shuffled into the encounter discard pile, which is placed on the bottom of the encounter deck.",
    "chapter",
  );
  const players = globalPlayerOrder(s);
  if (players.length <= 1) {
    prepend(
      s,
      fx("btfPickStage", { player: players[0] ?? 0 }),
      fx("btfStageThree", { player: players[0] ?? 0 }),
    );
    return;
  }
  // Each player creates his own staging area; the stage 2 cards wait in a
  // shared pool until they are shared out.
  const pool: FliesSpidersArea = {
    ...emptyArea(BF_POOL, [], BF.divided),
    staging: s.staging,
  };
  const areas = players.map((p) => emptyArea(`btf-${p}`, [p], BF.divided));
  // The active location stays at its stage with the first player.
  areas[0].activeLocation = s.activeLocation;
  areas[0].extraActiveLocations = s.extraActiveLocations ?? [];
  q.areas = [pool, ...areas];
  q.split = true;
  q.activeArea = undefined;
  q.resolvedAreas = [];
  q.travelPassedAreas = [];
  s.staging = [];
  s.activeLocation = null;
  s.extraActiveLocations = [];
  s.progress = 0;
  fasSelectArea(s, activeSeat(s));
  prepend(
    s,
    ...players.map((player) => fx("btfPickStage", { player })),
    fx("btfShare", { value: 0, player: players[0] }),
    fx("btfStageThree", { player: players[0] }),
  );
}
/** A unit anywhere in play, in any player's area. */
const findUnit = (s: GameState, id?: string) =>
  id === undefined
    ? undefined
    : (get(s, id) ??
      [...globalCharacters(s), ...globalEngaged(s), ...bfAreaUnits(s)].find(
        (u) => u.id === id,
      ));
export function breakingFellowshipEffect(s: GameState, e: Effect): boolean {
  const q = s.breakingFellowship;
  if (!q) return false;
  // Each separate stage makes its own travel decision: a player who travels
  // ends only his own stage's travel phase.
  if (e.kind === "travelDone" && q.split) {
    passTravel(s);
    return true;
  }
  // The Great River: skip the encounter phase; River Anduin at the end of
  // the travel phase; The Argonath: skip the combat phase.
  if (e.kind === "startEncounter" && e.text !== "btf-river") {
    const rivers = riverEffects(s);
    if (rivers.length) {
      prepend(s, ...rivers, { ...e, text: "btf-river" });
      return true;
    }
  }
  if (
    e.kind === "startEncounter" &&
    !q.split &&
    q.currentQuest === BF.river &&
    stageLive(s)
  ) {
    log(s, "The Great River: the players skip the encounter phase.");
    prepend(s, fx("startCombat", { player: firstPlayer(s) }));
    return true;
  }
  if (
    e.kind === "startCombat" &&
    bfAreaUnits(s).some(
      (u) => live(u, BF.argonath) && !allStaging(s).some((x) => x.id === u.id),
    )
  ) {
    log(
      s,
      "The Argonath is the active location: the players skip the combat phase.",
    );
    startPhase(s, "defense");
    prepend(s, fx("phaseEnd"), fx("endCombat"));
    return true;
  }
  if (!e.kind.startsWith("btf")) return false;
  const first = firstPlayer(s);
  const p = e.player ?? activeSeat(s),
    u = findUnit(s, e.target);
  switch (e.kind) {
    case "btfDefeatQuest": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(s, ...responses, fx("btfStageTwo", { player: first }));
      return true;
    }
    case "btfStageTwo": {
      q.advancing = false;
      s.stage = 2;
      s.progress = 0;
      q.currentQuest = BF.divided;
      log(s, "The Company Divided begins.", "chapter");
      // Remove the Ring-bearer and its cards from the game; The One Ring's
      // text is blank while this resolves.
      const bearer = ringBearer(s);
      if (bearer) {
        const owner = ownerOf(s, bearer);
        forOwner(s, owner, () => {
          removeFromQuest(s, bearer);
          s.heroes = s.heroes.filter((h) => h.id !== bearer.id);
          s.committedIds = s.committedIds.filter((id) => id !== bearer.id);
        });
        Object.assign(bearer, {
          damage: 0,
          resources: 0,
          exhausted: false,
          committed: false,
        });
        q.ringBearerOut = bearer;
        log(
          s,
          `The Company Divided: ${name(bearer)} and the cards attached to it are removed from the game.`,
          "danger",
        );
      }
      q.zeroEngagementRound = s.round;
      q.skipTravelRound = s.round;
      log(
        s,
        "The Company Divided: each enemy's engagement cost is 0 until the end of the encounter phase, and the players skip the travel phase this round.",
        "danger",
      );
      return true;
    }
    case "btfDivide":
      divide(s);
      return true;
    case "btfPickStage": {
      const taken = q.split
        ? q.areas.map((a) => a.questCode)
        : [q.currentQuest];
      const options = BF_STAGE_THREE.filter((c) => !taken.includes(c));
      choose(
        s,
        `The Company Divided · Advance to a different stage 3A${seatLabel(s, p)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: card(c).name,
          effects: [fx("btfSetStage", { code: c, player: p })],
        })),
      );
      return true;
    }
    case "btfSetStage": {
      if (!e.code) return true;
      if (q.split) {
        const area = bfArea(s, p);
        if (area) area.questCode = e.code;
      } else q.currentQuest = e.code;
      log(
        s,
        `The Company Divided: ${who(s, p)} advance${s.table ? "s" : ""} to ${card(e.code).name}.`,
      );
      return true;
    }
    case "btfShare": {
      const pool = q.areas.find((a) => a.id === BF_POOL);
      if (!pool || !pool.staging.length) return true;
      const order = globalPlayerOrder(s);
      const player = order[(e.value ?? 0) % order.length];
      const next = ((e.value ?? 0) + 1) % order.length;
      forOwner(s, player, () =>
        choose(
          s,
          `The Company Divided · Move an encounter card to your staging area${seatLabel(s, player)}`,
          pool.staging.map((x) => ({
            id: x.id,
            code: x.code,
            label: name(x),
            effects: [
              fx("btfTake", { target: x.id, player }),
              fx("btfShare", { value: next, player: order[next] }),
            ],
          })),
          "In player order, each player moves 1 encounter card from stage 2's staging area to his until none is left.",
        ),
      );
      return true;
    }
    case "btfTake": {
      const pool = q.areas.find((a) => a.id === BF_POOL);
      const i = pool?.staging.findIndex((x) => x.id === e.target) ?? -1;
      if (!pool || i < 0) return true;
      const [x] = pool.staging.splice(i, 1);
      forOwner(s, p, () => s.staging.push(x));
      log(
        s,
        `The Company Divided: ${who(s, p)} move${s.table ? "s" : ""} ${name(x)} to ${s.table ? "their" : "your"} staging area.`,
      );
      return true;
    }
    case "btfStageThree": {
      s.stage = 3;
      if (q.split) {
        fasSyncArea(s);
        q.areas = q.areas.filter((a) => a.id !== BF_POOL);
        log(s, "The Company Divided is discarded.", "chapter");
        prepend(
          s,
          ...orderedAreas(s).map((a) =>
            fx("btfThreeA", { player: firstOf(s, a) }),
          ),
        );
      } else {
        s.progress = 0;
        log(s, "The Company Divided is discarded.", "chapter");
        prepend(s, fx("btfThreeA", { player: p }));
      }
      return true;
    }
    case "btfThreeA": {
      const threat = stagingThreat(s);
      if (threat >= BF_STAGE_THREE_THREAT) return true;
      log(
        s,
        `${card(currentStage(s)).name}: the encounter cards in this staging area total ${threat} threat (less than ${BF_STAGE_THREE_THREAT}), so 1 encounter card is revealed.`,
        "danger",
      );
      prepend(s, fx("reveal", { player: p }));
      return true;
    }
    case "btfChoice": {
      if (!u) return true;
      takeFromStaging(s, u);
      const bearer = q.ringBearerOut;
      log(
        s,
        `Frodo's Choice: ${who(s, p)} take${s.table ? "s" : ""} control of the first player token${bearer ? ` and ${name(bearer)}` : ""}, for the rest of the game.`,
        "chapter",
      );
      if (s.table) s.table.first = p;
      q.frodoPlayer = p;
      if (bearer) {
        q.ringBearerOut = null;
        bearer.owner = p;
        bearer.controller = p;
        bearer.attachments.push({
          id: u.id,
          code: BF.choice,
          exhausted: false,
        });
        forOwner(s, p, () => s.heroes.push(bearer));
      } else s.encounterDiscard.push(BF.choice);
      prepend(s, fx("btfStageFour", { player: p }));
      return true;
    }
    case "btfStageFour": {
      if (q.split) {
        const area = bfArea(s, p);
        if (area) area.questCode = BF.setsOut;
      } else q.currentQuest = BF.setsOut;
      s.stage = 4;
      s.progress = 0;
      log(s, "The Ring-bearer Sets Out begins.", "chapter");
      const i = q.setAside.indexOf(BF.parth);
      if (i >= 0) {
        q.setAside.splice(i, 1);
        s.staging.push(make(s, BF.parth));
        log(
          s,
          "The Ring-bearer Sets Out: Parth Galen is added to the staging area.",
          "danger",
        );
      }
      if (["quest", "staging"].includes(s.phase)) {
        const id = bfArea(s, p)?.id ?? "shared";
        if (!q.ended.includes(id)) q.ended.push(id);
        log(
          s,
          "The Ring-bearer Sets Out: it is the quest phase, so the phase ends at this stage without resolving the quest.",
        );
      }
      return true;
    }
    case "btfTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (held) treachery(s, held.code, held.id);
      return true;
    }
    case "btfTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      return true;
    }
    case "btfGrowingDoomed": {
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, 2, "encounter"));
      log(
        s,
        "Growing Threat gains doomed 2 and surge: each player at this stage raises his threat by 2.",
        "danger",
      );
      prepend(
        s,
        fx("amonSurgeWindow", { code: e.code, player: p }),
        fx("reveal", { player: p }),
      );
      return true;
    }
    case "btfMoveToFirst": {
      if (!u) return true;
      const owner = ownerOf(s, u);
      let moved = false;
      for (const x of globalPlayerOrder(s))
        forOwner(s, x, () => {
          if (s.engaged.some((y) => y.id === u.id)) {
            s.engaged = s.engaged.filter((y) => y.id !== u.id);
            moved = true;
          }
        });
      if (!moved && !takeFromStaging(s, u)) return true;
      s.encounterDiscard.push(...u.shadows);
      u.shadows = [];
      delete u.faceupShadows;
      u.revealedShadowCount = 0;
      addToStaging(s, u, globalFirst(s));
      log(
        s,
        `${name(u)} moves to the first player's staging area${owner !== globalFirst(s) && s.table ? ` (${seatName(s, globalFirst(s))})` : ""}.`,
        "danger",
      );
      return true;
    }
    case "btfFallen": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (!u || !isHero(u) || !held) return true;
      const owner = ownerOf(s, u);
      forOwner(s, owner, () => {
        removeFromQuest(s, u);
        s.heroes = s.heroes.filter((h) => h.id !== u.id);
        s.committedIds = s.committedIds.filter((id) => id !== u.id);
      });
      q.resolving = q.resolving.filter((x) => x.id !== held.id);
      u.attachments.push({ id: held.id, code: BF.fallen, exhausted: false });
      u.owner = owner;
      u.exhausted = false;
      q.fallen.push({ id: u.id, owner });
      addToStaging(s, u, globalFirst(s));
      log(
        s,
        `Fallen into Evil: ${name(u)} becomes an enemy in the first player's staging area.`,
        "danger",
      );
      return true;
    }
    case "btfHunter": {
      const order = globalPlayerOrder(s);
      const options: Option[] = order.map((x) => ({
        id: `reveal-${x}`,
        label: `${s.table ? seatName(s, x) : "You"} reveal${s.table ? "s" : ""} an encounter card`,
        effects: [fx("reveal", { player: x })],
      }));
      if (u && inStaging(s, u) && !enemyAttackPrevented(s, u))
        options.push({
          id: "attack",
          label: "Uruk-hai Hunter makes an immediate attack against you",
          effects: [fx("immediateAttack", { target: u.id, player: p })],
        });
      forOwner(s, p, () =>
        choose(
          s,
          `Uruk-hai Hunter · Choose${seatLabel(s, p)}`,
          options,
          "Peril.",
        ),
      );
      return true;
    }
    case "btfArcher": {
      const allies = seatView(s, p).allies.filter(isAlly);
      if (!allies.length) {
        log(
          s,
          `Uruk-hai Archer: ${who(s, p)} control${s.table ? "s" : ""} no ally.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Uruk-hai Archer · Discard an ally you control${seatLabel(s, p)}`,
          allies.map((a) => ({
            id: a.id,
            code: a.code,
            label: name(a),
            effects: [fx("btfDiscardAlly", { target: a.id, player: p })],
          })),
          "Peril.",
        ),
      );
      return true;
    }
    case "btfDiscardAlly":
      if (u) {
        log(s, `${name(u)} is discarded.`, "danger");
        forOwner(s, ownerOf(s, u), () => destroy(s, u, false));
      }
      return true;
    case "btfDiscardAttachment": {
      const hosts = [...globalCharacters(s), ...allStaging(s), ...s.engaged];
      const choices = hosts.flatMap((host) =>
        host.attachments
          .filter(
            (a) =>
              attachmentController(s, host, a) === p &&
              card(a.code).type_code !== "objective",
          )
          .map((a) => ({ host, a })),
      );
      if (!choices.length) {
        log(
          s,
          `Uruk-hai Tracker: ${who(s, p)} control${s.table ? "s" : ""} no non-objective attachment.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Uruk-hai Tracker · Discard a non-objective attachment you control${seatLabel(s, p)}`,
          choices.map(({ host, a }) => ({
            id: a.id,
            code: a.code,
            label: `${card(a.code).name} · ${name(host)}`,
            effects: [
              fx("btfDropAttachment", {
                target: host.id,
                source: a.id,
                player: p,
              }),
            ],
          })),
        ),
      );
      return true;
    }
    case "btfDropAttachment": {
      const a = u?.attachments.find((x) => x.id === e.source);
      if (u && a) {
        log(s, `${card(a.code).name} is discarded.`, "danger");
        forOwner(s, p, () => discardAttachment(s, u, a));
      }
      return true;
    }
    case "btfRiver": {
      if (!u || !inStaging(s, u)) return true;
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, 1, "encounter"));
      log(
        s,
        "River Anduin: each player at this stage raises his threat by 1.",
        "danger",
      );
      if (!q.split) return true;
      const order = globalPlayerOrder(s);
      const here = bfArea(s, p);
      const areas = orderedAreas(s);
      if (!here || areas.length <= 1) return true;
      // The staging area to the left: the next player's.
      const at = order.indexOf(firstOf(s, here));
      const target = order
        .slice(at + 1)
        .concat(order.slice(0, at))
        .map((x) => bfArea(s, x))
        .find((a) => a && a.id !== here.id);
      if (!target) return true;
      s.staging = s.staging.filter((x) => x.id !== u.id);
      addToStaging(s, u, firstOf(s, target));
      log(
        s,
        `River Anduin moves to the staging area to the left (${seatName(s, firstOf(s, target))}).`,
        "danger",
      );
      return true;
    }
    case "btfSearch": {
      // Wooded Shoreline and Parth Galen: search the encounter deck and
      // discard pile for an enemy for this staging area.
      const options: Option[] = [];
      for (const [zone, cards] of [
        ["deck", s.encounterDeck],
        ["discard", s.encounterDiscard],
      ] as const)
        for (const c of [...new Set(cards.filter(isEnemyCard))])
          options.push({
            id: `${zone}-${c}`,
            code: c,
            label: `${card(c).name} · ${zone === "deck" ? "encounter deck" : "discard pile"}`,
            effects: [fx("btfFound", { code: c, text: zone, player: p })],
          });
      if (!options.length) {
        log(
          s,
          `${e.source ? card(e.source).name : "Travel"}: no enemy is found in the encounter deck or discard pile.`,
        );
        shuffle(s, s.encounterDeck);
        return true;
      }
      choose(
        s,
        `${e.source ? card(e.source).name : "Travel"} · Search for an enemy for the staging area${seatLabel(s, p)}`,
        options,
        "Then the encounter deck is shuffled.",
      );
      return true;
    }
    case "btfFound": {
      const pile = e.text === "deck" ? s.encounterDeck : s.encounterDiscard;
      const i = pile.lastIndexOf(e.code!);
      if (i >= 0) {
        pile.splice(i, 1);
        const x = make(s, e.code!);
        s.staging.push(x);
        enemyAddedToStaging(s, x);
        log(
          s,
          `${card(e.code!).name} is added to the staging area from the ${e.text === "deck" ? "encounter deck" : "discard pile"}.`,
          "danger",
        );
      }
      shuffle(s, s.encounterDeck);
      return true;
    }
    case "btfSlopes": {
      const enemies = allStaging(s).filter((x) => isEnemy(x));
      if (!enemies.length) return true;
      choose(
        s,
        `Slopes of Amon Hen · Engage an enemy in any staging area${seatLabel(s, p)}`,
        enemies.map((x) => ({
          id: x.id,
          code: x.code,
          label: name(x),
          effects: [fx("btfEngage", { target: x.id, player: p })],
        })),
        "A player at this staging area must engage an enemy to travel here.",
      );
      return true;
    }
    case "btfEngage":
      if (u) engageAcross(s, u, p);
      return true;
    case "btfSarnGebir": {
      const exhausted = allCharacters(s).filter((x) => x.exhausted);
      log(
        s,
        `Sarn Gebir is explored: 1 damage is dealt to each exhausted character${exhausted.length ? "" : " (none is exhausted)"}.`,
        "danger",
      );
      for (const x of exhausted) damage(s, x.id, 1);
      return true;
    }
    case "btfSetsOutOffer": {
      if (!u || !allStaging(s).some((x) => x.id === u.id)) return true;
      if (q.engagedRound !== s.round) {
        q.engagedRound = s.round;
        q.engagedPlayers = [];
      }
      const players = globalPlayerOrder(s).filter(
        (x) => !q.engagedPlayers.includes(x),
      );
      if (!players.length) return true;
      const x = threatOfUnit(s, u);
      choose(
        s,
        `The Ring-bearer Sets Out · Response: raise your threat by ${x} to engage ${name(u)}`,
        [
          ...players.map((player) => ({
            id: `engage-${player}`,
            label: `${s.table ? seatName(s, player) : "You"} raise${s.table ? "s" : ""} threat by ${x} and engage${s.table ? "s" : ""} ${name(u)}`,
            effects: [
              fx("btfSetsOutEngage", { target: u.id, value: x, player }),
            ],
          })),
          { id: "skip", label: "Do not trigger the response", effects: [] },
        ],
        "Each player, at any stage, may trigger this response once per round.",
      );
      return true;
    }
    case "btfSetsOutEngage": {
      if (!u) return true;
      if (q.engagedRound !== s.round) {
        q.engagedRound = s.round;
        q.engagedPlayers = [];
      }
      q.engagedPlayers.push(p);
      forOwner(s, p, () => raiseThreat(s, e.value ?? 0, "cost"));
      log(
        s,
        `The Ring-bearer Sets Out: ${who(s, p)} raise${s.table ? "s" : ""} threat by ${e.value ?? 0} to engage ${name(u)}.`,
      );
      engageAcross(s, u, p);
      return true;
    }
    case "btfStageResponse": {
      const stage = currentStage(s);
      if (!isStageThree(stage)) return true;
      const skip: Option = {
        id: "skip",
        label: "Do not trigger the response",
        effects: [],
      };
      const players = globalPlayerOrder(s);
      let options: Option[] = [];
      if (stage === BF.woods)
        options = allStaging(s)
          .filter((x) => isLocationCard(x.code) && !card(x.code).is_unique)
          .map((x) => ({
            id: x.id,
            code: x.code,
            label: `Discard ${name(x)}`,
            effects: [fx("btfDiscardLocation", { target: x.id, player: p })],
          }));
      else if (stage === BF.hobbits)
        options = players.map((x) => ({
          id: `ready-${x}`,
          label: `Ready each of ${s.table ? `${seatName(s, x)}'s` : "your"} heroes`,
          effects: [fx("btfReadyHeroes", { player: x })],
        }));
      else if (stage === BF.seat)
        options = players.map((x) => ({
          id: `draw-${x}`,
          label: `${s.table ? seatName(s, x) : "You"} draw${s.table ? "s" : ""} 2 cards and lower${s.table ? "s" : ""} threat by 2`,
          effects: [fx("btfSeatDraw", { player: x })],
        }));
      else if (stage === BF.hunting)
        options = players.flatMap((x) =>
          seatView(s, x).engaged.map((y) => ({
            id: y.id,
            code: y.code,
            label: `Discard ${name(y)}${s.table ? ` · ${seatName(s, x)}` : ""}`,
            effects: [fx("btfDiscardEnemy", { target: y.id, player: x })],
          })),
        );
      if (!options.length) return true;
      choose(
        s,
        `${card(stage).name} · Response: after you quest successfully`,
        [...options, skip],
      );
      return true;
    }
    case "btfDiscardLocation":
      if (u && takeFromStaging(s, u)) {
        for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
        s.encounterDiscard.push(u.code);
        log(s, `Searching the Woods: ${name(u)} is discarded.`, "good");
      }
      return true;
    case "btfReadyHeroes":
      for (const h of [...s.heroes].filter((x) => x.exhausted))
        readyCharacter(s, h);
      log(s, `Guard the Hobbits: ${who(s, p)} ready each hero.`, "good");
      return true;
    case "btfSeatDraw":
      draw(s, 2);
      reduceThreat(s, 2, undefined, "quest-card");
      log(
        s,
        `The Seat of Amon Hen: ${who(s, p)} draw${s.table ? "s" : ""} 2 cards and lower${s.table ? "s" : ""} threat by 2.`,
        "good",
      );
      return true;
    case "btfDiscardEnemy":
      if (u) {
        log(s, `Orc Hunting: ${name(u)} is discarded.`, "good");
        forOwner(s, ownerOf(s, u), () => destroy(s, u, false));
      }
      return true;
    case "btfAreaStaging": {
      const extra =
        currentStage(s) === BF.setsOut && stageLive(s)
          ? globalPlayerOrder(s).length
          : 0;
      const count = playerOrder(s).length + extra;
      prepend(
        s,
        ...Array.from({ length: count }, () => fx("reveal", { player: p })),
        fx("khazadStagingEnd", { player: p }),
      );
      return true;
    }
    case "btfAreaQuestDone": {
      fasSyncArea(s);
      // An eliminated player's area may have been discarded meanwhile.
      if (
        q.areas.some((a) => a.id === e.text) &&
        !q.resolvedAreas.includes(e.text!)
      )
        q.resolvedAreas.push(e.text!);
      selectNextArea(s);
      return true;
    }
    default:
      return true;
  }
}
/** The next area to resolve its quest; areas whose quest phase ended are skipped. */
function selectNextArea(s: GameState) {
  const q = s.breakingFellowship!;
  for (;;) {
    const next = orderedAreas(s).find((a) => !q.resolvedAreas.includes(a.id));
    if (!next) {
      prepend(s, fx("finishQuestPhase", { player: s.table?.first ?? 0 }));
      return;
    }
    if (q.ended.includes(next.id)) {
      q.resolvedAreas.push(next.id);
      continue;
    }
    const p = firstOf(s, next);
    selectSeat(s, p);
    if (s.table) s.table.turn = p;
    return;
  }
}
const threatOfUnit = (s: GameState, u: Unit) =>
  (card(u.code).threat ?? 0) + threatBonus(s, u);
function riverEffects(s: GameState): Effect[] {
  const q = s.breakingFellowship!;
  if (q.skipTravelRound === s.round) return [];
  if (!q.split)
    return s.staging
      .filter((u) => live(u, BF.anduin))
      .map((u) => fx("btfRiver", { target: u.id, player: firstPlayer(s) }));
  return orderedAreas(s).flatMap((a) =>
    areaStaging(s, a)
      .filter((u) => live(u, BF.anduin))
      .map((u) => fx("btfRiver", { target: u.id, player: firstOf(s, a) })),
  );
}

// ---------------------------------------------------------------------------
// Hooks.

function threatBonus(s: GameState, u: Unit) {
  const q = s.breakingFellowship;
  if (!q || u.blanked) return 0;
  let bonus = 0;
  // The Argonath: X is the number of players in the game.
  if (u.code === BF.argonath) bonus += globalPlayerOrder(s).length;
  // Uruk-hai Archer: X is the number of players at this stage.
  if (u.code === BF.archer) bonus += playerOrder(s).length;
  if (q.whiteHand.some((x) => x.id === u.id && x.round === s.round)) bonus += 1;
  // Fallen into Evil: threat equal to the hero's willpower.
  if (isFallen(u) && fallenRecord(s, u))
    bonus += (card(u.code).willpower ?? 0) - (card(u.code).threat ?? 0);
  return bonus;
}
function beginStaging(s: GameState) {
  const q = s.breakingFellowship;
  if (!q?.split) return false;
  q.resolvedAreas = [];
  const areas = orderedAreas(s);
  for (const area of areas)
    enqueue(
      s,
      fx("btfAreaStaging", { text: area.id, player: firstOf(s, area) }),
    );
  enqueue(s, fx("questReady", { player: firstOf(s, areas[0]) }));
  return true;
}
function resolveQuest(s: GameState) {
  const q = s.breakingFellowship;
  if (!q) return false;
  if (!q.split) {
    // 4A: the quest phase ended without resolving the quest.
    if (!q.ended.includes("shared")) return false;
    log(s, "The quest is not resolved this round.");
    enqueue(s, fx("finishQuestPhase", { player: s.table?.first ?? 0 }));
    return true;
  }
  const area = bfArea(s);
  requireRule(
    area && !q.resolvedAreas.includes(area.id),
    "This staging area has already resolved its quest.",
  );
  requireRule(
    activeSeat(s) === firstOf(s, area!),
    "The player at this stage resolves its quest.",
  );
  if (q.ended.includes(area!.id)) {
    log(
      s,
      `${card(area!.questCode).name}: the quest is not resolved this round.`,
    );
    enqueue(
      s,
      fx("btfAreaQuestDone", { text: area!.id, player: activeSeat(s) }),
    );
    return true;
  }
  const will = questWill(s),
    threat = stagingThreat(s),
    net = will - threat;
  s.lastQuest = { will, threat, net };
  log(
    s,
    `${card(area!.questCode).name} · ${will} willpower − ${threat} threat = ${net}.`,
    net < 0 ? "danger" : "good",
  );
  const player = activeSeat(s);
  if (net > 0) enqueue(s, fx("questSucceeded", { value: net, player }));
  else if (net < 0) enqueue(s, fx("failedQuest", { value: -net, player }));
  enqueue(s, fx("btfAreaQuestDone", { text: area!.id, player }));
  return true;
}
function passTravel(s: GameState) {
  const q = s.breakingFellowship!;
  const area = bfArea(s);
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
function travelNext(s: GameState) {
  const q = s.breakingFellowship;
  if (!q?.split) return false;
  const area = bfArea(s);
  requireRule(
    area && activeSeat(s) === firstOf(s, area),
    "The player at this stage makes its travel decision.",
  );
  passTravel(s);
  return true;
}
function attackFinished(s: GameState, combat: Combat, skipped = false) {
  if (!s.breakingFellowship || skipped || !combat.btfGrowing) return [];
  return [
    fx("btfMoveToFirst", {
      target: combat.enemyId,
      player: combat.attackPlayer ?? firstPlayer(s),
    }),
  ];
}
/** Discard a player's stage and the encounter cards in his staging area. */
function discardArea(s: GameState, player: number) {
  const q = s.breakingFellowship!;
  const area = q.areas.find((a) => a.players.includes(player));
  if (!area) return;
  fasSyncArea(s);
  const cards = [
    ...area.staging,
    ...(area.activeLocation ? [area.activeLocation] : []),
    ...area.extraActiveLocations,
  ];
  for (const u of cards) {
    for (const a of [...u.attachments]) discardAttachment(s, u, a, true, false);
    s.encounterDiscard.push(...u.shadows);
    if (fallenRecord(s, u)) {
      seatView(s, fallenRecord(s, u)!.owner).discard.push(u.code);
      q.fallen = q.fallen.filter((x) => x.id !== u.id);
    } else s.encounterDiscard.push(u.code);
  }
  if (q.activeArea === area.id) {
    s.staging = [];
    s.activeLocation = null;
    s.extraActiveLocations = [];
    s.progress = 0;
    q.activeArea = undefined;
  }
  q.areas = q.areas.filter((a) => a.id !== area.id);
  q.resolvedAreas = q.resolvedAreas.filter((id) => id !== area.id);
  q.travelPassedAreas = q.travelPassedAreas.filter((id) => id !== area.id);
  log(
    s,
    `${card(area.questCode).name} and the encounter cards in its staging area are discarded.`,
    "danger",
  );
}

export const BREAKING_FELLOWSHIP_HOOKS: Batch4ScenarioHooks = {
  setup: setupBreakingFellowship,
  advance,
  stageInfo: breakingFellowshipStageInfo,
  check: (s) => {
    check(s);
    // Frodo's Choice is revealed instead of being discarded.
    const q = s.breakingFellowship;
    if (!q || s.status !== "playing") return;
    const i = s.encounterDiscard.indexOf(BF.choice);
    if (i < 0) return;
    s.encounterDiscard.splice(i, 1);
    log(
      s,
      "Frodo's Choice is discarded, so it is revealed instead.",
      "chapter",
    );
    prepend(s, fx("revealCard", { code: BF.choice, player: activeSeat(s) }));
  },
  encounter,
  shadow,
  questBegin: (s) => {
    const q = s.breakingFellowship;
    if (q) q.ended = [];
    return [];
  },
  // 2B: at the end of the refresh phase, the players separate.
  roundEnd: (s) => {
    const q = s.breakingFellowship;
    if (q && !q.split && q.currentQuest === BF.divided && stageLive(s))
      return [fx("btfDivide", { player: firstPlayer(s) })];
    return [];
  },
  travelBegin: (s) => {
    const q = s.breakingFellowship;
    if (!q || q.skipTravelRound !== s.round) return;
    log(s, "The Company Divided: the players skip this travel phase.");
    prepend(s, fx("phaseEnd"), fx("startEncounter"));
  },
  keepFirstPlayer: (s) => s.breakingFellowship?.frodoPlayer != null,
  extraStagingReveals: (s) => {
    const q = s.breakingFellowship;
    return q && !q.split && q.currentQuest === BF.setsOut && stageLive(s)
      ? globalPlayerOrder(s).length
      : 0;
  },
  beginStaging,
  resolveQuest,
  travelNext,
  combatBegin: (s) => {
    const q = s.breakingFellowship;
    if (!q) return;
    const areas = q.split
      ? orderedAreas(s).map((a) => ({
          id: a.id,
          player: firstOf(s, a),
          staging: areaStaging(s, a),
          players: a.players.length,
        }))
      : [
          {
            id: "shared",
            player: firstPlayer(s),
            staging: s.staging,
            players: playerOrder(s).length,
          },
        ];
    for (const a of areas) {
      const archery =
        a.staging.reduce(
          (n, u) =>
            n +
            (live(u, BF.tracker)
              ? 1
              : live(u, BF.archer)
                ? a.players
                : live(u, BF.shoreline)
                  ? 2
                  : 0),
          0,
        ) +
        q.arrows
          .filter((x) => x.area === a.id && x.round === s.round)
          .reduce((n, x) => n + x.value, 0);
      if (archery > 0)
        enqueue(s, fx("heirsArchery", { value: archery, player: a.player }));
    }
  },
  stats: (s, u) => {
    const q = s.breakingFellowship;
    if (!q || !isEnemy(u)) return {};
    let attack = 0,
      defense = 0;
    // 1B: enemies get +2 defense.
    if (!q.split && q.currentQuest === BF.river && stageLive(s)) defense += 2;
    if (q.whiteHand.some((x) => x.id === u.id && x.round === s.round)) {
      attack += 1;
      defense += 1;
    }
    return { attack, defense };
  },
  threatBonus,
  engagementBonus: (s, u) => {
    const q = s.breakingFellowship;
    if (!q || !isEnemy(u)) return 0;
    // 2A: engagement cost 0 until the end of the encounter phase.
    if (
      q.zeroEngagementRound === s.round &&
      ["quest", "staging", "travel", "encounter"].includes(s.phase)
    )
      return -1000;
    // Fallen into Evil: engagement cost equal to the hero's threat cost.
    if (isFallen(u) && fallenRecord(s, u)) return card(u.code).threat ?? 0;
    return 0;
  },
  // 1B: enemies cannot be engaged.
  cannotEngage: (s, u) => {
    const q = s.breakingFellowship;
    return (
      !!q &&
      !q.split &&
      q.currentQuest === BF.river &&
      stageLive(s) &&
      isEnemy(u)
    );
  },
  cannotOptionallyEngage: (s, u) => {
    const q = s.breakingFellowship;
    return (
      !!q &&
      !q.split &&
      q.currentQuest === BF.river &&
      stageLive(s) &&
      isEnemy(u)
    );
  },
  cannotAttach: (s, u) => !!s.breakingFellowship && live(u, BF.captain),
  // Uruk-hai Captain: allies with fewer printed hit points cannot defend.
  cannotDefend: (s, enemy, defender) =>
    !!s.breakingFellowship &&
    live(enemy, BF.captain) &&
    !!defender &&
    isAlly(defender) &&
    printedHealth(defender) < printedHealth(enemy),
  defendersDeclared: (s, enemy, defenders) => {
    // Uruk-hai Tracker: +2 attack against characters with 2 or fewer printed hit points.
    if (
      s.breakingFellowship &&
      s.combat &&
      live(enemy, BF.tracker) &&
      defenders.some((d) => printedHealth(d) <= 2)
    ) {
      s.combat.attackBonus += 2;
      log(
        s,
        "Uruk-hai Tracker gets +2 attack against a character with 2 or fewer printed hit points.",
        "danger",
      );
    }
    return [];
  },
  // Toughness X: each time damage is dealt to the enemy, reduce it by X.
  damageAmount: (s, u, amount) => {
    if (!s.breakingFellowship || !isEnemy(u) || amount <= 0) return amount;
    const t = toughness(u);
    if (!t) return amount;
    const reduced = Math.max(0, amount - t);
    log(
      s,
      `Toughness ${t}: the damage dealt to ${name(u)} is reduced to ${reduced}.`,
    );
    return reduced;
  },
  travelProblem: (s, u) => {
    const q = s.breakingFellowship;
    if (!q) return null;
    if (live(u, BF.argonath) && bfAreaUnits(s).some((x) => live(x, BF.sarn)))
      return "The players cannot travel to The Argonath while Sarn Gebir is in play.";
    if (live(u, BF.slopes)) {
      const enemies = allStaging(s).filter((x) => isEnemy(x));
      if (!enemies.length)
        return "A player at this staging area must engage an enemy in any staging area to travel here.";
      if (enemies.every((x) => BREAKING_FELLOWSHIP_HOOKS.cannotEngage!(s, x)))
        return "No enemy can be engaged to travel to Slopes of Amon Hen.";
    }
    return null;
  },
  travelEffects: (s, u) => {
    if (!s.breakingFellowship || u.blanked) return undefined;
    const p = activeSeat(s);
    if (u.code === BF.slopes) return [fx("btfSlopes", { player: p })];
    if (u.code === BF.shoreline || u.code === BF.parth)
      return [fx("btfSearch", { source: u.code, player: p })];
    return undefined;
  },
  explored: (s, u) => {
    if (!s.breakingFellowship) return;
    if (live(u, BF.sarn))
      prepend(s, fx("btfSarnGebir", { player: firstPlayer(s) }));
    if (live(u, BF.seeing))
      log(
        s,
        "Seat of Seeing is explored: there is no burden card outside campaign mode, so its response has no effect.",
      );
  },
  // 3B: progress on this quest discards encounter cards while Frodo's
  // Choice is not in play.
  progress: (s, amount, quest) => {
    const q = s.breakingFellowship;
    if (!q || amount <= 0 || quest.id !== mainQuestUnit(s)?.id) return amount;
    if (!isStageThree(currentStage(s)) || !stageLive(s) || choiceInPlay(s))
      return amount;
    let discarded = 0;
    for (let n = 0; n < amount; n++) {
      const c = encounterDraw(s);
      if (!c) break;
      if (c === BF.choice) {
        log(
          s,
          `${card(currentStage(s)).name}: ${discarded} encounter card${discarded === 1 ? " is" : "s are"} discarded instead of progress; Frodo's Choice would be discarded, so it is revealed instead.`,
          "chapter",
        );
        prepend(s, fx("revealCard", { code: c, player: activeSeat(s) }));
        return 0;
      }
      s.encounterDiscard.push(c);
      discarded++;
    }
    log(
      s,
      `${card(currentStage(s)).name}: Frodo's Choice is not in play, so ${discarded} encounter card${discarded === 1 ? " is" : "s are"} discarded instead of placing progress.`,
    );
    return 0;
  },
  successfulQuestProgress: (s) => {
    const q = s.breakingFellowship;
    if (q && isStageThree(currentStage(s)) && stageLive(s))
      prepend(s, fx("btfStageResponse", { player: activeSeat(s) }));
  },
  // 4B: an enemy revealed at this stage may be engaged by any player.
  cardEntered: (s, u, fromReveal, cancelled) => {
    const q = s.breakingFellowship;
    if (
      q &&
      fromReveal &&
      !cancelled &&
      isEnemy(u) &&
      currentStage(s) === BF.setsOut &&
      stageLive(s) &&
      inStaging(s, u)
    )
      prepend(
        s,
        fx("btfSetsOutOffer", { target: u.id, player: activeSeat(s) }),
      );
  },
  enemyDestination: (s, u) => {
    const q = s.breakingFellowship;
    const record = q && fallenRecord(s, u);
    if (!q || !record) return false;
    seatView(s, record.owner).discard.push(u.code);
    q.fallen = q.fallen.filter((x) => x.id !== u.id);
    return true;
  },
  attachmentLeaves: (s, host, a, leaving) => {
    const q = s.breakingFellowship;
    if (!q || a.code !== BF.fallen) return false;
    s.encounterDiscard.push(a.code);
    const record = fallenRecord(s, host);
    if (leaving || !record) return true;
    // Fallen into Evil is discarded: the hero returns to its owner's control.
    takeFromStaging(s, host);
    for (const x of globalPlayerOrder(s))
      forOwner(s, x, () => {
        s.engaged = s.engaged.filter((y) => y.id !== host.id);
      });
    host.attachments = host.attachments.filter((x) => x.id !== a.id);
    s.encounterDiscard.push(...host.shadows);
    host.shadows = [];
    q.fallen = q.fallen.filter((x) => x.id !== host.id);
    forOwner(s, record.owner, () => s.heroes.push(host));
    log(
      s,
      `Fallen into Evil is discarded: ${name(host)} returns to its owner's control.`,
      "good",
    );
    return true;
  },
  // A Fallen into Evil hero leaves play with its eliminated owner.
  playerEliminating: (s, player) => {
    const q = s.breakingFellowship;
    if (!q) return;
    for (const record of q.fallen.filter((x) => x.owner === player)) {
      const u = get(s, record.id);
      q.fallen = q.fallen.filter((x) => x.id !== record.id);
      if (!u) continue;
      takeFromStaging(s, u);
      for (const x of globalPlayerOrder(s))
        forOwner(s, x, () => {
          s.engaged = s.engaged.filter((y) => y.id !== u.id);
        });
      for (const a of [...u.attachments])
        if (a.code === BF.fallen) {
          u.attachments = u.attachments.filter((x) => x.id !== a.id);
          s.encounterDiscard.push(a.code);
        } else discardAttachment(s, u, a, true, false);
      s.encounterDiscard.push(...u.shadows);
      u.shadows = [];
      seatView(s, player).discard.push(u.code);
      log(
        s,
        `${name(u)} leaves play with its owner; Fallen into Evil is discarded.`,
      );
    }
  },
  playerEliminated: (s, player) => {
    const q = s.breakingFellowship;
    if (q?.split) discardArea(s, player);
  },
  attackFinished,
  effect: breakingFellowshipEffect,
  sharedEffect: (e) =>
    [
      "btfDefeatQuest",
      "btfStageTwo",
      "btfDivide",
      "btfStageThree",
      "btfShare",
      "btfAreaQuestDone",
    ].includes(e.kind),
};
