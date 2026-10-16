import type { GameState, Effect } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { BLACK_SERPENT_HOOKS } from "./black-serpent";
import { CIRITH_GURAT_HOOKS } from "./cirith-gurat";
import { CROSSINGS_POROS_HOOKS } from "./crossings-poros";
import { WILDS_RHOVANION_HOOKS } from "./wilds-rhovanion";

const empty: Batch4ScenarioHooks = {};
export function batch4Scenario(s: GameState): Batch4ScenarioHooks {
  switch (s.scenarioId) {
    case "the-black-serpent":
      return BLACK_SERPENT_HOOKS;
    case "the-dungeons-of-cirith-gurat":
      return CIRITH_GURAT_HOOKS;
    case "the-crossings-of-poros":
      return CROSSINGS_POROS_HOOKS;
    case "journey-up-the-anduin":
    case "lost-in-mirkwood":
    case "the-kings-quest":
      return WILDS_RHOVANION_HOOKS;
    default:
      return empty;
  }
}
export const batch4SharedEffect = (effect: Effect) =>
  [
    BLACK_SERPENT_HOOKS,
    CIRITH_GURAT_HOOKS,
    CROSSINGS_POROS_HOOKS,
    WILDS_RHOVANION_HOOKS,
  ].some((hooks) => hooks.sharedEffect?.(effect));
