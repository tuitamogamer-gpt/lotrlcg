import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, canTravel, publicState } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, make, stats, threatOf } from "../src/game/core";
import { addVictoryCard, check, progressLocation } from "../src/game/board";
import { flush } from "../src/game/effects";
import {
  availableAbilities,
  optionalEngagementProblem,
} from "../src/game/actions";
import { forOwner, seatView } from "../src/game/table";
import { CORE_REPRINTS, coreReprint } from "../src/game/core-reprints";
import {
  OATH,
  OATH_HOOKS,
  OATH_RECIPES,
  oathPublicState,
  oathRecipe,
} from "../src/game/the-oath";
import { OATH_ADVENTURES } from "../src/game/the-oath-scenario-data";
import {
  activate,
  allies,
  atStage,
  base,
  choose,
  deck,
  engaged,
  hand,
  reload,
  settle,
  stage,
  start,
} from "./the-oath-fixtures";
import type { GameState, ScenarioId, Unit } from "../src/game/types";

const H = OATH_HOOKS;
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
const run = (s: GameState, ...effects: ReturnType<typeof fx>[]) => {
  s.queue.push(...effects);
  flush(s);
  return s;
};
/** Check the quest stage after progress was placed. */
const advance = (s: GameState) => {
  check(s);
  flush(s);
  return s;
};
const count = (codes: string[], code: string) =>
  codes.filter((c) => c === code).length;
const threats = (s: GameState) =>
  (s.table?.seats ?? [{ threat: s.threat }]).map((x) => x.threat);
const GUARD = "01013",
  SNOWBOURN = "01039",
  STEWARD = "01026";

test("Setup: both editions and their easy modes build the printed encounter decks; The Eaves of Mirkwood is staged and Goblin Troop set aside", () => {
  const sizes: [ScenarioId, boolean, string, number][] = [
    ["the-oath-2018", false, "Q00.01A", 27],
    ["the-oath-2018", true, "Q00.01A-easy", 19],
    ["the-oath", false, "Q00.01B", 31],
    ["the-oath", true, "E00.01B", 23],
  ];
  for (const [scenarioId, easy, id, size] of sizes) {
    const recipe = oathRecipe(scenarioId, easy);
    assert.equal(recipe.id, id);
    const s = start(1, easy, scenarioId);
    const q = s.oath!;
    assert.equal(q.edition, scenarioId === "the-oath" ? "2022" : "2018");
    assert.equal(q.currentQuest, OATH.raid);
    assert.equal(q.troopAside, true);
    assert.equal(s.stage, 1);
    // No encounter card is revealed during setup.
    const deckCards = [
      ...s.encounterDeck,
      ...s.encounterDiscard,
      ...s.staging.slice(1).map((u) => u.code),
      ...seatView(s, 0).engaged.map((u) => u.code),
    ];
    assert.equal(deckCards.length, size, `${id}: ${size} encounter cards`);
    assert.equal(s.staging[0].code, OATH.eaves);
    assert.ok(!deckCards.includes(OATH.troop), "Goblin Troop is set aside");
    // The 2022 additions only appear in The Dark of Mirkwood's version.
    const additions = [OATH.wargs, OATH.arrows, OATH.camp];
    assert.equal(
      additions.some((c) => deckCards.includes(c)),
      scenarioId === "the-oath",
    );
    // Easy mode removes Goblin Runners, Goblins are Upon You!, Spiders of
    // Mirkwood, Tangled Grove and Caught in a Web.
    for (const c of [OATH.runners, OATH.upon, OATH.spiders, OATH.grove])
      assert.equal(deckCards.includes(c), !easy, `${id}: ${card(c).name}`);
    reload(s);
  }
  for (const players of [2, 3, 4]) {
    const s = start(players);
    assert.equal(s.staging.filter((u) => u.code === OATH.eaves).length, 1);
    assert.equal(s.oath!.troopAside, true);
    reload(s);
  }
  // Both adventures list the same three quest stages.
  assert.deepEqual(
    OATH_ADVENTURES.map((a) => [a.id, a.stages.map((x) => x.quest)]),
    [
      ["the-oath-2018", [9, 12, 6]],
      ["the-oath", [9, 12, 6]],
    ],
  );
  assert.equal(OATH_RECIPES.length, 3);
});

