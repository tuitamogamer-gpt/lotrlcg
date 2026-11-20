import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { allyEntryResponses, engage, revealed } from "../src/game/board";
import { cannotReady, make, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { removeQuestTime } from "../src/game/quest-time";
import { scenario } from "../src/game/scenarios";
import { automatedScenarioId } from "../src/game/support";
import {
  NIN,
  NIN_STAGE_THREE,
  NIN_STAGE_TWO,
} from "../src/game/nin-eilph-support";
import {
  NIGHTMARE,
  NIGHTMARE_RINGMAKER as N,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { forOwner, seatIndices, seatView } from "../src/game/table";
import type { GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  calm,
  nightmareForTwo,
  nightmareGame,
  opening,
  pick,
  shadow,
  valid,
} from "./nightmare-fixtures";

/** The Nîn-in-Eilph: a location without an effect while in the staging area. */
const QUIET = NIN.eyot;
const ALLY = "01017"; // Silverlode Archer: a non-unique ally (2 [willpower])
const ID = "the-nin-in-eilph";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
/** A quiet board at a stage with 3 time counters; Ancient Marsh-dweller is out of play and Nalir stays with the first player. */
function board(
  phase: GameState["phase"],
  quest: string = N.arduous,
  s: GameState = opening(game()),
) {
  calm(s, phase);
  Object.assign(s, {
    activeLocation: null,
    extraActiveLocations: [],
    encounterDeck: Array(12).fill(QUIET),
    encounterDiscard: [],
    combat: null,
    suspendedCombats: [],
    staging: [],
    stage: quest === N.deadly || NIN_STAGE_THREE.includes(quest) ? 3 : 2,
    stageRevealing: false,
    progress: 0,
    nightmare: {},
    victoryCards: [],
    victory: 0,
  });
  const q = s.ninEilph!;
  Object.assign(q, {
    activeQuest: quest,
    time: 3,
    advancing: false,
    setAside: [make(s, NIN.dweller)],
  });
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      Object.assign(s, {
        threat: 20,
        engaged: [],
        hand: [],
        allies: s.allies.filter((u) => u.code === NIN.nalir),
      });
      for (const h of s.heroes)
        Object.assign(h, {
          damage: 0,
          exhausted: false,
          committed: false,
          attachments: [],
        });
    });
  return s;
}
const hooks = (s: GameState) => batch4Scenario(s);
const add = (s: GameState, code: string, engaged = false) => {
  const u = make(s, code);
  (engaged ? s.engaged : s.staging).push(u);
  return u;
};
function run(s: GameState) {
  for (let i = 0; i < 60; i++) {
    flush(s);
    if (!s.flow?.pending) break;
    s.flow.pending = null;
  }
  return s;
}
/** Run, answering the order of simultaneous Forced effects with the first one each time. */
function settle(s: GameState) {
  run(s);
  for (let i = 0; i < 12 && s.choice?.title.includes("Forced effect"); i++) {
    pick(s, s.choice.options[0].id);
    run(s);
  }
  return s;
}
const options = (s: GameState) => s.choice!.options.map((o) => o.id);
const logText = (s: GameState) =>
  s.log.map((l) => (typeof l === "string" ? l : l.text)).join("\n");
const dwellerOf = (s: GameState): Unit | undefined =>
  [...s.staging, ...seatIndices(s).flatMap((p) => seatView(s, p).engaged)].find(
    (u) => u.code === NIN.dweller,
  );

