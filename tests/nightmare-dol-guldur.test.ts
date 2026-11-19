import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards, STARTERS } from "../src/game/cards";
import { check, damage, progress } from "../src/game/board";
import { make, stagingThreat, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { createGame } from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import {
  NIGHTMARE,
  NIGHTMARE_CORE as N,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { automatedScenarioId } from "../src/game/support";
import { scenario } from "../src/game/scenarios";
import { forOwner, seatView } from "../src/game/table";
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

const NAZGUL = "01102",
  KING_SPIDER = "01074",
  CAVERN_GUARDIAN = "01103",
  NECROMANCERS_PASS = "01094",
  OBJECTIVES = ["01108", "01109", "01110"];
const dolGuldur = (seed = 5) => nightmareGame("dol-guldur", seed);
/** A Nightmare game of Escape from Dol Guldur for 2 to 4 players. */
function forPlayers(n: number, seed = 9) {
  const seats = STARTERS.slice(0, n).map((deck) => ({
    heroes: [...deck.heroes],
    deckId: deck.id,
  }));
  return createGame(
    seed,
    STARTERS[0].cards,
    STARTERS[0].heroes,
    STARTERS[0].id,
    { scenarioId: "dol-guldur", nightmare: true, seats },
  );
}
/** A quiet solo board in `phase` with no enemy engaged. */
const board = (phase: GameState["phase"], seed = 5) => {
  const s = calm(opening(dolGuldur(seed)), phase);
  s.engaged = [];
  return s;
};
const hooks = (s: GameState) => batch4Scenario(s);
/** Resolve a hook's returned effects. */
function run(s: GameState, effects: ReturnType<typeof flushable>) {
  s.queue.unshift(...effects);
  flush(s);
  return s;
}
const flushable = (s: GameState) => hooks(s).roundEnd!(s);

test("Nightmare: Escape from Dol Guldur's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.dolGuldurCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "Escape from Dol Guldur - Nightmare", true],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for the Escape from Dol Guldur scenario found in the LOTR LCG core set\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n2x Dol Guldur Orcs\n2x Enchanted Stream\n1x Great Forest Web\n3x Mountains of Mirkwood\n2x Caught in a Web\n1x The Necromancer's Reach\n1x Necromancer's Pass\n2x Under the Shadow\n2x Tower Gate\n1x Iron Shackles\n/,
  );
  assert.match(
    c.back_text!,
    /^You are playing Nightmare Mode\.\nForced: When stage 1B is revealed, the number of random heroes captured is determined by the number of players, as follows: 1-2 players = 1 hero captured, 3 players = 2 heroes captured, 4 players = 3 heroes captured\./,
  );
  assert.match(
    card(N.chamber).text!,
    /^If Torture Chamber has 4 or more resource tokens on it, all "prisoners" were killed, and the players have lost the game\.\nForced: At the end of each round, place 1 resource token on each Dol Guldur location in play\.$/,
  );
  assert.match(
    card(N.labyrinth).text!,
    /\+1 quest point for each resource token/,
  );
  assert.match(
    card(N.catacomb).shadow!,
    /\(Resolve this effect for each Dol Guldur location\.\)$/,
  );
  assert.match(card(N.sentinel).text!, /\(Cannot be canceled\.\)$/);
  const stat = (code: string) => {
    const x = card(code);
    return [x.engagement, x.threat, x.attack, x.defense, x.health];
  };
  assert.deepEqual(stat(N.captive), [13, 2, 1, 3, 1]);
  assert.deepEqual(stat(N.spider), [28, 3, 3, 3, 6]);
  assert.deepEqual(stat(N.master), [45, 5, 1, 2, 4]);
  assert.deepEqual(
    [N.labyrinth, N.chamber].map((x) => [card(x).threat, card(x).quest]),
    [
      [1, 4],
      [3, 6],
    ],
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Escape from Dol Guldur - Nightmare",
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
  assert.ok(art.some((a) => a.code === N.dolGuldurCard && a.face === "back"));
});

test("Nightmare: Escape from Dol Guldur's Nightmare encounter deck matches its source recipe, and the audit counts it", () => {
  const sets = scenario("dol-guldur").sets as readonly string[];
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  // (The Nazgûl of Dol Guldur is set aside in both.)
  const deck = nightmareEncounterDeck("dol-guldur", standard).filter(
    (c) => c !== NAZGUL,
  );
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
  const recipe = recipes.find((r) => r.id === "N01.3")!;
  const expected: Record<string, number> = {};
  for (const c of recipe.cards)
    if (
      ["sharedEncounterDeck", "sharedStagingArea"].includes(c.section) &&
      ![N.dolGuldurCard, NAZGUL].includes(c.code)
    )
      expected[c.code] = (expected[c.code] ?? 0) + c.quantity;
  assert.deepEqual(count(deck), expected);
  for (const [title, n] of Object.entries(NIGHTMARE["dol-guldur"]!.removals))
    assert.ok(card(N.dolGuldurCard).text!.includes(`${n}x ${title}`), title);
  assert.equal(
    automatedScenarioId({
      name: "Escape from Dol Guldur (Nightmare)",
      mode: "nightmare",
    }),
    "dol-guldur",
  );
});

test("Nightmare: Escape from Dol Guldur captures 1, 2 or 3 heroes of different players, and the rescue frees each of them", () => {
  const s = opening(dolGuldur());
  assert.equal(nightmareCardOf(s), N.dolGuldurCard);
  assert.ok(s.prisoner);
  assert.equal(s.nightmare?.prisoners, undefined);
  assert.match(nightmareStatus(s)[0], /1 random hero is captured/);
  assert.ok(valid(s));
  // Two players: still 1.
  const two = opening(nightmareForTwo("dol-guldur"));
  assert.ok(two.prisoner);
  assert.equal(two.nightmare?.prisoners, undefined);
  // Three and four players: 2 and 3 heroes, each of a different player.
  for (const [n, held] of [
    [3, 2],
    [4, 3],
  ] as const) {
    const t = opening(forPlayers(n));
    const prisoners = [t.prisoner!, ...(t.nightmare?.prisoners ?? [])];
    assert.equal(prisoners.length, held, `${n} players`);
    assert.equal(new Set(prisoners.map((h) => h.owner ?? 0)).size, held);
    for (const h of prisoners)
      assert.ok(!seatView(t, h.owner ?? 0).heroes.some((x) => x.id === h.id));
    assert.ok(valid(t));
    // Progress on stage 2 rescues each prisoner, with 1 damage, and the
    // Nazgûl enters the staging area once.
    const u = calm(t, "staging");
    u.stage = 2;
    progress(u, 1);
    flush(u);
    assert.equal(u.prisoner, null);
    assert.equal(u.nightmare?.prisoners, undefined);
    for (const h of prisoners) {
      const back = seatView(u, h.owner ?? 0).heroes.find((x) => x.id === h.id);
      assert.ok(back, `${h.code} returns`);
      assert.equal(back!.damage, 1);
    }
    assert.equal(u.staging.filter((x) => x.code === NAZGUL).length, 1);
    assert.ok(valid(u));
  }
  // A Nazgûl already engaged moves into the staging area instead.
  const v = calm(opening(dolGuldur()), "staging");
  const nazgul = make(v, NAZGUL);
  v.engaged.push(nazgul);
  v.stage = 2;
  progress(v, 1);
  flush(v);
  assert.ok(v.staging.some((x) => x.id === nazgul.id));
  assert.equal(
    [...v.staging, ...v.engaged].filter((x) => x.code === NAZGUL).length,
    1,
  );
});

test("Nightmare: Torture Chamber, Dungeon Labyrinth, Catacomb Inspection and Torture Master's resource tokens", () => {
  const s = board("staging");
  s.staging = s.staging.filter((u) => card(u.code).type_code !== "location");
  const chamber = make(s, N.chamber),
    labyrinth = make(s, N.labyrinth),
    pass = make(s, NECROMANCERS_PASS);
  s.staging.push(chamber, labyrinth, pass);
  // Dungeon Labyrinth: +1 [threat] and +1 quest point for each token.
  const [threat, quest] = [
    threatOf(s, labyrinth),
    hooks(s).locationQuestBonus!(s, labyrinth),
  ];
  // Catacomb Inspection (surge) and Torture Master add a token to each Dol
  // Guldur location in play.
  const deck = s.encounterDeck.length;
  let t = reveal(s, N.catacomb);
  assert.deepEqual(
    [chamber.resources, labyrinth.resources, pass.resources],
    [1, 1, 1],
  );
  assert.ok(t.encounterDeck.length < deck, "it surged");
  t = reveal(t, N.master);
  const [c, l, p] = [N.chamber, N.labyrinth, NECROMANCERS_PASS].map((code) =>
    t.staging.find((u) => u.code === code)!,
  );
  assert.deepEqual([c.resources, l.resources, p.resources], [2, 2, 2]);
  assert.equal(threatOf(t, l), threat + 2);
  assert.equal(hooks(t).locationQuestBonus!(t, l), quest + 2);
  // The end of the round: Torture Chamber adds a token to each Dol Guldur
  // location, Dungeon Labyrinth 1 for each player.
  run(t, flushable(t));
  assert.deepEqual([c.resources, l.resources, p.resources], [3, 4, 3]);
  // At 4 tokens on Torture Chamber, the players lose.
  c.resources = 4;
  check(t);
  assert.equal(t.status, "lost");
  assert.match(t.reason!, /all the prisoners were killed/);
  // Catacomb Inspection's shadow moves a resource from each of the
  // defending player's heroes to each Dol Guldur location in the staging
  // area.
  const u = board("defense");
  u.staging = u.staging.filter((x) => card(x.code).type_code !== "location");
  const target = make(u, NECROMANCERS_PASS);
  u.staging.push(target);
  for (const h of u.heroes) h.resources = 2;
  const enemy = make(u, KING_SPIDER);
  u.engaged.push(enemy);
  shadow(u, enemy, N.catacomb, u.heroes[0]);
  assert.equal(target.resources, u.heroes.length);
  assert.ok(u.heroes.every((h) => h.resources === 1));
});

test("Nightmare: Crazed Captive, Spider of Dol Guldur and Sentinel of Shadow", () => {
  // Crazed Captive: doomed 1; defeated, each player raises their threat by 7.
  const s = board("staging");
  const threat = s.threat;
  let t = reveal(s, N.captive);
  assert.equal(t.threat, threat + 1, "doomed 1");
  t = calm(t, "attack");
  const captive = t.staging.find((u) => u.code === N.captive)!;
  t.staging = t.staging.filter((u) => u.id !== captive.id);
  t.engaged.push(captive);
  const before = t.threat;
  damage(t, captive.id, 1, { combatDamage: true });
  check(t);
  flush(t);
  assert.equal(t.threat, before + 7);
  // Its shadow: an attacker not defeated by the end of the phase raises the
  // defending player's threat by 7.
  const u = board("defense");
  const enemy = make(u, KING_SPIDER);
  u.engaged.push(enemy);
  shadow(u, enemy, N.captive, u.heroes[0]);
  u.combat = null;
  const held = u.threat;
  hooks(u).combatEnd!(u);
  flush(u);
  assert.equal(u.threat, held + 7);
  // Spider of Dol Guldur: surge with an unclaimed objective in play; its
  // shadow gives +3 [attack] for each.
  const v = board("staging");
  const objectives = v.staging.filter((x) =>
    OBJECTIVES.includes(x.code),
  ).length;
  assert.ok(objectives > 0);
  assert.equal(hooks(v).revealedSurge!(v, N.spider), true);
  v.staging = v.staging.filter((x) => !OBJECTIVES.includes(x.code));
  assert.equal(hooks(v).revealedSurge!(v, N.spider), false);
  const w = board("defense");
  const attacker = make(w, KING_SPIDER);
  w.engaged.push(attacker);
  shadow(w, attacker, N.spider, w.heroes[0]);
  assert.equal(
    w.combat!.attackBonus,
    3 * w.staging.filter((x) => OBJECTIVES.includes(x.code)).length,
  );
  // Sentinel of Shadow (cannot be canceled): +2 [threat] per player this
  // phase; an unsuccessful quest puts the Nazgûl into play, engaged with the
  // first player.
  const x = board("staging");
  assert.equal(hooks(x).cannotCancel!(x, false, N.sentinel), true);
  const staged = stagingThreat(x);
  const y = reveal(x, N.sentinel);
  assert.equal(stagingThreat(y), staged + 2);
  hooks(y).failedQuest!(y, 3);
  flush(y);
  assert.ok(y.engaged.some((e) => e.code === NAZGUL));
  hooks(y).failedQuest!(y, 3);
  flush(y);
  assert.equal(
    [...y.staging, ...y.engaged].filter((e) => e.code === NAZGUL).length,
    1,
  );
  assert.ok(valid(y));
});

test("Nightmare: Dark Interrogation and Torture Master's prisoners", () => {
  // Dark Interrogation: discard down to 2 cards (or reveal a card with 2 or
  // fewer).
  const s = board("staging");
  assert.ok(s.hand.length > 2);
  const t = reveal(s, N.interrogation);
  assert.equal(t.hand.length, 2);
  const u = board("staging");
  u.hand = u.hand.slice(0, 2);
  const deck = u.encounterDeck.length;
  const v = reveal(u, N.interrogation);
  assert.ok(v.encounterDeck.length < deck, "a card was revealed");
  // Its shadow: each card in play with a copy in the discard pile is
  // discarded (each player's if the attack is undefended).
  const w = calm(opening(nightmareForTwo("dol-guldur")), "defense");
  for (const p of [0, 1]) forOwner(w, p, () => (w.engaged = []));
  const enemy = make(w, KING_SPIDER);
  w.engaged.push(enemy);
  const [mine, theirs] = [0, 1].map((p) => {
    const a = make(w, "01016");
    forOwner(w, p, () => {
      w.allies.push(a);
      w.discard.push("01016");
    });
    return a;
  });
  shadow(w, enemy, N.interrogation, w.heroes[0], 0);
  flush(w);
  assert.ok(!seatView(w, 0).allies.some((a) => a.id === mine.id));
  assert.ok(seatView(w, 1).allies.some((a) => a.id === theirs.id));
  shadow(w, enemy, N.interrogation, undefined, 0);
  flush(w);
  assert.ok(!seatView(w, 1).allies.some((a) => a.id === theirs.id));
  // Torture Master: a hero damaged but not defeated becomes a prisoner, and
  // stage 3 returns to stage 2B.
  const x = board("defense");
  const master = make(x, N.master);
  x.engaged.push(master);
  x.stage = 3;
  shadow(x, master, N.master);
  const hero = x.heroes[0];
  damage(x, hero.id, 1, { combatDamage: true, enemyId: master.id });
  const after = hooks(x).attackFinished!(x, x.combat!);
  x.combat = null;
  x.queue.unshift(...after);
  flush(x);
  assert.ok(!x.heroes.some((h) => h.id === hero.id));
  assert.ok(
    [x.prisoner, ...(x.nightmare?.prisoners ?? [])].some(
      (h) => h?.id === hero.id,
    ),
  );
  assert.equal(x.stage, 2);
  assert.ok(valid(x));
  // The rescue frees both prisoners.
  progress(x, 1);
  flush(x);
  assert.ok(x.heroes.some((h) => h.id === hero.id));
  assert.equal(x.prisoner, null);
  // (A hero the Cavern Guardian damages is not captured.)
  const y = board("defense");
  const guardian = make(y, CAVERN_GUARDIAN);
  y.engaged.push(guardian);
  shadow(y, guardian, N.spider, y.heroes[0]);
  assert.equal(hooks(y).attackFinished!(y, y.combat!).length, 0);
});

test("Nightmare: seeded Escape from Dol Guldur games finish with valid saves", () => {
  for (const seed of [1, 2]) {
    const s = autoplay(dolGuldur(seed));
    assert.notEqual(s.status, "playing", `dol-guldur seed ${seed}`);
  }
  const t = autoplay(forPlayers(3), 6000);
  assert.notEqual(t.status, "playing", "three-player dol-guldur");
});
