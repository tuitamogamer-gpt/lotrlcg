import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, publicState, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  engagementCost,
  fx,
  get,
  make,
  stageInfo,
  stats,
  threatOf,
} from "../src/game/core";
import {
  check,
  damage,
  destroy,
  engage,
  progress,
  progressLocation,
  raiseThreat,
  revealed,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  activeSeat,
  firstPlayer,
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
} from "../src/game/table";
import {
  consideredEngaged,
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import { reduceThreat } from "../src/game/threat-reduction";
import {
  ULFAST as U,
  ULFAST_QUESTS,
  ULFAST_RECIPES,
} from "../src/game/ulfast-support";
import { ULFAST_HOOKS as hooks, ulfastShadow } from "../src/game/ulfast";
import { addQuestProgress } from "../src/game/side-quests";
import { base, start, choose, reload, settle } from "./ulfast-fixtures";
import type { GameState } from "../src/game/types";

const staged = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const guard = (s: GameState) => s.staging.find((u) => u.code === U.guard)!;
const reveal = (s: GameState, code: string) => {
  revealed(s, code);
  flush(s);
  return s;
};
const finish = (s: GameState) => {
  check(s);
  flush(s);
  return settle(s);
};
const stage = (s: GameState, n: number) => {
  s.stage = n;
  s.ulfast!.currentQuest = ULFAST_QUESTS[n - 1].code;
  s.progress = 0;
};
const next = (s: GameState) => settle(applyAction(reload(s), { type: "NEXT" }));

for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`Ulfast ${easy ? "easy" : "normal"} native ${players}-player setup conserves every original card and distinct location choice`, () => {
      const s = start(players, easy, 91, true, true);
      assert.equal(s.phase, "resource");
      assert.equal(s.ulfast!.initialized, true);
      assert.equal(s.staging.length, players + 1);
      assert.equal(new Set(s.ulfast!.setupChosen).size, players);
      assert.equal(s.activeLocation, null);
      assert.equal(s.ulfast!.resources, 0);
      assert.equal(stageInfo(s).quest, 5);
      const physical = [
        ...s.encounterDeck,
        ...s.encounterDiscard,
        ...s.staging.map((u) => u.code),
      ].sort();
      const recipe = ULFAST_RECIPES.find(
        (r) => r.mode === (easy ? "easy" : "standard"),
      )!;
      assert.deepEqual(
        physical,
        recipe.cards
          .filter((r) => r.section !== "sharedQuestDeck")
          .flatMap((r) => Array<string>(r.quantity).fill(r.code))
          .sort(),
      );
      assert.equal(physical.length, easy ? 32 : 43);
      reload(s);
    });
