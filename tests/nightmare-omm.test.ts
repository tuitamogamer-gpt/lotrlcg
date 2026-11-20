import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { revealed } from "../src/game/board";
import { fx, make } from "../src/game/core";
import { flush } from "../src/game/effects";
import { canCommit } from "../src/game/actions";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { addCurrentQuestProgress } from "../src/game/side-quests";
import { mainQuestUnit } from "../src/game/quest-state";
import { bagginsBilbo } from "../src/game/hobbit-saga";
import { OMM, OMM_RECIPES } from "../src/game/misty-mountains-support";
import {
  NIGHTMARE,
  NIGHTMARE_OHUH as N,
  NIGHTMARE_OMM_GOBLIN_DECK,
  nightmareCardOf,
  nightmareEncounterDecks,
  nightmareStatus,
} from "../src/game/nightmare";
import { forOwner, seatIndices } from "../src/game/table";
import type { GameState } from "../src/game/types";
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

/** The High Pass: a location (not a Goblin) for quiet decks. */
const QUIET = OMM.highPass;
const ID = "over-the-misty-mountains-grim";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
/** A quiet board: an empty staging area and a quiet encounter deck. */
function board(phase: GameState["phase"], s: GameState = opening(game())) {
  calm(s, phase);
  Object.assign(s, {
    activeLocation: null,
    extraActiveLocations: [],
    encounterDeck: Array(12).fill(QUIET),
    encounterDiscard: [],
    combat: null,
    suspendedCombats: [],
    staging: [],
    nightmare: {},
    victoryCards: [],
  });
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      s.engaged = [];
      s.threat = 20;
      s.hand = [];
      s.committedIds = [];
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
function run(s: GameState, effects: GameState["queue"] = []) {
  s.queue.unshift(...effects);
  for (let i = 0; i < 40; i++) {
    flush(s);
    if (!s.flow?.pending) break;
    s.flow.pending = null;
  }
  return s;
}
const hand = (s: GameState, ...codes: string[]) => {
  s.hand = codes.map((code) => make(s, code));
};
const totalDamage = (s: GameState) =>
  [...s.heroes, ...s.allies].reduce((n, u) => n + u.damage, 0);

test("Nightmare: Over the Misty Mountains Grim's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.ommCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    [
      "nightmare",
      "nightmare",
      "Over the Misty Mountains Grim - Nightmare",
      true,
    ],
  );
  assert.match(c.text!, /This scenario has two encounter decks\./);
  assert.match(
    c.text!,
    /2x Cave Entrance\n2x Lone-lands\n2x Dreary Hills\n2x Overhanging Rock\n1x Great Cavern Room\n1x The Great Goblin\n3x Goblin Miners\n3x Goblin Axeman\n/,
  );
  assert.match(
    c.back_text!,
    /no more than X resources may be spent from Bilbo Baggins's resource pool, where X is the number of players in the game\.$/,
  );
  const gg = card(N.greatGoblin);
  assert.deepEqual(
    [gg.is_unique, gg.threat, gg.attack, gg.defense, gg.health, gg.victory],
    [true, 5, 6, 4, 11, 3],
  );
  assert.equal(card(N.swish).quantity, 2);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Over the Misty Mountains Grim - Nightmare",
  );
  assert.equal(set.length, 8);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(art.filter((a) => set.some((x) => x.code === a.code)).length, 9);
});

test("Nightmare: Over the Misty Mountains Grim's two encounter decks match their source recipe", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const pile = (
    cards: { code: string; quantity: number; section: string }[],
    ...sections: string[]
  ) =>
    cards
      .filter((c) => sections.includes(c.section) && c.code !== N.ommCard)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const count = (list: string[]) =>
    list.reduce<Record<string, number>>(
      (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
      {},
    );
  const nightmare = recipes.find((r) => r.id === "N0A.2")!.cards;
  const standard = OMM_RECIPES.find((r) => r.mode === "standard")!.cards;
  const [first, goblins] = nightmareEncounterDecks(
    ID,
    [
      pile(standard, "sharedEncounterDeck", "sharedStagingArea"),
      pile(standard, "sharedEncounterDeck2"),
    ],
    (code) => (NIGHTMARE_OMM_GOBLIN_DECK.includes(code) ? 1 : 0),
  );
  const wantFirst = count(
    pile(nightmare, "sharedEncounterDeck", "sharedStagingArea"),
  );
  const wantGoblins = count(pile(nightmare, "sharedEncounterDeck2"));
  assert.deepEqual(count(first), wantFirst);
  assert.deepEqual(count(goblins), wantGoblins);
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(
      card(N.ommCard)
        .text!.toLowerCase()
        .includes(`${n}x ${title}`.toLowerCase()),
      title,
    );
  for (const [s, players] of [
    [game(), 1],
    [two(), 2],
  ] as const) {
    assert.equal(nightmareCardOf(s), N.ommCard);
    assert.deepEqual(count(s.encounterDeck), wantFirst);
    assert.deepEqual(count(s.mistyMountains!.inactiveDeck), wantGoblins);
    assert.match(
      nightmareStatus(s)[0],
      new RegExp(`no more than ${players} Baggins resource`),
    );
  }
  assert.ok(valid(opening(game())));
});

