import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards, STARTERS } from "../src/game/cards";
import { damage, readyCharacter, revealed } from "../src/game/board";
import { fx, get, make, stats, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { applyAction, canTravel, createGame } from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { checkSideQuestDefeats } from "../src/game/side-quests";
import { dikeShadow } from "../src/game/deadmens-dike";
import { DIKE as D } from "../src/game/deadmens-dike-support";
import {
  NIGHTMARE,
  NIGHTMARE_TLR as N,
  nightmareCardOf,
  nightmareEncounterDecks,
  nightmareStatus,
} from "../src/game/nightmare";
import { forOwner, seatView } from "../src/game/table";
import type { Effect, GameState } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  nightmareForTwo,
  nightmareGame,
  opening,
  pick,
  shadow,
  valid,
} from "./nightmare-fixtures";
import { base, choose, reload } from "./deadmens-dike-fixtures";

const ID = "deadmens-dike";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
const hooks = (s: GameState) => batch4Scenario(s);
/** A non-Undead enemy (Core Set). */
const ORC = "01096";
/** A quiet Nightmare table (the scenario's own fixture), with a calm encounter deck. */
function board(players = 1) {
  const s = base(players);
  s.nightmareMode = true;
  s.nightmare = {};
  s.encounterDeck = Array(10).fill(D.keep);
  return s;
}
/** Resolve queued effects, answering each choice with `pick` (or the first option). */
function run(
  s: GameState,
  answer: (s: GameState) => string | undefined = () => undefined,
) {
  flush(s);
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 60, "decisions terminate");
    s = choose(reload(s), answer(s) ?? s.choice.options[0].id);
  }
  return s;
}
const queue = (s: GameState, ...effects: Effect[]) => {
  s.queue.unshift(...effects);
  return s;
};
const staged = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const engagedWith = (s: GameState, code: string, p = 0) => {
  const u = make(s, code);
  forOwner(s, p, () => s.engaged.push(u));
  return u;
};
const options = (s: GameState) => s.choice?.options.map((o) => o.id) ?? [];
/** A legal custom deck of `size` cards from the starters' lists. */
function deckOf(size: number) {
  const out: Record<string, number> = {};
  let n = 0;
  for (const starter of STARTERS)
    for (const [code, k] of Object.entries(starter.cards)) {
      const add = Math.min(k, 3 - (out[code] ?? 0), size - n);
      if (add > 0) {
        out[code] = (out[code] ?? 0) + add;
        n += add;
      }
    }
  assert.equal(n, size);
  return out;
}

