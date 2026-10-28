import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, publicState, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, make, stageInfo, stats, threatOf } from "../src/game/core";
import {
  check,
  damage,
  destroy,
  engage,
  progress,
  revealed,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  activeSeat,
  allCharacters,
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
} from "../src/game/table";
import { consideredEngaged } from "../src/game/considered-engagement";
import {
  WAINRIDERS as W,
  WAINRIDERS_QUESTS,
  WAINRIDERS_RECIPES,
  wainridersAhead,
} from "../src/game/wainriders-support";
import {
  WAINRIDERS_HOOKS as hooks,
  wainridersDamage,
  wainridersShadow,
} from "../src/game/wainriders";
import { base, start, choose, reload, settle } from "./wainriders-fixtures";
import type { GameState } from "../src/game/types";
const staged = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const champion = (s: GameState) =>
  s.staging.find((u) => u.code === W.champion)!;
const stage = (s: GameState, n: number, lap = 0) => {
  s.stage = n;
  s.wainriders!.challengerSteps = lap * 6 + n - 1;
  s.wainriders!.currentQuest = WAINRIDERS_QUESTS[n - 1].code;
  s.progress = 0;
};
const finish = (s: GameState) => {
  check(s);
  flush(s);
  return settle(s);
};
for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`Wainriders native ${players}-player ${easy ? "easy" : "normal"} setup preserves the circuit and each physical copy`, () => {
      const s = start(players, easy, 91, true, true);
      assert.equal(s.phase, "resource");
      assert.equal(s.staging.length, players + 2);
      assert.equal(s.wainriders!.setupChosen.length, players - 1);
      assert.equal(new Set(s.wainriders!.setupChosen).size, players - 1);
      assert.equal(stageInfo(s).quest, 4 * players);
      const physical = [
        ...s.encounterDeck,
        ...s.encounterDiscard,
        ...s.staging.map((u) => u.code),
        ...WAINRIDERS_QUESTS.map((c) => c.code),
      ].sort();
      const r = WAINRIDERS_RECIPES.find(
        (r) => r.mode === (easy ? "easy" : "standard"),
      )!;
      assert.deepEqual(
        physical,
        r.cards.flatMap((r) => Array<string>(r.quantity).fill(r.code)).sort(),
      );
      reload(s);
    });
