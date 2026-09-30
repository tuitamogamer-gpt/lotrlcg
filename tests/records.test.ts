import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { STARTERS } from "../src/game/cards";
import { createGame } from "../src/game/engine";
import {
  readRecords,
  recordGame,
  RECORDS_KEY,
  summarize,
} from "../src/ui/records";
import type { GameRecord } from "../src/ui/records";

const storedRecord: GameRecord = {
  key: "record",
  at: 10,
  scenarioId: "mirkwood",
  playMode: "normal",
  deck: "Leadership",
  heroes: ["01001", "01002", "01003"],
  players: 1,
  result: "won",
  rounds: 4,
  threat: 29,
  score: 70,
  easy: false,
};
function storage(t: TestContext) {
  const old = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    },
  });
  t.after(() =>
    old
      ? Object.defineProperty(globalThis, "localStorage", old)
      : Reflect.deleteProperty(globalThis, "localStorage"),
  );
  return data;
}
test("the best score is the lowest winning score and defeats do not compete", () => {
  assert.equal(summarize([]).bestScore, null);
  assert.equal(
    summarize([{ ...storedRecord, result: "lost", score: 0 }]).bestScore,
    null,
  );
  assert.equal(
    summarize([
      storedRecord,
      { ...storedRecord, score: 41 },
      { ...storedRecord, result: "lost", score: 0 },
    ]).bestScore,
    41,
  );
  assert.equal(
    summarize([{ ...storedRecord, deck: "__proto__" }]).byDeck["__proto__"].won,
    1,
  );
});
test("corrupt records cannot crash quest lookup or distort the summary", (t) => {
  const data = storage(t);
  data.set(
    RECORDS_KEY,
    JSON.stringify([
      storedRecord,
      storedRecord,
      { ...storedRecord, key: "unknown", scenarioId: "bad" },
      { ...storedRecord, key: "score", score: "NaN" },
      { ...storedRecord, key: "hero", heroes: ["01013"] },
      { ...storedRecord, key: "players", players: 5 },
    ]),
  );
  assert.deepEqual(readRecords(), [storedRecord]);
});
test("records distinguish setups sharing a seed and describe the whole hot-seat table", (t) => {
  storage(t);
  const leadership = STARTERS.find((d) => d.id === "leadership")!;
  const spirit = STARTERS.find((d) => d.id === "spirit")!;
  const finish = (easy = false) => ({
    ...createGame(10, leadership.cards, leadership.heroes, leadership.id, {
      easy,
    }),
    round: 4,
    status: "won" as const,
  });
  assert.ok(recordGame(finish()));
  assert.equal(recordGame(finish()), null);
  assert.ok(recordGame(finish(true)));
  const table = createGame(
    10,
    leadership.cards,
    leadership.heroes,
    leadership.id,
    {
      seats: [
        { deckId: leadership.id, heroes: leadership.heroes },
        { deckId: spirit.id, heroes: spirit.heroes },
      ],
    },
  );
  table.status = "lost";
  table.round = 4;
  const r = recordGame(table)!;
  assert.equal(r.deck, "Leadership + Spirit");
  assert.equal(r.players, 2);
  assert.equal(r.heroes.length, 6);
  assert.equal(
    r.threat,
    table.table!.seats.reduce((n, p) => n + p.threat, 0),
  );
  table.startingHeroes.push("01004");
  assert.equal(r.heroes.length, 6);
  assert.equal(readRecords().length, 3);
});
