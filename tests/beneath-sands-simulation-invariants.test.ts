import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, createGame, restoreSave } from "../src/game/engine";
import { STARTERS, card } from "../src/game/cards";
import { fx, make } from "../src/game/core";
import { revealed } from "../src/game/board";
import { handle } from "../src/game/effects";
import { BENEATH_SANDS as B } from "../src/game/beneath-sands-support";
import {
  beneathSandsEncounter,
  beneathSandsEffect,
} from "../src/game/beneath-sands";
import type { GameState } from "../src/game/types";
import {
  assertBeneathSandsSaveRestoration,
  beneathSandsSimulationObserver,
} from "./beneath-sands-simulation-invariants";

function initial(players = 1, easy = false) {
  const deck = STARTERS[0];
  return createGame(11, deck.cards, deck.heroes, deck.id, {
    scenarioId: "beneath-the-sands",
    easy,
    seats: STARTERS.slice(0, players).map((p) => ({
      heroes: p.heroes,
      deckId: p.id,
    })),
  });
}
function take(s: GameState, predicate: (code: string) => boolean) {
  const index = s.encounterDeck.findIndex(predicate);
  assert.ok(index >= 0, "fixture moves an original physical encounter card");
  return s.encounterDeck.splice(index, 1)[0];
}
function restore(s: GameState) {
  const saved = JSON.parse(JSON.stringify(s)),
    restored = restoreSave(saved);
  assert.ok(restored);
  assertBeneathSandsSaveRestoration(saved, restored);
  return restored;
}

test("Sands conservation starts from both original recipes, all three physical quests and every player count", () => {
  for (const players of [1, 2, 3, 4])
    for (const easy of [false, true])
      beneathSandsSimulationObserver().observe(restore(initial(players, easy)));
});

test("Sands conservation follows a native reviewed enemy reveal and rejects a missing card despite its review reference", () => {
  let s = initial();
  s.phase = "staging";
  s.flow = { mode: "all", nextId: 1, pending: null, history: [] };
  const code = take(s, (c) => card(c).type_code === "enemy");
  revealed(s, code);
  assert.equal(s.queue[0].kind, "resolveReveal");
  assert.ok(s.flow.pending);
  const observer = beneathSandsSimulationObserver();
  observer.observe(restore(s));
  const missing = structuredClone(s);
  missing.queue = missing.queue.filter(
    (effect) => effect.kind !== "resolveReveal",
  );
  assert.ok(missing.flow!.pending!.cards.some((c) => c.code === code));
  assert.throws(() => observer.observe(missing), /conserves every original/);
  for (let step = 0; !s.staging.some((unit) => unit.code === code); step++) {
    assert.ok(step < 30 && s.flow?.pending);
    s = restore(
      applyAction(s, { type: "CONTINUE", stepId: s.flow.pending.id }),
    );
    observer.observe(s);
  }
});

