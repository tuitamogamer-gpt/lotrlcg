import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, publicState, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, make, stageInfo, stats, threatOf } from "../src/game/core";
import {
  check,
  damage,
  destroy,
  discardCharacter,
  engage,
  enemyAddedToStaging,
  progress,
  progressLocation,
  raiseThreat,
  revealed,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import { resolvePlayerAbility } from "../src/game/player-ability-triggers";
import {
  WRATH_RUIN as W,
  WRATH_RUIN_RECIPES,
  wrathRuinControlled,
  wrathRuinPublicState,
  wrathRuinUnits,
} from "../src/game/wrath-ruin-support";
import {
  wrathRuinReturn,
  wrathRuinShadow,
  WRATH_RUIN_HOOKS,
} from "../src/game/wrath-ruin";
import { RIVER_RUNNING as R } from "../src/game/river-running-support";
import { base, start, choose, reload, settle } from "./wrath-ruin-fixtures";
import type { GameState, Unit } from "../src/game/types";

const staged = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const active = (s: GameState, code: string) => {
  const u = make(s, code);
  s.activeLocation = u;
  return u;
};
const owned = (s: GameState, code: string, player = 0) => {
  const u = make(s, code);
  u.owner = player;
  s.wrathRuin!.controlled.push(u);
  return u;
};
const ally = (s: GameState, code = "01060", player = 0) => {
  const u = make(s, code);
  u.owner = player;
  forOwner(s, player, () => s.allies.push(u));
  return u;
};
const enemy = (s: GameState, code: string, player = 0) => {
  const u = staged(s, code);
  enemyAddedToStaging(s, u);
  forOwner(s, player, () => engage(s, u));
  return u;
};
function finish(s: GameState) {
  check(s);
  flush(s);
  return settle(s);
}
function reveal(s: GameState, code: string) {
  revealed(s, code);
  flush(s);
  return s;
}
function stageTwo(s: GameState) {
  s.stage = 2;
  s.wrathRuin!.currentQuest = W.second;
  s.progress = 0;
}
function next(s: GameState) {
  return settle(applyAction(reload(s), { type: "NEXT" }));
}
function damageTotal(s: GameState) {
  return allCharacters(s).reduce((n, u) => n + u.damage, 0);
}

for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`Wrath native ${easy ? "easy" : "normal"} setup for ${players} players preserves the corrected physical recipe`, () => {
      const s = start(players, easy, 80, true, true),
        q = s.wrathRuin!;
      assert.equal(s.phase, "resource");
      assert.equal(q.initialized, true);
      assert.equal(s.activeLocation?.code, W.fortification);
      assert.equal(s.staging.filter((u) => u.code === W.ulchor).length, 1);
      assert.equal(s.staging.filter((u) => u.code === W.gate).length, 1);
      assert.equal(q.setupChosen.length, players);
      assert.equal(new Set(q.setupChosen).size, players);
      assert.equal(s.staging.length, 2 + players);
      assert.equal(stageInfo(s).quest, 4 + 4 * players);
      const physical = [
        ...s.encounterDeck,
        ...s.encounterDiscard,
        ...s.staging.map((u) => u.code),
        s.activeLocation!.code,
      ];
      assert.equal(physical.length, easy ? 38 : 50);
      assert.equal(physical.filter((c) => c === R.warriors).length, 1);
      const recipe = WRATH_RUIN_RECIPES.find(
        (r) => r.mode === (easy ? "easy" : "standard"),
      )!;
      const expected = recipe.cards
        .filter((r) => r.section !== "sharedQuestDeck")
        .flatMap((r) => Array<string>(r.quantity).fill(r.code))
        .sort();
      assert.deepEqual(physical.sort(), expected);
      reload(s);
    });
