import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, validateSave, availableAbilities } from "../src/game/engine";
import { card } from "../src/game/cards";
import { isHero } from "../src/game/card-types";
import { check, damage, destroy, engage, progress, advanceQuest, charactersCommitted, discardAttachment } from "../src/game/board";
import { canPlay, eligiblePayers, fx, get, make, pay, prepend, stats, threatOf, engagementCost } from "../src/game/core";
import { flush } from "../src/game/effects";
import { allCharacters, allEngaged, forOwner, ownerOf, playerOrder, seatView, selectSeat, attachmentController } from "../src/game/table";
import { MORDOR as M, MORDOR_OBJECTIVE_HEROES } from "../src/game/long-arm-mordor-support";
import { mordorAttackBonus, mordorAttackFinished, mordorCanDefend, mordorCardEntered,
  mordorDamageAmount, mordorDefendersDeclared, mordorEffect, mordorEncounter,
  mordorEncounterEnd, mordorImmune, mordorPlanningBegin, mordorPlayerAttackEffects,
  mordorRoundEnd, mordorShadow, mordorTravelEffects, mordorTravelProblem,
  mordorUndefendedTargets } from "../src/game/long-arm-mordor";
import { base, choose, reload, setStage, settle, start } from "./long-arm-mordor-fixtures";
import type { GameState, Unit } from "../src/game/types";
import { mordorShadowFixture } from "./long-arm-mordor-browser-fixtures";
const add = (s: GameState, code: string) => { const u = make(s, code); s.staging.push(u); return u; };
const finish = (s: GameState) => { flush(s); return settle(s); };
const combat = (s: GameState, enemy: Unit, defender?: Unit) => {
  s.combat = { enemyId: enemy.id, attackPlayer: ownerOf(s, enemy), defenderId: defender?.id ?? null,
    defenderIds: defender ? [defender.id] : [], attackBonus: 0 };
};
for (const players of [1, 2, 3, 4]) for (const easy of [false, true])
  test(`Long Arm original ${players}p ${easy ? "easy" : "standard"} setup retains uncontrolled heroes and neutral objective economy`, () => {
    const s = reload(start(players, easy));
    assert.equal(s.stage, 1); assert.equal(s.status, "playing");
    assert.equal(s.mordor!.captured.length, players * 3);
    assert.equal(allCharacters(s).length, players);
    assert.equal(s.staging.filter((e) => e.code === M.enforcers).length, players);
    assert.equal(s.encounterDeck.length, easy ? 23 : 29);
    assert.equal(s.encounterDeck.filter((c) => c === M.warg).length, 2);
    assert.equal(s.mordor!.removed.length, 4 - players);
    for (const p of playerOrder(s)) {
      const h = seatView(s, p).heroes[0]; assert.ok(MORDOR_OBJECTIVE_HEROES.includes(h.code)); assert.ok(isHero(h));
      assert.equal(h.resources, 3); assert.equal(card(h.code).sphere_code, "neutral");
      assert.ok(s.mordor!.captured.filter((h) => h.owner === p).every((h) => h.blanked && h.immuneToPlayerEffects));
    }
  });