test("Ulfast classic solo starts with one guard and one chosen location", () => {
  const s = start(1, false, 93, false, false);
  assert.equal(s.table, undefined);
  assert.equal(s.staging.length, 2);
  reload(s);
});
test("City Guard variable threat, resource engagement reduction, Market and Extra Vigil stack per physical card", () => {
  const s = base(2),
    g = guard(s);
  s.ulfast!.resources = 3;
  assert.equal(threatOf(s, g), 4);
  assert.equal(engagementCost(s, g), 30);
  assert.equal(stats(s, g).attack, 9);
  assert.equal(stats(s, g).health, 20);
  s.activeLocation = make(s, U.market);
  assert.equal(engagementCost(s, g), 50);
  g.attachments.push({ id: `a${s.nextId++}`, code: U.vigil, exhausted: false });
  staged(s, U.cat);
  assert.equal(engagementCost(s, g), 30);
  forOwner(s, 0, () => (s.threat = 29));
  forOwner(s, 1, () => (s.threat = 30));
  assert.equal(consideredEngaged(s, g, 0), false);
  assert.equal(consideredEngaged(s, g, 1), true);
  assert.equal(engagedEnemies(s, 1).filter((u) => u.id === g.id).length, 1);
  assert.equal(seatView(s, 1).engaged.length, 0);
  destroy(s, g, false);
  assert.ok(get(s, g.id));
  reload(s);
});
test("Guard caps total combat damage at 5/10/15/20, remains in staging and final progress waits for its last hit point", () => {
  let s = base();
  const id = guard(s).id;
  for (const n of [1, 2, 3, 4]) {
    stage(s, n);
    assert.equal(damage(s, id, 50, { combatDamage: true }), true);
    assert.equal(get(s, id)!.damage, 5 * n);
    assert.ok(get(s, id));
    assert.equal(damage(s, id, 1, { combatDamage: true }), false);
  }
  get(s, id)!.damage = 19;
  s.progress = 20;
  s = finish(s);
  assert.equal(s.status, "playing");
  damage(s, id, 1, { combatDamage: true });
  s = finish(s);
  assert.equal(s.status, "won");
});
test("Stages 2 and 3 persist per-seat choices and reset main-quest resources; stage 4 adds enemies without revealing them", () => {
  let s = base(2);
  s.ulfast!.resources = 4;
  progress(s, 5);
  flush(s);
  assert.equal(s.stage, 2);
  assert.equal(s.ulfast!.resources, 0);
  assert.equal(s.stageRevealing, true);
  assert.equal(activeSeat(s), 0);
  s = choose(s, "threat");
  assert.equal(seatView(s, 0).threat, 25);
  assert.equal(activeSeat(s), 1);
  s = choose(s, "threat");
  assert.equal(seatView(s, 1).threat, 25);
  assert.equal(s.stageRevealing, false);
  assert.equal(stageInfo(s).quest, 10);
  progress(s, 10);
  flush(s);
  s = choose(s, "threat");
  s = choose(s, "threat");
  assert.equal(s.stage, 3);
  assert.equal(stageInfo(s).quest, 15);
  s.encounterDeck = [U.agent, U.agent, U.market];
  s.encounterDiscard = [];
  progress(s, 15);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 4);
  assert.equal(s.staging.filter((u) => u.code === U.agent).length, 2);
  assert.equal(
    seatView(s, 0).threat,
    30,
    "adding enemies is not revealing their effects",
  );
  assert.equal(stageInfo(s).quest, 20);
  reload(s);
});
test("End of round adds one resource and each staging Lawn adds one refresh threat", () => {
  let s = base(2);
  staged(s, U.lawn);
  staged(s, U.lawn);
  handle(s, fx("refreshReady"));
  flush(s);
  s = settle(s);
  s = next(s);
  assert.equal(s.ulfast!.resources, 1);
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 23);
});
test("Guarded Archway prevents only considered-engaged players from lowering threat", () => {
  const s = base(2);
  staged(s, U.archway);
  forOwner(s, 0, () => {
    s.threat = 45;
    reduceThreat(s, 5, "01046");
    assert.equal(s.threat, 45);
  });
  forOwner(s, 1, () => {
    s.threat = 40;
    reduceThreat(s, 5, "01046");
    assert.equal(s.threat, 35);
  });
});
test("Ulfast Sentry uses X attack and offers one resource or immediate attack on engagement", () => {
  let s = base(),
    u = staged(s, U.sentry);
  s.ulfast!.resources = 2;
  assert.equal(stats(s, u).attack, 3);
  engage(s, u);
  flush(s);
  assert.match(s.choice!.title, /Ulfast Sentry/);
  s = choose(s, "resource");
  assert.equal(s.ulfast!.resources, 3);
  assert.equal(stats(s, get(s, u.id)!).attack, 4);
});
test("Ulchor's Agent raises every player's threat while We've Been Seen counts each seat's allies", () => {
  let s = base(2);
  s = reveal(s, U.agent);
  s = settle(s);
  assert.equal(seatView(s, 0).threat, 23);
  assert.equal(seatView(s, 1).threat, 23);
  forOwner(s, 1, () => s.allies.push(make(s, "01060")));
  s = reveal(s, U.seen);
  assert.equal(s.ulfast!.resolving.length, 1);
  s = choose(s, "threat");
  s = choose(s, "threat");
  assert.equal(seatView(s, 0).threat, 24);
  assert.equal(seatView(s, 1).threat, 25);
  assert.equal(s.ulfast!.resolving.length, 0);
  assert.equal(s.encounterDiscard.filter((c) => c === U.seen).length, 1);
});
test("Patrolling the Streets adds the resource before its threat choice and blocks only the current quest during the phase", () => {
  let s = base(2);
  s.phase = "quest";
  s = reveal(s, U.patrol);
  s = choose(s, "threat");
  assert.equal(s.ulfast!.resources, 1);
  assert.equal(seatView(s, 0).threat, 22);
  assert.equal(seatView(s, 1).threat, 22);
  s = reveal(s, U.patrol);
  s = choose(s, "progress");
  progress(s, 4);
  assert.equal(s.progress, 0);
  const side = staged(s, U.cat);
  addQuestProgress(s, side, 1);
  assert.equal(side.progress, 1);
  s.phase = "travel";
  progress(s, 4);
  assert.equal(s.progress, 4);
});
test("Extra Vigil is one physical attachment and its optional response pays threat before discarding", () => {
  let s = base();
  s = reveal(s, U.vigil);
  const g = guard(s),
    a = g.attachments[0];
  assert.ok(a);
  assert.equal(s.encounterDiscard.includes(U.vigil), false);
  hooks.playerAttackResolved!(s, g, [], 1, 20);
  flush(s);
  s = choose(s, "discard");
  assert.equal(s.threat, 21);
  assert.equal(guard(s).attachments.length, 0);
  assert.equal(s.encounterDiscard.filter((c) => c === U.vigil).length, 1);
});
test("Extra Vigil shadow transfers the resolved shadow without discarding or skipping its following shadow", () => {
  const s = base(),
    g = guard(s);
  g.shadows = [U.vigil, U.messenger];
  g.revealedShadowCount = 1;
  s.combat = { enemyId: g.id, defenderId: null, attackBonus: 0 };
  assert.equal(ulfastShadow(s, U.vigil), true);
  assert.deepEqual(g.shadows, [U.messenger]);
  assert.equal(g.revealedShadowCount, 0);
  assert.equal(g.attachments[0].code, U.vigil);
  reload(s);
});
test("All restored shadows retain their native effects and validate during resolution", () => {
  const s = base(),
    u = staged(s, U.elite);
  s.ulfast!.resources = 3;
  s.combat = { enemyId: u.id, defenderId: null, attackBonus: 0 };
  for (const c of [
    U.elite,
    U.agent,
    U.seen,
    U.patrol,
    U.streets,
    U.underGuard,
    U.messenger,
  ])
    assert.equal(ulfastShadow(s, c), true);
  assert.equal(s.combat.extraAttacks, 1);
  assert.equal(s.combat.attackBonus, 6);
  assert.equal(s.combat.returnToStaging, true);
  assert.equal(s.combat.ulfastUnderGuard, 1);
  reload(s);
});
test("Catacombs prevents damage to staging enemies and Side Street prevents progress on other staging locations", () => {
  const s = base(),
    cat = staged(s, U.catacombs),
    street = staged(s, U.street),
    u = staged(s, U.agent);
  assert.equal(damage(s, u.id, 1, { combatDamage: true }), false);
  progressLocation(s, cat, 1);
  assert.equal(cat.progress, 0);
  progressLocation(s, street, 1);
  assert.equal(street.progress, 1);
  s.staging = s.staging.filter((l) => l.id !== cat.id);
  assert.equal(damage(s, u.id, 1, { combatDamage: true }), true);
});
test("Market and Side Street reshuffle the discard and add matching cards without when-revealed effects", () => {
  let s = base();
  const market = staged(s, U.market);
  s.phase = "travel";
  s.encounterDeck = [];
  s.encounterDiscard = [U.agent];
  s = settle(applyAction(reload(s), { type: "TRAVEL", id: market.id }));
  assert.equal(s.activeLocation?.code, U.market);
  assert.equal(s.threat, 20);
  assert.equal(
    s.staging.some((u) => u.code === U.agent),
    true,
  );
  s.activeLocation = null;
  s.phase = "travel";
  const street = staged(s, U.street);
  s.encounterDeck = [];
  s.encounterDiscard = [U.lawn];
  s = settle(applyAction(reload(s), { type: "TRAVEL", id: street.id }));
  assert.ok(s.staging.some((u) => u.code === U.lawn));
  assert.equal(s.ulfast!.resources, 0);
});
test("Under Guard repeats the active location travel effect and otherwise finds one location without reshuffling", () => {
  let s = base();
  s.activeLocation = make(s, U.lawn);
  s = reveal(s, U.underGuard);
  s = settle(s);
  assert.equal(s.ulfast!.resources, 1);
  s.activeLocation = null;
  s.encounterDeck = [U.agent, U.streets];
  s.encounterDiscard = [];
  s = reveal(s, U.underGuard);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === U.streets));
  assert.ok(s.encounterDiscard.includes(U.agent));
});
test("Servant stays with the first player and its threat response is limited once per actual phase", () => {
  let s = base(2);
  const u = staged(s, U.servant);
  hooks.cardEntered!(s, u, true, false);
  flush(s);
  s = settle(s);
  assert.ok(seatView(s, firstPlayer(s)).engaged.some((e) => e.id === u.id));
  s.phase = "quest";
  raiseThreat(s, 1);
  assert.equal(s.queue.filter((e) => e.kind === "immediateAttack").length, 1);
  s.queue = [];
  s.phase = "staging";
  raiseThreat(s, 1);
  assert.equal(s.queue.length, 0);
  s.phase = "travel";
  raiseThreat(s, 1);
  assert.equal(s.queue.filter((e) => e.kind === "immediateAttack").length, 1);
  s.queue = [];
  s.table!.first = 1;
  selectSeat(s, 1);
  hooks.check!(s);
  assert.ok(seatView(s, 1).engaged.some((e) => e.id === u.id));
  assert.equal(seatView(s, 0).engaged.length, 0);
});
test("Overwhelmed prevents damage to first-player enemies including City Guard for the round only", () => {
  let s = base(2);
  forOwner(s, 0, () => (s.threat = 45));
  s = reveal(s, U.overwhelmed);
  s = settle(s);
  assert.equal(damage(s, guard(s).id, 1, { combatDamage: true }), false);
  s.round++;
  assert.equal(damage(s, guard(s).id, 1, { combatDamage: true }), true);
});
test("Guard receives one normal combat attack per qualifying player and never duplicates its physical unit", () => {
  let s = base(2);
  for (const p of [0, 1])
    forOwner(s, p, () => {
      s.threat = 45;
      s.allies.push(make(s, "01060"));
    });
  s.phase = "encounter";
  for (let i = 0; i < 3 && s.phase === "encounter"; i++) s = next(s);
  let attacks = 0;
  while (s.phase === "defense" && attacks < 3) {
    assert.ok(normalAttackPending(s, guard(s)));
    const defender = s.allies[0];
    assert.ok(defender);
    s = settle(
      applyAction(reload(s), {
        type: "DEFEND",
        enemyId: guard(s).id,
        defenderId: defender.id,
      }),
    );
    attacks++;
  }
  assert.equal(attacks, 2);
  assert.equal(s.staging.filter((u) => u.code === U.guard).length, 1);
  assert.equal(guard(s).shadows.length, 0);
  assert.equal(s.encounterDiscard.length, 2);
  reload(s);
});
test("Ulfast save validation rejects corrupt resources, quest identity, combat counters and duplicate physical units", () => {
  const s = base();
  for (const mutate of [
    (s: GameState) => (s.ulfast!.resources = -1),
    (s: GameState) => (s.ulfast!.currentQuest = ULFAST_QUESTS[1].code),
    (s: GameState) => s.ulfast!.resolving.push(guard(s)),
    (s: GameState) =>
      (s.combat = {
        enemyId: guard(s).id,
        defenderId: null,
        attackBonus: 0,
        ulfastExcess: -1,
      }),
  ]) {
    const bad = structuredClone(s);
    mutate(bad);
    assert.equal(validateSave(bad), false);
  }
  const before = JSON.stringify(s);
  publicState(s);
  assert.equal(JSON.stringify(s), before);
  reload(s);
});
test("King's Elite makes a real additional attack and gains one main-quest resource for each attack", () => {
  let s = base();
  s.phase = "defense";
  const u = make(s, U.elite);
  u.shadows = [U.elite];
  s.engaged.push(u);
  s.heroes[0].tempDefense = 20;
  s.encounterDeck = [U.market];
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: u.id,
    defenderId: s.heroes[0].id,
  });
  assert.equal(s.ulfast!.resources, 2);
  assert.match(s.choice!.title, /Immediate attack/i);
  s = settle(s);
  assert.equal(
    [...s.encounterDiscard, ...get(s, u.id)!.shadows].filter(
      (c) => c === U.elite,
    ).length,
    1,
  );
  assert.equal(s.encounterDiscard.filter((c) => c === U.market).length, 1);
  reload(s);
});
test("Agent and Under Guard shadows resolve only after a character is actually destroyed", () => {
  let s = base(2);
  s.phase = "defense";
  const enemy = make(s, U.agent),
    defender = make(s, "01060");
  s.engaged.push(enemy);
  s.allies.push(defender);
  enemy.shadows = [U.agent, U.underGuard];
  s.activeLocation = make(s, U.lawn);
  s = settle(
    applyAction(reload(s), {
      type: "DEFEND",
      enemyId: enemy.id,
      defenderId: defender.id,
    }),
  );
  assert.equal(seatView(s, 0).threat, 21);
  assert.equal(seatView(s, 1).threat, 21);
  assert.equal(s.ulfast!.resources, 1);
  assert.ok(seatView(s, 0).discard.includes(defender.code));
  reload(s);
});
test("We've Been Seen assigns actual excess combat damage among the defending player's surviving characters", () => {
  let s = base(2);
  s.phase = "defense";
  const enemy = make(s, U.agent),
    defender = make(s, "01060");
  s.engaged.push(enemy);
  s.allies.push(defender);
  enemy.shadows = [U.seen];
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender.id,
  });
  assert.match(s.choice!.title, /Assign excess damage/);
  s = settle(s);
  assert.equal(
    seatView(s, 0).heroes.reduce((n, u) => n + u.damage, 0),
    3,
  );
  assert.equal(
    seatView(s, 1).heroes.reduce((n, u) => n + u.damage, 0),
    0,
  );
  reload(s);
});
test("Cat and Mouse defeat gives each player an independent optional enemy discard and victory points", () => {
  let s = base(2);
  const side = staged(s, U.cat),
    enemies: string[] = [];
  for (const p of [0, 1])
    forOwner(s, p, () => {
      const u = make(s, U.agent);
      s.engaged.push(u);
      enemies.push(u.id);
    });
  addQuestProgress(s, side, 10);
  flush(s);
  assert.match(s.choice!.title, /Cat and Mouse/);
  s = choose(s, enemies[0]);
  s = choose(s, "skip");
  assert.equal(get(s, enemies[0]), undefined);
  assert.ok(get(s, enemies[1]));
  assert.ok(s.victoryCards!.includes(U.cat));
  assert.equal(s.victory, 10);
  reload(s);
});
test("repeating a treachery's printed reveal effect never creates a second physical card", () => {
  let s = base();
  s.encounterDiscard = [U.patrol];
  handle(s, fx("resolvePrintedWhenRevealed", { code: U.patrol }));
  flush(s);
  s = choose(s, "progress");
  assert.equal(s.ulfast!.resources, 1);
  assert.equal(s.ulfast!.resolving.length, 0);
  assert.deepEqual(s.encounterDiscard, [U.patrol]);
  reload(s);
});
test("a newly revealed quest reverse applies its printed damage maximum to damage dealt during its front", () => {
  const s = base();
  stage(s, 3);
  s.stageRevealing = true;
  guard(s).damage = 20;
  hooks.check!(s);
  assert.equal(guard(s).damage, 20);
  handle(s, fx("stageRevealed"));
  check(s);
  assert.equal(guard(s).damage, 15);
  reload(s);
});
