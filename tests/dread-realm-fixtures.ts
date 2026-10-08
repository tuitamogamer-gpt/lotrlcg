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
import { DREAD as D } from "../src/game/dread-realm-support";
import type { GameState } from "../src/game/types";
export { choose, reload };
export function base(players = 1) {
  const s = fixture("the-dread-realm", players);
  s.dreadRealm = {
    initialized: true,
    daechanarDefeated: false,
    setAside: [make(s, D.daechanar), make(s, D.altar)],
    pendingWraiths: [],
    discardBindings: [],
    terrorRound: -1,
    terrorThreat: 0,
  };
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.deck = Array(30).fill("01057");
    });
  return s;
}
export function second(s = base()) {
  s.stage = 2;
  const enemy = s.dreadRealm!.setAside.find((u) => u.code === D.daechanar)!;
  s.staging.push(enemy);
  s.activeLocation = s.dreadRealm!.setAside.find((u) => u.code === D.altar)!;
  s.dreadRealm!.setAside = [];
  return s;
}
export function settle(s: GameState) {
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 160, "decisions terminate");
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
  let s = createGame(33, d.cards, d.heroes, d.id, {
    scenarioId: "the-dread-realm",
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
    assert.ok(i < 200, "setup terminates");
    s = applyAction(
      reload(s),
      s.choice
        ? { type: "CHOOSE", id: s.choice.options[0].id }
        : { type: "KEEP" },
    );
  }
  return settle(s);
}
