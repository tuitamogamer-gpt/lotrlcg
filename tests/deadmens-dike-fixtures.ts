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
import { DIKE as D } from "../src/game/deadmens-dike-support";
import type { GameState } from "../src/game/types";

export { choose, reload };
export function base(players = 1) {
  const s = fixture("deadmens-dike", players);
  s.deadmensDike = {
    initialized: true,
    setAside: [make(s, D.thaurdir)],
    undeadRevealRound: -1,
    terrorRound: -1,
    terrorThreat: 0,
  };
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.deck = Array(30).fill("01057");
    });
  s.allies.push(make(s, D.iarion));
  return s;
}
export function second(s: GameState = base()) {
  s.stage = 2;
  const t = s.deadmensDike!.setAside.pop() ?? make(s, D.thaurdir);
  s.staging.push(t);
  return s;
}
export function start(players = 1, easy = false) {
  const d = STARTERS[0];
  let s = createGame(19, d.cards, d.heroes, d.id, {
    scenarioId: "deadmens-dike",
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
    assert.ok(i < 160, "opening decisions terminate");
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
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(
      i < 180,
      "decisions terminate and every pending choice survives saving",
    );
    s = choose(
      reload(s),
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  return s;
}
