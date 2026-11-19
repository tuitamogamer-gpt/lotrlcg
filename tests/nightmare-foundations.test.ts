import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { advanceQuest, engage, revealed } from "../src/game/board";
import { fx, make, stats, stagingThreat } from "../src/game/core";
import { flush } from "../src/game/effects";
import { applyAction, createGame } from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { foundationsEnemyX } from "../src/game/foundations-stone";
import {
  FOUNDATIONS_STONE as F,
  foundationsRecipe,
  foundationsState,
  foundationsArea,
} from "../src/game/foundations-stone-support";
import {
  NIGHTMARE,
  NIGHTMARE_DD as D,
  nightmareCardOf,
  nightmareStatus,
} from "../src/game/nightmare";
import { forOwner, seatIndices, seatView } from "../src/game/table";
import { automatedScenarioId } from "../src/game/support";
import type { GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  calm,
  choose,
  d,
  nightmareForTwo,
  nightmareGame,
  opening,
  shadow,
  valid,
} from "./nightmare-fixtures";

/** Zigil Mineshaft: a location with no "When Revealed" effect and no shadow. */
const ZIGIL = encounterCards.find((c) => c.name === "Zigil Mineshaft")!.code;
const SCOUT = "01016"; // Snowbourn Scout, cost 1
const HAMMERSMITH = "01059"; // cost 2
const SLAYER = "01018"; // Longbeard Orc Slayer, cost 4
const BROK = "01019"; // Brok Ironfist, cost 6
const SWORD = "04055"; // Sword that was Broken: Artifact.
const STEED = "10059"; // Steed of Imladris: Mount.
const game = (seed = 5) => nightmareGame("foundations-of-stone", seed);
const two = (seed = 5) => nightmareForTwo("foundations-of-stone", seed);
/** A quiet board in `phase`: nothing staged or engaged, decks of Snowbourn Scouts, threat 20. */
function board(phase: GameState["phase"], s: GameState = opening(game())) {
  calm(s, phase);
  Object.assign(s, {
    staging: [],
    activeLocation: null,
    extraActiveLocations: [],
    combat: null,
    stage: 1,
    progress: 0,
    encounterDeck: Array(20).fill(ZIGIL),
    encounterDiscard: [],
    stageRevealing: false,
  });
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      s.engaged = [];
      s.allies = [];
      s.threat = 20;
      s.deck = Array(20).fill(SCOUT);
      for (const h of s.heroes)
        Object.assign(h, {
          resources: 2,
          exhausted: false,
          damage: 0,
          committed: false,
          attachments: [],
        });
    });
  delete s.nightmare;
  return s;
}
const hooks = (s: GameState) => batch4Scenario(s);
/** Choices answered: "Revealed:" windows resolve, others take `id` or the first option. */
function settle(s: GameState, id?: (s: GameState) => string | undefined) {
  for (let i = 0; i < 40 && s.choice; i++)
    s = choose(
      s,
      s.choice.options.find((o) => o.id === "resolve")?.id ??
        id?.(s) ??
        s.choice.options[0].id,
    );
  return s;
}
function ally(s: GameState, code: string, player = 0) {
  let a!: Unit;
  forOwner(s, player, () => {
    a = make(s, code);
    s.allies.push(a);
  });
  return a;
}
const attach = (u: Unit, code: string, id: string) =>
  u.attachments.push({ id, code, exhausted: false });

