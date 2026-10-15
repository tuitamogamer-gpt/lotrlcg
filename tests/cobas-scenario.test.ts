import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, validateSave, canTravel } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  fx,
  make,
  prepend,
  stats,
  engagementCost,
  stagingThreat,
} from "../src/game/core";
import {
  addVictoryCard,
  advanceQuest,
  check,
  damage,
  destroy,
  engage,
  exhaustCharacter,
  phaseEnd,
  progressLocation,
  revealed,
  shadow,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  allCharacters,
  allEngaged,
  attackersFor,
  forOwner,
  ownerOf,
  seatView,
  selectSeat,
} from "../src/game/table";
import {
  beginSailingTest,
  sailingContinue,
  sailingSymbols,
} from "../src/game/sailing";
import { isAlly, unitType } from "../src/game/card-types";
import {
  isShipObjective,
  shipCanAttack,
  shipCanDefend,
} from "../src/game/ships";
import {
  COBAS as C,
  COBAS_CORSAIRS,
  COBAS_OBJECTIVES,
  COBAS_RECIPES,
  cobasStageInfo,
} from "../src/game/cobas-support";
import {
  cobasAbility,
  cobasGuardsObjective,
  cobasObjectiveControlled,
  cobasArchery,
  cobasDamageDealt,
  cobasEffect,
  cobasPublicState,
  cobasQuestEnd,
  cobasRemoveCharacter,
  cobasSailingExtraCards,
} from "../src/game/cobas";
import { voyageEffect } from "../src/game/voyage-belegaer";
import {
  base,
  start,
  choose,
  reload,
  settle,
  setStage,
} from "./cobas-fixtures";
import type { GameState, Unit } from "../src/game/types";
const add = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const finish = (s: GameState) => {
  flush(s);
  return settle(s);
};
test("Tower of the Gull's encounter-card action damages an immune Skirmisher after a pending-choice reload", () => {
  let s = base();
  s.phase = "attack";
  const tower = add(s, C.gull),
    enemy = add(s, C.skirmisher);
  s = applyAction(reload(s), { type: "ABILITY", id: tower.id });
  assert.ok(s.choice?.options.some((o) => o.id === enemy.id));
  s = choose(reload(s), enemy.id);
  s = finish(s);
  assert.equal(s.staging.find((u) => u.id === tower.id)!.exhausted, true);
  assert.equal(s.staging.find((u) => u.id === enemy.id)!.damage, 2);
  assert.equal(s.playerAbilitySources, undefined);
});
const pick = (s: GameState, id: string) => {
  const o = s.choice!.options.find(
    (o) => o.id === id || o.effects.some((e) => e.target === id),
  );
  assert.ok(o, JSON.stringify(s.choice));
  return choose(reload(s), o.id);
};
for (const players of [1, 2, 3, 4])
  for (const easy of [false, true])
    test(`Cobas setup ${players}p ${easy ? "easy" : "normal"} prepares original fleet, independent Corsairs and one guarded objective`, () => {
      const s = reload(start(players, easy));
      assert.equal(
        allCharacters(s).filter(isShipObjective).length,
        players === 1 ? 2 : players,
      );
      assert.equal(
        s.cobas!.setAside.filter((u) => u.code === C.warship).length,
        2,
      );
      assert.equal(
        [
          ...s.cobas!.corsairDeck,
          ...s.cobas!.corsairDiscard,
          ...allEngaged(s).map((u) => u.code),
        ].filter((c) => COBAS_CORSAIRS.includes(c)).length,
        easy ? 12 : 16,
      );
      assert.equal(s.cobas!.corsairDiscard.length, 0);
      assert.ok(s.staging.some((u) => u.code === C.flagship));
      assert.ok(s.staging.some((u) => u.code === C.scout));
      assert.equal(s.cobas!.currentQuest, C.outmaneuver);
      assert.equal(s.sailing!.heading, 0);
      assert.ok(s.staging.some((u) => COBAS_OBJECTIVES.includes(u.code)));
      assert.equal(
        COBAS_RECIPES.find((r) => r.mode === (easy ? "easy" : "standard"))!
          .cards.filter((c) => c.section === "sharedEncounterDeck")
          .reduce((n, c) => n + c.quantity, 0),
        easy ? 23 : 33,
      );
    });
