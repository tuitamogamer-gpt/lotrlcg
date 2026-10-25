import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, canTravel, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  fx,
  make,
  stats,
  stagingThreat,
  engagementCost,
  stageInfo,
  get,
  cannotReady,
} from "../src/game/core";
import {
  check,
  damage,
  engage,
  enemyAddedToStaging,
  phaseEnd,
  readyCharacter,
  revealed,
  destroy,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  allCharacters,
  allEngaged,
  forOwner,
  playerOrder,
  seatView,
} from "../src/game/table";
import { mainQuestUnit } from "../src/game/quest-state";
import { addQuestProgress } from "../src/game/side-quests";
import {
  RIVER_RUNNING as R,
  RIVER_RUNNING_RECIPES,
  riverRunningPublicState,
} from "../src/game/river-running-support";
import {
  shadowEastAttach,
  shadowEastEnemyEntered,
  shadowEastReturn,
} from "../src/game/shadow-east-encounters";
import { riverRunningShadow } from "../src/game/river-running";
import { attachmentHasTrait } from "../src/game/expansion-passives";
import { syncAttachmentText } from "../src/game/attachment-text";
import { templePlayerEvent } from "../src/game/temple-player";
import { base, start, reload, settle, choose } from "./river-running-fixtures";
import type { GameState, Unit } from "../src/game/types";
const staged = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const objective = (s: GameState) =>
  s.staging.find((u) => u.code === R.pursuit)!;
const finish = (s: GameState) => {
  check(s);
  flush(s);
  return settle(s);
};
const counts = (codes: string[]) =>
  Object.fromEntries(
    [...new Set(codes)]
      .sort()
      .map((c) => [c, codes.filter((x) => x === c).length]),
  );
function encounterPool(s: GameState) {
  const units = [
    ...s.staging,
    ...allEngaged(s),
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.riverRunning?.setAside ?? []),
  ];
  return [
    ...s.encounterDeck,
    ...s.encounterDiscard,
    ...(s.victoryCards ?? []),
    ...units.flatMap((u) => [
      u.code,
      ...u.shadows,
      ...u.attachments.map((a) => a.code),
    ]),
  ];
}
function combat(s: GameState, code = R.raider, p = 0) {
  const u = make(s, code);
  forOwner(s, p, () => {
    u.owner = p;
    s.engaged.push(u);
  });
  s.phase = "defense";
  s.combat = {
    enemyId: u.id,
    defenderId: null,
    attackBonus: 0,
    attackPlayer: p,
  };
  return u;
}
function stageTwo(s: GameState) {
  s.stage = 2;
  s.riverRunning!.currentQuest = R.second;
  s.riverRunning!.progressRound = s.round;
  s.riverRunning!.progressPlaced = 0;
}
function reveal(s: GameState, code: string) {
  revealed(s, code);
  flush(s);
  return settle(s);
}
for (const easy of [false, true])
  for (const n of [1, 2, 3, 4])
    test(`River ${easy ? "easy" : "normal"} ${n} seats preserves original physical pool and different starting enemies`, () => {
      const s = start(n, easy, 1199, false, true);
      assert.equal(s.status, "playing");
      assert.equal(s.staging.length, n + 2);
      assert.equal(
        new Set(
          s.staging
            .filter((u) => card(u.code).type_code === "enemy")
            .map((u) => u.code),
        ).size,
        n,
      );
      assert.equal(s.riverRunning!.setAside.length, 1);
      assert.equal(stageInfo(s).quest, 5 + 5 * n);
      const expected = RIVER_RUNNING_RECIPES.find(
        (r) => r.mode === (easy ? "easy" : "standard"),
      )!
        .cards.filter((r) => r.section !== "sharedQuestDeck")
        .flatMap((r) => Array<string>(r.quantity).fill(r.code));
      assert.equal(expected.length, easy ? 28 : 38);
      assert.deepEqual(counts(encounterPool(s)), counts(expected));
      assert.ok(validateSave(reload(s)));
    });
