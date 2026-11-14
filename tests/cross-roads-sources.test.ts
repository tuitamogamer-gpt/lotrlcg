import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  CROSS_ROADS_ENCOUNTERS,
  CROSS_ROADS_QUESTS,
  CROSS_ROADS_RECIPES,
  JTC,
} from "../src/game/cross-roads-support";
import {
  LAND_SHADOW_FRODO,
  LAND_SHADOW_ONE_RING,
} from "../src/game/lotr-saga-codes";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/journey-to-the-cross-roads-import.json";
import art from "./cross-roads-art.json";
import quantities from "./cross-roads-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const count = (mode: string, code: string) =>
  CROSS_ROADS_RECIPES.find((r) => r.mode === mode)!
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);
const section = (mode: string, name: string) =>
  CROSS_ROADS_RECIPES.find((r) => r.mode === mode)!
    .cards.filter((c) => c.section === name)
    .map((c) => c.code)
    .sort();

test("Journey to the Cross-roads keeps the catalog's recipes, Hall of Beorn's quantities, the printed set numbers and an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 19);
  assert.equal(snapshot.artwork.length, 20);
  assert.deepEqual(
    [
      ...CROSS_ROADS_ENCOUNTERS.map((c) => c.code),
      ...CROSS_ROADS_QUESTS.map((c) => c.code),
      LAND_SHADOW_FRODO,
      LAND_SHADOW_ONE_RING,
    ].sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  assert.deepEqual(CROSS_ROADS_RECIPES.map((r) => r.id).sort(), [
    "E0B.11",
    "Q0B.11",
  ]);
  for (const recipe of snapshot.recipes)
    assert.deepEqual(
      CROSS_ROADS_RECIPES.find((r) => r.id === recipe.id),
      recipe,
    );
  for (const row of quantities) {
    assert.equal(count("standard", row.code), row.normal, `${row.name} normal`);
    assert.equal(count("easy", row.code), row.easy, `${row.name} easy`);
  }
  // The Men of Harad set (3 Oliphaunts, 3 Haradrim Soldiers and 3 Haradrim
  // Archers, "7/9" on the Archer) starts facedown under The Cross-roads; The
  // Black Gate and The Cross-roads start in the staging area.
  for (const mode of ["standard", "easy"]) {
    assert.deepEqual(
      section(mode, "sharedEncounterDeck2"),
      [JTC.oliphaunt, JTC.soldier, JTC.archer].sort(),
    );
    assert.deepEqual(
      section(mode, "sharedStagingArea"),
      [JTC.blackGate, JTC.crossroads].sort(),
    );
  }
  // The scans' set numbers: 31 cards of Journey to the Cross-roads (The
  // Black Gate is "1/31") and 9 of the Men of Harad, plus the quest card,
  // Frodo and The One Ring. Hall of Beorn's 42 normal cards add the
  // campaign card and match every quantity, easy mode included.
  assert.equal(
    quantities.reduce((n, r) => n + r.normal, 0),
    31 + 9 + 1 + 2,
  );
  assert.equal(42 - 1, 31 + 9 + 1);
  assert.equal(
    quantities.reduce((n, r) => n + r.easy, 0),
    31 - 4 + 9 + 1 + 2,
  );
  for (const [code, normal, easy] of [
    [JTC.captain, 3, 2],
    [JTC.southward, 2, 1],
    [JTC.marching, 2, 1],
    [JTC.southrons, 2, 1],
    [JTC.henneth, 1, 1],
  ] as const) {
    assert.equal(count("standard", code), normal);
    assert.equal(count("easy", code), easy);
  }
  assert.equal(
    hash("src/data/pending/journey-to-the-cross-roads-import.json"),
    "2b9e61ff11aeef1db7ddb685a83d0ba6c95bf94ecf486c27ad47ca8010963f84",
  );
});

test("All 20 faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 20);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  // Names as printed.
  assert.equal(original(JTC.henneth).name, "Henneth Annun");
  assert.equal(card(JTC.henneth).name, "Henneth Annûn");
  assert.equal(original(JTC.foothills).name, "Foothills of Ephel Duath");
  assert.equal(card(JTC.foothills).name, "Foothills of Ephel Dúath");
  // The Cross-roads keeps its hyphen; the quest card's typos are corrected.
  assert.match(original(JTC.ambush).text!, /The Crossroads/);
  assert.match(original(JTC.ambush).text!, /location adds it/);
  assert.equal(
    card(JTC.ambush).text,
    "Setup: Add The Black Gate and The Cross-roads to the staging area. Shuffle the Men of Harad encounter set and place it facedown under The Cross-roads. Each player, except the first player, searches the encounter deck for a different non-unique location and adds it to the staging area. Shuffle the encounter deck.",
  );
  assert.match(original(JTC.ambush).back_text!, /top card facedown card/);
  assert.equal(
    card(JTC.ambush).back_text,
    "Forced: At the beginning of the quest phase, reveal the top facedown card from under The Cross-roads and add it to the staging area.\nThe players cannot defeat this stage while The Cross-roads is in play. When The Cross-roads is explored, the players win the game.",
  );
  assert.equal(card(JTC.ambush).back_quest, 20);
  // Printed traits: The Black Gate and The Dark Lord's Summons are Mordor.
  assert.equal(original(JTC.blackGate).traits, "");
  assert.equal(card(JTC.blackGate).traits, "Mordor.");
  assert.equal(original(JTC.summons).traits, "");
  assert.equal(card(JTC.summons).traits, "Mordor.");
  // Captain of Harad's -10 engagement cost; Marching Up the Road searches
  // the encounter deck only; Hills of Ithilien's shadow.
  assert.match(original(JTC.captain).text!, /and 10 engagement cost/);
  assert.match(card(JTC.captain).text!, /and -10 engagement cost/);
  assert.match(original(JTC.marching).text!, /encounter deck and discard pile/);
  assert.match(
    card(JTC.marching).text!,
    /search the encounter deck for a Harad enemy/,
  );
  assert.equal(
    card(JTC.hills).shadow,
    "Shadow: Discard a non-objective attachment you control.",
  );
  assert.match(
    card(JTC.southward).text!,
    /\nTravel: The first player reveals the top facedown card under The Cross-roads and adds it to the staging area to travel here\./,
  );
  assert.match(
    card(JTC.henneth).text!,
    /stage 1B and The Black Gate\.\nForced: After Henneth Annûn becomes the active location, return each engaged enemy to the staging area\./,
  );
  // Haradrim Archer's printed threat is X, the number of players.
  assert.equal(card(JTC.archer).threat ?? null, null);
  assert.match(
    card(JTC.archer).text!,
    /Archery X\. X is the number of players/,
  );
  // Every encounter card shows its local scan.
  for (const c of [...CROSS_ROADS_ENCOUNTERS, ...CROSS_ROADS_QUESTS])
    assert.ok(
      art.some((a) => a.localPath === c.imagesrc),
      `${c.name} uses a pinned scan`,
    );
  assert.ok(
    art.some(
      (a) =>
        a.code === JTC.ambush &&
        a.face === "back" &&
        a.localPath === card(JTC.ambush).back_imagesrc,
    ),
  );
});
