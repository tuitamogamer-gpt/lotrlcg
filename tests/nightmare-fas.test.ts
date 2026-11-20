import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { revealed } from "../src/game/board";
import { engagementCost, fx, make, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { syncAttachmentText } from "../src/game/attachment-text";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { bagginsBilbo } from "../src/game/hobbit-saga";
import {
  FAS,
  FAS_RECIPES,
  givePoison,
  makeUnconscious,
  poisonOf,
} from "../src/game/flies-spiders";
import {
  NIGHTMARE,
  NIGHTMARE_OTD as N,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import {
  attackersFor,
  defendersFor,
  forOwner,
  globalCharacters,
  seatIndices,
} from "../src/game/table";
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

/** Forest Stream: a location with no effect while in the staging area. */
const QUIET = FAS.stream;
const ID = "flies-and-spiders";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
/** A quiet board after the opening: nothing poisoned, the staging area empty. */
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
  });
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      s.engaged = [];
      s.threat = 20;
      for (const h of s.heroes) {
        Object.assign(h, { damage: 0, exhausted: false, committed: false });
        delete h.unconscious;
        h.attachments = h.attachments.filter((a) => !a.poison);
      }
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
const heroesOf = (s: GameState) =>
  s.heroes.filter((h) => h.id !== bagginsBilbo(s)?.id);
const poisonIn = (s: GameState) =>
  globalCharacters(s).reduce((n, u) => n + poisonOf(u), 0);

test("Nightmare: Flies and Spiders' setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.fasCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "Flies and Spiders - Nightmare", true],
  );
  assert.match(
    c.text!,
    /3x Dark Bats\n3x Hidden Path\n2x Fighting Among Friends\n5x Wicked Spider\n1x Fat Spider\n1x Giant Web\n/,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nSetup: Each player gives 1 poison to a hero he controls.",
  );
  const attercop = card(N.attercop);
  assert.deepEqual(
    [
      attercop.engagement,
      attercop.threat,
      attercop.attack,
      attercop.defense,
      attercop.health,
    ],
    [35, 4, 6, 3, 6],
  );
  assert.match(
    attercop.text!,
    /^Venom\.\nAttercop gets -1 engagement cost for each poison in play\.\nPoisoned characters/,
  );
  assert.equal(card(N.path).threat, undefined);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Flies and Spiders - Nightmare",
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

test("Nightmare: Flies and Spiders' Nightmare deck matches its source recipe, and each player poisons a hero after the scenario's setup", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const pile = (
    cards: { code: string; quantity: number; section: string }[],
    section: string,
  ) =>
    cards
      .filter((c) => c.section === section)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const count = (list: string[]) =>
    list.reduce<Record<string, number>>(
      (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
      {},
    );
  const nightmare = recipes.find((r) => r.id === "N0A.4")!.cards;
  const standard = FAS_RECIPES.find((r) => r.mode === "standard")!.cards;
  assert.deepEqual(
    count(nightmareEncounterDeck(ID, pile(standard, "sharedEncounterDeck"))),
    count(pile(nightmare, "sharedEncounterDeck")),
  );
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.fasCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [game(), two()]) {
    assert.equal(nightmareCardOf(s), N.fasCard);
    assert.deepEqual(
      count(s.encounterDeck),
      count(pile(nightmare, "sharedEncounterDeck")),
    );
    assert.deepEqual(
      s.fliesSpiders!.setAside.map((u) => u.code),
      [FAS.glade],
    );
    assert.match(nightmareStatus(s)[0], /gives 1 poison to a hero/);
  }
  // After the opening hands, the ring offers and the reveals: 1 poison each.
  for (const [s, players] of [
    [opening(game()), 1],
    [opening(two()), 2],
  ] as const) {
    assert.equal(poisonIn(s), players);
    for (const p of seatIndices(s))
      assert.equal(
        globalCharacters(s)
          .filter((u) => u.owner === p || (u.owner === undefined && !p))
          .reduce((n, u) => n + poisonOf(u), 0),
        1,
      );
    const text = s.log.map((l) => l.text);
    assert.ok(
      text.findIndex((l) => l.startsWith("Revealed")) <
        text.findIndex((l) => l.endsWith("gets 1 poison.")),
      "the poison follows the setup reveals",
    );
    assert.ok(valid(s));
  }
});

test("Nightmare: Attercop comes closer with every poison and refuses poisoned attackers and defenders; Venom poisons the characters it damages", () => {
  const s = board("planning");
  const attercop = add(s, N.attercop);
  assert.equal(engagementCost(s, attercop), 35);
  const [a, b] = heroesOf(s);
  givePoison(s, a, 2);
  assert.equal(engagementCost(s, attercop), 33);
  s.staging = [];
  s.engaged.push(attercop);
  calm(s, "attack");
  assert.ok(!defendersFor(s, attercop).some((u) => u.id === a.id));
  assert.ok(defendersFor(s, attercop).some((u) => u.id === b.id));
  assert.ok(!attackersFor(s, attercop).some((u) => u.id === a.id));
  // Venom: damage from Attercop gives 1 poison.
  hooks(s).damageDealt!(s, b, 2, { enemyId: attercop.id } as never);
  run(s);
  assert.equal(poisonOf(b), 1);
});

