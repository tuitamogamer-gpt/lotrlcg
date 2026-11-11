import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  FAS as F,
  FAS_ENCOUNTERS,
  FAS_QUESTS,
  FAS_RECIPES,
} from "../src/game/flies-spiders-support";
import { card } from "../src/game/cards";
import { OTD_BILBO, OTD_RING } from "../src/game/hobbit-saga";
import snapshot from "../src/data/pending/flies-and-spiders-import.json";
import art from "./flies-spiders-art.json";
import quantities from "./flies-spiders-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

test("Flies and Spiders keeps Hall of Beorn's quantities and pins an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 20);
  assert.equal(snapshot.artwork.length, 24);
  assert.deepEqual(
    [...FAS_ENCOUNTERS, ...FAS_QUESTS].map((c) => c.code).sort(),
    snapshot.cards
      .map((c) => c.code)
      .filter((c) => c !== OTD_BILBO && c !== OTD_RING)
      .sort(),
  );
  for (const mode of ["standard", "easy"] as const) {
    const recipe = FAS_RECIPES.find((r) => r.mode === mode)!;
    for (const row of quantities)
      assert.equal(
        recipe.cards
          .filter((c) => c.code === row.code)
          .reduce((n, c) => n + c.quantity, 0),
        mode === "easy" ? row.easy : row.normal,
        `${row.name} (${mode})`,
      );
    assert.deepEqual(
      recipe,
      snapshot.recipes.find((r) => r.mode === mode),
    );
  }
  assert.equal(
    hash("src/data/pending/flies-and-spiders-import.json"),
    "49815e4e1f812a0117b3b3d571a5224c10e23a5ad5298cf01cf3c632f130e749",
  );
});

test("All 24 faces are pinned and the reviewed scans match the card data", () => {
  assert.equal(art.length, 24);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.deepEqual(
    FAS_QUESTS.map((q) => q.back_quest ?? 0),
    [9, 0, 11, 3],
  );
  assert.deepEqual([card(F.glade).threat, card(F.glade).quest], [1, 9]);
  for (const code of [F.cob, F.fat, F.lob, F.tomnoddy, F.wicked])
    assert.match(card(code).text!, /^Venom\./);
  assert.doesNotMatch(card(F.bats).text!, /Venom/);
  assert.match(card(OTD_BILBO).text!, /non-treasure cards/);
  assert.equal(card(OTD_RING).treasure, true);
});
