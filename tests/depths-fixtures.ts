import assert from "node:assert/strict";
import { createGame, applyAction } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { make } from "../src/game/core";
import { advanceQuest, progressLocation } from "../src/game/board";
import { flush } from "../src/game/effects";
import { forOwner } from "../src/game/table";
import {
  base as common,
  choose,
  reload,
} from "./against-shadow-final-fixtures";
import { DEPTHS as D, DEPTHS_MAIN_QUESTS } from "../src/game/depths-support";
import { setupDepths } from "../src/game/depths";
import type { GameState } from "../src/game/types";
export { choose, reload };
export function settle(s: GameState) {
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 180, "Depths choices terminate");
    s = choose(
      reload(s),
      s.choice.options.find(
        (o) => o.id === "continue" || o.id === "skip" || o.id === "resolve",
      )?.id ?? s.choice.options[0].id,
    );
  }
  return s;
}
export function start(players = 1, easy = false) {
  const d = STARTERS[0];
  let s = createGame(49, d.cards, d.heroes, d.id, {
    scenarioId: "the-thing-in-the-depths",
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
  for (let i = 0; s.phase === "setup"; i++) {
    assert.ok(i < 100, "opening decisions terminate");
    s = applyAction(
      reload(s),
      s.choice
        ? { type: "CHOOSE", id: s.choice.options[0].id }
        : { type: "KEEP" },
    );
  }
  return settle(s);
}
export function base(players = 1, easy = false) {
  const s = common("the-thing-in-the-depths", players);
  s.easyMode = easy;
  setupDepths(s);
  const q = s.depths!;
  q.initialized = true;
  const opening = q.setAside.filter((u) => [D.helm, D.raider].includes(u.code));
  q.setAside = q.setAside.filter((u) => !opening.includes(u));
  s.staging.push(...opening);
  return s;
}
export function setStage(s: GameState, stage: number) {
  const q = s.depths!;
  s.stage = stage;
  s.progress = 0;
  s.stageRevealing = false;
  q.advancing = false;
  q.completedQuests = DEPTHS_MAIN_QUESTS.slice(0, stage - 1);
  q.currentQuest = DEPTHS_MAIN_QUESTS[stage - 1];
  q.questDeck = DEPTHS_MAIN_QUESTS.slice(stage);
  return s;
}
export function stage3(players = 1, easy = false) {
  let s = base(players, easy);
  s.phase = "staging";
  const helm = s.staging.find((u) => u.code === D.helm)!;
  progressLocation(s, helm, 100);
  s.staging.push(make(s, D.cargo));
  s.progress = 4;
  advanceQuest(s);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 3, "actual stage transition completes");
  s.phase = "planning";
  s.queue = [];
  s.choice = null;
  s.combat = null;
  s.suspendedCombats = [];
  return s;
}
export function add(
  s: GameState,
  code: string,
  zone: "staging" | "allies" | "engaged" = "staging",
  player = 0,
) {
  const u = make(s, code);
  if (zone === "staging") s.staging.push(u);
  else
    forOwner(s, player, () => {
      u.owner = player;
      if (zone === "allies") u.controller = player;
      s[zone].push(u);
    });
  return u;
}
