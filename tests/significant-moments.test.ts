import test from "node:test";
import assert from "node:assert/strict";
import { detectSignificantMoment } from "../src/ui/significant-moments";
import { applyAction, createGame } from "../src/game/engine";
import { make } from "../src/game/core";
import { damage, revealed } from "../src/game/board";
import { flush } from "../src/game/effects";
import {
  allCharacters,
  forOwner,
  globalHeroes,
  seatView,
} from "../src/game/table";
import { WEATHER as W } from "../src/game/weather-hills-support";
import { CHETWOOD as C } from "../src/game/chetwood-support";
import { base, choose, reload, settle } from "./weather-hills-fixtures";
import { STARTERS } from "../src/game/cards";
import { base as cleanFixture } from "./against-shadow-final-fixtures";
import {
  FOUNDATIONS_STONE as F,
  foundationsCurrentQuest,
  foundationsSelectArea,
} from "../src/game/foundations-stone";
import type { GameState, Unit } from "../src/game/types";

function second(s: GameState) {
  s.stage = 2;
  const m = s.staging.find((u) => u.code === W.mission)!;
  m.flipped = true;
  m.resources = 4;
  s.weatherHills!.orcDeck = [];
  s.weatherHills!.setAside = [];
  return s;
}
function committed(s: GameState, quest?: Unit) {
  s.phase = "staging";
  s.heroes[0].committed = true;
  s.heroes[0].exhausted = true;
  s.heroes[0].tempWill = 20;
  s.committedIds = [s.heroes[0].id];
  if (quest)
    s.sideQuestSelections = { shared: { id: quest.id, code: quest.code } };
  return s;
}
function splitFoundations() {
  const s = cleanFixture("foundations-of-stone", 2);
  const d = s.foundationsStone!;
  d.areas = [F.lair, F.rocks].map((questCode, i) => ({
    id: `area-${i}`,
    players: [i],
    questCode,
    progress: 0,
    staging: [],
    activeLocation: null,
    extraActiveLocations: [],
    questDebuff: 0,
    fog: 0,
    threatModifier: 0,
  }));
  d.split = true;
  d.setAside = [];
  d.activeArea = undefined;
  d.resolvedAreas = [];
  d.travelPassedAreas = [];
  s.stage = 4;
  s.stageRevealing = false;
  foundationsSelectArea(s, 0);
  return s;
}

test("a real Weather Mission flip produces the new quest's stage moment without advancing pending choices", () => {
  const before = base();
  before.phase = "attack";
  before.staging[0].resources = 3;
  const e = make(before, W.cornered);
  e.damage = 1;
  before.engaged.push(e);
  const after = applyAction(reload(before), {
    type: "ATTACK",
    enemyId: e.id,
    attackerIds: [before.heroes[0].id],
  });
  assert.equal(after.stage, 2);
  const snapshot = JSON.stringify(after);
  const moment = detectSignificantMoment(before, after);
  assert.equal(moment?.kind, "stage");
  assert.match(moment!.title, /Cornered Animals/);
  assert.equal(
    JSON.stringify(after),
    snapshot,
    "presentation cannot resolve any engine choice",
  );
  assert.equal(before.stage, 1);
});
for (const code of [W.camp, "09014"])
  test(`defeating ${code === W.camp ? "an encounter" : "a player"} side quest through quest resolution emits one completion`, () => {
    const before = second(base());
    const q = make(before, code);
    before.staging.push(q);
    committed(before, q);
    const after = applyAction(reload(before), { type: "NEXT" });
    assert.ok(after.victoryCards?.includes(code));
    assert.equal(detectSignificantMoment(before, after)?.kind, "side-quest");
    assert.equal(detectSignificantMoment(after, reload(after)), null);
  });
