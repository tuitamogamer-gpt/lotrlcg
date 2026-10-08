import { base as fordsBase } from "./fords-isen-fixtures";
import {
  FOUNDATIONS_STONE as F,
  foundationsSelectArea,
  foundationsSyncArea,
} from "../src/game/foundations-stone-support";
import { effectCardPlayProblem, playCardFromEffect } from "../src/game/actions";
import { putPlayerDeck } from "../src/game/core";
import { base as tharbadBase } from "./tharbad-fixtures";
import { base as ninBase } from "./nin-eilph-fixtures";
import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  canPlay,
  validateSave,
  publicState,
  playTargets,
} from "../src/game/engine";
import { card, SCRIPTED } from "../src/game/cards";
import { DECK_CARDS, parseRingsDbDeck } from "../src/game/decks";
import { fx, get, make, questStat, stageInfo } from "../src/game/core";
import { check, progress } from "../src/game/board";
import { handle, flush } from "../src/game/effects";
import {
  currentQuestCode,
  currentQuestProgress,
  currentQuestUnit,
  mainQuestCode,
  mainQuestUnit,
  attachToQuest,
} from "../src/game/quest-state";
import {
  addCurrentQuestProgress,
  removeCurrentQuestProgress,
  sideQuestStart,
} from "../src/game/side-quests";
import { selectedSideQuest } from "../src/game/side-quest-support";
import {
  activeSeat,
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
  startPhase,
  syncSeat,
} from "../src/game/table";
import { questTime } from "../src/game/quest-time";
import { fordsCardsDrawn } from "../src/game/fords-isen";
import { FORDS } from "../src/game/fords-isen-support";
import { base, choose, reload } from "./against-shadow-final-fixtures";
import type { GameState, ScenarioId } from "../src/game/types";

const G = "09014";
function side(s: GameState, owner = 0) {
  const u = make(s, G);
  u.owner = owner;
  u.controller = owner;
  s.staging.push(u);
  return u;
}
function select(s: GameState, id = side(s).id) {
  s.phase = "quest";
  sideQuestStart(s);
  flush(s);
  return choose(s, id);
}
function selected(id: ScenarioId = "mirkwood", players = 1) {
  return select(
    id === "fords-of-isen"
      ? fordsBase(players)
      : id === "trouble-in-tharbad"
        ? tharbadBase(players)
        : id === "the-nin-in-eilph"
          ? ninBase(players)
          : base(id, players),
  );
}

