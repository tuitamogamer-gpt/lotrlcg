import test from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, stagingThreat, stats } from "../src/game/core";
import { damage, destroy, exhaustCharacter } from "../src/game/board";
import { flush } from "../src/game/effects";
import { forOwner, seatView } from "../src/game/table";
import { effectiveTraits } from "../src/game/expansion-passives";
import {
  HUNT_DREADNAUGHT_HOOKS,
  HD,
  HD_CORSAIR_DECK,
} from "../src/game/hunt-dreadnaught";
import {
  activate,
  allies,
  base,
  choose,
  deck,
  engaged,
  heroesOf,
  reload,
  settle,
  shipOf,
  stage,
  stageTwo,
} from "./hunt-dreadnaught-fixtures";
import type { GameState, Unit } from "../src/game/types";

const H = HUNT_DREADNAUGHT_HOOKS;
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
const run = (s: GameState, ...effects: ReturnType<typeof fx>[]) => {
  s.queue.push(...effects);
  flush(s);
  return s;
};
/** Reveal the given encounter cards from the top of the deck, one after another. */
const reveal = (s: GameState, ...codes: string[]) => {
  s.encounterDeck = [...codes, ...s.encounterDeck.slice(codes.length)];
  return run(s, fx("reveal"));
};
const defend = (s: GameState, enemy: Unit, defender?: Unit) => {
  s.phase = "defense";
  return act(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender?.id ?? null,
  });
};
const logged = (s: GameState, pattern: RegExp) =>
  s.log.some((l) => pattern.test(l.text));
const engagedCodes = (s: GameState, p = 0) =>
  seatView(s, p).engaged.map((u) => u.code);
const corsairs = (codes: string[]) =>
  codes.filter((c) => HD_CORSAIR_DECK.includes(c));
const ALLY = "01016"; // Snowbourn Scout (1 willpower)
const SPEARMAN = "01029"; // Gondorian Spearman
const TOOK = "01043"; // Wandering Took (1 willpower)

test("Boarding X: after a Ship enemy engages a player from the staging area, the top X cards of the Corsair deck are put into play engaged with that player (not when it is put into play engaged); Cobas Haven reduces Boarding by 1 while active; the Corsair discard pile is shuffled back when the Corsair deck runs out; a destroyed non-Ship Corsair goes to the Corsair discard pile", () => {
  let s = base(1);
  const sails = stage(s, HD.blackSails);
  const top = s.huntDreadnaught!.corsairDeck.slice(0, 2);
  s = run(s, fx("engage", { target: sails.id, player: 0 }));
  s = settle(s);
  assert.deepEqual(corsairs(engagedCodes(s)), top, "Boarding 2");
  assert.equal(s.huntDreadnaught!.corsairDeck.length, 11);
  assert.ok(logged(s, /Black Sails · Boarding 2/));
  // Cobas Haven, active: Corsair Warship's Boarding 3 becomes 2.
  s = base(1);
  activate(s, HD.cobas);
  const warship = stage(s, HD.corsairWarship);
  s = settle(run(s, fx("engage", { target: warship.id, player: 0 })));
  assert.equal(corsairs(engagedCodes(s)).length, 2);
  // Put into play engaged (not from the staging area): no Boarding.
  s = base(1);
  const galley = engaged(s, HD.galley);
  H.engaged!(s, galley, false, false);
  flush(s);
  assert.equal(corsairs(engagedCodes(s)).length, 0);
  // The Corsair discard pile is shuffled back as soon as the deck runs out.
  s = base(1);
  const q = s.huntDreadnaught!;
  q.corsairDeck = [HD.brash];
  q.corsairDiscard = [HD.sailor, HD.sailor];
  const sails2 = stage(s, HD.blackSails);
  s = settle(run(s, fx("engage", { target: sails2.id, player: 0 })));
  assert.deepEqual(
    corsairs(engagedCodes(s)).sort(),
    [HD.brash, HD.sailor].sort(),
  );
  assert.deepEqual(s.huntDreadnaught!.corsairDeck, [HD.sailor]);
  assert.deepEqual(s.huntDreadnaught!.corsairDiscard, []);
  // A destroyed Corsair enemy goes to the Corsair discard pile.
  const brash = s.engaged.find((u) => u.code === HD.brash)!;
  destroy(s, brash);
  assert.deepEqual(s.huntDreadnaught!.corsairDiscard, [HD.brash]);
  assert.ok(!s.encounterDiscard.includes(HD.brash));
});