test("River classic and guided solo open with the same printed first quest", () => {
  for (const guided of [false, true]) {
    const s = start(1, false, 1234, guided, false);
    assert.equal(s.table, undefined);
    assert.equal(s.riverRunning!.currentQuest, R.first);
    assert.equal(stageInfo(s).quest, 10);
    assert.ok(validateSave(reload(s)));
  }
});
test("Pursuit raises total staging threat only during first main stage", () => {
  const s = base();
  objective(s).resources = 4;
  const baseline = stagingThreat(s);
  assert.equal(baseline, 4);
  stageTwo(s);
  assert.equal(stagingThreat(s), 0);
});
test("Pursuit end round adds once, consumes only three resources and uses physical deck cards", () => {
  let s = base(2);
  s.encounterDeck = [R.plains, R.warrior, R.fatigue, R.raider, R.outcrop];
  s.encounterDiscard = [R.sword];
  objective(s).resources = 5;
  const before = counts(encounterPool(s));
  handle(s, fx("riverRoundEnd"));
  s = finish(s);
  assert.equal(objective(s).resources, 3);
  assert.equal(
    s.staging.filter((u) => card(u.code).type_code === "enemy").length,
    2,
  );
  assert.deepEqual(counts(encounterPool(s)), before);
});
test("Pursuit stops at empty encounter deck when fewer enemies remain", () => {
  let s = base(4);
  s.encounterDeck = [R.plains, R.raider];
  s.encounterDiscard = [];
  objective(s).resources = 2;
  handle(s, fx("riverRoundEnd"));
  s = finish(s);
  assert.equal(objective(s).resources, 0);
  assert.equal(
    s.staging.filter((u) => card(u.code).type_code === "enemy").length,
    1,
  );
  assert.equal(s.encounterDeck.length, 0);
});
test("Blanked Pursuit does not add a round-end resource or trigger a hunt", () => {
  let s = base();
  objective(s).blanked = true;
  objective(s).resources = 3;
  handle(s, fx("riverRoundEnd"));
  assert.equal(objective(s).resources, 3);
  assert.equal(s.queue.length, 0);
});
test("Advancing adds the set-aside side quest without resolving its Surge keyword", () => {
  let s = base(2);
  s.progress = 15;
  s.encounterDeck = [R.raider, R.outrider, R.plains];
  s.encounterDiscard = [];
  s = finish(s);
  assert.equal(s.stage, 2);
  assert.equal(s.riverRunning!.setAside.length, 0);
  assert.equal(s.staging.filter((u) => u.code === R.warriors).length, 1);
  assert.equal(
    s.staging.filter((u) => card(u.code).type_code === "enemy").length,
    2,
  );
  assert.equal(s.encounterDeck.length + s.encounterDiscard.length, 1);
  assert.equal(s.staging.filter((u) => u.code === R.plains).length, 0);
  assert.equal(s.progress, 0);
});
test("Crossing progress is capped cumulatively and direct progress obeys the same five-point limit", () => {
  const s = base();
  stageTwo(s);
  combat(s);
  s.phase = "quest";
  addQuestProgress(s, mainQuestUnit(s)!, 3);
  addQuestProgress(s, mainQuestUnit(s)!, 9);
  assert.equal(s.progress, 5);
  assert.equal(s.riverRunning!.progressPlaced, 5);
  s.round++;
  addQuestProgress(s, mainQuestUnit(s)!, 10);
  assert.equal(s.progress, 10);
});
test("Crossing tracks progress before engagement and allows unrestricted progress after enemies leave", () => {
  const s = base();
  stageTwo(s);
  addQuestProgress(s, mainQuestUnit(s)!, 8);
  const u = combat(s);
  addQuestProgress(s, mainQuestUnit(s)!, 8);
  assert.equal(s.progress, 8);
  shadowEastReturn(s, u);
  addQuestProgress(s, mainQuestUnit(s)!, 4);
  assert.equal(s.progress, 12);
});
test("Crossing engagement reduction applies only to enemies in staging", () => {
  const s = base();
  stageTwo(s);
  const u = staged(s, R.raider),
    printed = card(u.code).engagement!;
  assert.equal(engagementCost(s, u), printed - 10);
  engage(s, u);
  assert.equal(engagementCost(s, u), printed);
});
test("Defeating the second stage wins through the ordinary progress pipeline", () => {
  let s = base();
  stageTwo(s);
  addQuestProgress(s, mainQuestUnit(s)!, 15);
  s = finish(s);
  assert.equal(s.status, "won");
});
test("River Running prevents optional engagement but its travel cost engages the highest enemy", () => {
  let s = base(2);
  s.phase = "travel";
  const location = staged(s, R.river),
    low = staged(s, R.outrider),
    high = staged(s, R.raider);
  assert.ok(card(high.code).engagement! > card(low.code).engagement!);
  assert.equal(canTravel(s, location), null);
  s = applyAction(s, { type: "TRAVEL", id: location.id });
  s = settle(s);
  assert.equal(s.activeLocation?.id, location.id);
  assert.ok(seatView(s, 0).engaged.some((u) => u.id === high.id));
});
test("River Running cannot be travelled to without a staged enemy to pay its cost", () => {
  const s = base();
  s.phase = "travel";
  const u = staged(s, R.river);
  assert.match(canTravel(s, u) ?? "", /engage an enemy/);
});
test("Outrider engagement offers a saved pursuit-versus-attack decision to its engaged player", () => {
  let s = base(2);
  const u = staged(s, R.outrider);
  forOwner(s, 1, () => engage(s, u));
  flush(s);
  assert.ok(s.choice?.options.some((o) => o.id === "attack"));
  s = choose(s, "pursuit");
  assert.equal(objective(s).resources, 1);
  assert.ok(seatView(s, 1).engaged.some((x) => x.id === u.id));
});
test("Exposed Riverbank triggers once per live copy when a When Revealed effect is canceled", () => {
  let s = base();
  staged(s, R.riverbank);
  staged(s, R.riverbank);
  handle(
    s,
    fx("placeEncounter", { code: R.fatigue, flag: true, text: "revealed" }),
  );
  s = finish(s);
  assert.equal(objective(s).resources, 2);
});
test("Enemies Close Behind adds pursuit before raising every player threat", () => {
  let s = base(2);
  objective(s).resources = 2;
  s = reveal(s, R.close);
  assert.equal(objective(s).resources, 3);
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 23);
});
test("Rolling Plains repeated reveals stack and affect a later copy only through the current phase", () => {
  let s = base();
  s.phase = "quest";
  s = reveal(s, R.plains);
  s = reveal(s, R.plains);
  const u = staged(s, R.plains);
  assert.equal(stagingThreat(s), 18);
  phaseEnd(s);
  s.phase = "travel";
  assert.equal(stagingThreat(s), 6);
  assert.equal(card(u.code).threat, 2);
});
test("Weary Lands recalculates exhausted qualification and stacks until phase end", () => {
  let s = base();
  s.phase = "quest";
  const h = s.heroes[0],
    original = stats(s, h).will;
  h.exhausted = true;
  s = reveal(s, R.weary);
  assert.equal(stats(s, get(s, h.id)!).will, Math.max(0, original - 1));
  get(s, h.id)!.exhausted = false;
  assert.equal(stats(s, get(s, h.id)!).will, original);
  get(s, h.id)!.exhausted = true;
  s = reveal(s, R.weary);
  assert.equal(stats(s, get(s, h.id)!).will, Math.max(0, original - 2));
  s.phase = "travel";
  assert.equal(stats(s, get(s, h.id)!).will, original);
});
test("Rocky Outcrop blocks player readiness but permits framework and encounter readiness", () => {
  let s = base();
  staged(s, R.outcrop);
  const h = s.heroes[0];
  h.exhausted = true;
  readyCharacter(s, h);
  assert.equal(h.exhausted, true);
  readyCharacter(s, h, false);
  assert.equal(h.exhausted, false);
  h.exhausted = true;
  handle(s, fx("riverFrameworkReady", { target: h.id }));
  assert.equal(h.exhausted, false);
});
test("Arduous Journey lets each player choose six refresh characters, despite Rocky Outcrop", () => {
  let s = base(2);
  staged(s, R.arduous);
  staged(s, R.outcrop);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.allies = Array.from({ length: 5 }, () => make(s, "01028"));
      for (const u of [...s.heroes, ...s.allies]) u.exhausted = true;
    });
  handle(s, fx("refreshReady"));
  s = finish(s);
  for (const p of playerOrder(s)) {
    const units = [...seatView(s, p).heroes, ...seatView(s, p).allies];
    assert.equal(units.filter((u) => !u.exhausted).length, 6);
    assert.equal(units.filter((u) => u.exhausted).length, 2);
    const blocked = units.find((u) => u.exhausted)!;
    assert.equal(cannotReady(blocked, s), true);
  }
});
test("Arduous Journey defeat offers each player an optional hero readiness response", () => {
  let s = base(2);
  const q = staged(s, R.arduous);
  for (const p of playerOrder(s)) seatView(s, p).heroes[0].exhausted = true;
  addQuestProgress(s, q, 6);
  flush(s);
  assert.ok(s.choice?.title.includes("Arduous"));
  for (let n = 0; s.choice && n < 5; n++) {
    const option = s.choice.options.find((o) => o.id !== "skip")!;
    s = choose(s, option.id);
  }
  assert.ok(s.victoryCards?.includes(R.arduous));
  for (const p of playerOrder(s))
    assert.equal(seatView(s, p).heroes[0].exhausted, false);
});
test("Sword chooses the lowest current attack Easterling and Bow the highest engagement", () => {
  let s = base();
  const raider = staged(s, R.raider),
    warrior = staged(s, R.warrior);
  s.encounterDeck = [];
  s = reveal(s, R.sword);
  assert.ok(get(s, raider.id)!.attachments.some((a) => a.code === R.sword));
  s = reveal(s, R.bow);
  const highest = [get(s, raider.id)!, get(s, warrior.id)!].sort(
    (a, b) => engagementCost(s, b) - engagementCost(s, a),
  )[0];
  assert.ok(highest.attachments.some((a) => a.code === R.bow));
});
test("Easterling Raider counts every active Easterling attachment including duplicate forced swords", () => {
  const s = base();
  const u = staged(s, R.raider);
  shadowEastAttach(s, u, R.sword);
  shadowEastAttach(s, u, R.sword);
  assert.equal(stats(s, u).attack, 8);
  assert.equal(stats(s, u).defense, 4);
  templePlayerEvent(s, "12061", u.id);
  assert.equal(stats(s, u).attack, 6);
  assert.equal(stats(s, u).defense, 2);
});
test("Captain entry mills exactly to an Easterling treachery and prevents a damage assignment by discarding it", () => {
  let s = base();
  s.encounterDeck = [R.plains, R.fatigue, R.sword, R.raider];
  const u = staged(s, R.captain);
  enemyAddedToStaging(s, u);
  s = finish(s);
  const c = get(s, u.id)!;
  assert.equal(c.attachments[0].code, R.sword);
  assert.deepEqual(s.encounterDiscard, [R.plains, R.fatigue]);
  damage(s, c.id, 3);
  assert.equal(c.damage, 0);
  assert.equal(c.attachments.length, 0);
  assert.ok(s.encounterDiscard.includes(R.sword));
  damage(s, c.id, 2);
  assert.equal(c.damage, 2);
});
test("Captain multi-attachment damage cancellation survives save and chooses one physical attachment", () => {
  let s = base();
  const u = staged(s, R.captain);
  shadowEastAttach(s, u, R.sword);
  shadowEastAttach(s, u, R.bow);
  damage(s, u.id, 4);
  flush(s);
  assert.equal(s.choice?.options.length, 2);
  s = choose(s, s.choice!.options.find((o) => o.code === R.bow)!.id);
  assert.equal(get(s, u.id)!.damage, 0);
  assert.deepEqual(
    get(s, u.id)!.attachments.map((a) => a.code),
    [R.sword],
  );
});
test("Warriors of the East triggers on actual entry, not returning an existing enemy to staging", () => {
  let s = base();
  staged(s, R.warriors);
  s.encounterDiscard = [R.sword, R.bow];
  const u = staged(s, R.raider);
  enemyAddedToStaging(s, u);
  s = finish(s);
  assert.deepEqual(
    get(s, u.id)!.attachments.map((a) => a.code),
    [R.bow],
  );
  engage(s, get(s, u.id)!);
  shadowEastReturn(s, get(s, u.id)!);
  s = finish(s);
  assert.deepEqual(
    get(s, u.id)!.attachments.map((a) => a.code),
    [R.bow],
  );
  assert.deepEqual(s.encounterDiscard, [R.sword]);
});
test("Warrior of Rhun attaches the top Easterling treachery for every actual attack including duplicate cards", () => {
  let s = base();
  const u = combat(s, R.warrior);
  s.encounterDiscard = [R.bow, R.fatigue, R.sword];
  handle(s, fx("eastAttachTop", { target: u.id }));
  assert.equal(u.attachments[0].code, R.sword);
  handle(s, fx("eastAttachTop", { target: u.id }));
  assert.equal(u.attachments[1].code, R.bow);
  assert.deepEqual(s.encounterDiscard, [R.fatigue]);
});
test("Raider shadow adds attack, with the printed two-point Easterling bonus", () => {
  const s = base();
  const u = combat(s);
  riverRunningShadow(s, R.raider);
  assert.equal(s.combat!.attackBonus, 1);
  shadowEastAttach(s, u, R.sword);
  riverRunningShadow(s, R.raider);
  assert.equal(s.combat!.attackBonus, 3);
});
test("Painful Fatigue shadow delays returning its enemy until the attack resolves", () => {
  let s = base();
  const u = combat(s);
  for (const h of s.heroes) h.exhausted = true;
  riverRunningShadow(s, R.fatigue);
  flush(s);
  s = choose(s, "return");
  assert.equal(s.combat?.returnToStaging, true);
  assert.ok(allEngaged(s).some((x) => x.id === u.id));
  assert.ok(!s.staging.some((x) => x.id === u.id));
});
test("Public river state has counts and pursuit without exposing deck order", () => {
  const s = start(2);
  const before = JSON.stringify(s),
    publicState = riverRunningPublicState(s);
  assert.equal(JSON.stringify(s), before);
  assert.equal(publicState?.setAside, 1);
  assert.ok(!("encounterDeck" in publicState!));
});
test("Painful Fatigue may choose an exhausted character because exhaustion is an effect, not a cost", () => {
  let s = base(2);
  for (const p of playerOrder(s))
    for (const h of seatView(s, p).heroes) h.exhausted = true;
  revealed(s, R.fatigue);
  flush(s);
  const first = s.choice!.options[0].id;
  s = choose(s, first);
  const second = s.choice!.options[0].id;
  assert.ok(
    seatView(s, 1).heroes.some((h) => h.id === second),
    "second player chooses their own character",
  );
  assert.equal(
    s.table?.active,
    1,
    "second player owns the decision after first player resolved",
  );
  s = choose(s, second);
  assert.equal(get(s, first)?.damage, 1);
  assert.equal(get(s, second)?.damage, 1);
});
test("Recurve Bow Archery stacks with printed Raider and Rider Archery at actual combat start", () => {
  const s = base();
  const a = staged(s, R.raider),
    b = staged(s, R.rider);
  shadowEastAttach(s, a, R.bow);
  shadowEastAttach(s, b, R.bow);
  handle(s, fx("combatStartEffects"));
  flush(s);
  assert.match(s.choice?.title ?? "", /Archery.*7 remaining/);
});
test("Rider reveal searches either physical pile for a Horse without resolving its When Revealed", () => {
  let s = base();
  s.encounterDeck = [R.plains, R.horse, R.fatigue];
  s.encounterDiscard = [R.horse];
  revealed(s, R.rider);
  flush(s);
  assert.deepEqual(
    s.choice?.options.map((o) => o.id),
    ["deck", "discard"],
  );
  s = choose(s, "discard");
  const u = s.staging.find((u) => u.code === R.rider)!;
  assert.equal(u.attachments[0].code, R.horse);
  assert.equal(s.encounterDeck.length, 3);
  assert.equal(s.encounterDiscard.length, 0);
  assert.equal(engagementCost(s, u), card(R.rider).engagement! - 10);
});
test("Horse attaches to the lowest eligible Easterling and returns it from a remote engaged area", () => {
  let s = base(2);
  const low = combat(s, R.outrider, 1),
    high = staged(s, R.raider);
  s.combat = null;
  s.phase = "quest";
  s.encounterDeck = [];
  s = reveal(s, R.horse);
  assert.ok(get(s, low.id)!.attachments.some((a) => a.code === R.horse));
  assert.ok(s.staging.some((u) => u.id === low.id));
  assert.ok(!get(s, high.id)!.attachments.length);
  assert.ok(!seatView(s, 1).engaged.length);
});
test("Horse gains Surge only when no Easterling without a Horse can be chosen", () => {
  let s = base();
  s.encounterDeck = [R.plains];
  s = reveal(s, R.horse);
  assert.equal(s.staging.filter((u) => u.code === R.plains).length, 1);
  assert.ok(s.encounterDiscard.includes(R.horse));
});
test("Horse end-of-round forced effect returns its physical enemy without another entry reaction", () => {
  let s = base();
  staged(s, R.warriors);
  const u = combat(s, R.raider);
  shadowEastEnemyEntered(s, u);
  s = finish(s);
  shadowEastAttach(s, get(s, u.id)!, R.horse);
  s.encounterDiscard = [R.sword];
  handle(s, fx("eastHorseReturn", { target: u.id }));
  s = finish(s);
  assert.ok(s.staging.some((x) => x.id === u.id));
  assert.deepEqual(
    get(s, u.id)!.attachments.map((a) => a.code),
    [R.horse],
  );
  assert.deepEqual(s.encounterDiscard, [R.sword]);
});
test("Selecting Warriors of the East offers the highest current attack Easterling for an immediate attack", () => {
  let s = base();
  const q = staged(s, R.warriors),
    weak = staged(s, R.raider),
    strong = staged(s, R.warrior);
  handle(s, fx("sideQuestChoose"));
  s = choose(s, q.id);
  assert.equal(s.choice?.options.length, 1);
  assert.equal(s.choice?.options[0].id, strong.id);
  assert.notEqual(s.choice?.options[0].id, weak.id);
  s = choose(s, strong.id);
  assert.equal(s.combat?.enemyId, strong.id);
  assert.equal(s.combat?.immediate, true);
});
test("Stacked Enemies Close Behind shadows add pursuit once per shadow only if that attack destroys a character", () => {
  const s = base();
  const enemy = combat(s),
    ally = make(s, "01028");
  s.allies.push(ally);
  riverRunningShadow(s, R.close);
  riverRunningShadow(s, R.close);
  assert.equal(s.combat?.attackBonus, 2);
  damage(s, ally.id, 99, { combatDamage: true, enemyId: enemy.id });
  assert.equal(objective(s).resources, 2);
  assert.equal(s.combat?.riverPursuitOnKill, undefined);
});
test("Weary Lands shadow damages the actual defender, rather than the active player hero", () => {
  const s = base(2);
  combat(s, R.raider, 1);
  const defender = seatView(s, 1).heroes[0];
  s.combat!.defenderId = defender.id;
  riverRunningShadow(s, R.weary);
  flush(s);
  assert.equal(defender.damage, 1);
  assert.equal(seatView(s, 0).heroes[0].damage, 0);
});
test("Outrider shadow finds a controlled attachment on an enemy and preserves its physical owner", () => {
  let s = base(2);
  const enemy = combat(s, R.outrider, 1),
    attachment = make(s, "01069");
  enemy.attachments.push({
    id: attachment.id,
    code: attachment.code,
    exhausted: false,
    owner: 0,
    controller: 1,
  });
  riverRunningShadow(s, R.outrider);
  flush(s);
  assert.equal(s.choice?.options[0].id, attachment.id);
  s = choose(s, attachment.id);
  assert.ok(!get(s, enemy.id)!.attachments.length);
  assert.ok(seatView(s, 0).discard.includes(attachment.code));
  assert.ok(!seatView(s, 1).discard.includes(attachment.code));
});
test("Rocky Outcrop travel cost belongs to the first player and Exposed Riverbank adds Pursuit", () => {
  let s = base(2);
  s.phase = "travel";
  const rock = staged(s, R.outcrop);
  s = applyAction(s, { type: "TRAVEL", id: rock.id });
  assert.ok(
    s.choice?.options.every((o) =>
      seatView(s, 0).heroes.some((h) => h.id === o.id),
    ),
  );
  const chosen = s.choice!.options[0].id;
  s = choose(s, chosen);
  assert.equal(get(s, chosen)?.exhausted, true);
  assert.equal(s.activeLocation?.id, rock.id);
  s.activeLocation = null;
  s.phase = "travel";
  const bank = staged(s, R.riverbank);
  s = applyAction(s, { type: "TRAVEL", id: bank.id });
  s = settle(s);
  assert.equal(objective(s).resources, 1);
  assert.equal(s.activeLocation?.id, bank.id);
});
test("A revealed Horse remains outside an empty draw pile through save and attaches the same physical identity", () => {
  let s = base(2);
  const enemy = combat(s, R.outrider, 1);
  s.combat = null;
  s.phase = "quest";
  s.encounterDeck = [R.horse];
  s.encounterDiscard = [];
  handle(s, fx("reveal"));
  flush(s);
  assert.equal(s.riverRunning!.resolving.length, 1);
  assert.equal(s.encounterDeck.length, 0);
  assert.equal(s.encounterDiscard.length, 0);
  const physical = s.riverRunning!.resolving[0];
  s = choose(s, enemy.id);
  assert.equal(s.riverRunning!.resolving.length, 0);
  assert.ok(
    s.staging
      .find((u) => u.id === enemy.id)!
      .attachments.some((a) => a.id === physical.id && a.code === R.horse),
  );
});
test("Easterling treacheries gain their printed Mount or Weapon attachment traits after sync and reload", () => {
  let s = base();
  const host = staged(s, R.raider);
  for (const code of [R.horse, R.sword, R.bow]) shadowEastAttach(s, host, code);
  syncAttachmentText(s);
  s = reload(s);
  const attachments = get(s, host.id)!.attachments;
  assert.equal(
    attachmentHasTrait(
      attachments.find((a) => a.code === R.horse)!,
      "Mount",
    ),
    true,
  );
  for (const code of [R.sword, R.bow])
    assert.equal(
      attachmentHasTrait(
        attachments.find((a) => a.code === code)!,
        "Weapon",
      ),
      true,
    );
  const horse = attachments.find((a) => a.code === R.horse)!;
  horse.blanked = true;
  assert.equal(attachmentHasTrait(horse, "Mount"), false);
  assert.equal(attachmentHasTrait(horse, "Easterling"), false);
});
test("First player orders simultaneous Horse and Pursuit forced effects, determining which enemy catches a Trap", () => {
  for (const first of ["horse", "pursuit"]) {
    let s = base();
    s.phase = "refresh";
    const mounted = combat(s, R.raider);
    s.phase = "refresh";
    s.combat = null;
    shadowEastAttach(s, mounted, R.horse);
    const trap = staged(s, "05017");
    trap.owner = 0;
    objective(s).resources = 2;
    s.encounterDeck = [R.outrider];
    s.encounterDiscard = [];
    handle(s, fx("endRound"));
    flush(s);
    assert.match(s.choice?.title ?? "", /end-of-round forced/);
    const choice = s.choice!.options.find((o) =>
      first === "horse"
        ? o.label.startsWith("Easterling Horse")
        : o.label === "Easterling Pursuit",
    )!;
    s = choose(s, choice.id);
    s = settle(s);
    const host = s.staging.find((u) =>
      u.attachments.some((a) => a.id === trap.id),
    );
    assert.ok(host);
    assert.equal(host.id === mounted.id, first === "horse");
  }
});