test("real enemy combat destruction emits a named hero-fall while surviving heroes continue", () => {
  const before = second(base());
  before.phase = "defense";
  const h = before.heroes[0];
  h.damage = 4;
  const e = make(before, C.captain);
  before.engaged.push(e);
  const after = applyAction(reload(before), {
    type: "DEFEND",
    enemyId: e.id,
    defenderId: h.id,
  });
  assert.equal(after.status, "playing");
  assert.ok(!after.heroes.some((u) => u.id === h.id));
  assert.equal(detectSignificantMoment(before, after)?.kind, "hero-fall");
  assert.match(
    detectSignificantMoment(before, after)!.title,
    /Aragorn.*fallen/,
  );
});
test("real final progress emits victory and does not mutate score, queue or cards", () => {
  const before = committed(second(base()));
  before.progress = 19;
  const after = applyAction(reload(before), { type: "NEXT" });
  assert.equal(after.status, "won");
  const snapshot = JSON.stringify(after);
  assert.equal(detectSignificantMoment(before, after)?.kind, "victory");
  assert.equal(JSON.stringify(after), snapshot);
  assert.equal(detectSignificantMoment(after, reload(after)), null);
});
test("real lethal Mission travel cost emits defeat", () => {
  const before = second(base());
  before.phase = "travel";
  before.staging[0].resources = 1;
  const valley = make(before, W.valley);
  before.staging.push(valley);
  const after = applyAction(reload(before), { type: "TRAVEL", id: valley.id });
  assert.equal(after.status, "lost");
  assert.equal(detectSignificantMoment(before, after)?.kind, "defeat");
});
test("defeat takes priority over the last hero's death", () => {
  const before = second(base());
  before.phase = "defense";
  before.heroes = [before.heroes[0]];
  before.heroes[0].damage = 4;
  const e = make(before, C.captain);
  before.engaged.push(e);
  const after = applyAction(reload(before), {
    type: "DEFEND",
    enemyId: e.id,
    defenderId: before.heroes[0].id,
  });
  assert.equal(after.status, "lost");
  assert.equal(detectSignificantMoment(before, after)?.kind, "defeat");
});
test("victory takes priority over a simultaneous stage and hero difference", () => {
  const old = base();
  const before = committed(second(base()));
  const after = applyAction(reload(before), { type: "NEXT" });
  after.heroes = after.heroes.slice(1);
  assert.equal(detectSignificantMoment(old, after)?.kind, "victory");
});
test("stage takes priority over a simultaneous hero fall and side quest completion", () => {
  const before = base();
  const after = second(reload(before));
  after.heroes = after.heroes.slice(1);
  after.victoryCards = [W.camp];
  assert.equal(detectSignificantMoment(before, after)?.kind, "stage");
});
test("hero fall takes priority over side quest completion and includes heroes from other players", () => {
  const before = second(base(2));
  const after = reload(before);
  const victim = seatView(after, 1).heroes[0];
  damage(after, victim.id, 100);
  after.victoryCards = [W.camp];
  assert.equal(detectSignificantMoment(before, after)?.kind, "hero-fall");
  assert.match(detectSignificantMoment(before, after)!.title, /fallen/);
});
test("multiple lost heroes produce one meaningful message", () => {
  const before = second(base(2));
  const after = reload(before);
  for (const p of [0, 1]) damage(after, seatView(after, p).heroes[0].id, 100);
  const moment = detectSignificantMoment(before, after);
  assert.equal(moment?.kind, "hero-fall");
  assert.equal(moment!.title, "2 heroes have fallen");
  assert.ok(moment!.subtitle.includes(" · "));
});
test("victory-display counts detect a later second copy without replaying older completions", () => {
  const before = base();
  before.victoryCards = [W.camp];
  const after = reload(before);
  after.victoryCards.push(W.camp);
  assert.equal(detectSignificantMoment(before, after)?.kind, "side-quest");
  assert.equal(detectSignificantMoment(after, reload(after)), null);
});
test("ordinary defeated enemies or explored victory locations do not announce a side quest", () => {
  const before = base();
  const after = reload(before);
  after.victoryCards = [W.forn, "01082"];
  assert.equal(detectSignificantMoment(before, after), null);
});
test("multiple side quests share one completion message", () => {
  const before = base();
  const after = reload(before);
  after.victoryCards = [W.camp, W.search];
  const moment = detectSignificantMoment(before, after);
  assert.equal(moment?.kind, "side-quest");
  assert.equal(moment!.title, "2 side quests completed");
});
test("real planning-to-quest transition emits no moment", () => {
  const before = base();
  const after = applyAction(reload(before), { type: "NEXT" });
  assert.equal(after.phase, "quest");
  assert.equal(detectSignificantMoment(before, after), null);
});
test("normal resource gain, hand draw and round advance emit no moment", () => {
  const before = base();
  before.phase = "refresh";
  const after = applyAction(reload(before), { type: "NEXT" });
  assert.ok(after.round > before.round);
  assert.equal(detectSignificantMoment(before, after), null);
});
test("playing an ally emits no significant moment", () => {
  const before = base();
  const a = make(before, "01013");
  before.hand.push(a);
  const after = applyAction(reload(before), { type: "PLAY", id: a.id });
  assert.ok(after.allies.some((u) => u.id === a.id));
  assert.equal(detectSignificantMoment(before, after), null);
});
test("ordinary threat, damage, healing and commitments emit no significant moment", () => {
  const before = base();
  const after = reload(before);
  after.threat += 1;
  damage(after, after.heroes[0].id, 1);
  flush(after);
  assert.equal(detectSignificantMoment(before, after), null);
  const healed = reload(after);
  healed.heroes[0].damage = 0;
  healed.heroes[1].committed = true;
  assert.equal(detectSignificantMoment(after, healed), null);
});
test("a real seat switch preserves the full roster and emits no hero fall", () => {
  const before = base(2);
  const after = applyAction(reload(before), { type: "SELECT_SEAT", seat: 1 });
  assert.equal(seatView(after, 1).heroes.length, 3);
  assert.equal(allCharacters(before).length, allCharacters(after).length);
  assert.equal(detectSignificantMoment(before, after), null);
});
test("switching between existing Foundations parallel quests is navigation, never a new stage", () => {
  const before = splitFoundations();
  const after = applyAction(reload(before), { type: "SELECT_SEAT", seat: 1 });
  assert.equal(before.stage, 4);
  assert.equal(after.stage, 4);
  assert.equal(foundationsCurrentQuest(before), F.lair);
  assert.equal(foundationsCurrentQuest(after), F.rocks);
  assert.equal(globalHeroes(before).length, globalHeroes(after).length);
  assert.equal(detectSignificantMoment(before, after), null);
});
test("real destruction in a remote Foundations area still announces the fallen global hero", () => {
  const before = splitFoundations();
  const after = reload(before);
  const victim = seatView(after, 1).heroes[0];
  assert.ok(!allCharacters(before).some((u) => u.id === victim.id));
  forOwner(after, 1, () => damage(after, victim.id, 100));
  assert.equal(after.table!.active, 0);
  assert.equal(foundationsCurrentQuest(after), F.lair);
  assert.equal(globalHeroes(after).length, globalHeroes(before).length - 1);
  assert.equal(after.status, "playing");
  assert.equal(detectSignificantMoment(before, after)?.kind, "hero-fall");
});
test("a different adventure does not replay a prior game's moment", () => {
  const before = base();
  const after = second(reload(before));
  after.scenarioId = "mirkwood";
  assert.equal(detectSignificantMoment(before, after), null);
});
test("a shuffle's RNG seed advance never suppresses a valid milestone", () => {
  const before = base();
  const after = second(reload(before));
  after.seed++;
  assert.equal(detectSignificantMoment(before, after)?.kind, "stage");
});

