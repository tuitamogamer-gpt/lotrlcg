import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, publicState } from "../src/game/engine";
import { card } from "../src/game/cards";
import { engagementCost, fx, get, stats, threatOf } from "../src/game/core";
import { addVictoryCard, check } from "../src/game/board";
import { flush } from "../src/game/effects";
import { reduceThreat } from "../src/game/threat-reduction";
import { forOwner, seatView } from "../src/game/table";
import {
  ADG,
  ATTACK_DOL_GULDUR_HOOKS,
  adgRecipe,
  attackDolGuldurPublicState,
} from "../src/game/attack-dol-guldur";
import { ATTACK_DOL_GULDUR_ADVENTURES } from "../src/game/attack-dol-guldur-scenario-data";
import {
  activate,
  allies,
  atQuest,
  base,
  choose,
  deck,
  engaged,
  hand,
  reload,
  settle,
  stage,
  start,
} from "./attack-dol-guldur-fixtures";
import type { GameState, Unit } from "../src/game/types";

const H = ATTACK_DOL_GULDUR_HOOKS;
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
const run = (s: GameState, ...effects: ReturnType<typeof fx>[]) => {
  s.queue.push(...effects);
  flush(s);
  return s;
};
const threats = (s: GameState) =>
  (s.table?.seats ?? [{ threat: s.threat }]).map((x) => x.threat);
const defend = (s: GameState, enemy: Unit, defender?: Unit) =>
  act(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender?.id ?? null,
  });
const city = (s: GameState) => s.attackDolGuldur!.cityStrength;
const roundEnd = (s: GameState) => run(s, ...H.roundEnd!(s));
const power = (s: GameState) => s.staging.find((u) => u.code === ADG.power)!;
/** Bring a set-aside Lieutenant into the staging area. */
const lieutenant = (s: GameState, code: string) => {
  const q = s.attackDolGuldur!;
  q.setAside = q.setAside.filter((c) => c !== code);
  return stage(s, code);
};

test("Setup: Dol Guldur (city strength 5 + 5 per player), Power of Lórien and a Dol Guldur Marauder per player are staged; Host of Lórien, the Lieutenants and both setup cards are set aside", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = start(players, easy);
      const q = s.attackDolGuldur!;
      assert.equal(q.currentQuest, ADG.golden);
      assert.equal(s.stage, 1);
      assert.equal(q.cityStrength, 5 + 5 * players);
      assert.deepEqual(
        s.staging.map((u) => u.code),
        [ADG.city, ADG.power, ...Array(players).fill(ADG.marauder)],
      );
      assert.deepEqual(
        [...q.setAside].sort(),
        [
          ADG.mode,
          ADG.epic,
          ADG.host,
          ADG.bane,
          ADG.sorcerer,
          ADG.morlug,
          ADG.dweller,
        ].sort(),
      );
      // The other Marauders stay in the encounter deck.
      assert.equal(
        s.encounterDeck.length + s.encounterDiscard.length,
        36 + 4 - players,
      );
      assert.equal(
        s.encounterDeck.filter((c) => c === ADG.marauder).length,
        4 - players,
      );
      reload(s);
    }
  assert.equal(adgRecipe().id, "Q99.10");
  assert.deepEqual(
    ATTACK_DOL_GULDUR_ADVENTURES[0].stages.map((x) => [x.name, x.quest]),
    [
      ["Assault on the Golden Wood", 0],
      ["Crossing the Anduin", 0],
      ["The Siege of Dol Guldur", 0],
      ["The Tower of Sorcery", 0],
      ["Battle Under the Trees", 0],
      ["Dungeons of the Necromancer", 0],
    ],
  );
  assert.equal(ATTACK_DOL_GULDUR_ADVENTURES[0].difficulty, 10);
});

