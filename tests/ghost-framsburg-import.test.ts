import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  GHOST_FRAMSBURG as G,
  GHOST_FRAMSBURG_ENCOUNTERS,
  GHOST_FRAMSBURG_QUESTS,
  GHOST_FRAMSBURG_RECIPES,
} from "../src/game/ghost-framsburg-support";
import { card } from "../src/game/cards";
const bundle = JSON.parse(
  fs.readFileSync(
    "src/data/pending/the-ghost-of-framsburg-import.json",
    "utf8",
  ),
);
test("Ghost original inventory keeps all23 identities and26 independently hashed original faces", () => {
  assert.equal(bundle.cards.length, 23);
  assert.equal(bundle.artwork.length, 26);
  assert.equal(GHOST_FRAMSBURG_QUESTS.length, 3);
  assert.equal(GHOST_FRAMSBURG_ENCOUNTERS.length, 15);
  for (const a of bundle.artwork) {
    const data = fs.readFileSync(`public${a.localPath}`);
    assert.equal(data.length, a.bytes);
    assert.equal(
      crypto.createHash("sha256").update(data).digest("hex"),
      a.sha256,
    );
  }
});
test("Ghost runtime differs from frozen recipe only by independently checked easy Crypt Stalker copy", () => {
  for (const runtime of GHOST_FRAMSBURG_RECIPES) {
    const raw = bundle.recipes.find((r: { id: string }) => r.id === runtime.id);
    assert.ok(raw);
    for (const row of runtime.cards) {
      const original = raw.cards.find(
        (c: { code: string; section: string }) =>
          c.code === row.code && c.section === row.section,
      );
      assert.ok(original);
      assert.equal(
        row.quantity,
        original.quantity -
          (runtime.id === "E08.7" &&
          row.code === G.stalker &&
          row.section === "sharedEncounterDeck"
            ? 1
            : 0),
      );
    }
  }
});
test("Ghost printed scan corrections restore variable threat, victory, engagement and Moonlit shadow", () => {
  assert.equal(card(G.tomb).victory, 5);
  assert.equal(card(G.crypt).victory, 2);
  assert.equal(card(G.spectre).engagement, 35);
  assert.equal(card(G.stalker).printed_stats?.threat, "X");
  assert.equal(card(G.staircase).printed_stats?.threat, "X");
  assert.match(card(G.moonlit).shadow!, /Raise your threat by 1/);
  assert.match(card(G.hall).text!, /While Haunted Hall/);
  for (const code of [G.afraid, G.eyes, G.spider, G.bats, G.werewolf])
    assert.ok(
      !GHOST_FRAMSBURG_ENCOUNTERS.some((c) => c.code === code),
      "complete original Wilds definitions reused",
    );
});
