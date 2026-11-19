import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards, STARTERS } from "../src/game/cards";
import { check, damage, engage, revealed } from "../src/game/board";
import { encounterDraw, make, stats, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { applyAction, createGame } from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import {
  NIGHTMARE,
  NIGHTMARE_CORE as N,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
  nightmareSupported,
} from "../src/game/nightmare";
import { automatedScenarioId } from "../src/game/support";
import { scenario } from "../src/game/scenarios";
import { forOwner, seatView } from "../src/game/table";
import type { GameState } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  calm,
  choose,
  nightmareForTwo,
  nightmareGame,
  opening,
  reload,
  reveal,
  shadow,
  valid,
} from "./nightmare-fixtures";

const HILL_TROLL = "01082",
  SNIPER = "01083",
  WARGS = "01085",
  BROWN_LANDS = "01087",
  DESPAIR = "01086";
const anduin = (seed = 5) => nightmareGame("anduin", seed);
/** A quiet solo board in `phase` with no enemy engaged. */
const board = (phase: GameState["phase"], seed = 5) => {
  const s = calm(opening(anduin(seed)), phase);
  s.engaged = [];
  return s;
};
const hooks = (s: GameState) => batch4Scenario(s);

test("Nightmare: Journey Along the Anduin's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.anduinCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "Journey Along the Anduin - Nightmare", true],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for the Journey Along the Anduin scenario found in the LOTR LCG core set\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n3x Evil Storm\n2x Treacherous Fog\n2x Banks of the Anduin\n3x Dol Guldur Orcs\n2x Enchanted Stream\n2x Despair\n3x Misty Mountain Goblins\n2x Necromancer's Pass\n/,
  );
  assert.equal(
    c.back_text,
    'You are playing Nightmare mode.\nAll Troll enemies gain the text: "Cannot have attachments."\nIf the encounter deck is empty (at any time), shuffle the encounter discard pile back into the encounter deck.',
  );
  // The scans correct the catalog.
  assert.equal(
    card(N.trollSpawn).text,
    "If there is no Hill Troll in play, Anduin Troll Spawn gains surge.\nForced: At the beginning of the combat phase, Anduin Troll Spawn engages a player engaged with a Hill Troll.",
  );
  assert.equal(
    card(N.marshlands).shadow,
    "Shadow: Each enemy engaged with the defending player gets +1 [attack] until the end of the phase. (+2 [attack] instead if this attack is undefended.)",
  );
  const stat = (code: string) => {
    const x = card(code);
    return [x.engagement, x.threat, x.attack, x.defense, x.health];
  };
  assert.deepEqual(stat(N.trollSpawn), [26, 2, 4, 3, 5]);
  // Brown Water Rats prints no hit points.
  assert.deepEqual(stat(N.rats), [1, 1, 1, 1, undefined]);
  assert.deepEqual(stat(N.outlaws), [21, 2, 2, 2, 8]);
  assert.deepEqual(
    [N.ford, N.marshlands].map((x) => [card(x).threat, card(x).quest]),
    [
      [3, 6],
      [10, 10],
    ],
  );
  // 9 cards (19 encounter cards), 10 faces pinned.
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Journey Along the Anduin - Nightmare",
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
  for (const x of set)
    assert.ok(
      art.some((a) => a.code === x.code && a.face === "front"),
      x.name,
    );
  assert.ok(art.some((a) => a.code === N.anduinCard && a.face === "back"));
});

test("Nightmare: Journey Along the Anduin's Nightmare encounter deck matches its source recipe, and the audit counts it", () => {
  const sets = scenario("anduin").sets as readonly string[];
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  const deck = nightmareEncounterDeck("anduin", standard);
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
  const recipe = recipes.find((r) => r.id === "N01.2")!;
  const expected: Record<string, number> = {};
  for (const c of recipe.cards)
    if (
      ["sharedEncounterDeck", "sharedStagingArea"].includes(c.section) &&
      c.code !== N.anduinCard
    )
      expected[c.code] = (expected[c.code] ?? 0) + c.quantity;
  assert.deepEqual(count(deck), expected);
  for (const [title, n] of Object.entries(NIGHTMARE.anduin!.removals))
    assert.ok(card(N.anduinCard).text!.includes(`${n}x ${title}`), title);
  assert.ok(nightmareSupported("anduin"));
  assert.equal(
    automatedScenarioId({
      name: "Journey Along the Anduin (Nightmare)",
      mode: "nightmare",
    }),
    "anduin",
  );
});

