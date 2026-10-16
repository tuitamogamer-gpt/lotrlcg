import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, createGame, restoreSave } from "../src/game/engine";
import { STARTERS, card } from "../src/game/cards";
import { fx, make } from "../src/game/core";
import { destroy, revealed } from "../src/game/board";
import { handle } from "../src/game/effects";
import { raceHaradSyncArea } from "../src/game/race-harad";
import { RACE_HARAD as R } from "../src/game/race-harad-support";
import { syncAttachmentText } from "../src/game/attachment-text";
import type { GameState } from "../src/game/types";
import {
  assertRaceHaradSaveRestoration,
  raceHaradSimulationObserver,
} from "./race-harad-simulation-invariants";

function initial(players = 1, easy = false) {
  const d = STARTERS[0];
  return createGame(11, d.cards, d.heroes, d.id, {
    scenarioId: "race-across-harad",
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
  assertRaceHaradSaveRestoration(saved, restored);
  return restored;
}

test("Race conservation starts from both original recipes, both quest chains and every player count", () => {
  for (const players of [1, 2, 3, 4])
    for (const easy of [false, true])
      raceHaradSimulationObserver().observe(restore(initial(players, easy)));
});

test("Race conservation follows a native reviewed enemy reveal and rejects a missing card despite its review reference", () => {
  let s = initial();
  s.phase = "staging";
  s.flow = { mode: "all", nextId: 1, pending: null, history: [] };
  const code = take(s, (c) => card(c).type_code === "enemy");
  revealed(s, code);
  assert.equal(s.queue[0].kind, "resolveReveal");
  assert.ok(s.flow.pending);
  const observer = raceHaradSimulationObserver();
  observer.observe(restore(s));
  const missing = structuredClone(s);
  missing.queue = missing.queue.filter((e) => e.kind !== "resolveReveal");
  assert.ok(missing.flow!.pending!.cards.some((c) => c.code === code));
  assert.throws(() => observer.observe(missing), /conserves every original/);
  for (let step = 0; !s.staging.some((u) => u.code === code); step++) {
    assert.ok(step < 20 && s.flow?.pending);
    s = restore(
      applyAction(s, { type: "CONTINUE", stepId: s.flow.pending.id }),
    );
    observer.observe(s);
  }
});

test("Race conservation follows actual treachery resolve and cancellation choices without duplicating their physical card", () => {
  const d = STARTERS.find((d) => d.id === "spirit")!;
  for (const outcome of ["resolve", "cancel"]) {
    let s = createGame(1, d.cards, d.heroes, d.id, {
      scenarioId: "race-across-harad",
    });
    s.phase = "staging";
    s.heroes.forEach((h) => (h.resources = 1));
    if (!s.hand.some((u) => u.code === "01050")) {
      const index = s.deck.indexOf("01050");
      assert.ok(index >= 0);
      s.hand.push(make(s, s.deck.splice(index, 1)[0]));
    }
    const code = take(s, (c) => card(c).name === "Howling at their Heels");
    revealed(s, code);
    assert.equal(s.choice?.title, `Revealed: ${card(code).name}`);
    assert.ok(s.choice.options.some((o) => o.id === "cancel"));
    const observer = raceHaradSimulationObserver();
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

test("Race nested active event continuations own one physical reveal and cancellation alternatives own no additional copy", () => {
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
  const observer = raceHaradSimulationObserver();
  observer.observe(restore(s));
  const missing = structuredClone(s);
  missing.queue[0].effects = [];
  assert.throws(() => observer.observe(missing), /conserves every original/);
});

test("Race conservation follows physical Orc-area cards through convergence and detects duplicates and missing remote cards", () => {
  const s = initial(),
    enemy = make(
      s,
      take(s, (c) => card(c).type_code === "enemy"),
    ),
    observer = raceHaradSimulationObserver();
  // Separate player and Orc stages before moving a physical card to the Orc area.
  const q = s.raceHarad!;
  q.completedQuests.push(q.currentQuest);
  q.currentQuest = q.questDeck.shift()!;
  s.stage = 2;
  q.area.push(enemy);
  raceHaradSyncArea(s);
  syncAttachmentText(s);
  observer.observe(restore(s));
  assert.ok(observer.counts().remoteAreaObservations > 0);
  const missing = structuredClone(s);
  missing.raceHarad!.area = missing.raceHarad!.area.filter(
    (u) => u.id !== enemy.id,
  );
  assert.throws(() => observer.observe(missing), /conserves every original/);
  const duplicate = structuredClone(s);
  duplicate.staging.push(structuredClone(enemy));
  assert.throws(() => observer.observe(duplicate), /exactly one zone/);
  q.enemyCompletedQuests.push(q.enemyQuest);
  q.enemyQuest = q.enemyQuestDeck.shift()!;
  q.enemyStage = 2;
  raceHaradSyncArea(s);
  syncAttachmentText(s);
  assert.equal(q.area.length, 0);
  assert.ok(s.staging.some((u) => u.id === enemy.id));
  s.queue.push(
    fx("afterEncounterRevealed", {
      code: enemy.code,
      revealOrigin: "encounter",
    }),
  );
  observer.observe(restore(s));
});

test("Race conservation includes unused removed physical mounts and detects a missing mount", () => {
  const s = initial(),
    q = s.raceHarad!,
    observer = raceHaradSimulationObserver();
  const index = q.setAside.findIndex(
    (u) =>
      card(u.code).name === "Tamed Mûmak" ||
      card(u.code).name === "Tamed Mumak",
  );
  // Setup can already place unused mounts in the serialized removed zone.
  if (index >= 0) q.removed.push(q.setAside.splice(index, 1)[0]);
  const mount = q.removed.find((u) => /Tamed M[uû]mak/.test(card(u.code).name));
  assert.ok(mount);
  observer.observe(restore(s));
  q.removed = q.removed.filter((u) => u.id !== mount.id);
  assert.throws(() => observer.observe(s), /conserves every original/);
});

test("Race conservation detects missing or duplicated physical quests in either ordered quest chain", () => {
  const s = initial(),
    observer = raceHaradSimulationObserver();
  observer.observe(restore(s));
  for (const side of ["questDeck", "enemyQuestDeck"] as const) {
    const missing = structuredClone(s);
    missing.raceHarad![side].pop();
    assert.throws(
      () => observer.observe(missing),
      /printed quests retain physical order/,
    );
    const duplicate = structuredClone(s);
    duplicate.raceHarad![side].push(duplicate.raceHarad![side][0]);
    assert.throws(
      () => observer.observe(duplicate),
      /printed quests retain physical order/,
    );
  }
});

test("Race conservation includes current and suspended immediate-attack shadows exactly once", () => {
  const s = initial();
  s.phase = "defense";
  const enemy = make(
    s,
    take(s, (c) => card(c).type_code === "enemy"),
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
  const observer = raceHaradSimulationObserver();
  observer.observe(restore(s));
  s.suspendedCombats[0].immediatePreviousShadows = [];
  assert.throws(() => observer.observe(s), /conserves every original/);
});

test("Race conservation follows native Racing Warg revelation, pending Orc choice, physical attachment and release after its host is destroyed", () => {
  let s = initial();
  s.phase = "staging";
  const host = make(
    s,
    take(s, (c) => c === R.rider),
  );
  s.staging.push(host);
  const observer = raceHaradSimulationObserver();
  revealed(
    s,
    take(s, (c) => c === R.racingWarg),
  );
  for (let step = 0; !s.choice && s.queue.length; step++) {
    assert.ok(step < 20);
    handle(s, s.queue.shift()!);
  }
  assert.equal(s.choice?.title, "Racing Warg · Attach to an Orc enemy");
  const warg = s.staging.find((u) => u.code === R.racingWarg)!;
  assert.ok(warg);
  observer.observe(restore(s));
  s = restore(applyAction(s, { type: "CHOOSE", id: host.id }));
  const attachedHost = s.staging.find((u) => u.id === host.id)!;
  assert.ok(attachedHost.attachments.some((a) => a.id === warg.id));
  observer.observe(s);
  assert.ok(observer.counts().attachmentObservations > 0);
  destroy(s, attachedHost);
  syncAttachmentText(s);
  assert.ok(s.encounterDiscard.includes(host.code));
  assert.ok(s.staging.some((u) => u.id === warg.id && u.code === R.racingWarg));
  observer.observe(restore(s));
});
