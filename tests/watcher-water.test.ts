import { applyAction as act } from "./pass-resource-window.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {
  createGame,
  canCommit,
  canTravel,
  availableAbilities,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { card, SCRIPTED, STARTERS } from "../src/game/cards";
import {
  advanceQuest,
  check,
  damage,
  engage,
  exhaustCharacter,
  progress,
  progressLocation,
  readyCharacter,
  resolveReveal,
  shadow,
} from "../src/game/board";
import { fx, make, stats } from "../src/game/core";
import { flush, handle } from "../src/game/effects";
import {
  allActiveLocations,
  allCharacters,
  allEngaged,
  allHeroes,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import { playerAttack } from "../src/game/combat";
import { CARROCK } from "../src/game/carrock";
import { EMYN } from "../src/game/emyn-muil";
import { KHAZAD } from "../src/game/khazad-dum";
import {
  WATCHER_WATER as W,
  WATCHER_WATER_ENCOUNTERS,
  WATCHER_WATER_QUESTS,
  watcherWaterCombatEnd,
  watcherWaterRefresh,
  watcherWaterRoundEnd,
  watcherWaterOptionalEngageProblem,
  watcherWaterZeroCombatStats,
  watcherWaterCannotExhaust,
} from "../src/game/watcher-water";
import { attachToQuest, currentQuestCode } from "../src/game/quest-state";
import type { GameState, Unit } from "../src/game/types";
import recipes from "../public/scenarios.json";
const leadership = STARTERS[0];
const choose = (s: GameState, id: string) => act(s, { type: "CHOOSE", id });
function settle(s: GameState) {
  for (let i = 0; i < 300 && s.status === "playing"; i++) {
    if (s.choice)
      s = choose(
        s,
        s.choice.options.find((o) => ["skip", "resolve", "done"].includes(o.id))
          ?.id ?? s.choice.options[0].id,
      );
    else if (s.phase === "setup") s = act(s, { type: "KEEP" });
    else break;
  }
  return s;
}
function start(players = 1, easy = false, seed = 1) {
  return createGame(seed, leadership.cards, leadership.heroes, leadership.id, {
    scenarioId: "watcher-in-the-water",
    easy,
    ...(players > 1
      ? {
          seats: STARTERS.slice(0, players).map((d) => ({
            deckId: d.id,
            heroes: [...d.heroes],
          })),
        }
      : {}),
  });
}
function base(players = 1) {
  let s: GameState | undefined;
  for (let seed = 1; seed < 60; seed++) {
    const candidate = settle(start(players, false, seed));
    if (candidate.status === "playing" && candidate.phase !== "setup") {
      s = candidate;
      break;
    }
  }
  assert.ok(s);
  Object.assign(s, {
    phase: "planning",
    stage: 1,
    progress: 0,
    victory: 0,
    victoryCards: [],
    queue: [],
    choice: null,
    staging: [],
    encounterDiscard: [],
    encounterDeck: Array(20).fill(W.falls),
    activeLocation: null,
    extraActiveLocations: [],
    watcherWater: { setAside: [W.watcher, W.doors], swampPlaced: {} },
  });
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      s.threat = 20;
      s.hand = [];
      s.allies = [];
      s.engaged = [];
      s.used = [];
      s.committedIds = [];
      s.heroes.forEach((h) =>
        Object.assign(h, {
          resources: 10,
          damage: 0,
          exhausted: false,
          committed: false,
          attachments: [],
          boost: 0,
        }),
      );
    });
  selectSeat(s, s.table?.first ?? 0);
  syncSeat(s);
  return s;
}
function enemy(s: GameState, code: string, player = 0) {
  let u!: Unit;
  forOwner(s, player, () => {
    u = make(s, code);
    s.engaged.push(u);
  });
  return u;
}
function attach(s: GameState, u: Unit, code: string) {
  const a = {
    id: `a${s.nextId++}`,
    code,
    exhausted: false,
    owner: ownerOf(s, u),
  };
  u.attachments.push(a);
  return a;
}
function reveal(s: GameState, code: string) {
  resolveReveal(s, code);
  flush(s);
  if (s.choice?.options.some((o) => o.id === "resolve"))
    s = choose(s, "resolve");
  return s;
}
function lake(s: GameState) {
  s.progress = 13;
  advanceQuest(s);
  flush(s);
  return settle(s);
}
function physical(s: GameState) {
  return [
    ...s.encounterDeck,
    ...s.encounterDiscard,
    ...s.watcherWater!.setAside,
    ...s.staging.map((u) => u.code),
    ...allEngaged(s).map((u) => u.code),
    ...allActiveLocations(s).map((u) => u.code),
    ...allCharacters(s).flatMap((u) =>
      u.attachments
        .filter((a) => card(a.code).sphere_code === "encounter")
        .map((a) => a.code),
    ),
    ...(s.victoryCards ?? []),
  ];
}