test("Wrath classic solo setup has the same four physical starting cards and does not trigger their travel costs", () => {
  const s = start(1, false, 59, false, false);
  assert.equal(s.table, undefined);
  assert.equal(s.staging.length, 3);
  assert.equal(s.activeLocation!.code, W.fortification);
  assert.equal(s.threat, s.startingThreat);
  reload(s);
});
test("Setup choices are restorable before the active Fortification is selected and reserve its physical copy", () => {
  let s = start(1);
  s.phase = "setup";
  s.wrathRuin!.initialized = false;
  s.wrathRuin!.setupChosen = [];
  s.encounterDeck = [W.fortification, W.square];
  s.activeLocation = null;
  s.staging = s.staging.filter((u) => [W.ulchor, W.gate].includes(u.code));
  handle(s, fx("wrathSetup", { value: 0, player: 0 }));
  flush(s);
  assert.ok(s.choice!.options.some((o) => o.code === W.square));
  assert.ok(!s.choice!.options.some((o) => o.code === W.fortification));
  s = choose(s, W.square);
  assert.equal(s.activeLocation!.code, W.fortification);
  reload(s);
});
test("Inside the Walls waits for end of round, sufficient progress and strictly more controlled locations", () => {
  let s = base();
  owned(s, W.square);
  staged(s, W.house);
  progress(s, 8);
  s = finish(s);
  assert.equal(s.stage, 1);
  s.phase = "refresh";
  s = next(s);
  assert.equal(s.stage, 1, "tie cannot advance");
  owned(s, W.forum);
  s.phase = "refresh";
  s = next(s);
  assert.equal(s.stage, 2);
  assert.equal(s.wrathRuin!.currentQuest, W.second);
  assert.equal(s.progress, 0);
});
test("Stage 2A saves the highest-threat tie choice, returns each player's location, then searches enemies without reveal", () => {
  let s = base(2);
  owned(s, W.square, 0);
  const a = owned(s, W.house, 0),
    b = owned(s, W.tavern, 0);
  owned(s, W.forum, 1);
  owned(s, W.square, 1);
  s.encounterDiscard = [W.siege];
  s.encounterDeck = [W.square, W.raider, W.raider];
  s.progress = 12;
  s.phase = "refresh";
  s = applyAction(reload(s), { type: "NEXT" });
  assert.equal(s.stage, 2);
  assert.equal(s.stageRevealing, true);
  assert.equal(stageInfo(s).side, "A");
  assert.equal(stageInfo(s).quest, 0);
  assert.ok(
    s.choice!.options.some((o) => o.id === a.id) &&
      s.choice!.options.some((o) => o.id === b.id),
  );
  s = choose(s, b.id);
  s = settle(s);
  assert.equal(s.stageRevealing, false);
  assert.equal(stageInfo(s).side, "B");
  assert.equal(allEngaged(s).length, 2);
  assert.ok(
    s.encounterDeck.includes(W.siege) || s.encounterDiscard.includes(W.siege),
  );
  reload(s);
});
test("Exploration transfers the same physical location, clears only progress, and preserves resources and attachments", () => {
  let s = base(2);
  s.table!.first = 1;
  const u = active(s, W.forum);
  u.resources = 2;
  u.attachments.push({
    id: `a${s.nextId++}`,
    code: "01069",
    owner: 0,
    exhausted: false,
  });
  progressLocation(s, u, 5);
  s = finish(s);
  const actual = wrathRuinControlled(s, 1).find((l) => l.id === u.id)!;
  assert.ok(actual);
  assert.equal(actual.progress, 0);
  assert.equal(actual.resources, 2);
  assert.equal(actual.attachments[0].id, u.attachments[0].id);
  assert.ok(!s.encounterDiscard.includes(W.forum));
  reload(s);
});
test("Captured Gate keeps Victory 5 out of victory display and wins only at the end of the round", () => {
  let s = base();
  stageTwo(s);
  const gate = active(s, W.gate);
  progressLocation(s, gate, 5);
  s = finish(s);
  assert.equal(s.status, "playing");
  assert.ok(wrathRuinControlled(s).some((u) => u.id === gate.id));
  assert.ok(!s.victoryCards?.includes(W.gate));
  s.phase = "refresh";
  s = next(s);
  assert.equal(s.status, "won");
});
test("Gate travel requires both twelve stage-2 progress and more controlled than staging locations", () => {
  let s = base();
  stageTwo(s);
  const gate = staged(s, W.gate);
  s.phase = "travel";
  owned(s, W.square);
  owned(s, W.house);
  assert.throws(
    () => applyAction(reload(s), { type: "TRAVEL", id: gate.id }),
    /12 progress/,
  );
  s.progress = 12;
  staged(s, W.forum);
  assert.throws(
    () => applyAction(reload(s), { type: "TRAVEL", id: gate.id }),
    /more locations/,
  );
  s.staging = s.staging.filter((u) => u.code !== W.forum);
  s = applyAction(reload(s), { type: "TRAVEL", id: gate.id });
  s = settle(s);
  assert.equal(s.activeLocation?.id, gate.id);
});
test("Gate's native Travel attacks each player in order before becoming the active location", () => {
  let s = base(2);
  stageTwo(s);
  const gate = staged(s, W.gate),
    ulchor = staged(s, W.ulchor);
  ulchor.tempAttack = -5;
  s.progress = 12;
  s.phase = "travel";
  owned(s, W.square);
  owned(s, W.house);
  s.encounterDeck = Array(10).fill(W.square);
  s = applyAction(reload(s), { type: "TRAVEL", id: gate.id });
  assert.equal(s.activeLocation, null);
  assert.equal(s.combat?.attackPlayer, 0);
  s = settle(s, "undefended");
  assert.equal(s.activeLocation?.id, gate.id);
  assert.equal(
    seatView(s, 0).heroes.reduce((n, h) => n + h.damage, 0),
    1,
  );
  assert.equal(
    seatView(s, 1).heroes.reduce((n, h) => n + h.damage, 0),
    1,
  );
  reload(s);
});
test("Gate threat is one plus all controlled locations, including when Gate itself is controlled", () => {
  const s = base(2),
    gate = staged(s, W.gate);
  assert.equal(threatOf(s, gate), 1);
  owned(s, W.house, 1);
  owned(s, W.square, 0);
  assert.equal(threatOf(s, gate), 3);
  s.staging = [];
  gate.owner = 0;
  s.wrathRuin!.controlled.push(gate);
  assert.equal(threatOf(s, gate), 4);
});
test("Player-card progress is blocked in staging but Contested Square's encounter Forced progress still resolves in that player's ability window", () => {
  let s = base();
  const square = staged(s, W.square),
    raider = enemy(s, W.raider);
  s.queue = [];
  resolvePlayerAbility(
    s,
    {
      player: 0,
      source: s.heroes[0].id,
      code: s.heroes[0].code,
      type: "action",
    },
    () => progressLocation(s, square, 2),
  );
  flush(s);
  s = settle(s);
  assert.equal(get(s, square.id)!.progress, 0);
  resolvePlayerAbility(
    s,
    {
      player: 0,
      source: s.heroes[0].id,
      code: s.heroes[0].code,
      type: "action",
    },
    () => destroy(s, get(s, raider.id)!),
  );
  flush(s);
  s = settle(s);
  assert.equal(get(s, square.id)!.progress, 1);
  reload(s);
});
test("Northern Tracker's native quest commitment cannot place player-card progress on staging locations", () => {
  let s = base();
  const square = staged(s, W.square),
    tracker = ally(s, "01045");
  s.phase = "quest";
  s.committedIds = [tracker.id];
  s.encounterDeck = [W.house];
  s = settle(applyAction(reload(s), { type: "COMMIT" }));
  assert.equal(get(s, square.id)!.progress, 0);
  assert.ok(s.staging.some((u) => u.id === square.id));
  reload(s);
});
test("Contested Square captures after three actual enemy defeats and returns only for its controller's destroyed character", () => {
  let s = base(2);
  const square = staged(s, W.square);
  for (let i = 0; i < 3; i++) {
    const e = enemy(s, W.raider);
    destroy(s, e);
    s = finish(s);
  }
  assert.ok(wrathRuinControlled(s, 0).some((u) => u.id === square.id));
  const other = ally(s, "01060", 1);
  destroy(s, other);
  s = finish(s);
  assert.ok(wrathRuinControlled(s, 0).some((u) => u.id === square.id));
  const own = ally(s);
  destroy(s, own);
  s = finish(s);
  assert.ok(s.staging.some((u) => u.id === square.id));
});
test("Ransacked House's native Encounter Action engages the top discarded enemy and controls the original location", () => {
  let s = base();
  const house = staged(s, W.house);
  s.phase = "encounter";
  s.encounterDiscard = [W.raider, W.square, W.warrior, W.siege];
  s = applyAction(reload(s), { type: "ABILITY", id: house.id });
  s = settle(s);
  assert.ok(wrathRuinControlled(s, 0).some((u) => u.id === house.id));
  assert.equal(s.engaged[0].code, W.warrior);
  assert.deepEqual(s.encounterDiscard, [W.raider, W.square, W.siege]);
  assert.throws(
    () => applyAction(reload(s), { type: "ABILITY", id: house.id }),
    /staging/,
  );
  reload(s);
});
test("House action is blocked outside encounter or without an enemy and losing one location cascades all that player's Houses", () => {
  let s = base(2);
  const house = staged(s, W.house);
  s.encounterDiscard = [W.raider];
  assert.throws(
    () => applyAction(reload(s), { type: "ABILITY", id: house.id }),
    /Encounter/,
  );
  s.phase = "encounter";
  s.encounterDiscard = [];
  assert.throws(
    () => applyAction(reload(s), { type: "ABILITY", id: house.id }),
    /no enemy/,
  );
  s.staging = [];
  const a = owned(s, W.house, 1),
    b = owned(s, W.house, 1),
    square = owned(s, W.square, 1);
  owned(s, W.house, 0);
  wrathRuinReturn(s, square);
  s = finish(s);
  assert.equal(wrathRuinControlled(s, 1).length, 0);
  assert.equal(wrathRuinControlled(s, 0).length, 1);
  assert.ok(
    s.staging.some((u) => u.id === a.id) &&
      s.staging.some((u) => u.id === b.id),
  );
});
test("Control of Fortification returns the topmost enemy, while Tower shuffles before engaging a discarded enemy", () => {
  let s = base();
  let l = active(s, W.fortification);
  s.encounterDiscard = [W.raider, W.siege, W.warrior, W.square];
  progressLocation(s, l, 3);
  s = finish(s);
  assert.ok(s.staging.some((u) => u.code === W.warrior));
  assert.deepEqual(s.encounterDiscard, [W.raider, W.siege, W.square]);
  s.staging = [];
  l = active(s, W.tower);
  s.encounterDeck = [];
  s.encounterDiscard = [W.raider];
  progressLocation(s, l, 4);
  s = finish(s);
  assert.equal(s.engaged[0].code, W.raider);
  assert.ok(wrathRuinControlled(s).some((u) => u.id === l.id));
});
test("Active Fortification and Skirmisher add their printed archery to shared Raider and Recurve Bow", () => {
  let s = base();
  s.heroes[0].attachments.push({
    id: `a${s.nextId++}`,
    code: "01040",
    exhausted: false,
  });
  active(s, W.fortification);
  staged(s, W.skirmisher);
  const r = enemy(s, W.raider);
  r.attachments.push({ id: `a${s.nextId++}`, code: W.bow, exhausted: false });
  s.queue = [];
  WRATH_RUIN_HOOKS.combatBegin!(s);
  flush(s);
  assert.match(s.choice!.title, /7 remaining/);
  s = settle(s);
  assert.equal(damageTotal(s), 7);
});
test("Captured Tower blocks When Revealed and shadow cancellation only while active", () => {
  const s = base();
  const tower = staged(s, W.tower);
  assert.equal(WRATH_RUIN_HOOKS.cannotCancel!(s), false);
  s.staging = [];
  s.activeLocation = tower;
  assert.equal(WRATH_RUIN_HOOKS.cannotCancel!(s), true);
  tower.blanked = true;
  assert.equal(WRATH_RUIN_HOOKS.cannotCancel!(s), false);
});
test("Thane Ulchor stays in staging, is immune, and offers its after-exploration search or attack", () => {
  let s = base();
  const ulchor = staged(s, W.ulchor),
    l = active(s, W.square);
  s.encounterDeck = [W.siege, W.raider, W.forum];
  assert.equal(WRATH_RUIN_HOOKS.immune!(s, ulchor), true);
  assert.equal(WRATH_RUIN_HOOKS.cannotEngage!(s, ulchor), true);
  destroy(s, ulchor);
  assert.ok(get(s, ulchor.id));
  progressLocation(s, l, 3);
  flush(s);
  s = settle(s, "location");
  assert.ok(s.staging.some((u) => u.code === W.forum));
  assert.ok(s.encounterDiscard.includes(W.siege));
  assert.ok(!s.wrathRuin!.phaseThreat.length);
});
test("Champion's native engagement gives its controller a real return-or-attack choice", () => {
  let s = base(2);
  const l = owned(s, W.square, 1);
  enemy(s, W.champion, 1);
  flush(s);
  assert.equal(s.table!.active, 1);
  assert.ok(s.choice!.options.some((o) => o.id === l.id));
  s = choose(s, l.id);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === l.id));
  assert.equal(s.combat, null);
  assert.equal(seatView(s, 1).engaged[0].code, W.champion);
});
test("Fury targets lowest engagement Easterlings, preserves its physical card through ties, and replaces actual lethal damage", () => {
  let s = base();
  const a = enemy(s, W.raider),
    b = enemy(s, W.raider);
  s.queue = [];
  s.encounterDeck = [W.square];
  s = reveal(s, W.fury);
  assert.ok(
    s.choice!.options.some((o) => o.id === a.id) &&
      s.choice!.options.some((o) => o.id === b.id),
  );
  const physical = s.wrathRuin!.resolving.find((u) => u.code === W.fury)!.id;
  s = choose(s, a.id);
  s = settle(s);
  const target = get(s, a.id)!;
  assert.equal(target.attachments.find((a) => a.code === W.fury)!.id, physical);
  const square = staged(s, W.square);
  damage(s, target.id, 3);
  s = finish(s);
  assert.equal(get(s, a.id)!.damage, 0);
  assert.ok(!get(s, a.id)!.attachments.some((a) => a.code === W.fury));
  assert.ok(s.encounterDiscard.includes(W.fury));
  assert.equal(
    get(s, square.id)!.progress,
    0,
    "replacement is not enemy defeat",
  );
  damage(s, a.id, 3);
  s = finish(s);
  assert.ok(!get(s, a.id));
  assert.equal(get(s, square.id)!.progress, 1);
});
test("Fury does not save an enemy discarded without destruction and its printed Surge still fires without a target", () => {
  let s = base();
  const e = enemy(s, W.raider);
  e.attachments.push({ id: `a${s.nextId++}`, code: W.fury, exhausted: false });
  s.queue = [];
  destroy(s, e, false);
  s = finish(s);
  assert.ok(!get(s, e.id));
  assert.ok(s.encounterDiscard.includes(W.fury));
  s.encounterDeck = [W.square, W.house];
  s = settle(reveal(s, W.fury));
  assert.ok(s.staging.some((u) => u.code === W.square));
  assert.equal(s.wrathRuin!.resolving.length, 0);
});
test("Caught Off Guard gives every actual player its own choice and searches without revealing skipped cards", () => {
  let s = base(2);
  const l = owned(s, W.square, 0);
  s.encounterDeck = [W.siege, W.raider];
  s = reveal(s, W.caught);
  assert.equal(s.table!.active, 0);
  s = choose(s, l.id);
  assert.equal(s.table!.active, 1);
  s = choose(s, "enemy");
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === l.id));
  assert.equal(seatView(s, 1).engaged[0].code, W.raider);
  assert.equal(s.wrathRuin!.phaseThreat.length, 0);
  reload(s);
});
test("Street Fighting assigns one plus each player's own locations, preserving remote ownership through saves", () => {
  let s = base(2);
  owned(s, W.square, 0);
  owned(s, W.house, 1);
  owned(s, W.forum, 1);
  s = reveal(s, W.fighting);
  assert.equal(s.table!.active, 0);
  assert.ok(s.choice!.options.every((o) => ownerOf(s, get(s, o.id)!) === 0));
  s = settle(s);
  assert.equal(
    seatView(s, 0).heroes.reduce((n, h) => n + h.damage, 0),
    2,
  );
  assert.equal(
    seatView(s, 1).heroes.reduce((n, h) => n + h.damage, 0),
    3,
  );
});
test("Under Siege snapshots one plus all controlled locations and expires at the end of the phase", () => {
  let s = base();
  s.phase = "staging";
  const l = owned(s, W.square);
  s = settle(reveal(s, W.siege));
  assert.equal(WRATH_RUIN_HOOKS.stagingThreat!(s), 2);
  wrathRuinReturn(s, get(s, l.id)!);
  s = finish(s);
  assert.equal(WRATH_RUIN_HOOKS.stagingThreat!(s), 2);
  s.phase = "travel";
  assert.equal(WRATH_RUIN_HOOKS.stagingThreat!(s), 0);
  reload(s);
});
test("Ulchor's Revenge applies Doomed to all players and attacks only location controllers in turn order", () => {
  let s = base(2);
  owned(s, W.square, 1);
  const u = staged(s, W.ulchor);
  u.tempAttack = -5;
  s.encounterDeck = Array(8).fill(W.house);
  s = reveal(s, W.revenge);
  assert.equal(seatView(s, 0).threat, 21);
  assert.equal(seatView(s, 1).threat, 21);
  assert.equal(s.combat?.attackPlayer, 1);
  s = settle(s, "undefended");
  assert.equal(
    seatView(s, 0).heroes.reduce((n, h) => n + h.damage, 0),
    0,
  );
  assert.equal(
    seatView(s, 1).heroes.reduce((n, h) => n + h.damage, 0),
    1,
  );
});
test("City Forum remains dynamic, gains resources only in staging, and its native travel cost follows every player", () => {
  let s = base(2);
  const forum = staged(s, W.forum),
    l = active(s, W.square);
  progressLocation(s, l, 3);
  s = finish(s);
  assert.equal(get(s, forum.id)!.resources, 1);
  assert.equal(threatOf(s, get(s, forum.id)!), 2);
  s.phase = "travel";
  s = applyAction(reload(s), { type: "TRAVEL", id: forum.id });
  s = settle(s);
  assert.equal(seatView(s, 0).threat, 21);
  assert.equal(seatView(s, 1).threat, 21);
  reload(s);
});
test("Seedy Tavern keeps a private physical choice through travel/reload and reveals it in the chosen When order", () => {
  let s = base();
  s.phase = "travel";
  const tavern = staged(s, W.tavern);
  s.encounterDeck = [W.fighting, W.house, W.fortification, W.siege, W.raider];
  s = applyAction(reload(s), { type: "TRAVEL", id: tavern.id });
  assert.equal(s.wrathRuin!.looked.length, 5);
  const hiddenLook = structuredClone(s);
  hiddenLook.wrathRuin!.looked.forEach((c) => (c.code = W.revenge));
  hiddenLook.choice!.options.forEach((o) => (o.code = W.revenge));
  assert.deepEqual(publicState(s), publicState(hiddenLook));
  assert.ok(
    s.choice!.options.every((o) => o.label.startsWith("Choose looked card")),
  );
  const choice = s.choice!.options.find((o) => o.code === W.fighting)!.id;
  s = choose(s, choice);
  s = settle(s);
  assert.equal(s.activeLocation?.id, tavern.id);
  assert.equal(s.wrathRuin!.storedCards[0].cards[0].code, W.fighting);
  const hidden = structuredClone(s);
  hidden.wrathRuin!.storedCards[0].cards[0].code = W.siege;
  assert.deepEqual(wrathRuinPublicState(s), wrathRuinPublicState(hidden));
  progressLocation(s, s.activeLocation!, 5);
  flush(s);
  assert.equal(s.choice!.options.length, 2);
  assert.equal(s.wrathRuin!.pendingExplored[0].id, tavern.id);
  const revealOption = s.choice!.options.find(
    (o) => o.effects[0].kind === "wrathTavernReveal",
  )!.id;
  s = choose(s, revealOption);
  s = settle(s);
  assert.equal(damageTotal(s), 1, "Tavern reveal precedes gaining control");
  assert.ok(wrathRuinControlled(s).some((u) => u.id === tavern.id));
  assert.equal(s.wrathRuin!.storedCards.length, 0);
  reload(s);
});
test("Seedy Tavern's alternate When order captures before Street Fighting calculates damage", () => {
  let s = base();
  const t = active(s, W.tavern);
  s.wrathRuin!.storedCards.push({
    locationId: t.id,
    cards: [make(s, W.fighting)],
  });
  progressLocation(s, t, 5);
  flush(s);
  const capture = s.choice!.options.find(
    (o) => o.effects[0].kind === "wrathCapture",
  )!.id;
  s = choose(s, capture);
  s = settle(s);
  assert.equal(damageTotal(s), 2);
  assert.equal(wrathRuinUnits(s).filter((u) => u.id === t.id).length, 1);
});
test("Treacherous Easterling counts each actual threat increase and caps only its attack/defense bonus", () => {
  let s = base(2);
  const e = enemy(s, W.easterling, 1);
  s.queue = [];
  forOwner(s, 0, () => raiseThreat(s, 1));
  s = finish(s);
  assert.equal(get(s, e.id)!.resources, 0);
  for (let i = 0; i < 4; i++) {
    forOwner(s, 1, () => raiseThreat(s, 2));
    s = finish(s);
  }
  assert.equal(get(s, e.id)!.resources, 4);
  assert.equal(stats(s, get(s, e.id)!).attack, 6);
  assert.equal(stats(s, get(s, e.id)!).defense, 4);
});
test("Darkness uses the active location's current threat or gains Surge, and shadow checks the attacked player's own round", () => {
  let s = base(2);
  const forum = active(s, W.forum);
  forum.resources = 2;
  s = settle(reveal(s, W.darkness));
  assert.equal(seatView(s, 0).threat, 23);
  assert.equal(seatView(s, 1).threat, 23);
  s.activeLocation = null;
  s.encounterDeck = [W.house];
  s = settle(reveal(s, W.darkness));
  assert.ok(s.staging.some((u) => u.code === W.house));
  const e = enemy(s, W.raider, 1);
  s.queue = [];
  s.combat = {
    enemyId: e.id,
    attackPlayer: 1,
    defenderId: null,
    attackBonus: 0,
    damageDealt: 0,
  };
  s.wrathRuin!.threatRaised = { 0: s.round };
  wrathRuinShadow(s, W.darkness);
  assert.equal(s.combat.attackBonus, 1);
  s.wrathRuin!.threatRaised[1] = s.round;
  wrathRuinShadow(s, W.darkness);
  assert.equal(s.combat.attackBonus, 3);
});
test("Warrior of Rhûn can attach the top Fury from discard, and shared Sword/Bow effects use their original physical cards", () => {
  let s = base();
  const e = enemy(s, W.warrior);
  s.queue = [];
  s.encounterDiscard = [W.fury];
  s.encounterDeck = [W.house];
  handle(s, fx("immediateAttack", { target: e.id, player: 0 }));
  flush(s);
  assert.ok(get(s, e.id)!.attachments.some((a) => a.code === W.fury));
  s = settle(s, "undefended");
  s = settle(reveal(s, W.sword));
  assert.equal(stats(s, get(s, e.id)!).attack, 5);
  assert.ok(get(s, e.id)!.attachments.some((a) => a.code === W.sword));
  reload(s);
});
test("The omitted upstream Warriors of the East is live: new Easterlings receive top attachments and its current-quest attack is native", () => {
  let s = base();
  staged(s, R.warriors);
  s.encounterDiscard = [W.fury];
  const e = enemy(s, W.raider);
  flush(s);
  s = settle(s);
  assert.ok(get(s, e.id)!.attachments.some((a) => a.code === W.fury));
  const attacker = staged(s, W.raider);
  enemyAddedToStaging(s, attacker);
  const side = s.staging.find((u) => u.code === R.warriors)!;
  WRATH_RUIN_HOOKS.sideQuestChosen!(s, side);
  flush(s);
  s = settle(s, "undefended");
  assert.ok(damageTotal(s) > 0);
  reload(s);
});
test("Eliminating a player returns every controlled location with attachments/resources and removes no encounter card", () => {
  let s = base(2);
  const a = owned(s, W.house, 1),
    b = owned(s, W.forum, 1);
  b.resources = 2;
  b.attachments.push({ id: `a${s.nextId++}`, code: W.fury, exhausted: false });
  forOwner(s, 1, () => {
    s.threat = 50;
  });
  s = finish(s);
  assert.equal(s.table!.seats[1].eliminated, true);
  assert.equal(wrathRuinControlled(s, 1).length, 0);
  assert.ok(s.staging.some((u) => u.id === a.id));
  assert.equal(get(s, b.id)!.resources, 2);
  assert.equal(get(s, b.id)!.attachments[0].code, W.fury);
  reload(s);
});
test("Malformed Wrath counters, owners and duplicate physical controlled/hidden cards are rejected", () => {
  const s = base();
  owned(s, W.square);
  const copy = reload(s);
  assert.ok(validateSave(copy));
  const owner = structuredClone(copy);
  owner.wrathRuin!.controlled[0].owner = 4;
  assert.equal(validateSave(owner), false);
  const bad = structuredClone(copy);
  bad.wrathRuin!.phaseThreat.push({
    round: bad.round,
    phase: "quest",
    value: -1,
  });
  assert.equal(validateSave(bad), false);
  const duplicate = structuredClone(copy);
  duplicate.wrathRuin!.looked.push(duplicate.wrathRuin!.controlled[0]);
  assert.equal(validateSave(duplicate), false);
});

