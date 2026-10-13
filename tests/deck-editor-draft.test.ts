import assert from "node:assert/strict";
import test from "node:test";
import { DECKS_KEY } from "../src/game/decks";
import {
  clearDeckEditorDraft,
  DECK_EDITOR_DRAFT_KEY,
  DECK_EDITOR_DRAFT_LIMIT,
  parseDeckEditorDraft,
  readDeckEditorDraft,
  writeDeckEditorDraft,
} from "../src/ui/deck-editor-draft";
import type {
  DeckDraftStorage,
  DeckEditorDraft,
} from "../src/ui/deck-editor-draft";

function store() {
  const values = new Map<string, string>();
  const storage: DeckDraftStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
  return { values, storage };
}
const draft = (): DeckEditorDraft => ({
  version: 1,
  savedAt: 2000,
  deck: {
    id: "draft-test",
    name: "Unfinished fellowship",
    heroes: ["12030", "12001", "01004"],
    cards: { "01073": 1 },
    updatedAt: 1000,
  },
  report: [],
});

test("unfinished deck round-trip preserves all edits without creating a saved shelf deck", () => {
  const { values, storage } = store();
  values.set(DECKS_KEY, "[]");
  const expected = draft();
  assert.equal(writeDeckEditorDraft(expected, storage), true);
  assert.deepEqual(readDeckEditorDraft(storage), expected);
  assert.equal(values.get(DECKS_KEY), "[]");
});

test("restored imported drafts keep RingsDB provenance and every import adjustment", () => {
  const { storage } = store();
  const imported = draft();
  imported.deck.source = "https://ringsdb.com/decklist/view/12345";
  imported.deck.productId = "core";
  imported.deck.deckKind = "official-preconstructed";
  imported.report = [
    "1 × Unsupported ally skipped (automated play is not available yet).",
    "Hero left out (unsupported or beyond the three-hero limit): Hero four.",
    "Gandalf: 4 copies reduced to the limit of 3.",
  ];
  assert.equal(writeDeckEditorDraft(imported, storage), true);
  assert.deepEqual(readDeckEditorDraft(storage), imported);
});

test("working drafts allow empty names and incomplete lists", () => {
  const unfinished = draft();
  unfinished.deck.name = "";
  unfinished.deck.heroes = [];
  unfinished.deck.cards = {};
  assert.deepEqual(parseDeckEditorDraft(unfinished), unfinished);
});

test("restored draft edits cannot mutate the original saved deck or import report", () => {
  const original = draft();
  original.report.push("Keep this import adjustment.");
  const restored = parseDeckEditorDraft(original)!;
  restored.deck.heroes.pop();
  restored.deck.cards["01073"] = 3;
  restored.report.pop();
  assert.equal(original.deck.heroes.length, 3);
  assert.equal(original.deck.cards["01073"], 1);
  assert.equal(original.report.length, 1);
});

test("draft validation rejects unsupported definitions and malformed card quantities", () => {
  for (const cards of [
    { notRegistered: 1 },
    { "01001": 1 },
    { "01073": -1 },
    { "01073": 4 },
    { "01073": 1.5 },
    { "01073": "1" },
  ]) {
    const malformed = { ...draft(), deck: { ...draft().deck, cards } };
    assert.equal(parseDeckEditorDraft(malformed), null);
  }
});

test("draft validation rejects unsupported, duplicate and excessive heroes", () => {
  for (const heroes of [
    ["notRegistered"],
    ["01073"],
    ["01001", "01001"],
    ["01001", "01002", "01003", "01004"],
  ]) {
    const malformed = { ...draft(), deck: { ...draft().deck, heroes } };
    assert.equal(parseDeckEditorDraft(malformed), null);
  }
});

test("corrupt and unsupported draft versions never reopen a broken editor", () => {
  const { values, storage } = store();
  for (const raw of [
    "{broken",
    "null",
    "[]",
    JSON.stringify({ ...draft(), version: 2 }),
  ]) {
    values.set(DECK_EDITOR_DRAFT_KEY, raw);
    assert.equal(readDeckEditorDraft(storage), null);
  }
});

test("large local draft snapshots are ignored before JSON parsing", () => {
  const { values, storage } = store();
  values.set(DECK_EDITOR_DRAFT_KEY, " ".repeat(DECK_EDITOR_DRAFT_LIMIT + 1));
  assert.equal(readDeckEditorDraft(storage), null);
});

