import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, publicState, stageInfo } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  engagementCost,
  fx,
  get,
  stagingThreat,
  stats,
  threatOf,
} from "../src/game/core";
import { check, damage, nextRound, progressLocation } from "../src/game/board";
import { reduceThreat } from "../src/game/threat-reduction";
import { flush } from "../src/game/effects";
import { forOwner, playerOrder, seatView } from "../src/game/table";
import { TOS_ARAGORN } from "../src/game/lotr-saga-codes";
import { WHITE_HAND } from "../src/game/white-hand";
import {
  HD,
  HELMS_DEEP_RECIPES,
  helmsDeepDefense,
  helmsDeepPublicState,
} from "../src/game/helms-deep";
import {
  activate,
  allies,
  base,
  choose,
  deck,
  engaged,
  hand,
  reload,
  settle,
  stage,
  start,
} from "./helms-deep-fixtures";
import type { GameState } from "../src/game/types";

const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
/** The given player reveals a known card from the top of the encounter deck. */
const reveal = (s: GameState, code: string, p = 0) => {
  s.encounterDeck.unshift(code);
  s.queue.push({ kind: "reveal", player: p });
  flush(s);
  return s;
};
const run = (s: GameState, kind: string, p = 0, extra = {}) => {
  s.queue.push(fx(kind, { player: p, ...extra }));
  flush(s);
  return s;
};
const SNOWBOURN = "01016",
  GUARD = "01013",
  STEWARD = "01026",
  GLEOWINE = "01062";
const count = (list: string[], code: string) =>
  list.filter((c) => c === code).length;

test("Setup sets The Defense of Helm's Deep, a Deeping Wall and a Soldier of Isengard for each player aside, in one to four players and both difficulties", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = start(players, easy);
      const q = s.helmsDeep!;
      // The players advanced to stage 2A at setup.
      assert.equal(q.counsels, false);
      assert.equal(s.stage, 2);
      assert.equal(q.currentQuest, HD.assault);
      assert.deepEqual(q.setAside, []);
      assert.ok(helmsDeepDefense(s));
      assert.equal(card(s.activeLocation!.code).name, "Deeping Wall");
      assert.equal(
        count(
          s.staging.map((u) => u.code),
          HD.soldier,
        ),
        players,
      );
      assert.equal(
        count(s.removedEncounter ?? [], HD.soldier) +
          count(s.removedEncounter ?? [], HD.counsels),
        4 - players + 4,
      );
      assert.equal(stageInfo(s).quest, 8);
      reload(s);
    }
});

test("Poisoned Counsels: each player shuffles one into his deck and stage 1B puts an ally into play, skips the quest and combat phases, and advances at the end of the round", () => {
  let s = start(2, false, 919, false, true, "counsels");
  const q = s.helmsDeep!;
  assert.equal(q.counsels, true);
  assert.equal(s.stage, 1);
  assert.equal(q.currentQuest, HD.king);
  for (const p of playerOrder(s))
    assert.equal(
      count(
        [...seatView(s, p).deck, ...seatView(s, p).hand.map((u) => u.code)],
        HD.counsels,
      ),
      1,
    );
  assert.equal(count(s.removedEncounter ?? [], HD.counsels), 2);
  assert.deepEqual(
    [...q.setAside].sort(),
    [HD.defense, HD.soldier, HD.soldier, HD.wall].sort(),
  );
  // Skip the quest phase and the combat phase.
  s.phase = "planning";
  s.queue.push(
    { kind: "phaseEnd", player: 0 },
    { kind: "startQuest", player: 0 },
  );
  flush(s);
  s = settle(s);
  assert.notEqual(s.phase, "quest");
  // At the end of the round, the players advance to stage 2A.
  s.phase = "refresh";
  s.queue.push({ kind: "endRound", player: 0 });
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.ok(helmsDeepDefense(s));
});

