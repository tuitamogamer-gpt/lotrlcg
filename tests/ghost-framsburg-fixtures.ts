import assert from "node:assert/strict";
import { applyAction, createGame } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { forOwner, playerOrder, selectSeat, syncSeat } from "../src/game/table";
import {
  GHOST_FRAMSBURG as G,
  GHOST_FRAMSBURG_QUEST_CHAIN,
} from "../src/game/ghost-framsburg-support";
import { choose, reload } from "./against-shadow-final-fixtures";
import type { GameState } from "../src/game/types";
export { choose, reload };
export function settle(s: GameState, prefer?: string) {
  for (
    let n = 0;
    s.status === "playing" && (s.choice || s.flow?.pending);
    n++
  ) {
    assert.ok(n < 500, "Ghost decisions terminate");
    s = s.flow?.pending
      ? applyAction(reload(s), { type: "CONTINUE", stepId: s.flow.pending.id })
      : choose(
          reload(s),
          s.choice!.options.find((o) => o.id === prefer)?.id ??
            s.choice!.options.find((o) => o.id === "skip")?.id ??
            s.choice!.options[0].id,
        );
  }
  return s;
}
export function start(players = 1, easy = false) {
  const d = STARTERS[0];
  let s = createGame(696, d.cards, d.heroes, d.id, {
    scenarioId: "the-ghost-of-framsburg",
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
  for (
    let n = 0;
    s.status === "playing" &&
    (s.phase === "setup" || s.choice || s.flow?.pending);
    n++
  ) {
    assert.ok(n < 500, "Ghost setup terminates");
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
export function base(players = 1, easy = false) {
  const s = start(players, easy);
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
    encounterDeck: Array(25).fill(G.moonlit),
    encounterDiscard: [],
    stageRevealing: false,
  });
  if (s.flow) s.flow.pending = null;
  Object.assign(s.ghostFramsburg!, {
    advancing: false,
    discoverCards: [],
    loot: [],
    removed: [],
    discoverModifiers: [],
    noReady: [],
    noDamage: [],
    shadows: [],
    threatReduced: [],
    destroyedEnemies: [],
  });
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      s.engaged = [];
      s.allies = [];
      s.hand = [];
      s.discard = [];
      s.used = [];
      s.committedIds = [];
      for (const h of s.heroes)
        Object.assign(h, {
          damage: 0,
          resources: 10,
          exhausted: false,
          committed: false,
          attachments: [],
        });
    });
  if (s.table) {
    s.table.first = 0;
    s.table.turn = 0;
    s.table.passed = [];
  }
  selectSeat(s, 0);
  syncSeat(s);
  return s;
}
export function setStage(s: GameState, stage: number) {
  s.stage = stage;
  s.progress = 0;
  s.stageRevealing = false;
  Object.assign(s.ghostFramsburg!, {
    currentQuest: GHOST_FRAMSBURG_QUEST_CHAIN[stage - 1],
    questDeck: GHOST_FRAMSBURG_QUEST_CHAIN.slice(stage),
    completedQuests: GHOST_FRAMSBURG_QUEST_CHAIN.slice(0, stage - 1),
    advancing: false,
  });
}
