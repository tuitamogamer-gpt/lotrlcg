import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, canTravel, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, make, stageInfo, stats, threatOf } from "../src/game/core";
import { check, damage, progress } from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import { canCommit, playTargets } from "../src/game/actions";
import { forOwner, playerOrder, seatView } from "../src/game/table";
import {
  DDCD as D,
  DDCD_HOOKS as hooks,
  DDCD_QUESTS,
  DDCD_RECIPES,
} from "../src/game/dungeons-deep";
import { HOBBIT_BILBO, bagginsBilbo } from "../src/game/hobbit-saga";
import {
  base,
  choose,
  reload,
  settle,
  stage,
  start,
} from "./dungeons-deep-fixtures";
import type { GameState } from "../src/game/types";

const run = (s: GameState, preferred?: string) => {
  flush(s);
  check(s);
  flush(s);
  return settle(s, preferred);
};
const combat = (s: GameState, enemyId: string, extra = {}) =>
  (s.combat = {
    enemyId,
    attackPlayer: 0,
    attackBonus: 0,
    defenderId: null,
    ...extra,
  } as unknown as GameState["combat"]);
const bilbo = (s: GameState) => bagginsBilbo(s)!;
const reveal = (s: GameState, code: string) => {
  hooks.revealed!(s, code, "encounter");
  return hooks.encounter!(s, code, false, true);
};

for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`Dungeons Deep and Caverns Dim ${players} players ${easy ? "easy" : "normal"}: Lake in the Cavern, the riddle area with Gollum and Bilbo, and the exact inventory`, () => {
      const s = start(players, easy, 91, true, true);
      const q = s.dungeonsDeep!;
      assert.equal(s.phase, "resource");
      assert.equal(s.stage, 1);
      assert.equal(stageInfo(s).quest, 14);
      assert.equal(q.bilboInRiddleArea, true);
      assert.deepEqual(
        q.riddleArea.map((u) => u.code),
        [D.gollum],
      );
      assert.ok(bilbo(s).attachments.some((a) => a.code === D.ring));
      const recipe = DDCD_RECIPES.find(
        (r) => r.mode === (easy ? "easy" : "standard"),
      )!;
      const physical = [
        ...s.encounterDeck,
        ...s.encounterDiscard,
        ...s.staging.map((u) => u.code),
        ...playerOrder(s).flatMap((p) =>
          seatView(s, p).engaged.map((u) => u.code),
        ),
        ...q.riddleArea.map((u) => u.code),
        D.ring,
        ...DDCD_QUESTS.map((c) => c.code),
        HOBBIT_BILBO,
      ].sort();
      assert.deepEqual(
        physical,
        recipe.cards
          .flatMap((r) => Array<string>(r.quantity).fill(r.code))
          .sort(),
      );
      reload(s);
    });

test("Bilbo in the riddle area cannot quest, attack, defend except against Gollum, take other damage or receive player attachments; Lake in the Cavern has 2X threat and cannot be travelled to", () => {
  const s = base(2);
  const b = bilbo(s);
  assert.equal(canCommit(s, b), false);
  const axeman = stage(s, D.axeman);
  assert.ok(hooks.cannotAttack!(s, b, axeman));
  assert.ok(hooks.cannotDefend!(s, axeman, b));
  assert.ok(!hooks.cannotDefend!(s, s.dungeonsDeep!.riddleArea[0], b));
  assert.equal(hooks.damageAmount!(s, b, 3, {}), 0);
  assert.equal(
    hooks.damageAmount!(s, b, 2, {
      enemyId: s.dungeonsDeep!.riddleArea[0].id,
    }),
    2,
  );
  assert.ok(hooks.cannotAttach!(s, b, "131020"));
  assert.ok(!playTargets(s, make(s, "131020")).some((u) => u.id === b.id));
  const lake = stage(s, D.lake);
  assert.equal(threatOf(s, lake), 4);
  s.phase = "travel";
  assert.match(canTravel(s, lake)!, /Lake in the Cavern/);
  assert.equal(hooks.extraStagingReveals!(s), 2);
  assert.ok(hooks.cannotEngage!(s, s.dungeonsDeep!.riddleArea[0]));
});