test("Stage 1B's When Revealed puts an ally that matches a hero's sphere into play", () => {
  let s = base(1);
  const [guard] = hand(s, [GUARD]);
  hand(s, [GLEOWINE]);
  run(s, "hdAlly");
  assert.match(
    s.choice!.title,
    /^The King of the Golden Hall · Put an ally into play/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.code),
    [GUARD],
    "only the leadership ally matches a hero's sphere",
  );
  s = choose(s, guard.id);
  assert.ok(s.allies.some((a) => a.code === GUARD));
});

test("Poisoned Counsels discards every other card in hand when it is drawn", () => {
  let s = base(1);
  hand(s, [GUARD, SNOWBOURN]);
  deck(s, [HD.counsels, GUARD]);
  run(s, "draw", 0, { value: 1 });
  assert.deepEqual(
    s.hand.map((u) => u.code),
    [HD.counsels],
  );
  assert.deepEqual(s.discard.sort(), [GUARD, SNOWBOURN].sort());
});

test("Defense: questing successfully places no progress; a failed quest places the difference, through the active location, instead of raising threat", () => {
  let s = base(1);
  const location = activate(s, HD.hornburg);
  s.queue.push({ kind: "successfulQuestProgress", value: 4, player: 0 });
  flush(s);
  assert.equal(location.progress, 0);
  assert.equal(s.progress, 0);
  s.queue.push({ kind: "failedQuest", value: 5, player: 0 });
  flush(s);
  s = settle(s);
  assert.equal(s.threat, 20, "no threat is raised");
  // 3 progress explore The Hornburg (no enemy in play), 2 reach the stage.
  assert.equal(s.activeLocation, null);
  assert.equal(s.progress, 2);
});

test("Assault on Helm's Deep: a card at the end of combat with fewer staged enemies than players, and progress at the end of the round for each staged enemy", () => {
  let s = base(2);
  s.encounterDeck = [HD.hillman, ...s.encounterDeck];
  run(s, "hdAssaultCombat");
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === HD.hillman));
  activate(s, HD.wall);
  stage(s, HD.soldier);
  run(s, "hdAssaultRound");
  assert.equal(s.progress, 2, "bypassing the active location");
  assert.equal(s.activeLocation!.progress, 0);
});

test("Defeating stage 2 makes Helm's Gate the active location; 3B reveals a card when the encounter deck placed no progress by questing", () => {
  let s = base(1);
  const hornburg = activate(s, HD.hornburg);
  s.encounterDeck = [HD.gate, HD.postern];
  s.progress = 8;
  forOwner(s, 0, () => check(s));
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 3);
  assert.equal(s.activeLocation!.code, HD.gate);
  assert.ok(s.staging.some((u) => u.id === hornburg.id));
  // No progress from questing: the first player reveals 1 encounter card.
  s.activeLocation = null;
  s.encounterDeck = [HD.postern, ...s.encounterDeck];
  run(s, "hdHostsReveal");
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === HD.postern));
});

test("The Wall is Breached!: X enemies from the reshuffled deck, 1 progress for each destroyed character, and its defeat loses the game", () => {
  let s = base(2, 3);
  s.encounterDeck = [HD.postern];
  s.encounterDiscard = [HD.hillman, HD.soldier];
  s.progress = 8;
  forOwner(s, 0, () => check(s));
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 4);
  assert.equal(
    s.staging.filter((u) => card(u.code).type_code === "enemy").length,
    2,
  );
  const [scout] = allies(s, [SNOWBOURN]);
  damage(s, scout.id, 1);
  flush(s);
  assert.equal(s.progress, 1);
  s.progress = 8;
  forOwner(s, 0, () => check(s));
  assert.equal(s.status, "lost");
  assert.match(s.reason, /captures Helm's Deep/);
});

