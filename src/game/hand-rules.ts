import type { GameState, Unit } from "./types";
import { FORDS } from "./fords-isen-support";

/** Ill Tidings is still counted in hand, but cannot be discarded, traded or put in a deck. */
export const canLeaveHand = (u: Unit) => u.code !== FORDS.tidings;
export const movableHand = (s: Pick<GameState, "hand">) =>
  s.hand.filter(canLeaveHand);
