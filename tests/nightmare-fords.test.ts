import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage, revealed } from "../src/game/board";
import { engagementCost, fx, make, stats, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { FORDS } from "../src/game/fords-isen-support";
import { scenario } from "../src/game/scenarios";
import { automatedScenarioId } from "../src/game/support";
import {
  NIGHTMARE,
  NIGHTMARE_VOI as N,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { forOwner, seatIndices } from "../src/game/table";
import type { GameState } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  calm,
  nightmareForTwo,
  nightmareGame,
  opening,
  shadow,
  valid,
} from "./nightmare-fixtures";

/** Fords of Isen: a location with no effect while in the staging area but card-effect resources. */
const QUIET = FORDS.road;
const FILLER = "01022"; // a player card for the hands
const ID = "fords-of-isen";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
/** A quiet board with empty hands: only Gríma's escort in the staging area. */
function board(phase: GameState["phase"], s: GameState = opening(game())) {
  calm(s, phase);
  Object.assign(s, {
    activeLocation: null,
    extraActiveLocations: [],
    encounterDeck: Array(12).fill(QUIET),
    encounterDiscard: [],
    combat: null,
    suspendedCombats: [],
    staging: s.staging.filter((u) =>
      [FORDS.islet, FORDS.grima].includes(u.code),
    ),
    progress: 0,
    nightmare: {},
  });
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      Object.assign(s, { threat: 20, engaged: [], hand: [] });
      for (const h of s.heroes)
        Object.assign(h, { damage: 0, exhausted: false, committed: false });
    });
  return s;
}
const hooks = (s: GameState) => batch4Scenario(s);
const add = (s: GameState, code: string, engaged = false) => {
  const u = make(s, code);
  (engaged ? s.engaged : s.staging).push(u);
  return u;
};
const hand = (s: GameState, n: number, p = 0) =>
  forOwner(s, p, () => {
    s.hand = Array.from({ length: n }, () => make(s, FILLER));
  });
function run(s: GameState, effects: GameState["queue"] = []) {
  s.queue.unshift(...effects);
  for (let i = 0; i < 40; i++) {
    flush(s);
    if (!s.flow?.pending) break;
    s.flow.pending = null;
  }
  return s;
}
const handSizes = (s: GameState) =>
  seatIndices(s).map((p) => {
    let n = 0;
    forOwner(s, p, () => (n = s.hand.length));
    return n;
  });

test("Nightmare: The Fords of Isen's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.fordsCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "The Fords of Isen - Nightmare", true],
  );
  assert.match(
    c.text!,
    /3x Dunland Prowler\n2x Dunlending Bandit\n1x Dunland Berserker\n2x Gap of Rohan\n2x The King's Road\n/,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nForced: After the players advance to a new quest stage, each player with fewer than 3 cards in his hand draws 3 cards.",
  );
  // DragnCards keeps the rules side as the front: the removal list is the .B face.
  assert.match(c.imagesrc!, /d985a0cd-4c06-4e2e-b05a-ad0ac9ac86be\.B\.jpg$/);
  assert.match(c.back_imagesrc!, /d985a0cd-4c06-4e2e-b05a-ad0ac9ac86be\.jpg$/);
  assert.match(
    card(N.vengeful).text!,
    /remove 1 progress from the current quest/,
  );
  assert.equal(
    card(N.vengeful).shadow,
    "Shadow: Attacking enemy gets +2 [attack].",
  );
  assert.match(card(N.savage).text!, /gets \+2 \[attack\]\.$/);
  assert.match(card(N.eastern).text!, /more than 1 event each round/);
  assert.match(card(N.western).text!, /-X engagement cost/);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Fords of Isen - Nightmare",
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

test("Nightmare: The Fords of Isen's Nightmare deck matches its source recipe, and new stages refill short hands", () => {
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
  const nightmare = recipes
    .find((r) => r.id === "N04.1")!
    .cards.filter((c) => c.section === "sharedEncounterDeck")
    .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const sets = scenario(ID).sets;
  const standard = encounterCards
    .filter((c) => sets.includes(c.encounter_set ?? ""))
    .flatMap((c) => Array<string>(c.quantity ?? 1).fill(c.code));
  assert.deepEqual(
    count(
      nightmareEncounterDeck(ID, standard).filter(
        (c) => c !== FORDS.grima && c !== FORDS.islet,
      ),
    ),
    count(nightmare),
  );
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.fordsCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [game(), two()])
    assert.equal(nightmareCardOf(s), N.fordsCard);
  assert.equal(
    automatedScenarioId({
      name: "The Fords of Isen (Nightmare)",
      mode: "nightmare",
    }),
    ID,
  );
  assert.match(
    nightmareStatus(game())[0],
    /fewer than 3 cards in hand draws 3/,
  );
  // A new stage: a player with 2 cards draws 3, a player with 3 does not.
  const s = board("quest", opening(two()));
  hand(s, 2, 0);
  hand(s, 3, 1);
  hooks(s).stageRevealed!(s, 2);
  run(s);
  assert.deepEqual(handSizes(s), [5, 3]);
  assert.ok(valid(opening(game())));
});

