import test from "node:test";
import assert from "node:assert/strict";
import {
  isScriptedCard,
  searchCards,
  validateCatalog,
} from "../src/game/catalog";
import { SCRIPTED } from "../src/game/cards";

const imported = {
  code: "imported-example",
  name: "Dúnedain Ranger",
  type_code: "ally",
  sphere_code: "lore",
  pack_name: "The Lost Realm",
  encounter_set: "Angmar Orcs",
  text: "<b>Response:</b> After an enemy engages you...",
};

test("importing reference definitions never enables their abilities", () => {
  assert.equal(validateCatalog([imported])[0].code, imported.code);
  assert.equal(SCRIPTED.has(imported.code), false);
});

test("catalog validation rejects failed, malformed and duplicate snapshots", () => {
  for (const value of [
    null,
    {},
    [],
    [imported, imported],
    [{ ...imported, code: null }],
  ])
    assert.throws(() => validateCatalog(value));
});

test("archive search finds product, encounter set and rules text", () => {
  for (const query of [
    "lost realm",
    "angmar orcs",
    "response",
    "enemy engages",
  ])
    assert.equal(searchCards([imported], query).length, 1);
  assert.equal(searchCards([imported], "unpublished").length, 0);
});

test("reference indicators recognize implemented quest stages and campaign aliases", () => {
  assert.equal(
    isScriptedCard({ ...imported, type_code: "quest", code: "01119" }),
    true,
  );
  assert.equal(
    isScriptedCard({ ...imported, code: "01134", engine_code: "rc134" }),
    true,
  );
  assert.equal(
    isScriptedCard({
      ...imported,
      type_code: "quest",
      code: "octgn:nightmare-quest",
    }),
    false,
  );
  assert.equal(SCRIPTED.has("01119"), false);
});