test("Nightmare: Deadmen's Dike's setup card and Nightmare Deck carry their scans' texts and stats", () => {
  const c = card(N.dikeCard);
  assert.deepEqual(
    [c.name, c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    [
      "Deadmen's Dike",
      "nightmare",
      "nightmare",
      "Deadmen's Dike - Nightmare",
      true,
    ],
    "the scan's title (the catalogue spells it Deadman's Dike)",
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for the Deadmen's Dike scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n2x Fornost Square\n3x Broken Battlements\n2x Norbury Tombs\n2x Restless Evil\nThen, shuffle/,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nEach player's deck cannot include more than 50 total cards.\nSetup: Each player searches the encounter deck for a copy of Cursed Dead and places it in the encounter discard pile. Shuffle the encounter deck.",
    "the scan's rules side, each rule a paragraph of its own",
  );
  const stat = (code: string) => {
    const x = card(code);
    return [
      x.type_code,
      x.traits,
      x.engagement,
      x.threat,
      x.attack,
      x.defense,
      x.health,
      x.quantity,
    ];
  };
  assert.deepEqual(stat(N.horde), ["enemy", "Undead.", 34, 4, 6, 3, 8, 2]);
  assert.match(
    card(N.horde).text!,
    /^Cannot have attachments\.\nFor each excess point of combat damage/,
    "the scan's 'For each' (the catalogue had 'Fore each')",
  );
  assert.deepEqual(stat(N.cursedDead), ["enemy", "Undead.", 27, 1, 3, 1, 2, 2]);
  assert.equal(card(N.cursedDead).text, card(D.cursed).text);
  assert.equal(card(N.cursedDead).shadow, card(D.cursed).shadow);
  const where = (code: string) => {
    const x = card(code);
    return [x.type_code, x.traits, x.threat, x.quest, x.quantity];
  };
  assert.deepEqual(where(N.palace), ["location", "Fornost. Ruins.", 9, 9, 2]);
  assert.match(
    card(N.palace).text!,
    /^Action: Discard the top X cards of your deck to reduce Palace Ruin's \[threat\] by X until the end of the phase\. Any player may trigger this action\. \(Limit once per phase\.\)$/,
    "the scan's Action trigger (the catalogue dropped it)",
  );
  assert.deepEqual(where(N.street), ["location", "Fornost. Ruins.", 1, 6, 4]);
  assert.deepEqual(where(N.city), ["location", "Fornost. Ruins.", 5, 5, 3]);
  assert.equal(
    card(N.city).shadow,
    "Shadow: Either discard 3 cards from the top of your deck, or this attack is considered undefended.",
  );
  assert.deepEqual(
    [card(N.fear).traits, card(N.fear).quantity],
    ["Sorcery.", 3],
  );
  assert.match(
    card(N.fear).text!,
    /^Surge\.\nWhen Revealed: Attach to a hero and exhaust that hero\./,
  );
  assert.deepEqual(
    [card(N.curse).traits, card(N.curse).quantity],
    ["Sorcery.", 2],
  );
  assert.match(card(N.curse).text!, /^Doomed 1\.\nWhen Revealed: Each player/);
  assert.deepEqual(
    [
      card(N.courage).type_code,
      card(N.courage).quest,
      card(N.courage).victory,
      card(N.courage).quantity,
    ],
    ["encounter-side-quest", 8, 10, 1],
  );
  assert.match(
    card(N.courage).text!,
    /^Surge\.\nWhen Revealed: Each player places the top 8 cards of his deck facedown under this quest\.\nForced: When this quest is defeated/,
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Deadmen's Dike - Nightmare",
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
    art.filter((x) => set.some((y) => y.code === x.code)).length,
    10,
  );
});

test("Nightmare: Deadmen's Dike's Nightmare deck matches its source recipe, a Cursed Dead per player waits in the discard pile, and decks hold at most 50 cards", () => {
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
  const pile = (
    r: { cards: { code: string; quantity: number; section: string }[] },
    section: string,
  ) =>
    r.cards
      .filter((c) => c.section === section && c.code !== N.dikeCard)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const nightmare = recipes.find((r) => r.id === "N05.3")!;
  const standard = recipes.find((r) => r.id === "Q05.3")!;
  const sections = ["sharedEncounterDeck", "sharedSetAside"];
  const piles = nightmareEncounterDecks(
    ID,
    sections.map((x) => pile(standard, x)),
    () => 0,
  );
  sections.forEach((x, i) =>
    assert.deepEqual(count(piles[i]), count(pile(nightmare, x)), x),
  );
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.dikeCard).text!.includes(`${n}x ${title}`), title);
  for (const [s, players] of [
    [game(), 1],
    [two(), 2],
  ] as const) {
    // The setup card: "Each player searches the encounter deck for a copy
    // of Cursed Dead and places it in the encounter discard pile."
    assert.equal(s.encounterDiscard.length, players);
    assert.ok(s.encounterDiscard.every((c) => card(c).name === "Cursed Dead"));
    assert.equal(s.encounterDeck.length, 51 - players);
    assert.ok(!s.encounterDeck.includes(D.square), "both Fornost Squares go");
    assert.ok(!s.encounterDeck.includes(D.restless));
    const g = opening(s);
    assert.equal(nightmareCardOf(g), N.dikeCard);
    assert.ok(valid(g));
    assert.match(nightmareStatus(g)[0], /^Deadmen's Dike · Nightmare mode/);
  }
  // "Each player's deck cannot include more than 50 total cards."
  const d = STARTERS[0];
  const nm = (deck: Record<string, number>) =>
    createGame(5, deck, d.heroes, "custom", {
      scenarioId: ID,
      nightmare: true,
    });
  assert.throws(() => nm(deckOf(51)), /cannot include more than 50/);
  assert.equal(nm(deckOf(50)).status, "playing");
  assert.equal(
    createGame(5, deckOf(51), d.heroes, "custom", { scenarioId: ID }).status,
    "playing",
    "a standard game keeps the usual deck limits",
  );
  assert.throws(
    () =>
      createGame(5, d.cards, d.heroes, d.id, {
        scenarioId: ID,
        nightmare: true,
        seats: [
          { heroes: [...d.heroes], deckId: d.id },
          { heroes: [...STARTERS[1].heroes], cards: deckOf(52) },
        ],
      }),
    /cannot include more than 50/,
  );
});