test("House pays Champion's engagement Forced before gaining control, and the suspended benefit survives save/reload", () => {
  let s = base();
  const house = staged(s, W.house);
  s.phase = "encounter";
  s.encounterDiscard = [W.champion];
  s.encounterDeck = [W.house];
  s = applyAction(reload(s), { type: "ABILITY", id: house.id });
  assert.match(s.choice!.title, /Champion/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["attack"],
  );
  assert.ok(s.staging.some((u) => u.id === house.id));
  assert.equal(wrathRuinControlled(s).length, 0);
  assert.ok(s.queue.some((e) => e.kind === "wrathHouseTake"));
  s = choose(s, "attack");
  const defender = s.heroes.find((h) => h.code === "01001")!;
  s = choose(s, defender.id);
  s = settle(s);
  assert.equal(get(s, defender.id)!.damage, 3);
  assert.ok(wrathRuinControlled(s).some((u) => u.id === house.id));
});

test("House puts its cost enemy directly into play engaged, preserving staging Traps while applying Warriors entry Forced", () => {
  let s = base();
  const house = staged(s, W.house),
    trap = staged(s, "05017");
  trap.owner = 0;
  staged(s, R.warriors);
  s.phase = "encounter";
  s.encounterDiscard = [W.fury, W.raider];
  s = settle(applyAction(reload(s), { type: "ABILITY", id: house.id }));
  const e = s.engaged.find((u) => u.code === W.raider)!;
  assert.ok(e);
  assert.ok(s.staging.some((u) => u.id === trap.id));
  assert.deepEqual(
    e.attachments.map((a) => a.code),
    [W.fury],
  );
  assert.ok(wrathRuinControlled(s).some((u) => u.id === house.id));
  reload(s);
});