test("Assault on the Golden Wood: at the end of each round a resource is placed and the progress moves to Power of Lórien; raising each threat by 1 draws a card and gains a resource; at 3 resources the players cross the Anduin", () => {
  let s = base(2);
  s.progress = 7;
  roundEnd(s);
  assert.equal(s.attackDolGuldur!.questResources, 1);
  assert.equal(s.progress, 0);
  assert.equal(power(s).progress, 7);
  assert.match(s.choice!.title, /^Assault on the Golden Wood · Raise each/);
  deck(s, ["01013", "01013"], 0);
  deck(s, ["01013", "01013"], 1);
  s = choose(s, "use");
  s = settle(s, s.table!.seats[1].heroes[0].id);
  assert.deepEqual(threats(s), [21, 21]);
  assert.equal(seatView(s, 0).hand.length, 1);
  assert.equal(seatView(s, 1).hand.length, 1);
  assert.equal(
    [0, 1]
      .flatMap((p) => seatView(s, p).heroes)
      .reduce((n, h) => n + h.resources, 0),
    6 * 10 + 2,
  );
  // The third resource: Crossing the Anduin, with no Response.
  s = base();
  s.attackDolGuldur!.questResources = 2;
  s.encounterDeck = [ADG.gate, ADG.door, ADG.marauder];
  roundEnd(s);
  assert.equal(s.attackDolGuldur!.questResources, 0);
  assert.equal(s.attackDolGuldur!.currentQuest, ADG.anduin);
  assert.equal(s.stage, 2);
  reload(s);
});

test("Crossing the Anduin: 10 progress on Power of Lórien buy Host of Lórien and 20 more place Power of Lórien under the first player's control, else it is discarded; each player finds a Dol Guldur location; the players choose a stage 3", () => {
  let s = base(2);
  power(s).progress = 30;
  s.encounterDeck = [ADG.marauder, ADG.gate];
  s.encounterDiscard = [ADG.door];
  run(s, fx("adgCrossing", { player: 0 }));
  assert.match(s.choice!.title, /^Crossing the Anduin · Remove 10 progress/);
  s = choose(s, "host");
  assert.ok(seatView(s, 0).allies.some((u) => u.code === ADG.host));
  assert.match(s.choice!.title, /^Crossing the Anduin · Remove 20 more/);
  s = choose(s, "power");
  assert.deepEqual(s.attackDolGuldur!.lorien, { player: 0 });
  assert.ok(!s.staging.some((u) => u.code === ADG.power));
  // Each player searches the deck and the discard pile.
  assert.match(
    s.choice!.title,
    /^Crossing the Anduin · Search for a Dol Guldur/,
  );
  s = choose(s, ADG.gate);
  s = choose(s, ADG.door);
  assert.ok(s.staging.some((u) => u.code === ADG.gate));
  assert.ok(s.staging.some((u) => u.code === ADG.door));
  assert.match(s.choice!.title, /^Crossing the Anduin · Advance to a stage 3/);
  assert.equal(s.choice!.options.length, 4);
  s = choose(s, ADG.tower);
  assert.equal(s.attackDolGuldur!.currentQuest, ADG.tower);
  assert.equal(s.stage, 3);
  assert.ok(s.staging.some((u) => u.code === ADG.sorcerer));
  assert.equal(attackDolGuldurPublicState(s)!.side, "3D");
  // Too little progress: Power of Lórien is discarded.
  s = base();
  power(s).progress = 12;
  s.encounterDeck = [ADG.marauder];
  run(s, fx("adgCrossing", { player: 0 }));
  s = choose(s, "host");
  assert.ok(!s.staging.some((u) => u.code === ADG.power));
  assert.ok(s.encounterDiscard.includes(ADG.power));
  assert.equal(s.attackDolGuldur!.lorien, null);
  reload(s);
});

