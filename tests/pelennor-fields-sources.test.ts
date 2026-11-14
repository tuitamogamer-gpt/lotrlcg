import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  PF,
  PELENNOR_FIELDS_BOONS,
  PELENNOR_FIELDS_ENCOUNTERS,
  PELENNOR_FIELDS_QUESTS,
  PELENNOR_FIELDS_RECIPES,
} from "../src/game/pelennor-fields-support";
import { FLAME_WEST_ARAGORN } from "../src/game/lotr-saga-codes";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/the-battle-of-the-pelennor-fields-import.json";
import art from "./pelennor-fields-art.json";
import quantities from "./pelennor-fields-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const count = (mode: string, code: string) =>
  PELENNOR_FIELDS_RECIPES.find((r) => r.mode === mode)!
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);

test("The Battle of the Pelennor Fields keeps the catalog's recipes, the printed set numbers and an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 30);
  assert.equal(snapshot.artwork.length, 37);
  assert.deepEqual(
    [
      ...PELENNOR_FIELDS_ENCOUNTERS.map((c) => c.code),
      ...PELENNOR_FIELDS_QUESTS.map((c) => c.code),
      ...PELENNOR_FIELDS_BOONS.map((c) => c.code),
      FLAME_WEST_ARAGORN,
    ].sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  assert.deepEqual(PELENNOR_FIELDS_RECIPES.map((r) => r.id).sort(), [
    "E0B.15",
    "Q0B.15",
  ]);
  for (const recipe of snapshot.recipes)
    assert.deepEqual(
      PELENNOR_FIELDS_RECIPES.find((r) => r.id === recipe.id),
      recipe,
    );
  // The scans' set numbers run from The Witch-king's "2/45" to Shadow of
  // Mordor's "44/45" and "45/45": the 40 cards of the encounter deck, the
  // active Pelennor Field, Grond, The Witch-king and Minas Tirith.
  for (const row of quantities) {
    assert.equal(count("standard", row.code), row.normal, `${row.name} normal`);
    assert.equal(count("easy", row.code), row.easy, `${row.name} easy`);
  }
  const sorted = [...quantities].sort(
    (a, b) => Number(a.set.split("/")[0]) - Number(b.set.split("/")[0]),
  );
  let next = 2;
  for (const row of sorted) {
    assert.equal(Number(row.set.split("/")[0]), next, row.name);
    next += row.normal;
  }
  assert.equal(next, 46);
  // The box's other cards: 4 Wraith on Wings (62), the Esquires (14, 15) and Aragorn (1).
  assert.equal(count("standard", PF.wraith), 4);
  assert.equal(count("standard", PF.esquireRohan), 1);
  assert.equal(count("standard", PF.esquireGondor), 1);
  assert.equal(count("standard", FLAME_WEST_ARAGORN), 1);
  // Easy mode removes the gold-icon copies (The Black Serpent among them).
  assert.equal(
    quantities.reduce((n, r) => n + r.easy, 0),
    34,
  );
  assert.equal(count("easy", PF.serpent), 0);
  assert.equal(
    hash("src/data/pending/the-battle-of-the-pelennor-fields-import.json"),
    "034194bfbd30a3ca2b48c8c63176790a6a0d8153dbe1f4d91dae995695b45d91",
  );
});

test("All 37 faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 37);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  // Stage 2B: "the total cost of all allies".
  assert.match(original(PF.retreat).back_text!, /total cost of each ally/);
  assert.match(
    card(PF.retreat).back_text!,
    /^X is the total cost of all allies in the staging area\./,
  );
  // 3A and 5A shuffle the encounter deck; 3B's quest points and its enemy.
  assert.match(
    card(PF.besieged).text!,
    /adds it to the staging area\. Shuffle the encounter deck\.$/,
  );
  assert.match(
    card(PF.besieged).back_text!,
    /\+4 quest points for each player in the game\./,
  );
  assert.match(
    card(PF.besieged).back_text!,
    /equal to that enemy's total \[threat\]/,
  );
  assert.match(
    card(PF.fields).text!,
    /if able\. Shuffle the encounter deck\. Each other player/,
  );
  // 5B: "shadow cards dealt to The Witch-king" and "This stage cannot be defeated".
  assert.match(
    card(PF.fields).back_text!,
    /^The Witch-king and shadow cards dealt to The Witch-king are immune/,
  );
  assert.match(
    card(PF.fields).back_text!,
    /This stage cannot be defeated unless Aragorn is in play/,
  );
  // The Witch-king's Sorcerer side, Minas Tirith's traits, the Wraiths' statistics.
  assert.match(original(PF.witchKing).back_text!, /envounter/);
  assert.match(
    card(PF.witchKing).back_text!,
    /At the beginning of the encounter phase, The Witch-king engages the first player/,
  );
  assert.equal(card(PF.witchKing).back_traits, "Nazgûl. Sorcerer.");
  assert.equal(card(PF.minasTirith).traits, "Gondor. City.");
  assert.match(
    card(PF.minasTirith).text!,
    /^Minas Tirith has 30 hit points plus 10 for each player\.\nForced:/,
  );
  assert.equal(card(PF.wraith).engagement, 45);
  assert.equal(card(PF.wraith).victory, 5);
  assert.match(card(PF.wraith).text!, /-1 engagement cost/);
  // Encounter corrections.
  assert.equal(card(PF.mumak).name, "War Mûmak");
  assert.match(card(PF.eye).shadow!, /instead if it has the Mordor trait/);
  assert.match(card(PF.orc).text!, /must be dealt to Minas Tirith/);
  assert.match(original(PF.dart).text!, /^Peril\./);
  assert.match(
    card(PF.dart).text!,
    /^When Revealed: Remove a hero you control from the quest and attach Black Dart to that hero/,
  );
  assert.match(
    card(PF.rammas).text!,
    /engaged with him\. Shuffle the encounter deck\.$/,
  );
  assert.equal(card(PF.grond).printed_stats?.threat, "X");
  // The rules card: the Frodo, Minas Tirith and Assault rules, both sides.
  assert.match(card(PF.rules).text!, /^Frodo:/);
  assert.match(card(PF.rules).text!, /Assault is a new keyword/);
  assert.match(card(PF.rules).back_text!, /^Assault \(continued\)/);
  // Every new card shows its local scan.
  for (const c of [
    ...PELENNOR_FIELDS_ENCOUNTERS,
    ...PELENNOR_FIELDS_QUESTS,
    ...PELENNOR_FIELDS_BOONS,
  ])
    assert.ok(
      art.some((a) => a.localPath === c.imagesrc),
      `${c.name} uses a pinned scan`,
    );
  for (const c of [...PELENNOR_FIELDS_ENCOUNTERS, ...PELENNOR_FIELDS_QUESTS])
    assert.ok(
      !`${c.text ?? ""}${c.back_text ?? ""}`.includes("  "),
      `${c.name} has no double space`,
    );
});
