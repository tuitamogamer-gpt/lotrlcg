import type { Attachment, Effect, GameState, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
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
  questWill,
  requireRule,
  shuffle,
  stagingThreat,
  takePlayerDeck,
} from "./core";
import {
  damage,
  destroy,
  discardAttachment,
  exhaustCharacter,
  questDefeated,
  removeFromQuest,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  firstPlayer,
  forOwner,
  globalCharacters,
  globalPlayerOrder,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
} from "./table";
import { effectiveKeyword } from "./expansion-passives";
import { surgeEffects } from "./surge";
import { isEnemy } from "./ships";
import {
  OTD_RING,
  bagginsBilbo,
  hobbitTreasureDefense,
  hobbitTreasureEffect,
  hobbitTreasureKill,
  isBagginsBilbo,
  loseBilbo,
  spendBaggins,
} from "./hobbit-saga";
import { hobbitRingDefense } from "./hobbit-player-cards";
import {
  WILDERLAND_SHARED_EFFECTS,
  wilderlandAttackFinished,
  wilderlandCharacterDestroyed,
  wilderlandDamageDealt,
  wilderlandEffect,
  wilderlandPenalty,
  wilderlandShadow,
  wilderlandThreatBonus,
  wilderlandTravelEffects,
  wilderlandTravelProblem,
  wilderlandTreachery,
} from "./wilderland";
import {
  FAS as F,
  FAS_RECIPES,
  fasArea,
  fasCurrentQuest,
  fasSelectArea,
  fasStageInfo,
  fasStageNumber,
  fasSyncArea,
  type FliesSpidersArea,
} from "./flies-spiders-support";
export * from "./flies-spiders-support";

const typeOf = (u: Unit | string) =>
  card(typeof u === "string" ? u : u.code).type_code;
const isCharacter = (u: Unit) => ["hero", "ally"].includes(typeOf(u));
const traitOf = (code: string, trait: string) =>
  (card(code).traits ?? "").split(".").some((t) => t.trim() === trait);
const isSpider = (code: string) =>
  typeOf(code) === "enemy" && traitOf(code, "Spider");
export const poisonOf = (u: Unit) =>
  u.attachments.filter((a) => a.poison).length;
const printedHealth = (u: Unit) => Number(card(u.code).health ?? 0);
const inPlay = (s: GameState, u: Unit) =>
  globalCharacters(s).some((x) => x.id === u.id);
const live = (s: GameState, code: string) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => u.code === code && !u.blanked,
  );
const activeIs = (s: GameState, code: string) =>
  allActiveLocations(s).some((l) => l.code === code && !l.blanked);
const conscious = (s: GameState) =>
  allCharacters(s).filter((u) => !u.unconscious);
const areaBilbo = (s: GameState) =>
  allCharacters(s).find((u) => isBagginsBilbo(u.code));
const firstOf = (s: GameState, area: FliesSpidersArea) =>
  globalPlayerOrder(s).find((p) => area.players.includes(p)) ?? area.players[0];
/**
 * Staging areas with a living player, in first-player order. The original
 * area keeps its cards while all of its players are eliminated, so the first
 * player can still join it at stage 4.
 */
const orderedAreas = (s: GameState) =>
  (s.fliesSpiders?.areas ?? [])
    .filter((a) => globalPlayerOrder(s).some((p) => a.players.includes(p)))
    .sort(
      (a, b) =>
        globalPlayerOrder(s).indexOf(firstOf(s, a)) -
        globalPlayerOrder(s).indexOf(firstOf(s, b)),
    );

// ---------------------------------------------------------------------------
// Poison and unconsciousness (shared by every Flies and Spiders card).

function discardPoison(s: GameState, u: Unit, a: Attachment) {
  u.attachments = u.attachments.filter((x) => x.id !== a.id);
  forOwner(s, a.owner ?? ownerOf(s, u), () => s.discard.push(a.code));
}
/** Unconscious characters are rotated 180 degrees; their poison is discarded. */
export function makeUnconscious(s: GameState, u: Unit) {
  if (u.unconscious || !inPlay(s, u)) return;
  for (const a of u.attachments.filter((a) => a.poison)) discardPoison(s, u, a);
  u.unconscious = true;
  u.exhausted = true;
  if (u.committed) removeFromQuest(s, u);
  log(s, `${name(u)} is made unconscious.`, "danger");
}
/** Ready an unconscious character (only effects that target them can). */
export function wakeCharacter(s: GameState, u: Unit) {
  if (!u.unconscious) return;
  delete u.unconscious;
  u.exhausted = false;
  log(s, `${name(u)} is readied and is no longer unconscious.`, "good");
}
/**
 * A character's controller gives it poison: the top card of their deck,
 * attached facedown. Poison equal to its printed hit points knocks it out.
 */
