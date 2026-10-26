import assert from "node:assert/strict";
import {
  applyAction,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { playerCards } from "../src/game/cards";
import { hasEncounterKeyword } from "../src/game/encounter-keyword";
import { syncSeat } from "../src/game/table";
import type { Action, GameState, ScenarioId } from "../src/game/types";
import { BURGLAR_CONTRACT } from "../src/game/burglar-contract-support";

export const DEFAULT_LOOT = [
  "01040",
  "01039",
  "01041",
  "01042",
  "01027",
  "07009",
  "07010",
  "08029",
  "08034",
  "08064",
  "08088",
  "08118",
  "08120",
  "22008",
];
export const BURGLAR_HEROES = [
  ["01001", "01002", "01003"],
  ["01004", "01005", "01006"],
  ["01007", "01008", "01009"],
  ["01010", "01011", "01012"],
];
export function burglarMainDeck(): Record<string, number> {
  const eligible = playerCards
    .filter(
      (c) =>
        ["ally", "event"].includes(c.type_code) &&
        !hasEncounterKeyword(c) &&
        c.sphere_code !== "encounter",
    )
    .slice(0, 17);
  return {
    ...Object.fromEntries(
      eligible.map((c, index) => [c.code, index === 16 ? 2 : 3]),
    ),
    [BURGLAR_CONTRACT]: 1,
  };
}
export function reload(s: GameState): GameState {
  syncSeat(s);
  assert.ok(validateSave(s), "the real suspended contract state validates");
  const restored = restoreSave(JSON.parse(JSON.stringify(s)));
  assert.ok(restored);
  return restored;
}
export const act = (s: GameState, action: Action) =>
  applyAction(reload(s), action);
export const pick = (s: GameState, id: string) =>
  act(s, { type: "CHOOSE", id });
export function settle(s: GameState, preferred = "skip"): GameState {
  for (
    let i = 0;
    s.status === "playing" && (s.choice || s.flow?.pending);
    i++
  ) {
    assert.ok(i < 250, "contract decisions terminate");
    s = act(
      s,
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : {
            type: "CHOOSE",
            id:
              s.choice!.options.find((o) => o.id === preferred)?.id ??
              s.choice!.options.find((o) => o.id === "resolve")?.id ??
              s.choice!.options[0].id,
          },
    );
  }
  return s;
}
export function createBurglarGame(
  players = 1,
  scenarioId: ScenarioId = "mirkwood",
): GameState {
  const deck = burglarMainDeck();
  let s = createGame(4242, deck, BURGLAR_HEROES[0], "custom", {
    scenarioId,
    burglarLoot: Object.fromEntries(
      Array.from({ length: players }, (_, player) => [
        player,
        [...DEFAULT_LOOT],
      ]),
    ),
    ...(players > 1
      ? {
          seats: Array.from({ length: players }, (_, player) => ({
            name: `Player ${player + 1}`,
            heroes: BURGLAR_HEROES[player],
            cards: deck,
            deckId: "custom",
          })),
        }
      : {}),
  });
  while (s.phase === "setup" && s.status === "playing") {
    s = settle(s);
    if (s.phase === "setup") s = act(s, { type: "KEEP" });
  }
  return settle(s);
}