test("all twelve printed Watcher designs and two quests have exact normal/easy definitions", () => {
  assert.equal(WATCHER_WATER_ENCOUNTERS.length, 12);
  assert.equal(WATCHER_WATER_QUESTS.length, 2);
  for (const c of [...WATCHER_WATER_ENCOUNTERS, ...WATCHER_WATER_QUESTS])
    assert.ok(SCRIPTED.has(c.code), c.name);
  const easy = recipes.find(
    (r) => r.name === "The Watcher in the Water (Easy)",
  )!;
  const counts = {
    ...easy.sections.sharedEncounterDeck,
    ...easy.sections.sharedSetAside,
  } as Record<string, number>;
  for (const c of WATCHER_WATER_ENCOUNTERS)
    assert.equal(c.easy_quantity, counts[c.code] ?? 0, c.name);
});
for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`${players}-player ${easy ? "easy" : "normal"} setup reveals until twice-player staged threat and retains the complete recipe`, () => {
      const s = settle(start(players, easy));
      assert.equal(s.status, "playing");
      assert.equal(s.stage, 1);
      const recipe = recipes.find(
        (r) => r.name === `The Watcher in the Water${easy ? " (Easy)" : ""}`,
      )!;
      const expected = {
        ...recipe.sections.sharedEncounterDeck,
        ...recipe.sections.sharedSetAside,
      } as Record<string, number>;
      const actual = physical(s).reduce<Record<string, number>>(
        (m, c) => ((m[c] = (m[c] ?? 0) + 1), m),
        {},
      );
      assert.deepEqual(actual, expected);
      assert.deepEqual(
        s.watcherWater!.setAside.slice().sort(),
        [W.doors, W.watcher].sort(),
      );
      assert.ok(
        s.staging.reduce((n, u) => n + (card(u.code).threat ?? 0), 0) >=
          2 * players,
      );
      assert.equal(
        Object.values(actual).reduce((n, q) => n + q, 0),
        easy ? 35 : 45,
      );
    });
