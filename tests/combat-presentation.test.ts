import { applyAction } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { STARTERS } from "../src/game/cards";
import { createGame, restoreSave } from "../src/game/engine";
import { startGuided } from "../src/game/presentation";
import type { GameState, Unit } from "../src/game/types";

function unit(s: GameState, code: string): Unit {
  return {
    id: `c${s.nextId++}`,
    code,
    damage: 0,
    progress: 0,
    resources: 0,
    exhausted: false,
    committed: false,
    attachments: [],
    boost: 0,
    attacked: false,
    shadows: [],
  };
}
function base() {
  const d = STARTERS[0];
  const s = applyAction(createGame(77, d.cards, d.heroes, d.id), {
    type: "KEEP",
  });
  s.staging = [];
  s.engaged = [unit(s, "01089")];
  s.hand = [];
  return startGuided(s);
}
function next(s: GameState) {
  return applyAction(s, { type: "CONTINUE", stepId: s.flow!.pending!.id });
}
test("attack review preserves two copies of an ally and the defeated target", () => {
  let s = base();
  s.phase = "attack";
  s.allies = [unit(s, "01017"), unit(s, "01017")];
  const ids = s.allies.map((u) => u.id);
  const target = s.engaged[0].id;
  s = applyAction(s, { type: "ATTACK", enemyId: target, attackerIds: ids });
  while (s.flow?.pending && s.flow.pending.title !== "Player attack result")
    s = next(s);
  assert.equal(s.flow!.pending!.title, "Player attack result");
  assert.ok(!s.engaged.some((u) => u.id === target));
  const cards = s.flow!.pending!.cards;
  assert.deepEqual(
    cards.filter((c) => c.label === "Attacker").map((c) => c.instanceId),
    ids,
  );
  assert.equal(cards.find((c) => c.label === "Target")?.instanceId, target);
  assert.deepEqual(
    restoreSave(JSON.parse(JSON.stringify(s))),
    s,
    "visual combat participants survive save/reload",
  );
});
test("undefended attack only gets a visual damage target after the hero is chosen", () => {
  let s = base();
  s.phase = "defense";
  const enemy = s.engaged[0];
  const hero = s.heroes[0];
  s = applyAction(s, { type: "DEFEND", enemyId: enemy.id, defenderId: null });
  while (s.flow?.pending) {
    assert.ok(!s.flow.pending.cards.some((c) => c.label === "Defender"));
    s = next(s);
  }
  assert.match(s.choice!.title, /Assign/);
  s = applyAction(s, { type: "CHOOSE", id: hero.id });
  assert.equal(s.flow!.pending!.title, "Combat damage");
  assert.equal(
    s.flow!.pending!.cards.find((c) => c.label === "Attacker")?.code,
    enemy.code,
  );
  assert.equal(
    s.flow!.pending!.cards.find((c) => c.label === "Defender")?.code,
    hero.code,
  );
  assert.equal(s.heroes[0].damage, 2);
});
