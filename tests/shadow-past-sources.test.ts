import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  SP,
  SHADOW_PAST_ENCOUNTERS,
  SHADOW_PAST_QUESTS,
  SHADOW_PAST_RECIPES,
} from "../src/game/shadow-past-support";
import { ONE_RING, SAGA_FRODO } from "../src/game/lotr-saga-codes";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/a-shadow-of-the-past-import.json";
import art from "./shadow-past-art.json";
import quantities from "./shadow-past-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;

test("A Shadow of the Past keeps Hall of Beorn's normal and easy quantities and pins an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 23);
  assert.equal(snapshot.artwork.length, 26);
  assert.deepEqual(
    [...SHADOW_PAST_ENCOUNTERS, ...SHADOW_PAST_QUESTS]
      .map((c) => c.code)
      .concat(SAGA_FRODO, ONE_RING)
      .sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  for (const mode of ["standard", "easy"] as const) {
    const recipe = SHADOW_PAST_RECIPES.find((r) => r.mode === mode)!;
    assert.deepEqual(
      recipe,
      snapshot.recipes.find((r) => r.mode === mode),
    );
    for (const row of quantities)
      assert.equal(
        recipe.cards
          .filter((c) => c.code === row.code)
          .reduce((n, c) => n + c.quantity, 0),
        mode === "easy" ? row.easy : row.normal,
        `${row.name} (${mode})`,
      );
  }
  // Hall of Beorn: 43 and 31 encounter cards without the campaign cards,
  // plus 3 quest cards, Frodo Baggins and The One Ring.
  assert.equal(
    quantities.reduce((n, r) => n + r.normal, 0),
    43 + 5,
  );
  assert.equal(
    quantities.reduce((n, r) => n + r.easy, 0),
    31 + 5,
  );
  assert.equal(
    hash("src/data/pending/a-shadow-of-the-past-import.json"),
    "979b92e6fd6ce6163e9670c3f00115da7de1b709ca7adf86b38fa8381c216a5b",
  );
});

test("All 26 faces are pinned and the reviewed scans correct the catalog's text, names and traits", () => {
  assert.equal(art.length, 26);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.deepEqual(
    SHADOW_PAST_QUESTS.map((q) => [q.name, q.back_quest ?? null]),
    [
      ["Three is Company", 1],
      ["A Shortcut to Mushrooms", 14],
      ["Escape to Buckland", null],
    ],
  );
  // Hunting for the Ring starts with the last player, not the first.
  assert.match(
    card(SP.hunting).text!,
    /Starting with the last player, each player must either return/,
  );
  assert.match(original(SP.hunting).text!, /first player, each player much/);
  // Printed names.
  assert.equal(card(SP.stockBrook).name, "Stock-brook");
  assert.equal(original(SP.stockBrook).name, "Stock-Brook");
  assert.equal(card(SP.hunting).name, "Hunting for the Ring");
  assert.equal(card(SP.baggins).name, "Have you seen Baggins?");
  // Black Steed is a Morgul treachery, so it may attach to a Black Rider.
  assert.equal(card(SP.steed).traits, "Morgul.");
  assert.equal(original(SP.steed).traits, "");
  assert.match(card(SP.steed).text!, /\(Counts as a Mount attachment/);
  assert.match(card(SP.steed).text!, /engagement cost and gains: 'Forced/);
  // Frodo cancels the effects (plural) of the revealed card.
  assert.match(
    card(SAGA_FRODO).text!,
    /to cancel the effects of an encounter card/,
  );
  assert.match(
    card(SP.crawling).text!,
    /remove each character you control from the quest/,
  );
  assert.match(card(SP.woody).text!, /While Woody End is the active location/);
  assert.match(
    card(SP.mushrooms).back_text!,
    /reveals it \(cannot be canceled\)/,
  );
  assert.match(
    card(ONE_RING).text!,
    /The first player gains control of attached hero\./,
  );
  for (const c of [...SHADOW_PAST_ENCOUNTERS, ...SHADOW_PAST_QUESTS]) {
    assert.doesNotMatch(c.text ?? "", /  /, `${c.name}: no double spaces`);
    assert.doesNotMatch(c.back_text ?? "", /  /, `${c.name}: no double spaces`);
  }
  // Statistics from the scans.
  assert.deepEqual(
    [SP.rider, SP.crow].map((code) => {
      const c = card(code);
      return [c.engagement, c.threat, c.attack, c.defense, c.health];
    }),
    [
      [35, 4, 5, 4, 6],
      [25, 2, 0, 1, 2],
    ],
  );
  for (const code of [
    SP.bagEnd,
    SP.woody,
    SP.stockBrook,
    SP.bamfurlong,
    SP.ferry,
  ])
    assert.equal(card(code).is_unique, true, card(code).name);
});
