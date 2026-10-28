import wainridersPlayers from "../data/wainriders-player-cards.json";
import {
  WAINRIDERS_ENCOUNTERS,
  WAINRIDERS_QUESTS,
} from "./wainriders-scenario-data";
import {
  BLACK_SERPENT_ENCOUNTERS,
  BLACK_SERPENT_QUESTS,
} from "./black-serpent-scenario-data";
import blackSerpentPlayers from "../data/black-serpent-player-cards.json";
import {
  CIRITH_GURAT_ENCOUNTERS,
  CIRITH_GURAT_QUESTS,
} from "./cirith-gurat-scenario-data";
import cirithGuratPlayers from "../data/cirith-gurat-player-cards.json";
import {
  CROSSINGS_POROS_ENCOUNTERS,
  CROSSINGS_POROS_QUESTS,
} from "./crossings-poros-scenario-data";
import crossingsPorosPlayers from "../data/crossings-poros-player-cards.json";
import {
  WILDS_RHOVANION_ENCOUNTERS,
  WILDS_RHOVANION_QUESTS,
} from "./wilds-rhovanion-scenario-data";
import wildsRhovanionPlayers from "../data/wilds-rhovanion-player-cards.json";
import eredMithrinPlayers from "../data/ered-mithrin-player-cards.json";
import {
  MOUNT_GUNDABAD_ENCOUNTERS,
  MOUNT_GUNDABAD_QUESTS,
} from "./mount-gundabad-scenario-data";
import { registerGundabadCardTypes } from "./mount-gundabad-support";
import {
  FATE_WILDERLAND_ENCOUNTERS,
  FATE_WILDERLAND_QUESTS,
} from "./fate-wilderland-scenario-data";
import eredFinalPlayers from "../data/ered-final-player-cards.json";
import ulfastPlayers from "../data/ulfast-player-cards.json";
import { ULFAST_ENCOUNTERS, ULFAST_QUESTS } from "./ulfast-scenario-data";
import wrathRuinPlayers from "../data/wrath-ruin-player-cards.json";
import {
  WRATH_RUIN_ENCOUNTERS,
  WRATH_RUIN_QUESTS,
} from "./wrath-ruin-scenario-data";
import shadowEastPlayers from "../data/shadow-east-player-cards.json";
import shadowEastEncounterPlayers from "../data/shadow-east-encounter-players.json";
import {
  RIVER_RUNNING_ENCOUNTERS,
  RIVER_RUNNING_QUESTS,
} from "./river-running-scenario-data";
import {
  DANGER_DORWINION_ENCOUNTERS,
  DANGER_DORWINION_QUESTS,
} from "./danger-dorwinion-scenario-data";
import {
  TEMPLE_DOOM_ENCOUNTERS,
  TEMPLE_DOOM_QUESTS,
} from "./temple-doom-scenario-data";
import {
  WITHERED_HEATH_ENCOUNTERS,
  WITHERED_HEATH_QUESTS,
} from "./withered-heath-scenario-data";
import {
  ROAM_RHOVANION_ENCOUNTERS,
  ROAM_RHOVANION_QUESTS,
} from "./roam-rhovanion-scenario-data";
import {
  FIRE_NIGHT_ENCOUNTERS,
  FIRE_NIGHT_QUESTS,
} from "./fire-night-scenario-data";
import {
  GHOST_FRAMSBURG_ENCOUNTERS,
  GHOST_FRAMSBURG_QUESTS,
} from "./ghost-framsburg-scenario-data";
import { DIKE_ENCOUNTERS, DIKE_QUESTS } from "./deadmens-dike-support";
import { CHETWOOD_ENCOUNTERS, CHETWOOD_QUESTS } from "./chetwood-support";
import { WEATHER_ENCOUNTERS, WEATHER_QUESTS } from "./weather-hills-support";
import lostRealmSideQuests from "../data/lost-realm-side-quests.json";
import rangerPlayers from "../data/lost-realm-encounter-players.json";
import lostRealmPlayers from "../data/lost-realm-player-cards.json";
import angmarPlayers from "../data/angmar-player-cards.json";
import greyHavensPlayers from "../data/grey-havens-player-cards.json";
import stormcallerPlayers from "../data/stormcaller-player-cards.json";
import depthsPlayers from "../data/depths-player-cards.json";
import templePlayers from "../data/temple-player-cards.json";
import drownedPlayers from "../data/drowned-player-cards.json";
import cobasPlayers from "../data/cobas-player-cards.json";
import cityPlayers from "../data/city-player-cards.json";
import haradPlayers from "../data/harad-player-cards.json";
import raceHaradPlayers from "../data/race-harad-player-cards.json";
import {
  RACE_HARAD_ENCOUNTERS,
  RACE_HARAD_QUESTS,
} from "./race-harad-scenario-data";
import beneathSandsPlayers from "../data/beneath-sands-player-cards.json";
import {
  BENEATH_SANDS_ENCOUNTERS,
  BENEATH_SANDS_QUESTS,
} from "./beneath-sands-scenario-data";
import mumakilPlayers from "../data/mumakil-player-cards.json";
import { MUMAKIL_ENCOUNTERS, MUMAKIL_QUESTS } from "./mumakil-scenario-data";
import { HARAD_ENCOUNTERS, HARAD_QUESTS } from "./harad-scenario-data";
import { CITY_ENCOUNTERS, CITY_QUESTS } from "./city-scenario-data";
import { COBAS_ENCOUNTERS, COBAS_QUESTS } from "./cobas-scenario-data";
import { DROWNED_ENCOUNTERS, DROWNED_QUESTS } from "./drowned-scenario-data";
import { TEMPLE_ENCOUNTERS, TEMPLE_QUESTS } from "./temple-scenario-data";
import { DEPTHS_ENCOUNTERS, DEPTHS_QUESTS } from "./depths-scenario-data";
import {
  STORMCALLER_ENCOUNTERS,
  STORMCALLER_QUESTS,
} from "./stormcaller-scenario-data";
import {
  GREY_HAVENS_ENCOUNTERS,
  GREY_HAVENS_QUESTS,
} from "./grey-havens-scenario-data";
import { ANGMAR_ENCOUNTERS, ANGMAR_QUESTS } from "./angmar-scenario-data";
import { ANTLERED_ENCOUNTERS, ANTLERED_QUESTS } from "./antlered-support";
import {
  CELEBRIMBOR_ENCOUNTERS,
  CELEBRIMBOR_QUESTS,
} from "./celebrimbor-support";
import { NIN_ENCOUNTERS, NIN_QUESTS } from "./nin-eilph-support";
import { THARBAD_ENCOUNTERS, THARBAD_QUESTS } from "./tharbad-support";
import {
  THREE_TRIALS_ENCOUNTERS,
  THREE_TRIALS_QUESTS,
} from "./three-trials-support";
import {
  DUNLAND_TRAP_ENCOUNTERS,
  DUNLAND_TRAP_QUESTS,
} from "./dunland-trap-support";
import { FANGORN_ENCOUNTERS, FANGORN_QUESTS } from "./fangorn-support";
import { CATCH_ORC_ENCOUNTERS, CATCH_ORC_QUESTS } from "./catch-orc-support";
import { FORDS_ISEN_ENCOUNTERS, FORDS_ISEN_QUESTS } from "./fords-isen-support";
import recipes from "../data/official-starter-decks.json";
import dunlandPlayers from "../data/dunland-trap-player-cards.json";
import trialsTharbadPlayers from "../data/trials-tharbad-player-cards.json";
import finalRingPlayers from "../data/ring-maker-final-player-cards.json";
import type { PublishedStarterDeck } from "./products";
import voiceIsengard from "../data/voice-isengard-player-cards.json";
import {
  BLOOD_GONDOR_ENCOUNTERS,
  BLOOD_GONDOR_QUESTS,
} from "./blood-gondor-support";
import {
  MORGUL_VALE_ENCOUNTERS,
  MORGUL_VALE_QUESTS,
} from "./morgul-vale-support";
import {
  DRUADAN_FOREST_ENCOUNTERS,
  DRUADAN_FOREST_QUESTS,
} from "./druadan-forest-support";
import { AMON_DIN_ENCOUNTERS, AMON_DIN_QUESTS } from "./amon-din-support";
import {
  ASSAULT_OSGILIATH_ENCOUNTERS,
  ASSAULT_OSGILIATH_QUESTS,
} from "./assault-osgiliath-support";
import {
  HEIRS_NUMENOR_ENCOUNTERS,
  HEIRS_NUMENOR_QUESTS,
} from "./heirs-numenor-support";
import scriptedScenarioArt from "../data/scripted-scenario-art.json";
import referenceScenarioArt from "../data/reference-scenario-art.json";
import {
  STEWARD_FEAR_ENCOUNTERS,
  STEWARD_FEAR_QUESTS,
  STREETS_GONDOR_ENCOUNTERS,
} from "./steward-fear-support";
import {
  SHADOW_FLAME_ENCOUNTERS,
  SHADOW_FLAME_QUESTS,
} from "./shadow-flame-support";
import { DRUADAN_PLAYER_CARDS } from "./druadan-player-support";
import {
  FOUNDATIONS_STONE_ENCOUNTERS,
  FOUNDATIONS_STONE_QUESTS,
} from "./foundations-stone-support";
import { AMON_PLAYER_CARDS } from "./amon-din-player-support";
import { MORGUL_PLAYER_CARDS } from "./morgul-player-support";
import { OSGILIATH_PLAYER_CARDS } from "./osgiliath-player-support";
import { BLOOD_PLAYER_CARDS } from "./blood-gondor-player-support";
import { STEWARD_PLAYER_CARDS } from "./steward-player-support";
import { LONG_DARK_ENCOUNTERS, LONG_DARK_QUESTS } from "./long-dark-support";
import {
  CARROCK_ENCOUNTERS,
  EMYN_MUIL_ENCOUNTERS,
  EMYN_MUIL_QUESTS,
  RHOSGOBEL_ENCOUNTERS,
  RHOSGOBEL_QUESTS,
  DEAD_MARSHES_ENCOUNTERS,
  DEAD_MARSHES_QUESTS,
  RETURN_MIRKWOOD_ENCOUNTERS,
  RETURN_MIRKWOOD_QUESTS,
  KHAZAD_ENCOUNTERS,
  KHAZAD_QUESTS,
  REDHORN_ENCOUNTERS,
  REDHORN_QUESTS,
  ROAD_ENCOUNTERS,
  ROAD_QUESTS,
} from "./encounter-definitions";
import { HEIRS_PLAYER_CARDS } from "./heirs-player-support";
import { COLLECTOR_PLAYER_CARDS } from "./collector-player-support";
import {
  WATCHER_WATER_ENCOUNTERS,
  WATCHER_WATER_QUESTS,
} from "./watcher-water-support";
import coreHuntQuests from "../data/core-hunt-quest-cards.json";
import carrockQuests from "../data/carrock-quest-cards.json";
import { SHADOW_FLAME_PLAYER_CARDS } from "./shadow-flame-player-support";
import { FOUNDATIONS_PLAYER_CARDS } from "./foundations-player-support";
import { LONG_DARK_PLAYER_CARDS } from "./long-dark-player-support";
import { ROHAN_PLAYER_CARDS } from "./rohan-player-support";
import { WATCHER_PLAYER_CARDS } from "./watcher-player-support";
import { ROAD_PLAYER_CARDS } from "./road-player-support";
import { REDHORN_PLAYER_CARDS } from "./redhorn-player-support";
import players from "../data/player-cards.json";
import encounters from "../data/encounter-cards.json";
import type { Card, Unit } from "./types";
import { CAMPAIGN_CARDS, ORC_GUARD } from "./scenarios";
import { PASSIVE_PLAYER_CARDS } from "./expansion-passives";
import { HUNT_PLAYER_CARDS } from "./hunt-player-support";
import { CARROCK_PLAYER_CARDS } from "./carrock-player-support";
import { GONDOR_PLAYER_CARDS } from "./gondor-player-support";
import { RHOSGOBEL_PLAYER_CARDS } from "./rhosgobel-player-support";
import { EMYN_PLAYER_CARDS } from "./emyn-player-support";
import { MARSH_PLAYER_CARDS } from "./marsh-player-support";
import { DWARF_PLAYER_CARDS } from "./dwarf-player-support";
import { MIRKWOOD_PLAYER_CARDS } from "./mirkwood-player-support";
import { KHAZAD_PLAYER_CARDS } from "./khazad-player-support";
import { ELF_PLAYER_CARDS } from "./elf-player-support";
export const corePlayerCards = players as Card[];
export const playerCards = [
  ...new Map(
    [
      ...corePlayerCards,
      ...(voiceIsengard as Card[]),
      ...(dunlandPlayers as Card[]),
      ...(trialsTharbadPlayers as Card[]),
      ...(finalRingPlayers as Card[]),
      ...(lostRealmPlayers as Card[]),
      ...(angmarPlayers as Card[]),
      ...(greyHavensPlayers as Card[]),
      ...(lostRealmSideQuests as Card[]),
      ...(rangerPlayers as Card[]),
      ...PASSIVE_PLAYER_CARDS,
      ...HUNT_PLAYER_CARDS,
      ...CARROCK_PLAYER_CARDS,
      ...GONDOR_PLAYER_CARDS,
      ...RHOSGOBEL_PLAYER_CARDS,
      ...EMYN_PLAYER_CARDS,
      ...MARSH_PLAYER_CARDS,
      ...DWARF_PLAYER_CARDS,
      ...MIRKWOOD_PLAYER_CARDS,
      ...KHAZAD_PLAYER_CARDS,
      ...ELF_PLAYER_CARDS,
      ...REDHORN_PLAYER_CARDS,
      ...ROAD_PLAYER_CARDS,
      ...WATCHER_PLAYER_CARDS,
      ...ROHAN_PLAYER_CARDS,
      ...LONG_DARK_PLAYER_CARDS,
      ...FOUNDATIONS_PLAYER_CARDS,
      ...SHADOW_FLAME_PLAYER_CARDS,
      ...COLLECTOR_PLAYER_CARDS,
      ...HEIRS_PLAYER_CARDS,
      ...STEWARD_PLAYER_CARDS,
      ...DRUADAN_PLAYER_CARDS,
      ...AMON_PLAYER_CARDS,
      ...MORGUL_PLAYER_CARDS,
      ...OSGILIATH_PLAYER_CARDS,
      ...BLOOD_PLAYER_CARDS,
      ...(stormcallerPlayers as Card[]),
      ...(depthsPlayers as Card[]),
      ...(templePlayers as Card[]).map((c) =>
        c.code === "12058" ? { ...c, text: `Action: ${c.text}` } : c,
      ),
      ...(drownedPlayers as Card[]),
      ...(cobasPlayers as Card[]),
      ...(cityPlayers as Card[]),
      ...(raceHaradPlayers as Card[]).map((c) =>
        c.code === "17036" ? { ...c, quest: 6, victory: 1 } : c,
      ),
      ...(
        [
          ...blackSerpentPlayers,
          ...cirithGuratPlayers,
          ...crossingsPorosPlayers,
          ...wildsRhovanionPlayers,
          ...eredMithrinPlayers,
          ...eredFinalPlayers.filter((c) => c.code !== "19120"),
          ...shadowEastPlayers,
          ...wrathRuinPlayers,
          ...ulfastPlayers,
          ...wainridersPlayers,
        ] as Card[]
      ).map((c) => {
        if (c.code === "19146")
          return {
            ...c,
            text: c.text
              ?.replace("defend, of have", "defend, or have")
              .replace("it's owner's", "its owner's"),
          };
        if (c.code === "19152")
          return {
            ...c,
            text: c.text?.replace(
              /Guarded \(location\)\.\s*Guarded \(location\)\./,
              "Guarded (location).",
            ),
          };
        if (c.code === "17087") return { ...c, quest: 6, victory: 1 };
        if (c.code === "17113")
          return {
            ...c,
            text: c.text?.replace("Valour Action", "Valour Combat Action"),
          };
        if (c.code === "17115") return { ...c, name: "Heirs of Eärendil" };
        if (c.code === "17139")
          return {
            ...c,
            text: c.text?.replace("While unattached", "If unattached"),
          };
        if (c.code === "17144")
          return {
            ...c,
            text: c.text?.replace(/\s*<i><b>Shadow[\s\S]*$/, ""),
            shadow: "Ready the defending character.",
          };
        if (c.code === "18015")
          return { ...c, text: c.text?.replace("where is", "where X is") };
        return c;
      }),
      ...(beneathSandsPlayers as Card[]).map((c) => {
        if (c.code === "17056")
          return { ...c, text: c.text?.replace("Haradrim</b>", "Harad</b>") };
        if (c.code === "17058") return { ...c, victory: 1 };
        if (c.code === "17059") return { ...c, quest: 6, victory: 1 };
        if (c.code === "17060")
          return { ...c, text: c.text?.replace("exaust", "exhaust") };
        if (c.code === "17062") return { ...c, name: "Dúnedain Lookout" };
        return c;
      }),
      ...(mumakilPlayers as Card[]).map((c) =>
        c.code === "17003" ? { ...c, quest: 6, victory: 1 } : c,
      ),
      ...(haradPlayers as Card[]).map((c) =>
        c.code === "16013" ? { ...c, quest: 5, victory: 1 } : c,
      ),
    ].map((c) => [c.code, c]),
  ).values(),
];
const priorEncounterCards = [
  ...(encounters as Card[]),
  ...CARROCK_ENCOUNTERS,
  ...EMYN_MUIL_ENCOUNTERS,
  ...RHOSGOBEL_ENCOUNTERS,
  ...DEAD_MARSHES_ENCOUNTERS,
  ...RETURN_MIRKWOOD_ENCOUNTERS,
  ...KHAZAD_ENCOUNTERS,
  ...REDHORN_ENCOUNTERS,
  ...ROAD_ENCOUNTERS,
  ...WATCHER_WATER_ENCOUNTERS,
  ...LONG_DARK_ENCOUNTERS,
  ...SHADOW_FLAME_ENCOUNTERS,
  ...FOUNDATIONS_STONE_ENCOUNTERS,
  ...HEIRS_NUMENOR_ENCOUNTERS,
  ...STEWARD_FEAR_ENCOUNTERS,
  ...STREETS_GONDOR_ENCOUNTERS,
  ...DRUADAN_FOREST_ENCOUNTERS,
  ...AMON_DIN_ENCOUNTERS,
  ...ASSAULT_OSGILIATH_ENCOUNTERS,
  ...BLOOD_GONDOR_ENCOUNTERS,
  ...MORGUL_VALE_ENCOUNTERS,
  ...FORDS_ISEN_ENCOUNTERS,
  ...CATCH_ORC_ENCOUNTERS,
  ...FANGORN_ENCOUNTERS,
  ...DUNLAND_TRAP_ENCOUNTERS,
  ...THREE_TRIALS_ENCOUNTERS,
  ...THARBAD_ENCOUNTERS,
  ...NIN_ENCOUNTERS,
  ...CELEBRIMBOR_ENCOUNTERS,
  ...ANTLERED_ENCOUNTERS,
  ...CHETWOOD_ENCOUNTERS,
  ...WEATHER_ENCOUNTERS,
  ...DIKE_ENCOUNTERS,
  ...ANGMAR_ENCOUNTERS,
  ...GREY_HAVENS_ENCOUNTERS,
  ...STORMCALLER_ENCOUNTERS.filter(
    (c) => !GREY_HAVENS_ENCOUNTERS.some((shared) => shared.code === c.code),
  ),
  ...DEPTHS_ENCOUNTERS.filter(
    (c) => !GREY_HAVENS_ENCOUNTERS.some((shared) => shared.code === c.code),
  ),
];
const existingEncounterCards = [
  ...MUMAKIL_ENCOUNTERS,
  ...RACE_HARAD_ENCOUNTERS,
  ...BENEATH_SANDS_ENCOUNTERS,
  ...HARAD_ENCOUNTERS,
  ...priorEncounterCards,
  ...TEMPLE_ENCOUNTERS.filter(
    (c) => !priorEncounterCards.some((old) => old.code === c.code),
  ),
  ...DROWNED_ENCOUNTERS.filter(
    (c) =>
      ![...priorEncounterCards, ...TEMPLE_ENCOUNTERS].some(
        (old) => old.code === c.code,
      ),
  ),
  ...COBAS_ENCOUNTERS.filter(
    (c) =>
      ![
        ...priorEncounterCards,
        ...TEMPLE_ENCOUNTERS,
        ...DROWNED_ENCOUNTERS,
      ].some((old) => old.code === c.code),
  ),
  ...CITY_ENCOUNTERS.filter(
    (c) =>
      ![
        ...priorEncounterCards,
        ...TEMPLE_ENCOUNTERS,
        ...DROWNED_ENCOUNTERS,
        ...COBAS_ENCOUNTERS,
      ].some((old) => old.code === c.code),
  ),
];
export const encounterCards = [
  ...new Map(
    [
      ...existingEncounterCards,
      ...BLACK_SERPENT_ENCOUNTERS,
      ...CIRITH_GURAT_ENCOUNTERS,
      ...CROSSINGS_POROS_ENCOUNTERS,
      ...WILDS_RHOVANION_ENCOUNTERS,
      ...WITHERED_HEATH_ENCOUNTERS,
      ...ROAM_RHOVANION_ENCOUNTERS,
      ...FIRE_NIGHT_ENCOUNTERS,
      ...GHOST_FRAMSBURG_ENCOUNTERS,
      ...MOUNT_GUNDABAD_ENCOUNTERS,
      ...FATE_WILDERLAND_ENCOUNTERS,
      ...RIVER_RUNNING_ENCOUNTERS,
      ...DANGER_DORWINION_ENCOUNTERS,
      ...TEMPLE_DOOM_ENCOUNTERS,
      ...WRATH_RUIN_ENCOUNTERS,
      ...ULFAST_ENCOUNTERS,
      ...WAINRIDERS_ENCOUNTERS,
      ...(shadowEastEncounterPlayers as Card[]),
    ].map((c) => [c.code, c]),
  ).values(),
];
export const cards: Record<string, Card> = Object.fromEntries(
  [
    ...(coreHuntQuests as Card[]),
    ...(carrockQuests as Card[]),
    ...EMYN_MUIL_QUESTS,
    ...playerCards,
    ...encounterCards,
    ...RHOSGOBEL_QUESTS,
    ...DEAD_MARSHES_QUESTS,
    ...RETURN_MIRKWOOD_QUESTS,
    ...KHAZAD_QUESTS,
    ...REDHORN_QUESTS,
    ...ROAD_QUESTS,
    ...WATCHER_WATER_QUESTS,
    ...LONG_DARK_QUESTS,
    ...SHADOW_FLAME_QUESTS,
    ...FOUNDATIONS_STONE_QUESTS,
    ...HEIRS_NUMENOR_QUESTS,
    ...STEWARD_FEAR_QUESTS,
    ...DRUADAN_FOREST_QUESTS,
    ...AMON_DIN_QUESTS,
    ...ASSAULT_OSGILIATH_QUESTS,
    ...BLOOD_GONDOR_QUESTS,
    ...MORGUL_VALE_QUESTS,
    ...FORDS_ISEN_QUESTS,
    ...CATCH_ORC_QUESTS,
    ...FANGORN_QUESTS,
    ...DUNLAND_TRAP_QUESTS,
    ...THREE_TRIALS_QUESTS,
    ...THARBAD_QUESTS,
    ...NIN_QUESTS,
    ...CELEBRIMBOR_QUESTS,
    ...ANTLERED_QUESTS,
    ...CHETWOOD_QUESTS,
    ...WEATHER_QUESTS,
    ...DIKE_QUESTS,
    ...ANGMAR_QUESTS,
    ...GREY_HAVENS_QUESTS,
    ...STORMCALLER_QUESTS,
    ...DEPTHS_QUESTS,
    ...TEMPLE_QUESTS,
    ...DROWNED_QUESTS,
    ...COBAS_QUESTS,
    ...CITY_QUESTS,
    ...HARAD_QUESTS,
    ...MUMAKIL_QUESTS,
    ...RACE_HARAD_QUESTS,
    ...BENEATH_SANDS_QUESTS,
    ...BLACK_SERPENT_QUESTS,
    ...CIRITH_GURAT_QUESTS,
    ...CROSSINGS_POROS_QUESTS,
    ...WILDS_RHOVANION_QUESTS,
    ...CAMPAIGN_CARDS,
    ...WITHERED_HEATH_QUESTS,
    ...ROAM_RHOVANION_QUESTS,
    ...FIRE_NIGHT_QUESTS,
    ...GHOST_FRAMSBURG_QUESTS,
    ...MOUNT_GUNDABAD_QUESTS,
    ...FATE_WILDERLAND_QUESTS,
    ...RIVER_RUNNING_QUESTS,
    ...DANGER_DORWINION_QUESTS,
    ...TEMPLE_DOOM_QUESTS,
    ...WRATH_RUIN_QUESTS,
    ...ULFAST_QUESTS,
    ...WAINRIDERS_QUESTS,
    ORC_GUARD,
  ].map((c) => [c.code, c]),
);
export const HEROES = ["01001", "01002", "01007"];
export const DECK: Record<string, number> = {
  "01013": 3,
  "01014": 2,
  "01015": 2,
  "01016": 3,
  "01017": 1,
  "01018": 2,
  "01020": 3,
  "01022": 1,
  "01023": 3,
  "01026": 3,
  "01027": 2,
  "01043": 3,
  "01044": 2,
  "01045": 3,
  "01046": 3,
  "01048": 3,
  "01050": 3,
  "01055": 2,
  "01057": 3,
  "01073": 3,
};
export interface StarterDeck {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  heroes: string[];
  cards: Record<string, number>;
}
export const STARTERS: StarterDeck[] = [
  {
    id: "leadership",
    name: "The King’s Company",
    subtitle: "Leadership",
    description: "Rally Gondor’s allies and build a powerful resource engine.",
    heroes: ["01001", "01002", "01003"],
  },
  {
    id: "tactics",
    name: "Blades of the West",
    subtitle: "Tactics",
    description:
      "Stand your ground with warriors, weapons, and decisive attacks.",
    heroes: ["01004", "01005", "01006"],
  },
  {
    id: "spirit",
    name: "A Light in the Shadow",
    subtitle: "Spirit",
    description:
      "Quest with courage, control your threat, and cancel the darkness.",
    heroes: ["01007", "01008", "01009"],
  },
  {
    id: "lore",
    name: "Wisdom of the Wild",
    subtitle: "Lore",
    description: "Heal your fellowship and see what lies beyond the next turn.",
    heroes: ["01010", "01011", "01012"],
  },
].map((d) => ({
  ...d,
  cards: {
    ...Object.fromEntries(
      corePlayerCards
        .filter((c) => c.sphere_code === d.id && c.type_code !== "hero")
        .map((c) => [c.code, c.quantity ?? 1]),
    ),
    "01073": 1,
  },
}));
export const SCRIPTED = new Set(
  [
    ...playerCards,
    ...encounterCards,
    ...ANGMAR_QUESTS,
    ...GREY_HAVENS_QUESTS,
    ...STORMCALLER_QUESTS,
    ...RHOSGOBEL_QUESTS,
    ...DEPTHS_QUESTS,
    ...TEMPLE_QUESTS,
    ...DROWNED_QUESTS,
    ...COBAS_QUESTS,
    ...CITY_QUESTS,
    ...HARAD_QUESTS,
    ...MUMAKIL_QUESTS,
    ...RACE_HARAD_QUESTS,
    ...BENEATH_SANDS_QUESTS,
    ...BLACK_SERPENT_QUESTS,
    ...CIRITH_GURAT_QUESTS,
    ...CROSSINGS_POROS_QUESTS,
    ...WILDS_RHOVANION_QUESTS,
    ...DEAD_MARSHES_QUESTS,
    ...WITHERED_HEATH_QUESTS,
    ...ROAM_RHOVANION_QUESTS,
    ...FIRE_NIGHT_QUESTS,
    ...GHOST_FRAMSBURG_QUESTS,
    ...MOUNT_GUNDABAD_QUESTS,
    ...FATE_WILDERLAND_QUESTS,
    ...RIVER_RUNNING_QUESTS,
    ...DANGER_DORWINION_QUESTS,
    ...TEMPLE_DOOM_QUESTS,
    ...WRATH_RUIN_QUESTS,
    ...ULFAST_QUESTS,
    ...WAINRIDERS_QUESTS,
    ...RETURN_MIRKWOOD_QUESTS,
    ...KHAZAD_QUESTS,
    ...REDHORN_QUESTS,
    ...ROAD_QUESTS,
    ...WATCHER_WATER_QUESTS,
    ...LONG_DARK_QUESTS,
    ...SHADOW_FLAME_QUESTS,
    ...FOUNDATIONS_STONE_QUESTS,
    ...HEIRS_NUMENOR_QUESTS,
    ...STEWARD_FEAR_QUESTS,
    ...DRUADAN_FOREST_QUESTS,
    ...AMON_DIN_QUESTS,
    ...ASSAULT_OSGILIATH_QUESTS,
    ...BLOOD_GONDOR_QUESTS,
    ...MORGUL_VALE_QUESTS,
    ...FORDS_ISEN_QUESTS,
    ...CATCH_ORC_QUESTS,
    ...FANGORN_QUESTS,
    ...DUNLAND_TRAP_QUESTS,
    ...THREE_TRIALS_QUESTS,
    ...THARBAD_QUESTS,
    ...NIN_QUESTS,
    ...CELEBRIMBOR_QUESTS,
    ...ANTLERED_QUESTS,
    ...CHETWOOD_QUESTS,
    ...WEATHER_QUESTS,
    ...DIKE_QUESTS,
    ...CAMPAIGN_CARDS,
    ORC_GUARD,
  ].map((c) => c.code),
);
export const card = (code: string): Card => {
  const c = cards[code];
  if (!c) throw new Error(`Unknown card: ${code}`);
  return c;
};
registerGundabadCardTypes((code) => card(code).type_code);
export const cachedImageSource = (src: string | undefined) =>
  scriptedScenarioArt[src as keyof typeof scriptedScenarioArt] ??
  referenceScenarioArt[src as keyof typeof referenceScenarioArt] ??
  src;
