import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyAction } from "../src/game/engine";
import { card, encounterCards } from "../src/game/cards";
import { check } from "../src/game/board";
import { locationQuest, make } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { addQuestProgress } from "../src/game/side-quests";
import {
  gramAdvance,
  gramArea,
  gramCardEntered,
  gramCardLeaves,
  gramState,
} from "../src/game/mount-gram";
import { GRAM as G } from "../src/game/mount-gram-support";
import { forOwner, globalPlayerOrder, seatView } from "../src/game/table";
import {
  NIGHTMARE,
  NIGHTMARE_AA as N,
  nightmareCardOf,
  nightmareEncounterDecks,
  nightmareStatus,
} from "../src/game/nightmare";
import type { Effect, GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  nightmareForTwo,
  nightmareGame,
  opening,
  pick,
  shadow,
  valid,
} from "./nightmare-fixtures";
import {
  base,
  captive,
  capturedDeck,
  choose,
  flight,
  reload,
  settle,
} from "./mount-gram-fixtures";

const ID = "escape-from-mount-gram";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
const hooks = (s: GameState) => batch4Scenario(s);
const nightmare = (s: GameState) => {
  s.nightmareMode = true;
  s.nightmare = {};
  return s;
};
/** A quiet Nightmare dungeon (the scenario's own fixture: stage 2, one dungeon for each player). */
const board = (players = 1) => nightmare(base(players));
/** The final stage, as a Nightmare game. */
const final = (players = 1) => nightmare(flight(players));
const queue = (s: GameState, ...effects: Effect[]) => {
  s.queue.unshift(...effects);
  return s;
};
/** Resolve the queue, answering each choice with `answer` (or the first option). */
function run(
  s: GameState,
  answer: (s: GameState) => string | undefined = () => undefined,
) {
  flush(s);
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 80, "decisions terminate");
    s = choose(reload(s), answer(s) ?? s.choice.options[0].id);
  }
  return s;
}
/** The card on top of the encounter deck, revealed by the first player. */
const reveal = (s: GameState, code: string) => {
  s.encounterDeck.unshift(code);
  return queue(s, { kind: "reveal", player: 0 });
};
const stage = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const engaged = (s: GameState, code: string) => {
  const u = make(s, code);
  s.engaged.push(u);
  return u;
};
const hand = (s: GameState, codes: string[], p = 0) =>
  forOwner(s, p, () => {
    for (const code of codes) {
      const u = make(s, code);
      u.owner = p;
      s.hand.push(u);
    }
  });
const captured = (s: GameState, host: Unit) =>
  gramState(s)!.captured[host.id] ?? [];
const deckOf = (s: GameState, p = 0) =>
  (gramState(s)!.capturedDecks[p] ?? []).map((u) => u.code);
const options = (s: GameState) => s.choice?.options.map((o) => o.id) ?? [];
/** Guard of the Citadel (cost 2), Snowbourn Scout (cost 1) and Gandalf (cost 5), allies; Celebrían's Stone (an Item) and Steward of Gondor (a Title), attachments; Sneak Attack, an event. */
const GUARD = "01013",
  SCOUT = "01016",
  GANDALF = "01073",
  STONE = "01027",
  STEWARD = "01026",
  SNEAK = "01023",
  /** Old Forest Road: no shadow effect. */
  ROAD = "01099";
/** Heroes the starter decks set aside (the first seat starts with 01001, the second with 01004). */
const [SET_ASIDE_0, SET_ASIDE_1] = ["01002", "01005"];

