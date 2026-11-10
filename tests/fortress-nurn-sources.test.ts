import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  FORTRESS_NURN_ENCOUNTERS,
  FORTRESS_NURN_QUESTS,
  FORTRESS_NURN_RECIPES,
  NURN as N,
  NURN_BACKS,
  NURN_STORMS,
} from "../src/game/fortress-nurn-support";
import { TEMPLE_DOOM_ENCOUNTERS } from "../src/game/temple-doom-support";
import { DANGER_DORWINION_ENCOUNTERS } from "../src/game/danger-dorwinion-support";
import { card, playerCards, SCRIPTED } from "../src/game/cards";
import snapshot from "../src/data/pending/the-fortress-of-nurn-import.json";
import art from "./fortress-nurn-art.json";
import quantities from "./fortress-nurn-source-quantities.json";
import players from "../src/data/fortress-nurn-player-cards.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
test("The Fortress of Nurn keeps the exact normal/easy inventory and an immutable preparation snapshot", () => {
  assert.equal(snapshot.cards.length, 29);
  assert.equal(snapshot.artwork.length, 35);
  assert.deepEqual(FORTRESS_NURN_RECIPES, snapshot.recipes);
  const shared = new Set(
    [...TEMPLE_DOOM_ENCOUNTERS, ...DANGER_DORWINION_ENCOUNTERS].map(
      (c) => c.code,
    ),
  );
  assert.deepEqual(
    [...FORTRESS_NURN_ENCOUNTERS, ...FORTRESS_NURN_QUESTS]
      .filter((c) => !c.code.endsWith(":B"))
      .map((c) => c.code)
      .concat(
        snapshot.cards.filter((c) => shared.has(c.code)).map((c) => c.code),
      )
      .sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  for (const r of FORTRESS_NURN_RECIPES) {
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
      "src/data/pending/the-fortress-of-nurn-import.json",
      "5c560a819b859160877be8efdb96064594f816ad8d6f3173547c683610743d19",
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
test("All 43 Fortress of Nurn faces are pinned; the pack adds seven scripted designs beside three already supported", () => {
  assert.equal(art.length, 43);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.equal(players.length, 7);
  const pack = playerCards.filter((c) =>
    c.packs?.some((p) => (typeof p === "string" ? p : p.pack_code) === "TFoN"),
  );
  assert.equal(pack.length, 10);
  assert.ok(pack.every((c) => SCRIPTED.has(c.code)));
  assert.equal(
    pack.reduce(
      (n, c) =>
        n +
        ((
          c.packs!.find(
            (p) => typeof p !== "string" && p.pack_code === "TFoN",
          ) as { quantity?: number }
        ).quantity ?? 0),
      0,
    ),
    26,
    "29 player cards less the three copies of the unsupported Thorongil",
  );
  assert.equal(
    [...FORTRESS_NURN_ENCOUNTERS, ...FORTRESS_NURN_QUESTS].reduce(
      (n, c) => n + (c.quantity ?? 0),
      0,
    ),
    31,
  );
});
test("Reviewed scans restore the omitted shadows, the four Castle reverses and both quest faces", () => {
  for (const q of FORTRESS_NURN_QUESTS) {
    assert.ok(q.back_imagesrc);
    assert.ok(q.back_text);
  }
  assert.equal(FORTRESS_NURN_QUESTS[0].back_quest, 3);
  assert.equal(FORTRESS_NURN_QUESTS[1].back_quest, 12);
  for (const c of [N.soldier, N.mercenary, N.olog, N.dogs, N.defense, N.reach])
    assert.ok(card(c).shadow, card(c).name);
  assert.match(card(N.dogs).shadow!, /engaged with you/);
  assert.equal(NURN_STORMS.length, 4);
  assert.deepEqual(
    NURN_BACKS.map((c) => [card(c).name, card(c).quest, card(c).victory]),
    [
      ["Castle Garrison", 6, 10],
      ["Lethal Counterattack", 10, 10],
      ["No Quarter", 12, 10],
      ["Stronghold of Mordor", 8, 10],
    ],
  );
  for (const c of NURN_STORMS) {
    assert.equal(card(c).name, "Storm the Castle");
    assert.equal(card(c).back_name, undefined, "fronts never reveal reverses");
    assert.equal(card(c).victory, undefined);
  }
  assert.equal(card(N.dungeons).quest, 4);
  assert.equal(card(N.ulchor).victory, 6);
  assert.ok(
    !/ovewr|Added each|Than Ulchor|enemes/.test(
      JSON.stringify(FORTRESS_NURN_ENCOUNTERS),
    ),
  );
  assert.ok(!/Surge\.\nSurge\./.test(card(N.dogs).text!));
});