export const imageUrl = (c: Card) =>
  scriptedScenarioArt[c.imagesrc as keyof typeof scriptedScenarioArt] ??
  referenceScenarioArt[c.imagesrc as keyof typeof referenceScenarioArt] ??
  (c.imagesrc?.startsWith("/cards/") || c.imagesrc?.startsWith("/art/")
    ? c.imagesrc
    : c.pack_name === "Core Set" && c.type_code !== "quest" && cards[c.code]
      ? `/cards/${c.code}.${c.sphere_code === "encounter" ? "jpg" : "png"}`
      : c.imagesrc?.startsWith("http")
        ? c.imagesrc
        : `https://ringsdb.com${c.imagesrc ?? `/bundles/cards/${c.code}.png`}`);
export const name = (u: Unit) =>
  (u.flipped ? card(u.code).back_name : undefined) ?? card(u.code).name;
export const plain = (s = "") =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/\[willpower\]/g, "willpower")
    .replace(/\[attack\]/g, "attack")
    .replace(/\[defense\]/g, "defense")
    .replace(/\[threat\]/g, "threat")
    .replace(/\[spirit\]/g, "Spirit")
    .replace(/\[leadership\]/g, "Leadership");
export const STAGES = [
  {
    name: "Flies and Spiders",
    quest: 8,
    story:
      "The road leads beneath the tangled branches of Mirkwood. Something stirs in the shadows.",
  },
  {
    name: "A Fork in the Road",
    quest: 2,
    story:
      "The trail divides before you. Every path leads deeper into the forest.",
  },
];