test("Gather Information uses verified printed quest, victory and deck limit", () => {
  assert.ok(SCRIPTED.has(G));
  assert.ok(DECK_CARDS.some((c) => c.code === G));
  assert.equal(card(G).quest, 4);
  assert.equal(card(G).victory, 1);
  assert.equal(card(G).deck_limit, 1);
  const report = parseRingsDbDeck({ slots: { [G]: 3 } });
  assert.equal(report.deck.cards[G], 1);
  assert.ok(report.adjustments.some((s) => /limit of 1/.test(s)));
});
test("side quests play from hand into staging only during their owner's planning turn", () => {
  let s = base("mirkwood", 2),
    u = make(s, G);
  s.hand.push(u);
  s.phase = "quest";
  assert.match(canPlay(s, u)!, /planning/);
  s.phase = "planning";
  s.table!.turn = 1;
  assert.match(canPlay(s, u)!, /planning turn/);
  s.table!.turn = 0;
  assert.equal(canPlay(s, u), null);
  s = applyAction(s, { type: "PLAY", id: u.id });
  assert.equal(s.hand.length, 0);
  assert.equal(s.staging[0].id, u.id);
  assert.equal(s.staging[0].controller, 0);
  assert.ok(!s.discard.includes(G));
  assert.equal(s.choice, null);
  assert.equal(s.progress, 0);
});
test("real phase entry offers the first player main and all physical side quests", () => {
  let s = base("mirkwood", 2);
  const a = side(s),
    b = side(s, 1);
  s.table!.first = 1;
  handle(s, fx("startQuest"));
  flush(s);
  assert.equal(activeSeat(s), 1);
  assert.equal(s.choice!.options.length, 3);
  assert.ok(s.choice!.options.some((o) => o.id === a.id));
  s = choose(reload(s), b.id);
  assert.equal(currentQuestUnit(s)?.id, b.id);
  assert.equal(currentQuestCode(s), G);
  assert.equal(mainQuestCode(s), "01119");
  assert.equal(stageInfo(s).quest, 4);
});
test("choosing the main quest preserves unfinished side quests in staging", () => {
  let s = base("mirkwood");
  const u = side(s);
  u.progress = 2;
  s.phase = "quest";
  sideQuestStart(s);
  flush(s);
  s = choose(s, "main");
  progress(s, 1);
  assert.equal(s.progress, 1);
  assert.equal(get(s, u.id)?.progress, 2);
  assert.equal(currentQuestCode(s), "01119");
});
test("active location buffers progress before the selected side quest", () => {
  const s = selected();
  s.progress = 2;
  s.activeLocation = make(s, "01099");
  progress(s, 5);
  assert.equal(s.activeLocation, null);
  assert.equal(currentQuestProgress(s), 2);
  assert.equal(s.progress, 2);
  assert.equal(publicState(s).quest.progress, 2);
});
test("defeat removes only the selected physical copy and discards all overflow", () => {
  let s = base("mirkwood");
  const a = side(s),
    b = side(s);
  b.progress = 1;
  s = select(s, a.id);
  s.progress = 3;
  progress(s, 20);
  flush(s);
  assert.equal(s.progress, 3);
  assert.equal(s.stage, 1);
  assert.ok(!get(s, a.id));
  assert.equal(get(s, b.id)?.progress, 1);
  assert.equal(s.victory, 1);
  assert.deepEqual(s.victoryCards, [G]);
  assert.equal(currentQuestCode(s), G);
  assert.equal(currentQuestProgress(s), 4);
  assert.equal(currentQuestUnit(s), undefined);
  s = choose(reload(s), "skip");
  progress(s, 10);
  assert.equal(s.progress, 3);
  assert.equal(s.victory, 1);
});
test("a defeated side quest consumes the remainder of the phase, then combat progress goes to main", () => {
  let s = selected();
  progress(s, 4);
  flush(s);
  s = choose(s, "skip");
  startPhase(s, "staging");
  progress(s, 3);
  assert.equal(s.progress, 0);
  startPhase(s, "travel");
  assert.equal(s.sideQuestSelections, undefined);
  startPhase(s, "attack");
  progress(s, 2, true);
  assert.equal(s.progress, 2);
  assert.equal(currentQuestCode(s), "01119");
});
test("direct quest progress and removal affect the current side quest without changing main", () => {
  const s = selected();
  s.progress = 6;
  s.activeLocation = make(s, "01099");
  addCurrentQuestProgress(s, 3);
  assert.equal(currentQuestProgress(s), 3);
  assert.equal(s.activeLocation.progress, 0);
  assert.equal(removeCurrentQuestProgress(s, 2), 2);
  assert.equal(currentQuestProgress(s), 1);
  assert.equal(s.progress, 6);
  assert.equal(removeCurrentQuestProgress(s, 99), 1);
});
test("selected but departed side quest cannot redirect new progress to main", () => {
  const s = selected();
  s.staging = [];
  progress(s, 30);
  assert.equal(s.progress, 0);
  assert.equal(currentQuestCode(s), G);
  assert.equal(removeCurrentQuestProgress(s, 1), 0);
});
test("each player searches their own deck and can independently decline", () => {
  let s = selected("mirkwood", 3);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.deck = ["01013", "01014", "01013"];
      s.hand = [];
    });
  progress(s, 4);
  flush(s);
  s = choose(s, "search");
  assert.equal(activeSeat(s), 0);
  s = choose(reload(s), "card-2");
  assert.equal(activeSeat(s), 1);
  s = choose(reload(s), "skip");
  assert.equal(activeSeat(s), 2);
  s = choose(reload(s), "card-1");
  assert.equal(seatView(s, 0).hand[0].code, "01013");
  assert.equal(seatView(s, 1).hand.length, 0);
  assert.equal(seatView(s, 1).deck.length, 3);
  assert.equal(seatView(s, 2).hand[0].code, "01014");
  assert.equal(seatView(s, 0).deck.filter((c) => c === "01013").length, 1);
});
test("declining the response does not search or shuffle any deck", () => {
  let s = selected();
  const deck = [...s.deck],
    seed = s.seed;
  progress(s, 4);
  flush(s);
  s = choose(s, "skip");
  assert.deepEqual(s.deck, deck);
  assert.equal(s.seed, seed);
});
test("empty player deck still gets a legal decline-and-shuffle choice", () => {
  let s = selected();
  s.deck = [];
  progress(s, 4);
  flush(s);
  s = choose(s, "search");
  assert.equal(s.choice!.options.length, 1);
  s = choose(reload(s), "skip");
  assert.equal(s.hand.length, 0);
});
test("Gather searches add cards to hand without triggering card-draw penalties", () => {
  let s = selected();
  const berserker = make(s, FORDS.berserker);
  s.engaged = [berserker];
  progress(s, 4);
  flush(s);
  s = choose(s, "search");
  s = choose(s, "card-0");
  assert.equal(s.combat, null);
  assert.equal(s.queue.length, 0);
});
test("main quest attachments stay in play and active while a side quest is current", () => {
  let s = base("mirkwood");
  const a = { id: `a${s.nextId++}`, code: FORDS.hatreds, exhausted: false };
  attachToQuest(s, mainQuestCode(s)!, a);
  s = select(s);
  check(s);
  assert.equal(mainQuestUnit(s)?.attachments[0].id, a.id);
  const threat = s.threat;
  fordsCardsDrawn(s);
  flush(s);
  assert.equal(s.threat, threat + 1);
  assert.ok(!s.encounterDiscard.includes(a.code));
});
test("physical attachments on side quests remain active when the main quest is current", () => {
  const s = selected();
  const u = currentQuestUnit(s)!;
  assert.ok(
    attachToQuest(s, G, {
      id: `a${s.nextId++}`,
      code: FORDS.hatreds,
      exhausted: false,
    }),
  );
  startPhase(s, "planning");
  const threat = s.threat;
  fordsCardsDrawn(s);
  flush(s);
  assert.equal(s.threat, threat + 1);
  assert.equal(u.attachments.length, 1);
});
test("defeating a side quest discards its own attachments and preserves main attachments", () => {
  const s = selected();
  const q = currentQuestUnit(s)!;
  q.attachments.push({
    id: `a${s.nextId++}`,
    code: FORDS.hatreds,
    exhausted: false,
  });
  s.questAttachments = {
    "01119": [{ id: `a${s.nextId++}`, code: FORDS.wild, exhausted: false }],
  };
  progress(s, 4);
  assert.ok(s.encounterDiscard.includes(FORDS.hatreds));
  assert.equal(s.questAttachments["01119"].length, 1);
});
for (const scenario of [
  "peril-in-pelargir",
  "into-ithilien",
  "siege-of-cair-andros",
  "the-blood-of-gondor",
  "assault-on-osgiliath",
] as ScenarioId[])
  test(`${scenario}: selected side quest uses its own willpower keyword and progress`, () => {
    const s = selected(scenario);
    assert.equal(questStat(s), "will");
    progress(s, 3);
    assert.equal(currentQuestProgress(s), 3);
    assert.equal(s.progress, 0);
  });
