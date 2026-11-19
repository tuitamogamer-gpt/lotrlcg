import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import {
  advanceQuest,
  destroy,
  progress,
  progressLocation,
} from "../src/game/board";
import { cannotReady, make, stageInfo, stats } from "../src/game/core";
import { flush } from "../src/game/effects";
import { createGame } from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { CARROCK as C, CARROCK_TROLLS } from "../src/game/carrock";
import {
  NIGHTMARE,
  NIGHTMARE_SOM as G,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { playerEffectImmune } from "../src/game/player-effect-immunity";
import { mainQuestCode } from "../src/game/quest-state";
import { reduceThreat } from "../src/game/threat-reduction";
import { forOwner, seatView } from "../src/game/table";
import { automatedScenarioId } from "../src/game/support";
import { scenario } from "../src/game/scenarios";
import type { GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  calm,
  choose,
  d,
  damageOf,
  nightmareForTwo,
  nightmareGame,
  opening,
  reveal,
  shadow,
  valid,
} from "./nightmare-fixtures";

const HILL_TROLL = "01082",
  MARSH_ADDER = "01084",
  GLADDEN = "01114",
  ARAGORN = "01001",
  FEINT = "01034",
  FOREST_SNARE = "01069";
const UNIQUE = [G.louis, G.morris, G.rupert, G.stuart];
const carrock = (seed = 5) => nightmareGame("conflict-at-the-carrock", seed);
/** A quiet solo board in `phase` with nothing engaged or staged. */
const board = (phase: GameState["phase"], seed = 5) => {
  const s = calm(opening(carrock(seed)), phase);
  s.engaged = [];
  s.staging = [];
  return s;
};
const hooks = (s: GameState) => batch4Scenario(s);
function run(s: GameState, effects: { kind: string }[] | void) {
  s.queue.unshift(...((effects ?? []) as never[]));
  flush(s);
  return s;
}
/** An enemy's attack has finished: its Forced effects resolve. */
function attacked(s: GameState, enemy: Unit, attackPlayer = 0) {
  const after = hooks(s).attackFinished!(s, {
    enemyId: enemy.id,
    attackPlayer,
    defenderIds: [],
    attackBonus: 0,
  } as never);
  s.combat = null;
  return run(s, after);
}
const isTroll = (code: string) =>
  card(code).type_code === "enemy" &&
  (card(code).traits ?? "").includes("Troll");
const sack = (s: GameState, h: Unit, id = `sk${s.nextId++}`) => {
  h.attachments.push({ id, code: C.sacked, exhausted: false });
  return id;
};

test("Nightmare: Conflict at the Carrock's setup card, stage 3 and Nightmare Deck carry their scans' texts", () => {
  const c = card(G.carrockCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "Conflict at the Carrock - Nightmare", true],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for the Conflict at the Carrock scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n1x Grimbeorn the Old\n1x Louis\n1x Morris\n1x Stuart\n1x Rupert\n3x Bee Pastures\n3x Oak-wood Grove\n1x Roasted Slowly\n3x Misty Mountain Goblins\n2x Banks of the Anduin\n1x Wolf Rider\n2x Goblin Sniper\n2x Wargs\n2x Despair\n2x The Brown Lands\n2x The East Bight\nThen, shuffle/,
  );
  assert.equal(
    c.back_text,
    'You are playing Nightmare mode.\nStage 1A should read, "Remove 5 unique Troll cards" instead of 4.\nStage 2B should read, "When Revealed: Place Louis, Morris, Rupert and Stuart into the staging area."\nForced: At the end of the quest phase, if no progress was placed on the current quest this phase, place 1 progress on the current quest (bypassing the active location).\nResponse: After defeating a unique Troll enemy, you may choose and discard 1 "Sacked!" card from play.',
  );
  // Stage 3, Grimbeorn's Folly: the scan corrects "and have won the game".
  const folly = card(G.folly);
  assert.deepEqual(
    [folly.type_code, folly.cost, folly.back_name, folly.back_quest],
    ["quest", 3, "Grimbeorn's Folly", undefined],
  );
  assert.match(folly.text!, /^When Revealed: Add Rob & Bob to the staging/);
  assert.equal(
    folly.back_text,
    "When Rob & Bob have been defeated, the players have rescued Grimbeorn the Old from certain death, and won the game.",
  );
  assert.equal(
    card(G.morris).text,
    'Immune to player events.\nWhile Morris is in the victory display, each Troll enemy gets +1 [attack] and gains "Immune to player events".',
  );
  const stat = (code: string) => {
    const x = card(code);
    return [x.engagement, x.threat, x.attack, x.defense, x.health, x.victory];
  };
  assert.deepEqual(stat(G.robBob), [34, 4, 5, 4, 10, undefined]);
  assert.deepEqual(stat(G.louis), [34, 4, 4, 2, 10, 2]);
  assert.deepEqual(stat(G.morris), [34, 3, 5, 2, 10, 2]);
  assert.deepEqual(stat(G.rupert), [34, 2, 5, 3, 10, 2]);
  assert.deepEqual(stat(G.stuart), [34, 2, 4, 4, 10, 2]);
  assert.deepEqual(stat(G.savage), [21, 1, 3, 2, 6, 1]);
  assert.ok([G.robBob, ...UNIQUE].every((x) => card(x).is_unique));
  assert.deepEqual(
    [G.lair, G.hives].map((x) => [card(x).threat, card(x).quest]),
    [
      [2, 5],
      [3, 3],
    ],
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Conflict at the Carrock - Nightmare",
  );
  assert.equal(set.length, 11);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(
    art.filter((a) => set.some((x) => x.code === a.code)).length,
    13,
  );
});

