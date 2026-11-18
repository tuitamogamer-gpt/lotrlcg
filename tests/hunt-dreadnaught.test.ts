import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  canPlay,
  createGame,
  playCost,
  publicState,
  validateSave,
} from "../src/game/engine";
import { STARTERS, card, cards } from "../src/game/cards";
import { eligiblePayers, fx, stats } from "../src/game/core";
import { check, damage, destroy } from "../src/game/board";
import { reduceThreat } from "../src/game/threat-reduction";
import { flush } from "../src/game/effects";
import {
  consideredEngaged,
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import {
  attackersFor,
  defendersFor,
  forOwner,
  seatView,
} from "../src/game/table";
import { mainQuestUnit } from "../src/game/quest-state";
import { availableAbilities } from "../src/game/actions";
import { effectiveKeyword, hasTrait } from "../src/game/expansion-passives";
import {
  HUNT_DREADNAUGHT_HOOKS,
  HD,
  HD_CORSAIR_DECK,
  HD_DAMAGED,
  HD_SHIPS,
  HD_UNIQUES,
  hdBack,
  huntDreadnaughtPublicState,
} from "../src/game/hunt-dreadnaught";
import { HUNT_DREADNAUGHT_ADVENTURES } from "../src/game/hunt-dreadnaught-scenario-data";
import {
  activate,
  allies,
  base,
  choose,
  engaged,
  hand,
  heroesOf,
  reload,
  settle,
  shipOf,
  stage,
  stageTwo,
  start,
} from "./hunt-dreadnaught-fixtures";
import type { GameState } from "../src/game/types";

const H = HUNT_DREADNAUGHT_HOOKS;
const run = (s: GameState, ...effects: ReturnType<typeof fx>[]) => {
  s.queue.push(...effects);
  flush(s);
  return s;
};
const ability = (s: GameState, id: string, attachmentId?: string) =>
  applyAction(reload(s), { type: "ABILITY", id, attachmentId });
const logs = (s: GameState) =>
  (s as unknown as { log: { text: string }[] }).log.map((l) => l.text);
const countIn = (list: string[], code: string) =>
  list.filter((c) => c === code).length;

test("The adventure is registered for one group of one to four players, with its two quest cards", () => {
  const [a] = HUNT_DREADNAUGHT_ADVENTURES;
  assert.equal(a.id, "the-hunt-for-the-dreadnaught");
  assert.deepEqual(
    a.stages.map((x) => x.name),
    ["Searching the High Seas", "Destroy the Dreadnaught"],
  );
});

test("Setup: each player chooses a ship before drawing (Silent Mist's player draws 8; Pride of Lebennin's draws 5 more and returns 5, with no mulligan); the unused ships, the 4 Gondorian Warships and the 7 unique enemies are set aside and the 13 non-Ship Corsairs form the Corsair deck", () => {
  let s = start(2, "standard", [HD.silentMist, HD.pride]);
  const q = s.huntDreadnaught!;
  assert.deepEqual(
    q.fleet.map((f) => f.code),
    [HD.silentMist, HD.pride],
  );
  // The starting hands, and the first resource phase's card.
  assert.equal(seatView(s, 0).hand.length, 8 + 1, "Silent Mist: 8 cards");
  assert.equal(
    seatView(s, 1).hand.length,
    6 + 1,
    "Pride of Lebennin: 6 + 5 - 5",
  );
  assert.equal(seatView(s, 1).mulled, true, "Pride of Lebennin: no mulligan");
  assert.equal(seatView(s, 0).deck.length + 9, 30);
  assert.equal(seatView(s, 1).deck.length + 7, 30);
  assert.equal(shipOf(s, 0).code, HD.silentMist);
  assert.equal(shipOf(s, 1).code, HD.pride);
  assert.equal(q.corsairDeck.length, 13);
  assert.deepEqual([...q.corsairDeck].sort(), [...HD_CORSAIR_DECK].sort());
  for (const c of [...HD_UNIQUES, HD.dreadnaught])
    assert.equal(countIn(q.setAside, c), 1);
  assert.equal(countIn(q.setAside, HD.warship), 4);
  assert.deepEqual(
    HD_SHIPS.filter((c) => q.setAside.includes(c)).sort(),
    HD_SHIPS.filter((c) => ![HD.silentMist, HD.pride].includes(c)).sort(),
  );
  assert.equal(
    s.encounterDeck.length + s.encounterDiscard.length + s.staging.length,
    43,
  );
  // The fleet is chosen in seat order, before the starting hands.
  s = createFleetOnly();
  assert.match(s.choice!.title, /^Prepare your fleet · Choose your ship/);
  assert.equal(s.hand.length, 0, "no starting hand before the fleet");
  assert.equal(s.choice!.options.length, 6);
  s = choose(s, HD.swan);
  assert.equal(s.hand.length, 6, "the starting hand follows the fleet");
  assert.match(s.choice!.title, /Choose a difficulty mode/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["standard", "hard"],
  );
  s = choose(s, "standard");
  assert.ok(
    s.heroes.every((h) => h.resources === 1),
    "Swan Ship's Setup: 1 resource on each hero",
  );
});
function createFleetOnly() {
  // A fresh game, stopped at the fleet choice.
  const d = STARTERS[0];
  return createGame(5, d.cards, d.heroes, d.id, {
    scenarioId: "the-hunt-for-the-dreadnaught",
  });
}

test("The Setup cards: Easy Mode sets aside 2 Black Sails and 1 Corsair Warship and stages Cobas Haven; Standard Mode discards until 2 locations (3 with 3 or more players) are discarded and stages them; Hard Mode stages 3 Tolfalas Landing (and 2 Wicked Cove with 3 or more players); the chosen card is flipped next to the quest deck and the other two are removed", () => {
  const easy = start(1, "easy");
  assert.equal(easy.huntDreadnaught!.mode, "easy");
  assert.deepEqual(
    easy.staging.map((u) => u.code),
    [HD.cobas],
  );
  assert.equal(countIn(easy.huntDreadnaught!.setAside, HD.blackSails), 2);
  assert.equal(countIn(easy.huntDreadnaught!.setAside, HD.corsairWarship), 1);
  assert.equal(countIn(easy.encounterDeck, HD.blackSails), 0);
  assert.equal(easy.encounterDeck.length, 43 - 4);
  assert.ok(easy.heroes.every((h) => h.resources >= 1));
  assert.deepEqual(
    mainQuestUnit(easy)!.attachments.map((a) => a.code),
    [hdBack(HD.easy)],
  );
  assert.deepEqual(
    easy.huntDreadnaught!.removed.sort(),
    [HD.standard, HD.hard].sort(),
  );
  for (const [players, wanted] of [
    [1, 2],
    [3, 3],
  ] as const) {
    const s = start(players, "standard");
    const staged = s.staging.filter(
      (u) => card(u.code).type_code === "location",
    );
    assert.equal(staged.length, wanted);
    assert.ok(
      s.encounterDiscard.every((c) => card(c).type_code !== "location"),
      "the discarded cards before the last location are not locations",
    );
    assert.deepEqual(
      mainQuestUnit(s)!.attachments.map((a) => a.code),
      [hdBack(HD.standard)],
    );
  }
  const hard = start(1, "hard");
  assert.deepEqual(
    hard.staging.map((u) => u.code),
    [HD.tolfalas, HD.tolfalas, HD.tolfalas],
  );
  const hard3 = start(3, "hard");
  assert.deepEqual(
    hard3.staging.map((u) => u.code).sort(),
    [HD.tolfalas, HD.tolfalas, HD.tolfalas, HD.cove, HD.cove].sort(),
  );
});

test("Searching the High Seas (1B): 8 quest points per player and no more than 5 progress per player each round; the players advance only at the end of the quest phase, and 2A adds the Dreadnaught to the staging area, Elite side faceup", () => {
  const s = base(2);
  const quest = mainQuestUnit(s)!;
  assert.equal(H.stageInfo!(s)!.quest, 16);
  assert.equal(H.progress!(s, 12, quest), 10, "5 per player each round");
  H.questProgressPlaced!(s, quest, 10);
  assert.equal(H.progress!(s, 3, quest), 0);
  s.round += 1;
  assert.equal(H.progress!(s, 3, quest), 3, "a new round");
  // Enough progress does not advance before the end of the quest phase.
  s.progress = 16;
  s.phase = "quest";
  check(s);
  flush(s);
  assert.equal(s.huntDreadnaught!.currentQuest, HD.search);
  run(s, fx("finishQuestPhase"));
  const settled = settle(s);
  const q = settled.huntDreadnaught!;
  assert.equal(q.currentQuest, HD.destroy);
  assert.equal(settled.stage, 2);
  assert.equal(settled.progress, 0);
  const dread = settled.staging.find((u) => u.code === HD.dreadnaught);
  assert.ok(dread, "the Dreadnaught is staged, Elite side faceup");
  assert.ok(!q.setAside.includes(HD.dreadnaught));
  assert.equal(stats(settled, dread!).health, 30, "15 hit points per player");
  assert.deepEqual(
    mainQuestUnit(settled)!.attachments.map((a) => a.code),
    [hdBack(HD.standard)],
    "the Setup card stays next to the quest deck",
  );
  assert.ok(
    logs(settled).some((l) => /Destroy the Dreadnaught \(2A\)/.test(l)),
  );
});

test("The Dreadnaught (Massive): it never leaves the staging area (no engagement), is considered engaged with each player and attacks each of them; Archery 1 per player on its Elite side; immune to player card effects", () => {
  const s = base(2);
  const dread = stageTwo(s);
  for (const p of [0, 1]) {
    assert.ok(consideredEngaged(s, dread, p));
    assert.ok(engagedEnemies(seatView(s, p), p).some((u) => u.id === dread.id));
    assert.ok(normalAttackPending(seatView(s, p), dread, p));
  }
  assert.ok(
    H.cannotEngage!(s, dread),
    "Massive: it cannot leave the staging area",
  );
  // The engagement check and Out of the Mist cannot engage it.
  run(s, fx("engage", { target: dread.id, player: 0 }));
  assert.ok(s.staging.some((u) => u.id === dread.id));
  // Archery 1 per player: 2 with two players (the Damaged side has none).
  H.combatBegin!(s);
  const archery = s.queue.find((e) => e.kind === "heirsArchery");
  assert.equal(archery?.value, 2);
  s.queue = [];
  dread.code = HD_DAMAGED;
  H.combatBegin!(s);
  assert.equal(
    s.queue.find((e) => e.kind === "heirsArchery"),
    undefined,
  );
  // Both sides are immune to player card effects; the Damaged side has victory 99.
  assert.match(card(HD.dreadnaught).text!, /Immune to player card effects/);
  assert.match(
    card(HD_DAMAGED).text!,
    /Massive\. Immune to player card effects/,
  );
  assert.equal(card(HD_DAMAGED).victory, 99);
});

test("The Dreadnaught has 15 hit points per player and cannot take more than 5 damage per player each round; at the end of the round below half its hit points it flips to its Damaged side and each player puts a random set-aside unique Corsair into play engaged with them", () => {
  const s = base(2);
  const dread = stageTwo(s);
  assert.equal(stats(s, dread).health, 30);
  damage(s, dread.id, 8);
  assert.equal(dread.damage, 8);
  damage(s, dread.id, 8);
  assert.equal(dread.damage, 10, "10 damage this round at most");
  damage(s, dread.id, 3);
  assert.equal(dread.damage, 10);
  // 20 of 30 hit points left: not less than half.
  run(s, ...H.roundEnd!(s));
  assert.equal(dread.code, HD.dreadnaught);
  s.round += 1;
  damage(s, dread.id, 6);
  assert.equal(dread.damage, 16, "a new round");
  run(s, ...H.roundEnd!(s));
  const settled = settle(s);
  const flipped = settled.staging.find((u) => u.id === dread.id)!;
  assert.equal(flipped.code, HD_DAMAGED, "14 of 30 left: it flips");
  assert.equal(flipped.damage, 16, "the damage stays");
  const q = settled.huntDreadnaught!;
  for (const p of [0, 1])
    assert.ok(
      seatView(settled, p).engaged.some((u) => HD_UNIQUES.includes(u.code)),
      `player ${p} is engaged with a unique Corsair`,
    );
  assert.equal(HD_UNIQUES.filter((c) => q.setAside.includes(c)).length, 4);
  assert.ok(
    logs(settled).some((l) => /flips over to its Damaged side/.test(l)),
  );
});

test("Destroy the Dreadnaught (2B): its Action removes 5 progress per player to shuffle a set-aside Gondorian Warship into the encounter deck; its Response raises your threat by 4 to cancel the Dreadnaught's attack; destroying the Dreadnaught wins", () => {
  let s = base(1);
  const dread = stageTwo(s);
  const quest = mainQuestUnit(s)!;
  const action = availableAbilities(s, quest);
  assert.ok(
    action.some((a) => /Gondorian Warship/.test(a.label) && a.disabled),
  );
  s.progress = 5;
  s.phase = "quest";
  s = ability(s, quest.id);
  s = settle(s);
  assert.equal(s.progress, 0);
  assert.equal(countIn(s.encounterDeck, HD.warship), 1);
  assert.equal(countIn(s.huntDreadnaught!.setAside, HD.warship), 3);
  // The Response: in the combat phase, before the Dreadnaught attacks you.
  s.phase = "defense";
  const before = s.threat;
  const [cancel] = availableAbilities(
    s,
    s.staging.find((u) => u.id === dread.id)!,
  );
  assert.match(cancel.label, /raise your threat by 4 to cancel/);
  assert.ok(!cancel.disabled);
  s = ability(s, dread.id);
  s = settle(s);
  assert.equal(s.threat, before + 4);
  const after = s.staging.find((u) => u.id === dread.id)!;
  assert.ok(H.enemyCannotAttack!(s, after, 0));
  assert.ok(availableAbilities(s, after)[0].disabled, "once per attack");
  // Destroying the Dreadnaught (either side) wins.
  const win = base(1);
  const damaged = stageTwo(win, true, 14);
  damage(win, damaged.id, 1);
  check(win);
  flush(win);
  assert.equal(win.status, "won");
  assert.match(win.reason ?? "", /The Dreadnaught is destroyed/);
});

test("Ship-objectives: only ships defend against ship-enemies and undefended ship damage goes to a ship; ships attack only ship-enemies (and Sea Monster); the unique Corsairs stop their engaged player attacking the Dreadnaught and Umbar Captain stops attacks on Ship enemies; a player who controls no ship-objective is eliminated", () => {
  const s = base(2);
  const ship = shipOf(s, 0);
  const sails = engaged(s, HD.blackSails, 0);
  const sailor = engaged(s, HD.sailor, 0);
  const monster = engaged(s, HD.seaMonster, 0);
  forOwner(s, 0, () => {
    // Only ships defend; the other player's ship has sentinel.
    assert.deepEqual(
      defendersFor(s, sails).map((u) => u.id),
      [ship.id, shipOf(s, 1).id],
    );
    assert.ok(!defendersFor(s, sailor).some((u) => u.id === ship.id));
    assert.ok(defendersFor(s, monster).some((u) => u.id === ship.id));
    assert.ok(attackersFor(s, sails).some((u) => u.id === ship.id));
    assert.ok(!attackersFor(s, sailor).some((u) => u.id === ship.id));
    assert.ok(attackersFor(s, monster).some((u) => u.id === ship.id));
    assert.ok(attackersFor(s, sails).some((u) => u.code === s.heroes[0].code));
  });
  // The unique Corsairs and Umbar Captain.
  const dread = stageTwo(s);
  const hero = heroesOf(s, 0)[0];
  assert.ok(!H.cannotAttack!(s, hero, dread));
  engaged(s, HD.ophidian, 0);
  assert.ok(H.cannotAttack!(s, hero, dread));
  assert.ok(!H.cannotAttack!(s, heroesOf(s, 1)[0], dread));
  engaged(s, HD.umbarCaptain, 1);
  assert.ok(H.cannotAttack!(s, heroesOf(s, 1)[0], sails));
  // No ship-objective: eliminated.
  forOwner(s, 1, () => destroy(s, shipOf(s, 1)));
  check(s);
  flush(s);
  assert.ok(s.table!.seats[1].eliminated);
  assert.ok(!s.table!.seats[0].eliminated);
  const solo = base(1);
  destroy(solo, shipOf(solo, 0));
  check(solo);
  assert.equal(solo.status, "lost");
  assert.match(solo.reason ?? "", /control no ship-objective/);
});

test("The ships' Basic sides: Eithiliant (+1 willpower, a hero gains another hero's printed Traits), Golden Wing (+1 hit point, threat reduced by 3, a hero gains ranged), Pride of Lebennin (+1 defense) and Swan Ship of Dol Amroth (1 resource on each hero); each ship is immune to player card effects with sentinel", () => {
  const s = start(4, "standard", [
    HD.eithiliant,
    HD.goldenWing,
    HD.pride,
    HD.swan,
  ]);
  const q = s.huntDreadnaught!;
  const printed = (p: number, i: number) => card(heroesOf(s, p)[i].code);
  const h = (p: number, i: number) => stats(s, heroesOf(s, p)[i]);
  assert.equal(h(0, 0).will, (printed(0, 0).willpower ?? 0) + 1);
  assert.equal(h(1, 0).health, (printed(1, 0).health ?? 0) + 1);
  assert.equal(h(2, 0).defense, (printed(2, 0).defense ?? 0) + 1);
  assert.equal(h(3, 0).will, printed(3, 0).willpower ?? 0);
  // Eithiliant: the first hero gains the second hero's printed Traits.
  const [target, from] = heroesOf(s, 0);
  assert.equal(q.traits[0].id, target.id);
  for (const t of (card(from.code).traits ?? "")
    .split(".")
    .map((x) => x.trim())
    .filter(Boolean))
    assert.ok(hasTrait(target, t), `${card(target.code).name} gains ${t}`);
  // Golden Wing: threat reduced by 3 and a hero gains ranged.
  assert.equal(seatView(s, 1).threat, seatView(s, 1).startingThreat - 3);
  assert.equal(q.ranged.length, 1);
  assert.ok(
    effectiveKeyword(
      heroesOf(s, 1).find((x) => x.id === q.ranged[0])!,
      "Ranged",
    ),
  );
  // Swan Ship: each hero began with 1 more resource (and gained 1 in round 1).
  assert.ok(heroesOf(s, 3).every((x) => x.resources === 2));
  for (const p of [0, 1, 2, 3]) {
    const ship = shipOf(s, p);
    assert.ok(effectiveKeyword(ship, "Sentinel"));
    assert.match(card(ship.code).text!, /^Immune to player card effects/);
  }
});

test("Swan Ship of Dol Amroth's Action readies a character for 2 resources once per round; Twilight's Call lets the first card each round be played without a resource match and an ally or attachment be played outside the planning phase once per round; Silent Mist makes events with an Action costing 3 or more cost 1 less", () => {
  let s = base(1, "standard", [HD.swan]);
  const swan = shipOf(s, 0);
  const [aragorn] = s.heroes;
  aragorn.exhausted = true;
  s.phase = "quest";
  assert.ok(!availableAbilities(s, swan)[0].disabled);
  s = ability(s, swan.id);
  s = settle(s, [aragorn.id]);
  assert.equal(s.heroes[0].exhausted, false);
  assert.equal(
    s.heroes.reduce((n, x) => n + x.resources, 0),
    30 - 2,
  );
  assert.ok(availableAbilities(s, shipOf(s, 0))[0].disabled, "once per round");
  // Twilight's Call.
  const call = base(1, "standard", [HD.twilight]);
  call.phase = "quest";
  // Wandering Took (spirit) with only leadership heroes.
  const [ally] = hand(call, ["01043"]);
  assert.ok(
    call.heroes.every((x) => card(x.code).sphere_code === "leadership"),
  );
  const c = { ...card(ally.code), playOwner: 0 };
  assert.ok(H.noResourceMatch!(call, c), "the first card each round");
  assert.ok(H.playTimingAllowed!(call, c), "outside the planning phase");
  assert.equal(canPlay(call, ally), null);
  assert.ok(eligiblePayers(call, c).length === 3);
  call.used.push("round:hd-twilight-first:0", "round:hd-twilight-action:0");
  assert.ok(!H.noResourceMatch!(call, c), "only the first card each round");
  assert.ok(!H.playTimingAllowed!(call, c), "once per round");
  assert.notEqual(canPlay(call, ally), null);
  // Silent Mist: an Action event with cost 3 or more costs 1 less.
  const mist = base(1, "standard", [HD.silentMist]);
  const event = Object.values(cards).find(
    (x) =>
      x.type_code === "event" &&
      Number(x.cost) >= 3 &&
      /Action:/.test(x.text ?? "") &&
      !/^octgn:/.test(x.code),
  )!;
  assert.ok(event, "a player event costing 3 or more");
  assert.equal(
    playCost(mist, { ...event, playOwner: 0, playOrigin: "hand" }),
    Number(event.cost) - 1,
  );
  assert.equal(
    playCost(base(1), { ...event, playOwner: 0, playOrigin: "hand" }),
    Number(event.cost),
  );
});

test("Belfalas Shipyard's Response: the players spend 5 resources as a group to heal 5 damage from a ship, ready it and flip it to its Upgraded side, whose Response then resolves (Golden Wing deals 6 damage to an enemy); the Upgraded side gives +2 and its own stats", () => {
  let s = base(1, "standard", [HD.goldenWing]);
  const wing = shipOf(s, 0);
  wing.damage = 7;
  wing.exhausted = true;
  const enemy = engaged(s, HD.sailor, 0);
  const shipyard = activate(s, HD.shipyard);
  H.explored!(s, shipyard, true);
  flush(s);
  assert.match(s.choice!.title, /^Belfalas Shipyard · Response/);
  s = choose(s, wing.id);
  s = settle(s, [enemy.id]);
  const flipped = shipOf(s, 0);
  assert.equal(flipped.code, hdBack(HD.goldenWing));
  assert.equal(flipped.damage, 2, "5 damage healed");
  assert.equal(flipped.exhausted, false);
  assert.equal(
    s.heroes.reduce((n, x) => n + x.resources, 0),
    30 - 5,
  );
  assert.equal(stats(s, flipped).health, 18);
  assert.equal(
    stats(s, s.heroes[0]).health,
    (card(s.heroes[0].code).health ?? 0) + 2,
  );
  assert.ok(s.heroes.every((x) => effectiveKeyword(x, "Ranged")));
  assert.ok(
    !s.engaged.some((u) => u.id === enemy.id) ||
      s.engaged.find((u) => u.id === enemy.id)!.damage >= 4,
    "Golden Wing's Response dealt 6 damage",
  );
});

test("The Setup cards' other sides: Easy Mode draws 1 additional card in each resource phase; the Quest Action deals 10 damage to a non-unique engaged enemy once per game (Standard Mode then reveals an encounter card); Hard Mode limits each threat reduction to 1 each round and raises the threat after a player card heals or readies a character", () => {
  const easy = base(1, "easy");
  const before = easy.hand.length;
  easy.deck = ["01016", "01016", "01016"];
  run(easy, ...H.resourceStart!(easy));
  assert.equal(easy.hand.length, before + 1);
  // The Quest Action, on the Setup card next to the quest deck.
  let s = base(1, "standard");
  const skiff = engaged(s, HD.skiff, 0);
  s.phase = "quest";
  const quest = mainQuestUnit(s)!;
  const setupCard = quest.attachments[0];
  const [quest10] = availableAbilities(s, quest).filter(
    (a) => a.id === setupCard.id,
  );
  assert.match(quest10.label, /Quest Action: deal 10 damage/);
  assert.ok(!quest10.disabled);
  const deckBefore = s.encounterDeck.length;
  s = ability(s, quest.id, setupCard.id);
  s = settle(s, [skiff.id]);
  assert.ok(
    !s.engaged.some((u) => u.id === skiff.id),
    "Corsair Skiff is destroyed",
  );
  assert.equal(
    s.encounterDeck.length,
    deckBefore - 1,
    "Standard Mode reveals a card",
  );
  assert.ok(s.huntDreadnaught!.questActionUsed);
  // Hard Mode.
  const hard = base(1, "hard");
  hard.round = 1;
  hard.threat = 30;
  assert.equal(reduceThreat(hard, 3, "01016"), 1);
  assert.equal(reduceThreat(hard, 2, "01016"), 0, "1 each round");
  assert.equal(hard.threat, 29);
  assert.ok(
    !availableAbilities(hard, mainQuestUnit(hard)!).some(
      (a) => /Quest Action/.test(a.label) && !a.disabled,
    ),
  );
});

test("Saves: the scenario state round-trips, the public state describes it, and malformed state is rejected", () => {
  const s = base(2);
  stageTwo(s);
  const restored = reload(s);
  assert.deepEqual(restored.huntDreadnaught, s.huntDreadnaught);
  const view = huntDreadnaughtPublicState(s)!;
  assert.equal(view.dreadnaught, "elite");
  assert.equal(view.dreadnaughtHealth, 30);
  assert.equal(view.stage, 2);
  // Each ship-objective is listed once, with the seat that controls it.
  assert.deepEqual(
    view.ships.map((x) => [x.code, x.owner]),
    [
      [shipOf(s, 0).code, 0],
      [shipOf(s, 1).code, 1],
    ],
  );
  assert.ok(publicState(s));
  const bad = JSON.parse(JSON.stringify(s));
  bad.huntDreadnaught.mode = "nightmare";
  assert.equal(validateSave(bad), false);
  const bad2 = JSON.parse(JSON.stringify(s));
  bad2.huntDreadnaught.corsairDeck.push(HD.dreadnaught);
  assert.equal(validateSave(bad2), false);
  const bad3 = JSON.parse(JSON.stringify(s));
  bad3.huntDreadnaught.fleet = [
    { player: 0, code: HD.swan },
    { player: 1, code: HD.swan },
  ];
  assert.equal(validateSave(bad3), false);
});