test("Nightmare: Journey Along the Anduin's setup and rules: Trolls cannot have attachments, and an empty encounter deck refills at any time", () => {
  const fresh = anduin();
  const cards = [
    ...fresh.encounterDeck,
    ...fresh.encounterDiscard,
    ...fresh.staging.map((u) => u.code),
  ];
  assert.ok(!cards.includes("01116"), "no Evil Storm is left");
  assert.equal(cards.filter((c) => c === N.trollSpawn).length, 3);
  const s = opening(anduin());
  assert.equal(s.nightmareMode, true);
  assert.equal(nightmareCardOf(s), N.anduinCard);
  assert.match(nightmareStatus(s)[0], /Troll enemies cannot have attachments/);
  assert.ok(valid(s));
  assert.ok(valid(opening(nightmareForTwo("anduin"))));
  // "All Troll enemies gain the text: 'Cannot have attachments.'"
  const troll = make(s, HILL_TROLL),
    spawn = make(s, N.trollSpawn),
    sniper = make(s, SNIPER);
  assert.equal(hooks(s).cannotAttach!(s, troll, "01069"), true);
  assert.equal(hooks(s).cannotAttach!(s, spawn, "01069"), true);
  assert.equal(hooks(s).cannotAttach!(s, sniper, "01069"), false);
  // "If the encounter deck is empty (at any time), shuffle the encounter
  // discard pile back into the encounter deck."
  const t = board("defense");
  t.encounterDeck = [];
  t.encounterDiscard = [SNIPER, WARGS];
  check(t);
  assert.equal(t.encounterDeck.length, 2);
  assert.equal(t.encounterDiscard.length, 0);
  assert.ok(t.log.some((l) => /shuffled back into it/.test(l.text)));
  // A shadow card dealt from the empty deck draws from the refilled one.
  t.encounterDeck = [];
  t.encounterDiscard = [SNIPER];
  assert.equal(encounterDraw(t, true), SNIPER);
  // (A standard game does not refill it outside the quest phase.)
  const normal = calm(
    opening(
      createGame(5, STARTERS[0].cards, STARTERS[0].heroes, STARTERS[0].id, {
        scenarioId: "anduin",
      }),
    ),
    "defense",
  );
  normal.encounterDeck = [];
  normal.encounterDiscard = [SNIPER];
  assert.equal(encounterDraw(normal, true), undefined);
});

