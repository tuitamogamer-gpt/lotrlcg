import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  CIRITH_UNGOL_ENCOUNTERS,
  CIRITH_UNGOL_QUESTS,
  CIRITH_UNGOL_RECIPES,
  CU,
} from "../src/game/cirith-ungol-support";
import {
  MOUNTAIN_FIRE_FRODO,
  MOUNTAIN_FIRE_ONE_RING,
} from "../src/game/lotr-saga-codes";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/the-tower-of-cirith-ungol-import.json";
import art from "./cirith-ungol-art.json";
import quantities from "./cirith-ungol-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const count = (mode: string, code: string) =>
  CIRITH_UNGOL_RECIPES.find((r) => r.mode === mode)!
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);
/** "5-7/24" → [5, 7, 24]. */
const range = (set: string) => {
  const [numbers, total] = set.split("/");
  const [first, last = first] = numbers.split("-");
  return [Number(first), Number(last), Number(total)];
};

test("The Tower of Cirith Ungol keeps the catalog's recipes, the printed set numbers and an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 22);
  assert.equal(snapshot.artwork.length, 26);
  // The Two Watchers' enemy side is a separate face of the same physical card.
  assert.deepEqual(
    [
      ...CIRITH_UNGOL_ENCOUNTERS.filter((c) => c.code !== CU.watchersEnemy).map(
        (c) => c.code,
      ),
      ...CIRITH_UNGOL_QUESTS.map((c) => c.code),
      MOUNTAIN_FIRE_FRODO,
      MOUNTAIN_FIRE_ONE_RING,
    ].sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  assert.deepEqual(CIRITH_UNGOL_RECIPES.map((r) => r.id).sort(), [
    "E0B.16",
    "Q0B.16",
  ]);
  for (const recipe of snapshot.recipes)
    assert.deepEqual(
      CIRITH_UNGOL_RECIPES.find((r) => r.id === recipe.id),
      recipe,
    );
  for (const row of quantities) {
    assert.equal(count("standard", row.code), row.normal, `${row.name} normal`);
    assert.equal(count("easy", row.code), row.easy, `${row.name} easy`);
    assert.equal(card(row.code).encounter_set, row.encounterSet, row.name);
    // Each copy carries its own number; the double-sided Watchers carries two.
    const [first, last] = range(row.set);
    const faces = row.code === CU.twoWatchers ? 2 : 1;
    assert.equal(last - first + 1, row.normal * faces, `${row.name} numbers`);
    const [scan] = range(row.scan);
    assert.ok(first <= scan && scan <= last, `${row.name} scan ${row.scan}`);
  }
  // The three encounter sets are complete: 24, 9 and 8 numbers.
  for (const [set, size] of [
    ["The Tower of Cirith Ungol", 24],
    ["Orcs of Mordor", 9],
    ["Deep Shadows", 8],
  ] as const) {
    const rows = quantities
      .filter((r) => r.encounterSet === set)
      .map((r) => range(r.set))
      .sort((a, b) => a[0] - b[0]);
    let next = 1;
    for (const [first, last, total] of rows) {
      assert.equal(first, next, set);
      assert.equal(total, size, set);
      next = last + 1;
    }
    assert.equal(next, size + 1, set);
  }
  // Setup cards: The Two Watchers, Topmost Chamber and Last of the Company
  // start out of the deck, Shagrat is set aside; the deck holds the rest.
  const deck = (mode: string) =>
    CIRITH_UNGOL_RECIPES.find((r) => r.mode === mode)!
      .cards.filter((c) => c.section === "sharedEncounterDeck")
      .reduce((n, c) => n + c.quantity, 0);
  assert.equal(deck("standard"), 36);
  assert.equal(deck("easy"), 30);
  assert.equal(
    quantities.reduce((n, r) => n + r.normal, 0),
    36 + 4,
  );
  // Easy mode removes the gold-icon copies: Gorbag, 2 Echoing Passage, an Orc
  // of Mordor, a Drawn to the Ring and the Deep Shadows of the scan (5/8).
  assert.equal(count("easy", CU.gorbag), 0);
  assert.equal(count("easy", CU.passage), 1);
  assert.equal(count("easy", CU.deep), 1);
  assert.equal(
    hash("src/data/pending/the-tower-of-cirith-ungol-import.json"),
    "b0a348f883148fccc17dcaffbf9ce55d5260cf636490c14de905052f3e01f115",
  );
});