test("Nightmare: Escape from Mount Gram's setup card and Nightmare Deck carry their scans' texts and stats", () => {
  const c = card(N.gramCard);
  assert.deepEqual(
    [c.name, c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    [
      "Escape from Mount Gram",
      "nightmare",
      "nightmare",
      "Escape from Mount Gram - Nightmare",
      true,
    ],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for the Escape from Mount Gram scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n4x Prison Cell\n3x Dungeon Guard\n1x Jailor Gornákh\n2x Interrogation\n1x Goblin Tormentor\n1x Cruel Torturer\nThen, .*\nNote: This Nightmare Deck includes a card for the Angmar Orcs encounter set, Orc of Thaurdir\./,
    "the scan's 1x Goblin Tormentor and its Note",
  );
  assert.match(
    c.back_text!,
    /^You are playing Nightmare mode\.\nForced: .*shuffle any remaining heroes into your captured deck, then place the facedown set aside hero on the bottom of your captured deck\.\nThe players cannot win the game while a hero is captured \(underneath an encounter card, or in their captured deck\)\.$/,
  );
  const jailor = card(N.jailor);
  assert.deepEqual(
    [
      jailor.name,
      jailor.is_unique,
      jailor.traits,
      jailor.engagement,
      jailor.threat,
      jailor.attack,
      jailor.defense,
      jailor.health,
      jailor.victory,
    ],
    ["Jailor Gornákh", true, "Goblin. Orc.", 45, 4, 5, 5, 14, 5],
  );
  assert.match(
    jailor.text!,
    /captures them underneath Jailor Gornákh\.\nForced: After a player rescues any number of cards, Jailor Gornákh attacks that player\.$/,
  );
  const guard = card(N.prisonGuard);
  assert.deepEqual(
    [guard.defense, guard.printed_stats?.defense, guard.quantity],
    [1, "1", 3],
    "the scan's 1 defense (the catalogue had 2)",
  );
  assert.match(
    card(N.prisonCell).text!,
    /^Capture 1\.\nWhile Prison Cell is the active location, it gains: "Planning Action: Rescue/,
  );
  assert.equal(card(N.chamber).printed_stats?.quest, "X");
  assert.match(
    card(N.chamber).text!,
    /^Capture 1\. Surge\.\nX is twice number of cards captured underneath Torture Chamber\.\nForced: /,
  );
  assert.match(card(N.torment).text!, /^Surge\.\nWhen Revealed: Attach to/);
  assert.equal(card(N.vault).traits, undefined, "no traits");
  assert.deepEqual(
    [card(N.vault).type_code, card(N.vault).quest, card(N.vault).victory],
    ["encounter-side-quest", 9, 10],
  );
  assert.match(
    card(N.vault).text!,
    /^Surge\. Capture 3\.\nForced: .*\nForced: .*discard the rest\.$/,
  );
  assert.match(
    card(N.thaurdir).shadow!,
    /^Shadow: For each damage dealt by this attack, discard the top card of your captured deck\.$/,
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Escape from Mount Gram - Nightmare",
  );
  assert.equal(set.length, 9);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(
    art.filter((x) => set.some((y) => y.code === x.code)).length,
    10,
  );
});

test("Nightmare: Escape from Mount Gram's Nightmare decks match their source recipe, and each captured deck ends with its set-aside hero", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const tally = (list: string[]) =>
    list.reduce<Record<string, number>>(
      (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
      {},
    );
  const pile = (
    r: { cards: { code: string; quantity: number; section: string }[] },
    ...sections: string[]
  ) =>
    r.cards
      .filter((c) => sections.includes(c.section) && c.code !== N.gramCard)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const nightmareRecipe = recipes.find((r) => r.id === "N05.5")!;
  const standard = recipes.find((r) => r.id === "Q05.5")!;
  // The initial encounter deck (with the setup's Prison Cells), the cards
  // set aside, and the Angmar Orcs.
  const piles = (r: typeof standard) => [
    pile(r, "sharedEncounterDeck", "sharedStagingArea"),
    pile(r, "sharedSetAside"),
    pile(r, "sharedEncounterDeck2"),
  ];
  const decks = nightmareEncounterDecks(ID, piles(standard), (code) =>
    code === N.jailor ? 1 : code === N.thaurdir ? 2 : 0,
  );
  assert.deepEqual(decks.map(tally), piles(nightmareRecipe).map(tally));
  assert.deepEqual(
    decks.map((d) => d.length),
    [28, 2, 12],
  );
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.gramCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), N.gramCard);
    assert.ok(valid(s));
    const q = gramState(s)!;
    assert.deepEqual(
      q.setAside.map((u) => u.code).sort(),
      [G.gate, N.jailor].sort(),
    );
    assert.equal(q.orcDeck.filter((c) => c === N.thaurdir).length, 3);
    for (const p of globalPlayerOrder(s)) {
      const deck = q.capturedDecks[p] ?? [];
      // Stage 2's Prison Cells may already hold the top cards.
      const heroes = [...deck, ...Object.values(q.captured).flat()].filter(
        (u) => u.owner === p && card(u.code).type_code === "hero",
      );
      assert.equal(heroes.length, 2, "both other heroes are captured");
      assert.equal(
        card(deck.at(-1)!.code).type_code,
        "hero",
        "the facedown set-aside hero is on the bottom",
      );
    }
    assert.match(
      nightmareStatus(s)[0],
      /^Escape from Mount Gram · Nightmare mode/,
    );
  }
});

