import assert from "node:assert/strict";
import { applyAction, createGame } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { firstPlayer, forOwner, playerOrder, selectSeat, syncSeat } from "../src/game/table";
import { MORDOR, MORDOR_MAIN_QUESTS } from "../src/game/long-arm-mordor-support";
import { choose, reload } from "./against-shadow-final-fixtures";
import type { GameState } from "../src/game/types";
export { choose, reload };
export function settle(s: GameState) {
  for (let n = 0; s.status === "playing" && (s.choice || s.flow?.pending); n++) {
    assert.ok(n < 400, "Mordor decisions terminate");
    s = s.flow?.pending ? applyAction(reload(s), { type: "CONTINUE", stepId: s.flow.pending.id }) :
      choose(reload(s), s.choice!.options.find((o) => o.id === "skip")?.id ?? s.choice!.options[0].id);
  }
  return s;
}
export function start(players = 1, easy = false) {
  const d = STARTERS[0];
  let s = createGame(55, d.cards, d.heroes, d.id, { scenarioId: "the-long-arm-of-mordor", easy,
    ...(players > 1 ? { seats: STARTERS.slice(0, players).map((d) => ({ deckId: d.id, heroes: [...d.heroes] })) } : {}) });
  for (let n = 0; s.status === "playing" && (s.phase === "setup" || s.choice || s.flow?.pending); n++) {
    assert.ok(n < 400, "Mordor setup terminates");
    s = applyAction(reload(s), s.flow?.pending ? { type: "CONTINUE", stepId: s.flow.pending.id } :
      s.choice ? { type: "CHOOSE", id: s.choice.options[0].id } : { type: "KEEP" });
  }
  return s;
}
export function base(players = 1) {
  const s = start(players);
  Object.assign(s, { phase: "planning", queue: [], choice: null, staging: [], activeLocation: null,
    extraActiveLocations: [], combat: null, suspendedCombats: [], progress: 0,
    encounterDeck: Array(30).fill(MORDOR.hut), encounterDiscard: [], stageRevealing: false });
  s.mordor!.advancing = false;
  for (const p of playerOrder(s)) forOwner(s, p, () => {
    s.threat = 20; s.engaged = []; s.allies = []; s.hand = []; s.discard = []; s.used = []; s.committedIds = [];
    for (const h of s.heroes) Object.assign(h, { damage: 0, resources: 10, exhausted: false, committed: false });
  });
  if (s.table) { s.table.first = firstPlayer(s); s.table.turn = firstPlayer(s); s.table.passed = []; }
  selectSeat(s, firstPlayer(s)); syncSeat(s); return s;
}
export function setStage(s: GameState, stage: number) {
  s.stage = stage; s.progress = 0; s.stageRevealing = false;
  Object.assign(s.mordor!, { currentQuest: MORDOR_MAIN_QUESTS[stage - 1], completedQuests: MORDOR_MAIN_QUESTS.slice(0, stage - 1),
    questDeck: MORDOR_MAIN_QUESTS.slice(stage), advancing: false });
}