export function givePoison(s: GameState, u: Unit, amount = 1) {
  let given = 0;
  for (let i = 0; i < amount; i++) {
    if (!inPlay(s, u) || u.unconscious) break;
    const controller = ownerOf(s, u);
    let top: Unit | undefined;
    forOwner(s, controller, () => {
      if (s.deck.length) top = takePlayerDeck(s, 0);
    });
    if (!top) {
      log(
        s,
        `${name(u)} cannot get poison: its controller's deck is empty.`,
        "danger",
      );
      break;
    }
    u.attachments.push({
      id: top.id,
      code: top.code,
      exhausted: false,
      facedown: true,
      poison: true,
      blanked: true,
      ...(s.table ? { owner: top.owner ?? controller } : {}),
    });
    given++;
    if (poisonOf(u) >= printedHealth(u)) {
      log(s, `${name(u)} gets ${given} poison.`, "danger");
      makeUnconscious(s, u);
      return given;
    }
  }
  if (given) log(s, `${name(u)} gets ${given} poison.`, "danger");
  return given;
}
const poisonChoice = (
  s: GameState,
  title: string,
  value: number,
  candidates: Unit[],
  player: number,
) =>
  candidates.length
    ? choose(
        s,
        title,
        opts(candidates, (u) => [
          fx("fasPoison", { target: u.id, value, player }),
        ]),
      )
    : undefined;

// ---------------------------------------------------------------------------
// Setup, stages and the separate staging area.

