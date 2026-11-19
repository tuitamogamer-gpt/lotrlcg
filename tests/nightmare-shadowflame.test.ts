import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { check, damage, progressLocation } from "../src/game/board";
import { make, playCost, stats } from "../src/game/core";
import { flush } from "../src/game/effects";
import { applyAction, createGame } from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import {
  beginConsideredEnemyShadows,
  dealEnemyShadows,
  finishEnemyShadows,
} from "../src/game/considered-engagement";
import { SHADOW_FLAME as S } from "../src/game/shadow-flame-support";
import {
  NIGHTMARE,
  NIGHTMARE_DD as D,
  nightmareCardOf,
  nightmareEncounterDeck,
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

/** Second Deep: a location with no "When Revealed" effect and no shadow. */
const DEEP = S.deep;
const EVENT = "01020"; // Ever Vigilant, an event
const SCOUT = "01016"; // Snowbourn Scout, an ally
const BALROG = [D.terrible, D.darkFire, D.grip, D.bidding, D.udun];
const game = (seed = 5) => nightmareGame("shadow-and-flame", seed);
const two = (seed = 5) => nightmareForTwo("shadow-and-flame", seed);
/** A quiet board in `phase`: Durin's Bane alone in the staging area, a full Balrog deck, threat 20. */
function board(phase: GameState["phase"], s: GameState = opening(game())) {
  calm(s, phase);
  Object.assign(s, {
    stage: 1,
    stageRevealing: false,
    progress: 0,
    activeLocation: null,
    extraActiveLocations: [],
    encounterDeck: Array(20).fill(DEEP),
    encounterDiscard: [],
    combat: null,
    suspendedCombats: [],
  });
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      s.engaged = [];
      s.allies = [];
      s.threat = 20;
      for (const h of s.heroes)
        Object.assign(h, {
          damage: 0,
          exhausted: false,
          committed: false,
          attachments: [],
        });
    });
  s.staging = [make(s, S.bane)];
  s.nightmare = {
    balrogDeck: BALROG.flatMap((c) => [c, c]),
    balrogDiscard: [],
  };
  return s;
}
const hooks = (s: GameState) => batch4Scenario(s);
const bane = (s: GameState) => s.staging.find((u) => u.code === S.bane)!;
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
function combat(s: GameState, enemy: Unit, defender?: Unit) {
  s.combat = {
    enemyId: enemy.id,
    defenderId: defender?.id ?? null,
    defenderIds: defender ? [defender.id] : [],
    attackBonus: 0,
    attackPlayer: 0,
  } as never;
}