test("Nightmare: Foundations of Stone's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(D.foundationsCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "Foundations of Stone - Nightmare", true],
  );
  assert.equal(
    c.text,
    "Begin with the standard quest deck and encounter deck for the Foundations of Stone scenario.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n3x Goblin Scout\n2x Goblin Swordsman\n1x Goblin Follower\n3x Burning Low\n1x Brancing Paths\n1x Many Roads\n3x Cave In\n3x Drowned Treasury\n1x Mithril Lode\n4x Moria Bats\nDuring setup, players are instructed to set the Foundations of Stone encounter set aside, out of play. Shuffle the encounter cards in this Nightmare Deck with the Goblins of the Deep encounter set icon into the standard encounter deck. Then, shuffle the encounter cards in this Nightmare Deck with the Foundations of Stone encounter set icon into the remainder of the set aside Foundations of Stone encounter set.\nFinally, flip this card over and place it next to the quest deck. Its effect remains active throughout the game, which is now ready to begin.",
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nForced: When stage 3b is revealed, discard all Mount and Artifact cards from play. Each player must also discard allies he controls until the total printed cost of allies he controls is 6 or less.",
  );
  // The scans correct the catalog: Giant Cave Centipede's full name in its
  // Forced effect, and Unspeakable Thing's "engages".
  assert.equal(
    card(D.centipede).text,
    "When Revealed: Each player at this stage shuffles the card in his hand with the highest printed cost back into his deck.\nForced: At the end of the combat phase, if Giant Cave Centipede is engaged with a player, that player chooses and adds it to a different player's staging area.",
  );
  assert.equal(
    card(D.unspeakable).text,
    "Forced: When Unspeakable Thing engages a player or attacks a player, attach the top card of that player's deck to it.\nX is the printed cost of all attached cards on this card. If there are no cards attached, X is 5.",
  );
  assert.equal(
    card(D.primeval).text,
    "Forced: When Primeval Thing enters play, attach cards from the top of the first player's deck to it until the total printed cost of all attached cards is 6 or higher.\nX is the printed cost of all attached cards on this card. If there are no cards attached, X is 6.",
  );
  assert.equal(
    card(D.seeker).text,
    "Mithril Seeker gets +1 [attack] for each resource on it.\nForced: When Mithril Seeker attacks, move 1 resource from each of the defending player's heroes to Mithril Seeker.",
  );
  assert.equal(
    card(D.nest).text,
    "While Nest of Horrors is in the staging area, it gains: \"Forced: When one or more cards are attached to a Nameless enemy from the top of a player's deck, attach an additional card from the top of that player's deck.\"\nTravel: Each player at this stage discards the top card of the encounter deck to travel here. Reveal each Nameless enemy discarded by this effect.",
  );
  assert.equal(
    card(D.river).text,
    "While Shivering River is in the staging area, it contributes its [threat] to the total [threat] in each other player's staging area.",
  );
  assert.equal(
    card(D.chill).text,
    "When Revealed: Each player must either discard his hand, or raise his threat by the number of cards in his hand. If no cards were discarded by this effect, Chill of the Roots gains surge.",
  );
  assert.deepEqual(
    [D.river, D.chill].map((x) => card(x).shadow),
    [
      "Shadow: Attacking enemy gets +1 [attack]. (+3 [attack] instead if there is more than one player at this staging area.)",
      "Shadow: If attacking enemy is Nameless, attach the top card of the defending player's deck to it.",
    ],
  );
  const stat = (x: string) => {
    const k = card(x);
    return [k.engagement, k.threat, k.attack, k.defense, k.health];
  };
  assert.deepEqual(stat(D.seeker), [18, 2, 2, 2, 5]);
  assert.deepEqual(stat(D.centipede), [28, 3, 3, 5, 4]);
  assert.deepEqual(stat(D.unspeakable), [15, 5, undefined, 5, undefined]);
  assert.deepEqual(stat(D.primeval), [45, 6, undefined, 6, undefined]);
  assert.deepEqual(
    [D.nest, D.river].map((x) => [
      card(x).threat,
      card(x).quest,
      card(x).traits,
    ]),
    [
      [4, 4, "Underground. Dark."],
      [3, 7, "Underground. River."],
    ],
  );
  // Their encounter set icons.
  const icon = (x: string) =>
    (card(x) as { encounter_set_icon?: string }).encounter_set_icon;
  assert.deepEqual([D.seeker, D.centipede].map(icon), [
    "Goblins of the Deep",
    "Goblins of the Deep",
  ]);
  for (const x of [D.unspeakable, D.primeval, D.nest, D.river, D.chill])
    assert.equal(icon(x), "Foundations of Stone", card(x).name);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Foundations of Stone - Nightmare",
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