test("Sands conservation follows native treachery resolve and cancellation without duplicating its physical card", () => {
  const deck = STARTERS.find((d) => d.id === "spirit")!;
  for (const outcome of ["resolve", "cancel"]) {
    let s = createGame(1, deck.cards, deck.heroes, deck.id, {
      scenarioId: "beneath-the-sands",
    });
    s.phase = "staging";
    s.heroes.forEach((hero) => (hero.resources = 1));
    if (!s.hand.some((unit) => unit.code === "01050")) {
      const index = s.deck.indexOf("01050");
      assert.ok(index >= 0);
      s.hand.push(make(s, s.deck.splice(index, 1)[0]));
    }
    const code = take(s, (c) => c === B.forcedOff);
    revealed(s, code);
    assert.equal(s.choice?.title, `Revealed: ${card(code).name}`);
    assert.ok(s.choice.options.some((option) => option.id === "cancel"));
    const observer = beneathSandsSimulationObserver();
    observer.observe(restore(s));
    const missing = structuredClone(s);
    missing.choice = null;
    assert.throws(() => observer.observe(missing), /conserves every original/);
    s.flow = { mode: "all", nextId: 1, pending: null, history: [] };
    s = restore(applyAction(restore(s), { type: "CHOOSE", id: outcome }));
    observer.observe(s);
    for (let step = 0; s.choice || s.flow?.pending; step++) {
      assert.ok(step < 100, "native treachery continuation completes");
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
    assert.ok(s.encounterDiscard.includes(code));
    if (outcome === "cancel") assert.ok(s.discard.includes("01050"));
  }
});

test("Sands nested active event continuation owns one reveal while its cancellation alternatives own no extra copy", () => {
  const s = initial(),
    code = take(s, (c) => card(c).type_code === "treachery"),
    placement = fx("placeEncounter", { code, text: "revealed", flag: true });
  s.phase = "staging";
  s.queue.push(
    fx("eventPlay", {
      code: "01050",
      effects: [fx("afterPlayerAbility", { effects: [placement] })],
      cancelledEffects: [{ ...placement, flag: false }],
    }),
  );
  const observer = beneathSandsSimulationObserver();
  observer.observe(restore(s));
  const missing = structuredClone(s);
  missing.queue[0].effects = [];
  assert.throws(() => observer.observe(missing), /conserves every original/);
});

test("Sands conservation counts held On Track search cards once across mutually exclusive options", () => {
  const s = initial(),
    code = take(s, () => true),
    q = s.beneathSands!;
  q.resolving.push(code);
  s.choice = {
    title: "On Track · Choose a card",
    options: [
      {
        id: "one",
        label: "Choose first",
        code,
        effects: [fx("beneathSandsOnTrackTake", { code, value: 0 })],
      },
      {
        id: "two",
        label: "Choose same physical card",
        code,
        effects: [fx("beneathSandsOnTrackTake", { code, value: 0 })],
      },
    ],
  };
  const observer = beneathSandsSimulationObserver();
  observer.observe(restore(s));
  assert.ok(observer.counts().resolvingObservations > 0);
  const missing = structuredClone(s);
  missing.beneathSands!.resolving = [];
  assert.throws(() => observer.observe(missing), /conserves every original/);
  const duplicate = structuredClone(s);
  duplicate.encounterDiscard.push(code);
  assert.throws(() => observer.observe(duplicate), /conserves every original/);
});

test("Sands conservation detects missing boss, Search, removed cards and duplicated physical units", () => {
  const s = initial(),
    observer = beneathSandsSimulationObserver();
  observer.observe(restore(s));
  assert.ok(
    s.beneathSands!.setAside.some((unit) => unit.code === B.broodMother),
  );
  const missingBoss = structuredClone(s);
  missingBoss.beneathSands!.setAside = [];
  assert.throws(
    () => observer.observe(missingBoss),
    /conserves every original/,
  );
  const missingSearch = structuredClone(s);
  missingSearch.staging = missingSearch.staging.filter(
    (unit) => unit.id !== s.beneathSands!.searchId,
  );
  assert.throws(
    () => observer.observe(missingSearch),
    /conserves every original/,
  );
  const removed = take(s, () => true);
  (s.removedEncounter ??= []).push(removed);
  observer.observe(restore(s));
  const missingRemoved = structuredClone(s);
  missingRemoved.removedEncounter = [];
  assert.throws(
    () => observer.observe(missingRemoved),
    /conserves every original/,
  );
  const duplicate = structuredClone(s);
  duplicate.staging.push(structuredClone(s.beneathSands!.setAside[0]));
  assert.throws(() => observer.observe(duplicate), /exactly one zone/);
});

test("Sands conservation rejects missing or duplicated physical quests in the ordered chain", () => {
  const s = initial(),
    observer = beneathSandsSimulationObserver();
  for (const duplicate of [false, true]) {
    const bad = structuredClone(s);
    if (duplicate)
      bad.beneathSands!.questDeck.push(bad.beneathSands!.questDeck[0]);
    else bad.beneathSands!.questDeck.pop();
    assert.throws(
      () => observer.observe(bad),
      /printed quests retain physical order/,
    );
  }
});

test("Sands conservation includes current and suspended immediate-attack shadows exactly once", () => {
  const s = initial();
  s.phase = "defense";
  const enemy = make(
    s,
    take(s, (code) => card(code).type_code === "enemy"),
  );
  enemy.owner = 0;
  const old = take(s, () => true),
    middle = take(s, () => true),
    current = take(s, () => true);
  enemy.shadows = [old];
  s.engaged.push(enemy);
  s.encounterDeck.unshift(middle);
  handle(s, fx("immediateAttack", { target: enemy.id, player: 0 }));
  s.encounterDeck.unshift(current);
  handle(s, fx("immediateAttack", { target: enemy.id, player: 0 }));
  assert.deepEqual(s.combat!.immediatePreviousShadows, [middle]);
  assert.deepEqual(s.suspendedCombats[0].immediatePreviousShadows, [old]);
  const observer = beneathSandsSimulationObserver();
  observer.observe(restore(s));
  s.suspendedCombats[0].immediatePreviousShadows = [];
  assert.throws(() => observer.observe(s), /conserves every original/);
});

test("Sands conservation follows the native held Grabbed condition into a physical quest attachment and its discard", () => {
  let s = initial();
  s.phase = "staging";
  const code = take(s, (code) => code === B.grabbed);
  assert.equal(beneathSandsEncounter(s, code), true);
  assert.deepEqual(s.beneathSands!.resolving, [code]);
  const observer = beneathSandsSimulationObserver();
  observer.observe(restore(s));
  assert.ok(beneathSandsEffect(s, s.queue.shift()!));
  s = restore(s);
  observer.observe(s);
  const attachments = s.questAttachments![s.beneathSands!.currentQuest];
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].code, code);
  assert.ok(observer.counts().attachmentObservations > 0);
  const missing = structuredClone(s);
  missing.questAttachments = {};
  assert.throws(() => observer.observe(missing), /conserves every original/);
  s.beneathSands!.onTrack = true;
  s.staging.find((unit) => unit.id === s.beneathSands!.searchId)!.flipped =
    false;
  assert.ok(beneathSandsEffect(s, fx("beneathSandsFlip", { flag: false })));
  for (let step = 0; s.queue.length; step++) {
    assert.ok(step < 20);
    handle(s, s.queue.shift()!);
  }
  observer.observe(restore(s));
  assert.ok(s.encounterDiscard.includes(code));
});