test("Stage 3: the new Lieutenant enters the staging area (and attacks each player at 5 city strength or less), the old one loses its tokens and is set aside, and one in the victory display stays there; the stage's Lieutenant gets -1 engagement cost per progress", () => {
  let s = base(2);
  atQuest(s, ADG.siege);
  const bane = lieutenant(s, ADG.bane);
  bane.damage = 4;
  assert.equal(engagementCost(s, bane), 45);
  s.progress = 12;
  assert.equal(engagementCost(s, bane), 33);
  s.progress = 0;
  run(s, fx("adgEnterStage3", { code: ADG.dungeons, player: 0 }));
  assert.ok(!s.staging.some((u) => u.id === bane.id));
  assert.ok(s.attackDolGuldur!.setAside.includes(ADG.bane));
  assert.ok(s.staging.some((u) => u.code === ADG.dweller));
  assert.equal(s.choice, null, "no attack above 5 city strength");
  // At 5 city strength or less, the Lieutenant attacks each player.
  s = base(2);
  atQuest(s, ADG.dungeons);
  s.attackDolGuldur!.cityStrength = 5;
  run(s, fx("adgEnterStage3", { code: ADG.trees, player: 0 }));
  assert.match(s.choice!.title, /^Chieftain Morlug · Immediate attack/);
  // A Lieutenant in the victory display stays there.
  s = base();
  atQuest(s, ADG.trees);
  s.attackDolGuldur!.setAside = s.attackDolGuldur!.setAside.filter(
    (c) => c !== ADG.bane,
  );
  addVictoryCard(s, ADG.bane);
  run(s, fx("adgEnterStage3", { code: ADG.siege, player: 0 }));
  assert.ok(!s.staging.some((u) => u.code === ADG.bane));
  reload(s);
});

test("Stage 3 Forced effects: 5 progress or the penalty, then 5 more for the benefit, at The Siege of Dol Guldur, The Tower of Sorcery, Battle Under the Trees and Dungeons of the Necromancer", () => {
  // 3B: 5 progress, then 5 more lower the city strength by 3.
  let s = base(2);
  atQuest(s, ADG.siege);
  s.progress = 11;
  run(s, fx("adgStageForced", { player: 0 }));
  s = choose(s, "progress");
  s = choose(s, "bonus");
  assert.equal(s.progress, 1);
  assert.equal(city(s), 12);
  // 3B without progress: the city strength rises by 3.
  s = base();
  atQuest(s, ADG.siege);
  run(s, fx("adgStageForced", { player: 0 }));
  assert.equal(city(s), 13);
  // 3D: each player keeps 1 card; 5 more let a player search his deck.
  s = base();
  atQuest(s, ADG.tower);
  const [keep] = hand(s, ["01013", "01014", "01015"]);
  run(s, fx("adgPenalty", { code: ADG.tower, player: 0 }));
  s = choose(s, keep.id);
  assert.deepEqual(
    s.hand.map((u) => u.id),
    [keep.id],
  );
  assert.equal(s.discard.length, 2);
  deck(s, ["01013", "01016", "01017"]);
  run(s, fx("adgBonus", { code: ADG.tower, player: 0 }));
  s = choose(s, "01016");
  assert.ok(s.hand.some((u) => u.code === "01016"));
  assert.equal(s.deck.length, 2);
  // 3F: each player is ambushed; 5 more destroy a non-unique enemy (its
  // siege value counts this round).
  s = base();
  atQuest(s, ADG.trees);
  s.encounterDeck = [ADG.woods, ADG.archer, ADG.gate];
  run(s, fx("adgPenalty", { code: ADG.trees, player: 0 }));
  s = settle(s, "other");
  assert.ok(s.engaged.some((u) => u.code === ADG.archer));
  assert.ok(s.encounterDiscard.includes(ADG.woods));
  const olog = stage(s, ADG.olog);
  run(s, fx("adgBonus", { code: ADG.trees, player: 0 }));
  s = choose(s, olog.id);
  assert.ok(!s.staging.some((u) => u.id === olog.id));
  assert.equal(s.attackDolGuldur!.siege.value, 3);
  // 3H: each player discards an ally; 5 more put an ally from the top 10
  // cards into play.
  s = base();
  atQuest(s, ADG.dungeons);
  const [guard] = allies(s, ["01013"]);
  run(s, fx("adgPenalty", { code: ADG.dungeons, player: 0 }));
  s = choose(s, guard.id);
  assert.equal(s.allies.length, 0);
  deck(s, ["01026", "01013", "01016"]);
  run(s, fx("adgBonus", { code: ADG.dungeons, player: 0 }));
  s = choose(s, "01013");
  assert.ok(s.allies.some((u) => u.code === "01013"));
  reload(s);
});

