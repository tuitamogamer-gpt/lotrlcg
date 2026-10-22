import assert from "node:assert/strict";
import { applyAction, createGame } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import {
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import {
  GUNDABAD as G,
  MOUNT_GUNDABAD_STAGE_TWOS,
} from "../src/game/mount-gundabad-support";
import { choose, reload } from "./against-shadow-final-fixtures";
import type { GameState } from "../src/game/types";
export { choose, reload };

export function settle(s: GameState, prefer?: string) {
  for (
    let n = 0;
    s.status === "playing" && (s.choice || s.flow?.pending);
    n++
  ) {
    assert.ok(n < 500, "Gundabad choices terminate");
    s = s.flow?.pending
      ? applyAction(reload(s), { type: "CONTINUE", stepId: s.flow.pending.id })
      : choose(
          reload(s),
          s.choice!.options.find((o) => o.id === prefer)?.id ??
            s.choice!.options.find((o) => o.id === "skip" || o.id === "stay")
              ?.id ??
            s.choice!.options[0].id,
        );
  }
  return s;
}
export function newGame(players = 1, easy = false) {
  const d = STARTERS[0];
  return createGame(708, d.cards, d.heroes, d.id, {
    scenarioId: "mount-gundabad",
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
}
export function start(players = 1, easy = false) {
  let s = newGame(players, easy);
  for (
    let n = 0;
    s.status === "playing" &&
    (s.phase === "setup" || s.choice || s.flow?.pending);
    n++
  ) {
    assert.ok(n < 500, "Gundabad setup terminates");
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
    dragon = s.staging.find((u) => u.code === G.dagnir)!;
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    staging: [dragon],
    activeLocation: null,
    extraActiveLocations: [],
    combat: null,
    suspendedCombats: [],
    progress: 0,
    encounterDeck: Array(30).fill(G.ruins),
    encounterDiscard: [],
    stageRevealing: false,
  });
  if (s.flow) s.flow.pending = null;
  Object.assign(s.mountGundabad!, {
    advancing: false,
    resolving: [],
    removed: [],
    guardedPlayerCards: [],
    phasePlays: [],
    noPlayerReady: [],
    darkPlaces: [],
    usedResponses: [],
    firstTreacheryRound: -1,
    damageRound: s.round,
    damageTaken: 0,
  });
  delete s.mountGundabad!.protectedTreachery;
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
          attachments: h.attachments.filter((a) => a.code === G.sword),
          tempDefense: 20,
          phaseResourceIcons: ["leadership", "spirit", "tactics", "lore"],
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
export function setQuest(
  s: GameState,
  code: string,
  front = false,
  completed = [G.door],
) {
  s.stage = code === G.door ? 1 : 2;
  s.progress = 0;
  s.stageRevealing = false;
  const q = s.mountGundabad!;
  q.currentQuest = code;
  q.questFront = front;
  q.completedQuests = [...completed];
  q.advancing = false;
  q.questDeck = MOUNT_GUNDABAD_STAGE_TWOS.filter(
    (c) => c !== code && !completed.includes(c),
  );
  s.victoryCards = [...completed];
  s.victory = completed.length;
  syncSeat(s);
  return s;
}
export const second = (players = 1, easy = false) =>
  setQuest(base(players, easy), G.upper);
export function giveSword(s: GameState, player: number, reforged = true) {
  let a: GameState["heroes"][number]["attachments"][number] | undefined;
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      for (const h of s.heroes) {
        a ??= h.attachments.find((a) => a.code === G.sword);
        h.attachments = h.attachments.filter((a) => a.code !== G.sword);
      }
    });
  assert.ok(a);
  seatView(s, player).heroes[0].attachments.push(a);
  s.mountGundabad!.reforged = reforged;
  syncSeat(s);
  return a.id;
}