export interface BuiltInDeck extends StarterDeck {
  group: "core" | "starter" | "collector";
  source?: string;
  productId?: string;
  deckKind?: "official-preconstructed";
}

const subtitles: Record<string, string> = {
  "starter-dwarves": "Dwarves",
  "starter-elves": "Elves",
  "starter-gondor": "Gondor",
  "starter-rohan": "Rohan",
  "limited-leadership-spirit": "Leadership / Spirit",
  "limited-lore-tactics": "Lore / Tactics",
};

/** Only complete printed main decks enter play; extra deckbuilding cards stay separate. */
export const PRECON_DECKS: BuiltInDeck[] = (
  recipes as unknown as PublishedStarterDeck[]
)
  .filter((d) =>
    [...d.heroes, ...Object.keys(d.cards)].every((code) => SCRIPTED.has(code)),
  )
  .map((d) => ({
    id: d.id,
    name: d.name,
    subtitle: subtitles[d.id] ?? d.name,
    description: `${d.heroes.map((code) => card(code).name).join(", ")}. The complete printed 50-card deck.`,
    heroes: [...d.heroes],
    cards: { ...d.cards },
    group: d.productId === "limited-starter" ? "collector" : "starter",
    productId: d.productId,
    deckKind: d.deckKind,
    source: d.source_url,
  }));

/** Stable ids work on a fresh device without importing or saving a custom deck. */
export const BUILT_IN_DECKS: BuiltInDeck[] = [
  ...STARTERS.map((d) => ({ ...d, group: "core" as const })),
  ...PRECON_DECKS,
];
