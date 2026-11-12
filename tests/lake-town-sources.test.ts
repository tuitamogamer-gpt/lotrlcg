import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  LAKE as L,
  LAKE_ENCOUNTERS,
  LAKE_QUESTS,
  LAKE_RECIPES,
  LAKE_SMAUGS,
  printedBurn,
} from "../src/game/lake-town-support";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/the-battle-of-lake-town-import.json";
import art from "./lake-town-art.json";
import quantities from "./lake-town-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;

test("The Battle of Lake-town keeps Hall of Beorn's quantities (the same 46 cards on every difficulty) and pins an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 24);
  assert.equal(snapshot.artwork.length, 27);
  assert.deepEqual(
    [...LAKE_ENCOUNTERS, ...LAKE_QUESTS].map((c) => c.code).sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  assert.equal(LAKE_RECIPES.length, 1);
  const recipe = LAKE_RECIPES[0];
  assert.equal(recipe.mode, "standard");
  assert.equal(recipe.id, "Q99.02");
  assert.deepEqual(recipe, snapshot.recipes[0]);
  assert.equal(quantities.length, 24);
  for (const row of quantities) {
    assert.equal(
      row.easy,
      row.normal,
      `${row.name}: easy mode removes nothing`,
    );
    assert.equal(
      recipe.cards
        .filter((c) => c.code === row.code)
        .reduce((n, c) => n + c.quantity, 0),
      row.normal,
      row.name,
    );
  }
  assert.equal(
    quantities.reduce((n, r) => n + r.normal, 0),
    49,
    "3 quest cards, 36 encounter cards, 9 Smaugs and Lake-town",
  );
  const section = (name: string) =>
    recipe.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  assert.deepEqual(
    [...new Set(section("sharedEncounterDeck2"))].sort(),
    [...LAKE_SMAUGS].sort(),
  );
  assert.deepEqual(section("sharedSetAside"), [L.town]);
  assert.equal(
    hash("src/data/pending/the-battle-of-lake-town-import.json"),
    "aa98b976912386b557475a6dd77e5804f21a30b6b0b2889f3161e81cff17b577",
  );
});

test("All 27 faces are pinned and the reviewed scans correct the catalog's text, uniqueness and quest points", () => {
  assert.equal(art.length, 27);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  // Quest points from the scans; 3B has none (Smaug must be defeated).
  assert.deepEqual(
    LAKE_QUESTS.map((q) => [q.name, q.back_quest ?? null]),
    [
      ["Terror from the Mountain", 14],
      ["Fire and Water", 10],
      ["The Dragon's Wrath", null],
    ],
  );
  // The unique symbol is printed on these three locations.
  for (const code of [L.bridge, L.house, L.manor]) {
    assert.equal(card(code).is_unique, true, card(code).name);
    assert.equal(original(code).is_unique, false);
  }
  assert.equal(card(L.town).is_unique, true);
  assert.equal(card(L.thrush).is_unique, true);
  // 2B: "any number of progress tokens", not "and number".
  assert.match(
    card(L.fireWater).back_text!,
    /When the players quest successfully, any number of progress tokens that would be placed on this quest may instead be discarded to remove the same amount of damage from Lake-town\./,
  );
  assert.match(original(L.fireWater).back_text!, /and number of progress/);
  // 3B's Forced effect and Refresh Action are separate paragraphs.
  assert.match(
    card(L.wrath).back_text!,
    /^Forced: During the quest phase, reveal 1 additional card from the encounter deck\nRefresh Action: Reset the quest deck to stage 2B\.\n/,
  );
  // Typos and missing words from the catalog.
  assert.match(card(L.bridge).text!, /the amount of damage on Lake-town/);
  assert.match(card(L.mighty).text!, /a shadow card for each attack/);
  assert.match(card(L.blast).shadow!, /to cancel this effect\.$/);
  assert.match(card(L.baiting).text!, /^When Revealed: Smaug makes an attack/);
  assert.match(
    card(L.east).text!,
    /"When Revealed" effects cannot be canceled\./,
  );
  assert.match(card(L.wharf).shadow!, /Then, it makes an additional attack/);
  assert.match(card(L.thrush).text!, /If detached, discard The Old Thrush\.\n/);
  for (const c of [...LAKE_ENCOUNTERS, ...LAKE_QUESTS]) {
    assert.equal(c.encounter_set, "The Battle of Lake-town");
    assert.doesNotMatch(c.text ?? "", /  /, `${c.name}: no double spaces`);
    assert.doesNotMatch(c.back_text ?? "", /  /, `${c.name}: no double spaces`);
  }
  // Printed Burn values.
  assert.deepEqual(
    [
      L.east,
      L.wharf,
      L.dock,
      L.bridge,
      L.house,
      L.merchant,
      L.north,
      L.south,
      L.manor,
      L.west,
    ].map(printedBurn),
    [1, 1, 1, 2, 3, 1, 2, 2, 3, 0],
  );
  // The three Smaugs.
  assert.deepEqual(
    LAKE_SMAUGS.map((code) => {
      const c = card(code);
      return [c.threat, c.attack, c.defense, c.health];
    }),
    [
      [5, 8, 8, 20],
      [7, 5, 9, 20],
      [6, 7, 7, 20],
    ],
  );
});
