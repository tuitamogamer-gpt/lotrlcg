import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  BG,
  BLACK_GATE_ENCOUNTERS,
  BLACK_GATE_QUESTS,
  BLACK_GATE_RECIPES,
} from "../src/game/black-gate-support";
import { MORDOR_ORCS } from "../src/game/mordor-orcs-codes";
import { MOUNTAIN_FIRE_ARAGORN } from "../src/game/lotr-saga-codes";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/the-black-gate-opens-import.json";
import art from "./black-gate-art.json";
import quantities from "./black-gate-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const count = (mode: string, code: string) =>
  BLACK_GATE_RECIPES.find((r) => r.mode === mode)!
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);
/** "5-7/40" → [5, 7, 40]. */
const range = (set: string) => {
  const [numbers, total] = set.split("/");
  const [first, last = first] = numbers.split("-");
  return [Number(first), Number(last), Number(total)];
};

test("The Black Gate Opens keeps the catalog's recipes, the printed set numbers and an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 24);
  assert.equal(snapshot.artwork.length, 26);
  // The Orcs of Mordor are defined once, with The Tower of Cirith Ungol.
  assert.deepEqual(
    [
      ...BLACK_GATE_ENCOUNTERS.map((c) => c.code),
      ...BLACK_GATE_QUESTS.map((c) => c.code),
      ...Object.values(MORDOR_ORCS),
      MOUNTAIN_FIRE_ARAGORN,
    ].sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  assert.deepEqual(BLACK_GATE_RECIPES.map((r) => r.id).sort(), [
    "E0B.17",
    "Q0B.17",
  ]);
  for (const recipe of snapshot.recipes)
    assert.deepEqual(
      BLACK_GATE_RECIPES.find((r) => r.id === recipe.id),
      recipe,
    );
  for (const row of quantities) {
    assert.equal(count("standard", row.code), row.normal, `${row.name} normal`);
    assert.equal(count("easy", row.code), row.easy, `${row.name} easy`);
    assert.equal(card(row.code).encounter_set, row.encounterSet, row.name);
    const [first, last] = range(row.set);
    assert.equal(last - first + 1, row.normal, `${row.name} numbers`);
    const [scan] = range(row.scan);
    assert.ok(first <= scan && scan <= last, `${row.name} scan ${row.scan}`);
  }
  // The Black Gate Opens set: 40 numbers, 15 not in any recipe (the campaign
  // card is unnumbered); Orcs of Mordor: 9 numbers.
  for (const [set, size, missing] of [
    ["The Black Gate Opens", 40, [15]],
    ["Orcs of Mordor", 9, []],
  ] as const) {
    const numbers = quantities
      .filter((r) => r.encounterSet === set)
      .flatMap((r) => {
        const [first, last, total] = range(r.set);
        assert.equal(total, size, set);
        return Array.from({ length: last - first + 1 }, (_, i) => first + i);
      })
      .sort((a, b) => a - b);
    assert.deepEqual(
      numbers,
      Array.from({ length: size }, (_, i) => i + 1).filter(
        (n) => !(missing as readonly number[]).includes(n),
      ),
      set,
    );
  }
  const deck = (mode: string) =>
    BLACK_GATE_RECIPES.find((r) => r.mode === mode)!
      .cards.filter((c) => c.section === "sharedEncounterDeck")
      .reduce((n, c) => n + c.quantity, 0);
  assert.equal(deck("standard"), 46);
  assert.equal(deck("easy"), 37);
  // Setup: The Black Gate and The Mouth of Sauron start in the staging area,
  // Gwaihir is set aside and the Fellowship Aragorn joins the first player.
  assert.equal(
    quantities.reduce((n, r) => n + r.normal, 0),
    46 + 2,
  );
  assert.equal(count("standard", BG.gwaihir), 1);
  assert.equal(count("standard", MOUNTAIN_FIRE_ARAGORN), 1);
  assert.equal(
    hash("src/data/pending/the-black-gate-opens-import.json"),
    "f0eeca0ea1a5e4dcc30c6ef4360c826f93357c9d01d738a1d89bba688d6557b5",
  );
});

