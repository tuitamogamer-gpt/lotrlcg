import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  FF,
  FF_BURDENS,
  FLIGHT_FORD_ENCOUNTERS,
  FLIGHT_FORD_QUESTS,
  FLIGHT_FORD_RECIPES,
} from "../src/game/flight-ford-support";
import { ONE_RING, SAGA_FRODO } from "../src/game/lotr-saga-codes";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/flight-to-the-ford-import.json";
import art from "./flight-ford-art.json";
import quantities from "./flight-ford-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const SHARED = [
  SAGA_FRODO,
  ONE_RING,
  FF.steed,
  FF.gale,
  FF.pathless,
  FF.cry,
  FF.ringwraith,
  FF.witchKing,
  FF.blade,
  FF.terror,
];

test("Flight to the Ford keeps Hall of Beorn's normal and easy quantities and pins an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 28);
  assert.equal(snapshot.artwork.length, 30);
  // Ten cards were imported with A Shadow of the Past and A Knife in the Dark.
  assert.deepEqual(
    [...FLIGHT_FORD_ENCOUNTERS, ...FLIGHT_FORD_QUESTS]
      .map((c) => c.code)
      .concat(SHARED)
      .sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  assert.deepEqual(
    FLIGHT_FORD_RECIPES.find((r) => r.mode === "standard"),
    snapshot.recipes.find((r) => r.mode === "standard"),
  );
  // Easy mode keeps 1 of the 3 Black Steeds; the catalog recipe kept all 3.
  const easy = FLIGHT_FORD_RECIPES.find((r) => r.mode === "easy")!;
  const source = snapshot.recipes.find((r) => r.mode === "easy")!;
  assert.deepEqual(
    easy.cards.filter((c) => c.code !== FF.steed),
    source.cards.filter((c) => c.code !== FF.steed),
  );
  assert.equal(source.cards.find((c) => c.code === FF.steed)!.quantity, 3);
  assert.equal(easy.cards.find((c) => c.code === FF.steed)!.quantity, 1);
  for (const mode of ["standard", "easy"] as const) {
    const recipe = FLIGHT_FORD_RECIPES.find((r) => r.mode === mode)!;
    for (const row of quantities)
      assert.equal(
        recipe.cards
          .filter((c) => c.code === row.code)
          .reduce((n, c) => n + c.quantity, 0),
        mode === "easy" ? row.easy : row.normal,
        `${row.name} (${mode})`,
      );
    // The five burdens form the second encounter deck.
    assert.deepEqual(
      recipe.cards
        .filter((c) => c.section === "sharedEncounterDeck2")
        .map((c) => c.code)
        .sort(),
      [...FF_BURDENS].sort(),
    );
  }
  // Hall of Beorn: 51 and 38 encounter cards without the campaign card,
  // plus 2 quest cards, Frodo Baggins and The One Ring.
  assert.equal(
    quantities.reduce((n, r) => n + r.normal, 0),
    51 + 4,
  );
  assert.equal(
    quantities.reduce((n, r) => n + r.easy, 0),
    38 + 4,
  );
  assert.equal(
    hash("src/data/pending/flight-to-the-ford-import.json"),
    "f370ec323851e8691d9e3a35f0314daa9425baea81099747ce345267cfd39fdc",
  );
});

test("All 30 faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 30);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.deepEqual(
    FLIGHT_FORD_QUESTS.map((q) => [q.name, q.back_quest ?? null]),
    [
      ["Pursued by the Enemy", 15],
      ["Race to Rivendell", 15],
    ],
  );
  assert.equal(original(FF.race).name, "Race To Rivendell");
  // The Nine are Abroad has no Peril keyword on the printed card.
  assert.doesNotMatch(card(FF.nine).text!, /Peril/);
  assert.match(original(FF.nine).text!, /^Peril\./);
  assert.match(
    card(FF.pursued).text!,
    /Set Ford of Bruinen and The Witch-king aside/,
  );
  assert.match(card(FF.pain).text!, /reduce the Ring-bearer's \[willpower\]/);
  assert.match(card(FF.camp).text!, /\+1 \[attack\] and \+1 \[defense\]/);
  assert.match(card(FF.oldRoad).text!, /on top of the encounter deck/);
  for (const code of [FF.bridge, FF.ford])
    assert.match(card(code).text!, /^Immune to player card effects\.\n/);
  // The RingsDB burdens become plain encounter treacheries.
  for (const code of FF_BURDENS) {
    const c = card(code);
    assert.equal(c.type_code, "treachery");
    assert.equal(c.sphere_code, "encounter");
    assert.match(c.text!, /^Surge\.\nWhen Revealed: /);
    assert.doesNotMatch(c.text!, /<|\r/, `${c.name}: no markup`);
  }
  assert.equal(
    card(FF.eaten).shadow,
    "Shadow: Deal 1 damage to defending character.",
  );
  for (const c of [...FLIGHT_FORD_ENCOUNTERS, ...FLIGHT_FORD_QUESTS]) {
    assert.doesNotMatch(c.text ?? "", /  /, `${c.name}: no double spaces`);
    assert.doesNotMatch(c.back_text ?? "", /  /, `${c.name}: no double spaces`);
  }
  // Statistics from the scans.
  const fell = card(FF.fell);
  assert.deepEqual(
    [fell.engagement, fell.threat, fell.attack, fell.defense, fell.health],
    [30, 2, 4, 3, 6],
  );
  assert.deepEqual(
    [FF.bridge, FF.ford, FF.camp, FF.ettenmoors, FF.oldRoad].map((code) => {
      const c = card(code);
      return [c.threat ?? null, c.quest, c.victory ?? null, !!c.is_unique];
    }),
    [
      [null, 4, 3, true],
      [2, 6, 5, true],
      [1, 2, 1, true],
      [2, 3, null, false],
      [3, 4, null, false],
    ],
  );
  assert.equal(card(FF.wound).type_code, "objective");
  assert.equal(card(FF.wound).traits, "Morgul.");
});