test("Nightmare: Narrow Ledge caps each player's questers at 3 and recalls Galloping Boulders; Dim Valley trades Bilbo's effort for progress and takes a random card each round", () => {
  const s = board("quest");
  const bilbo = bagginsBilbo(s)!;
  const heroes = s.heroes.filter((h) => h.id !== bilbo.id);
  s.committedIds = heroes.slice(0, 3).map((h) => h.id);
  assert.ok(canCommit(s, bilbo), "no limit without Narrow Ledge");
  s.activeLocation = make(s, N.ledge);
  assert.equal(canCommit(s, bilbo), false);
  s.committedIds = heroes.slice(0, 2).map((h) => h.id);
  assert.ok(canCommit(s, bilbo));
  // Its shadow: the Galloping Boulders return to the encounter deck.
  const t = board("attack");
  t.encounterDiscard = [OMM.boulders, QUIET, OMM.boulders];
  const deck = t.encounterDeck.length;
  shadow(t, add(t, N.prowler, true), N.ledge);
  assert.deepEqual(t.encounterDiscard, [QUIET]);
  assert.equal(t.encounterDeck.length, deck + 2);
  // Dim Valley's Action.
  const u = board("planning");
  const valley = add(u, N.valley);
  const b = bagginsBilbo(u)!;
  b.resources = 2;
  assert.equal(hooks(u).abilityProblem!(u, valley), null);
  assert.ok(hooks(u).ability!(u, valley));
  run(u);
  assert.deepEqual([b.exhausted, b.resources, valley.progress], [true, 1, 5]);
  assert.match(hooks(u).abilityProblem!(u, valley)!, /exhausted/);
  // Its end of the round: each player discards a random card.
  const v = board("refresh");
  add(v, N.valley);
  hand(v, "01016", "01017");
  run(v, hooks(v).roundEnd!(v));
  assert.equal(v.hand.length, 1);
  assert.equal(v.discard.length, 1);
});

test("Nightmare: Lightning Splinters costs three cards and their printed cost in damage", () => {
  let s = board("staging");
  // Snowbourn Scout (1), For Gondor! (2) and Silverlode Archer (3) go;
  // Longbeard Orc Slayer (4) stays.
  hand(s, "01016", "01022", "01017", "01018");
  revealed(s, N.splinters);
  run(s);
  const keep = s.hand.find((u) => u.code === "01018")!;
  for (let i = 0; i < 3 && s.choice; i++)
    s = pick(s, s.choice.options.find((o) => o.id !== keep.id)!.id);
  // 6 damage, spread over the heroes other than Bilbo.
  const bilbo = bagginsBilbo(s)!;
  const heroes = s.heroes.filter((h) => h.id !== bilbo.id);
  for (let i = 0; i < 12 && s.choice; i++)
    s = pick(s, heroes[i % heroes.length].id);
  run(s);
  assert.deepEqual(
    s.hand.map((u) => u.code),
    ["01018"],
  );
  assert.equal(totalDamage(s), 6);
  assert.ok(s.encounterDiscard.includes(N.splinters));
  // With fewer than 3 cards, all of them go.
  let t = board("staging");
  hand(t, "01016");
  revealed(t, N.splinters);
  run(t);
  for (let i = 0; i < 4 && t.choice; i++) t = pick(t, t.choice.options[0].id);
  run(t);
  assert.equal(t.hand.length, 0);
  assert.equal(totalDamage(t), 1);
});

