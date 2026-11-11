import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  canPlay,
  canTravel,
  validateSave,
} from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  fx,
  get,
  make,
  stageInfo,
  stats,
  threatOf,
  stagingThreat,
} from "../src/game/core";
import {
  check,
  damage,
  engage,
  enterAlly,
  progress,
  progressLocation,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  allCharacters,
  forOwner,
  playerOrder,
  seatView,
} from "../src/game/table";
import {
  MASSING as M,
  MASSING_QUESTS,
  MASSING_RECIPES,
  MASSING_SCOUTS,
} from "../src/game/massing-osgiliath-support";
import { MASSING_HOOKS as hooks } from "../src/game/massing-osgiliath";
import {
  base,
  choose,
  reload,
  settle,
  start,
} from "./massing-osgiliath-fixtures";
import type { GameState } from "../src/game/types";
const staged = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const effect = (s: GameState, kind: string, extra = {}) => {
  handle(s, fx(kind, extra));
  flush(s);
  return s;
};
const toStage = (s: GameState, stage: number) => {
  s.stage = stage;
  s.massing!.currentQuest = MASSING_QUESTS[stage - 1].code;
  s.massing!.crossed = stage === 4;
  return s;
};
const combat = (s: GameState, enemyId: string, extra = {}) =>
  (s.combat = {
    enemyId,
    attackPlayer: 0,
    attackBonus: 0,
    ...extra,
  } as unknown as GameState["combat"]);

for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`The Massing at Osgiliath ${players} players ${easy ? "easy" : "normal"}: three Scouts per player, The Witch-king set aside and the exact inventory`, () => {
      const s = start(players, easy, 61, true, true);
      const q = s.massing!;
      assert.equal(s.phase, "resource");
      for (const scout of MASSING_SCOUTS)
        assert.equal(
          s.staging.filter((u) => u.code === scout).length +
            playerOrder(s).reduce(
              (n, p) =>
                n +
                seatView(s, p).engaged.filter((u) => u.code === scout).length,
              0,
            ),
          players,
        );
      assert.deepEqual(
        q.setAside.map((u) => u.code),
        [M.witchKing],
      );
      assert.equal(
        s.encounterDeck.length + s.encounterDiscard.length,
        28 + 12 - 3 * players,
      );
      assert.equal(stageInfo(s).quest, 7);
      const physical = [
        ...s.encounterDeck,
        ...s.encounterDiscard,
        ...s.staging.map((u) => u.code),
        ...playerOrder(s).flatMap((p) =>
          seatView(s, p).engaged.map((u) => u.code),
        ),
        ...q.setAside.map((u) => u.code),
        ...MASSING_QUESTS.map((c) => c.code),
      ].sort();
      assert.deepEqual(
        physical,
        MASSING_RECIPES[0].cards
          .flatMap((r) => Array<string>(r.quantity).fill(r.code))
          .sort(),
      );
      reload(s);
    });
