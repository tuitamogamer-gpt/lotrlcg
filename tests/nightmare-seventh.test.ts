import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage, revealed } from "../src/game/board";
import { fx, make, stats, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { KHAZAD, advanceKhazad } from "../src/game/khazad-dum";
import {
  NIGHTMARE,
  NIGHTMARE_KD as K,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareEventImmune,
  nightmareStatus,
} from "../src/game/nightmare";
import { forOwner } from "../src/game/table";
import { automatedScenarioId } from "../src/game/support";
import { scenario } from "../src/game/scenarios";
import type { GameState } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  calm,
  nightmareForTwo,
  nightmareGame,
  opening,
  reveal,
  shadow,
  valid,
} from "./nightmare-fixtures";

const GOBLIN = KHAZAD.swordsman,
  TROLL = KHAZAD.caveTroll,
  FILLER = KHAZAD.hall;
const seventh = (seed = 5) => nightmareGame("the-seventh-level", seed);
/** A quiet board in `phase`: no location active, nothing staged, engaged or discarded. */
const board = (phase: GameState["phase"], seed = 5) => {
  const s = calm(opening(seventh(seed)), phase);
  s.activeLocation = null;
  delete s.extraActiveLocations;
  s.staging = [];
  s.engaged = [];
  s.encounterDiscard = [];
  return s;
};
const hooks = (s: GameState) => batch4Scenario(s);
const run = (s: GameState, kind: string, data: object = {}) => {
  s.queue.push(fx(kind, data));
  flush(s);
  return s;
};
/** Stage 1 defeated (15 progress): stage 2B is revealed. */
function toStage2(s: GameState) {
  s.progress = 15;
  advanceKhazad(s);
  flush(s);
  return s;
}

test("Nightmare: The Seventh Level's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(K.seventhCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "The Seventh Level - Nightmare", true],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for The Seventh Level scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n2x Plundered Armoury\n2x Hidden Threat\n2x Upper Hall\n2x Goblin Scout\n2x Goblin Swordsman\n2x Goblin Spearman\nThen, shuffle .*\n"Does not stack"\nSome cards have passive abilities with the text "This ability does not stack with…" While two or more effects that do not stack with one another are active, only one of them will affect the game state\.$/s,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nSetup: Set Overseer Maurûl and Chamber of Records aside, out of play.\nForced: When stage 2B is revealed, make Chamber of Records the active location (returning any currently active location to the staging area) and add Overseer Maurûl to the staging area. Then, shuffle all copies of Balin's Doom in the encounter discard pile back into the encounter deck.",
  );
  // The scans correct the catalog (Maurûl's accent, Deep-Mines' comma).
  assert.match(
    card(K.maurul).text!,
    /^Overseer Maurûl gets \+X \[threat\], \+X \[attack\], and \+X \[defense\], .*\nThe players cannot win the game unless Overseer Maurûl is in the victory display\.$/,
  );
  assert.equal(
    card(K.deepMines).shadow,
    "Shadow: Attacking enemy gets +1 [attack]. Then, if attacking enemy is a Goblin, deal it another shadow card.",
  );
  const stat = (code: string) => {
    const x = card(code);
    return [x.engagement, x.threat, x.attack, x.defense, x.health];
  };
  assert.deepEqual(stat(K.maurul), [20, 3, 3, 3, 12]);
  assert.deepEqual(stat(K.taskmaster), [44, 1, 4, 4, 6]);
  assert.deepEqual(stat(K.skirmisher), [15, 2, 4, 2, 3]);
  assert.deepEqual(stat(K.pitGoblin), [36, 3, 2, 1, 4]);
  assert.deepEqual(
    [card(K.maurul).is_unique, card(K.maurul).victory],
    [true, 5],
  );
  assert.deepEqual(
    [card(K.chamber).is_unique, card(K.chamber).victory],
    [true, 5],
  );
  assert.deepEqual(
    [K.chamber, K.deepMines, K.westernHall].map((x) => [
      card(x).threat,
      card(x).quest,
    ]),
    [
      [5, 8],
      [2, 6],
      [4, 4],
    ],
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Seventh Level - Nightmare",
  );
  assert.equal(set.length, 10);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(
    art.filter((a) => set.some((x) => x.code === a.code)).length,
    11,
  );
});

