import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { check, destroy, progressLocation } from "../src/game/board";
import {
  cluesInPlay,
  draw,
  make,
  stagingThreat,
  stats,
  threatOf,
} from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import {
  NIGHTMARE,
  NIGHTMARE_SOM as G,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { cluesOnMordor } from "../src/game/nightmare-som";
import { automatedScenarioId } from "../src/game/support";
import { scenario } from "../src/game/scenarios";
import type { GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  calm,
  choose,
  nightmareForTwo,
  nightmareGame,
  opening,
  reveal,
  shadow,
  valid,
} from "./nightmare-fixtures";

const CLUE = "02014",
  HUNTERS = "02021",
  BROWN_LANDS = "01087",
  OLD_FORD = "02015",
  GANDALF = "01073";
const gollum = (seed = 5) => nightmareGame("hunt-for-gollum", seed);
/** A quiet solo board in `phase` with nothing engaged or staged. */
const board = (phase: GameState["phase"], seed = 5) => {
  const s = calm(opening(gollum(seed)), phase);
  s.engaged = [];
  s.staging = [];
  return s;
};
const hooks = (s: GameState) => batch4Scenario(s);
function run(s: GameState, effects: { kind: string }[]) {
  s.queue.unshift(...(effects as never[]));
  flush(s);
  return s;
}
const clueOn = (u: Unit) => u.attachments.filter((a) => a.code === CLUE).length;
/** A hero holding a claimed Clue. */
function holdClue(s: GameState, h: Unit) {
  h.attachments.push({ id: `a${s.nextId++}`, code: CLUE, exhausted: false });
}

test("Nightmare: The Hunt for Gollum's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(G.gollumCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "The Hunt for Gollum - Nightmare", true],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for The Hunt for Gollum scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n2x River Ninglor\n1x Eaves of Mirkwood\n2x False Lead\n2x Misty Mountain Goblins\n2x Banks of the Anduin\n3x Gladden Fields\n3x Eastern Crows\n2x Treacherous Fog\n3x Evil Storm\n/,
  );
  // The scans correct the catalog ("guarding if first", "Morder").
  assert.match(c.back_text!, /detach the encounter guarding it first\./);
  assert.match(card(G.warg).text!, /1 copy of Hunters from Mordor/);
  const stat = (code: string) => {
    const x = card(code);
    return [x.engagement, x.threat, x.attack, x.defense, x.health];
  };
  assert.deepEqual(stat(G.hawk), [42, 2, 3, 3, 3]);
  assert.deepEqual(stat(G.warg), [15, 1, 3, 2, 3]);
  assert.deepEqual(
    [G.watched, G.lookout, G.pools].map((x) => [card(x).threat, card(x).quest]),
    [
      [3, 4],
      [2, 6],
      [3, 2],
    ],
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Hunt for Gollum - Nightmare",
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
    art.filter((a) => set.some((x) => x.code === a.code)).length,
    10,
  );
});

test("Nightmare: The Hunt for Gollum's Nightmare encounter deck matches its source recipe, and the audit counts it", () => {
  const sets = scenario("hunt-for-gollum").sets as readonly string[];
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  const deck = nightmareEncounterDeck("hunt-for-gollum", standard);
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
  const recipe = recipes.find((r) => r.id === "N01.4")!;
  const expected: Record<string, number> = {};
  for (const c of recipe.cards)
    if (
      ["sharedEncounterDeck", "sharedStagingArea"].includes(c.section) &&
      c.code !== G.gollumCard
    )
      expected[c.code] = (expected[c.code] ?? 0) + c.quantity;
  assert.deepEqual(count(deck), expected);
  for (const [title, n] of Object.entries(
    NIGHTMARE["hunt-for-gollum"]!.removals,
  ))
    assert.ok(
      card(G.gollumCard).text!.includes(`${n}x ${title.replace(/^The /, "")}`),
      title,
    );
  assert.equal(
    automatedScenarioId({
      name: "The Hunt for Gollum (Nightmare)",
      mode: "nightmare",
    }),
    "hunt-for-gollum",
  );
  const s = opening(gollum());
  assert.equal(nightmareCardOf(s), G.gollumCard);
  assert.match(nightmareStatus(s)[0], /4 Clues on Mordor enemies/);
  assert.ok(valid(s));
  assert.ok(valid(opening(nightmareForTwo("hunt-for-gollum"))));
});