test("Nightmare: A Flooded Ford and Anduin Troll Spawn", () => {
  // A Flooded Ford: each card revealed by the encounter deck gains doomed X,
  // X its progress tokens.
  const s = board("staging");
  const ford = make(s, N.ford);
  ford.progress = 2;
  s.staging.push(ford);
  const threat = s.threat;
  const t = reveal(s, BROWN_LANDS);
  assert.equal(t.threat, threat + 2);
  // (A card revealed from the discard pile is not revealed by the deck.)
  const u = board("staging");
  const ford2 = make(u, N.ford);
  ford2.progress = 2;
  u.staging.push(ford2);
  const before = u.threat;
  revealed(u, BROWN_LANDS, undefined, "discard");
  flush(u);
  assert.equal(u.threat, before);
  // Its shadow: if the attack is undefended, it enters the staging area with
  // 1 progress token.
  const v = board("defense");
  const enemy = make(v, SNIPER);
  v.engaged.push(enemy);
  const fords = () => v.staging.filter((x) => x.code === N.ford);
  const already = fords().length;
  shadow(v, enemy, N.ford, v.heroes[0]);
  assert.equal(fords().length, already);
  shadow(v, enemy, N.ford);
  assert.equal(fords().length, already + 1);
  assert.equal(fords().at(-1)!.progress, 1);
  assert.ok(!enemy.shadows.includes(N.ford));
  // Anduin Troll Spawn gains surge without a Hill Troll in play (the setup
  // put one in the staging area).
  const w = board("staging");
  w.staging = w.staging.filter((u) => u.code !== HILL_TROLL);
  assert.equal(hooks(w).revealedSurge!(w, N.trollSpawn), true);
  const deck = w.encounterDeck.length;
  const x = reveal(w, N.trollSpawn);
  assert.ok(x.encounterDeck.length < deck, "it surged");
  const y = board("staging");
  y.staging.push(make(y, HILL_TROLL));
  assert.equal(hooks(y).revealedSurge!(y, N.trollSpawn), false);
  // "Forced: At the beginning of the combat phase, Anduin Troll Spawn engages
  // a player engaged with a Hill Troll."
  const z = calm(opening(nightmareForTwo("anduin")), "defense");
  for (const p of [0, 1]) forOwner(z, p, () => (z.engaged = []));
  const hill = make(z, HILL_TROLL),
    staged = make(z, N.trollSpawn),
    held = make(z, N.trollSpawn);
  z.staging.push(hill, staged);
  forOwner(z, 1, () => engage(z, hill));
  forOwner(z, 0, () => z.engaged.push(held));
  hooks(z).combatBegin!(z);
  const ids = seatView(z, 1).engaged.map((e) => e.id);
  assert.ok(ids.includes(staged.id) && ids.includes(held.id));
  assert.ok(!seatView(z, 0).engaged.some((e) => e.id === held.id));
});

test("Nightmare: Brown Water Rats and Gladden Marshlands", () => {
  // Brown Water Rats cannot be damaged (and, with no hit points, is never
  // destroyed).
  const s = board("attack");
  const rats = make(s, N.rats);
  s.engaged.push(rats);
  damage(s, rats.id, 3);
  check(s);
  assert.equal(rats.damage, 0);
  assert.ok(s.engaged.some((e) => e.id === rats.id));
  // Its shadow: the attacking enemy cannot be damaged this round.
  const sniper = make(s, SNIPER);
  s.engaged.push(sniper);
  shadow(s, sniper, N.rats, s.heroes[0]);
  s.combat = null;
  damage(s, sniper.id, 2);
  assert.equal(sniper.damage, 0);
  // Stage 3: with only Rat enemies remaining, they are discarded from play,
  // and the players win.
  const t = board("planning");
  t.stage = 3;
  t.staging = [make(t, N.rats)];
  const other = board("planning");
  other.stage = 3;
  other.staging = [make(other, N.rats), make(other, SNIPER)];
  check(other);
  assert.ok(other.staging.some((x) => x.code === N.rats));
  check(t);
  assert.ok(!t.staging.some((x) => x.code === N.rats));
  assert.ok(t.encounterDiscard.includes(N.rats));
  assert.equal(t.status, "won");
  // Gladden Marshlands: "Action: Deal 1 damage to a hero you control to
  // reduce Gladden Marshlands' [threat] by 1 until the end of the phase."
  const u = board("planning");
  const marsh = make(u, N.marshlands);
  u.staging.push(marsh);
  const base = threatOf(u, marsh);
  let v = applyAction(reload(u), { type: "ABILITY", id: marsh.id });
  assert.match(v.choice!.title, /^Gladden Marshlands · Deal 1 damage/);
  const heroId = v.choice!.options[0].id;
  v = choose(v, heroId);
  assert.equal(v.heroes.find((h) => h.id === heroId)!.damage, 1);
  assert.equal(
    threatOf(
      v,
      v.staging.find((x) => x.id === marsh.id)!,
    ),
    base - 1,
  );
  assert.ok(valid(v));
  marsh.tempThreat = -10;
  assert.match(hooks(u).abilityProblem!(u, marsh)!, /already 0/);
  // Its shadow: the defending player's engaged enemies get +1 [attack] (+2
  // if undefended) until the end of the phase.
  const w = board("defense");
  const a = make(w, SNIPER),
    b = make(w, WARGS);
  w.engaged.push(a, b);
  const [atkA, atkB] = [stats(w, a).attack, stats(w, b).attack];
  shadow(w, a, N.marshlands, w.heroes[0]);
  assert.deepEqual(
    [stats(w, a).attack, stats(w, b).attack],
    [atkA + 1, atkB + 1],
  );
  shadow(w, a, N.marshlands);
  assert.equal(stats(w, a).attack, atkA + 3);
});