test("Champion's shadow deals real damage to the declared defender before attack damage", () => {
  let s = base();
  const e = enemy(s, W.raider),
    defender = s.heroes[0];
  e.shadows = [W.champion];
  s.phase = "defense";
  s = settle(
    applyAction(reload(s), {
      type: "DEFEND",
      enemyId: e.id,
      defenderId: defender.id,
    }),
  );
  assert.equal(get(s, defender.id)!.damage, 1);
  assert.ok(
    get(s, e.id)!.shadows.includes(W.champion),
    "Normal shadows remain until the end of combat",
  );
});

test("Caught Off Guard's shadow schedules a fresh additional attack after the first actual attack", () => {
  let s = base();
  const e = enemy(s, W.raider),
    defender = s.heroes[0];
  e.shadows = [W.caught];
  s.encounterDeck = [W.champion];
  s.phase = "defense";
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: e.id,
    defenderId: defender.id,
  });
  assert.ok(s.choice, "The additional attack asks for a new defender");
  assert.ok(
    !s.choice!.options.some((o) => o.id === defender.id),
    "The first defender remains exhausted",
  );
  const second = s.heroes[1];
  s = settle(choose(s, second.id));
  assert.equal(get(s, defender.id)!.damage, 0);
  assert.equal(get(s, second.id)!.damage, 2);
  assert.ok(
    get(s, e.id)!.shadows.includes(W.caught),
    "The normal attack's shadow is restored after the additional attack",
  );
  assert.ok(s.encounterDiscard.includes(W.champion));
});