test("The Defense of Helm's Deep adds its tokens to the staging threat; at 8 the players ride out and win once no enemy is in play", () => {
  let s = base(1);
  const defense = helmsDeepDefense(s)!;
  defense.resources = 3;
  assert.equal(stagingThreat(s), 3);
  defense.resources = 7;
  s.encounterDeck = [HD.postern, HD.hillman, HD.postern];
  run(s, "finishQuestPhase");
  s = settle(s);
  assert.equal(s.stage, 5);
  assert.equal(s.helmsDeep!.currentQuest, HD.rides);
  assert.ok(s.victoryCards!.includes(HD.defense));
  const hillman = s.staging.find((u) => u.code === HD.hillman)!;
  assert.ok(hillman);
  // 5B: no threat reduction; the players win once no enemy is in play.
  reduceThreat(s, 3, "player-card");
  assert.equal(s.threat, 20);
  damage(s, hillman.id, 9);
  flush(s);
  forOwner(s, 0, () => check(s));
  assert.equal(s.status, "won");
});

test("The Hornburg, Deeping Wall, Deeping Culvert, Postern Door and Helm's Gate", () => {
  // The Hornburg reduces the archery; exploring it assigns damage.
  let s = base(2);
  stage(s, HD.soldier);
  stage(s, WHITE_HAND.uruk);
  activate(s, HD.hornburg);
  run(s, "combatStartEffects");
  assert.match(s.choice!.title, /^Assign Archery damage · 1 remaining/);
  s = base(1);
  stage(s, HD.hillman);
  const hornburg = activate(s, HD.hornburg);
  progressLocation(s, hornburg, 3);
  flush(s);
  assert.match(s.choice!.title, /^The Hornburg · Assign damage · 1 remaining/);
  // Deeping Wall: heroes +1 defense; exploring it raises each threat by 4.
  s = base(2);
  const hero = s.heroes.find((h) => h.code !== TOS_ARAGORN)!;
  const before = stats(s, hero).defense;
  const wall = activate(s, HD.wall);
  assert.equal(stats(s, hero).defense, before + 1);
  progressLocation(s, wall, 4);
  flush(s);
  assert.equal(seatView(s, 1).threat, 24);
  // Deeping Culvert: X is 1 more than the first player's allies.
  s = base(1);
  const culvert = stage(s, HD.culvert);
  allies(s, [GUARD, SNOWBOURN]);
  assert.equal(threatOf(s, culvert), 3);
  s.encounterDeck = [HD.postern, HD.hillman];
  s.staging = s.staging.filter((u) => u.id !== culvert.id);
  s.activeLocation = culvert;
  progressLocation(s, culvert, 2);
  flush(s);
  assert.match(s.choice!.title, /^Deeping Culvert · Reveal an enemy/);
  s = choose(s, `deck-${HD.hillman}`);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === HD.hillman));
  // Postern Door: heroes +1 attack; exploring it stops attacks this round.
  s = base(1);
  const postern = activate(s, HD.postern);
  const hero2 = s.heroes.find((h) => h.code !== TOS_ARAGORN)!;
  assert.equal(stats(s, hero2).attack, card(hero2.code).attack! + 1);
  progressLocation(s, postern, 2);
  flush(s);
  const orc = engaged(s, HD.hillman);
  s.phase = "attack";
  assert.throws(() =>
    act(s, { type: "ATTACK", enemyId: orc.id, attackerIds: [hero2.id] }),
  );
  // Helm's Gate: a card at the end of the staging step while a player is
  // not engaged; exploring it gives -20 engagement cost and +2 attack.
  s = base(1);
  const gate = activate(s, HD.gate);
  s.encounterDeck = [HD.postern, ...s.encounterDeck];
  run(s, "questReady");
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === HD.postern));
  const enemy = stage(s, HD.soldier);
  progressLocation(s, gate, 3);
  flush(s);
  assert.equal(engagementCost(s, enemy), 39 - 20);
  assert.equal(stats(s, enemy).attack, 4 + 2);
});

