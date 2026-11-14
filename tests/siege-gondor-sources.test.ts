import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  SG,
  SIEGE_GONDOR_ENCOUNTERS,
  SIEGE_GONDOR_QUESTS,
  SIEGE_GONDOR_RECIPES,
} from "../src/game/siege-gondor-support";
import { FLAME_WEST_ARAGORN } from "../src/game/lotr-saga-codes";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/the-siege-of-gondor-import.json";
import art from "./siege-gondor-art.json";
import quantities from "./siege-gondor-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const count = (mode: string, code: string) =>
  SIEGE_GONDOR_RECIPES.find((r) => r.mode === mode)!
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);

test("The Siege of Gondor keeps the catalog's recipes, the printed set numbers and an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 17);
  assert.equal(snapshot.artwork.length, 19);
  assert.deepEqual(
    [
      ...SIEGE_GONDOR_ENCOUNTERS.map((c) => c.code),
      ...SIEGE_GONDOR_QUESTS.map((c) => c.code),
      FLAME_WEST_ARAGORN,
    ].sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  assert.deepEqual(SIEGE_GONDOR_RECIPES.map((r) => r.id).sort(), [
    "E0B.14",
    "Q0B.14",
  ]);
  for (const recipe of snapshot.recipes)
    assert.deepEqual(
      SIEGE_GONDOR_RECIPES.find((r) => r.id === recipe.id),
      recipe,
    );
  // The scans' set numbers: The Corsair Fleet is "1/32", Great Corsair Ship
  // "2/32" and Driven to the Brink "31/32" (its copies are 31 and 32).
  for (const row of quantities) {
    assert.equal(count("standard", row.code), row.normal, `${row.name} normal`);
    assert.equal(count("easy", row.code), row.easy, `${row.name} easy`);
  }
  assert.equal(
    quantities.reduce((n, r) => n + r.normal, 0),
    32,
  );
  const first = quantities.map((r) => Number(r.set.split("/")[0]));
  const sorted = [...quantities].sort(
    (a, b) => Number(a.set.split("/")[0]) - Number(b.set.split("/")[0]),
  );
  let next = 1;
  for (const row of sorted) {
    assert.equal(Number(row.set.split("/")[0]), next, row.name);
    next += row.normal;
  }
  assert.equal(next, 33);
  assert.equal(first.length, 14);
  // Easy mode removes the gold-icon copies: both Pelargir Quays and one copy
  // of Corsair Captain, Umbar Pirate Crew, Raiding the Coasts and Driven to the Brink.
  assert.equal(
    quantities.reduce((n, r) => n + r.easy, 0),
    26,
  );
  assert.equal(count("easy", SG.quays), 0);
  // Aragorn, the quest card and the rules card complete the recipe.
  assert.equal(count("standard", FLAME_WEST_ARAGORN), 1);
  assert.equal(count("standard", SG.pelargir), 1);
  assert.equal(count("standard", SG.rules), 1);
  assert.equal(
    hash("src/data/pending/the-siege-of-gondor-import.json"),
    "6fabf537f8ec82f88943a99feeb11a5f615ca095a66f8ffc308d9fa686d7d5a9",
  );
});

test("All 19 faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 19);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  // The Corsair Fleet: "X is the number of resources here", without the flavor text.
  assert.match(
    original(SG.fleet).text!,
    /resources on this objective\. \.\.\.ships/,
  );
  assert.match(card(SG.fleet).text!, /X is the number of resources here\.$/);
  // Great Corsair Ship: "The Corsair Fleet", threat X.
  assert.match(original(SG.greatShip).text!, /The Corsiar Fleet/);
  assert.match(
    card(SG.greatShip).text!,
    /^X is the number of resources on The Corsair Fleet\./,
  );
  assert.equal(card(SG.greatShip).printed_stats?.threat, "X");
  // Black Sails: "until the end of the phase".
  assert.doesNotMatch(original(SG.sails).text!, /until the end of the phase/);
  assert.match(
    card(SG.sails).text!,
    /gets \+1 \[threat\] until the end of the phase\./,
  );
  // Pelargir Quays: "place a damage token here".
  assert.match(original(SG.quays).text!, /place 1 damage token here/);
  assert.match(card(SG.quays).text!, /place a damage token here/);
  // The keyword lines the catalog lists as traits head the text boxes.
  for (const [code, keywords] of [
    [SG.sails, "Doomed 1."],
    [SG.fellFolk, "Peril."],
    [SG.brink, "Peril."],
  ] as const) {
    assert.equal(original(code).traits, keywords);
    assert.equal(card(code).traits, "");
    assert.ok(card(code).text!.startsWith(`${keywords}\n`), code);
  }
  // The rules card: the Frodo rule and no quest-specific instructions.
  assert.match(
    card(SG.rules).text!,
    /cannot use any card with the title "Frodo Baggins\."/,
  );
  assert.match(card(SG.rules).text!, /no quest-specific instructions/);
  assert.equal(card(SG.pelargir).back_quest, 20);
  // Every new encounter card shows its local scan.
  for (const c of [...SIEGE_GONDOR_ENCOUNTERS, ...SIEGE_GONDOR_QUESTS])
    assert.ok(
      art.some((a) => a.localPath === c.imagesrc),
      `${c.name} uses a pinned scan`,
    );
  for (const c of [...SIEGE_GONDOR_ENCOUNTERS, ...SIEGE_GONDOR_QUESTS])
    assert.ok(
      !`${c.text ?? ""}${c.back_text ?? ""}`.includes("  "),
      `${c.name} has no double space`,
    );
  for (const c of [...SIEGE_GONDOR_ENCOUNTERS, ...SIEGE_GONDOR_QUESTS])
    assert.equal(
      `${c.text ?? ""}${c.back_text ?? ""}`.trim(),
      `${c.text ?? ""}${c.back_text ?? ""}`.trim().replace(/\s+$/gm, ""),
      `${c.name} has no trailing space`,
    );
});