test("Street Fighting's shadow assigns damage only among the attacked player's characters", () => {
  let s = base(2);
  owned(s, W.house, 0);
  owned(s, W.forum, 1);
  owned(s, W.tower, 1);
  const e = enemy(s, W.raider, 1),
    defender = seatView(s, 1).heroes.find((h) => h.code === "01004")!;
  e.shadows = [W.fighting];
  s.phase = "defense";
  selectSeat(s, 1);
  if (s.table) s.table.turn = 1;
  s = settle(
    applyAction(reload(s), {
      type: "DEFEND",
      enemyId: e.id,
      defenderId: defender.id,
    }),
  );
  assert.equal(
    seatView(s, 0).heroes.reduce((n, h) => n + h.damage, 0),
    0,
  );
  assert.equal(
    seatView(s, 1).heroes.reduce((n, h) => n + h.damage, 0),
    3,
  );
});

test("Skirmisher and Under Siege shadow distinguish a remote Sentinel's owner from the attacked player", () => {
  let s = base(2);
  const ownLocation = owned(s, W.forum, 0),
    remoteLocation = owned(s, W.tower, 1);
  const defender = ally(s, "01029", 1),
    e = enemy(s, W.skirmisher, 0);
  e.shadows = [W.siege];
  s.phase = "defense";
  selectSeat(s, 0);
  s = settle(
    applyAction(reload(s), {
      type: "DEFEND",
      enemyId: e.id,
      defenderId: defender.id,
    }),
  );
  assert.equal(get(s, defender.id), undefined);
  assert.ok(seatView(s, 1).discard.includes("01029"));
  assert.ok(
    s.staging.some((u) => u.id === ownLocation.id),
    "Under Siege returns attacked player's location",
  );
  assert.ok(
    s.staging.some((u) => u.id === remoteLocation.id),
    "Skirmisher returns destroyed character controller's location",
  );
  assert.equal(wrathRuinControlled(s).length, 0);
});