test("Nightmare: Marshland Outlaws and Pursuit on the Shore", () => {
  // Marshland Outlaws: the player engaged with it cannot attack, or damage
  // through effects, an enemy with another title.
  const s = board("attack");
  const outlaws = make(s, N.outlaws),
    sniper = make(s, SNIPER);
  s.engaged.push(outlaws, sniper);
  const hero = s.heroes[0];
  assert.equal(hooks(s).cannotAttack!(s, hero, sniper), true);
  assert.equal(hooks(s).cannotAttack!(s, hero, outlaws), false);
  s.playerAbilitySources = [{ source: hero.id, code: hero.code }];
  damage(s, sniper.id, 1);
  assert.equal(sniper.damage, 0);
  damage(s, outlaws.id, 1);
  assert.equal(outlaws.damage, 1);
  delete s.playerAbilitySources;
  damage(s, sniper.id, 1, { combatDamage: true });
  assert.equal(sniper.damage, 1);
  s.engaged = s.engaged.filter((e) => e.id !== outlaws.id);
  s.staging.push(outlaws);
  assert.equal(hooks(s).cannotAttack!(s, hero, sniper), false);
  // Its shadow: the defending player raises their threat by the attack's
  // damage (in their own seat).
  const t = calm(opening(nightmareForTwo("anduin")), "defense");
  const enemy = make(t, SNIPER);
  forOwner(t, 1, () => t.engaged.push(enemy));
  const [own, first] = [seatView(t, 1).threat, seatView(t, 0).threat];
  shadow(t, enemy, N.outlaws, undefined, 1);
  const after = hooks(t).attackFinished!(t, {
    ...t.combat!,
    damageDealt: 3,
  });
  t.combat = null;
  t.queue.unshift(...after);
  flush(t);
  assert.equal(seatView(t, 1).threat, own + 3);
  assert.equal(seatView(t, 0).threat, first);
  assert.ok(valid(t));
  // Pursuit on the Shore returns the enemy with the most hit points from the
  // victory display or the encounter discard pile (cannot be canceled).
  const u = board("staging");
  u.victoryCards = [HILL_TROLL];
  u.victory = 4;
  u.encounterDiscard = [SNIPER, WARGS];
  assert.equal(hooks(u).cannotCancel!(u, false, N.pursuit), true);
  assert.equal(hooks(u).cannotCancel!(u, false, N.smoking), false);
  const v = reveal(u, N.pursuit);
  assert.ok(v.staging.some((x) => x.code === HILL_TROLL));
  assert.deepEqual([v.victory, v.victoryCards], [0, []]);
  assert.ok(v.encounterDiscard.includes(N.pursuit));
  // Tied enemies: the first player chooses.
  const w = board("staging");
  w.victoryCards = [WARGS];
  w.encounterDiscard = [WARGS];
  revealed(w, N.pursuit);
  flush(w);
  assert.match(w.choice!.title, /^Pursuit on the Shore · Choose/);
  const x = choose(w, `victory:${WARGS}`);
  assert.ok(x.staging.some((u) => u.code === WARGS));
  assert.deepEqual(x.victoryCards, []);
  assert.ok(x.encounterDiscard.includes(WARGS));
  // No enemy: it gains surge.
  const y = board("staging");
  y.victoryCards = [];
  y.encounterDiscard = [DESPAIR];
  const deck = y.encounterDeck.length;
  const z = reveal(y, N.pursuit);
  assert.ok(z.encounterDeck.length < deck, "it surged");
});

