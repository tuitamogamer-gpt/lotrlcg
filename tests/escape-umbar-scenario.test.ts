import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  fx,
  make,
  prepend,
  stats,
  threatOf,
  engagementCost,
  cannotReady,
} from "../src/game/core";
import {
  advanceQuest,
  check,
  damage,
  destroy,
  engage,
  progress,
  progressLocation,
  readyCharacter,
} from "../src/game/board";
import {
  addQuestProgress,
  checkSideQuestDefeats,
} from "../src/game/side-quests";
import { mainQuestUnit } from "../src/game/quest-state";
import { flush } from "../src/game/effects";
import {
  allCharacters,
  allEngaged,
  forOwner,
  playerOrder,
  seatView,
  syncSeat,
} from "../src/game/table";
import { UMBAR as C, UMBAR_RECIPES } from "../src/game/escape-umbar-support";
import {
  umbarAttackFinished,
  umbarCharacterDestroyed,
  umbarCombatEnd,
  umbarEffect,
  umbarRoundEnd,
  umbarShadow,
} from "../src/game/escape-umbar";
import { base, choose, reload, settle, start } from "./escape-umbar-fixtures";
import type { GameState } from "../src/game/types";
const add = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const finish = (s: GameState) => {
  flush(s);
  return settle(s);
};
for (const players of [1, 2, 3, 4])
  for (const easy of [false, true])
    test(`Umbar original ${players}p ${easy ? "easy" : "standard"} setup chooses distinct locations and physical Sentries`, () => {
      const s = reload(start(players, easy));
      assert.equal(s.umbar!.initialized, true);
      assert.equal(s.stage, 1);
      assert.equal(s.umbar!.currentQuest, C.stranded);
      const locations = s.staging.filter(
        (u) => card(u.code).type_code === "location",
      );
      assert.equal(locations.length, players);
      assert.equal(new Set(locations.map((u) => u.code)).size, players);
      assert.equal(s.staging.filter((u) => u.code === C.seize).length, 1);
      assert.equal(
        allEngaged(s).filter((u) => u.code === C.sentry).length,
        players,
      );
      assert.equal(
        s.encounterDeck.filter((c) => c === C.sentry).length,
        (easy ? 4 : 5) - players,
      );
      const recipe = UMBAR_RECIPES.find(
        (r) => r.mode === (easy ? "easy" : "standard"),
      )!;
      const total = recipe.cards
        .filter((c) =>
          ["sharedEncounterDeck", "sharedStagingArea"].includes(c.section),
        )
        .reduce((n, c) => n + c.quantity, 0);
      assert.equal(
        s.encounterDeck.length + s.staging.length + allEngaged(s).length,
        total,
      );
    });
