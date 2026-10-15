import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, createGame, restoreSave } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { fx, make } from "../src/game/core";
import { revealed } from "../src/game/board";
import { handle } from "../src/game/effects";
import { UMBAR } from "../src/game/escape-umbar-support";
import { MORDOR } from "../src/game/long-arm-mordor-support";
import { mordorEncounter } from "../src/game/long-arm-mordor";
import { DESERT_CROSSING } from "../src/game/desert-crossing-support";
import {
  HARAD_SCENARIOS,
  haradSimulationChoice,
} from "./harad-simulation-policy";
import type { HaradScenario } from "./harad-simulation-policy";
import type { GameState } from "../src/game/types";
import {
  assertHaradSaveRestoration,
  haradSimulationObserver,
} from "./harad-simulation-invariants";

function initial(scenarioId: HaradScenario, players = 1, easy = false) {
  const d = STARTERS[0];
  return createGame(11, d.cards, d.heroes, d.id, {
    scenarioId,
    easy,
    seats: STARTERS.slice(0, players).map((p) => ({
      heroes: p.heroes,
      deckId: p.id,
    })),
  });
}
function take(s: GameState, code: string) {
  const index = s.encounterDeck.indexOf(code);
  assert.ok(index >= 0, "fixture moves an original physical encounter card");
  return s.encounterDeck.splice(index, 1)[0];
}
function restore(s: GameState) {
  const saved = JSON.parse(JSON.stringify(s)),
    restored = restoreSave(saved);
  assert.ok(restored);
  assertHaradSaveRestoration(saved, restored);
  return restored;
}

test("Harad conservation starts from all original standard/easy recipes for every player count", () => {
  for (const scenario of HARAD_SCENARIOS)
    for (const players of [1, 2, 3, 4])
      for (const easy of [false, true])
        haradSimulationObserver().observe(
          restore(initial(scenario, players, easy)),
        );
});

test("Harad conservation follows a saved pending reveal and rejects a missing physical card despite its review reference", () => {
  let s = initial("escape-from-umbar");
  s.phase = "staging";
  s.flow = { mode: "all", nextId: 1, pending: null, history: [] };
  revealed(s, take(s, UMBAR.archer));
  assert.equal(s.queue[0].kind, "resolveReveal");
  assert.ok(s.flow.pending);
  haradSimulationObserver().observe(restore(s));
  const missing = structuredClone(s);
  missing.queue = missing.queue.filter((e) => e.kind !== "resolveReveal");
  assert.ok(missing.flow!.pending!.cards.some((c) => c.code === UMBAR.archer));
  assert.throws(
    () => haradSimulationObserver().observe(missing),
    /conserves every original encounter/,
  );
  for (let step = 0; !s.staging.some((u) => u.code === UMBAR.archer); step++) {
    assert.ok(step < 10 && s.flow?.pending);
    s = restore(
      applyAction(s, { type: "CONTINUE", stepId: s.flow.pending.id }),
    );
    haradSimulationObserver().observe(s);
  }
});

test("Harad conservation never counts a reference to an already placed encounter as a second physical copy", () => {
  const s = initial("escape-from-umbar"),
    enemy = make(s, take(s, UMBAR.archer));
  s.staging.push(enemy);
  s.queue.push(
    fx("afterEncounterRevealed", {
      code: enemy.code,
      revealOrigin: "encounter",
    }),
  );
  haradSimulationObserver().observe(restore(s));
});

test("Harad conservation includes Mirage held during its discard-pile shuffle", () => {
  const s = initial("desert-crossing");
  s.phase = "staging";
  s.desertCrossing!.resolving.push(take(s, DESERT_CROSSING.mirage));
  s.queue.push(fx("desertMirage"), fx("desertFinishMirage"));
  haradSimulationObserver().observe(restore(s));
  s.desertCrossing!.resolving = [];
  assert.throws(
    () => haradSimulationObserver().observe(s),
    /conserves every original encounter/,
  );
});

test("Harad conservation includes enemies physically held under Narrow Alleyway", () => {
  const s = initial("escape-from-umbar"),
    alley = make(s, take(s, UMBAR.alley));
  const enemy = make(s, take(s, UMBAR.archer));
  s.staging.push(alley);
  s.umbar!.underAlley.push({ locationId: alley.id, enemies: [enemy] });
  haradSimulationObserver().observe(restore(s));
  s.umbar!.underAlley[0].enemies = [];
  assert.throws(
    () => haradSimulationObserver().observe(s),
    /conserves every original encounter/,
  );
});

test("Harad conservation follows actual hero capture and rejects a lost captured original hero", () => {
  let s = initial("the-long-arm-of-mordor");
  const observer = haradSimulationObserver();
  for (let step = 0; !s.mordor!.initialized; step++) {
    assert.ok(step < 30);
    s = restore(
      applyAction(
        s,
        s.choice
          ? { type: "CHOOSE", id: haradSimulationChoice(s)!.id }
          : { type: "KEEP" },
      ),
    );
    observer.observe(s);
  }
  assert.equal(s.mordor!.captured.length, 3);
  assert.ok(observer.counts().capturedObservations > 0);
  s.mordor!.captured.pop();
  assert.throws(
    () => observer.observe(s),
    /conserves all original player heroes/,
  );
});

test("Harad conservation includes current and suspended immediate-attack shadow cards", () => {
  const s = initial("escape-from-umbar");
  s.phase = "defense";
  const enemy = make(s, take(s, UMBAR.archer));
  enemy.owner = 0;
  enemy.shadows = [take(s, UMBAR.injured)];
  s.engaged.push(enemy);
  s.encounterDeck.unshift(take(s, UMBAR.enfeebled));
  handle(s, fx("immediateAttack", { target: enemy.id, player: 0 }));
  s.encounterDeck.unshift(take(s, UMBAR.pursuit));
  handle(s, fx("immediateAttack", { target: enemy.id, player: 0 }));
  assert.deepEqual(s.combat!.immediatePreviousShadows, [UMBAR.enfeebled]);
  assert.deepEqual(s.suspendedCombats[0].immediatePreviousShadows, [
    UMBAR.injured,
  ]);
  haradSimulationObserver().observe(restore(s));
  s.suspendedCombats[0].immediatePreviousShadows = [];
  assert.throws(
    () => haradSimulationObserver().observe(s),
    /conserves every original encounter/,
  );
});

test("Harad conservation includes Overgrown while its physical attachment target is being chosen", () => {
  let s = initial("the-long-arm-of-mordor");
  s.phase = "staging";
  const location = make(s, take(s, MORDOR.hut));
  s.staging.push(location);
  mordorEncounter(s, take(s, MORDOR.overgrown));
  haradSimulationObserver().observe(restore(s));
  handle(s, s.queue.shift()!);
  assert.ok(s.choice);
  assert.ok(
    s.choice.options.some((o) =>
      o.effects.some((e) => e.kind === "mordorOvergrownAttach"),
    ),
  );
  haradSimulationObserver().observe(restore(s));
  s = applyAction(s, { type: "CHOOSE", id: s.choice.options[0].id });
  assert.ok(
    s.staging
      .find((u) => u.id === location.id)!
      .attachments.some((a) => a.code === MORDOR.overgrown),
  );
  haradSimulationObserver().observe(restore(s));
});