test("Cobas public view discloses Corsair counts without order or deck definitions", () => {
  const s = base(2),
    before = JSON.stringify(cobasPublicState(s));
  s.cobas!.corsairDeck.reverse();
  assert.equal(JSON.stringify(cobasPublicState(s)), before);
  assert.ok(!before.includes("corsairDeck"));
});
test("Original sailing symbols and Sea-ward Tower look bonus stop while guarded", () => {
  const s = base(),
    tower = add(s, C.sea),
    enemy = add(s, C.scout);
  assert.equal(sailingSymbols(C.heavy), 1);
  assert.equal(sailingSymbols(C.haven), 0);
  assert.equal(sailingSymbols(C.water), 0);
  assert.equal(cobasSailingExtraCards(s), 2);
  enemy.guarding = tower.id;
  assert.equal(cobasSailingExtraCards(s), 0);
  destroy(s, enemy);
  assert.equal(cobasSailingExtraCards(s), 2);
});
test("Sea-ward Tower looks at two cards even when no characters commit", () => {
  let s = base();
  add(s, C.sea);
  s.phase = "quest";
  s.encounterDeck = [C.coast, C.water, ...s.encounterDeck];
  beginSailingTest(s);
  s = choose(s, "done");
  sailingContinue(s);
  assert.equal(s.sailing!.test!.looked!.length, 2);
  assert.equal(s.sailing!.test!.successes, 1);
  reload(s);
});
test("Stage one on-course engagement damages that Ship and resolves its Boarding", () => {
  let s = base();
  const enemy = add(s, C.skirmisher);
  s.cobas!.corsairDeck = [C.sailor];
  engage(s, enemy);
  s = finish(s);
  assert.equal(allEngaged(s).find((u) => u.id === enemy.id)?.damage, 2);
  assert.ok(allEngaged(s).some((u) => u.code === C.sailor));
});
test("Stage one off-course damage belongs to engaged seat and Haven reduces Boarding to zero", () => {
  let s = base(2);
  s.sailing!.heading = 1;
  s.activeLocation = make(s, C.haven);
  selectSeat(s, 1);
  const enemy = add(s, C.skirmisher),
    ownship = allCharacters(s).find(
      (u) => isShipObjective(u) && ownerOf(s, u) === 1,
    )!;
  const n = s.cobas!.corsairDeck.length;
  engage(s, enemy);
  flush(s);
  s = pick(s, ownship.id);
  assert.equal(allCharacters(s).find((u) => u.id === ownship.id)!.damage, 2);
  assert.equal(s.cobas!.corsairDeck.length, n);
  assert.equal(allEngaged(s).find((u) => u.id === enemy.id)!.damage, 0);
});
test("Raider Flagship engagement thresholds follow worst heading and stage three", () => {
  const s = base(),
    enemy = add(s, C.flagship);
  assert.equal(engagementCost(s, enemy), 50);
  s.sailing!.heading = 3;
  assert.equal(engagementCost(s, enemy), 0);
  setStage(s, 2);
  assert.equal(engagementCost(s, enemy), 0);
  s.sailing!.heading = 0;
  assert.equal(engagementCost(s, enemy), 50);
  setStage(s, 3);
  assert.equal(engagementCost(s, enemy), 0);
});
test("blanking Raider Flagship does not remove the quest's engagement-cost modifier", () => {
  for (const stage of [1, 2, 3]) {
    const s = base(),
      enemy = add(s, C.flagship);
    setStage(s, stage);
    enemy.blanked = true;
    s.sailing!.heading = stage === 3 ? 0 : 3;
    assert.equal(engagementCost(s, enemy), 0);
    if (stage !== 3) {
      s.sailing!.heading = 0;
      assert.equal(engagementCost(s, enemy), 50);
    }
  }
});
test("Raider Flagship accepts only Ship objective attackers, including captured Skirmishers", () => {
  const s = base();
  s.phase = "attack";
  const enemy = make(s, C.flagship);
  s.engaged.push(enemy);
  const ordinary = make(s, "01073");
  s.allies.push(ordinary);
  const captured = make(s, C.skirmisher);
  captured.cobasShipObjective = true;
  s.allies.push(captured);
  const ids = attackersFor(s, enemy).map((u) => u.id);
  assert.ok(!ids.includes(ordinary.id));
  assert.ok(ids.includes(captured.id));
  assert.ok(ids.includes(s.allies.find((u) => u.code === C.dream)!.id));
});
test("Raider Flagship reveals a Corsair at END of encounter, not beginning", () => {
  let s = base();
  setStage(s, 2);
  const enemy = make(s, C.flagship);
  s.engaged.push(enemy);
  s.cobas!.corsairDeck = [C.sailor, C.raider];
  handle(s, fx("startEncounter"));
  flush(s);
  assert.equal(s.cobas!.corsairDeck.length, 2);
  phaseEnd(s);
  s = finish(s);
  assert.equal(s.cobas!.corsairDeck.length, 1);
  assert.ok(allEngaged(s).some((u) => u.code === C.sailor));
});
test("Stage two searches twice for 3 players, then assigns separate physical guards", () => {
  let s = base(3);
  const a = add(s, C.sea),
    b = add(s, C.heron);
  s.encounterDeck = [C.siege, C.heavy, ...Array(10).fill(C.water)];
  s.progress = 10;
  advanceQuest(s);
  s = finish(s);
  assert.equal(s.stage, 2);
  assert.equal(
    s.staging.filter((u) => u.guarding === a.id || u.guarding === b.id).length,
    2,
  );
  assert.equal(
    new Set(s.staging.filter((u) => u.guarding).map((u) => u.guarding)).size,
    2,
  );
  reload(s);
});
test("Stage two can receive progress but cannot advance until its last guard leaves", () => {
  let s = base();
  setStage(s, 2);
  const o = add(s, C.gull),
    guard = add(s, C.siege);
  guard.guarding = o.id;
  s.progress = 16;
  advanceQuest(s);
  assert.equal(s.stage, 2);
  destroy(s, guard);
  s = finish(s);
  assert.equal(s.stage, 3);
});
test("Stage three quest points track every Ship enemy and exclude captured and Belfalas enemies", () => {
  const s = base();
  setStage(s, 3);
  add(s, C.flagship);
  const e = add(s, C.siege);
  assert.equal(cobasStageInfo(s)!.quest, 15);
  const capture = make(s, C.skirmisher);
  capture.cobasShipObjective = true;
  s.allies.push(capture);
  assert.equal(cobasStageInfo(s)!.quest, 15);
  s.staging = s.staging.filter((x) => x !== e);
  const island = make(s, C.belfalas);
  s.activeLocation = island;
  s.cobas!.belfalas.push({ locationId: island.id, enemy: e });
  assert.equal(cobasStageInfo(s)!.quest, 10);
});
test("Destroying Raider Flagship grants20 victory and stage-three alternate win", () => {
  const s = base();
  setStage(s, 3);
  const e = make(s, C.flagship);
  s.engaged.push(e);
  destroy(s, e);
  flush(s);
  advanceQuest(s);
  assert.equal(s.status, "won");
  assert.ok(s.victoryCards?.includes(C.flagship));
  assert.equal(s.victory, 20);
});
test("Flagship defeated at stage one does not bypass earlier quests", () => {
  const s = base();
  addVictoryCard(s, C.flagship);
  advanceQuest(s);
  assert.equal(s.status, "playing");
  assert.equal(s.stage, 1);
});
test("Heavy Cruiser searches a physical objective and guards it without another Guarded reveal", () => {
  let s = base();
  s.encounterDeck = [C.beacon, C.water, C.coast];
  revealed(s, C.heavy);
  flush(s);
  s = finish(s);
  const objective = s.staging.find((u) => u.code === C.beacon)!,
    heavy = s.staging.find((u) => u.code === C.heavy)!;
  assert.equal(heavy.guarding, objective.id);
  assert.equal(s.encounterDeck.length, 2);
  reload(s);
});
test("Heavy Cruiser absent objective shuffles without inventing a card", () => {
  let s = base();
  s.encounterDeck = [C.water, C.coast];
  revealed(s, C.heavy);
  s = finish(s);
  assert.equal(s.staging.length, 1);
  assert.equal(s.encounterDeck.length, 2);
});
test("Siege Ship guards an unguarded objective at quest end and suppresses its benefit", () => {
  let s = base();
  const o = add(s, C.sea),
    enemy = add(s, C.siege);
  s.phase = "quest";
  cobasQuestEnd(s);
  s = finish(s);
  assert.equal(s.staging.find((u) => u.id === enemy.id)!.guarding, o.id);
  assert.equal(cobasSailingExtraCards(s), 0);
});
test("Tower of the Heron reduces the aggregate Archery total, never below zero", () => {
  const s = base();
  add(s, C.heron);
  add(s, C.siege);
  assert.equal(cobasArchery(s, 0), 0);
  assert.equal(cobasArchery(s, 4), 2);
  const o = s.staging.find((u) => u.code === C.heron)!;
  s.staging.find((u) => u.code === C.siege)!.guarding = o.id;
  assert.equal(cobasArchery(s, 4), 6);
});
test("The Raiders’ Assault returns an engaged Ship as guard without surge", () => {
  let s = base();
  setStage(s, 2);
  const o = add(s, C.gull),
    enemy = make(s, C.siege);
  s.engaged.push(enemy);
  s.encounterDeck = [C.coast];
  revealed(s, C.assault);
  s = finish(s);
  assert.ok(!allEngaged(s).some((u) => u.id === enemy.id));
  assert.equal(s.staging.find((u) => u.id === enemy.id)!.guarding, o.id);
  assert.deepEqual(s.encounterDeck, [C.coast]);
});
test("The Raiders’ Assault using a staged Ship still gains surge", () => {
  let s = base();
  const o = add(s, C.gull),
    enemy = add(s, C.siege);
  s.encounterDeck = [C.coast, C.belfalas];
  revealed(s, C.assault);
  s = finish(s);
  assert.equal(s.staging.find((u) => u.id === enemy.id)!.guarding, o.id);
  assert.ok(s.staging.some((u) => u.code === C.coast));
});
test("Coast of Anfalas off-course threat and printed shadow use current heading", () => {
  const s = base(),
    u = add(s, C.coast);
  s.sailing!.heading = 2;
  assert.equal(stagingThreat(s), 5);
  const enemy = make(s, C.siege);
  s.engaged.push(enemy);
  s.combat = {
    enemyId: enemy.id,
    defenderId: null,
    attackBonus: 0,
    damageDealt: 0,
  };
  shadow(s, C.coast);
  assert.equal(s.combat.attackBonus, 2);
  assert.ok(!card(C.haven).shadow);
});
test("Belfalas rejects off-course travel and restores the same engaged enemy when it leaves", () => {
  let s = base();
  setStage(s, 2);
  const island = add(s, C.belfalas),
    enemy = make(s, C.flagship);
  enemy.damage = 3;
  s.engaged.push(enemy);
  s.phase = "travel";
  s.sailing!.heading = 1;
  assert.match(canTravel(s, island) ?? "", /on-course/);
  s.sailing!.heading = 0;
  s = applyAction(s, { type: "TRAVEL", id: island.id });
  s = pick(s, enemy.id);
  assert.equal(allEngaged(s).length, 0);
  assert.equal(s.cobas!.belfalas[0].enemy.id, enemy.id);
  reload(s);
  progressLocation(s, s.activeLocation!, 5);
  check(s);
  assert.equal(allEngaged(s)[0].id, enemy.id);
  assert.equal(allEngaged(s)[0].damage, 3);
  assert.equal(s.cobas!.belfalas.length, 0);
  assert.ok(s.victoryCards!.includes(C.belfalas));
});
test("Belfalas excludes guarding enemies and its optional response can be declined", () => {
  let s = base();
  const island = add(s, C.belfalas),
    o = add(s, C.gull),
    guard = add(s, C.siege),
    enemy = add(s, C.flagship);
  guard.guarding = o.id;
  s.phase = "travel";
  s = applyAction(s, { type: "TRAVEL", id: island.id });
  assert.ok(!s.choice!.options.some((o) => o.id === guard.id));
  assert.ok(s.choice!.options.some((o) => o.id === enemy.id));
  s = choose(s, "skip");
  assert.equal(s.cobas!.belfalas.length, 0);
});
test("Dol Amroth Warship receives on-course bonuses and returns physical card on destruction without elimination", () => {
  const s = base();
  const index = s.cobas!.setAside.findIndex((u) => u.code === C.warship),
    ship = s.cobas!.setAside.splice(index, 1)[0];
  ship.owner = 0;
  ship.controller = 0;
  s.allies.push(ship);
  assert.deepEqual(
    [stats(s, ship).will, stats(s, ship).attack, stats(s, ship).defense],
    [4, 4, 4],
  );
  s.sailing!.heading = 1;
  assert.equal(stats(s, ship).will, 2);
  damage(s, ship.id, 8);
  assert.equal(s.status, "playing");
  assert.ok(s.cobas!.setAside.some((u) => u.id === ship.id && u.damage === 0));
  assert.ok(!s.used.includes("game:ship-controller-eliminated"));
  reload(s);
});
test("The Beacon spends only acting player resources and transfers one original Warship", () => {
  let s = base(2);
  const beacon = add(s, C.beacon);
  selectSeat(s, 1);
  const before = seatView(s, 1).heroes.reduce((n, h) => n + h.resources, 0),
    other = seatView(s, 0).heroes.reduce((n, h) => n + h.resources, 0);
  cobasAbility(s, beacon);
  s = finish(s);
  assert.equal(
    seatView(s, 1).heroes.reduce((n, h) => n + h.resources, 0),
    before - 5,
  );
  assert.equal(
    seatView(s, 0).heroes.reduce((n, h) => n + h.resources, 0),
    other,
  );
  assert.equal(
    allCharacters(s).filter((u) => u.code === C.warship && ownerOf(s, u) === 1)
      .length,
    1,
  );
  assert.equal(s.cobas!.setAside.filter((u) => u.code === C.warship).length, 1);
  reload(s);
});
test("Taking on Water damages its Ship on actual exhaustion and can be paid by3 distinct characters", () => {
  let s = base();
  const ship = s.allies.find(isShipObjective)!;
  ship.attachments.push({ id: "water-test", code: C.water, exhausted: false });
  exhaustCharacter(s, ship);
  s = finish(s);
  assert.equal(s.allies.find((u) => u.id === ship.id)!.damage, 2);
  exhaustCharacter(
    s,
    s.allies.find((u) => u.id === ship.id)!,
  );
  s = finish(s);
  assert.equal(s.allies.find((u) => u.id === ship.id)!.damage, 2);
  cobasAbility(
    s,
    s.allies.find((u) => u.id === ship.id)!,
    "water-test",
  );
  s = finish(s);
  assert.equal(
    s.allies
      .find((u) => u.id === ship.id)!
      .attachments.filter((a) => a.code === C.water).length,
    0,
  );
  assert.equal(s.heroes.filter((u) => u.exhausted).length, 3);
  assert.ok(s.encounterDiscard.includes(C.water));
});
test("Taking on Water shadow transfers that physical shadow to a defending Ship", () => {
  const s = base(),
    ship = s.allies.find(isShipObjective)!,
    enemy = make(s, C.siege);
  enemy.shadows = [C.water];
  enemy.revealedShadowCount = 1;
  s.engaged.push(enemy);
  s.combat = {
    enemyId: enemy.id,
    defenderId: ship.id,
    attackBonus: 0,
    damageDealt: 0,
  };
  shadow(s, C.water);
  assert.equal(enemy.shadows.length, 0);
  assert.ok(ship.attachments.some((a) => a.code === C.water));
  reload(s);
});
test("Ramming Speed on-course raises each player threat by2 without an attack", () => {
  let s = base(2);
  s.engaged.push(make(s, C.siege));
  revealed(s, C.ramming);
  s = finish(s);
  assert.equal(seatView(s, 0).threat, 22);
  assert.equal(seatView(s, 1).threat, 22);
  assert.equal(s.cobas!.rammingThreat, 0);
});
test("Ramming Speed bonus records only actual combat damage from its own attack and expires at phase change", () => {
  const s = base(),
    ship = s.allies.find(isShipObjective)!,
    enemy = make(s, C.siege);
  s.engaged.push(enemy);
  s.combat = {
    enemyId: enemy.id,
    defenderId: ship.id,
    attackBonus: 0,
    damageDealt: 0,
    cobasRamming: true,
  };
  damage(s, ship.id, 3, { combatDamage: true, enemyId: enemy.id });
  assert.equal(stagingThreat(s), 3);
  cobasDamageDealt(s, ship, 2, { combatDamage: true, enemyId: "other" });
  assert.equal(stagingThreat(s), 3);
  s.phase = "travel";
  check(s);
  assert.equal(s.cobas!.rammingThreat, 0);
});
test("Corsair Skirmisher optional capture discards3will allies and preserves physical ID as dynamic Ship ally", () => {
  let s = base();
  setStage(s, 2);
  const enemy = make(s, C.skirmisher);
  s.engaged.push(enemy);
  const ally = make(s, "01073");
  s.allies.push(ally);
  destroy(s, enemy);
  flush(s);
  s = choose(reload(s), "capture");
  s = choose(s, ally.id);
  s = choose(reload(s), "pay");
  const captured = s.allies.find((u) => u.id === enemy.id)!;
  assert.ok(captured);
  assert.equal(s.cobas!.capturePending.length, 0);
  assert.equal(s.encounterDiscard.filter((c) => c === C.skirmisher).length, 0);
  assert.ok(!allEngaged(s).some((u) => u.id === enemy.id));
  assert.equal(captured.damage, 0);
  assert.equal(unitType(captured), "ship-objective");
  assert.ok(isAlly(captured));
  assert.equal(stats(s, captured).will, 3);
  assert.ok(s.discard.includes(ally.code));
  assert.ok(!shipCanAttack(make(s, C.sailor), captured));
  assert.ok(shipCanDefend(make(s, C.siege), captured));
  s = reload(s);
  damage(s, captured.id, 6);
  assert.equal(s.status, "playing");
  assert.equal(s.encounterDiscard.filter((c) => c === C.skirmisher).length, 1);
  assert.ok(!allCharacters(s).some((u) => u.id === enemy.id));
});
test("Declining Skirmisher capture puts exactly one card in encounter discard", () => {
  let s = base();
  setStage(s, 2);
  const enemy = make(s, C.skirmisher);
  s.engaged.push(enemy);
  destroy(s, enemy);
  flush(s);
  s = choose(reload(s), "decline");
  assert.equal(s.cobas!.capturePending.length, 0);
  assert.equal(s.encounterDiscard.filter((c) => c === C.skirmisher).length, 1);
});
test("Shared Corsair discard returns to independent deck and Raid Leader takes each hero resource", () => {
  let s = base();
  setStage(s, 2);
  s.cobas!.corsairDeck = [C.leader];
  s.cobas!.corsairDiscard = [];
  voyageEffect(s, fx("voyageBoard", { player: 0 }));
  s = finish(s);
  const leader = allEngaged(s).find((u) => u.code === C.leader)!;
  assert.ok(leader);
  assert.equal(leader.resources, 3);
  assert.equal(s.heroes[0].resources, 9);
  destroy(s, leader);
  assert.deepEqual(s.cobas!.corsairDeck, [C.leader]);
  assert.ok(!s.encounterDiscard.includes(C.leader));
});
test("Corrupt Cobas hidden piles, duplicate physical units, illegal captured flags and quest order fail save", () => {
  for (const corrupt of [
    (s: GameState) => s.cobas!.corsairDeck.push(C.water),
    (s: GameState) => s.cobas!.setAside.push(s.cobas!.setAside[0]),
    (s: GameState) => (s.heroes[0].cobasShipObjective = true),
    (s: GameState) => s.cobas!.questDeck.reverse(),
    (s: GameState) => s.cobas!.pendingGuarded.push("missing-objective"),
    (s: GameState) => {
      const o = add(s, C.beacon);
      s.cobas!.pendingGuarded.push(o.id, o.id);
    },
    (s: GameState) => {
      const g = add(s, C.heavy);
      g.cobasGuarding = ["missing-objective"];
    },
    (s: GameState) => {
      const o = add(s, C.beacon),
        g = add(s, C.heavy);
      g.guarding = o.id;
      g.cobasGuarding = [o.id];
    },
    (s: GameState) => {
      const a = add(s, C.beacon),
        b = add(s, C.heron),
        g = add(s, C.scout);
      g.guarding = a.id;
      g.cobasGuarding = [b.id];
    },
  ]) {
    const s = base();
    corrupt(s);
    assert.equal(validateSave(s), false);
  }
});
test("Warship discard and destruction while blanked use encounter discard, not its Forced set-aside destination", () => {
  for (const [destruction, blanked] of [
    [false, false],
    [true, true],
  ]) {
    const s = base(),
      index = s.cobas!.setAside.findIndex((u) => u.code === C.warship),
      ship = s.cobas!.setAside.splice(index, 1)[0];
    ship.owner = 0;
    ship.controller = 0;
    ship.blanked = blanked;
    s.allies.push(ship);
    if (blanked) {
      assert.equal(cobasRemoveCharacter(s, ship, true), false);
      continue;
    }
    destroy(s, ship, destruction);
    assert.equal(s.status, "playing");
    assert.ok(!s.cobas!.setAside.some((u) => u.id === ship.id));
    assert.ok(s.encounterDiscard.includes(C.warship));
    reload(s);
  }
});
test("Taking on Water destroying a Sailing participant removes its stale committed ID and save remains valid", () => {
  let s = base();
  const index = s.cobas!.setAside.findIndex((u) => u.code === C.warship),
    ship = s.cobas!.setAside.splice(index, 1)[0];
  ship.owner = 0;
  ship.controller = 0;
  ship.damage = 7;
  ship.attachments.push({
    id: "water-sailing",
    code: C.water,
    exhausted: false,
  });
  s.allies.push(ship);
  s.phase = "quest";
  beginSailingTest(s);
  s = choose(s, ship.id);
  assert.ok(!s.sailing!.test!.committedIds.includes(ship.id));
  assert.ok(s.cobas!.setAside.some((u) => u.id === ship.id));
  reload(s);
});
test("Ramming immediate attack retains identity after defender declaration and counts actual3damage", () => {
  let s = base();
  setStage(s, 2);
  s.phase = "staging";
  s.sailing!.heading = 1;
  const enemy = make(s, C.heavy),
    ship = s.allies.find((u) => u.code === C.dream)!;
  s.engaged.push(enemy);
  s.encounterDeck = [C.haven, ...s.encounterDeck];
  revealed(s, C.ramming);
  flush(s);
  s = pick(s, enemy.id);
  assert.ok(s.combat!.cobasRamming);
  s = pick(s, ship.id);
  s = settle(s);
  assert.equal(s.allies.find((u) => u.id === ship.id)!.damage, 3);
  assert.equal(s.cobas!.rammingThreat, 3);
  assert.equal(stagingThreat(s), 3);
  reload(s);
  s.phase = "quest";
  check(s);
  assert.equal(s.cobas!.rammingThreat, 3);
  s.phase = "travel";
  check(s);
  assert.equal(s.cobas!.rammingThreat, 0);
});
test("Ramming chooses printed highest actual attack even when that enemy cannot attack, gaining Doomed2", () => {
  let s = base();
  setStage(s, 2);
  s.sailing!.heading = 1;
  const heavy = make(s, C.heavy),
    scout = make(s, C.scout);
  heavy.feinted = true;
  s.engaged.push(heavy, scout);
  revealed(s, C.ramming);
  flush(s);
  assert.equal(s.choice!.options.length, 1);
  assert.equal(s.choice!.options[0].id, heavy.id);
  s = pick(s, heavy.id);
  s = settle(s);
  assert.equal(s.threat, 22);
  assert.equal(s.combat, null);
  assert.equal(s.cobas!.rammingThreat, 0);
});
test("Ramming gained Doomed2 offers printed Orthanc Guard response", () => {
  let s = base();
  const guard = make(s, "07004");
  guard.exhausted = true;
  s.allies.push(guard);
  revealed(s, C.ramming);
  flush(s);
  assert.match(s.choice!.title, /Orthanc Guard/);
  s = choose(s, "use");
  assert.equal(s.allies.find((u) => u.id === guard.id)!.exhausted, false);
  s = settle(s);
  assert.equal(s.threat, 22);
});
test("Gained Surge uses the real surge response window before revealing the next card", () => {
  let s = base();
  const lanwyn = make(s, "12030");
  s.heroes.push(lanwyn);
  lanwyn.exhausted = true;
  s.encounterDeck = [C.coast, C.water];
  revealed(s, C.assault);
  flush(s);
  assert.match(s.choice!.title, /Lanwyn/);
  s = choose(s, "ready");
  assert.equal(s.heroes.find((u) => u.id === lanwyn.id)!.exhausted, false);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === C.coast));
});
test("Recruited Warship and captured Skirmisher do not retain modifiers from an earlier play instance", () => {
  let s = base();
  const index = s.cobas!.setAside.findIndex((u) => u.code === C.warship),
    ship = s.cobas!.setAside.splice(index, 1)[0];
  ship.owner = 0;
  ship.controller = 0;
  ship.roundAttack = 5;
  ship.roundDefense = 2;
  ship.tempWill = 3;
  ship.tempAttack = 2;
  s.allies.push(ship);
  destroy(s, ship);
  const fresh = s.cobas!.setAside.find((u) => u.id === ship.id)!;
  assert.equal(fresh.roundAttack, undefined);
  assert.equal(fresh.roundDefense, undefined);
  assert.equal(fresh.tempWill, undefined);
  assert.equal(fresh.tempAttack, undefined);
  setStage(s, 2);
  const enemy = make(s, C.skirmisher);
  enemy.roundAttack = 4;
  enemy.tempDefense = 7;
  enemy.noEngagementRound = s.round;
  s.engaged.push(enemy);
  const ally = make(s, "01073");
  s.allies.push(ally);
  destroy(s, enemy);
  flush(s);
  s = choose(s, "capture");
  s = choose(s, ally.id);
  s = choose(s, "pay");
  const captured = s.allies.find((u) => u.id === enemy.id)!;
  assert.equal(captured.roundAttack, undefined);
  assert.equal(captured.tempDefense, undefined);
  assert.equal(captured.noEngagementRound, undefined);
  assert.equal(stats(s, captured).attack, 4);
  reload(s);
});
test("Heavy Cruiser revealed by Guarded guards both original and searched objectives until it leaves play", () => {
  let s = base();
  const original = add(s, C.sea);
  s.encounterDeck = [C.beacon, C.coast, C.water];
  revealed(s, C.heavy, original.id);
  s = finish(s);
  const fetched = s.staging.find((u) => u.code === C.beacon)!,
    heavy = s.staging.find((u) => u.code === C.heavy)!;
  assert.equal(heavy.guarding, original.id);
  assert.deepEqual(heavy.cobasGuarding, [fetched.id]);
  assert.ok(cobasGuardsObjective(heavy, original.id));
  assert.ok(cobasGuardsObjective(heavy, fetched.id));
  assert.equal(cobasObjectiveControlled(s, original), false);
  assert.equal(cobasObjectiveControlled(s, fetched), false);
  assert.equal(s.encounterDeck.length, 2);
  s = reload(s);
  destroy(
    s,
    s.staging.find((u) => u.id === heavy.id)!,
  );
  assert.equal(cobasObjectiveControlled(s, original), true);
  assert.equal(cobasObjectiveControlled(s, fetched), true);
  reload(s);
});
test("Raiders' Assault cannot target an objective whose Guarded keyword is still pending", () => {
  let s = base();
  setStage(s, 2);
  const available = add(s, C.heron),
    scout = make(s, C.scout);
  s.engaged.push(scout);
  s.encounterDeck = [C.assault, C.coast];
  revealed(s, C.beacon);
  flush(s);
  assert.match(s.choice!.title, /Raiders/);
  const pending = s.staging.find((u) => u.code === C.beacon)!;
  assert.ok(s.cobas!.pendingGuarded.includes(pending.id));
  assert.equal(cobasObjectiveControlled(s, pending), false);
  assert.equal(cobasObjectiveControlled(s, available), true);
  assert.ok(
    s.choice!.options.every((o) => o.id.startsWith(available.id + ":")),
  );
  s = choose(reload(s), `${available.id}:${scout.id}`);
  s = settle(s);
  assert.equal(
    s.staging.find((u) => u.id === scout.id)!.guarding,
    available.id,
  );
  // The treachery was the Beacon's Guarded reveal, so its resolved effect frees it.
  assert.equal(cobasObjectiveControlled(s, pending), true);
  assert.deepEqual(s.cobas!.pendingGuarded, []);
  assert.equal(s.encounterDeck.length, 1);
  reload(s);
});
test("nested Guarded objectives resolve original first and remain unavailable to Raiders' Assault", () => {
  let s = base();
  setStage(s, 2);
  const scout = make(s, C.scout);
  s.staging.push(scout);
  s.encounterDeck = [C.heron, C.assault, C.coast, C.haven];
  revealed(s, C.sea);
  s = finish(s);
  const original = s.staging.find((u) => u.code === C.sea)!,
    nested = s.staging.find((u) => u.code === C.heron)!,
    coast = s.staging.find((u) => u.code === C.coast)!,
    haven = s.staging.find((u) => u.code === C.haven)!;
  assert.equal(s.staging.find((u) => u.id === scout.id)!.guarding, undefined);
  assert.equal(
    coast.guarding,
    undefined,
    "Assault surges without assigning either pending objective",
  );
  assert.equal(
    haven.guarding,
    nested.id,
    "nested objective gets its own Guarded card after original",
  );
  assert.equal(
    cobasObjectiveControlled(s, original),
    true,
    "original treachery guard is resolved",
  );
  assert.equal(cobasObjectiveControlled(s, nested), false);
  assert.deepEqual(s.cobas!.pendingGuarded, []);
  reload(s);
});
test("Belfalas held enemy keeps its damage but phase and round modifiers expire out of play", () => {
  const s = base();
  setStage(s, 2);
  const island = make(s, C.belfalas),
    enemy = make(s, C.scout);
  enemy.damage = 3;
  enemy.tempAttack = 5;
  enemy.roundAttack = 2;
  enemy.tempEngagement = -10;
  s.activeLocation = island;
  s.cobas!.belfalas.push({ locationId: island.id, enemy });
  phaseEnd(s);
  assert.equal(enemy.tempAttack, 0);
  assert.equal(enemy.roundAttack, 2);
  handle(s, fx("nextRound"));
  assert.equal(enemy.roundAttack, undefined);
  assert.equal(enemy.tempEngagement, undefined);
  assert.equal(enemy.damage, 3);
  reload(s);
});
test("Strider’s Path cannot offer or spend its event to travel to off-course Belfalas", () => {
  let s = base();
  s.phase = "quest";
  s.sailing!.heading = 1;
  s.heroes[0] = make(s, "01012");
  s.heroes[0].resources = 3;
  const path = make(s, "02009");
  s.hand = [path];
  revealed(s, C.belfalas);
  s = finish(s);
  assert.equal(s.choice, null);
  assert.equal(s.activeLocation, null);
  assert.ok(s.hand.some((u) => u.id === path.id));
  const island = s.staging.find((u) => u.code === C.belfalas)!;
  assert.throws(
    () => handle(s, fx("huntStriderPath", { target: island.id })),
    /no longer in staging/,
  );
  assert.ok(s.hand.some((u) => u.id === path.id));
});
test("Moving off-course Belfalas active without travelling remains legal and does not offer its travel response", () => {
  const s = base();
  s.sailing!.heading = 1;
  const island = add(s, C.belfalas);
  add(s, C.flagship);
  handle(s, fx("travelEnter", { target: island.id, flag: true }));
  flush(s);
  assert.equal(s.activeLocation!.id, island.id);
  assert.equal(s.choice, null);
  assert.equal(s.cobas!.belfalas.length, 0);
  reload(s);
});
