import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  LAND_SORROW_ENCOUNTERS,
  LAND_SORROW_QUESTS,
  LAND_SORROW_RECIPES,
  SORROW as S,
} from "../src/game/land-sorrow-support";
import { RIVER_RUNNING_ENCOUNTERS } from "../src/game/river-running-support";
import { card, playerCards, SCRIPTED } from "../src/game/cards";
import snapshot from "../src/data/pending/the-land-of-sorrow-import.json";
import art from "./land-sorrow-art.json";
import quantities from "./land-sorrow-source-quantities.json";
import players from "../src/data/land-sorrow-player-cards.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
test("The Land of Sorrow keeps the exact normal/easy inventory and an immutable preparation snapshot", () => {
  assert.equal(snapshot.cards.length, 28);
  assert.equal(snapshot.artwork.length, 30);
  assert.deepEqual(LAND_SORROW_RECIPES, snapshot.recipes);
  const shared = new Set(RIVER_RUNNING_ENCOUNTERS.map((c) => c.code));
  assert.deepEqual(
    [...LAND_SORROW_ENCOUNTERS, ...LAND_SORROW_QUESTS]
      .map((c) => c.code)
      .concat(
        snapshot.cards.filter((c) => shared.has(c.code)).map((c) => c.code),
      )
      .sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  for (const r of LAND_SORROW_RECIPES) {
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
      r.mode === "easy" ? 40 : 53,
    );
  }
  for (const [p, h] of [
    [
      "src/data/pending/the-land-of-sorrow-import.json",
      "db63e32640f0caa625e8ce0b0dd723f2ef15da77d926ed141161439ee8e49b38",
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
test("All 42 original Land of Sorrow faces are pinned and all 11 player designs are scripted", () => {
  assert.equal(art.length, 42);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.equal(players.length, 11);
  const pack = playerCards.filter((c) =>
    c.packs?.some((p) => (typeof p === "string" ? p : p.pack_code) === "TLoS"),
  );
  assert.equal(pack.length, 11);
  assert.ok(pack.every((c) => SCRIPTED.has(c.code)));
  assert.equal(
    pack.reduce(
      (n, c) =>
        n +
        ((
          c.packs!.find(
            (p) => typeof p !== "string" && p.pack_code === "TLoS",
          ) as { quantity?: number }
        ).quantity ?? 0),
      0,
    ),
    29,
  );
  assert.equal(
    [...LAND_SORROW_ENCOUNTERS, ...LAND_SORROW_QUESTS].reduce(
      (n, c) => n + (c.quantity ?? 0),
      0,
    ),
    31,
  );
});
test("Reviewed scans restore omitted shadows, Farin's printed statistics and both quest reverses", () => {
  for (const q of LAND_SORROW_QUESTS) {
    assert.ok(q.back_imagesrc);
    assert.ok(q.back_text);
  }
  assert.equal(LAND_SORROW_QUESTS[0].back_quest, 15);
  assert.equal(LAND_SORROW_QUESTS[1].back_quest, 10);
  assert.match(
    LAND_SORROW_QUESTS[1].back_text!,
    /\+10 quest points per player/,
  );
  for (const c of [S.guard, S.slaver, S.cruelty, S.broken])
    assert.ok(card(c).shadow, card(c).name);
  assert.match(card(S.guard).shadow!, /cannot ready/);
  assert.match(card(S.broken).shadow!, /Warden/);
  const farin = card(S.farin);
  assert.deepEqual(
    [farin.willpower, farin.attack, farin.defense, farin.health],
    [1, 3, 0, 4],
  );
  for (const c of [
    S.barracks,
    S.quarters,
    S.storehouse,
    S.ulwarth,
    S.lorgan,
    S.borlach,
  ])
    assert.equal(card(c).victory, 1);
  assert.equal(card("22134").type_code, "contract");
  assert.ok(!/less that that/.test(card("22114").text!));
});
