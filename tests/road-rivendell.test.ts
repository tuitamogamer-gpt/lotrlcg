import { applyAction as act } from "./pass-resource-window.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {
  canPlay,
  createGame,
  playTargets,
  validateSave,
  restoreSave,
} from "../src/game/engine";
import { card, SCRIPTED, STARTERS } from "../src/game/cards";
import {
  advanceQuest,
  check,
  damage,
  destroy,
  engage,
  exhaustCharacter,
  enterAlly,
  progressLocation,
  placeEncounter,
  resolveReveal,
  returnAlly,
  shadow,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import { fx, make, stats, questWill } from "../src/game/core";
import {
  allActiveLocations,
  allCharacters,
  allEngaged,
  allHeroes,
  defendersFor,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import {
  ROAD as R,
  ROAD_ENCOUNTERS,
  ROAD_QUESTS,
  roadRivendellCannotCancel,
} from "../src/game/road-rivendell";
import type { GameState, Unit } from "../src/game/types";
import recipes from "../public/scenarios.json";
const leadership = STARTERS.find((d) => d.id === "leadership")!;
const choose = (s: GameState, id: string) => act(s, { type: "CHOOSE", id });
function settle(s: GameState) {
  for (let i = 0; i < 250 && s.status === "playing"; i++) {
    if (s.choice)
      s = choose(
        s,
        s.choice.options.find((o) => ["skip", "resolve"].includes(o.id))?.id ??
          s.choice.options[0].id,
      );
    else if (s.phase === "setup") s = act(s, { type: "KEEP" });
    else break;
  }
  return s;
}
function base(players = 1) {
  let s: GameState | undefined;
  for (let seed = 1; seed < 60; seed++) {
    const c = settle(
      createGame(seed, leadership.cards, leadership.heroes, leadership.id, {
        scenarioId: "road-to-rivendell",
        ...(players > 1
          ? {
              seats: STARTERS.slice(0, players).map((d) => ({
                deckId: d.id,
                heroes: [...d.heroes],
              })),
            }
          : {}),
      }),
    );
    if (c.status === "playing" && c.phase !== "setup") {
      s = c;
      break;
    }
  }
  assert.ok(s);
  s.phase = "planning";
  s.stage = 1;
  s.progress = 0;
  s.victory = 0;
  s.victoryCards = [];
  s.queue = [];
  s.choice = null;
  s.staging = [];
  s.encounterDiscard = [];
  s.encounterDeck = Array(20).fill("01089");
  s.activeLocation = null;
  delete s.extraActiveLocations;
  s.roadRivendell = {};
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      s.hand = [];
      s.allies = s.allies.filter((u) => u.code === R.arwen);
      s.engaged = [];
      s.used = [];
      s.committedIds = [];
    });
  for (const h of allCharacters(s)) {
    h.exhausted = false;
    h.committed = false;
    h.damage = 0;
    h.resources = 5;
    h.attachments = [];
  }
  selectSeat(s, 0);
  if (s.table) {
    s.table.first = 0;
    s.table.turn = 0;
    s.table.passed = [];
  }
  return s;
}
function reveal(s: GameState, code: string) {
  resolveReveal(s, code);
  flush(s);
  if (
    s.choice?.title.startsWith("Revealed:") &&
    s.choice.options.some((o) => o.id === "resolve")
  )
    s = choose(s, "resolve");
  return s;
}
function attachment(s: GameState, u: Unit, code: string) {
  const a = {
    id: `a${s.nextId++}`,
    code,
    exhausted: false,
    owner: ownerOf(s, u),
  };
  u.attachments.push(a);
  return a;
}
function enemy(s: GameState, code: string) {
  const e = make(s, code);
  s.engaged.push(e);
  return e;
}
const arwen = (s: GameState) =>
  allCharacters(s).find((u) => u.code === R.arwen)!;