test("Nightmare: Shadow and Flame's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(D.shadowFlameCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "Shadow and Flame - Nightmare", true],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for the Shadow and Flame scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n3x Goblin Scout\n2x Goblin Tunnels\n3x Stray Goblin\n3x The Mountains' Roots\n3x Ranging Goblin\n1x Fiery Sword\n1x Many Thonged Whip\n.*Play Tip: This scenario contains 10 treachery cards with the Attack trait that have only a "shadow" effect, and no "when revealed" effect\. These cards are never revealed from the encounter deck and are only ever dealt as shadow cards to Durin's Bane\.$/s,
  );
  assert.equal(
    c.back_text,
    'You are playing Nightmare mode.\nSetup: Shuffle the 10 encounter cards with the Attack trait into a separate "Balrog deck."\nWhen Durin\'s Bane would be dealt a shadow card, deal it from the Balrog deck instead of the encounter deck. Shadow cards dealt from the Balrog deck are discarded into a separate Balrog discard pile.\nAt the beginning of each combat phase (or if the Balrog deck runs out of cards), shuffle the Balrog discard pile back into the Balrog deck.',
  );
  // The scans correct the catalog: Terrible Strength's "damaged from this
  // effect" and the setup card's "Balrog deck" in double quotation marks.
  assert.equal(
    card(D.terrible).shadow,
    "Shadow: For each excess point of combat damage dealt by this attack (damage that is dealt beyond the remaining hit points of the character damaged by this attack) you must damage another character you control. Exhaust all characters damaged from this effect.",
  );
  assert.deepEqual(
    [D.darkFire, D.grip, D.bidding, D.udun].map((x) => card(x).shadow),
    [
      "Shadow: For each point of damage dealt by this attack, heal 1 damage from Durin's Bane.",
      "Shadow: Discard all cards attached to the defending character and deal it 1 damage. Cannot be canceled.",
      "Shadow: If this attack destroys a character, Durin's Bane makes an additional attack against the defending player after this one.",
      "Shadow: Deal Durin's Bane 3 additional shadow cards from the encounter deck (not the Balrog deck).",
    ],
  );
  for (const x of BALROG) {
    assert.equal(card(x).traits, "Attack.", card(x).name);
    assert.equal(card(x).text, undefined, "no When Revealed");
  }
  assert.equal(
    card(D.servant).text,
    "Forced: While Durin's Bane has no damage, Servant of Flame gets +2 [attack] and +2 [defense].",
  );
  assert.deepEqual(
    [D.servant, D.captain, D.stairs].map((x) => card(x).shadow),
    [
      "Shadow: Search the encounter deck for a treachery card with the Shadow or Flame trait and reveal it, if able. Shuffle the encounter deck.",
      "Shadow: If this attack destroys a character, attacking enemy cannot take damage this round.",
      "Shadow: If this attack destroys a character, the defending player must discard all event cards in his hand.",
    ],
  );
  assert.equal(card(D.captain).text, "Each enemy gets -20 engagement cost.");
  assert.equal(
    card(D.fiery).text,
    "Progress cannot be placed on Fiery Depths while it is in the staging area.\nTravel: Each player must move 1 damage from Durin's Bane to a hero to travel here.",
  );
  assert.equal(
    card(D.stairs).text,
    "While Crumbling Stairs is in the staging area, event cards cost 1 additional matching resource to play from hand.",
  );
  const stat = (x: string) => {
    const k = card(x);
    return [k.engagement, k.threat, k.attack, k.defense, k.health];
  };
  assert.deepEqual(stat(D.servant), [12, 3, 3, 2, 5]);
  assert.deepEqual(stat(D.captain), [42, 4, 4, 3, 7]);
  assert.deepEqual(
    [D.fiery, D.stairs].map((x) => [card(x).threat, card(x).quest]),
    [
      [5, 2],
      [2, 7],
    ],
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Shadow and Flame - Nightmare",
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

test("Nightmare: Shadow and Flame's Nightmare decks match their source recipe, the Attack cards forming the Balrog deck", () => {
  const sets = scenario("shadow-and-flame").sets as readonly string[];
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  const deck = nightmareEncounterDeck("shadow-and-flame", standard);
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
  const recipe = recipes.find((r) => r.id === "N02.9")!;
  const section = (...names: string[]) => {
    const out: Record<string, number> = {};
    for (const c of recipe.cards)
      if (names.includes(c.section) && c.code !== D.shadowFlameCard)
        out[c.code] = (out[c.code] ?? 0) + c.quantity;
    return out;
  };
  assert.deepEqual(
    count(deck),
    section(
      "sharedEncounterDeck",
      "sharedEncounterDeck2",
      "sharedSetAside",
      "sharedStagingArea",
    ),
  );
  for (const [title, n] of Object.entries(
    NIGHTMARE["shadow-and-flame"]!.removals,
  ))
    assert.ok(card(D.shadowFlameCard).text!.includes(`${n}x ${title}`), title);
  assert.equal(
    automatedScenarioId({
      name: "Shadow and Flame (Nightmare)",
      mode: "nightmare",
    }),
    "shadow-and-flame",
  );
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), D.shadowFlameCard);
    assert.deepEqual(
      count(s.nightmare!.balrogDeck!),
      section("sharedEncounterDeck2"),
      "the Balrog deck",
    );
    assert.ok(!s.encounterDeck.some((c) => BALROG.includes(c)));
    assert.match(
      nightmareStatus(s)[0],
      /Balrog deck \(10 cards; 0 in its discard pile\)/,
    );
    assert.ok(valid(s));
  }
  // A Normal game: no Balrog deck.
  const n = opening(
    createGame(5, d.cards, d.heroes, d.id, { scenarioId: "shadow-and-flame" }),
  );
  assert.equal(n.nightmare?.balrogDeck, undefined);
});