test("Nightmare: the players cannot win Escape from Mount Gram while a hero is captured, underneath a card or in a captured deck", () => {
  let s = final();
  s.progress = 16;
  capturedDeck(s, [SCOUT, SET_ASIDE_0]);
  assert.equal(hooks(s).cannotWin!(s), true);
  gramAdvance(s);
  assert.equal(s.status, "playing", "a hero in a captured deck");
  gramState(s)!.capturedDecks = {};
  const orc = stage(s, N.thaurdir);
  captive(s, orc, SET_ASIDE_0);
  gramAdvance(s);
  assert.equal(s.status, "playing", "a hero underneath an enemy");
  delete gramState(s)!.captured[orc.id];
  captive(s, orc, SCOUT);
  capturedDeck(s, [GUARD]);
  assert.equal(hooks(s).cannotWin!(s), false, "allies are no heroes");
  gramAdvance(s);
  assert.equal(s.status, "won");
  // A standard game is won with a captured hero.
  s = flight();
  s.progress = 16;
  capturedDeck(s, [SET_ASIDE_0]);
  gramAdvance(s);
  assert.equal(s.status, "won");
});

test("Nightmare: Jailor Gornákh captures the captured decks' heroes as it enters play, and attacks each player who rescues cards", () => {
  let s = final(2);
  capturedDeck(s, [SCOUT, SET_ASIDE_0], 0);
  capturedDeck(s, [SET_ASIDE_1], 1);
  const jailor = stage(s, N.jailor);
  hooks(s).cardEntered!(s, jailor, false, false);
  assert.deepEqual(
    captured(s, jailor)
      .map((u) => u.code)
      .sort(),
    [SET_ASIDE_0, SET_ASIDE_1],
  );
  assert.deepEqual([deckOf(s, 0), deckOf(s, 1)], [[SCOUT], []]);
  assert.ok(valid(s));
  // The second player rescues a card: the Jailor attacks them.
  const orc = stage(s, N.thaurdir);
  captive(s, orc, GUARD, 0);
  s.staging = s.staging.filter((u) => u.id !== orc.id);
  forOwner(s, 1, () => gramCardLeaves(s, orc));
  assert.ok(seatView(s, 0).hand.some((u) => u.code === GUARD));
  assert.deepEqual(
    s.queue
      .filter((e) => e.kind === "immediateAttack")
      .map((e) => [e.target, e.player]),
    [[jailor.id, 1]],
    "the Jailor attacks the player who rescued",
  );
  flush(s);
  assert.deepEqual([s.combat?.enemyId, s.combat?.attackPlayer], [jailor.id, 1]);
  // The Jailor's own captives (it leaves play) trigger no attack from it.
  s = final();
  const j = stage(s, N.jailor);
  captive(s, j, SCOUT);
  s.staging = [];
  gramCardLeaves(s, j);
  assert.ok(!s.queue.some((e) => e.kind === "immediateAttack"));
  assert.ok(s.hand.some((u) => u.code === SCOUT));
});

