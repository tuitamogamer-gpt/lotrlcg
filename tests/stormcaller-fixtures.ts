import assert from "node:assert/strict";
import { createGame, applyAction } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { make } from "../src/game/core";
import { allCharacters, forOwner, playerOrder } from "../src/game/table";
import {
  STORMCALLER as V,
  STORMCALLER_SHIPS,
  STORMCALLER_MAIN_QUESTS,
  STORMCALLER_ENEMY_QUESTS,
} from "../src/game/stormcaller-support";
import {
  base as fixture,
  choose,
  reload,
} from "./against-shadow-final-fixtures";
import { stormcallerSyncArea } from "../src/game/stormcaller";
import type { GameState } from "../src/game/types";
export { choose, reload };
export function settle(s: GameState) {
  for (let n = 0; s.choice && s.status === "playing"; n++) {
    assert.ok(n < 200, "Stormcaller decisions terminate");
    s = choose(
      reload(s),
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  return s;
}
export function start(players = 1, easy = false) {
  const d = STARTERS[0];
  let s = createGame(41, d.cards, d.heroes, d.id, {
    scenarioId: "flight-of-the-stormcaller",
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
  for (let n = 0; s.phase === "setup"; n++) {
    assert.ok(n < 100, "opening decisions terminate");
    s = applyAction(
      reload(s),
      s.choice
        ? { type: "CHOOSE", id: s.choice.options[0].id }
        : { type: "KEEP" },
    );
  }
  return settle(s);
}
export function base(players = 1) {
  const s = fixture("flight-of-the-stormcaller", players);
  const q = s.stormcaller!;
  q.setAside = STORMCALLER_SHIPS.map((c) => make(s, c));
  q.initialized = true;
  q.advancing = false;
  s.sailing = { heading: 0 };
  forOwner(s, 0, () => {
    const dream =
      q.setAside.find((u) => u.code === V.dream) ?? make(s, V.dream);
    q.setAside = q.setAside.filter((u) => u.code !== V.dream);
    dream.owner = 0;
    dream.controller = 0;
    if (!dream.attachments.some((a) => a.code === V.heading))
      dream.attachments.push({
        id: `c${s.nextId++}`,
        code: V.heading,
        exhausted: false,
      });
    s.allies.push(dream);
  });
  if (players === 1) {
    const companion =
      q.setAside.find((u) => u.code === V.narelenya) ?? make(s, V.narelenya);
    q.setAside = q.setAside.filter((u) => u.code !== companion.code);
    companion.owner = 0;
    companion.controller = 0;
    s.allies.push(companion);
  } else
    for (const player of playerOrder(s).slice(1))
      forOwner(s, player, () => {
        const unit = q.setAside.shift()!;
        unit.owner = player;
        unit.controller = player;
        s.allies.push(unit);
      });
  for (const u of allCharacters(s)) u.exhausted = false;
  return s;
}

export function setPlayerStage(s: GameState, stage: number) {
  const q = s.stormcaller!;
  q.completedQuests = STORMCALLER_MAIN_QUESTS.slice(0, stage - 1);
  q.currentQuest = STORMCALLER_MAIN_QUESTS[stage - 1];
  q.questDeck = STORMCALLER_MAIN_QUESTS.slice(stage);
  s.stage = stage;
  s.progress = 0;
  q.advancing = false;
  s.stageRevealing = false;
  stormcallerSyncArea(s);
  return s;
}
export function setEnemyStage(s: GameState, stage: number) {
  const q = s.stormcaller!;
  q.enemyCompletedQuests = STORMCALLER_ENEMY_QUESTS.slice(0, stage - 2);
  q.enemyQuest = STORMCALLER_ENEMY_QUESTS[stage - 2];
  q.enemyQuestDeck = STORMCALLER_ENEMY_QUESTS.slice(stage - 1);
  q.enemyStage = stage;
  q.enemyProgress = 0;
  stormcallerSyncArea(s);
  return s;
}