test("Nightmare: each copy of Cursed Dead, the Nightmare Deck's included, brings every other copy back from the discard pile and shares its shadow", () => {
  let s = board();
  s.encounterDiscard = [D.cursed, N.cursedDead, D.fog];
  revealed(s, N.cursedDead);
  s = run(s);
  assert.deepEqual(
    s.staging.map((u) => u.code).sort(),
    [D.cursed, N.cursedDead, N.cursedDead].sort(),
  );
  assert.deepEqual(s.encounterDiscard, [D.fog]);
  let t = board();
  t.encounterDiscard = [N.cursedDead];
  revealed(t, D.cursed);
  t = run(t);
  assert.equal(t.staging.length, 2, "the standard copy brings it back too");
  assert.deepEqual(t.encounterDiscard, []);
  // Its shadow: +1 attack (+2 with a copy of the defender in the discard pile).
  const u = board();
  const hero = u.heroes[0];
  const enemy = engagedWith(u, D.shade);
  u.combat = {
    enemyId: enemy.id,
    defenderId: hero.id,
    defenderIds: [hero.id],
    attackBonus: 0,
    attackPlayer: 0,
  } as never;
  assert.ok(dikeShadow(u, N.cursedDead));
  assert.equal(u.combat!.attackBonus, 1);
  u.discard.push(hero.code);
  u.combat!.attackBonus = 0;
  dikeShadow(u, N.cursedDead);
  assert.equal(u.combat!.attackBonus, 2);
});

test("Nightmare: Undead Horde cannot have attachments, and each excess point of its combat damage discards a card from the defending player's deck", () => {
  const s = board();
  const horde = engagedWith(s, N.horde);
  assert.equal(hooks(s).cannotAttach!(s, horde, "01070"), true);
  assert.equal(
    hooks(s).cannotAttach!(s, engagedWith(s, D.shade), "01070"),
    false,
  );
  const hero = s.heroes[0];
  const hp = stats(s, hero).health;
  s.combat = {
    enemyId: horde.id,
    defenderId: hero.id,
    defenderIds: [hero.id],
    attackBonus: 0,
    attackPlayer: 0,
  } as never;
  const before = s.deck.length;
  // Within its remaining hit points: no discard.
  damage(s, hero.id, hp - 1, { enemyId: horde.id, combatDamage: true });
  flush(s);
  assert.equal(s.deck.length, before);
  // 3 more damage: 1 point fills its hit points, 2 are excess.
  damage(s, hero.id, 3, { enemyId: horde.id, combatDamage: true });
  flush(s);
  assert.equal(s.deck.length, before - 2);
  // Another enemy's combat damage, or damage outside combat, has no excess discard.
  const t = board();
  const shade = engagedWith(t, D.shade);
  const h = t.heroes[0];
  damage(t, h.id, 10, { enemyId: shade.id, combatDamage: true });
  flush(t);
  assert.equal(t.deck.length, 30);
  const v = board();
  engagedWith(v, N.horde);
  damage(v, v.heroes[0].id, 10);
  flush(v);
  assert.equal(v.deck.length, 30);
});