test("Nightmare: Durin's Bane is dealt its shadow cards from the Balrog deck, discarded into the Balrog discard pile and reshuffled", () => {
  const s = board("defense");
  const b = bane(s);
  s.nightmare!.balrogDeck = [D.grip, D.udun];
  beginConsideredEnemyShadows(s, b);
  assert.deepEqual(b.shadows, [D.grip]);
  assert.deepEqual(s.encounterDeck.length, 20, "not the encounter deck");
  finishEnemyShadows(s, b);
  check(s);
  assert.deepEqual(s.nightmare!.balrogDiscard, [D.grip]);
  assert.ok(!s.encounterDiscard.includes(D.grip));
  // Another enemy is dealt from the encounter deck.
  const goblin = make(s, D.servant);
  s.engaged.push(goblin);
  dealEnemyShadows(s, goblin);
  assert.deepEqual(goblin.shadows, [DEEP]);
  // The Balrog deck runs out: its discard pile is shuffled back.
  beginConsideredEnemyShadows(s, b);
  assert.deepEqual(b.shadows, [D.udun]);
  assert.deepEqual(s.nightmare!.balrogDeck, []);
  finishEnemyShadows(s, b);
  beginConsideredEnemyShadows(s, b);
  assert.equal(b.shadows.length, 1);
  assert.equal(s.nightmare!.balrogDeck!.length, 1);
  assert.ok(valid(s));
  // The beginning of each combat phase reshuffles it.
  const t = board("planning");
  t.nightmare!.balrogDeck = [D.grip];
  t.nightmare!.balrogDiscard = [D.udun, D.bidding];
  hooks(t).combatBegin!(t);
  assert.deepEqual(
    [...t.nightmare!.balrogDeck!].sort(),
    [D.bidding, D.grip, D.udun].sort(),
  );
  assert.deepEqual(t.nightmare!.balrogDiscard, []);
  // Flame of Udún: 3 additional shadow cards from the encounter deck.
  const u = board("defense");
  const b2 = bane(u);
  b2.shadows = [D.udun];
  b2.revealedShadowCount = 0;
  combat(u, b2, u.heroes[0]);
  hooks(u).shadow!(u, D.udun);
  flush(u);
  assert.deepEqual(
    b2.shadows.filter((c) => c === DEEP).length,
    3,
    "from the encounter deck",
  );
  assert.equal(u.encounterDeck.length, 17);
  assert.equal(u.nightmare!.balrogDeck!.length, 10);
});

test("Nightmare: Terrible Strength spreads excess combat damage and exhausts those it damages; The Dark Fire heals Durin's Bane", () => {
  let s = board("defense");
  const b = bane(s);
  combat(s, b, s.heroes[1]);
  hooks(s).shadow!(s, D.terrible);
  assert.equal(s.nightmare?.terrible, b.id);
  // Théodred (4 hit points) takes 6: 2 excess points.
  damage(s, s.heroes[1].id, 6, { combatDamage: true, enemyId: b.id });
  flush(s);
  s = settle(s, (x) =>
    x.choice!.title.startsWith("Terrible Strength")
      ? x.heroes[0].id
      : undefined,
  );
  assert.equal(s.heroes.length, 2, "Théodred destroyed");
  assert.equal(s.heroes[0].damage, 2);
  assert.equal(s.heroes[0].exhausted, true);
  assert.equal(s.heroes[1].exhausted, false);
  assert.ok(valid(s));
  // The Dark Fire.
  const t = board("defense");
  const b2 = bane(t);
  b2.damage = 10;
  combat(t, b2, t.heroes[0]);
  hooks(t).shadow!(t, D.darkFire);
  damage(t, t.heroes[0].id, 3, { combatDamage: true, enemyId: b2.id });
  flush(t);
  assert.equal(b2.damage, 7);
  hooks(t).attackFinished!(t, t.combat!);
  assert.equal(t.nightmare?.darkFire, undefined);
});

