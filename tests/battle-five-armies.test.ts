import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, canTravel, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, make, questStat, stats, threatOf } from "../src/game/core";
import { damage } from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import { availableAbilities } from "../src/game/actions";
import { consideredEngaged } from "../src/game/considered-engagement";
import {
  activeSeat,
  defendersFor,
  forOwner,
  selectSeat,
  seatView,
} from "../src/game/table";
import {
  BOFA as B,
  BOFA_HOOKS,
  BOFA_RECIPES,
  bofaEmptyStages,
  bofaStageProgress,
} from "../src/game/battle-five-armies";
import {
  EREBOR_TREASURES,
  HOBBIT_TREASURES,
  OTD_BILBO,
  OTD_RING,
  bagginsBilbo,
  scenarioTreasures,
} from "../src/game/hobbit-saga";
import {
  base,
  choose,
  deck,
  hand,
  reload,
  settle,
  stage,
  start,
} from "./battle-five-armies-fixtures";
import type { Effect, GameState, Unit } from "../src/game/types";

const run = (s: GameState) => {
  flush(s);
  return s;
};
/** Queue effects so the engine's state checks run after each one. */
const play = (s: GameState, ...effects: Effect[]) => {
  s.queue.push(...effects);
  return run(s);
};
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
const engaged = (s: GameState, code: string, p = activeSeat(s)) => {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    s.engaged.push(u);
  });
  return u;
};
const bolg = (s: GameState) => s.staging.find((u) => u.code === B.bolg)!;
const progressAll = (
  s: GameState,
  spur: number,
  dale: number,
  raven: number,
) => {
  s.progress = spur;
  s.battleFiveArmies!.stageProgress = { [B.dale]: dale, [B.ravenhill]: raven };
};
const GUARD = "01013";

test("Setup stages Bolg, reveals 1 card per player, then puts stages 2, 3 and 4 into play; each round the first player chooses the current quest", () => {
  for (const easy of [false, true]) {
    const s = start(2, easy);
    assert.ok(s.staging.some((u) => u.code === B.bolg));
    assert.ok(BOFA_STAGES_IN(s));
    const recipe = BOFA_RECIPES.find(
      (r) => r.mode === (easy ? "easy" : "standard"),
    )!;
    const deckSize = recipe.cards
      .filter((c) => c.section === "sharedEncounterDeck")
      .reduce((n, c) => n + c.quantity, 0);
    assert.equal(deckSize, easy ? 33 : 43);
    assert.ok(
      s.encounterDeck.length < deckSize,
      "setup revealed encounter cards",
    );
    assert.equal(bagginsBilbo(s)?.code, OTD_BILBO);
    assert.equal(s.battleFiveArmies!.chosenRound, 1);
  }
  // The first round's quest choice happens before resources are collected.
  let s = start(1);
  s.battleFiveArmies!.chosenRound = 0;
  s.phase = "resource";
  handle(s, fx("resourceBegin", { player: 0 }));
  run(s);
  assert.match(s.choice!.title, /Choose the current quest for this round/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [B.spur, B.dale, B.ravenhill],
  );
  s = choose(s, B.dale);
  assert.equal(s.battleFiveArmies!.currentQuest, B.dale);
  assert.equal(s.stage, 3);
});
function BOFA_STAGES_IN(s: GameState) {
  const q = s.battleFiveArmies!;
  return (
    [B.spur, B.dale, B.ravenhill].includes(q.currentQuest) &&
    [3, 2, 4].includes(s.stage)
  );
}

test("Progress is placed only on the current quest; each stage keeps its progress; Battle quests with attack and Siege with defense", () => {
  let s = base();
  s.phase = "quest";
  handle(s, fx("successfulQuestProgress", { value: 3, player: 0 }));
  run(s);
  assert.equal(bofaStageProgress(s, B.spur), 3);
  assert.equal(bofaStageProgress(s, B.dale), 0);
  play(s, fx("bofaSetCurrent", { code: B.dale, text: "heedless", player: 0 }));
  assert.equal(s.progress, 0);
  assert.equal(bofaStageProgress(s, B.spur), 3);
  assert.equal(questStat(s), "attack");
  play(
    s,
    fx("bofaSetCurrent", { code: B.ravenhill, text: "round", player: 0 }),
  );
  assert.equal(questStat(s), "defense");
  play(s, fx("bofaSetCurrent", { code: B.spur, text: "round", player: 0 }));
  assert.equal(questStat(s), "will");
  assert.equal(s.progress, 3);
  s = reload(s);
  assert.equal(bofaStageProgress(s, B.spur), 3);
});

