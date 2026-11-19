import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage, progressLocation, revealed } from "../src/game/board";
import { draw, make, stats } from "../src/game/core";
import { flush } from "../src/game/effects";
import { applyAction, createGame } from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { dealEnemyShadows } from "../src/game/considered-engagement";
import {
  LONG_DARK as L,
  longDarkLost,
  longDarkLostSources,
} from "../src/game/long-dark";
import { longDarkPass } from "../src/game/long-dark-support";
import {
  NIGHTMARE,
  NIGHTMARE_DD as D,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStandardSets,
  nightmareStatus,
} from "../src/game/nightmare";
import { forOwner, seatIndices, seatView } from "../src/game/table";
import { automatedScenarioId } from "../src/game/support";
import { scenario } from "../src/game/scenarios";
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

/** Zigil Mineshaft: a location with no "When Revealed" effect, no shadow and no PASS. */
const ZIGIL = encounterCards.find((c) => c.name === "Zigil Mineshaft")!.code;
/** Snowbourn Scout: an ally. */
const SCOUT = "01016";
const game = (seed = 5) => nightmareGame("the-long-dark", seed);
const two = (seed = 5) => nightmareForTwo("the-long-dark", seed);
/** A quiet board in `phase`: nothing staged, engaged, attached or discarded, threat 20. */
function board(phase: GameState["phase"], s: GameState = opening(game())) {
  calm(s, phase);
  s.activeLocation = null;
  delete s.extraActiveLocations;
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      s.engaged = [];
      s.threat = 20;
      s.allies = [];
      for (const u of s.heroes) {
        u.damage = 0;
        u.committed = false;
        u.exhausted = false;
        u.attachments = [];
      }
    });
  s.staging = [];
  s.encounterDiscard = [];
  s.encounterDeck = Array(10).fill(ZIGIL);
  s.stage = 1;
  s.progress = 0;
  delete s.nightmare;
  if (s.longDark) delete s.longDark.locate;
  return s;
}
const hooks = (s: GameState) => batch4Scenario(s);
/** Choices answered: "Revealed:" windows resolve, others take `id` or the first option. */
function settle(s: GameState, id?: (s: GameState) => string | undefined) {
  for (let i = 0; i < 30 && s.choice; i++)
    s = choose(
      s,
      s.choice.options.find((o) => o.id === "resolve")?.id ??
        id?.(s) ??
        s.choice.options[0].id,
    );
  return s;
}
function ally(s: GameState, player = 0) {
  let a!: Unit;
  forOwner(s, player, () => {
    a = make(s, SCOUT);
    s.allies.push(a);
  });
  return a;
}
const inPlay = (s: GameState, id: string) =>
  seatIndices(s).some((p) =>
    [...seatView(s, p).heroes, ...seatView(s, p).allies].some(
      (u) => u.id === id,
    ),
  );