test("Nightmare: Palace Ruins' Action discards X cards from the triggering player's deck for −X threat this phase, once per phase, and Deadmen's Gate follows it", () => {
  let s = board();
  const palace = staged(s, N.palace);
  s.deck = Array(10).fill("01057");
  assert.ok(hooks(s).abilityLabel!(N.palace));
  assert.equal(hooks(s).abilityProblem!(s, palace), null);
  s = applyAction(reload(s), { type: "ABILITY", id: palace.id });
  assert.equal(s.choice!.options.length, 9, "X up to its 9 threat");
  s = run(s, () => "4");
  const p = get(s, palace.id)!;
  assert.equal(s.deck.length, 6);
  assert.equal(threatOf(s, p), 5);
  assert.match(hooks(s).abilityProblem!(s, p)!, /already/);
  // Until the end of the phase.
  s.phase = "quest";
  assert.equal(threatOf(s, p), 9);
  assert.equal(hooks(s).abilityProblem!(s, p), null);
  // Deadmen's Gate (active): the triggering player discards 1 more card.
  let t = board();
  const ruins = staged(t, N.palace);
  t.activeLocation = make(t, D.gate);
  t.deck = Array(10).fill("01057");
  t = applyAction(reload(t), { type: "ABILITY", id: ruins.id });
  t = run(t, () => "2");
  assert.equal(t.deck.length, 7);
  // Only a staged, live Palace Ruins with threat left offers it.
  const u = board();
  u.activeLocation = make(u, N.palace);
  assert.match(hooks(u).abilityProblem!(u, u.activeLocation)!, /staging area/);
  const blank = staged(u, N.palace);
  blank.blanked = true;
  assert.match(hooks(u).abilityProblem!(u, blank)!, /blank/);
});

test("Nightmare: Palace Ruins' shadow discards a card for each engaged Undead enemy, and Fornost Street's gives them +1 attack and +1 defense for the phase", () => {
  const s = board();
  const horde = engagedWith(s, N.horde);
  const shade = engagedWith(s, D.shade);
  const orc = engagedWith(s, ORC);
  const hero = s.heroes[0];
  const before = s.deck.length;
  assert.ok(shadow(s, horde, N.palace, hero));
  flush(s);
  assert.equal(s.deck.length, before - 2, "Undead Horde and Baleful Shade");
  const base = [horde, shade, orc].map((u) => [
    stats(s, u).attack,
    stats(s, u).defense,
  ]);
  assert.ok(shadow(s, horde, N.street, hero));
  assert.deepEqual(
    [horde, shade, orc].map((u) => [stats(s, u).attack, stats(s, u).defense]),
    [
      [base[0][0] + 1, base[0][1] + 1],
      [base[1][0] + 1, base[1][1] + 1],
      base[2],
    ],
  );
  s.phase = "refresh";
  assert.deepEqual(
    [horde, shade, orc].map((u) => [stats(s, u).attack, stats(s, u).defense]),
    base,
    "until the end of the phase",
  );
});

test("Nightmare: a staged Fornost Street gives each other Fornost location +1 threat, and travelling there returns the topmost enemy of the encounter discard pile", () => {
  let s = board();
  const street = staged(s, N.street);
  const palace = staged(s, N.palace);
  const square = staged(s, D.square);
  assert.deepEqual(
    [threatOf(s, street), threatOf(s, palace), threatOf(s, square)],
    [1, 10, 2],
  );
  const second = staged(s, N.street);
  assert.deepEqual(
    [threatOf(s, street), threatOf(s, second), threatOf(s, palace)],
    [2, 2, 11],
  );
  s.staging = s.staging.filter((u) => u.id !== second.id);
  s.activeLocation = second;
  assert.equal(threatOf(s, palace), 10, "only while in the staging area");
  // Travel: return the topmost enemy (which the travel cost requires).
  s.activeLocation = null;
  s.phase = "travel";
  assert.match(canTravel(s, street)!, /enemy.*discard/i);
  s.encounterDiscard = [ORC, N.horde, D.fog];
  assert.equal(canTravel(s, street), null);
  s = applyAction(reload(s), { type: "TRAVEL", id: street.id });
  s = run(s);
  assert.equal(s.activeLocation!.id, street.id);
  assert.ok(s.staging.some((u) => u.code === N.horde));
  assert.deepEqual(s.encounterDiscard, [ORC, D.fog]);
});