export function setupFliesSpiders(s: GameState) {
  const r = FAS_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, section("sharedEncounterDeck"));
  const aside = section("sharedSetAside");
  s.fliesSpiders = {
    currentQuest: F.mirkwood,
    advancing: false,
    resolving: [],
    setAside: aside.filter((c) => c === F.glade).map((c) => make(s, c)),
    rings: aside.filter((c) => c === OTD_RING),
    split: false,
    areas: [],
    stageThreeComplete: false,
    resolvedAreas: [],
    travelPassedAreas: [],
    weighedDown: [],
    initialized: false,
    treasures: [],
  };
  log(
    s,
    "Into Mirkwood: The Spider's Glade is set aside. Each player may shuffle a copy of Bilbo's Magic Ring into their deck.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.fliesSpiders;
  if (!q) return false;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length
  )
    return true;
  const goal = fasStageInfo(s)?.quest ?? 0;
  if (goal <= 0 || s.progress < goal) return true;
  const stage = fasStageNumber(s);
  if (stage === 3) {
    // Do not advance to stage 4 until the end of the quest phase.
    if (!q.stageThreeComplete) {
      q.stageThreeComplete = true;
      log(
        s,
        "Captured by Spiders is complete: the first player joins stage 4 at the end of the quest phase.",
        "good",
      );
    }
    return true;
  }
  q.advancing = true;
  prepend(s, fx("fasDefeatQuest", { player: firstPlayer(s) }));
  return true;
}
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
function discardStagingArea(s: GameState) {
  for (const u of [...s.staging]) {
    for (const a of [...u.attachments]) discardAttachment(s, u, a, true, false);
    s.encounterDiscard.push(...u.shadows);
    u.shadows = [];
    s.staging = s.staging.filter((x) => x.id !== u.id);
    if (card(u.code).sphere_code === "encounter")
      s.encounterDiscard.push(u.code);
    else forOwner(s, u.owner ?? activeSeat(s), () => s.discard.push(u.code));
  }
}
/** Lost in the Dark (2B): the first player alone at stage 3. */
function lostInTheDark(s: GameState) {
  const q = s.fliesSpiders!;
  const players = globalPlayerOrder(s);
  const first = s.table?.first ?? players[0] ?? 0;
  s.stageRevealing = false;
  if (players.length <= 1) {
    discardStagingArea(s);
    log(
      s,
      "Lost in the Dark: alone in the dark, the player discards stage 2 and its staging area, and continues at stage 3.",
      "danger",
    );
    q.currentQuest = F.captured;
    s.stage = 3;
    s.progress = 0;
    s.stageRevealing = true;
    prepend(s, fx("fasCaptured", { player: first }));
    return;
  }
  const others = players.filter((p) => p !== first);
  const lost = emptyArea("fas-lost", [first], F.captured);
  const battle: FliesSpidersArea = {
    ...emptyArea("fas-battle", others, F.battle),
    staging: s.staging,
    activeLocation: s.activeLocation,
    extraActiveLocations: s.extraActiveLocations ?? [],
  };
  q.areas = [lost, battle];
  q.split = true;
  q.activeArea = undefined;
  q.currentQuest = F.battle;
  q.resolvedAreas = [];
  q.travelPassedAreas = [];
  s.stage = 4;
  s.progress = 0;
  fasSelectArea(s, activeSeat(s));
  log(
    s,
    `Lost in the Dark: Player ${first + 1} has a separate staging area at Captured by Spiders; the other players advance to Battle with the Spiders.`,
    "danger",
  );
  prepend(
    s,
    fx("fasCaptured", { player: first }),
    fx("fasBattle", { player: others[0] }),
  );
}
/** The first player joins the others at stage 4 (combining staging areas). */
function joinStageFour(s: GameState) {
  const q = s.fliesSpiders!;
  q.stageThreeComplete = false;
  if (!q.split) {
    q.currentQuest = F.battle;
    s.stage = 4;
    s.progress = 0;
    s.stageRevealing = true;
    log(s, "Battle with the Spiders begins.", "chapter");
    prepend(s, fx("fasBattle", { player: firstPlayer(s) }));
    return;
  }
  fasSyncArea(s);
  const lost = q.areas.find((a) => a.questCode === F.captured)!,
    battle = q.areas.find((a) => a.questCode === F.battle)!;
  const moved = [
    ...lost.staging,
    ...(lost.activeLocation ? [lost.activeLocation] : []),
    ...lost.extraActiveLocations,
  ];
  battle.staging.push(...moved);
  q.split = false;
  q.areas = [];
  q.activeArea = undefined;
  q.resolvedAreas = [];
  q.travelPassedAreas = [];
  q.currentQuest = F.battle;
  s.stage = 4;
  s.staging = battle.staging;
  s.activeLocation = battle.activeLocation;
  s.extraActiveLocations = battle.extraActiveLocations;
  s.progress = battle.progress;
  s.questDebuff = battle.questDebuff;
  s.fog = battle.fog;
  s.threatModifier = battle.threatModifier;
  log(
    s,
    `The first player escapes the spiders and joins Battle with the Spiders${moved.length ? `; ${moved.length} card${moved.length === 1 ? "" : "s"} join the staging area` : ""}.`,
    "good",
  );
}
function beginStaging(s: GameState) {
  const q = s.fliesSpiders;
  if (!q?.split) return false;
  q.resolvedAreas = [];
  const areas = orderedAreas(s);
  for (const area of areas)
    enqueue(
      s,
      fx("fasAreaStaging", { text: area.id, player: firstOf(s, area) }),
    );
  enqueue(s, fx("questReady", { player: firstOf(s, areas[0]) }));
  return true;
}
function resolveQuest(s: GameState) {
  const q = s.fliesSpiders;
  if (!q?.split) return false;
  const area = fasArea(s);
  requireRule(
    area && !q.resolvedAreas.includes(area.id),
    "This staging area has already resolved its quest.",
  );
  requireRule(
    activeSeat(s) === firstOf(s, area!),
    "The first player in this staging area resolves its quest.",
  );
  const will = questWill(s),
    threat = stagingThreat(s),
    net = will - threat;
  s.lastQuest = { will, threat, net };
  log(
    s,
    `${card(area!.questCode).back_name ?? card(area!.questCode).name} · ${will} willpower − ${threat} threat = ${net}.`,
    net < 0 ? "danger" : "good",
  );
  const first = firstPlayer(s);
  if (net > 0) enqueue(s, fx("questSucceeded", { value: net, player: first }));
  else if (net < 0)
    enqueue(s, fx("failedQuest", { value: -net, player: first }));
  enqueue(s, fx("fasAreaQuestDone", { text: area!.id, player: first }));
  return true;
}
function passTravel(s: GameState) {
  const q = s.fliesSpiders!;
  const area = fasArea(s);
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
  const q = s.fliesSpiders;
  if (!q?.split) return false;
  const area = fasArea(s);
  requireRule(
    area && activeSeat(s) === firstOf(s, area),
    "The first player in this staging area makes its travel decision.",
  );
  passTravel(s);
  return true;
}