test("1B → 2A: each player searches the encounter deck and discard pile for a Forest location; then the deck is shuffled", () => {
  let s = base(2);
  s.encounterDeck = [OATH.grove, OATH.sniper, OATH.gate, OATH.runners];
  s.encounterDiscard = [OATH.trail];
  s.progress = 9;
  advance(s);
  assert.equal(s.stage, 2);
  assert.equal(s.oath!.currentQuest, OATH.forest);
  assert.equal(s.progress, 0);
  assert.match(s.choice!.title, /^Mirkwood Forest · Add a Forest location/);
  // Only Forest locations are offered, from the deck and the discard pile.
  assert.deepEqual(s.choice!.options.map((o) => o.id).sort(), [
    "Forest Gate",
    "Goblin Trail",
    "Tangled Grove",
  ]);
  s = choose(s, "Goblin Trail");
  assert.match(s.choice!.title, /Add a Forest location/);
  s = choose(s, "Tangled Grove");
  assert.deepEqual(
    s.staging.map((u) => u.code),
    [OATH.trail, OATH.grove],
  );
  assert.deepEqual(s.encounterDiscard, []);
  assert.equal(s.encounterDeck.length, 3);
  assert.ok(s.log.some((l) => /encounter deck is shuffled/.test(l.text)));
  reload(s);
});

test("2B cannot be defeated until a Goblin Trail is in the victory display; 3A adds Goblin Troop and a Goblin enemy for each other player", () => {
  let s = base(2);
  atStage(s, 2);
  s.encounterDeck = [OATH.eaves, OATH.runners];
  s.encounterDiscard = [OATH.scavengers, OATH.grove];
  s.progress = 12;
  advance(s);
  assert.equal(s.stage, 2, "no Goblin Trail in the victory display");
  addVictoryCard(s, OATH.trail);
  assert.equal(s.victory, 3, "Goblin Trail is worth 3 victory points");
  advance(s);
  assert.equal(s.stage, 3);
  assert.equal(s.oath!.currentQuest, OATH.rearguard);
  assert.equal(s.oath!.troopAside, false);
  assert.equal(s.staging[0].code, OATH.troop);
  // Only the second player searches; Goblin enemies from the deck or discard.
  assert.match(s.choice!.title, /^The Rearguard · Add a Goblin enemy/);
  assert.deepEqual(s.choice!.options.map((o) => o.id).sort(), [
    "Goblin Runners",
    "Goblintown Scavengers",
  ]);
  s = choose(s, "Goblintown Scavengers");
  assert.equal(s.choice, null);
  assert.deepEqual(
    s.staging.map((u) => u.code),
    [OATH.troop, OATH.scavengers],
  );
  assert.equal(oathPublicState(s)!.troop, "play");
  reload(s);
  // Solo: Goblin Troop alone.
  s = base();
  atStage(s, 2);
  s.oath!.troopAside = true;
  addVictoryCard(s, OATH.trail);
  s.progress = 12;
  advance(s);
  assert.equal(s.stage, 3);
  assert.deepEqual(
    s.staging.map((u) => u.code),
    [OATH.troop],
  );
  assert.equal(s.choice, null);
});

test("3B cannot be defeated while Goblin Troop is in play; once it has left play, defeating 3B wins the game", () => {
  const s = base();
  atStage(s, 3);
  s.progress = 6;
  const troop = stage(s, OATH.troop);
  advance(s);
  assert.equal(s.status, "playing", "Goblin Troop is in the staging area");
  s.staging = [];
  forOwner(s, 0, () => s.engaged.push(troop));
  advance(s);
  assert.equal(s.status, "playing", "Goblin Troop is engaged");
  assert.equal(oathPublicState(s)!.troop, "play");
  forOwner(s, 0, () => (s.engaged = []));
  // While Goblin Troop is still set aside, 3B cannot be defeated either.
  s.oath!.troopAside = true;
  advance(s);
  assert.equal(s.status, "playing");
  s.oath!.troopAside = false;
  assert.equal(oathPublicState(s)!.troop, "gone");
  advance(s);
  assert.equal(s.status, "won");
  assert.match(s.reason!, /The Rearguard is defeated/);
});

