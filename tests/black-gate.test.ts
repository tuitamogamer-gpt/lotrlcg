import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, canTravel } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, stagingThreat, stats, threatOf } from "../src/game/core";
import { check, destroy, engage, progressLocation } from "../src/game/board";
import { flush } from "../src/game/effects";
import { reduceThreat } from "../src/game/threat-reduction";
import { threatElimination } from "../src/game/threat-elimination";
import { angmarValour } from "../src/game/angmar-player-support";
import {
  firstPlayer,
  forOwner,
  playerOrder,
  seatView,
} from "../src/game/table";
import {
  MOUNTAIN_FIRE_ARAGORN,
  sagaHero,
  sagaRevealPlayer,
} from "../src/game/lotr-saga";
import { mountainFirePlayerAbilityProblem } from "../src/game/mountain-fire-player-cards";
import {
  BG,
  BLACK_GATE_HOOKS,
  BLACK_GATE_RECIPES,
  blackGatePublicState,
  blackGateStageInfo,
} from "../src/game/black-gate";
import {
  FILLER,
  activate,
  allies,
  aragorn,
  base,
  choose,
  created,
  engaged,
  gate,
  hand,
  mouth,
  reload,
  settle,
  stage,
} from "./black-gate-fixtures";
import type { GameState, Unit } from "../src/game/types";

const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
/** The given player reveals a known card from the top of the encounter deck. */
const reveal = (s: GameState, code: string, p = 0) => {
  s.encounterDeck.unshift(code);
  s.queue.push({ kind: "reveal", player: p });
  flush(s);
  return s;
};
const run = (s: GameState, kind: string, p = 0, extra = {}) => {
  s.queue.push(fx(kind, { player: p, ...extra }));
  flush(s);
  return s;
};
const pastReveal = (s: GameState) => {
  while (s.choice && /^Revealed · /.test(s.choice.title))
    s = choose(s, "resolve");
  return s;
};
/** An engaged enemy attacks with the given shadow cards (facedown). */
const defend = (
  s: GameState,
  enemy: Unit,
  defender: Unit | null,
  shadows: string[] = [],
) => {
  s.phase = "defense";
  s.combat = null;
  enemy.shadows = [...shadows];
  enemy.faceupShadows = shadows.map(() => false);
  return act(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender?.id ?? null,
  });
};
const travel = (s: GameState, u: Unit) => {
  s.phase = "travel";
  return act(s, { type: "TRAVEL", id: u.id });
};
const deckSize = (easy: boolean) =>
  BLACK_GATE_RECIPES.find((r) => r.mode === (easy ? "easy" : "standard"))!
    .cards.filter((c) => c.section === "sharedEncounterDeck")
    .reduce((n, c) => n + c.quantity, 0);
const GUARD = "01013",
  SNOWBOURN = "01016",
  COMMON_CAUSE = "01021",
  BLADE = "01039",
  TEST_OF_WILL = "01050";
/** A hero of a player other than the Fellowship Aragorn. */
const hero = (s: GameState, p = 0) =>
  seatView(s, p).heroes.find((h) => h.code !== MOUNTAIN_FIRE_ARAGORN)!;