test("Scaling Ladders, Devilry of Saruman, Reckless Hate and Night Without End", () => {
  let s = base(1);
  const location = activate(s, HD.hornburg);
  const soldier = stage(s, HD.soldier);
  s.phase = "quest";
  s.encounterDeck = [HD.postern, ...s.encounterDeck];
  reveal(s, HD.ladders);
  s = settle(s);
  assert.ok(
    get(s, location.id)!.attachments.some((a) => a.code === HD.ladders),
  );
  assert.equal(threatOf(s, get(s, soldier.id)!), 5);
  assert.ok(
    s.staging.some((u) => u.code === HD.postern),
    "surge",
  );
  // Devilry of Saruman: 3 progress bypassing the location; blank characters.
  s = base(1);
  activate(s, HD.hornburg);
  s.phase = "quest";
  reveal(s, HD.devilry);
  s = settle(s);
  assert.equal(s.progress, 3);
  assert.equal(s.activeLocation!.progress, 0);
  assert.ok(s.heroes.every((h) => h.blanked));
  nextRound(s);
  check(s);
  assert.ok(s.heroes.every((h) => !h.blanked));
  // Reckless Hate: the strongest staged enemy attacks, or surge.
  s = base(1);
  stage(s, HD.hillman);
  const warrior = stage(s, HD.warrior);
  s.phase = "quest";
  reveal(s, HD.hate);
  assert.match(s.choice!.title, /^Warrior of Dunland · Immediate attack/);
  assert.equal(s.combat?.enemyId, warrior.id);
  s = base(1);
  s.phase = "quest";
  s.encounterDeck = [HD.postern, ...s.encounterDeck];
  reveal(s, HD.hate);
  s = settle(s);
  assert.ok(
    s.staging.some((u) => u.code === HD.postern),
    "surge",
  );
  // Night Without End: remove a token, or reveal 2 additional cards.
  s = base(1);
  helmsDeepDefense(s)!.resources = 2;
  s.phase = "quest";
  reveal(s, HD.night);
  assert.match(s.choice!.title, /^Night Without End · Choose one/);
  s = choose(s, "token");
  assert.equal(helmsDeepDefense(s)!.resources, 1);
  s = base(1);
  s.phase = "quest";
  s.encounterDeck = [HD.postern, HD.wall, ...s.encounterDeck];
  reveal(s, HD.night);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["reveal"],
    "no token to remove",
  );
  s = choose(s, "reveal");
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === HD.wall));
});

test("Wild Hillman, Warrior of Dunland and Soldier of Isengard", () => {
  // Wild Hillman places 1 progress on the active location after it attacks.
  let s = base(1);
  const location = activate(s, HD.hornburg);
  const hillman = engaged(s, HD.hillman);
  const [guard] = allies(s, [GUARD]);
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: hillman.id, defenderId: guard.id });
  s = settle(s);
  assert.equal(get(s, location.id)!.progress, 1);
  // Warrior of Dunland attacks when revealed; a kill places 3 progress on the location.
  s = base(1);
  const wall = activate(s, HD.wall);
  const [victim] = allies(s, [SNOWBOURN]);
  s.phase = "quest";
  reveal(s, HD.warrior);
  assert.match(s.choice!.title, /^Warrior of Dunland · Immediate attack/);
  s = choose(s, victim.id);
  s = settle(s);
  assert.equal(get(s, victim.id), undefined);
  assert.equal(get(s, wall.id)!.progress, 3);
  // Soldier of Isengard: Toughness 1; a kill places progress on the quest.
  s = base(1);
  const soldier = engaged(s, HD.soldier);
  damage(s, soldier.id, 2);
  assert.equal(get(s, soldier.id)!.damage, 1);
  const [scout] = allies(s, [SNOWBOURN]);
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: soldier.id, defenderId: scout.id });
  s = settle(s);
  assert.equal(get(s, scout.id), undefined);
  assert.equal(s.progress, 1);
});