test("Nightmare: The Great Goblin stops quest progress and brings Goblins as it attacks; Goblin Prowler waits for its defeat and costs a character", () => {
  const s = board("planning");
  const gg = add(s, N.greatGoblin);
  const before = s.progress;
  addCurrentQuestProgress(s, 3, mainQuestUnit(s)!);
  assert.equal(s.progress, before, "no progress while it is in play");
  s.staging = s.staging.filter((u) => u.id !== gg.id);
  addCurrentQuestProgress(s, 3, mainQuestUnit(s)!);
  assert.equal(s.progress, before + 3);
  // Its attack: a discarded Goblin enters engaged with a shadow card.
  const t = board("attack");
  const goblin = add(t, N.greatGoblin, true);
  t.encounterDeck = [OMM.runners, QUIET, QUIET];
  hooks(t).enemyAttackStarted!(t, goblin, 0);
  run(t);
  const runners = t.engaged.find((u) => u.code === OMM.runners)!;
  assert.ok(runners, "Goblin Runners engaged");
  assert.equal(runners.shadows.length, 1);
  const u = board("attack");
  const g2 = add(u, N.greatGoblin, true);
  hooks(u).enemyAttackStarted!(u, g2, 0);
  run(u);
  assert.deepEqual(u.encounterDiscard, [QUIET]);
  // Goblin Prowler: -30 engagement once The Great Goblin is defeated.
  const v = board("planning");
  const prowler = add(v, N.prowler);
  assert.equal(hooks(v).engagementBonus!(v, prowler), 0);
  v.victoryCards = [N.greatGoblin];
  assert.equal(hooks(v).engagementBonus!(v, prowler), -30);
  // Engaging discards a character.
  let w = board("planning");
  const ally = make(w, "01016");
  w.allies.push(ally);
  const p2 = add(w, N.prowler);
  hooks(w).engaged!(w, p2, false);
  run(w);
  if (w.choice) w = pick(w, ally.id);
  assert.ok(!w.allies.some((a) => a.id === ally.id));
  assert.ok(valid(w));
});

test("Nightmare: Dark Passages opens a second active location and charges for its Caves; Swish, smack! Whip crack! counts the Goblins", () => {
  let s = board("staging");
  const pass = add(s, OMM.highPass);
  s.activeLocation = make(s, QUIET);
  const prior = s.activeLocation;
  revealed(s, N.passages);
  run(s);
  if (s.choice) s = pick(s, pass.id);
  assert.equal(s.activeLocation?.id, pass.id);
  assert.ok(s.extraActiveLocations?.some((l) => l.id === prior.id));
  // Travel: each player raises their threat by the Caves in the staging area.
  const t = board("travel");
  const passages = add(t, N.passages);
  add(t, N.passages);
  assert.deepEqual(
    hooks(t).travelEffects!(t, passages)?.map((e) => [e.kind, e.value]),
    [["heirsThreat", 2]],
  );
  // Swish, smack! Whip crack!: damage for each Goblin engaged and staged.
  let u = board("staging");
  add(u, N.prowler);
  add(u, OMM.runners, true);
  revealed(u, N.swish);
  run(u);
  for (let i = 0; i < 4 && u.choice; i++) u = pick(u, u.heroes[0].id);
  run(u);
  assert.equal(totalDamage(u), 2);
  // Its shadow: the attacker cannot take damage this round.
  const v = board("attack");
  const enemy = add(v, N.prowler, true);
  shadow(v, enemy, N.swish);
  run(v, [fx("damage", { target: enemy.id, value: 2, player: 0 })]);
  assert.equal(enemy.damage, 0);
  v.round += 1;
  run(v, [fx("damage", { target: enemy.id, value: 2, player: 0 })]);
  assert.equal(enemy.damage, 2);
});

test("Nightmare: stage 3B spends no more Baggins resources than there are players, and the Nightmare Great Goblin leads Goblin Town", () => {
  let s = board("planning");
  const bilbo = bagginsBilbo(s)!;
  bilbo.resources = 5;
  s.stage = 3;
  s.mistyMountains!.inactiveDeck = [N.greatGoblin, OMM.runners];
  run(s, [fx("ommStageThree", { player: 0 })]);
  assert.ok(s.staging.some((u) => u.code === N.greatGoblin));
  assert.deepEqual(
    s.choice?.options.map((o) => o.id),
    ["spend-0", "spend-1"],
  );
  s = pick(s, "spend-1");
  assert.equal(bilbo.resources, 4);
});

test("Nightmare: Over the Misty Mountains Grim's Nightmare state survives saves, and seeded games finish with valid saves", () => {
  const s = board("planning");
  s.nightmare = { ommNoDamage: { round: 1, ids: ["c1"] } };
  assert.ok(valid(s));
  s.nightmare = { ommNoDamage: { round: -1, ids: ["c1"] } };
  assert.equal(valid(s), false);
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
});