test("Ulchor's Revenge shadow adds only the attacked player's controlled-location count", () => {
  let s = base(2);
  owned(s, W.forum, 0);
  owned(s, W.tower, 0);
  owned(s, W.house, 1);
  const e = enemy(s, W.raider, 0),
    defender = s.heroes[0];
  e.shadows = [W.revenge];
  s.phase = "defense";
  s = settle(
    applyAction(reload(s), {
      type: "DEFEND",
      enemyId: e.id,
      defenderId: defender.id,
    }),
  );
  assert.equal(get(s, defender.id)!.damage, 2);
});

test("Player elimination discards only that player's attachments from controlled locations before returning them", () => {
  let s = base(2);
  const l = owned(s, W.forum, 1);
  l.attachments.push(
    { id: `a${s.nextId++}`, code: "01069", owner: 1, exhausted: false },
    { id: `a${s.nextId++}`, code: "01069", owner: 0, exhausted: false },
    { id: `a${s.nextId++}`, code: W.fury, exhausted: false },
  );
  forOwner(s, 1, () => {
    s.threat = 50;
  });
  s = finish(s);
  const returned = get(s, l.id)!;
  assert.ok(s.staging.some((u) => u.id === l.id));
  assert.equal(returned.attachments.length, 2);
  assert.ok(
    returned.attachments.some((a) => a.code === "01069" && a.owner === 0),
  );
  assert.ok(returned.attachments.some((a) => a.code === W.fury));
  assert.ok(seatView(s, 1).discard.includes("01069"));
});