test("Nightmare: Foundations of Stone's Nightmare decks match their source recipe, split by encounter set icon", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const recipe = recipes.find((r) => r.id === "N02.8")!;
  const section = (name: string) => {
    const out: Record<string, number> = {};
    for (const c of recipe.cards)
      if (c.section === name) out[c.code] = (out[c.code] ?? 0) + c.quantity;
    return out;
  };
  const count = (list: string[]) =>
    list.reduce<Record<string, number>>(
      (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
      {},
    );
  const r = foundationsRecipe(false, true);
  assert.deepEqual(count(r.initial), section("sharedEncounterDeck"));
  assert.deepEqual(count(r.setAside), section("sharedEncounterDeck2"));
  // A Normal game keeps its own recipe.
  const standard = foundationsRecipe(false);
  assert.equal(standard.initial.length, 41);
  assert.equal(standard.setAside.length, 24);
  for (const [title, n] of Object.entries(
    NIGHTMARE["foundations-of-stone"]!.removals,
  ))
    assert.ok(
      card(D.foundationsCard).text!.includes(
        `${n}x ${title === "Branching Paths" ? "Brancing Paths" : title}`,
      ),
      title,
    );
  assert.equal(
    automatedScenarioId({
      name: "Foundations of Stone (Nightmare)",
      mode: "nightmare",
    }),
    "foundations-of-stone",
  );
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), D.foundationsCard);
    assert.match(nightmareStatus(s)[0], /stage 3B/);
    const aside = foundationsState(s)!.setAside;
    for (const x of [D.unspeakable, D.primeval, D.nest, D.river, D.chill])
      assert.ok(aside.includes(x), card(x).name);
    assert.ok(!aside.includes(D.seeker));
    const all = [
      ...s.encounterDeck,
      ...s.encounterDiscard,
      ...s.staging.map((u) => u.code),
      ...seatIndices(s).flatMap((p) =>
        seatView(s, p).engaged.map((u) => u.code),
      ),
    ];
    assert.equal(all.filter((c) => c === D.seeker).length, 3);
    assert.equal(all.filter((c) => c === D.centipede).length, 2);
    assert.ok(!all.includes(F.bats), "Moria Bats removed");
    assert.ok(valid(s));
  }
  const n = opening(
    createGame(5, d.cards, d.heroes, d.id, {
      scenarioId: "foundations-of-stone",
    }),
  );
  assert.ok(!foundationsState(n)!.setAside.includes(D.unspeakable));
  assert.ok(valid(n));
});

test("Nightmare: when stage 3B is revealed, Mount and Artifact cards are discarded and each player's allies are cut to a total cost of 6", () => {
  let s = board("quest", opening(two()));
  forOwner(s, 0, () => {
    attach(s.heroes[0], SWORD, "a-sword");
    attach(s.heroes[1], STEED, "a-steed");
  });
  const brok = ally(s, BROK, 0);
  const scout = ally(s, SCOUT, 0);
  ally(s, HAMMERSMITH, 1);
  ally(s, SLAYER, 1);
  s.stage = 2;
  s.progress = 12;
  advanceQuest(s);
  flush(s);
  assert.match(s.choice!.title, /Discard an ally \(total printed cost 7/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id).sort(),
    [brok.id, scout.id].sort(),
  );
  s = choose(s, scout.id);
  s = settle(s);
  assert.equal(s.stage, 4);
  forOwner(s, 0, () => {
    assert.ok(!s.heroes.some((h) => h.attachments.length));
    assert.ok(s.discard.includes(SWORD) && s.discard.includes(STEED));
    assert.deepEqual(
      s.allies.map((a) => a.code),
      [BROK],
    );
  });
  forOwner(s, 1, () => assert.equal(s.allies.length, 2, "6 or less"));
  assert.ok(valid(s));
});

test("Nightmare: Mithril Seeker takes resources from the defending player's heroes and gets +1 attack for each", () => {
  const s = board("defense");
  const seeker = make(s, D.seeker);
  s.engaged.push(seeker);
  assert.equal(stats(s, seeker).attack, 2);
  s.heroes[2].resources = 0;
  hooks(s).enemyAttackStarted!(s, seeker, 0);
  assert.equal(seeker.resources, 2);
  assert.deepEqual(
    s.heroes.map((h) => h.resources),
    [1, 1, 0],
  );
  assert.equal(stats(s, seeker).attack, 4);
  assert.ok(valid(s));
});

