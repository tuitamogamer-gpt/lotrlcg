import assert from "node:assert/strict";
import { applyAction, createGame } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { forOwner, playerOrder, selectSeat, syncSeat } from "../src/game/table";
import { RACE_HARAD as R, RACE_HARAD_MAIN_QUESTS, RACE_HARAD_ENEMY_QUESTS } from "../src/game/race-harad-support";
import { raceHaradSyncArea } from "../src/game/race-harad";
import { choose, reload } from "./against-shadow-final-fixtures";
import type { GameState } from "../src/game/types";
export { choose, reload };
export function settle(s: GameState, preferred?: string) {
  for (let n = 0; s.status === "playing" && (s.choice || s.flow?.pending); n++) {
    assert.ok(n < 500, "Race decisions terminate");
    s = s.flow?.pending ? applyAction(reload(s), { type: "CONTINUE", stepId: s.flow.pending.id }) : choose(reload(s), s.choice!.options.find((o) => o.id === preferred)?.id ?? s.choice!.options.find((o) => o.id === "skip")?.id ?? s.choice!.options[0].id);
  }
  return s;
}
export function start(players = 1, easy = false) {
  const d = STARTERS[0];
  let s = createGame(776, d.cards, d.heroes, d.id, { scenarioId: "race-across-harad", easy, ...(players > 1 ? { seats: STARTERS.slice(0, players).map((d) => ({ deckId: d.id, heroes: [...d.heroes] })) } : {}) });
  for (let n = 0; s.status === "playing" && (s.phase === "setup" || s.choice || s.flow?.pending); n++) {
    assert.ok(n < 500, "Race setup terminates");
    s = applyAction(reload(s), s.flow?.pending ? { type: "CONTINUE", stepId: s.flow.pending.id } : s.choice ? { type: "CHOOSE", id: s.choice.options.find((o) => o.id === "orcs")?.id ?? s.choice.options[0].id } : { type: "KEEP" });
  }
  return s;
}
export function base(players = 1) {
  const s = start(players);
  Object.assign(s, { phase: "planning", queue: [], choice: null, staging: [], activeLocation: null, extraActiveLocations: [], combat: null, suspendedCombats: [], progress: 0, encounterDeck: Array(30).fill(R.erg), encounterDiscard: [], stageRevealing: false });
  if (s.flow) s.flow.pending = null;
  Object.assign(s.raceHarad!, { advancing: false, area: [], progressThisRound: 0, progressLimit: 0, howling: [] });
  for (const p of playerOrder(s)) forOwner(s, p, () => {
    s.threat = 20; s.engaged = []; s.allies = s.allies.filter((u) => u.code === R.tamed); s.hand = []; s.discard = []; s.used = []; s.committedIds = [];
    for (const h of [...s.heroes, ...s.allies]) Object.assign(h, { damage: 0, resources: 10, exhausted: false, committed: false });
  });
  if (s.table) { s.table.first = 0; s.table.turn = 0; s.table.passed = []; }
  selectSeat(s, 0); syncSeat(s); return s;
}
export function setStage(s: GameState, stage = 2, enemyStage = 1) {
  s.stage = stage; s.progress = 0; s.stageRevealing = false;
  Object.assign(s.raceHarad!, { currentQuest: RACE_HARAD_MAIN_QUESTS[stage - 1], completedQuests: RACE_HARAD_MAIN_QUESTS.slice(0, stage - 1), questDeck: RACE_HARAD_MAIN_QUESTS.slice(stage), advancing: false,
    enemyStage, enemyQuest: RACE_HARAD_ENEMY_QUESTS[enemyStage - 1], enemyQuestDeck: RACE_HARAD_ENEMY_QUESTS.slice(enemyStage), enemyCompletedQuests: RACE_HARAD_ENEMY_QUESTS.slice(0, enemyStage - 1), enemyProgress: 0 });
  raceHaradSyncArea(s);
}