test("Setup: The Black Gate and The Mouth of Sauron are in the staging area, Gwaihir is set aside, the first player controls the Fellowship Aragorn, Dire raises the elimination level to 99 and the embassy pairs four player cards with four encounter cards, in one to four players and both difficulties", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = created(players, easy, 601 + players);
      assert.deepEqual(
        s.staging.map((u) => u.code),
        [BG.gate, BG.mouth],
      );
      assert.deepEqual(s.blackGate!.setAside, [BG.gwaihir]);
      assert.equal(sagaHero(s)?.code, MOUNTAIN_FIRE_ARAGORN);
      assert.ok(
        seatView(s, firstPlayer(s)).heroes.some(
          (h) => h.code === MOUNTAIN_FIRE_ARAGORN,
        ),
      );
      assert.equal(threatElimination(s), 99);
      assert.equal(s.encounterDeck.length, deckSize(easy) - 4);
      const pairs = s.blackGate!.embassy!;
      assert.equal(pairs.length, 4);
      // In player order, one card at a time until there are 4.
      const owners = pairs.map((p) => p.owner).sort();
      const expected = Array.from({ length: 4 }, (_, i) => i % players).sort();
      assert.deepEqual(owners, expected);
      const costs = pairs.map((p) => Number(card(p.unit.code).cost) || 0);
      assert.deepEqual(
        costs,
        [...costs].sort((a, b) => b - a),
      );
      const threats = pairs.map((p) => Number(card(p.encounter).threat) || 0);
      assert.deepEqual(
        threats,
        [...threats].sort((a, b) => b - a),
      );
      assert.match(s.choice!.title, /^Embassy from The Dark Tower · /);
      assert.equal(blackGatePublicState(s)!.embassy, 4);
    }
  assert.equal(deckSize(false), 46);
  assert.equal(deckSize(true), 37);
});

test("Embassy from The Dark Tower: for each pair the first player discards both cards or reveals the encounter card to play the player card at no cost; with no possible play only the discard remains; then 2A adds a different Orc, Troll or Nazgûl enemy for each player and shuffles Gwaihir into the encounter deck", () => {
  let s = base(1, 1);
  s.deck = [GUARD, BLADE, SNOWBOURN, COMMON_CAUSE, ...s.deck];
  s.encounterDeck = [
    BG.hour,
    BG.troll,
    BG.waste,
    BG.bowman,
    BG.nazgul,
    BG.waste,
  ];
  const resources = s.heroes.map((h) => h.resources);
  s = run(s, "bgEmbassy");
  assert.deepEqual(
    s.blackGate!.embassy!.map((p) => [p.unit.code, p.encounter]),
    [
      [GUARD, BG.troll],
      [BLADE, BG.waste],
      [SNOWBOURN, BG.bowman],
      [COMMON_CAUSE, BG.hour],
    ],
  );
  assert.match(
    s.choice!.title,
    /^Embassy from The Dark Tower · Guard of the Citadel and Gorgoroth Hill-troll/,
  );
  s = choose(s, "reveal");
  s = pastReveal(s);
  assert.ok(
    s.staging.some((u) => u.code === BG.troll),
    "the encounter card is revealed",
  );
  assert.ok(
    s.allies.some((u) => u.code === GUARD),
    "the ally is played",
  );
  assert.deepEqual(
    s.heroes.map((h) => h.resources),
    resources,
    "at no cost",
  );
  // Blade of Gondolin with Waste of Dagorlad: the owner chooses a hero.
  s = choose(s, "reveal");
  s = pastReveal(s);
  assert.match(s.choice!.title, /^Blade of Gondolin · Choose a target/);
  const target = s.choice!.options[0].id;
  s = choose(s, target);
  assert.ok(get(s, target)!.attachments.some((a) => a.code === BLADE));
  assert.ok(s.staging.some((u) => u.code === BG.waste));
  // Snowbourn Scout and Easterling Bowman: discard both.
  s = choose(s, "discard");
  assert.ok(s.discard.includes(SNOWBOURN));
  assert.ok(s.encounterDiscard.includes(BG.bowman));
  // Common Cause cannot be played: its pair is discarded at once.
  s = settle(s);
  assert.ok(s.discard.includes(COMMON_CAUSE));
  assert.ok(s.encounterDiscard.includes(BG.hour));
  assert.equal(s.blackGate!.embassy!.length, 0);
  // 1B has no quest points: 2A follows.
  s.blackGate!.setAside = [BG.gwaihir];
  s.encounterDeck = [BG.nazgul, BG.waste, BG.troll];
  s = base2A(s);
  assert.equal(s.stage, 2);
  assert.equal(s.blackGate!.currentQuest, BG.battle);
  assert.ok(
    s.encounterDeck.includes(BG.gwaihir),
    "Gwaihir is shuffled into the encounter deck",
  );
  assert.deepEqual(s.blackGate!.setAside, []);
  assert.equal(blackGateStageInfo(s)!.quest, 0);
  // Two players search for different enemies.
  let t = base(2, 1);
  t.blackGate!.setAside = [BG.gwaihir];
  t.encounterDeck = [BG.nazgul, BG.waste, BG.troll];
  t.encounterDiscard = [BG.nazgul];
  t = run(t, "bgEmbassyDone");
  assert.match(
    t.choice!.title,
    /^The Battle of the Morannon · Search for a different Orc, Troll or Nazgûl enemy/,
  );
  t = choose(t, `deck-${BG.nazgul}`);
  assert.ok(
    !t.choice!.options.some((o) => o.code === BG.nazgul),
    "the second player takes a different enemy",
  );
  t = choose(t, `deck-${BG.troll}`);
  t = settle(t);
  assert.deepEqual(
    t.staging
      .filter((u) => card(u.code).type_code === "enemy")
      .map((u) => u.code)
      .sort(),
    [BG.mouth, BG.nazgul, BG.troll].sort(),
  );
});
function base2A(s: GameState) {
  s = run(s, "bgEmbassyDone");
  return settle(s);
}

