import assert from "node:assert/strict";
import { applyAction, createGame } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import {
  CROSSINGS_POROS as P,
  CROSSINGS_POROS_MAIN_QUESTS,
  CROSSINGS_POROS_STAGE_TWO,
  CROSSINGS_POROS_STAGE_THREE,
} from "../src/game/crossings-poros-support";
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
    assert.ok(n < 500, "Poros decisions terminate");
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
export function start(players = 1, easy = false, seed = 761) {
  const d = STARTERS[0];
  let s = createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "the-crossings-of-poros",
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
    assert.ok(n < 500, "Poros setup terminates");
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
    encounterDeck: Array(30).fill(P.waste),
    encounterDiscard: [],
    stageRevealing: false,
  });
  if (s.flow) s.flow.pending = null;
  Object.assign(s.crossingsPoros!, {
    advancing: false,
    champions: [],
    poisoned: [],
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
export function setStage(
  s: GameState,
  code: string = P.desert,
  previousTwo = P.desert,
  previousThree = P.creatures,
) {
  const q = s.crossingsPoros!;
  const stage =
    code === P.flight
      ? 1
      : CROSSINGS_POROS_STAGE_TWO.includes(code)
        ? 2
        : CROSSINGS_POROS_STAGE_THREE.includes(code)
          ? 3
          : 4;
  s.stage = stage;
  s.progress = 0;
  s.stageRevealing = false;
  q.currentQuest = code;
  q.completedQuests =
    stage === 1
      ? []
      : stage === 2
        ? [P.flight]
        : stage === 3
          ? [P.flight, previousTwo]
          : [P.flight, previousTwo, previousThree];
  q.removedQuests =
    stage >= 2
      ? CROSSINGS_POROS_STAGE_TWO.filter(
          (c) => c !== (stage === 2 ? code : previousTwo),
        )
      : [];
  q.setAsideQuests =
    stage >= 3
      ? CROSSINGS_POROS_STAGE_THREE.filter(
          (c) => c !== (stage === 3 ? code : previousThree),
        )
      : [];
  q.questDeck = CROSSINGS_POROS_MAIN_QUESTS.filter(
    (c) =>
      ![
        ...q.completedQuests,
        q.currentQuest,
        ...q.removedQuests,
        ...q.setAsideQuests,
      ].includes(c),
  );
  q.advancing = false;
  if (stage === 4 && !q.garrisonEntered) {
    const i = q.setAside.findIndex((u) => u.code === P.garrison);
    if (i >= 0) {
      const g = q.setAside.splice(i, 1)[0];
      g.owner = 0;
      s.allies.push(g);
      q.garrisonEntered = true;
    }
  }
  return s;
}