test("Pillage X: after its attack the player discards the top X cards of their deck; Corsair Plunderer (an attachment), Daring Buccaneer (1 damage) and Fierce Marauder (1 resource) for each event discarded; Belfalas Shipyard's shadow gives +1 attack and Pillage 3", () => {
  let s = base(1);
  const plunderer = engaged(s, HD.plunderer);
  deck(s, ["01050", "01016", "01050", "01016"]); // A Test of Will (event), Snowbourn Scout
  s = defend(s, plunderer, s.heroes[0]);
  s = settle(s);
  assert.equal(s.deck.length, 2, "Pillage 2");
  assert.deepEqual(s.discard, ["01050", "01016"]);
  // Fierce Marauder: Pillage 3, and a resource for each discarded event.
  s = base(1);
  const marauder = engaged(s, HD.marauder);
  deck(s, ["01050", "01048", "01016"]);
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = settle(defend(s, marauder, s.heroes[0]));
  assert.equal(s.deck.length, 0);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 2,
    "2 events: 2 resources discarded",
  );
  // Daring Buccaneer: 1 damage for each event.
  s = base(1);
  const buccaneer = engaged(s, HD.buccaneer);
  deck(s, ["01050", "01016", "01016"]);
  s = settle(defend(s, buccaneer, s.heroes[0]));
  assert.ok(
    [...s.heroes, ...s.allies].some((u) => u.damage > 0),
    "1 damage to a character you control",
  );
  // Belfalas Shipyard's shadow: +1 attack and Pillage 3 on a Southron Sailor.
  s = base(1);
  const sailor = engaged(s, HD.sailor);
  sailor.shadows = [HD.shipyard];
  deck(s, ["01016", "01016", "01016", "01016"]);
  s = settle(defend(s, sailor, s.heroes[0]));
  assert.equal(s.deck.length, 1, "Pillage 3 from the shadow");
  assert.ok(logged(s, /Southron Sailor attacks for 3 /), "2 + 1 attack");
});

test("The unique Corsairs: Captain of the Haven (Pillage 8; its player is eliminated at the end of the combat phase with no deck), Commander of the Dreadnaught (the Dreadnaught attacks after it), Descendant of Castamir (2 Corsairs engaged with a shadow card each), Hydraken (an additional attack with 2 shadow cards and 4 threat, once per round), Ophidian (1 attacker each round; 2 damage to each defender) and Varjax (Archery 3; excess damage goes to the defender's Ships)", () => {
  // Captain of the Haven.
  let s = base(2);
  engaged(s, HD.captain, 1);
  forOwner(s, 1, () => (s.deck = []));
  H.combatEnd!(s);
  s.phase = "attack";
  run(s, fx("phaseEnd"));
  assert.ok(s.huntDreadnaught!.eliminated.includes(1));
  assert.ok(s.table!.seats[1].eliminated);
  // Commander of the Dreadnaught.
  s = base(1);
  const dread = stageTwo(s);
  const commander = engaged(s, HD.commander);
  const effects = H.attackFinished!(s, {
    enemyId: commander.id,
    attackPlayer: 0,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
    damageDealt: 0,
  } as never);
  assert.ok(effects.some((e) => e.kind === "hdcCommander"));
  s.phase = "defense";
  s = run(s, ...effects);
  assert.equal(s.combat?.enemyId, dread.id, "the Dreadnaught attacks");
  // Descendant of Castamir.
  s = base(1);
  const descendant = stage(s, HD.descendant);
  s = settle(run(s, fx("engage", { target: descendant.id, player: 0 })));
  const boarded = s.engaged.filter((u) => HD_CORSAIR_DECK.includes(u.code));
  assert.equal(boarded.length, 2);
  assert.ok(boarded.every((u) => u.shadows.length === 1));
  // Hydraken.
  s = base(1);
  const hydraken = engaged(s, HD.hydraken);
  const threat = s.threat;
  s.phase = "defense";
  s = run(
    s,
    ...H.attackFinished!(s, {
      enemyId: hydraken.id,
      attackPlayer: 0,
      defenderId: null,
      defenderIds: [],
      attackBonus: 0,
      damageDealt: 0,
    } as never),
  );
  assert.equal(s.threat, threat + 4);
  assert.equal(s.combat?.enemyId, hydraken.id);
  assert.equal(get(s, hydraken.id)!.shadows.length, 2, "2 shadow cards");
  assert.equal(s.huntDreadnaught!.hydraken, s.round);
  assert.equal(
    H.attackFinished!(s, {
      enemyId: hydraken.id,
      attackPlayer: 0,
      defenderId: null,
      defenderIds: [],
      attackBonus: 0,
      damageDealt: 0,
    } as never).length,
    0,
    "limit once per round",
  );
  // Ophidian.
  s = base(1);
  const ophidian = engaged(s, HD.ophidian);
  assert.match(
    H.attackProblem!(s, ophidian, [s.heroes[0].id, s.heroes[1].id]) ?? "",
    /No more than 1 character/,
  );
  assert.equal(H.attackProblem!(s, ophidian, [s.heroes[0].id]), null);
  H.playerAttackDeclared!(s, ophidian, [s.heroes[0].id]);
  assert.ok(H.attackProblem!(s, ophidian, [s.heroes[1].id]));
  const hits = H.defendersDeclared!(s, ophidian, [s.heroes[0]]);
  assert.deepEqual(
    hits.map((e) => [e.kind, e.value]),
    [["damage", 2]],
  );
  // Varjax: Archery 3.
  s = base(1);
  engaged(s, HD.varjax);
  H.combatBegin!(s);
  assert.equal(s.queue.find((e) => e.kind === "heirsArchery")?.value, 3);
});