test("The Black Gate: at the beginning of each quest phase it gains a resource and each player raises his threat by 1; +1 threat for each resource; no travel there; 2B cannot be defeated and the first player reveals 1 encounter card for each resource", () => {
  let s = base(2, 2, 2);
  assert.equal(threatOf(s, gate(s)!), 2);
  assert.equal(
    stagingThreat(s),
    2 + 4,
    "The Black Gate and The Mouth of Sauron",
  );
  assert.deepEqual(
    BLACK_GATE_HOOKS.questBegin!(s)!.map((e) => e.kind),
    ["bgGate"],
  );
  s = run(s, "bgGate");
  assert.equal(gate(s)!.resources, 3);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    [21, 21],
  );
  assert.equal(blackGatePublicState(s)!.gate, 3);
  s.phase = "travel";
  assert.match(
    String(canTravel(s, gate(s)!)),
    /cannot travel to The Black Gate/,
  );
  // 2B: X reveals for X resources, all by the first player.
  assert.equal(BLACK_GATE_HOOKS.extraStagingReveals!(s), 3 - 2);
  assert.equal(BLACK_GATE_HOOKS.stagingRevealsByFirstPlayer!(s), true);
  assert.equal(sagaRevealPlayer(s, 1, firstPlayer(s)), firstPlayer(s));
  // The stage cannot be defeated.
  s.progress = 99;
  check(s);
  flush(s);
  assert.equal(s.stage, 2);
  assert.equal(s.status, "playing");
});

test("The Battle of the Morannon: after the players quest unsuccessfully, the active location is discarded, even Towers of the Teeth, which is immune to player card effects", () => {
  let s = base(1, 2);
  const towers = activate(s, BG.towers);
  s = run(s, "failedQuest", 0, { value: 2 });
  assert.equal(s.activeLocation, null);
  assert.ok(s.encounterDiscard.includes(towers.code));
  assert.equal(s.threat, 22);
  // Without an active location the failure only raises threat.
  s = run(s, "failedQuest", 0, { value: 1 });
  assert.equal(s.threat, 23);
});