test("stage two puts set-aside Watcher and Doors into play, moves prior active locations and recycles only Tentacle enemies", () => {
  const s = base();
  s.activeLocation = make(s, W.passage);
  s.extraActiveLocations = [make(s, W.swamp)];
  s.encounterDiscard = [W.grasping, W.thrashing, W.wrapped, W.waters];
  const next = lake(s);
  assert.equal(next.stage, 2);
  assert.equal(next.progress, 0);
  assert.equal(next.activeLocation?.code, W.doors);
  assert.equal(next.extraActiveLocations?.length, 0);
  assert.ok(next.staging.some((u) => u.code === W.watcher));
  assert.ok(next.staging.some((u) => u.code === W.passage));
  assert.ok(next.staging.some((u) => u.code === W.swamp));
  assert.ok(
    next.encounterDeck.includes(W.grasping) &&
      next.encounterDeck.includes(W.thrashing),
  );
  assert.deepEqual(next.encounterDiscard, [W.wrapped, W.waters]);
  assert.deepEqual(next.watcherWater!.setAside, []);
});
test("Doors redirect framework and player progress without exploration, and victory still requires three points", () => {
  const s = lake(base());
  const door = s.activeLocation!;
  progressLocation(s, door, 2);
  assert.equal(s.progress, 2);
  assert.equal(door.progress, 0);
  assert.equal(s.victory, 0);
  progress(s, 3, true);
  assert.equal(s.progress, 5);
  assert.equal(s.status, "playing");
  assert.equal(s.activeLocation?.id, door.id);
  s.victory = 3;
  check(s);
  assert.equal(s.status, "won");
});
test("Doors letter action can use cards from another fellowship, counts articles, and is limited once per round", () => {
  let s = lake(base(2));
  s.progress = 5;
  s.encounterDeck = [W.watcher];
  forOwner(s, 1, () => (s.hand = [make(s, "01022")]));
  const door = s.activeLocation!;
  s = act(s, { type: "ABILITY", id: door.id });
  s = choose(s, "done");
  assert.equal(s.table!.active, 1);
  const handId = s.hand[0].id;
  s = choose(s, handId);
  s = choose(s, "done");
  assert.equal(s.status, "playing");
  assert.equal(s.victory, 0);
  assert.equal(s.activeLocation?.code, W.doors);
  assert.throws(
    () => act(s, { type: "ABILITY", id: door.id }),
    /once per round/,
  );
  s.round++;
  s.encounterDeck = [W.falls];
  forOwner(s, 0, () => (s.hand = [make(s, "01023")]));
  s = act(s, { type: "ABILITY", id: door.id });
  s = choose(s, s.hand[0].id);
  s = choose(s, "done");
  s = choose(s, "done");
  assert.equal(s.victory, 3);
  assert.equal(s.status, "won");
  assert.ok(s.victoryCards!.includes(W.doors));
  assert.equal(s.activeLocation, null);
});
test("Doors may discard zero player cards, and the discarded encounter card is not revealed", () => {
  let s = lake(base());
  s.encounterDeck = [W.waters];
  const before = s.threat;
  s = act(s, { type: "ABILITY", id: s.activeLocation!.id });
  s = choose(s, "done");
  assert.equal(s.threat, before);
  assert.deepEqual(s.encounterDiscard, [W.waters]);
  assert.equal(s.victory, 0);
});
test("Doors action and multiplayer card choices preserve exact state through save/reload", () => {
  let s = lake(base(2));
  s.encounterDeck = [W.falls];
  s.hand = [make(s, "01023")];
  s = act(s, { type: "ABILITY", id: s.activeLocation!.id });
  s = choose(s, s.hand[0].id);
  s = choose(s, "done");
  assert.equal(s.table!.active, 1);
  assert.ok(validateSave(s));
  const restored = restoreSave(JSON.parse(JSON.stringify(s)));
  assert.ok(restored);
  assert.deepEqual(restored.choice, s.choice);
  s = choose(restored, "done");
  assert.equal(s.victory, 3);
});
test("Perilous Swamp accepts at most one actual token per round and buffers excess framework progress", () => {
  const s = base(),
    swamp = make(s, W.swamp);
  s.activeLocation = swamp;
  progress(s, 12);
  assert.equal(swamp.progress, 1);
  assert.equal(s.progress, 0);
  progressLocation(s, swamp, 5);
  assert.equal(swamp.progress, 1);
  watcherWaterRefresh(s);
  progress(s, 4);
  assert.equal(s.activeLocation, null);
  assert.equal(s.progress, 3);
  assert.ok(s.encounterDiscard.includes(W.swamp));
});
test("Perilous Swamp cap includes staged card-effect placements and survives reload", () => {
  let s = base();
  const swamp = make(s, W.swamp);
  s.staging.push(swamp);
  progressLocation(s, swamp, 1);
  progressLocation(s, swamp, 1);
  assert.equal(swamp.progress, 1);
  syncSeat(s);
  assert.ok(validateSave(s));
  s = restoreSave(JSON.parse(JSON.stringify(s)))!;
  progressLocation(s, s.staging[0], 1);
  assert.equal(s.staging[0].progress, 1);
});
test("multi-active progress permits other locations while a capped Swamp continues buffering the quest", () => {
  const s = base(),
    swamp = make(s, W.swamp),
    passage = make(s, W.passage);
  s.activeLocation = swamp;
  s.extraActiveLocations = [passage];
  progress(s, 20);
  assert.equal(swamp.progress, 1);
  assert.ok(!allActiveLocations(s).some((u) => u.id === passage.id));
  assert.equal(s.progress, 0);
});
test("Watcher optional restriction counts Tentacles engaged with another player but card-effect engagement remains legal", () => {
  let s = base(2);
  s.phase = "encounter";
  const watcher = make(s, W.watcher);
  s.staging.push(watcher);
  enemy(s, W.grasping, 1);
  assert.ok(watcherWaterOptionalEngageProblem(s, watcher));
  assert.throws(() => act(s, { type: "ENGAGE", id: watcher.id }), /Tentacle/);
  engage(s, watcher);
  assert.ok(seatView(s, 0).engaged.some((u) => u.id === watcher.id));
});
test("The Watcher is automatically engaged at its threshold even while another Tentacle exists", () => {
  let s = base();
  s.phase = "encounter";
  s.threat = 48;
  s.staging.push(make(s, W.watcher));
  enemy(s, W.grasping);
  s = act(s, { type: "NEXT" });
  s = settle(s);
  assert.ok(s.engaged.some((u) => u.code === W.watcher));
});
test("The Watcher regenerates exactly two after refresh and blanked printed text suppresses regeneration", () => {
  const s = base(),
    watcher = enemy(s, W.watcher);
  watcher.damage = 5;
  watcherWaterRefresh(s);
  assert.equal(watcher.damage, 3);
  watcher.blanked = true;
  watcherWaterRefresh(s);
  assert.equal(watcher.damage, 3);
  delete watcher.blanked;
  watcher.damage = 1;
  watcherWaterRefresh(s);
  assert.equal(watcher.damage, 0);
});
test("staged Watcher deals three to one character controlled by each player at combat end", () => {
  let s = base(2);
  s.staging.push(make(s, W.watcher));
  watcherWaterCombatEnd(s);
  flush(s);
  assert.ok(s.choice);
  assert.ok(
    s.choice.options.every((o) =>
      allCharacters(s).some((u) => u.id === o.id && ownerOf(s, u) === 0),
    ),
  );
  const firstId = allHeroes(s).find(
    (h) => ownerOf(s, h) === 0 && card(h.code).health! >= 4,
  )!.id;
  s = choose(s, firstId);
  assert.ok(
    s.choice?.options.every((o) =>
      allCharacters(s).some((u) => u.id === o.id && ownerOf(s, u) === 1),
    ),
  );
  const nextId = s.heroes.find((h) => card(h.code).health! >= 4)!.id;
  s = choose(s, nextId);
  assert.equal(allHeroes(s).find((h) => h.id === firstId)!.damage, 3);
  assert.equal(allHeroes(s).find((h) => h.id === nextId)!.damage, 3);
});
test("engaged Watcher does not cause combat-end staging damage", () => {
  const s = base();
  enemy(s, W.watcher);
  watcherWaterCombatEnd(s);
  assert.equal(s.queue.length, 0);
});
test("Disturbed Waters applies Doomed five with no invented when-revealed or shadow effect", () => {
  let s = base();
  s = reveal(s, W.waters);
  assert.equal(s.threat, 25);
  assert.equal(card(W.waters).shadow, undefined);
  assert.ok(s.encounterDiscard.includes(W.waters));
});
test("Stagnant Creek puts a discarded Tentacle into play and raises every threat by five without revealing it", () => {
  let s = base(2);
  s.encounterDeck = [W.striking];
  s = reveal(s, W.creek);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === W.striking));
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 25);
  assert.ok(!s.encounterDiscard.includes(W.striking));
});
test("Stagnant Creek only discards a non-Tentacle, with no threat penalty", () => {
  let s = base();
  s.encounterDeck = [W.waters];
  s = reveal(s, W.creek);
  assert.equal(s.threat, 20);
  assert.deepEqual(s.encounterDiscard, [W.waters]);
});
test("Ill Purpose completes all engagements, then counts only the threat of remaining staging cards", () => {
  let s = base(2);
  forOwner(s, 1, () => {
    s.threat = 30;
  });
  const a = make(s, W.grasping),
    b = make(s, W.striking);
  s.staging = [a, b, make(s, W.swamp)];
  s.threatModifier = 7;
  s = reveal(s, W.ill);
  s = settle(s);
  assert.equal(seatView(s, 1).engaged.length, 2);
  assert.equal(seatView(s, 0).threat, 24);
  assert.equal(seatView(s, 1).threat, 34);
});
test("Ill Purpose lets the first player break highest-threat ties and works with zero enemies", () => {
  let s = base(2);
  s.staging = [make(s, W.grasping), make(s, W.passage)];
  s = reveal(s, W.ill);
  assert.match(s.choice!.title, /highest threat/);
  s = choose(s, "1");
  s = settle(s);
  assert.equal(seatView(s, 1).engaged.length, 1);
  assert.equal(seatView(s, 0).threat, 21);
  s = base();
  s.staging = [make(s, W.swamp)];
  s = reveal(s, W.ill);
  s = settle(s);
  assert.equal(s.threat, 24);
});
test("Ill Purpose shadow grants three attack to Tentacles, one to other enemies; both locations remove one quest token", () => {
  const s = base(),
    e = enemy(s, W.grasping);
  s.combat = { enemyId: e.id, defenderId: null, attackBonus: 0 };
  shadow(s, W.ill);
  assert.equal(s.combat.attackBonus, 3);
  e.code = "01089";
  shadow(s, W.ill);
  assert.equal(s.combat.attackBonus, 4);
  s.progress = 1;
  shadow(s, W.falls);
  shadow(s, W.swamp);
  assert.equal(s.progress, 0);
});
test("Makeshift Passage after actual travel bypasses the active buffer; a switch does not travel", () => {
  let s = base();
  s.phase = "travel";
  const passage = make(s, W.passage);
  s.staging.push(passage);
  s = act(s, { type: "TRAVEL", id: passage.id });
  s = settle(s);
  assert.equal(s.progress, 2);
  assert.equal(s.activeLocation?.progress, 0);
});
test("Stair Falls requires and exhausts two first-player characters with ordinary exhaustion responses", () => {
  let s = base(2);
  s.phase = "travel";
  const falls = make(s, W.falls);
  s.staging.push(falls);
  for (const h of seatView(s, 0).heroes) h.exhausted = true;
  assert.match(canTravel(s, falls)!, /two|2/);
  seatView(s, 0).heroes[0].exhausted = false;
  seatView(s, 0).heroes[1].exhausted = false;
  syncSeat(s);
  s = act(s, { type: "TRAVEL", id: falls.id });
  s = choose(s, s.heroes[0].id);
  s = choose(s, s.heroes[1].id);
  s = settle(s);
  assert.equal(s.activeLocation?.code, W.falls);
  assert.equal(seatView(s, 0).heroes.filter((h) => h.exhausted).length, 3);
  assert.equal(seatView(s, 1).heroes.filter((h) => h.exhausted).length, 0);
});
test("Wrapped attaches only to a first-player hero, prevents actual exhaust/ready and permits an independent attachment action", () => {
  let s = base(2);
  selectSeat(s, 1);
  s = reveal(s, W.wrapped);
  assert.equal(s.table!.active, 0);
  const heroId = s.heroes[0].id;
  s = choose(s, heroId);
  const hero = s.heroes.find((h) => h.id === heroId)!;
  s.phase = "quest";
  assert.equal(canCommit(s, hero), false);
  assert.equal(exhaustCharacter(s, hero), false);
  hero.exhausted = true;
  readyCharacter(s, hero);
  assert.equal(hero.exhausted, true);
  s.phase = "planning";
  const steward = attach(s, hero, "01026"),
    before = hero.resources;
  s = act(s, { type: "ABILITY", id: hero.id, attachmentId: steward.id });
  assert.equal(s.heroes.find((h) => h.id === heroId)!.resources, before + 2);
});
test("a different fellowship may rescue Wrapped using its own hero without any Tentacle attachment", () => {
  let s = base(2);
  const host = allHeroes(s).find((h) => ownerOf(s, h) === 0)!;
  const wrap = attach(s, host, W.wrapped);
  s.phase = "attack";
  selectSeat(s, 1);
  const cost = s.heroes[0];
  attach(s, cost, W.grasping);
  const legal = s.heroes[1];
  const abilities = availableAbilities(s, host);
  assert.ok(abilities.some((a) => a.id === wrap.id && !a.disabled));
  s = act(s, { type: "ABILITY", id: host.id, attachmentId: wrap.id });
  assert.ok(!s.choice!.options.some((o) => o.id === cost.id));
  s = choose(s, legal.id);
  assert.equal(allHeroes(s).find((h) => h.id === legal.id)!.exhausted, true);
  assert.equal(
    allHeroes(s).find((h) => h.id === host.id)!.attachments.length,
    0,
  );
  assert.ok(s.encounterDiscard.includes(W.wrapped));
});
test("Wrapped rescue is combat-only and a blanked Tentacle attachment no longer restricts the rescuer", () => {
  const s = base(),
    host = s.heroes[0],
    wrap = attach(s, host, W.wrapped);
  assert.ok(
    availableAbilities(s, host).find((a) => a.id === wrap.id)?.disabled,
  );
  s.phase = "attack";
  s.activeLocation = make(s, EMYN.amonLhaw);
  assert.equal(watcherWaterCannotExhaust(host), true);
  stats(s, host);
  assert.equal(watcherWaterCannotExhaust(host), false);
});
test("Wrapped discards its hero at round end rather than destroying it, and blanking suppresses its text", () => {
  const s = base(),
    host = s.heroes[0],
    code = host.code;
  attach(s, host, W.wrapped);
  watcherWaterRoundEnd(s);
  assert.ok(!s.heroes.some((h) => h.code === code));
  assert.ok(s.discard.includes(code));
  assert.ok(s.encounterDiscard.includes(W.wrapped));
  assert.equal(
    s.used.some((k) => k.startsWith("game:landroval")),
    false,
  );
});
test("Grasping Tentacle shadow-test success converts its physical enemy into an attacking character's zero-stat attachment", () => {
  let s = base();
  s.phase = "attack";
  const e = enemy(s, W.grasping);
  e.shadows = [W.falls];
  s.encounterDeck = [W.falls];
  const attacker = s.heroes[0];
  attach(s, attacker, "01039");
  playerAttack(s, e, [attacker.id], true);
  flush(s);
  assert.match(s.choice!.title, /Grasping/);
  s = choose(s, attacker.id);
  assert.ok(!allEngaged(s).some((u) => u.id === e.id));
  const hero = s.heroes.find((h) => h.id === attacker.id)!;
  assert.equal(hero.attachments.find((a) => a.code === W.grasping)?.id, e.id);
  assert.equal(stats(s, hero).attack, 0);
  assert.equal(stats(s, hero).defense, 0);
  assert.equal(s.encounterDiscard.filter((c) => c === W.falls).length, 2);
  assert.equal(s.victory, 0);
});
test("Grasping attachment retains no zero-stat text while blanked", () => {
  const s = base(),
    host = s.heroes[0];
  attach(s, host, W.grasping);
  assert.equal(watcherWaterZeroCombatStats(host), true);
  s.activeLocation = make(s, EMYN.amonLhaw);
  assert.ok(stats(s, host).attack > 0);
  assert.equal(watcherWaterZeroCombatStats(host), false);
});
test("a Tentacle without shadow text still succeeds the Grasping test; a non-shadow non-Tentacle fails", () => {
  let s = base();
  s.phase = "attack";
  let e = enemy(s, W.grasping);
  s.encounterDeck = [W.striking];
  playerAttack(s, e, [s.heroes[0].id], true);
  flush(s);
  assert.match(s.choice!.title, /Grasping/);
  s = base();
  s.phase = "attack";
  e = enemy(s, W.grasping);
  s.encounterDeck = [W.waters];
  s.heroes[0].tempAttack = 5;
  playerAttack(s, e, [s.heroes[0].id], true);
  flush(s);
  assert.ok(!allEngaged(s).some((u) => u.id === e.id));
  assert.ok(s.encounterDiscard.includes(W.grasping));
  assert.ok(!s.heroes[0].attachments.some((a) => a.code === W.grasping));
});
test("Thrashing success redirects full attack damage to any character of an attacking player, ignoring that character's defense", () => {
  let s = base();
  s.phase = "attack";
  const e = enemy(s, W.thrashing);
  s.encounterDeck = [W.falls];
  const attacker = s.heroes[0],
    victim = s.heroes[1];
  playerAttack(s, e, [attacker.id], true);
  flush(s);
  assert.match(s.choice!.title, /Redirect/);
  assert.ok(s.choice!.options.some((o) => o.id === victim.id));
  const amount = stats(s, attacker).attack;
  s = choose(s, victim.id);
  assert.equal(s.engaged.find((u) => u.id === e.id)!.damage, 0);
  assert.equal(s.heroes.find((h) => h.id === victim.id)!.damage, amount);
});
test("Thrashing multi-player attack may redirect to either attacking fellowship but not uninvolved players", () => {
  let s = base(3);
  s.phase = "attack";
  const e = enemy(s, W.thrashing, 0),
    first = s.heroes[0],
    ranged = allHeroes(s).find((h) => h.code === "01005")!;
  s.encounterDeck = [W.falls];
  playerAttack(s, e, [first.id, ranged.id], true);
  flush(s);
  assert.ok(
    s.choice!.options.some(
      (o) =>
        ownerOf(
          s,
          allCharacters(s).find((c) => c.id === o.id)!,
        ) === 1,
    ),
  );
  assert.ok(
    !s.choice!.options.some(
      (o) =>
        ownerOf(
          s,
          allCharacters(s).find((c) => c.id === o.id)!,
        ) === 2,
    ),
  );
});
test("a failed Thrashing test deals ordinary attack damage and fires ordinary kill responses", () => {
  const s = base();
  s.phase = "attack";
  s.heroes[0].code = "01005";
  s.heroes[0].tempAttack = 5;
  const e = enemy(s, W.thrashing);
  s.encounterDeck = [W.waters];
  playerAttack(s, e, [s.heroes[0].id], true);
  flush(s);
  assert.ok(s.encounterDiscard.includes(W.thrashing));
  assert.match(s.choice!.title, /Victory responses/);
  const resolved = choose(s, `01005:${s.heroes[0].id}`);
  assert.equal(resolved.progress, 2);
});
test("Striking tests before defender declaration: success forces undefended without exhausting a supplied defender", () => {
  let s = base();
  s.phase = "defense";
  const e = enemy(s, W.striking);
  e.shadows = [W.waters];
  s.encounterDeck = [W.falls];
  const defender = s.heroes[1];
  s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: defender.id });
  assert.ok(s.choice);
  assert.match(s.choice!.title, /Assign 4 damage/);
  assert.equal(s.heroes.find((h) => h.id === defender.id)!.exhausted, false);
  assert.equal(s.combat!.defenderId, null);
});
test("failed Striking test publicly discards first, then allows a real defender selection", () => {
  let s = base();
  s.phase = "defense";
  const e = enemy(s, W.striking);
  e.shadows = [W.waters];
  s.encounterDeck = [W.waters];
  const defender = s.heroes[1];
  s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: defender.id });
  assert.match(s.choice!.title, /Declare a defender/);
  assert.equal(s.heroes.find((h) => h.id === defender.id)!.exhausted, false);
  s = choose(s, defender.id);
  assert.equal(s.heroes.find((h) => h.id === defender.id)!.exhausted, true);
  assert.equal(s.encounterDiscard.filter((c) => c === W.waters).length, 1);
});
test("Watcher victory route works without opening Doors and retains printed victory identity", () => {
  let s = lake(base());
  s.progress = 5;
  const watcher = s.staging.find((u) => u.code === W.watcher)!;
  damage(s, watcher.id, 9);
  check(s);
  assert.equal(s.status, "won");
  assert.ok(s.victoryCards!.includes(W.watcher));
  assert.equal(s.activeLocation?.code, W.doors);
});

