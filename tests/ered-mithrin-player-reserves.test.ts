import assert from "node:assert/strict";
import test from "node:test";
import { createGame, restoreSave, validateSave } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { encounterReserveDefaults } from "../src/game/encounter-reserves";
import { eredMithrinPlayerRefresh } from "../src/game/ered-mithrin-player-support";
import { addVictoryCard } from "../src/game/board";
import { fixture, ally, reload } from "./ered-mithrin-player-fixtures";
const game = (
  enablers: string[],
  options: Parameters<typeof createGame>[4] = {},
) =>
  createGame(
    2026,
    {
      ...Object.fromEntries(
        Array.from({ length: 17 }, (_, i) => [
          String(1013 + i).padStart(5, "0"),
          3,
        ]),
      ),
      ...Object.fromEntries(enablers.map((c) => [c, 1])),
    },
    STARTERS[0].heroes,
    "custom",
    options,
  );
test("native Eagle defaults preserve old two-species defaults and share a total of three across all enabling events", () => {
  for (const [codes, expected] of [
    [[], { rangers: 3, wind: 0, eagles: 0 }],
    [["19032"], { rangers: 0, wind: 0, eagles: 3 }],
    [["19032", "09007"], { rangers: 2, wind: 0, eagles: 1 }],
    [["19032", "17140"], { rangers: 0, wind: 1, eagles: 2 }],
    [["19032", "17140", "09007"], { rangers: 1, wind: 1, eagles: 1 }],
  ] as const) {
    assert.deepEqual(encounterReserveDefaults(codes), expected);
    const s = game([...codes]);
    assert.equal(s.rangerReserves![0], expected.rangers);
    assert.equal(s.batch4WindReserves![0], expected.wind);
    assert.equal(s.eredEagleReserves![0], expected.eagles);
    assert.ok(validateSave(s));
    assert.deepEqual(
      restoreSave(JSON.parse(JSON.stringify(s)))!.eredEagleReserves,
      s.eredEagleReserves,
    );
  }
});
test("native explicit three-species allocations accept zero and mixed choices, reject total four, and validate per-seat corruption", () => {
  const s = game(["19032", "17140", "09007"], {
    rangerReserves: { 0: 0 },
    batch4WindReserves: { 0: 1 },
    eredEagleReserves: { 0: 2 },
  });
  assert.equal(
    s.rangerReserves![0] + s.batch4WindReserves![0] + s.eredEagleReserves![0],
    3,
  );
  assert.ok(validateSave(s));
  const zero = game(["19032"], {
    rangerReserves: { 0: 0 },
    batch4WindReserves: { 0: 0 },
    eredEagleReserves: { 0: 0 },
  });
  assert.equal(zero.eredEagleReserves![0], 0);
  assert.ok(validateSave(zero));
  assert.throws(
    () =>
      game(["19032"], {
        rangerReserves: { 0: 1 },
        batch4WindReserves: { 0: 1 },
        eredEagleReserves: { 0: 2 },
      }),
    /at most three/,
  );
  for (const badCount of [-1, 4, 1.5]) {
    const bad = structuredClone(s);
    bad.eredEagleReserves![0] = badCount;
    assert.equal(validateSave(bad), false);
  }
  const bad = structuredClone(s);
  bad.rangerReserves![0] = 1;
  assert.equal(validateSave(bad), false);
});
test("save validation rejects forged Thalion hero claims on other cards and before three side quests", () => {
  const s = fixture(),
    t = ally(s, "19065");
  const before = structuredClone(s);
  before.allies.find((u) => u.id === t.id)!.eredThalionHero = true;
  assert.equal(validateSave(before), false);
  const forged = structuredClone(s);
  forged.heroes[0].eredThalionHero = true;
  assert.equal(validateSave(forged), false);
  for (const c of ["09014", "10009", "10034"]) addVictoryCard(s, c);
  eredMithrinPlayerRefresh(s);
  assert.ok(validateSave(s));
  const restored = reload(s);
  assert.ok(restored.heroes.some((u) => u.id === t.id && u.eredThalionHero));
});