test("Nightmare: while Decrepit City is active 'when revealed' effects cannot be canceled, and its shadow discards 3 cards or leaves the attack undefended", () => {
  const s = board();
  assert.equal(hooks(s).cannotCancel!(s, false, D.fog), false);
  staged(s, N.city);
  assert.equal(hooks(s).cannotCancel!(s, false, D.fog), false);
  s.activeLocation = make(s, N.city);
  assert.equal(hooks(s).cannotCancel!(s, false, D.fog), true);
  assert.equal(hooks(s).cannotCancel!(s, true, D.fog), false, "shadows can");
  // A defended attack offers both.
  const t = board();
  const shade = engagedWith(t, D.shade);
  const hero = t.heroes[0];
  assert.ok(shadow(t, shade, N.city, hero));
  flush(t);
  assert.deepEqual(options(t), ["discard", "undefended"]);
  pick(t, "undefended");
  assert.deepEqual([t.combat!.defenderId, t.combat!.defenderIds], [null, []]);
  assert.equal(t.deck.length, 30);
  const u = board();
  const lord = engagedWith(u, D.lord);
  shadow(u, lord, N.city, u.heroes[0]);
  flush(u);
  pick(u, "discard");
  assert.equal(u.deck.length, 27);
  // An undefended attack already is: only the discard changes the game.
  const v = board();
  shadow(v, engagedWith(v, D.shade), N.city);
  flush(v);
  assert.equal(v.choice, null);
  assert.equal(v.deck.length, 27);
});

test("Nightmare: Paralyzing Fear attaches to the first player's chosen hero and exhausts it; the hero readies only if its controller discards a card per copy", () => {
  let s = board(2);
  const target = seatView(s, 1).heroes[0];
  forOwner(s, 1, () => (s.deck = ["01016", "01057", "01057"]));
  revealed(s, N.fear);
  s = run(s, (x) =>
    x.choice!.options.some((o) => o.id === target.id) ? target.id : undefined,
  );
  let h = get(s, target.id)!;
  assert.ok(h.attachments.some((a) => a.code === N.fear));
  assert.equal(h.exhausted, true);
  // The refresh phase's ready: the controller declines.
  readyCharacter(s, h, false);
  assert.equal(h.exhausted, true, "not before its controller decides");
  s = run(s, () => "skip");
  h = get(s, target.id)!;
  assert.equal(h.exhausted, true);
  assert.equal(seatView(s, 1).deck.length, 3);
  // A card effect's ready: the controller discards the top card to ready it.
  queue(s, fx("ready", { target: h.id, player: 1 }));
  s = run(s, () => "pay");
  h = get(s, target.id)!;
  assert.equal(h.exhausted, false);
  assert.deepEqual(seatView(s, 1).discard, ["01016"]);
  // Two copies cost two cards; with one card left, the hero stays exhausted.
  h.attachments.push({ id: `a${s.nextId++}`, code: N.fear, exhausted: false });
  h.exhausted = true;
  forOwner(s, 1, () => (s.deck = ["01057"]));
  readyCharacter(s, h, false);
  s = run(s);
  assert.equal(get(s, target.id)!.exhausted, true);
  assert.equal(seatView(s, 1).deck.length, 1);
  // A hero without Paralyzing Fear readies as usual.
  const other = s.heroes[0];
  other.exhausted = true;
  readyCharacter(s, other, false);
  assert.equal(other.exhausted, false);
});