test("Dol Guldur and Standard Game Mode: siege values lower the city strength, a random stage 3 resolves its penalty, the progress is discarded and the players advance; at 0 city strength the Lieutenants lose indestructible and the players win with none in play", () => {
  let s = base();
  atQuest(s, ADG.siege);
  const bane = lieutenant(s, ADG.bane);
  assert.equal(H.indestructible!(s, bane), true);
  s.round = 4;
  s.attackDolGuldur!.siege = { round: 4, value: 6 };
  s.progress = 7;
  roundEnd(s);
  // 5 progress paid, siege 6: 10 → 4; the random stage's penalty follows.
  s = settle(s, "progress");
  assert.equal(s.progress, 0);
  assert.notEqual(s.attackDolGuldur!.currentQuest, ADG.siege);
  assert.ok(city(s) <= 7);
  assert.ok(s.log.some((l) => /is randomly selected/.test(l.text)));
  // Explored locations and destroyed enemies count their siege values.
  s = base();
  atQuest(s, ADG.siege);
  const gate = stage(s, ADG.gate);
  H.explored!(s, gate, false);
  const warg = engaged(s, ADG.warg);
  warg.damage = 5;
  check(s);
  assert.equal(s.attackDolGuldur!.siege.value, 3);
  // A Lieutenant with lethal damage falls when the city strength reaches 0,
  // and the players win at the end of the round.
  s = base();
  atQuest(s, ADG.siege);
  const lt = lieutenant(s, ADG.bane);
  lt.damage = 9;
  s.attackDolGuldur!.cityStrength = 2;
  s.attackDolGuldur!.siege = { round: s.round, value: 2 };
  s.progress = 5;
  roundEnd(s);
  s = settle(s, "progress");
  assert.equal(city(s), 0);
  assert.equal(s.status, "won");
  assert.match(s.reason!, /Dol Guldur is captured/);
  assert.ok(s.victoryCards!.includes(ADG.bane));
  reload(s);
});

test("Lieutenants: Bane of Amon Lanc, Sorcerer of Dol Guldur, Chieftain Morlug and Dungeon Dweller attack with their Forced effects; each is immune to player card effects", () => {
  // Bane of Amon Lanc: a random card from hand, +X attack (its cost).
  let s = base();
  atQuest(s, ADG.siege);
  const bane = engaged(s, ADG.bane);
  s.attackDolGuldur!.setAside = s.attackDolGuldur!.setAside.filter(
    (c) => c !== ADG.bane,
  );
  hand(s, ["01026"]);
  s.phase = "defense";
  s = defend(s, bane, s.heroes[0]);
  s = settle(s);
  assert.equal(s.hand.length, 0);
  assert.ok(
    s.log.some((l) =>
      /Bane of Amon Lanc: .* at random; it gets \+\d attack/.test(l.text),
    ),
  );
  // Sorcerer of Dol Guldur: the top card, then each copy in play.
  s = base();
  const sorcerer = engaged(s, ADG.sorcerer);
  allies(s, ["01013", "01013"]);
  deck(s, ["01013", "01016"]);
  s.phase = "defense";
  s = defend(s, sorcerer, s.heroes[0]);
  s = settle(s);
  assert.equal(s.allies.filter((u) => u.code === "01013").length, 0);
  assert.equal(s.discard.filter((c) => c === "01013").length, 3);
  // Chieftain Morlug: an enemy from the encounter deck engages the player.
  s = base();
  const morlug = engaged(s, ADG.morlug);
  s.encounterDeck = [ADG.woods, ADG.marauder, ADG.gate];
  s.phase = "defense";
  s = defend(s, morlug, s.heroes[0]);
  s = settle(s, "other");
  assert.ok(s.engaged.some((u) => u.code === ADG.marauder));
  // Dungeon Dweller: discard an ally.
  s = base();
  const dweller = engaged(s, ADG.dweller);
  const [guard] = allies(s, ["01013"]);
  s.phase = "defense";
  s = defend(s, dweller, s.heroes[0]);
  s = settle(s);
  assert.ok(!s.allies.some((u) => u.id === guard.id));
  for (const code of [ADG.bane, ADG.sorcerer, ADG.morlug, ADG.dweller])
    assert.match(card(code).text!, /Immune to player card effects/);
  reload(s);
});

