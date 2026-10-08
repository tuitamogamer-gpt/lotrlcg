import assert from "node:assert/strict";
import { base as clean, choose, reload } from "./against-shadow-final-fixtures";
import { createGame, applyAction } from "../src/game/engine";
import { make } from "../src/game/core";
import { STARTERS } from "../src/game/cards";
import { WASTES as W } from "../src/game/wastes-eriador-support";
import type { GameState } from "../src/game/types";
export { choose, reload };
export function base(players = 1) {
  const s = clean("mirkwood", players);
  s.scenarioId = "wastes-of-eriador";
  s.wastesEriador = {
    initialized: true,
    setAside: [make(s, W.leader)],
    progressRound: -1,
    progressPlaced: {},
  };
  const t = make(s, W.time);
  t.flipped = false;
  s.staging.push(t);
  const a = make(s, W.amarthiul);
  delete a.owner;
  a.controller = 0;
  s.allies.push(a);
  s.encounterDeck = Array(30).fill(W.downs);
  return s;
}
export function settle(s: GameState) {
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(
      i < 180,
      "scenario decisions terminate and survive save restoration",
    );
    s = choose(
      reload(s),
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  return s;
}
export function start(players = 1, easy = false) {
  const d = STARTERS[0];
  let s = createGame(71, d.cards, d.heroes, d.id, {
    scenarioId: "wastes-of-eriador",
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
    assert.ok(i < 160);
    s = applyAction(
      reload(s),
      s.choice
        ? { type: "CHOOSE", id: s.choice.options[0].id }
        : { type: "KEEP" },
    );
  }
  return settle(s);
}
export function night(s: GameState) {
  s.staging.find((u) => u.code === W.time)!.flipped = true;
  return s;
}
export function second(s = base()) {
  s.stage = 2;
  return s;
}
export function third(s = base()) {
  s.stage = 3;
  const leader = s.wastesEriador!.setAside.pop()!;
  s.staging.push(leader);
  return s;
}
