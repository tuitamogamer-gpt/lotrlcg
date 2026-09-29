import test from "node:test";
import assert from "node:assert/strict";
import { STARTERS } from "../src/game/cards";
import {
  applyAction as act,
  createGame,
  playCost,
  stats,
  threatOf,
  validateSave,
} from "../src/game/engine";
import type { GameState, Unit } from "../src/game/types";
const leadership = STARTERS.find((d) => d.id === "leadership")!;
function base(easy = false) {
  let s = createGame(21, leadership.cards, leadership.heroes, "leadership", {
    scenarioId: "hunt-for-gollum",
    easy,
  });
  while (s.phase === "setup") s = act(s, { type: "KEEP" });
  s.hand = [];
  s.staging = [];
  s.encounterDiscard = [];
  s.queue = [];
  s.choice = null;
  return s;
}
function unit(s: GameState, code: string): Unit {
  return {
    id: `c${s.nextId++}`,
    code,
    damage: 0,
    progress: 0,
    resources: 0,
    exhausted: false,
    committed: false,
    attachments: [],
    boost: 0,
    attacked: false,
    shadows: [],
  };
}
const questSuccess = (s: GameState, will = 99) => {
  s.phase = "staging";
  s.heroes[0].committed = true;
  s.heroes[0].tempWill = will;
  return act(s, { type: "NEXT" });
};
test("setup reveals one card per player and the deck sizes follow the official normal and easy counts", () => {
  for (const [easy, total] of [
    [false, 48],
    [true, 34],
  ] as const) {
    const s = createGame(3, leadership.cards, leadership.heroes, "leadership", {
      scenarioId: "hunt-for-gollum",
      easy,
    });
    const count =
      s.encounterDeck.length + s.encounterDiscard.length + s.staging.length;
    assert.equal(count, total, easy ? "easy" : "normal");
    assert.ok(s.staging.length + s.encounterDiscard.length >= 1, "one reveal");
    assert.ok(validateSave(s));
  }
  assert.throws(
    () =>
      createGame(3, leadership.cards, leadership.heroes, "leadership", {
        scenarioId: "hunt-for-gollum",
        playMode: "campaign",
      }),
    /campaign/,
  );
});
test("stage 1 lets the first player reveal one of the top three cards after a successful quest", () => {
  let s = base();
  s.encounterDeck = ["02020", "02016", "02024", "02017"];
  s = questSuccess(s, 3);
  assert.ok(s.choice, "a look choice is offered");
  assert.match(s.choice!.title, /trail/);
  assert.equal(s.choice!.options.length, 3);
  s = act(s, { type: "CHOOSE", id: "look-1" });
  assert.ok(
    s.staging.some((u) => u.code === "02016"),
    "the chosen card is revealed",
  );
  assert.deepEqual(s.encounterDiscard, ["02020", "02024"]);
  assert.deepEqual(s.encounterDeck, ["02017"]);
});
test("a hero claims Signs of Gollum after questing successfully and loses it when damaged", () => {
  let s = base();
  s.encounterDeck = ["02016"];
  s.staging = [unit(s, "02014")];
  s.stage = 2;
  s = questSuccess(s, 2);
  assert.match(s.choice!.title, /Signs of Gollum/);
  s = act(s, { type: "CHOOSE", id: s.heroes[0].id });
  assert.ok(s.heroes[0].attachments.some((a) => a.code === "02014"));
  assert.equal(s.staging.filter((u) => u.code === "02014").length, 0);
  assert.ok(validateSave(s));
  // Hunters from Mordor scale with the clue in play.
  const hunters = unit(s, "02021");
  s.staging.push(hunters);
  assert.equal(threatOf(s, hunters), 4);
  assert.equal(stats(s, hunters).attack, 4);
  // Damage returns the clue to the top of the encounter deck.
  s.phase = "defense";
  s.engaged = [unit(s, "02020")];
  s.staging = [];
  s.encounterDeck = ["02016"];
  s.engaged[0].shadows = ["02016"];
  s = act(s, {
    type: "DEFEND",
    enemyId: s.engaged[0].id,
    defenderId: null,
  });
  while (s.choice) s = act(s, { type: "CHOOSE", id: s.choice.options[0].id });
  assert.ok(
    !s.heroes.some((h) => h.attachments.some((a) => a.code === "02014")),
  );
  assert.equal(s.encounterDeck[0], "02014");
});
test("stage 3 needs a clue-bearing hero, resets without one, and wins at 8 progress", () => {
  let s = base();
  s.stage = 3;
  s.progress = 5;
  s = act(s, { type: "NEXT" });
  assert.equal(s.stage, 2, "no clue resets the quest to stage 2");
  assert.equal(s.progress, 0);
  s = base();
  s.stage = 3;
  s.heroes[0].attachments.push({ id: "clue", code: "02014", exhausted: false });
  s.phase = "quest";
  s = act(s, { type: "TOGGLE_QUEST", id: s.heroes[1].id });
  assert.ok(s.committedIds.includes(s.heroes[1].id));
  const without = base();
  without.stage = 3;
  without.heroes[0].attachments.push({
    id: "clue",
    code: "02014",
    exhausted: false,
  });
  without.phase = "quest";
  without.heroes[0].attachments = [];
  assert.throws(
    () => act(without, { type: "TOGGLE_QUEST", id: without.heroes[1].id }),
    /Clue/,
  );
  s.progress = 7;
  s.encounterDeck = ["02016"];
  s = questSuccess(s, 1);
  assert.equal(s.status, "won");
  assert.match(s.reason, /Gollum/);
});
test("The Old Ford, the banks and the river shape threat, costs and progress", () => {
  const s = base();
  const ford = unit(s, "02015");
  s.staging = [ford];
  assert.equal(threatOf(s, ford), 0);
  s.allies.push(unit(s, "01013"), unit(s, "01014"));
  assert.equal(threatOf(s, ford), 2);
  const ally = {
    code: "01013",
    type_code: "ally",
    cost: 1,
    sphere_code: "leadership",
    name: "Guard",
  };
  s.activeLocation = unit(s, "02018");
  assert.equal(playCost(s, ally), 2, "The East Bank adds 1 to allies");
  s.activeLocation = unit(s, "02019");
  assert.equal(playCost(s, ally), 1);
  assert.equal(
    playCost(s, { ...ally, type_code: "event" }),
    2,
    "The West Bank adds 1 to events",
  );
  // River Ninglor washes away progress at the end of the round.
  let r = base();
  r.activeLocation = unit(r, "02017");
  r.activeLocation.progress = 2;
  r.progress = 3;
  r.phase = "refresh";
  r = act(r, { type: "NEXT" });
  assert.equal(r.progress, 2);
  assert.equal(r.activeLocation?.progress, 1);
});
test("Old Wives' Tales, Flooding and False Lead resolve their revealed effects", () => {
  let s = base();
  s.heroes[0].resources = 0;
  s.heroes[1].resources = 2;
  s.heroes[2].resources = 1;
  s.encounterDeck = ["02024", "02016"];
  s.phase = "quest";
  s = act(s, { type: "COMMIT" });
  assert.ok(s.heroes[0].exhausted, "a hero without resources exhausts");
  assert.equal(s.heroes[1].resources, 1);
  assert.equal(s.heroes[2].resources, 0);
  let f = base();
  const river = unit(f, "02017");
  river.progress = 3;
  f.staging = [river];
  const threat = f.threat;
  f.encounterDeck = ["02023", "02016", "02016"];
  f.phase = "quest";
  f = act(f, { type: "COMMIT" });
  assert.equal(
    f.staging.find((u) => u.code === "02017")?.progress,
    0,
    "Flooding removes Riverland progress",
  );
  assert.equal(f.threat, threat + 1, "Doomed 1");
  assert.ok(
    f.staging.some((u) => u.code === "02016"),
    "Surge reveals another card",
  );
  let l = base();
  l.heroes[0].attachments.push({ id: "clue", code: "02014", exhausted: false });
  l.encounterDeck = ["02022", "02016"];
  l.phase = "quest";
  l = act(l, { type: "COMMIT" });
  assert.match(l.choice!.title, /False Lead/);
  l = act(l, { type: "CHOOSE", id: l.choice!.options[0].id });
  assert.ok(!l.heroes[0].attachments.length, "the clue is shuffled back");
  assert.ok(l.encounterDeck.includes("02014"));
});
