import test from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_DECKS, PRECON_DECKS } from "../src/game/built-in-decks";
import { card, STARTERS } from "../src/game/cards";
import { officialStarterDecks } from "../src/game/products";
import { describeDeck, deckProblems, deckSize } from "../src/game/decks";
import {
  createGame,
  continueCampaign,
  retryAdventure,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import {
  matchesSavedDeck,
  savedDeckId,
  setupSeats,
  expandSeats,
  recoverSavedDecks,
} from "../src/ui/setup-decks";
import { parseChoices } from "../src/account/choices";
import { SCENARIOS } from "../src/game/scenarios";

test("all six printed precons are built in with exact main lists and no sideboards", () => {
  assert.equal(BUILT_IN_DECKS.length, 10);
  assert.equal(PRECON_DECKS.length, officialStarterDecks.length);
  for (const recipe of officialStarterDecks) {
    const d = describeDeck(recipe.id, [])!;
    assert.ok(d && !d.custom);
    assert.deepEqual(d.heroes, recipe.heroes);
    assert.deepEqual(d.cards, recipe.cards);
    assert.equal(deckSize(d.cards), 50);
    assert.equal(d.productId, recipe.productId);
    assert.deepEqual(deckProblems(d), []);
  }
  assert.ok(STARTERS.every((d) => deckSize(d.cards) === 30));
});

for (const d of PRECON_DECKS) {
  test(`${d.name}: fresh-device setup, save, retry and campaign continuation retain the complete fellowship`, () => {
    const seats = setupSeats([{ deckId: d.id }], []);
    assert.deepEqual(seats, [{ deckId: d.id, heroes: d.heroes }]);
    for (const hotseat of [false, true]) {
      const s = createGame(831, d.cards, d.heroes, d.id, {
        playMode: "campaign",
        ...(hotseat ? { seats } : {}),
      });
      assert.equal(s.deckId, d.id);
      assert.deepEqual(s.startingHeroes, d.heroes);
      assert.equal(s.hand.length + s.deck.length, 50);
      assert.ok(validateSave(s));
      assert.deepEqual(restoreSave(JSON.parse(JSON.stringify(s))), s);
      assert.ok(matchesSavedDeck(s, d.id, []));
      assert.equal(savedDeckId(s, []), d.id);
      assert.deepEqual(recoverSavedDecks(s, []), []);
      const retry = retryAdventure({ ...s, status: "lost" }, 832);
      assert.equal(retry.deckId, d.id);
      assert.equal(retry.hand.length + retry.deck.length, 50);
      assert.ok(validateSave(retry));
      s.status = "won";
      s.campaign!.completed = [
        { scenarioId: "mirkwood", rounds: 4, score: 80 },
      ];
      const next = continueCampaign(s, undefined, undefined, false, 833);
      assert.equal(next.scenarioId, "anduin");
      assert.equal(next.deckId, d.id);
      assert.deepEqual(next.startingHeroes, d.heroes);
      assert.equal(next.deck.length + next.hand.length, 50);
      assert.ok(validateSave(next));
    }
  });
}

test("hot-seat blocks different printings of the same unique hero and adds legal precons", () => {
  const collector = PRECON_DECKS.find((d) => d.id === "starter-gondor")!;
  assert.ok(collector.heroes.some((h) => card(h).name === "Boromir"));
  const tactics = {
    id: "boromir",
    name: "Tactics Boromir",
    heroes: ["02095"],
    cards: collector.cards,
    updatedAt: 1,
  };
  assert.equal(card(tactics.heroes[0]).name, "Boromir");
  assert.ok(!collector.heroes.includes(tactics.heroes[0]));
  const seats = setupSeats(
    [{ deckId: collector.id }, { deckId: "custom:boromir" }],
    [tactics],
  );
  assert.notEqual(seats[1].deckId, "custom:boromir");
  const four = expandSeats(seats, 4, [])!;
  assert.equal(four.length, 4);
  const names = four.flatMap((p) => p.heroes.map((h) => card(h).name));
  assert.equal(names.length, new Set(names).size);
  const s = createGame(834, collector.cards, collector.heroes, collector.id, {
    seats: four,
  });
  assert.ok(validateSave(s));
});

test("device and account choices accept every built-in deck and supported scenario", () => {
  for (const deck of BUILT_IN_DECKS)
    for (const scenario of SCENARIOS) {
      const choices = {
        version: 1,
        setupMode: "classic",
        selectedDeck: deck.id,
        seatDecks: [deck.id],
        playMode: "normal",
        scenario: scenario.id,
      };
      assert.deepEqual(parseChoices(choices), choices);
      assert.equal(
        parseChoices({ ...choices, selectedDeck: "starter-unknown" }),
        null,
      );
      assert.equal(parseChoices({ ...choices, scenario: "unknown" }), null);
    }
});
