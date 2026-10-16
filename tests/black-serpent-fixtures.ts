import assert from "node:assert/strict";
import { applyAction, createGame } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { make } from "../src/game/core";
import {
  BLACK_SERPENT as B,
  BLACK_SERPENT_MAIN_QUESTS,
  BLACK_SERPENT_OBJECTIVES,
  blackSerpentObjectives,
} from "../src/game/black-serpent-support";
import { forOwner, playerOrder, selectSeat, syncSeat } from "../src/game/table";
import { choose, reload } from "./against-shadow-final-fixtures";
import type { GameState } from "../src/game/types";
export { choose, reload };
export function settle(s: GameState, preferred?: string) {
  for (
    let n = 0;
    s.status === "playing" && (s.choice || s.flow?.pending);
    n++
  ) {
    assert.ok(n < 500, "Black Serpent decisions terminate");
    s = s.flow?.pending
      ? applyAction(reload(s), { type: "CONTINUE", stepId: s.flow.pending.id })
      : choose(
          reload(s),
          s.choice!.options.find((o) => o.id === preferred)?.id ??
            s.choice!.options.find((o) => o.id === "skip")?.id ??
            s.choice!.options[0].id,
        );
  }
  return s;
}
export function start(players = 1, easy = false) {
  const d = STARTERS[0];
  let s = createGame(759, d.cards, d.heroes, d.id, {
    scenarioId: "the-black-serpent",
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
    assert.ok(n < 500, "Black Serpent setup terminates");
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
  const s = start(players, easy),
    q = s.blackSerpent!;
  const objectives = [
    ...q.setAside,
    ...s.staging.filter((u) => BLACK_SERPENT_OBJECTIVES.includes(u.code)),
    ...blackSerpentObjectives(s).map(({ attachment: a }) => {
      const u = make(s, a.code);
      u.id = a.id;
      return u;
    }),
  ];
  const boss =
    [...s.staging, ...s.engaged].find((u) => u.code === B.serpent) ??
    make(s, B.serpent);
  boss.attachments = [];
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    staging: [boss],
    activeLocation: null,
    extraActiveLocations: [],
    combat: null,
    suspendedCombats: [],
    progress: 0,
    encounterDeck: Array(30).fill(B.bastion),
    encounterDiscard: [],
    stageRevealing: false,
  });
  if (s.flow) s.flow.pending = null;
  Object.assign(q, {
    advancing: false,
    setAside: objectives,
    champions: [],
    shields: [],
    shieldPlayers: [],
    modifiers: [],
    canceledEvents: [],
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
export function setStage(s: GameState, stage = 1) {
  s.stage = stage;
  s.progress = 0;
  s.stageRevealing = false;
  Object.assign(s.blackSerpent!, {
    currentQuest: BLACK_SERPENT_MAIN_QUESTS[stage - 1],
    completedQuests: BLACK_SERPENT_MAIN_QUESTS.slice(0, stage - 1),
    questDeck: BLACK_SERPENT_MAIN_QUESTS.slice(stage),
    advancing: false,
  });
}
export function claim(s: GameState, code = B.banner, player = 0) {
  const q = s.blackSerpent!,
    i = q.setAside.findIndex((u) => u.code === code);
  assert.ok(i >= 0);
  const objective = q.setAside.splice(i, 1)[0];
  forOwner(s, player, () =>
    s.heroes[0].attachments.push({
      id: objective.id,
      code: objective.code,
      exhausted: false,
    }),
  );
  syncSeat(s);
  return objective;
}