test("draft report, provenance, names and timestamps are bounded", () => {
  for (const update of [
    { report: Array(257).fill("Adjustment") },
    { report: ["x".repeat(1001)] },
    { savedAt: -1 },
    { savedAt: Number.MAX_SAFE_INTEGER + 1 },
    { deck: { ...draft().deck, id: "bad/id" } },
    { deck: { ...draft().deck, name: "x".repeat(61) } },
    { deck: { ...draft().deck, source: "x".repeat(2049) } },
    { deck: { ...draft().deck, productId: "x".repeat(129) } },
    { deck: { ...draft().deck, deckKind: "unknown" } },
  ])
    assert.equal(parseDeckEditorDraft({ ...draft(), ...update }), null);
});

test("a rejected draft write preserves the last recoverable working list", () => {
  const { storage } = store();
  const valid = draft();
  assert.equal(writeDeckEditorDraft(valid, storage), true);
  const invalid = { ...draft(), report: ["x".repeat(1001)] };
  assert.equal(writeDeckEditorDraft(invalid, storage), false);
  assert.deepEqual(readDeckEditorDraft(storage), valid);
});

test("blocked storage reports failure without crashing the editor", () => {
  const blocked: DeckDraftStorage = {
    getItem() {
      throw new Error("Blocked storage");
    },
    setItem() {
      throw new Error("Storage quota");
    },
    removeItem() {
      throw new Error("Blocked storage");
    },
  };
  assert.equal(readDeckEditorDraft(blocked), null);
  assert.equal(writeDeckEditorDraft(draft(), blocked), false);
  assert.equal(clearDeckEditorDraft(blocked), false);
});

test("clearing a working draft preserves saved decks and adventures", () => {
  const { storage, values } = store();
  values.set(DECKS_KEY, '[{"id":"saved-deck"}]');
  values.set("there-and-back-again.save.v1", '{"adventure":"unchanged"}');
  assert.equal(writeDeckEditorDraft(draft(), storage), true);
  assert.equal(clearDeckEditorDraft(storage), true);
  assert.equal(readDeckEditorDraft(storage), null);
  assert.equal(values.get(DECKS_KEY), '[{"id":"saved-deck"}]');
  assert.equal(
    values.get("there-and-back-again.save.v1"),
    '{"adventure":"unchanged"}',
  );
});

test("saving or canceling one tab cannot overwrite or clear another tab's working copy", () => {
  const tabA = store();
  const tabB = store();
  const first = draft();
  const second = draft();
  second.deck.id = "other-tab";
  second.deck.name = "Keep this unfinished deck in tab B";
  second.report = ["Keep this tab's import adjustments."];
  assert.equal(writeDeckEditorDraft(second, tabB.storage), true);
  assert.equal(writeDeckEditorDraft(first, tabA.storage), true);
  assert.deepEqual(readDeckEditorDraft(tabB.storage), second);
  assert.equal(clearDeckEditorDraft(tabA.storage), true);
  assert.equal(readDeckEditorDraft(tabA.storage), null);
  assert.deepEqual(readDeckEditorDraft(tabB.storage), second);
  assert.deepEqual(
    readDeckEditorDraft(tabB.storage),
    second,
    "the same tab's storage still restores its working copy after navigation or reload",
  );
});

test("default working-copy persistence uses session storage and ignores another tab's legacy local copy", (t) => {
  const tab = store();
  const shared = store();
  const legacy = draft();
  legacy.deck.name = "Another tab's old device draft";
  shared.values.set(DECK_EDITOR_DRAFT_KEY, JSON.stringify(legacy));
  const descriptors = new Map(
    ["sessionStorage", "localStorage"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  Object.defineProperty(globalThis, "sessionStorage", {
    value: tab.storage,
    configurable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: shared.storage,
    configurable: true,
  });
  t.after(() => {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  assert.equal(
    readDeckEditorDraft(),
    null,
    "local drafts are never silently imported",
  );
  const expected = draft();
  assert.equal(writeDeckEditorDraft(expected), true);
  assert.deepEqual(readDeckEditorDraft(), expected);
  assert.equal(clearDeckEditorDraft(), true);
  assert.equal(readDeckEditorDraft(), null);
  assert.deepEqual(
    JSON.parse(shared.values.get(DECK_EDITOR_DRAFT_KEY)!),
    legacy,
  );
});
