import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  WMA as W,
  WMA_ENCOUNTERS,
  WMA_QUESTS,
  WMA_RECIPES,
  WMA_SACKS,
  WMA_TROLLS,
  wmaTrait,
} from "../src/game/we-must-away-support";
import { HERO_CARDS } from "../src/game/decks";
import { card, plain } from "../src/game/cards";
import { HOBBIT_BILBO } from "../src/game/hobbit-saga";
import snapshot from "../src/data/pending/we-must-away-ere-break-of-day-import.json";
import art from "./we-must-away-art.json";
import quantities from "./we-must-away-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
test("We Must Away keeps its normal and easy recipes, Hall of Beorn quantities and an immutable preparation snapshot", () => {
  assert.equal(snapshot.cards.length, 30);
  assert.equal(snapshot.artwork.length, 33);
  assert.deepEqual(WMA_RECIPES, snapshot.recipes);
  assert.deepEqual(
    [...WMA_ENCOUNTERS, ...WMA_QUESTS].map((c) => c.code).sort(),
    snapshot.cards
      .map((c) => c.code)
      .filter((c) => c !== HOBBIT_BILBO)
      .sort(),
  );
  for (const mode of ["standard", "easy"] as const) {
    const recipe = WMA_RECIPES.find((r) => r.mode === mode)!;
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
        .filter((c) => c.section !== "player1Play1")
        .reduce((n, c) => n + c.quantity, 0),
      mode === "easy" ? 34 : 46,
      "43 normal or 31 easy encounter cards and three quest cards",
    );
    assert.deepEqual(
      recipe.cards.filter((c) => c.section === "player1Play1"),
      [{ section: "player1Play1", code: HOBBIT_BILBO, quantity: 1 }],
    );
  }
  assert.equal(
    hash("src/data/pending/we-must-away-ere-break-of-day-import.json"),
    "da0418c3cb94f445b17eca811f9fc213844f46e4ed136194c427e3a4fd6cad59",
  );
});
test("All 33 We Must Away faces are pinned and the reviewed scans match the card data", () => {
  assert.equal(art.length, 33);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.deepEqual(
    WMA_QUESTS.map((q) => q.back_quest),
    [7, 1, 0],
  );
  assert.match(
    WMA_QUESTS[2].back_text!,
    /discovered the treasure cards Sting, Glamdring, and Orcrist/,
  );
  for (const code of WMA_TROLLS) assert.ok(wmaTrait(code, "Troll"));
  assert.deepEqual(
    WMA_TROLLS.map((c) => [
      card(c).engagement,
      card(c).health,
      card(c).victory,
    ]),
    [
      [23, 10, 3],
      [33, 11, 4],
      [38, 12, 5],
    ],
  );
  for (const code of WMA_SACKS) assert.ok(wmaTrait(code, "Sack"));
  assert.equal(card(W.cave).victory, 2);
  assert.equal(card(W.crow).engagement, 25);
  for (const c of [
    W.crow,
    W.pickle,
    W.hobbitLands,
    W.hungry,
    W.lots,
    W.grocer,
    W.campfire,
    W.roast,
    W.rain,
  ])
    assert.ok(card(c).shadow, card(c).name);
  const bilbo = card(HOBBIT_BILBO);
  assert.equal(bilbo.sphere_code, "baggins");
  assert.equal(bilbo.threat, 0);
  assert.ok(!HERO_CARDS.some((c) => c.code === HOBBIT_BILBO));
  assert.equal(
    plain(card(W.grocer).text),
    "When Revealed: Discard all Baggins resources.",
  );
});
