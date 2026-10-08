import assert from "node:assert/strict";
import {
  base as fixture,
  choose,
  reload,
} from "./against-shadow-final-fixtures";
import { applyAction, createGame } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { make } from "../src/game/core";
import { forOwner, playerOrder } from "../src/game/table";
import { ETTEN as E } from "../src/game/ettenmoors-support";
import type { GameState } from "../src/game/types";
export { choose, reload };
export function base(players = 1) {
  const s = fixture("across-the-ettenmoors", players);
  s.ettenmoors = {
    initialized: true,
    lieLowProgressRound: {},
    lowEngagementRound: -1,
    lowEngagementPenalty: 0,
  };
  s.allies.push(make(s, E.amarthiul));
  return s;
}
export function start(players = 1, easy = false) {
  const d = STARTERS[0];
  let s = createGame(41, d.cards, d.heroes, d.id, {
    scenarioId: "across-the-ettenmoors",
    easy,
    ...(players > 1
      ? {
          seats: STARTERS.slice(0, players).map((d) => ({
            deckId: d.id,
            heroes: [...d.heroes],
          })),
        }
      : {}),
  });
  for (let n = 0; s.phase === "setup"; n++) {
    assert.ok(n < 100, "opening decisions terminate");
    s = applyAction(
      reload(s),
      s.choice
        ? { type: "CHOOSE", id: s.choice.options[0].id }
        : { type: "KEEP" },
    );
  }
  return settle(s);
}
export function settle(s: GameState) {
  for (let n = 0; s.choice && s.status === "playing"; n++) {
    assert.ok(n < 150, "pending scenario decisions terminate");
    s = choose(
      reload(s),
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  return s;
}
export function fellowshipDecks(s: GameState) {
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.deck = Array(25).fill("01057");
    });
  return s;
}