test("Nightmare: Dunland Assassin shies from full hands and strikes the first player as they draw", () => {
  const s = board("planning");
  const assassin = add(s, N.assassin);
  hand(s, 2);
  assert.equal(hooks(s).cannotOptionallyEngage!(s, assassin), false);
  hand(s, 3);
  assert.equal(hooks(s).cannotOptionallyEngage!(s, assassin), true);
  hooks(s).cardsDrawn!(s, 0, 1, true);
  run(s);
  assert.equal(s.combat?.enemyId, assassin.id, "an immediate attack");
});

test("Nightmare: Savage Hillman cannot take damage against a hand of 3 and hits harder against 5; Vengeful Hillman takes progress for each card", () => {
  const s = board("attack");
  const savage = add(s, N.savage, true);
  hand(s, 2);
  damage(s, savage.id, 1);
  assert.equal(savage.damage, 1);
  hand(s, 3);
  damage(s, savage.id, 1);
  assert.equal(savage.damage, 1, "no damage with 3 cards in hand");
  const base = stats(s, savage).attack;
  hand(s, 5);
  assert.equal(stats(s, savage).attack, base + 2);
  // Vengeful Hillman: 1 progress for each card in the defending player's hand, once.
  const t = board("attack");
  t.progress = 6;
  hand(t, 4);
  const vengeful = add(t, N.vengeful, true);
  t.combat = {
    enemyId: vengeful.id,
    defenderIds: [],
    attackBonus: 0,
    attackPlayer: 0,
  } as never;
  const ctx = { combatDamage: true, enemyId: vengeful.id };
  hooks(t).characterDestroyed!(t, t.heroes[0], ctx);
  hooks(t).characterDestroyed!(t, t.heroes[1], ctx);
  run(t);
  assert.equal(t.progress, 2);
  const u = board("attack");
  shadow(u, add(u, N.savage, true), N.vengeful);
  assert.equal(u.combat!.attackBonus, 2);
});

test("Nightmare: Western Shore grows with the first player's hand and lures enemies; its shadow leaves a full hand undefended", () => {
  const s = board("planning");
  const shore = add(s, N.western);
  const enemy = add(s, N.savage);
  const engagement = card(N.savage).engagement!;
  hand(s, 4);
  assert.equal(threatOf(s, shore), 4);
  assert.equal(engagementCost(s, enemy), engagement - 4);
  const t = board("attack");
  hand(t, 5);
  shadow(t, add(t, N.savage, true), N.western, t.heroes[0]);
  assert.deepEqual(t.combat!.defenderIds, []);
  assert.equal(t.combat!.defenderId, null);
});

test("Nightmare: Eastern Shore allows 1 event a round, and its shadow costs time when a character falls", () => {
  const s = board("planning");
  add(s, N.eastern);
  const event = "01020"; // Ever Vigilant: an event
  assert.equal(hooks(s).playProblem!(s, event), null);
  hooks(s).eventPlayed!(s, make(s, event));
  assert.match(hooks(s).playProblem!(s, event) ?? "", /more than 1 event/);
  s.round += 1;
  assert.equal(hooks(s).playProblem!(s, event), null);
  const t = board("attack");
  shadow(t, add(t, N.savage, true), N.eastern);
  assert.equal(t.combat!.attackBonus, 1);
  assert.equal(t.combat!.fordsTimeOnKill, 1);
});

test("Nightmare: Isen River locks the hands while staged and deals a card to each player as it becomes active", () => {
  const s = board("planning", opening(two()));
  const river = add(s, N.isenRiver);
  assert.equal(hooks(s).cannotDiscardHand!(s, s.heroes[0], true), true);
  s.staging = s.staging.filter((u) => u.id !== river.id);
  assert.equal(hooks(s).cannotDiscardHand!(s, s.heroes[0], true), false);
  s.activeLocation = river;
  forOwner(s, 0, () => (s.deck = Array(5).fill(FILLER)));
  forOwner(s, 1, () => (s.deck = Array(5).fill(FILLER)));
  hooks(s).travelEntered!(s, river, true);
  run(s);
  assert.deepEqual(handSizes(s), [1, 1]);
});

test("Nightmare: Brutal Assault assigns each player's hand size in damage, and so does its shadow", () => {
  const s = board("staging");
  hand(s, 2);
  revealed(s, N.brutal);
  run(s);
  assert.match(s.choice!.title, /Brutal Assault · Assign 2 damage/);
  assert.ok(s.encounterDiscard.includes(N.brutal));
  // An empty hand: nothing to assign.
  const t = board("staging");
  revealed(t, N.brutal);
  run(t);
  assert.equal(t.choice, null);
  const u = board("attack");
  hand(u, 1);
  shadow(u, add(u, N.savage, true), N.brutal);
  run(u);
  assert.match(u.choice!.title, /Assign 1 damage/);
});

test("Nightmare: The Fords of Isen's Nightmare state survives saves, and seeded games finish with valid saves", () => {
  const s = board("planning");
  s.nightmare = { fordsEvents: { round: 1, players: [0] } };
  assert.ok(valid(s));
  s.nightmare = { fordsEvents: { round: 1, players: [4] } };
  assert.equal(valid(s), false);
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
});