test("Nightmare: The Long Dark's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(D.longDarkCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "The Long Dark - Nightmare", true],
  );
  assert.equal(
    c.text,
    "Begin with the standard quest deck and encounter deck for The Long Dark scenario.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n4x Goblin Follower\n1x Branching Paths\n3x Burning Low\n2x Stray Goblin\n2x Chance Encounter\n2x The Mountains' Roots\n1x Abandoned Mine\n2x Fatigue\n4x Goblin Sneak\n3x Rock Adder\nThen, shuffle the encounter cards in this Nightmare Deck into the remainder of the standard The Long Dark encounter deck.\nFinally, flip this setup card over and place it next to the quest deck. Its effect remains active throughout the game, which is now ready to begin.",
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nDurin's Greaves gains surge.\nLost: The first player must choose and discard an ally in play.",
  );
  // The scans correct the catalog: Goblin Stalker's "PASS" in double
  // quotation marks, Trapdoor Spider's traits and "damages", Sentinel of the
  // Deep's "Lost:" in double quotation marks, Bottomless Chasm's "all of the
  // cards", and the PASS both enemies print.
  assert.equal(
    card(D.goblinStalker).text,
    'Forced: When Goblin Stalker attacks, deal it 1 additional shadow card.\nForced: When Goblin Stalker is dealt a shadow card with "PASS" printed in its text box, it gets +2 [attack] until the end of the phase.',
  );
  assert.deepEqual(
    [card(D.trapdoor).traits, card(D.trapdoor).text],
    [
      "Creature. Spider.",
      "Forced: If Trapdoor Spider damages a character, discard that character from play.\nLost: Trapdoor Spider engages the last player and makes an immediate attack.",
    ],
  );
  assert.equal(
    card(D.sentinel).text,
    "While Sentinel of the Deep is engaged with a player, that player cannot draw cards from card effects.",
  );
  assert.equal(
    card(D.mines).text,
    'Travel: The first player must make a locate test to travel here. If this test is failed, return Eastern Mines to the staging area and trigger all "Lost:" effects in play.',
  );
  assert.equal(
    card(D.chasm).text,
    "For each point of progress that is placed on Bottomless Chasm, the players must choose and discard 1 card from a player's hand, if able.",
  );
  assert.equal(
    card(D.deep).text,
    'When Revealed: Starting with the first player, each player must choose and trigger a different "Lost:" effect in play.',
  );
  assert.equal(
    card(D.helpless).text,
    'Surge.\nWhen Revealed: Attach to a hero. (Counts as a Condition attachment with the text: "Lost: Discard attached hero.")',
  );
  const lost1 =
    'Shadow: Defending player must choose and trigger 1 "Lost:" effect in play.';
  assert.deepEqual(
    [D.sentinel, D.mines, D.chasm, D.deep, D.helpless].map(
      (x) => card(x).shadow,
    ),
    [
      lost1,
      lost1,
      "Shadow: If this attack destroys a character, the defending player discards all of the cards in his hand.",
      'Shadow: Make a locate test. If this test is failed, return attacking enemy to the staging area after this attack and trigger all "Lost:" effects in play.',
      "Shadow: If you have no cards in your hand, discard defending character from play.",
    ],
  );
  for (const x of [D.goblinStalker, D.trapdoor])
    assert.equal(card(x).shadow, undefined, card(x).name);
  // PASS: the two enemies print it, and it passes a locate test.
  assert.deepEqual(
    [D.goblinStalker, D.trapdoor, D.sentinel, D.mines, D.chasm].map((x) =>
      longDarkPass(x),
    ),
    [true, true, false, false, false],
  );
  assert.ok(longDarkPass(L.mine), "the scenario's own PASS");
  const stat = (x: string) => {
    const k = card(x);
    return [k.engagement, k.threat, k.attack, k.defense, k.health];
  };
  assert.deepEqual(stat(D.goblinStalker), [28, 3, 2, 2, 3]);
  assert.deepEqual(stat(D.trapdoor), [42, 4, 5, 3, 6]);
  assert.deepEqual(stat(D.sentinel), [12, 2, 4, 2, 5]);
  assert.deepEqual(
    [D.mines, D.chasm].map((x) => [
      card(x).threat,
      card(x).quest,
      card(x).traits,
    ]),
    [
      [5, 4, "Underground."],
      [3, 6, "Underground. Dark."],
    ],
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Long Dark - Nightmare",
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

test("Nightmare: The Long Dark's Nightmare decks match their source recipe, built on Deeps of Moria", () => {
  // The setup card removes Deeps of Moria cards (Stray Goblin, Chance
  // Encounter, The Mountains' Roots); the rulesheet's standard deck uses
  // Hazards of the Pit instead.
  assert.deepEqual(
    [...(scenario("the-long-dark").sets as readonly string[])],
    ["The Long Dark", "Twists and Turns", "Hazards of the Pit"],
  );
  const sets = nightmareStandardSets("the-long-dark")!;
  assert.deepEqual(
    [...sets],
    ["The Long Dark", "Twists and Turns", "Deeps of Moria"],
  );
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  const deck = nightmareEncounterDeck("the-long-dark", standard);
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
  const recipe = recipes.find((r) => r.id === "N02.7")!;
  const expected: Record<string, number> = {};
  for (const c of recipe.cards)
    if (c.section !== "sharedQuestDeck" && c.code !== D.longDarkCard)
      expected[c.code] = (expected[c.code] ?? 0) + c.quantity;
  assert.deepEqual(count(deck), expected);
  for (const [title, n] of Object.entries(NIGHTMARE["the-long-dark"]!.removals))
    assert.ok(card(D.longDarkCard).text!.includes(`${n}x ${title}`), title);
  assert.equal(
    automatedScenarioId({
      name: "The Long Dark (Nightmare)",
      mode: "nightmare",
    }),
    "the-long-dark",
  );
  const hazards = encounterCards
    .filter((c) => c.encounter_set === "Hazards of the Pit")
    .map((c) => c.code);
  const deeps = encounterCards
    .filter((c) => c.encounter_set === "Deeps of Moria")
    .map((c) => c.code);
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), D.longDarkCard);
    assert.match(nightmareStatus(s)[0], /Durin's Greaves gains surge/);
    const all = [
      ...s.encounterDeck,
      ...s.encounterDiscard,
      ...s.staging.map((u) => u.code),
    ];
    assert.ok(!all.some((c) => hazards.includes(c)), "no Hazards of the Pit");
    assert.ok(
      all.some((c) => deeps.includes(c)),
      "Deeps of Moria",
    );
    assert.ok(valid(s));
  }
  // A Normal game keeps the rulesheet's sets.
  const n = opening(
    createGame(5, d.cards, d.heroes, d.id, { scenarioId: "the-long-dark" }),
  );
  assert.ok(n.encounterDeck.some((c) => hazards.includes(c)));
  assert.ok(!n.encounterDeck.some((c) => deeps.includes(c)));
});