test("Dire: threat elimination at 99, no more than 1 threat reduction each round from non-boon player cards, and Valour at 80", () => {
  let s = base(1, 2, 5);
  s.threat = 60;
  check(s);
  assert.equal(s.status, "playing", "60 threat no longer eliminates");
  assert.equal(reduceThreat(s, 3, TEST_OF_WILL), 1, "only 1 this round");
  assert.equal(s.threat, 59);
  assert.equal(reduceThreat(s, 2, TEST_OF_WILL), 0);
  assert.equal(
    reduceThreat(s, 2, "146041", "player-card"),
    2,
    "a boon is not limited",
  );
  assert.equal(s.threat, 57);
  s.used = s.used.filter((k) => !k.startsWith("round:"));
  assert.equal(reduceThreat(s, 4, TEST_OF_WILL), 1, "a new round");
  s.threat = 50;
  assert.equal(angmarValour(s), false, "Valour needs 80 threat");
  s.threat = 80;
  assert.equal(angmarValour(s), true);
  s.threat = 99;
  check(s);
  assert.equal(s.status, "lost");
  assert.match(
    s.reason ?? "",
    /The players held the Morannon for 5 rounds: 5 resources on The Black Gate\.$/,
  );
});

test("Aragorn (The Mountain of Fire): the first player controls him; his Action spends 1 resource to ready him once per phase; if he leaves play the players lose", () => {
  let s = base(1, 2, 3);
  const a = aragorn(s)!;
  assert.ok(a);
  a.exhausted = true;
  s.phase = "quest";
  assert.equal(mountainFirePlayerAbilityProblem(s, a), undefined);
  s = act(s, { type: "ABILITY", id: a.id });
  const after = aragorn(s)!;
  assert.equal(after.exhausted, false);
  assert.equal(after.resources, 9);
  after.exhausted = true;
  assert.equal(
    mountainFirePlayerAbilityProblem(s, after),
    "Aragorn's Action is limited to once per phase.",
  );
  s = base(1, 2, 3);
  destroy(s, aragorn(s)!, false);
  check(s);
  assert.equal(s.status, "lost");
  assert.match(
    s.reason ?? "",
    /^Aragorn has left play\. The players lose the game\. The players held the Morannon for 3 rounds/,
  );
});

test("Locations: Towers of the Teeth, Beleaguered Hills, Waste of Dagorlad and Wall of Morannon", () => {
  // Towers of the Teeth: X is the most characters a player controls; no allies played while active.
  let s = base(2, 2);
  const towers = stage(s, BG.towers);
  allies(s, [GUARD, GUARD], 1);
  assert.equal(threatOf(s, towers), 5, "3 heroes and 2 allies");
  activate(s, BG.towers);
  assert.match(
    String(BLACK_GATE_HOOKS.playProblem!(s, GUARD)),
    /players cannot play allies/,
  );
  assert.equal(BLACK_GATE_HOOKS.playProblem!(s, BLADE), null);
  // Beleaguered Hills: each player engages a non-unique enemy; staging threat
  // is reduced by the engaged enemies' threat.
  s = base(2, 2);
  const hills = stage(s, BG.hills);
  const orc = stage(s, BG.orc);
  const soldier = stage(s, BG.soldier);
  s = travel(s, hills);
  assert.match(
    s.choice!.title,
    /^Beleaguered Hills · Engage a non-unique enemy in the staging area/,
  );
  assert.ok(
    !s.choice!.options.some((o) => o.code === BG.mouth),
    "not The Mouth of Sauron",
  );
  s = choose(s, soldier.id);
  s = settle(s);
  assert.ok(seatView(s, 0).engaged.some((u) => u.id === soldier.id));
  assert.ok(seatView(s, 1).engaged.some((u) => u.id === orc.id));
  assert.equal(
    stagingThreat(s),
    Math.max(0, threatOf(s, gate(s)!) + 4 - (3 + 1)),
    "reduced by the engaged Uruk Soldier and Orc of Mordor",
  );
  // Waste of Dagorlad: each ally's printed text box is blank.
  s = base(1, 2);
  const [scout] = allies(s, [SNOWBOURN]);
  activate(s, BG.waste);
  assert.equal(BLACK_GATE_HOOKS.characterBlanked!(s, scout), true);
  assert.equal(BLACK_GATE_HOOKS.characterBlanked!(s, hero(s)), false);
  // Wall of Morannon: engaged enemies return; the staging area is immune.
  s = base(1, 2);
  const wall = stage(s, BG.wall);
  const nazgul = engaged(s, BG.nazgul);
  s = travel(s, wall);
  s = settle(s);
  assert.ok(
    s.staging.some((u) => u.id === nazgul.id),
    "the engaged enemy returns",
  );
  assert.equal(BLACK_GATE_HOOKS.immune!(s, get(s, nazgul.id)!), true);
});