// ---------------------------------------------------------------------------
// Encounter cards.

function hold(
  s: GameState,
  code: string,
  replay: boolean,
  fromReveal: boolean,
) {
  const q = s.fliesSpiders!;
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(code);
    return;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  const u = make(s, code);
  q.resolving.push(u);
  const player = firstPlayer(s);
  prepend(
    s,
    fx("fasTreachery", { code, source: u.id, player }),
    fx("fasTreacheryDone", { source: u.id, player }),
  );
}
const TREACHERIES: string[] = [F.webs, F.poisoned, F.friends, F.weighed];
function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!s.fliesSpiders) return false;
  const first = firstPlayer(s);
  if (TREACHERIES.includes(code)) {
    hold(s, code, replay, fromReveal);
    return true;
  }
  if (code === F.cob) {
    const cob = [...s.staging].reverse().find((u) => u.code === F.cob);
    if (cob) prepend(s, fx("fasCobTarget", { target: cob.id, player: first }));
    return true;
  }
  if (code === F.lob) {
    for (const u of allCharacters(s).filter((u) => u.committed))
      givePoison(s, u, 1);
    return true;
  }
  return false;
}
function treachery(s: GameState, e: Effect) {
  const q = s.fliesSpiders!;
  const held = q.resolving.find((x) => x.id === e.source);
  if (!held) return true;
  const first = firstPlayer(s);
  switch (held.code) {
    case F.webs: {
      const heroes = allCharacters(s).filter(
        (u) => typeOf(u) === "hero" && u.committed,
      );
      if (!heroes.length) {
        log(
          s,
          "Caught in Webs: no hero is removed from the quest; it gains surge.",
        );
        prepend(s, ...surgeEffects(held.code));
        break;
      }
      choose(
        s,
        "Caught in Webs · Choose a hero to remove from the quest and make unconscious",
        opts(heroes, (u) => [fx("fasWebs", { target: u.id, player: first })]),
      );
      break;
    }
    case F.poisoned: {
      let damaged = 0;
      for (const u of allCharacters(s)) {
        const n = poisonOf(u);
        if (n > 0 && damage(s, u.id, n)) damaged++;
      }
      log(
        s,
        damaged
          ? `Poisoned by Spiders damages ${damaged} character${damaged === 1 ? "" : "s"}.`
          : "Poisoned by Spiders damages no character; it gains surge.",
        "danger",
      );
      if (!damaged) prepend(s, ...surgeEffects(held.code));
      break;
    }
    default:
      wilderlandTreachery(s, held.code);
  }
  return true;
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !s.fliesSpiders) return false;
  const defenders = (c.defenderIds ?? [])
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
  const attacked = c.attackPlayer ?? activeSeat(s);
  switch (code) {
    case F.cob:
      for (const d of defenders) givePoison(s, d, 1);
      return true;
    case F.fat:
      for (const d of defenders) givePoison(s, d, 1);
      if (!defenders.length)
        forOwner(s, attacked, () =>
          poisonChoice(
            s,
            "Fat Spider · Give 2 poison to a character you control",
            2,
            [...s.heroes, ...s.allies].filter((u) => !u.unconscious),
            attacked,
          ),
        );
      return true;
    case F.wicked:
      for (const d of defenders) givePoison(s, d, 2);
      return true;
    case F.lob:
      for (const d of defenders.filter((d) => poisonOf(d) > 0))
        makeUnconscious(s, d);
      return true;
    case F.poisoned: {
      let out: Unit[] = [];
      forOwner(s, attacked, () => {
        out = [...s.heroes, ...s.allies].filter((u) => u.unconscious);
      });
      if (out.length)
        choose(
          s,
          "Poisoned by Spiders · Discard an unconscious character you control",
          opts(out, (u) => [
            fx("fasDiscardUnconscious", { target: u.id, player: attacked }),
          ]),
        );
      return true;
    }
  }
  return wilderlandShadow(s, code);
}
function gladeSearch(s: GameState, remaining: number) {
  const spiders = [...new Set(s.encounterDeck.filter(isSpider))];
  if (remaining <= 0 || !spiders.length) {
    shuffle(s, s.encounterDeck);
    log(s, "The Spider's Glade: the encounter deck is shuffled.");
    return;
  }
  choose(
    s,
    "The Spider's Glade · Search the encounter deck for a Spider enemy",
    spiders.map((code) => ({
      id: code,
      code,
      label: card(code).name,
      effects: [
        fx("fasGladeTake", {
          code,
          value: remaining,
          player: activeSeat(s),
        }),
      ],
    })),
  );
}