test("Nightmare: Curse of Angmar discards each hand card titled like a card in its owner's discard pile, and gains surge when none is discarded", () => {
  let s = board(2);
  s.hand = [make(s, "01016"), make(s, "01017"), make(s, "01016")];
  s.discard = ["01016"];
  forOwner(s, 1, () => {
    s.hand = [make(s, "01017")];
    s.discard = ["01016"];
  });
  revealed(s, N.curse);
  s = run(s);
  assert.deepEqual(
    s.hand.map((u) => u.code),
    ["01017"],
  );
  assert.deepEqual(s.discard, ["01016", "01016", "01016"]);
  assert.deepEqual(
    seatView(s, 1).hand.map((u) => u.code),
    ["01017"],
  );
  assert.ok(!s.staging.some((u) => u.code === D.keep), "no surge");
  let t = board();
  t.hand = [make(t, "01017")];
  t.discard = ["01016"];
  revealed(t, N.curse);
  t = run(t);
  assert.equal(t.hand.length, 1);
  assert.ok(
    t.staging.some((u) => u.code === D.keep),
    "it gains surge and reveals the next card",
  );
});

test("Nightmare: Gather Your Courage holds the top 8 cards of each player's deck until it is defeated, then shuffles them back into their owners' decks", () => {
  let s = board(2);
  for (const p of [0, 1])
    forOwner(s, p, () => (s.deck = Array(12).fill(p ? "01057" : "01016")));
  revealed(s, N.courage);
  s = run(s);
  const quest = s.staging.find((u) => u.code === N.courage)!;
  assert.ok(quest);
  assert.deepEqual(
    [seatView(s, 0).deck.length, seatView(s, 1).deck.length],
    [4, 4],
  );
  assert.equal(s.nightmare!.dikeCourage![0].cards.length, 16);
  assert.match(nightmareStatus(s)[0], /16 cards are facedown under/);
  assert.ok(
    s.staging.some((u) => u.code === D.keep),
    "Surge.",
  );
  s = reload(s);
  assert.ok(valid(s));
  get(s, quest.id)!.progress = 8;
  checkSideQuestDefeats(s);
  s = run(s);
  assert.ok(!s.staging.some((u) => u.code === N.courage));
  assert.equal(s.nightmare!.dikeCourage, undefined);
  assert.deepEqual(
    [seatView(s, 0).deck, seatView(s, 1).deck],
    [Array(12).fill("01016"), Array(12).fill("01057")],
  );
  // If it leaves play otherwise, the cards go to their owners' discard piles.
  let t = board();
  t.deck = Array(9).fill("01016");
  revealed(t, N.courage);
  t = run(t);
  t.staging = t.staging.filter((u) => u.code !== N.courage);
  hooks(t).check!(t);
  assert.deepEqual([t.deck.length, t.discard.length], [1, 8]);
  assert.equal(t.nightmare!.dikeCourage, undefined);
});

test("Nightmare: Deadmen's Dike's Nightmare state survives saves, malformed state is refused, and seeded games finish with valid saves", () => {
  let s = board();
  const palace = staged(s, N.palace);
  s.deck = Array(30).fill("01057");
  s = applyAction(reload(s), { type: "ABILITY", id: palace.id });
  s = run(s, () => "1");
  const horde = engagedWith(s, N.horde);
  shadow(s, horde, N.street, s.heroes[0]);
  s.combat = null;
  revealed(s, N.courage);
  s = run(s);
  const back = reload(s);
  assert.deepEqual(back.nightmare, s.nightmare);
  const broken = (f: (x: GameState) => void) => {
    const x = JSON.parse(JSON.stringify(s));
    f(x);
    return valid(x);
  };
  assert.equal(
    broken(
      (x) =>
        (x.nightmare!.dikePalace = [
          { id: "c1", round: 1, phase: "quest", value: -1 },
        ]),
    ),
    false,
  );
  assert.equal(
    broken(
      (x) =>
        (x.nightmare!.dikeStreet = [
          { enemy: 3 as never, round: 1, phase: "x" },
        ]),
    ),
    false,
  );
  assert.equal(
    broken((x) => (x.nightmare!.dikeCourage![0].cards[0].player = 5)),
    false,
  );
  assert.equal(
    broken((x) => (x.nightmare!.dikeCourage![0].cards[0].code = "nope")),
    false,
  );
  assert.equal(
    broken((x) => delete x.nightmareMode),
    false,
    "only a Nightmare game holds the Nightmare Deck's state",
  );
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
    assert.ok(valid(g));
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
  assert.ok(valid(g2));
});