test("Slopes of Cirith Gorgor and Reeking Moat leave play: an enemy from the reshuffled deck, and the enemies under the Moat, engage the first player", () => {
  let s = base(2, 2);
  const slopes = activate(s, BG.slopes);
  s.encounterDeck = [];
  s.encounterDiscard = [BG.waste, BG.troll];
  progressLocation(s, slopes, 1);
  flush(s);
  s = settle(s);
  assert.ok(
    seatView(s, firstPlayer(s)).engaged.some((u) => u.code === BG.troll),
    "Gorgoroth Hill-troll engages the first player",
  );
  // Reeking Moat: a non-unique, non-Nazgûl enemy goes under it.
  s = base(2, 2);
  const moat = stage(s, BG.moat);
  const orc = stage(s, BG.orc);
  stage(s, BG.nazgul);
  s = travel(s, moat);
  assert.match(
    s.choice!.title,
    /^Reeking Moat · Place a non-unique, non-Nazgûl enemy facedown under it/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [orc.id],
  );
  s = choose(s, orc.id);
  assert.ok(!s.staging.some((u) => u.id === orc.id));
  assert.equal(blackGatePublicState(s)!.moat, 1);
  // The Moat leaves play: the enemy under it engages the first player.
  s = run(s, "failedQuest", 0, { value: 1 });
  s = settle(s);
  assert.ok(seatView(s, firstPlayer(s)).engaged.some((u) => u.id === orc.id));
  assert.equal(blackGatePublicState(s)!.moat, 0);
});

test("The Mouth of Sauron: immune, he cannot leave the staging area or engage, and he attacks a player who cancels a 'when revealed' effect", () => {
  let s = base(1, 2);
  const m = mouth(s)!;
  assert.deepEqual(
    [stats(s, m).attack, stats(s, m).defense, stats(s, m).health],
    [6, 5, 11],
  );
  assert.equal(BLACK_GATE_HOOKS.cannotLeave!(s, m), true);
  assert.equal(BLACK_GATE_HOOKS.cannotEngage!(s, m), true);
  engage(s, m);
  assert.ok(
    s.staging.some((u) => u.id === m.id),
    "it stays in the staging area",
  );
  // A Test of Will cancels Hell-hawk: The Mouth of Sauron attacks the canceller.
  s = base(3, 2);
  const spirit = 2;
  hand(s, [TEST_OF_WILL], spirit);
  forOwner(s, spirit, () => {
    for (const h of s.heroes) h.resources = 3;
  });
  s.phase = "staging";
  s = reveal(s, BG.hawk);
  assert.match(s.choice!.title, /^Revealed[:·] Hell-hawk/);
  const cancel = s.choice!.options.find((o) => o.code === TEST_OF_WILL)!;
  assert.ok(cancel, JSON.stringify(s.choice!.options.map((o) => o.id)));
  s = choose(s, cancel.id);
  assert.match(s.choice!.title, /^The Mouth of Sauron · Immediate attack/);
  s = settle(s, "undefended");
  assert.ok(
    s.log.some((l) =>
      /The Mouth of Sauron makes an immediate attack against .*who canceled/.test(
        l.text,
      ),
    ),
  );
  assert.ok(seatView(s, spirit).discard.includes(TEST_OF_WILL));
});

