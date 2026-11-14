import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, shuffle } from "./core";
import {
  depositInFlightEncounterCards,
  destroy,
  discardAttachment,
  enemyAddedToStaging,
  engage,
  enterEnemyEngaged,
  exhaustCharacter,
  questDefeated,
  raiseThreat,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  firstPlayer,
  forOwner,
  globalCharacters,
  globalEngaged,
  globalPlayerOrder,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { mainQuestUnit } from "./quest-state";
import { lotrSagaCheck, oneRing } from "./lotr-saga";
import { mordorOrcCharacterDestroyed, mordorOrcsEffect } from "./mordor-orcs";
import {
  deepShadowsCharacterDestroyed,
  deepShadowsEffect,
  deepShadowsShadow,
  deepShadowsTreachery,
  discardUntil,
  discardUntilEnemy,
  either,
} from "./deep-shadows";
import { DEEP_SHADOWS_TREACHERIES } from "./deep-shadows-codes";
import { direThreatReduction } from "./dire-rules";
import { reduceThreat } from "./threat-reduction";
import { isFortitude, sauronEyes } from "./hide-test";
import {
  MD,
  MD_GASP_CAP,
  MD_GASP_PROGRESS,
  MOUNT_DOOM_RECIPES,
  fortitudeFailures,
  mountDoomStageInfo,
} from "./mount-doom-support";
export * from "./mount-doom-support";

/**
 * Mount Doom, the last scenario of The Mountain of Fire and of The Lord of the
 * Rings Saga. The Ring-bearer crosses the Land of Mordor under the Eye of
 * Sauron: Fortitude tests weigh the committed heroes' willpower against the
 * Sauron's Eye icons of the encounter cards they discard, The Tower of
 * Barad-dûr raises threat for every non-Fellowship character, and the players
 * win only if the first player passes a last Fortitude test when Mount Doom is
 * explored. Dire on every stage: threat elimination is 99, threat reduction by
 * non-boon player cards is limited to 1 each round and Valour triggers at 80.
 */
const TREACHERIES: readonly string[] = [
  MD.master,
  MD.eye,
  MD.fumes,
  MD.heavy,
  ...DEEP_SHADOWS_TREACHERIES,
];
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const verb = (s: GameState, v: string) => (s.table ? `${v}s` : v);
const his = (s: GameState) => (s.table ? "his" : "your");
const players = (s: GameState) => globalPlayerOrder(s).length;
/** The game phase, its steps included. */
const phaseOf = (s: GameState) =>
  s.phase === "staging" ? "quest" : s.phase === "attack" ? "defense" : s.phase;
/** The current quest's text is in effect. */
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked && !s.mountDoom?.advancing;
const at = (s: GameState, quest: string) =>
  s.mountDoom?.currentQuest === quest && stageLive(s);
const inStaging = (s: GameState, u: Unit) =>
  s.staging.some((x) => x.id === u.id);
const activeIs = (s: GameState, code: string) =>
  allActiveLocations(s).some((u) => live(u, code));
const charactersOf = (s: GameState, p: number) => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];
/** "The tens digit of his threat dial." */
const tens = (s: GameState, p: number) =>
  Math.floor(seatView(s, p).threat / 10) % 10;
const isFellowship = (u: Unit) => card(u.code).sphere_code === "fellowship";
const heavy = (u: Unit) => u.attachments.find((a) => a.code === MD.heavy);
const tower = (s: GameState) => s.staging.find((u) => live(u, MD.tower));
const gollumInPlay = (s: GameState) =>
  [...s.staging, ...globalEngaged(s)].find((u) => u.code === MD.gollum);
/** A Fortitude test for a player, called for by a card. */
const fortitude = (player: number, source: string, extra = 0) =>
  fx("hideFortitude", {
    player,
    code: source,
    ...(extra ? { count: extra } : {}),
  });

// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupMountDoom(s: GameState) {
  const r = MOUNT_DOOM_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  // Mount Doom and The Tower of Barad-dûr join the staging area and Brake of
  // Thorns is the active location; the other locations wait in the encounter
  // deck for the players' searches.
  const searched = section("sharedStagingArea").filter(
    (c) => c !== MD.doom && c !== MD.tower,
  );
  s.encounterDeck = shuffle(s, [
    ...section("sharedEncounterDeck"),
    ...searched,
  ]);
  s.staging = [make(s, MD.doom), make(s, MD.tower)];
  s.activeLocation = make(s, section("sharedActiveLocation")[0]);
  s.extraActiveLocations = [];
  s.mountDoom = {
    currentQuest: MD.land,
    advancing: false,
    resolving: [],
    ready: false,
  };
  log(
    s,
    "The Land of Mordor: Mount Doom and The Tower of Barad-dûr are added to the staging area, and Brake of Thorns is the active location.",
    "chapter",
  );
}
/** Brake of Thorns' Forced effect: each player assigns X damage. */
const brakeEffects = (s: GameState) =>
  playerOrder(s)
    .map((player) => ({ player, value: tens(s, player) }))
    .filter((x) => x.value > 0)
    .map((x) => fx("mdBrake", x));
