import assert from "node:assert/strict";
import {
  applyAction,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { forOwner, playerOrder, selectSeat, syncSeat } from "../src/game/table";
import { DANGER_DORWINION as D } from "../src/game/danger-dorwinion-support";
import type { GameState } from "../src/game/types";

export function reload(s: GameState): GameState {
  syncSeat(s);
  const raw = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(raw), "Danger in Dorwinion save validates");
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
    assert.ok(n < 500, "Danger in Dorwinion decisions terminate");
    s = applyAction(
      reload(s),
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : {
            type: "CHOOSE",
            id:
              s.choice!.options.find((o) => o.id === preferred)?.id ??
              s.choice!.options.find((o) =>
                ["skip", "resolve", "threat", "assault", "undefended"].includes(
                  o.id,
                ),
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
  seed = 899,
  guided = false,
  hotseat = players > 1,
) {
  const d = STARTERS[0];
  let s = createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "danger-in-dorwinion",
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
    assert.ok(n < 500, "Danger in Dorwinion setup terminates");
    s = applyAction(
      reload(s),
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : s.choice
          ? {
              type: "CHOOSE",
              id:
                s.choice.options.find((o) => o.id === "resolve")?.id ??
                s.choice.options[0].id,
            }
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
    activeLocation: null,
    extraActiveLocations: [],
    combat: null,
    suspendedCombats: [],
    progress: 0,
    stage: 1,
    stageRevealing: false,
    encounterDeck: Array(30).fill(D.manor),
    encounterDiscard: [],
  });
  s.staging = s.staging.filter((u) => false);
  for (const u of s.staging) {
    u.resources = 0;
    u.progress = 0;
    u.damage = 0;
  }
  Object.assign(s.dangerDorwinion!, {
    initialized: true,
    cultistDefeated: false,
    currentQuest: D.first,
    resources: 0,
    looked: [],
    storedCards: [],
    resolving: [],
    resolvingTreacheries: [],
    cultistDamage: { round: s.round, amount: 0 },
    threatRaised: {},
    servantAttacks: {},
    prevented: [],
    overwhelmed: [],
    manorReduction: { round: s.round, players: {} },
    secretCultists: [],
  });
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
    });
  selectSeat(s, firstLiving(s));
  syncSeat(s);
  return s;
}
function firstLiving(s: GameState) {
  return playerOrder(s)[0];
}