test("Enemies: Nazgûl of Mordor after its attack, Gorgoroth Hill-troll's kill, Easterling Bowman and Warrior of Rhûn", () => {
  // Nazgûl of Mordor: no non-Morgul attachments; after it attacks, threat 4 or the staging area.
  let s = base(1, 2);
  const nazgul = engaged(s, BG.nazgul);
  assert.equal(BLACK_GATE_HOOKS.cannotAttach!(s, nazgul, BLADE), true);
  assert.equal(BLACK_GATE_HOOKS.cannotAttach!(s, nazgul, BG.hawk), false);
  s = defend(s, nazgul, aragorn(s)!);
  s = settle(s, "return");
  assert.ok(
    s.staging.some((u) => u.id === nazgul.id),
    "it returns to the staging area",
  );
  s = base(1, 2);
  const again = engaged(s, BG.nazgul);
  s = defend(s, again, aragorn(s)!);
  s = settle(s, "threat");
  assert.equal(s.threat, 24);
  // Gorgoroth Hill-troll: a destroyed character discards a random card and raises threat by its cost.
  s = base(1, 2);
  const troll = engaged(s, BG.troll);
  assert.equal(BLACK_GATE_HOOKS.cannotAttach!(s, troll, BLADE), true);
  const [guard] = allies(s, [GUARD]);
  hand(s, [GUARD]);
  s = defend(s, troll, guard);
  s = settle(s);
  assert.ok(!s.allies.some((u) => u.id === guard.id));
  assert.equal(s.hand.length, 0);
  assert.equal(s.threat, 22, "Guard of the Citadel costs 2");
  // Easterling Bowman: 1 damage to a questing character; Archery 1.
  s = base(1, 2);
  hero(s).committed = true;
  s.phase = "staging";
  s = reveal(s, BG.bowman);
  s = pastReveal(s);
  assert.match(
    s.choice!.title,
    /^Easterling Bowman · Deal 1 damage to a questing character you control/,
  );
  s = choose(s, hero(s).id);
  assert.equal(hero(s).damage, 1);
  // Warrior of Rhûn: remove a questing character from the quest.
  s = base(1, 2);
  const quester = hero(s);
  quester.committed = true;
  s.committedIds = [quester.id];
  s.phase = "staging";
  s = reveal(s, BG.warrior);
  s = settle(pastReveal(s));
  assert.equal(get(s, quester.id)!.committed, false);
  // Easterling Bowman's shadow: the attacker engages the next player and attacks.
  s = base(2, 2);
  const orc = engaged(s, BG.orc, 0);
  s = defend(s, orc, aragorn(s)!, [BG.bowman]);
  s = settle(s);
  assert.ok(
    seatView(s, 1).engaged.some((u) => u.id === orc.id),
    "it engages the next player",
  );
  assert.ok(
    s.log.some((l) =>
      /Easterling Bowman: Orc of Mordor engages .* and makes an attack/.test(
        l.text,
      ),
    ),
  );
  // Warrior of Rhûn's shadow: the defender cannot ready this round.
  s = base(1, 2);
  const enemy = engaged(s, BG.orc);
  const defender = aragorn(s)!;
  s = defend(s, enemy, defender, [BG.warrior]);
  s = settle(s);
  assert.equal(BLACK_GATE_HOOKS.cannotReady!(s, get(s, defender.id)!), true);
  s.round += 1;
  assert.equal(BLACK_GATE_HOOKS.cannotReady!(s, get(s, defender.id)!), false);
});

