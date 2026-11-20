import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage, progressLocation, revealed } from "../src/game/board";
import { fx, make } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { automatedScenarioId } from "../src/game/support";
import { WMA, WMA_RECIPES, WMA_SACKS } from "../src/game/we-must-away-support";
import {
  NIGHTMARE,
  NIGHTMARE_OHUH as N,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { forOwner, seatIndices } from "../src/game/table";
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

/** Lone-Lands: a location with no "When Revealed" effect and no shadow. */
const QUIET = WMA.loneLands;
const ID = "we-must-away-ere-break-of-day";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
/** A quiet board at stage 1: a quiet encounter deck, the Trolls and Troll Cave set aside. */
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
  });
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      s.engaged = [];
      s.threat = 20;
      s.hand = [];
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
/** A Troll taken from the set-aside cards, engaged with the first player. */
function troll(s: GameState, code: string) {
  const q = s.weMustAway!;
  const u = q.setAside.find((x) => x.code === code)!;
  q.setAside = q.setAside.filter((x) => x.id !== u.id);
  s.engaged.push(u);
  return u;
}
/** Put a character in a Sack drawn from the sack deck. */
function sack(s: GameState, u: Unit, code = WMA.deep) {
  const q = s.weMustAway!;
  q.sackDeck = q.sackDeck.filter((c) => c !== code);
  u.attachments.push({ id: `a${s.nextId++}`, code, exhausted: false });
}
const sackCount = (s: GameState) => {
  const q = s.weMustAway!;
  const attached = [...s.heroes, ...s.allies].flatMap((u) =>
    u.attachments.filter((a) => WMA_SACKS.includes(a.code)),
  ).length;
  return q.sackDeck.length + q.drawn.length + attached;
};

test("Nightmare: We Must Away, Ere Break of Day's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.wmaCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    [
      "nightmare",
      "nightmare",
      "We Must Away, Ere Break of Day - Nightmare",
      true,
    ],
  );
  assert.match(
    c.text!,
    /3x A Suspicious Crow\n1x Lone-lands\n1x Dreary Hills\n2x Hobbit-lands\n2x A Nice Pickle\n/,
  );
  assert.match(c.text!, /Play Tip: The treachery card, Night Wanes Slow/);
  assert.match(
    c.back_text!,
    /^You are playing Nightmare mode\.\nThe objective cards Troll Key and Troll Purse gain surge\.$/,
  );
  const crows = card(N.crows);
  assert.deepEqual(
    [crows.threat, crows.attack, crows.defense, crows.health, crows.engagement],
    [4, 4, 1, 3, 50],
  );
  const light = card(N.light);
  assert.deepEqual([light.threat, light.printed_stats?.quest], [5, "-"]);
  assert.match(light.text!, /\nTravel: Sack 1\.\n/);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "We Must Away, Ere Break of Day - Nightmare",
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

test("Nightmare: We Must Away's Nightmare deck matches its source recipe, with the sack deck and the set-aside cards", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const pile = (id: string, section: string) =>
    recipes
      .find((r) => r.id === id)!
      .cards.filter((c) => c.section === section)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const count = (list: string[]) =>
    list.reduce<Record<string, number>>(
      (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
      {},
    );
  const standard = WMA_RECIPES.find((r) => r.mode === "standard")!
    .cards.filter((c) => c.section === "sharedEncounterDeck")
    .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  assert.deepEqual(
    count(nightmareEncounterDeck(ID, standard)),
    count(pile("N0A.1", "sharedEncounterDeck")),
  );
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(
      card(N.wmaCard)
        .text!.toLowerCase()
        .includes(`${n}x ${title}`.toLowerCase()),
      title,
    );
  for (const s of [game(), two()]) {
    assert.equal(nightmareCardOf(s), N.wmaCard);
    assert.deepEqual(
      count(s.weMustAway!.sackDeck),
      count(pile("N0A.1", "sharedEncounterDeck2")),
    );
    assert.deepEqual(
      count(s.weMustAway!.setAside.map((u) => u.code)),
      count(pile("N0A.1", "sharedSetAside")),
    );
    assert.match(nightmareStatus(s)[0], /Troll Key and Troll Purse gain surge/);
  }
  assert.ok(valid(opening(game())));
  // The audit maps the recipe's garbled title to the scenario.
  assert.equal(
    automatedScenarioId({
      name: "We Must Away Away, Ere of Day (Nightmare)",
      mode: "nightmare",
    }),
    ID,
  );
});

test("Nightmare: Troll Key and Troll Purse gain surge, and A Murder of Crows reveals from the discard pile and returns to the deck instead of being destroyed", () => {
  const s = board("staging");
  assert.equal(hooks(s).revealedSurge!(s, WMA.key), true);
  assert.equal(hooks(s).revealedSurge!(s, WMA.purse), true);
  assert.equal(hooks(s).revealedSurge!(s, QUIET), false);
  // Revealing the Key reveals another encounter card.
  const before = s.encounterDeck.length;
  revealed(s, WMA.key);
  run(s);
  assert.equal(s.encounterDeck.length, before - 1, "the surge's reveal");
  assert.ok(s.staging.some((u) => u.code === QUIET));
  // A Murder of Crows: a random card of the discard pile is revealed.
  const t = board("staging");
  t.encounterDiscard = [QUIET];
  revealed(t, N.crows);
  run(t);
  const crows = t.staging.find((u) => u.code === N.crows)!;
  assert.ok(crows);
  assert.ok(t.staging.some((u) => u.code === QUIET));
  assert.equal(t.encounterDiscard.length, 0);
  // Destroyed: it is shuffled back into the encounter deck.
  t.staging = t.staging.filter((u) => u.id !== crows.id);
  t.engaged.push(crows);
  const deck = t.encounterDeck.length;
  damage(t, crows.id, 5);
  run(t);
  assert.ok(!t.engaged.some((u) => u.id === crows.id));
  assert.equal(t.encounterDeck.length, deck + 1);
  assert.ok(t.encounterDeck.includes(N.crows));
  assert.ok(!t.encounterDiscard.includes(N.crows));
  assert.ok(valid(t));
});

