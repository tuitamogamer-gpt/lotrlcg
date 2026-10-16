import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, createGame, restoreSave } from "../src/game/engine";
import { STARTERS, card } from "../src/game/cards";
import { fx, make } from "../src/game/core";
import { revealed } from "../src/game/board";
import { syncAttachmentText } from "../src/game/attachment-text";
import { handle } from "../src/game/effects";
import { MUMAKIL as M, MUMAKIL_CAPTURES } from "../src/game/mumakil-support";
import { mumakilEncounter } from "../src/game/mumakil";
import { MORDOR } from "../src/game/long-arm-mordor-support";
import { mordorEncounter } from "../src/game/long-arm-mordor";
import type { GameState } from "../src/game/types";
import {
  assertMumakilSaveRestoration,
  mumakilSimulationObserver,
} from "./mumakil-simulation-invariants";

function initial(players = 1, easy = false) {
  const d = STARTERS[0];
  return createGame(11, d.cards, d.heroes, d.id, {
    scenarioId: "the-mumakil",
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
  assertMumakilSaveRestoration(saved, restored);
  return restored;
}

test("Mûmakil conservation starts from all original standard/easy recipes for every player count", () => {
  for (const players of [1, 2, 3, 4])
    for (const easy of [false, true])
      mumakilSimulationObserver().observe(restore(initial(players, easy)));
});

test("Mûmakil conservation follows actual reviewed revelation and rejects a missing card despite its history reference", () => {
  let s = initial();
  s.phase = "staging";
  s.flow = { mode: "all", nextId: 1, pending: null, history: [] };
  revealed(s, take(s, M.ape));
  assert.equal(s.queue[0].kind, "resolveReveal");
  assert.ok(s.flow.pending);
  const observer = mumakilSimulationObserver();
  observer.observe(restore(s));
  const missing = structuredClone(s);
  missing.queue = missing.queue.filter((e) => e.kind !== "resolveReveal");
  assert.ok(missing.flow!.pending!.cards.some((c) => c.code === M.ape));
  assert.throws(
    () => observer.observe(missing),
    /conserves every original encounter/,
  );
  for (let step = 0; !s.staging.some((u) => u.code === M.ape); step++) {
    assert.ok(step < 10 && s.flow?.pending);
    s = restore(
      applyAction(s, { type: "CONTINUE", stepId: s.flow.pending.id }),
    );
    observer.observe(s);
  }
});

test("Mûmakil conservation follows native treachery cancellation choices and both physical outcomes", () => {
  const d = STARTERS.find((d) => d.id === "spirit")!;
  for (const outcome of ["resolve", "cancel"]) {
    let s = createGame(1, d.cards, d.heroes, d.id, {
      scenarioId: "the-mumakil",
    });
    s.phase = "staging";
    s.heroes.forEach((h) => (h.resources = 1));
    if (!s.hand.some((u) => u.code === "01050")) {
      const index = s.deck.indexOf("01050");
      assert.ok(index >= 0);
      s.hand.push(make(s, s.deck.splice(index, 1)[0]));
    }
    revealed(s, take(s, M.insects));
    assert.equal(s.choice?.title, `Revealed: ${card(M.insects).name}`);
    assert.ok(s.choice.options.some((o) => o.id === "cancel"));
    const observer = mumakilSimulationObserver();
    observer.observe(restore(s));
    const missing = structuredClone(s);
    missing.choice = null;
    assert.throws(
      () => observer.observe(missing),
      /conserves every original encounter/,
    );
    s.flow = { mode: "all", nextId: 1, pending: null, history: [] };
    s = restore(applyAction(restore(s), { type: "CHOOSE", id: outcome }));
    observer.observe(s);
    for (let step = 0; s.choice || s.flow?.pending; step++) {
      assert.ok(step < 100, "treachery resolution and cancellation finish");
      s = restore(
        applyAction(
          s,
          s.flow?.pending
            ? { type: "CONTINUE", stepId: s.flow.pending.id }
            : { type: "CHOOSE", id: s.choice!.options[0].id },
        ),
      );
      observer.observe(s);
    }
    assert.ok(s.encounterDiscard.includes(M.insects));
    if (outcome === "cancel") assert.ok(s.discard.includes("01050"));
  }
});

test("Mûmakil nested active event continuations own one physical card and cancellation alternatives own no second copy", () => {
  const s = initial();
  s.phase = "staging";
  const code = take(s, M.insects),
    placement = fx("placeEncounter", { code, text: "revealed", flag: true });
  s.queue.push(
    fx("eventPlay", {
      code: "01050",
      effects: [fx("afterPlayerAbility", { effects: [placement] })],
      cancelledEffects: [{ ...placement, flag: false }],
    }),
  );
  const observer = mumakilSimulationObserver();
  observer.observe(restore(s));
  const missing = structuredClone(s);
  missing.queue[0].effects = [];
  assert.throws(
    () => observer.observe(missing),
    /conserves every original encounter/,
  );
});

test("Mûmakil conservation never counts an already placed encounter reference as a second copy", () => {
  const s = initial(),
    enemy = make(s, take(s, M.ape));
  s.staging.push(enemy);
  s.queue.push(
    fx("afterEncounterRevealed", {
      code: enemy.code,
      revealOrigin: "encounter",
    }),
  );
  mumakilSimulationObserver().observe(restore(s));
});

test("Mûmakil conservation follows physical Wild Mûmak and Capture objectives from set-aside through attachment and victory", () => {
  const s = initial(),
    q = s.mumakil!,
    observer = mumakilSimulationObserver();
  const wild = q.setAside.splice(
    q.setAside.findIndex((u) => u.code === M.wild),
    1,
  )[0];
  const objective = q.setAside.splice(
    q.setAside.findIndex((u) => MUMAKIL_CAPTURES.includes(u.code)),
    1,
  )[0];
  assert.ok(wild && objective);
  s.staging.push(wild);
  wild.attachments.push({
    id: objective.id,
    code: objective.code,
    exhausted: false,
  });
  syncAttachmentText(s);
  observer.observe(restore(s));
  const missing = structuredClone(s);
  missing.staging.find((u) => u.id === wild.id)!.attachments = [];
  assert.throws(
    () => observer.observe(missing),
    /conserves every original encounter/,
  );
  s.staging = s.staging.filter((u) => u.id !== wild.id);
  (s.victoryCards ??= []).push(wild.code, objective.code);
  observer.observe(restore(s));
  assert.ok(observer.counts().capturedObservations > 0);
});

test("Mûmakil conservation follows an encounter enemy converted to a physical Condition attachment", () => {
  const s = initial(),
    python = make(s, take(s, M.python));
  s.heroes[0].attachments.push({
    id: python.id,
    code: python.code,
    exhausted: false,
  });
  const observer = mumakilSimulationObserver();
  observer.observe(restore(s));
  assert.ok(observer.counts().attachmentObservations > 0);
  s.heroes[0].attachments.pop();
  assert.throws(
    () => observer.observe(s),
    /conserves every original encounter/,
  );
});

test("Mûmakil conservation includes current and suspended immediate-attack shadow cards", () => {
  const s = initial();
  s.phase = "defense";
  const enemy = make(s, take(s, M.ape));
  enemy.owner = 0;
  enemy.shadows = [take(s, M.fever)];
  s.engaged.push(enemy);
  s.encounterDeck.unshift(take(s, M.insects));
  handle(s, fx("immediateAttack", { target: enemy.id, player: 0 }));
  s.encounterDeck.unshift(take(s, M.centipede));
  handle(s, fx("immediateAttack", { target: enemy.id, player: 0 }));
  assert.deepEqual(s.combat!.immediatePreviousShadows, [M.insects]);
  assert.deepEqual(s.suspendedCombats[0].immediatePreviousShadows, [M.fever]);
  const observer = mumakilSimulationObserver();
  observer.observe(restore(s));
  s.suspendedCombats[0].immediatePreviousShadows = [];
  assert.throws(
    () => observer.observe(s),
    /conserves every original encounter/,
  );
});

test("Mûmakil conservation includes shared Jungle Forest Overgrown while its attachment is being chosen", () => {
  let s = initial();
  s.phase = "staging";
  const location = make(s, take(s, M.trail));
  s.staging.push(location);
  mordorEncounter(s, take(s, MORDOR.overgrown));
  const observer = mumakilSimulationObserver();
  observer.observe(restore(s));
  handle(s, s.queue.shift()!);
  assert.ok(s.choice);
  observer.observe(restore(s));
  s = applyAction(s, { type: "CHOOSE", id: s.choice.options[0].id });
  assert.ok(
    s.staging
      .find((u) => u.id === location.id)!
      .attachments.some((a) => a.code === MORDOR.overgrown),
  );
  observer.observe(restore(s));
});

test("Mûmakil conservation includes Terrible Fever held during the native hero attachment choice", () => {
  let s = initial();
  s.phase = "staging";
  s.heroes[0].committed = true;
  s.committedIds.push(s.heroes[0].id);
  mumakilEncounter(s, take(s, M.fever));
  const observer = mumakilSimulationObserver();
  observer.observe(restore(s));
  handle(s, s.queue.shift()!);
  assert.ok(s.choice);
  assert.ok(
    s.choice.options.some((o) =>
      o.effects.some((e) => e.kind === "mumakilFeverAttach"),
    ),
  );
  observer.observe(restore(s));
  const missing = structuredClone(s);
  missing.choice = null;
  assert.throws(
    () => observer.observe(missing),
    /conserves every original encounter/,
  );
  s = restore(applyAction(s, { type: "CHOOSE", id: s.choice.options[0].id }));
  assert.ok(
    s.heroes.some((h) => h.attachments.some((a) => a.code === M.fever)),
  );
  observer.observe(s);
});