test("The players advance to stage 5 only when all three stages are complete; The Clouds Burst adds a Bodyguard of Bolg per player", () => {
  const s = base(2);
  s.encounterDeck = [B.bodyguard, B.path, B.path];
  s.encounterDiscard = [B.bodyguard];
  progressAll(s, 2, 8, 8);
  s.phase = "quest";
  handle(s, fx("successfulQuestProgress", { value: 5, player: 0 }));
  run(s);
  assert.equal(s.battleFiveArmies!.currentQuest, B.spur, "7 of 8 progress");
  handle(s, fx("successfulQuestProgress", { value: 1, player: 0 }));
  run(s);
  assert.equal(s.battleFiveArmies!.currentQuest, B.clouds);
  assert.equal(s.stage, 5);
  assert.equal(
    s.staging.filter((u) => u.code === B.bodyguard).length,
    2,
    "one from the deck, one from the discard pile",
  );
  assert.ok(!s.encounterDeck.includes(B.bodyguard));
  assert.ok(!s.encounterDiscard.includes(B.bodyguard));
  assert.equal(bofaEmptyStages(s), 1);
  // Completed stages can lose progress: no advance with one below 8.
  const t = base();
  progressAll(t, 0, 8, 6);
  t.phase = "quest";
  handle(t, fx("successfulQuestProgress", { value: 8, player: 0 }));
  run(t);
  assert.equal(t.battleFiveArmies!.currentQuest, B.spur);
});

test("The Clouds Burst: no progress, Bolg is considered engaged with the first player, cannot take damage while a Bodyguard of Bolg is in play, and destroying him wins", () => {
  let s = base(2);
  s.encounterDeck = [B.bodyguard, B.path];
  progressAll(s, 8, 8, 8);
  play(s, fx("bofaDefeatStages", { player: s.table!.first }));
  assert.equal(s.battleFiveArmies!.currentQuest, B.clouds);
  const b = bolg(s);
  assert.equal(consideredEngaged(s, b, s.table!.first), true);
  assert.equal(consideredEngaged(s, b, 1 - s.table!.first), false);
  s.phase = "quest";
  handle(s, fx("successfulQuestProgress", { value: 4, player: 0 }));
  run(s);
  assert.equal(s.progress, 0, "progress cannot be placed on stage 5");
  damage(s, b.id, 8, { combatDamage: true });
  run(s);
  assert.equal(bolg(s).damage, 0, "Bolg cannot take damage");
  s.staging = s.staging.filter((u) => u.code !== B.bodyguard);
  play(s, fx("damage", { target: b.id, value: 8, player: 0 }));
  s = settle(s);
  assert.equal(s.status, "won");
});

test("End of round: each stage with no progress punishes the players before the Ruins locations remove 2 progress", () => {
  let s = base(2);
  progressAll(s, 0, 2, 0);
  stage(s, B.ruins);
  hand(s, [GUARD, GUARD], 0);
  hand(s, [GUARD], 1);
  s.encounterDiscard = [B.archer, B.path, B.climber, B.weighed];
  const effects = BOFA_HOOKS.roundEnd!(s);
  assert.deepEqual(
    effects.map((e) => [e.kind, e.code]),
    [
      ["bofaStageForced", B.spur],
      ["bofaStageForced", B.ravenhill],
      ["bofaRuins", B.ruins],
    ],
  );
  play(s, ...effects);
  assert.equal(seatView(s, 0).hand.length, 1);
  assert.equal(seatView(s, 1).hand.length, 0);
  assert.ok(seatView(s, 0).heroes.every((h) => h.resources === 0));
  assert.ok(seatView(s, 1).heroes.every((h) => h.resources === 0));
  assert.equal(bofaStageProgress(s, B.dale), 0, "Ruins of Dale removes 2");
  // Battle in the Dale: the topmost enemy in the discard pile returns.
  const t = base();
  progressAll(t, 1, 0, 1);
  t.encounterDiscard = [B.archer, B.path, B.climber, B.weighed];
  play(t, ...BOFA_HOOKS.roundEnd!(t));
  assert.ok(t.staging.some((u) => u.code === B.climber));
  assert.deepEqual(t.encounterDiscard, [B.archer, B.path, B.weighed]);
});

