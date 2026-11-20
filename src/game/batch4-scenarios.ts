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
import { FLIGHT_FORD_HOOKS } from "./flight-ford";
import { STONE_ERECH_HOOKS } from "./stone-erech";
import { OLD_FOREST_HOOKS } from "./old-forest";
import { RING_SOUTH_HOOKS } from "./ring-south";
import { JOURNEY_DARK_HOOKS } from "./journey-dark";
import { BREAKING_FELLOWSHIP_HOOKS } from "./breaking-fellowship";
import { FOG_BARROW_HOOKS } from "./fog-barrow";
import { URUK_HAI_HOOKS } from "./uruk-hai";
import { SHELOB_LAIR_HOOKS } from "./shelob-lair";
import { GREY_COMPANY_HOOKS } from "./grey-company";
import { SIEGE_GONDOR_HOOKS } from "./siege-gondor";
import { PELENNOR_FIELDS_HOOKS } from "./pelennor-fields";
import { CIRITH_UNGOL_HOOKS } from "./cirith-ungol";
import { BLACK_GATE_HOOKS } from "./black-gate";
import { MOUNT_DOOM_HOOKS } from "./mount-doom";
import { OATH_HOOKS } from "./the-oath";
import { RUINS_BELEGOST_HOOKS } from "./ruins-belegost";
import { PRANCING_PONY_HOOKS } from "./prancing-pony";
import { ANNUMINAS_HOOKS } from "./annuminas";
import { ATTACK_DOL_GULDUR_HOOKS } from "./attack-dol-guldur";
import { CAVES_HOOKS } from "./caves-nibin-dum";
import { WIZARDS_QUEST_HOOKS } from "./wizards-quest";
import { WOODLAND_REALM_HOOKS } from "./woodland-realm";
import { MINES_MORIA_HOOKS } from "./mines-moria";
import { ESCAPE_KHAZAD_HOOKS } from "./escape-khazad";
import { HUNT_DREADNAUGHT_HOOKS } from "./hunt-dreadnaught";
import { HELMS_DEEP_HOOKS } from "./helms-deep";
import { ROAD_ISENGARD_HOOKS } from "./road-isengard";
import { PASSAGE_MARSHES_HOOKS } from "./passage-marshes";
import { CROSS_ROADS_HOOKS } from "./cross-roads";
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
import {
  ERED_POOL_HOOKS,
  composeEredPool,
  eredPoolLive,
} from "./ered-campaign-pool";
import { NIGHTMARE_CORE_HOOKS } from "./nightmare-core";
import { NIGHTMARE_SOM_HOOKS } from "./nightmare-som";
import { NIGHTMARE_RHOS_HOOKS } from "./nightmare-rhosgobel";
import { NIGHTMARE_EMYN_HOOKS } from "./nightmare-emyn";
import { NIGHTMARE_DEAD_HOOKS } from "./nightmare-dead";
import { NIGHTMARE_RTM_HOOKS } from "./nightmare-rtm";
import { NIGHTMARE_PIT_HOOKS } from "./nightmare-pit";
import { NIGHTMARE_SEVENTH_HOOKS } from "./nightmare-seventh";
import { NIGHTMARE_FLIGHT_HOOKS } from "./nightmare-flight";
import { NIGHTMARE_REDHORN_HOOKS } from "./nightmare-redhorn";
import { NIGHTMARE_RIVENDELL_HOOKS } from "./nightmare-rivendell";
import { NIGHTMARE_WATCHER_HOOKS } from "./nightmare-watcher";
import { NIGHTMARE_LONG_DARK_HOOKS } from "./nightmare-longdark";
import { NIGHTMARE_FOUNDATIONS_HOOKS } from "./nightmare-foundations";
import { NIGHTMARE_SHADOW_FLAME_HOOKS } from "./nightmare-shadowflame";
import { NIGHTMARE_PELARGIR_HOOKS } from "./nightmare-pelargir";
import { NIGHTMARE_ITHILIEN_HOOKS } from "./nightmare-ithilien";
import { NIGHTMARE_CAIR_ANDROS_HOOKS } from "./nightmare-cairandros";
import { NIGHTMARE_STEWARD_HOOKS } from "./nightmare-steward";
import { NIGHTMARE_DRUADAN_HOOKS } from "./nightmare-druadan";
import { NIGHTMARE_AMONDIN_HOOKS } from "./nightmare-amondin";
import { NIGHTMARE_OSGILIATH_HOOKS } from "./nightmare-osgiliath";
import { NIGHTMARE_BLOOD_HOOKS } from "./nightmare-blood";
import { NIGHTMARE_MORGUL_HOOKS } from "./nightmare-morgul";
import { NIGHTMARE_WMA_HOOKS } from "./nightmare-wma";
import { NIGHTMARE_OMM_HOOKS } from "./nightmare-omm";
import { NIGHTMARE_DDCD_HOOKS } from "./nightmare-ddcd";
import { NIGHTMARE_FAS_HOOKS } from "./nightmare-fas";
import { NIGHTMARE_TLM_HOOKS } from "./nightmare-tlm";
import { NIGHTMARE_BOFA_HOOKS } from "./nightmare-bofa";
import { NIGHTMARE_FORDS_HOOKS } from "./nightmare-fords";
import { NIGHTMARE_CATCH_HOOKS } from "./nightmare-catch";
import { NIGHTMARE_FANGORN_HOOKS } from "./nightmare-fangorn";
import { NIGHTMARE_DUNLAND_HOOKS } from "./nightmare-dunland";
import { NIGHTMARE_TRIALS_HOOKS } from "./nightmare-trials";
import { NIGHTMARE_THARBAD_HOOKS } from "./nightmare-tharbad";
import { NIGHTMARE_NIN_HOOKS } from "./nightmare-nin";
import { NIGHTMARE_CELEB_HOOKS } from "./nightmare-celeb";
import { nightmareLive } from "./nightmare";