test("Umbar caps ordinary and explicit main progress at 15 while an engaged enemy blocks advancement", () => {
  const s = base();
  const e = add(s, C.sentry);
  engage(s, e);
  s.queue = [];
  progress(s, 100);
  assert.equal(s.progress, 15);
  assert.equal(s.stage, 1);
  addQuestProgress(s, mainQuestUnit(s)!, 100);
  assert.equal(s.progress, 15);
});
test("Umbar stage 1 advances only when every hot-seat player's enemies are gone; stage 2 ends current phase", () => {
  let s = base(2);
  s.phase = "attack";
  const enemy = add(s, C.archer);
  forOwner(s, 1, () => engage(s, enemy));
  s.queue = [];
  s.progress = 15;
  advanceQuest(s);
  assert.equal(s.stage, 1);
  destroy(s, enemy);
  s = finish(s);
  assert.equal(s.stage, 2);
  assert.equal(s.umbar!.stageEnteredRound, s.round);
  assert.equal(s.progress, 0);
  assert.equal(s.phase, "refresh");
  reload(s);
});
test("Umbar stage 2 beginning-of-quest trigger adds exactly one enemy if any player has none", () => {
  let s = base(4);
  s.stage = 2;
  s.umbar!.completedQuests = [C.stranded];
  s.umbar!.currentQuest = C.flee;
  s.umbar!.questDeck = [];
  s.encounterDeck = [C.alley, C.sentry, C.soldier];
  prepend(s, fx("startQuest"));
  s = finish(s);
  assert.equal(s.staging.filter((u) => u.code === C.sentry).length, 1);
  assert.equal(allEngaged(s).length, 0);
  assert.equal(s.encounterDeck[0], C.soldier);
});
test("Seize them! ignores the round a stage entered but loses after a complete zero-progress round", () => {
  let s = base();
  add(s, C.seize);
  s.umbar!.stageEnteredRound = s.round;
  prepend(s, ...umbarRoundEnd(s));
  s = finish(s);
  assert.equal(s.status, "playing");
  s.round++;
  prepend(s, ...umbarRoundEnd(s));
  s = finish(s);
  assert.equal(s.status, "lost");
});
test("Seize removes main progress for actual character kills using modified enemy threat, ignoring selected side quest", () => {
  const s = base();
  add(s, C.seize);
  const enemy = add(s, C.soldier);
  add(s, C.captain);
  s.progress = 8;
  const side = add(s, C.hostile);
  side.progress = 3;
  s.sideQuestSelections = {
    shared: { id: side.id, code: side.code, phase: s.phase },
  };
  s.combat = { enemyId: enemy.id, defenderId: null, attackBonus: 0 };
  umbarCharacterDestroyed(s, s.heroes[0], {
    combatDamage: true,
    enemyId: enemy.id,
  });
  umbarAttackFinished(s, s.combat);
  flush(s);
  assert.equal(s.progress, 4);
  assert.equal(side.progress, 3);
});
test("Southron Champion keeps main and side stages undefeated and becomes damageable at four progress", () => {
  let s = base();
  const side = add(s, C.champion);
  s.encounterDeck = [C.alley, C.sentry];
  umbarEffect(s, fx("umbarChampion", { target: side.id }));
  s = finish(s);
  const champion = s.staging.find((u) => u.code === C.sentry)!;
  assert.equal(champion.resources, 1);
  assert.equal(threatOf(s, champion), 3);
  assert.equal(stats(s, champion).attack, 4);
  assert.equal(stats(s, champion).defense, 3);
  assert.equal(champion.immuneToPlayerEffects, true);
  damage(s, champion.id, 3);
  assert.equal(champion.damage, 0);
  addQuestProgress(s, side, 4);
  assert.ok(s.staging.some((u) => u.id === side.id));
  damage(s, champion.id, 3);
  checkSideQuestDefeats(s);
  assert.ok(!s.staging.some((u) => u.id === side.id));
  assert.ok((s.victoryCards ?? []).includes(C.champion));
  reload(s);
});
test("Narrow Alleyway stores a real out-of-play enemy and returns it to the first player on exploration", () => {
  let s = base(2);
  s.phase = "travel";
  const alley = add(s, C.alley);
  const enemy = add(s, C.soldier);
  forOwner(s, 1, () => engage(s, enemy));
  s.queue = [];
  s = applyAction(s, { type: "TRAVEL", id: alley.id });
  assert.match(s.choice!.title, /Narrow Alleyway/);
  s = choose(s, enemy.id);
  s = finish(s);
  assert.equal(allEngaged(s).length, 0);
  assert.equal(s.umbar!.underAlley[0].enemies[0].id, enemy.id);
  s = reload(s);
  progressLocation(s, s.activeLocation!, 2);
  check(s);
  s = finish(s);
  assert.equal(s.umbar!.underAlley.length, 0);
  assert.ok(seatView(s, 0).engaged.some((u) => u.id === enemy.id));
  reload(s);
});
test("Haradrim Estate blocks staging progress and its travel searches a Harad enemy before bypass progress", () => {
  let s = base();
  s.phase = "travel";
  const estate = add(s, C.estate);
  progressLocation(s, estate, 10);
  assert.equal(estate.progress, 0);
  s.encounterDeck = [C.captain, C.alley];
  s = applyAction(s, { type: "TRAVEL", id: estate.id });
  s = choose(s, s.choice!.options[0].id);
  s = finish(s);
  assert.equal(s.progress, 1);
  assert.equal(s.activeLocation?.code, C.estate);
  assert.ok(allEngaged(s).some((u) => u.code === C.captain));
  reload(s);
});
test("Port of Harad has X threat based on every engaged enemy", () => {
  const s = base(2);
  const port = add(s, C.port);
  const e1 = add(s, C.sentry),
    e2 = add(s, C.archer);
  engage(s, e1);
  forOwner(s, 1, () => engage(s, e2));
  assert.equal(threatOf(s, port), 2);
});
test("Umbar Street reduces enemy engagement costs by actual main-quest progress", () => {
  const s = base();
  const street = add(s, C.street);
  s.activeLocation = street;
  s.staging = [];
  s.progress = 9;
  const enemy = add(s, C.archer);
  assert.equal(engagementCost(s, enemy), 27);
});
test("Enfeebled exhausts each player's choice and stops all readying until combat ends", () => {
  let s = base(2);
  umbarEffect(s, fx("umbarEnfeebled"));
  s = finish(s);
  for (const p of playerOrder(s)) {
    const hero = seatView(s, p).heroes[0];
    assert.equal(hero.exhausted, true);
    assert.equal(cannotReady(hero, s), true);
    readyCharacter(s, hero);
    assert.equal(hero.exhausted, true);
  }
  umbarCombatEnd(s);
  for (const p of playerOrder(s)) {
    const hero = seatView(s, p).heroes[0];
    readyCharacter(s, hero, false);
    assert.equal(hero.exhausted, false);
  }
  reload(s);
});
test("In Enemy Territory enforces private hand limits for every seat and survives reload", () => {
  let s = base(2);
  add(s, C.hostile);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.hand = Array.from({ length: 7 }, () => make(s, "01050"));
    });
  check(s);
  s = finish(s);
  for (const p of playerOrder(s)) {
    assert.equal(seatView(s, p).hand.length, 5);
    assert.equal(seatView(s, p).discard.length, 2);
  }
  reload(s);
});
test("Southron Soldier shadow excludes unique Captain and handles ownership before dealing shadow", () => {
  let s = base(2);
  const attacker = add(s, C.sentry);
  const captain = add(s, C.captain),
    soldier = add(s, C.soldier);
  s.combat = {
    enemyId: attacker.id,
    defenderId: null,
    attackBonus: 0,
    attackPlayer: 1,
  };
  umbarShadow(s, C.soldier);
  flush(s);
  assert.ok(!s.choice!.options.some((o) => o.id === captain.id));
  s = choose(s, soldier.id);
  s = finish(s);
  assert.ok(seatView(s, 1).engaged.some((u) => u.id === soldier.id));
  assert.ok(
    allEngaged(s).find((u) => u.id === soldier.id)!.shadows.length === 1,
  );
  reload(s);
});
test("Nowhere to Hide shadow checks whether this physical attacker engaged this round", () => {
  const s = base();
  const enemy = add(s, C.sentry);
  engage(s, enemy);
  s.queue = [];
  s.combat = { enemyId: enemy.id, defenderId: null, attackBonus: 0 };
  umbarShadow(s, C.nowhere);
  assert.equal(s.combat.attackBonus, 2);
  s.used = [];
  s.combat.attackBonus = 0;
  umbarShadow(s, C.nowhere);
  assert.equal(s.combat.attackBonus, 1);
});
test("Umbar save rejects duplicate out-of-play identities and invalid stage histories", () => {
  const s = base();
  const enemy = make(s, C.sentry);
  s.umbar!.underAlley = [{ locationId: "alley", enemies: [enemy, enemy] }];
  syncSeat(s);
  assert.equal(validateSave(JSON.parse(JSON.stringify(s))), false);
  s.umbar!.underAlley = [];
  s.umbar!.questDeck = [];
  assert.equal(validateSave(JSON.parse(JSON.stringify(s))), false);
});

