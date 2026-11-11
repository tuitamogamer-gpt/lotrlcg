import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  MASSING as M,
  MASSING_ENCOUNTERS,
  MASSING_QUESTS,
  MASSING_RECIPES,
  massingTrait,
} from "../src/game/massing-osgiliath-support";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/the-massing-at-osgiliath-import.json";
import art from "./massing-osgiliath-art.json";
import quantities from "./massing-osgiliath-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
test("The Massing at Osgiliath keeps its one standalone recipe and an immutable preparation snapshot", () => {
  assert.equal(snapshot.cards.length, 19);
  assert.equal(snapshot.artwork.length, 23);
  assert.deepEqual(MASSING_RECIPES, snapshot.recipes);
  assert.equal(MASSING_RECIPES.length, 1);
  assert.deepEqual(
    [...MASSING_ENCOUNTERS, ...MASSING_QUESTS].map((c) => c.code).sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  for (const row of quantities) {
    assert.equal(row.normal, row.easy, `${row.name}: no card is marked easy`);
    assert.equal(
      MASSING_RECIPES[0].cards
        .filter((c) => c.code === row.code)
        .reduce((n, c) => n + c.quantity, 0),
      row.normal,
      row.name,
    );
  }
  assert.equal(
    MASSING_RECIPES[0].cards.reduce((n, c) => n + c.quantity, 0),
    45,
    "41 encounter cards and four quest cards",
  );
  assert.equal(
    hash("src/data/pending/the-massing-at-osgiliath-import.json"),
    "4787b08c95f306fcd8e6876354d6f5ceeb8c041afbb1112cda0f9c21682df6b6",
  );
});
test("All 23 Massing at Osgiliath faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 23);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.match(card(M.ruins).text!, /have not crossed the Anduin/);
  assert.equal(card(M.ranger).willpower, 2);
  assert.ok(!/Scoutcards/.test(MASSING_QUESTS[0].text!));
  assert.deepEqual(
    MASSING_QUESTS.map((q) => q.back_quest),
    [7, 5, 1, 15],
  );
  assert.match(
    MASSING_QUESTS[3].back_text!,
    /When Revealed: Add The Witch-king/,
  );
  for (const c of [M.watchtower, M.pelennor])
    assert.ok(massingTrait(c, "West Bank"), card(c).name);
  for (const c of [M.overlook, M.morgulduin, M.ruins])
    assert.ok(massingTrait(c, "East Bank"), card(c).name);
  for (const c of [M.snaga, M.wolves, M.wainriders])
    assert.ok(massingTrait(c, "Scout"), card(c).name);
  assert.equal(card(M.pelennor).victory, 1);
  for (const c of [
    M.wolves,
    M.captain,
    M.uruk,
    M.watchtower,
    M.morgulduin,
    M.cutOff,
    M.ranger,
  ])
    assert.ok(card(c).shadow, card(c).name);
});