test("All 26 faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 26);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  // Topmost Chamber is unique.
  assert.equal(original(CU.chamber).is_unique, false);
  assert.equal(card(CU.chamber).is_unique, true);
  // Last of the Company chooses any enemy, not an Orc enemy.
  assert.match(original(CU.company).text!, /choose an Orc enemy/);
  assert.match(
    card(CU.company).text!,
    /^Attached hero gains the Ring-bearer trait and the \[fellowship\] sphere\.\nYou cannot lose control of the first player token\.\nAction: Exhaust The One Ring and raise your threat by 1 to choose an enemy\./,
  );
  // Orcish Howls damages each enemy in the staging area.
  assert.match(
    original(CU.howls).text!,
    /Deal 1 damage to each in the staging/,
  );
  assert.match(
    card(CU.howls).text!,
    /^When Revealed: Deal 1 damage to each enemy in the staging area\./,
  );
  // Deep Shadows: "or reveal an encounter card"; the 'either' clauses are lowercase.
  assert.match(original(CU.deep).text!, /or he reveals an encounter card/);
  assert.match(
    card(CU.deep).text!,
    /^Doomed 2\.\nWhen Revealed: Each player must choose: either discard your hand \(with at least 3 cards in it\), or reveal an encounter card\.$/,
  );
  assert.match(original(CU.drawn).text!, /choose: Either/);
  assert.match(card(CU.drawn).text!, /choose: either exhaust The One Ring/);
  assert.match(card(CU.vigilance).text!, /choose: either discard a questing/);
  // Gorbag's immediate attack and shadow as printed.
  assert.match(original(CU.gorbag).text!, /immediate attack against you\.$/);
  assert.match(
    card(CU.gorbag).text!,
    /^Cannot have attachments\.\nForced: After Gorbag engages you, it makes an immediate attack\.$/,
  );
  assert.equal(
    card(CU.gorbag).shadow,
    "Shadow: Attacking enemy makes an additional attack against you after this one.",
  );
  // Winding Stairs and Torch-lit Hall.
  assert.match(original(CU.stairs).text!, /Each player exhausts a character/);
  assert.match(
    card(CU.stairs).text!,
    /Travel: Each player must exhaust a character he controls to travel here\.$/,
  );
  assert.match(original(CU.hall).text!, /add the discarded enemy/);
  assert.match(
    card(CU.hall).text!,
    /add the just discarded enemy to the staging area\.$/,
  );
  // The Two Watchers: threat X and no quest points on the location side,
  // "cancel that damage" and its statistics on the enemy side.
  assert.equal(original(CU.twoWatchers).quest, 0);
  assert.deepEqual(card(CU.twoWatchers).printed_stats, {
    threat: "X",
    quest: "—",
  });
  assert.equal(card(CU.twoWatchers).quest, null);
  assert.match(original(CU.twoWatchers).back_text!, /cancel the damage/);
  assert.match(
    card(CU.watchersEnemy).text!,
    /cancel that damage and raise the defending player's threat by X instead/,
  );
  assert.deepEqual(
    [
      card(CU.watchersEnemy).engagement,
      card(CU.watchersEnemy).threat,
      card(CU.watchersEnemy).attack,
      card(CU.watchersEnemy).defense,
      card(CU.watchersEnemy).health,
      card(CU.watchersEnemy).victory,
    ],
    [50, 2, 5, 2, 4, 5],
  );
  assert.equal(
    card(CU.watchersEnemy).imagesrc,
    card(CU.twoWatchers).back_imagesrc,
  );
  // The One Ring of The Mountain of Fire drops the catalog's "Encounter Set:" prefix.
  assert.match(original(MOUNTAIN_FIRE_ONE_RING).text!, /^Encounter Set:/);
  assert.match(
    card(MOUNTAIN_FIRE_ONE_RING).text!,
    /^Setup: The first player claims The One Ring and attaches it to the Ring-bearer\./,
  );
  assert.equal(card(MOUNTAIN_FIRE_ONE_RING).traits, "Artifact. Item. Ring.");
  // Frodo Baggins: the Fellowship hero of The Mountain of Fire.
  const frodo = card(MOUNTAIN_FIRE_FRODO);
  assert.deepEqual(
    [frodo.threat, frodo.willpower, frodo.attack, frodo.defense, frodo.health],
    [0, 2, 1, 2, 2],
  );
  assert.equal(
    frodo.text,
    "Planning Action: Exhaust The One Ring to add 1 resource to a hero's pool.",
  );
  // The quest stages' quest points and the stage texts.
  assert.deepEqual(
    CIRITH_UNGOL_QUESTS.map((q) => q.back_quest),
    [0, 18, 12],
  );
  assert.match(
    card(CU.watchers).back_text!,
    /This stage cannot be defeated while The Two Watchers is in play\.$/,
  );
  assert.match(
    card(CU.escape).back_text!,
    /If this stage is defeated, the players win the game\.$/,
  );
  // Every new card shows its local scan.
  for (const c of [...CIRITH_UNGOL_ENCOUNTERS, ...CIRITH_UNGOL_QUESTS])
    assert.ok(
      art.some((a) => a.localPath === c.imagesrc),
      `${c.name} uses a pinned scan`,
    );
  for (const c of [...CIRITH_UNGOL_ENCOUNTERS, ...CIRITH_UNGOL_QUESTS])
    assert.ok(
      !`${c.text ?? ""}${c.back_text ?? ""}`.includes("  "),
      `${c.name} has no double space`,
    );
});