const empty: Batch4ScenarioHooks = {};
const pooled = new WeakMap<Batch4ScenarioHooks, Batch4ScenarioHooks>();
const nightmares = new Map<
  Batch4ScenarioHooks,
  WeakMap<Batch4ScenarioHooks, Batch4ScenarioHooks>
>();
/** The Nightmare Deck layer of a scenario (by product). */
const NIGHTMARE_LAYERS: Partial<Record<string, Batch4ScenarioHooks>> = {
  mirkwood: NIGHTMARE_CORE_HOOKS,
  anduin: NIGHTMARE_CORE_HOOKS,
  "dol-guldur": NIGHTMARE_CORE_HOOKS,
  "hunt-for-gollum": NIGHTMARE_SOM_HOOKS,
  "conflict-at-the-carrock": NIGHTMARE_SOM_HOOKS,
  "journey-to-rhosgobel": NIGHTMARE_RHOS_HOOKS,
  "hills-of-emyn-muil": NIGHTMARE_EMYN_HOOKS,
  "dead-marshes": NIGHTMARE_DEAD_HOOKS,
  "return-to-mirkwood": NIGHTMARE_RTM_HOOKS,
  "into-the-pit": NIGHTMARE_PIT_HOOKS,
  "the-seventh-level": NIGHTMARE_SEVENTH_HOOKS,
  "flight-from-moria": NIGHTMARE_FLIGHT_HOOKS,
  "redhorn-gate": NIGHTMARE_REDHORN_HOOKS,
  "road-to-rivendell": NIGHTMARE_RIVENDELL_HOOKS,
  "watcher-in-the-water": NIGHTMARE_WATCHER_HOOKS,
  "the-long-dark": NIGHTMARE_LONG_DARK_HOOKS,
  "foundations-of-stone": NIGHTMARE_FOUNDATIONS_HOOKS,
  "shadow-and-flame": NIGHTMARE_SHADOW_FLAME_HOOKS,
  "peril-in-pelargir": NIGHTMARE_PELARGIR_HOOKS,
  "into-ithilien": NIGHTMARE_ITHILIEN_HOOKS,
  "siege-of-cair-andros": NIGHTMARE_CAIR_ANDROS_HOOKS,
  "the-stewards-fear": NIGHTMARE_STEWARD_HOOKS,
  "the-druadan-forest": NIGHTMARE_DRUADAN_HOOKS,
  "encounter-at-amon-din": NIGHTMARE_AMONDIN_HOOKS,
  "assault-on-osgiliath": NIGHTMARE_OSGILIATH_HOOKS,
  "the-blood-of-gondor": NIGHTMARE_BLOOD_HOOKS,
  "the-morgul-vale": NIGHTMARE_MORGUL_HOOKS,
  "we-must-away-ere-break-of-day": NIGHTMARE_WMA_HOOKS,
  "over-the-misty-mountains-grim": NIGHTMARE_OMM_HOOKS,
  "dungeons-deep-and-caverns-dim": NIGHTMARE_DDCD_HOOKS,
  "flies-and-spiders": NIGHTMARE_FAS_HOOKS,
  "the-lonely-mountain": NIGHTMARE_TLM_HOOKS,
  "the-battle-of-five-armies": NIGHTMARE_BOFA_HOOKS,
  "fords-of-isen": NIGHTMARE_FORDS_HOOKS,
  "to-catch-an-orc": NIGHTMARE_CATCH_HOOKS,
  "into-fangorn": NIGHTMARE_FANGORN_HOOKS,
  "the-dunland-trap": NIGHTMARE_DUNLAND_HOOKS,
  "the-three-trials": NIGHTMARE_TRIALS_HOOKS,
  "trouble-in-tharbad": NIGHTMARE_THARBAD_HOOKS,
  "the-nin-in-eilph": NIGHTMARE_NIN_HOOKS,
  "celebrimbors-secret": NIGHTMARE_CELEB_HOOKS,
};
/**
 * The current scenario's hooks; in an Ered Mithrin campaign chapter from The
 * Withered Heath on, composed with the Campaign Pool's foreign cards, and in
 * Nightmare mode with the Nightmare Deck's cards (the same composition).
 */