/** "Make X the active location": a previous active location returns to the staging area. */
function makeActive(s: GameState, u: Unit) {
  const old = allActiveLocations(s).filter((l) => l.id !== u.id);
  s.staging = s.staging.filter((l) => l.id !== u.id);
  s.staging.push(...old);
  s.activeLocation = u;
  s.extraActiveLocations = [];
}
/** The Forced effects of a location that just became the active location. */
function locationActivated(s: GameState, u: Unit) {
  if (u.blanked) return;
  const first = firstPlayer(s);
  if (u.code === MD.brake) prepend(s, ...brakeEffects(s));
  if (u.code === MD.hold) prepend(s, fx("mdHold", { player: first }));
  if (u.code === MD.mordorRoad)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("mdMordorRoad", { player })),
    );
}
function lose(s: GameState, reason: string) {
  if (s.status !== "playing") return;
  s.status = "lost";
  s.reason = reason;
  depositInFlightEncounterCards(s);
  s.choice = null;
  s.queue = [];
  log(s, reason, "danger");
}
function advance(s: GameState) {
  const q = s.mountDoom;
  if (!q) return false;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length ||
    s.hideTest ||
    !q.ready
  )
    return true;
  const first = firstPlayer(s);
  if (at(s, MD.land) && s.progress >= (mountDoomStageInfo(s)?.quest ?? 0)) {
    q.advancing = true;
    prepend(s, fx("mdStageTwo", { player: first }));
  }
  // 3B cannot be defeated unless Mount Doom is the active location.
  if (
    at(s, MD.gasp) &&
    s.progress >= MD_GASP_PROGRESS &&
    activeIs(s, MD.doom)
  ) {
    q.advancing = true;
    prepend(s, fx("mdStageFour", { player: first }));
  }
  // 2B advances at the end of the quest phase; 4B is won at Mount Doom.
  return true;
}

// ---------------------------------------------------------------------------
// Encounter cards and shadows.