test("Nightmare: Red River-bank recycles the discard pile's top card at the refresh phase, and Wicked Hilltops costs allies without a Sack", () => {
  const s = board("refresh");
  add(s, N.river);
  s.encounterDiscard = [QUIET, WMA.camp];
  const camp = Number(card(WMA.camp).threat) || 0;
  run(s, hooks(s).refreshStart!(s));
  assert.equal(s.encounterDeck.at(-1), WMA.camp);
  assert.deepEqual(s.encounterDiscard, [QUIET]);
  assert.equal(s.threat, 20 + camp);
  // Wicked Hilltops: progress makes each player discard an ally without a Sack.
  let t = board("quest");
  const hill = add(t, N.hilltops);
  const ally = add(t, "01016");
  t.staging = t.staging.filter((u) => u.id !== ally.id);
  t.allies.push(ally);
  const kept = make(t, "01016");
  t.allies.push(kept);
  sack(t, kept);
  progressLocation(t, hill, 1);
  run(t);
  if (t.choice) t = pick(t, ally.id);
  assert.ok(!t.allies.some((u) => u.id === ally.id));
  assert.ok(
    t.allies.some((u) => u.id === kept.id),
    "the sacked ally stays",
  );
  // Its shadow: +2 [attack], +3 for a Troll.
  const u = board("attack");
  const tom = troll(u, WMA.tom);
  shadow(u, tom, N.hilltops);
  assert.equal(u.combat!.attackBonus, 3);
  const v = board("attack");
  const crows = add(v, N.crows, true);
  shadow(v, crows, N.hilltops);
  assert.equal(v.combat!.attackBonus, 2);
});

test("Nightmare: Comfortable Light takes no progress, sacks a character to travel and is discarded once active", () => {
  const s = board("travel");
  const light = add(s, N.light);
  progressLocation(s, light, 3);
  assert.equal(light.progress, 0);
  assert.deepEqual(
    hooks(s).travelEffects!(s, light)?.map((e) => [e.kind, e.value]),
    [["wmaSack", 1]],
  );
  run(s, [fx("travelEnter", { target: light.id, player: 0 })]);
  assert.equal(s.activeLocation, null);
  assert.ok(s.encounterDiscard.includes(N.light));
  assert.ok(valid(s));
});

test("Nightmare: Mince Them Fine sets the engaged Trolls on the players and starts stage 2A; Night Wanes Slow refills the deck and stops Roast Mutton's discards; One by One squashes a sacked character", () => {
  // At stage 1, Mince Them Fine advances to stage 2A.
  let s = board("staging");
  revealed(s, N.mince);
  run(s);
  for (let i = 0; i < 6 && s.choice; i++) s = pick(s, s.choice.options[0].id);
  run(s);
  assert.equal(s.stage, 2);
  assert.ok(s.staging.some((u) => u.code === WMA.tom));
  // An engaged Troll makes an immediate attack.
  const t = board("planning");
  t.stage = 2;
  const bert = troll(t, WMA.bert);
  revealed(t, N.mince);
  flush(t);
  assert.equal(t.combat?.enemyId, bert.id);
  // Its shadow returns an attacking Troll.
  const u = board("attack");
  const tom = troll(u, WMA.tom);
  shadow(u, tom, N.mince);
  assert.equal(u.combat!.returnToStaging, true);
  // Night Wanes Slow shuffles the discard pile in and reveals another card.
  const v = board("staging");
  v.encounterDiscard = [QUIET, QUIET];
  const deck = v.encounterDeck.length;
  revealed(v, N.night);
  run(v);
  assert.equal(v.encounterDeck.length, deck + 2 - 1);
  assert.deepEqual(v.encounterDiscard, [N.night]);
  // Roast Mutton's discards stop at Night Wanes Slow.
  const w = board("staging");
  w.encounterDeck = [QUIET, N.night, QUIET, QUIET];
  run(w, [fx("wmaMuttonDiscard", { value: 4, player: 0 })]);
  assert.deepEqual(w.encounterDiscard, [QUIET, N.night]);
  assert.deepEqual(w.encounterDeck, [QUIET, QUIET]);
  // One by One destroys a sacked character; its Sack goes back on top and is drawn again.
  let x = board("planning");
  const victim = make(x, "01016");
  x.allies.push(victim);
  sack(x, victim, WMA.foul);
  const total = sackCount(x);
  revealed(x, N.oneByOne);
  run(x);
  for (let i = 0; i < 6 && x.choice; i++) x = pick(x, x.choice.options[0].id);
  run(x);
  assert.ok(!x.allies.some((a) => a.id === victim.id));
  assert.equal(sackCount(x), total);
  assert.ok(
    [...x.heroes, ...x.allies].some((h) =>
      h.attachments.some((a) => a.code === WMA.foul),
    ),
    "the Foul Sack is attached again",
  );
  assert.ok(valid(x));
  // With no sacked character, nothing happens.
  const y = board("planning");
  revealed(y, N.oneByOne);
  run(y);
  assert.equal(sackCount(y), 7);
  assert.equal(y.choice, null);
});

test("Nightmare: We Must Away's seeded games finish with valid saves", () => {
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
});