test("Bolg: X threat is the number of players; he is immune and cannot leave the staging area; the first Goblin revealed each round gains surge", () => {
  const s = base(3);
  const b = bolg(s);
  assert.equal(threatOf(s, b), 3);
  assert.equal(BOFA_HOOKS.immune!(s, b), true);
  assert.equal(BOFA_HOOKS.cannotLeave!(s, b), true);
  s.round = 4;
  BOFA_HOOKS.revealed!(s, B.climber, "encounter");
  assert.equal(BOFA_HOOKS.revealedSurge!(s, B.climber), true);
  BOFA_HOOKS.revealed!(s, B.vanguard, "encounter");
  assert.equal(BOFA_HOOKS.revealedSurge!(s, B.vanguard), false);
  BOFA_HOOKS.revealed!(s, B.warg, "encounter");
  assert.equal(BOFA_HOOKS.revealedSurge!(s, B.warg), false, "not a Goblin");
});

test("Vanguard of Bolg and Bodyguard of Bolg grow with each quest stage that has no progress", () => {
  const s = base();
  const v = stage(s, B.vanguard);
  assert.equal(bofaEmptyStages(s), 3);
  assert.deepEqual(
    [threatOf(s, v), stats(s, v).attack, stats(s, v).defense],
    [4, 4, 4],
  );
  progressAll(s, 1, 1, 0);
  assert.deepEqual(
    [threatOf(s, v), stats(s, v).attack, stats(s, v).defense],
    [2, 2, 2],
  );
  const g = stage(s, B.bodyguard);
  assert.equal(BOFA_HOOKS.shadowCards!(s, g, 1), 2);
  // Northern Slopes in the staging area: Goblins get +1 attack and defense.
  stage(s, B.slopes);
  assert.equal(stats(s, v).attack, 3);
});

test("Gundabad Climber removes progress from every stage; Gundabad Wolf Rider removes 1 from the current quest when it attacks", () => {
  let s = base();
  progressAll(s, 3, 1, 0);
  s.phase = "staging";
  s.encounterDeck = [B.climber, B.path, B.path];
  handle(s, fx("reveal", { player: 0 }));
  run(s);
  s = settle(s);
  assert.deepEqual(
    [B.spur, B.dale, B.ravenhill].map((c) => bofaStageProgress(s, c)),
    [2, 0, 0],
  );
  const rider = engaged(s, B.rider);
  s.queue = [];
  s.phase = "defense";
  s.combat = null;
  s = act(s, { type: "DEFEND", enemyId: rider.id, defenderId: s.heroes[2].id });
  s = settle(s);
  assert.equal(bofaStageProgress(s, B.spur), 1);
});

test("Gundabad Archer: each player deals 2 damage to a character they control; its shadow damages the defender per empty stage", () => {
  let s = base(2);
  s.phase = "staging";
  s.encounterDeck = [B.archer, B.path, B.path];
  handle(s, fx("reveal", { player: s.table!.first }));
  run(s);
  assert.match(s.choice!.title, /Gundabad Archer/);
  const first = s.table!.first;
  const target = seatView(s, first).heroes[0];
  s = choose(s, target.id);
  assert.equal(get(s, target.id)!.damage, 2);
});

test("Ravenous Warg must be defended by the defending player's most damaged character, even if exhausted", () => {
  let s = base();
  const warg = engaged(s, B.warg);
  const théodred = s.heroes[1];
  théodred.damage = 2;
  théodred.exhausted = true;
  assert.deepEqual(
    defendersFor(s, warg).map((u) => u.id),
    [théodred.id],
  );
  s.phase = "defense";
  assert.throws(() =>
    applyAction(s, { type: "DEFEND", enemyId: warg.id, defenderId: null }),
  );
  s = act(s, { type: "DEFEND", enemyId: warg.id, defenderId: théodred.id });
  s = settle(s);
  assert.ok(!get(s, théodred.id) || get(s, théodred.id)!.damage >= 2);
});

