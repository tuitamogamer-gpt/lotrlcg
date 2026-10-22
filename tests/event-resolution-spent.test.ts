import test from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../src/game/engine.ts";
import { STARTERS } from "../src/game/cards.ts";
import { make } from "../src/game/core.ts";
import { mirkwoodPlayerEventEffect } from "../src/game/mirkwood-player-cards.ts";
import {
  finishPlayedEvent,
  holdPlayedEvent,
  putPlayedEventInVictory,
  removePlayedEvent,
  returnPlayedEventToHand,
} from "../src/game/event-resolution.ts";

for (const destination of ["hand", "removed", "victory"] as const)
  test(`An event already moved by an encounter effect cannot move again to ${destination}`, () => {
    const d = STARTERS[0],
      s = createGame(771, d.cards, d.heroes, d.id),
      event = make(s, "01049");
    s.hand = [];
    s.discard = [event.code];
    const removedBefore = [...s.removed],
      victoryBefore = [...(s.victoryCards ?? [])];
    holdPlayedEvent(s, event);
    s.resolvingEvents![0].destination = "spent";
    if (destination === "hand")
      assert.equal(returnPlayedEventToHand(s, event.code, event.id), false);
    else if (destination === "removed") removePlayedEvent(s, event.code);
    else putPlayedEventInVictory(s, event.code);
    assert.equal(s.resolvingEvents![0].destination, "spent");
    finishPlayedEvent(s, event.id);
    assert.deepEqual(s.hand, []);
    assert.deepEqual(s.discard, [event.code]);
    assert.deepEqual(s.removed, removedBefore);
    assert.deepEqual(s.victoryCards ?? [], victoryBefore);
    assert.equal(s.resolvingEvents, undefined);
  });

test("A captured Rumour still looks at the encounter deck without offering an impossible paid return", () => {
  const d = STARTERS.find((d) => d.id === "lore")!,
    s = createGame(772, d.cards, d.heroes, d.id),
    event = make(s, "02124");
  s.heroes.forEach((h) => {
    h.resources = 1;
  });
  s.encounterDeck = ["01092"];
  s.discard = [event.code];
  holdPlayedEvent(s, event);
  s.resolvingEvents![0].destination = "spent";
  assert.equal(mirkwoodPlayerEventEffect(s, event.code), true);
  assert.equal(s.choice?.options.length, 1);
  assert.equal(s.choice?.options[0].id, "leave");
  assert.deepEqual(s.encounterDeck, ["01092"]);
  assert.deepEqual(s.discard, [event.code]);
  assert.equal(s.resolvingEvents![0].destination, "spent");
});