test("Goblin Trail: traveling there reveals the top encounter card; explored, it goes to the victory display and places 6 progress, which can defeat 2B", () => {
  let s = base();
  atStage(s, 2);
  s.progress = 6;
  const trail = stage(s, OATH.trail);
  s.encounterDeck = [OATH.greatSpider, OATH.eaves];
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: trail.id });
  s = settle(s);
  assert.equal(s.activeLocation?.code, OATH.trail);
  assert.ok(
    s.staging.some((u) => u.code === OATH.greatSpider),
    "the travel cost revealed Great Spider",
  );
  progressLocation(s, s.activeLocation!, 6);
  flush(s);
  s = settle(s);
  assert.deepEqual(s.victoryCards, [OATH.trail]);
  assert.equal(s.victory, 3);
  // 6 + 6 = 12: Mirkwood Forest is defeated and 3A begins.
  assert.equal(s.stage, 3);
  assert.equal(s.oath!.troopAside, false);
  reload(s);
});

test("Tangled Grove: X is the number of locations in the staging area; travel discards a random card from each player's hand", () => {
  let s = base(2);
  const grove = stage(s, OATH.grove);
  stage(s, OATH.gate);
  stage(s, OATH.sniper);
  assert.equal(threatOf(s, grove), 2);
  stage(s, OATH.den);
  assert.equal(threatOf(s, grove), 3);
  s.phase = "travel";
  hand(s, [GUARD, SNOWBOURN], 0);
  assert.match(canTravel(s, grove)!, /discard 1 random card/);
  hand(s, [STEWARD], 1);
  assert.equal(canTravel(s, grove), null);
  s = act(s, { type: "TRAVEL", id: grove.id });
  s = settle(s);
  assert.equal(s.activeLocation?.code, OATH.grove);
  assert.equal(seatView(s, 0).hand.length, 1);
  assert.equal(seatView(s, 0).discard.length, 1);
  assert.deepEqual(seatView(s, 1).hand, []);
  assert.deepEqual(seatView(s, 1).discard, [STEWARD]);
  reload(s);
});

test("Forest Gate and Abandoned Camp: the first player draws 2; the Camp's travel discards an encounter card and its Response may bring an ally into play", () => {
  let s = base(2);
  const gate = stage(s, OATH.gate);
  deck(s, [GUARD, SNOWBOURN, STEWARD], 0);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: gate.id });
  s = settle(s);
  assert.equal(seatView(s, 0).hand.length, 2, "the first player draws 2");
  assert.equal(seatView(s, 1).hand.length, 0);
  // Abandoned Camp: the discarded enemy is added to the staging area.
  s = base(2);
  const camp = stage(s, OATH.camp);
  s.encounterDeck = [OATH.runners, OATH.eaves];
  deck(s, [GUARD, STEWARD], 0);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: camp.id });
  assert.match(s.choice!.title, /^Abandoned Camp · Discard the top card/);
  s = choose(s, "use");
  s = settle(s);
  assert.equal(s.activeLocation?.code, OATH.camp);
  assert.ok(s.staging.some((u) => u.code === OATH.runners));
  assert.deepEqual(
    seatView(s, 0).allies.map((u) => u.code),
    [GUARD],
    "the first player's discarded ally enters play",
  );
  assert.deepEqual(seatView(s, 0).deck, [STEWARD]);
  // A non-enemy is discarded; a non-ally stays in the discard pile.
  s = base();
  const camp2 = stage(s, OATH.camp);
  s.encounterDeck = [OATH.gate, OATH.eaves];
  deck(s, [STEWARD, GUARD], 0);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: camp2.id });
  s = choose(s, "use");
  s = settle(s);
  assert.deepEqual(s.encounterDiscard, [OATH.gate]);
  assert.deepEqual(seatView(s, 0).discard, [STEWARD]);
  assert.deepEqual(seatView(s, 0).allies, []);
  reload(s);
});