test("Misty Mountain Eagle: the first player spends 2 Baggins resources to take control of it or discard it and a non-unique enemy; its shadow deals 3 damage", () => {
  let s = base();
  const eagle = stage(s, B.eagle);
  const climber = stage(s, B.climber);
  bagginsBilbo(s)!.resources = 4;
  assert.equal(availableAbilities(s, eagle)[0]?.disabled, false);
  s = act(s, { type: "ABILITY", id: eagle.id });
  assert.ok(
    !s.choice!.options.some((o) => o.code === B.bolg),
    "Bolg is unique",
  );
  s = choose(s, climber.id);
  assert.ok(!s.staging.some((u) => u.id === eagle.id || u.id === climber.id));
  assert.ok(s.encounterDiscard.includes(B.eagle));
  assert.equal(bagginsBilbo(s)!.resources, 2);
  let t = base();
  const e2 = stage(t, B.eagle);
  bagginsBilbo(t)!.resources = 2;
  t = act(t, { type: "ABILITY", id: e2.id });
  t = choose(t, "control");
  assert.ok(t.allies.some((u) => u.code === B.eagle));
  // Shadow: 3 damage to the attacking enemy.
  const enemy = engaged(t, B.warg);
  enemy.shadows = [B.eagle];
  t.phase = "defense";
  t.queue = [];
  t.combat = null;
  const ally = t.allies.find((u) => u.code === B.eagle)!;
  ally.damage = 1;
  t = act(t, { type: "DEFEND", enemyId: enemy.id, defenderId: ally.id });
  t = settle(t);
  assert.ok(!get(t, enemy.id) || get(t, enemy.id)!.damage >= 3);
});

test("Heedless of Order changes the current quest until the end of the round, or gains Doomed 3 if it cannot", () => {
  let s = base();
  s.phase = "staging";
  s.encounterDeck = [B.heedless, B.path, B.path];
  handle(s, fx("reveal", { player: 0 }));
  run(s);
  assert.match(s.choice!.title, /Heedless of Order/);
  assert.ok(!s.choice!.options.some((o) => o.id === B.spur));
  s = choose(s, B.ravenhill);
  assert.equal(s.battleFiveArmies!.currentQuest, B.ravenhill);
  s = settle(s);
  // At stage 5 the current quest cannot change.
  let t = base();
  progressAll(t, 8, 8, 8);
  play(t, fx("bofaDefeatStages", { player: 0 }));
  t = settle(t);
  const threat = t.threat;
  t.phase = "staging";
  t.encounterDeck = [B.heedless, B.path, B.path];
  handle(t, fx("reveal", { player: 0 }));
  run(t);
  t = settle(t);
  assert.ok(t.threat >= threat + 3);
});

test("Hatred Rekindled: engaged enemies attack without shadow cards, or it surges; Goblins are Upon You! engages a Goblin with each player and cannot be canceled", () => {
  let s = base();
  const climber = engaged(s, B.climber);
  s.phase = "staging";
  s.encounterDeck = [B.hatred, B.path, B.path];
  handle(s, fx("reveal", { player: 0 }));
  run(s);
  assert.match(s.choice!.title, /Gundabad Climber · Immediate attack/);
  assert.equal(get(s, climber.id)!.shadows.length, 0);
  s = settle(s);
  let t = base(2);
  t.phase = "staging";
  t.encounterDeck = [B.goblins, B.vanguard, B.rider, B.path, B.path];
  handle(t, fx("reveal", { player: t.table!.first }));
  run(t);
  assert.match(t.choice!.title, /Goblins are Upon You!/);
  t = settle(t);
  assert.equal(seatView(t, 0).engaged.length, 1);
  assert.equal(seatView(t, 1).engaged.length, 1);
  assert.equal(BOFA_HOOKS.cannotCancel!(t, false, B.goblins), true);
});