test("Nightmare: Durin's Greaves gains surge, and the setup card's Lost discards an ally in play", () => {
  const s = board("staging");
  assert.equal(hooks(s).revealedSurge!(s, L.greaves), true);
  assert.equal(hooks(s).revealedSurge!(s, ZIGIL), false);
  // Revealed: the first player attaches it, and it surges.
  s.encounterDeck = [ZIGIL, ZIGIL];
  revealed(s, L.greaves);
  flush(s);
  const t = settle(s, (x) => x.heroes[0].id);
  assert.ok(
    t.heroes.some((h) => h.attachments.some((a) => a.code === L.greaves)),
  );
  assert.equal(t.encounterDeck.length, 1, "surge");
  // The setup card's "Lost:" effect is in play throughout the game.
  const u = board("planning");
  assert.deepEqual(
    longDarkLostSources(u).map((x) => x.id),
    ["nld-setup"],
  );
  const scout = ally(u);
  longDarkLost(u);
  flush(u);
  assert.match(u.choice!.title, /The Long Dark · Lost/);
  const v = choose(u, scout.id);
  assert.ok(!inPlay(v, scout.id));
  assert.ok(v.discard.includes(SCOUT));
  // No ally in play: nothing.
  const w = board("planning");
  longDarkLost(w);
  flush(w);
  assert.equal(w.choice, null);
  assert.equal(w.heroes.length, 3);
  // With another "Lost:" effect (Silent Caverns), the first player orders them.
  const x = board("planning");
  ally(x);
  x.staging.push(make(x, L.caverns));
  longDarkLost(x);
  flush(x);
  assert.match(x.choice!.title, /Lost effects · Choose the next/);
  assert.deepEqual(
    x.choice!.options.map((o) => o.id).sort(),
    ["nld-setup", x.staging[0].id].sort(),
  );
  const y = settle(choose(x, x.staging[0].id));
  assert.ok(
    y.heroes.every((h) => h.exhausted),
    "Silent Caverns",
  );
  assert.equal(y.allies.length, 0, "then the setup card");
  assert.ok(valid(y));
});