test("Nightmare: Conflict at the Carrock's Nightmare encounter deck matches its source recipe, with 5 unique Trolls set aside", () => {
  const sets = scenario("conflict-at-the-carrock").sets as readonly string[];
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  const deck = nightmareEncounterDeck("conflict-at-the-carrock", standard);
  const count = (list: string[]) =>
    list.reduce<Record<string, number>>(
      (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
      {},
    );
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const recipe = recipes.find((r) => r.id === "N01.5")!;
  // The recipe stages The Carrock and the 4 set-aside Sacked! cards, and sets
  // aside the 5 unique Trolls; the quest deck holds stage 3.
  const expected: Record<string, number> = {};
  for (const c of recipe.cards)
    if (
      ["sharedEncounterDeck", "sharedStagingArea", "sharedSetAside"].includes(
        c.section,
      ) &&
      c.code !== G.carrockCard
    )
      expected[c.code] = (expected[c.code] ?? 0) + c.quantity;
  assert.deepEqual(count(deck), expected);
  assert.ok(
    recipe.cards.some(
      (c) => c.code === G.folly && c.section === "sharedQuestDeck",
    ),
  );
  for (const [title, n] of Object.entries(
    NIGHTMARE["conflict-at-the-carrock"]!.removals,
  ))
    assert.ok(card(G.carrockCard).text!.includes(`${n}x ${title}`), title);
  assert.equal(
    automatedScenarioId({
      name: "Conflict at the Carrock (Nightmare)",
      mode: "nightmare",
    }),
    "conflict-at-the-carrock",
  );
  const s = opening(carrock());
  assert.equal(nightmareCardOf(s), G.carrockCard);
  assert.match(nightmareStatus(s)[0], /5 unique Trolls were set aside/);
  for (const code of [G.robBob, ...UNIQUE, ...CARROCK_TROLLS, G.folly])
    assert.ok(!s.encounterDeck.includes(code), code);
  assert.ok(
    s.encounterDeck.filter((c) => c === C.sacked).length >= 1,
    "1 Sacked! per player",
  );
  assert.ok(s.staging.some((u) => u.code === C.carrock));
  assert.ok(valid(s));
  assert.ok(valid(opening(nightmareForTwo("conflict-at-the-carrock"))));
});

test("Nightmare: stage 2B places the Nightmare Trolls, stage 3 brings Rob & Bob and a non-unique Troll per player, and Rob & Bob's defeat wins", () => {
  // Grimbeorn's Quest's 7th progress: the Nightmare Louis, Morris, Rupert
  // and Stuart enter the staging area.
  const s = calm(opening(carrock()), "quest");
  s.engaged = [];
  s.progress = 7;
  advanceQuest(s);
  flush(s);
  assert.equal(s.stage, 2);
  assert.equal(s.activeLocation?.code, C.carrock);
  assert.deepEqual(s.staging.map((u) => u.code).filter(isTroll), [
    G.louis,
    G.morris,
    G.rupert,
    G.stuart,
  ]);
  // Against the Trolls: 1 progress and no Troll in play. In Nightmare mode
  // stage 3 follows instead of the win.
  s.staging = [];
  s.encounterDeck.unshift(HILL_TROLL);
  s.progress = 1;
  advanceQuest(s);
  flush(s);
  assert.equal(s.status, "playing");
  assert.equal(s.stage, 3);
  assert.equal(s.progress, 0);
  assert.equal(mainQuestCode(s), G.folly);
  assert.deepEqual(
    [stageInfo(s).name, stageInfo(s).quest],
    ["Grimbeorn's Folly", 0],
  );
  // The deck holds two non-unique Troll titles: the player chooses.
  assert.match(
    s.choice!.title,
    /^Grimbeorn's Folly · Search for a non-unique Troll enemy/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.id).sort(),
    [G.savage, HILL_TROLL].sort(),
  );
  const savages = s.encounterDeck.filter((c) => c === G.savage).length;
  const t = choose(s, G.savage);
  assert.deepEqual(
    t.staging.map((u) => u.code),
    [G.robBob, G.savage],
  );
  assert.equal(
    t.encounterDeck.filter((c) => c === G.savage).length,
    savages - 1,
  );
  assert.ok(valid(t));
  // Progress on stage 3 (no quest points) does not win.
  progress(t, 6);
  flush(t);
  assert.equal(t.status, "playing");
  destroy(
    t,
    t.staging.find((u) => u.code === G.savage)!,
  );
  flush(t);
  assert.equal(t.status, "playing");
  destroy(
    t,
    t.staging.find((u) => u.code === G.robBob)!,
  );
  flush(t);
  assert.equal(t.status, "won");
  assert.match(t.reason!, /Rob & Bob are defeated/);
  // Two players: a Troll each, found in the discard pile when the deck has
  // none left.
  const u = calm(opening(nightmareForTwo("conflict-at-the-carrock")), "quest");
  u.stage = 2;
  u.staging = [];
  for (const p of [0, 1]) forOwner(u, p, () => (u.engaged = []));
  u.encounterDeck = u.encounterDeck.filter((c) => !isTroll(c));
  u.encounterDiscard = [HILL_TROLL, MARSH_ADDER, HILL_TROLL];
  u.progress = 1;
  advanceQuest(u);
  flush(u);
  assert.equal(u.stage, 3);
  assert.deepEqual(
    u.staging.map((x) => x.code),
    [G.robBob, HILL_TROLL, HILL_TROLL],
  );
  assert.deepEqual(u.encounterDiscard, [MARSH_ADDER]);
  assert.ok(valid(u));
  // The standard game still ends at stage 2.
  const v = calm(
    opening(
      createGame(5, d.cards, d.heroes, d.id, {
        scenarioId: "conflict-at-the-carrock",
      }),
    ),
    "quest",
  );
  v.stage = 2;
  v.staging = [];
  v.engaged = [];
  v.progress = 1;
  advanceQuest(v);
  assert.equal(v.status, "won");
});

test("Nightmare: a quest phase that places no progress on the quest places 1 there, and a unique Troll's defeat may discard Sacked!", () => {
  // No progress placed on the quest: 1 progress, bypassing the active
  // location.
  const s = board("quest");
  s.activeLocation = make(s, GLADDEN);
  run(s, hooks(s).questBegin!(s));
  hooks(s).endQuest!(s);
  flush(s);
  assert.equal(s.progress, 1);
  assert.equal(s.activeLocation!.progress, 0);
  // Progress on the active location alone does not count.
  const t = board("quest");
  t.activeLocation = make(t, GLADDEN);
  run(t, hooks(t).questBegin!(t));
  progress(t, 1);
  flush(t);
  assert.equal(t.activeLocation!.progress, 1);
  hooks(t).endQuest!(t);
  flush(t);
  assert.equal(t.progress, 1);
  // Progress placed on the quest this phase: nothing more.
  const u = board("quest");
  u.activeLocation = null;
  run(u, hooks(u).questBegin!(u));
  progress(u, 2);
  flush(u);
  hooks(u).endQuest!(u);
  flush(u);
  assert.equal(u.progress, 2);
  // "Response: After defeating a unique Troll enemy, you may choose and
  // discard 1 "Sacked!" card from play."
  const v = board("attack");
  const morris = make(v, G.morris);
  v.engaged.push(morris);
  const id = sack(v, v.heroes[0]);
  sack(v, v.heroes[1]);
  destroy(v, morris);
  flush(v);
  assert.match(
    v.choice!.title,
    /A unique Troll was defeated: discard a Sacked! card\?/,
  );
  assert.equal(v.choice!.options.length, 3);
  const w = choose(v, `${v.heroes[0].id}:${id}`);
  assert.ok(!w.heroes[0].attachments.some((a) => a.code === C.sacked));
  assert.ok(w.heroes[1].attachments.some((a) => a.code === C.sacked));
  assert.ok(w.victoryCards!.includes(G.morris));
  assert.equal(w.victory, 2);
  // A non-unique Troll's defeat: no response.
  const x = board("attack");
  const savage = make(x, G.savage);
  x.engaged.push(savage);
  sack(x, x.heroes[0]);
  destroy(x, savage);
  flush(x);
  assert.equal(x.choice, null);
  assert.ok(x.victoryCards!.includes(G.savage));
});

test("Nightmare: Louis, Morris, Rupert, Stuart and Savage Hill-troll in play and in the victory display", () => {
  const s = board("defense");
  const troll = make(s, G.savage);
  s.engaged.push(troll);
  const base = stats(s, troll);
  // Savage Hill-troll (each copy): +1 hit point; Morris: +1 [attack];
  // Stuart: +1 [defense].
  s.victoryCards = [G.savage, G.savage, G.morris, G.stuart];
  const now = stats(s, troll);
  assert.deepEqual(
    [
      now.health - base.health,
      now.attack - base.attack,
      now.defense - base.defense,
    ],
    [2, 1, 1],
  );
  // Morris: immune to player events, and each Troll while he is in the
  // victory display.
  const morris = make(s, G.morris);
  assert.ok(playerEffectImmune(s, morris, FEINT));
  assert.ok(!playerEffectImmune(s, morris, FOREST_SNARE));
  assert.ok(playerEffectImmune(s, troll, FEINT));
  const adder = make(s, MARSH_ADDER);
  assert.ok(!playerEffectImmune(s, adder, FEINT));
  // Stuart: cannot have player attachments, nor each Troll while he is in
  // the victory display.
  const stuart = make(s, G.stuart);
  assert.equal(hooks(s).cannotAttach!(s, stuart, FOREST_SNARE), true);
  assert.equal(hooks(s).cannotAttach!(s, troll, FOREST_SNARE), true);
  assert.equal(hooks(s).cannotAttach!(s, troll, C.sacked), false);
  assert.equal(hooks(s).cannotAttach!(s, adder, FOREST_SNARE), false);
  s.victoryCards = [];
  assert.ok(!playerEffectImmune(s, troll, FEINT));
  assert.equal(hooks(s).cannotAttach!(s, troll, FOREST_SNARE), false);
  // Rupert: his [defense] cannot be reduced, nor each Troll's while he is in
  // the victory display.
  const rupert = make(s, G.rupert);
  rupert.tempDefense = -2;
  assert.equal(stats(s, rupert).defense, 3);
  troll.tempDefense = -2;
  assert.equal(stats(s, troll).defense, 0);
  s.victoryCards = [G.rupert, G.stuart];
  assert.equal(stats(s, troll).defense, 3, "printed 2, +1 for Stuart");
  troll.tempDefense = 1;
  assert.equal(stats(s, troll).defense, 4, "(it can still be raised)");
  // Louis: the defending player raises their threat by 3 after his attack,
  // and by 1 after each Troll's while he is in the victory display.
  const t = board("defense");
  const louis = make(t, G.louis),
    hill = make(t, HILL_TROLL);
  t.engaged.push(louis, hill);
  const threat = t.threat;
  attacked(t, louis);
  assert.equal(t.threat, threat + 3);
  attacked(t, hill);
  assert.equal(t.threat, threat + 3);
  t.victoryCards = [G.louis];
  attacked(t, hill);
  assert.equal(t.threat, threat + 4);
  assert.ok(valid(t));
});

test("Nightmare: Time for Supper, Troll Lair, Hives and Hives, Savage Hill-troll's shadow and Rob & Bob's additional attack", () => {
  // Time for Supper: a hero in a discard pile leaves the game, and each
  // Troll is healed.
  const s = board("staging");
  s.discard.push(ARAGORN);
  const troll = make(s, G.savage);
  troll.damage = 3;
  s.staging.push(troll);
  const deck = s.encounterDeck.length;
  const t = reveal(s, G.supper);
  assert.ok(!t.discard.includes(ARAGORN));
  assert.ok(t.removed.includes(ARAGORN));
  assert.equal(t.staging.find((u) => u.code === G.savage)!.damage, 0);
  assert.equal(t.encounterDeck.length, deck, "no surge");
  // No damage healed: it gains surge.
  const u = board("staging");
  const left = u.encounterDeck.length;
  const v = reveal(u, G.supper);
  assert.ok(v.encounterDeck.length < left, "it surged");
  // Troll Lair: no threat reduction while it is in the staging area; its
  // shadow heals 4 damage from a Troll.
  const w = board("planning");
  w.threat = 30;
  w.staging.push(make(w, G.lair));
  reduceThreat(w, 5);
  assert.equal(w.threat, 30);
  w.staging = [];
  reduceThreat(w, 5);
  assert.equal(w.threat, 25);
  const x = board("defense");
  const hill = make(x, HILL_TROLL),
    adder = make(x, MARSH_ADDER);
  hill.damage = 5;
  adder.damage = 1;
  x.engaged.push(hill, adder);
  shadow(x, hill, G.lair, x.heroes[0]);
  assert.equal(hill.damage, 1);
  shadow(x, adder, G.lair, x.heroes[0]);
  assert.equal(adder.damage, 1);
  // Hives and Hives: progress placed on it deals 1 damage to each
  // character; its shadow +2 [attack].
  const y = board("travel");
  const hives = make(y, G.hives);
  y.activeLocation = hives;
  const before = damageOf(y);
  progressLocation(y, hives, 1);
  flush(y);
  assert.equal(damageOf(y), before + y.heroes.length + y.allies.length);
  const z = board("defense");
  const enemy = make(z, HILL_TROLL);
  z.engaged.push(enemy);
  shadow(z, enemy, G.hives, z.heroes[0]);
  assert.equal(z.combat!.attackBonus, 2);
  // Savage Hill-troll's shadow: a Troll's defender does not ready during this
  // round's refresh phase.
  const q = board("defense");
  const attacker = make(q, HILL_TROLL);
  q.engaged.push(attacker);
  const hero = q.heroes[0];
  shadow(q, attacker, G.savage, hero);
  q.combat = null;
  hero.exhausted = true;
  assert.equal(cannotReady(hero, q), false, "(only in the refresh phase)");
  q.phase = "refresh";
  assert.equal(cannotReady(hero, q), true);
  assert.equal(cannotReady(q.heroes[1], q), false);
  assert.ok(valid(q));
  q.round++;
  assert.equal(cannotReady(hero, q), false);
  // Rob & Bob, with two players: after its first attack each round it
  // engages the next player and makes an additional attack with a new shadow
  // card.
  const r = calm(
    opening(nightmareForTwo("conflict-at-the-carrock")),
    "defense",
  );
  for (const p of [0, 1]) forOwner(r, p, () => (r.engaged = []));
  const rob = make(r, G.robBob);
  forOwner(r, 0, () => r.engaged.push(rob));
  attacked(r, rob, 0);
  assert.ok(!seatView(r, 0).engaged.some((e) => e.id === rob.id));
  assert.ok(seatView(r, 1).engaged.some((e) => e.id === rob.id));
  assert.match(r.choice!.title, /Rob & Bob · Immediate attack/);
  assert.equal(rob.shadows.length, 1);
  assert.equal(r.nightmare!.robRound, r.round);
  const again = hooks(r).attackFinished!(r, {
    enemyId: rob.id,
    attackPlayer: 1,
  } as never);
  assert.ok(!again.some((e) => e.kind === "nsmRobBob"), "once each round");
  // Alone, no additional attack.
  const solo = board("defense");
  const bob = make(solo, G.robBob);
  solo.engaged.push(bob);
  attacked(solo, bob);
  assert.equal(solo.choice, null);
  assert.ok(solo.engaged.some((e) => e.id === bob.id));
});

test("Nightmare: seeded Conflict at the Carrock games finish with valid saves", () => {
  for (const seed of [1, 2]) {
    const s = autoplay(carrock(seed));
    assert.notEqual(
      s.status,
      "playing",
      `conflict-at-the-carrock seed ${seed}`,
    );
  }
  const t = autoplay(nightmareForTwo("conflict-at-the-carrock", 7), 4000);
  assert.notEqual(t.status, "playing", "two-player conflict-at-the-carrock");
  // Games played on from stage 3, Grimbeorn's Folly.
  for (const game of [
    carrock(3),
    nightmareForTwo("conflict-at-the-carrock", 3),
  ]) {
    const s = calm(opening(game), "quest");
    s.stage = 2;
    s.staging = [];
    for (const p of game.table ? [0, 1] : [0])
      forOwner(s, p, () => (s.engaged = []));
    s.progress = 1;
    advanceQuest(s);
    flush(s);
    assert.equal(s.stage, 3);
    s.phase = "planning";
    const u = autoplay(s, 4000);
    assert.notEqual(u.status, "playing", "a game from stage 3");
    assert.equal(u.stage, 3);
  }
});
