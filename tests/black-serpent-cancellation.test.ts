import assert from "node:assert/strict";
import test from "node:test";
import { applyAction } from "../src/game/engine";
import { reduceThreat } from "../src/game/threat-reduction";
import { get, make, stats } from "../src/game/core";
import { phaseEnd } from "../src/game/board";
import { syncSeat } from "../src/game/table";
import {
  BLACK_SERPENT as B,
  blackSerpentObjectives,
} from "../src/game/black-serpent-support";
import { base, claim, choose, reload, settle } from "./black-serpent-fixtures";
for (const cancel of [false, true])
  test(`Roofless Tower ${cancel ? "cancels paid event effects" : "removes progress and resolves paid event"} through native play`, () => {
    let s = base();
    s.staging.push(make(s, B.tower));
    s.progress = cancel ? 0 : 2;
    const event = make(s, "01025");
    s.hand.push(event);
    const hero = s.heroes[0];
    hero.exhausted = true;
    syncSeat(s);
    s = applyAction(reload(s), { type: "PLAY", id: event.id });
    s = settle(s, cancel ? "other" : "progress");
    assert.equal(get(s, hero.id)!.exhausted, cancel);
    assert.ok(s.discard.includes(event.code));
    assert.equal(s.progress, cancel ? 0 : 1);
    assert.equal(s.blackSerpent!.canceledEvents.length, 0);
  });
test("Redoubt's native ally play from hand exhausts the played ally when no progress can be removed", () => {
  let s = base();
  s.staging.push(make(s, B.redoubt));
  const ally = make(s, "01013");
  s.hand.push(ally);
  syncSeat(s);
  s = applyAction(reload(s), { type: "PLAY", id: ally.id });
  s = settle(s);
  assert.equal(get(s, ally.id)!.exhausted, true);
  assert.equal(s.progress, 0);
});
test("Objective actions exhaust the same copy, pay threat and end their phase modifiers", () => {
  let s = base();
  const objective = claim(s, B.banner);
  const enemy = make(s, B.guard);
  s.engaged.push(enemy);
  syncSeat(s);
  const hero = s.heroes[0],
    attack = stats(s, enemy).attack;
  s = applyAction(reload(s), {
    type: "ABILITY",
    id: hero.id,
    attachmentId: objective.id,
  });
  s = settle(s);
  assert.equal(s.threat, 21);
  assert.equal(blackSerpentObjectives(s)[0].attachment.exhausted, true);
  assert.equal(stats(s, get(s, enemy.id)!).attack, attack - 1);
  phaseEnd(s);
  s.phase = "quest";
  assert.equal(stats(s, get(s, enemy.id)!).attack, attack);
});
test("Summons guarded on an encounter card blocks threat reduction and releases its same id", () => {
  const s = base();
  const objective = claim(s, B.summons);
  const hero = s.heroes[0],
    a = hero.attachments.pop()!;
  const location = make(s, B.bastion);
  location.attachments.push(a);
  s.staging.push(location);
  syncSeat(s);
  const threat = s.threat;
  reduceThreat(s, 5);
  assert.equal(s.threat, threat);
  assert.equal(location.attachments[0].id, objective.id);
});
