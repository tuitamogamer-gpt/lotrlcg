import type { GameState, Effect } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { BLACK_SERPENT_HOOKS } from "./black-serpent";
import { CIRITH_GURAT_HOOKS } from "./cirith-gurat";
import { CROSSINGS_POROS_HOOKS } from "./crossings-poros";
import { WILDS_RHOVANION_HOOKS } from "./wilds-rhovanion";
import { WITHERED_HEATH_HOOKS } from "./withered-heath";
import { ROAM_RHOVANION_HOOKS } from "./roam-rhovanion";
import { FIRE_NIGHT_HOOKS } from "./fire-night";
import { GHOST_FRAMSBURG_HOOKS } from "./ghost-framsburg";
import { MOUNT_GUNDABAD_HOOKS } from "./mount-gundabad";
import { FATE_WILDERLAND_HOOKS } from "./fate-wilderland";

const empty: Batch4ScenarioHooks = {};
export function batch4Scenario(s: GameState): Batch4ScenarioHooks {
  switch (s.scenarioId) {
    case "mount-gundabad":
      return MOUNT_GUNDABAD_HOOKS;
    case "the-fate-of-wilderland":
      return FATE_WILDERLAND_HOOKS;
    case "the-withered-heath":
      return WITHERED_HEATH_HOOKS;
    case "roam-across-rhovanion":
      return ROAM_RHOVANION_HOOKS;
    case "fire-in-the-night":
      return FIRE_NIGHT_HOOKS;
    case "the-ghost-of-framsburg":
      return GHOST_FRAMSBURG_HOOKS;
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
    WITHERED_HEATH_HOOKS,
    ROAM_RHOVANION_HOOKS,
    FIRE_NIGHT_HOOKS,
    GHOST_FRAMSBURG_HOOKS,
    MOUNT_GUNDABAD_HOOKS,
    FATE_WILDERLAND_HOOKS,
  ].some((hooks) => hooks.sharedEffect?.(effect));
