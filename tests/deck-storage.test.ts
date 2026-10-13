import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  DECKS_KEY,
  deckStorageProblem,
  readDecks,
  readDeckStorage,
  writeDecks,
  customId,
} from "../src/game/decks";
import type { CustomDeck } from "../src/game/decks";
import { STARTERS } from "../src/game/cards";
import { createGame, restoreSave } from "../src/game/engine";
import { recoverSavedDecks, savedDeckId } from "../src/ui/setup-decks";

const draft = (id: string): CustomDeck => ({
  id,
  name: `Draft ${id}`,
  heroes: [],
  cards: {},
  updatedAt: 1000,
});

function storage(t: TestContext, initial: string | null) {
  const old = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let raw = initial;
  let writes = 0;
  let failRead = false;
  let failWrite = false;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => {
        assert.equal(key, DECKS_KEY);
        if (failRead) throw new Error("Storage cannot be read");
        return raw;
      },
      setItem: (key: string, value: string) => {
        assert.equal(key, DECKS_KEY);
        if (failWrite) throw new Error("Storage cannot be written");
        writes++;
        raw = value;
      },
    },
  });
  t.after(() =>
    old
      ? Object.defineProperty(globalThis, "localStorage", old)
      : Reflect.deleteProperty(globalThis, "localStorage"),
  );
  return {
    get raw() {
      return raw;
    },
    get writes() {
      return writes;
    },
    failRead: () => (failRead = true),
    failWrite: () => (failWrite = true),
  };
}

test("imported custom adventure on a full shelf retains every stored deck and can be resumed after reload", (t) => {
  const originals = Array.from({ length: 50 }, (_, i) =>
    draft(`original-${i}`),
  );
  const originalBytes = JSON.stringify(originals, null, 2);
  const stored = storage(t, originalBytes);
  const leadership = STARTERS.find((d) => d.id === "leadership")!;
  const spirit = STARTERS.find((d) => d.id === "spirit")!;
  const cards = { ...leadership.cards };
  for (const [code, count] of Object.entries(spirit.cards))
    cards[code] = Math.min(3, (cards[code] ?? 0) + count);
  const adventure = createGame(
    8221,
    cards,
    ["01001", "01007", "01003"],
    "custom",
  );
  const restored = restoreSave(JSON.parse(JSON.stringify(adventure)))!;
  const recovered = recoverSavedDecks(restored, readDecks());
  assert.equal(recovered.length, 51);
  assert.equal(deckStorageProblem(recovered), "capacity");
  assert.equal(writeDecks(recovered), false);
  assert.equal(stored.raw, originalBytes);
  assert.equal(stored.writes, 0);
  const reloaded = recoverSavedDecks(restored, readDecks());
  assert.ok(originals.every((d) => reloaded.some((kept) => kept.id === d.id)));
  assert.equal(savedDeckId(restored, reloaded), customId(reloaded[0]));
  assert.deepEqual(reloaded[0].cards, cards);
});

test("malformed deck JSON is available for backup and cannot be overwritten by an empty fallback", (t) => {
  const original = '{"original": [ malformed JSON';
  const stored = storage(t, original);
  assert.deepEqual(readDecks(), []);
  assert.deepEqual(readDeckStorage(), {
    decks: [],
    raw: original,
    issue: "unreadable",
  });
  assert.equal(writeDecks([]), false);
  assert.equal(writeDecks([draft("new")]), false);
  assert.equal(stored.raw, original);
  assert.equal(stored.writes, 0);
});

test("known drafts remain readable while unsupported original rows are protected from replacement", (t) => {
  const good = draft("known");
  const unknown = { ...draft("unknown"), cards: { "not-registered": 1 } };
  const original = JSON.stringify([good, unknown], null, 2);
  const stored = storage(t, original);
  assert.deepEqual(readDecks(), [good]);
  assert.equal(readDeckStorage().issue, "invalid");
  assert.equal(writeDecks([good, draft("another")]), false);
  assert.equal(stored.raw, original);
});

test("oversized, duplicate and invalid new shelf lists do not change a valid stored shelf", (t) => {
  const original = JSON.stringify([draft("existing")]);
  const stored = storage(t, original);
  for (const invalid of [
    Array.from({ length: 51 }, (_, i) => draft(`new-${i}`)),
    [draft("duplicate"), draft("duplicate")],
    [{ ...draft("bad-quantity"), cards: { "01013": 4 } }],
  ]) {
    assert.equal(writeDecks(invalid), false);
    assert.equal(stored.raw, original);
  }
  assert.equal(stored.writes, 0);
});

test("valid shelf edits persist completely, while failed reads or writes leave prior bytes intact", (t) => {
  const stored = storage(t, null);
  const fifty = Array.from({ length: 50 }, (_, i) => draft(`draft-${i}`));
  assert.equal(writeDecks(fifty), true);
  assert.deepEqual(readDecks(), fifty);
  const original = stored.raw;
  stored.failWrite();
  assert.equal(writeDecks([draft("replacement")]), false);
  assert.equal(stored.raw, original);
  stored.failRead();
  assert.equal(readDeckStorage().issue, "unavailable");
  assert.equal(writeDecks([]), false);
  assert.equal(stored.raw, original);
});

test("a stale tab cannot replace a newer shelf, while an acknowledged current snapshot can be saved", (t) => {
  const stored = storage(t, null);
  const firstTabSnapshot = readDeckStorage().raw;
  const secondTabSnapshot = readDeckStorage().raw;
  const first = draft("saved-in-first-tab");
  assert.equal(writeDecks([first], firstTabSnapshot), true);
  const newerBytes = stored.raw;
  assert.equal(
    writeDecks([draft("saved-in-second-tab")], secondTabSnapshot),
    false,
  );
  assert.equal(stored.raw, newerBytes);
  assert.deepEqual(readDecks(), [first]);
  assert.equal(
    writeDecks([...readDecks(), draft("acknowledged-second-tab")], newerBytes),
    true,
  );
  assert.equal(readDecks().length, 2);
});

test("an exact expected snapshot still cannot authorize replacing unrecognized original deck data", (t) => {
  const original = JSON.stringify([
    draft("known"),
    { ...draft("unknown"), cards: { "not-registered": 1 } },
  ]);
  const stored = storage(t, original);
  assert.equal(writeDecks([draft("replacement")], original), false);
  assert.equal(stored.raw, original);
  assert.equal(stored.writes, 0);
});