test("Champion scales with players, stays in staging and has virtual engagement at the same physical stage, including a lap apart", () => {
  const s = base(2),
    c = champion(s);
  assert.equal(threatOf(s, c), 4);
  assert.equal(stats(s, c).defense, 4);
  assert.equal(stats(s, c).attack, 4);
  for (const p of playerOrder(s))
    assert.equal(consideredEngaged(s, c, p), true);
  wainridersDamage(s, 8);
  assert.equal(consideredEngaged(s, c, 0), false);
  stage(s, 2);
  assert.equal(consideredEngaged(s, c, 0), true);
  stage(s, 2, 1);
  assert.equal(consideredEngaged(s, c, 0), true);
  damage(s, c.id, 8, { combatDamage: true });
  assert.equal(c.damage, 8);
  destroy(s, c);
  engage(s, c);
  assert.ok(s.staging.some((u) => u.id === c.id));
  reload(s);
});
test("Race blocks player-card progress and cannot advance outside quest phase", () => {
  const s = base();
  progress(s, 8, true);
  assert.equal(s.progress, 0);
  progress(s, 4);
  assert.equal(s.progress, 4);
  assert.equal(s.stage, 1);
  s.phase = "quest";
  hooks.advance!(s);
  flush(s);
  assert.match(s.choice!.title, /Racing defense/);
  reload(s);
});
test("Success retains completed-stage progress until quest end and carries excess through escalating tests", () => {
  let s = base();
  s.phase = "staging";
  s.encounterDeck = Array(20).fill(W.cunning);
  progress(s, 11);
  flush(s);
  assert.equal(s.wainriders!.test!.required, 1);
  s = choose(s, s.heroes[0].id);
  assert.equal(s.stage, 2);
  assert.equal(s.progress, 7);
  assert.equal(s.wainriders!.progress[0], 11);
  assert.equal(s.wainriders!.test!.required, 2);
  s = choose(s, s.heroes[1].id);
  assert.equal(s.stage, 3);
  assert.equal(s.progress, 3);
  assert.equal(s.wainriders!.completed, 2);
  assert.equal(s.wainriders!.progress[1], 7);
  hooks.endQuest!(s);
  flush(s);
  assert.deepEqual(s.wainriders!.progress, [0, 0, 3, 0, 0, 0]);
  assert.equal(s.progress, 3);
  reload(s);
});
test("A failed stage still advances without excess; Home Stretch failure resets and does not advance", () => {
  let s = base();
  s.phase = "quest";
  s.encounterDeck = Array(20).fill(W.horse);
  s.hand.push(make(s, "01022"));
  progress(s, 7);
  flush(s);
  s = choose(s, s.heroes[0].id);
  assert.equal(s.stage, 2);
  assert.equal(s.progress, 0);
  assert.equal(s.hand.length, 0);
  assert.equal(s.wainriders!.lastTest!.passed, false);
  stage(s, 6);
  s.heroes.forEach((h) => (h.exhausted = false));
  progress(s, 9);
  flush(s);
  s = choose(s, s.heroes[1].id);
  assert.equal(s.stage, 6);
  assert.equal(s.progress, 0);
  assert.equal(s.wainriders!.completed, 1);
  reload(s);
});
test("Ravine Ledge stacks requirements only while in staging, uses one first-player driver and does not shuffle an empty encounter deck mid-test", () => {
  let s = base(2);
  s.phase = "quest";
  staged(s, W.ravine);
  staged(s, W.ravine);
  s.encounterDeck = [W.cunning];
  progress(s, 8);
  flush(s);
  assert.equal(s.wainriders!.test!.required, 3);
  assert.ok(
    s.choice!.options.every((o) => s.heroes.some((h) => h.id === o.id)),
  );
  s = choose(s, s.heroes[0].id);
  assert.equal(s.wainriders!.lastTest!.cards.length, 1);
  assert.equal(s.wainriders!.lastTest!.matches, 1);
  assert.equal(s.encounterDeck.length + s.encounterDiscard.length, 1);
  reload(s);
});
test("With no ready first-player character the racing test fails and resolves the printed penalty", () => {
  const s = base();
  s.phase = "quest";
  stage(s, 2);
  s.heroes.forEach((h) => (h.exhausted = true));
  progress(s, 4);
  flush(s);
  assert.equal(s.stage, 3);
  assert.ok(s.heroes.every((h) => h.damage === 1));
  assert.equal(s.wainriders!.lastTest!.matches, 0);
  reload(s);
});
test("The Turnaround discards an ally, Farthest Edge reveals two cards with three players and Last Climb advances the rival", () => {
  let s = base();
  stage(s, 3);
  s.phase = "quest";
  s.heroes.forEach((h) => (h.exhausted = true));
  s.allies.push(make(s, "01013"));
  s.allies[0].exhausted = true;
  progress(s, 4);
  flush(s);
  s = choose(s, s.allies[0].id);
  assert.equal(s.allies.length, 0);
  assert.equal(s.stage, 4);
  s = base(3);
  stage(s, 4);
  s.phase = "quest";
  s.heroes.forEach((h) => (h.exhausted = true));
  s.encounterDeck = Array(10).fill(W.narrow);
  progress(s, 12);
  flush(s);
  s = settle(s);
  assert.equal(s.staging.filter((u) => u.code === W.narrow).length, 2);
  s = base();
  stage(s, 5);
  s.phase = "quest";
  s.heroes.forEach((h) => (h.exhausted = true));
  progress(s, 4);
  flush(s);
  assert.equal(s.wainriders!.damage, 2);
  assert.equal(s.stage, 6);
});
test("Two complete circuits win only after the final TURN test; the rival's excess damage can cross several stages and lose immediately", () => {
  let s = base();
  stage(s, 6, 1);
  s.phase = "quest";
  s.encounterDeck = [W.cunning, W.cunning, W.cunning];
  progress(s, 4);
  flush(s);
  s = choose(s, s.heroes[1].id);
  assert.equal(s.status, "won");
  assert.equal(s.wainriders!.challengerSteps, 12);
  reload(s);
  s = base(2);
  wainridersDamage(s, 95);
  assert.equal(s.wainriders!.wainriderSteps, 11);
  assert.equal(s.wainriders!.damage, 7);
  wainridersDamage(s, 1);
  assert.equal(s.status, "lost");
  reload(s);
});
test("Rival quest-end progress includes only enemies in staging and Veteran's leading modifier", () => {
  const s = base();
  stage(s, 2);
  const v = staged(s, W.veteran),
    e = staged(s, W.driver);
  engage(s, e);
  assert.ok(wainridersAhead(s));
  assert.equal(threatOf(s, v), 4);
  assert.equal(hooks.cannotLeave!(s, v, true), true);
  hooks.endQuest!(s);
  flush(s);
  assert.equal(s.wainriders!.wainriderSteps, 1);
  assert.equal(s.wainriders!.damage, 2);
  assert.equal(threatOf(s, v), 2);
});
test("Narrow Pass is an optional saved damage replacement and never grants player effects access to the immune champion", () => {
  let s = base();
  const c = champion(s);
  s.activeLocation = make(s, W.narrow);
  s.wainriders!.damage = 3;
  damage(s, c.id, 5, { combatDamage: true });
  flush(s);
  assert.equal(c.damage, 0);
  s = choose(s, "remove");
  assert.equal(s.wainriders!.damage, 0);
  assert.equal(champion(s).damage, 0);
  damage(s, champion(s).id, 2, { combatDamage: true });
  flush(s);
  s = choose(s, "skip");
  assert.equal(champion(s).damage, 2);
  reload(s);
});
test("Wainrider Chariot is one physical attachment and feeds excess combat damage to the rival", () => {
  let s = base();
  const e = staged(s, W.driver);
  revealed(s, W.chariot);
  flush(s);
  s = choose(s, e.id);
  assert.equal(
    get(s, e.id)!.attachments.filter((a) => a.code === W.chariot).length,
    1,
  );
  assert.equal(stats(s, get(s, e.id)!).attack, 6);
  assert.ok(!s.encounterDiscard.includes(W.chariot));
  const h = s.heroes[0];
  h.damage = stats(s, h).health - 1;
  damage(s, h.id, 3, { enemyId: e.id, combatDamage: true });
  flush(s);
  assert.equal(s.wainriders!.damage, 2);
  reload(s);
});
test("New shadows and Aggressive Racer apply only to actual combat destruction", () => {
  const s = base(),
    e = staged(s, W.racer);
  s.combat = { enemyId: e.id, attackBonus: 0, defenderId: s.heroes[0].id };
  wainridersShadow(s, W.cunning);
  wainridersShadow(s, W.driver);
  stage(s, 2);
  wainridersShadow(s, W.veteran);
  assert.equal(s.combat.attackBonus, 3);
  damage(s, s.heroes[0].id, 20, { enemyId: e.id, combatDamage: true });
  flush(s);
  assert.equal(s.wainriders!.damage, 2);
  assert.equal(s.combat?.returnToStaging, true);
  for (const e of hooks.attackFinished!(s, s.combat!)) handle(s, e);
  assert.equal(s.wainriders!.wainriderSteps, 1);
  reload(s);
});
test("Crowded Track searches for each player and Captain forced entry still attaches an Easterling treachery", () => {
  let s = base(2);
  const l = make(s, W.crowded);
  s.activeLocation = l;
  s.encounterDeck = [W.captain, W.chariot, W.driver, W.horse];
  assert.equal(threatOf(s, l), 3);
  hooks.travelEntered!(s, l, true);
  flush(s);
  s = choose(s, `deck:${W.captain}`);
  s = settle(s);
  const cap = s.staging.find((u) => u.code === W.captain)!;
  assert.ok(cap.attachments.some((a) => a.code === W.chariot));
  assert.ok(s.staging.some((u) => u.code === W.driver));
  reload(s);
});
test("Racing tests, pending costs and public rendering restore exactly and reject malformed race state", () => {
  const s = base();
  s.phase = "quest";
  progress(s, 4);
  flush(s);
  reload(s);
  const before = JSON.stringify(s);
  publicState(s);
  assert.equal(JSON.stringify(s), before);
  const bad = structuredClone(s);
  bad.wainriders!.progress = [-1];
  assert.equal(validateSave(bad), false);
  const invalid = structuredClone(s);
  invalid.wainriders!.test!.stat = "health" as "will";
  assert.equal(validateSave(invalid), false);
});
test("All six Race quests stay in play and attached quest responses survive a lap without discarding the attachment", async () => {
  const { allQuestUnits } = await import("../src/game/quest-state");
  const { playTargets } = await import("../src/game/engine");
  let s = base();
  const attachment = make(s, "10122");
  assert.equal(playTargets(s, attachment).length, 6);
  s.questAttachments = {
    [WAINRIDERS_QUESTS[0].code]: [
      { id: attachment.id, code: attachment.code, exhausted: false },
    ],
  };
  s.phase = "quest";
  s.encounterDeck = Array(10).fill(W.cunning);
  progress(s, 4);
  flush(s);
  s = choose(s, s.heroes[0].id);
  assert.match(s.choice!.title, /Long Defeat/);
  assert.equal(s.stage, 2);
  assert.ok(
    allQuestUnits(s)[0].attachments.some((a) => a.id === attachment.id),
  );
  assert.ok(!s.discard.includes(attachment.code));
  s = choose(s, "skip");
  assert.equal(playTargets(s, make(s, "10122")).length, 5);
  reload(s);
});
test("The Champion's Cunning makes real attacks against each virtually engaged player, or advances by the champion's current threat", () => {
  let s = base(2);
  revealed(s, W.cunning);
  flush(s);
  s = settle(s);
  assert.ok(
    allCharacters(s).some((u) => u.damage > 0) ||
      playerOrder(s).some((p) =>
        seatView(s, p).discard.some((c) => card(c).type_code === "hero"),
      ),
  );
  assert.equal(s.wainriders!.damage, 0);
  assert.equal(s.wainriders!.cunning, undefined);
  reload(s);
  s = base(2);
  s.wainriders!.wainriderSteps = 1;
  revealed(s, W.cunning);
  flush(s);
  assert.equal(s.wainriders!.damage, 4);
  assert.equal(s.combat, null);
  reload(s);
});
test("Native Ravine travel tests its staging modifier before entering and rewards every player without requiring success to travel", () => {
  let s = base();
  s.phase = "travel";
  const ravine = staged(s, W.ravine);
  s.encounterDeck = Array(8).fill(W.cunning);
  const n = s.hand.length;
  s = applyAction(reload(s), { type: "TRAVEL", id: ravine.id });
  assert.equal(s.wainriders!.test!.required, 2);
  s = choose(s, s.heroes[1].id);
  assert.equal(s.activeLocation!.id, ravine.id);
  assert.equal(s.hand.length, n + 1);
  reload(s);
});