test("All 26 faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 26);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  // 2A: "The Battle of the Morannon", "Dire." and "adds it to the staging area".
  assert.equal(original(BG.battle).name, "The Battle of Morannon");
  assert.equal(card(BG.battle).name, "The Battle of the Morannon");
  assert.match(original(BG.battle).text!, /^Dire When Revealed/);
  assert.match(
    card(BG.battle).text!,
    /^Dire\. When Revealed: Each player searches the encounter deck and discard pile for a different Orc, Troll, or Nazgûl enemy and adds it to the staging area\./,
  );
  assert.equal(card(BG.battle).back_quest, null);
  assert.match(card(BG.battle).back_text!, /\nThis stage cannot be defeated\./);
  assert.equal(card(BG.embassy).back_quest, 0);
  // The Mouth of Sauron's defense, Rage Filled Him's Peril keyword.
  assert.equal(original(BG.mouth).defense, 4);
  assert.equal(card(BG.mouth).defense, 5);
  assert.deepEqual(
    [
      card(BG.mouth).engagement,
      card(BG.mouth).threat,
      card(BG.mouth).attack,
      card(BG.mouth).health,
    ],
    [99, 4, 6, 11],
  );
  assert.equal(original(BG.rage).traits, "Peril.");
  assert.equal(card(BG.rage).traits, "");
  assert.match(
    card(BG.rage).text!,
    /^Peril\.\nWhen Revealed: The Mouth of Sauron/,
  );
  // Warrior of Rhûn, Waste of Dagorlad and Jaws of Steel as printed.
  assert.equal(original(BG.warrior).name, "Warrior of Rhun");
  assert.equal(card(BG.warrior).name, "Warrior of Rhûn");
  assert.match(original(BG.waste).text!, /treat the text box of each ally/);
  assert.match(card(BG.waste).text!, /treat the printed text box of each ally/);
  assert.match(original(BG.jaws).text!, /^When Revealed: Each players assigns/);
  assert.match(
    card(BG.jaws).text!,
    /^When Revealed: Each player assigns X damage/,
  );
  // The Black Gate: no quest points; Towers of the Teeth: threat X.
  assert.deepEqual(card(BG.gate).printed_stats, { threat: "0", quest: "—" });
  assert.equal(card(BG.gate).quest, null);
  assert.deepEqual(card(BG.towers).printed_stats, { threat: "X", quest: "8" });
  // Gwaihir and the Fellowship Aragorn.
  assert.equal(card(BG.gwaihir).type_code, "objective-ally");
  assert.equal(card(BG.gwaihir).sphere_code, "boon");
  assert.deepEqual(
    [
      card(BG.gwaihir).willpower,
      card(BG.gwaihir).attack,
      card(BG.gwaihir).defense,
      card(BG.gwaihir).health,
    ],
    [3, 3, 3, 5],
  );
  assert.equal(card(BG.gwaihir).shadow, "Shadow: This attack deals no damage.");
  const aragorn = card(MOUNTAIN_FIRE_ARAGORN);
  assert.equal(aragorn.sphere_code, "fellowship");
  assert.equal(aragorn.traits, "Dúnedain. Gondor. Noble. Warrior.");
  assert.deepEqual(
    [
      aragorn.threat,
      aragorn.willpower,
      aragorn.attack,
      aragorn.defense,
      aragorn.health,
    ],
    [0, 2, 3, 2, 5],
  );
  assert.equal(
    aragorn.text,
    "Sentinel. The first player gains control of Aragorn.\nAction: Spend 1 resource from Aragorn's pool to ready him. (Limit once per phase.)\nIf Aragorn leaves play, the players lose the game.",
  );
  // Every new card shows its local scan.
  for (const c of [...BLACK_GATE_ENCOUNTERS, ...BLACK_GATE_QUESTS])
    assert.ok(
      art.some((a) => a.localPath === c.imagesrc),
      `${c.name} uses a pinned scan`,
    );
  for (const c of [...BLACK_GATE_ENCOUNTERS, ...BLACK_GATE_QUESTS])
    assert.ok(
      !`${c.text ?? ""}${c.back_text ?? ""}`.includes("  "),
      `${c.name} has no double space`,
    );
});