for (const scenario of [
  "trouble-in-tharbad",
  "to-catch-an-orc",
  "the-nin-in-eilph",
  "the-stewards-fear",
  "encounter-at-amon-din",
] as ScenarioId[])
  test(`${scenario}: main-stage progress replacement does not replace side-quest progress`, () => {
    const s = selected(scenario),
      threat = s.threat;
    progress(s, 3, false, true);
    assert.equal(currentQuestProgress(s), 3);
    assert.equal(s.progress, 0);
    assert.equal(s.threat, threat);
  });
test("Time effects target the current quest and resume on main after quest phase", () => {
  const s = selected("fords-of-isen");
  assert.equal(questTime(s), undefined);
  startPhase(s, "travel");
  assert.ok(questTime(s));
});
test("save validation rejects forged side-quest state and preserves valid completed selections", () => {
  const s = selected();
  syncSeat(s);
  assert.ok(validateSave(s));
  for (const value of [
    null,
    [],
    { shared: { id: "x", code: "01013" } },
    { shared: { id: "", code: G } },
    { shared: { id: "x", code: G, defeated: 1 } },
  ])
    assert.equal(
      validateSave({ ...s, sideQuestSelections: value }),
      false,
      JSON.stringify(value),
    );
  progress(s, 4);
  flush(s);
  assert.ok(validateSave(reload(s)));
});