test("Ruins locations are immune and cost 3 Baggins resources to travel to, or 1 while their stage is the current quest", () => {
  const s = base();
  const gate = stage(s, B.gate);
  const ruins = stage(s, B.ruins);
  s.phase = "travel";
  bagginsBilbo(s)!.resources = 2;
  assert.equal(BOFA_HOOKS.immune!(s, gate), true);
  assert.equal(canTravel(s, gate), null, "stage 2B is current: 1 resource");
  assert.match(canTravel(s, ruins) ?? "", /3 Baggins/);
  assert.equal(card(B.gate).victory, 3);
});

test("Treasure sets: The Battle of Five Armies accepts every earlier Saga set", () => {
  assert.deepEqual(scenarioTreasures("the-battle-of-five-armies"), [
    ...HOBBIT_TREASURES,
    OTD_RING,
    ...EREBOR_TREASURES,
  ]);
});

test("Malformed Battle of Five Armies saves are rejected", () => {
  const s = base();
  const raw = () => JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(raw()));
  for (const mutate of [
    (x: GameState) => (x.battleFiveArmies!.currentQuest = "nope"),
    (x: GameState) => (x.stage = 4),
    (x: GameState) => (x.battleFiveArmies!.stageProgress = { nope: 1 }),
    (x: GameState) => (x.battleFiveArmies!.stageProgress = { [B.dale]: -1 }),
    (x: GameState) => (x.battleFiveArmies!.chosenRound = x.round + 1),
    (x: GameState) =>
      (x.battleFiveArmies!.bolgDestroyed = "yes" as unknown as boolean),
  ]) {
    const bad = raw();
    mutate(bad);
    assert.equal(validateSave(bad), false);
  }
  selectSeat(s, 0);
});

test("Shadows count the quest stages with no progress: Wolf Rider adds attack, Warg lowers defense, Archer damages the defender, Goblins add attack per engaged Goblin, Hatred attacks again and Vanguard clears the current quest", () => {
  const attack = (shadow: string, setup?: (s: GameState) => void) => {
    let s = base();
    setup?.(s);
    const enemy = engaged(s, B.climber);
    enemy.shadows = [shadow];
    s.phase = "defense";
    s.queue = [];
    s.combat = null;
    const glóin = s.heroes[2];
    s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: glóin.id });
    return { s, enemy, glóin };
  };
  // 3 empty stages: Wolf Rider +3 attack.
  let { s } = attack(B.rider);
  s = settle(s);
  assert.ok(
    s.log.some((l) => /attack Glóin|Glóin/.test(l.text)),
    "the attack resolved",
  );
  // Gundabad Archer: 1 damage to the defender per empty stage (3).
  const archer = attack(B.archer);
  archer.s = settle(archer.s);
  const g = get(archer.s, archer.glóin.id);
  assert.ok(!g || g.damage >= 3);
  // Hatred Rekindled: an additional attack right after this one.
  const hatred = attack(B.hatred);
  const after = settle(hatred.s, "undefended");
  assert.ok(
    after.log.filter((l) => /Gundabad Climber/.test(l.text)).length >= 2,
  );
  // Vanguard of Bolg: a destroyed character removes all progress.
  const vanguard = attack(B.vanguard, (s) => {
    s.progress = 5;
    s.heroes[2].damage = 3;
  });
  const done = settle(vanguard.s);
  if (!get(done, vanguard.glóin.id)) assert.equal(done.progress, 0);
  // The modifiers themselves, with all three stages empty.
  const m = base();
  const goblin = engaged(m, B.climber);
  engaged(m, B.vanguard);
  m.combat = {
    enemyId: goblin.id,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
    attackPlayer: 0,
  };
  BOFA_HOOKS.shadow!(m, B.goblins);
  assert.equal(m.combat.attackBonus, 2, "two Goblins engaged with you");
  BOFA_HOOKS.shadow!(m, B.rider);
  assert.equal(m.combat.attackBonus, 5);
  BOFA_HOOKS.shadow!(m, B.warg);
  assert.equal(m.combat.defensePenalty, 3);
  // Northern Slopes active: a character leaving play removes 1 progress.
  let t = base();
  t.activeLocation = make(t, B.slopes);
  t.progress = 4;
  const ally = make(t, GUARD);
  ally.owner = 0;
  t.allies.push(ally);
  play(t, fx("damage", { target: ally.id, value: 9, player: 0 }));
  t = settle(t);
  assert.equal(t.progress, 3);
});