test("Nightmare: Prison Cell (active) and Prison Guard (engaged) have a once-per-round Planning Action that rescues a random captive and raises each player's threat by its printed cost", () => {
  let s = board(2);
  const cell = make(s, N.prisonCell);
  s.activeLocation = cell;
  captive(s, cell, SCOUT, 0);
  captive(s, cell, SCOUT, 0);
  assert.match(hooks(s).abilityLabel!(N.prisonCell)!, /^Prison Cell/);
  s = settle(applyAction(reload(s), { type: "ABILITY", id: cell.id }));
  assert.equal(captured(s, cell).length, 1);
  assert.ok(seatView(s, 0).hand.some((u) => u.code === SCOUT));
  assert.deepEqual(
    [seatView(s, 0).threat, seatView(s, 1).threat],
    [21, 20],
    "Snowbourn Scout costs 1 (the players of that dungeon)",
  );
  assert.throws(
    () => applyAction(reload(s), { type: "ABILITY", id: cell.id }),
    /once per round/,
  );
  s.round += 1;
  assert.equal(hooks(s).abilityProblem!(s, cell), null, "the next round");
  // Only while active, only in the planning phase.
  s = board();
  const staged = stage(s, N.prisonCell);
  captive(s, staged, SCOUT);
  assert.match(hooks(s).abilityProblem!(s, staged)!, /active location/);
  const guard = engaged(s, N.prisonGuard);
  assert.match(hooks(s).abilityProblem!(s, guard)!, /No card is captured/);
  captive(s, guard, GANDALF);
  s.phase = "quest";
  assert.match(hooks(s).abilityProblem!(s, guard)!, /Planning Action/);
  s.phase = "planning";
  assert.equal(hooks(s).abilityProblem!(s, guard), null);
  s = settle(applyAction(reload(s), { type: "ABILITY", id: guard.id }));
  assert.equal(s.threat, 25, "Gandalf costs 5");
  assert.ok(s.hand.some((u) => u.code === GANDALF));
  // A staged Prison Guard is engaged with no one.
  s = board();
  const lone = stage(s, N.prisonGuard);
  captive(s, lone, SCOUT);
  assert.match(hooks(s).abilityProblem!(s, lone)!, /engaged/);
});

test("Nightmare: Torture Chamber's quest points are twice its captives, and at the end of the combat phase each exhausted character takes 1 damage while it is staged", () => {
  let s = board();
  s.encounterDeck = [N.chamber, "01099"];
  capturedDeck(s, [SCOUT, GUARD, GANDALF]);
  s = run(queue(s, { kind: "reveal", player: 0 }));
  const chamber = s.staging.find((u) => u.code === N.chamber)!;
  assert.deepEqual(
    captured(s, chamber).map((u) => u.code),
    [SCOUT],
    "Capture 1",
  );
  assert.equal(s.encounterDeck.length, 0, "Surge");
  assert.equal(locationQuest(s, chamber), 2);
  captive(s, chamber, GUARD);
  assert.equal(locationQuest(s, chamber), 4);
  const hero = s.heroes[0];
  const ally = make(s, GANDALF);
  s.allies.push(ally);
  hero.exhausted = true;
  hooks(s).combatEnd!(s);
  flush(s);
  assert.deepEqual([hero.damage, ally.damage], [1, 0]);
  // Not while it is the active location.
  s.staging = [];
  s.activeLocation = chamber;
  hooks(s).combatEnd!(s);
  flush(s);
  assert.equal(hero.damage, 1);
});