test("Spider Den: any player's Quest Action puts a Spider enemy into play engaged with him and discards Spider Den", () => {
  let s = base(2);
  const den = stage(s, OATH.den);
  s.encounterDeck = [OATH.greatSpider, OATH.eaves];
  s.encounterDiscard = [OATH.spiders];
  assert.match(
    H.abilityProblem!(s, den)!,
    /Quest Action/,
    "only during the quest phase",
  );
  s.phase = "quest";
  assert.equal(H.abilityProblem!(s, den), null);
  assert.ok(availableAbilities(s, den).some((o) => !o.disabled));
  s = act(s, { type: "ABILITY", id: den.id });
  assert.deepEqual(s.choice!.options.map((o) => o.id).sort(), [
    "Great Spider",
    "Spiders of Mirkwood",
  ]);
  s = choose(s, "Spiders of Mirkwood");
  s = settle(s);
  assert.deepEqual(
    seatView(s, 0).engaged.map((u) => u.code),
    [OATH.spiders],
  );
  assert.ok(!s.staging.some((u) => u.code === OATH.den));
  assert.deepEqual(s.encounterDiscard, [OATH.den]);
  // With no Spider left, the ability cannot be used.
  const den2 = stage(s, OATH.den);
  s.encounterDeck = [OATH.eaves];
  assert.match(H.abilityProblem!(s, den2)!, /no Spider enemy/);
  reload(s);
});

test("The Eaves of Mirkwood: while it is active, encounter card effects cannot be canceled; Goblins are Upon You! never can", () => {
  const s = base();
  assert.equal(H.cannotCancel!(s, false, OATH.speed), false);
  assert.equal(H.cannotCancel!(s, false, OATH.upon), true);
  const eaves = activate(s, OATH.eaves);
  assert.equal(H.cannotCancel!(s, false, OATH.speed), true);
  assert.equal(H.cannotCancel!(s, true, OATH.spiders), true);
  assert.equal(oathPublicState(s)!.eaves, true);
  eaves.blanked = true;
  assert.equal(H.cannotCancel!(s, false, OATH.speed), false);
});

test("Surprising Speed: each player returns an engaged enemy to the staging area; if none returns, it gains surge and doomed 1", () => {
  let s = base(2);
  const spider = engaged(s, OATH.greatSpider, 0);
  s.encounterDeck = [OATH.speed, OATH.eaves, OATH.eaves];
  run(s, fx("reveal", { player: 0 }));
  s = settle(s);
  assert.match(
    s.log.map((l) => l.text).join("\n"),
    /Surprising Speed: Great Spider returns to the staging area/,
  );
  assert.ok(s.staging.some((u) => u.id === spider.id));
  assert.deepEqual(seatView(s, 0).engaged, []);
  assert.equal(s.encounterDeck.length, 2, "no surge");
  assert.deepEqual(threats(s), [20, 20], "no doomed");
  assert.deepEqual(s.encounterDiscard, [OATH.speed]);
  // No enemy is returned: surge and doomed 1.
  s = base(2);
  s.encounterDeck = [OATH.speed, OATH.gate, OATH.eaves];
  run(s, fx("reveal", { player: 0 }));
  s = settle(s);
  assert.deepEqual(threats(s), [21, 21]);
  assert.ok(
    s.staging.some((u) => u.code === OATH.gate),
    "surge",
  );
  reload(s);
});

test("Goblins are Upon You!: each player puts a Goblin enemy from the deck or discard pile into play engaged with him; then the deck is shuffled", () => {
  let s = base(2);
  s.encounterDeck = [OATH.upon, OATH.eaves, OATH.runners, OATH.spiders];
  s.encounterDiscard = [OATH.scavengers];
  run(s, fx("reveal", { player: 0 }));
  assert.match(s.choice!.title, /^Goblins are Upon You! · Put a Goblin enemy/);
  assert.deepEqual(s.choice!.options.map((o) => o.id).sort(), [
    "Goblin Runners",
    "Goblintown Scavengers",
  ]);
  s = choose(s, "Goblintown Scavengers");
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["Goblin Runners"],
  );
  s = choose(s, "Goblin Runners");
  s = settle(s);
  assert.deepEqual(
    seatView(s, 0).engaged.map((u) => u.code),
    [OATH.scavengers],
  );
  assert.deepEqual(
    seatView(s, 1).engaged.map((u) => u.code),
    [OATH.runners],
  );
  // Put into play, Goblin Runners is not revealed: no surge.
  assert.equal(s.encounterDeck.length, 2);
  assert.deepEqual(s.encounterDiscard, [OATH.upon]);
  reload(s);
});