test("Brash Corsair attacks when its engaged player exhausts a ship; Southron Sailor makes each Ship enemy engaged with its player add its threat to the staging area; Umbar Captain stops attacks on Ship enemies", () => {
  let s = base(1);
  const brash = engaged(s, HD.brash);
  s.phase = "quest";
  exhaustCharacter(s, shipOf(s, 0));
  const attack = s.queue.find((e) => e.kind === "immediateAttack");
  assert.equal(attack?.target, brash.id);
  // Southron Sailor.
  s = base(1);
  engaged(s, HD.galley);
  const before = stagingThreat(s);
  engaged(s, HD.sailor);
  assert.equal(stagingThreat(s), before + 3);
  // Umbar Captain.
  s = base(1);
  const sails = engaged(s, HD.blackSails);
  engaged(s, HD.umbarCaptain);
  assert.ok(H.cannotAttack!(s, s.heroes[0], sails));
});

test("Ship enemies: Black Sails (no attachments, Archery 3 in the staging area; its shadow returns an engaged Ship enemy to the staging area), Corsair Skiff and War Galley (raise threat by 3 or 4, or it gains Boarding 1), Corsair Warship (no damage and Archery 4 in the staging area), Ramming Ship (+4 attack after it engages; its shadow puts a Corsair into play with a shadow card) and Slave Ship (its damage to a ship echoes to a non-Ship character)", () => {
  let s = base(1);
  const sails = stage(s, HD.blackSails);
  const warship = stage(s, HD.corsairWarship);
  const galley = engaged(s, HD.galley);
  H.combatBegin!(s);
  assert.equal(
    s.queue.find((e) => e.kind === "heirsArchery")?.value,
    3 + 4 + 2,
  );
  assert.ok(H.cannotAttach!(s, sails, "01039"));
  damage(s, warship.id, 3);
  assert.equal(warship.damage, 0, "no damage in the staging area");
  damage(s, galley.id, 3);
  assert.equal(galley.damage, 3);
  // Black Sails' shadow: the attacking Ship enemy returns to the staging area.
  s = base(1);
  const skiff = engaged(s, HD.skiff);
  skiff.shadows = [HD.blackSails];
  s = settle(defend(s, skiff, shipOf(s, 0)));
  assert.ok(s.staging.some((u) => u.id === skiff.id));
  assert.ok(!s.engaged.some((u) => u.id === skiff.id));
  // Corsair Skiff: raise threat by 3, or it gains Boarding 1.
  s = base(1);
  const skiff2 = stage(s, HD.skiff);
  s = run(s, fx("engage", { target: skiff2.id, player: 0 }));
  assert.match(
    s.choice!.title,
    /Raise your threat by 3 or it gains Boarding 1/,
  );
  s = choose(s, "boarding");
  s = settle(s);
  assert.equal(corsairs(engagedCodes(s)).length, 1, "Boarding 1");
  s = base(1);
  const galley2 = stage(s, HD.galley);
  s = run(s, fx("engage", { target: galley2.id, player: 0 }));
  s = choose(s, "threat");
  s = settle(s);
  assert.equal(s.threat, 24);
  assert.equal(corsairs(engagedCodes(s)).length, 1, "printed Boarding 1");
  // Ramming Ship: +4 attack after it engages.
  s = base(1);
  const ramming = stage(s, HD.ramming);
  s = settle(run(s, fx("engage", { target: ramming.id, player: 0 })));
  assert.equal(stats(s, get(s, ramming.id)!).attack, 4 + 4);
  s.round += 1;
  assert.equal(stats(s, get(s, ramming.id)!).attack, 4);
  // Ramming Ship's shadow.
  s = base(1);
  const sailor = engaged(s, HD.sailor);
  sailor.shadows = [HD.ramming];
  s = settle(defend(s, sailor, s.heroes[0]));
  const boarded = s.engaged.filter(
    (u) => u.id !== sailor.id && HD_CORSAIR_DECK.includes(u.code),
  );
  assert.equal(boarded.length, 1);
  // Slave Ship: as much damage to a non-Ship character of the defender.
  s = base(1);
  const slave = engaged(s, HD.slave);
  s = defend(s, slave, shipOf(s, 0));
  s = settle(s);
  const ship = shipOf(s, 0);
  assert.ok(ship.damage > 0);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.damage, 0),
    ship.damage,
    "the same damage to a non-Ship character",
  );
});