test("Nightmare: Unspeakable Thing and Primeval Thing feed on players' decks, and their X is the cost of their cards", () => {
  // Unspeakable Thing: when it engages and when it attacks.
  const s = board("encounter");
  s.deck = [SLAYER, HAMMERSMITH, SCOUT, SCOUT];
  const thing = make(s, D.unspeakable);
  s.staging.push(thing);
  assert.equal(foundationsEnemyX(s, thing), 5, "no cards: 5");
  engage(s, thing);
  flush(s);
  assert.deepEqual(
    thing.attachments.map((a) => a.code),
    [SLAYER],
  );
  assert.equal(foundationsEnemyX(s, thing), 4);
  assert.equal(stats(s, thing).attack, 4);
  hooks(s).enemyAttackStarted!(s, thing, 0);
  assert.equal(foundationsEnemyX(s, thing), 6);
  assert.equal(s.deck.length, 2);
  // Primeval Thing: when it enters play, from the first player's deck until 6.
  const t = board("staging");
  t.deck = [SCOUT, HAMMERSMITH, SCOUT, SLAYER, BROK];
  t.encounterDeck = [ZIGIL, ZIGIL];
  revealed(t, D.primeval);
  flush(t);
  const primeval = t.staging.find((u) => u.code === D.primeval)!;
  assert.deepEqual(
    primeval.attachments.map((a) => a.code),
    [SCOUT, HAMMERSMITH, SCOUT, SLAYER],
  );
  assert.equal(foundationsEnemyX(t, primeval), 8);
  assert.deepEqual(t.nightmare?.primevalFed, [primeval.id]);
  // Its return from engagement to the staging area is not entering play.
  engage(t, primeval);
  flush(t);
  hooks(t).enemyEntered!(t, primeval);
  assert.equal(primeval.attachments.length, 4);
  assert.ok(valid(t));
});

test("Nightmare: Nest of Horrors adds a card to each feeding from its staging area, and its Travel cost reveals the Nameless enemies discarded", () => {
  const s = board("encounter");
  s.staging.push(make(s, D.nest), make(s, D.nest));
  const thing = make(s, D.unspeakable);
  s.staging.push(thing);
  engage(s, thing);
  flush(s);
  assert.equal(thing.attachments.length, 3, "1 and 1 for each Nest");
  // The scenario's own Nameless Thing too.
  const nameless = make(s, F.nameless);
  s.engaged.push(nameless);
  s.queue.unshift(
    fx("foundationsFeed", { target: nameless.id, value: 2, player: 0 }),
  );
  flush(s);
  assert.equal(nameless.attachments.length, 4);
  // As the active location, it adds nothing.
  const t = board("encounter");
  t.activeLocation = make(t, D.nest);
  const t2 = make(t, D.unspeakable);
  t.staging.push(t2);
  engage(t, t2);
  flush(t);
  assert.equal(t2.attachments.length, 1);
  // Travel: each player at this stage discards the top card; Nameless enemies
  // discarded are revealed.
  const u = board("travel", opening(two()));
  const nest = make(u, D.nest);
  u.staging.push(nest);
  u.encounterDeck = [D.unspeakable, ZIGIL, ZIGIL];
  const v = settle(applyAction(u, { type: "TRAVEL", id: nest.id }));
  assert.equal(v.activeLocation?.code, D.nest);
  assert.ok(v.staging.some((x) => x.code === D.unspeakable));
  assert.deepEqual(v.encounterDiscard, [ZIGIL]);
  assert.ok(valid(v));
});

test("Nightmare: Shivering River adds its threat to each other player's staging area, and its shadow grows with the players there", () => {
  // Before the fellowships are separated, there is one staging area.
  const s = board("quest", opening(two()));
  s.staging.push(make(s, D.river));
  assert.equal(hooks(s).stagingThreat!(s), 0);
  // Stage 4: separate staging areas.
  let t = board("quest", opening(two()));
  t.stage = 2;
  t.progress = 12;
  advanceQuest(t);
  flush(t);
  t = settle(t);
  assert.equal(t.stage, 4);
  forOwner(t, 0, () => {
    t.staging = [make(t, D.river)];
  });
  forOwner(t, 1, () => {
    t.staging = [];
    assert.equal(hooks(t).stagingThreat!(t), 3, "player 0's river");
    assert.equal(stagingThreat(t), 3);
  });
  forOwner(t, 0, () => assert.equal(hooks(t).stagingThreat!(t), 0));
  assert.ok(foundationsArea(t, 0) !== foundationsArea(t, 1));
  // Its shadow: +1, or +3 with more than one player at this staging area.
  const solo = board("defense");
  const e1 = make(solo, D.seeker);
  solo.engaged.push(e1);
  shadow(solo, e1, D.river, solo.heroes[0]);
  assert.equal(solo.combat!.attackBonus, 1);
  const pair = board("defense", opening(two()));
  const e2 = make(pair, D.seeker);
  pair.engaged.push(e2);
  shadow(pair, e2, D.river, pair.heroes[0]);
  assert.equal(pair.combat!.attackBonus, 3);
});

