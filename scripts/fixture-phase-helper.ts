import { applyAction as rawApplyAction } from "../src/game/engine";
import type { Action, GameState } from "../src/game/types";

/** Explicit fixture preparation; browser interactions keep resource visible. */
export function passResourceWindow(state: GameState): GameState {
  for (
    let i = 0;
    i < 8 &&
    state.phase === "resource" &&
    !state.choice &&
    !state.flow?.pending &&
    state.status === "playing";
    i++
  )
    state = rawApplyAction(state, { type: "NEXT" });
  return state;
}

/** Legacy planning fixtures opt in, without choosing pending responses. */
export function applyPlanningFixtureAction(
  state: GameState,
  action: Action,
): GameState {
  return passResourceWindow(rawApplyAction(state, action));
}
