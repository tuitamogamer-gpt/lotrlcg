import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  SHELOB_LAIR_ENCOUNTERS,
  SHELOB_LAIR_QUESTS,
  SHELOB_LAIR_RECIPES,
  SL,
} from "../src/game/shelob-lair-support";
import {
  LAND_SHADOW_FRODO,
  LAND_SHADOW_ONE_RING,
} from "../src/game/lotr-saga-codes";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/shelob-s-lair-import.json";
import art from "./shelob-lair-art.json";
import quantities from "./shelob-lair-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const count = (mode: string, code: string) =>
  SHELOB_LAIR_RECIPES.find((r) => r.mode === mode)!
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);
const SHARED = [SL.gollum, SL.wraith, SL.call, SL.hates];

test("Shelob's Lair keeps the catalog's recipes, Hall of Beorn's normal quantities, the printed set numbers and an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 25);
  assert.equal(snapshot.artwork.length, 29);
  // Gollum, Morgul Wraith, Call of the Ring and We Hates Them! are shared
  // with The Passage of the Marshes.
  assert.deepEqual(
    [
      ...SHELOB_LAIR_ENCOUNTERS.map((c) => c.code),
      ...SHELOB_LAIR_QUESTS.map((c) => c.code),
      ...SHARED,
      LAND_SHADOW_FRODO,
      LAND_SHADOW_ONE_RING,
    ].sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  assert.deepEqual(SHELOB_LAIR_RECIPES.map((r) => r.id).sort(), [
    "E0B.12",
    "Q0B.12",
  ]);
  for (const recipe of snapshot.recipes)
    assert.deepEqual(
      SHELOB_LAIR_RECIPES.find((r) => r.id === recipe.id),
      recipe,
    );
  for (const row of quantities) {
    assert.equal(count("standard", row.code), row.normal, `${row.name} normal`);
    assert.equal(count("easy", row.code), row.easy, `${row.name} easy`);
  }
  // The scans' set numbers: 25 cards of Shelob's Lair (Shelob is "1/25")
  // and 10 of The Great Spider (Blocked Tunnel is "1/10"), with 3 of Gollum
  // and 4 of Morgul Nazgûl, plus 3 quest cards, Frodo and The One Ring.
  // Hall of Beorn's 44 normal encounter cards add a burden and the campaign
  // card.
  assert.equal(
    quantities.reduce((n, r) => n + r.normal, 0),
    25 + 10 + 3 + 4 + 3 + 2,
  );
  assert.equal(44 - 2, 25 + 10 + 3 + 4);
  // Easy: Hall of Beorn lists The Great Spider at 1, 1, 2 and 2 copies where
  // recipe E0B.12 keeps 2, 2, 3 and 3; the import follows the recipe.
  assert.equal(
    quantities.reduce((n, r) => n + r.easy, 0),
    40,
  );
  for (const code of [SL.tunnel, SL.poison, SL.malice, SL.rage])
    assert.equal(count("easy", code), count("standard", code));
  assert.equal(
    hash("src/data/pending/shelob-s-lair-import.json"),
    "273b092bc2187521b88ee9015bdf6312d3d063716878da56ba4ce7228bfb0bda",
  );
});

test("All 29 faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 29);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  // Names as printed.
  assert.equal(original(SL.cirithOrc).name, "Orc of Citith Ungol");
  assert.equal(card(SL.cirithOrc).name, "Orc of Cirith Ungol");
  assert.equal(original(SL.secretWay).name, "Smeagol's Secret Way");
  assert.equal(card(SL.secretWay).name, "Sméagol's Secret Way");
  // Sméagol's Secret Way is worth 2 victory points.
  assert.equal(original(SL.secretWay).victory ?? null, null);
  assert.equal(card(SL.secretWay).victory, 2);
  // The quest cards: Sméagol's accent, "Shuffle the encounter deck.", "both"
  // and the victory display.
  assert.doesNotMatch(original(SL.stairs).text!, /Shuffle the encounter deck/);
  assert.match(
    card(SL.stairs).text!,
    /Put Sméagol into play under the first player's control\. Make Morgul Vale the active location\. Add Sméagol's Secret Way to the staging area\. Shuffle the encounter deck\.$/,
  );
  assert.match(original(SL.betrayal).back_text!, /victor display/);
  assert.match(
    card(SL.betrayal).back_text!,
    /\nThe players cannot defeat this stage unless both Shelob and Gollum are in the victory display\. If the players defeat this stage, they win the game\.$/,
  );
  assert.equal(card(SL.pass).back_quest, 16);
  assert.equal(card(SL.betrayal).back_quest, 8);
  // The Spider's Lair's immediate attack; Rage and Hunger; Cleft of Cirith Ungol.
  assert.match(original(SL.spidersLair).text!, /Shelob makes an attack/);
  assert.match(
    card(SL.spidersLair).text!,
    /\nForced: After The Spider's Lair becomes the active location, Shelob makes an immediate attack against the first player\.$/,
  );
  assert.match(original(SL.rage).text!, /Then, she makes/);
  assert.match(
    card(SL.rage).text!,
    /until the end of the phase\. Shelob makes an immediate attack against each player, in player order\.$/,
  );
  assert.match(original(SL.cleft).text!, /While The Cleft/);
  assert.match(
    card(SL.cleft).text!,
    /\nWhile Cleft of Cirith Ungol is in the victory display/,
  );
  // Every new encounter card shows its local scan.
  for (const c of [...SHELOB_LAIR_ENCOUNTERS, ...SHELOB_LAIR_QUESTS])
    assert.ok(
      art.some((a) => a.localPath === c.imagesrc),
      `${c.name} uses a pinned scan`,
    );
  for (const c of [...SHELOB_LAIR_ENCOUNTERS, ...SHELOB_LAIR_QUESTS])
    assert.ok(
      !`${c.text ?? ""}${c.back_text ?? ""}`.includes("  "),
      `${c.name} has no double space`,
    );
});
