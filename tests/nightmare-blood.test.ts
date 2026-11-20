import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage, engage } from "../src/game/board";
import { fx, make, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { BLOOD_GONDOR as B } from "../src/game/blood-gondor-support";
import { bloodTakeHidden } from "../src/game/blood-gondor";
import { heirsArcheryTotal } from "../src/game/heirs-numenor";
import {
  NIGHTMARE,
  NIGHTMARE_AS as N,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { forOwner, seatIndices } from "../src/game/table";
import { scenario } from "../src/game/scenarios";
import type { GameState } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  calm,
  nightmareForTwo,
  nightmareGame,
  opening,
  pick,
  reveal,
  shadow,
  valid,
} from "./nightmare-fixtures";

/** Southern Road: a location with no "When Revealed" effect and no shadow. */
const QUIET = B.southern;
const game = (seed = 5) => nightmareGame("the-blood-of-gondor", seed);
const two = (seed = 5) => nightmareForTwo("the-blood-of-gondor", seed);
/** A quiet board: no hidden card, a quiet encounter deck, The Cross-roads and the Nightmare Black Númenorean staged. */
function board(phase: GameState["phase"], s: GameState = opening(game())) {
  calm(s, phase);
  const keep = s.staging.filter(
    (u) => u.code === B.crossroads || u.code === N.numenorean,
  );
  Object.assign(s, {
    activeLocation: null,
    extraActiveLocations: [],
    encounterDeck: Array(10).fill(QUIET),
    encounterDiscard: [],
    combat: null,
    suspendedCombats: [],
    staging: keep,
    nightmare: {},
    victoryCards: [],
  });
  s.bloodGondor!.hidden = {};
  s.bloodGondor!.turning = [];
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
const run = (s: GameState, effects: GameState["queue"]) => {
  s.queue.unshift(...effects);
  flush(s);
  return s;
};
/** Hidden cards of these codes for a player (the top of the encounter deck). */
const hide = (s: GameState, player: number, ...codes: string[]) => {
  s.encounterDeck = [...codes, ...s.encounterDeck];
  bloodTakeHidden(s, player, codes.length);
};
const hiddenOf = (s: GameState, p = 0) => s.bloodGondor!.hidden[p] ?? [];
const numenorean = (s: GameState) =>
  s.staging.find((u) => u.code === N.numenorean)!;

test("Nightmare: The Blood of Gondor's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.bloodCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "The Blood of Gondor - Nightmare", true],
  );
  assert.match(
    c.text!,
    /1x Black Númenorean\n2x Evil Crow\n2x Lying in Wait\n4x The Dark Woods\n1x Orc Rabble\n1x Orc Arsonist\n1x Scourge of Mordor\n/,
  );
  assert.match(
    c.back_text!,
    /^You are playing Nightmare mode\.\nSetup: Each player takes 1 hidden card\.\nThe players cannot win the game unless The Crossroads and Black Númenorean are in the victory display\.$/,
  );
  const n = card(N.numenorean);
  assert.deepEqual(
    [n.name, n.defense, n.health, n.victory, n.printed_stats?.threat],
    ["Black Númenorean", 4, 9, 3, "X"],
  );
  assert.match(n.text!, /Forced: When Black Númenorean engages you/);
  assert.match(card(N.trickster).text!, /^Forced: After Orc Trickster/);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Blood of Gondor - Nightmare",
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

test("Nightmare: The Blood of Gondor's Nightmare deck matches its source recipe, with its Black Númenorean staged and a hidden card for each player", () => {
  const sets = scenario("the-blood-of-gondor").sets as readonly string[];
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  const deck = nightmareEncounterDeck("the-blood-of-gondor", standard);
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
  const recipe = recipes.find((r) => r.id === "N03.8")!;
  const want: Record<string, number> = {};
  for (const c of recipe.cards)
    if (c.code !== N.bloodCard && c.section !== "sharedQuestDeck")
      want[c.code] = (want[c.code] ?? 0) + c.quantity;
  assert.deepEqual(count(deck), want);
  for (const [title, n] of Object.entries(
    NIGHTMARE["the-blood-of-gondor"]!.removals,
  ))
    assert.ok(card(N.bloodCard).text!.includes(`${n}x ${title}`), title);
  for (const [s, players] of [
    [game(), 1],
    [two(), 2],
  ] as const) {
    assert.equal(nightmareCardOf(s), N.bloodCard);
    assert.ok(s.staging.some((u) => u.code === N.numenorean));
    assert.ok(!s.staging.some((u) => u.code === B.numenorean));
    for (let p = 0; p < players; p++) assert.equal(hiddenOf(s, p).length, 1);
    assert.match(nightmareStatus(s)[0], /cannot win unless The Cross-roads/);
  }
  assert.ok(valid(opening(game())));
});

test("Nightmare: Black Númenorean counts every hidden card, turns its engaged player's, raises threat each round, and the game needs it and The Cross-roads in the victory display", () => {
  let s = board("planning");
  hide(s, 0, QUIET, QUIET);
  const bn = numenorean(s);
  assert.equal(threatOf(s, bn), 2);
  run(s, hooks(s).roundEnd!(s));
  assert.equal(s.threat, 22);
  engage(s, bn);
  flush(s);
  assert.equal(hiddenOf(s).length, 0);
  // The victory condition.
  s = board("planning");
  assert.equal(hooks(s).cannotWin!(s), true);
  s.victoryCards = [B.crossroads];
  assert.equal(hooks(s).cannotWin!(s), true);
  s.victoryCards = [B.crossroads, N.numenorean];
  assert.equal(hooks(s).cannotWin!(s), false);
});

test("Nightmare: Orc Trickster attacks as it is turned faceup and hides again when it would be damaged; Uruk Marksman shoots and returns", () => {
  const s = board("planning");
  hide(s, 0, N.trickster);
  run(s, [fx("bloodTurnAll", { player: 0 })]);
  const trickster = s.engaged.find((u) => u.code === N.trickster)!;
  assert.ok(trickster);
  assert.equal(s.combat?.enemyId, trickster.id, "its immediate attack");
  // Damage: a random player takes it facedown.
  const t = board("attack");
  const orc = add(t, N.trickster, true);
  // Forest Snare goes to its owner's discard pile.
  orc.attachments.push({
    id: "snare",
    code: "01069",
    exhausted: false,
    owner: 0,
  });
  damage(t, orc.id, 3);
  assert.ok(!t.engaged.some((u) => u.id === orc.id));
  assert.ok(hiddenOf(t).some((u) => u.code === N.trickster));
  assert.ok(t.discard.includes("01069"));
  assert.ok(valid(t));
  // Uruk Marksman: 3 damage to a character, then back to the staging area.
  let u = board("planning");
  hide(u, 0, N.marksman);
  run(u, [fx("bloodTurnAll", { player: 0 })]);
  u = pick(u, u.choice!.options[0].id);
  assert.ok(u.staging.some((x) => x.code === N.marksman));
  assert.ok(!u.engaged.some((x) => x.code === N.marksman));
  assert.equal(
    [...u.heroes, ...u.allies].reduce((n, c) => n + c.damage, 0),
    3,
  );
});

test("Nightmare: Edge of Ithilien's archery follows the most hidden cards and its shadow's treachery adds an attack; Mountains of Shadow takes a card after each turning", () => {
  const s = board("planning");
  add(s, N.edge);
  const base = heirsArcheryTotal(s);
  hide(s, 0, QUIET, QUIET, QUIET);
  assert.equal(heirsArcheryTotal(s), base + 3);
  // Uruk Marksman: archery 3, in the staging area or engaged.
  add(s, N.marksman, true);
  assert.equal(heirsArcheryTotal(s), base + 6);
  // Its shadow: a turned treachery gives the attacker another attack.
  const t = board("defense");
  const foe = add(t, B.ambusher, true);
  hide(t, 0, N.surrounded);
  shadow(t, foe, N.edge, t.heroes[0]);
  flush(t);
  assert.equal(hiddenOf(t).length, 0);
  assert.deepEqual(
    hooks(t).attackFinished!(t, t.combat!).map((e) => [e.kind, e.target]),
    [["immediateAttack", foe.id]],
  );
  // Mountains of Shadow, active: one hidden card after a turning of several.
  const u = board("planning");
  u.activeLocation = make(u, N.mountains);
  hide(u, 0, QUIET, QUIET);
  u.encounterDeck = [QUIET, QUIET, QUIET];
  run(u, [fx("bloodTurnAll", { player: 0 })]);
  assert.equal(hiddenOf(u).length, 1);
  // Its shadow: 2 hidden cards, or an undefended attack.
  let v = board("defense");
  const orc = add(v, B.ambusher, true);
  shadow(v, orc, N.mountains, v.heroes[0]);
  v = pick(v, "take");
  assert.equal(hiddenOf(v).length, 2);
  let w = board("defense");
  const orc2 = add(w, B.ambusher, true);
  shadow(w, orc2, N.mountains, w.heroes[0]);
  w = pick(w, "undefended");
  assert.deepEqual(w.combat!.defenderIds, []);
});

test("Nightmare: Surrounded by Shadow trades hidden cards for questing heroes, and Sudden Onslaught turns each player's hidden cards and replaces them", () => {
  let s = board("quest");
  s.heroes[0].committed = true;
  s.heroes[1].committed = true;
  s.committedIds = [s.heroes[0].id, s.heroes[1].id];
  const threat = s.threat;
  s = reveal(
    s,
    N.surrounded,
    (x) => x.choice!.options.find((o) => o.id === "take")?.id,
  );
  assert.equal(s.threat, threat + 2, "Doomed 2");
  assert.equal(hiddenOf(s).length, 2);
  // Or remove a hero for each hidden card.
  let t = board("quest");
  hide(t, 0, QUIET);
  t.heroes[0].committed = true;
  t.heroes[1].committed = true;
  t.committedIds = [t.heroes[0].id, t.heroes[1].id];
  t = reveal(
    t,
    N.surrounded,
    (x) =>
      x.choice!.options.find((o) => o.id === "remove")?.id ??
      x.choice!.options[0].id,
  );
  assert.equal(t.heroes.filter((h) => h.committed).length, 1);
  // Sudden Onslaught: turn, then take as many.
  let u = board("staging");
  hide(u, 0, QUIET, QUIET);
  u = reveal(u, N.onslaught);
  assert.equal(hiddenOf(u).length, 2);
  assert.ok(u.encounterDiscard.filter((c) => c === QUIET).length >= 2);
  // Its shadow: take 1, then turn 1.
  const v = board("defense");
  const orc = add(v, B.ambusher, true);
  shadow(v, orc, N.onslaught, v.heroes[0]);
  flush(v);
  assert.equal(hiddenOf(v).length, 0);
  assert.ok(v.encounterDiscard.includes(QUIET));
});

test("Nightmare: The Blood of Gondor's Nightmare state survives saves, and seeded games finish with valid saves", () => {
  const s = board("planning");
  s.nightmare = { edgeAttacks: [{ enemyId: "c1", player: 0 }] };
  assert.ok(valid(s));
  s.nightmare = { edgeAttacks: [{ enemyId: "c1", player: -1 }] };
  assert.equal(valid(s), false);
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `the-blood-of-gondor seed ${seed}`);
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", "two-player the-blood-of-gondor");
});
