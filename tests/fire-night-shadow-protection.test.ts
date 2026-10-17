import assert from "node:assert/strict";
import test from "node:test";
import {
  canPlayerAffectShadow,
  make,
  removePlayerShadowCard,
  removeShadowCard,
} from "../src/game/core";
import { canPlay } from "../src/game/engine";
import { attackersFor } from "../src/game/table";
import { FIRE_NIGHT as F } from "../src/game/fire-night-support";
import {
  finalRingEvent,
  finalRingPlayProblem,
  finalRingShadowOptions,
} from "../src/game/ring-maker-final-player";
import { handleRoadPlayerEffect } from "../src/game/road-player-cards";
import { realmEffect } from "../src/game/lost-realm-player";
import {
  templePlayerEffect,
  templePlayerShadowOptions,
} from "../src/game/temple-player";
import {
  handleMirkwoodPlayerEffect,
  mirkwoodPlayerPlayProblem,
} from "../src/game/mirkwood-player-cards";
import { base, defeatCount, enemy, revealSide } from "./fire-night-fixtures";

test("Draw Her Fire protects physical shadows from player discard while framework cleanup remains legal", () => {
  const s = base(),
    dragon = s.staging[0],
    ordinary = enemy(s, F.orc);
  revealSide(s, F.drawFire);
  dragon.shadows = [F.orc, F.flames];
  ordinary.shadows = [F.orc];
  ordinary.immuneToPlayerEffects = true;
  assert.equal(canPlayerAffectShadow(s, dragon), false);
  assert.equal(canPlayerAffectShadow(s, ordinary), true);
  assert.equal(removePlayerShadowCard(s, dragon, 0), undefined);
  assert.equal(dragon.shadows.length, 2);
  assert.equal(removePlayerShadowCard(s, ordinary, 0), F.orc);
  assert.equal(removeShadowCard(dragon, 0), F.orc);
  assert.equal(dragon.shadows.length, 1);
});
test("Shadows Give Way filters protected cards before payment and its blanket removal terminates", () => {
  const s = base(),
    dragon = s.staging[0];
  revealSide(s, F.drawFire);
  dragon.shadows = [F.flames, F.orc];
  assert.match(finalRingPlayProblem(s, "08143")!, /No shadow/);
  const event = make(s, "08143");
  s.hand.push(event);
  assert.ok(canPlay(s, event));
  const ordinary = enemy(s, F.orc);
  ordinary.shadows = [F.flames];
  ordinary.immuneToPlayerEffects = true;
  assert.equal(finalRingPlayProblem(s, "08143"), null);
  finalRingEvent(s, "08143");
  assert.deepEqual(dragon.shadows, [F.flames, F.orc]);
  assert.deepEqual(ordinary.shadows, []);
  assert.ok(s.encounterDiscard.includes(F.flames));
});
test("legacy Rider, Tireless Hunters, Destrier and Dawn shadow choices exclude protected Dagnir", () => {
  const s = base();
  const dragon = s.staging[0];
  revealSide(s, F.drawFire);
  defeatCount(s, 3);
  dragon.shadows = [F.orc];
  const rider = make(s, "04033");
  s.allies.push(rider);
  handleRoadPlayerEffect(s, { kind: "roadRiderResponse", source: rider.id });
  assert.equal(s.choice, null);
  realmEffect(s, { kind: "realmTirelessShadow", target: dragon.id });
  assert.equal(s.choice, null);
  templePlayerEffect(s, {
    kind: "templePlayerDestrierShadow",
    owner: 0,
    text: "another-enemy",
  });
  assert.equal(s.choice, null);
  s.phase = "defense";
  assert.match(mirkwoodPlayerPlayProblem(s, "02118")!, /requires dealt/);
  handleMirkwoodPlayerEffect(s, { kind: "mirkwoodDawnChoice" });
  assert.equal(s.choice, null);
  const ordinary = enemy(s, F.orc);
  s.staging = s.staging.filter((u) => u.id !== ordinary.id);
  s.engaged.push(ordinary);
  ordinary.shadows = [F.flames];
  handleRoadPlayerEffect(s, { kind: "roadRiderResponse", source: rider.id });
  assert.ok(s.choice!.options.some((o) => o.id.startsWith(ordinary.id)));
  assert.ok(!s.choice!.options.some((o) => o.id.startsWith(dragon.id)));
});
test("Déorwine and Erkenbrand cannot pay cancellation costs against a protected Dagnir shadow", () => {
  const s = base(),
    dragon = s.staging[0];
  revealSide(s, F.drawFire);
  const defender = make(s, "12060");
  s.allies.push(defender);
  s.combat = {
    enemyId: dragon.id,
    defenderId: defender.id,
    defenderIds: [defender.id],
    attackBonus: 0,
  };
  assert.deepEqual(templePlayerShadowOptions(s, F.orc, true), []);
  const hero = s.heroes[0];
  hero.code = "08137";
  s.combat.defenderId = hero.id;
  s.combat.defenderIds = [hero.id];
  assert.deepEqual(finalRingShadowOptions(s, F.orc, true), []);
  assert.equal(hero.damage, 0);
});
test("Rally the Woodmen filters allied attackers before the attack declaration", () => {
  const s = base();
  const dragon = s.staging[0];
  revealSide(s, F.rally);
  defeatCount(s, 3);
  const ally = make(s, "01013");
  s.allies.push(ally);
  assert.ok(!attackersFor(s, dragon).some((u) => u.id === ally.id));
  assert.ok(attackersFor(s, dragon).some((u) => u.id === s.heroes[0].id));
});
