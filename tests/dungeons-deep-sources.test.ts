import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  DDCD as D,
  DDCD_ENCOUNTERS,
  DDCD_QUESTS,
  DDCD_RECIPES,
  RIDDLES,
} from "../src/game/dungeons-deep-support";
import { OMM_ENCOUNTERS } from "../src/game/misty-mountains-support";
import { card } from "../src/game/cards";
import { HOBBIT_BILBO } from "../src/game/hobbit-saga";
import snapshot from "../src/data/pending/dungeons-deep-and-caverns-dim-import.json";
import art from "./dungeons-deep-art.json";
import quantities from "./dungeons-deep-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
test("Dungeons Deep and Caverns Dim keeps Hall of Beorn's quantities, corrects the easy Goblins' Caves and pins an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 21);
  assert.equal(snapshot.artwork.length, 24);
  const goblins = new Set(OMM_ENCOUNTERS.map((c) => c.code));
  assert.deepEqual(
    [...DDCD_ENCOUNTERS, ...DDCD_QUESTS].map((c) => c.code).sort(),
    snapshot.cards
      .map((c) => c.code)
      .filter((c) => c !== HOBBIT_BILBO && !goblins.has(c))
      .sort(),
  );
  for (const mode of ["standard", "easy"] as const) {
    const recipe = DDCD_RECIPES.find((r) => r.mode === mode)!;
    for (const row of quantities)
      assert.equal(
        recipe.cards
          .filter((c) => c.code === row.code)
          .reduce((n, c) => n + c.quantity, 0),
        mode === "easy" ? row.easy : row.normal,
        `${row.name} (${mode})`,
      );
  }
  // The source easy recipe lists 1 Goblins' Caves; the shared easy set has 2.
  const sourceEasy = snapshot.recipes.find((r) => r.mode === "easy")!;
  assert.equal(sourceEasy.cards.find((c) => c.code === D.caves)!.quantity, 1);
  assert.equal(
    DDCD_RECIPES.find((r) => r.mode === "easy")!.cards.find(
      (c) => c.code === D.caves,
    )!.quantity,
    2,
  );
  assert.deepEqual(
    DDCD_RECIPES.find((r) => r.mode === "standard"),
    snapshot.recipes.find((r) => r.mode === "standard"),
  );
  assert.equal(
    hash("src/data/pending/dungeons-deep-and-caverns-dim-import.json"),
    "813d51fec3efa904a52ee2fe13bb8c2dbb9c33f158cdbd29633692c3c38c223b",
  );
});
test("All 24 faces are pinned and the reviewed scans match the card data and riddles", () => {
  assert.equal(art.length, 24);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.deepEqual(
    DDCD_QUESTS.map((q) => q.back_quest),
    [14, 9, 16],
  );
  assert.deepEqual(
    [card(D.gollum).engagement, card(D.gollum).attack, card(D.gollum).health],
    [50, 2, 5],
  );
  assert.equal(card(D.lake).quest, 0);
  assert.equal(card(D.lake).threat ?? null, null);
  for (const [code, riddle] of Object.entries(RIDDLES)) {
    const text = card(code).text!;
    assert.match(text, /Riddle: The first player names/);
    assert.match(
      text,
      riddle.cards === 1
        ? /discards the top card\./
        : new RegExp(`discards the top ${riddle.cards} cards`),
    );
  }
});