test("Nightmare: Goblin Stalker gets an additional shadow card when it attacks and +2 attack for each PASS shadow card this phase", () => {
  const s = board("defense");
  const g = make(s, D.goblinStalker);
  s.engaged.push(g);
  // A shadow card without PASS.
  s.encounterDeck = [ZIGIL, L.mine, ZIGIL];
  dealEnemyShadows(s, g);
  assert.equal(stats(s, g).attack, 2);
  // When it attacks: 1 additional shadow card (here a PASS card).
  hooks(s).enemyAttackStarted!(s, g, 0);
  assert.deepEqual(g.shadows, [ZIGIL, L.mine]);
  assert.equal(stats(s, g).attack, 4);
  assert.equal(s.nightmare?.stalker?.bonus[g.id], 2);
  assert.ok(valid(s));
  // Another PASS card: +2 more; another Goblin Stalker is not affected.
  const other = make(s, D.goblinStalker);
  s.engaged.push(other);
  s.encounterDeck = [D.trapdoor];
  dealEnemyShadows(s, g);
  assert.deepEqual([stats(s, g).attack, stats(s, other).attack], [6, 2]);
  // Until the end of the phase.
  s.phase = "attack";
  assert.equal(stats(s, g).attack, 6, "the same combat phase");
  s.phase = "refresh";
  assert.equal(stats(s, g).attack, 2);
});

test("Nightmare: Trapdoor Spider discards a character it damages, and its Lost makes it engage the last player and attack", () => {
  const s = board("defense");
  const spider = make(s, D.trapdoor);
  s.engaged.push(spider);
  const hero = s.heroes[0];
  damage(s, hero.id, 1, { combatDamage: true, enemyId: spider.id });
  flush(s);
  assert.ok(!s.heroes.some((h) => h.id === hero.id), "discarded");
  // Another enemy's damage: not discarded.
  const t = board("defense");
  const goblin = make(t, D.goblinStalker);
  t.engaged.push(goblin);
  damage(t, t.heroes[0].id, 1, { combatDamage: true, enemyId: goblin.id });
  flush(t);
  assert.equal(t.heroes.length, 3);
  // Lost: it engages the last player (two players) and makes an immediate
  // attack.
  let u = board("planning", opening(two()));
  const sp = make(u, D.trapdoor);
  u.staging.push(sp);
  longDarkLost(u);
  flush(u);
  assert.match(u.choice!.title, /Lost effects/);
  u = choose(u, sp.id);
  forOwner(u, 1, () => assert.ok(u.engaged.some((x) => x.id === sp.id)));
  assert.match(u.choice!.title, /Trapdoor Spider · Immediate attack/);
  u = choose(u, "undefended");
  u = settle(u);
  assert.ok(valid(u));
});

test("Nightmare: Sentinel of the Deep prevents its engaged player's card draws and its shadow triggers a Lost effect", () => {
  const s = board("planning", opening(two()));
  forOwner(s, 0, () => s.engaged.push(make(s, D.sentinel)));
  forOwner(s, 0, () => {
    assert.equal(hooks(s).cannotDraw!(s), true);
    const hand = s.hand.length;
    draw(s, 1);
    assert.equal(s.hand.length, hand, "card effects");
    draw(s, 1, false);
    assert.equal(s.hand.length, hand + 1, "the resource phase's draw");
  });
  forOwner(s, 1, () => assert.equal(hooks(s).cannotDraw!(s), false));
  // Its shadow: the defending player chooses and triggers 1 Lost effect.
  const t = board("defense");
  const enemy = make(t, D.goblinStalker);
  t.engaged.push(enemy);
  t.staging.push(make(t, L.caverns));
  shadow(t, enemy, D.sentinel, t.heroes[0]);
  flush(t);
  assert.match(t.choice!.title, /Choose and trigger 1 "Lost:" effect/);
  const u = settle(choose(t, t.staging[0].id));
  assert.ok(
    u.heroes.every((h) => h.exhausted),
    "Silent Caverns only",
  );
  // Only the setup card's: it resolves at once.
  const v = board("defense");
  const e2 = make(v, D.goblinStalker);
  v.engaged.push(e2);
  const scout = ally(v);
  shadow(v, e2, D.mines, v.heroes[0]);
  flush(v);
  const w = choose(v, scout.id);
  assert.ok(!inPlay(w, scout.id));
});

