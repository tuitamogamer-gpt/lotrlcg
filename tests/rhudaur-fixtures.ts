import assert from "node:assert/strict";
import {
  base as fixture,
  choose,
  reload,
} from "./against-shadow-final-fixtures";
import { applyAction, createGame } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { make } from "../src/game/core";
import { RHUDAUR as R, RHUDAUR_SIDES } from "../src/game/rhudaur-support";
import type { GameState } from "../src/game/types";
export { choose, reload };
export function base(players = 1) {
  const s = fixture("the-treachery-of-rhudaur", players);
  s.stage = 1;
  s.rhudaur = {
    initialized: true,
    time: 5,
    setAside: [make(s, R.thaurdir)],
    forbiddenProgressRound: -1,
    forbiddenProgress: {},
    quietThreat: {},
    textActionsRound: -1,
    textActions: {},
    deckEmptyHandled: false,
  };
  s.allies.push(make(s, R.amarthiul));
  s.staging.push(...RHUDAUR_SIDES.map((code) => make(s, code)));
  return s;
}
export function second(s = base()) {
  s.stage = 2;
  s.rhudaur!.time = 0;
  s.staging = s.staging.filter((u) => !RHUDAUR_SIDES.includes(u.code));
  s.staging.push(s.rhudaur!.setAside.pop() ?? make(s, R.thaurdir));
  return s;
}
export function start(players = 1, easy = false) {
  const d = STARTERS[0];
  let s = createGame(43, d.cards, d.heroes, d.id, {
    scenarioId: "the-treachery-of-rhudaur",
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
    assert.ok(n < 180, "pending scenario decisions terminate");
    s = choose(
      reload(s),
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  return s;
}