test("Long Arm first paid card ignores resource matching independently per player and phase", () => {
  const s = base(2), c = card("01014");
  forOwner(s, 0, () => {
    assert.equal(eligiblePayers(s, c).length, 1); pay(s, c);
    assert.equal(eligiblePayers(s, c).length, 0);
  });
  forOwner(s, 1, () => assert.equal(eligiblePayers(s, c).length, 1));
  s.phase = "quest";
  forOwner(s, 0, () => assert.equal(eligiblePayers(s, c).length, 1));
});
test("Long Arm stage one requires successful progress on the main quest, then rescues one owned physical hero per player exhausted", () => {
  let s = base(2), ids = s.mordor!.captured.map((h) => h.id);
  progress(s, 1); assert.equal(s.stage, 1);
  s.progress = 0;
  s.phase = "quest"; progress(s, 1, false, true); s = finish(s);
  assert.equal(s.stage, 2); assert.equal(s.mordor!.captured.length, 4);
  for (const p of playerOrder(s)) {
    const rescued = seatView(s, p).heroes.find((h) => ids.includes(h.id))!;
    assert.ok(rescued.exhausted); assert.ok(!rescued.blanked); assert.ok(!rescued.immuneToPlayerEffects); assert.equal(rescued.owner, p);
  }
});
test("Long Arm successful progress absorbed only by an active location does not trigger the first rescue", () => {
  let s = base(); s.phase = "quest"; s.activeLocation = make(s, M.trail);
  progress(s, 1, false, true); s = finish(s); assert.equal(s.stage, 1); assert.equal(s.mordor!.captured.length, 3);
});
test("Long Arm stage two rescues the second heroes and guards every remaining physical hero with a different Orc", () => {
  let s = base(2); setStage(s, 2);
  for (const p of playerOrder(s)) { mordorEffect(s, fx("mordorRescue", { player: p })); s = settle(s); }
  s.encounterDeck = [M.uruk, M.rider]; s.encounterDiscard = [];
  progress(s, 5); s = finish(s);
  assert.equal(s.stage, 3); assert.equal(s.mordor!.captured.length, 2);
  assert.equal(Object.keys(s.mordor!.guarding).length, 2);
  assert.equal(new Set(Object.values(s.mordor!.guarding)).size, 2);
  for (const id of Object.values(s.mordor!.guarding)) assert.ok(mordorImmune(s, get(s, id)!));
});
test("Long Arm guarded Orc gains +1 threat attack defense and actual defeat rescues its exact exhausted hero", () => {
  let s = base(); setStage(s, 3); const enemy = add(s, M.uruk), hero = s.mordor!.captured[0];
  s.mordor!.guarding[hero.id] = enemy.id;
  assert.equal(stats(s, enemy).attack, 5); assert.equal(stats(s, enemy).defense, 3); assert.equal(threatOf(s, enemy), 3);
  destroy(s, enemy); s = finish(s);
  assert.ok(s.heroes.some((h) => h.id === hero.id && h.exhausted)); assert.ok(!s.mordor!.captured.some((h) => h.id === hero.id));
});
test("Long Arm stage three and final stage remain blocked by their physical guards and Chieftain", () => {
  let s = base(); setStage(s, 3); const e = add(s, M.uruk); s.mordor!.guarding[s.mordor!.captured[0].id] = e.id;
  s.progress = 10; advanceQuest(s); assert.equal(s.stage, 3);
  s.mordor!.guarding = {}; s.mordor!.captured = []; s = finish(s); advanceQuest(s); s = finish(s);
  assert.equal(s.stage, 4); assert.ok(s.staging.some((e) => e.code === M.chieftain));
  s.progress = 15; advanceQuest(s); assert.equal(s.status, "playing");
  const chief = s.staging.find((e) => e.code === M.chieftain)!; destroy(s, chief); advanceQuest(s); assert.equal(s.status, "won");
});
test("Long Arm mandatory undefended targets include uncontrolled heroes of every owner but no controlled objective-hero", () => {
  const s = base(2); const targets = mordorUndefendedTargets(s)!;
  assert.equal(targets.length, 6); assert.ok(targets.some((h) => h.owner === 1)); assert.ok(!targets.some((h) => MORDOR_OBJECTIVE_HEROES.includes(h.code)));
  setStage(s, 3); assert.equal(mordorUndefendedTargets(s), undefined);
});
test("Long Arm uncontrolled hero destruction removes exactly its physical card to the original owner's discard", () => {
  const s = base(2), hero = s.mordor!.captured.find((h) => h.owner === 1)!;
  damage(s, hero.id, 100);
  assert.ok(!s.mordor!.captured.some((h) => h.id === hero.id)); assert.ok(seatView(s, 1).discard.includes(hero.code)); assert.equal(s.status, "playing");
});
test("Long Arm objective-hero leave-play elimination survives blanking", () => {
  const s = base(2), hero = seatView(s, 1).heroes[0]; hero.blanked = true;
  forOwner(s, 1, () => destroy(s, hero)); check(s);
  assert.equal(s.table!.seats[1].eliminated, true); assert.equal(s.status, "playing");
});
test("Long Arm Kahliel's optional planning response can give a resource to another player's hero", () => {
  let s = base(2); const k = allCharacters(s).find((h) => h.code === M.kahliel)!, remote = allCharacters(s).find((h) => ownerOf(s, h) !== ownerOf(s, k))!;
  const before = remote.resources; prepend(s, ...mordorPlanningBegin(s)); flush(s);
  s = choose(reload(s), remote.id); s = settle(s); assert.equal(get(s, remote.id)!.resources, before + 1);
});
test("Long Arm Firyal looks at and may discard the actual top encounter card after commitment", () => {
  let s = base(2); const firyal = allCharacters(s).find((h) => h.code === M.firyal)!; s.encounterDeck = [M.uruk, M.hut];
  firyal.committed = true; charactersCommitted(s, [firyal]); flush(s);
  assert.equal(s.choice!.options[0].code, M.uruk); s = choose(reload(s), "discard"); s = settle(s);
  assert.equal(s.encounterDeck[0], M.hut); assert.ok(s.encounterDiscard.includes(M.uruk));
});
test("Long Arm Yazan can damage a guarded non-unique Orc because an objective-hero is an encounter card", () => {
  let s = base(3); setStage(s, 3); const yazan = allCharacters(s).find((h) => h.code === M.yazan)!, enemy = add(s, M.uruk);
  s.mordor!.guarding[s.mordor!.captured[0].id] = enemy.id;
  prepend(s, ...mordorPlayerAttackEffects(s, enemy, [yazan.id])); flush(s); s = choose(reload(s), enemy.id); s = settle(s);
  assert.equal(get(s, enemy.id)!.damage, 1); assert.equal(mordorPlayerAttackEffects(s, get(s, enemy.id)!, [yazan.id]).length, 0);
});
test("Long Arm Jubayr discards only an unrevealed facedown shadow from a non-unique enemy", () => {
  let s = base(4), jubayr = allCharacters(s).find((h) => h.code === M.jubayr)!, enemy = add(s, M.uruk);
  enemy.shadows = [M.savage, M.overrun]; enemy.faceupShadows = [true, false]; enemy.revealedShadowCount = 1;
  prepend(s, ...mordorDefendersDeclared(s, enemy, [jubayr])); flush(s);
  assert.equal(s.choice!.options.filter((o) => o.id !== "skip").length, 1);
  s = choose(reload(s), `${enemy.id}:1`); s = settle(s); assert.deepEqual(get(s, enemy.id)!.shadows, [M.savage]); assert.ok(s.encounterDiscard.includes(M.overrun));
});
test("Long Arm enforcers scale all three combat/threat stats and assign stage damage globally at round end", () => {
  let s = base(2); setStage(s, 2); const enforcer = add(s, M.enforcers), target = s.mordor!.captured.find((h) => h.owner === 1)!;
  assert.equal(stats(s, enforcer).attack, 2); assert.equal(stats(s, enforcer).defense, 2); assert.equal(threatOf(s, enforcer), 2);
  prepend(s, ...mordorRoundEnd(s)); flush(s); s = choose(reload(s), target.id); s = settle(s); assert.ok(get(s, target.id)!.damage >= 1);
});
test("Long Arm Chieftain relocates to a player with most non-unique Orcs and stage four engages with an immediate attack", () => {
  let s = base(2); setStage(s, 4); const chief = add(s, M.chieftain), orc = add(s, M.uruk);
  forOwner(s, 1, () => engage(s, orc)); prepend(s, ...mordorEncounterEnd(s)); flush(s);
  assert.equal(s.choice!.options.length, 1); assert.equal(s.choice!.options[0].id, "1");
  s = choose(reload(s), "1");
  assert.ok(s.queue.some((e) => e.kind === "immediateAttack") || s.combat?.immediate || s.flow?.pending);
  assert.equal(ownerOf(s, get(s, chief.id)!), 1);
});
test("Long Arm Chieftain cannot take damage beside another Orc or noncombat damage during stage four", () => {
  const s = base(); setStage(s, 4); const chief = add(s, M.chieftain), orc = add(s, M.uruk);
  engage(s, chief); engage(s, orc);
  assert.equal(mordorDamageAmount(s, chief, 5, { combatDamage: true }), 0);
  destroy(s, orc); assert.equal(mordorDamageAmount(s, chief, 5, {}), 0); assert.equal(mordorDamageAmount(s, chief, 5, { combatDamage: true }), 5);
});
test("Mordor Orcs threat comparisons use current threat and current willpower for defending and Warg-rider bonus", () => {
  const s = base(), ally = make(s, "01013"), uruk = add(s, M.uruk), rider = add(s, M.rider); s.allies.push(ally);
  assert.equal(mordorCanDefend(s, uruk, ally), false); ally.tempWill = 3; assert.equal(mordorCanDefend(s, uruk, ally), true);
  ally.tempWill = 0; assert.equal(mordorAttackBonus(s, rider, [ally]), Math.max(0, threatOf(s, rider) - stats(s, ally).will));
  add(s, M.uruks); assert.equal(engagementCost(s, uruk), 30); engage(s, uruk); assert.equal(threatOf(s, uruk), 3);
});
test("Mordor Warg attaches physically to an Orc, returns it to staging, adds all four bonuses and becomes enemy when host leaves", () => {
  let s = base(), enemy = add(s, M.uruk), warg = add(s, M.warg); engage(s, enemy);
  mordorCardEntered(s, warg, true); flush(s); s = choose(reload(s), enemy.id); s = settle(s);
  const mounted = get(s, enemy.id)!; assert.ok(s.staging.some((u) => u.id === enemy.id)); assert.equal(stats(s, mounted).health, 6);
  assert.equal(stats(s, mounted).attack, 6); assert.equal(stats(s, mounted).defense, 4); assert.equal(threatOf(s, mounted), 4);
  assert.equal(mounted.attachments[0].id, warg.id); destroy(s, mounted);
  assert.ok(s.staging.some((u) => u.id === warg.id && u.code === M.warg)); assert.ok(!s.encounterDiscard.includes(M.warg));
});
test("Jungle Forest Overgrown chooses highest eligible threat, stacks only on different locations and preserves physical attachment", () => {
  let s = base(), trail = add(s, M.trail), hut = add(s, M.hut); mordorEncounter(s, M.overgrown); flush(s);
  assert.equal(s.choice!.options[0].id, trail.id); s = choose(reload(s), trail.id); s = settle(s);
  assert.equal(threatOf(s, get(s, trail.id)!), 5); assert.ok(mordorImmune(s, get(s, trail.id)!));
  mordorEncounter(s, M.overgrown); flush(s); assert.equal(s.choice!.options[0].id, hut.id);
});
test("Long Arm travel costs charge every player and active Jungle Trail reduces staging location threat", () => {
  const s = base(2), boma = add(s, M.boma), hut = add(s, M.hut);
  assert.equal(mordorTravelProblem(s, boma), null); assert.equal(mordorTravelEffects(s, boma)!.length, 2);
  forOwner(s, 1, () => { s.heroes[0].resources = 0; }); assert.ok(mordorTravelProblem(s, boma));
  s.activeLocation = make(s, M.trail); assert.equal(threatOf(s, hut), 1);
});
test("Long Arm Savage Attack permits revealing when no allies and Overrun stacks phase threat", () => {
  let s = base(2); mordorEncounter(s, M.savage); flush(s); assert.equal(s.choice!.options[0].id, "reveal");
  s = settle(s); assert.equal(s.staging.length, 2); setStage(s, 3);
  mordorEncounter(s, M.overrun); mordorEncounter(s, M.overrun); s = finish(s); assert.equal(s.threatModifier, 12);
});
test("Mordor Fear applies an enduring snapshot debuff to all existing allies, including remote players", () => {
  let s = base(2); for (const p of playerOrder(s)) forOwner(s, p, () => s.allies.push(make(s, "01013")));
  mordorEncounter(s, M.fear); s = finish(s);
  for (const u of allCharacters(s).filter((u) => card(u.code).type_code === "ally")) assert.equal(stats(s, u).attack, Math.max(0, (card(u.code).attack ?? 0) - 1));
});
test("Mordor shadows preserve objective-hero protection, current-stat boosts and deferred extra attacks across saves", () => {
  let s = base(), enemy = add(s, M.uruk), hero = s.heroes[0]; engage(s, enemy); combat(s, enemy, hero); hero.exhausted = true;
  mordorShadow(s, M.boma); assert.equal(hero.exhausted, false); assert.equal(s.combat!.cancelCombatDamage, true);
  delete s.combat!.cancelCombatDamage; hero.tempWill = -2;
  mordorShadow(s, M.uruk); assert.equal(s.combat!.attackBonus, 2);
  mordorShadow(s, M.fear); s = reload(s); assert.equal(mordorAttackFinished(s, s.combat!).filter((e) => e.kind === "immediateAttack").length, 1);
});
test("Long Arm serialized captured ownership, duplicate guards and combat counter validation rejects corruption", () => {
  const s = base(2); assert.ok(validateSave(s));
  const owner = structuredClone(s); owner.mordor!.captured[0].owner = 4; assert.equal(validateSave(owner), false);
  const counters = structuredClone(s), enemy = add(counters, M.uruk); combat(counters, enemy); counters.combat!.mordorAdditionalAttacks = -1; assert.equal(validateSave(counters), false);
});
test("Jungle Forest shadow can discard a player-controlled attachment on an enemy", () => {
  let s = base(), enemy = add(s, M.uruk); engage(s, enemy); combat(s, enemy, s.heroes[0]);
  const trap = make(s, "01069"); enemy.attachments.push({ id: trap.id, code: trap.code, exhausted: false, owner: 0, controller: 0 });
  mordorShadow(s, M.clearing); flush(s);
  assert.ok(s.choice!.options.some((o) => o.id === trap.id)); s = choose(reload(s), trap.id); s = settle(s);
  assert.equal(get(s, enemy.id)!.attachments.length, 0); assert.ok(s.discard.includes(trap.code));
});
test("An objective-hero's controller uses a foreign-owned Steward after normal play and reload", () => {
  let s = base(2); const receiver = seatView(s, 1).heroes[0], steward = make(s, "01026"); steward.owner = 0; s.hand.push(steward);
  s = applyAction(reload(s), { type: "PLAY", id: steward.id, target: receiver.id }); s = settle(s);
  selectSeat(s, 1); s.table!.turn = 1; s = reload(s);
  const host = get(s, receiver.id)!, attachment = host.attachments.find((a) => a.code === steward.code)!;
  assert.equal(attachment.owner, 0); assert.equal(attachmentController(s, host, attachment), 1);
  assert.ok(availableAbilities(s, host).some((a) => a.id === attachment.id && !a.disabled));
  const before = host.resources;
  s = applyAction(reload(s), { type: "ABILITY", id: host.id, attachmentId: attachment.id }); s = settle(s);
  assert.equal(get(s, host.id)!.resources, before + 2); assert.equal(seatView(s, 0).heroes[0].resources, 8);
  assert.equal(get(s, host.id)!.attachments.find((a) => a.id === attachment.id)!.exhausted, true);
});
test("Final quest noncombat protection remains when the Chieftain's own text is blank", () => {
  const s = base(); setStage(s, 4); const chief = add(s, M.chieftain), orc = add(s, M.uruk);
  engage(s, chief); engage(s, orc); chief.blanked = true;
  assert.equal(mordorDamageAmount(s, chief, 5, {}), 0);
  assert.equal(mordorDamageAmount(s, chief, 5, { combatDamage: true }), 5);
});
test("Southron Boma's actual shadow readies its objective-hero and cancels only this enemy attack's damage", () => {
  const f = mordorShadowFixture(M.boma);
  combat(f.s, f.enemy, f.defender); f.s.combat!.cancelCombatDamage = true;
  const corrupt = structuredClone(f.s); Object.assign(corrupt.combat!, { cancelCombatDamage: "yes" });
  assert.equal(validateSave(corrupt), false);
  assert.equal(mordorDamageAmount(f.s, f.defender, 4, { enemyId: f.enemy.id, combatDamage: true }), 0);
  assert.equal(mordorDamageAmount(f.s, f.enemy, 4, { combatDamage: true }), 4);
  assert.equal(mordorDamageAmount(f.s, f.defender, 4, { enemyId: "another-enemy", combatDamage: true }), 4);
  f.s.combat = null;
  let s = applyAction(reload(f.s), { type: "DEFEND", enemyId: f.enemy.id, defenderId: f.defender.id }); s = settle(s);
  assert.equal(s.status, "playing"); assert.equal(get(s, f.defender.id)!.damage, 0); assert.equal(get(s, f.defender.id)!.exhausted, false);
});