test("Nightmare: Chill of the Roots makes each player discard their hand or raise their threat, surging if none is discarded", () => {
  let s = board("staging", opening(two()));
  forOwner(s, 0, () => {
    s.hand = s.hand.slice(0, 3);
  });
  forOwner(s, 1, () => {
    s.hand = s.hand.slice(0, 2);
  });
  s.encounterDeck = [ZIGIL, ZIGIL];
  revealed(s, D.chill);
  flush(s);
  s = settle(s, (x) => x.choice!.options.find((o) => o.id === "threat")?.id);
  forOwner(s, 0, () => assert.deepEqual([s.threat, s.hand.length], [23, 3]));
  forOwner(s, 1, () => assert.deepEqual([s.threat, s.hand.length], [22, 2]));
  assert.equal(s.encounterDeck.length, 1, "surge");
  // A discarded hand: no surge.
  let t = board("staging");
  t.hand = t.hand.slice(0, 2);
  t.encounterDeck = [ZIGIL, ZIGIL];
  revealed(t, D.chill);
  flush(t);
  t = settle(t, (x) => x.choice!.options.find((o) => o.id === "discard")?.id);
  assert.deepEqual([t.threat, t.hand.length], [20, 0]);
  assert.equal(t.encounterDeck.length, 2, "no surge");
  assert.ok(t.encounterDiscard.includes(D.chill));
  // Its shadow feeds a Nameless attacker from the defending player's deck.
  const u = board("defense");
  const thing = make(u, D.unspeakable);
  u.engaged.push(thing);
  shadow(u, thing, D.chill, u.heroes[0]);
  assert.equal(thing.attachments.length, 1);
  const goblin = make(u, D.seeker);
  u.engaged.push(goblin);
  shadow(u, goblin, D.chill, u.heroes[0]);
  assert.equal(goblin.attachments.length, 0);
});

test("Nightmare: Giant Cave Centipede shuffles back each player's costliest card and moves to another player's staging area after combat", () => {
  let s = board("staging");
  s.hand = [make(s, SCOUT), make(s, SLAYER), make(s, HAMMERSMITH)];
  const deck = s.deck.length;
  revealed(s, D.centipede);
  flush(s);
  s = settle(s);
  assert.deepEqual(
    s.hand.map((h) => h.code).sort(),
    [HAMMERSMITH, SCOUT].sort(),
  );
  assert.equal(s.deck.length, deck + 1);
  assert.ok(s.deck.includes(SLAYER));
  // A tie: the player chooses.
  let t = board("staging");
  const a = make(t, SLAYER),
    b = make(t, SLAYER);
  t.hand = [a, b, make(t, SCOUT)];
  revealed(t, D.centipede);
  flush(t);
  assert.match(t.choice!.title, /Giant Cave Centipede · Shuffle/);
  t = choose(t, b.id);
  assert.deepEqual(
    t.hand.map((h) => h.id).sort(),
    [a.id, t.hand.find((h) => h.code === SCOUT)!.id].sort(),
  );
  // End of the combat phase: to the other player's staging area (one shared
  // before stage 4); alone, it stays.
  const u = board("attack", opening(two()));
  const centipede = make(u, D.centipede);
  forOwner(u, 0, () => u.engaged.push(centipede));
  hooks(u).combatEnd!(u);
  flush(u);
  assert.ok(u.staging.some((x) => x.id === centipede.id));
  forOwner(u, 0, () => assert.equal(u.engaged.length, 0));
  assert.ok(valid(u));
  const v = board("attack");
  const c2 = make(v, D.centipede);
  v.engaged.push(c2);
  hooks(v).combatEnd!(v);
  flush(v);
  assert.ok(v.engaged.some((x) => x.id === c2.id));
});

test("Nightmare: Foundations of Stone's Nightmare state survives saves, and seeded games finish with valid saves", () => {
  const s = board("planning");
  s.nightmare = { primevalFed: ["u1"] };
  assert.ok(valid(s));
  s.nightmare = { primevalFed: "u1" } as never;
  assert.equal(valid(s), false);
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `foundations seed ${seed}`);
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", "two-player foundations");
  // From stage 4, after stage 3B.
  let t = board("quest", opening(game(3)));
  t.stage = 2;
  t.progress = 12;
  advanceQuest(t);
  flush(t);
  t = settle(t);
  calm(t, "planning");
  assert.equal(t.stage, 4);
  const u = autoplay(t, 3000);
  assert.notEqual(u.status, "playing", "from stage 4");
});