test("Corsair Skirmisher: destroyed as an enemy, its engaged player may discard allies with at least 3 willpower to take control of it as a ship-objective with willpower equal to its threat", () => {
  let s = base(1);
  const skirmisher = engaged(s, HD.skirmisher);
  const scouts = allies(s, [TOOK, TOOK, TOOK]);
  destroy(s, skirmisher);
  flush(s);
  assert.match(s.choice!.title, /^Corsair Skirmisher · Response/);
  s = choose(s, "capture");
  for (const scout of scouts) s = choose(s, scout.id);
  s = choose(s, "pay");
  s = settle(s);
  const captured = s.allies.find((u) => u.code === HD.skirmisher)!;
  assert.ok(captured?.cobasShipObjective);
  assert.equal(stats(s, captured).will, 3);
  assert.equal(s.allies.filter((u) => u.code === TOOK).length, 0);
  assert.deepEqual(s.discard.filter((c) => c === TOOK).length, 3);
  // Declined: it is discarded.
  s = base(1);
  const other = engaged(s, HD.skirmisher);
  destroy(s, other);
  flush(s);
  s = choose(s, "decline");
  assert.ok(s.encounterDiscard.includes(HD.skirmisher));
});

test("Sea Monster: ship-objectives may attack and defend against it; when revealed it deals 4 damage to the Ship enemy or Ship objective with the fewest remaining hit points", () => {
  let s = base(1);
  const sails = stage(s, HD.blackSails);
  damage(s, sails.id, 7);
  reveal(s, HD.seaMonster);
  s = settle(s);
  assert.ok(
    !s.staging.some((u) => u.id === sails.id),
    "Black Sails (3 hit points left) is destroyed",
  );
  s = base(1);
  const ship = shipOf(s, 0);
  ship.damage = 15;
  reveal(s, HD.seaMonster);
  s = settle(s);
  assert.ok(logged(s, /Sea Monster: 4 damage to Swan Ship of Dol Amroth/));
});