test("Nightmare: The Nîn-in-Eilph's setup card, new stages and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.ninCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "The Nin-in-Eilph - Nightmare", true],
  );
  assert.match(
    c.text!,
    /from the standard quest deck and encounter deck:\n1x A Weary Passage \(Stage 1B\)\n1x Impassable Marshland \(Stage 2B\)\n3x Neekerbreekers\n1x Hidden Eyot\n3x Finger of Glanduin\n2x Off Track\n1x Low on Provisions\nThen, add the new quest cards to the quest deck/,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nForced: When the players advance to stage 2A, add Ancient Marsh-dweller to the staging area (from out of play or engaged with a player).",
  );
  const arduous = card(N.arduous);
  assert.deepEqual(
    [arduous.name, arduous.back_name, arduous.cost, arduous.back_quest],
    ["Through the Marsh", "An Arduous Journey", 2, 13],
  );
  assert.match(arduous.back_text!, /\nAllies enter play exhausted\.\n/);
  const deadly = card(N.deadly);
  assert.deepEqual(
    [deadly.name, deadly.back_name, deadly.cost, deadly.back_quest],
    ["Lost in the Swanfleet", "Deadly Waters", 3, 16],
  );
  assert.match(
    deadly.back_text!,
    /\nTreachery card effects cannot be canceled\.$/,
  );
  assert.equal(
    card(N.meadow).shadow,
    "Shadow: If this attack destroys a character, remove all progress from the current quest.",
  );
  assert.match(
    card(N.marshAdder).text!,
    /discard a damaged character you control\.\nForced: After the players advance to a quest stage, return Deadly Marsh Adder to the staging area\.$/,
  );
  assert.equal(
    card(N.quicksand).shadow,
    "Shadow: Defending character cannot ready until the end of the round.",
  );
  assert.equal(
    card(N.stench).shadow,
    "Shadow: Deal 1 damage to the defending character.",
  );
  assert.match(card(N.peat).text!, /discards 1 random card from his hand\."$/);
  assert.match(card(N.swarms).text!, /^Cannot have attachments\.\nWhile/);
  assert.equal(card(N.swarms).victory, 1);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Nin-in-Eilph - Nightmare",
  );
  assert.equal(set.length, 9);
  assert.equal(
    set.reduce(
      (n, x) =>
        n +
        (x.type_code === "nightmare" || x.type_code === "quest"
          ? 0
          : (x.quantity ?? 1)),
      0,
    ),
    17,
  );
  assert.equal(
    art.filter((a) => set.some((x) => x.code === a.code)).length,
    12,
  );
});

test("Nightmare: The Nîn-in-Eilph's Nightmare deck matches its source recipe, its new stages replace two random stages and Ancient Marsh-dweller begins stage 2A in the staging area", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const count = (list: string[]) =>
    list.reduce<Record<string, number>>(
      (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
      {},
    );
  const recipe = recipes.find((r) => r.id === "N04.7")!;
  const pile = (section: string) =>
    recipe.cards
      .filter((c) => c.section === section && c.code !== N.ninCard)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const sets = scenario(ID).sets;
  const standard = encounterCards
    .filter((c) => sets.includes(c.encounter_set ?? ""))
    .flatMap((c) => Array<string>(c.quantity ?? 1).fill(c.code));
  assert.deepEqual(
    count(nightmareEncounterDeck(ID, standard)),
    count(
      [
        "sharedEncounterDeck",
        "sharedStagingArea",
        "sharedSetAside",
        "player1Play1",
      ].flatMap(pile),
    ),
  );
  // The recipe's quest deck: the new stages in place of the removed ones.
  const quests = pile("sharedQuestDeck");
  assert.ok(quests.includes(N.arduous) && quests.includes(N.deadly));
  assert.ok(!quests.includes(NIN.weary) && !quests.includes(NIN.impassable));
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.ninCard).text!.includes(`${n}x ${title}`), title);
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.questRemovals!))
    assert.ok(card(N.ninCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), N.ninCard);
    assert.ok(valid(s));
    assert.equal(s.stage, 2);
    assert.ok(
      [NIN.noEnd, N.arduous, NIN.forgotten].includes(s.ninEilph!.activeQuest),
    );
    assert.ok(
      s.staging.some((u) => u.code === NIN.dweller),
      "Ancient Marsh-dweller joined the staging area at stage 2A",
    );
  }
  const s = opening(game());
  assert.deepEqual(hooks(s).stageCandidates!(s, 2, NIN_STAGE_TWO), [
    NIN.noEnd,
    N.arduous,
    NIN.forgotten,
  ]);
  assert.deepEqual(hooks(s).stageCandidates!(s, 3, NIN_STAGE_THREE), [
    N.deadly,
    NIN.treacherous,
    NIN.creatures,
  ]);
  assert.equal(
    automatedScenarioId({
      name: "The Nîn-in-Eilph (Nightmare)",
      mode: "nightmare",
    }),
    ID,
  );
  assert.match(
    nightmareStatus(s)[0],
    /advance to stage 2A, Ancient Marsh-dweller/,
  );
});