test("Eyes in the Dark: doomed 1, then each player raises his threat for his questing characters or discards one of them", () => {
  let s = base(2);
  const [guard] = allies(s, [GUARD], 0);
  forOwner(s, 0, () => {
    for (const u of [s.heroes[0], s.heroes[1], guard]) u.committed = true;
  });
  forOwner(s, 1, () => (s.heroes[0].committed = true));
  s.encounterDeck = [OATH.eyes, OATH.eaves];
  run(s, fx("reveal", { player: 0 }));
  assert.deepEqual(threats(s), [21, 21], "doomed 1");
  assert.match(s.choice!.title, /^Eyes in the Dark · Choose/);
  assert.equal(s.choice!.options.length, 4, "raise threat or discard 1 of 3");
  s = choose(s, guard.id);
  assert.match(s.choice!.title, /^Eyes in the Dark · Choose/);
  s = choose(s, "threat");
  s = settle(s);
  assert.equal(get(s, guard.id), undefined, "Guard of the Citadel discarded");
  assert.deepEqual(threats(s), [21, 22]);
  reload(s);
});

test("Obsidian Arrows deals 2 damage; Goblintown Scavengers adds the printed cost of each player's discarded top card to its threat for the phase", () => {
  let s = base();
  s.encounterDeck = [OATH.arrows, OATH.eaves];
  run(s, fx("reveal", { player: 0 }));
  const aragorn = s.heroes[0];
  assert.match(s.choice!.title, /^Obsidian Arrows · Deal 2 damage/);
  s = choose(s, aragorn.id);
  s = settle(s);
  assert.equal(get(s, aragorn.id)!.damage, 2);
  // Scavengers: Guard of the Citadel (2) and Steward of Gondor (2).
  s = base(2);
  s.phase = "quest";
  deck(s, [GUARD, SNOWBOURN], 0);
  deck(s, [STEWARD], 1);
  s.encounterDeck = [OATH.scavengers, OATH.eaves];
  run(s, fx("reveal", { player: 0 }));
  s = settle(s);
  const scavengers = s.staging.find((u) => u.code === OATH.scavengers)!;
  assert.equal(
    threatOf(s, scavengers),
    1 + Number(card(GUARD).cost) + Number(card(STEWARD).cost),
  );
  assert.deepEqual(seatView(s, 0).discard, [GUARD]);
  assert.deepEqual(seatView(s, 1).discard, [STEWARD]);
  reload(s);
});

test("Enemies: Spiders of Mirkwood counts exhausted characters, Goblin Troop strengthens Goblins and takes no attachments, Great Spider and Wild Wargs engage with Forced effects", () => {
  let s = base();
  const spiders = engaged(s, OATH.spiders);
  assert.equal(stats(s, spiders).attack, 2);
  s.heroes[0].exhausted = true;
  s.heroes[1].exhausted = true;
  assert.equal(stats(s, spiders).attack, 4);
  // In the staging area it is not engaged with anyone.
  const staged = stage(s, OATH.spiders);
  assert.equal(stats(s, staged).attack, 2);
  // Goblin Troop: other Goblin enemies engaged with the same player.
  s = base(2);
  const runners = engaged(s, OATH.runners, 0);
  const sniper = engaged(s, OATH.sniper, 1);
  const spider = engaged(s, OATH.greatSpider, 0);
  const troop = engaged(s, OATH.troop, 0);
  assert.deepEqual(
    [stats(s, runners).attack, stats(s, runners).defense],
    [4, 2],
  );
  assert.deepEqual(
    [stats(s, sniper).attack, stats(s, sniper).defense],
    [2, 0],
    "engaged with the other player",
  );
  assert.equal(stats(s, spider).attack, 3, "not a Goblin");
  assert.equal(stats(s, troop).attack, 5, "not another Goblin");
  assert.equal(H.cannotAttach!(s, troop), true);
  assert.equal(H.cannotAttach!(s, runners), false);
  // Great Spider: exhaust a character when it engages.
  s = base();
  s.phase = "encounter";
  const great = stage(s, OATH.greatSpider);
  s = act(s, { type: "ENGAGE", id: great.id });
  assert.match(s.choice!.title, /^Great Spider · Exhaust a character/);
  const theodred = s.heroes[1];
  s = choose(s, theodred.id);
  assert.equal(get(s, theodred.id)!.exhausted, true);
  // Wild Wargs: a discarded Goblin enemy engages; anything else is discarded.
  s = base();
  s.phase = "encounter";
  let wargs = stage(s, OATH.wargs);
  s.encounterDeck = [OATH.sniper, OATH.eaves];
  s = act(s, { type: "ENGAGE", id: wargs.id });
  s = settle(s);
  assert.deepEqual(
    seatView(s, 0)
      .engaged.map((u) => u.code)
      .sort(),
    [OATH.sniper, OATH.wargs].sort(),
  );
  s = base();
  s.phase = "encounter";
  wargs = stage(s, OATH.wargs);
  s.encounterDeck = [OATH.spiders, OATH.eaves];
  s = act(s, { type: "ENGAGE", id: wargs.id });
  s = settle(s);
  assert.deepEqual(
    s.encounterDiscard,
    [OATH.spiders],
    "a Spider is not a Goblin",
  );
  reload(s);
});

