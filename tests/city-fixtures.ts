import assert from "node:assert/strict";
import { createGame, applyAction } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { CITY, CITY_MAIN_QUESTS } from "../src/game/city-support";
import { make } from "../src/game/core";
import { isShipObjective } from "../src/game/ships";
import { forOwner, playerOrder, selectSeat, syncSeat } from "../src/game/table";
import { choose, reload } from "./against-shadow-final-fixtures";
import type { GameState } from "../src/game/types";
export { choose, reload };
export function settle(s: GameState) {
  for (
    let n = 0;
    (s.choice || s.flow?.pending) && s.status === "playing";
    n++
  ) {
    assert.ok(n < 300, "City decisions terminate");
    s = s.flow?.pending
      ? applyAction(reload(s), { type: "CONTINUE", stepId: s.flow.pending.id })
      : choose(
          reload(s),
          s.choice!.options.find((o) => o.id === "skip")?.id ??
            s.choice!.options[0].id,
        );
  }
  return s;
}
export function start(players = 1, easy = false, seed = 53) {
  const d = STARTERS[0];
  let s = createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "the-city-of-corsairs",
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
  for (let n = 0; s.phase === "setup" || s.choice || s.flow?.pending; n++) {
    assert.ok(n < 200, "City opening decisions terminate");
    if (s.status !== "playing") break;
    s = applyAction(
      reload(s),
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : s.choice
          ? { type: "CHOOSE", id: s.choice.options[0].id }
          : { type: "KEEP" },
    );
  }
  return s;
}
export function base(players = 1) {
  const s = start(players);
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    staging: [],
    activeLocation: null,
    extraActiveLocations: [],
    combat: null,
    suspendedCombats: [],
    progress: 0,
    encounterDeck: Array(30).fill(CITY.belfalas),
    encounterDiscard: [],
  });
  s.sailing = { heading: 0 };
  s.city!.advancing = false;
  s.city!.corsairDiscard = [];
  s.city!.foes = [];
  s.city!.allyEntries = { round: s.round, count: 0 };
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      s.engaged = [];
      s.used = [];
      s.hand = [];
      s.discard = [];
      s.committedIds = [];
      for (const h of [...s.heroes, ...s.allies])
        Object.assign(h, {
          damage: 0,
          resources: 10,
          exhausted: false,
          committed: false,
        });
    });
  selectSeat(s, 0);
  if (s.table) {
    s.table.first = 0;
    s.table.turn = 0;
    s.table.passed = [];
  }
  syncSeat(s);
  return s;
}
/** Focused land fixture preserves the physical fleet in the inactive discard. */
export function setStage(s: GameState, stage: number) {
  if (stage >= 3 && s.sailing) {
    for (const p of playerOrder(s))
      forOwner(s, p, () => {
        for (const ship of s.allies.filter(isShipObjective))
          s.city!.inactiveDiscard.push(ship.code);
        s.allies = s.allies.filter((u) => !isShipObjective(u));
      });
    s.city!.inactiveDeck.push(...s.encounterDeck);
    s.encounterDeck = [
      ...s.city!.secondDeck.splice(0),
      ...s.city!.corsairDeck.splice(0),
      ...s.city!.corsairDiscard.splice(0),
    ];
    for (const code of [CITY.sahir, CITY.monument]) {
      const i = s.encounterDeck.indexOf(code);
      if (i >= 0)
        s.city!.setAside.push(make(s, s.encounterDeck.splice(i, 1)[0]));
    }
    delete s.sailing;
  }
  s.city!.completedQuests = CITY_MAIN_QUESTS.slice(0, stage - 1);
  s.city!.currentQuest = CITY_MAIN_QUESTS[stage - 1];
  s.city!.questDeck = CITY_MAIN_QUESTS.slice(stage);
  s.city!.advancing = false;
  s.stage = stage;
  s.stageRevealing = false;
  s.progress = 0;
  syncSeat(s);
  return s;
}