test("Nightmare: Ancient Marsh-dweller returns to the staging area, damage kept, whenever the players advance to another stage 2A", () => {
  const s = board("refresh", N.arduous);
  const dweller = s.ninEilph!.setAside.pop()!;
  forOwner(s, 0, () => s.engaged.push(dweller));
  dweller.damage = 3;
  s.ninEilph!.time = 1;
  removeQuestTime(s, 1);
  settle(s);
  assert.equal(s.stage, 2);
  assert.ok(
    [NIN.noEnd, NIN.forgotten].includes(s.ninEilph!.activeQuest),
    "a different stage 2A",
  );
  assert.ok(s.staging.some((u) => u.id === dweller.id));
  assert.equal(dweller.damage, 3, "the setup card does not heal it");
  assert.match(logText(s), /advance to stage 2A; Ancient Marsh-dweller joins/);
  // Stage 3A's own text still heals it.
  const t = board("refresh", NIN.creatures);
  const boss = t.ninEilph!.setAside.pop()!;
  forOwner(t, 0, () => t.engaged.push(boss));
  boss.damage = 3;
  t.ninEilph!.time = 1;
  removeQuestTime(t, 1);
  settle(t);
  assert.equal(t.stage, 3);
  assert.ok([N.deadly, NIN.treacherous].includes(t.ninEilph!.activeQuest));
  assert.ok(t.staging.some((u) => u.id === boss.id));
  assert.equal(boss.damage, 0);
});

test("Nightmare: An Arduous Journey exhausts entering allies, and Deadly Waters keeps treachery effects from being canceled", () => {
  const s = board("planning", N.arduous);
  const archer = make(s, ALLY);
  s.allies.push(archer);
  allyEntryResponses(s, archer, true, true);
  assert.equal(archer.exhausted, true);
  assert.match(
    logText(s),
    /An Arduous Journey: Silverlode Archer enters play exhausted/,
  );
  const t = board("planning", NIN.noEnd);
  const other = make(t, ALLY);
  t.allies.push(other);
  allyEntryResponses(t, other, true, true);
  assert.equal(other.exhausted, false);
  const u = board("staging", N.deadly);
  assert.equal(hooks(u).cannotCancel!(u, false, N.quicksand), true);
  assert.equal(hooks(u).cannotCancel!(u, true, N.stench), true, "its shadow");
  assert.equal(hooks(u).cannotCancel!(u, false, N.swarms), false);
  const v = board("staging", NIN.treacherous);
  assert.equal(hooks(v).cannotCancel!(v, false, N.quicksand), false);
});

test("Nightmare: Desolate Meadow heals Creature enemies as time counters fall, and its shadow takes the quest's progress with a destroyed character", () => {
  const s = board("refresh", N.arduous);
  add(s, N.meadow);
  add(s, N.meadow);
  const adder = add(s, NIN.adder);
  const swarm = add(s, N.swarms);
  Object.assign(adder, { damage: 5 });
  Object.assign(swarm, { damage: 3 });
  removeQuestTime(s, 1);
  settle(s);
  assert.equal(adder.damage, 1, "2 for each copy");
  assert.equal(swarm.damage, 0);
  assert.match(logText(s), /Desolate Meadow: each Creature enemy heals 2/);
  // Its shadow: the scenario's own rule for Finger of Glanduin.
  const t = board("defense");
  shadow(t, add(t, N.marshAdder, true), N.meadow, t.heroes[0]);
  assert.equal(t.combat!.ninLoseProgressOnKill, true);
});

test("Nightmare: Deadly Marsh Adder discards a damaged character as it engages and returns to the staging area as the players advance", () => {
  const s = board("encounter");
  const [a, b] = s.heroes;
  a.damage = 1;
  b.damage = 2;
  const adder = add(s, N.marshAdder);
  engage(s, adder);
  run(s);
  assert.deepEqual(options(s), [a.id, b.id]);
  pick(s, b.id);
  run(s);
  assert.ok(!s.heroes.some((h) => h.id === b.id));
  // Without a damaged character: nothing.
  const t = board("encounter");
  engage(t, add(t, N.marshAdder));
  run(t);
  assert.equal(t.choice, null);
  assert.equal(t.heroes.length, 3);
  // The players advance: each engaged Adder returns to the staging area.
  const u = board("refresh", N.arduous, opening(two()));
  const first = add(u, N.marshAdder, true);
  let second: Unit | undefined;
  forOwner(u, 1, () => {
    second = add(u, N.marshAdder, true);
  });
  u.ninEilph!.time = 1;
  removeQuestTime(u, 1);
  settle(u);
  for (const x of [first, second!])
    assert.ok(u.staging.some((y) => y.id === x.id));
});