test("Enemies: Host of Dol Guldur, Mirkwood Olog-hai, Beast of Taur-nu-Fuin, Amon Lanc Archer, Dol Guldur Marauder, Battle Warg", () => {
  // Host of Dol Guldur: X threat and archery X; X progress at the end of the
  // encounter phase while staged; no attachments.
  let s = base(3);
  const army = stage(s, ADG.army);
  assert.equal(threatOf(s, army), 3);
  assert.equal(H.cannotAttach!(s, army, "01001"), true);
  s.progress = 5;
  run(s, ...H.encounterEnd!(s));
  assert.equal(s.progress, 2);
  engaged(s, ADG.archer);
  H.combatBegin!(s);
  flush(s);
  assert.match(s.choice!.title, /^Assign Archery damage · 5 remaining/);
  // Dol Guldur Marauder: +1/+1 per resource; when it attacks, a resource.
  s = base();
  const marauder = engaged(s, ADG.marauder);
  marauder.shadows = [ADG.gate];
  s.phase = "defense";
  s = defend(s, marauder, s.heroes[0]);
  assert.equal(stats(s, get(s, marauder.id)!).attack, 4);
  // Battle Warg: remove 1 progress or discard an attachment.
  s = base();
  s.progress = 2;
  const warg = stage(s, ADG.warg);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: warg.id });
  assert.equal(s.progress, 1, "no attachment: only the progress");
  // Amon Lanc Archer: remove 2 progress or 2 damage to an ally.
  s = base();
  s.progress = 4;
  const [guard] = allies(s, ["01013"]);
  const archer = stage(s, ADG.archer);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: archer.id });
  assert.match(s.choice!.title, /^Amon Lanc Archer · Remove 2 progress/);
  s = choose(s, "other");
  s = settle(s, guard.id);
  assert.equal(get(s, guard.id)?.damage ?? 2, 2);
  // Mirkwood Olog-hai: 1 progress for each excess point of damage.
  s = base();
  s.progress = 6;
  const olog = engaged(s, ADG.olog);
  olog.shadows = [ADG.gate];
  const [chump] = allies(s, ["01013"]);
  s.phase = "defense";
  s = defend(s, olog, chump);
  s = settle(s);
  assert.ok(!s.allies.some((u) => u.id === chump.id));
  assert.equal(s.progress, 2, "6 damage on 2 hit points: 4 excess");
  // Beast of Taur-nu-Fuin: its shadow cards cannot be canceled.
  s = base();
  const beast = engaged(s, ADG.beast);
  s.combat = {
    enemyId: beast.id,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
    damageDealt: 0,
  } as unknown as GameState["combat"];
  assert.equal(H.cannotCancel!(s, true), true);
  assert.equal(H.cannotCancel!(s, false), false);
  assert.equal(H.cannotAttach!(s, beast, "01001"), true);
  reload({ ...s, combat: null });
});

