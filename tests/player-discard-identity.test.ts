import assert from "node:assert/strict";
import test from "node:test";
import { applyAction as act } from "./pass-resource-window.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { STARTERS } from "../src/game/cards.ts";
import { make, fx } from "../src/game/core.ts";
import { takePlayerDiscard } from "../src/game/board.ts";
import { playerAttack } from "../src/game/combat.ts";
import { flush } from "../src/game/effects.ts";
import { KHAZAD } from "../src/game/khazad-dum.ts";
import type { GameState, Unit } from "../src/game/types.ts";

function fixture() {
  const d = STARTERS.find((d) => d.id === "tactics")!;
  const s = act(createGame(1202, d.cards, d.heroes, d.id), { type: "KEEP" });
  Object.assign(s, {
    phase: "attack",
    hand: [],
    discard: [],
    staging: [],
    engaged: [],
    queue: [],
    choice: null,
  });
  s.heroes.forEach((h) => {
    h.resources = 10;
  });
  const copy = make(s, "04105");
  s.hand.push(copy);
  // The physical copy has already resolved once in this phase and was recovered.
  s.used.push(`phase:heavy-stroke:${copy.id}`);
  return { s, copy };
}

function recoverAndCheck(s: GameState, copy: Unit) {
  assert.ok(validateSave(s));
  const recovered = takePlayerDiscard(s, s.discard.indexOf("04105"));
  assert.equal(recovered.id, copy.id);
  assert.ok(s.used.includes(`phase:heavy-stroke:${recovered.id}`));
  s.hand.push(recovered);
  const restored = JSON.parse(JSON.stringify(s)) as GameState;
  assert.ok(validateSave(restored));
  const enemy = make(restored, "01082");
  restored.engaged.push(enemy);
  const gimli = restored.heroes.find((h) => h.code === "01004")!;
  gimli.tempAttack = 2;
  playerAttack(restored, enemy, [gimli.id]);
  flush(restored);
  assert.equal(enemy.damage, 1);
  assert.notEqual(restored.choice?.title, "Heavy Stroke · Dwarf combat damage");
  assert.ok(restored.hand.some((u) => u.id === copy.id));
  assert.ok(
    !restored.resolvingEvents?.some((event) => event.unit.id === copy.id),
  );
}

test("Daeron's Runes discards a recovered Heavy Stroke without resetting its physical phase limit", () => {
  let { s, copy } = fixture();
  s.heroes[0].attachments.push({
    id: "discard-identity-wisdom",
    code: "02034",
    exhausted: false,
  });
  s.deck = ["01013", "01014"];
  const runes = make(s, "04108");
  s.hand.push(runes);
  s = act(s, { type: "PLAY", id: runes.id });
  assert.equal(s.choice?.title, "Daeron's Runes · Discard one card");
  s = act(s, { type: "CHOOSE", id: copy.id });
  recoverAndCheck(s, copy);
});

test("the generic discard-a-hand-card effect retains Heavy Stroke's physical copy and limit", () => {
  const { s, copy } = fixture();
  s.queue = [fx("discardHandCard", { target: copy.id })];
  flush(s);
  assert.equal(s.hand.length, 0);
  recoverAndCheck(s, copy);
});

test("The Empty Well's deterministic one-card random discard retains Heavy Stroke's physical limit", () => {
  const { s, copy } = fixture();
  const well = make(s, KHAZAD.well);
  s.staging.push(well);
  s.queue = [fx("khazadWellDiscard", { target: well.id })];
  flush(s);
  assert.equal(well.resources, 1);
  assert.equal(s.hand.length, 0);
  recoverAndCheck(s, copy);
});

test("Eyes of the Forest bulk event discard retains Heavy Stroke's physical phase limit", () => {
  const { s, copy } = fixture();
  s.queue = [fx("placeEncounter", { code: "01079" })];
  flush(s);
  assert.equal(s.hand.length, 0);
  recoverAndCheck(s, copy);
});