test("Nightmare: Eastern Mines' Travel cost is a locate test; failed, it returns to the staging area and every Lost effect triggers", () => {
  // Passed: a PASS card discarded.
  const s = board("travel");
  const mines = make(s, D.mines);
  s.staging.push(mines);
  s.encounterDeck = [D.goblinStalker, ZIGIL];
  let t = applyAction(s, { type: "TRAVEL", id: mines.id });
  assert.match(t.choice!.title, /Eastern Mines · Locate test/);
  t = choose(t, t.hand[0].id);
  t = settle(t);
  assert.equal(t.activeLocation?.code, D.mines);
  assert.ok(t.encounterDiscard.includes(D.goblinStalker));
  assert.ok(valid(t));
  // Failed: back to the staging area, and the Lost effects (the setup
  // card's discards an ally).
  const u = board("travel");
  const m2 = make(u, D.mines);
  u.staging.push(m2);
  const scout = ally(u);
  let v = applyAction(u, { type: "TRAVEL", id: m2.id });
  v = choose(v, v.hand[0].id);
  assert.match(v.choice!.title, /Locate test/, "Zigil Mineshaft: try again");
  v = choose(v, "fail");
  assert.match(v.choice!.title, /The Long Dark · Lost/);
  v = choose(v, scout.id);
  assert.equal(v.activeLocation, null);
  assert.ok(v.staging.some((x) => x.id === m2.id));
  assert.ok(!inPlay(v, scout.id));
  assert.equal(v.nightmare?.minesFailed, undefined);
  assert.ok(valid(v));
});

