import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  ASH as W,
  ASH_ENCOUNTERS,
  ASH_QUESTS,
  ASH_RECIPES,
} from "../src/game/ash-mountains-support";
import { card, playerCards, SCRIPTED } from "../src/game/cards";
import snapshot from "../src/data/pending/under-the-ash-mountains-import.json";
import art from "./ash-mountains-art.json";
import quantities from "./ash-mountains-source-quantities.json";
import players from "../src/data/ash-mountains-player-cards.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
test("Ash Mountains exact independent normal/easy physical inventory and immutable preparation", () => {
  assert.equal(snapshot.cards.length, 21);
  assert.equal(snapshot.artwork.length, 23);
  for (const r of ASH_RECIPES) {
    const old = snapshot.recipes.find((x) => x.mode === r.mode)!;
    for (const row of r.cards)
      assert.equal(
        row.quantity,
        old.cards.find((c) => c.code === row.code && c.section === row.section)!
          .quantity + (row.code === W.wolf ? 1 : 0),
      );
  }
  assert.deepEqual(
    [...ASH_ENCOUNTERS, ...ASH_QUESTS].map((c) => c.code).sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  for (const r of ASH_RECIPES) {
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
      r.mode === "easy" ? 31 : 40,
    );
  }
  for (const [p, h] of [
    [
      "src/data/pending/under-the-ash-mountains-import.json",
      "39ede38ef996dfaf2ed884bd84ba7db7ab19325e5a1840231b6fe885745d5377",
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
test("All 34 original Ash Mountains faces are pinned and all 11 player designs are scripted", () => {
  assert.equal(art.length, 34);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.equal(players.length, 9);
  const pack = playerCards.filter((c) =>
    c.packs?.some((p) => p.pack_code === "UtAM"),
  );
  assert.equal(pack.length, 11);
  assert.ok(pack.every((c) => SCRIPTED.has(c.code)));
  assert.equal(
    pack.reduce(
      (n, c) =>
        n + (c.packs!.find((p) => p.pack_code === "UtAM")!.quantity ?? 0),
      0,
    ),
    29,
  );
  assert.equal(
    [...ASH_ENCOUNTERS, ...ASH_QUESTS]
      .filter((c) => c.pack_code === "UtAM")
      .reduce((n, c) => n + (c.quantity ?? 0), 0),
    31,
  );
});
test("Printed quest reverses, side quest victory and omitted shadows match the reviewed scans", () => {
  for (const q of ASH_QUESTS) {
    assert.equal(q.back_quest, 25);
    assert.ok(q.back_imagesrc);
    assert.match(q.back_text!, /Event cards cannot/i);
  }
  for (const c of [W.tunnels, W.haunt, W.darkness, W.lost])
    assert.equal(card(c).victory, 10);
  for (const c of [W.beast, W.wolf, W.spawn, W.supplies, W.reek, W.writhing])
    assert.ok(card(c).shadow);
  assert.match(card(W.tunnel).shadow!, /discard.*encounter/i);
  assert.equal(card(W.chasm).quantity, 3);
  assert.equal(card(W.orc).quantity, 2);
  assert.equal(card("22091").type_code, "contract");
});
