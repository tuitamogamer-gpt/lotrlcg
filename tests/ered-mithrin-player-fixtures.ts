import assert from "node:assert/strict";
import { base, reload, choose } from "./against-shadow-final-fixtures";
import { make } from "../src/game/core";
import { applyAction } from "../src/game/engine";
import { activeSeat, forOwner, playerOrder, syncSeat } from "../src/game/table";
import type { Action, GameState } from "../src/game/types";
export { reload, choose };
export {
  drownedPlayerAlly as ally,
  drownedPlayerHand as hand,
  drownedPlayerAttach as attach,
} from "./drowned-player-fixtures";
export function fixture(players = 1) {
  const s = base("mirkwood", players),
    groups = [
      ["19001", "19026", "19056"],
      ["19084", "01007", "01012"],
      ["01001", "01002", "01004"],
      ["01003", "01005", "01009"],
    ];
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.heroes = groups[p].map((c) => make(s, c));
      s.startingHeroes = s.heroes.map((h) => h.code);
      for (const h of s.heroes) {
        h.resources = 15;
        h.phaseResourceIcons = ["leadership", "tactics", "spirit", "lore"];
      }
    });
  (
    s as GameState & { eredEagleReserves?: Record<number, number> }
  ).eredEagleReserves = Object.fromEntries(playerOrder(s).map((p) => [p, 3]));
  s.rangerReserves = Object.fromEntries(playerOrder(s).map((p) => [p, 0]));
  s.batch4WindReserves = Object.fromEntries(playerOrder(s).map((p) => [p, 0]));
  if (s.flow) s.flow.pending = null;
  syncSeat(s);
  return s;
}
export const act = (s: GameState, a: Action) => applyAction(reload(s), a);
export const pick = (s: GameState, id: string) => choose(reload(s), id);
export function settle(s: GameState, preferred?: string) {
  for (
    let n = 0;
    s.status === "playing" && (s.choice || s.flow?.pending);
    n++
  ) {
    assert.ok(n < 200, "player decisions terminate");
    s = act(
      s,
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
export const play = (s: GameState, id: string, target?: string) => {
  if (s.table) s.table.turn = activeSeat(s);
  return act(s, { type: "PLAY", id, target });
};
export const ability = (s: GameState, id: string, attachmentId?: string) =>
  act(s, { type: "ABILITY", id, attachmentId } as Action);
export function owner(s: GameState) {
  return activeSeat(s);
}
