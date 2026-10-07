import assert from "node:assert/strict";
import test from "node:test";
import { applyAction as act } from "./pass-resource-window.ts";
import {
  availableAbilities,
  canTravel,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine.ts";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import {
  check,
  damage,
  discardCharacter,
  placeEncounter,
  progress,
  progressLocation,
  revealed,
  shadow,
} from "../src/game/board.ts";
import { fx, get, make, questStat, stats, threatOf } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import {
  allActiveLocations,
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table.ts";
import {
  ASSAULT_OSGILIATH as A,
  ASSAULT_OSGILIATH_ENCOUNTERS,
  ASSAULT_OSGILIATH_QUESTS,
  ASSAULT_OSGILIATH_RECIPES,
} from "../src/game/assault-osgiliath-support.ts";
import { HEIRS_NUMENOR as H } from "../src/game/heirs-numenor-support.ts";
import type { GameState, Unit } from "../src/game/types.ts";

const starter = STARTERS.find((d) => d.id === "leadership")!;
function raw(players = 1, easy = false) {
  return createGame(913, starter.cards, starter.heroes, starter.id, {
    scenarioId: "assault-on-osgiliath",
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
function choose(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    `${id}: ${JSON.stringify(s.choice)}`,
  );
  return act(s, { type: "CHOOSE", id });
}
function setup(s: GameState) {
  for (let step = 0; step < 30 && s.phase === "setup"; step++) {
    if (s.choice) {
      const option =
        s.choice.options.find((o) => o.code === A.soldier) ??
        s.choice.options[0];
      s = choose(s, option.id);
    } else s = act(s, { type: "KEEP" });
  }
  assert.notEqual(s.phase, "setup");
  return s;
}
function base(players = 1) {
  const s = setup(raw(players));
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    staging: [],
    engaged: [],
    activeLocation: null,
    extraActiveLocations: [],
    combat: null,
    suspendedCombats: [],
    encounterDeck: Array(40).fill("01099"),
    encounterDiscard: [],
    progress: 0,
    victory: 0,
    victoryCards: [],
    assaultOsgiliath: { controlled: [], archeryBonus: 0 },
  });
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      s.hand = [];
      s.discard = [];
      s.allies = [];
      s.engaged = [];
      s.used = [];
      s.deck = Array(30).fill("01043");
      s.committedIds = [];
      for (const h of s.heroes)
        Object.assign(h, {
          damage: 0,
          resources: 8,
          exhausted: false,
          committed: false,
          attachments: [],
        });
    });
  selectSeat(s, 0);
  if (s.table) {
    s.table.first = 0;
    s.table.turn = 0;
    s.table.passed = [];
  }
  return s;
}
function location(
  s: GameState,
  code: string,
  zone: "staging" | "active" | "controlled" = "staging",
  player = 0,
) {
  const u = make(s, code);
  if (zone === "active") s.activeLocation = u;
  else if (zone === "controlled") {
    u.owner = player;
    s.assaultOsgiliath!.controlled.push(u);
  } else s.staging.push(u);
  return u;
}
function reveal(s: GameState, code: string) {
  revealed(s, code);
  flush(s);
  return s;
}
function reload(s: GameState) {
  syncSeat(s);
  const json = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(json), "Serializable scenario state must validate");
  const restored = restoreSave(json);
  assert.ok(restored);
  return restored;
}
function enemy(s: GameState, code = A.soldier, player = 0) {
  const e = make(s, code);
  forOwner(s, player, () => s.engaged.push(e));
  return e;
}
function combat(s: GameState, e: Unit, defender?: Unit, player = 0) {
  s.phase = "defense";
  s.combat = {
    enemyId: e.id,
    attackPlayer: player,
    defenderId: defender?.id ?? null,
    defenderIds: defender ? [defender.id] : [],
    attackBonus: 0,
  };
}

