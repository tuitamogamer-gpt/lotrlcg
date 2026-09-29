import { test } from "node:test";
import assert from "node:assert/strict";
import { parseChoices } from "../src/account/choices";
const valid = {
  version: 1,
  setupMode: "hotseat",
  selectedDeck: "spirit",
  seatDecks: ["spirit", "lore"],
  playMode: "campaign",
  scenario: "anduin",
};
test("account choices restore only supported setups and isolate returned arrays", () => {
  const restored = parseChoices(valid)!;
  assert.deepEqual(restored, valid);
  restored.seatDecks.push("tactics");
  assert.equal(valid.seatDecks.length, 2);
});
test("custom deck references are accepted, bare or malformed custom ids are not", () => {
  assert.ok(parseChoices({ ...valid, selectedDeck: "custom:deck-1" }));
  assert.ok(parseChoices({ ...valid, seatDecks: ["custom:a", "lore"] }));
  assert.equal(parseChoices({ ...valid, selectedDeck: "custom:" }), null);
  assert.equal(parseChoices({ ...valid, selectedDeck: "custom:a b" }), null);
});
test("invalid, oversized, future, duplicate-hero and unknown-card choices are rejected", () => {
  for (const value of [
    null,
    [],
    42,
    { ...valid, version: 2 },
    { ...valid, setupMode: "online" },
    { ...valid, seatDecks: [] },
    { ...valid, seatDecks: ["lore", "lore"] },
    {
      ...valid,
      seatDecks: ["leadership", "tactics", "spirit", "lore", "lore"],
    },
    { ...valid, seatDecks: ["custom"] },
    { ...valid, selectedDeck: "custom" },
    { ...valid, scenario: "unknown" },
    { ...valid, playMode: "unknown" },
  ])
    assert.equal(parseChoices(value), null);
});
