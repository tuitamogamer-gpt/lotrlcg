import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, restoreSave } from "../src/game/engine";
import { fx, make } from "../src/game/core";
import { revealed } from "../src/game/board";
import { handle } from "../src/game/effects";
import { CITY as C } from "../src/game/city-support";
import { base, setStage } from "./city-fixtures";
import {
  assertCitySaveRestoration,
  citySimulationObserver,
} from "./city-simulation-invariants";
import type { GameState } from "../src/game/types";

function land() {
  const s = setStage(base(), 3);
  s.phase = "staging";
  return s;
}
function take(s: GameState, code: string) {
  const index = s.encounterDeck.indexOf(code);
  assert.ok(
    index >= 0,
    "the fixture moves an original physical encounter card",
  );
  return s.encounterDeck.splice(index, 1)[0];
}
function restore(s: GameState) {
  const saved = JSON.parse(JSON.stringify(s));
  const restored = restoreSave(saved);
  assert.ok(restored);
  assertCitySaveRestoration(saved, restored);
  return restored;
}
function pendingReveal() {
  const s = land();
  const raider = take(s, C.raider);
  s.flow = { mode: "all", nextId: 1, pending: null, history: [] };
  revealed(s, raider);
  assert.equal(s.queue[0].kind, "resolveReveal");
  assert.ok(s.flow.pending);
  return s;
}

test("City conservation follows a real saved reveal through its queued physical card and entry", () => {
  let s = pendingReveal();
  const observer = citySimulationObserver();
  observer.observe(restore(s));
  for (let step = 0; !s.staging.some((u) => u.code === C.raider); step++) {
    assert.ok(step < 10 && s.flow?.pending);
    s = restore(
      applyAction(s, { type: "CONTINUE", stepId: s.flow.pending.id }),
    );
    observer.observe(s);
  }
  assert.ok(s.staging.some((u) => u.code === C.raider));
});

test("City conservation rejects an actually missing reveal card despite its review reference", () => {
  const s = pendingReveal();
  s.queue = s.queue.filter((e) => e.kind !== "resolveReveal");
  assert.ok(s.flow!.pending!.cards.some((c) => c.code === C.raider));
  assert.throws(
    () => citySimulationObserver().observe(s),
    /conserve every original Corsair/,
  );
});

test("City conservation never counts an after-reveal reference as another physical enemy", () => {
  const s = land();
  const raider = make(s, take(s, C.raider));
  s.staging.push(raider);
  s.queue.push(
    fx("afterEncounterRevealed", {
      code: raider.code,
      revealOrigin: "encounter",
    }),
  );
  citySimulationObserver().observe(restore(s));
});

test("City conservation retains real current and suspended immediate-attack shadow cards", () => {
  let s = land();
  s.phase = "defense";
  const raider = make(s, take(s, C.raider));
  raider.owner = 0;
  raider.shadows = [take(s, C.slaver)];
  s.engaged.push(raider);
  s.encounterDeck.unshift(take(s, C.infiltrator));
  handle(s, fx("immediateAttack", { target: raider.id, player: 0 }));
  assert.deepEqual(s.combat!.immediatePreviousShadows, [C.slaver]);
  s.encounterDeck.unshift(take(s, C.leader));
  handle(s, fx("immediateAttack", { target: raider.id, player: 0 }));
  assert.deepEqual(s.combat!.immediatePreviousShadows, [C.infiltrator]);
  assert.deepEqual(s.suspendedCombats[0].immediatePreviousShadows, [C.slaver]);
  s = restore(s);
  citySimulationObserver().observe(s);
  s.combat!.immediatePreviousShadows = [];
  assert.throws(
    () => citySimulationObserver().observe(s),
    /conserve every original Corsair/,
  );
});