test("Answering Wild Wargs' riddle names a card type, spends Bilbo's ring resources for extra cards, places progress on stage 2 and discards the Wargs", () => {
  let s = base(1);
  forOwner(s, 0, () => (s.deck = ["01073", "01067", "01071", "01073"]));
  const wargs = stage(s, D.wargs);
  bilbo(s).resources = 1;
  reveal(s, D.wargs);
  flush(s);
  assert.match(s.choice!.title, /Wild Wargs/);
  s = choose(s, "answer");
  s = choose(s, "type-ally");
  assert.match(s.choice!.title, /Magic Ring/);
  s = choose(s, "ring-1");
  s = run(s);
  const q = s.dungeonsDeep!;
  const discarded = seatView(s, 0).discard;
  assert.equal(discarded.length, 3);
  assert.equal(
    q.riddleProgress,
    discarded.filter((c) => card(c).type_code === "ally").length,
  );
  assert.equal(bilbo(s).resources, 0);
  assert.ok(!s.staging.some((u) => u.id === wargs.id));
  assert.ok(s.encounterDiscard.includes(D.wargs));
  reload(s);
});

test("A riddle with no match makes Gollum attack Bilbo, who may defend", () => {
  let s = base(1);
  forOwner(s, 0, () => (s.deck = ["01073", "01073", "01073"]));
  reveal(s, D.pocket);
  flush(s);
  s = choose(s, "sphere-baggins");
  s = choose(s, "cost-0");
  s = run(s, "undefended");
  assert.equal(s.dungeonsDeep!.riddleProgress, 0);
  assert.equal(bilbo(s).damage, 2);
  s = base(1);
  forOwner(s, 0, () => (s.deck = ["01073", "01073", "01073"]));
  reveal(s, D.pocket);
  flush(s);
  s = choose(s, "sphere-baggins");
  s = choose(s, "cost-0");
  s = choose(s, "ring-0");
  s = choose(s, "defend");
  s = run(s);
  assert.equal(bilbo(s).exhausted, true);
  assert.equal(bilbo(s).damage, Math.max(0, 2 - stats(s, bilbo(s)).defense));
});

test("It Likes Riddles? must be answered and, after a match, discards to the next riddle and answers it too", () => {
  let s = base(1);
  forOwner(s, 0, () => (s.deck = Array(10).fill("01073")));
  s.encounterDeck = [D.axeman, D.wargs, D.axeman];
  reveal(s, D.likes);
  flush(s);
  bilbo(s).resources = 0;
  s = choose(s, `cost-${Number(card("01073").cost)}`);
  flush(s);
  assert.match(s.choice!.title, /Wild Wargs/);
  s = choose(s, "type-ally");
  s = run(s);
  assert.equal(s.dungeonsDeep!.riddleProgress, 4);
  assert.deepEqual(s.encounterDeck, [D.axeman]);
  assert.ok(s.encounterDiscard.includes(D.likes));
});

test("Not fair! Not fair! removes stage 2 progress for each non-matching discard; Hiding in the Trees lowers willpower and forbids attacks", () => {
  let s = base(1);
  s.dungeonsDeep!.riddleProgress = 3;
  s.encounterDeck = [D.axeman, D.glade, D.bird];
  reveal(s, D.notFair);
  s = run(s, "enemy");
  assert.equal(s.dungeonsDeep!.riddleProgress, 1);
  assert.ok(hooks.cannotCancel!(s, false, D.notFair));
  const h = seatView(s, 0).heroes[0];
  const will = stats(s, h).will;
  reveal(s, D.hiding);
  s = run(s, "resolve");
  assert.equal(stats(s, get(s, h.id)!).will, will - 1);
  assert.ok(hooks.cannotAttack!(s, get(s, h.id)!, make(s, D.axeman)));
});

test("Come down little bird engages a Creature for each player; Wild Wargs gain +2 attack with a riddle shadow; Great Gray Wolf returns Creatures; The Wargs' Glade removes progress", () => {
  let s = base(2);
  s.encounterDeck = [D.axeman, D.wargs];
  s.encounterDiscard = [D.wolf];
  reveal(s, D.bird);
  s = run(s, "resolve");
  const creatures = playerOrder(s).flatMap((p) =>
    seatView(s, p).engaged.filter((u) => [D.wargs, D.wolf].includes(u.code)),
  );
  assert.equal(creatures.length, 2);
  const wargs = creatures.find((u) => u.code === D.wargs)!;
  const attack = stats(s, wargs).attack;
  wargs.shadows = [D.pocket];
  assert.equal(stats(s, wargs).attack, attack + 2);
  const wolf = creatures.find((u) => u.code === D.wolf)!;
  hooks.shadowDealt!(s, wolf, D.hiding);
  hooks.combatEnd!(s);
  assert.ok(s.staging.some((u) => u.id === wolf.id));
  assert.ok(s.staging.some((u) => u.id === wargs.id));
  stage(s, D.glade);
  s.progress = 3;
  hooks.damageDealt!(s, seatView(s, 0).heroes[0], 2, {
    combatDamage: true,
    enemyId: wargs.id,
  });
  assert.equal(s.progress, 2);
});