test("Locations: the Dol Guldur locations open only at their stage, Gate of Dol Guldur, The Sorcerer's Tower, The Shadow Road, Dungeon Door, Forest Battleground and Blackened Woods", () => {
  let s = base();
  const gate = stage(s, ADG.gate);
  assert.match(H.travelProblem!(s, gate)!, /unless they are at stage 3B/);
  assert.equal(H.locationProgressBlocked!(s, gate), true);
  atQuest(s, ADG.siege);
  assert.equal(H.travelProblem!(s, gate), null);
  assert.equal(H.locationProgressBlocked!(s, gate), false);
  // Gate: no more than 1 threat reduced by player card effects a round.
  s.threat = 30;
  reduceThreat(s, 3, undefined, "player-card");
  assert.equal(s.threat, 29);
  reduceThreat(s, 2, undefined, "player-card");
  assert.equal(s.threat, 29);
  // Dungeon Door: 1 damage healed from each character a round.
  s = base();
  stage(s, ADG.door);
  const hero = s.heroes[0];
  hero.damage = 3;
  assert.equal(H.healLimit!(s, hero), 1);
  H.healed!(s, hero, 1);
  assert.equal(H.healLimit!(s, hero), 0);
  // The Sorcerer's Tower: a canceled 'when revealed' effect reveals a card.
  s = base();
  stage(s, ADG.sorcery);
  s.encounterDeck = [ADG.gate, ADG.gate];
  H.whenRevealedCancelled!(s, ADG.rage);
  flush(s);
  s = settle(s);
  assert.equal(s.staging.filter((u) => u.code === ADG.gate).length, 1);
  // The Shadow Road: +2 threat per facedown card attached.
  s = base();
  const road = stage(s, ADG.road);
  assert.equal(threatOf(s, road), 2);
  s.phase = "quest";
  const [event] = hand(s, ["01020"]);
  H.eventPlayed!(s, event);
  assert.equal(H.eventDestination!(s, event, 0), true);
  assert.equal(road.attachments[0]?.facedown, true);
  assert.equal(threatOf(s, road), 4);
  // Forest Battleground: +1 threat per ally of the player with the most.
  s = base(2);
  const forest = stage(s, ADG.forest);
  allies(s, ["01013", "01013"], 1);
  assert.equal(threatOf(s, forest), 3);
  // When explored: each player searches for an Orc enemy.
  s.encounterDeck = [ADG.gate, ADG.archer];
  s.encounterDiscard = [ADG.army];
  H.explored!(s, forest, true);
  flush(s);
  s = choose(s, ADG.archer);
  s = choose(s, ADG.army);
  assert.ok(s.staging.some((u) => u.code === ADG.archer));
  assert.ok(s.staging.some((u) => u.code === ADG.army));
  // Blackened Woods: discard the top card, threat by its printed threat.
  s = base(2);
  const woods = activate(s, ADG.woods);
  s.encounterDeck = [ADG.olog, ADG.gate];
  H.explored!(s, woods, true);
  flush(s);
  assert.deepEqual(threats(s), [24, 24]);
  assert.ok(s.encounterDiscard.includes(ADG.olog));
  reload(s);
});

