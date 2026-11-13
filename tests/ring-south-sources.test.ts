import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  RING_SOUTH_ENCOUNTERS,
  RING_SOUTH_QUESTS,
  RING_SOUTH_RECIPES,
  RS,
} from "../src/game/ring-south-support";
import {
  ROAD_DARKENS_FRODO,
  ROAD_DARKENS_ONE_RING,
} from "../src/game/lotr-saga-codes";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/the-ring-goes-south-import.json";
import art from "./ring-south-art.json";
import quantities from "./ring-south-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const count = (mode: string, code: string) =>
  RING_SOUTH_RECIPES.find((r) => r.mode === mode)!
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);

test("The Ring Goes South keeps Hall of Beorn's quantities and pins an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 22);
  assert.equal(snapshot.artwork.length, 26);
  assert.deepEqual(
    [
      ...RING_SOUTH_ENCOUNTERS.map((c) => c.code),
      ...RING_SOUTH_QUESTS.map((c) => c.code),
      ROAD_DARKENS_FRODO,
      ROAD_DARKENS_ONE_RING,
    ].sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  const standard = RING_SOUTH_RECIPES.find((r) => r.mode === "standard")!;
  assert.deepEqual(
    standard,
    snapshot.recipes.find((r) => r.mode === "standard"),
  );
  for (const row of quantities) {
    assert.equal(count("standard", row.code), row.normal, `${row.name} normal`);
    assert.equal(count("easy", row.code), row.easy, `${row.name} easy`);
  }
  // Hall of Beorn: 33 and 26 encounter cards without the campaign card, plus
  // 4 quest cards, Lust for the Ring, Frodo Baggins and The One Ring.
  assert.equal(
    quantities.reduce((n, r) => n + r.normal, 0),
    33 + 4 + 3,
  );
  assert.equal(
    quantities.reduce((n, r) => n + r.easy, 0),
    26 + 4 + 3,
  );
  // Stage 1A sets Lust for the Ring aside in easy mode too; the catalog's
  // easy recipe omits it.
  const easy = snapshot.recipes.find((r) => r.mode === "easy")!;
  assert.ok(!easy.cards.some((c) => c.code === RS.lust));
  assert.equal(count("easy", RS.lust), 1);
  assert.equal(
    hash("src/data/pending/the-ring-goes-south-import.json"),
    "2d0a620ddeaf95e542d0a3822b957855004973cbe71e37354ffe5516f25987aa",
  );
});

test("All 26 faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 26);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.deepEqual(
    RING_SOUTH_QUESTS.map((q) => [q.name, q.back_quest ?? null]),
    [
      ["The Council of Elrond", null],
      ["The Nine Walkers", 8],
      ["The Hunt is Up!", 12],
      ["The Gates of Moria", null],
    ],
  );
  assert.match(
    card(RS.council).back_text!,
    /1 faceup card to be played for 0 cost/,
  );
  assert.match(original(RS.council).back_text!, /to player for 0 cost/);
  assert.match(card(RS.watcher).text!, /^Indestructible\./);
  assert.match(original(RS.watcher).text!, /^Idestructible/);
  assert.match(card(RS.howling).shadow!, /destroys a character/);
  assert.doesNotMatch(card(RS.lust).text!, /<b>|<i>/);
  for (const c of [...RING_SOUTH_ENCOUNTERS, ...RING_SOUTH_QUESTS]) {
    assert.doesNotMatch(c.text ?? "", /  |\s$/, `${c.name}: tidy text`);
    assert.doesNotMatch(c.back_text ?? "", /  |\s$/, `${c.name}: tidy text`);
  }
  // Statistics from the scans.
  assert.deepEqual(
    [RS.watcher, RS.chief, RS.hound, RS.howling, RS.crebain].map((code) => {
      const c = card(code);
      return [c.engagement, c.threat, c.attack, c.defense, c.health];
    }),
    [
      [50, 5, 6, 5, 12],
      [30, 4, 5, 3, 6],
      [50, 1, 4, 1, 3],
      [38, 2, 3, 2, 4],
      [28, 3, 1, 1, 2],
    ],
  );
  assert.deepEqual(
    [RS.pass, RS.doors, RS.hill, RS.hollin, RS.foothills, RS.eregion].map(
      (code) => {
        const c = card(code);
        return [c.threat ?? null, c.quest, c.victory ?? null, !!c.is_unique];
      },
    ),
    [
      [4, 6, 1, true],
      [1, 9, null, true],
      [3, 6, null, false],
      [2, 4, null, false],
      [4, 5, null, false],
      [3, 4, null, false],
    ],
  );
  const frodo = card(ROAD_DARKENS_FRODO);
  assert.deepEqual(
    [
      frodo.sphere_code,
      frodo.threat,
      frodo.willpower,
      frodo.attack,
      frodo.defense,
      frodo.health,
    ],
    ["fellowship", 0, 2, 1, 2, 2],
  );
  assert.match(
    frodo.text!,
    /^Response: After Frodo Baggins exhausts to defend an attack/,
  );
});