test("Nightmare: The Hunt for Gollum's setup card attaches an unclaimed Clue to a Mordor enemy at the end of the refresh phase, and 4 lose the game", () => {
  const s = board("refresh");
  const clue = make(s, CLUE),
    guard = make(s, BROWN_LANDS),
    hunters = make(s, HUNTERS);
  guard.guarding = clue.id;
  s.staging.push(clue, guard, hunters);
  const attack = stats(s, hunters).attack;
  run(s, hooks(s).roundEnd!(s));
  assert.ok(!s.staging.some((u) => u.id === clue.id));
  assert.equal(clueOn(hunters), 1);
  assert.equal(guard.guarding, undefined, "its guard is detached");
  assert.equal(cluesOnMordor(s), 1);
  assert.equal(cluesInPlay(s), 1);
  assert.equal(stats(s, hunters).attack, attack, "(the Clue is still in play)");
  // Two unclaimed Clues: the first player chooses one.
  const t = board("refresh");
  const [a, b] = [make(t, CLUE), make(t, CLUE)];
  const wolf = make(t, HUNTERS);
  t.staging.push(a, b, wolf);
  run(t, hooks(t).roundEnd!(t));
  assert.match(
    t.choice!.title,
    /^The Hunt for Gollum · Choose an unclaimed Clue/,
  );
  const u = choose(t, b.id);
  assert.ok(u.staging.some((x) => x.id === a.id));
  assert.equal(clueOn(u.staging.find((x) => x.code === HUNTERS)!), 1);
  // A Mordor enemy leaving play returns its Clue to the staging area.
  const v = board("attack");
  const hunter = make(v, HUNTERS);
  hunter.attachments.push({ id: "c1", code: CLUE, exhausted: false });
  v.engaged.push(hunter);
  destroy(v, hunter);
  flush(v);
  assert.ok(v.staging.some((x) => x.code === CLUE));
  assert.ok(!v.encounterDeck.slice(0, 1).includes(CLUE));
  // Four Clues on Mordor enemies: the players lose.
  const w = board("planning");
  const x = make(w, HUNTERS);
  for (let i = 0; i < 4; i++)
    x.attachments.push({ id: `c${i}`, code: CLUE, exhausted: false });
  w.staging.push(x);
  check(w);
  assert.equal(w.status, "lost");
  assert.match(w.reason!, /Four Clue cards are attached to Mordor enemies/);
});

test("Nightmare: The Enemy's Trail, Restless Hunters and The Trail Goes Cold", () => {
  // The Enemy's Trail: a Clue from the discard pile joins a Mordor enemy (or
  // it gains surge).
  const s = board("staging");
  const hunters = make(s, HUNTERS);
  s.staging.push(hunters);
  s.encounterDiscard.push(CLUE);
  const t = reveal(s, G.enemyTrail);
  assert.equal(clueOn(t.staging.find((u) => u.code === HUNTERS)!), 1);
  assert.ok(!t.encounterDiscard.includes(CLUE));
  const u = board("staging");
  const deck = u.encounterDeck.length;
  const v = reveal(u, G.enemyTrail);
  assert.ok(v.encounterDeck.length < deck, "it surged");
  // Its shadow attaches a Clue without surge.
  const w = board("defense");
  const enemy = make(w, HUNTERS);
  w.engaged.push(enemy);
  w.encounterDiscard.push(CLUE);
  shadow(w, enemy, G.enemyTrail, w.heroes[0]);
  flush(w);
  assert.equal(clueOn(enemy), 1);
  // Restless Hunters (surge): a hero's Clue moves to a Mordor enemy.
  const x = board("staging");
  const wolf = make(x, HUNTERS);
  x.staging.push(wolf);
  holdClue(x, x.heroes[0]);
  const y = reveal(x, G.restless);
  assert.equal(clueOn(y.heroes[0]), 0);
  assert.equal(clueOn(y.staging.find((u) => u.code === HUNTERS)!), 1);
  // Its shadow: undefended damage goes to a hero with a Clue.
  const z = board("defense");
  const attacker = make(z, HUNTERS);
  z.engaged.push(attacker);
  holdClue(z, z.heroes[1]);
  shadow(z, attacker, G.restless);
  assert.equal(z.combat!.undefendedTargetId, z.heroes[1].id);
  // The Trail Goes Cold: attached to the active location, its progress gone,
  // its [threat] counted in the quest phase.
  const q = board("staging");
  q.activeLocation = make(q, OLD_FORD);
  q.activeLocation.progress = 2;
  const before = stagingThreat(q);
  const r = reveal(q, G.trailCold);
  assert.ok(r.activeLocation!.attachments.some((a) => a.code === G.trailCold));
  assert.equal(r.activeLocation!.progress, 0);
  assert.equal(stagingThreat(r), before + threatOf(r, r.activeLocation!));
  const m = board("staging");
  m.activeLocation = null;
  const left = m.encounterDeck.length;
  const n = reveal(m, G.trailCold);
  assert.ok(n.encounterDeck.length < left, "it surged");
  assert.ok(valid(r));
});