test("Road registers twelve printed encounters and three quest stages", () => {
  assert.equal(ROAD_ENCOUNTERS.length, 12);
  assert.equal(ROAD_QUESTS.length, 3);
  for (const c of [...ROAD_ENCOUNTERS, ...ROAD_QUESTS])
    assert.ok(SCRIPTED.has(c.code), c.name);
  assert.deepEqual(
    ROAD_QUESTS.map((q) => [Number(q.cost), q.back_quest]).sort(
      (a, b) => a[0]! - b[0]!,
    ),
    [
      [1, 20],
      [2, 7],
      [3, 13],
    ],
  );
});
test("normal/easy one-to-four-player setup exactly matches printed recipes before revelations", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = createGame(
        3,
        leadership.cards,
        leadership.heroes,
        leadership.id,
        {
          scenarioId: "road-to-rivendell",
          easy,
          guided: true,
          ...(players > 1
            ? {
                seats: STARTERS.slice(0, players).map((d) => ({
                  deckId: d.id,
                  heroes: [...d.heroes],
                })),
              }
            : {}),
        },
      );
      const counts: Record<string, number> = {};
      for (const c of s.encounterDeck) counts[c] = (counts[c] ?? 0) + 1;
      assert.deepEqual(
        counts,
        recipes.find((q) => q.id === `${easy ? "E" : "Q"}02.5`)!.sections
          .sharedEncounterDeck,
      );
      assert.equal(
        allCharacters(s).filter((u) => u.code === R.arwen).length,
        1,
      );
      assert.equal(ownerOf(s, arwen(s)), s.table?.first ?? 0);
      assert.equal(s.staging.length, 0);
      assert.equal(s.queue.filter((e) => e.kind === "reveal").length, players);
    }
});
test("Arwen's exhaustion resource response can choose another player's hero", () => {
  let s = base(2);
  const a = arwen(s),
    h = seatView(s, 1).heroes[0],
    old = h.resources;
  exhaustCharacter(s, a);
  flush(s);
  assert.match(s.choice!.title, /Arwen/);
  s = choose(s, h.id);
  assert.equal(getHero(s, h.id).resources, old + 1);
});
function getHero(s: GameState, id: string) {
  return allHeroes(s).find((h) => h.id === id)!;
}
test("Arwen follows the first-player token and leaves/controller elimination lose immediately", () => {
  let s = base(2);
  const a = arwen(s);
  a.damage = 1;
  s.phase = "refresh";
  handle(s, fx("refreshReady"));
  flush(s);
  assert.equal(s.table!.first, 1);
  handle(s, fx("endRound"));
  flush(s);
  assert.equal(ownerOf(s, arwen(s)), 1);
  assert.equal(arwen(s).id, a.id);
  assert.equal(arwen(s).damage, 1);
  for (const mode of ["destroy", "discard", "return", "eliminate"]) {
    s = base(2);
    const npc = arwen(s);
    if (mode === "destroy") destroy(s, npc);
    else if (mode === "discard") destroy(s, npc, false);
    else if (mode === "return") returnAlly(s, npc);
    else {
      forOwner(s, 0, () => (s.threat = 50));
      check(s);
    }
    assert.equal(s.status, "lost", mode);
    assert.match(s.reason, /Arwen/);
  }
});
test("objective Arwen's title prevents playing the player ally", () => {
  const s = base();
  const ally = make(s, "04058");
  s.hand.push(ally);
  s.heroes.push(make(s, "01007"));
  s.heroes.at(-1)!.resources = 5;
  assert.match(canPlay(s, ally) ?? "", /Arwen|unique/i);
  assert.throws(() => enterAlly(s, make(s, "04058")), /Arwen|unique/i);
  assert.equal(
    allCharacters(s).filter(
      (u) =>
        card(u.code)
          .name.normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "") === "Arwen Undomiel",
    ).length,
    1,
  );
});
test("Ambush checks only the new enemy in first-player order and stops at the first eligible player", () => {
  let s = base(3);
  forOwner(s, 0, () => (s.threat = 20));
  forOwner(s, 1, () => (s.threat = 40));
  forOwner(s, 2, () => (s.threat = 49));
  const existing = make(s, "01082");
  s.staging.push(existing);
  s = reveal(s, R.taskmaster);
  const task = allEngaged(s).find((e) => e.code === R.taskmaster)!;
  assert.ok(task);
  assert.equal(ownerOf(s, task), 1);
  assert.ok(s.staging.some((u) => u.id === existing.id));
  assert.match(s.choice!.title, /Taskmaster/);
  assert.ok(
    s.choice!.options.every(
      (o) =>
        seatView(s, 1).heroes.some((h) => h.id === o.id) ||
        o.id === arwen(s).id,
    ),
  );
  const victim = seatView(s, 1).heroes[0];
  s = choose(s, victim.id);
  assert.equal(getHero(s, victim.id).damage, 2);
});
test("Barren Hills suppresses Ambush even when a second active location exists", () => {
  let s = base();
  s.threat = 40;
  s.activeLocation = make(s, R.hills);
  s.extraActiveLocations = [make(s, "01081")];
  s = reveal(s, R.bear);
  assert.ok(s.staging.some((u) => u.code === R.bear));
  assert.equal(s.engaged.length, 0);
  assert.equal(s.combat, null);
});
test("printed Ambush applies to a returned discard enemy without revealing it", () => {
  let s = base();
  s.threat = 40;
  s.encounterDiscard = [R.taskmaster];
  s = reveal(s, R.ambush);
  assert.ok(s.engaged.some((u) => u.code === R.taskmaster));
  assert.match(s.choice!.title, /Taskmaster/);
  assert.ok(s.encounterDiscard.includes(R.ambush));
  assert.equal(s.encounterDeck.length, 20);
});
test("Wild Bear makes a quest-phase attack with one shadow and resumes the pending reveal", () => {
  let s = base();
  s.phase = "staging";
  s.threat = 40;
  s.encounterDeck = [R.gate, R.gate];
  s = reveal(s, R.bear);
  assert.match(s.choice!.title, /Immediate attack/);
  const hero = s.heroes.find((h) => h.code === "01001")!;
  const bear = s.engaged.find((u) => u.code === R.bear)!;
  assert.equal(bear.shadows.length, 1);
  s = choose(s, hero.id);
  s = settle(s);
  assert.equal(s.phase, "staging");
  assert.equal(s.combat, null);
  assert.equal(s.engaged.find((u) => u.id === bear.id)!.shadows.length, 0);
  assert.ok(s.encounterDiscard.includes(R.gate));
  assert.equal(s.encounterDeck.length, 1);
});
test("Goblin Gate adds Ambush and an immediate attack to only the first revealed enemy of the round", () => {
  let s = base();
  s.threat = 49;
  s.activeLocation = make(s, R.gate);
  s.encounterDeck = [R.gate, R.gate];
  s = reveal(s, "01082");
  assert.match(s.choice!.title, /Immediate attack/);
  const first = s.engaged.find((u) => u.code === "01082")!;
  s = choose(s, s.heroes.find((h) => h.code === "01001")!.id);
  s = settle(s);
  assert.equal(s.roadRivendell!.gateEnemyId, first.id);
  s = reveal(s, "01089");
  assert.ok(s.staging.some((u) => u.code === "01089"));
  assert.equal(s.choice, null);
});
test("first enemy revealed while Goblin Gate is absent consumes the round's first reveal", () => {
  let s = base();
  s.threat = 49;
  s = reveal(s, "01082");
  s.activeLocation = make(s, R.gate);
  s = reveal(s, "01089");
  assert.ok(s.roadRivendell!.gateEnemyId);
  assert.equal(s.engaged.length, 0);
});
test("Crebain prevents encounter cancellation while staged and restores it after engagement", () => {
  let s = base();
  const c = make(s, R.crebain);
  s.staging.push(c);
  s.hand.push(make(s, "01050"));
  s.heroes.push(make(s, "01007"));
  s.heroes.at(-1)!.resources = 5;
  assert.equal(roadRivendellCannotCancel(s), true);
  s = reveal(s, R.sentry);
  assert.ok(
    !s.choice || !s.choice.options.some((o) => o.id.startsWith("cancel")),
  );
  engage(s, c);
  assert.equal(roadRivendellCannotCancel(s), false);
});
test("Raider discards two controlled attachments one at a time including on another owner's character", () => {
  let s = base(2);
  const remote = make(s, "01089");
  forOwner(s, 1, () => s.engaged.push(remote));
  const a = attachment(s, remote, "01043");
  a.owner = 0;
  const b = attachment(s, s.heroes[0], "01042");
  const raider = make(s, R.raiders);
  s.staging.push(raider);
  engage(s, raider);
  flush(s);
  assert.match(s.choice!.title, /Raiders/);
  s = choose(s, a.id);
  assert.match(s.choice!.title, /Raiders/);
  s = choose(s, b.id);
  assert.equal(allCharacters(s).flatMap((u) => u.attachments).length, 0);
  assert.ok(s.discard.includes("01043"));
  assert.ok(s.discard.includes("01042"));
});
test("Followed by Night damages objective allies and surges, or attacks every engaged enemy in chosen order", () => {
  let s = base();
  s.allies.push(make(s, "01073"));
  s = reveal(s, R.night);
  s = choose(s, "damage");
  assert.equal(arwen(s).damage, 1);
  assert.equal(s.allies.find((u) => u.code === "01073")!.damage, 1);
  s = base(2);
  const a = enemy(s, "01089"),
    b = make(s, "01089");
  forOwner(s, 1, () => s.engaged.push(b));
  s = reveal(s, R.night);
  s = choose(s, "attacks");
  assert.ok(s.choice!.options.some((o) => o.id === b.id));
  s = choose(s, b.id);
  assert.match(s.choice!.title, /Immediate attack/);
  s = choose(s, seatView(s, 1).heroes[0].id);
  assert.equal(s.choice!.options[0].id, a.id);
  s = choose(s, a.id);
  s = choose(s, s.heroes.find((h) => h.code === "01001")!.id);
  s = settle(s);
  assert.equal(s.phase, "planning");
  assert.equal(s.combat, null);
});
test("Orc Ambush staged branch engages all staged Orcs with the first player but leaves other enemies", () => {
  let s = base(2);
  const a = make(s, "01089"),
    b = make(s, "01091"),
    spider = make(s, "01076");
  s.staging.push(a, b, spider);
  s = reveal(s, R.ambush);
  s = settle(s);
  assert.equal(allEngaged(s).filter((e) => ownerOf(s, e) === 0).length, 2);
  assert.ok(s.staging.some((u) => u.id === spider.id));
});
test("Sleeping Sentry damages exhausted characters before exhausting all surviving ready characters", () => {
  let s = base();
  const h = s.heroes[0];
  h.exhausted = true;
  s.allies.push(make(s, "01073"));
  s = reveal(s, R.sentry);
  assert.equal(getHero(s, h.id).damage, 1);
  assert.ok(allCharacters(s).every((u) => u.exhausted));
  assert.equal(arwen(s).damage, 0);
  assert.match(s.choice!.title, /Arwen/);
});
test("Sleeping Sentry shadow discards all defending player's exhausted characters and loses if Arwen was exhausted", () => {
  let s = base(2);
  const e = enemy(s, "01089");
  s.combat = { enemyId: e.id, defenderId: null, attackBonus: 0 };
  s.heroes[0].exhausted = true;
  arwen(s).exhausted = false;
  const other = seatView(s, 1).heroes[0];
  other.exhausted = true;
  shadow(s, R.sentry);
  assert.equal(getHero(s, other.id).id, other.id);
  assert.equal(s.heroes.length, 2);
  assert.equal(s.status, "playing");
  s = base();
  const attacker = enemy(s, "01089");
  s.combat = { enemyId: attacker.id, defenderId: arwen(s).id, attackBonus: 0 };
  arwen(s).exhausted = true;
  shadow(s, R.sentry);
  assert.equal(s.status, "lost");
});
test("Pathless Country removes one from incomplete placements but exploration at five precedes its After ability", () => {
  const s = base(),
    l = make(s, R.country);
  s.activeLocation = l;
  progressLocation(s, l, 1);
  assert.equal(l.progress, 0);
  progressLocation(s, l, 4);
  assert.equal(l.progress, 3);
  assert.ok(s.activeLocation);
  handle(s, fx("questProgress", { value: 3 }));
  flush(s);
  assert.equal(s.activeLocation, null);
  assert.equal(s.progress, 1);
});
test("Ruined Road offers two progress or a ready hero only on actual travel", () => {
  let s = base();
  const l = make(s, R.road);
  s.staging.push(l);
  s.phase = "travel";
  s.heroes[0].exhausted = true;
  s = act(s, { type: "TRAVEL", id: l.id });
  assert.match(s.choice!.title, /Ruined Road/);
  s = choose(s, "progress");
  assert.equal(s.activeLocation!.progress, 2);
});
test("Road shadows return attackers to staging after the attack or damage every ally", () => {
  for (const c of [R.hills, R.crebain, R.night, R.road]) {
    const s = base(),
      e = enemy(s, "01089");
    s.combat = { enemyId: e.id, defenderId: null, attackBonus: 0 };
    shadow(s, c);
    assert.equal(s.combat.returnToStaging, true);
  }
  const s = base(),
    e = enemy(s, "01089");
  s.combat = { enemyId: e.id, defenderId: null, attackBonus: 0 };
  shadow(s, R.country);
  assert.equal(arwen(s).damage, 1);
});
test("twenty progress searches Goblin Gate into staging and activates it only when there is no active location", () => {
  for (const existing of [false, true]) {
    const s = base();
    s.encounterDeck = [R.gate, "01081"];
    if (existing) s.activeLocation = make(s, R.hills);
    s.progress = 20;
    advanceQuest(s);
    flush(s);
    assert.equal(s.stage, 2);
    assert.equal(s.progress, 0);
    assert.equal(s.stageRevealing, false);
    if (existing) {
      assert.equal(s.activeLocation!.code, R.hills);
      assert.ok(s.staging.some((u) => u.code === R.gate));
    } else assert.equal(s.activeLocation!.code, R.gate);
  }
});
test("Orc Outpost can find Goblin Gate in discard and the final stage reveals one per player, prohibits healing and wins at thirteen", () => {
  let s = base(2);
  s.encounterDiscard = [R.gate];
  s.progress = 20;
  advanceQuest(s);
  flush(s);
  assert.equal(s.activeLocation!.code, R.gate);
  assert.ok(!s.encounterDiscard.includes(R.gate));
  s = base(2);
  s.stage = 2;
  s.progress = 7;
  s.encounterDeck = [R.hills, R.country, "01081"];
  advanceQuest(s);
  flush(s);
  assert.equal(s.stage, 3);
  assert.equal(s.encounterDeck.length, 1);
  assert.equal(s.staging.length, 2);
  const h = s.heroes[0];
  h.damage = 2;
  handle(s, fx("heal", { target: h.id, value: 2 }));
  assert.equal(h.damage, 2);
  s.progress = 13;
  advanceQuest(s);
  assert.equal(s.status, "won");
});
test("Road pending immediate defense and first-revealed round identity survive save/reload", () => {
  let s = base(2);
  s.activeLocation = make(s, R.gate);
  s.threat = 40;
  s = reveal(s, R.bear);
  assert.match(s.choice!.title, /Immediate attack/);
  const saved = validateSave(JSON.parse(JSON.stringify(s)));
  assert.ok(saved);
  const restored = restoreSave(JSON.parse(JSON.stringify(s)))!;
  assert.deepEqual(restored.roadRivendell, s.roadRivendell);
  assert.deepEqual(restored.choice, JSON.parse(JSON.stringify(s.choice)));
});
test("zero exhausted characters leave Sleeping Sentry's pre-Then each clause unresolved", () => {
  const s = reveal(base(), R.sentry);
  assert.ok(allCharacters(s).every((u) => !u.exhausted));
  assert.equal(s.choice, null);
});
test("Sleeping Sentry waits for Frodo's damage response and cancellation prevents post-Then exhaustion", () => {
  let s = base();
  const frodo = make(s, "02025");
  s.heroes.push(frodo);
  frodo.exhausted = true;
  s = reveal(s, R.sentry);
  assert.match(s.choice!.title, /Frodo/);
  assert.equal(arwen(s).exhausted, false);
  s = choose(s, "cancel-damage");
  assert.equal(arwen(s).exhausted, false);
  assert.equal(getHero(s, frodo.id).damage, 0);
  s = base();
  const accepts = make(s, "02025");
  s.heroes.push(accepts);
  accepts.exhausted = true;
  s = reveal(s, R.sentry);
  s = choose(s, "accept-damage");
  assert.equal(getHero(s, accepts.id).damage, 1);
  assert.ok(allCharacters(s).every((u) => u.exhausted));
});
test("the first enemy remains tracked when Goblin Gate becomes active later before its engagement", () => {
  let s = base();
  s = reveal(s, "01089");
  const first = s.staging.find((u) => u.code === "01089")!;
  s.activeLocation = make(s, R.gate);
  engage(s, first);
  flush(s);
  assert.match(s.choice!.title, /Immediate attack/);
  assert.equal(s.roadRivendell!.gateEnemyId, first.id);
});
test("Goblin Gate's passive attack precedes Taskmaster forced damage and source destruction prevents that later forced ability", () => {
  let s = base();
  s.activeLocation = make(s, R.gate);
  s.threat = 49;
  s.encounterDeck = [R.gate];
  const spear = make(s, "01029");
  s.allies.push(spear);
  placeEncounter(s, R.taskmaster, false, 3, undefined, true);
  flush(s);
  assert.match(s.choice!.title, /Immediate attack/);
  s = choose(s, spear.id);
  s = settle(s);
  assert.equal(s.status, "playing");
  assert.equal(s.choice, null);
  assert.ok(!s.engaged.some((u) => u.code === R.taskmaster));
  assert.ok(s.encounterDiscard.includes(R.taskmaster));
});
test("Orc Raiders leaves a single attachment untouched when the entire if-able clause cannot resolve", () => {
  const s = base(),
    a = attachment(s, s.heroes[0], "01043"),
    raider = enemy(s, R.raiders);
  engage(s, raider);
  flush(s);
  assert.equal(s.choice, null);
  assert.ok(s.heroes[0].attachments.some((x) => x.id === a.id));
});
test("Orc Ambush completes simultaneous engagement moves before asking for either Taskmaster's damage", () => {
  const s = base(),
    one = make(s, R.taskmaster),
    two = make(s, R.taskmaster);
  s.staging.push(one, two);
  reveal(s, R.ambush);
  assert.equal(s.engaged.length, 2);
  assert.equal(s.staging.filter((u) => u.code === R.taskmaster).length, 0);
  assert.match(s.choice!.title, /Choose the next encounter effect/);
});
test("prohibited immediate attacks neither draw a shadow nor consume the ordinary combat attack", () => {
  for (const protection of ["feint", "snare"]) {
    const s = base();
    s.phase = "defense";
    const bear = enemy(s, R.bear);
    bear.attacked = false;
    if (protection === "feint") {
      bear.feinted = true;
      bear.preventedAttacks = [0];
    } else attachment(s, bear, "01069");
    const count = s.encounterDeck.length;
    handle(s, fx("roadRivendellImmediateAttack", { target: bear.id }));
    flush(s);
    assert.equal(s.choice, null);
    assert.equal(s.encounterDeck.length, count);
    assert.equal(bear.attacked, false);
    assert.equal(s.phase, "defense");
  }
});
test("an immediate combat-phase attack retains its shadow but restores its previous ordinary-attack flag", () => {
  let s = base();
  s.phase = "defense";
  s.encounterDeck = [R.gate];
  const bear = enemy(s, R.bear);
  bear.attacked = false;
  handle(s, fx("roadRivendellImmediateAttack", { target: bear.id }));
  flush(s);
  s = choose(s, s.heroes[0].id);
  s = settle(s);
  assert.equal(s.phase, "defense");
  assert.equal(s.engaged.find((e) => e.id === bear.id)!.attacked, false);
  assert.deepEqual(s.engaged.find((e) => e.id === bear.id)!.shadows, [R.gate]);
});
test("Arwen loss is immediate during setup revelations too", () => {
  const s = base();
  s.phase = "setup";
  destroy(s, arwen(s));
  assert.equal(s.status, "lost");
});
test("Sleeping Sentry's successfully resolved Dori replacement finishes before the post-Then exhaustion", () => {
  let s = base();
  const hero = s.heroes[0],
    dori = make(s, "131009");
  s.allies.push(dori);
  hero.exhausted = true;
  s = reveal(s, R.sentry);
  assert.match(s.choice!.title, /Dori/);
  assert.equal(arwen(s).exhausted, false);
  s = choose(s, dori.id);
  assert.equal(getHero(s, hero.id).damage, 0);
  assert.equal(s.allies.find((u) => u.id === dori.id)!.damage, 1);
  assert.ok(allCharacters(s).every((u) => u.exhausted));
});
test("Sleeping Sentry waits for reciprocal Song replacements and then exhausts the remaining ready characters", () => {
  let s = base();
  const [one, two] = s.heroes;
  one.exhausted = true;
  two.exhausted = true;
  attachment(s, one, "02099");
  attachment(s, two, "02099");
  s.used.push(
    `phase:mocking:${s.nextId++}:${one.id}:${two.id}`,
    `phase:mocking:${s.nextId++}:${two.id}:${one.id}`,
  );
  s = reveal(s, R.sentry);
  assert.equal(getHero(s, one.id).damage, 1);
  assert.equal(getHero(s, two.id).damage, 1);
  assert.ok(allCharacters(s).every((u) => u.exhausted));
});
test("Frodo cancellation after Song redirection still prevents Sleeping Sentry's Then clause", () => {
  let s = base();
  const hero = s.heroes[0],
    frodo = make(s, "02025");
  s.heroes.push(frodo);
  hero.exhausted = true;
  attachment(s, frodo, "02099");
  s.used.push(`phase:mocking:${s.nextId++}:${hero.id}:${frodo.id}`);
  s = reveal(s, R.sentry);
  assert.match(s.choice!.title, /Frodo/);
  assert.equal(arwen(s).exhausted, false);
  s = choose(s, "cancel-damage");
  assert.equal(getHero(s, hero.id).damage, 0);
  assert.equal(getHero(s, frodo.id).damage, 0);
  assert.equal(arwen(s).exhausted, false);
});
test("Followed by Night continues from an eliminated non-first attacking fellowship to the next living enemy", () => {
  let s = base(2);
  const first = enemy(s, "01089"),
    second = make(s, "01082");
  forOwner(s, 1, () => {
    s.heroes = s.heroes.slice(0, 1);
    s.heroes[0].damage = 0;
    s.engaged.push(second);
  });
  s = reveal(s, R.night);
  s = choose(s, "attacks");
  s = choose(s, second.id);
  s = choose(s, "undefended");
  if (s.choice?.options.some((o) => o.id === seatView(s, 1).heroes[0]?.id))
    s = choose(s, seatView(s, 1).heroes[0].id);
  assert.equal(s.status, "playing");
  assert.equal(s.table!.seats[1].eliminated, true);
  assert.equal(ownerOf(s, arwen(s)), 0);
  assert.match(s.choice!.title, /Choose the next enemy/);
  assert.equal(s.choice!.options[0].id, first.id);
  s = choose(s, first.id);
  s = choose(s, s.heroes.find((h) => h.code === "01001")!.id);
  s = settle(s);
  assert.equal(s.phase, "planning");
  assert.equal(s.combat, null);
  assert.equal(s.status, "playing");
});
test("Sneak Attack, Stand and Fight and Timely Aid cannot put player Arwen into the escort", () => {
  let s = base();
  const arwenAlly = make(s, "04058"),
    sneak = make(s, "01023");
  s.hand = [arwenAlly, sneak];
  assert.throws(
    () => act(s, { type: "PLAY", id: sneak.id }),
    /eligible|ally|unique|Arwen/i,
  );
  const stand = make(s, "01051");
  s.discard = ["04058"];
  assert.equal(playTargets(s, stand).length, 0);
  s = base();
  const timely = make(s, "04003");
  s.hand = [timely];
  s.deck = ["04058", "01013"];
  s = act(s, { type: "PLAY", id: timely.id });
  assert.ok(!s.choice || !s.choice.options.some((o) => o.code === "04058"));
  s = settle(s);
  assert.equal(s.allies.filter((u) => u.code === "04058").length, 0);
  assert.ok(s.deck.includes("04058"));
});