test("Locations: Cobas Haven reduces Boarding while active; Isle of Fortune enters play with 1 resource per player, loses one when a Ship enemy enters play and moves them to heroes when explored as the active location; Mouths of Anduin reveals a card after a 'when revealed' effect is canceled and, as a shadow, after an undefended attack; Tolfalas Landing raises the threat for player card draws and as a shadow; Wicked Cove makes staged locations immune to player card effects and, as a shadow, the attacker immune with +2 defense", () => {
  let s = base(2);
  reveal(s, HD.isle);
  s = settle(s);
  const isle = s.staging.find((u) => u.code === HD.isle)!;
  assert.equal(isle.resources, 2);
  reveal(s, HD.galley);
  s = settle(s);
  assert.equal(s.staging.find((u) => u.code === HD.isle)!.resources, 1);
  const active = s.staging.find((u) => u.code === HD.isle)!;
  s.staging = s.staging.filter((u) => u.id !== active.id);
  s.activeLocation = active;
  H.explored!(s, active, true);
  flush(s);
  s = settle(s);
  assert.equal(
    [...heroesOf(s, 0), ...heroesOf(s, 1)].reduce((n, h) => n + h.resources, 0),
    60 + 1,
  );
  // Mouths of Anduin.
  s = base(1);
  stage(s, HD.mouths);
  const deckBefore = s.encounterDeck.length;
  H.whenRevealedCancelled!(s, HD.mist);
  flush(s);
  assert.equal(s.encounterDeck.length, deckBefore - 1);
  s = base(1);
  const sailor = engaged(s, HD.sailor);
  sailor.shadows = [HD.mouths];
  const before = s.encounterDeck.length;
  s = settle(defend(s, sailor));
  assert.equal(s.encounterDeck.length, before - 1, "undefended: reveal");
  // Tolfalas Landing: a player card draw raises the threat.
  s = base(1);
  stage(s, HD.tolfalas);
  stage(s, HD.tolfalas);
  s.resolvingEvents = [
    {
      unit: { ...s.heroes[0], code: "01050" },
      destination: "discard",
    } as never,
  ];
  H.cardsDrawn!(s, 0, 2, true);
  s.resolvingEvents = [];
  flush(s);
  assert.equal(s.threat, 20 + 2 * 2);
  s = base(1);
  const sailor2 = engaged(s, HD.sailor);
  sailor2.shadows = [HD.tolfalas];
  s = settle(defend(s, sailor2, s.heroes[0]));
  assert.equal(s.threat, 21);
  // Wicked Cove.
  s = base(1);
  const cove = stage(s, HD.cove);
  const isle2 = stage(s, HD.isle);
  assert.ok(H.immune!(s, cove) && H.immune!(s, isle2));
  s = base(1);
  const sailor3 = engaged(s, HD.sailor);
  sailor3.shadows = [HD.cove];
  s = settle(defend(s, sailor3, s.heroes[0]));
  assert.ok(H.immune!(s, get(s, sailor3.id)!));
  assert.equal(stats(s, get(s, sailor3.id)!).defense, 1 + 2);
});

test("Treacheries: Ballista Barrage (Doomed 1; each Ship enemy gains Archery 2 this round; shadow damage), Boarding Party (each player a Corsair; shadow +1 or +2 attack), Grappled! (attached to a ship, which cannot ready; exhaust 3 characters to discard it; as a shadow it attaches to a defending ship) and Taking on Water (2 damage when the ship exhausts)", () => {
  let s = base(2);
  stage(s, HD.blackSails);
  reveal(s, HD.ballista);
  s = settle(s);
  assert.deepEqual(
    s.table!.seats.map((x) => x.threat),
    [21, 21],
    "Doomed 1",
  );
  H.combatBegin!(s);
  assert.equal(s.queue.find((e) => e.kind === "heirsArchery")?.value, 3 + 2);
  // Boarding Party.
  s = base(2);
  reveal(s, HD.boardingParty);
  s = settle(s);
  assert.equal(corsairs(engagedCodes(s, 0)).length, 1);
  assert.equal(corsairs(engagedCodes(s, 1)).length, 1);
  // Grappled!
  s = base(1);
  reveal(s, HD.grappled);
  s = settle(s);
  const ship = shipOf(s, 0);
  assert.ok(ship.attachments.some((a) => a.code === HD.grappled));
  ship.exhausted = true;
  assert.ok(H.cannotReady!(s, ship));
  // Grappled! as a shadow: attached to the defending ship.
  s = base(1);
  const skiff = engaged(s, HD.skiff);
  skiff.shadows = [HD.grappled];
  s = settle(defend(s, skiff, shipOf(s, 0)));
  assert.ok(shipOf(s, 0).attachments.some((a) => a.code === HD.grappled));
  assert.ok(!s.encounterDiscard.includes(HD.grappled));
  // Taking on Water: 2 damage when the attached ship exhausts.
  s = base(1);
  reveal(s, HD.water);
  s = settle(s);
  const wet = shipOf(s, 0);
  exhaustCharacter(s, wet);
  flush(s);
  assert.equal(wet.damage, 2);
});