test("Nightmare: The Seventh Level's Nightmare encounter deck matches its source recipe, and stage 2B brings Chamber of Records and Overseer Maurûl", () => {
  const sets = scenario("the-seventh-level").sets as readonly string[];
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  const deck = nightmareEncounterDeck("the-seventh-level", standard);
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
  const recipe = recipes.find((r) => r.id === "N02.2")!;
  const expected: Record<string, number> = {};
  for (const c of recipe.cards)
    if (c.section !== "sharedQuestDeck" && c.code !== K.seventhCard)
      expected[c.code] = (expected[c.code] ?? 0) + c.quantity;
  assert.deepEqual(count(deck), expected);
  for (const [title, n] of Object.entries(
    NIGHTMARE["the-seventh-level"]!.removals,
  ))
    assert.ok(card(K.seventhCard).text!.includes(`${n}x ${title}`), title);
  assert.equal(
    automatedScenarioId({
      name: "The Seventh Level (Nightmare)",
      mode: "nightmare",
    }),
    "the-seventh-level",
  );
  const s = opening(seventh());
  assert.equal(nightmareCardOf(s), K.seventhCard);
  assert.match(nightmareStatus(s)[0], /set aside until stage 2B/);
  for (const code of [K.maurul, K.chamber])
    assert.ok(!s.encounterDeck.includes(code), card(code).name);
  assert.ok(valid(s));
  assert.ok(valid(opening(nightmareForTwo("the-seventh-level"))));
  // Stage 2B: Chamber of Records becomes the active location (the previous
  // one returns to the staging area), Overseer Maurûl enters the staging
  // area, and Balin's Doom returns from the discard pile.
  const t = board("planning");
  const previous = make(t, FILLER);
  previous.progress = 1;
  t.activeLocation = previous;
  t.encounterDiscard = [K.balinsDoom, FILLER, K.balinsDoom];
  const deckSize = t.encounterDeck.length;
  toStage2(t);
  assert.equal(t.stage, 2);
  assert.equal(t.activeLocation?.code, K.chamber);
  assert.ok(t.staging.some((u) => u.id === previous.id && u.progress === 1));
  assert.ok(t.staging.some((u) => u.code === K.maurul));
  assert.deepEqual(t.encounterDiscard, [FILLER]);
  assert.equal(t.encounterDeck.length, deckSize + 2);
  assert.match(nightmareStatus(t)[0], /cannot win unless Overseer Maurûl/);
  assert.ok(valid(t));
  // The players cannot win unless Overseer Maurûl is in the victory display.
  t.progress = 17;
  advanceKhazad(t);
  assert.equal(t.status, "playing");
  t.victoryCards = [...(t.victoryCards ?? []), K.maurul];
  advanceKhazad(t);
  assert.equal(t.status, "won");
});

test("Nightmare: resources on Goblin enemies (Pit Goblin, Orc Taskmaster, Balin's Doom, Deep-Mines, Chamber of Records, Western Hall)", () => {
  // Pit Goblin enters play with 2 resources; Orc Taskmaster and Balin's
  // Doom add 1 to each Goblin enemy.
  const s = board("staging");
  s.encounterDeck = [FILLER, FILLER];
  const t = reveal(s, K.pitGoblin);
  const pit = t.staging.find((u) => u.code === K.pitGoblin)!;
  assert.equal(pit.resources, 2);
  const troll = make(t, TROLL);
  t.staging.push(troll);
  const u = reveal(t, K.taskmaster);
  assert.equal(u.staging.find((x) => x.code === K.pitGoblin)!.resources, 3);
  assert.equal(u.staging.find((x) => x.id === troll.id)!.resources, 0);
  const v = reveal(u, K.balinsDoom);
  assert.equal(v.staging.find((x) => x.code === K.pitGoblin)!.resources, 4);
  assert.ok(v.encounterDiscard.includes(K.balinsDoom));
  assert.ok(v.encounterDeck.length < 2, "surge");
  assert.ok(valid(v));
  // Deep-Mines: each copy in the staging area adds 1 to a Goblin enemy
  // entering play.
  const w = board("staging");
  w.staging.push(make(w, K.deepMines), make(w, K.deepMines));
  w.encounterDeck = [FILLER];
  const x = reveal(w, GOBLIN);
  assert.equal(x.staging.find((y) => y.code === GOBLIN)!.resources, 2);
  const y = reveal(x, TROLL);
  assert.equal(y.staging.find((z) => z.code === TROLL)!.resources, 0);
  // Chamber of Records: a Goblin enemy engaging a player takes 2 resources;
  // with a resource, it is immune to player events.
  const z = board("encounter");
  z.activeLocation = make(z, K.chamber);
  const goblin = make(z, GOBLIN);
  z.staging.push(goblin);
  assert.equal(nightmareEventImmune(z, goblin), false);
  hooks(z).engaged!(z, goblin, false, true);
  assert.equal(goblin.resources, 2);
  assert.equal(nightmareEventImmune(z, goblin), true);
  z.activeLocation = null;
  assert.equal(nightmareEventImmune(z, goblin), false);
  // Western Hall: +1 [threat] for each resource (it does not stack); its
  // Travel adds 1 resource to each Goblin enemy.
  const a = board("travel");
  const hall = make(a, K.westernHall);
  const orc = make(a, GOBLIN);
  orc.resources = 2;
  a.staging.push(hall, make(a, K.westernHall), orc);
  assert.equal(threatOf(a, orc), 1 + 2);
  hooks(a).travelEntered!(a, hall, true);
  assert.equal(orc.resources, 3);
  // Goblin Skirmisher: +1 [attack] for each resource (it does not stack);
  // Overseer Maurûl: +X [threat], [attack] and [defense], X the most
  // resources on a Goblin enemy.
  const b = board("planning");
  const g = make(b, GOBLIN),
    maurul = make(b, K.maurul);
  g.resources = 3;
  b.staging.push(g, maurul);
  assert.equal(stats(b, g).attack, 3);
  b.staging.push(make(b, K.skirmisher), make(b, K.skirmisher));
  assert.equal(stats(b, g).attack, 3 + 3);
  assert.deepEqual(
    [threatOf(b, maurul), stats(b, maurul).attack, stats(b, maurul).defense],
    [3 + 3, 3 + 3, 3 + 3],
  );
  // Orc Taskmaster: damage to a Goblin enemy with a resource is cancelled,
  // and the enemy loses 1 resource.
  const c = board("combat");
  const boss = make(c, K.taskmaster),
    target = make(c, GOBLIN);
  target.resources = 1;
  c.engaged.push(boss, target);
  damage(c, target.id, 2);
  assert.deepEqual([target.damage, target.resources], [0, 0]);
  damage(c, target.id, 2);
  assert.equal(target.damage, 2);
});