test("Controlled locations can receive progress, save, and be explored again without duplicate physical zones", () => {
  let s = base(2);
  const l = owned(s, W.forum, 1);
  progressLocation(s, l, 1);
  s = finish(s);
  assert.equal(get(s, l.id)!.progress, 1);
  s = reload(s);
  progressLocation(s, get(s, l.id)!, 4);
  s = finish(s);
  assert.equal(get(s, l.id)!.owner, 0);
  assert.equal(get(s, l.id)!.progress, 0);
  assert.equal(wrathRuinUnits(s).filter((u) => u.id === l.id).length, 1);
});

test("A Tavern When effect eliminating the first player still finishes its physical reveal and transfers exploration to the new first player", () => {
  let s = base(2);
  const tavern = active(s, W.tavern);
  s.wrathRuin!.storedCards.push({
    locationId: tavern.id,
    cards: [make(s, W.revenge)],
  });
  forOwner(s, 0, () => {
    s.threat = 49;
  });
  progressLocation(s, tavern, 5);
  flush(s);
  s = choose(
    s,
    s.choice!.options.find((o) => o.effects[0].kind === "wrathTavernReveal")!
      .id,
  );
  s = settle(s);
  assert.equal(s.table!.seats[0].eliminated, true);
  assert.equal(firstPlayer(s), 1);
  assert.ok(wrathRuinControlled(s, 1).some((u) => u.id === tavern.id));
  assert.equal(s.wrathRuin!.pendingExplored.length, 0);
  assert.equal(s.wrathRuin!.resolving.length, 0);
  assert.equal(s.wrathRuin!.storedCards.length, 0);
  assert.ok(s.encounterDiscard.includes(W.revenge));
  reload(s);
});

test("A pending City Forum Forced still resolves when Ulchor's simultaneous After attack eliminates the first player", () => {
  let s = base(2);
  const forum = staged(s, W.forum);
  staged(s, W.ulchor);
  const l = active(s, W.square);
  forOwner(s, 0, () => {
    s.discard.push(...s.heroes.splice(1).map((h) => h.code));
  });
  s.encounterDeck = [W.house];
  progressLocation(s, l, 3);
  flush(s);
  s = choose(
    s,
    s.choice!.options.find((o) => o.effects[0].kind === "wrathUlchor")!.id,
  );
  s = choose(s, "attack");
  s = settle(s, "undefended");
  assert.equal(s.table!.seats[0].eliminated, true);
  assert.equal(get(s, forum.id)!.resources, 1);
  reload(s);
});