test("Nightmare: Cruel Torment attaches to the current quest and holds each player to 6 cards in hand", () => {
  let s = board();
  s.phase = "quest";
  s = run(reveal(s, N.torment));
  assert.deepEqual(
    gramArea(s)!.quest.attachments.map((a) => a.code),
    [N.torment],
  );
  assert.equal(s.encounterDeck.length, 29, "Surge");
  hand(s, Array<string>(8).fill(SCOUT));
  check(s);
  s = run(s);
  assert.equal(s.hand.length, 6);
  assert.deepEqual(s.discard, [SCOUT, SCOUT]);
  assert.ok(valid(s));
  // Without Cruel Torment, no limit.
  s = board();
  hand(s, Array<string>(8).fill(SCOUT));
  check(s);
  assert.equal(s.queue.length, 0);
});

test("Nightmare: Goblin Patrol lets each player capture random cards from their hand underneath the current quest, then raise their threat by the cards left; its shadow captures 3 underneath the attacker", () => {
  let s = board();
  s.phase = "quest";
  hand(s, [SCOUT, GUARD, GANDALF]);
  s = run(reveal(s, N.goblinPatrol), (x) =>
    options(x).includes("capture-2") ? "capture-2" : undefined,
  );
  assert.equal(captured(s, gramArea(s)!.quest).length, 2);
  assert.equal(s.hand.length, 1);
  assert.equal(s.threat, 21);
  assert.ok(valid(s));
  // Capturing nothing: the whole hand raises the threat.
  s = board();
  s.phase = "quest";
  hand(s, [SCOUT, GUARD]);
  s = run(reveal(s, N.goblinPatrol));
  assert.deepEqual([s.hand.length, s.threat], [2, 22]);
  // Its shadow (an event captured from the hand keeps the save valid).
  s = board();
  hand(s, [SCOUT, SNEAK, STONE]);
  const orc = engaged(s, N.thaurdir);
  shadow(s, orc, N.goblinPatrol, s.heroes[0]);
  assert.deepEqual(
    captured(s, orc)
      .map((u) => u.code)
      .sort(),
    [SCOUT, SNEAK, STONE].sort(),
  );
  assert.equal(s.hand.length, 0);
  s.combat = null;
  assert.ok(valid(s));
});

test("Nightmare: Raid Golfimbul's Vault captures 3, captures from each hand after another card's capture, and at its defeat gives back only the Items", () => {
  let s = board();
  capturedDeck(s, [SCOUT, GUARD, STONE, GANDALF]);
  s.phase = "quest";
  s.encounterDeck = [N.vault, "01099", "01099"];
  s = run(queue(s, { kind: "reveal", player: 0 }));
  const vault = s.staging.find((u) => u.code === N.vault)!;
  assert.deepEqual(
    captured(s, vault).map((u) => u.code),
    [SCOUT, GUARD, STONE],
    "Capture 3",
  );
  assert.equal(s.encounterDeck.length, 1, "Surge");
  // Another card's capture: a random card from each hand.
  hand(s, [STEWARD]);
  const cell = stage(s, N.prisonCell);
  gramCardEntered(s, cell, true);
  s = run(s);
  assert.deepEqual(
    captured(s, cell).map((u) => u.code),
    [GANDALF],
  );
  assert.equal(captured(s, vault).length, 4);
  assert.equal(s.hand.length, 0);
  assert.ok(valid(s));
  // Defeated: its Items return to their owners' hands, the rest is discarded.
  s = board();
  const v = stage(s, N.vault);
  captive(s, v, STONE);
  captive(s, v, SCOUT);
  v.progress = 8;
  addQuestProgress(s, v, 1);
  s = run(s);
  assert.ok(!s.staging.some((u) => u.id === v.id));
  assert.deepEqual(
    s.hand.map((u) => u.code),
    [STONE],
  );
  assert.deepEqual(s.discard, [SCOUT]);
  assert.equal(captured(s, v).length, 0);
  assert.ok(valid(s));
});

