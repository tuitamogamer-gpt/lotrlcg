import type { GameState, Unit } from "./types";
import {
  riverRunningUnits,
  riverRunningPublicState,
} from "./river-running-support";
import {
  dangerDorwinionUnits,
  dangerDorwinionPublicState,
} from "./danger-dorwinion-support";
import { templeDoomUnits, templeDoomPublicState } from "./temple-doom-support";

/** Physical scenario cards held outside the ordinary table zones. */
export function shadowEastScenarioUnits(s: GameState): Unit[] {
  return [
    ...riverRunningUnits(s),
    ...dangerDorwinionUnits(s),
    ...templeDoomUnits(s),
  ];
}

/** Hidden cards and deck orders are projected as counts by each scenario. */
export function shadowEastScenarioPublicState(s: GameState) {
  return {
    ...(s.riverRunning ? { riverRunning: riverRunningPublicState(s) } : {}),
    ...(s.dangerDorwinion
      ? { dangerDorwinion: dangerDorwinionPublicState(s) }
      : {}),
    ...(s.templeDoom ? { templeDoom: templeDoomPublicState(s) } : {}),
  };
}
