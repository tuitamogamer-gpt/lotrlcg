import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  ULFAST as U,
  ULFAST_ENCOUNTERS,
  ULFAST_QUESTS,
  ULFAST_RECIPES,
} from "../src/game/ulfast-support";
import { card, playerCards } from "../src/game/cards";
import art from "./ulfast-art.json";
import quantities from "./ulfast-source-quantities.json";
import snapshot from "../src/data/pending/the-city-of-ulfast-import.json";
import players from "../src/data/ulfast-player-cards.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
test("Ulfast preserves its immutable original snapshot and exact standard/easy recipe quantities", () => {
  assert.equal(snapshot.cards.length, 24);
  assert.equal(snapshot.artwork.length, 28);
  assert.deepEqual(ULFAST_RECIPES, snapshot.recipes);
  assert.deepEqual(
    [...ULFAST_ENCOUNTERS, ...ULFAST_QUESTS].map((c) => c.code).sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  for (const recipe of ULFAST_RECIPES) {
    for (const row of quantities)
      assert.equal(
        recipe.cards
          .filter((c) => c.code === row.code)
          .reduce((n, c) => n + c.quantity, 0),
        row[recipe.mode === "easy" ? "easy" : "normal"],
        row.name,
      );
    assert.equal(
      recipe.cards.reduce((n, c) => n + c.quantity, 0),
      recipe.mode === "easy" ? 36 : 47,
    );
  }
  for (const [path, expected] of [
    [
      "src/data/pending/the-city-of-ulfast-import.json",
      "4ef061e09ee8363ddafd383b87019287f5f6659d0b8a1b41f9fcab5005f5cb94",
    ],
    [
      "public/catalog.json",
      "cc2f96ffac0b8baad068321c61d28bad2beffdb346e0d3ec486977714268ad63",
    ],
    [
      "public/scenarios.json",
      "00db2f76f970f201f0f7e14663c9f4c87212c1a80548a9d325d39656ea869b0f",
    ],
    [
      "src/data/official-player-cards.json",
      "9cf8bae3f97e63f9bf42b067f94645c2ec991a1a33692cbb4fe459087dc575cd",
    ],
  ])
    assert.equal(hash(path), expected, path);
});
test("Ulfast retains all 40 original faces with pinned bytes and five new player definitions", () => {
  assert.equal(art.length, 40);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.equal(players.length, 5);
  const pack = playerCards.filter((c) =>
    c.packs?.some((p) => p.pack_code === "TCoU"),
  );
  assert.equal(pack.length, 11);
  assert.equal(
    pack.reduce(
      (n, c) =>
        n + (c.packs!.find((p) => p.pack_code === "TCoU")!.quantity ?? 0),
      0,
    ),
    29,
  );
  assert.equal(
    [...ULFAST_ENCOUNTERS, ...ULFAST_QUESTS]
      .filter((c) => c.pack_code === "TCoU")
      .reduce((n, c) => n + (c.quantity ?? 0), 0),
    31,
  );
});
test("Ulfast printed quest reverses, variable statistics, six omitted shadows and separate contract faces are restored", () => {
  assert.deepEqual(
    ULFAST_QUESTS.map((c) => c.back_quest),
    [5, 10, 15, 20],
  );
  for (const q of ULFAST_QUESTS)
    assert.match(q.back_text!, /end of the round/i);
  assert.equal(card(U.guard).attack, 9);
  assert.equal(card(U.guard).printed_stats?.threat, "X");
  assert.equal(card(U.cat).quest, 10);
  assert.equal(card(U.cat).victory, 10);
  assert.match(card(U.cat).text, /When Cat and Mouse is defeated/);
  assert.match(card(U.vigil).text, /raise your threat by 1 to discard/i);
  for (const [c, pattern] of [
    [U.elite, /additional attack/],
    [U.agent, /each player/],
    [U.streets, /staging area/],
    [U.vigil, /attach/],
    [U.seen, /excess damage/],
    [U.patrol, /resource/],
  ] as const)
    assert.match(card(c).shadow!, pattern);
  assert.match(card(P_HUNTERS).text, /cannot include ally cards/);
  assert.doesNotMatch(
    card(P_HUNTERS).text,
    /each restricted attachment attached/,
  );
  assert.match(card(P_HUNTERS).back_text!, /heal 1 damage/);
  assert.equal(card(P_HUNTERS).back_imagesrc, "/cards/22049.B.jpg");
});
const P_HUNTERS = "22049";