test("Nightmare: Quicksand takes a time counter or the strong questers, and its shadow keeps the defender from readying this round", () => {
  const s = board("staging");
  const strong = make(s, "01007"); // Éowyn: 4 [willpower]
  strong.committed = true;
  s.heroes.push(strong);
  const archer = make(s, ALLY);
  archer.committed = true;
  s.allies.push(archer);
  revealed(s, N.quicksand);
  run(s);
  assert.deepEqual(options(s), ["time", "quest"]);
  pick(s, "quest");
  run(s);
  assert.equal(strong.committed, false, "3 or more willpower");
  assert.equal(archer.committed, true, "2 willpower");
  assert.equal(s.ninEilph!.time, 3);
  assert.ok(s.encounterDiscard.includes(N.quicksand));
  // Nobody strong enough on the quest: a time counter.
  const t = board("staging");
  revealed(t, N.quicksand);
  run(t);
  assert.equal(t.choice, null);
  assert.equal(t.ninEilph!.time, 2);
  // Shadow: the defender cannot ready until the end of the round.
  const u = board("defense");
  const defender = u.heroes[0];
  shadow(u, add(u, N.marshAdder, true), N.quicksand, defender);
  defender.exhausted = true;
  assert.equal(hooks(u).cannotReady!(u, defender), true);
  assert.equal(cannotReady(defender, u), true);
  u.round += 1;
  assert.equal(hooks(u).cannotReady!(u, defender), false);
});

test("Nightmare: Rotten Stench returns the topmost discarded location and raises each staged location's threat for the phase; its shadow deals 1 damage", () => {
  const s = board("staging");
  s.encounterDiscard = [NIN.reeds, NIN.bog, N.swarms];
  const eyot = add(s, QUIET);
  const base = threatOf(s, eyot);
  revealed(s, N.stench);
  run(s);
  const bog = s.staging.find((u) => u.code === NIN.bog)!;
  assert.ok(bog, "the topmost location");
  assert.deepEqual(s.encounterDiscard, [NIN.reeds, N.swarms, N.stench]);
  assert.equal(threatOf(s, eyot), base + 1);
  s.phase = "quest";
  assert.equal(threatOf(s, eyot), base + 1, "the quest phase's two steps");
  s.phase = "travel";
  assert.equal(threatOf(s, eyot), base);
  // No location in the discard pile.
  const t = board("staging");
  revealed(t, N.stench);
  run(t);
  assert.match(logText(t), /no location is in the encounter discard pile/);
  // Shadow: 1 damage to the defending character.
  const u = board("defense");
  const hero = u.heroes[1];
  shadow(u, add(u, N.marshAdder, true), N.stench, hero);
  run(u);
  assert.equal(hero.damage, 1);
});

test("Nightmare: Peat Bog discards a random card from each hand and Swarms of Mosquitoes returns from the victory display as the players advance", () => {
  const s = board("refresh", N.arduous, opening(two()));
  add(s, N.peat);
  add(s, N.peat);
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      s.hand = [make(s, ALLY), make(s, ALLY), make(s, ALLY)];
    });
  s.victoryCards = [N.swarms, N.swarms];
  s.victory = 2;
  s.ninEilph!.time = 1;
  removeQuestTime(s, 1);
  settle(s);
  assert.deepEqual(
    seatIndices(s).map((p) => seatView(s, p).hand.length),
    [1, 1],
    "1 for each copy",
  );
  assert.deepEqual(s.victoryCards, []);
  assert.equal(s.victory, 0);
  assert.equal(s.staging.filter((u) => u.code === N.swarms).length, 2);
});

test("Nightmare: The Nîn-in-Eilph's Nightmare state survives saves, and seeded games finish with valid saves", () => {
  const s = calm(opening(game()), "planning");
  s.nightmare = {
    ninUnready: [{ id: "x1", round: 1 }],
    ninStench: [{ round: 1, phase: "quest" }],
  };
  assert.ok(valid(s));
  s.nightmare = { ninUnready: [{ id: "x1", round: -1 }] };
  assert.equal(valid(s), false);
  s.nightmare = {};
  s.ninEilph!.activeQuest = N.deadly;
  assert.equal(valid(s), false, "Deadly Waters is a stage 3");
  s.stage = 3;
  assert.ok(valid(s));
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
    assert.ok(valid(g));
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
});