test("Nightmare: Bottomless Chasm discards a card from a player's hand for each progress, and its shadow discards a hand on a destroying attack", () => {
  const s = board("quest");
  const chasm = make(s, D.chasm);
  s.activeLocation = chasm;
  const hand = s.hand.length;
  progressLocation(s, chasm, 2);
  flush(s);
  let t = settle(s);
  assert.equal(t.hand.length, hand - 2);
  assert.equal(chasm.progress, 2);
  // Two players: the first player chooses whose hand.
  let u = board("quest", opening(two()));
  const c2 = make(u, D.chasm);
  u.activeLocation = c2;
  const theirs = seatView(u, 1).hand.length;
  progressLocation(u, c2, 1);
  flush(u);
  assert.match(u.choice!.title, /Choose a player's hand/);
  u = choose(u, "seat-1");
  assert.match(u.choice!.title, /Discard 1 card from your hand/);
  u = choose(u, u.choice!.options[0].id);
  assert.equal(seatView(u, 1).hand.length, theirs - 1);
  // No cards: nothing.
  const v = board("quest");
  v.hand = [];
  const c3 = make(v, D.chasm);
  v.activeLocation = c3;
  progressLocation(v, c3, 2);
  flush(v);
  assert.equal(v.choice, null);
  // Its shadow: a character destroyed by the attack discards the defending
  // player's hand.
  const w = board("defense");
  const enemy = make(w, D.goblinStalker);
  w.engaged.push(enemy);
  shadow(w, enemy, D.chasm, w.heroes[1]);
  assert.equal(w.nightmare?.chasm, enemy.id);
  assert.ok(w.hand.length > 0);
  damage(w, w.heroes[1].id, 10, { combatDamage: true, enemyId: enemy.id });
  flush(w);
  assert.equal(w.hand.length, 0);
  hooks(w).attackFinished!(w, w.combat!);
  assert.equal(w.nightmare?.chasm, undefined);
  t = w;
  assert.ok(valid(t));
});

test("Nightmare: Dreadful Deep makes each player trigger a different Lost effect, and its shadow's failed locate test returns the attacker", () => {
  // Two players: the first player picks Trapdoor Spider's, the second the
  // only other one (the setup card's).
  let s = board("staging", opening(two()));
  const spider = make(s, D.trapdoor);
  s.staging.push(spider);
  const scout = ally(s, 1);
  revealed(s, D.deep);
  flush(s);
  s = settle(s, (x) =>
    x.choice!.title.startsWith("Dreadful Deep")
      ? spider.id
      : x.choice!.options.some((o) => o.id === "undefended")
        ? "undefended"
        : x.choice!.title.includes("The Long Dark · Lost")
          ? scout.id
          : undefined,
  );
  forOwner(s, 1, () => assert.ok(s.engaged.some((x) => x.id === spider.id)));
  assert.ok(!inPlay(s, scout.id), "the setup card's for the second player");
  assert.ok(s.encounterDiscard.includes(D.deep));
  assert.ok(valid(s));
  // Its shadow: a failed locate test triggers every Lost effect now and
  // returns the attacking enemy to the staging area after the attack.
  let t = board("defense");
  const enemy = make(t, D.goblinStalker);
  t.engaged.push(enemy);
  t.combat = {
    enemyId: enemy.id,
    defenderId: t.heroes[0].id,
    defenderIds: [t.heroes[0].id],
    attackBonus: 0,
    attackPlayer: 0,
  } as never;
  enemy.shadows = [D.deep];
  enemy.revealedShadowCount = 1;
  hooks(t).shadow!(t, D.deep);
  flush(t);
  assert.match(t.choice!.title, /Dreadful Deep · Locate test/);
  t = choose(t, "fail");
  t = settle(t);
  assert.deepEqual(t.nightmare?.deepReturn, [enemy.id]);
  const effects = hooks(t).attackFinished!(t, t.combat!);
  t.queue.unshift(...effects);
  flush(t);
  assert.ok(t.staging.some((x) => x.id === enemy.id));
  assert.ok(!t.engaged.some((x) => x.id === enemy.id));
  assert.equal(t.nightmare?.deepReturn, undefined);
  assert.ok(valid(t));
});

test("Nightmare: Lost and Helpless attaches to a hero, its Lost discards that hero, and its shadow discards a defender when the hand is empty", () => {
  let s = board("staging");
  s.encounterDeck = [ZIGIL, ZIGIL];
  revealed(s, D.helpless);
  flush(s);
  assert.match(s.choice!.title, /Lost and Helpless · Attach it to a hero/);
  s = settle(choose(s, s.heroes[1].id));
  const host = s.heroes[1];
  assert.ok(host.attachments.some((a) => a.code === D.helpless));
  assert.equal(s.encounterDeck.length, 1, "surge");
  assert.ok(!s.encounterDiscard.includes(D.helpless));
  const source = longDarkLostSources(s).find((x) => x.code === D.helpless)!;
  assert.match(source.label, /Lost and Helpless \(on /);
  // Its Lost: the attached hero is discarded.
  longDarkLost(s);
  flush(s);
  s = choose(s, source.id);
  s = settle(s);
  assert.ok(!s.heroes.some((h) => h.id === host.id));
  assert.ok(valid(s));
  // Its shadow: with no cards in hand, the defending character is discarded;
  // with cards, not.
  const t = board("defense");
  const enemy = make(t, D.goblinStalker);
  t.engaged.push(enemy);
  shadow(t, enemy, D.helpless, t.heroes[0]);
  flush(t);
  assert.equal(t.heroes.length, 3);
  t.hand = [];
  shadow(t, enemy, D.helpless, t.heroes[0]);
  flush(t);
  assert.equal(t.heroes.length, 2);
  // Undefended: nothing.
  shadow(t, enemy, D.helpless);
  flush(t);
  assert.equal(t.heroes.length, 2);
});

test("Nightmare: The Long Dark's Nightmare state survives saves, and seeded games finish with valid saves", () => {
  const s = board("planning");
  s.nightmare = {
    stalker: { key: "1:defense", bonus: { u1: 2 } },
    deepReturn: ["u2"],
    minesFailed: "u3",
    chasm: "u4",
  };
  assert.ok(valid(s));
  for (const bad of [
    { stalker: { key: 1, bonus: {} } },
    { stalker: { key: "1:defense", bonus: { u1: -2 } } },
    { deepReturn: "u2" },
    { minesFailed: 3 },
    { chasm: false },
  ]) {
    s.nightmare = bad as never;
    assert.equal(valid(s), false, JSON.stringify(bad));
  }
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `the-long-dark seed ${seed}`);
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", "two-player the-long-dark");
  // From stage 2.
  const t = board("planning", opening(game(3)));
  t.stage = 2;
  const u = autoplay(t, 3000);
  assert.notEqual(u.status, "playing", "from stage 2");
});