test("Nightmare: Orc of Thaurdir's Forced effect comes with a normal attack, declared through the defense action", () => {
  let s = board();
  capturedDeck(s, []);
  const orc = engaged(s, N.thaurdir);
  orc.owner = 0;
  s.encounterDeck = Array<string>(5).fill(ROAD);
  s.encounterDiscard = [];
  s.phase = "defense";
  const hero = seatView(s, 0).heroes.find((h) => !h.exhausted)!;
  s = settle(
    applyAction(reload(s), {
      type: "DEFEND",
      enemyId: orc.id,
      defenderId: hero.id,
    }),
  );
  assert.equal(
    s.log.filter((l) => /^Shadow: Old Forest Road/.test(l.text)).length,
    2,
    "2 additional shadow cards",
  );
});

test("Nightmare: Orc of Thaurdir's attack discards the top 2 cards of the captured deck or takes 2 more shadow cards, and its shadow discards a captured card for each damage", () => {
  let s = board();
  capturedDeck(s, [SCOUT, GUARD, GANDALF]);
  const orc = engaged(s, N.thaurdir);
  const attack = () => {
    s.combat = {
      enemyId: orc.id,
      defenderIds: [],
      attackBonus: 0,
      attackPlayer: 0,
    } as never;
    hooks(s).enemyAttackStarted!(s, orc, 0);
    flush(s);
  };
  attack();
  assert.deepEqual(options(s), ["discard", "shadows"]);
  s = pick(s, "discard");
  assert.deepEqual(deckOf(s), [GANDALF]);
  assert.deepEqual(s.discard, [SCOUT, GUARD]);
  attack();
  s = pick(s, "shadows");
  assert.equal(orc.shadows.length, 2);
  // With an empty captured deck, the shadow cards come without a choice.
  gramState(s)!.capturedDecks[0] = [];
  orc.shadows = [];
  attack();
  assert.equal(s.choice, null);
  assert.equal(orc.shadows.length, 2);
  // Its shadow: a captured card for each damage dealt.
  s = board();
  capturedDeck(s, [SCOUT, GUARD, GANDALF]);
  const enemy = engaged(s, G.angmar);
  shadow(s, enemy, N.thaurdir, s.heroes[0]);
  assert.equal(s.combat!.nmDiscardPerDamage, 1);
  assert.deepEqual(hooks(s).attackFinished!(s, s.combat!), [], "no damage");
  s.combat!.damageDealt = 2;
  queue(s, ...hooks(s).attackFinished!(s, s.combat!));
  flush(s);
  assert.deepEqual(deckOf(s), [GANDALF]);
  assert.deepEqual(s.discard, [SCOUT, GUARD]);
});

test("Nightmare: Escape from Mount Gram's Nightmare state survives saves, malformed state is refused, and seeded games finish with valid saves", () => {
  let s = board();
  const cell = make(s, N.prisonCell);
  s.activeLocation = cell;
  captive(s, cell, SCOUT);
  s = settle(applyAction(reload(s), { type: "ABILITY", id: cell.id }));
  assert.deepEqual(s.nightmare!.gramUsed, [{ id: cell.id, round: s.round }]);
  assert.deepEqual(reload(s).nightmare, s.nightmare);
  const broken = (f: (x: GameState) => void) => {
    const x = JSON.parse(JSON.stringify(s)) as GameState;
    f(x);
    return valid(x);
  };
  assert.equal(
    broken((x) => (x.nightmare!.gramUsed = [{ id: cell.id, round: 99 }])),
    false,
  );
  assert.equal(
    broken((x) => (x.nightmare!.gramUsed = "c1" as never)),
    false,
  );
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 4000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
    assert.ok(valid(g));
  }
  const g2 = autoplay(two(3), 5000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
  assert.ok(valid(g2));
});
