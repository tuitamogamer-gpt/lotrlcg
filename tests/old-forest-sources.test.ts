import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  OF,
  OF_STAGE_TWO,
  OLD_FOREST_ENCOUNTERS,
  OLD_FOREST_QUESTS,
  OLD_FOREST_RECIPES,
} from "../src/game/old-forest-support";
import { ONE_RING, SAGA_FRODO } from "../src/game/lotr-saga-codes";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/the-old-forest-import.json";
import art from "./old-forest-art.json";
import quantities from "./old-forest-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const count = (mode: string, code: string) =>
  OLD_FOREST_RECIPES.find((r) => r.mode === mode)!
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);

test("The Old Forest keeps Hall of Beorn's quantities and pins an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 24);
  assert.equal(snapshot.artwork.length, 30);
  // Frodo Baggins and The One Ring come from The Lord of the Rings Saga framework.
  assert.deepEqual(
    [
      ...OLD_FOREST_ENCOUNTERS.map((c) => c.code),
      ...OLD_FOREST_QUESTS.map((c) => c.code),
      SAGA_FRODO,
      ONE_RING,
    ].sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  const [standard, easy] = OLD_FOREST_RECIPES;
  assert.deepEqual(standard, snapshot.recipes[0]);
  assert.equal(easy.mode, "easy");
  for (const row of quantities) {
    assert.equal(count("standard", row.code), row.normal, `${row.name} normal`);
    assert.equal(count("easy", row.code), row.easy, `${row.name} easy`);
  }
  // Hall of Beorn: 40 and 33 encounter cards without the campaign card, plus
  // 6 quest cards, Frodo Baggins and The One Ring.
  assert.equal(
    quantities.reduce((n, r) => n + r.normal, 0),
    40 + 6 + 2,
  );
  assert.equal(
    quantities.reduce((n, r) => n + r.easy, 0),
    33 + 6 + 2,
  );
  assert.equal(
    hash("src/data/pending/the-old-forest-import.json"),
    "6a8286a0021e4af418aa8fb645a93382c605b2d7340b725f95404570e7d45ef7",
  );
});

test("All 30 faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 30);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  // The four stage 2A sides are the same printed face.
  const fronts = art.filter(
    (a) => OF_STAGE_TWO.includes(a.code) && a.face === "front",
  );
  assert.equal(fronts.length, 4);
  assert.equal(new Set(fronts.map((a) => a.sha256)).size, 1);
  assert.deepEqual(
    OLD_FOREST_QUESTS.map((q) => [q.name, q.back_name, q.back_quest ?? null]),
    [
      ["Farewell to the Shire", "Farewell to the Shire", 0],
      ["The Living Forest", "Dark Bad Place", null],
      ["The Living Forest", "Choked with Brambles", null],
      ["The Living Forest", "Shifting Trees", null],
      ["The Living Forest", "Closing in Around Them", null],
      ["The Wicked Willow", "The Wicked Willow", 18],
    ],
  );
  assert.equal(
    card(OF.farewell).back_text,
    "When Revealed: Each player draws 1 card. Advance to a random stage 2A.",
  );
  assert.match(
    card(OF.dark).back_text!,
    /^Forced: At the end of the planning phase, each player must exhaust a hero he controls\.\n/,
  );
  assert.match(original(OF.dark).back_text!, /much exhaust/);
  assert.match(card(OF.dark).back_text!, /different random stage 2A\./);
  assert.match(original(OF.dark).back_text!, /stagfe/);
  assert.match(
    card(OF.branches).shadow!,
    /if the defending character is an ally\.\)$/,
  );
  assert.match(original(OF.branches).shadow!, /defending characters/);
  assert.match(card(OF.tom).text!, /Then, shuffle the encounter discard pile/);
  for (const c of [...OLD_FOREST_ENCOUNTERS, ...OLD_FOREST_QUESTS]) {
    assert.doesNotMatch(c.text ?? "", /  |\s$/, `${c.name}: tidy text`);
    assert.doesNotMatch(c.back_text ?? "", /  |\s$/, `${c.name}: tidy text`);
  }
  // Statistics from the scans.
  assert.deepEqual(
    [OF.willow, OF.trailer, OF.root, OF.flies].map((code) => {
      const c = card(code);
      return [c.engagement, c.threat, c.attack, c.defense, c.health];
    }),
    [
      [50, 3, 5, 4, 12],
      [40, 2, 4, 2, 6],
      [30, 3, 3, 3, 5],
      [20, 1, 1, 0, 2],
    ],
  );
  assert.deepEqual(
    [
      OF.withywindle,
      OF.misleading,
      OF.gulley,
      OF.strange,
      OF.wall,
      OF.oppressive,
    ].map((code) => {
      const c = card(code);
      return [c.threat ?? null, c.quest, c.victory ?? null, !!c.is_unique];
    }),
    [
      [1, 5, 3, true],
      [1, 2, null, false],
      [2, 4, 2, false],
      [3, 3, 1, false],
      // Wall of Trees prints X threat and Victory X.
      [null, 4, null, false],
      [2, 5, 2, false],
    ],
  );
  assert.deepEqual(original(OF.wall).printed_stats, {
    threat: "X",
    quest: "4",
    victory: "X",
  });
  const tom = card(OF.tom);
  assert.deepEqual(
    [tom.willpower, tom.attack, tom.defense, tom.health, tom.type_code],
    [3, 3, 3, 6, "objective-ally"],
  );
});