test("Nightmare: Smoking Blood and Troll Attack", () => {
  // Smoking Blood: all damage leaves the enemies; each player raises their
  // threat by the damage removed from their engaged enemies.
  const s = board("staging");
  const staged = make(s, SNIPER),
    wargs = make(s, WARGS);
  staged.damage = 1;
  wargs.damage = 2;
  s.staging.push(staged);
  s.engaged.push(wargs);
  const [threat, deck] = [s.threat, s.encounterDeck.length];
  const t = reveal(s, N.smoking);
  assert.equal(t.threat, threat + 2);
  assert.ok([...t.staging, ...t.engaged].every((u) => !u.damage));
  assert.equal(t.encounterDeck.length, deck, "no surge");
  // Without damage to remove, it gains surge.
  const u = board("staging");
  const before = u.encounterDeck.length;
  const v = reveal(u, N.smoking);
  assert.ok(v.encounterDeck.length < before, "it surged");
  // Its shadow moves the attacker's damage to the defender, or (undefended)
  // to the hero the attack damaged.
  const w = board("defense");
  const enemy = make(w, WARGS);
  enemy.damage = 2;
  w.engaged.push(enemy);
  const defender = w.heroes[0];
  shadow(w, enemy, N.smoking, defender);
  flush(w);
  assert.deepEqual([enemy.damage, defender.damage], [0, 2]);
  enemy.damage = 1;
  shadow(w, enemy, N.smoking);
  const hurt = w.heroes[1];
  damage(w, hurt.id, 1, { combatDamage: true, enemyId: enemy.id });
  const moved = hooks(w).attackFinished!(w, w.combat!);
  w.combat = null;
  w.queue.unshift(...moved);
  flush(w);
  assert.deepEqual([enemy.damage, hurt.damage], [0, 2]);
  assert.ok(valid(w));
  // Troll Attack: each engaged Troll makes an attack (or it gains surge).
  const x = board("staging");
  const troll = make(x, HILL_TROLL);
  x.engaged.push(troll);
  revealed(x, N.trollAttack);
  flush(x);
  assert.match(x.choice!.title, /^Hill Troll · Immediate attack/);
  const y = board("staging");
  const left = y.encounterDeck.length;
  const z = reveal(y, N.trollAttack);
  assert.ok(z.encounterDeck.length < left, "it surged");
  // Its shadow: a Troll's attack resolves against each other player,
  // undefended, with the attack's bonus.
  const a = calm(opening(nightmareForTwo("anduin")), "defense");
  for (const p of [0, 1]) forOwner(a, p, () => (a.engaged = []));
  const hill = make(a, HILL_TROLL);
  a.engaged.push(hill);
  shadow(a, hill, N.trollAttack, a.heroes[0], 0);
  const next = hooks(a).attackFinished!(a, { ...a.combat!, attackBonus: 2 });
  assert.deepEqual(
    next.map((e) => [e.kind, e.player, e.noShadow]),
    [["immediateAttack", 1, true]],
  );
  a.combat = null;
  a.queue.unshift(...next);
  flush(a);
  assert.equal(a.combat!.attackPlayer, 1);
  assert.equal(a.combat!.attackBonus, 2);
  assert.deepEqual(
    a.choice!.options.map((o) => o.id),
    ["undefended"],
  );
  assert.ok(valid(a));
  // A save with a malformed record is refused.
  const bad = structuredClone(a);
  bad.nightmare!.sweep = [{ enemyId: 7 as never, player: 1 }];
  assert.equal(valid(bad), false);
});

test("Nightmare: seeded Journey Along the Anduin and Passage Through Mirkwood games finish with valid saves", () => {
  for (const seed of [1, 2]) {
    const s = autoplay(anduin(seed));
    assert.notEqual(s.status, "playing", `anduin seed ${seed}`);
  }
  const t = autoplay(nightmareForTwo("anduin", 7), 4000);
  assert.notEqual(t.status, "playing", "two-player anduin");
  const u = autoplay(nightmareGame("mirkwood", 3));
  assert.notEqual(u.status, "playing", "mirkwood");
});