test("a converted Grasping attack still resolves Vassal's mandatory discard without enemy kill rewards", () => {
  let s = base();
  s.phase = "attack";
  const vassal = make(s, "02098");
  s.allies.push(vassal);
  const e = enemy(s, W.grasping);
  s.encounterDeck = [W.falls];
  playerAttack(s, e, [vassal.id], true);
  flush(s);
  s = choose(s, vassal.id);
  assert.ok(!s.allies.some((u) => u.id === vassal.id));
  assert.ok(s.discard.includes(vassal.code));
  assert.ok(s.encounterDiscard.includes(W.grasping));
  assert.equal(s.progress, 0);
  assert.equal(s.victory, 0);
});

test("Grasping preserves Háma's declaration response before Trollshaw Scout's attack completion", () => {
  let s = base();
  s.phase = "attack";
  s.heroes[0].code = "04076";
  const hama = s.heroes[0],
    scout = make(s, "04104");
  s.allies.push(scout);
  s.discard = ["01034"];
  s.hand.push(make(s, "01023"));
  const e = enemy(s, W.grasping);
  s.encounterDeck = [W.falls];
  playerAttack(s, e, [hama.id, scout.id], true);
  flush(s);
  s = choose(s, hama.id);
  assert.match(s.choice!.title, /Háma/);
  s = choose(s, "skip");
  assert.match(s.choice!.title, /Trollshaw Scout/);
  s = choose(s, "discard-ally");
  assert.ok(!s.allies.some((u) => u.id === scout.id));
  assert.ok(s.heroes[0].attachments.some((a) => a.code === W.grasping));
  assert.equal(s.progress, 0);
});

