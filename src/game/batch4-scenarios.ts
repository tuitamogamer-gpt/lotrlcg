import { FORTRESS_NURN_HOOKS } from "./fortress-nurn";
import { MASSING_HOOKS } from "./massing-osgiliath";
import { WMA_HOOKS } from "./we-must-away";
import { OMM_HOOKS } from "./misty-mountains";
import { DDCD_HOOKS } from "./dungeons-deep";
import { FAS_HOOKS } from "./flies-spiders";
import { TLM_HOOKS } from "./lonely-mountain";
import { BOFA_HOOKS } from "./battle-five-armies";
import { LAKE_TOWN_HOOKS } from "./lake-town";
import { SHADOW_PAST_HOOKS } from "./shadow-past";
import { KNIFE_DARK_HOOKS } from "./knife-dark";
import { LAND_SORROW_HOOKS } from "./land-sorrow";
import { ASH_HOOKS } from "./ash-mountains";
import { WAINRIDERS_HOOKS } from "./wainriders";
import { ULFAST_HOOKS } from "./ulfast";
import { WRATH_RUIN_HOOKS } from "./wrath-ruin";
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
import { RIVER_RUNNING_HOOKS } from "./river-running";
import { DANGER_DORWINION_HOOKS } from "./danger-dorwinion";
import { TEMPLE_DOOM_HOOKS } from "./temple-doom";

const empty: Batch4ScenarioHooks = {};
export function batch4Scenario(s: GameState): Batch4ScenarioHooks {
  switch (s.scenarioId) {
    case "the-fortress-of-nurn":
      return FORTRESS_NURN_HOOKS;
    case "the-massing-at-osgiliath":
      return MASSING_HOOKS;
    case "we-must-away-ere-break-of-day":
      return WMA_HOOKS;
    case "over-the-misty-mountains-grim":
      return OMM_HOOKS;
    case "dungeons-deep-and-caverns-dim":
      return DDCD_HOOKS;
    case "flies-and-spiders":
      return FAS_HOOKS;
    case "the-lonely-mountain":
      return TLM_HOOKS;
    case "the-battle-of-five-armies":
      return BOFA_HOOKS;
    case "the-battle-of-lake-town":
      return LAKE_TOWN_HOOKS;
    case "a-shadow-of-the-past":
      return SHADOW_PAST_HOOKS;
    case "a-knife-in-the-dark":
      return KNIFE_DARK_HOOKS;
    case "the-land-of-sorrow":
      return LAND_SORROW_HOOKS;
    case "under-the-ash-mountains":
      return ASH_HOOKS;
    case "challenge-of-the-wainriders":
      return WAINRIDERS_HOOKS;
    case "the-city-of-ulfast":
      return ULFAST_HOOKS;
    case "wrath-and-ruin":
      return WRATH_RUIN_HOOKS;
    case "the-river-running":
      return RIVER_RUNNING_HOOKS;
    case "danger-in-dorwinion":
      return DANGER_DORWINION_HOOKS;
    case "temple-of-doom":
      return TEMPLE_DOOM_HOOKS;
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
    RIVER_RUNNING_HOOKS,
    DANGER_DORWINION_HOOKS,
    TEMPLE_DOOM_HOOKS,
    WRATH_RUIN_HOOKS,
    ULFAST_HOOKS,
    WAINRIDERS_HOOKS,
    ASH_HOOKS,
    LAND_SORROW_HOOKS,
    FORTRESS_NURN_HOOKS,
    MASSING_HOOKS,
    WMA_HOOKS,
    OMM_HOOKS,
    DDCD_HOOKS,
    FAS_HOOKS,
    TLM_HOOKS,
    BOFA_HOOKS,
    LAKE_TOWN_HOOKS,
    SHADOW_PAST_HOOKS,
    KNIFE_DARK_HOOKS,
  ].some((hooks) => hooks.sharedEffect?.(effect));