test("Nightmare: Beats and Echoes and The Seventh Level's shadows", () => {
  // Beats and Echoes: X is 2 plus the players not engaged with a Goblin
  // enemy; the enemies enter the staging area, the rest is discarded.
  const s = board("staging");
  s.encounterDeck = [GOBLIN, FILLER, TROLL, FILLER];
  const t = reveal(s, K.beats);
  assert.deepEqual(t.staging.map((u) => u.code).sort(), [GOBLIN, TROLL].sort());
  assert.equal(t.encounterDeck.length, 1);
  assert.deepEqual(
    t.encounterDiscard.filter((c) => c === FILLER),
    [FILLER],
  );
  assert.ok(t.encounterDiscard.includes(K.beats));
  // Engaged with a Goblin enemy, the player no longer counts.
  const u = board("staging");
  u.engaged.push(make(u, GOBLIN));
  u.encounterDeck = [TROLL, TROLL, TROLL];
  const v = reveal(u, K.beats);
  assert.equal(v.staging.filter((x) => x.code === TROLL).length, 2);
  // Two players, one engaged with a Goblin enemy: X is 3.
  const two = calm(opening(nightmareForTwo("the-seventh-level")), "staging");
  two.staging = [];
  for (const p of [0, 1]) forOwner(two, p, () => (two.engaged = []));
  forOwner(two, 1, () => two.engaged.push(make(two, GOBLIN)));
  two.encounterDeck = [FILLER, FILLER, FILLER, FILLER, FILLER];
  revealed(two, K.beats);
  flush(two);
  assert.equal(two.encounterDeck.length, 2);
  // The shadows: a Goblin attacker takes a resource (Balin's Doom, Pit
  // Goblin); Goblin Skirmisher deals X damage to the defender; Deep-Mines
  // gives +1 [attack] and a Goblin attacker another shadow card.
  const w = board("defense");
  const goblin = make(w, GOBLIN),
    troll = make(w, TROLL);
  w.engaged.push(goblin, troll);
  shadow(w, goblin, K.balinsDoom, w.heroes[0]);
  shadow(w, goblin, K.pitGoblin, w.heroes[0]);
  shadow(w, troll, K.pitGoblin, w.heroes[0]);
  assert.deepEqual([goblin.resources, troll.resources], [2, 0]);
  const hero = w.heroes[1];
  const before = hero.damage;
  shadow(w, goblin, K.skirmisher, hero);
  flush(w);
  assert.equal(hero.damage, before + 2);
  delete w.flow;
  w.encounterDeck = [FILLER, FILLER];
  shadow(w, goblin, K.deepMines, w.heroes[0]);
  assert.equal(w.combat!.attackBonus, 1);
  flush(w);
  assert.deepEqual(goblin.shadows, [K.deepMines, FILLER]);
  shadow(w, troll, K.deepMines, w.heroes[0]);
  flush(w);
  assert.deepEqual(troll.shadows, [K.deepMines]);
});

test("Nightmare: seeded The Seventh Level games finish with valid saves", () => {
  for (const seed of [1, 2]) {
    const s = autoplay(seventh(seed));
    assert.notEqual(s.status, "playing", `the-seventh-level seed ${seed}`);
  }
  // From stage 2B.
  const t = toStage2(board("planning", 3));
  const u = autoplay(t, 3000);
  assert.notEqual(u.status, "playing", "from stage 2");
  const two = autoplay(nightmareForTwo("the-seventh-level", 7), 4000);
  assert.notEqual(two.status, "playing", "two-player the-seventh-level");
});
