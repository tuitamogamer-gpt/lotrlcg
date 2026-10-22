import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import crypto from "node:crypto";
import source from "../src/data/pending/the-fate-of-wilderland-import.json";
import {
  FATE_WILDERLAND as F,
  FATE_WILDERLAND_ENCOUNTERS,
  FATE_WILDERLAND_QUESTS,
  FATE_WILDERLAND_RECIPES,
} from "../src/game/fate-wilderland-support";
import { card, SCRIPTED } from "../src/game/cards";

test("Fate original immutable import retains its omissions while runtime follows all native faces", () => {
  assert.equal(source.cards.length, 23);
  assert.equal(source.artwork.length, 26);
  assert.equal(FATE_WILDERLAND_ENCOUNTERS.length, 13);
  assert.equal(FATE_WILDERLAND_QUESTS.length, 3);
  for (const [code, victory] of [
    [F.urdug, 5],
    [F.gate, 1],
    [F.watchtower, 2],
  ] as const) {
    assert.equal(source.cards.find((c) => c.code === code)!.victory, undefined);
    assert.equal(card(code).victory, victory);
  }
  assert.equal(card(F.assault).traits, "Assault.");
  assert.equal(card(F.defense).traits, "Defense.");
  for (const q of FATE_WILDERLAND_QUESTS) assert.equal(q.back_quest, 0);
  for (const code of [F.gate, F.watchtower, F.battlements, F.rider])
    assert.equal(card(code).shadow, undefined);
  for (const c of source.cards) assert.ok(SCRIPTED.has(c.code), c.name);
  for (const code of [
    F.troop,
    F.stray,
    F.wargs,
    F.hills,
    F.lonely,
    F.gloom,
    F.bats,
  ])
    assert.ok(
      !FATE_WILDERLAND_ENCOUNTERS.some((c) => c.code === code),
      `shared ${card(code).name} keeps its existing canonical definition`,
    );
});
test("Fate normal/easy recipes match the original source exactly, including all setup cards", () => {
  assert.deepEqual(FATE_WILDERLAND_RECIPES, source.recipes);
  for (const recipe of FATE_WILDERLAND_RECIPES) {
    assert.equal(
      recipe.cards
        .filter((r) => r.section === "sharedEncounterDeck")
        .reduce((n, r) => n + r.quantity, 0),
      recipe.mode === "easy" ? 30 : 43,
    );
    assert.equal(
      recipe.cards
        .filter((r) => r.section === "sharedStagingArea")
        .reduce((n, r) => n + r.quantity, 0),
      3,
    );
    assert.equal(
      recipe.cards
        .filter((r) => r.section === "sharedQuestDeck")
        .reduce((n, r) => n + r.quantity, 0),
      3,
    );
  }
});
test("all26 Fate original faces are local, nonempty and match their immutable artwork hashes", () => {
  for (const art of source.artwork) {
    const bytes = fs.readFileSync(`public${art.localPath}`);
    assert.ok(bytes.length > 10000);
    assert.equal(
      crypto.createHash("sha256").update(bytes).digest("hex"),
      art.sha256,
    );
  }
});
