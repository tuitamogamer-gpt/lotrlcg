import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { STARTERS, card } from "../src/game/cards";
import {
  createGame,
  validateSave,
  restoreSave,
  retryAdventure,
  continueCampaign,
  newCampaign,
  questWill,
} from "../src/game/engine";
import { allHeroes, seatView, selectSeat, syncSeat } from "../src/game/table";
import type { GameState, SeatConfig } from "../src/game/types";

const seats: SeatConfig[] = STARTERS.map((d) => ({
  heroes: [...d.heroes],
  deckId: d.id,
}));
function create(n = 3, campaign = false) {
  const d = STARTERS[0];
  return createGame(40, d.cards, d.heroes, d.id, {
    seats: seats.slice(0, n),
    playMode: campaign ? "campaign" : "normal",
  });
}
function settle(s: GameState) {
  let steps = 0;
  while (s.choice) {
    assert.ok(steps++ < 100);
    s = act(s, {
      type: "CHOOSE",
      id: (
        s.choice.options.find((o) => o.id === "skip") ??
        s.choice.options.find((o) => o.id === "resolve") ??
        s.choice.options[0]
      ).id,
    });
  }
  return s;
}
function planning(s: GameState) {
  while (s.phase === "setup") s = settle(act(s, { type: "KEEP" }));
  return s;
}
for (const count of [1, 2, 3, 4]) {
  test(`${count} players start with complete three-hero starters and separate hands, threat and resources`, () => {
    let s = create(count);
    assert.equal(s.table!.seats.length, count);
    assert.equal(allHeroes(s).length, count * 3);
    for (let i = 0; i < count; i++) {
      const p = seatView(s, i),
        d = STARTERS[i];
      assert.deepEqual(p.startingHeroes, d.heroes);
      assert.deepEqual(
        p.heroes.map((h) => h.code),
        d.heroes,
      );
      assert.equal(
        p.threat,
        d.heroes.reduce((n, h) => n + card(h).threat!, 0),
      );
      assert.equal(p.hand.length, 6);
      const actual: Record<string, number> = {};
      for (const code of [...p.deck, ...p.hand.map((u) => u.code)])
        actual[code] = (actual[code] ?? 0) + 1;
      assert.deepEqual(actual, d.cards);
      assert.ok(p.heroes.every((h) => h.owner === i && h.resources === 0));
    }
    assert.ok(validateSave(s));
    assert.deepEqual(restoreSave(JSON.parse(JSON.stringify(s))), s);
    s = planning(s);
    for (let i = 0; i < count; i++) {
      const p = seatView(s, i);
      assert.equal(p.hand.length, 7);
      assert.equal(p.deck.length, 23);
      assert.ok(p.heroes.every((h) => h.resources === 1));
    }
    const retry = retryAdventure(s, 91);
    assert.equal(allHeroes(retry).length, count * 3);
    assert.deepEqual(
      retry.table!.seats.map((p) => p.startingHeroes),
      seats.slice(0, count).map((p) => p.heroes),
    );
    assert.ok(validateSave(retry));
  });
  test(`${count} players reveal ${count} encounters, regardless of their ${count * 3} heroes`, () => {
    let s = planning(create(count));
    s.encounterDeck = Array(30).fill("01099");
    for (let i = 0; i < count; i++) s = act(s, { type: "NEXT" });
    let expectedWill = 0;
    for (let i = 0; i < count; i++) {
      // Avoid optional hero responses; all three are still available to this player.
      const h = s.heroes.find((h) => !["01001", "01002"].includes(h.code))!;
      expectedWill += card(h.code).willpower!;
      s = act(s, { type: "TOGGLE_QUEST", id: h.id });
      s = settle(act(s, { type: "COMMIT" }));
    }
    assert.equal(s.phase, "staging");
    assert.equal(s.encounterDeck.length, 30 - count);
    assert.equal(questWill(s), expectedWill);
    assert.ok(validateSave(s));
  });
}

