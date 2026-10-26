import assert from "node:assert/strict";
import test from "node:test";
import { createGame, restoreSave, validateSave } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import {
  batch4PlayerFixture as fixture,
  batch4PlayerHand as hand,
} from "./batch4-player-fixtures";
import { applyAction } from "../src/game/engine";
import { reload } from "./against-shadow-final-fixtures";
import { make } from "../src/game/core";
const custom = (flight = false, summons = false) => ({
  ...Object.fromEntries(
    Array.from({ length: 17 }, (_, i) => [
      String(1013 + i).padStart(5, "0"),
      3,
    ]),
  ),
  ...(flight ? { "17140": 1 } : {}),
  ...(summons ? { "09007": 1 } : {}),
});
const game = (
  flight = false,
  summons = false,
  options: Parameters<typeof createGame>[4] = {},
) =>
  createGame(
    2026,
    custom(flight, summons),
    STARTERS[0].heroes,
    "custom",
    options,
  );
test("current official Encounter rule allows three of each enabled reserve design", () => {
  for (const [flight, summons, r, w] of [
    [false, false, 3, 0],
    [false, true, 3, 0],
    [true, false, 0, 3],
    [true, true, 3, 3],
  ] as const) {
    const s = game(flight, summons);
    assert.deepEqual(s.rangerReserves, { 0: r });
    assert.deepEqual(s.batch4WindReserves, { 0: w });
    assert.ok(validateSave(s));
  }
});
test("explicit Encounter reserve counts remain independent and reject more than three of one design", () => {
  const cases = [
    { rangerReserves: { 0: 1 }, batch4WindReserves: { 0: 2 } },
    { batch4WindReserves: { 0: 2 } },
    { rangerReserves: { 0: 2 } },
  ];
  for (const options of cases) {
    const s = game(true, true, options);
    assert.equal(s.rangerReserves![0], options.rangerReserves?.[0] ?? 3);
    assert.equal(
      s.batch4WindReserves![0],
      options.batch4WindReserves?.[0] ?? 3,
    );
    assert.ok(validateSave(s));
  }
  const six = game(true, true, {
    rangerReserves: { 0: 3 },
    batch4WindReserves: { 0: 3 },
  });
  assert.ok(
    validateSave(six),
    "MEC107 page 2 permits three copies of each Encounter card",
  );
  assert.throws(
    () => game(true, true, { batch4WindReserves: { 0: 4 } }),
    /zero and three/,
  );
  assert.throws(
    () => game(true, true, { rangerReserves: { 0: -1 } }),
    /zero and three/,
  );
  const zero = game(true, true, {
    rangerReserves: { 0: 0 },
    batch4WindReserves: { 0: 0 },
  });
  assert.equal(zero.rangerReserves![0] + zero.batch4WindReserves![0], 0);
});
test("each hotseat player keeps its own reserve allocation and total; reload retains both species", () => {
  const s = game(false, false, {
    seats: [
      {
        deckId: "custom",
        heroes: STARTERS[0].heroes,
        cards: custom(true, false),
      },
      {
        deckId: "custom",
        heroes: STARTERS[1].heroes,
        cards: custom(true, true),
      },
    ],
  });
  assert.deepEqual(s.rangerReserves, { 0: 0, 1: 3 });
  assert.deepEqual(s.batch4WindReserves, { 0: 3, 1: 3 });
  const restored = restoreSave(JSON.parse(JSON.stringify(s)))!;
  assert.ok(restored);
  assert.deepEqual(restored.rangerReserves, s.rangerReserves);
  assert.deepEqual(restored.batch4WindReserves, s.batch4WindReserves);
  const invalid = JSON.parse(JSON.stringify(s));
  invalid.batch4WindReserves[1] = 4;
  assert.equal(validateSave(invalid), false);
});
test("native Flight consumes a selected Wind reserve and cannot recycle its removed-from-game copy", () => {
  let s = fixture();
  s.heroes[0] = make(s, "01011");
  s.heroes[0].resources = 10;
  s.heroes[0].phaseResourceIcons = ["spirit"];
  s.batch4WindReserves = { 0: 1 };
  s.rangerReserves = { 0: 2 };
  const event = hand(s, "17140");
  s = applyAction(reload(s), { type: "PLAY", id: event.id });
  assert.equal(s.batch4WindReserves![0], 0);
  s.removed.push("17144");
  const next = hand(s, "17140");
  assert.throws(
    () => applyAction(reload(s), { type: "PLAY", id: next.id }),
    /no set-aside Wind/,
  );
});