test("Umbar Sentry's attack choice removes one main progress or applies only this attack's bonus", () => {
  let s = base();
  const enemy = add(s, C.sentry);
  s.combat = { enemyId: enemy.id, defenderId: null, attackBonus: 0 };
  s.progress = 2;
  umbarEffect(s, fx("umbarSentryAttack", { target: enemy.id }));
  s = choose(s, "progress");
  assert.equal(s.progress, 1);
  assert.equal(s.combat!.attackBonus, 0);
  umbarEffect(s, fx("umbarSentryAttack", { target: enemy.id }));
  s = choose(s, "attack");
  assert.equal(s.progress, 1);
  assert.equal(s.combat!.attackBonus, 2);
  reload(s);
});
test("Enemy Pursuit offers main-progress removal or player-selected shared damage", () => {
  let s = base(2);
  s.progress = 3;
  umbarEffect(s, fx("umbarPursuit"));
  s = choose(s, "damage");
  assert.match(s.choice!.title, /Assign 3 damage/);
  const remote = seatView(s, 1).heroes[0];
  s = choose(s, remote.id);
  s = choose(s, s.heroes[0].id);
  s = choose(s, s.heroes[1].id);
  assert.equal(s.progress, 3);
  assert.equal(seatView(s, 1).heroes[0].damage, 1);
  assert.equal(s.heroes[0].damage, 1);
  assert.equal(s.heroes[1].damage, 1);
  reload(s);
});
test("Enemy Pursuit shadow schedules a fresh additional attack", () => {
  const s = base();
  const enemy = add(s, C.sentry);
  s.combat = { enemyId: enemy.id, defenderId: null, attackBonus: 0 };
  umbarShadow(s, C.pursuit);
  assert.equal(s.combat.extraAttacks, 1);
});
test("Nowhere to Hide discards real intervening cards and engages the first player without revealing the enemy", () => {
  let s = base(2);
  s.encounterDeck = [C.alley, C.injured, C.sentry, C.soldier];
  umbarEffect(s, fx("umbarNowhere"));
  s = finish(s);
  assert.deepEqual(s.encounterDiscard, [C.alley, C.injured]);
  assert.ok(seatView(s, 0).engaged.some((u) => u.code === C.sentry));
  assert.deepEqual(s.encounterDeck, [C.soldier]);
  assert.equal(s.staging.length, 0);
  reload(s);
});
test("Southron Captain affects only other staged Harad threats and the same engaged player's attacks", () => {
  const s = base(2);
  const captain = add(s, C.captain),
    soldier = add(s, C.soldier),
    archer = add(s, C.archer);
  assert.equal(threatOf(s, captain), 2);
  assert.equal(threatOf(s, soldier), 4);
  engage(s, captain);
  engage(s, soldier);
  forOwner(s, 1, () => engage(s, archer));
  s.queue = [];
  assert.equal(stats(s, soldier).attack, 4);
  assert.equal(stats(s, archer).attack, 4);
  assert.equal(stats(s, captain).attack, 5);
  assert.equal(threatOf(s, soldier), 3);
});
test("Enfeebled shadow only prevents its actual defending character's readying through round end", () => {
  const s = base();
  const enemy = add(s, C.sentry),
    hero = s.heroes[0];
  hero.exhausted = true;
  s.heroes[1].exhausted = true;
  s.combat = { enemyId: enemy.id, defenderId: hero.id, attackBonus: 0 };
  umbarShadow(s, C.enfeebled);
  umbarCombatEnd(s);
  readyCharacter(s, hero, false);
  readyCharacter(s, s.heroes[1], false);
  assert.equal(hero.exhausted, true);
  assert.equal(s.heroes[1].exhausted, false);
  reload(s);
});
test("Injured Companion shadow raises every player's threat only after a real combat character kill", () => {
  let s = base(2);
  const enemy = add(s, C.sentry);
  s.combat = { enemyId: enemy.id, defenderId: null, attackBonus: 0 };
  umbarShadow(s, C.injured);
  assert.equal(s.combat.attackBonus, 1);
  umbarCharacterDestroyed(s, s.heroes[0], {
    combatDamage: true,
    enemyId: enemy.id,
  });
  umbarAttackFinished(s, s.combat);
  s = finish(s);
  assert.equal(s.threat, 21);
  assert.equal(seatView(s, 1).threat, 21);
  reload(s);
});
test("Umbar Square offers optional progress after an actual enemy defeat, bypassing the active location", () => {
  let s = base();
  const square = make(s, C.square);
  s.activeLocation = square;
  const enemy = add(s, C.sentry);
  destroy(s, enemy);
  flush(s);
  assert.match(s.choice!.title, /Umbar Square/);
  s = choose(s, "progress");
  assert.equal(s.progress, 1);
  assert.equal(s.activeLocation!.progress, 0);
  reload(s);
});
test("Defeating Flee the City requires 15 progress and no player engaged with any enemy", () => {
  const s = base(2);
  s.stage = 2;
  s.umbar!.completedQuests = [C.stranded];
  s.umbar!.currentQuest = C.flee;
  s.umbar!.questDeck = [];
  s.progress = 15;
  const enemy = add(s, C.sentry);
  forOwner(s, 1, () => engage(s, enemy));
  s.queue = [];
  advanceQuest(s);
  assert.equal(s.status, "playing");
  destroy(s, enemy);
  assert.equal(s.status, "won");
});

