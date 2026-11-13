import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  BF,
  BREAKING_FELLOWSHIP_ENCOUNTERS,
  BREAKING_FELLOWSHIP_QUESTS,
  BREAKING_FELLOWSHIP_RECIPES,
} from "../src/game/breaking-fellowship-support";
import {
  ROAD_DARKENS_FRODO,
  ROAD_DARKENS_ONE_RING,
} from "../src/game/lotr-saga-codes";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/breaking-of-the-fellowship-import.json";
import art from "./breaking-fellowship-art.json";
import quantities from "./breaking-fellowship-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const count = (mode: string, code: string) =>
  BREAKING_FELLOWSHIP_RECIPES.find((r) => r.mode === mode)!
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);

test("Breaking of the Fellowship keeps Hall of Beorn's quantities and pins an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 25);
  assert.equal(snapshot.artwork.length, 32);
  assert.deepEqual(
    [
      ...BREAKING_FELLOWSHIP_ENCOUNTERS.map((c) => c.code),
      ...BREAKING_FELLOWSHIP_QUESTS.map((c) => c.code),
      ROAD_DARKENS_FRODO,
      ROAD_DARKENS_ONE_RING,
    ].sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  for (const mode of ["standard", "easy"])
    assert.deepEqual(
      BREAKING_FELLOWSHIP_RECIPES.find((r) => r.mode === mode),
      snapshot.recipes.find((r) => r.mode === mode),
    );
  for (const row of quantities) {
    assert.equal(count("standard", row.code), row.normal, `${row.name} normal`);
    assert.equal(count("easy", row.code), row.easy, `${row.name} easy`);
  }
  // Hall of Beorn: 35 and 28 encounter cards without the campaign card and
  // the burdens, plus 7 quest cards, Frodo Baggins and The One Ring.
  assert.equal(
    quantities.reduce((n, r) => n + r.normal, 0),
    35 + 7 + 2,
  );
  assert.equal(
    quantities.reduce((n, r) => n + r.easy, 0),
    28 + 7 + 2,
  );
  assert.equal(
    hash("src/data/pending/breaking-of-the-fellowship-import.json"),
    "6d8f2406a8143bd02fcbfb97a03ef1208ff6bc0c55e31e4080532cdb7d825c1d",
  );
});

test("All 32 faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 32);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.deepEqual(
    BREAKING_FELLOWSHIP_QUESTS.map((q) => [q.name, q.back_quest ?? null]),
    [
      ["The Great River", 12],
      ["The Company Divided", null],
      ["Searching the Woods", null],
      ["Guard the Hobbits", null],
      ["The Seat of Amon Hen", null],
      ["Orc Hunting", null],
      ["The Ring-bearer Sets Out", 16],
    ],
  );
  // The printed text restores these words.
  assert.match(card(BF.divided).text!, /until the end of the encounter phase/);
  assert.match(
    original(BF.divided).text!,
    /until the end of the engagement phase/,
  );
  assert.match(
    card(BF.divided).back_text!,
    /^Forced: At the end of the refresh phase, shuffle Seat of Seeing/,
  );
  assert.match(
    card(BF.shoreline).text!,
    /add it to this staging area to travel here/,
  );
  assert.match(
    card(BF.fallen).text!,
    /^When Revealed: Attach to a non-\[fellowship\] hero/,
  );
  assert.match(card(BF.fallen).text!, /owner's control\."\)$/);
  assert.match(original(BF.fallen).text!, /Attach to a hero and move it/);
  for (const c of [
    ...BREAKING_FELLOWSHIP_ENCOUNTERS,
    ...BREAKING_FELLOWSHIP_QUESTS,
  ]) {
    assert.doesNotMatch(c.text ?? "", /  |\s$|<b>|<i>/, `${c.name}: tidy text`);
    assert.doesNotMatch(
      c.back_text ?? "",
      /  |\s$|<b>|<i>/,
      `${c.name}: tidy text`,
    );
  }
  // Statistics from the scans.
  assert.deepEqual(
    [BF.captain, BF.archer, BF.tracker, BF.hunter].map((code) => {
      const c = card(code);
      return [c.engagement, c.threat ?? null, c.attack, c.defense, c.health];
    }),
    [
      [36, 3, 5, 2, 3],
      // Uruk-hai Archer's threat is X, the number of players at its stage.
      [44, null, 4, 1, 4],
      [33, 1, 3, 1, 3],
      [28, 2, 4, 1, 3],
    ],
  );
  assert.deepEqual(
    [
      BF.argonath,
      BF.sarn,
      BF.parth,
      BF.seeing,
      BF.anduin,
      BF.shoreline,
      BF.slopes,
    ].map((code) => {
      const c = card(code);
      return [c.threat ?? null, c.quest, c.victory ?? null, !!c.is_unique];
    }),
    [
      // The Argonath's threat is X, the number of players in the game.
      [null, 2, 1, true],
      [3, 4, 1, true],
      [2, 4, 1, true],
      [1, 6, 1, true],
      [2, 5, null, false],
      [3, 4, null, false],
      [3, 3, null, false],
    ],
  );
  assert.equal(card(BF.choice).type_code, "objective");
});
