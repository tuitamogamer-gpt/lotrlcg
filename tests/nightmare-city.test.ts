import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STARTERS, card, encounterCards } from "../src/game/cards";
import { engage, progress, revealed, shadow } from "../src/game/board";
import { engagementCost, get, make, prepend, stats } from "../src/game/core";
import { flush } from "../src/game/effects";
import { applyAction, createGame } from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import {
  allCharacters,
  allEngaged,
  forOwner,
  playerOrder,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import { isShipObjective } from "../src/game/ships";
import { addCurrentQuestProgress } from "../src/game/side-quests";
import {
  beginSailingTest,
  sailingContinue,
  sailingSymbols,
  shiftHeading,
} from "../src/game/sailing";
import { CITY as C } from "../src/game/city-support";
import {
  NIGHTMARE,
  NIGHTMARE_DC as N,
  nightmareCardOf,
  nightmareStatus,
} from "../src/game/nightmare";
import type { GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import { autoplay, choose, opening, reload, valid } from "./nightmare-fixtures";
import { setStage, settle } from "./city-fixtures";

const ID = "the-city-of-corsairs";
const hooks = (s: GameState) => batch4Scenario(s);
const tally = (list: string[]) =>
  list.reduce<Record<string, number>>(
    (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
    {},
  );
/** A Nightmare mode game as created. */
function created(players = 1, seed = 53) {
  const d = STARTERS[0];
  return createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: ID,
    nightmare: true,
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
const start = (players = 1, seed = 53) => opening(created(players, seed));
/** A quiet Nightmare board at sea (city-fixtures' base, in Nightmare mode). */
function board(players = 1) {
  const s = start(players);
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    staging: [],
    activeLocation: null,
    extraActiveLocations: [],
    combat: null,
    suspendedCombats: [],
    progress: 0,
    encounterDeck: Array(30).fill(C.belfalas),
    encounterDiscard: [],
  });
  if (s.flow) s.flow.pending = null;
  s.sailing = { heading: 0 };
  Object.assign(s.city!, {
    advancing: false,
    corsairDiscard: [],
    foes: [],
    allyEntries: { round: s.round, count: 0 },
  });
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      s.engaged = [];
      s.used = [];
      s.hand = [];
      s.discard = [];
      s.committedIds = [];
      for (const u of [...s.heroes, ...s.allies])
        Object.assign(u, {
          damage: 0,
          resources: 10,
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
  syncSeat(s);
  return s;
}
const add = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const engagedWith = (s: GameState, code: string) => {
  const u = make(s, code);
  u.owner = 0;
  s.engaged.push(u);
  return u;
};
const finish = (s: GameState) => {
  flush(s);
  return settle(s);
};
const pick = (s: GameState, id: string) => {
  const o = s.choice!.options.find(
    (o) => o.id === id || o.effects.some((e) => e.target === id),
  );
  assert.ok(o, JSON.stringify(s.choice));
  return choose(s, o.id);
};
const shipOf = (s: GameState) => s.allies.find(isShipObjective)!;
const unit = (s: GameState, id: string) =>
  [...allCharacters(s), ...s.staging, ...allEngaged(s)].find(
    (u) => u.id === id,
  )!;
function combat(s: GameState, enemy: Unit, defender?: Unit) {
  s.combat = {
    enemyId: enemy.id,
    defenderId: defender?.id ?? null,
    attackBonus: 0,
    damageDealt: 0,
    attackPlayer: 0,
  };
  return s.combat;
}

test("Nightmare: The City of Corsairs' setup card and Nightmare Deck carry their scans' texts, stats and faces", () => {
  const setup = card(N.cityCard);
  assert.equal(setup.type_code, "nightmare");
  for (const line of [
    "2x Corsair Infiltrator",
    "2x Fog Bank",
    "2x Starlit Sea",
    "2x Scouting Ship",
    "2x Serpent's Tail",
    "1x Streets of Umbar",
  ])
    assert.ok(setup.text!.includes(`${line}\n`), line);
  assert.ok(setup.text!.endsWith("discarded during a Sailing test."));
  const back = setup.back_text!.split("\n");
  assert.equal(back.length, 3);
  assert.match(back[1], /stage 2B .* Umbar Bridge .* Inspiring Fury/);
  assert.match(back[2], /stage 3A .* the set-aside Captain Sahír\.$/);
  assert.deepEqual(
    [N.patrolShip, N.loyalist, N.umbarPatrol].map((code) => {
      const c = card(code);
      return [
        c.type_code,
        c.engagement,
        c.threat,
        c.attack,
        c.defense,
        c.health,
        c.quantity,
        c.traits,
      ];
    }),
    [
      ["ship-enemy", 41, 2, 5, 2, 7, 2, "Corsair. Ship."],
      ["enemy", 28, 4, 4, 2, 4, 2, "Corsair. Raider."],
      ["enemy", 48, 3, 3, 4, 6, 3, "Corsair."],
    ],
  );
  // A card distinct from the scenario's own Umbar Patrol.
  assert.notEqual(N.umbarPatrol, C.patrol);
  assert.equal(card(N.patrolShip).text!.split("\n").length, 3);
  assert.match(card(N.loyalist).shadow!, /an additional attack/);
  assert.deepEqual(
    [N.walls, N.bridge].map((code) => {
      const c = card(code);
      return [c.threat, c.quest, c.quantity, c.traits];
    }),
    [
      [5, 4, 2, "Ocean. Coastland."],
      [3, 6, 2, "Umbar. Coastland."],
    ],
  );
  assert.deepEqual(
    [N.patrolShip, N.walls, N.bridge, N.inspiringFury, N.loyalist].map(
      sailingSymbols,
    ),
    [1, 1, 1, 0, 0],
  );
  assert.ok(card(N.inspiringFury).text!.startsWith("Surge.\nWhen Revealed:"));
  const sword = card(N.cursedSword);
  assert.deepEqual(
    [sword.type_code, sword.is_unique, sword.traits, sword.quantity],
    ["objective", true, "Artifact. Item. Cursed.", 1],
  );
  assert.equal((sword.text!.match(/Captain Sahír/g) ?? []).length, 2);
  assert.deepEqual(
    [N.alarm, N.slaveTrade].map((c) => card(c).quantity),
    [2, 3],
  );
  const set = encounterCards.filter(
    (c) => c.encounter_set === "The City of Corsairs - Nightmare",
  );
  assert.equal(set.length, 10);
  assert.equal(
    set.reduce(
      (n, c) => n + (c.type_code === "nightmare" ? 0 : (c.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(
    art.filter((a) => set.some((c) => c.code === a.code)).length,
    11,
  );
  const s = start();
  assert.equal(nightmareCardOf(s), N.cityCard);
  assert.match(nightmareStatus(s)[0], /The Cursed Sword attaches/);
});

test("Nightmare: The City of Corsairs' three piles match the source recipe", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const recipe = recipes.find((r) => r.id === "N06.9")!;
  const section = (name: string) =>
    tally(
      recipe.cards
        .filter((c) => c.section === name)
        .flatMap((c) => Array<string>(c.quantity).fill(c.code)),
    );
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.cityCard).text!.includes(`${n}x ${title}\n`), title);
  for (const players of [1, 3]) {
    const s = created(players);
    // The recipe stages both Southern Belfalas; with fewer than three
    // players the spare one is shuffled into the sea encounter deck.
    const sea = section("sharedEncounterDeck");
    if (players < 3) sea[C.belfalas] = 1;
    assert.deepEqual(tally(s.encounterDeck), sea);
    assert.deepEqual(
      tally(s.city!.corsairDeck),
      section("sharedEncounterDeck2"),
    );
    assert.deepEqual(tally(s.city!.secondDeck), {
      ...section("sharedEncounterDeck3"),
      [C.sahir]: 1,
      [C.monument]: 1,
    });
  }
});

test("Nightmare: stage 2B moves each Umbar Bridge and Inspiring Fury into the second encounter deck, and stage 3A attaches The Cursed Sword to the set-aside Captain Sahír", () => {
  let s = board();
  s.encounterDeck = [N.bridge, N.inspiringFury, C.belfalas];
  s.encounterDiscard = [N.bridge, N.inspiringFury];
  progress(s, 15);
  s = finish(s);
  assert.equal(s.stage, 3);
  const land = [
    ...s.encounterDeck,
    ...s.encounterDiscard,
    ...s.staging.map((u) => u.code),
    ...allEngaged(s).map((u) => u.code),
  ];
  assert.deepEqual(
    [N.bridge, N.inspiringFury].map((c) => land.filter((x) => x === c).length),
    [2, 2],
  );
  assert.ok(
    ![...s.city!.inactiveDeck, ...s.city!.inactiveDiscard].some((c) =>
      [N.bridge, N.inspiringFury].includes(c),
    ),
  );
  const sahir = s.city!.setAside.find((u) => u.code === C.sahir)!;
  assert.ok(sahir.attachments.some((a) => a.code === N.cursedSword));
  assert.ok(!land.includes(N.cursedSword));
  assert.ok(valid(s));
});

test("Nightmare: Patrol Ship gets -40 engagement cost after the heading shifts on-course; a Sailing test that discards it cancels its symbols unless it enters the staging area", () => {
  let s = board();
  const ship = add(s, N.patrolShip);
  s.sailing = { heading: 2 };
  shiftHeading(s, 1);
  assert.equal(engagementCost(s, ship), 41);
  shiftHeading(s, -1);
  assert.equal(engagementCost(s, ship), 1);
  // Added to the staging area, its symbol still counts.
  s = board();
  s.phase = "quest";
  s.sailing = { heading: 1 };
  s.encounterDeck = [N.patrolShip, ...s.encounterDeck];
  beginSailingTest(s);
  s = choose(s, s.heroes[0].id);
  s = choose(s, "done");
  sailingContinue(s);
  flush(s);
  assert.equal(s.choice?.title, "Patrol Ship · Sailing test");
  s = choose(s, "staging");
  flush(s);
  assert.ok(s.staging.some((u) => u.code === N.patrolShip));
  assert.deepEqual(s.sailing!.test!.kept, [N.patrolShip]);
  assert.equal(s.sailing!.test!.successes, 1);
  assert.ok(valid(s));
  s = choose(s, "sailing-heading-1");
  s = finish(s);
  assert.equal(s.sailing!.heading, 1);
  assert.ok(!s.encounterDiscard.includes(N.patrolShip));
  const staged = s.staging.find((u) => u.code === N.patrolShip)!;
  assert.equal(engagementCost(s, staged), 1);
  // Left in the discard pile, it cancels every symbol found.
  s = board();
  s.phase = "quest";
  s.sailing = { heading: 1 };
  s.encounterDeck = [N.patrolShip, N.walls, ...s.encounterDeck];
  beginSailingTest(s);
  s = choose(s, s.heroes[0].id);
  s = choose(s, s.heroes[1].id);
  s = choose(s, "done");
  sailingContinue(s);
  flush(s);
  s = choose(s, "cancel");
  s = finish(s);
  assert.equal(s.sailing!.test, undefined);
  assert.equal(s.sailing!.heading, 2);
  assert.ok(s.encounterDiscard.includes(N.patrolShip));
});

test("Nightmare: Corsair Loyalist's attacks are undefended with 4 resources; its shadow gives a Raider 2 resources or an additional attack", () => {
  let s = board();
  const loyalist = engagedWith(s, N.loyalist);
  loyalist.resources = 3;
  assert.equal(hooks(s).cannotDefend!(s, loyalist, s.heroes[0]), false);
  loyalist.resources = 4;
  assert.ok(hooks(s).cannotDefend!(s, loyalist, s.heroes[0]));
  const raider = engagedWith(s, C.raider);
  combat(s, raider, s.heroes[0]);
  shadow(s, N.loyalist);
  flush(s);
  assert.equal(s.choice?.title, "Corsair Loyalist · Shadow");
  s = choose(s, "attack");
  assert.equal(s.combat!.extraAttacks, 1);
  s = board();
  const other = engagedWith(s, C.raider);
  combat(s, other, s.heroes[0]);
  shadow(s, N.loyalist);
  flush(s);
  s = choose(s, "resources");
  assert.equal(unit(s, other.id).resources, 2);
  // A non-Raider attacker resolves nothing.
  s = board();
  const ship = engagedWith(s, N.patrolShip);
  combat(s, ship, shipOf(s));
  shadow(s, N.loyalist);
  flush(s);
  assert.equal(s.choice, null);
});

test("Nightmare: Walls of Umbar raises a player's threat for each ally committed to a Sailing test, while staged and when a test discards it", () => {
  let s = board();
  add(s, N.walls);
  s.phase = "quest";
  s.sailing = { heading: 1 };
  s.encounterDeck = [N.walls, C.belfalas, C.belfalas, ...s.encounterDeck];
  beginSailingTest(s);
  s = choose(s, s.heroes[0].id);
  assert.equal(s.threat, 20);
  // Ship objectives are allies (The Grey Havens).
  s = choose(s, shipOf(s).id);
  assert.equal(s.threat, 21);
  s = choose(s, "done");
  sailingContinue(s);
  flush(s);
  s = finish(s);
  // The discarded Walls of Umbar: one ally committed.
  assert.equal(s.threat, 22);
});

test("Nightmare: Umbar Bridge cancels the first X progress on the current quest each round, and travelling to it sets each Corsair enemy's engagement cost to 0 for the round", () => {
  const s = setStage(board(), 3);
  const raider = add(s, C.raider),
    bridge = add(s, N.bridge);
  raider.resources = 3;
  addCurrentQuestProgress(s, 5);
  assert.equal(s.progress, 2);
  addCurrentQuestProgress(s, 4);
  assert.equal(s.progress, 6);
  assert.ok(valid(s));
  s.round += 1;
  add(s, N.bridge);
  addCurrentQuestProgress(s, 4);
  assert.equal(s.progress, 6);
  addCurrentQuestProgress(s, 4);
  assert.equal(s.progress, 8);
  prepend(s, ...hooks(s).travelEffects!(s, bridge)!);
  flush(s);
  assert.equal(engagementCost(s, raider), 0);
});

test("Nightmare: Inspiring Fury is dealt as a shadow card to the enemy with the highest attack, then surges; its shadow deals 3 more shadow cards that cannot be canceled", () => {
  let s = board();
  const weak = add(s, C.raider),
    strong = add(s, C.raider);
  strong.roundAttack = 5;
  revealed(s, N.inspiringFury);
  s = finish(s);
  assert.deepEqual(unit(s, strong.id).shadows, [N.inspiringFury]);
  assert.deepEqual(unit(s, weak.id).shadows, []);
  assert.ok(s.staging.some((u) => u.code === C.belfalas));
  // A tie is the first player's choice.
  s = board();
  const a = add(s, C.raider);
  add(s, C.raider);
  revealed(s, N.inspiringFury);
  flush(s);
  assert.equal(
    s.choice?.title,
    "Inspiring Fury · The enemy with the highest attack",
  );
  s = finish(pick(s, a.id));
  assert.deepEqual(unit(s, a.id).shadows, [N.inspiringFury]);
  // Its shadow.
  s = board();
  const enemy = engagedWith(s, C.raider);
  enemy.shadows = [N.inspiringFury];
  enemy.revealedShadowCount = 1;
  combat(s, enemy, s.heroes[0]);
  s.encounterDeck = [C.belfalas];
  s.encounterDiscard = [C.belfalas, C.belfalas];
  shadow(s, N.inspiringFury);
  assert.equal(enemy.shadows.length, 4);
  assert.equal(s.encounterDiscard.length, 0);
  assert.equal(s.queue.filter((e) => e.kind === "shadowReveal").length, 3);
  assert.ok(hooks(s).cannotCancel!(s, true));
  assert.equal(hooks(s).cannotCancel!(s, false), false);
  assert.ok(valid(s));
});

test("Nightmare: The Cursed Sword gives Captain Sahír his excess damage as resources once each round, and player card effects cannot discard it", () => {
  const s = setStage(board(), 4);
  const sahir = engagedWith(s, C.sahir),
    hero = s.heroes[0];
  sahir.attachments.push({
    id: "sword",
    code: N.cursedSword,
    exhausted: false,
  });
  combat(s, sahir, hero);
  hero.damage = stats(s, hero).health + 3;
  hooks(s).damageDealt!(s, hero, 3, { combatDamage: true, enemyId: sahir.id });
  assert.equal(s.combat!.nmExcess, 3);
  // The hero is spared here: a destroyed hero's resources would go to
  // Captain Sahír as well (stage 4).
  hero.damage = 0;
  const before = sahir.resources;
  prepend(s, ...hooks(s).attackFinished!(s, s.combat!));
  flush(s);
  assert.equal(sahir.resources, before + 3);
  assert.equal(s.nightmare?.citySword, s.round);
  assert.deepEqual(hooks(s).attackFinished!(s, s.combat!), []);
  assert.ok(
    hooks(s).attachmentImmune!(s, sahir, sahir.attachments[0], "01001"),
  );
  assert.equal(
    hooks(s).attachmentImmune!(s, sahir, sahir.attachments[0]),
    false,
  );
});

test("Nightmare: Umbar Patrol adds 2 resources to the Raider with the most at the end of the encounter phase, and its shadow adds 1 to each Raider engaged with the defending player", () => {
  let s = setStage(board(), 3);
  add(s, N.umbarPatrol);
  const most = add(s, C.raider),
    fewer = add(s, C.raider);
  most.resources = 2;
  fewer.resources = 1;
  prepend(s, ...hooks(s).encounterEnd!(s));
  flush(s);
  assert.deepEqual(
    [unit(s, most.id).resources, unit(s, fewer.id).resources],
    [4, 1],
  );
  fewer.resources = 4;
  prepend(s, ...hooks(s).encounterEnd!(s));
  flush(s);
  assert.equal(
    s.choice?.title,
    "Umbar Patrol · The Raider enemy with the most resources",
  );
  s = choose(s, fewer.id);
  assert.equal(unit(s, fewer.id).resources, 6);
  s = setStage(board(), 3);
  const a = engagedWith(s, C.raider),
    b = engagedWith(s, C.raider);
  combat(s, a, s.heroes[0]);
  shadow(s, N.umbarPatrol);
  assert.deepEqual([a.resources, b.resources], [1, 1]);
});

test("Nightmare: Raise the Alarm! discards to a Raider enemy and stages it with 3 resources; its shadow adds a resource for each damage the Raider's attack dealt", () => {
  let s = setStage(board(), 3);
  s.encounterDeck = [C.harbor, C.streets, C.raider, C.harbor];
  revealed(s, N.alarm);
  s = finish(s);
  const raider = s.staging.find((u) => u.code === C.raider)!;
  assert.equal(raider.resources, 3);
  assert.deepEqual(s.encounterDeck, [C.harbor]);
  assert.ok(
    [C.harbor, C.streets, N.alarm].every((c) => s.encounterDiscard.includes(c)),
  );
  s = setStage(board(), 3);
  const enemy = engagedWith(s, C.raider);
  const c = combat(s, enemy, s.heroes[0]);
  shadow(s, N.alarm);
  assert.equal(c.ncoAlarm, 1);
  c.damageDealt = 3;
  prepend(s, ...hooks(s).attackFinished!(s, c));
  flush(s);
  assert.equal(enemy.resources, 3);
});

test("Nightmare: Slave Trade's allies destroyed give a Raider their cost in resources; its shadow discards an attachment and gives a Raider its printed cost", () => {
  let s = setStage(board(), 3);
  const ally = make(s, "01016");
  ally.owner = 0;
  s.allies.push(ally);
  const raider = add(s, C.raider);
  revealed(s, N.slaveTrade);
  flush(s);
  assert.match(s.choice!.title, /^Slave Trade · .* deals 2 damage to an ally$/);
  s = choose(s, ally.id);
  flush(s);
  assert.ok(!allCharacters(s).some((u) => u.id === ally.id));
  assert.match(s.choice!.title, /^Slave Trade · Place 1 resource on a Raider/);
  s = choose(s, raider.id);
  assert.equal(unit(s, raider.id).resources, 1);
  s = setStage(board(), 3);
  const hero = s.heroes[0];
  hero.attachments.push({ id: "plate", code: "01040", exhausted: false });
  const enemy = engagedWith(s, C.raider);
  combat(s, enemy, hero);
  shadow(s, N.slaveTrade);
  flush(s);
  assert.equal(
    s.choice?.title,
    "Slave Trade · Discard an attachment you control",
  );
  s = choose(s, "plate");
  assert.ok(!unit(s, hero.id).attachments.some((a) => a.id === "plate"));
  assert.equal(unit(s, enemy.id).resources, 4);
});

test("Nightmare: The City of Corsairs' lasting effects survive a reload, and invalid ones are rejected", () => {
  const s = setStage(board(), 3);
  s.nightmare = {
    cityBridge: { round: s.round, quest: `quest:${C.haven}`, canceled: 2 },
    citySword: s.round,
  };
  assert.ok(valid(s));
  assert.deepEqual(reload(s).nightmare, s.nightmare);
  for (const bad of [
    { cityBridge: { round: s.round + 1, quest: "q", canceled: 1 } },
    { cityBridge: { round: s.round, quest: "q", canceled: 0 } },
    { citySword: s.round + 1 },
  ]) {
    const t = structuredClone(s);
    t.nightmare = bad as GameState["nightmare"];
    assert.ok(!valid(t), JSON.stringify(bad));
  }
  const t = structuredClone(s);
  const enemy = engagedWith(t, C.raider);
  const c = combat(t, enemy);
  c.ncoFury = true;
  c.ncoAlarm = 2;
  assert.ok(valid(t));
  assert.equal(reload(t).combat!.ncoAlarm, 2);
  (c as unknown as { ncoAlarm: unknown }).ncoAlarm = -1;
  assert.ok(!valid(t));
  assert.ok(get(t, enemy.id));
});

test("Nightmare: The City of Corsairs Nightmare games keep valid saves to their end", () => {
  for (const players of [1, 2])
    for (const seed of [3, 7, 11]) {
      const s = autoplay(start(players, seed), 3000);
      assert.ok(valid(s), `${players} players, seed ${seed}`);
    }
});

test("Nightmare: The City of Corsairs' Nightmare engagements still use the scenario's rules", () => {
  // Boarding 2 on Patrol Ship reveals Corsairs from the Corsair deck as it
  // engages from the staging area.
  let s = board();
  const ship = add(s, N.patrolShip);
  const corsairs = s.city!.corsairDeck.length;
  engage(s, ship);
  s = finish(s);
  assert.equal(
    s.city!.corsairDeck.length + s.city!.corsairDiscard.length,
    corsairs - 2,
  );
  assert.ok(allEngaged(s).filter((u) => u.code !== N.patrolShip).length >= 2);
});