test("Shadow effects: Spiders, Great Spider, Goblin Troop, Goblin Runners, Goblins are Upon You!, Eyes in the Dark, Surprising Speed and Obsidian Arrows", () => {
  const defend = (s: GameState, enemy: Unit, defender?: Unit) =>
    act(s, {
      type: "DEFEND",
      enemyId: enemy.id,
      defenderId: defender?.id ?? null,
    });
  // Spiders of Mirkwood's shadow, undefended: exhaust and 2 damage.
  let s = base();
  let enemy = engaged(s, OATH.scavengers);
  enemy.shadows = [OATH.spiders];
  s.phase = "defense";
  s = defend(s, enemy);
  assert.match(s.choice!.title, /^Spiders of Mirkwood · Exhaust/);
  const gloin = s.heroes[2];
  s = choose(s, gloin.id);
  s = settle(s, s.heroes[0].id);
  assert.equal(get(s, gloin.id)!.exhausted, true);
  assert.equal(get(s, gloin.id)!.damage, 2);
  // Goblin Troop's shadow: +2 attack. Scavengers 1 + 2 − Aragorn's 2 = 1.
  s = base();
  enemy = engaged(s, OATH.scavengers);
  enemy.shadows = [OATH.troop];
  s.phase = "defense";
  const aragorn = s.heroes[0];
  s = defend(s, enemy, aragorn);
  s = settle(s);
  assert.equal(get(s, aragorn.id)!.damage, 1);
  // Goblins are Upon You!: +1 per Goblin engaged (Scavengers and Runners).
  s = base();
  enemy = engaged(s, OATH.scavengers);
  engaged(s, OATH.runners);
  enemy.shadows = [OATH.upon];
  s.phase = "defense";
  s = defend(s, enemy, s.heroes[0]);
  s = settle(s);
  assert.equal(get(s, s.heroes[0].id)!.damage, 1);
  // Goblin Runners: an additional attack.
  s = base();
  enemy = engaged(s, OATH.scavengers);
  enemy.shadows = [OATH.runners];
  s.phase = "defense";
  s = defend(s, enemy, s.heroes[0]);
  s = settle(s);
  assert.ok(
    s.log.filter((l) => /Goblintown Scavengers attacks/.test(l.text)).length >=
      2,
    "two attacks",
  );
  // Eyes in the Dark, undefended: discard an ally.
  s = base();
  const [guard] = allies(s, [GUARD]);
  enemy = engaged(s, OATH.scavengers);
  enemy.shadows = [OATH.eyes];
  s.phase = "defense";
  s = defend(s, enemy);
  s = settle(s, guard.id);
  assert.equal(get(s, guard.id), undefined);
  // Surprising Speed: +1 attack, then the enemy returns to the staging area.
  s = base();
  enemy = engaged(s, OATH.scavengers);
  enemy.shadows = [OATH.speed];
  s.phase = "defense";
  s = defend(s, enemy, s.heroes[0]);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === enemy.id));
  assert.equal(get(s, s.heroes[0].id)!.damage, 0, "1 + 1 − 2");
  // Great Spider's shadow and Obsidian Arrows' shadow: damage.
  s = base();
  enemy = engaged(s, OATH.scavengers);
  enemy.shadows = [OATH.greatSpider];
  s.heroes[1].exhausted = true;
  s.phase = "defense";
  s = defend(s, enemy, s.heroes[0]);
  assert.match(s.choice!.title, /^Great Spider · Deal 1 damage/);
  assert.equal(s.choice!.options.length, 2, "Théodred and the defender");
  s = settle(s, s.heroes[1].id);
  assert.equal(get(s, s.heroes[1].id)!.damage, 1);
  s = base();
  enemy = engaged(s, OATH.scavengers);
  enemy.shadows = [OATH.arrows];
  s.phase = "defense";
  s = defend(s, enemy, s.heroes[0]);
  s = settle(s, s.heroes[2].id);
  assert.equal(get(s, s.heroes[2].id)!.damage, 1);
  reload(s);
});

