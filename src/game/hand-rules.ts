import type { GameState, Unit } from "./types";
import { batch4Scenario } from "./batch4-scenarios";
import { FORDS } from "./fords-isen-support";

/** Ill Tidings is still counted in hand, but cannot be discarded, traded or put in a deck. */
export const canLeaveHand = (u: Unit) => u.code !== FORDS.tidings;
export const movableHand = (s: Pick<GameState, "hand">) =>
  s.hand.filter(canLeaveHand);

/** Player-card discard costs and effects obey scenario-specific hand restrictions. */
export function discardableHand(s: GameState) {
  return s.hand.filter(
    (u) =>
      canLeaveHand(u) && !batch4Scenario(s).cannotDiscardHand?.(s, u, true),
  );
}