function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.mountDoom;
  if (!q || !TREACHERIES.includes(code)) return false;
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
  const player = activeSeat(s);
  prepend(
    s,
    fx("mdTreachery", { code, source: u.id, player }),
    fx("mdTreacheryDone", { source: u.id, player }),
  );
  return true;
}
function treachery(s: GameState, held: Unit) {
  const p = activeSeat(s);
  const first = firstPlayer(s);
  if (deepShadowsTreachery(s, held.code)) return;
  switch (held.code) {
    case MD.master:
      prepend(s, fx("mdMaster", { player: first }));
      return;
    case MD.eye:
      prepend(s, fortitude(p, MD.eye));
      return;
    case MD.fumes:
      prepend(
        s,
        ...playerOrder(s).map((player) => fortitude(player, MD.fumes)),
      );
      return;
    case MD.heavy:
      prepend(s, fx("mdHeavy", { source: held.id, player: first }));
      return;
  }
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!s.mountDoom || !c) return false;
  if (deepShadowsShadow(s, code)) return true;
  const attacker = get(s, c.enemyId);
  const p = c.attackPlayer ?? activeSeat(s);
  const failed = fortitudeFailures(s).includes(p);
  switch (code) {
    case MD.captain:
      c.cuReturnOnKill = true;
      log(
        s,
        "Orc Captain: if this attack destroys a character, the attacking enemy returns to the staging area.",
        "danger",
      );
      return true;
    case MD.uruk: {
      const allies = seatView(s, p).allies.filter((u) => isAlly(u)).length;
      c.attackBonus += allies;
      log(
        s,
        `Big Uruk: the attacking enemy gets +${allies} attack (1 for each ally ${who(s, p)} ${verb(s, "control")}).`,
        "danger",
      );
      return true;
    }
    case MD.snuffler:
      prepend(s, fx("moExhaustOne", { text: "Little Snuffler", player: p }));
      return true;
    case MD.master:
      if (attacker?.code === MD.gollum) {
        c.extraAttacks = (c.extraAttacks ?? 0) + 1;
        log(
          s,
          "“Wicked Master!”: Gollum makes an additional attack after this one.",
          "danger",
        );
      } else log(s, "“Wicked Master!”: the attacking enemy is not Gollum.");
      return true;
    case MD.eye:
      c.attackBonus += failed ? 2 : 1;
      log(
        s,
        `The Lidless Eye: the attacking enemy gets +${failed ? 2 : 1} attack${failed ? " (a Fortitude test was failed this round)" : ""}.`,
        "danger",
      );
      return true;
    case MD.fumes:
      if (failed) {
        c.defenderId = null;
        c.defenderIds = [];
        log(
          s,
          "Foul Fumes: a Fortitude test was failed this round, so this attack is considered undefended.",
          "danger",
        );
      } else log(s, "Foul Fumes: no Fortitude test was failed this round.");
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Fortitude tests.

/** Record a failed Fortitude test for this round. */
function recordFailure(s: GameState, player: number) {
  const q = s.mountDoom!;
  const prior = q.failed?.round === s.round ? q.failed.players : [];
  q.failed = { round: s.round, players: [...new Set([...prior, player])] };
}
function testPassed(s: GameState, player: number, source: string): Effect[] {
  if (!s.mountDoom) return [];
  switch (source) {
    case MD.road:
      return [fx("mdRoadResource", { player })];
    case MD.crack:
      return [fx("mdCrack", { value: 1, player: firstPlayer(s) })];
  }
  return [];
}
function testFailed(s: GameState, player: number, source: string): Effect[] {
  if (!s.mountDoom) return [];
  recordFailure(s, player);
  const effects: Effect[] = [];
  switch (source) {
    case MD.road:
      effects.push(fx("mdRoadEnemy", { player }));
      break;
    case MD.gasp:
      effects.push(fx("mdCapped", { player }));
      break;
    case MD.crack:
      return [fx("mdCrack", { value: 0, player: firstPlayer(s) })];
    case MD.doom:
      effects.push(fx("moThreat", { value: 9, text: "Mount Doom", player }));
      break;
    case MD.plain:
      effects.push(
        ...playerOrder(s).map((p) =>
          fx("moThreat", { value: 4, text: "Plain of Gorgoroth", player: p }),
        ),
      );
      break;
    case MD.captain:
      effects.push(fx("reveal", { player }));
      break;
    case MD.eye:
      effects.push(
        fx("moThreat", { value: 10, text: "The Lidless Eye", player }),
      );
      break;
    case MD.fumes:
      effects.push(fx("mdFumes", { player }));
      break;
  }
  // Forced: after a player fails a Fortitude test.
  for (const hero of seatView(s, player).heroes)
    if (heavy(hero) && !heavy(hero)!.blanked)
      effects.push(fx("mdHeavyFailed", { target: hero.id, player }));
  for (const wraith of s.staging.filter((u) => live(u, MD.wraith)))
    effects.push(fx("mdWraith", { target: wraith.id, player }));
  return effects;
}
/** Gollum discarded during a Fortitude test. */
function gollumDiscarded(s: GameState) {
  const test = s.hideTest;
  if (!s.mountDoom || !isFortitude(test) || !test) return;
  if (!test.discarded.includes(MD.gollum)) return;
  const i = s.encounterDiscard.lastIndexOf(MD.gollum);
  if (i < 0) return;
  s.encounterDiscard.splice(i, 1);
  const first = firstPlayer(s);
  const gollum = make(s, MD.gollum);
  log(
    s,
    `Gollum is discarded during the Fortitude test: he is put into play engaged with ${who(s, first)}.`,
    "danger",
  );
  enterEnemyEngaged(s, gollum, first);
  const options = test.discarded
    .map((code, index) => ({ code, index }))
    .filter((x) => sauronEyes(x.code) > 0);
  if (!options.length) {
    log(s, "Gollum: no card discarded for this test has a Sauron's Eye icon.");
    return;
  }
  // Cards with the same number of icons are the same choice.
  const distinct = options.filter(
    (x, i) =>
      options.findIndex((y) => sauronEyes(y.code) === sauronEyes(x.code)) === i,
  );
  if (distinct.length === 1) {
    prepend(s, fx("mdGollumIgnore", { value: distinct[0].index }));
    return;
  }
  forOwner(s, first, () =>
    choose(
      s,
      `Gollum · Choose an encounter card discarded for this test and ignore its Sauron's Eye icons${seatLabel(s, first)}`,
      distinct
        .sort((a, b) => sauronEyes(b.code) - sauronEyes(a.code))
        .map((x) => ({
          id: `ignore-${x.index}`,
          code: x.code,
          label: `${card(x.code).name} · ${sauronEyes(x.code)} icon${sauronEyes(x.code) === 1 ? "" : "s"}`,
          effects: [fx("mdGollumIgnore", { value: x.index })],
        })),
      "*Forced: after Gollum is discarded during a Fortitude test, put him into play engaged with the first player. Then, choose an encounter card discarded for this test and ignore its Sauron's Eye icons.",
    ),
  );
}

// ---------------------------------------------------------------------------
// Effects.

export function mountDoomEffect(s: GameState, e: Effect): boolean {
  const q = s.mountDoom;
  if (!q || !e.kind.startsWith("md")) return false;
  const p = e.player ?? activeSeat(s);
  const first = firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "mdTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (held) treachery(s, held);
      return true;
    }
    case "mdTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) {
        const [held] = q.resolving.splice(i, 1);
        if (q.immuneReveal === held.code) delete q.immuneReveal;
        s.encounterDiscard.push(held.code);
      }
      return true;
    }
    // 1A: each player searches the encounter deck for a different location.
    case "mdSearch": {
      const taken = q.searched ?? [];
      const titles = [
        ...new Set(
          s.encounterDeck.filter(
            (c) =>
              card(c).type_code === "location" && !taken.includes(card(c).name),
          ),
        ),
      ];
      if (!titles.length) {
        log(
          s,
          `The Land of Mordor: ${who(s, p)} ${verb(s, "find")} no different location.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `The Land of Mordor · Search the encounter deck for a different location${seatLabel(s, p)}`,
          titles.map((c) => ({
            id: `location-${c}`,
            code: c,
            label: card(c).name,
            effects: [fx("mdSearchTake", { code: c, player: p })],
          })),
          "Setup: each player searches the encounter deck for a different location and adds it to the staging area.",
        ),
      );
      return true;
    }
    case "mdSearchTake": {
      const i = s.encounterDeck.indexOf(e.code ?? "");
      if (i < 0) return true;
      s.encounterDeck.splice(i, 1);
      (q.searched ??= []).push(card(e.code!).name);
      s.staging.push(make(s, e.code!));
      log(
        s,
        `The Land of Mordor: ${card(e.code!).name} is added to the staging area.`,
      );
      return true;
    }
    case "mdReady":
      s.encounterDeck = shuffle(s, s.encounterDeck);
      q.ready = true;
      delete q.searched;
      log(s, "The Land of Mordor: the encounter deck is shuffled.");
      return true;
    // Brake of Thorns: X damage among characters you control, one at a time.
    case "mdBrake": {
      const left = e.value ?? 0;
      const targets = charactersOf(s, p);
      if (left <= 0 || !targets.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Brake of Thorns · Assign damage among characters you control · ${left} remaining${seatLabel(s, p)}`,
          targets.map((x) => ({
            id: x.id,
            code: x.code,
            label: `${name(x)} · ${x.damage} damage`,
            effects: [
              fx("damage", { target: x.id, value: 1, player: p }),
              ...(left > 1
                ? [fx("mdBrake", { value: left - 1, player: p })]
                : []),
            ],
          })),
          "Forced: after Brake of Thorns becomes the active location, each player assigns X damage among characters he controls, where X is the tens digit of his threat dial.",
        ),
      );
      return true;
    }
    // 1B is defeated: 2A.
    case "mdStageTwo": {
      questDefeated(s, q.currentQuest);
      q.advancing = false;
      s.stage = 2;
      s.progress = 0;
      q.currentQuest = MD.road;
      s.stageRevealing = true;
      q.resources = 0;
      log(s, "The Road to Isenmouthe.", "chapter");
      // Search the encounter deck, discard pile and victory display for Mordor Road.
      const zones = [s.encounterDeck, s.encounterDiscard, s.victoryCards ?? []];
      const zone = zones.find((z) => z.includes(MD.mordorRoad));
      let road: Unit | undefined;
      if (zone) {
        zone.splice(zone.indexOf(MD.mordorRoad), 1);
        if (zone === s.victoryCards)
          s.victory -= card(MD.mordorRoad).victory ?? 0;
        road = make(s, MD.mordorRoad);
        s.staging.push(road);
        log(
          s,
          "The Road to Isenmouthe: Mordor Road is added to the staging area.",
        );
      } else road = s.staging.find((x) => x.code === MD.mordorRoad);
      s.encounterDeck = shuffle(s, [
        ...s.encounterDeck,
        ...s.encounterDiscard.splice(0),
      ]);
      log(
        s,
        "The Road to Isenmouthe: the encounter discard pile is shuffled into the encounter deck.",
      );
      if (road && s.activeLocation?.id !== road.id) {
        makeActive(s, road);
        log(
          s,
          "The Road to Isenmouthe: the players travel to Mordor Road; any previous active location returns to the staging area.",
          "danger",
        );
        prepend(s, fx("stageRevealed"));
        locationActivated(s, road);
      } else prepend(s, fx("stageRevealed"));
      return true;
    }
    // 2B: a resource on the quest, or an enemy engaged with the player.
    case "mdRoadResource":
      q.resources = (q.resources ?? 0) + 1;
      log(
        s,
        `The Road to Isenmouthe: ${who(s, p)} ${verb(s, "place")} a resource on the quest (${q.resources}).`,
        "good",
      );
      return true;
    case "mdRoadEnemy": {
      const code = discardUntilEnemy(s, "The Road to Isenmouthe");
      if (!code) return true;
      const enemy = make(s, code);
      log(
        s,
        `The Road to Isenmouthe: ${card(code).name} is put into play engaged with ${who(s, p)}.`,
        "danger",
      );
      enterEnemyEngaged(s, enemy, p);
      return true;
    }
    // 2B is defeated: 3A.
    case "mdStageThree": {
      questDefeated(s, q.currentQuest);
      q.advancing = false;
      s.stage = 3;
      s.progress = 0;
      q.currentQuest = MD.gasp;
      s.stageRevealing = true;
      delete q.resources;
      log(s, "The Last Gasp.", "chapter");
      s.encounterDeck = shuffle(s, [
        ...s.encounterDeck,
        ...s.encounterDiscard.splice(0),
      ]);
      for (let n = 0; n < players(s); n++) {
        const code = discardUntil(
          s,
          "The Last Gasp",
          (c) => card(c).type_code === "location",
          "location",
        );
        if (!code) break;
        s.staging.push(make(s, code));
        log(
          s,
          `The Last Gasp: ${card(code).name} is added to the staging area.`,
          "danger",
        );
      }
      prepend(s, fx("stageRevealed"));
      return true;
    }
    // 3B: the first player failed the test: no more than 5 progress here this round.
    case "mdCapped":
      q.capped = { round: s.round, placed: 0 };
      log(
        s,
        `The Last Gasp: no more than ${MD_GASP_CAP} progress can be placed on this stage this round.`,
        "danger",
      );
      return true;
    // 3B is defeated: 4A.
    case "mdStageFour": {
      questDefeated(s, q.currentQuest);
      q.advancing = false;
      s.stage = 4;
      s.progress = 0;
      q.currentQuest = MD.crack;
      s.stageRevealing = true;
      delete q.capped;
      log(s, "The Crack of Doom.", "chapter");
      s.encounterDeck = shuffle(s, [
        ...s.encounterDeck,
        ...s.encounterDiscard.splice(0),
      ]);
      for (let n = 0; n < players(s); n++) {
        const code = discardUntilEnemy(s, "The Crack of Doom");
        if (!code) break;
        const enemy = make(s, code);
        s.staging.push(enemy);
        log(
          s,
          `The Crack of Doom: ${card(code).name} is added to the staging area.`,
          "danger",
        );
        enemyAddedToStaging(s, enemy);
      }
      prepend(s, fx("stageRevealed"));
      return true;
    }
    // 4B: the last Fortitude test when Mount Doom is explored.
    case "mdCrack":
      if (e.value) {
        questDefeated(s, q.currentQuest);
        win(
          s,
          "The Ring-bearer completes the quest at the Crack of Doom, and the players win the game.",
        );
      } else
        lose(
          s,
          "The first player fails the last Fortitude test: the Ring-bearer claims The One Ring, and the players lose the game.",
        );
      return true;
    // Mordor Road: each player discards the top card of the encounter deck.
    case "mdMordorRoad": {
      const code = s.encounterDeck.shift();
      if (!code) {
        log(s, "Mordor Road: the encounter deck is empty.");
        return true;
      }
      if (card(code).type_code === "enemy") {
        const enemy = make(s, code);
        s.staging.push(enemy);
        log(
          s,
          `Mordor Road: ${who(s, p)} ${verb(s, "discard")} ${card(code).name}, which is added to the staging area.`,
          "danger",
        );
        enemyAddedToStaging(s, enemy);
      } else {
        s.encounterDiscard.push(code);
        log(
          s,
          `Mordor Road: ${who(s, p)} ${verb(s, "discard")} ${card(code).name}.`,
        );
      }
      return true;
    }
    // Orc-hold: shuffle the discard pile in, discard until an Orc enemy, engaged with the first player.
    case "mdHold": {
      s.encounterDeck = shuffle(s, [
        ...s.encounterDeck,
        ...s.encounterDiscard.splice(0),
      ]);
      log(
        s,
        "Orc-hold: the encounter discard pile is shuffled into the encounter deck.",
      );
      const code = discardUntil(
        s,
        "Orc-hold",
        (c) =>
          card(c).type_code === "enemy" &&
          (card(c).traits ?? "").split(".").some((t) => t.trim() === "Orc"),
        "Orc enemy",
      );
      if (!code) return true;
      const enemy = make(s, code);
      log(
        s,
        `Orc-hold: ${card(code).name} is put into play engaged with ${who(s, first)}.`,
        "danger",
      );
      enterEnemyEngaged(s, enemy, first);
      return true;
    }
    // Old Water-course: each player must exhaust a hero he controls to travel here.
    case "mdExhaustHero": {
      const ready = seatView(s, p).heroes.filter((h) => !h.exhausted);
      if (!ready.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Old Water-course · Exhaust a hero you control${seatLabel(s, p)}`,
          ready.map((h) => ({
            id: h.id,
            code: h.code,
            label: name(h),
            effects: [
              fx("moExhaust", {
                target: h.id,
                text: "Old Water-course",
                player: p,
              }),
            ],
          })),
          "Travel: each player must exhaust a hero he controls to travel here.",
        ),
      );
      return true;
    }
    // Old Water-course's Response: reduce each player's threat by 5.
    case "mdWater":
      forOwner(s, first, () =>
        choose(
          s,
          `Old Water-course · Response${seatLabel(s, first)}`,
          [
            {
              id: "reduce",
              label: "Reduce each player's threat by 5",
              effects: [fx("mdWaterReduce", { player: first })],
            },
            { id: "skip", label: "Do not use the Response", effects: [] },
          ],
          "Response: when Old Water-course is explored, reduce each player's threat by 5.",
        ),
      );
      return true;
    case "mdWaterReduce":
      for (const player of playerOrder(s))
        forOwner(s, player, () => reduceThreat(s, 5, MD.water, "encounter"));
      log(s, "Old Water-course: each player reduces his threat by 5.", "good");
      return true;
    // Gollum engages the first player.
    case "mdGollum":
      if (u && inStaging(s, u) && live(u, MD.gollum)) {
        forOwner(s, first, () => engage(s, u));
        if (!inStaging(s, u))
          log(s, `Gollum engages ${who(s, first)}.`, "danger");
      }
      return true;
    case "mdGollumIgnore": {
      const test = s.hideTest;
      const i = e.value ?? -1;
      if (!test || !isFortitude(test) || i < 0 || i >= test.discarded.length)
        return true;
      test.ignored = i;
      log(
        s,
        `Gollum: the Sauron's Eye icons of ${card(test.discarded[i]).name} are ignored for this test.`,
        "good",
      );
      return true;
    }
    // “Wicked Master!”: Gollum attacks the first player, or comes for him.
    case "mdMaster": {
      const gollum = gollumInPlay(s);
      if (gollum) {
        log(
          s,
          `“Wicked Master!”: Gollum makes an immediate attack against ${who(s, first)}.`,
          "danger",
        );
        prepend(s, fx("immediateAttack", { target: gollum.id, player: first }));
        return true;
      }
      const zone = [s.encounterDeck, s.encounterDiscard].find((z) =>
        z.includes(MD.gollum),
      );
      if (!zone) {
        log(s, "“Wicked Master!”: Gollum is not found.");
        return true;
      }
      zone.splice(zone.indexOf(MD.gollum), 1);
      if (zone === s.encounterDeck)
        s.encounterDeck = shuffle(s, s.encounterDeck);
      const enemy = make(s, MD.gollum);
      log(
        s,
        `“Wicked Master!”: Gollum is put into play engaged with ${who(s, first)}.`,
        "danger",
      );
      enterEnemyEngaged(s, enemy, first);
      return true;
    }
    // Little Snuffler: raise your threat for each ally, or discard an ally.
    case "mdSnuffler": {
      const allies = seatView(s, p).allies.filter((x) => isAlly(x));
      either(
        s,
        p,
        "Little Snuffler",
        [
          ...(allies.length
            ? [
                {
                  id: "threat",
                  label: `Raise your threat by ${allies.length}`,
                  effects: [
                    fx("moThreat", {
                      value: allies.length,
                      text: "Little Snuffler",
                      player: p,
                    }),
                  ],
                },
              ]
            : []),
          ...allies.map((x) => ({
            id: `discard-${x.id}`,
            code: x.code,
            label: `Discard ${name(x)}`,
            effects: [fx("mdDiscardAlly", { target: x.id, player: p })],
          })),
        ],
        "When Revealed: either raise your threat by 1 for each ally you control, or discard an ally you control.",
      );
      return true;
    }
    case "mdDiscardAlly":
      if (u && isAlly(u)) {
        log(s, `Little Snuffler: ${name(u)} is discarded.`, "danger");
        forOwner(s, ownerOf(s, u), () => destroy(s, u, false));
      }
      return true;
    // Big Uruk: raise your threat by 4, or an immediate attack.
    case "mdUruk": {
      const engagedNow = !!u && globalEngaged(s).some((x) => x.id === u.id);
      either(
        s,
        p,
        "Big Uruk",
        [
          {
            id: "threat",
            label: "Raise your threat by 4",
            effects: [
              fx("moThreat", { value: 4, text: "Big Uruk", player: p }),
            ],
          },
          ...(engagedNow
            ? [
                {
                  id: "attack",
                  code: MD.uruk,
                  label: "Big Uruk makes an immediate attack against you",
                  effects: [
                    fx("immediateAttack", { target: u!.id, player: p }),
                  ],
                },
              ]
            : []),
        ],
        "Forced: after Big Uruk engages you, either raise your threat by 4, or Big Uruk makes an immediate attack against you.",
      );
      return true;
    }
    // Ringwraith of Sauron: engages the player who failed and attacks.
    case "mdWraith":
      if (u && inStaging(s, u) && live(u, MD.wraith)) {
        forOwner(s, p, () => engage(s, u));
        if (inStaging(s, u)) return true;
        log(
          s,
          `Ringwraith of Sauron engages ${who(s, p)} and makes an immediate attack.`,
          "danger",
        );
        prepend(s, fx("immediateAttack", { target: u.id, player: p }));
      }
      return true;
    // Foul Fumes: 1 damage to each character you control; damaged text boxes blank.
    case "mdFumes": {
      const targets = charactersOf(s, p);
      log(
        s,
        `Foul Fumes: 1 damage to each character ${who(s, p)} ${verb(s, "control")}.`,
        "danger",
      );
      prepend(
        s,
        ...targets.map((x) =>
          fx("damage", { target: x.id, value: 1, player: p }),
        ),
        fx("mdFumesBlank", { player: p }),
      );
      return true;
    }
    case "mdFumesBlank": {
      const ids = charactersOf(s, p)
        .filter((x) => x.damage > 0)
        .map((x) => x.id);
      const prior = q.fumes?.round === s.round ? q.fumes.ids : [];
      q.fumes = { round: s.round, ids: [...new Set([...prior, ...ids])] };
      if (ids.length)
        log(
          s,
          "Foul Fumes: until the end of the round, the printed text box of each damaged character is blank (except for Traits).",
          "danger",
        );
      return true;
    }
    // Heavy and Tired: attach to the hero with the most attachments and exhaust it.
    case "mdHeavy": {
      const heroes = globalCharacters(s).filter((h) => isHero(h) && !heavy(h));
      if (!heroes.length) {
        log(s, "Heavy and Tired: no hero can take it.");
        return true;
      }
      const most = Math.max(...heroes.map((h) => h.attachments.length));
      const tied = heroes.filter((h) => h.attachments.length === most);
      const options: Option[] = tied.map((h) => ({
        id: h.id,
        code: h.code,
        label: `${name(h)} · ${h.attachments.length} attachment${h.attachments.length === 1 ? "" : "s"}`,
        effects: [
          fx("mdHeavyAttach", { target: h.id, source: e.source, player: p }),
        ],
      }));
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return true;
      }
      forOwner(s, first, () =>
        choose(
          s,
          `Heavy and Tired · Choose the hero with the most attachments${seatLabel(s, first)}`,
          options,
          "When Revealed: attach Heavy and Tired to the hero with the most attachments and exhaust that hero.",
        ),
      );
      return true;
    }
    case "mdHeavyAttach": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (!u || i < 0 || heavy(u)) return true;
      const [held] = q.resolving.splice(i, 1);
      u.attachments.push({ id: held.id, code: held.code, exhausted: false });
      exhaustCharacter(s, u);
      log(
        s,
        `Heavy and Tired is attached to ${name(u)}, who is exhausted: he cannot commit to Fortitude tests.`,
        "danger",
      );
      return true;
    }
    case "mdHeavyFailed":
      if (u && heavy(u)) {
        exhaustCharacter(s, u);
        const gone = u.attachments.filter(
          (a) => card(a.code).type_code !== "objective",
        );
        for (const a of gone) discardAttachment(s, u, a);
        log(
          s,
          `Heavy and Tired: ${name(u)} is exhausted, and each non-objective attachment on him is discarded.`,
          "danger",
        );
      }
      return true;
    // The Tower of Barad-dûr: threat for each non-Fellowship character.
    case "mdTower": {
      const n = charactersOf(s, p).filter((x) => !isFellowship(x)).length;
      if (n <= 0) return true;
      forOwner(s, p, () => raiseThreat(s, n, "encounter"));
      log(
        s,
        `The Tower of Barad-dûr: ${who(s, p)} ${verb(s, "raise")} ${his(s)} threat by ${n} (1 for each non-Fellowship character).`,
        "danger",
      );
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hooks.

export const MOUNT_DOOM_HOOKS: Batch4ScenarioHooks = {
  setup: setupMountDoom,
  // 1A's setup resolves once the opening hands are kept: Brake of Thorns'
  // Forced effect, then each player's search.
  openingHandsKept: (s) => {
    const q = s.mountDoom;
    if (!q || q.ready || s.round > 0) return false;
    const first = firstPlayer(s);
    prepend(
      s,
      ...(activeIs(s, MD.brake) ? brakeEffects(s) : []),
      ...playerOrder(s).map((player) => fx("mdSearch", { player })),
      fx("mdReady", { player: first }),
      fx("nextRound"),
    );
    return true;
  },
  advance,
  stageInfo: mountDoomStageInfo,
  check: (s) => {
    if (s.mountDoom && s.status === "playing") lotrSagaCheck(s);
  },
  encounter,
  shadow,
  // 1B and 3B: the first treachery revealed each quest phase.
  revealed: (s, code) => {
    const q = s.mountDoom;
    if (!q) return;
    delete q.immuneReveal;
    if (card(code).type_code !== "treachery") return;
    if (!(at(s, MD.land) || at(s, MD.gasp))) return;
    if (phaseOf(s) !== "quest" || q.firstTreachery === s.round) return;
    q.firstTreachery = s.round;
    q.immuneReveal = code;
    log(
      s,
      `${card(code).name} is the first treachery revealed this quest phase: it is immune to player card effects and gains surge.`,
      "danger",
    );
  },
  revealedSurge: (s, code) =>
    !!s.mountDoom &&
    s.mountDoom.immuneReveal === code &&
    s.mountDoom.firstTreachery === s.round,
  // 4B: 'when revealed' effects cannot be canceled; nor can an immune treachery's.
  cannotCancel: (s, shadowEffect, code) => {
    const q = s.mountDoom;
    if (!q || shadowEffect) return false;
    if (at(s, MD.crack)) return true;
    return !!code && q.immuneReveal === code && q.firstTreachery === s.round;
  },
  questBegin: (s) =>
    at(s, MD.gasp) ? [fortitude(firstPlayer(s), MD.gasp)] : [],
  // 2B: after placing progress here from questing successfully.
  successfulQuestProgress: (s, amount) => {
    if (!at(s, MD.road) || amount <= 0) return;
    prepend(s, ...playerOrder(s).map((player) => fortitude(player, MD.road)));
  },
  endQuest: (s) => {
    const q = s.mountDoom;
    if (!q || !at(s, MD.road) || (q.resources ?? 0) < players(s)) return;
    q.advancing = true;
    prepend(s, fx("mdStageThree", { player: firstPlayer(s) }));
  },
  // 3B: no more than 5 progress this round after a failed test.
  progress: (s, amount, quest) => {
    const q = s.mountDoom;
    if (
      !q ||
      !at(s, MD.gasp) ||
      q.capped?.round !== s.round ||
      quest.id !== mainQuestUnit(s)?.id
    )
      return amount;
    const room = Math.max(0, MD_GASP_CAP - q.capped.placed);
    if (amount > room)
      log(
        s,
        `The Last Gasp: no more than ${MD_GASP_CAP} progress can be placed on this stage this round${room ? `; ${amount - room} progress cannot be placed` : ""}.`,
      );
    return Math.min(amount, room);
  },
  questProgressPlaced: (s, quest, amount) => {
    const q = s.mountDoom;
    if (
      q?.capped?.round === s.round &&
      at(s, MD.gasp) &&
      quest.id === mainQuestUnit(s)?.id
    )
      q.capped.placed += amount;
  },
  // Fortitude tests.
  hideThreatBonus: (s) => {
    const test = s.hideTest;
    if (!s.mountDoom || !isFortitude(test) || !test) return 0;
    const brakes = s.staging.filter((u) => live(u, MD.brake)).length;
    const ring = oneRing(s);
    const eye = test.source === MD.eye && !!ring?.exhausted ? 2 : 0;
    return brakes + eye;
  },
  hidePassed: testPassed,
  hideFailed: testFailed,
  fortitudeCommitBlocked: (s, u) =>
    !!s.mountDoom && !!heavy(u) && !heavy(u)!.blanked,
  fortitudeDiscarded: gollumDiscarded,
  cardEntered: (s, u, fromReveal, cancelled) => {
    if (!s.mountDoom || !fromReveal || cancelled || u.blanked) return;
    if (u.code === MD.snuffler)
      prepend(s, fx("mdSnuffler", { player: activeSeat(s) }));
  },
  // Gollum engages the first player.
  enemyEntered: (s, u) => {
    if (!s.mountDoom || !live(u, MD.gollum) || !inStaging(s, u)) return;
    prepend(s, fx("mdGollum", { target: u.id, player: firstPlayer(s) }));
  },
  engaged: (s, u) => {
    if (!s.mountDoom || u.blanked) return;
    const p = activeSeat(s);
    if (u.code === MD.uruk)
      prepend(s, fx("mdUruk", { target: u.id, player: p }));
    if (u.code === MD.captain) prepend(s, fortitude(p, MD.captain));
  },
  characterDestroyed: (s, u, context) => {
    if (!s.mountDoom || !isCharacter(u) || !context.combatDamage || !s.combat)
      return;
    if (context.enemyId !== s.combat.enemyId) return;
    mordorOrcCharacterDestroyed(s, context);
    deepShadowsCharacterDestroyed(s, context);
  },
  travelProblem: (s, u) => {
    if (!s.mountDoom || u.blanked) return null;
    if (
      u.code === MD.doom &&
      !(at(s, MD.gasp) && s.progress >= MD_GASP_PROGRESS)
    )
      return `The players cannot travel to Mount Doom unless there is at least ${MD_GASP_PROGRESS} progress on stage 3B.`;
    if (u.code === MD.water)
      for (const p of playerOrder(s))
        if (!seatView(s, p).heroes.some((h) => !h.exhausted))
          return "Old Water-course: each player must exhaust a hero he controls to travel here.";
    return null;
  },
  travelEffects: (s, u) => {
    if (!s.mountDoom || u.blanked) return undefined;
    if (u.code === MD.plain) return [fortitude(firstPlayer(s), MD.plain)];
    if (u.code === MD.doom)
      return playerOrder(s).map((player) => fortitude(player, MD.doom));
    if (u.code === MD.water)
      return playerOrder(s).map((player) => fx("mdExhaustHero", { player }));
    return undefined;
  },
  // "After … becomes the active location", by any means.
  travelEntered: (s, u) => {
    if (s.mountDoom) locationActivated(s, u);
  },
  explored: (s, u, wasActive) => {
    if (!s.mountDoom) return;
    const first = firstPlayer(s);
    // 4B: the last Fortitude test, with 1 extra card for each player.
    if (u.code === MD.doom && at(s, MD.crack))
      prepend(s, fortitude(first, MD.crack, players(s)));
    if (live(u, MD.water) && wasActive)
      prepend(s, fx("mdWater", { player: first }));
  },
  threatBonus: (s, u) => {
    if (!s.mountDoom || u.blanked) return 0;
    if (u.code === MD.doom) return tens(s, firstPlayer(s));
    if (u.code === MD.mordorRoad)
      return Math.max(
        0,
        ...playerOrder(s).map(
          (p) => seatView(s, p).allies.filter((x) => isAlly(x)).length,
        ),
      );
    if (u.code === MD.plain && fortitudeFailures(s).length) return 2;
    return 0;
  },
  // Orc-hold: no progress on the other locations in the staging area.
  locationProgressBlocked: (s, u) =>
    !!s.mountDoom &&
    inStaging(s, u) &&
    s.staging.some((x) => x.id !== u.id && live(x, MD.hold)),
  // The Tower of Barad-dûr: no threat raise at the end of the refresh phase.
  refreshThreatBonus: (s) => (s.mountDoom && tower(s) ? -1 : 0),
  roundEnd: (s) =>
    s.mountDoom && tower(s)
      ? playerOrder(s).map((player) => fx("mdTower", { player }))
      : [],
  characterBlanked: (s, u) =>
    !!s.mountDoom &&
    s.mountDoom.fumes?.round === s.round &&
    s.mountDoom.fumes.ids.includes(u.id),
  // 4B: allies cannot enter play.
  playProblem: (s, code) =>
    s.mountDoom && at(s, MD.crack) && card(code).type_code === "ally"
      ? "The Crack of Doom: allies cannot enter play."
      : null,
  allyEntryProblem: (s) =>
    s.mountDoom && at(s, MD.crack)
      ? "The Crack of Doom: allies cannot enter play."
      : null,
  cannotAttach: (s, u, code) =>
    !!s.mountDoom &&
    live(u, MD.wraith) &&
    !(card(code).traits ?? "").split(".").some((t) => t.trim() === "Morgul"),
  threatReduction: (s, amount, reason, source) =>
    s.mountDoom ? direThreatReduction(s, amount, reason, source) : amount,
  effect: (s, e) =>
    (!!s.mountDoom && (mordorOrcsEffect(s, e) || deepShadowsEffect(s, e))) ||
    mountDoomEffect(s, e),
  sharedEffect: (e) =>
    [
      "mdTreacheryDone",
      "mdReady",
      "mdStageTwo",
      "mdStageThree",
      "mdStageFour",
      "mdCrack",
      "mdHold",
      "mdWater",
      "mdWaterReduce",
      "mdGollum",
      "mdGollumIgnore",
      "mdMaster",
      "mdHeavy",
    ].includes(e.kind),
};
