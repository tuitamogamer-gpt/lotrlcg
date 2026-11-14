import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  MD,
  MOUNT_DOOM_ENCOUNTERS,
  MOUNT_DOOM_QUESTS,
  MOUNT_DOOM_RECIPES,
} from "../src/game/mount-doom-support";
import { DEEP_SHADOWS } from "../src/game/deep-shadows-codes";
import {
  MOUNTAIN_FIRE_FRODO,
  MOUNTAIN_FIRE_ONE_RING,
} from "../src/game/lotr-saga-codes";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/mount-doom-import.json";
import art from "./mount-doom-art.json";
import quantities from "./mount-doom-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const count = (mode: string, code: string) =>
  MOUNT_DOOM_RECIPES.find((r) => r.mode === mode)!
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);
/** "5-7/36" → [5, 7, 36]. */
const range = (set: string) => {
  const [numbers, total] = set.split("/");
  const [first, last = first] = numbers.split("-");
  return [Number(first), Number(last), Number(total)];
};

test("Mount Doom keeps the catalog's recipes, the printed set numbers and an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 25);
  assert.equal(snapshot.artwork.length, 29);
  // The Deep Shadows set is defined once, with The Tower of Cirith Ungol.
  assert.deepEqual(
    [
      ...MOUNT_DOOM_ENCOUNTERS.map((c) => c.code),
      ...MOUNT_DOOM_QUESTS.map((c) => c.code),
      ...Object.values(DEEP_SHADOWS),
      MOUNTAIN_FIRE_FRODO,
      MOUNTAIN_FIRE_ONE_RING,
    ].sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  assert.deepEqual(MOUNT_DOOM_RECIPES.map((r) => r.id).sort(), [
    "E0B.18",
    "Q0B.18",
  ]);
  for (const recipe of snapshot.recipes)
    assert.deepEqual(
      MOUNT_DOOM_RECIPES.find((r) => r.id === recipe.id),
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
  // Every number of both sets, each physical copy once.
  for (const [set, size] of [
    ["Mount Doom", 36],
    ["Deep Shadows", 8],
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
      Array.from({ length: size }, (_, i) => i + 1),
      set,
    );
  }
  const deck = (mode: string) =>
    MOUNT_DOOM_RECIPES.find((r) => r.mode === mode)!
      .cards.filter((c) => c.section === "sharedEncounterDeck")
      .reduce((n, c) => n + c.quantity, 0);
  assert.equal(deck("standard"), 36);
  assert.equal(deck("easy"), 23);
  // The recipe's staging area holds Mount Doom, The Tower and one of each
  // location the players may search for; Brake of Thorns is active.
  assert.equal(
    quantities.reduce((n, r) => n + r.normal, 0),
    36 + 7 + 1,
  );
  assert.equal(count("standard", MOUNTAIN_FIRE_FRODO), 1);
  assert.equal(count("standard", MOUNTAIN_FIRE_ONE_RING), 1);
  assert.equal(
    hash("src/data/pending/mount-doom-import.json"),
    "503d72c1e3f4802938bb0b3ba6fe572dbf9ef570f39e452c7c04e0571bc8bc55",
  );
});

test("All 29 faces are pinned, the reviewed scans correct the catalog and give each card its Sauron's Eye icons", () => {
  assert.equal(art.length, 29);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  // Sauron's Eye icons in the lower left corner of the text box.
  const eyes = Object.fromEntries(
    [...MOUNT_DOOM_ENCOUNTERS, ...Object.values(DEEP_SHADOWS).map(card)].map(
      (c) => [c.name, c.sauron_eyes ?? 0],
    ),
  );
  assert.deepEqual(eyes, {
    "The Tower of Barad-dûr": 0,
    "Mount Doom": 0,
    "Orc-hold": 1,
    "Mordor Road": 1,
    "Plain of Gorgoroth": 0,
    "Brake of Thorns": 1,
    "Old Water-course": 0,
    Gollum: 0,
    "Ringwraith of Sauron": 2,
    "Orc Captain": 2,
    "Big Uruk": 1,
    "Little Snuffler": 1,
    "“Wicked Master!”": 3,
    "The Lidless Eye": 2,
    "Foul Fumes": 2,
    "Heavy and Tired": 1,
    "Drawn to the Ring": 0,
    "Deep Shadows": 0,
    "Evil Vigilance": 0,
  });
  // 1A: "Barad-dûr"; 2B and 4B have no quest points; 4B's last test.
  assert.match(original(MD.land).text!, /The Tower of Barad-dur/);
  assert.match(
    card(MD.land).text!,
    /The Tower of Barad-dûr to the staging area/,
  );
  assert.equal(card(MD.tower).name, "The Tower of Barad-dûr");
  assert.equal(card(MD.land).back_quest, 4);
  assert.equal(card(MD.road).back_quest, null);
  assert.equal(card(MD.gasp).back_quest, 20);
  assert.equal(card(MD.crack).back_quest, null);
  assert.match(original(MD.road).back_text!, /makes a fortitude test/);
  assert.match(card(MD.road).back_text!, /makes a Fortitude test/);
  assert.match(original(MD.crack).back_text!, /for himself/);
  assert.match(
    card(MD.crack).back_text!,
    /the Ring-bearer claims The One Ring and the players lose the game\. If the test is successful, the Ring-bearer completes the quest and the players win the game\.$/,
  );
  // Brake of Thorns' threat, Mount Doom's threat X.
  assert.equal(original(MD.brake).threat, 2);
  assert.equal(card(MD.brake).threat, 3);
  assert.match(card(MD.brake).text!, /add \[sauron\] to each Fortitude test/);
  assert.deepEqual(card(MD.doom).printed_stats, {
    threat: "X",
    quest: "9",
    victory: "9",
  });
  // Gollum's Forced effect, Heavy and Tired, Foul Fumes and The Lidless Eye.
  assert.match(original(MD.gollum).text!, /Forced: When Gollum is discarded/);
  assert.match(card(MD.gollum).text!, /\*Forced: After Gollum is discarded/);
  assert.match(
    card(MD.heavy).text!,
    /^When Revealed: Attach Heavy and Tired to the hero/,
  );
  assert.match(original(MD.fumes).text!, /treat the text box/);
  assert.match(card(MD.fumes).text!, /treat the printed text box/);
  assert.equal(original(MD.eye).traits, "Peril.");
  assert.equal(card(MD.eye).traits, "");
  assert.match(
    card(MD.eye).text!,
    /^Peril\.\nWhen Revealed: Make a Fortitude test\. If The One Ring is exhausted, add \[sauron\]\[sauron\] to the test\./,
  );
  // Every new card shows its local scan.
  for (const c of [...MOUNT_DOOM_ENCOUNTERS, ...MOUNT_DOOM_QUESTS])
    assert.ok(
      art.some((a) => a.localPath === c.imagesrc),
      `${c.name} uses a pinned scan`,
    );
  for (const c of [...MOUNT_DOOM_ENCOUNTERS, ...MOUNT_DOOM_QUESTS])
    assert.ok(
      !`${c.text ?? ""}${c.back_text ?? ""}`.includes("  "),
      `${c.name} has no double space`,
    );
});
