import assert from "node:assert/strict";
import {
  applyAction,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { ROAM_RHOVANION as R } from "../src/game/roam-rhovanion-support";
import { forOwner, playerOrder, selectSeat, syncSeat } from "../src/game/table";
import { make } from "../src/game/core";
import type { GameState } from "../src/game/types";
export function reload(s: GameState) {
  syncSeat(s);
  const json = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(json), "Roam save validates");
  const restored = restoreSave(json);
  assert.ok(restored);
  return restored!;
}
export function settle(s: GameState, preferred?: string) {
  for (
    let i = 0;
    s.status === "playing" && (s.choice || s.flow?.pending);
    i++
  ) {
    assert.ok(i < 400, "Roam decisions terminate");
    s = applyAction(
      reload(s),
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : {
            type: "CHOOSE",
            id:
              s.choice!.options.find((o) => o.id === preferred)?.id ??
              s.choice!.options.find((o) => o.id === "skip")?.id ??
              s.choice!.options[0].id,
          },
    );
  }
  return s;
}
export function start(players = 1, easy = false) {
  const d = STARTERS[0];
  let s = createGame(805, d.cards, d.heroes, d.id, {
    scenarioId: "roam-across-rhovanion",
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
    let i = 0;
    s.status === "playing" &&
    (s.phase === "setup" || s.choice || s.flow?.pending);
    i++
  ) {
    assert.ok(i < 300, "Roam setup terminates");
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
  const s = start(players),
    urdug = s.allies.find((u) => u.code === R.urdug)!;
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
    stageRevealing: false,
    encounterDeck: [R.moor, R.giant, R.ravine, ...Array(30).fill(R.slopes)],
    encounterDiscard: [],
  });
  if (s.flow) s.flow.pending = null;
  Object.assign(s.roamRhovanion!, {
    advancing: false,
    guarded: [],
    guardedPlayerCards: [],
    storedCards: [],
    resolving: [],
    keyPeek: [],
    threatModifiers: [],
    attackModifiers: [],
    locationProgress: [],
  });
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      s.allies = p === 0 ? [urdug] : [];
      s.engaged = [];
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
export function add(s: GameState, code: string) {
  const u = make(s, code);
  s.staging.push(u);
  return u;
}
export function ally(s: GameState, code = "01013", p = 0) {
  const u = make(s, code);
  u.owner = p;
  forOwner(s, p, () => s.allies.push(u));
  return u;
}
export function setStage(s: GameState, code: string) {
  const R2 = [R.rescue, R.hornQuest, R.keyQuest],
    q = s.roamRhovanion!;
  s.stage = code === R.task ? 1 : code === R.gambit ? 3 : 2;
  s.progress = 0;
  s.stageRevealing = false;
  q.currentQuest = code;
  q.completedQuests =
    code === R.task ? [] : code === R.gambit ? [R.task, ...R2] : [R.task];
  q.questDeck =
    code === R.task
      ? [...R2, R.gambit]
      : code === R.gambit
        ? []
        : [...R2.filter((c) => c !== code), R.gambit];
  q.advancing = false;
}
export function finale() {
  const s = base();
  setStage(s, R.gambit);
  const u = s.allies.find((u) => u.code === R.urdug)!,
    q = s.roamRhovanion!,
    tiny = q.setAside.find((u) => u.code === R.tiny)!,
    horn = q.setAside.find((u) => u.code === R.horn)!,
    key = q.setAside.find((u) => u.code === R.key)!;
  s.allies = s.allies.filter((u) => u.code !== R.urdug);
  u.code = R.urdugEnemy;
  tiny.code = R.tinyEnemy;
  u.attachments.push({ id: horn.id, code: horn.code, exhausted: false });
  s.heroes[0].attachments.push({
    id: key.id,
    code: key.code,
    exhausted: false,
  });
  u.owner = 0;
  tiny.owner = 0;
  s.engaged.push(u, tiny);
  q.setAside = [];
  return { s, urdug: u, tiny };
}