test("Nightmare: Venomous Spider poisons its defenders; its shadow gives 2 poison", () => {
  const s = board("defense");
  const spider = add(s, N.venomous, true);
  const [a] = heroesOf(s);
  run(s, hooks(s).defendersDeclared!(s, spider, [a]));
  assert.equal(poisonOf(a), 1);
  const t = board("defense");
  const [d] = heroesOf(t);
  shadow(t, add(t, FAS.fat, true), N.venomous, d);
  assert.equal(poisonOf(d), 2);
});

test("Nightmare: Dark Colony keeps poisoned characters from readying and costs a poison to travel to", () => {
  let s = board("travel");
  const colony = add(s, N.colony);
  const [a, b] = heroesOf(s);
  assert.equal(hooks(s).travelProblem!(s, colony), null);
  run(s, hooks(s).travelEffects!(s, colony));
  s = pick(s, b.id);
  assert.equal(poisonOf(b), 1);
  // Active: poisoned characters cannot ready.
  s.staging = [];
  s.activeLocation = colony;
  a.exhausted = b.exhausted = true;
  run(s, [fx("refreshReady")]);
  assert.equal(b.exhausted, true);
  assert.equal(a.exhausted, false);
  // Every hero unconscious: nobody can pay.
  const t = board("travel");
  const c2 = add(t, N.colony);
  for (const h of t.heroes) makeUnconscious(t, h);
  assert.match(hooks(t).travelProblem!(t, c2) ?? "", /give 1 poison/);
});

test("Nightmare: Mirkwood Path's threat is the poison in play, it knocks a hero out when explored, and its shadow arms the attacker", () => {
  let s = board("planning");
  const path = add(s, N.path);
  assert.equal(threatOf(s, path), 0);
  const [a, b] = heroesOf(s);
  givePoison(s, a, 1);
  givePoison(s, b, 2);
  assert.equal(threatOf(s, path), 3);
  hooks(s).explored!(s, path);
  run(s);
  s = pick(s, b.id);
  assert.equal(b.unconscious, true);
  assert.equal(poisonOf(b), 0, "its poison is discarded");
  const t = board("attack");
  givePoison(t, heroesOf(t)[0], 1);
  givePoison(t, heroesOf(t)[1], 1);
  shadow(t, add(t, FAS.fat, true), N.path);
  assert.equal(t.combat!.attackBonus, 2);
});

test("Nightmare: Patch of Midnight blanks poisoned characters while active, and its shadow raises the threat", () => {
  const s = board("planning");
  const [a, b] = heroesOf(s);
  givePoison(s, a, 1);
  s.activeLocation = make(s, N.patch);
  syncAttachmentText(s);
  assert.equal(a.blanked, true);
  assert.equal(a.printedTraitsPreserved, true);
  assert.ok(!b.blanked);
  s.activeLocation = null;
  syncAttachmentText(s);
  assert.ok(!a.blanked);
  const t = board("attack");
  givePoison(t, heroesOf(t)[0], 1);
  shadow(t, add(t, FAS.fat, true), N.patch);
  run(t);
  assert.equal(t.threat, 21);
});

test("Nightmare: A Horrible Battle poisons every hero or reveals a card, and its shadow attacks again", () => {
  let s = board("staging");
  revealed(s, N.battle);
  run(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["poison", "reveal"],
  );
  s = pick(s, "poison");
  assert.ok(s.heroes.every((h) => poisonOf(h) === 1));
  assert.ok(s.encounterDiscard.includes(N.battle));
  let t = board("staging");
  revealed(t, N.battle);
  run(t);
  t = pick(t, "reveal");
  assert.ok(t.staging.some((u) => u.code === QUIET));
  // An unconscious hero cannot take its poison: the card is revealed.
  const u = board("staging");
  makeUnconscious(u, heroesOf(u)[0]);
  revealed(u, N.battle);
  run(u);
  assert.equal(u.choice, null);
  assert.ok(u.staging.some((x) => x.code === QUIET));
  const v = board("attack");
  shadow(v, add(v, FAS.fat, true), N.battle);
  assert.equal(v.combat!.extraAttacks, 1);
});

test("Nightmare: Spider Bite surges, poisons its hero at the end of each round and leaves an unconscious hero", () => {
  let s = board("staging");
  revealed(s, N.bite);
  run(s);
  assert.match(s.choice!.title, /Spider Bite/);
  const [a, b] = heroesOf(s);
  s = pick(s, a.id);
  assert.ok(a.attachments.some((x) => x.code === N.bite));
  assert.ok(
    s.staging.some((u) => u.code === QUIET),
    "Surge",
  );
  // Limit 1 per hero.
  revealed(s, N.bite);
  run(s);
  assert.ok(!s.choice!.options.some((o) => o.id === a.id));
  s = pick(s, b.id);
  calm(s, "refresh");
  run(s, hooks(s).roundEnd!(s));
  assert.equal(poisonOf(a), 1);
  assert.equal(poisonOf(b), 1);
  makeUnconscious(s, a);
  hooks(s).check!(s);
  assert.ok(!a.attachments.some((x) => x.code === N.bite));
  assert.ok(s.encounterDiscard.includes(N.bite));
  assert.ok(valid(s));
});

test("Nightmare: Flies and Spiders' seeded Nightmare games finish with valid saves", () => {
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
});
