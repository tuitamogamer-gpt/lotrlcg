import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { check, progressLocation, readyCharacter } from "../src/game/board";
import { make, stats, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { hasTrait } from "../src/game/expansion-passives";
import {
  NIGHTMARE,
  NIGHTMARE_SOM as G,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { athelasInPlay } from "../src/game/nightmare-rhosgobel";
import { RHOS, rhosgobelHeal } from "../src/game/rhosgobel";
import {
  allCharacters,
  attackersFor,
  forOwner,
  losesRanged,
  seatView,
} from "../src/game/table";
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

const WEB = "01077",
  ORCS = "01089",
  WINGED_GUARDIAN = "02004",
  VASSAL = "02098",
  LEGOLAS = "01005",
  SNARE = "01069";
const rhos = (seed = 5) => nightmareGame("journey-to-rhosgobel", seed);
/** A quiet solo board in `phase` with nothing engaged or staged (Rhosgobel gone, so Wilyador can be healed). */
const board = (phase: GameState["phase"], seed = 5) => {
  const s = calm(opening(rhos(seed)), phase);
  s.engaged = [];
  s.staging = [];
  return s;
};
const hooks = (s: GameState) => batch4Scenario(s);
const wily = (s: GameState) =>
  allCharacters(s).find((u) => u.code === RHOS.wilyador)!;
function run(s: GameState, effects: { kind: string }[] | void) {
  s.queue.unshift(...((effects ?? []) as never[]));
  flush(s);
  return s;
}
function holdAthelas(s: GameState, h: Unit) {
  h.attachments.push({
    id: `a${s.nextId++}`,
    code: RHOS.athelas,
    exhausted: false,
  });
}
/** An enemy's attack has finished: the additional attacks due resolve. */
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

test("Nightmare: A Journey to Rhosgobel's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(G.rhosCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "A Journey to Rhosgobel - Nightmare", true],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for the A Journey to Rhosgobel scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n4x Forest Grove\n1x Exhaustion\n2x Swarming Insects\n1x Festering Wounds\n3x Mountains of Mirkwood\n1x Chieftan Ufthak\n2x Dol Guldur Beastmaster\n1x Driven by Shadow\n1x The Necromancer's Reach\n2x Necromancer's Pass\n2x Enchanted Stream\nThen, shuffle/,
  );
  // The scan corrects the catalog's "Then shuffle the encounter deck".
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nSetup: Search the encounter deck for 1 copy of Goblin Eagle-hunter and add it to the staging area. Then, shuffle the encounter deck.\nForced: The first Creature enemy revealed during each quest phase gains surge.\nResponse: After an Athelas card is placed in the discard pile, you may shuffle it into the encounter deck.",
  );
  assert.equal(
    card(G.birdEater).text,
    "While Treetop Bird-eater is engaged with a player, characters controlled by that player cannot be healed.\nForced: At the beginning of the encounter phase, Treetop Bird-eater engages the player who controls Wilyador (regardless of threat).",
  );
  const stat = (code: string) => {
    const x = card(code);
    return [x.engagement, x.threat, x.attack, x.defense, x.health];
  };
  assert.deepEqual(stat(G.eagleHunter), [48, 2, 5, 3, 4]);
  assert.deepEqual(stat(G.birdEater), [11, 2, 4, 3, 5]);
  assert.deepEqual(
    [G.darkwood, G.labyrinth, G.thicket].map((x) => [
      card(x).threat,
      card(x).quest,
    ]),
    [
      [3, 4],
      [2, 5],
      [4, 2],
    ],
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "A Journey to Rhosgobel - Nightmare",
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

test("Nightmare: A Journey to Rhosgobel's Nightmare encounter deck matches its source recipe, and setup adds a Goblin Eagle-hunter", () => {
  const sets = scenario("journey-to-rhosgobel").sets as readonly string[];
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  const deck = nightmareEncounterDeck("journey-to-rhosgobel", standard);
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
  const recipe = recipes.find((r) => r.id === "N01.6")!;
  // The recipe stages Rhosgobel and the setup's Goblin Eagle-hunter, and
  // gives Wilyador to the first player.
  const expected: Record<string, number> = {};
  for (const c of recipe.cards)
    if (
      ["sharedEncounterDeck", "sharedStagingArea", "player1Play1"].includes(
        c.section,
      ) &&
      c.code !== G.rhosCard
    )
      expected[c.code] = (expected[c.code] ?? 0) + c.quantity;
  assert.deepEqual(count(deck), expected);
  for (const [title, n] of Object.entries(
    NIGHTMARE["journey-to-rhosgobel"]!.removals,
  ))
    assert.ok(
      card(G.rhosCard).text!.includes(
        `${n}x ${title === "Chieftain Ufthak" ? "Chieftan Ufthak" : title}`,
      ),
      title,
    );
  assert.equal(
    automatedScenarioId({
      name: "A Journey to Rhosgobel (Nightmare)",
      mode: "nightmare",
    }),
    "journey-to-rhosgobel",
  );
  const s = opening(rhos());
  assert.equal(nightmareCardOf(s), G.rhosCard);
  assert.match(nightmareStatus(s)[0], /Goblin Eagle-hunter began/);
  assert.equal(s.staging.filter((u) => u.code === G.eagleHunter).length, 1);
  assert.ok(s.staging.some((u) => u.code === RHOS.rhosgobel));
  assert.ok(
    s.encounterDeck.filter((c) => c === G.eagleHunter).length +
      s.encounterDiscard.filter((c) => c === G.eagleHunter).length +
      s.engaged.filter((u) => u.code === G.eagleHunter).length <=
      2,
  );
  assert.ok(valid(s));
  assert.ok(valid(opening(nightmareForTwo("journey-to-rhosgobel"))));
});

test("Nightmare: the first Creature enemy revealed during each quest phase gains surge, and an Athelas in the discard pile may be shuffled back", () => {
  const s = board("staging");
  s.encounterDeck = [WEB, WEB, WEB, WEB];
  const t = reveal(s, RHOS.bats);
  assert.equal(t.encounterDeck.length, 3, "the first Creature surged");
  const u = reveal(t, RHOS.flock);
  assert.equal(u.encounterDeck.length, 3, "the second did not");
  u.round++;
  const v = reveal(u, RHOS.flock);
  assert.equal(v.encounterDeck.length, 2, "a new quest phase");
  v.phase = "encounter";
  v.round++;
  const w = reveal(v, RHOS.bats);
  assert.equal(w.encounterDeck.length, 2, "outside the quest phase");
  const x = board("staging");
  x.encounterDeck = [WEB, WEB];
  const y = reveal(x, ORCS);
  assert.equal(y.encounterDeck.length, 2, "(an Orc is no Creature)");
  // "Response: After an Athelas card is placed in the discard pile, you may
  // shuffle it into the encounter deck."
  const a = board("planning");
  const before = a.encounterDeck.filter((c) => c === RHOS.athelas).length;
  a.encounterDiscard.push(RHOS.athelas);
  check(a);
  flush(a);
  assert.match(
    a.choice!.title,
    /An Athelas reached the encounter discard pile/,
  );
  const b = choose(a, "shuffle");
  assert.ok(!b.encounterDiscard.includes(RHOS.athelas));
  assert.equal(
    b.encounterDeck.filter((c) => c === RHOS.athelas).length,
    before + 1,
  );
  b.encounterDiscard.push(RHOS.athelas);
  check(b);
  flush(b);
  const e = choose(b, "keep");
  assert.ok(e.encounterDiscard.includes(RHOS.athelas));
  check(e);
  flush(e);
  assert.equal(e.choice, null, "offered once");
  assert.ok(valid(e));
});

test("Nightmare: Goblin Eagle-hunter, Treetop Bird-eater and Noxious Supplies", () => {
  // Goblin Eagle-hunter: +1 hit point per player; at the end of the combat
  // phase each copy deals 1 damage to Wilyador.
  const s = board("attack");
  const hunter = make(s, G.eagleHunter);
  s.staging.push(hunter, make(s, G.eagleHunter));
  assert.equal(stats(s, hunter).health, 5);
  const two = opening(nightmareForTwo("journey-to-rhosgobel"));
  assert.equal(stats(two, make(two, G.eagleHunter)).health, 6);
  const damage = wily(s).damage;
  hooks(s).combatEnd!(s);
  flush(s);
  assert.equal(wily(s).damage, damage + 2);
  // Its shadow: 2 damage to Wilyador while he has 10 or less.
  const t = board("defense");
  const enemy = make(t, ORCS);
  t.engaged.push(enemy);
  const was = wily(t).damage;
  shadow(t, enemy, G.eagleHunter, t.heroes[0]);
  flush(t);
  assert.equal(wily(t).damage, was + 2);
  wily(t).damage = 11;
  shadow(t, enemy, G.eagleHunter, t.heroes[0]);
  flush(t);
  assert.equal(wily(t).damage, 11);
  // Treetop Bird-eater: the engaged player's characters cannot be healed.
  const u = board("planning");
  const hero = u.heroes[0];
  hero.damage = 2;
  const eater = make(u, G.birdEater);
  u.engaged.push(eater);
  assert.equal(rhosgobelHeal(u, hero, 2, { code: SNARE }), 0);
  u.engaged = [];
  assert.equal(rhosgobelHeal(u, hero, 2, { code: SNARE }), 2);
  // At the beginning of the encounter phase it engages Wilyador's
  // controller, from the staging area or another player.
  const v = calm(opening(nightmareForTwo("journey-to-rhosgobel")), "encounter");
  for (const p of [0, 1]) forOwner(v, p, () => (v.engaged = []));
  v.staging = [];
  const first = make(v, G.birdEater),
    second = make(v, G.birdEater);
  v.staging.push(first);
  forOwner(v, 1, () => v.engaged.push(second));
  const controller = seatView(v, 0).allies.some((a) => a.code === RHOS.wilyador)
    ? 0
    : 1;
  hooks(v).encounterBegin!(v);
  flush(v);
  assert.deepEqual(
    seatView(v, controller)
      .engaged.filter((e) => e.code === G.birdEater)
      .map((e) => e.id)
      .sort(),
    [first.id, second.id].sort(),
  );
  assert.ok(valid(v));
  // Noxious Supplies (surge): attached to Wilyador; a card effect other
  // than Athelas heals him of only 1 damage, and it is discarded.
  const w = board("staging");
  w.encounterDeck = [WEB, WEB];
  const x = reveal(w, G.noxious);
  assert.ok(wily(x).attachments.some((a) => a.code === G.noxious));
  assert.equal(x.encounterDeck.length, 1, "it surged");
  wily(x).damage = 8;
  assert.equal(rhosgobelHeal(x, wily(x), 5, { code: SNARE }), 1);
  assert.ok(!wily(x).attachments.some((a) => a.code === G.noxious));
  assert.ok(x.encounterDiscard.includes(G.noxious));
  assert.equal(rhosgobelHeal(x, wily(x), 5, { code: SNARE }), 5);
  // Stage 3's Athelas treatment is not reduced.
  const y = board("staging");
  y.encounterDeck = [WEB, WEB];
  const z = reveal(y, G.noxious);
  wily(z).damage = 8;
  assert.equal(
    rhosgobelHeal(z, wily(z), 5, {
      source: `quest:${RHOS.return}`,
      code: RHOS.return,
    }),
    5,
  );
  assert.ok(wily(z).attachments.some((a) => a.code === G.noxious));
  assert.ok(valid(z));
});

test("Nightmare: Shot from the Sky, Dark-wood Grove, Labyrinthine Woods and Pitch-dark Thicket", () => {
  // Shot from the Sky (surge): attached to an Eagle character (Wilyador has
  // "No attachments"), which loses the Eagle trait and takes 1 damage each
  // time it readies.
  const s = board("staging");
  s.encounterDeck = [WEB, WEB, WEB];
  const guardian = make(s, WINGED_GUARDIAN),
    vassal = make(s, VASSAL);
  s.allies.push(guardian, vassal);
  const t = reveal(s, G.shot, (x) =>
    x.choice!.options.some((o) => o.id === guardian.id)
      ? guardian.id
      : undefined,
  );
  const shot = t.allies.find((a) => a.id === guardian.id)!;
  assert.ok(shot.attachments.some((a) => a.code === G.shot));
  assert.ok(!hasTrait(shot, "Eagle"));
  assert.ok(
    hasTrait(
      t.allies.find((a) => a.id === vassal.id)!,
      "Eagle",
    ),
  );
  assert.ok(!wily(t).attachments.some((a) => a.code === G.shot));
  assert.equal(t.encounterDeck.length, 2, "it surged");
  shot.exhausted = true;
  const hurt = shot.damage;
  readyCharacter(t, shot);
  flush(t);
  assert.equal(shot.damage, hurt + 1);
  // With no Eagle character it is discarded.
  const u = board("staging");
  u.encounterDeck = [WEB, WEB];
  const v = reveal(u, G.shot);
  assert.ok(v.encounterDiscard.includes(G.shot));
  // Its shadow attaches it from the attacking enemy's shadow cards.
  const w = board("defense");
  const orc = make(w, ORCS);
  w.engaged.push(orc);
  const eagle = make(w, VASSAL);
  w.allies.push(eagle);
  shadow(w, orc, G.shot, w.heroes[0]);
  flush(w);
  assert.ok(eagle.attachments.some((a) => a.code === G.shot));
  assert.ok(!orc.shadows.includes(G.shot));
  // Dark-wood Grove: +1 [threat] and +1 quest point for each Athelas in
  // play; its shadow: an additional attack when the defending player controls
  // Athelas.
  const x = board("travel");
  const grove = make(x, G.darkwood);
  x.staging.push(grove, make(x, RHOS.athelas));
  holdAthelas(x, x.heroes[0]);
  assert.equal(athelasInPlay(x), 2);
  assert.equal(threatOf(x, grove), 5);
  assert.equal(hooks(x).locationQuestBonus!(x, grove), 2);
  progressLocation(x, grove, 5);
  assert.equal(grove.progress, 5, "6 quest points");
  const y = board("defense");
  const attacker = make(y, ORCS);
  y.engaged.push(attacker);
  shadow(y, attacker, G.darkwood, y.heroes[0]);
  assert.deepEqual(attacked(y, attacker).choice, null, "no Athelas");
  holdAthelas(y, y.heroes[1]);
  shadow(y, attacker, G.darkwood, y.heroes[0]);
  const z = attacked(y, attacker);
  assert.match(z.choice!.title, /Immediate attack/);
  // Labyrinthine Woods: Creature enemies +1 [threat] and +1 [attack] while it
  // is in the staging area; its shadow: the enemy engages the next player
  // and makes an additional attack.
  const q = board("defense");
  const bats = make(q, RHOS.bats);
  q.engaged.push(bats);
  const [atk, thr] = [stats(q, bats).attack, threatOf(q, bats)];
  q.staging.push(make(q, G.labyrinth), make(q, G.labyrinth));
  assert.deepEqual(
    [stats(q, bats).attack, threatOf(q, bats)],
    [atk + 2, thr + 2],
  );
  assert.equal(stats(q, make(q, ORCS)).attack, card(ORCS).attack);
  const r = calm(opening(nightmareForTwo("journey-to-rhosgobel")), "defense");
  for (const p of [0, 1]) forOwner(r, p, () => (r.engaged = []));
  const wolf = make(r, ORCS);
  forOwner(r, 0, () => r.engaged.push(wolf));
  shadow(r, wolf, G.labyrinth, undefined, 0);
  const after = attacked(r, wolf, 0);
  assert.ok(seatView(after, 1).engaged.some((e) => e.id === wolf.id));
  assert.match(after.choice!.title, /Immediate attack/);
  // Pitch-dark Thicket (active): every character loses the ranged keyword,
  // so a ranged character cannot attack another player's enemy, nor fight
  // Black Forest Bats unless an Eagle; its shadow: no ranged character can
  // attack the attacking enemy until the end of the phase.
  const m = calm(opening(nightmareForTwo("journey-to-rhosgobel")), "attack");
  for (const p of [0, 1]) forOwner(m, p, () => (m.engaged = []));
  m.staging = [];
  m.activeLocation = null;
  const legolas = seatView(m, 1).heroes.find((h) => h.code === LEGOLAS)!;
  const foe = make(m, ORCS);
  forOwner(m, 0, () => m.engaged.push(foe));
  const can = (id: string) => {
    let ok = false;
    forOwner(m, 0, () => {
      ok = attackersFor(m, foe).some((u) => u.id === id);
    });
    return ok;
  };
  assert.ok(can(legolas.id));
  m.activeLocation = make(m, G.thicket);
  assert.ok(losesRanged(m, legolas));
  assert.ok(!can(legolas.id));
  const flock = make(m, RHOS.flock);
  const winged = make(m, WINGED_GUARDIAN);
  assert.equal(hooks(m).cannotDefend!(m, flock, legolas), true);
  assert.equal(hooks(m).cannotDefend!(m, flock, winged), false);
  assert.equal(hooks(m).cannotAttack!(m, legolas, flock), true);
  m.activeLocation = null;
  assert.equal(hooks(m).cannotDefend!(m, flock, legolas), false);
  m.phase = "defense";
  m.combat = {
    enemyId: foe.id,
    defenderIds: [],
    attackBonus: 0,
    attackPlayer: 0,
  } as never;
  foe.shadows = [G.thicket];
  hooks(m).shadow!(m, G.thicket);
  m.combat = null;
  m.phase = "attack";
  assert.equal(hooks(m).cannotAttack!(m, legolas, foe), true);
  assert.ok(!can(legolas.id));
  m.round++;
  assert.equal(hooks(m).cannotAttack!(m, legolas, foe), false);
  assert.ok(valid(m));
});

test("Nightmare: seeded A Journey to Rhosgobel games finish with valid saves", () => {
  for (const seed of [1, 2]) {
    const s = autoplay(rhos(seed));
    assert.notEqual(s.status, "playing", `journey-to-rhosgobel seed ${seed}`);
  }
  const t = autoplay(nightmareForTwo("journey-to-rhosgobel", 7), 4000);
  assert.notEqual(t.status, "playing", "two-player journey-to-rhosgobel");
});
