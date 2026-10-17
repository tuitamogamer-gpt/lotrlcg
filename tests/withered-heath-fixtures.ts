import assert from "node:assert/strict";
import {
  applyAction,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { make } from "../src/game/core";
import {
  activeSeat,
  forOwner,
  playerOrder,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import type { GameState } from "../src/game/types";
import {
  WITHERED_HEATH as H,
  WITHERED_HEATH_MAIN_QUESTS,
  witheredHeathDragon,
} from "../src/game/withered-heath-support";
export function reload(s: GameState) {
  syncSeat(s);
  const json = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(json), "Withered Heath save validates");
  const restored = restoreSave(json);
  assert.ok(restored, "Withered Heath save restores");
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
    let i = 0;
    s.status === "playing" && (s.choice || s.flow?.pending);
    i++
  ) {
    assert.ok(i < 500, "Heath decisions terminate");
    s = s.flow?.pending
      ? applyAction(reload(s), { type: "CONTINUE", stepId: s.flow.pending.id })
      : choose(
          s,
          s.choice!.options.find((o) => o.id === preferred)?.id ??
            s.choice!.options.find((o) => o.id === "resolve")?.id ??
            s.choice!.options.find((o) => o.id === "skip")?.id ??
            s.choice!.options[0].id,
        );
  }
  return s;
}
export function start(players = 1, easy = false) {
  const d = STARTERS[0];
  let s = createGame(44819, d.cards, d.heroes, d.id, {
    scenarioId: "the-withered-heath",
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
    assert.ok(i < 500, "Heath setup terminates");
    s = applyAction(
      s,
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
    stageRevealing: false,
    encounterDeck: Array(30).fill(H.pass),
    encounterDiscard: [],
  });
  if (s.flow) s.flow.pending = null;
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      s.allies = [];
      s.engaged = [];
      s.hand = [];
      s.discard = [];
      s.used = [];
      s.committedIds = [];
      for (const h of s.heroes)
        Object.assign(h, {
          damage: 0,
          exhausted: false,
          resources: 10,
          attachments: [],
          committed: false,
          tempDefense: 0,
          tempAttack: 0,
          tempWill: 0,
        });
    });
  selectSeat(s, 0);
  if (s.table) {
    s.table.first = 0;
    s.table.turn = 0;
    s.table.passed = [];
  }
  return s;
}
export function setStage(s: GameState, n: number) {
  const q = s.witheredHeath!,
    dragon = witheredHeathDragon(s)!;
  s.stage = n;
  s.progress = 0;
  s.stageRevealing = false;
  q.currentQuest = WITHERED_HEATH_MAIN_QUESTS[n - 1];
  q.completedQuests = WITHERED_HEATH_MAIN_QUESTS.slice(0, n - 1);
  q.questDeck = WITHERED_HEATH_MAIN_QUESTS.slice(n);
  q.advancing = false;
  q.setAside = q.setAside.filter((u) => u.id !== dragon.id);
  s.staging = s.staging.filter((u) => u.id !== dragon.id);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.engaged = s.engaged.filter((u) => u.id !== dragon.id);
    });
  if (n === 2 || n === 4) s.staging.push(dragon);
  else q.setAside.push(dragon);
  return dragon;
}
/** Move actual objectives to victory, keeping every other sign in its physical zone. */
export function scoreSigns(s: GameState, count: number) {
  const q = s.witheredHeath!;
  s.victoryCards ??= [];
  for (let i = 0; i < count; i++) {
    const pile = q.cavesDeck.some((u) => u.code === H.sign)
      ? q.cavesDeck
      : q.setAside;
    const j = pile.findIndex((u) => u.code === H.sign);
    assert.ok(j >= 0, "physical Dragon Sign exists");
    pile.splice(j, 1);
    s.victoryCards.push(H.sign);
    s.victory++;
  }
}
export function travelFixture() {
  const s = base(),
    q = s.witheredHeath!;
  s.phase = "travel";
  const location = make(s, H.entrance);
  s.staging.push(location);
  const i = q.cavesDeck.findIndex((u) => u.code === H.sign),
    sign = q.cavesDeck.splice(i, 1)[0];
  q.cavesDeck.unshift(sign);
  s.encounterDeck = [H.snow, H.hatchling, H.pass, H.pass];
  syncSeat(s);
  return { s, location, sign };
}
export function finalFixture() {
  const s = base(),
    boss = setStage(s, 4);
  scoreSigns(s, 3);
  boss.damage = 17;
  s.phase = "attack";
  s.staging = s.staging.filter((u) => u.id !== boss.id);
  boss.owner = activeSeat(s);
  s.engaged.push(boss);
  s.heroes[0].tempAttack = 30;
  s.encounterDeck = [H.pass, H.pass];
  syncSeat(s);
  return { s, boss, hero: s.heroes[0] };
}