test("Assault registers its original designs and exact original/easy 1-4 player recipes", () => {
  assert.equal(ASSAULT_OSGILIATH_ENCOUNTERS.length, 15);
  assert.equal(ASSAULT_OSGILIATH_QUESTS.length, 1);
  for (const c of [
    ...ASSAULT_OSGILIATH_ENCOUNTERS,
    ...ASSAULT_OSGILIATH_QUESTS,
  ])
    assert.ok(SCRIPTED.has(c.code), c.name);
  assert.equal(card(A.retake).quest, undefined);
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = setup(raw(players, easy));
      const recipe = ASSAULT_OSGILIATH_RECIPES.find(
        (r) => r.id === (easy ? "E03.7" : "Q03.7"),
      )!;
      const expected = recipe.cards
        .filter((c) => c.section === "sharedEncounterDeck")
        .flatMap((c) => Array(c.quantity).fill(c.code))
        .sort();
      const actual = [
        ...s.encounterDeck,
        ...s.staging.map((u) => u.code),
        ...s.encounterDiscard,
      ].sort();
      assert.equal(expected.length, easy ? 34 : 50);
      assert.deepEqual(actual, expected);
      assert.equal(
        s.staging.filter((u) => card(u.code).type_code === "enemy").length,
        players,
      );
      const unique = s.staging.filter(
        (u) => card(u.code).type_code === "location",
      );
      assert.equal(unique.length, players);
      assert.equal(new Set(unique.map((u) => u.code)).size, players);
      assert.ok(unique.every((u) => card(u.code).is_unique));
      assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
    }
});
test("setup uses printed choices, persists midway, and adding Haradrim Elite triggers its entry attack", () => {
  let s = raw(2);
  assert.match(s.choice!.title, /Choose an enemy/);
  assert.equal(s.table!.active, 0);
  s = reload(s);
  s = choose(s, s.choice!.options.find((o) => o.code === A.soldier)!.id);
  assert.match(s.choice!.title, /unique location/);
  s = choose(reload(s), s.choice!.options.find((o) => o.code === A.gate)!.id);
  assert.equal(s.table!.active, 1);
  s = choose(s, s.choice!.options.find((o) => o.code === H.elite)!.id);
  assert.ok(
    s.combat || s.choice?.title.toLowerCase().includes("attack"),
    JSON.stringify(s.choice),
  );
});
test("Old Bridge planning action splits resource payment, captures for first player, and retains physical attachments", () => {
  let s = base();
  const bridge = location(s, A.bridge);
  bridge.progress = 5;
  const attachment = {
    id: `a${s.nextId++}`,
    code: "02010",
    exhausted: false,
    owner: 0,
  };
  bridge.attachments.push(attachment);
  const resources = s.heroes[0].resources;
  assert.equal(
    canTravel({ ...s, phase: "travel" }, bridge),
    "The players cannot travel here.",
  );
  s = act(s, { type: "ABILITY", id: bridge.id });
  s = choose(s, s.heroes[0].id);
  assert.match(s.choice!.title, /1 remaining/);
  s = choose(reload(s), s.heroes[1].id);
  assert.equal(s.heroes[0].resources, resources - 1);
  assert.equal(s.heroes[1].resources, 7);
  const claimed = s.assaultOsgiliath!.controlled[0];
  assert.equal(claimed.id, bridge.id);
  assert.equal(claimed.progress, 0);
  assert.equal(claimed.owner, 0);
  assert.equal(claimed.attachments[0].id, attachment.id);
  assert.equal(get(s, claimed.id)?.id, claimed.id);
  assert.ok(!s.encounterDiscard.includes(A.bridge));
  assert.equal(reload(s).assaultOsgiliath!.controlled[0].id, bridge.id);
});
test("Old Bridge costs one resource with another Osgiliath location in staging and respects Orc Vanguard", () => {
  let s = base();
  const bridge = location(s, A.bridge);
  location(s, A.harbor);
  s = act(s, { type: "ABILITY", id: bridge.id });
  assert.match(s.choice!.title, /1 remaining/);
  s = choose(s, s.heroes[0].id);
  assert.equal(get(s, bridge.id)?.progress, 1);
  placeEncounter(s, H.vanguard, false);
  assert.ok(availableAbilities(s, get(s, bridge.id)!)[0].disabled);
});
test("Ancient Harbor exhausts the acting player's hero in combat and grants control to the first player", () => {
  let s = base(2);
  const harbor = location(s, A.harbor);
  harbor.progress = 4;
  assert.ok(availableAbilities(s, harbor)[0].disabled);
  s.phase = "attack";
  s.table!.turn = 1;
  selectSeat(s, 1);
  const hero = s.heroes[0];
  s = act(s, { type: "ABILITY", id: harbor.id });
  assert.ok(
    s.choice!.options.every((o) => s.heroes.some((h) => h.id === o.id)),
  );
  s = choose(s, hero.id);
  assert.ok(seatView(s, 1).heroes.find((h) => h.id === hero.id)!.exhausted);
  assert.equal(s.assaultOsgiliath!.controlled[0].owner, 0);
  assert.equal(s.assaultOsgiliath!.controlled[0].progress, 0);
  assert.equal(threatOf(s, get(s, harbor.id)!), 1);
  reload(s);
});
test("West Gate reveals a selected discard location including its surge before becoming active", () => {
  let s = base();
  const gate = location(s, A.gate);
  s.encounterDiscard = [A.square];
  s.encounterDeck = [A.phalanx, "01099"];
  s = act(s, { type: "ABILITY", id: gate.id });
  s = choose(reload(s), "discard:0");
  assert.equal(s.activeLocation?.id, gate.id);
  assert.ok(s.staging.some((u) => u.code === A.square));
  assert.ok(
    s.staging.some((u) => u.code === A.phalanx),
    "West Gate reveals the searched location, including Surge",
  );
  assert.equal(s.encounterDiscard.length, 0);
  assert.ok(availableAbilities(s, s.activeLocation!)[0].disabled);
});
test("using a controlled West Gate loses its control and returns that controller's Ruined Towers", () => {
  let s = base();
  const gate = location(s, A.gate, "controlled");
  const tower = location(s, A.tower, "controlled");
  s.encounterDeck = [];
  s = act(s, { type: "ABILITY", id: gate.id });
  assert.equal(s.activeLocation?.id, gate.id);
  assert.equal(s.assaultOsgiliath!.controlled.length, 0);
  assert.ok(s.staging.some((u) => u.id === tower.id));
});
test("Ruined Tower permits a second active location after a real exhaustion cost and progress is allocated explicitly", () => {
  let s = base();
  s.phase = "travel";
  const east = location(s, A.east, "active");
  const tower = location(s, A.tower);
  assert.equal(canTravel(s, tower), null);
  s = act(s, { type: "TRAVEL", id: tower.id });
  assert.match(s.choice!.title, /Ruined Tower/);
  s = choose(reload(s), s.heroes[0].id);
  assert.equal(allActiveLocations(s).length, 2);
  assert.ok(s.heroes[0].exhausted);
  progress(s, 1);
  flush(s);
  assert.match(s.choice!.title, /Divide progress/);
  s = choose(s, `${east.id}:1`);
  assert.equal(get(s, east.id)?.progress, 1);
  assert.equal(get(s, tower.id)?.progress, 0);
});
test("Ruined Tower travel can exhaust a character controlled by another fellowship", () => {
  let s = base(2);
  s.phase = "travel";
  location(s, A.east, "active");
  const tower = location(s, A.tower);
  for (const h of seatView(s, 0).heroes) h.exhausted = true;
  const payer = seatView(s, 1).heroes[0];
  syncSeat(s);
  assert.equal(canTravel(s, tower), null);
  s = act(s, { type: "TRAVEL", id: tower.id });
  assert.ok(s.choice!.options.some((o) => o.id === payer.id));
  assert.ok(
    s.choice!.options.every((o) =>
      seatView(s, 1).heroes.some((h) => h.id === o.id),
    ),
  );
  s = choose(reload(s), payer.id);
  assert.equal(seatView(s, 1).heroes[0].exhausted, true);
  assert.equal(allActiveLocations(s).length, 2);
  assert.equal(s.activeLocation!.id, tower.id);
});
test("King's Library pays its reveal cost before entering the active slot", () => {
  let s = base();
  s.phase = "travel";
  const library = location(s, A.library);
  s.encounterDeck = [A.phalanx];
  s = act(s, { type: "TRAVEL", id: library.id });
  assert.equal(s.activeLocation?.id, library.id);
  assert.ok(s.staging.some((u) => u.code === A.phalanx));
});
test("active East/West Quarters use attack/defense and an explicit first-player choice resolves both", () => {
  let s = base();
  location(s, A.east, "active");
  assert.equal(questStat(s), "attack");
  s.activeLocation!.blanked = true;
  assert.equal(questStat(s), "will");
  s.activeLocation!.blanked = false;
  const west = make(s, A.west);
  s.extraActiveLocations = [west];
  s.phase = "staging";
  s.queue = [fx("questReady")];
  flush(s);
  assert.match(s.choice!.title, /East and West Quarter/);
  s = choose(reload(s), "battle");
  assert.equal(questStat(s), "attack");
});
test("quest resolution requests a late conflicting-quarter choice and resumes with the chosen stat", () => {
  let s = base();
  location(s, A.east, "active");
  s.extraActiveLocations = [make(s, A.west)];
  for (const h of s.heroes) h.committed = true;
  s.phase = "staging";
  s = act(s, { type: "NEXT" });
  assert.match(s.choice!.title, /East and West Quarter/);
  assert.equal(s.lastQuest, null);
  s = choose(reload(s), "siege");
  assert.equal(s.lastQuest!.stat, "defense");
  assert.equal(
    s.lastQuest!.will,
    s.heroes.reduce((n, h) => n + stats(s, h).defense, 0),
  );
});
test("Counter-attack uses the erratum's either branch, highest-threat ties, and each player's own total", () => {
  let s = base(2);
  const gate = location(s, A.gate, "controlled", 0);
  const east = location(s, A.east, "controlled", 0);
  location(s, A.bridge, "controlled", 0);
  location(s, A.harbor, "controlled", 1);
  s.encounterDeck = ["01099"];
  s = reveal(s, A.counter);
  assert.deepEqual(
    s
      .choice!.options.filter((o) => o.id !== "threat")
      .map((o) => o.id)
      .sort(),
    [gate.id, east.id].sort(),
  );
  s = choose(reload(s), "threat");
  assert.equal(seatView(s, 0).threat, 25);
  assert.equal(s.table!.active, 1);
  s = choose(s, s.choice!.options.find((o) => o.id !== "threat")!.id);
  assert.equal(seatView(s, 1).threat, 20);
  assert.equal(s.assaultOsgiliath!.controlled.length, 3);
  assert.ok(s.staging.some((u) => u.code === A.harbor));
  assert.ok(
    s.staging.some((u) => u.code === "01099"),
    "Counter-attack retains Surge",
  );
});
test("Street Fighting cannot be canceled, discards until Osgiliath, and exhausts only the first player's hero", () => {
  let s = base(2);
  forOwner(s, 1, () => s.hand.push(make(s, "01050")));
  s.encounterDeck = [A.soldier, H.camp, A.square, A.phalanx];
  s = reveal(s, A.street);
  assert.match(s.choice!.title, /Street Fighting/);
  assert.ok(s.choice!.options.every((o) => !o.id.startsWith("cancel")));
  const hero = seatView(s, 0).heroes[0];
  s = choose(reload(s), hero.id);
  assert.deepEqual(s.encounterDiscard, [A.street, A.soldier, H.camp]);
  assert.equal(s.assaultOsgiliath!.controlled[0].code, A.square);
  assert.equal(s.assaultOsgiliath!.controlled[0].owner, 0);
  assert.ok(seatView(s, 0).heroes.find((h) => h.id === hero.id)!.exhausted);
  assert.deepEqual(
    s.encounterDeck,
    [A.phalanx],
    "Discarding/claiming Ruined Square does not reveal or surge",
  );
});
test("Street Fighting decline adds the discarded location without revealing it or firing Surge", () => {
  let s = base();
  s.encounterDeck = [A.square, A.phalanx];
  s = choose(reveal(s, A.street), "staging");
  assert.ok(s.staging.some((u) => u.code === A.square));
  assert.deepEqual(s.encounterDeck, [A.phalanx]);
});
test("Pinned Down uses controlled count when revealed, stacks archery this round, and surges only below four", () => {
  let s = base();
  location(s, A.gate, "controlled");
  location(s, A.bridge, "controlled");
  s.encounterDeck = ["01099"];
  s = reveal(s, A.pinned);
  assert.equal(s.assaultOsgiliath!.archeryBonus, 2);
  assert.ok(s.staging.some((u) => u.code === "01099"));
  location(s, A.harbor, "controlled");
  location(s, A.library, "controlled");
  s.encounterDeck = [A.phalanx];
  s = reveal(s, A.pinned);
  assert.equal(s.assaultOsgiliath!.archeryBonus, 6);
  assert.deepEqual(s.encounterDeck, [A.phalanx]);
  s.phase = "encounter";
  s.optionalEngagement = true;
  s = act(s, { type: "NEXT" });
  assert.match(s.choice!.title, /Archery.*6 remaining/);
  reload(s);
});
test("Southron Phalanx uses its engaged controller's locations and its shadow uses original defending player", () => {
  const s = base(2);
  location(s, A.gate, "controlled", 0);
  location(s, A.harbor, "controlled", 0);
  location(s, A.bridge, "controlled", 1);
  const e = enemy(s, A.phalanx, 1);
  assert.equal(stats(s, e).attack, 2);
  const sentinel = seatView(s, 0).heroes[0];
  combat(s, e, sentinel, 1);
  shadow(s, A.phalanx);
  assert.equal(s.combat!.attackBonus, 1);
});
test("Uruk Lieutenant returns the topmost Orc without repeating its When Revealed", () => {
  const s = base();
  s.encounterDiscard = [A.soldier, A.phalanx, A.lieutenant, A.harbor];
  reveal(s, A.lieutenant);
  assert.equal(s.staging.filter((u) => u.code === A.lieutenant).length, 2);
  assert.ok(s.encounterDiscard.includes(A.soldier));
  assert.ok(!s.encounterDiscard.includes(A.lieutenant));
});
test("Southron Commander attacks only players controlling locations and returns to staging", () => {
  let s = base(2);
  location(s, A.east, "controlled", 1);
  s = reveal(s, A.commander);
  assert.equal(s.combat?.attackPlayer, 1);
  assert.ok(s.staging.some((u) => u.code === A.commander));
  s = choose(reload(s), seatView(s, 1).heroes[0].id);
  while (s.choice)
    s = choose(
      s,
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  assert.ok(s.staging.some((u) => u.code === A.commander));
});
test("Ruined Square offers real response progress for every enemy defeat and captures on exploration", () => {
  let s = base();
  const square = location(s, A.square);
  square.progress = 1;
  const e = enemy(s);
  damage(s, e.id, 20);
  flush(s);
  assert.match(s.choice!.title, /Ruined Square/);
  s = choose(reload(s), "progress");
  assert.equal(s.assaultOsgiliath!.controlled[0].id, square.id);
  assert.equal(s.assaultOsgiliath!.controlled[0].progress, 0);
});
test("any character departure returns controlled Ruined Squares and cascades their owner's Ruined Towers", () => {
  const s = base(2);
  const square = location(s, A.square, "controlled", 0);
  const tower = location(s, A.tower, "controlled", 0);
  location(s, A.east, "controlled", 1);
  const ally = make(s, "01016");
  s.allies.push(ally);
  discardCharacter(s, ally);
  flush(s);
  assert.ok(s.staging.some((u) => u.id === square.id));
  assert.ok(s.staging.some((u) => u.id === tower.id));
  assert.equal(s.assaultOsgiliath!.controlled.length, 1);
  reload(s);
});
test("combat casualty triggers Uruk Soldier and highest-threat return shadow separately", () => {
  let s = base();
  const gate = location(s, A.gate, "controlled");
  const harbor = location(s, A.harbor, "controlled");
  const e = enemy(s);
  const ally = make(s, "01016");
  s.allies.push(ally);
  combat(s, e, ally);
  shadow(s, A.pinned);
  damage(s, ally.id, 20, { enemyId: e.id, combatDamage: true });
  flush(s);
  assert.match(s.choice!.title, /Uruk Soldier/);
  s = choose(s, harbor.id);
  assert.match(s.choice!.title, /highest threat/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [gate.id],
  );
  s = choose(s, gate.id);
  assert.equal(s.assaultOsgiliath!.controlled.length, 0);
});
test("a real undefended attack returns all four unique locations and cascades Ruined Tower", () => {
  let s = base();
  for (const code of [A.gate, A.library, A.harbor, A.bridge, A.tower, A.east])
    location(s, code, "controlled");
  const e = enemy(s);
  e.shadows = ["01099"];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: null });
  assert.match(s.choice!.title, /Assign 4 damage/);
  assert.equal(s.combat!.osgiliathUndefended, true);
  s = choose(reload(s), s.heroes[0].id);
  assert.deepEqual(
    s.assaultOsgiliath!.controlled.map((u) => u.code),
    [A.east],
  );
  assert.equal(
    s.staging.filter((u) => card(u.code).type_code === "location").length,
    5,
  );
});
test("undefended location returns resolve before shadow threat and enemy attack is calculated", () => {
  let s = base();
  for (const code of [A.gate, A.library, A.harbor, A.bridge, A.tower, A.east])
    location(s, code, "controlled");
  const e = enemy(s, A.phalanx);
  e.shadows = [A.soldier];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: null });
  assert.equal(
    s.threat,
    21,
    "Only East Quarter remains controlled when Soldier's shadow resolves.",
  );
  assert.match(s.choice!.title, /Assign 2 damage/);
  assert.deepEqual(
    s.assaultOsgiliath!.controlled.map((u) => u.code),
    [A.east],
  );
  s = choose(reload(s), s.heroes[0].id);
  assert.equal(
    s.heroes[0].damage,
    2,
    "Phalanx uses the one remaining controlled location.",
  );
});
test("an immediate staging attack returns unique locations before resolving its shadow", () => {
  let s = base();
  for (const code of [A.gate, A.library, A.harbor, A.bridge, A.tower, A.east])
    location(s, code, "controlled");
  s.encounterDeck = [A.soldier];
  s = reveal(s, A.commander);
  assert.match(s.choice!.title, /Immediate attack/);
  assert.equal(
    s.assaultOsgiliath!.controlled.length,
    6,
    "No undefended declaration has happened yet.",
  );
  s = choose(reload(s), "undefended");
  assert.equal(s.threat, 21);
  assert.match(s.choice!.title, /Assign 5 damage/);
  assert.deepEqual(
    s.assaultOsgiliath!.controlled.map((u) => u.code),
    [A.east],
  );
});
test("a defender removed by a shadow makes the attack undefended before Phalanx damage is calculated", () => {
  let s = base();
  for (const code of [A.gate, A.library, A.harbor, A.bridge, A.tower, A.east])
    location(s, code, "controlled");
  const e = enemy(s, A.phalanx);
  e.shadows = [H.wargs];
  const ally = make(s, "01016");
  s.allies.push(ally);
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: ally.id });
  assert.ok(!s.allies.some((u) => u.id === ally.id));
  assert.equal(s.combat!.osgiliathUndefended, true);
  assert.match(s.choice!.title, /Assign 2 damage/);
  assert.deepEqual(
    s.assaultOsgiliath!.controlled.map((u) => u.code),
    [A.east],
  );
});
test("a defended attack that kills its defender does not count as an undefended attack", () => {
  let s = base();
  const gate = location(s, A.gate, "controlled");
  const e = enemy(s, A.phalanx);
  e.tempAttack = 8;
  e.shadows = ["01099"];
  const ally = make(s, "01016");
  s.allies.push(ally);
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: ally.id });
  while (s.choice)
    s = choose(
      s,
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  assert.ok(!s.allies.some((u) => u.id === ally.id));
  assert.equal(s.assaultOsgiliath!.controlled[0].id, gate.id);
});
test("Uruk Soldier threat shadow and Lieutenant attachment shadow use the defending seat including ally hosts", () => {
  let s = base(2);
  location(s, A.east, "controlled", 1);
  location(s, A.bridge, "controlled", 1);
  const e = enemy(s, A.phalanx, 1);
  combat(s, e, undefined, 1);
  selectSeat(s, 1);
  shadow(s, A.soldier);
  flush(s);
  assert.equal(seatView(s, 1).threat, 22);
  selectSeat(s, 1);
  const ally = make(s, "01016");
  s.allies.push(ally);
  ally.attachments.push({
    id: `a${s.nextId++}`,
    code: "06059",
    exhausted: false,
    owner: 1,
  });
  s.heroes[0].attachments.push({
    id: `a${s.nextId++}`,
    code: "01039",
    exhausted: false,
    owner: 1,
  });
  syncSeat(s);
  shadow(s, A.lieutenant);
  flush(s);
  assert.equal(s.heroes[0].attachments.length, 0);
  assert.equal(ally.attachments.length, 0);
});
test("eliminated player's controlled locations return to staging with their physical identities", () => {
  const s = base(2);
  const gate = location(s, A.gate, "controlled", 1);
  const tower = location(s, A.tower, "controlled", 1);
  forOwner(s, 1, () => {
    s.threat = 50;
  });
  check(s);
  assert.ok(s.table!.seats[1].eliminated);
  assert.ok(s.staging.some((u) => u.id === gate.id));
  assert.ok(s.staging.some((u) => u.id === tower.id));
  assert.equal(s.assaultOsgiliath!.controlled.length, 0);
});
test("quest has no progress victory and wins only at round end after Gandalf departures return squares", () => {
  let s = base();
  location(s, A.gate, "controlled");
  progress(s, 50);
  flush(s);
  assert.equal(s.status, "playing");
  assert.equal(s.progress, 0);
  s.phase = "refresh";
  s.queue = [fx("endRound")];
  flush(s);
  assert.equal(s.status, "won");
  s = base();
  location(s, A.square, "controlled");
  s.allies.push(make(s, "01073"));
  s.phase = "refresh";
  s.queue = [fx("endRound")];
  flush(s);
  assert.equal(s.status, "playing");
  assert.ok(s.staging.some((u) => u.code === A.square));
});
test("controlled-location saves reject wrong cards, owners, duplicate physical zones, and invalid effect state", () => {
  const s = base(2);
  location(s, A.gate, "controlled", 1);
  const valid = JSON.parse(JSON.stringify(reload(s)));
  for (const mutate of [
    (x: GameState) => {
      x.assaultOsgiliath!.controlled[0].owner = 8;
    },
    (x: GameState) => {
      x.assaultOsgiliath!.controlled[0].code = A.soldier;
    },
    (x: GameState) => {
      x.staging.push(x.assaultOsgiliath!.controlled[0]);
    },
    (x: GameState) => {
      x.assaultOsgiliath!.controlled.push(x.assaultOsgiliath!.controlled[0]);
    },
    (x: GameState) => {
      x.assaultOsgiliath!.archeryBonus = -1;
    },
  ]) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    assert.equal(validateSave(invalid), false);
  }
});