export function batch4Scenario(s: GameState): Batch4ScenarioHooks {
  const hooks = scenarioHooks(s);
  const layer = nightmareLive(s) ? NIGHTMARE_LAYERS[s.scenarioId] : undefined;
  if (layer) {
    let cache = nightmares.get(layer);
    if (!cache) nightmares.set(layer, (cache = new WeakMap()));
    let composed = cache.get(hooks);
    if (!composed) cache.set(hooks, (composed = composeEredPool(hooks, layer)));
    return composed;
  }
  if (!eredPoolLive(s)) return hooks;
  let composed = pooled.get(hooks);
  if (!composed) pooled.set(hooks, (composed = composeEredPool(hooks)));
  return composed;
}
function scenarioHooks(s: GameState): Batch4ScenarioHooks {
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
    case "flight-to-the-ford":
      return FLIGHT_FORD_HOOKS;
    case "the-stone-of-erech":
      return STONE_ERECH_HOOKS;
    case "the-old-forest":
      return OLD_FOREST_HOOKS;
    case "the-ring-goes-south":
      return RING_SOUTH_HOOKS;
    case "journey-in-the-dark":
      return JOURNEY_DARK_HOOKS;
    case "breaking-of-the-fellowship":
      return BREAKING_FELLOWSHIP_HOOKS;
    case "fog-on-the-barrow-downs":
      return FOG_BARROW_HOOKS;
    case "the-uruk-hai":
      return URUK_HAI_HOOKS;
    case "helms-deep":
      return HELMS_DEEP_HOOKS;
    case "the-road-to-isengard":
      return ROAD_ISENGARD_HOOKS;
    case "the-passage-of-the-marshes":
      return PASSAGE_MARSHES_HOOKS;
    case "journey-to-the-cross-roads":
      return CROSS_ROADS_HOOKS;
    case "shelobs-lair":
      return SHELOB_LAIR_HOOKS;
    case "the-passing-of-the-grey-company":
      return GREY_COMPANY_HOOKS;
    case "the-siege-of-gondor":
      return SIEGE_GONDOR_HOOKS;
    case "the-battle-of-the-pelennor-fields":
      return PELENNOR_FIELDS_HOOKS;
    case "the-tower-of-cirith-ungol":
      return CIRITH_UNGOL_HOOKS;
    case "the-black-gate-opens":
      return BLACK_GATE_HOOKS;
    case "mount-doom":
      return MOUNT_DOOM_HOOKS;
    case "the-oath":
    case "the-oath-2018":
      return OATH_HOOKS;
    case "the-caves-of-nibin-dum":
    case "the-caves-of-nibin-dum-2018":
      return CAVES_HOOKS;
    case "the-wizards-quest":
      return WIZARDS_QUEST_HOOKS;
    case "the-woodland-realm":
      return WOODLAND_REALM_HOOKS;
    case "the-mines-of-moria":
      return MINES_MORIA_HOOKS;
    case "escape-from-khazad-dum":
      return ESCAPE_KHAZAD_HOOKS;
    case "the-hunt-for-the-dreadnaught":
      return HUNT_DREADNAUGHT_HOOKS;
    case "the-ruins-of-belegost":
      return RUINS_BELEGOST_HOOKS;
    case "murder-at-the-prancing-pony":
      return PRANCING_PONY_HOOKS;
    case "the-siege-of-annuminas":
      return ANNUMINAS_HOOKS;
    case "attack-on-dol-guldur":
      return ATTACK_DOL_GULDUR_HOOKS;
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
    ERED_POOL_HOOKS,
    NIGHTMARE_CORE_HOOKS,
    NIGHTMARE_SOM_HOOKS,
    NIGHTMARE_RHOS_HOOKS,
    NIGHTMARE_EMYN_HOOKS,
    NIGHTMARE_DEAD_HOOKS,
    NIGHTMARE_RTM_HOOKS,
    NIGHTMARE_PIT_HOOKS,
    NIGHTMARE_SEVENTH_HOOKS,
    NIGHTMARE_FLIGHT_HOOKS,
    NIGHTMARE_REDHORN_HOOKS,
    NIGHTMARE_RIVENDELL_HOOKS,
    NIGHTMARE_WATCHER_HOOKS,
    NIGHTMARE_LONG_DARK_HOOKS,
    NIGHTMARE_FOUNDATIONS_HOOKS,
    NIGHTMARE_SHADOW_FLAME_HOOKS,
    NIGHTMARE_PELARGIR_HOOKS,
    NIGHTMARE_ITHILIEN_HOOKS,
    NIGHTMARE_CAIR_ANDROS_HOOKS,
    NIGHTMARE_STEWARD_HOOKS,
    NIGHTMARE_DRUADAN_HOOKS,
    NIGHTMARE_AMONDIN_HOOKS,
    NIGHTMARE_OSGILIATH_HOOKS,
    NIGHTMARE_BLOOD_HOOKS,
    NIGHTMARE_MORGUL_HOOKS,
    NIGHTMARE_WMA_HOOKS,
    NIGHTMARE_OMM_HOOKS,
    NIGHTMARE_DDCD_HOOKS,
    NIGHTMARE_FAS_HOOKS,
    NIGHTMARE_TLM_HOOKS,
    NIGHTMARE_BOFA_HOOKS,
    NIGHTMARE_FORDS_HOOKS,
    NIGHTMARE_CATCH_HOOKS,
    NIGHTMARE_FANGORN_HOOKS,
    NIGHTMARE_DUNLAND_HOOKS,
    NIGHTMARE_TRIALS_HOOKS,
    NIGHTMARE_THARBAD_HOOKS,
    NIGHTMARE_NIN_HOOKS,
    NIGHTMARE_CELEB_HOOKS,
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
    FLIGHT_FORD_HOOKS,
    STONE_ERECH_HOOKS,
    OLD_FOREST_HOOKS,
    RING_SOUTH_HOOKS,
    JOURNEY_DARK_HOOKS,
    BREAKING_FELLOWSHIP_HOOKS,
    FOG_BARROW_HOOKS,
    URUK_HAI_HOOKS,
    HELMS_DEEP_HOOKS,
    ROAD_ISENGARD_HOOKS,
    PASSAGE_MARSHES_HOOKS,
    CROSS_ROADS_HOOKS,
    SHELOB_LAIR_HOOKS,
    GREY_COMPANY_HOOKS,
    SIEGE_GONDOR_HOOKS,
    PELENNOR_FIELDS_HOOKS,
    CIRITH_UNGOL_HOOKS,
    BLACK_GATE_HOOKS,
    MOUNT_DOOM_HOOKS,
    OATH_HOOKS,
    RUINS_BELEGOST_HOOKS,
    PRANCING_PONY_HOOKS,
    ANNUMINAS_HOOKS,
    ATTACK_DOL_GULDUR_HOOKS,
    CAVES_HOOKS,
    WIZARDS_QUEST_HOOKS,
    WOODLAND_REALM_HOOKS,
    MINES_MORIA_HOOKS,
    ESCAPE_KHAZAD_HOOKS,
    HUNT_DREADNAUGHT_HOOKS,
  ].some((hooks) => hooks.sharedEffect?.(effect));
