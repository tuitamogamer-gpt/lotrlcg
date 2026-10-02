import test from "node:test";
import assert from "node:assert/strict";
import { STARTERS } from "../src/game/cards";
import { createGame } from "../src/game/engine";
import { make, removeShadowCard } from "../src/game/core";
import { KHAZAD as K } from "../src/game/khazad-dum";

function enemy() {
  const d = STARTERS[0],
    s = createGame(718, d.cards, d.heroes, d.id);
  return make(s, "01082");
}
test("removing a resolved Patrol Leader shadow ends its cancellation while another shadow's effect remains", () => {
  const e = enemy();
  e.shadows = [K.leader, K.passage];
  e.revealedShadowCount = 2;
  e.shadowCancelsDamage = true;
  e.shadowCancelsCombatDamage = true;
  assert.equal(removeShadowCard(e, 0), K.leader);
  assert.equal(e.revealedShadowCount, 1);
  assert.equal(e.shadowCancelsDamage, undefined);
  assert.equal(e.shadowCancelsCombatDamage, true);
  removeShadowCard(e, 0);
  assert.equal(e.shadowCancelsCombatDamage, undefined);
});
test("removing a facedown identical shadow preserves the cancellation from its resolved copy", () => {
  const e = enemy();
  e.shadows = [K.leader, K.leader];
  e.revealedShadowCount = 1;
  e.shadowCancelsDamage = true;
  removeShadowCard(e, 1);
  assert.equal(e.revealedShadowCount, 1);
  assert.equal(e.shadowCancelsDamage, true);
});
test("only resolved remaining copies keep a shadow cancellation active", () => {
  const e = enemy();
  e.shadows = [K.leader, K.leader, K.leader];
  e.revealedShadowCount = 2;
  e.shadowCancelsDamage = true;
  removeShadowCard(e, 0);
  assert.equal(e.shadowCancelsDamage, true);
  removeShadowCard(e, 0);
  assert.equal(e.shadowCancelsDamage, undefined);
  assert.deepEqual(e.shadows, [K.leader]);
  assert.equal(e.revealedShadowCount, 0);
});
test("Lightless Passage follows the same resolved-source duration independently of Patrol Leader", () => {
  const e = enemy();
  e.shadows = [K.passage, K.passage];
  e.revealedShadowCount = 1;
  e.shadowCancelsCombatDamage = true;
  removeShadowCard(e, 1);
  assert.equal(e.shadowCancelsCombatDamage, true);
  removeShadowCard(e, 0);
  assert.equal(e.shadowCancelsCombatDamage, undefined);
});
