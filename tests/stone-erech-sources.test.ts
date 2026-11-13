import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  SE,
  STONE_ERECH_ENCOUNTERS,
  STONE_ERECH_QUESTS,
  STONE_ERECH_RECIPES,
} from "../src/game/stone-erech-support";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/the-stone-of-erech-import.json";
import art from "./stone-erech-art.json";
import quantities from "./stone-erech-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;

test("The Stone of Erech keeps Hall of Beorn's quantities and pins an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 27);
  assert.equal(snapshot.artwork.length, 30);
  assert.deepEqual(
    [...STONE_ERECH_ENCOUNTERS, ...STONE_ERECH_QUESTS]
      .map((c) => c.code)
      .sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  // A standalone scenario: one recipe, used in normal and easy mode.
  assert.equal(STONE_ERECH_RECIPES.length, 1);
  assert.deepEqual(STONE_ERECH_RECIPES[0], snapshot.recipes[0]);
  for (const row of quantities)
    assert.equal(
      STONE_ERECH_RECIPES[0].cards
        .filter((c) => c.code === row.code)
        .reduce((n, c) => n + c.quantity, 0),
      row.normal,
      row.name,
    );
  // Hall of Beorn: 45 encounter cards in each mode, plus 3 quest cards.
  assert.equal(
    quantities.reduce((n, r) => n + r.normal, 0),
    45 + 3,
  );
  assert.deepEqual(
    quantities.map((r) => r.normal),
    quantities.map((r) => r.easy),
  );
  assert.equal(
    hash("src/data/pending/the-stone-of-erech-import.json"),
    "6c5997cc6ed72d796871f3814fd026309f18f88b9294423f6b0783066b20b944",
  );
});

test("All 30 faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 30);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.deepEqual(
    STONE_ERECH_QUESTS.map((q) => [q.name, q.back_quest ?? null]),
    [
      ["The Disappearance", 6],
      ["Terror of the Dead", 8],
      ["The Shadow Host", 14],
    ],
  );
  // 3B prints "Midnight. Battle.", which the catalog omits.
  assert.match(
    card(SE.host).back_text!,
    /^Midnight\. Battle\. \(Characters use their \[attack\] instead of \[willpower\] when questing\.\)\n/,
  );
  assert.doesNotMatch(original(SE.host).back_text!, /Battle/);
  assert.deepEqual(
    [SE.derufin].map((code) => {
      const c = card(code);
      return [c.willpower, c.attack, c.defense, c.health];
    }),
    [[3, 1, 1, 2]],
  );
  assert.match(
    card(SE.captain).text!,
    /Midnight\. Shadow Host Captain gets \+2/,
  );
  assert.match(original(SE.captain).text!, /gains \+2/);
  assert.match(card(SE.murmurs).text!, /All characters get -1/);
  assert.match(card(SE.lord).text!, /\(except for Traits\.\)$/);
  for (const c of [...STONE_ERECH_ENCOUNTERS, ...STONE_ERECH_QUESTS]) {
    assert.doesNotMatch(c.text ?? "", /  |\s$/, `${c.name}: tidy text`);
    assert.doesNotMatch(c.back_text ?? "", /  |\s$/, `${c.name}: tidy text`);
  }
  // Statistics from the scans.
  assert.deepEqual(
    [
      SE.whisperer,
      SE.restless,
      SE.shadowMan,
      SE.captain,
      SE.shade,
      SE.lord,
    ].map((code) => {
      const c = card(code);
      return [c.engagement, c.threat, c.attack, c.defense, c.health];
    }),
    [
      [35, 2, 2, 2, 4],
      [12, 2, 3, 0, 2],
      [27, 2, 4, 1, 5],
      [42, 3, 4, 1, 6],
      [23, 1, 2, 1, 3],
      [30, 5, 6, 3, 9],
    ],
  );
  assert.deepEqual(
    [
      SE.neck,
      SE.stone,
      SE.banks,
      SE.graves,
      SE.dwimorberg,
      SE.haunted,
      SE.vale,
    ].map((code) => {
      const c = card(code);
      return [c.threat ?? null, c.quest, c.victory ?? null, !!c.is_unique];
    }),
    [
      [3, 6, 1, true],
      [null, 6, 5, true],
      [2, 7, null, false],
      [4, 1, null, false],
      [1, 4, null, false],
      [2, 3, null, false],
      [1, 3, null, false],
    ],
  );
  assert.equal(card(SE.derufin).type_code, "objective-ally");
});
