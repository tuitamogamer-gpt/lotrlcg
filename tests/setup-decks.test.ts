import test from "node:test";
import assert from "node:assert/strict";
import { STARTERS } from "../src/game/cards";
import { createGame } from "../src/game/engine";
import { customId } from "../src/game/decks";
import type { CustomDeck } from "../src/game/decks";
import {
  expandSeats,
  matchesSavedDeck,
  recoverSavedDecks,
  savedDeckId,
  savedSeats,
  setupSeats,
} from "../src/ui/setup-decks";

const lead = STARTERS[0];
const cards = Object.fromEntries(
  STARTERS.slice(0, 2)
    .flatMap((d) => Object.keys(d.cards))
    .slice(0, 17)
    .map((code) => [code, 3]),
);
const deck: CustomDeck = {
  id: "custom-one",
  name: "First company",
  cards,
  heroes: [...lead.heroes],
  updatedAt: 1,
};

test("custom resume matches original cards and heroes rather than any custom deck", () => {
  const s = createGame(7, cards, deck.heroes, "custom");
  assert.ok(matchesSavedDeck(s, customId(deck), [deck]));
  assert.equal(matchesSavedDeck(s, "leadership", [deck]), false);
  const edited = { ...deck, cards: { ...cards, "01013": 2 } };
  assert.equal(matchesSavedDeck(s, customId(edited), [edited]), false);
  const other = { ...deck, id: "other", heroes: ["01007"] };
  assert.equal(matchesSavedDeck(s, customId(other), [other]), false);
});

test("an imported custom save recovers its list once and restores its hot-seat choices", () => {
  const s = createGame(8, lead.cards, lead.heroes, lead.id, {
    seats: [
      { deckId: "custom", cards, heroes: deck.heroes },
      { deckId: STARTERS[1].id, heroes: [...STARTERS[1].heroes] },
    ],
  });
  const recovered = recoverSavedDecks(s, []);
  assert.equal(recovered.length, 1);
  const restored = savedSeats(s, recovered);
  assert.equal(restored[0].deckId, customId(recovered[0]));
  assert.deepEqual(restored[0].heroes, deck.heroes);
  assert.deepEqual(restored[1].heroes, STARTERS[1].heroes);
  assert.deepEqual(recoverSavedDecks(s, recovered), recovered);
});

test("editing a deck preserves the playable save snapshot as a separate recovered deck", () => {
  const s = createGame(9, cards, deck.heroes, "custom");
  const edited = { ...deck, cards: { ...cards, "01013": 2 } };
  const recovered = recoverSavedDecks(s, [edited]);
  assert.equal(recovered.length, 2);
  assert.notEqual(savedDeckId(s, recovered), customId(edited));
  assert.deepEqual(recovered[0].cards, cards);
});

test("device choices keep available custom decks and replace a missing reference safely", () => {
  assert.equal(
    setupSeats([{ deckId: customId(deck) }], [deck])[0].deckId,
    customId(deck),
  );
  assert.equal(
    setupSeats([{ deckId: "custom:missing" }], [deck])[0].deckId,
    lead.id,
  );
});

test("legacy starter saves with fewer heroes still offer their existing adventure", () => {
  const s = createGame(10, lead.cards, lead.heroes, lead.id, {
    seats: [{ deckId: lead.id, heroes: [lead.heroes[0]] }],
  });
  assert.ok(matchesSavedDeck(s.table!.seats[0], lead.id, []));
});

test("missing hot-seat decks are replaced without duplicating a custom hero", () => {
  const one = { ...deck, heroes: ["01001"] };
  const seats = setupSeats(
    [{ deckId: customId(one) }, { deckId: "custom:missing" }],
    [one],
  );
  assert.equal(seats.length, 2);
  const heroes = seats.flatMap((p) => p.heroes);
  assert.equal(new Set(heroes).size, heroes.length);
});

test("adding hot-seat players avoids heroes already used by a mixed custom fellowship", () => {
  const mixed = { deckId: customId(deck), heroes: ["01001", "01007", "01010"] };
  const expanded = expandSeats([mixed], 2, [deck])!;
  assert.ok(expanded);
  const heroes = expanded.flatMap((p) => p.heroes);
  assert.equal(new Set(heroes).size, heroes.length);
  assert.equal(expandSeats([mixed], 4, [deck]), null);
});