test("Umbar Street's shadow can discard a player-controlled attachment on an enemy", () => {
  let s = base(2);
  const attacker = add(s, C.sentry),
    host = add(s, C.soldier);
  host.attachments.push({
    id: "physical-forest-snare",
    code: "01069",
    owner: 1,
    controller: 1,
    exhausted: false,
  });
  s.combat = {
    enemyId: attacker.id,
    defenderId: null,
    attackBonus: 0,
    attackPlayer: 1,
  };
  umbarShadow(s, C.street);
  flush(s);
  assert.ok(s.choice!.options.some((o) => o.id === "physical-forest-snare"));
  s = choose(s, "physical-forest-snare");
  assert.equal(s.staging.find((u) => u.id === host.id)!.attachments.length, 0);
  assert.ok(seatView(s, 1).discard.includes("01069"));
  reload(s);
});

test("Flee the City ends combat and shuffles every actual and suspended shadow before enemy searches", () => {
  const s = base();
  s.phase = "attack";
  s.progress = 15;
  s.encounterDeck = [];
  const staged = add(s, C.captain);
  staged.shadows = [C.alley];
  s.combat = {
    enemyId: staged.id,
    defenderId: null,
    attackBonus: 0,
    immediate: true,
    immediatePreviousShadows: [C.street],
  };
  umbarEffect(s, fx("umbarAdvance"));
  assert.equal(s.stage, 2);
  const continuation = s.queue.findIndex((e) => e.kind === "umbarFleeSetup");
  assert.ok(continuation >= 0);
  const [effect] = s.queue.splice(continuation, 1);
  umbarEffect(s, effect);
  assert.equal(staged.shadows.length, 0);
  assert.deepEqual([...s.encounterDeck].sort(), [C.alley, C.street].sort());
  assert.equal(s.combat, null);
  reload(s);
});

test("Exploring Narrow Alleyway returns its enemy before excess quest progress can advance", () => {
  let s = base(2);
  s.phase = "staging";
  const alley = make(s, C.alley),
    held = make(s, C.sentry);
  s.activeLocation = alley;
  s.umbar!.underAlley = [{ locationId: alley.id, enemies: [held] }];
  s.encounterDeck = [C.alley, C.sentry];
  progress(s, 17);
  s = finish(s);
  assert.equal(s.progress, 15);
  assert.equal(s.stage, 1);
  assert.equal(s.umbar!.advancing, false);
  assert.ok(seatView(s, 0).engaged.some((u) => u.id === held.id));
  assert.equal(s.umbar!.underAlley.length, 0);
  reload(s);
});
test("A queued Umbar advancement rechecks a newly engaged enemy before changing stage", () => {
  const s = base();
  s.progress = 15;
  advanceQuest(s);
  assert.equal(s.umbar!.advancing, true);
  const enemy = make(s, C.sentry);
  s.engaged.push(enemy);
  umbarEffect(s, fx("umbarAdvance"));
  assert.equal(s.stage, 1);
  assert.equal(s.umbar!.advancing, false);
  reload(s);
});
