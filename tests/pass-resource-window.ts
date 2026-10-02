import { applyAction as engineAction } from "../src/game/engine.ts";
import type { Action, GameState } from "../src/game/types.ts";

/** Existing scenario policies and card fixtures elect to pass the added resource
 * action window. Every pass uses the real engine; mandatory choices and event
 * reviews stay visible. Dedicated resource-phase tests use engineAction directly.
 */
export function applyAction(s: GameState, action: Action): GameState {
  let next = engineAction(s, action);
  let passes = 0;
  while (
    next.status === "playing" &&
    next.phase === "resource" &&
    !next.choice &&
    !next.flow?.pending &&
    !next.queue.length
  ) {
    if (++passes > 4) throw new Error("Resource handoff did not finish.");
    next = engineAction(next, { type: "NEXT" });
  }
  return next;
}
