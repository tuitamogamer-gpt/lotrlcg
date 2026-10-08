import assert from "node:assert/strict";
import {
  base as fixture,
  choose,
  reload,
} from "./against-shadow-final-fixtures";
import { applyAction, createGame } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { make } from "../src/game/core";
import { WEATHER as W } from "../src/game/weather-hills-support";
import type { GameState } from "../src/game/types";
export { choose, reload };
export function base(players = 1) {
  const s = fixture("the-weather-hills", players);
  s.weatherHills = {
    initialized: true,
    orcDeck: [],
    setAside: [
      make(s, "octgn:e347f103-7444-4681-ae57-49c7b84dd3c0"),
      make(s, W.forn),
    ],
    weatherSurgeRound: 0,
  };
  s.staging.push(make(s, W.mission));
  return s;
}
export function start(players = 1, easy = false) {
  const d = STARTERS[0];
  let s = createGame(19, d.cards, d.heroes, d.id, {
    scenarioId: "the-weather-hills",
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
  for (let i = 0; s.phase === "setup"; i++) {
    assert.ok(i < 60, "opening-hand setup terminates");
    s = applyAction(
      reload(s),
      s.choice
        ? { type: "CHOOSE", id: s.choice.options[0].id }
        : { type: "KEEP" },
    );
  }
  return s;
}
export function settle(s: GameState) {
  // Optional responses can be passed. Forced damage and searches still resolve.
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 150, "decisions terminate");
    s = choose(
      reload(s),
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  return s;
}
