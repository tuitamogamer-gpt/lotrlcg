import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  WAINRIDERS as W,
  WAINRIDERS_ENCOUNTERS,
  WAINRIDERS_QUESTS,
  WAINRIDERS_RECIPES,
  racingResult,
} from "../src/game/wainriders-support";
import { card, playerCards, SCRIPTED } from "../src/game/cards";
import snapshot from "../src/data/pending/challenge-of-the-wainriders-import.json";
import art from "./wainriders-art.json";
import quantities from "./wainriders-source-quantities.json";
import players from "../src/data/wainriders-player-cards.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
test("Wainriders exact independent normal/easy physical inventory and immutable preparation", () => {
  assert.equal(snapshot.cards.length, 25);
  assert.equal(snapshot.artwork.length, 31);
  assert.deepEqual(WAINRIDERS_RECIPES, snapshot.recipes);
  assert.deepEqual(
    [...WAINRIDERS_ENCOUNTERS, ...WAINRIDERS_QUESTS].map((c) => c.code).sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  for (const r of WAINRIDERS_RECIPES) {
    for (const row of quantities)
      assert.equal(
        r.cards
          .filter((c) => c.code === row.code)
          .reduce((n, c) => n + c.quantity, 0),
        row[r.mode === "easy" ? "easy" : "normal"],
        row.name,
      );
    assert.equal(
      r.cards.reduce((n, c) => n + c.quantity, 0),
      r.mode === "easy" ? 38 : 48,
    );
  }
  for (const [p, h] of [
    [
      "src/data/pending/challenge-of-the-wainriders-import.json",
      "f774dbc82812224abb563cc6784f6152bf5ce7163c51b98bc81427e31c1f31ca",
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
    assert.equal(hash(p), h);
});
test("All 43 original Wainriders faces are pinned and all 11 player designs are scripted", () => {
  assert.equal(art.length, 43);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.equal(players.length, 9);
  const pack = playerCards.filter((c) =>
    c.packs?.some((p) => p.pack_code === "CotW"),
  );
  assert.equal(pack.length, 11);
  assert.ok(pack.every((c) => SCRIPTED.has(c.code)));
  assert.equal(
    pack.reduce(
      (n, c) =>
        n + (c.packs!.find((p) => p.pack_code === "CotW")!.quantity ?? 0),
      0,
    ),
    29,
  );
  assert.equal(
    [...WAINRIDERS_ENCOUNTERS, ...WAINRIDERS_QUESTS]
      .filter((c) => c.pack_code === "CotW")
      .reduce((n, c) => n + (c.quantity ?? 0), 0),
    31,
  );
});
test("Printed race results, quest reverses and omitted shadows are restored from scans", () => {
  assert.equal(racingResult(W.racer), "turn");
  assert.equal(racingResult(W.cunning), "wild");
  assert.equal(racingResult(W.ravine), "turn");
  for (const c of [W.driver, W.veteran, W.narrow, W.crowded, W.chariot])
    assert.equal(racingResult(c), "straight");
  assert.equal(racingResult(W.horse), undefined);
  for (const q of WAINRIDERS_QUESTS) {
    assert.match(
      q.back_text!,
      /Race\. This stage gets \+4 quest points per player/,
    );
    assert.ok(q.back_imagesrc);
    assert.equal(q.back_quest, 0);
  }
  assert.equal(card(W.arduous).quest, 6);
  assert.equal(card(W.champion).printed_stats?.defense, "X");
  for (const c of [W.driver, W.veteran, W.cunning]) assert.ok(card(c).shadow);
  assert.match(card("22074").back_text!, /choose two/i);
  assert.match(card("22074").text, /printed cost of 1/);
});