test("Gwaihir: the first player takes control of him, or spends 1 Fellowship resource to discard him and a non-unique enemy in the staging area; as a shadow, the attack deals no damage", () => {
  let s = base(1, 2);
  const troll = stage(s, BG.troll);
  s.phase = "staging";
  s = reveal(s, BG.gwaihir);
  s = pastReveal(s);
  assert.match(s.choice!.title, /^Gwaihir · Choose one/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["control", `discard-${troll.id}`],
  );
  const t = choose(s, `discard-${troll.id}`);
  assert.ok(!t.staging.some((u) => u.id === troll.id));
  assert.ok(
    t.encounterDiscard.includes(BG.gwaihir) &&
      t.encounterDiscard.includes(BG.troll),
  );
  assert.equal(aragorn(t)!.resources, 9);
  s = choose(s, "control");
  const eagle = s.allies.find((u) => u.code === BG.gwaihir)!;
  assert.ok(eagle, "Gwaihir is an ally of the first player");
  assert.equal(blackGatePublicState(s)!.gwaihir, "ally");
  destroy(s, eagle, true);
  assert.ok(
    s.encounterDiscard.includes(BG.gwaihir),
    "an objective-ally goes to the encounter discard pile",
  );
  // Shadow: this attack deals no damage.
  s = base(1, 2);
  const enemy = engaged(s, BG.troll);
  s = defend(s, enemy, null, [BG.gwaihir]);
  s = settle(s);
  assert.ok(s.heroes.every((h) => h.damage === 0));
});

test("Treacheries: Hell-hawk, The Hour of Doom, Jaws of Steel, Rage Filled Him and Onslaught of Mordor", () => {
  // Hell-hawk: attach to a Nazgûl enemy (+2 threat, attack and defense, immune) or search for one.
  let s = base(1, 2);
  const nazgul = stage(s, BG.nazgul);
  s.encounterDiscard = [BG.nazgul];
  s.phase = "staging";
  s = reveal(s, BG.hawk);
  s = pastReveal(s);
  assert.match(s.choice!.title, /^Hell-hawk · Choose one/);
  const searched = choose(s, "search");
  assert.equal(
    searched.staging.filter((u) => u.code === BG.nazgul).length,
    2,
    "a Nazgûl from the discard pile joins the staging area",
  );
  s = choose(s, "attach");
  s = settle(s);
  const host = get(s, nazgul.id)!;
  assert.ok(host.attachments.some((a) => a.code === BG.hawk));
  assert.equal(threatOf(s, host), 4 + 2);
  assert.deepEqual([stats(s, host).attack, stats(s, host).defense], [8, 6]);
  assert.equal(BLACK_GATE_HOOKS.immune!(s, host), true);
  assert.ok(!s.encounterDiscard.includes(BG.hawk), "Hell-hawk stays attached");
  // The Hour of Doom: Doomed 1, then threat for each character or the highest cost ally.
  s = base(1, 2);
  allies(s, [GUARD, SNOWBOURN]);
  s.phase = "staging";
  s = reveal(s, BG.hour);
  s = pastReveal(s);
  assert.equal(s.threat, 21, "Doomed 1");
  assert.match(s.choice!.title, /^The Hour of Doom · Choose one/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.label),
    ["Raise your threat by 5", "Discard Guard of the Citadel"],
  );
  s = choose(s, s.choice!.options[1].id);
  s = settle(s);
  assert.ok(!s.allies.some((u) => u.code === GUARD));
  assert.ok(s.discard.includes(GUARD));
  // Jaws of Steel: X damage among your characters, X the resources on The Black Gate.
  s = base(1, 2, 2);
  s.phase = "staging";
  s = reveal(s, BG.jaws);
  s = pastReveal(s);
  assert.match(
    s.choice!.title,
    /^Jaws of Steel · Assign damage among characters you control · 2 remaining/,
  );
  const a = aragorn(s)!.id;
  s = choose(s, a);
  assert.match(s.choice!.title, /· 1 remaining/);
  s = choose(s, a);
  s = settle(s);
  assert.equal(get(s, a)!.damage, 2);
  // Rage Filled Him: The Mouth of Sauron attacks you; a destroyed character raises threat by 4.
  s = base(1, 2);
  const [guard] = allies(s, [GUARD]);
  s.phase = "staging";
  s = reveal(s, BG.rage);
  s = pastReveal(s);
  assert.match(s.choice!.title, /^The Mouth of Sauron · Immediate attack/);
  s = choose(s, guard.id);
  s = settle(s);
  assert.ok(!s.allies.some((u) => u.id === guard.id));
  assert.equal(s.threat, 24);
  // Onslaught of Mordor: 1 damage to a questing character; -1 willpower and no healing this phase.
  s = base(1, 2);
  const quester = hero(s);
  quester.committed = true;
  s.phase = "staging";
  s = reveal(s, BG.onslaught);
  s = settle(pastReveal(s));
  assert.equal(get(s, quester.id)!.damage, 1);
  assert.equal(
    stats(s, get(s, quester.id)!).will,
    Number(card(quester.code).willpower) - 1,
  );
  assert.equal(BLACK_GATE_HOOKS.cannotHeal!(s, get(s, quester.id)!), true);
  s.phase = "travel";
  assert.equal(BLACK_GATE_HOOKS.cannotHeal!(s, get(s, quester.id)!), false);
});

