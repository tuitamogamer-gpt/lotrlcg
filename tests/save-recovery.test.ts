import test from "node:test";
import assert from "node:assert/strict";
import { STARTERS } from "../src/game/cards";
import { DECKS_KEY } from "../src/game/decks";
import { createGame } from "../src/game/engine";
import {
  ADVENTURE_SAVE_KEY,
  CAMPAIGN_SAVE_KEY,
  collectRecoveryBundle,
  parseRecoveryImport,
} from "../src/ui/save-recovery";

const leadership = STARTERS.find((d) => d.id === "leadership")!;
const adventure = () =>
  createGame(7401, leadership.cards, leadership.heroes, "leadership", {
    guided: true,
  });
const campaign = () =>
  createGame(7402, leadership.cards, leadership.heroes, "leadership", {
    guided: true,
    playMode: "campaign",
  });

test("new recovery export preserves both game modes and parses both without choosing or writing either", () => {
  const normal = adventure();
  const paths = campaign();
  const stored = new Map([
    [ADVENTURE_SAVE_KEY, JSON.stringify(normal, null, 2)],
    [CAMPAIGN_SAVE_KEY, JSON.stringify(paths, null, 2)],
    [DECKS_KEY, '[ { "original deck data": true } ]'],
  ]);
  const before = [...stored];
  const bundle = collectRecoveryBundle((key) => stored.get(key) ?? null, 1500);
  const downloaded = JSON.parse(JSON.stringify(bundle));
  const parsed = parseRecoveryImport(downloaded);
  assert.equal(parsed.kind, "recovery");
  assert.deepEqual(
    parsed.candidates.map((c) => c.mode),
    ["normal", "campaign"],
  );
  assert.equal(parsed.candidates[0].game.originalSeed, normal.originalSeed);
  assert.equal(parsed.candidates[1].game.originalSeed, paths.originalSeed);
  assert.deepEqual(parsed.issues, []);
  assert.deepEqual(parsed.rawEntries, Object.fromEntries(stored));
  assert.deepEqual([...stored], before);
});

test("previous error-boundary keyed downloads and ordinary single adventure exports remain importable", () => {
  const normal = adventure();
  const paths = campaign();
  const legacy = parseRecoveryImport({
    [ADVENTURE_SAVE_KEY]: normal,
    [CAMPAIGN_SAVE_KEY]: paths,
  });
  assert.equal(legacy.candidates.length, 2);
  assert.deepEqual(
    legacy.candidates.map((c) => c.key),
    [ADVENTURE_SAVE_KEY, CAMPAIGN_SAVE_KEY],
  );
  const single = parseRecoveryImport(JSON.parse(JSON.stringify(paths)));
  assert.equal(single.kind, "adventure");
  assert.deepEqual(
    single.candidates.map((c) => c.mode),
    ["campaign"],
  );
  assert.equal(single.candidates[0].game.originalSeed, paths.originalSeed);
});

test("malformed raw save and deck bytes remain in the backup while the other valid mode can be selected", () => {
  const corrupt = '{"unfinished": invalid JSON';
  const malformedDecks = "not JSON at all";
  const stored = new Map([
    [ADVENTURE_SAVE_KEY, corrupt],
    [CAMPAIGN_SAVE_KEY, JSON.stringify(campaign())],
    [DECKS_KEY, malformedDecks],
  ]);
  const bundle = collectRecoveryBundle((key) => stored.get(key) ?? null);
  assert.equal(bundle.entries[ADVENTURE_SAVE_KEY], corrupt);
  assert.equal(bundle.entries[DECKS_KEY], malformedDecks);
  const parsed = parseRecoveryImport(JSON.parse(JSON.stringify(bundle)));
  assert.deepEqual(
    parsed.candidates.map((c) => c.mode),
    ["campaign"],
  );
  assert.equal(parsed.issues.length, 1);
  assert.equal(parsed.issues[0].key, ADVENTURE_SAVE_KEY);
  assert.equal(parsed.rawEntries[ADVENTURE_SAVE_KEY], corrupt);
  assert.equal(parsed.rawEntries[DECKS_KEY], malformedDecks);
  assert.equal(stored.get(ADVENTURE_SAVE_KEY), corrupt);
});

test("recovery validation refuses mode-key mismatches and invalid candidate structures before any caller writes", () => {
  const malformed = { ...adventure(), threat: -1 };
  const parsed = parseRecoveryImport({
    [ADVENTURE_SAVE_KEY]: malformed,
    [CAMPAIGN_SAVE_KEY]: adventure(),
  });
  assert.deepEqual(parsed.candidates, []);
  assert.equal(parsed.issues.length, 2);
  assert.deepEqual(Object.keys(parsed.rawEntries), [
    ADVENTURE_SAVE_KEY,
    CAMPAIGN_SAVE_KEY,
  ]);
  assert.throws(
    () => parseRecoveryImport({ not: "a save" }),
    /not a valid adventure save/,
  );
  assert.throws(
    () =>
      parseRecoveryImport({
        format: "there-and-back-again-recovery",
        version: 2,
        entries: {},
      }),
    /unsupported format/,
  );
});

test("unavailable browser storage is reported in exported backup metadata without inventing a saved adventure", () => {
  const bundle = collectRecoveryBundle(() => {
    throw new Error("Access denied");
  }, 1500);
  assert.deepEqual(bundle.entries, {});
  assert.deepEqual(bundle.unreadableKeys, [
    ADVENTURE_SAVE_KEY,
    CAMPAIGN_SAVE_KEY,
    DECKS_KEY,
  ]);
  const parsed = parseRecoveryImport(bundle);
  assert.deepEqual(parsed.candidates, []);
  assert.equal(parsed.issues.length, 3);
  assert.ok(
    parsed.issues.every((issue) => issue.message.includes("could not read")),
  );
});
