import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, make, prepend, stats, threatOf } from "../src/game/core";
import {
  damage,
  engage,
  placeEncounter,
  progressLocation,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import { addQuestProgress, sideQuestGoal } from "../src/game/side-quests";
import { combatDefenderDefense } from "../src/game/combat";
import { consideredEngaged } from "../src/game/considered-engagement";
import { forOwner, ownerOf, playerOrder, seatView } from "../src/game/table";
import {
  FIRE_NIGHT as F,
  FIRE_NIGHT_HOOKS as H,
  FIRE_NIGHT_RECIPES,
  fireNightHillDamage,
  fireNightSideCount,
} from "../src/game/fire-night";
import {
  base,
  defeatCount,
  enemy,
  reload,
  revealSide,
  settle,
  start,
} from "./fire-night-fixtures";
for (const players of [1, 2, 3, 4])
  for (const easy of [false, true])
    test(`Fire original ${players}p ${easy ? "easy" : "normal"} preserves side deck and correct setup`, () => {
      const s = reload(start(players, easy));
      assert.ok(s.fireNight!.initialized);
      assert.equal(s.fireNight!.sideDeck.length, 8);
      assert.equal(s.staging.filter((u) => u.code === F.dagnir).length, 1);
      assert.equal(
        FIRE_NIGHT_RECIPES.find(
          (r) => r.mode === (easy ? "easy" : "standard"),
        )!.cards.reduce((a, c) => a + c.quantity, 0),
        easy ? 35 : 47,
      );
      assert.equal(new Set(s.fireNight!.sideDeck.map((u) => u.id)).size, 8);
      assert.equal(s.fireNight!.hillDamage >= 0, true);
    });
test("native planning reveals one physical side quest before Dagnir's shadowless attack on the Hill", () => {
  let s = base(2);
  const side = s.fireNight!.sideDeck[0];
  s = settle(applyAction(reload(s), { type: "NEXT" }), "undefended");
  // Planning passes between players before the phase ends.
  if (s.phase === "planning")
    s = settle(applyAction(reload(s), { type: "NEXT" }), "undefended");
  assert.equal(s.fireNight!.sideDeck.length, 7);
  assert.ok(s.staging.some((u) => u.id === side.id));
  assert.equal(s.fireNight!.hillDamage >= 7, true);
  assert.equal(s.encounterDeck.length, 30);
});
test("planning defense sends only actual excess damage to the Hill", () => {
  let s = base();
  const h = s.heroes[0];
  h.damage = 0;
  // Force a harmless side quest so its reveal does not introduce another attack.
  const i = s.fireNight!.sideDeck.findIndex((u) => u.code === F.hold);
  s.fireNight!.sideDeck.unshift(s.fireNight!.sideDeck.splice(i, 1)[0]);
  const remaining = stats(s, h).health,
    defense = stats(s, h).defense;
  s = applyAction(reload(s), { type: "NEXT" });
  s = settle(s, h.id);
  assert.equal(s.fireNight!.hillDamage, Math.max(0, 7 - defense - remaining));
  assert.equal(s.encounterDeck.length, 30);
});
test("Dagnir scales threat, caps aggregate non-quest damage per round and becomes engaged with all players", () => {
  const s = base(4),
    d = s.staging[0];
  assert.equal(threatOf(s, d), 1);
  damage(s, d.id, 5);
  damage(s, d.id, 5);
  assert.equal(d.damage, 1);
  defeatCount(s, 3);
  assert.equal(threatOf(s, d), 4);
  damage(s, d.id, 9);
  assert.equal(d.damage, 4);
  for (const p of playerOrder(s)) assert.ok(consideredEngaged(s, d, p));
  s.round++;
  damage(s, d.id, 9);
  assert.equal(d.damage, 8);
  engage(s, d);
  assert.ok(s.staging.some((e) => e.id === d.id));
});
test("Face the Dragon bypasses the round cap and wins on the actual damage condition", () => {
  let s = base();
  const q = revealSide(s, F.face),
    d = s.staging[0];
  d.damage = 15;
  s.fireNight!.nonQuestDamage = { round: s.round, amount: 1 };
  addQuestProgress(s, q, 10);
  flush(s);
  s = settle(s);
  assert.equal(s.status, "won");
  assert.equal(s.fireNight!.nonQuestDamage.amount, 1);
});
test("quest progress cannot defeat the main stage and 50 Hill damage immediately loses", () => {
  const s = base();
  s.progress = 200;
  H.advance!(s);
  assert.equal(s.status, "playing");
  fireNightHillDamage(s, 49);
  assert.equal(s.status, "playing");
  fireNightHillDamage(s, 1);
  assert.equal(s.status, "lost");
  assert.equal(s.choice, null);
});
test("Rout the Goblins native reveal searches distinct physical Goblins, allows same title and scales quest points", () => {
  let s = base(4);
  s.encounterDeck = [F.orc, F.orc, F.orc, F.orc];
  s.encounterDiscard = [];
  const side = revealSide(s, F.rout);
  H.cardEntered!(s, side, true, false);
  flush(s);
  s = settle(s);
  assert.equal(
    playerOrder(s).every((p) =>
      seatView(s, p).engaged.some((u) => u.code === F.orc),
    ),
    true,
  );
  const q = s.staging.find((u) => u.id === side.id)!;
  assert.equal(sideQuestGoal(s, q), 25);
  addQuestProgress(s, q, 24);
  assert.ok(s.staging.some((u) => u.id === q.id));
});
test("all side quest restrictions and rewards survive native choices and saves", () => {
  let s = base(2);
  const fortify = revealSide(s, F.fortify),
    d = s.staging[0],
    h = s.heroes[0];
  s.combat = { enemyId: d.id, defenderId: h.id, attackBonus: 0 };
  assert.equal(combatDefenderDefense(s, h, d, s.combat), 0);
  s.combat = null;
  const draw = revealSide(s, F.drawFire);
  assert.ok(H.shadowImmune!(s, d));
  s.combat = { enemyId: d.id, defenderId: h.id, attackBonus: 0 };
  assert.ok(H.cannotCancel!(s, true));
  s.combat = null;
  const hold = revealSide(s, F.hold);
  assert.ok(H.cannotReduceThreat!(s));
  addQuestProgress(s, hold, 10);
  flush(s);
  s = settle(s, "response");
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 15);
  addQuestProgress(
    s,
    s.staging.find((u) => u.id === fortify.id)!,
    10,
  );
  flush(s);
  s = settle(s, "response");
  // Default selects Draw 3 for each player, independently.
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).hand.length, 3);
  assert.ok(s.staging.some((u) => u.id === draw.id));
  assert.ok(validateSave(s));
});
test("Douse response heals the town, Town Gate counts only in staging and Defend Town counts Dagnir", () => {
  let s = base(),
    q = revealSide(s, F.douse);
  s.fireNight!.hillDamage = 18;
  addQuestProgress(s, q, 10);
  flush(s);
  s = settle(s, "response");
  assert.equal(s.fireNight!.hillDamage, 8);
  const gate = enemy(s, F.gate);
  gate.resources = 2;
  H.endQuest!(s);
  flush(s);
  s = settle(s);
  assert.equal(s.fireNight!.hillDamage, 12);
  assert.ok(!get(s, gate.id));
  revealSide(s, F.defend);
  prepend(s, ...H.encounterEnd!(s));
  flush(s);
  s = settle(s);
  assert.equal(s.fireNight!.hillDamage, 13);
});
test("the shared Goblin and Forest set routes are active in Fire, including immunity and progress caps", () => {
  const s = base(2),
    troop = enemy(s, F.troop),
    orc = enemy(s, F.orc);
  forOwner(s, 1, () => {
    engage(s, troop);
    engage(s, orc);
  });
  assert.equal(ownerOf(s, orc), 1);
  assert.equal(stats(s, orc).attack, 3);
  assert.ok(H.cannotAttach!(s, troop, "01048"));
  enemy(s, F.darkWoods);
  const forest = enemy(s, F.accursed);
  progressLocation(s, forest, 3);
  progressLocation(s, forest, 3);
  assert.equal(forest.progress, 1);
  s.round++;
  progressLocation(s, forest, 3);
  assert.equal(forest.progress, 2);
  assert.ok(H.cannotCancel!(s));
});
test("native Orc choice, Bright Flames distribution, Swarm resources and Wrath active-location damage", () => {
  let s = base(2);
  placeEncounter(s, F.orc, false, 0, undefined, true);
  flush(s);
  s = settle(s, "hill");
  assert.equal(s.fireNight!.hillDamage, 3);
  placeEncounter(s, F.flames, false, 0, undefined, true);
  flush(s);
  s = settle(s);
  assert.equal(
    playerOrder(s)
      .map((p) => seatView(s, p).heroes.reduce((a, h) => a + h.damage, 0))
      .reduce((a, b) => a + b),
    2,
  );
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      for (const h of s.heroes) h.resources = 1;
    });
  placeEncounter(s, F.bats, false, 0, undefined, true);
  flush(s);
  s = settle(s);
  for (const p of playerOrder(s)) {
    assert.equal(seatView(s, p).threat, 23);
    assert.ok(seatView(s, p).heroes.every((h) => h.resources === 0));
  }
  s.activeLocation = make(s, F.palisade);
  placeEncounter(s, F.wrath, false, 0, undefined, true);
  flush(s);
  s = settle(s);
  assert.equal(s.fireNight!.hillDamage, 5);
  assert.equal(s.activeLocation, null);
});
test("Fire save rejects damaged hidden zones and non-quest bookkeeping", () => {
  const s = base();
  assert.ok(validateSave(s));
  const bad = structuredClone(s);
  bad.fireNight!.sideDeck.push({ ...bad.fireNight!.sideDeck[0] });
  assert.equal(validateSave(bad), false);
  const badDamage = structuredClone(s);
  badDamage.fireNight!.nonQuestDamage.amount = -1;
  assert.equal(validateSave(badDamage), false);
  assert.equal(fireNightSideCount(s), 0);
  assert.equal(card(F.rout).quest, 5);
  assert.equal(card(F.rout).victory, 10);
});
test("native attacks can damage the staging Dragon after three side quests and win at 20 damage", () => {
  let s = base();
  defeatCount(s, 3);
  s.phase = "attack";
  const d = s.staging[0];
  d.damage = 17;
  const h = s.heroes[0];
  h.tempAttack = 20;
  s = settle(
    applyAction(reload(s), {
      type: "ATTACK",
      enemyId: d.id,
      attackerIds: [h.id],
    }),
  );
  assert.equal(s.status, "won");
  assert.equal(s.fireNight!.nonQuestDamage.amount, 4);
});
test("Rally blocks ally attackers and its real reward searches only the top five without a resource cost", () => {
  let s = base(2);
  const side = revealSide(s, F.rally),
    d = s.staging[0];
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      const a = make(s, "01013");
      a.owner = p;
      s.allies.push(a);
      s.deck = ["01013", "01048", "01048", "01048", "01048", "01013"];
    });
  assert.equal(H.playerAttackDeclared!(s, d, [s.allies[0].id]), false);
  addQuestProgress(s, side, 10);
  flush(s);
  s = applyAction(reload(s), { type: "CHOOSE", id: "response" });
  s = settle(s, "0");
  // The deterministic first search option chooses the top Guard for both seats.
  for (const p of playerOrder(s)) {
    assert.equal(seatView(s, p).allies.length, 2);
    assert.equal(seatView(s, p).deck.length, 5);
    assert.ok(seatView(s, p).heroes.every((h) => h.resources === 10));
  }
});
test("Draw Her Fire current selection attacks, and Defend Town current selection adds the actual staging reveal", () => {
  let s = base();
  const draw = revealSide(s, F.drawFire);
  s.phase = "quest";
  prepend(s, fx("sideQuestSelect", { target: draw.id, code: draw.code }));
  flush(s);
  assert.match(s.choice!.title, /Immediate attack/);
  s = settle(s, "undefended");
  assert.equal(s.encounterDeck.length, 29);
  s = base();
  const side = revealSide(s, F.defend);
  s.phase = "quest";
  s.sideQuestSelections = { shared: { id: side.id, code: side.code } };
  s = settle(applyAction(reload(s), { type: "COMMIT" }));
  assert.equal(s.encounterDeck.length, 28);
});
test("every printed Fire shadow applies its own modifier and physical Stray Goblin leaves the shadow zone", () => {
  const s = base(),
    enemy = make(s, F.orc);
  s.engaged.push(enemy);
  const h = s.heroes[0];
  const combat = () => {
    s.combat = {
      enemyId: enemy.id,
      defenderId: h.id,
      defenderIds: [h.id],
      attackBonus: 0,
    };
    return s.combat as NonNullable<typeof s.combat> & {
      fireNightExcess?: boolean;
      fireNightKillHill?: boolean;
      fireNightDiscardAlly?: boolean;
    };
  };
  let c = combat();
  H.shadow!(s, F.orc);
  assert.equal(c.attackBonus, 1);
  s.fireNight!.hillDamage = 25;
  c = combat();
  H.shadow!(s, F.orc);
  assert.equal(c.attackBonus, 2);
  defeatCount(s, 2);
  c = combat();
  H.shadow!(s, F.flames);
  assert.equal(c.attackBonus, 2);
  c = combat();
  H.shadow!(s, F.troop);
  assert.equal(c.attackBonus, 2);
  c = combat();
  H.shadow!(s, F.bats);
  assert.equal(c.attackBonus, 1);
  h.attachments.push({
    id: "fire-test-attachment",
    code: "01048",
    exhausted: false,
  });
  c = combat();
  H.shadow!(s, F.bats);
  assert.equal(c.attackBonus, 2);
  c = combat();
  H.shadow!(s, F.wrath);
  assert.ok(c.fireNightExcess);
  c = combat();
  H.shadow!(s, F.thrall);
  assert.ok(c.fireNightKillHill);
  c = combat();
  H.shadow!(s, F.gloom);
  assert.ok(c.fireNightDiscardAlly);
  assert.equal(c.attackBonus, 1);
  c = combat();
  H.shadow!(s, F.fury);
  assert.equal(c.extraAttacks, 1);
  combat();
  enemy.shadows = [F.stray];
  enemy.revealedShadowCount = 1;
  H.shadow!(s, F.stray);
  assert.equal(enemy.shadows.length, 0);
  assert.equal(s.staging.filter((u) => u.code === F.stray).length, 1);
});
test("Dragon Fury undefended attack damages only the Hill", () => {
  let s = base();
  placeEncounter(s, F.fury, false, 0, undefined, true);
  flush(s);
  s = settle(s, "undefended");
  assert.equal(s.fireNight!.hillDamage, 7);
  assert.ok(s.heroes.every((h) => h.damage === 0));
});
test("Face the Dragon heals Dagnir only after her actual attack destroys a character", () => {
  let s = base();
  const dragon = s.staging[0];
  dragon.damage = 8;
  revealSide(s, F.face);
  const defender = s.heroes[0];
  defender.damage = stats(s, defender).health - 1;
  prepend(s, fx("immediateAttack", { target: dragon.id, player: 0 }));
  flush(s);
  s = settle(s, defender.id);
  assert.equal(s.staging.find((u) => u.id === dragon.id)!.damage, 3);
  assert.ok(!s.heroes.some((h) => h.id === defender.id));
});
test("actual Thrall and Gathering Gloom shadows apply their destruction follow-ups after combat", () => {
  for (const shadow of [F.thrall, F.gloom]) {
    let s = base();
    const enemy = make(s, F.orc);
    enemy.shadows = [shadow];
    enemy.tempAttack = 8;
    s.engaged.push(enemy);
    s.phase = "defense";
    const hero = s.heroes[0];
    hero.damage = stats(s, hero).health - 1;
    const ally = make(s, "01013");
    s.allies.push(ally);
    s = settle(
      applyAction(reload(s), {
        type: "DEFEND",
        enemyId: enemy.id,
        defenderId: hero.id,
      }),
    );
    assert.ok(!s.heroes.some((h) => h.id === hero.id));
    if (shadow === F.thrall) assert.equal(s.fireNight!.hillDamage, 3);
    else assert.ok(!s.allies.some((a) => a.id === ally.id));
  }
});