test("Shadows of The Black Gate Opens: Jaws of Steel, Rage Filled Him, The Hour of Doom and Onslaught of Mordor; the Orcs of Mordor engage and shoot as in Cirith Ungol", () => {
  const attack = (shadow: string, code = BG.orc, resources = 3) => {
    const s = base(1, 2, resources);
    const enemy = engaged(s, code);
    return { s: defend(s, enemy, aragorn(s)!, [shadow]), enemy };
  };
  let { s } = attack(BG.jaws);
  assert.ok(
    s.log.some((l) =>
      /Jaws of Steel: the attacking enemy gets \+3 attack/.test(l.text),
    ),
  );
  ({ s } = attack(BG.rage));
  assert.ok(
    s.log.some((l) =>
      /Rage Filled Him: the attacking enemy gets \+1 attack/.test(l.text),
    ),
  );
  ({ s } = attack(BG.hour));
  assert.ok(
    s.log.some((l) =>
      /The Hour of Doom: you control no non-objective attachment/.test(l.text),
    ),
  );
  // Onslaught of Mordor: engage a non-unique enemy in the staging area and deal it a shadow card.
  s = base(1, 2);
  const enemy = engaged(s, BG.orc);
  const troll = stage(s, BG.troll);
  s = defend(s, enemy, aragorn(s)!, [BG.onslaught]);
  assert.match(
    s.choice!.title,
    /^Onslaught of Mordor · Engage a non-unique enemy/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [troll.id],
  );
  s = choose(s, troll.id);
  assert.ok(s.engaged.some((u) => u.id === troll.id));
  assert.equal(get(s, troll.id)!.shadows.length, 1);
  // Orcs of Mordor: Uruk Soldier engages and raises threat by 2.
  s = base(1, 2);
  const soldier = stage(s, BG.soldier);
  engage(s, soldier);
  flush(s);
  s = settle(s);
  assert.equal(s.threat, 22);
  // Archery from the staging area: Snaga Archer 2 and Easterling Bowman 1.
  s = base(1, 2);
  stage(s, BG.archer);
  stage(s, BG.bowman);
  const before = s.queue.length;
  BLACK_GATE_HOOKS.combatBegin!(s);
  assert.equal(
    s.queue
      .slice(0, s.queue.length - before + 1)
      .find((e) => e.kind === "heirsArchery")?.value,
    3,
  );
});

test("The public state follows the score, The Mouth of Sauron, Gwaihir and the embassy", () => {
  const s = base(2, 2, 4);
  assert.deepEqual(blackGatePublicState(s), {
    currentQuest: BG.battle,
    stage: 2,
    gate: 4,
    mouth: true,
    gwaihir: "encounter",
    moat: 0,
    embassy: 0,
    nazgul: 0,
  });
  s.blackGate!.setAside = [BG.gwaihir];
  assert.equal(blackGatePublicState(s)!.gwaihir, "set-aside");
  assert.equal(
    BLACK_GATE_HOOKS.lossReason!(s, "The last hero has fallen."),
    "The last hero has fallen. The players held the Morannon for 4 rounds: 4 resources on The Black Gate.",
  );
  void FILLER;
});