test("Nightmare: Blazing Grip discards the defender's attachments and cannot be canceled", () => {
  const s = board("defense");
  const b = bane(s);
  const hero = s.heroes[0];
  hero.attachments.push({ id: "a1", code: "01027", exhausted: false });
  combat(s, b, hero);
  hooks(s).shadow!(s, D.grip);
  flush(s);
  assert.equal(hero.attachments.length, 0);
  assert.equal(hero.damage, 1);
  assert.ok(s.discard.includes("01027"));
  assert.equal(hooks(s).cannotCancel!(s, true, D.grip), true);
  assert.equal(hooks(s).cannotCancel!(s, true, D.udun), false);
});

test("Nightmare: Morgoth's Bidding makes Durin's Bane attack again after a destroying attack", () => {
  let s = board("defense");
  const b = bane(s);
  combat(s, b, s.heroes[1]);
  hooks(s).shadow!(s, D.bidding);
  damage(s, s.heroes[1].id, 9, { combatDamage: true, enemyId: b.id });
  flush(s);
  assert.deepEqual(s.nightmare?.bidding, [{ enemyId: b.id, player: 0 }]);
  const effects = hooks(s).attackFinished!(s, s.combat!);
  assert.deepEqual(
    effects.map((e) => [e.kind, e.target]),
    [["immediateAttack", b.id]],
  );
  assert.equal(s.nightmare?.bidding, undefined);
  s.combat = null;
  s.queue.unshift(...effects);
  flush(s);
  assert.match(s.choice!.title, /Durin's Bane · Immediate attack/);
  s = settle(s, (x) =>
    x.choice!.options.some((o) => o.id === "undefended")
      ? "undefended"
      : undefined,
  );
  assert.ok(valid(s));
  // No character destroyed: no additional attack.
  const t = board("defense");
  const b2 = bane(t);
  combat(t, b2, t.heroes[0]);
  hooks(t).shadow!(t, D.bidding);
  damage(t, t.heroes[0].id, 1, { combatDamage: true, enemyId: b2.id });
  flush(t);
  assert.deepEqual(hooks(t).attackFinished!(t, t.combat!), []);
});

test("Nightmare: Servant of Flame is stronger while Durin's Bane is undamaged and its shadow reveals a Shadow or Flame treachery", () => {
  const s = board("planning");
  const servant = make(s, D.servant);
  s.engaged.push(servant);
  assert.deepEqual(
    [stats(s, servant).attack, stats(s, servant).defense],
    [5, 4],
  );
  bane(s).damage = 1;
  assert.deepEqual(
    [stats(s, servant).attack, stats(s, servant).defense],
    [3, 2],
  );
  // Its shadow: Counter-Spell (Shadow) found and revealed.
  let t = board("defense");
  t.encounterDeck = [DEEP, DEEP, S.counter, DEEP];
  const enemy = make(t, D.captain);
  t.engaged.push(enemy);
  shadow(t, enemy, D.servant, t.heroes[0]);
  flush(t);
  t = settle(t);
  assert.ok(!t.encounterDeck.includes(S.counter));
  assert.equal(t.encounterDeck.length, 3);
  // None: only a shuffle.
  const u = board("defense");
  const e2 = make(u, D.captain);
  u.engaged.push(e2);
  shadow(u, e2, D.servant, u.heroes[0]);
  flush(u);
  assert.equal(u.encounterDeck.length, 20);
  assert.equal(u.choice, null);
});

test("Nightmare: Captain of Mordor lowers every engagement cost by 20, and its shadow protects a destroying attacker this round", () => {
  const s = board("planning");
  const goblin = make(s, D.servant);
  s.staging.push(goblin);
  assert.equal(hooks(s).engagementBonus!(s, goblin), 0);
  s.staging.push(make(s, D.captain));
  assert.equal(hooks(s).engagementBonus!(s, goblin), -20);
  s.staging.push(make(s, D.captain));
  assert.equal(hooks(s).engagementBonus!(s, goblin), -40);
  // Its shadow.
  const t = board("defense");
  const enemy = make(t, D.servant);
  t.engaged.push(enemy);
  shadow(t, enemy, D.captain, t.heroes[1]);
  damage(t, t.heroes[1].id, 9, { combatDamage: true, enemyId: enemy.id });
  flush(t);
  assert.equal(enemy.roundCannotTakeDamage, true);
  assert.ok(valid(t));
});

test("Nightmare: Fiery Depths takes no progress in the staging area and its Travel cost moves damage from Durin's Bane to each player's hero", () => {
  const s = board("quest");
  const depths = make(s, D.fiery);
  s.staging.push(depths);
  assert.equal(hooks(s).locationProgressBlocked!(s, depths), true);
  progressLocation(s, depths, 2);
  assert.equal(depths.progress, 0);
  // Travel: refused while Durin's Bane has fewer damage than players.
  const t = board("travel", opening(two()));
  const d2 = make(t, D.fiery);
  t.staging.push(d2);
  bane(t).damage = 1;
  assert.match(hooks(t).travelProblem!(t, d2)!, /it has 1/);
  bane(t).damage = 3;
  assert.equal(hooks(t).travelProblem!(t, d2), null);
  let u = applyAction(t, { type: "TRAVEL", id: d2.id });
  u = settle(u);
  assert.equal(u.activeLocation?.code, D.fiery);
  assert.equal(bane(u).damage, 1);
  assert.deepEqual(
    seatIndices(u).map((p) =>
      seatView(u, p).heroes.reduce((n, h) => n + h.damage, 0),
    ),
    [1, 1],
  );
  assert.ok(valid(u));
});

test("Nightmare: Crumbling Stairs makes events cost 1 more from the staging area, and its shadow discards a hand's events on a destroying attack", () => {
  const s = board("planning");
  const base = playCost(s, card(EVENT));
  s.staging.push(make(s, D.stairs));
  assert.equal(playCost(s, card(EVENT)), base + 1);
  assert.equal(
    playCost(s, card(SCOUT)),
    Number(card(SCOUT).cost),
    "not an ally",
  );
  s.staging.push(make(s, D.stairs));
  assert.equal(playCost(s, card(EVENT)), base + 2);
  // Its shadow.
  const t = board("defense");
  t.hand = [make(t, EVENT), make(t, SCOUT), make(t, EVENT)];
  const enemy = make(t, D.servant);
  t.engaged.push(enemy);
  shadow(t, enemy, D.stairs, t.heroes[1]);
  damage(t, t.heroes[1].id, 9, { combatDamage: true, enemyId: enemy.id });
  flush(t);
  assert.deepEqual(
    t.hand.map((h) => h.code),
    [SCOUT],
  );
  assert.ok(valid(t));
});

test("Nightmare: Shadow and Flame's Nightmare state survives saves, and seeded games finish with valid saves", () => {
  const s = board("planning");
  s.nightmare = {
    balrogDeck: [D.grip],
    balrogDiscard: [D.udun],
    terrible: "u1",
    darkFire: "u1",
    destroyMarks: [{ enemyId: "u1", kind: "stairs", player: 0 }],
    bidding: [{ enemyId: "u1", player: 0 }],
  };
  assert.ok(valid(s));
  for (const bad of [
    { balrogDeck: [D.servant] },
    { balrogDiscard: "x" },
    { destroyMarks: [{ enemyId: "u1", kind: "other", player: 0 }] },
    { bidding: [{ enemyId: 1, player: 0 }] },
  ]) {
    s.nightmare = bad as never;
    assert.equal(valid(s), false, JSON.stringify(bad));
  }
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `shadow-and-flame seed ${seed}`);
    // The 10 Attack cards stay together: the Balrog deck, its discard pile
    // and Durin's Bane's shadow cards.
    const balrog = [
      ...(g.nightmare?.balrogDeck ?? []),
      ...(g.nightmare?.balrogDiscard ?? []),
      ...g.encounterDiscard.filter((c) => BALROG.includes(c)),
      ...g.staging.flatMap((u) => u.shadows.filter((c) => BALROG.includes(c))),
    ];
    assert.equal(balrog.length, 10, `seed ${seed}`);
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", "two-player shadow-and-flame");
  // From stage 2.
  const t = board("planning", opening(game(3)));
  t.stage = 2;
  const u = autoplay(t, 3000);
  assert.notEqual(u.status, "playing", "from stage 2");
});
