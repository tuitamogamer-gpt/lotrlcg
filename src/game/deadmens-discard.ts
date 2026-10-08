import { DIKE } from "./deadmens-dike-support";
import type { GameState } from "./types";

export const DIKE_DISCARD_REASON =
  "The Power of Angmar prevents player card effects from moving cards out of discard piles.";

/** This global restriction applies even when another quest is the current quest. */
export function dikeCannotLeaveDiscard(s: GameState, _owner?: number): boolean {
  return s.staging.some((u) => u.code === DIKE.power && !u.blanked);
}
