import assert from "node:assert/strict";
import {
  applyAction,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import {
  forOwner,
  globalEngaged,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import { SHELOB_LAIR_QUESTS, SL } from "../src/game/shelob-lair-support";
import { isOneRing, ringBearer } from "../src/game/lotr-saga";
import { make } from "../src/game/core";
import type { GameState, Unit } from "../src/game/types";

export function reload(s: GameState): GameState {
  syncSeat(s);
  const raw = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(raw), "Shelob's Lair save validates");
  const restored = restoreSave(raw);
  assert.ok(restored);
  return restored;
}
export function choose(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    JSON.stringify(s.choice),
  );
  return applyAction(reload(s), { type: "CHOOSE", id });
}
export function settle(s: GameState, preferred?: string) {
  for (
    let n = 0;
    s.status === "playing" && (s.choice || s.flow?.pending);
    n++
  ) {
    assert.ok(n < 500, "Shelob's Lair decisions terminate");
    s = applyAction(
      reload(s),
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : {
            type: "CHOOSE",
            id:
              s.choice!.options.find((o) => o.id === preferred)?.id ??
              s.choice!.options.find((o) =>
                ["skip", "resolve", "undefended", "keep"].includes(o.id),
              )?.id ??
              s.choice!.options[0].id,
          },
    );
  }
  return s;
}
export function start(
  players = 1,
  easy = false,
  seed = 919,
  guided = false,
  hotseat = players > 1,
) {
  const d = STARTERS[0];
  let s = createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "shelobs-lair",
    easy,
    guided,
    ...(hotseat
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
    assert.ok(n < 500, "Shelob's Lair setup terminates");
    s = applyAction(
      reload(s),
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : s.choice
          ? {
              type: "CHOOSE",
              id: (
                s.choice.options.find((o) => o.id === "skip") ??
                s.choice.options[0]
              ).id,
            }
          : { type: "KEEP" },
    );
  }
  return s;
}
const QUEST: Record<number, string> = Object.fromEntries(
  SHELOB_LAIR_QUESTS.map((q) => [Number(q.cost), q.code]),
);
/** A filler card for players' hands: Guard of the Citadel. */
export const FILLER = "01013";
/**
 * A settled planning-phase table at the given stage. At stages 1 and 2 the
 * first player controls a ready Sméagol; at stage 3 Gollum is engaged with
 * the first player. From stage 2 Shelob is in the staging area with no
 * resource (at stage 1 she is set aside with Cleft of Cirith Ungol and The
 * Great Spider; at stage 3 Cleft of Cirith Ungol is in the staging area).
 * There is no active location, no other card in play, an empty victory
 * display and an encounter deck of Den of Night. Each player has threat 20
 * and heroes with 10 resources (Frodo has 2).
 */
export function base(players = 1, stage = 1) {
  const s = start(players);
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    activeLocation: null,
    extraActiveLocations: [],
    combat: null,
    suspendedCombats: [],
    progress: 0,
    stage,
    stageRevealing: false,
    encounterDeck: Array(20).fill(SL.den),
    encounterDiscard: [],
    victory: 0,
    victoryCards: [],
    removedEncounter: [],
    questAttachments: {},
  });
  const first = playerOrder(s)[0];
  const smeagol = seatView(s, first).allies.find((u) => u.code === SL.smeagol)!;
  s.staging = [];
  const q = s.shelobLair!;
  Object.assign(q, {
    currentQuest: QUEST[stage],
    advancing: false,
    resolving: [],
    setAside: stage === 1 ? q.setAside : stage === 2 ? [SL.cleft] : [],
    passProgress: undefined,
    allies: undefined,
    rage: undefined,
    openings: undefined,
    failedRound: undefined,
  });
  if (stage >= 2) s.staging.push(make(s, SL.shelob));
  if (stage === 3) s.staging.push(make(s, SL.cleft));
  if (s.flow) s.flow.pending = null;
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      s.allies = [];
      s.engaged = [];
      s.hand = [];
      s.discard = [];
      s.committedIds = [];
      s.used = [];
      for (const h of s.heroes)
        Object.assign(h, {
          resources: 10,
          damage: 0,
          exhausted: false,
          committed: false,
          attachments: h.attachments.filter((a) => isOneRing(a.code)),
        });
    });
  forOwner(s, first, () => {
    if (stage === 3) {
      const gollum: Unit = {
        ...make(s, SL.gollum),
        id: smeagol.id,
        owner: first,
      };
      s.engaged.push(gollum);
    } else {
      smeagol.damage = 0;
      smeagol.exhausted = false;
      s.allies.push(smeagol);
    }
  });
  const frodo = ringBearer(s)!;
  frodo.resources = 2;
  for (const a of frodo.attachments) a.exhausted = false;
  selectSeat(s, first);
  syncSeat(s);
  return s;
}
/** Shelob, wherever she is in play. */
export const shelob = (s: GameState) =>
  [...s.staging, ...globalEngaged(s)].find((u) => u.code === SL.shelob);
/** Put a fresh copy of an encounter card into the staging area. */
export function stage(s: GameState, code: string) {
  const u = make(s, code);
  s.staging.push(u);
  return u;
}
/** Put a fresh enemy into play engaged with a player. */
export function engaged(s: GameState, code: string, p = 0) {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    s.engaged.push(u);
  });
  return u;
}
/** Give a player the listed allies in play. */
export function allies(s: GameState, codes: string[], p = 0): Unit[] {
  const out: Unit[] = [];
  forOwner(s, p, () => {
    for (const code of codes) {
      const u = make(s, code);
      u.owner = p;
      s.allies.push(u);
      out.push(u);
    }
  });
  return out;
}
/** Give a player the listed cards in hand (physical copies). */
export function hand(s: GameState, codes: string[], p = 0): Unit[] {
  const out: Unit[] = [];
  forOwner(s, p, () => {
    for (const code of codes) {
      const u = make(s, code);
      u.owner = p;
      s.hand.push(u);
      out.push(u);
    }
  });
  return out;
}
/** Make a location the active location. */
export function activate(s: GameState, code: string) {
  const u = make(s, code);
  s.activeLocation = u;
  return u;
}