test("Core Set reprints keep their own cards and follow the Core Set rules: Caught in a Web, Goblin Sniper, Driven by Shadow and Forest Gate", () => {
  assert.deepEqual(Object.values(CORE_REPRINTS).sort(), [
    "01080",
    "01083",
    "01092",
    "01100",
  ]);
  for (const [code, core] of Object.entries(CORE_REPRINTS)) {
    assert.equal(coreReprint(code), core);
    assert.equal(card(code).name, card(core).name);
    assert.notEqual(card(code).imagesrc, card(core).imagesrc);
  }
  // Caught in a Web: the player with the highest threat; 2 resources to ready.
  let s = base(2);
  forOwner(s, 1, () => (s.threat = 30));
  s.encounterDeck = [OATH.web, OATH.eaves];
  run(s, fx("reveal", { player: 0 }));
  s = settle(s);
  const webbed = seatView(s, 1).heroes.find((h) =>
    h.attachments.some((a) => a.code === OATH.web),
  );
  assert.ok(webbed, "attached to one of the second player's heroes");
  webbed!.exhausted = true;
  webbed!.resources = 2;
  run(s, fx("refreshReady"));
  assert.match(s.choice!.title, /^Free .* from the web\?/);
  s = choose(s, "pay");
  assert.equal(get(s, webbed!.id)!.exhausted, false);
  assert.equal(get(s, webbed!.id)!.resources, 0);
  // Goblin Sniper: no optional engagement while another enemy is staged;
  // in the staging area at the end of combat, each player deals 1 damage.
  s = base(2);
  s.phase = "encounter";
  const sniper = stage(s, OATH.sniper);
  stage(s, OATH.scavengers);
  assert.ok(optionalEngagementProblem(s, sniper));
  s.staging = [sniper];
  assert.equal(optionalEngagementProblem(s, sniper), null);
  s.phase = "attack";
  run(s, fx("endCombat"));
  assert.match(s.choice!.title, /damage/i);
  s = settle(s);
  assert.equal(
    seatView(s, 0).heroes.reduce((n, h) => n + h.damage, 0),
    1,
  );
  assert.equal(
    seatView(s, 1).heroes.reduce((n, h) => n + h.damage, 0),
    1,
  );
  // Driven by Shadow: +1 threat to each staged enemy and location; surge if empty.
  s = base();
  const scavengers = stage(s, OATH.scavengers);
  s.encounterDeck = [OATH.driven, OATH.eaves];
  run(s, fx("reveal", { player: 0 }));
  s = settle(s);
  assert.equal(
    threatOf(
      s,
      s.staging.find((u) => u.id === scavengers.id)!,
    ),
    2,
  );
  s = base();
  s.encounterDeck = [OATH.driven, OATH.gate, OATH.eaves];
  run(s, fx("reveal", { player: 0 }));
  s = settle(s);
  assert.ok(
    s.staging.some((u) => u.code === OATH.gate),
    "surge",
  );
  void make;
  reload(s);
});

test("Saves, both editions and the scenario panel", () => {
  for (const scenarioId of ["the-oath-2018", "the-oath"] as const) {
    const s = base(2, scenarioId);
    atStage(s, 2);
    addVictoryCard(s, OATH.trail);
    activate(s, OATH.eaves);
    const restored = reload(s);
    assert.deepEqual(restored.oath, s.oath);
    const view = oathPublicState(restored)!;
    assert.equal(view.stage, 2);
    assert.equal(view.edition, scenarioId === "the-oath" ? "2022" : "2018");
    assert.equal(view.trails, 1);
    assert.equal(view.troop, "aside");
    assert.equal(view.eaves, true);
    assert.deepEqual(publicState(restored).oath, view);
  }
  // A save claiming the wrong edition for its scenario is rejected.
  const s = base(1, "the-oath");
  s.oath!.edition = "2018";
  const raw = JSON.parse(JSON.stringify(s));
  assert.throws(() => reload(raw));
  void count;
});