test("The quest advances only with 14 progress on 1B and 9 on 2B; Into the Fire frees Bilbo, removes the Lake, engages Gollum and wins at 16", () => {
  let s = base(1);
  stage(s, D.lake);
  progress(s, 14);
  s = run(s);
  assert.equal(s.stage, 1);
  s.dungeonsDeep!.riddleProgress = 9;
  check(s);
  s = run(s);
  assert.equal(s.stage, 3);
  const q = s.dungeonsDeep!;
  assert.equal(q.bilboInRiddleArea, false);
  assert.deepEqual(q.riddleArea, []);
  assert.ok(!s.staging.some((u) => u.code === D.lake));
  assert.ok(s.removedEncounter?.includes(D.lake));
  const gollum = seatView(s, 0).engaged.find((u) => u.code === D.gollum)!;
  assert.ok(gollum);
  assert.equal(hooks.cannotCommit!(s, bilbo(s)), false);
  assert.ok(hooks.revealedSurge!(s, D.notFair));
  combat(s, gollum.id);
  hooks.enemyAttackStarted!(s, gollum, 0);
  assert.equal(s.combat!.undefendedTargetId, bilbo(s).id);
  s.combat = null;
  progress(s, 16);
  s = run(s);
  assert.equal(s.status, "won");
});

test("Bilbo's Magic Ring exhausts to raise each player's threat by 2 and give Bilbo a Baggins resource", () => {
  let s = base(2);
  const b = bilbo(s);
  const ring = b.attachments.find((a) => a.code === D.ring)!;
  const resources = b.resources;
  assert.equal(hooks.abilityProblem!(s, b, ring.id), null);
  s = applyAction(reload(s), {
    type: "ABILITY",
    id: b.id,
    attachmentId: ring.id,
  });
  s = run(s);
  assert.equal(bilbo(s).resources, resources + 1);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    [22, 22],
  );
  assert.ok(bilbo(s).attachments.find((a) => a.code === D.ring)!.exhausted);
});

test("Goblins count Lake in the Cavern as a Cave, and riddles are ignored once stage 3 begins", () => {
  let s = base(1);
  const axeman = stage(s, D.axeman);
  const attack = stats(s, axeman).attack;
  stage(s, D.lake);
  assert.equal(stats(s, axeman).attack, attack + 1);
  s = base(1, 3);
  stage(s, D.wargs);
  reveal(s, D.wargs);
  flush(s);
  assert.equal(s.choice, null);
  assert.ok(s.staging.some((u) => u.code === D.wargs));
});

test("Losing Bilbo in the riddle game loses the game", () => {
  let s = base(1);
  bilbo(s).damage = 2;
  forOwner(s, 0, () => (s.deck = ["01073", "01073", "01073"]));
  reveal(s, D.pocket);
  flush(s);
  s = choose(s, "sphere-baggins");
  s = choose(s, "cost-0");
  s = run(s, "undefended");
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Bilbo Baggins has left play/);
  void damage;
});

test("Malformed Dungeons Deep and Caverns Dim saves are rejected", () => {
  const s = base(1);
  const bad = (mutate: (raw: GameState) => void) => {
    const raw = JSON.parse(JSON.stringify(s));
    mutate(raw);
    return validateSave(raw);
  };
  assert.ok(bad(() => undefined));
  assert.ok(!bad((r) => (r.dungeonsDeep!.riddleProgress = -1)));
  assert.ok(!bad((r) => (r.stage = 2)));
  assert.ok(!bad((r) => (r.dungeonsDeep!.currentQuest = D.fire)));
  assert.ok(!bad((r) => r.dungeonsDeep!.riddleArea.push(make(r, D.wargs))));
});