test("Watcher stage advancement waits for queued effects and pending player responses", () => {
  const s = base();
  s.progress = 13;
  s.queue.push(fx("draw", { count: 1 }));
  advanceQuest(s);
  assert.equal(s.stage, 1);
  flush(s);
  assert.equal(s.stage, 2);
  assert.ok(s.activeLocation?.code === W.doors);
});

test("Watcher quest attachments resolve before changing stage, while final victory ends immediately", () => {
  let s = base();
  const quest = currentQuestCode(s)!;
  attachToQuest(s, quest, {
    id: "long-defeat",
    code: "10122",
    exhausted: false,
    owner: 0,
  });
  s.progress = 13;
  advanceQuest(s);
  flush(s);
  assert.equal(s.stage, 1);
  assert.match(s.choice!.title, /Long Defeat/);
  assert.ok(s.discard.includes("10122"));
  s = restoreSave(JSON.parse(JSON.stringify(s)))!;
  s = choose(s, "use");
  s = choose(s, "draw");
  assert.equal(s.stage, 2);
  assert.equal(s.pendingQuestDefeat, undefined);
  assert.ok(s.activeLocation?.code === W.doors);
  attachToQuest(s, currentQuestCode(s)!, {
    id: "final-defeat",
    code: "10122",
    exhausted: false,
    owner: 0,
  });
  s.progress = 5;
  s.victory = 3;
  advanceQuest(s);
  assert.equal(s.status, "won");
  assert.equal(s.choice, null);
});

test("a Sacked hero can pay another encounter card's exhaustion cost", () => {
  let s = base();
  s.phase = "attack";
  const host = s.heroes[0],
    payer = s.heroes[1];
  const wrap = attach(s, host, W.wrapped);
  attach(s, payer, CARROCK.sacked);
  s.heroes[2].exhausted = true;
  s = act(s, { type: "ABILITY", id: host.id, attachmentId: wrap.id });
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [payer.id],
  );
  s = choose(s, payer.id);
  assert.equal(s.heroes.find((h) => h.id === payer.id)!.exhausted, true);
  assert.ok(!s.heroes[0].attachments.some((a) => a.code === W.wrapped));
});