test("Shadows: Wild Hillman, Soldier of Isengard, Scaling Ladders, Devilry of Saruman, Reckless Hate and Night Without End", () => {
  // Wild Hillman: progress on the active location, +1 attack for each.
  let s = base(1);
  const location = activate(s, HD.wall);
  location.progress = 1;
  let orc = engaged(s, HD.hillman);
  let [guard] = allies(s, [GUARD]);
  orc.shadows = [HD.hillman];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: orc.id, defenderId: guard.id });
  s = settle(s);
  // 1 + 1 (shadow) + 1 (Wild Hillman's forced effect); +2 attack.
  assert.equal(get(s, location.id)!.progress, 3);
  assert.ok(
    s.log.some((l) => /the attacking enemy gets \+2 attack/.test(l.text)),
  );
  // Night Without End: the attacker returns to the staging area.
  s = base(1);
  orc = engaged(s, HD.hillman);
  [guard] = allies(s, [GUARD]);
  orc.shadows = [HD.night];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: orc.id, defenderId: guard.id });
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === orc.id));
  // Devilry of Saruman: +2 attack and Toughness 2 until the end of the round.
  s = base(1);
  orc = engaged(s, HD.hillman);
  [guard] = allies(s, [GUARD]);
  orc.shadows = [HD.devilry];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: orc.id, defenderId: guard.id });
  s = settle(s);
  damage(s, orc.id, 3);
  assert.equal(get(s, orc.id)!.damage, 1);
  // Scaling Ladders: a kill places 1 progress on the current quest.
  s = base(1);
  orc = engaged(s, HD.hillman);
  const [scout] = allies(s, [SNOWBOURN]);
  orc.shadows = [HD.ladders];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: orc.id, defenderId: scout.id });
  s = settle(s);
  assert.equal(get(s, scout.id), undefined);
  assert.equal(s.progress, 1);
  // Soldier of Isengard: exhaust a character you control.
  s = base(1);
  orc = engaged(s, HD.hillman);
  [guard] = allies(s, [GUARD]);
  orc.shadows = [HD.soldier];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: orc.id, defenderId: guard.id });
  assert.match(s.choice!.title, /^Soldier of Isengard · Exhaust a character/);
  const target = s.heroes[0];
  s = choose(s, target.id);
  assert.equal(get(s, target.id)!.exhausted, true);
});

test("The Orcs of the White Hand: Isengard Uruk, Fighting Uruk-hai and Uruk-hai Fighter", () => {
  let s = base(1);
  s.phase = "quest";
  reveal(s, WHITE_HAND.uruk);
  assert.match(s.choice!.title, /^Isengard Uruk · Choose one/);
  s = base(1);
  s.encounterDeck = [HD.postern, WHITE_HAND.fighter];
  s.phase = "quest";
  const staged = stagingThreat(s);
  reveal(s, WHITE_HAND.fighting);
  s = choose(s, `deck-${WHITE_HAND.fighter}`);
  s = settle(s);
  assert.ok(s.engaged.some((u) => u.code === WHITE_HAND.fighter));
  assert.equal(stagingThreat(s), staged + 3);
  s = base(1);
  const fighter = engaged(s, WHITE_HAND.fighter);
  const [scout] = allies(s, [SNOWBOURN]);
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: fighter.id, defenderId: scout.id });
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === fighter.id));
});

test("Saves validate, and the panel data shows the stage, the tokens and the round's effects", () => {
  let s = base(2);
  helmsDeepDefense(s)!.resources = 4;
  s.helmsDeep!.devilry = s.round;
  const restored = reload(s);
  const view = publicState(restored) as unknown as {
    helmsDeep: { tokens: number; defense: boolean; devilry: boolean };
  };
  assert.equal(view.helmsDeep.tokens, 4);
  assert.equal(view.helmsDeep.defense, true);
  assert.equal(view.helmsDeep.devilry, true);
  assert.deepEqual(helmsDeepPublicState(restored), view.helmsDeep);
  assert.equal(
    HELMS_DEEP_RECIPES.find((r) => r.mode === "standard")!.id,
    "Q0B.08",
  );
  void STEWARD;
});