test("Stages advance at 7, 5, 1 and 15 progress; stage 4 adds The Witch-king, crosses the Anduin and its defeat wins", () => {
  let s = base(1);
  const wk = s.massing!.setAside[0];
  progress(s, 7);
  check(s);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.equal(stageInfo(s).quest, 5);
  progress(s, 5);
  check(s);
  flush(s);
  assert.equal(s.stage, 3);
  assert.equal(stageInfo(s).quest, 1);
  s.phase = "staging";
  handle(s, fx("successfulQuestProgress", { value: 1 }));
  flush(s);
  check(s);
  flush(s);
  assert.equal(s.stage, 4);
  assert.equal(s.massing!.crossed, true);
  assert.ok(s.staging.some((u) => u.id === wk.id));
  assert.equal(stageInfo(s).quest, 15);
  progress(s, 15);
  check(s);
  flush(s);
  assert.equal(s.status, "won");
  assert.match(s.reason, /Minas Tirith/);
});
test("Travel bans: West Bank in stages 1–2, both banks in stage 3, East Bank in stage 4", () => {
  const s = base(1);
  s.phase = "travel";
  const west = staged(s, M.watchtower),
    east = staged(s, M.ruins);
  assert.match(canTravel(s, west)!, /West Bank/);
  assert.equal(canTravel(s, east), null);
  toStage(s, 3);
  assert.match(canTravel(s, east)!, /East Bank or West Bank/);
  assert.match(canTravel(s, west)!, /East Bank or West Bank/);
  toStage(s, 4);
  assert.match(canTravel(s, east)!, /East Bank/);
  assert.equal(canTravel(s, west), null);
});
test("Through the Ruins limits each player to one card played or put into play from hand each round", () => {
  let s = base(2);
  toStage(s, 2);
  for (const h of s.heroes) h.phaseResourceIcons = ["leadership"];
  const a = make(s, "01013"),
    b = make(s, "01014");
  a.owner = b.owner = 0;
  s.hand.push(a, b);
  s = applyAction(reload(s), { type: "PLAY", id: a.id });
  s = settle(s);
  assert.match(
    canPlay(s, get(s, b.id) ?? s.hand.find((h) => h.id === b.id)!)!,
    /only 1 card/,
  );
  const c = s.hand.find((h) => h.id === b.id)!;
  s.hand = s.hand.filter((h) => h.id !== c.id);
  enterAlly(s, c, false, false, true);
  assert.ok(
    s.hand.some((h) => h.id === c.id),
    "cannot be put into play from hand",
  );
  assert.ok(!s.allies.some((h) => h.id === c.id));
  s.round++;
  assert.equal(canPlay(s, c), null);
});
test("Anduin Crossing: committing first discards a hero or Ranger, and card effects cannot place progress here or on the active location", () => {
  let s = base(1);
  toStage(s, 3);
  s.phase = "quest";
  const ranger = make(s, M.ranger);
  ranger.owner = 0;
  ranger.controller = 0;
  s.allies.push(ranger);
  s.committedIds = [s.heroes[0].id];
  s = applyAction(reload(s), { type: "COMMIT" });
  assert.match(s.choice!.title, /Anduin Crossing/);
  s = choose(s, ranger.id);
  assert.ok(!s.allies.some((u) => u.id === ranger.id));
  assert.ok(s.encounterDiscard.includes(M.ranger));
  assert.equal(get(s, s.heroes[0].id)!.committed, true);
  const active = make(s, M.ruins);
  s.activeLocation = active;
  progress(s, 3, true);
  assert.equal(s.progress, 0);
  progressLocation(s, active, 1);
  assert.equal(active.progress, 0);
  progress(s, 1, false, true);
  assert.equal(
    active.progress,
    1,
    "quest resolution still explores the active location",
  );
});
test("The Witch-king lowers willpower from staging, refuses player attachments and returns unless the defender pays 3 threat", () => {
  let s = base(1);
  const hero = s.heroes[0];
  const will = stats(s, hero).will;
  const wk = staged(s, M.witchKing);
  assert.equal(stats(s, hero).will, will - 1);
  assert.equal(hooks.cannotAttach!(s, wk, "01040"), true);
  engage(s, wk);
  const c = {
    enemyId: wk.id,
    attackPlayer: 0,
    attackBonus: 0,
    attackResolved: true,
    massingEnemy: M.witchKing,
  } as unknown as NonNullable<GameState["combat"]>;
  for (const e of hooks.attackFinished!(s, c)) handle(s, e);
  flush(s);
  s = choose(s, "return");
  assert.ok(s.staging.some((u) => u.id === wk.id));
  engage(
    s,
    s.staging.find((u) => u.id === wk.id)!,
  );
  const threat = s.threat;
  for (const e of hooks.attackFinished!(s, c)) handle(s, e);
  flush(s);
  s = choose(s, "threat");
  assert.equal(s.threat, threat + 3);
  assert.ok(s.engaged.some((u) => u.id === wk.id));
});
test("Snaga Scouts engage the lowest-threat player at the start of the encounter phase; the first player breaks ties", () => {
  let s = base(2);
  const [a, b] = playerOrder(s);
  forOwner(s, a, () => (s.threat = 30));
  forOwner(s, b, () => (s.threat = 25));
  const snaga = staged(s, M.snaga),
    other = staged(s, M.snaga);
  hooks.encounterBegin!(s);
  flush(s);
  assert.equal(
    seatView(s, b).engaged.filter((u) => u.code === M.snaga).length,
    2,
  );
  forOwner(s, b, () => (s.threat = 30));
  forOwner(s, b, () => {
    s.engaged = [];
  });
  s.staging.push(snaga, other);
  hooks.encounterBegin!(s);
  flush(s);
  assert.match(s.choice!.title, /Snaga Scouts/);
  s = choose(s, `player-${a}`);
  assert.equal(
    seatView(s, a).engaged.filter((u) => u.code === M.snaga).length,
    2,
  );
});
test("Wolves from Mordor wound the defender as a shadow and shuffle back after a kill; Wainriders raise threat per damage", () => {
  let s = base(1);
  const wolves = staged(s, M.wolves);
  engage(s, wolves);
  combat(s, wolves.id, { defenderId: s.heroes[0].id });
  hooks.shadow!(s, M.wolves);
  flush(s);
  assert.equal(s.heroes[0].damage, 2);
  const deck = s.encounterDeck.length;
  const c = {
    enemyId: wolves.id,
    attackPlayer: 0,
    attackBonus: 0,
    attackResolved: true,
    massingEnemy: M.wolves,
    massingKilled: true,
  } as unknown as NonNullable<GameState["combat"]>;
  s.combat = null;
  for (const e of hooks.attackFinished!(s, c)) handle(s, e);
  flush(s);
  assert.ok(!s.engaged.some((u) => u.id === wolves.id));
  assert.equal(s.encounterDeck.length, deck + 1);
  assert.ok(s.encounterDeck.includes(M.wolves));
  s = base(1);
  const riders = staged(s, M.wainriders);
  engage(s, riders);
  combat(s, riders.id, { massingEnemy: M.wainriders });
  const threat = s.threat;
  damage(s, s.heroes[0].id, 2, { combatDamage: true, enemyId: riders.id });
  flush(s);
  assert.equal(s.threat, threat + 2);
});
test("Wainrider Captain recovers Scouts from the discard pile; crossing doubles it and strengthens Uruk Vanguard, Watchtower and shadows", () => {
  let s = base(1);
  s.encounterDiscard = [M.snaga, M.cutOff, M.wolves, M.ruins];
  staged(s, M.captain);
  hooks.encounter!(s, M.captain, false, true);
  flush(s);
  assert.deepEqual(s.staging.filter((u) => u.code === M.wolves).length, 1);
  assert.deepEqual(s.encounterDiscard, [M.snaga, M.cutOff, M.ruins]);
  toStage(s, 4);
  s.encounterDiscard = [M.snaga, M.wainriders, M.cutOff];
  hooks.encounter!(s, M.captain, false, true);
  flush(s);
  assert.deepEqual(s.encounterDiscard, [M.cutOff]);
  const uruk = staged(s, M.uruk);
  assert.equal(stats(s, uruk).attack, card(M.uruk).attack! + 3);
  const tower = staged(s, M.watchtower);
  assert.equal(threatOf(s, tower), 4);
  const ruins = staged(s, M.ruins);
  assert.equal(threatOf(s, ruins), 1);
  toStage(s, 1);
  assert.equal(threatOf(s, ruins), 4);
  assert.equal(threatOf(s, tower), 1);
  const scout = staged(s, M.snaga);
  combat(s, scout.id);
  hooks.shadow!(s, M.captain);
  hooks.shadow!(s, M.uruk);
  assert.equal(s.combat!.attackBonus, 3);
  s.combat!.defenderId = s.heroes[0].id;
  s.combat!.defenderIds = [s.heroes[0].id];
  hooks.shadow!(s, M.watchtower);
  assert.equal(s.combat!.defenderId, null);
  assert.deepEqual(s.combat!.defenderIds, []);
});
test("Emyn Arnen Overlook gives the round's first Scout surge and doomed 2; Massing at Osgiliath adds doomed for the phase", () => {
  const s = base(2);
  staged(s, M.overlook);
  hooks.revealed!(s, M.wolves, "encounter");
  assert.equal(hooks.revealedDoomed!(s, M.wolves, "encounter"), 2);
  assert.equal(hooks.revealedSurge!(s, M.wolves), true);
  assert.equal(hooks.revealedSurge!(s, M.wolves), false);
  hooks.revealed!(s, M.snaga, "encounter");
  assert.equal(hooks.revealedDoomed!(s, M.snaga, "encounter"), 0);
  s.round++;
  s.phase = "quest";
  hooks.encounter!(s, M.massing, false, true);
  flush(s);
  assert.equal(hooks.revealedDoomed!(s, M.ruins, "encounter"), 1);
  assert.ok(s.encounterDiscard.includes(M.massing));
  s.phase = "travel";
  assert.equal(hooks.revealedDoomed!(s, M.ruins, "encounter"), 0);
});
test("Morgulduin damages committing characters while active, and as a shadow becomes the active location before the crossing", () => {
  let s = base(1);
  s.activeLocation = make(s, M.morgulduin);
  s.heroes[0].committed = true;
  hooks.committed!(s);
  flush(s);
  assert.equal(s.heroes[0].damage, 1);
  s = base(1);
  const old = make(s, M.ruins);
  s.activeLocation = old;
  const enemy = staged(s, M.uruk);
  enemy.shadows = [M.morgulduin];
  enemy.revealedShadowCount = 1;
  combat(s, enemy.id);
  hooks.shadow!(s, M.morgulduin);
  assert.equal(s.activeLocation!.code, M.morgulduin);
  assert.ok(s.staging.some((u) => u.id === old.id));
  assert.deepEqual(get(s, enemy.id)!.shadows, []);
});
test("After the crossing, Pelennor Fields forces travel there or 3 threat for each player", () => {
  let s = base(2);
  toStage(s, 4);
  const fields = staged(s, M.pelennor);
  s.phase = "travel";
  hooks.travelBegin!(s);
  flush(s);
  const threats = playerOrder(s).map((p) => seatView(s, p).threat);
  s = choose(s, "threat");
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    threats.map((t) => t + 3),
  );
  hooks.travelBegin!(s);
  flush(s);
  s = choose(s, fields.id);
  s = settle(s);
  assert.equal(s.activeLocation?.id, fields.id);
});
test("Cut Off empties ally hands and its shadow demands allies or +3 attack; Dark Pursuit counts Scouts or surges", () => {
  let s = base(1);
  s.hand.push(make(s, "01013"), make(s, "01025"));
  hooks.encounter!(s, M.cutOff, false, true);
  flush(s);
  assert.deepEqual(
    s.hand.map((h) => h.code),
    ["01025"],
  );
  const enemy = staged(s, M.uruk);
  combat(s, enemy.id, { defenderId: s.heroes[0].id });
  hooks.shadow!(s, M.cutOff);
  flush(s);
  assert.equal(s.combat!.attackBonus, 3, "no ally to discard");
  s = base(1);
  s.phase = "quest";
  staged(s, M.snaga);
  staged(s, M.wolves);
  const before = stagingThreat(s);
  hooks.encounter!(s, M.pursuit, false, true);
  flush(s);
  assert.equal(stagingThreat(s), before + 2);
});
test("Ranger of Ithilien joins exhausted and committed then surges; as a shadow it wounds the attacker and can be recruited", () => {
  let s = base(1);
  s.phase = "quest";
  s.encounterDeck = [M.ruins, M.ruins];
  staged(s, M.ranger);
  hooks.encounter!(s, M.ranger, false, true);
  flush(s);
  s = settle(s);
  const ranger = s.allies.find((u) => u.code === M.ranger)!;
  assert.ok(ranger);
  assert.equal(ranger.exhausted, true);
  assert.equal(ranger.committed, true);
  assert.ok(
    s.staging.some((u) => u.code === M.ruins),
    "surge revealed another card",
  );
  s = base(1);
  const enemy = staged(s, M.uruk);
  engage(s, enemy);
  enemy.shadows = [M.ranger];
  enemy.revealedShadowCount = 1;
  combat(s, enemy.id, { defenderId: s.heroes[0].id });
  hooks.shadow!(s, M.ranger);
  flush(s);
  assert.equal(get(s, enemy.id)!.damage, 2);
  s = choose(s, s.heroes[1].id);
  assert.ok(s.allies.some((u) => u.code === M.ranger));
  assert.deepEqual(get(s, enemy.id)!.shadows, []);
  assert.equal(get(s, s.heroes[1].id)!.exhausted, true);
});
test("Malformed Massing at Osgiliath saves are rejected", () => {
  const s = base(2);
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
  for (const corrupt of [
    (x: GameState) => (x.massing!.currentQuest = M.race),
    (x: GameState) => (x.massing!.crossed = true),
    (x: GameState) => (x.massing!.overlook = M.ruins),
    (x: GameState) => (x.massing!.handCards.counts["7"] = 1),
  ]) {
    const bad = JSON.parse(JSON.stringify(s));
    corrupt(bad);
    assert.equal(validateSave(bad), false);
  }
  assert.ok(allCharacters(s).length > 0);
});