test("a real Lost and Alone hero shuffle is a living departure, never a fallen hero", () => {
  const before = cleanFixture("foundations-of-stone");
  const hero = before.heroes[0];
  let after = reload(before);
  revealed(after, F.lost);
  flush(after);
  after = choose(after, hero.id);
  assert.ok(!after.heroes.some((u) => u.id === hero.id));
  assert.ok(after.deck.includes(hero.code));
  assert.equal(after.status, "playing");
  assert.equal(detectSignificantMoment(before, after), null);
});
test("a lost living hero later discarded from its deck falls, and later actions never replay that death", () => {
  let before = cleanFixture("foundations-of-stone");
  const hero = before.heroes[0];
  before.deck = [];
  revealed(before, F.lost);
  flush(before);
  before = choose(before, hero.id);
  assert.deepEqual(before.deck, [hero.code]);
  assert.ok(!globalHeroes(before).some((u) => u.id === hero.id));
  before.stage = 2;
  before.phase = "quest";
  before.committedIds = [before.heroes[0].id];
  const after = applyAction(reload(before), { type: "COMMIT" });
  assert.equal(after.status, "playing");
  assert.ok(after.discard.includes(hero.code));
  assert.ok(!globalHeroes(after).some((u) => u.id === hero.id));
  const moment = detectSignificantMoment(before, after);
  assert.equal(moment?.kind, "hero-fall");
  assert.equal(moment!.title, "Aragorn has fallen");
  const next = settle(reload(after));
  assert.equal(next.status, "playing");
  assert.ok(next.discard.includes(hero.code));
  assert.equal(detectSignificantMoment(after, next), null);
  assert.equal(detectSignificantMoment(next, reload(next)), null);
});
test("a real Dol Guldur capture leaves the hero alive and produces no hero-fall or setup animation", () => {
  const d = STARTERS[0];
  const before = createGame(91, d.cards, d.heroes, d.id, {
    scenarioId: "dol-guldur",
  });
  const after = applyAction(reload(before), { type: "KEEP" });
  assert.ok(after.prisoner);
  assert.equal(after.heroes.length, 2);
  assert.equal(detectSignificantMoment(before, after), null);
  const existing = { ...before, phase: "planning" };
  assert.equal(
    detectSignificantMoment(existing, after),
    null,
    "capture itself does not become a death after setup suppression",
  );
});
test("keeping a newly created Weather Hills opening hand never announces a first stage", () => {
  const d = STARTERS[0];
  const before = createGame(91, d.cards, d.heroes, d.id, {
    scenarioId: "the-weather-hills",
  });
  const after = applyAction(reload(before), { type: "KEEP" });
  assert.equal(after.phase, "resource");
  assert.equal(detectSignificantMoment(before, after), null);
});
test("an old destruction log cannot relabel a later living departure as a fresh hero fall", () => {
  const before = base();
  const h = before.heroes[0];
  before.log.push({
    id: before.log.length + 1000,
    round: before.round,
    kind: "danger",
    text: "Aragorn has fallen.",
  });
  const after = reload(before);
  after.heroes = after.heroes.slice(1);
  after.prisoner = h;
  assert.equal(detectSignificantMoment(before, after), null);
});
