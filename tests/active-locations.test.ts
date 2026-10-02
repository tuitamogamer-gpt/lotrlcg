import { applyAction } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { createGame, restoreSave } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { make, get, fx, prepend } from "../src/game/core";
import { progress, progressLocation } from "../src/game/board";
import { flush } from "../src/game/effects";
import { allActiveLocations, selectSeat } from "../src/game/table";
import { CARROCK } from "../src/game/carrock";
function table() {
  const d = STARTERS[0];
  let s = createGame(371, d.cards, d.heroes, d.id, {
    seats: [
      { heroes: d.heroes, deckId: d.id },
      { heroes: ["01004", "01005"], deckId: "tactics" },
    ],
  });
  while (s.phase === "setup") s = applyAction(s, { type: "KEEP" });
  s.phase = "staging";
  s.queue = [];
  s.choice = null;
  s.staging = [];
  s.encounterDeck = [];
  s.encounterDiscard = [];
  s.activeLocation = make(s, "01099");
  s.extraActiveLocations = [make(s, "01100")];
  return s;
}
test("Quest progress can be divided between two active buffers, with the first player's choice saved", () => {
  let s = table();
  s.table!.first = 1;
  selectSeat(s, 0);
  const a = s.activeLocation!,
    b = s.extraActiveLocations![0];
  progress(s, 3);
  assert.equal(s.table!.active, 1);
  assert.ok(restoreSave(JSON.parse(JSON.stringify(s))));
  s = applyAction(s, { type: "CHOOSE", id: `${b.id}:2` });
  s = applyAction(s, { type: "CHOOSE", id: `${a.id}:1` });
  assert.equal(get(s, a.id)!.progress, 1);
  assert.equal(get(s, b.id)!.progress, 2);
  assert.equal(s.progress, 0);
});
test("Overflow explores both buffers once and only the remaining progress reaches the quest", () => {
  const s = table();
  progress(s, 8);
  assert.equal(allActiveLocations(s).length, 0);
  assert.equal(s.progress, 1);
  assert.equal(s.encounterDiscard.filter((c) => c === "01099").length, 1);
  assert.equal(s.encounterDiscard.filter((c) => c === "01100").length, 1);
});
test("Exploring the primary active location promotes the other without losing its progress", () => {
  const s = table(),
    b = s.extraActiveLocations![0];
  b.progress = 1;
  progressLocation(s, s.activeLocation!, 3);
  assert.equal(s.activeLocation!.id, b.id);
  assert.equal(s.activeLocation!.progress, 1);
  assert.ok(restoreSave(JSON.parse(JSON.stringify(s))));
});
test("A singular active-location effect lets the first player target either location", () => {
  let s = table();
  const b = s.extraActiveLocations![0];
  prepend(
    s,
    fx("activeLocationEffect", { text: "locationProgress", value: 1 }),
  );
  flush(s);
  assert.equal(s.choice!.options.length, 2);
  s = applyAction(s, { type: "CHOOSE", id: b.id });
  assert.equal(get(s, b.id)!.progress, 1);
  assert.equal(s.activeLocation!.progress, 0);
});
test("Player progress can explore a normal buffer but cannot bypass an immune active location", () => {
  const s = table();
  s.activeLocation = make(s, CARROCK.carrock);
  progress(s, 5, true);
  assert.equal(allActiveLocations(s).length, 1);
  assert.equal(s.activeLocation!.code, CARROCK.carrock);
  assert.equal(s.activeLocation!.progress, 0);
  assert.equal(s.progress, 0);
});
test("A save rejects an extra active treachery or duplicate active instance", () => {
  const s = table();
  s.extraActiveLocations = [make(s, "01079")];
  assert.equal(restoreSave(JSON.parse(JSON.stringify(s))), null);
  s.extraActiveLocations = [s.activeLocation!];
  assert.equal(restoreSave(JSON.parse(JSON.stringify(s))), null);
});