test("Nightmare: Ravenous Hawk, Hunting Warg, Watched Path, Hunter's Lookout and Dark Pools", () => {
  // Ravenous Hawk among the cards a stage looks at enters play engaged.
  const s = board("staging");
  s.encounterDeck.unshift(BROWN_LANDS, G.hawk, OLD_FORD);
  s.queue.unshift({ kind: "huntLook", count: 3, player: 0 } as never);
  flush(s);
  assert.ok(s.engaged.some((u) => u.code === G.hawk));
  assert.equal(s.choice!.options.length, 2);
  // Hunting Warg: entering play this round brings Hunters from Mordor at the
  // beginning of the refresh phase.
  const t = board("staging");
  const u = reveal(t, G.warg);
  assert.ok(u.staging.some((x) => x.code === G.warg));
  u.phase = "refresh";
  const had = u.staging.filter((x) => x.code === HUNTERS).length;
  run(u, hooks(u).refreshStart!(u));
  assert.equal(u.staging.filter((x) => x.code === HUNTERS).length, had + 1);
  // Watched Path: a player without a Clue cannot draw through card effects.
  const v = board("planning");
  v.staging.push(make(v, G.watched));
  const hand = v.hand.length;
  draw(v, 1);
  assert.equal(v.hand.length, hand);
  holdClue(v, v.heroes[0]);
  draw(v, 1);
  assert.equal(v.hand.length, hand + 1);
  // Its shadow: without a Clue, the defending player discards their hand.
  const w = board("defense");
  const enemy = make(w, HUNTERS);
  w.engaged.push(enemy);
  shadow(w, enemy, G.watched, w.heroes[0]);
  flush(w);
  assert.equal(w.hand.length, 0);
  // Hunter's Lookout: +2 [defense] to each Mordor enemy with a Clue; its
  // shadow +1 [defense] per Clue in play this round.
  const x = board("defense");
  const hunter = make(x, HUNTERS);
  x.engaged.push(hunter);
  const def = stats(x, hunter).defense;
  hunter.attachments.push({ id: "c1", code: CLUE, exhausted: false });
  x.staging.push(make(x, G.lookout));
  assert.equal(stats(x, hunter).defense, def + 2);
  shadow(x, hunter, G.lookout, x.heroes[0]);
  assert.equal(stats(x, hunter).defense, def + 2 + cluesInPlay(x));
  x.round++;
  assert.equal(stats(x, hunter).defense, def + 2);
  // Dark Pools: no progress in the staging area; travelling there discards
  // each player's highest-cost ally.
  const y = board("travel");
  const pools = make(y, G.pools);
  y.staging.push(pools);
  progressLocation(y, pools, 2);
  assert.equal(pools.progress, 0);
  const gandalf = make(y, GANDALF);
  y.allies.push(gandalf, make(y, "01016"));
  y.staging = [];
  y.activeLocation = pools;
  hooks(y).travelEntered!(y, pools, true);
  flush(y);
  assert.ok(!y.allies.some((a) => a.id === gandalf.id));
  assert.equal(y.allies.length, 1);
  assert.ok(valid(y));
});

test("Nightmare: seeded The Hunt for Gollum games finish with valid saves", () => {
  for (const seed of [1, 2]) {
    const s = autoplay(gollum(seed));
    assert.notEqual(s.status, "playing", `hunt-for-gollum seed ${seed}`);
  }
  const t = autoplay(nightmareForTwo("hunt-for-gollum", 7), 4000);
  assert.notEqual(t.status, "playing", "two-player hunt-for-gollum");
});