// ---------------------------------------------------------------------------
// Effects.

export function fasEffect(s: GameState, e: Effect): boolean {
  const q = s.fliesSpiders;
  if (!q) return false;
  // The separate staging area replaces the framework's phase steps while split.
  if (e.kind === "travelDone" && q.split) {
    passTravel(s);
    return true;
  }
  if (
    e.kind === "finishQuestPhase" &&
    e.text === "angmar-quest-end" &&
    q.split
  ) {
    globalCharacters(s).forEach((u) => (u.committed = false));
    prepend(
      s,
      fx("phaseEnd", { player: s.table?.first ?? 0 }),
      fx("startTravel", { player: s.table?.first ?? 0 }),
    );
    return true;
  }
  if (!e.kind.startsWith("fas")) return false;
  const u = get(s, e.target);
  const first = firstPlayer(s);
  switch (e.kind) {
    case "fasSetup":
      q.initialized = true;
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("fasRingOffer", { player })),
        ...playerOrder(s).map((player) => fx("reveal", { player })),
      );
      return true;
    case "fasRingOffer":
      if (q.rings.length)
        choose(
          s,
          "Into Mirkwood · Shuffle a copy of Bilbo's Magic Ring into your deck?",
          [
            {
              id: "ring",
              label: "Shuffle Bilbo's Magic Ring into your deck",
              code: OTD_RING,
              effects: [{ ...e, kind: "fasRingShuffle" }],
            },
            { id: "skip", label: "Do not add the ring", effects: [] },
          ],
          `${q.rings.length} cop${q.rings.length === 1 ? "y remains" : "ies remain"}.`,
        );
      return true;
    case "fasRingShuffle": {
      const ring = q.rings.pop();
      if (ring) {
        s.deck.push(ring);
        shuffle(s, s.deck);
        log(s, "Bilbo's Magic Ring is shuffled into a player's deck.", "good");
      }
      return true;
    }
    case "fasDefeatQuest": {
      const before = s.queue.length;
      questDefeated(s, fasCurrentQuest(s)!);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(s, ...responses, fx("fasNextStage", { player: first }));
      return true;
    }
    case "fasNextStage": {
      q.advancing = false;
      const stage = fasStageNumber(s);
      if (stage === 4) {
        q.treasures = [OTD_RING];
        win(s);
        s.reason =
          "The spiders are beaten off and the Dwarves are cut free. The company has discovered the treasure card Bilbo's Magic Ring.";
        return true;
      }
      if (stage === 1) {
        q.currentQuest = F.lost;
        s.stage = 2;
        s.progress = 0;
        s.stageRevealing = true;
        log(s, "Lost in the Dark.", "chapter");
        prepend(s, fx("fasLost", { player: first }));
      }
      return true;
    }
    case "fasLost":
      lostInTheDark(s);
      return true;
    case "fasCaptured": {
      // When Revealed (3A): only the players in this staging area.
      for (const p of playerOrder(s))
        forOwner(s, p, () => {
          for (const h of s.heroes) h.resources = 0;
        });
      for (const c of allCharacters(s).filter(
        (c) => ownerOf(s, c) === activeSeat(s) && !isBagginsBilbo(c.code),
      ))
        makeUnconscious(s, c);
      s.stageRevealing = false;
      log(
        s,
        "Captured by Spiders: all resources are removed and every character except Bilbo Baggins is made unconscious.",
        "danger",
      );
      return true;
    }
    case "fasBattle": {
      const glade = q.setAside.splice(0)[0];
      if (glade) s.staging.push(glade);
      s.stageRevealing = false;
      log(
        s,
        "Battle with the Spiders: The Spider's Glade is added to the staging area.",
        "danger",
      );
      return true;
    }
    case "fasJoin":
      if (q.stageThreeComplete) joinStageFour(s);
      return true;
    case "fasAreaStaging": {
      const count = playerOrder(s).length;
      prepend(
        s,
        ...Array.from({ length: count }, () => fx("reveal", { player: first })),
        fx("khazadStagingEnd", { player: first }),
      );
      return true;
    }
    case "fasAreaQuestDone": {
      fasSyncArea(s);
      if (!q.resolvedAreas.includes(e.text!)) q.resolvedAreas.push(e.text!);
      const next = orderedAreas(s).find((a) => !q.resolvedAreas.includes(a.id));
      if (next) {
        const p = firstOf(s, next);
        selectSeat(s, p);
        if (s.table) s.table.turn = p;
      } else
        prepend(s, fx("finishQuestPhase", { player: s.table?.first ?? 0 }));
      return true;
    }
    case "fasTreachery":
      return treachery(s, e);
    case "fasTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      return true;
    }
    case "fasWebs":
      if (u && u.committed) {
        removeFromQuest(s, u);
        makeUnconscious(s, u);
      }
      return true;
    case "fasPoison":
      if (u) givePoison(s, u, e.value ?? 1);
      return true;
    case "fasDiscardUnconscious":
      if (u && u.unconscious && inPlay(s, u)) destroy(s, u, false);
      return true;
    case "fasCobTarget": {
      const cob = u;
      if (!cob || !isEnemy(cob)) return true;
      const candidates = conscious(s);
      const most = Math.max(0, ...candidates.map(poisonOf));
      const targets = candidates.filter((c) => poisonOf(c) === most);
      if (!targets.length) return true;
      choose(
        s,
        "Crazy Cob · It attacks the character with the most poison attached",
        opts(targets, (t) => [
          fx("immediateAttack", {
            target: cob.id,
            damageTarget: t.id,
            player: ownerOf(s, t),
          }),
        ]),
        most
          ? `${most} poison.`
          : "No character has poison; the first player chooses.",
      );
      return true;
    }
    case "fasWickedPoison": {
      let own: Unit[] = [];
      forOwner(s, e.player ?? activeSeat(s), () => {
        own = [...s.heroes, ...s.allies].filter((c) => !c.unconscious);
      });
      poisonChoice(
        s,
        "Wicked Spider · Attach 1 poison to a character you control",
        1,
        own,
        e.player ?? activeSeat(s),
      );
      return true;
    }
    case "fasTomnoddy": {
      let heroes: Unit[] = [];
      forOwner(s, e.player ?? activeSeat(s), () => {
        heroes = s.heroes.filter((h) => !h.unconscious);
      });
      poisonChoice(
        s,
        "Old Tomnoddy · Give a hero you control 1 poison",
        1,
        heroes,
        e.player ?? activeSeat(s),
      );
      return true;
    }
    case "fasStreamDiscard": {
      const left = e.value ?? 4;
      const poisoned = allCharacters(s).filter((c) => poisonOf(c) > 0);
      if (left <= 0 || !poisoned.length) return true;
      choose(s, `Forest Stream · Discard poison (${left} remaining)`, [
        ...opts(poisoned, (c) => [
          fx("fasStreamTake", { target: c.id, value: left, player: first }),
        ]),
        { id: "skip", label: "Stop discarding poison", effects: [] },
      ]);
      return true;
    }
    case "fasStreamTake": {
      const a = u?.attachments.find((x) => x.poison);
      if (u && a) {
        discardPoison(s, u, a);
        log(s, `Forest Stream discards 1 poison from ${name(u)}.`, "good");
      }
      prepend(
        s,
        fx("fasStreamDiscard", { value: (e.value ?? 1) - 1, player: first }),
      );
      return true;
    }
    case "fasWebWake": {
      const out = allCharacters(s).filter((c) => c.unconscious);
      if (out.length)
        choose(s, "Giant Web · Ready an unconscious character", [
          ...opts(out, (c) => [fx("fasWake", { target: c.id, player: first })]),
          { id: "skip", label: "Do not ready a character", effects: [] },
        ]);
      return true;
    }
    case "fasWake":
      if (u?.unconscious) wakeCharacter(s, u);
      return true;
    case "fasStageWake": {
      const out = [...s.heroes, ...s.allies].filter((c) => c.unconscious);
      choose(
        s,
        "Spend 2 Baggins resources · Ready an unconscious character you control",
        opts(out, (c) => [
          fx("fasStageWakePay", { target: c.id, player: activeSeat(s) }),
        ]),
      );
      return true;
    }
    case "fasStageWakePay":
      if (u?.unconscious && spendBaggins(s, 2)) wakeCharacter(s, u);
      return true;
    case "fasGladeCost": {
      const bilbo = areaBilbo(s);
      if (!bilbo || !exhaustCharacter(s, bilbo))
        log(s, "Bilbo Baggins cannot exhaust to travel.", "danger");
      return true;
    }
    case "fasGladeSearch":
      gladeSearch(s, e.value ?? 1);
      return true;
    case "fasGladeTake": {
      const i = s.encounterDeck.indexOf(e.code!);
      if (i >= 0) {
        s.encounterDeck.splice(i, 1);
        const spider = make(s, e.code!);
        s.staging.push(spider);
        log(
          s,
          `The Spider's Glade adds ${name(spider)} to the staging area.`,
          "danger",
        );
      }
      gladeSearch(s, (e.value ?? 1) - 1);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hooks.

const STAGE_WAKE = [F.captured, F.battle] as string[];
function stageWakeProblem(s: GameState, u: Unit) {
  if (!STAGE_WAKE.includes(u.code) || u.code !== fasCurrentQuest(s))
    return "No action.";
  if (s.stageRevealing) return "Wait for the stage to be revealed.";
  if (!areaBilbo(s)) return "Bilbo Baggins is not in your staging area.";
  if ((areaBilbo(s)?.resources ?? 0) < 2)
    return "Spend 2 Baggins resources from Bilbo Baggins' resource pool.";
  if (![...s.heroes, ...s.allies].some((c) => c.unconscious))
    return "You control no unconscious character.";
  return null;
}
export const FAS_HOOKS: Batch4ScenarioHooks = {
  setup: setupFliesSpiders,
  openingHandsKept: (s) => {
    const q = s.fliesSpiders;
    if (!q || q.initialized) return false;
    prepend(s, fx("fasSetup", { player: firstPlayer(s) }), fx("nextRound"));
    return true;
  },
  advance,
  stageInfo: fasStageInfo,
  beginStaging,
  resolveQuest,
  travelNext,
  keepFirstPlayer: (s) =>
    !!s.fliesSpiders &&
    (s.fliesSpiders.split || s.fliesSpiders.currentQuest === F.captured),
  travelBegin: (s) => {
    if (s.fliesSpiders) s.fliesSpiders.travelPassedAreas = [];
  },
  travelProblem: (s, u) => {
    if (!s.fliesSpiders || u.blanked) return null;
    const bilbo = areaBilbo(s);
    const path = wilderlandTravelProblem(s, u, bilbo);
    if (path) return path;
    if (u.code === F.glade && (!bilbo || bilbo.exhausted || bilbo.unconscious))
      return "Travel to The Spider's Glade: exhaust Bilbo Baggins.";
    return null;
  },
  travelEffects: (s, u) => {
    if (!s.fliesSpiders || u.blanked) return undefined;
    const path = wilderlandTravelEffects(s, u);
    if (path) return path;
    if (u.code === F.glade)
      return [fx("fasGladeCost", { player: firstPlayer(s) })];
    return undefined;
  },
  immune: (s, u) => !!s.fliesSpiders && u.code === F.glade && !u.blanked,
  threatBonus: (s, u) => (s.fliesSpiders ? wilderlandThreatBonus(s, u) : 0),
  stats: (s, u) => {
    const q = s.fliesSpiders;
    if (!q) return {};
    if (u.code === F.fat && !u.blanked) {
      const engagedWith = globalPlayerOrder(s).find((p) =>
        seatView(s, p).engaged.some((x) => x.id === u.id),
      );
      const poisoned =
        engagedWith !== undefined &&
        (() => {
          const v = seatView(s, engagedWith);
          return [...v.heroes, ...v.allies].some((c) => poisonOf(c) > 0);
        })();
      return poisoned ? { attack: 3 } : {};
    }
    if (!isCharacter(u)) return {};
    let penalty = wilderlandPenalty(s, u);
    if (activeIs(s, F.web)) penalty += poisonOf(u);
    return penalty
      ? { will: -penalty, attack: -penalty, defense: -penalty }
      : {};
  },
  cannotReady: (s, u) => !!s.fliesSpiders && !!u.unconscious,
  cannotCommit: (s, u) =>
    !!s.fliesSpiders && poisonOf(u) > 0 && activeIs(s, F.stream),
  progress: (s, amount, quest) =>
    s.fliesSpiders && quest.code === F.battle && live(s, F.glade).length > 0
      ? 0
      : amount,
  questBegin: (s) => {
    const q = s.fliesSpiders;
    if (!q) return [];
    const effects: Effect[] = [];
    const areas = q.split ? orderedAreas(s) : [undefined];
    for (const area of areas) {
      const player = area ? firstOf(s, area) : firstPlayer(s);
      let glades = 0,
        players = 0;
      forOwner(s, player, () => {
        glades = live(s, F.glade).length;
        players = playerOrder(s).length;
      });
      for (let i = 0; i < glades; i++)
        effects.push(
          fx("fasGladeSearch", { value: players >= 3 ? 2 : 1, player }),
        );
    }
    return effects;
  },
  endQuest: (s) => {
    const q = s.fliesSpiders;
    if (!q) return;
    allCharacters(s).forEach((u) => (u.committed = false));
    if (q.stageThreeComplete && fasStageNumber(s) === 3)
      prepend(s, fx("fasJoin", { player: firstPlayer(s) }));
  },
  roundEnd: (s) => {
    if (!s.fliesSpiders) return [];
    const tomnoddies = [
      ...s.staging,
      ...playerOrder(s).flatMap((p) => seatView(s, p).engaged),
    ].filter((u) => u.code === F.tomnoddy && !u.blanked).length;
    return Array.from({ length: tomnoddies }).flatMap(() =>
      playerOrder(s).map((player) => fx("fasTomnoddy", { player })),
    );
  },
  explored: (s, u) => {
    if (!s.fliesSpiders || u.blanked) return;
    if (u.code === F.stream)
      prepend(s, fx("fasStreamDiscard", { value: 4, player: firstPlayer(s) }));
    if (u.code === F.web)
      prepend(s, fx("fasWebWake", { player: firstPlayer(s) }));
  },
  enemyAttackStarted: (s, enemy, player) => {
    if (s.fliesSpiders && enemy.code === F.wicked && !enemy.blanked)
      prepend(s, fx("fasWickedPoison", { player }));
  },
  damageDealt: (s, u, amount, ctx) => {
    if (!s.fliesSpiders || amount <= 0 || !isCharacter(u) || !ctx.enemyId)
      return;
    const enemy = get(s, ctx.enemyId);
    if (!enemy || enemy.blanked) return;
    if (effectiveKeyword(enemy, "Venom"))
      prepend(
        s,
        fx("fasPoison", { target: u.id, value: 1, player: ownerOf(s, u) }),
      );
    wilderlandDamageDealt(s, u, amount, ctx);
  },
  attackFinished: (s, combat) =>
    s.fliesSpiders ? wilderlandAttackFinished(s, combat) : [],
  characterDestroyed: (s, u, ctx) => {
    if (s.fliesSpiders) prepend(s, ...wilderlandCharacterDestroyed(s, u, ctx));
  },
  defendersDeclared: (s, enemy, defenders) => [
    ...hobbitTreasureDefense(s, enemy, defenders),
    ...hobbitRingDefense(s, enemy, defenders),
  ],
  playerAttackResolved: (s, enemy, ids, amount, remainingHealth) =>
    prepend(s, ...hobbitTreasureKill(s, enemy, ids, amount, remainingHealth)),
  characterLeft: (s, u) => {
    if (isBagginsBilbo(u.code)) loseBilbo(s);
  },
  playerEliminating: (s, player) => {
    const bilbo = bagginsBilbo(s);
    if (bilbo && ownerOf(s, bilbo) === player) loseBilbo(s);
  },
  abilityLabel: (code) =>
    STAGE_WAKE.includes(code)
      ? "Spend 2 Baggins resources: ready an unconscious character you control"
      : undefined,
  abilityProblem: (s, u) => stageWakeProblem(s, u),
  ability: (s, u) => {
    if (stageWakeProblem(s, u)) return false;
    prepend(s, fx("fasStageWake", { player: activeSeat(s) }));
    return true;
  },
  encounter,
  shadow,
  effect: (s, e) =>
    fasEffect(s, e) || wilderlandEffect(s, e) || hobbitTreasureEffect(s, e),
  sharedEffect: (e) =>
    [
      "fasSetup",
      "fasDefeatQuest",
      "fasNextStage",
      "fasLost",
      "fasBattle",
      "fasJoin",
      "fasAreaQuestDone",
      "fasTreachery",
      "fasTreacheryDone",
      ...WILDERLAND_SHARED_EFFECTS,
      "fasStreamDiscard",
      "fasStreamTake",
      "fasWebWake",
    ].includes(e.kind),
};