test("a three-hero player stays in play after losing one hero", () => {
  let s = planning(create(2));
  const fallen = s.heroes.pop()!;
  s.discard.push(fallen.code);
  syncSeat(s);
  s = act(s, { type: "NEXT" });
  assert.equal(s.table!.seats[0].eliminated, false);
  assert.equal(seatView(s, 0).heroes.length, 2);
});
test("full player groups survive campaign continuation, retry and a save round trip", () => {
  const s = create(3, true);
  s.status = "won";
  s.campaign!.completed = [{ scenarioId: "mirkwood", score: 80, rounds: 5 }];
  const heroes = seats.slice(0, 3).flatMap((p) => p.heroes);
  heroes[1] = "01012";
  const next = settle(continueCampaign(s, heroes, "leadership", true, 51));
  assert.equal(next.table!.seats.length, 3);
  assert.deepEqual(
    next.table!.seats.map((p) => p.startingHeroes),
    [heroes.slice(0, 3), heroes.slice(3, 6), heroes.slice(6, 9)],
  );
  assert.deepEqual(
    next.table!.seats.map((p) => p.deckId),
    seats.slice(0, 3).map((p) => p.deckId),
  );
  assert.equal(next.campaign!.threatPenalty, 1);
  assert.ok(validateSave(next));
  const retry = settle(
    retryAdventure(restoreSave(JSON.parse(JSON.stringify(next)))!, 52),
  );
  assert.deepEqual(
    retry.table!.seats.map((p) => p.startingHeroes),
    next.table!.seats.map((p) => p.startingHeroes),
  );
});
test("campaign permits at most one voluntary replacement per player, without counting reordered heroes", () => {
  const s = create(2, true);
  s.status = "won";
  s.campaign!.completed = [{ scenarioId: "mirkwood", score: 80, rounds: 5 }];
  const heroes = seats.slice(0, 2).flatMap((p) => p.heroes);
  [heroes[0], heroes[1]] = [heroes[1], heroes[0]];
  const reordered = settle(continueCampaign(s, heroes, "leadership", true, 51));
  assert.equal(reordered.campaign!.threatPenalty, 0);
  heroes[0] = "01010";
  heroes[1] = "01011";
  assert.throws(() => continueCampaign(s, heroes), /one other hero/);
  s.campaign!.fallen.push("01002");
  const replaced = settle(continueCampaign(s, heroes, "leadership", true, 51));
  assert.equal(replaced.campaign!.threatPenalty, 2);
});
test("Dol Guldur captures one hero from a three-hero player, leaving two available", () => {
  const d = STARTERS[0];
  const c = newCampaign(seats.slice(0, 2).flatMap((p) => p.heroes));
  c.completed = [
    { scenarioId: "mirkwood", score: 80, rounds: 5 },
    { scenarioId: "anduin", score: 90, rounds: 6 },
  ];
  c.prisoner = seats[1].heroes[1];
  let s = settle(
    createGame(90, d.cards, d.heroes, d.id, {
      seats: seats.slice(0, 2),
      scenarioId: "dol-guldur",
      playMode: "campaign",
      campaign: c,
    }),
  );
  assert.equal(s.prisoner?.owner, 1);
  assert.equal(seatView(s, 1).heroes.length, 2);
  assert.equal(seatView(s, 0).heroes.length, 3);
  assert.equal(s.table!.seats[1].eliminated, false);
  s = planning(s);
  selectSeat(s, 1);
  assert.ok(s.heroes.every((h) => h.resources >= 1));
  syncSeat(s);
  assert.ok(validateSave(s));
});
test("duplicate heroes, oversized fellowships and more than four players are rejected", () => {
  const d = STARTERS[0];
  for (const config of [
    [seats[0], seats[0]],
    [{ heroes: [...seats[0].heroes, "01012"], deckId: d.id }],
    [...seats, seats[0]],
  ])
    assert.throws(() =>
      createGame(1, d.cards, d.heroes, d.id, { seats: config }),
    );
  const s = create(4);
  s.table!.seats[3].startingHeroes[1] = s.table!.seats[0].startingHeroes[1];
  assert.equal(restoreSave(s), null);
});
