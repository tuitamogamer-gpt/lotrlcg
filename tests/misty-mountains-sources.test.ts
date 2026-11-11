import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  OMM as O,
  OMM_ENCOUNTERS,
  OMM_QUESTS,
  OMM_RECIPES,
  ommTrait,
} from "../src/game/misty-mountains-support";
import { WMA_ENCOUNTERS } from "../src/game/we-must-away-support";
import { card } from "../src/game/cards";
import { HOBBIT_BILBO, HOBBIT_TREASURES } from "../src/game/hobbit-saga";
import snapshot from "../src/data/pending/over-the-misty-mountains-grim-import.json";
import art from "./misty-mountains-art.json";
import quantities from "./misty-mountains-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
test("Over the Misty Mountains Grim keeps both recipes, Hall of Beorn quantities and an immutable preparation snapshot", () => {
  assert.equal(snapshot.cards.length, 27);
  assert.equal(snapshot.artwork.length, 30);
  assert.deepEqual(OMM_RECIPES, snapshot.recipes);
  const western = new Set(WMA_ENCOUNTERS.map((c) => c.code));
  assert.deepEqual(
    [...OMM_ENCOUNTERS, ...OMM_QUESTS].map((c) => c.code).sort(),
    snapshot.cards
      .map((c) => c.code)
      .filter((c) => c !== HOBBIT_BILBO && !western.has(c))
      .sort(),
  );
  for (const mode of ["standard", "easy"] as const) {
    const recipe = OMM_RECIPES.find((r) => r.mode === mode)!;
    for (const row of quantities)
      assert.equal(
        recipe.cards
          .filter((c) => c.code === row.code)
          .reduce((n, c) => n + c.quantity, 0),
        mode === "easy" ? row.easy : row.normal,
        `${row.name} (${mode})`,
      );
    assert.equal(
      recipe.cards
        .filter((c) => c.section === "sharedEncounterDeck2")
        .reduce((n, c) => n + c.quantity, 0),
      mode === "easy" ? 21 : 30,
      "the second, Goblin encounter deck",
    );
  }
  assert.equal(
    hash("src/data/pending/over-the-misty-mountains-grim-import.json"),
    "f247e78bb1696218ab66b879c163fc5d609b701009c53a6d516ff88edea7232e",
  );
});
test("All 30 scenario faces and the three treasures are pinned and the reviewed scans match the card data", () => {
  assert.equal(art.length, 33);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.deepEqual(
    OMM_QUESTS.map((q) => q.back_quest),
    [0, 16, 20],
  );
  assert.match(
    OMM_QUESTS[2].back_text!,
    /unless The Great Goblin is in the victory display/,
  );
  for (const c of [
    O.axeman,
    O.miners,
    O.runners,
    O.driver,
    O.bentSwords,
    O.greatGoblin,
  ])
    assert.ok(ommTrait(c, "Goblin") && ommTrait(c, "Orc"), card(c).name);
  for (const c of [O.porch, O.cavern, O.caves]) assert.ok(ommTrait(c, "Cave"));
  assert.deepEqual(
    [
      card(O.giant).engagement,
      card(O.giant).health,
      card(O.greatGoblin).engagement,
      card(O.greatGoblin).victory,
    ],
    [40, 9, 15, 3],
  );
  assert.equal(card(O.highPass).quest, 5);
  assert.equal(card(O.highPass).threat ?? null, null);
  for (const code of HOBBIT_TREASURES) {
    const t = card(code);
    assert.equal(t.treasure, true);
    assert.equal(t.type_code, "attachment");
    assert.equal(t.type_name, "Treasure");
    assert.equal(Number(t.cost), 0);
    assert.ok(t.is_unique);
  }
  for (const c of [
    O.boulders,
    O.chaos,
    O.axeman,
    O.bentSwords,
    O.driver,
    O.miners,
    O.runners,
    O.grip,
    O.caves,
  ])
    assert.ok(card(c).shadow, card(c).name);
});