test("Out of the Mist: the enemy with the highest engagement cost engages the first player and attacks; with no enemy in play it gains surge; its shadow raises your threat by 4 or the attacker makes an additional attack", () => {
  let s = base(2);
  const sailor = stage(s, HD.sailor);
  const warship = stage(s, HD.corsairWarship);
  reveal(s, HD.mist);
  assert.ok(seatView(s, 0).engaged.some((u) => u.id === warship.id));
  assert.equal(s.combat?.enemyId, warship.id, "it attacks the first player");
  assert.ok(s.staging.some((u) => u.id === sailor.id));
  // No enemy: surge.
  s = base(1);
  reveal(s, HD.mist, HD.cobas);
  s = settle(s);
  assert.ok(logged(s, /Out of the Mist: no attack is made, so it gains surge/));
  // Shadow.
  s = base(1);
  const sailor2 = engaged(s, HD.sailor);
  sailor2.shadows = [HD.mist];
  s = defend(s, sailor2, s.heroes[0]);
  s = settle(s, ["threat"]);
  assert.equal(s.threat, 24);
});

test("Overworked: until the end of the round each non-Ship ally's text box is blank (its Traits remain) and with 7 or more allies it gains surge; its shadow gives +1 attack (+3 with 7 or more allies)", () => {
  let s = base(1);
  const [spearman] = allies(s, [SPEARMAN]);
  reveal(s, HD.overworked);
  s = settle(s);
  const u = get(s, spearman.id)!;
  assert.ok(H.characterBlanked!(s, u));
  assert.ok(!H.characterBlanked!(s, shipOf(s, 0)));
  assert.ok(effectiveTraits(u).length > 0, "Traits remain");
  s = base(1);
  allies(s, Array(6).fill(ALLY));
  reveal(s, HD.overworked, HD.cobas);
  s = settle(s);
  assert.ok(logged(s, /7 or more allies, so it gains surge/));
  s = base(1);
  const sailor = engaged(s, HD.sailor);
  sailor.shadows = [HD.overworked];
  s = settle(defend(s, sailor, s.heroes[0]));
  assert.ok(logged(s, /Southron Sailor attacks for 3 /));
});

test("Violent Tempest: 1 damage to each enemy, and each player assigns 1 damage for each exhausted character they control; its shadow deals 1 damage to the defending character", () => {
  let s = base(1);
  const sails = stage(s, HD.blackSails);
  s.heroes[0].exhausted = true;
  s.heroes[1].exhausted = true;
  reveal(s, HD.tempest);
  s = settle(s);
  assert.equal(get(s, sails.id)!.damage, 1);
  assert.equal(
    [...s.heroes, ...s.allies].reduce((n, x) => n + x.damage, 0),
    2,
  );
  s = base(1);
  const sailor = engaged(s, HD.sailor);
  sailor.shadows = [HD.tempest];
  s = settle(defend(s, sailor, s.heroes[2]));
  assert.ok(s.heroes[2].damage >= 1);
});

test("Gondorian Warship: when revealed, the first player chooses a player who gains control of it; destroyed, it is set aside out of play; its shadow deals 5 damage to the attacking enemy", () => {
  let s = base(2);
  const aside = s.huntDreadnaught!.setAside.filter(
    (c) => c === HD.warship,
  ).length;
  reveal(s, HD.warship);
  assert.match(s.choice!.title, /^Gondorian Warship · Choose a player/);
  s = choose(s, "1");
  s = settle(s);
  let warship: Unit | undefined;
  forOwner(s, 1, () => (warship = s.allies.find((u) => u.code === HD.warship)));
  assert.ok(warship);
  forOwner(s, 1, () => destroy(s, warship!));
  flush(s);
  assert.equal(
    s.huntDreadnaught!.setAside.filter((c) => c === HD.warship).length,
    aside + 1,
  );
  assert.ok(!s.encounterDiscard.includes(HD.warship));
  s = base(1);
  const sails = engaged(s, HD.blackSails);
  sails.shadows = [HD.warship];
  s = settle(defend(s, sails, shipOf(s, 0)));
  assert.equal(get(s, sails.id)?.damage ?? 10, 5);
  void card;
});