test("Treacheries and shadows: Servant of Sauron, Power Sevenfold, The Necromancer's Rage, Fear and Despair, Fastness of Mirkwood; Power of Lórien cancels a revealed card", () => {
  // Servant of Sauron: the highest engagement cost enemy attacks the first player.
  let s = base();
  stage(s, ADG.archer);
  stage(s, ADG.warg);
  s.encounterDeck = [ADG.servant, ADG.gate, ADG.gate];
  run(s, fx("reveal", { player: 0 }));
  s = settle(s);
  assert.ok(
    s.log.some((l) =>
      /Servant of Sauron: Amon Lanc Archer makes an immediate attack/.test(
        l.text,
      ),
    ),
  );
  assert.ok(s.encounterDiscard.includes(ADG.servant));
  // Power Sevenfold: a Dol Guldur location, or an Orc engaged.
  s = base();
  s.encounterDeck = [ADG.sevenfold, ADG.gate, ADG.archer];
  run(s, fx("reveal", { player: 0 }));
  assert.match(s.choice!.title, /^Power Sevenfold · /);
  s = choose(s, `orc:${ADG.archer}`);
  s = settle(s);
  assert.ok(s.engaged.some((u) => u.code === ADG.archer));
  // The Necromancer's Rage: 1 damage to each exhausted character, -1
  // willpower for each damaged character this phase.
  s = base();
  s.phase = "quest";
  s.heroes[0].exhausted = true;
  const will = stats(s, s.heroes[0]).will;
  s.encounterDeck = [ADG.rage, ADG.gate];
  run(s, fx("reveal", { player: 0 }));
  s = settle(s);
  assert.equal(get(s, s.heroes[0].id)!.damage, 1);
  assert.equal(stats(s, get(s, s.heroes[0].id)!).will, will - 1);
  // Fear and Despair: each player exhausts a character; no readying by
  // player card effects this round.
  s = base();
  s.encounterDeck = [ADG.despair, ADG.gate];
  run(s, fx("reveal", { player: 0 }));
  s = choose(s, s.heroes[1].id);
  s = settle(s);
  assert.equal(get(s, s.heroes[1].id)!.exhausted, true);
  assert.equal(H.cannotPlayerReady!(s), true);
  // Fastness of Mirkwood: no more than 5 progress this round; surge at 5
  // city strength or less.
  s = base();
  s.encounterDeck = [ADG.fastness, ADG.gate];
  run(s, fx("reveal", { player: 0 }));
  s = settle(s);
  run(s, fx("successfulQuestProgress", { value: 8, player: 0 }));
  assert.equal(s.progress, 5);
  assert.equal(H.revealedSurge!(s, ADG.fastness), false);
  s.attackDolGuldur!.cityStrength = 5;
  assert.equal(H.revealedSurge!(s, ADG.fastness), true);
  // Power of Lórien: cancel and discard a card just revealed.
  s = base();
  s.attackDolGuldur!.lorien = { player: 0 };
  s.staging = s.staging.filter((u) => u.code !== ADG.power);
  s.encounterDeck = [ADG.army, ADG.gate];
  run(s, fx("reveal", { player: 0 }));
  assert.match(s.choice!.title, /^Revealed · Host of Dol Guldur/);
  s = choose(s, "adg-power");
  s = settle(s);
  assert.ok(!s.staging.some((u) => u.code === ADG.army));
  assert.ok(s.encounterDiscard.includes(ADG.army));
  assert.ok(s.victoryCards!.includes(ADG.power));
  assert.equal(s.attackDolGuldur!.lorien, null);
  // Fear and Despair's shadow: the defender cannot ready this round.
  s = base();
  const archer = engaged(s, ADG.archer);
  archer.shadows = [ADG.despair];
  s.phase = "defense";
  s = defend(s, archer, s.heroes[0]);
  s = settle(s);
  assert.equal(H.cannotReady!(s, get(s, s.heroes[0].id)!), true);
  reload(s);
});

test("Host of Lórien is removed from the game when it leaves play", () => {
  let s = base();
  s.attackDolGuldur!.setAside = s.attackDolGuldur!.setAside.filter(
    (c) => c !== ADG.host,
  );
  const [host] = allies(s, [ADG.host]);
  // Ranged, Sentinel and immune to player card effects from its text; it
  // does not exhaust to quest.
  assert.equal(H.doesNotExhaustToQuest!(s, host), true);
  host.damage = 5;
  const enemy = engaged(s, ADG.archer);
  void enemy;
  forOwner(s, 0, () => {
    host.damage = 6;
  });
  check(s);
  assert.ok(!s.allies.some((u) => u.id === host.id));
  assert.deepEqual(s.attackDolGuldur!.removed, [ADG.host]);
  assert.ok(!s.encounterDiscard.includes(ADG.host));
  reload(s);
});

test("Saves and the scenario panel", () => {
  const s = base(2);
  s.attackDolGuldur!.cityStrength = 13;
  s.attackDolGuldur!.questResources = 2;
  power(s).progress = 9;
  const restored = reload(s);
  assert.deepEqual(restored.attackDolGuldur, s.attackDolGuldur);
  const view = attackDolGuldurPublicState(restored)!;
  assert.equal(view.side, "1B");
  assert.equal(view.stage, 1);
  assert.equal(view.cityStrength, 13);
  assert.equal(view.questResources, 2);
  assert.equal(view.lorien, "staging");
  assert.equal(view.lorienProgress, 9);
  assert.equal(view.hostOfLorien, "aside");
  assert.equal(view.lieutenants[ADG.bane], "aside");
  assert.deepEqual(publicState(restored).attackDolGuldur, view);
  const raw = JSON.parse(JSON.stringify(s));
  raw.stage = 3;
  assert.throws(() => reload(raw));
});