test("Trained for War changes the physical current side quest, then expires", () => {
  let s = selected();
  s.heroes = [make(s, "09001"), make(s, "01005"), make(s, "01006")];
  s.heroes.forEach((h) => (h.resources = 10));
  const e = make(s, "06036");
  s.hand.push(e);
  s = applyAction(s, { type: "PLAY", id: e.id });
  assert.equal(questStat(s), "attack");
  startPhase(s, "travel");
  assert.equal(questStat(s), "will");
});
test("The Long Defeat responds to side quest defeat before Gather's search", () => {
  let s = selected();
  currentQuestUnit(s)!.attachments.push({
    id: `a${s.nextId++}`,
    code: "10122",
    exhausted: false,
    owner: 0,
  });
  progress(s, 4);
  flush(s);
  assert.match(s.choice!.title, /The Long Defeat/);
  assert.ok(s.discard.includes("10122"));
  const decline =
    s.choice!.options.find((o) => o.id === "skip") ?? s.choice!.options.at(-1)!;
  s = choose(reload(s), decline.id);
  assert.match(s.choice!.title, /Gather Information/);
});
test("The Long Defeat can attach to an unselected side quest during planning", () => {
  let s = base("mirkwood");
  const q = side(s),
    a = make(s, "10122");
  s.hand.push(a);
  s.heroes[0].phaseResourceIcons = ["lore"];
  assert.ok(playTargets(s, a).some((u) => u.id === q.id));
  s = applyAction(s, { type: "PLAY", id: a.id, target: q.id });
  assert.equal(get(s, q.id)?.attachments[0].id, a.id);
  const second = make(s, "10122");
  s.hand.push(second);
  assert.ok(!playTargets(s, second).some((u) => u.id === q.id));
  assert.ok(playTargets(s, second).some((u) => u.id === mainQuestUnit(s)!.id));
});
test("a free attachment can still attach to the main quest while a side quest is current", () => {
  const s = selected(),
    a = make(s, "10122");
  s.deck = [a.code];
  s.heroes[0].phaseResourceIcons = ["lore"];
  playCardFromEffect(s, a, {
    putIntoPlay: false,
    target: mainQuestUnit(s)!.id,
  });
  assert.equal(mainQuestUnit(s)!.attachments[0].code, a.code);
  assert.equal(currentQuestUnit(s)!.attachments.length, 0);
});
test("Mendor responds to defeat of a side quest stage", () => {
  const s = selected(),
    m = make(s, "rc135");
  m.exhausted = true;
  s.allies.push(m);
  const before = s.hand.length;
  progress(s, 4);
  assert.equal(m.exhausted, false);
  assert.equal(s.hand.length, before + 1);
});
test("free player-card effects can play or put a side quest into its staging zone", () => {
  for (const putIntoPlay of [false, true]) {
    const s = base("mirkwood"),
      u = make(s, G);
    s.phase = "quest";
    s.deck = [G];
    assert.equal(effectCardPlayProblem(s, u, { putIntoPlay }), null);
    playCardFromEffect(s, u, { putIntoPlay });
    flush(s);
    assert.equal(s.staging[0]?.id, u.id);
    assert.ok(!s.discard.includes(G));
    assert.equal(selectedSideQuest(s), undefined);
  }
});
test("searching an indexed player card retains its tracked physical identity", () => {
  let s = selected();
  s.deck = [];
  const u = make(s, "01013");
  putPlayerDeck(s, u);
  const other = make(s, "04105");
  s.used.push(`phase:heavy-stroke:${other.id}`);
  putPlayerDeck(s, other);
  progress(s, 4);
  flush(s);
  s = choose(s, "search");
  s = choose(s, "card-1");
  assert.equal(s.hand[0].id, other.id);
  assert.equal(s.deck.length, 1);
});
test("an independent main-stage condition can advance while a side quest remains current", () => {
  let s = selected("into-the-pit");
  s.stage = 2;
  s.progress = 0;
  // Into the Pit 2B advances when there are no enemies, even without progress.
  check(s);
  assert.equal(s.stage, 3);
  assert.equal(currentQuestCode(s), G);
  progress(s, 2);
  assert.equal(currentQuestProgress(s), 2);
  assert.equal(s.progress, 0);
});
function separated() {
  const s = base("foundations-of-stone", 2),
    a = make(s, G),
    b = make(s, G);
  a.owner = 0;
  b.owner = 1;
  const d = s.foundationsStone!;
  d.split = true;
  d.setAside = [];
  s.stage = 4;
  d.areas = [a, b].map((u, p) => ({
    id: `foundations-area-${p}`,
    players: [p],
    questCode: p ? F.bank : F.caves,
    progress: 0,
    staging: [u],
    activeLocation: null,
    extraActiveLocations: [],
    questDebuff: 0,
    fog: 0,
    threatModifier: 0,
  }));
  d.activeArea = undefined;
  foundationsSelectArea(s, 0);
  s.stageRevealing = false;
  return { s, a, b };
}
test("each separated staging area chooses and tracks its own side quest", () => {
  let { s, a, b } = separated();
  s.phase = "quest";
  sideQuestStart(s);
  flush(s);
  assert.equal(activeSeat(s), 0);
  s = choose(reload(s), a.id);
  assert.equal(activeSeat(s), 1);
  s = choose(reload(s), b.id);
  forOwner(s, 0, () => {
    progress(s, 2);
    assert.equal(currentQuestProgress(s), 2);
  });
  forOwner(s, 1, () => {
    progress(s, 3);
    assert.equal(currentQuestProgress(s), 3);
  });
  s = reload(s);
  forOwner(s, 0, () => assert.equal(currentQuestProgress(s), 2));
  forOwner(s, 1, () => assert.equal(currentQuestProgress(s), 3));
  assert.equal(s.foundationsStone!.areas[0].progress, 0);
  assert.equal(s.foundationsStone!.areas[1].progress, 0);
});
test("a side-quest response affects only players in its separated staging area", () => {
  let { s, a } = separated();
  s.phase = "quest";
  sideQuestStart(s);
  flush(s);
  s = choose(s, a.id);
  s = choose(s, "main");
  selectSeat(s, 0);
  progress(s, 4);
  flush(s);
  s = choose(s, "search");
  assert.equal(activeSeat(s), 0);
  s = choose(reload(s), "card-0");
  assert.equal(s.choice, null);
  assert.equal(seatView(s, 1).hand.length, 0);
  selectSeat(s, 1);
  assert.equal(currentQuestCode(s), F.bank);
});
test("Washed Away preserves an unfinished selected player side quest in its owner's area", () => {
  let s = base("foundations-of-stone", 2),
    u = side(s, 1);
  s = select(s, u.id);
  s.stage = 3;
  s.stageRevealing = true;
  handle(s, fx("foundationsWashedAway"));
  assert.ok(s.foundationsStone!.split);
  selectSeat(s, 1);
  assert.equal(currentQuestUnit(s)?.id, u.id);
  selectSeat(s, 0);
  assert.notEqual(currentQuestCode(s), G);
  foundationsSyncArea(s);
});
