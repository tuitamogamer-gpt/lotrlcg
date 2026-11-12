import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  KD,
  KNIFE_DARK_ENCOUNTERS,
  KNIFE_DARK_QUESTS,
  KNIFE_DARK_RECIPES,
} from "../src/game/knife-dark-support";
import { ONE_RING, SAGA_FRODO } from "../src/game/lotr-saga-codes";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/a-knife-in-the-dark-import.json";
import art from "./knife-dark-art.json";
import quantities from "./knife-dark-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;

test("A Knife in the Dark keeps Hall of Beorn's normal and easy quantities and pins an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 23);
  assert.equal(snapshot.artwork.length, 26);
  // Pathless Country, Piercing Cry and Lure of the Ring were imported with
  // A Shadow of the Past and are shared by both scenarios.
  assert.deepEqual(
    [...KNIFE_DARK_ENCOUNTERS, ...KNIFE_DARK_QUESTS]
      .map((c) => c.code)
      .concat(SAGA_FRODO, ONE_RING, KD.pathless, KD.cry, KD.lure)
      .sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  assert.deepEqual(
    KNIFE_DARK_RECIPES.find((r) => r.mode === "standard"),
    snapshot.recipes.find((r) => r.mode === "standard"),
  );
  // Easy mode keeps 2 of the 4 Ringwraiths; the catalog recipe kept all 4.
  const easy = KNIFE_DARK_RECIPES.find((r) => r.mode === "easy")!;
  const source = snapshot.recipes.find((r) => r.mode === "easy")!;
  assert.deepEqual(
    easy.cards.filter((c) => c.code !== KD.ringwraith),
    source.cards.filter((c) => c.code !== KD.ringwraith),
  );
  assert.equal(source.cards.find((c) => c.code === KD.ringwraith)!.quantity, 4);
  assert.equal(easy.cards.find((c) => c.code === KD.ringwraith)!.quantity, 2);
  for (const mode of ["standard", "easy"] as const) {
    const recipe = KNIFE_DARK_RECIPES.find((r) => r.mode === mode)!;
    for (const row of quantities)
      assert.equal(
        recipe.cards
          .filter((c) => c.code === row.code)
          .reduce((n, c) => n + c.quantity, 0),
        mode === "easy" ? row.easy : row.normal,
        `${row.name} (${mode})`,
      );
  }
  // Hall of Beorn: 44 and 31 encounter cards without the campaign card,
  // plus 3 quest cards, Frodo Baggins and The One Ring.
  assert.equal(
    quantities.reduce((n, r) => n + r.normal, 0),
    44 + 5,
  );
  assert.equal(
    quantities.reduce((n, r) => n + r.easy, 0),
    31 + 5,
  );
  assert.equal(
    hash("src/data/pending/a-knife-in-the-dark-import.json"),
    "013b95737fcd2efeb5a58d056ffeb547023619a217309cc8cbe407989d1de91e",
  );
});

test("All 26 faces are pinned and the reviewed scans correct the catalog's names, traits and text", () => {
  assert.equal(art.length, 26);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.deepEqual(
    KNIFE_DARK_QUESTS.map((q) => [q.name, q.back_quest ?? null]),
    [
      ["Trouble in Bree", 8],
      ["Into the Wild", 6],
      ["The Ringwraiths Attack", null],
    ],
  );
  // Printed names.
  assert.equal(card(KD.shady).name, "Shady Bree-lander");
  assert.equal(original(KD.shady).name, "Shady Bree-Lander");
  assert.equal(card(KD.squint).name, "Squint-eyed Southerner");
  assert.equal(original(KD.squint).name, "Squint-Eyed Southerner");
  assert.equal(card(KD.terror).name, "Power in their Terror");
  assert.equal(original(KD.terror).name, "Power In Their Terror");
  // Black Breath and Pale Blade are Morgul treacheries.
  for (const code of [KD.breath, KD.blade]) {
    assert.equal(card(code).traits, "Morgul.");
    assert.equal(original(code).traits, "");
  }
  assert.match(
    card(KD.shady).text!,
    /While The One Ring is exhausted, Shady Bree-lander gains/,
  );
  assert.match(card(KD.pony).text!, /After The Prancing Pony leaves play/);
  assert.match(
    card(KD.wild).back_text!,
    /Each player places 1 progress on the current quest\./,
  );
  for (const c of [...KNIFE_DARK_ENCOUNTERS, ...KNIFE_DARK_QUESTS]) {
    assert.doesNotMatch(c.text ?? "", /  /, `${c.name}: no double spaces`);
    assert.doesNotMatch(c.back_text ?? "", /  /, `${c.name}: no double spaces`);
  }
  // Statistics from the scans: engagement, threat, attack, defense, hit points.
  assert.deepEqual(
    [KD.ferny, KD.shady, KD.squint, KD.rider, KD.ringwraith, KD.witchKing].map(
      (code) => {
        const c = card(code);
        return [c.engagement, c.threat, c.attack, c.defense, c.health];
      },
    ),
    [
      [38, 3, 1, 3, 5],
      [28, 2, 3, 1, 4],
      [33, 2, 2, 2, 3],
      [35, 4, 4, 3, 5],
      [35, 3, 5, 4, 5],
      [45, 5, 6, 5, 9],
    ],
  );
  assert.deepEqual(
    [KD.pony, KD.weathertop, KD.midgewater, KD.hills, KD.chetwood].map(
      (code) => {
        const c = card(code);
        return [c.threat, c.quest, c.victory ?? null, !!c.is_unique];
      },
    ),
    [
      [2, 4, 1, true],
      [4, 4, 4, true],
      [3, 6, 1, true],
      [3, 2, null, false],
      [2, 2, null, false],
    ],
  );
  assert.equal(card(KD.ferny).victory, 1);
  for (const code of [KD.ferny, KD.witchKing])
    assert.equal(card(code).is_unique, true, card(code).name);
});
