import assert from "node:assert/strict";
import {
  applyAction,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { forOwner, playerOrder, selectSeat, syncSeat } from "../src/game/table";
import { RI, ROAD_ISENGARD_QUESTS } from "../src/game/road-isengard-support";
import { tosAragorn } from "../src/game/lotr-saga";
import { make } from "../src/game/core";
import type { GameState, Unit } from "../src/game/types";

export function reload(s: GameState): GameState {
  syncSeat(s);
  const raw = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(raw), "The Road to Isengard save validates");
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
    assert.ok(n < 500, "The Road to Isengard decisions terminate");
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
    scenarioId: "the-road-to-isengard",
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
    assert.ok(n < 500, "The Road to Isengard setup terminates");
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
  ROAD_ISENGARD_QUESTS.map((q) => [Number(q.cost), q.code]),
);
/** A filler card for players' hands: Guard of the Citadel. */
export const FILLER = "01013";
/**
 * A settled planning-phase table at the given stage. Stage 1 keeps the four
 * Ents of Fangorn in the staging area; stage 2 has Saruman and Orthanc in the
 * staging area; stage 3 adds Saruman's Staff on Saruman. There is no active
 * location, no other card in play, an empty victory display and an encounter
 * deck of Ring-wall of Isengard. Each player has threat 20, heroes with 10
 * resources (Aragorn has 2) and, from stage 3, 3 cards in hand.
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
    encounterDeck: Array(20).fill(RI.ringWall),
    encounterDiscard: [],
    victory: 0,
    victoryCards: [],
    removedEncounter: [],
  });
  const ents = s.staging.filter((u) => u.code === RI.ent);
  for (const e of ents) e.resources = 0;
  const saruman = make(s, RI.saruman);
  if (stage === 3)
    saruman.attachments.push({
      id: make(s, RI.staff).id,
      code: RI.staff,
      exhausted: false,
    });
  s.staging = stage === 1 ? ents : [saruman, make(s, RI.orthanc)];
  Object.assign(s.roadIsengard!, {
    currentQuest: QUEST[stage],
    advancing: false,
    setAside:
      stage === 1
        ? [RI.gates, RI.orthanc, RI.saruman, RI.staff]
        : stage === 2
          ? [RI.staff]
          : [],
    resolving: [],
    rouse: 0,
    breaking: 0,
    wizardry: undefined,
    staffPending: undefined,
    staff: undefined,
    phaseProgress: undefined,
    orthanc: undefined,
    orcDefense: undefined,
    vapour: undefined,
    grima: undefined,
    looking: undefined,
  });
  if (stage > 1) s.removedEncounter = Array(4).fill(RI.ent);
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
          attachments: [],
        });
      if (stage === 3)
        for (let i = 0; i < 3; i++) {
          const u = make(s, FILLER);
          u.owner = p;
          s.hand.push(u);
        }
    });
  tosAragorn(s)!.resources = 2;
  selectSeat(s, playerOrder(s)[0]);
  syncSeat(s);
  return s;
}
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
/** Replace a player's deck with the listed cards, top first. */
export function deck(s: GameState, codes: string[], p = 0) {
  forOwner(s, p, () => {
    s.deck = [...codes];
  });
}
/** Make a location the active location. */
export function activate(s: GameState, code: string) {
  const u = make(s, code);
  s.activeLocation = u;
  return u;
}
