import { ASH_QUESTS } from "./game/ash-mountains-support";
import { LAND_SORROW_QUESTS } from "./game/land-sorrow-support";
import { FORTRESS_NURN_QUESTS } from "./game/fortress-nurn-support";
import { MASSING_QUESTS } from "./game/massing-osgiliath-support";
import {
  BondOfFriendshipState,
  FortressNurnState,
} from "./ui/fortress-nurn-state";
import { MassingOsgiliathState } from "./ui/massing-osgiliath-state";
import { WeMustAwayState } from "./ui/we-must-away-state";
import { MistyMountainsState } from "./ui/misty-mountains-state";
import { DungeonsDeepState } from "./ui/dungeons-deep-state";
import { FliesSpidersState } from "./ui/flies-spiders-state";
import { FAS_QUESTS } from "./game/flies-spiders-support";
import { LonelyMountainState } from "./ui/lonely-mountain-state";
import { TLM_QUESTS } from "./game/lonely-mountain-support";
import { BattleFiveArmiesState } from "./ui/battle-five-armies-state";
import { BOFA_QUESTS } from "./game/battle-five-armies-support";
import { LakeTownState } from "./ui/lake-town-state";
import { LAKE, LAKE_QUESTS } from "./game/lake-town-support";
import { ShadowPastState } from "./ui/shadow-past-state";
import { SHADOW_PAST_QUESTS } from "./game/shadow-past-support";
import { KnifeDarkState } from "./ui/knife-dark-state";
import { KNIFE_DARK_QUESTS } from "./game/knife-dark-support";
import { FlightFordState } from "./ui/flight-ford-state";
import { FLIGHT_FORD_QUESTS } from "./game/flight-ford-support";
import { StoneErechState } from "./ui/stone-erech-state";
import { STONE_ERECH_QUESTS } from "./game/stone-erech-support";
import { OldForestState } from "./ui/old-forest-state";
import { OLD_FOREST_QUESTS } from "./game/old-forest-support";
import { RingSouthState } from "./ui/ring-south-state";
import { RING_SOUTH_QUESTS } from "./game/ring-south-support";
import { JourneyDarkState } from "./ui/journey-dark-state";
import { JOURNEY_DARK_QUESTS } from "./game/journey-dark-support";
import { BreakingFellowshipState } from "./ui/breaking-fellowship-state";
import { BREAKING_FELLOWSHIP_QUESTS } from "./game/breaking-fellowship-support";
import { FogBarrowState } from "./ui/fog-barrow-state";
import { FOG_BARROW_QUESTS } from "./game/fog-barrow-support";
import { UrukHaiState } from "./ui/uruk-hai-state";
import { URUK_HAI_QUESTS } from "./game/uruk-hai-support";
import { HelmsDeepState } from "./ui/helms-deep-state";
import { HELMS_DEEP_QUESTS } from "./game/helms-deep-support";
import { RoadIsengardState } from "./ui/road-isengard-state";
import { PassageMarshesState } from "./ui/passage-marshes-state";
import { CrossRoadsState } from "./ui/cross-roads-state";
import { ROAD_ISENGARD_QUESTS } from "./game/road-isengard-support";
import { PASSAGE_MARSHES_QUESTS } from "./game/passage-marshes-support";
import { CROSS_ROADS_QUESTS } from "./game/cross-roads-support";
import { ShelobLairState } from "./ui/shelob-lair-state";
import { SHELOB_LAIR_QUESTS } from "./game/shelob-lair-support";
import { GreyCompanyState } from "./ui/grey-company-state";
import { GREY_COMPANY_QUESTS } from "./game/grey-company-support";
import { SiegeGondorState } from "./ui/siege-gondor-state";
import { SIEGE_GONDOR_QUESTS } from "./game/siege-gondor-support";
import { PelennorFieldsState } from "./ui/pelennor-fields-state";
import { PELENNOR_FIELDS_QUESTS } from "./game/pelennor-fields-support";
import { CirithUngolState } from "./ui/cirith-ungol-state";
import { CIRITH_UNGOL_QUESTS } from "./game/cirith-ungol-support";
import { BlackGateState } from "./ui/black-gate-state";
import { BLACK_GATE_QUESTS } from "./game/black-gate-support";
import { MountDoomState } from "./ui/mount-doom-state";
import { isFortitude } from "./game/hide-test";
import { MOUNT_DOOM_QUESTS } from "./game/mount-doom-support";
import { OATH_QUESTS } from "./game/the-oath-support";
import { RB_QUESTS } from "./game/ruins-belegost-support";
import { PP_QUESTS } from "./game/prancing-pony-support";
import { SA_QUESTS } from "./game/annuminas-support";
import { ADG_QUESTS } from "./game/attack-dol-guldur-support";
import { CAVES_QUESTS } from "./game/caves-nibin-dum-support";
import { WQ_QUESTS } from "./game/wizards-quest-support";
import { WR_QUESTS } from "./game/woodland-realm-support";
import { MM_QUESTS } from "./game/mines-moria-support";
import { EK_QUESTS } from "./game/escape-khazad-support";
import { HD_QUESTS } from "./game/hunt-dreadnaught-support";
import { OathState } from "./ui/the-oath-state";
import { RuinsBelegostState } from "./ui/ruins-belegost-state";
import { PrancingPonyState } from "./ui/prancing-pony-state";
import { AnnuminasState } from "./ui/annuminas-state";
import { AttackDolGuldurState } from "./ui/attack-dol-guldur-state";
import { CavesState } from "./ui/caves-nibin-dum-state";
import { WizardsQuestState } from "./ui/wizards-quest-state";
import { WoodlandRealmState } from "./ui/woodland-realm-state";
import { MinesMoriaState } from "./ui/mines-moria-state";
import { EscapeKhazadState } from "./ui/escape-khazad-state";
import { HuntDreadnaughtState } from "./ui/hunt-dreadnaught-state";
import { DDCD_QUESTS } from "./game/dungeons-deep-support";
import {
  discoveredTreasures,
  recordTreasures,
  tableHeroes,
} from "./game/hobbit-treasure-records";
import {
  HOBBIT_TREASURE_SCENARIOS,
  scenarioTreasures,
} from "./game/hobbit-codes";
import { OMM_QUESTS } from "./game/misty-mountains-support";
import { WMA_QUESTS } from "./game/we-must-away-support";
import {
  LandSorrowState,
  MessengerOfTheKingState,
} from "./ui/land-sorrow-state";
import {
  AshMountainsState,
  CouncilOfTheWiseState,
} from "./ui/ash-mountains-state";
import {
  WainridersScenarioState,
  WandererContractState,
} from "./ui/wainriders-state";
import { BurglarContractStateView } from "./ui/burglar-contract";
import { UlfastScenarioState, HuntersContractState } from "./ui/ulfast-state";
import { PerilousVoyageState } from "./ui/perilous-voyage-state";
import { WrathRuinScenarioState } from "./ui/wrath-ruin-state";
import "./ui/save-status.css";
import { currentQuestInspection } from "./ui/quest-inspection";
import { GUNDABAD } from "./game/mount-gundabad-support";
import { ShadowEastPlayerState } from "./ui/shadow-east-player-state";
import { ShadowEastScenarioState } from "./ui/shadow-east-state";
import { shadowEastPlayerScenarioProblem } from "./game/deck-setup";
import { useSignificantAudio } from "./ui/use-significant-audio";
import { AudioSettings } from "./ui/AudioSettings";
import { ROAM_RHOVANION as ROAM } from "./game/roam-rhovanion-support";
import { encounterReserveDefaults } from "./game/encounter-reserves";
import { WitheredHeathScenarioState } from "./ui/withered-heath-state";
import { RoamRhovanionScenarioState } from "./ui/roam-rhovanion-state";
import { FireNightScenarioState } from "./ui/fire-night-state";
import { GhostFramsburgScenarioState } from "./ui/ghost-framsburg-state";
import {
  MountGundabadScenarioState,
  FateWilderlandScenarioState,
} from "./ui/ered-finale-state";
import { isEnemy } from "./game/ships";
import { currentQuestProgress } from "./game/quest-state";
import { SignificantMoment } from "./ui/SignificantMoment";
import type { ActiveSignificantMoment } from "./ui/SignificantMoment";
import { detectSignificantMoment } from "./ui/significant-moments";
import { WEATHER } from "./game/weather-hills-support";
import { DIKE } from "./game/deadmens-dike-support";
import { selectedSideQuest } from "./game/side-quest-support";
import { realmExtraEngagement } from "./game/lost-realm-player";
import { CELEBRIMBOR } from "./game/celebrimbor-support";
import { FANGORN } from "./game/fangorn-support";
import { ScenarioState, FaceupShadows } from "./ui/scenario-state";
import { DepthsScenarioState, DepthsGrappleSummary } from "./ui/depths-state";
import { TempleMap } from "./ui/TempleMap";
import { DrownedScenarioState } from "./ui/drowned-state";
import { CobasScenarioState } from "./ui/cobas-state";
import { CityScenarioState } from "./ui/city-state";
import { CITY_QUESTS } from "./game/city-scenario-data";
import { HARAD_QUESTS } from "./game/harad-scenario-data";
import { HaradScenarioState } from "./ui/harad-state";
import { MUMAKIL_QUESTS } from "./game/mumakil-support";
import { MumakilScenarioState } from "./ui/mumakil-state";
import { RACE_HARAD_QUESTS } from "./game/race-harad-support";
import { RaceHaradScenarioState } from "./ui/race-harad-state";
import { BLACK_SERPENT_QUESTS } from "./game/black-serpent-support";
import { CIRITH_GURAT_QUESTS } from "./game/cirith-gurat-support";
import { CROSSINGS_POROS_QUESTS } from "./game/crossings-poros-support";
import { WILDS_RHOVANION_QUESTS } from "./game/wilds-rhovanion-support";
import { BlackSerpentScenarioState } from "./ui/black-serpent-state";
import { CirithGuratScenarioState } from "./ui/cirith-gurat-state";
import { CrossingsPorosScenarioState } from "./ui/crossings-poros-state";
import { WildsRhovanionScenarioState } from "./ui/wilds-rhovanion-state";
import { BENEATH_SANDS_QUESTS } from "./game/beneath-sands-support";
import { BeneathSandsScenarioState } from "./ui/beneath-sands-state";
import { COBAS_OBJECTIVES } from "./game/cobas-support";
import { GATE_KEY_FACES, TEMPLE } from "./game/temple-support";
import { templePrivateLookVisible } from "./game/temple";
import { faceupShadowCards } from "./game/voice-isengard";
import { AMON_DIN as A } from "./game/amon-din-support";
import {
  SailingTestSummary,
  StormcallerQuestSummary,
} from "./ui/grey-havens-state";
import { stormcallerArea, stormcallerAreaImmune } from "./game/stormcaller";
import {
  consideredEngaged,
  normalAttackPending,
} from "./game/considered-engagement";
import { SHADOW_FLAME } from "./game/shadow-flame-support";
import { questStat } from "./game/core";
import { FOUNDATIONS_STONE as F } from "./game/foundations-stone-support";
import { HEIRS_NUMENOR as H } from "./game/heirs-numenor-support";
import { STEWARD_FEAR as S, STEWARD_CLUES } from "./game/steward-fear-support";
import { watcherWaterCannotExhaust } from "./game/watcher-water";
import { amonPlayerCannotDeclareAttack } from "./game/amon-din-player-cards";
import {
  eventXMaximum,
  gandalfDeckPlayReason,
  replayEventProblem,
  eventReplayPayments,
} from "./game/actions";
import {
  GANDALF_DECK_PREVIEW,
  gandalfFaceupCard,
} from "./game/road-darkens-player-cards";
import { isHero } from "./game/card-types";
import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  lazy,
  Suspense,
} from "react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  ArrowLeft,
  ArrowCounterClockwise,
  BookOpen,
  Books,
  Campfire,
  CaretRight,
  Check,
  Compass,
  Diamond,
  Eye,
  Feather,
  List,
  Mountains,
  Moon,
  Plus,
  Minus,
  Scroll,
  Shield,
  Sparkle,
  Sword,
  Tree,
  UsersThree,
  X,
  Coins,
  FloppyDisk,
  Info,
  SpeakerHigh,
  SpeakerSlash,
  DownloadSimple,
  SlidersHorizontal,
  Stack,
  Keyboard,
  WarningCircle,
  UserCircle,
  Lightbulb,
} from "@phosphor-icons/react";
import { coachTip } from "./ui/coach";
import { Art, Sphere } from "./ui/card-art";
import { Modal } from "./ui/modal";
import {
  customId,
  createDeckId,
  HERO_CARDS,
  DECK_CARDS,
  deckProblems,
  deckSize,
  describeDeck,
  isCustomId,
  DECKS_KEY,
  readDeckStorage,
  deckStorageProblem,
  writeDecks,
} from "./game/decks";
import type { CustomDeck } from "./game/decks";
import { collectRecoveryBundle, parseRecoveryImport } from "./ui/save-recovery";
import type { RecoveryImport, RecoveryCandidate } from "./ui/save-recovery";
import { readRecords, recordGame, writeRecords } from "./ui/records";
import { JourneyRecord } from "./ui/journey-record";
const Library = lazy(() => import("./ui/library"));
const DeckBuilder = lazy(() => import("./ui/deck-builder"));
const PublishedContent = lazy(() => import("./ui/published-content"));
import type { PublishedPlayRecipe } from "./ui/published-content";
import { CardProductNote, DeckProductNote } from "./ui/product-note";
import { SupportSummary } from "./ui/support-summary";
import { cardProductInfo } from "./game/products";
import { catalogCardCount, isScriptedCard, loadCatalog } from "./game/catalog";
import "./ui/catalog.css";
import carrockQuestCards from "./data/carrock-quest-cards.json";
import { CARROCK, isSacked } from "./game/carrock";
import { EMYN_MUIL_QUESTS, emynMuilMustCommit } from "./game/emyn-muil";
import { eligiblePayers, engagementCost, get } from "./game/core";
import { currentQuestUnit } from "./game/quest-state";
import { RHOS } from "./game/rhosgobel";
import { KHAZAD, khazadCannotExhaust } from "./game/khazad-dum";
import { DEAD } from "./game/dead-marshes";
import { singlePoolCard } from "./game/expansion-passives";
import { motion } from "motion/react";
import { useReducedMotion } from "./ui/use-reduced-motion";
import "./ui/recovery.css";
import {
  AnimatedNumber,
  MovingCard,
  tableSpring,
  useDamageFeedback,
} from "./ui/motion";
import { card, plain, name } from "./game/cards";
import { BUILT_IN_DECKS } from "./game/built-in-decks";
import {
  applyAction,
  availableAbilities,
  enemyAttackPrevented,
  canCommit,
  canTravel,
  optionalEngagementProblem,
  createGame,
  needsTarget,
  playTargets,
  publicState,
  questWill,
  score,
  stageInfo,
  locationQuest,
  stagingThreat,
  threatOf,
  stats,
  restoreSave,
  continueCampaign,
  retryAdventure,
  objectiveFree,
  newCampaign,
  isGuarded,
  playCost,
} from "./game/engine";
import type {
  Action,
  CampaignState,
  Card,
  GameState,
  Unit,
  ScenarioId,
  PlayMode,
  SeatConfig,
} from "./game/types";
import {
  applySagaResolution,
  ARAGORN_KEY,
  blackGateNote,
  COPY_BOONS,
  DECK_BURDENS,
  fallenNames,
  nextSagaChapter,
  RING_BEARER_KEY,
  SAGA_FREE_CHANGES,
  SAGA_CAMPAIGN_CARDS as SAGA_CAMPAIGN_CARD_CODES,
  SAGA_CAMPAIGN_JOURNAL,
  SAGA_CAMPAIGN_ORDER,
  SAGA_CAMPAIGN_SUPPORTED,
  SAGA_DECK_BOONS,
  SAGA_INSERTS,
  sagaChapterComplete,
  sagaChapterNumber,
  sagaChapterOptions,
  sagaCampaignStatus,
  sagaChapterSupported,
  sagaForbiddenTitle,
  sagaResolutionQuestions,
} from "./game/saga-campaign";
import {
  ANGMAR,
  ANGMAR_DECK_BOONS,
  ANGMAR_FREE_CHANGES,
  ANGMAR_CAMPAIGN_CARDS,
  ANGMAR_CAMPAIGN_ORDER,
  ANGMAR_CAMPAIGN_SUPPORTED,
  angmarCampaignStatus,
  angmarChapterComplete,
  angmarChapterSupported,
  angmarForbiddenTitle,
  angmarResolutionQuestions,
  applyAngmarResolution,
  nextAngmarChapter,
} from "./game/angmar-campaign";
import {
  ERED,
  ERED_CAMPAIGN_CARDS,
  ERED_CAMPAIGN_ORDER,
  ERED_CAMPAIGN_SUPPORTED,
  ERED_DECK_BOONS,
  ERED_FREE_CHANGES,
  ERED_NOTES,
  BELDIS_USES,
  applyEredResolution,
  eredCampaignStatus,
  eredChapterComplete,
  eredChapterSupported,
  eredForbiddenTitle,
  eredResolutionQuestions,
  nextEredChapter,
} from "./game/ered-campaign";
import {
  DREAMCHASER_CAMPAIGN_CARDS,
  DREAMCHASER_CAMPAIGN_ORDER,
  DREAMCHASER_CAMPAIGN_SUPPORTED,
  DREAMCHASER_LOG,
  dreamchaserCampaignStatus,
  dreamchaserChapterComplete,
  dreamchaserChapterSupported,
  dreamchaserForbiddenTitle,
  applyDreamchaserResolution,
  dreamchaserMarksProblem,
  dreamchaserResolutionQuestions,
  nextDreamchaserChapter,
} from "./game/dreamchaser-campaign";
import {
  ADAPTATIONS,
  applyMirkwoodResolution,
  darkMirkwoodCampaignStatus,
  MIRKWOOD_PATHS_ORDER,
  DARK_MIRKWOOD_CAMPAIGN_CARDS,
  DOM,
  mirkwoodLegacy,
  mirkwoodPart,
  mirkwoodPathsOrder,
  mirkwoodResolutionQuestions,
  nextMirkwoodChapter,
} from "./game/dark-mirkwood-campaign";
import {
  SCENARIOS,
  CAMPAIGN_CHAPTERS,
  CORE_CAMPAIGN_CARDS,
  scenario,
  scenarioStageCount,
  OBJECTIVES,
} from "./game/scenarios";
import {
  Hand,
  CardHoverPreview,
  QuestForecast,
  QuestGoals,
  TurnActions,
  EscapeTestSummary,
  HideTestSummary,
  usePreference,
  playReason,
  deckTopPreview,
} from "./ui/experience";

import {
  FellowshipSetup,
  CooperativeActions,
  FellowshipSeats,
} from "./ui/fellowship";
import {
  matchesSavedDeck,
  recoverSavedDecks,
  savedDeckId,
  savedSeats,
  setupSeats,
} from "./ui/setup-decks";
import {
  activeSeat,
  allActiveLocations,
  allHeroes,
  allEngaged,
  ownerOf,
  seatName,
  seatView,
  attackersFor,
  livingSeats,
} from "./game/table";
import {
  REVIEW_MODES,
  reviewModeLabel,
  startGuided,
} from "./game/presentation";
import { ResolutionDialog, ResolutionChronicle } from "./ui/resolution";
import {
  ChoiceDialog,
  CombatDialog,
  DecisionCard,
  DecisionDialog,
  DecisionStats,
} from "./ui/decisions";
import {
  AttachmentStack,
  JourneyArea,
  OtherFellowships,
  ShadowCards,
  TableDecks,
  TableToken,
  questFace,
  questStageLabel,
} from "./ui/tabletop";
import { ThreatCounter } from "./ui/threat";
import { StatBadge } from "./ui/stats";
import { TableCollection, PLAYMATS, PLAYMAT_CHOICES } from "./ui/premium";
import { LandingHero } from "./ui/landing";
import { QuestHeadline, QuestIndex, scenarioRelease } from "./ui/quest-index";

import { DeckPicker, HeroPicker } from "./ui/deck-picker";
import { AccountPanel, AccountStrip } from "./ui/account";
import { useAccount } from "./account/use-account";
import { readChoices } from "./account/choices";
import type { FellowshipChoices } from "./account/choices";

const SAVE_KEY = "there-and-back-again.save.v1",
  DECK_KEY = "there-and-back-again.deck.v1";
const CAMPAIGN_KEY = "there-and-back-again.campaign.v1";
const MODE_KEY = "there-and-back-again.mode.v1";
const CAMPAIGN_KIND_KEY = "there-and-back-again.campaign-kind.v1";
type CampaignKind = "mirkwood" | "saga" | "angmar" | "dreamchaser" | "ered";
const readCampaignKind = (): CampaignKind => {
  try {
    const kind = localStorage.getItem(CAMPAIGN_KIND_KEY);
    return kind === "saga" ||
      kind === "angmar" ||
      kind === "dreamchaser" ||
      kind === "ered"
      ? kind
      : "mirkwood";
  } catch {
    return "mirkwood";
  }
};
const campaignKindOf = (c?: CampaignState | null): CampaignKind =>
  c?.kind === "saga"
    ? "saga"
    : c?.kind === "angmar"
      ? "angmar"
      : c?.kind === "dreamchaser"
        ? "dreamchaser"
        : c?.kind === "ered"
          ? "ered"
          : "mirkwood";
/**
 * The chapters of a campaign, in order (with the saga's optional inserts);
 * Mirkwood Paths adds The Dark of Mirkwood's Parts 4 and 5, or is The Dark of
 * Mirkwood's mini campaign alone.
 */
const chaptersOf = (c: CampaignState): readonly ScenarioId[] =>
  c.kind === "saga"
    ? SAGA_CAMPAIGN_JOURNAL
    : c.kind === "angmar"
      ? ANGMAR_CAMPAIGN_ORDER
      : c.kind === "dreamchaser"
        ? DREAMCHASER_CAMPAIGN_ORDER
        : c.kind === "ered"
          ? ERED_CAMPAIGN_ORDER
          : mirkwoodPathsOrder(c);
/** Each seat's hero count in the Campaign Log (a set-aside Aragorn still counts). */
const campaignSeatCounts = (g: GameState): number[] =>
  (g.campaign?.kind ? g.campaign.seatHeroes : undefined) ??
  g.table?.seats.map((p) => p.startingHeroes.length) ?? [
    g.campaign?.heroes.length ?? 3,
  ];
/** Each seat's heroes as the Campaign Log records them. */
const campaignSeatHeroes = (g: GameState, list: string[]) => {
  const counts = campaignSeatCounts(g);
  return counts.map((n, i) =>
    list.slice(
      counts.slice(0, i).reduce((a, b) => a + b, 0),
      counts.slice(0, i).reduce((a, b) => a + b, 0) + n,
    ),
  );
};
/** Recorded chapters out of the campaign's required chapters. */
const campaignProgress = (c: CampaignState) =>
  c.kind === "saga"
    ? `${c.completed.filter((q) => !SAGA_INSERTS.includes(q.scenarioId)).length} / ${SAGA_CAMPAIGN_ORDER.length}`
    : c.kind === "angmar"
      ? `${c.completed.length} / ${ANGMAR_CAMPAIGN_ORDER.length}`
      : c.kind === "dreamchaser"
        ? `${c.completed.length} / ${DREAMCHASER_CAMPAIGN_ORDER.length}`
        : c.kind === "ered"
          ? `${c.completed.length} / ${ERED_CAMPAIGN_ORDER.length}`
          : `${c.completed.length} / ${mirkwoodPathsOrder(c).length}`;
const CAMPAIGN_TITLES: Record<CampaignKind, string> = {
  mirkwood: "Mirkwood Paths",
  saga: "The Lord of the Rings",
  angmar: "Angmar Awakened",
  dreamchaser: "Dream-chaser",
  ered: "Ered Mithrin",
};
/** The chapter a campaign continues with, or undefined when it is complete. */
const nextChapterOf = (c: CampaignState): ScenarioId | undefined =>
  c.kind === "saga"
    ? nextSagaChapter(c)
    : c.kind === "angmar"
      ? nextAngmarChapter(c)
      : c.kind === "dreamchaser"
        ? nextDreamchaserChapter(c)
        : c.kind === "ered"
          ? nextEredChapter(c)
          : nextMirkwoodChapter(c);
/** The hero title a campaign's next chapter forbids. */
const forbiddenTitleOf = (c: CampaignState, next?: ScenarioId) =>
  !next
    ? undefined
    : c.kind === "saga"
      ? sagaForbiddenTitle(next)
      : c.kind === "angmar"
        ? angmarForbiddenTitle(next)
        : c.kind === "dreamchaser"
          ? dreamchaserForbiddenTitle(next)
          : c.kind === "ered"
            ? eredForbiddenTitle(next)
            : undefined;
const readMode = (): PlayMode => {
  try {
    return localStorage.getItem(MODE_KEY) === "campaign"
      ? "campaign"
      : "normal";
  } catch {
    return "normal";
  }
};
const activeSaveKey = () =>
  readMode() === "campaign" ? CAMPAIGN_KEY : SAVE_KEY;
type Page =
  "adventures" | "library" | "fellowship" | "decks" | "guide" | "table";
declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => Promise<void>;
  }
}
const readSave = (key = SAVE_KEY) => {
  try {
    const s = JSON.parse(localStorage.getItem(key) ?? "null");
    const restored = restoreSave(s);
    return restored ? startGuided(restored) : null;
  } catch {
    return null;
  }
};
const readDeckId = () => {
  try {
    const d = localStorage.getItem(DECK_KEY);
    return BUILT_IN_DECKS.some((s) => s.id === d) ||
      /^custom:[\w-]+$/.test(d ?? "")
      ? d!
      : "leadership";
  } catch {
    return "leadership";
  }
};
const phaseNames: Record<string, string> = {
  setup: "Your opening hand",
  resource: "Resource actions",
  planning: "Planning",
  quest: "Commit to the quest",
  staging: "Resolve the quest",
  travel: "Travel",
  encounter: "Encounter",
  defense: "Defend your fellowship",
  attack: "Strike back",
  refresh: "Refresh",
};
const objectiveClaimCode = (s: GameState, id: string) =>
  s.staging.find((u) => u.id === id)?.code ??
  allHeroes(s)
    .flatMap((h) => h.attachments)
    .find((a) => a.id === id)?.code;
const claimableObjectives: string[] = [
  ...GATE_KEY_FACES,
  FANGORN.mugash,
  ...OBJECTIVES,
  RHOS.athelas,
  KHAZAD.book,
  KHAZAD.tools,
  F.axe,
  F.helm,
  H.scroll,
  ...STEWARD_CLUES,
  LAKE.thrush,
];
const exhaustedClaimObjectives: string[] = [
  ...GATE_KEY_FACES,
  RHOS.athelas,
  KHAZAD.book,
  KHAZAD.tools,
  F.axe,
  F.helm,
  H.scroll,
  ...STEWARD_CLUES,
  LAKE.thrush,
];
const objectiveClaimExhausts = (s: GameState, id: string) =>
  s.staging.some((u) => u.id === id && u.code === FANGORN.mugash) ||
  exhaustedClaimObjectives.includes(objectiveClaimCode(s, id) ?? "");
const objectiveClaimRestricted = (s: GameState, id: string) =>
  ![
    ...GATE_KEY_FACES,
    RHOS.athelas,
    H.scroll,
    FANGORN.mugash,
    ...STEWARD_CLUES,
    LAKE.thrush,
  ].includes(objectiveClaimCode(s, id) ?? "");
const objectiveClaimDescription = (s: GameState, id: string) => {
  const code = objectiveClaimCode(s, id);
  if (code === S.prisoner || code === S.scrap)
    return `Exhaust a ready hero you control to add this Clue to the victory display and place ${code === S.prisoner ? 2 : 1} resource ${code === S.prisoner ? "tokens" : "token"} on the quest.`;
  if (objectiveClaimExhausts(s, id))
    return `Choose a ready hero who can exhaust to carry the objective. Claiming it adds no threat.${objectiveClaimRestricted(s, id) ? " This objective is a restricted attachment." : ""}`;
  return "Choose a hero to carry the objective. Raise your threat by 2; this counts toward the hero’s two restricted attachments.";
};
const pendingEnemyAttack = (s: GameState, u: Unit) =>
  normalAttackPending(s, u) && !enemyAttackPrevented(s, u);
const phaseTitle = (s: GameState) =>
  s.sailing?.test
    ? "Sailing test"
    : s.escapeTest
      ? "Escape test"
      : s.hideTest
        ? isFortitude(s.hideTest)
          ? "Fortitude test"
          : "Hide test"
        : s.phase === "attack" && s.earlyAttackPlayers?.length
          ? "Oath of Eorl · Player attacks"
          : phaseNames[s.phase];
/** "1 player", "2 players": English plural for the setup summaries. */
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
const handPlayDefinition = (s: GameState, u: Unit, amount?: number): Card => {
  const c = card(u.code);
  return {
    ...c,
    playOwner: u.owner ?? activeSeat(s),
    ...(u.id.startsWith("discard-play:")
      ? { playOrigin: "discard" as const }
      : {}),
    ...(u.id.startsWith(GANDALF_DECK_PREVIEW) ? { gandalfDeckPlay: true } : {}),
    ...(c.cost === "X" && amount !== undefined ? { cost: amount } : {}),
  };
};
function planCardPayment(s: GameState, c: Card, cost: number, target?: Unit) {
  const payers = eligiblePayers(s, c, target);
  if (["01036", "08143", "10085", "19149"].includes(c.code)) {
    const heroes = payers
      .filter((u) => u.resources > 0 && s.heroes.some((h) => h.id === u.id))
      .slice(0, 3);
    const payment: Record<string, number> = Object.fromEntries(
      payers.map((u) => [u.id, heroes.includes(u) ? 1 : 0]),
    );
    let remaining = cost - heroes.length;
    for (const h of heroes) {
      const extra = Math.min(Math.max(0, remaining), h.resources - 1);
      payment[h.id] += extra;
      remaining -= extra;
    }
    return payment;
  }
  const single = singlePoolCard(c)
    ? payers.find((u) => u.resources >= cost)
    : null;
  let left = cost;
  return Object.fromEntries(
    payers.map((u) => {
      const spend =
        singlePoolCard(c) && u !== single ? 0 : Math.min(left, u.resources);
      left -= spend;
      return [u.id, spend];
    }),
  );
}
const sameDeckRecipe = (
  a: Pick<CustomDeck, "heroes" | "cards">,
  b: Pick<CustomDeck, "heroes" | "cards">,
) =>
  JSON.stringify([...a.heroes].sort()) ===
    JSON.stringify([...b.heroes].sort()) &&
  JSON.stringify(
    Object.entries(a.cards)
      .filter(([, n]) => n > 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  ) ===
    JSON.stringify(
      Object.entries(b.cards)
        .filter(([, n]) => n > 0)
        .sort(([a], [b]) => a.localeCompare(b)),
    );
function Ambient() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (reducedMotion) return;
    const c = ref.current!;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const resize = () => {
      const width = Math.round(c.clientWidth);
      const height = Math.round(c.clientHeight);
      if (c.width !== width) c.width = width;
      if (c.height !== height) c.height = height;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(c);
    let frame = 0;
    const particles = Array.from({ length: 22 }, (_, i) => ({
      x: ((i * 157) % 1000) / 1000,
      y: ((i * 71) % 800) / 800,
      r: (i % 3) + 0.5,
    }));
    const draw = (t: number) => {
      ctx.clearRect(0, 0, c.width, c.height);
      particles.forEach((p, i) => {
        const x = (p.x + Math.sin(t / 12000 + i) * 0.03) * c.width,
          y = ((((p.y - t / 140000) % 1) + 1) % 1) * c.height;
        ctx.fillStyle = `rgba(226,198,134,${0.13 + Math.sin(t / 2000 + i) * 0.1})`;
        ctx.beginPath();
        ctx.arc(x, y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [reducedMotion]);
  return <canvas ref={ref} className="ambient" aria-hidden="true" />;
}
function CardDetail({
  c,
  onClose,
  action,
}: {
  c: Card & { attachmentResourceTokens?: number; initialReverse?: boolean };
  onClose: () => void;
  action?: ReactNode;
}) {
  const companionFront =
    c.code === "21072.B"
      ? card("21072")
      : c.code === ROAM.urdugEnemy
        ? card(ROAM.urdug)
        : c.code === ROAM.tinyEnemy
          ? card(ROAM.tiny)
          : [TEMPLE.sahirAlly, TEMPLE.naasiyahAlly].includes(c.code)
            ? card(c.code.slice(0, -2))
            : undefined;
  const reverseDefinition =
    c.code === "21072"
      ? card("21072.B")
      : c.code === ROAM.urdug
        ? card(ROAM.urdugEnemy)
        : c.code === ROAM.tiny
          ? card(ROAM.tinyEnemy)
          : undefined;
  if (companionFront)
    c = {
      ...c,
      back_name: companionFront.name,
      back_traits: companionFront.traits,
      back_text: companionFront.text,
      back_imagesrc: companionFront.imagesrc,
    };
  const origin = cardProductInfo(c);
  const source = c.source_url ?? c.url;
  const printing = c as Card & {
    position?: number | string;
    corner_text?: string;
  };
  const printedNumber =
    printing.position ?? (!c.code.startsWith("octgn:") ? c.code : undefined);
  const [reverse, setReverse] = useState(!!c.initialReverse);
  const shown = reverse
    ? (companionFront ??
      reverseDefinition ?? {
        ...c,
        name: c.back_name ?? c.name,
        traits: c.back_traits ?? c.traits,
        text: c.back_text ?? (c.type_code === "quest" ? "" : c.text),
        imagesrc: c.back_imagesrc ?? c.imagesrc,
        type_code: c.back_type_code ?? c.type_code,
        sphere_code: c.back_sphere_code ?? c.sphere_code,
        engagement: c.back_engagement ?? c.engagement,
        threat: c.back_threat ?? c.threat,
        willpower: c.back_willpower ?? c.willpower,
        attack: c.back_attack ?? c.attack,
        defense: c.back_defense ?? c.defense,
        health: c.back_health ?? c.health,
        quest: c.back_quest ?? c.quest,
      })
    : c;
  const otherName = reverse ? c.name : (c.back_name ?? "Reverse side");
  const otherTraits = reverse ? c.traits : c.back_traits;
  const otherText = reverse ? c.text : c.back_text;
  return (
    <Modal title={shown.name} onClose={onClose} wide>
      <div className="card-detail">
        {c.back_imagesrc ? (
          <div className="card-detail-art">
            <Art
              key={`${c.code}-${reverse}`}
              className={
                ["quest", "player-side-quest", "encounter-side-quest"].includes(
                  c.type_code,
                )
                  ? "quest-reference-art"
                  : ""
              }
              imageSrc={reverse ? c.back_imagesrc : undefined}
              c={shown}
            />
            <button
              className="secondary"
              aria-pressed={reverse}
              onClick={() => setReverse((shown) => !shown)}
            >
              {reverse ? "Show front" : "Show reverse"}
            </button>
          </div>
        ) : (
          <Art
            c={c}
            className={
              ["quest", "player-side-quest", "encounter-side-quest"].includes(
                c.type_code,
              )
                ? "quest-reference-art"
                : ""
            }
          />
        )}
        <div>
          <div className="card-detail-primary" data-card-primary-face>
            <div className="detail-type">
              <Sphere sphere={shown.sphere_code} />
              {shown.type_code} · {shown.sphere_code}
            </div>
            <h3 data-card-primary-name>{shown.name}</h3>
            <p className="traits" data-card-primary-traits>
              {shown.traits}
            </p>
            {(shown.health !== undefined || shown.printed_stats?.health) && (
              <div className="detail-stats">
                {["enemy", "ship-enemy"].includes(shown.type_code) ? (
                  <StatBadge
                    kind="threat"
                    value={shown.printed_stats?.threat ?? shown.threat}
                    caption
                  />
                ) : (
                  <StatBadge
                    kind="willpower"
                    value={shown.printed_stats?.willpower ?? shown.willpower}
                    caption
                  />
                )}
                <StatBadge
                  kind="attack"
                  value={shown.printed_stats?.attack ?? shown.attack}
                  caption
                />
                <StatBadge
                  kind="defense"
                  value={shown.printed_stats?.defense ?? shown.defense}
                  caption
                />
                <StatBadge
                  kind="health"
                  value={shown.printed_stats?.health ?? shown.health}
                  caption
                />
              </div>
            )}
            {(shown.text || c.type_code !== "quest") && (
              <p className="rules-text" data-card-primary-rules>
                {plain(shown.text) || "No additional abilities."}
              </p>
            )}
            {shown.shadow && (
              <p className="shadow-text">{plain(shown.shadow)}</p>
            )}
          </div>
          {otherText && (
            <div className="card-back-rules" data-card-other-face>
              <h4>Other printed face · {otherName}</h4>
              {otherTraits && <p className="traits">{otherTraits}</p>}
              <p className="rules-text">{plain(otherText)}</p>
            </div>
          )}
          {action}
          <div className="source-note">
            <strong>{origin.originLabel}</strong>
            <br />
            {origin.availableIn.length > 1 && (
              <>
                <span>
                  Also included in:{" "}
                  {origin.availableIn
                    .filter((p) => p.id !== origin.original?.id)
                    .map((p) => p.name)
                    .join(" · ")}
                </span>
                <br />
              </>
            )}
            {c.encounter_set && (
              <>
                <span>Encounter set: {c.encounter_set}</span>
                <br />
              </>
            )}
            {c.nightmare && (
              <>
                <span>Nightmare edition</span>
                <br />
              </>
            )}
            {c.attachmentResourceTokens !== undefined && (
              <>
                <strong>
                  Live resource tokens: {c.attachmentResourceTokens}
                </strong>
                <br />
              </>
            )}
            {printedNumber !== undefined && (
              <>
                Card #{printedNumber}
                <br />
              </>
            )}
            {printing.corner_text && (
              <>
                Printed corner: {printing.corner_text}
                <br />
              </>
            )}
            {c.illustrator && `Illustration: ${c.illustrator}`}
            <br />
            {isScriptedCard(c)
              ? "Automated play support is available."
              : "Available to browse. Gameplay scripting is not available yet."}
          </div>
          {source && /^https?:\/\//.test(source) && (
            <a
              className="text-link"
              href={source}
              target="_blank"
              rel="noreferrer"
            >
              {c.source === "dragncards"
                ? "View DragnCards source"
                : c.source === "octgn"
                  ? "View OCTGN source"
                  : c.source === "ffg"
                    ? "View official source"
                    : "View on RingsDB"}{" "}
              <ArrowRight />
            </a>
          )}
        </div>
      </div>
    </Modal>
  );
}
function Stats({
  s,
  u,
  computed,
}: {
  s: GameState;
  u: Unit;
  computed?: ReturnType<typeof stats>;
}) {
  const st = computed ?? stats(s, u);
  const c = card(u.code);
  return (
    <div className="card-modifiers" aria-label="Modified card values">
      {st.will !== (c.willpower ?? 0) && (
        <StatBadge kind="willpower" value={st.will} />
      )}
      {st.attack !== (c.attack ?? 0) && (
        <StatBadge kind="attack" value={st.attack} />
      )}
      {st.defense !== (c.defense ?? 0) && (
        <StatBadge kind="defense" value={st.defense} />
      )}
      {st.health !== (c.health ?? 0) && (
        <StatBadge kind="health" value={st.health} label="Maximum hit points" />
      )}
    </div>
  );
}

export default function App() {
  const reducedMotion = useReducedMotion();
  const [initialChoices] = useState(readChoices);
  const [page, setPage] = useState<Page>("adventures");
  const focusedPage = useRef(page);
  useLayoutEffect(() => {
    if (focusedPage.current === page) return;
    focusedPage.current = page;
    let observer: MutationObserver | undefined;
    const focusPage = () => {
      const main = document.getElementById("main-content");
      if (!main) return false;
      // A rules choice already in the top layer keeps its own focus.
      if (!document.querySelector("dialog[open]"))
        main.focus({ preventScroll: true });
      observer?.disconnect();
      return true;
    };
    if (!focusPage()) {
      // Lazy routes replace their loading state after the page has changed.
      observer = new MutationObserver(focusPage);
      observer.observe(document.getElementById("root")!, {
        childList: true,
        subtree: true,
      });
    }
    return () => observer?.disconnect();
  }, [page]);
  const [significantMoment, setSignificantMoment] =
    useState<ActiveSignificantMoment | null>(null);
  const momentSerial = useRef(0);
  const dismissMoment = useCallback((serial: number) => {
    setSignificantMoment((m) => (m?.serial === serial ? null : m));
  }, []);
  useEffect(() => {
    if (page !== "table") {
      audio.stop();
      setSignificantMoment(null);
    }
  }, [page]);
  const [libraryProduct, setLibraryProduct] = useState("all");
  const [game, setGame] = useState<GameState | null>(() =>
    readSave(
      initialChoices
        ? initialChoices.playMode === "campaign"
          ? CAMPAIGN_KEY
          : SAVE_KEY
        : activeSaveKey(),
    ),
  );
  const [setupMode, setSetupMode] = useState<"classic" | "hotseat">(() => {
    if (initialChoices) return initialChoices.setupMode;
    return game ? (game.table ? "hotseat" : "classic") : "hotseat";
  });
  const [playMode, setPlayMode] = useState<PlayMode>(
    () => initialChoices?.playMode ?? readMode(),
  );
  const [selectedScenario, setSelectedScenario] = useState<ScenarioId>(
    () => initialChoices?.scenario ?? game?.scenarioId ?? "mirkwood",
  );
  const [campaignKind, setCampaignKindState] = useState<CampaignKind>(() =>
    game?.campaign ? campaignKindOf(game.campaign) : readCampaignKind(),
  );
  const setCampaignKind = (kind: CampaignKind) => {
    setCampaignKindState(kind);
    try {
      localStorage.setItem(CAMPAIGN_KIND_KEY, kind);
    } catch {
      // The choice still applies for this visit.
    }
  };
  /**
   * Mirkwood Paths: a new campaign begins with the Core Set's Part 1, or as
   * The Dark of Mirkwood's mini campaign at The Oath.
   */
  const [mirkwoodStart, setMirkwoodStart] = useState<"mirkwood" | "the-oath">(
    "mirkwood",
  );
  /**
   * The Caves of Nibin-Dûm's legacy: the players (seat order) who shuffle 1
   * copy of Ranger Sense into their deck at the start of a new campaign.
   */
  const [rangerSeats, setRangerSeats] = useState([true, true, true, true]);
  const campaignStart: ScenarioId =
    campaignKind === "saga"
      ? "a-shadow-of-the-past"
      : campaignKind === "angmar"
        ? "intruders-in-chetwood"
        : campaignKind === "dreamchaser"
          ? "voyage-across-belegaer"
          : campaignKind === "ered"
            ? "journey-up-the-anduin"
            : mirkwoodStart;
  const [interlude, setInterlude] = useState(false);
  const [nextHeroes, setNextHeroes] = useState<string[]>([]);
  const [nextSeatDecks, setNextSeatDecks] = useState<string[]>([]);
  const [nextDeck, setNextDeck] = useState("leadership");
  /** The Lord of the Rings campaign: the chapter chosen for the interlude. */
  const [nextChapter, setNextChapter] = useState<ScenarioId | undefined>();
  /** The Lord of the Rings campaign: the deck each earned player-card boon joins. */
  /** The Dream-chaser campaign: the Hard/Expert Mode card for the next chapter. */
  const [dcMode, setDcMode] = useState<"" | "hard" | "expert">("");
  /** The Dream-chaser campaign: the Campaign Log's checkboxes after spending XP. */
  const [nextMarks, setNextMarks] = useState<Record<string, number>>({});
  const [nextDeckBoons, setNextDeckBoons] = useState<
    Record<string, number | null>
  >({});
  const [includeSupport, setIncludeSupport] = useState(true);
  const [claimId, setClaimId] = useState<string | null>(null);
  const quest = scenario(
    playMode === "campaign"
      ? game?.campaign && campaignKindOf(game.campaign) === campaignKind
        ? game.scenarioId
        : campaignStart
      : selectedScenario,
  );
  const switchMode = (mode: PlayMode) => {
    if (mode === playMode) return;
    const saved = readSave(mode === "campaign" ? CAMPAIGN_KEY : SAVE_KEY);
    setPlayMode(mode);
    audio.stop();
    setSignificantMoment(null);
    setGame(saved);
    if (saved) {
      const recovered = recoverSavedDecks(saved, decks);
      setDecks(recovered);
      setSetupMode(saved.table ? "hotseat" : "classic");
      if (saved.table) setSeats(savedSeats(saved, recovered));
      setSelectedDeck(savedDeckId(saved, recovered));
      setEasyMode(saved.easyMode ? "on" : "off");
    }
    setSelectedScenario(saved?.scenarioId ?? "mirkwood");
    setHistory([]);
  };
  const [initialDeckStorage] = useState(readDeckStorage);
  const observedDeckRaw = useRef(initialDeckStorage.raw);
  const [initialDecks] = useState<CustomDeck[]>(() =>
    recoverSavedDecks(game, initialDeckStorage.decks),
  );
  const [decks, setDecksState] = useState<CustomDeck[]>(initialDecks);
  const [selectedDeck, setSelectedDeck] = useState(() => {
    const id =
      initialChoices?.selectedDeck ??
      (game ? savedDeckId(game, decks) : readDeckId());
    return describeDeck(id, decks)
      ? id
      : game
        ? savedDeckId(game, decks)
        : "leadership";
  });
  const [seats, setSeats] = useState<SeatConfig[]>(() =>
    initialChoices
      ? setupSeats(
          initialChoices.seatDecks.map((deckId, i) => ({
            deckId:
              !describeDeck(deckId, decks) &&
              game?.table?.seats[i] &&
              initialChoices.scenario === game.scenarioId
                ? savedDeckId(game.table.seats[i], decks)
                : deckId,
          })),
          decks,
        )
      : game?.table
        ? savedSeats(game, decks)
        : setupSeats(undefined, decks),
  );
  const [reserveWindCounts, setReserveWindCounts] = useState<
    Record<string, number>
  >({});
  const [reserveEagleCounts, setReserveEagleCounts] = useState<
    Record<string, number>
  >({});
  const [reserveRangerCounts, setReserveRangerCounts] = useState<
    Record<string, number>
  >({});
  const [reserveBombadilCounts, setReserveBombadilCounts] = useState<
    Record<string, number>
  >({});
  const encounterReserveDecks = (style: "classic" | "hotseat") =>
    (style === "hotseat" ? seats.map((p) => p.deckId) : [selectedDeck]).flatMap(
      (id, player) => {
        const d = describeDeck(id, decks);
        if (!d) return [];
        const wind = (d.cards["17140"] ?? 0) > 0,
          rangers = (d.cards["09007"] ?? 0) > 0,
          eagles = (d.cards["19032"] ?? 0) > 0,
          bombadil = (d.cards["22005"] ?? 0) > 0;
        return Number(wind) +
          Number(rangers) +
          Number(eagles) +
          Number(bombadil) >=
          1
          ? [
              {
                player,
                id,
                name: d.name,
                wind,
                rangers,
                eagles,
                bombadil,
                defaults: encounterReserveDefaults(
                  Object.keys(d.cards).filter((c) => d.cards[c] > 0),
                ),
              },
            ]
          : [];
      },
    );
  type ReserveDeck = ReturnType<typeof encounterReserveDecks>[number];
  const selectedReserveAllocation = (entry: ReserveDeck) => {
    const key = `${entry.player}:${entry.id}`;
    return {
      w: entry.wind ? (reserveWindCounts[key] ?? entry.defaults.wind) : 0,
      e: entry.eagles ? (reserveEagleCounts[key] ?? entry.defaults.eagles) : 0,
      r: entry.rangers
        ? (reserveRangerCounts[key] ?? entry.defaults.rangers)
        : 0,
      b: entry.bombadil
        ? (reserveBombadilCounts[key] ?? entry.defaults.bombadil ?? 0)
        : 0,
    };
  };
  const encounterReserveControls = (style: "classic" | "hotseat") => {
    const eligible = encounterReserveDecks(style);
    return eligible.length ? (
      <section
        className="encounter-reserve-setup"
        data-encounter-reserve-setup
        aria-label="Encounter card reserves"
      >
        <h3>Encounter card reserves</h3>
        <p>
          Set aside up to three copies of each Encounter card for each player.
        </p>
        {eligible.flatMap((entry) => {
          const { player, id, name } = entry;
          const key = `${player}:${id}`;
          const selection = selectedReserveAllocation(entry);
          const kinds = [
            {
              enabled: entry.rangers,
              label: "Ranger of the North",
              count: selection.r,
              set: setReserveRangerCounts,
            },
            {
              enabled: entry.wind,
              label: "Wind from the Sea",
              count: selection.w,
              set: setReserveWindCounts,
            },
            {
              enabled: entry.eagles,
              label: "Eagle of the North",
              count: selection.e,
              set: setReserveEagleCounts,
            },
            {
              enabled: entry.bombadil,
              label: "Tom Bombadil",
              count: selection.b,
              set: setReserveBombadilCounts,
            },
          ];
          return kinds
            .filter((kind) => kind.enabled)
            .map((kind) => (
              <label key={`${style}:${key}:${kind.label}`}>
                <span>
                  Player {player + 1} · {name} · {kind.label}
                </span>
                <select
                  aria-label={`Player ${player + 1} ${kind.label} reserves`}
                  value={kind.count}
                  onChange={(event) =>
                    kind.set((current) => ({
                      ...current,
                      [key]: Number(event.target.value),
                    }))
                  }
                >
                  {[0, 1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "copy" : "copies"}
                    </option>
                  ))}
                </select>
              </label>
            ));
        })}
      </section>
    ) : null;
  };
  // The Hobbit: treasures discovered by this group of heroes may join decks.
  const [treasureSeats, setTreasureSeats] = useState<Record<string, number>>(
    {},
  );
  const fellowshipHeroes = (style: "classic" | "hotseat") =>
    style === "hotseat"
      ? seats.flatMap((p) => p.heroes)
      : (describeDeck(selectedDeck, decks)?.heroes ?? []);
  const treasureChoices = (style: "classic" | "hotseat") =>
    playMode !== "campaign" &&
    HOBBIT_TREASURE_SCENARIOS.includes(selectedScenario)
      ? discoveredTreasures(fellowshipHeroes(style)).filter((code) =>
          scenarioTreasures(selectedScenario).includes(code),
        )
      : [];
  const selectedTreasures = (style: "classic" | "hotseat") => {
    const players = style === "hotseat" ? seats.length : 1;
    const result: Record<number, string[]> = {};
    for (const code of treasureChoices(style)) {
      const seat = treasureSeats[code] ?? 0;
      if (seat >= 0 && seat < players) (result[seat] ??= []).push(code);
    }
    return result;
  };
  const treasureControls = (style: "classic" | "hotseat") => {
    const choices = treasureChoices(style);
    if (!choices.length) return null;
    const players = style === "hotseat" ? seats.length : 1;
    return (
      <section
        className="encounter-reserve-setup"
        data-treasure-setup
        aria-label="Discovered treasures"
      >
        <h3>Discovered treasures</h3>
        <p>
          These heroes discovered treasure that this scenario's setup allows.
          Each treasure may join one deck; it does not count toward the deck
          size.
        </p>
        {choices.map((code) => (
          <label key={`${style}:${code}`}>
            <span>{card(code).name}</span>
            <select
              aria-label={`${card(code).name} treasure`}
              value={treasureSeats[code] ?? 0}
              onChange={(event) =>
                setTreasureSeats((current) => ({
                  ...current,
                  [code]: Number(event.target.value),
                }))
              }
            >
              {Array.from({ length: players }, (_, p) => (
                <option key={p} value={p}>
                  Player {p + 1}'s deck
                </option>
              ))}
              <option value={-1}>Leave it out</option>
            </select>
          </label>
        ))}
      </section>
    );
  };
  const setDecks = (list: CustomDeck[]) => {
    const current = readDeckStorage();
    if (current.raw !== observedDeckRaw.current) {
      observedDeckRaw.current = current.raw;
      setDecksState(recoverSavedDecks(game, current.decks));
      return false;
    }
    const persisted = writeDecks(list, observedDeckRaw.current);
    if (persisted) observedDeckRaw.current = readDeckStorage().raw;
    setDecksState(list);
    if (!describeDeck(selectedDeck, list)) setSelectedDeck("leadership");
    setSeats((current) => setupSeats(current, list));
    return persisted;
  };
  const starter =
    describeDeck(selectedDeck, decks) ?? describeDeck("leadership", decks)!;
  const deck = starter.cards;
  // Seats may reference a custom deck; the engine receives its card list.
  const seatConfig = (p: SeatConfig): SeatConfig =>
    isCustomId(p.deckId)
      ? {
          heroes: p.heroes,
          deckId: "custom",
          cards: decks.find((d) => customId(d) === p.deckId)?.cards,
        }
      : p;
  const [easyMode, setEasyMode] = usePreference("easy-mode", "off", [
    "off",
    "on",
  ] as const);
  const [showRecords, setShowRecords] = useState(false);
  const [records, setRecords] = useState(readRecords);
  const resumable =
    game &&
    ((playMode === "campaign" &&
      campaignKindOf(game.campaign) === campaignKind) ||
      (game.scenarioId === selectedScenario &&
        (setupMode === "hotseat"
          ? !!game.table &&
            game.table.seats.map((p) => p.deckId).join() ===
              seats
                .map((p) => (isCustomId(p.deckId) ? "custom" : p.deckId))
                .join() &&
            game.table.seats.every((p, i) =>
              matchesSavedDeck(p, seats[i].deckId, decks),
            )
          : !game.table && matchesSavedDeck(game, selectedDeck, decks))));
  const displayHeroes =
    playMode === "campaign" &&
    game?.campaign &&
    campaignKindOf(game.campaign) === campaignKind
      ? game.campaign.heroes
      : setupMode === "hotseat"
        ? seats.flatMap((p) => p.heroes)
        : starter.heroes;
  const selectedScenarioProblem = shadowEastPlayerScenarioProblem(
    playMode === "campaign" ? campaignStart : selectedScenario,
    displayHeroes,
  );
  const [detail, setDetail] = useState<Card | null>(null);
  const templeViewer = game?.temple ? activeSeat(game) : undefined;
  useEffect(() => {
    setDetail(null);
  }, [templeViewer]);
  useEffect(() => {
    const treasures =
      game?.weMustAway?.treasures ??
      game?.fliesSpiders?.treasures ??
      game?.lonelyMountain?.treasures ??
      [];
    if (game?.status === "won" && treasures.length)
      recordTreasures(tableHeroes(game), treasures);
  }, [
    game?.status,
    game?.weMustAway?.treasures.length,
    game?.fliesSpiders?.treasures.length,
    game?.lonelyMountain?.treasures.length,
  ]);
  const [recoveryImport, setRecoveryImport] = useState<RecoveryImport | null>(
    null,
  );
  const [toast, setToast] = useState("");
  const [restart, setRestart] = useState(false);
  const [menu, setMenu] = useState(false);
  const restoreMenuFocus = useRef(true);
  const audio = useSignificantAudio(page === "table", game?.originalSeed);
  const sound = !audio.preferences.muted;
  const [playCard, setPlayCard] = useState<Unit | null>(null);
  const [playDiscardIndex, setPlayDiscardIndex] = useState<number | null>(null);
  /** The play dialog shows Gandalf's faceup top card of the deck. */
  const [playDeck, setPlayDeck] = useState(false);
  const [target, setTarget] = useState("");
  const [payment, setPayment] = useState<Record<string, number>>({});
  const [xCost, setXCost] = useState(1);
  const [combatEnemy, setCombatEnemy] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [showResolution, setShowResolution] = useState(true);
  useEffect(() => {
    setShowResolution(true);
  }, [game?.flow?.pending?.id]);
  const [showSettings, setShowSettings] = useState(false);
  const [showPiles, setShowPiles] = useState(false);
  const [showQuest, setShowQuest] = useState(false);
  const [pile, setPile] = useState<"player" | "encounter">("player");
  const [density, setDensity] = usePreference("density", "comfortable", [
    "comfortable",
    "compact",
  ] as const);
  const [reviewMode, setReviewMode] = usePreference(
    "review-mode",
    "hidden",
    REVIEW_MODES,
  );
  // The saved preference applies to the current game, including restored saves.
  useEffect(() => {
    if (!game?.flow || (game.flow.mode ?? "all") === reviewMode) return;
    try {
      setGame(applyAction(game, { type: "SET_REVIEW_MODE", mode: reviewMode }));
    } catch {
      /* An unsupported mode leaves the game unchanged. */
    }
  }, [game, reviewMode]);
  const [coach, setCoach] = usePreference("coach", "on", [
    "on",
    "off",
  ] as const);
  const coachingTip = useMemo(
    () => (game && page === "table" && coach === "on" ? coachTip(game) : null),
    [game, page, coach],
  );
  const [tutorial, setTutorial] = usePreference("tutorial", "pending", [
    "pending",
    "seen",
  ] as const);
  const [hoverCards, setHoverCards] = usePreference("hover-cards", "on", [
    "on",
    "off",
  ] as const);
  const [playmat, setPlaymat] = usePreference(
    "playmat",
    "adventure",
    PLAYMAT_CHOICES,
  );
  const activePlaymat =
    playmat === "adventure"
      ? page === "table" && game
        ? game.scenarioId
        : quest.id
      : playmat;
  const [saved, setSaved] = useState(true);
  const saveFailureNotified = useRef(false);
  const [history, setHistory] = useState<GameState[]>([]);
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    // Persist a genuinely missing saved fellowship without rewriting a shelf
    // that was filtered, filled, or changed by another tab during startup.
    if (
      initialDeckStorage.issue === null &&
      initialDecks.length > initialDeckStorage.decks.length &&
      deckStorageProblem(initialDecks) === null &&
      writeDecks(initialDecks, initialDeckStorage.raw)
    )
      observedDeckRaw.current = readDeckStorage().raw;
  }, [initialDeckStorage, initialDecks]);
  useEffect(() => {
    if (initialDeckStorage.issue)
      notify(
        "Some saved deck data could not be read. Its original data has been kept. Export a recovery backup from How to play.",
      );
  }, [initialDeckStorage.issue, notify]);
  useEffect(() => {
    const refreshDeckShelf = (event: StorageEvent) => {
      if (event.key !== DECKS_KEY && event.key !== null) return;
      const current = readDeckStorage();
      observedDeckRaw.current = current.raw;
      const refreshed = recoverSavedDecks(game, current.decks);
      setDecksState(refreshed);
      setSeats((seats) => setupSeats(seats, refreshed));
      setSelectedDeck((selected) =>
        describeDeck(selected, refreshed) ? selected : "leadership",
      );
      notify(
        current.issue
          ? "Deck data changed in another tab but could not be read. Its original data has been kept; your unfinished changes remain open."
          : "The deck shelf was updated from another tab. Your unfinished changes remain open.",
      );
    };
    window.addEventListener("storage", refreshDeckShelf);
    return () => window.removeEventListener("storage", refreshDeckShelf);
  }, [game, notify]);
  const [showAccount, setShowAccount] = useState(false);
  const [previewDeck, setPreviewDeck] = useState<string | null>(null);
  const choices = useMemo<FellowshipChoices>(
    () => ({
      version: 1,
      setupMode,
      selectedDeck,
      seatDecks: seats.map((p) => p.deckId),
      playMode,
      scenario: selectedScenario,
    }),
    [setupMode, selectedDeck, seats, playMode, selectedScenario],
  );
  const restoreChoices = useCallback(
    (restored: FellowshipChoices) => {
      const saved = readSave(
        restored.playMode === "campaign" ? CAMPAIGN_KEY : SAVE_KEY,
      );
      const recovered = recoverSavedDecks(saved, decks);
      setDecks(recovered);
      setSetupMode(restored.setupMode);
      setSelectedDeck(
        describeDeck(restored.selectedDeck, recovered)
          ? restored.selectedDeck
          : "leadership",
      );
      setSeats(
        setupSeats(
          restored.seatDecks.map((deckId) => ({ deckId })),
          recovered,
        ),
      );
      setSelectedScenario(restored.scenario);
      setPlayMode(restored.playMode);
      audio.stop();
      setSignificantMoment(null);
      setGame(saved);
      if (
        [restored.selectedDeck, ...restored.seatDecks].some(
          (id) => !describeDeck(id, recovered),
        )
      )
        notify(
          "A custom deck is missing on this device. Choose a local deck or import the adventure save.",
        );
      setHistory([]);
      setPage("adventures");
    },
    [decks],
  );
  const account = useAccount(choices, restoreChoices);
  useEffect(() => {
    if (account.recovery) setShowAccount(true);
  }, [account.recovery]);
  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, playMode);
    } catch {
      /* local mode still works */
    }
  }, [playMode]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const warning =
      "Your latest progress could not be saved on this device. Export the adventure to keep it.";
    if (!game) {
      setSaved(true);
      saveFailureNotified.current = false;
      return;
    }
    try {
      localStorage.setItem(
        game.playMode === "campaign" ? CAMPAIGN_KEY : SAVE_KEY,
        JSON.stringify(game),
      );
      setSaved(true);
      if (saveFailureNotified.current) {
        saveFailureNotified.current = false;
        setToast((current) => (current === warning ? "" : current));
      }
    } catch {
      setSaved(false);
      if (!saveFailureNotified.current) {
        saveFailureNotified.current = true;
        notify(warning);
      }
    }
  }, [game, notify]);
  // Finished adventures join the journey record once.
  useEffect(() => {
    if (!game || game.status === "playing") return;
    const added = recordGame(game);
    if (added) setRecords(readRecords());
  }, [game]);
  useEffect(() => {
    try {
      localStorage.setItem(DECK_KEY, selectedDeck);
    } catch {
      /* deck stays available in memory */
    }
  }, [selectedDeck]);
  useEffect(() => {
    window.render_game_to_text = () =>
      JSON.stringify(
        game && page === "table"
          ? publicState(game)
          : {
              mode: page,
              playMode,
              scenario: quest.id,
              savedGame: !!game,
              cardCount: catalogCardCount(),
              automatedPlay: {
                heroes: HERO_CARDS.length,
                heroCodes: HERO_CARDS.map((c) => c.code),
                deckCards: DECK_CARDS.length,
                deckCardCodes: DECK_CARDS.map((c) => c.code),
                decks: BUILT_IN_DECKS.map((d) => ({
                  id: d.id,
                  heroes: d.heroes,
                })),
                quests: SCENARIOS.map((q) => q.id),
              },
              fellowship: choices,
            },
      );
    window.advanceTime = () => Promise.resolve();
  }, [game, page, playMode, quest.id, choices]);
  const dispatch = (action: Action) => {
    if (!game) return;
    try {
      const next = applyAction(game, action);
      const milestone = detectSignificantMoment(game, next);
      if (milestone) {
        setSignificantMoment({ ...milestone, serial: ++momentSerial.current });
        audio.announce(game, next, milestone);
      }
      setHistory((h) => [...h.slice(-19), game]);
      setGame(next);
      // Events that were recorded without a pause still get a brief mention.
      const firstNew = game.flow?.nextId ?? Infinity;
      const recorded =
        next.flow?.history.filter(
          (h) => h.id >= firstNew && h.id !== next.flow?.pending?.id,
        ) ?? [];
      if (recorded.length)
        notify(
          recorded.length === 1
            ? recorded[0].title
            : `${recorded.at(-1)!.title} · ${recorded.length} events recorded`,
        );
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : "That action is unavailable.");
      return false;
    }
  };
  const start = (style: "classic" | "hotseat" = setupMode) => {
    audio.stop();
    setSignificantMoment(null);
    try {
      const selected =
        style === "hotseat" ? seats.map((p) => p.deckId) : [selectedDeck];
      for (const id of selected) {
        const description = describeDeck(id, decks);
        if (!description)
          throw new Error("Choose an available deck before beginning.");
        if (description.custom) {
          const problems = deckProblems(description);
          if (problems.length)
            throw new Error(
              `${description.name}: ${problems[0]} Open the deck builder to finish it.`,
            );
        }
      }
      const startingDeck =
        style === "hotseat" ? describeDeck(seats[0].deckId, decks)! : starter;
      const batch4WindReserves: Record<number, number> = {},
        rangerReserves: Record<number, number> = {},
        eredEagleReserves: Record<number, number> = {},
        wrathBombadilReserves: Record<number, number> = {};
      for (const entry of encounterReserveDecks(style)) {
        const { w, e, r, b } = selectedReserveAllocation(entry);
        batch4WindReserves[entry.player] = w;
        eredEagleReserves[entry.player] = e;
        rangerReserves[entry.player] = r;
        wrathBombadilReserves[entry.player] = b;
      }
      const burglarLoot = Object.fromEntries(
        selected.flatMap((id, player) => {
          const description = describeDeck(id, decks);
          return description?.loot?.length
            ? [[player, [...description.loot]]]
            : [];
        }),
      );
      const s = createGame(
        Date.now(),
        startingDeck.cards,
        startingDeck.heroes,
        startingDeck.custom ? "custom" : startingDeck.id,
        {
          guided: true,
          reviewMode,
          batch4WindReserves,
          rangerReserves,
          eredEagleReserves,
          wrathBombadilReserves,
          burglarLoot,
          hobbitTreasures: selectedTreasures(style),
          easy: easyMode === "on",
          scenarioId:
            playMode === "campaign" ? campaignStart : selectedScenario,
          playMode,
          ...(playMode === "campaign" &&
          campaignKind === "dreamchaser" &&
          dcMode
            ? { dreamchaserMode: dcMode }
            : {}),
          ...(style === "hotseat" ? { seats: seats.map(seatConfig) } : {}),
          // The Caves of Nibin-Dûm's legacy for the next campaign.
          ...(playMode === "campaign" && mirkwoodLegacy(game?.campaign).ranger
            ? {
                rangerLegacy: rangerSeats
                  .slice(0, style === "hotseat" ? seats.length : 1)
                  .flatMap((on, seat) => (on ? [seat] : [])),
              }
            : {}),
          ...(playMode === "campaign" &&
          campaignKind === "mirkwood" &&
          mirkwoodLegacy(game?.campaign).mendor
            ? {
                campaign: newCampaign(
                  style === "hotseat"
                    ? seats.flatMap((p) => p.heroes)
                    : starter.heroes,
                  true,
                ),
              }
            : {}),
        },
      );
      setSetupMode(style);
      setGame(s);
      setPage("table");
      window.scrollTo({ top: 0, behavior: "instant" });
      setRestart(false);
      setHistory([]);
      setCombatEnemy(null);
      setInterlude(false);
    } catch (e) {
      notify((e as Error).message);
      setPage("fellowship");
    }
  };
  const choosePublishedDeck = (recipe: PublishedPlayRecipe) => {
    const problems = deckProblems(recipe);
    if (problems.length) {
      notify(problems[0]);
      return;
    }
    const builtIn = BUILT_IN_DECKS.find((d) => sameDeckRecipe(d, recipe));
    if (builtIn) {
      setSelectedDeck(builtIn.id);
      setSetupMode("classic");
      nav("adventures");
      return;
    }
    let chosen = decks.find(
      (d) => d.source === recipe.source && sameDeckRecipe(d, recipe),
    );
    if (!chosen) {
      if (decks.length >= 50) {
        notify(
          "Your deck shelf holds 50 decks. Delete a deck before saving this recipe.",
        );
        return;
      }
      chosen = { ...recipe, id: createDeckId(), updatedAt: Date.now() };
      if (!setDecks([chosen, ...decks]))
        notify(
          "Browser storage is full. This deck stays available until you reload.",
        );
    }
    setSelectedDeck(customId(chosen));
    setSetupMode("classic");
    nav("adventures");
  };
  const prepareNextChapter = () => {
    if (!game?.campaign) return;
    const c = game.campaign;
    // A fallen hero, or a title the next chapter forbids (no Aragorn in The
    // Land of Shadow), leaves its slot to be filled.
    const forbidden = forbiddenTitleOf(c, nextChapterOf(c));
    const usable = (code: string) =>
      !c.fallen.includes(code) &&
      !(
        c.kind === "saga" &&
        // The Saga places its own Frodo Baggins as the Ring-bearer.
        [...fallenNames(c), "Frodo Baggins"].includes(card(code).name)
      ) &&
      card(code).name !== forbidden;
    const picked = c.heroes.map((h) => (usable(h) ? h : ""));
    for (let i = 0; i < picked.length; i++) {
      if (!picked[i])
        picked[i] =
          HERO_CARDS.find(
            (h) =>
              !picked.includes(h.code) &&
              usable(h.code) &&
              !picked.some((x) => x && card(x).name === h.name),
          )?.code ?? "";
    }
    for (const h of HERO_CARDS)
      if (
        picked.length < campaignSeatCounts(game).reduce((n, x) => n + x, 0) &&
        !picked.includes(h.code) &&
        !c.fallen.includes(h.code)
      )
        picked.push(h.code);
    setNextHeroes(picked);
    setNextChapter(nextChapterOf(c));
    setNextDeckBoons(
      Object.fromEntries([
        ...SAGA_DECK_BOONS.filter((code) => c.boons.includes(code)).map(
          (code) => [code, c.deckBoons?.[code] ?? null] as const,
        ),
        // The Angmar Awakened campaign: Iârion's Pendant.
        ...(c.kind === "angmar"
          ? ANGMAR_DECK_BOONS.filter((code) => c.boons.includes(code)).map(
              (code) => [code, c.deckBoons?.[code] ?? null] as const,
            )
          : []),
        // The Dream-chaser campaign: the earned player-card boons.
        ...(c.kind === "dreamchaser"
          ? c.boons
              .filter((code) =>
                ["event", "attachment", "ally"].includes(card(code).type_code),
              )
              .filter(
                (code) => !Object.values(c.permanent).flat().includes(code),
              )
              .map((code) => [code, c.deckBoons?.[code] ?? null] as const)
          : []),
        // The Ered Mithrin campaign: a boon ally in the Campaign Pool and
        // each discovered treasure may join one player's deck.
        ...(c.kind === "ered"
          ? [
              ...ERED_DECK_BOONS.filter((code) => c.boons.includes(code)),
              ...(c.treasures ?? []),
            ].map((code) => [code, c.deckBoons?.[code] ?? null] as const)
          : []),
        // Brace of Coneys: one entry per earned copy ("code#copy").
        ...COPY_BOONS.filter((code) => c.boons.includes(code)).flatMap((code) =>
          (c.boonCopies?.[code] ?? []).map(
            (seat, i) => [`${code}#${i}`, seat] as const,
          ),
        ),
      ]),
    );
    setNextDeck(game.deckId);
    setNextSeatDecks(game.table?.seats.map((p) => p.deckId) ?? []);
    setIncludeSupport(true);
    setNextMarks({ ...(c.marks ?? {}) });
    setDcMode("");
    setInterlude(true);
  };
  const advanceCampaign = () => {
    if (!game) return;
    try {
      const next = continueCampaign(
        game,
        nextHeroes,
        nextDeck,
        includeSupport,
        Date.now(),
        game.table && campaignSeatCounts(game).some((n) => n > 1)
          ? nextSeatDecks
          : undefined,
        game.campaign?.kind === "saga" ? nextChapter : undefined,
        game.campaign?.kind === "saga" ||
          game.campaign?.kind === "angmar" ||
          game.campaign?.kind === "dreamchaser" ||
          game.campaign?.kind === "ered"
          ? nextDeckBoons
          : undefined,
        game.campaign?.kind === "dreamchaser"
          ? { marks: nextMarks, mode: dcMode || null }
          : undefined,
      );
      audio.stop();
      setSignificantMoment(null);
      setGame(next);
      setHistory([]);
      setInterlude(false);
      setCombatEnemy(null);
      setSelectedDeck(nextDeck);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const retry = () => {
    if (!game) return;
    try {
      audio.stop();
      setSignificantMoment(null);
      setGame(retryAdventure(game));
      setHistory([]);
      setCombatEnemy(null);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const nav = (p: Page) => {
    if (menu) restoreMenuFocus.current = p === page;
    setPage(p);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const beginPlay = (u: Unit) => {
    if (!game) return;
    setPlayDiscardIndex(null);
    setPlayDeck(false);
    const reason = playReason(game, u);
    if (reason) {
      notify(reason);
      return;
    }
    setTarget("");
    setXCost(1);
    const c = handPlayDefinition(game, u);
    const costing = c.cost === "X" ? { ...c, cost: 1 } : c;
    const legalTargets = needsTarget(u) ? playTargets(game, u) : [];
    const cost = legalTargets.length
      ? Math.min(...legalTargets.map((host) => playCost(game, costing, host)))
      : playCost(game, costing);
    setPayment(planCardPayment(game, costing, cost));
    setPlayCard(u);
  };
  const beginDeckPlay = () => {
    if (!game) return;
    const code = gandalfFaceupCard(game);
    const reason = code
      ? gandalfDeckPlayReason(game)
      : "Your deck has no faceup top card.";
    if (!code || reason) {
      notify(reason ?? "");
      return;
    }
    const u = deckTopPreview(game, code);
    setPlayDiscardIndex(null);
    setPlayDeck(true);
    setTarget("");
    setXCost(1);
    const c = handPlayDefinition(game, u);
    const costing = c.cost === "X" ? { ...c, cost: 1 } : c;
    const legalTargets = needsTarget(u) ? playTargets(game, u) : [];
    const cost = legalTargets.length
      ? Math.min(...legalTargets.map((host) => playCost(game, costing, host)))
      : playCost(game, costing);
    setPayment(planCardPayment(game, costing, cost));
    setPlayCard(u);
  };
  const discardPreview = (s: GameState, index: number): Unit => ({
    id: `discard-play:${index}`,
    code: s.discard[index],
    owner: activeSeat(s),
    exhausted: false,
    damage: 0,
    progress: 0,
    resources: 0,
    committed: false,
    attachments: [],
    boost: 0,
    attacked: false,
    shadows: [],
  });
  const beginDiscardPlay = (index: number) => {
    if (!game) return;
    const u = discardPreview(game, index);
    const reason = replayEventProblem(game, u);
    if (reason) {
      notify(reason);
      return;
    }
    setTarget("");
    setXCost(1);
    setPlayDeck(false);
    setPlayDiscardIndex(index);
    setPayment(eventReplayPayments(game, u)[0] ?? {});
    setShowPiles(false);
    setPlayCard(u);
  };
  const exportSave = () => {
    if (!game) return;
    const a = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(game, null, 2)], { type: "application/json" }),
    );
    a.href = url;
    a.download =
      game.playMode === "campaign"
        ? game.campaign?.kind === "saga"
          ? "lord-of-the-rings-campaign.json"
          : "mirkwood-paths-campaign.json"
        : `${game.scenarioId}-adventure.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify("Adventure exported.");
  };
  const exportRecovery = () => {
    const backup = collectRecoveryBundle();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
    );
    const download = document.createElement("a");
    download.href = url;
    download.download = `there-and-back-again-recovery-${backup.exportedAt}.json`;
    download.click();
    URL.revokeObjectURL(url);
    notify(
      backup.unreadableKeys.length
        ? "Recovery backup exported. Some browser entries could not be read."
        : "Recovery backup exported, including both game modes and the deck shelf.",
    );
  };
  const restoreImportedAdventure = (
    candidate: RecoveryCandidate,
    imported: RecoveryImport,
  ) => {
    const s = startGuided(candidate.game);
    const recovered = recoverSavedDecks(s, decks);
    let otherSaveFailed = false;
    for (const other of imported.candidates) {
      if (other.key === candidate.key) continue;
      try {
        localStorage.setItem(other.key, JSON.stringify(other.game));
      } catch {
        otherSaveFailed = true;
      }
    }
    const shelfSaved = setDecks(recovered);
    setRecoveryImport(null);
    audio.stop();
    setSignificantMoment(null);
    setGame(s);
    setPlayMode(s.playMode);
    setSetupMode(s.table ? "hotseat" : "classic");
    if (s.table) setSeats(savedSeats(s, recovered));
    setSelectedScenario(s.scenarioId);
    setSelectedDeck(savedDeckId(s, recovered));
    setEasyMode(s.easyMode ? "on" : "off");
    setHistory([]);
    setPage("table");
    const shelfIssue = deckStorageProblem(recovered);
    notify(
      otherSaveFailed
        ? "Adventure opened. The other game mode could not be saved on this device; keep the recovery backup."
        : !shelfSaved && shelfIssue === "capacity"
          ? "Adventure restored. Your full deck shelf is unchanged; the recovered list stays available through this adventure save."
          : !shelfSaved
            ? "Adventure restored. The deck shelf could not be saved; its original data has been kept. Export a recovery backup."
            : imported.issues.length
              ? "Adventure restored. Some entries could not be restored; their original data remains in your backup."
              : imported.candidates.length > 1
                ? "Both adventures restored."
                : "Adventure restored.",
    );
  };
  const importSave = async (file: File) => {
    try {
      const imported = parseRecoveryImport(JSON.parse(await file.text()));
      if (!imported.candidates.length)
        throw new Error(
          "This backup has no valid adventure saves. Its original data remains in the backup.",
        );
      if (imported.candidates.length > 1) setRecoveryImport(imported);
      else restoreImportedAdventure(imported.candidates[0], imported);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const undo = () => {
    const prev = history.at(-1);
    if (prev) {
      audio.stop();
      setSignificantMoment(null);
      setGame(prev);
      setHistory((h) => h.slice(0, -1));
      setCombatEnemy(null);
      notify("Last action undone.");
    }
  };
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && menu) {
        setMenu(false);
        return;
      }
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.repeat ||
        menu ||
        document.querySelector("dialog[open]") ||
        (e.target instanceof Element &&
          e.target.closest('input,select,textarea,[contenteditable="true"]'))
      )
        return;
      if (e.key === "?") {
        e.preventDefault();
        setShowSettings(true);
        return;
      }
      if (
        page !== "table" ||
        !game ||
        (game.status !== "playing" && !game.flow?.pending) ||
        game.choice
      )
        return;
      if (
        game.table &&
        /^[1-4]$/.test(e.key) &&
        Number(e.key) <= game.table.seats.length
      ) {
        e.preventDefault();
        dispatch({ type: "SELECT_SEAT", seat: Number(e.key) - 1 });
      }
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        document
          .querySelector<HTMLButtonElement>(
            ".turn-panel .turn-actions .primary",
          )
          ?.click();
      }
      if (e.key.toLowerCase() === "u") {
        e.preventDefault();
        undo();
      }
      if (e.key.toLowerCase() === "h") {
        e.preventDefault();
        document
          .querySelector<HTMLElement>("#your-hand")
          ?.focus({ preventScroll: window.innerWidth >= 1100 });
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  });
  useEffect(() => {
    if (!menu) return;
    const previous = document.activeElement as HTMLElement | null;
    restoreMenuFocus.current = true;
    const panel = document.querySelector<HTMLElement>("#navigation-panel")!;
    const focusable = () => [
      ...panel.querySelectorAll<HTMLElement>("button:not(:disabled),a[href]"),
    ];
    focusable()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusable(),
        first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      if (restoreMenuFocus.current) previous?.focus();
    };
  }, [menu]);
  useEffect(() => {
    const mobile = matchMedia("(max-width: 899px)");
    const closeDesktopMenu = () => {
      if (!mobile.matches) setMenu(false);
    };
    mobile.addEventListener("change", closeDesktopMenu);
    return () => mobile.removeEventListener("change", closeDesktopMenu);
  }, []);
  const ordinaryStaging =
    game?.staging.filter(
      (u) =>
        !u.stormcallerArea &&
        !game.temple?.map.some((cell) => cell.id === u.id),
    ) ?? [];
  const renderStagingCard = (u: Unit) => {
    if (!game) return null;
    return (
      <BoardCard
        key={u.id}
        s={game}
        u={u}
        dispatch={dispatch}
        inspect={() => setDetail(card(u.code))}
        inspectCard={setDetail}
        action={
          game.phase === "defense" && pendingEnemyAttack(game, u)
            ? () => setCombatEnemy(u.id)
            : claimableObjectives.includes(u.code) &&
                game.phase !== "setup" &&
                objectiveFree(game, u)
              ? () => setClaimId(u.id)
              : game.phase === "travel" && card(u.code).type_code === "location"
                ? () => dispatch({ type: "TRAVEL", id: u.id })
                : game.phase === "encounter" &&
                    isEnemy(u) &&
                    (!game.optionalEngagement || realmExtraEngagement(game))
                  ? () => dispatch({ type: "ENGAGE", id: u.id })
                  : game.phase === "attack" &&
                      isEnemy(u) &&
                      (game.table || game.earlyAttackPlayers
                        ? !u.attackedBy?.includes(activeSeat(game))
                        : !u.attacked) &&
                      attackersFor(game, u).length > 0
                    ? () => {
                        setCombatEnemy(u.id);
                      }
                    : undefined
        }
        actionLabel={
          game.phase === "defense" && consideredEngaged(game, u)
            ? "Defend"
            : claimableObjectives.includes(u.code)
              ? objectiveFree(game, u)
                ? objectiveClaimExhausts(game, u.id)
                  ? "Claim · Exhaust hero"
                  : "Claim · +2 threat"
                : "Guarded"
              : card(u.code).type_code === "location"
                ? "Travel here"
                : game.phase === "attack"
                  ? consideredEngaged(game, u)
                    ? "Attack"
                    : "Attack staging enemy"
                  : "Engage"
        }
        actionDisabled={
          stormcallerAreaImmune(game, u)
            ? "This area is at a different quest stage; its enemies cannot be engaged and its locations cannot be traveled to."
            : game.phase === "attack" && amonPlayerCannotDeclareAttack(game)
              ? "Hobbit-sense prevents this fellowship from declaring attacks this round."
              : game.phase === "encounter" && isEnemy(u)
                ? optionalEngagementProblem(game, u)
                : exhaustedClaimObjectives.includes(u.code) &&
                    !game.heroes.some(
                      (h) =>
                        !h.exhausted &&
                        !khazadCannotExhaust(h) &&
                        !watcherWaterCannotExhaust(h),
                    )
                  ? "A ready hero must be able to exhaust to claim this objective."
                  : game.phase === "travel" &&
                      card(u.code).type_code === "location"
                    ? canTravel(game, u)
                    : null
        }
      />
    );
  };
  const inspectedHand =
    game && page === "table" && detail
      ? game.hand.find((u) => u.code === detail.code)
      : null;
  return (
    <div
      className={`app redbook density-${density} ${page === "table" ? "playing" : ""}`}
      data-playmat={activePlaymat}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {menu && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <CardHoverPreview enabled={hoverCards === "on" && !menu} />
      <aside
        id="navigation-panel"
        role={menu ? "dialog" : undefined}
        aria-modal={menu ? true : undefined}
        aria-label={menu ? "Main navigation" : undefined}
        className={`sidebar ${menu ? "is-open" : ""}`}
      >
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            nav("adventures");
          }}
        >
          <div className="brand-mark">
            <Tree weight="duotone" size={38} />
            <span className="brand-stars">· ✦ ·</span>
          </div>
          <span>
            THE LORD
            <br />
            OF THE RINGS<small>THERE & BACK AGAIN · THE CARD GAME</small>
          </span>
        </a>
        <div className="sidebar-divider">
          <Diamond weight="fill" size={7} />
        </div>
        <div className="nav-label">YOUR JOURNEY</div>
        <nav>
          {(
            [
              { id: "adventures", label: "Adventures", icon: Compass },
              { id: "fellowship", label: "My fellowship", icon: UsersThree },
              { id: "decks", label: "Deck builder", icon: Stack },
              { id: "library", label: "Card library", icon: Books },
              { id: "guide", label: "How to play", icon: BookOpen },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              aria-label={item.label}
              aria-current={page === item.id ? "page" : undefined}
              title={item.label}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => nav(item.id)}
            >
              <item.icon
                size={20}
                weight={page === item.id ? "duotone" : "regular"}
              />
              <span>{item.label}</span>
              {page === item.id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        {game && (
          <button
            className={`resume-side ${page === "table" ? "active" : ""}`}
            aria-label="Return to adventure"
            aria-current={page === "table" ? "page" : undefined}
            title="Return to adventure"
            onClick={() => nav("table")}
          >
            <Campfire size={21} />
            <span>
              {game.status === "playing"
                ? "Return to adventure"
                : "View last adventure"}
              <small>
                Round {game.round || 1} · {scenario(game.scenarioId).shortName}
              </small>
            </span>
            <CaretRight size={14} />
          </button>
        )}
        <div className="sidebar-bottom">
          <Tree size={52} weight="thin" />
          <p>
            “Not all those who
            <br />
            wander are lost.”
          </p>
          <div className="build-info">
            <span className="green-dot" /> THE RED BOOK · CORE SET
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMenu(!menu)}
              aria-label={menu ? "Close navigation" : "Open navigation"}
              aria-expanded={menu}
              aria-controls="navigation-panel"
            >
              <List size={22} />
            </button>
            <span>Middle-earth</span>
            <CaretRight size={12} />
            <strong>
              {page === "table"
                ? scenario(game!.scenarioId).name
                : page === "adventures"
                  ? "Adventures"
                  : page === "library"
                    ? "Card library"
                    : page === "fellowship"
                      ? "My fellowship"
                      : page === "decks"
                        ? "Deck builder"
                        : "How to play"}
            </strong>
          </div>
          <div className="top-tools">
            <button
              className="account-nav"
              onClick={() => setShowAccount(true)}
              aria-label={account.user ? "My account" : "Sign in or register"}
            >
              <UserCircle size={21} />
              <span>{account.user ? "My account" : "Sign in"}</span>
            </button>
            {page === "table" && (
              <button
                className="icon-button"
                aria-label="Jump to your hand"
                title="Your hand · H"
                onClick={() =>
                  document
                    .querySelector("#your-hand")
                    ?.scrollIntoView({ block: "center", behavior: "instant" })
                }
              >
                <Books size={20} />
              </button>
            )}
            <button
              className="icon-button"
              aria-label="Table preferences"
              title="Table preferences & shortcuts"
              onClick={() => setShowSettings(true)}
            >
              <SlidersHorizontal size={20} />
            </button>
            <span className="solo-label">
              <UsersThree size={15} />{" "}
              {game?.table && page === "table"
                ? `${count(game.table.seats.length, "player")} · Solo hot-seat`
                : "A solo journey"}
            </span>
            <button
              className="icon-button"
              title={sound ? "Mute sounds" : "Enable sounds"}
              aria-label={sound ? "Mute sounds" : "Enable sounds"}
              onClick={() => {
                audio.setMuted(sound);
                notify(
                  sound
                    ? "Voice announcements muted."
                    : "Voice announcements on.",
                );
              }}
            >
              {sound ? <SpeakerHigh size={19} /> : <SpeakerSlash size={19} />}
            </button>
            <button
              className="icon-button"
              aria-label="How to play"
              onClick={() => nav("guide")}
            >
              <BookOpen size={19} />
            </button>
          </div>
        </header>
        {page === "adventures" && (
          <main id="main-content" tabIndex={-1} className="lobby">
            <LandingHero
              savedJourney={
                resumable && game?.status === "playing"
                  ? `Saved journey · Round ${game.round} · ${phaseTitle(game) ?? game.phase}`
                  : undefined
              }
              onResume={() => nav("table")}
              onLearn={() => nav("guide")}
            />
            <nav className="journey-steps" aria-label="Prepare your adventure">
              <a href="#fellowship-setup">
                <span>01</span>
                <div>
                  <small>GATHER YOUR COMPANY</small>
                  <strong>Your fellowship</strong>
                </div>
                <ArrowRight size={18} />
              </a>
              <a href="#quest-selection">
                <span>02</span>
                <div>
                  <small>FIND YOUR NEXT CHAPTER</small>
                  <strong>Choose an adventure</strong>
                </div>
                <ArrowRight size={18} />
              </a>
              <a href="#adventure-preview">
                <span>03</span>
                <div>
                  <small>THE ROAD AWAITS</small>
                  <strong>Review & begin</strong>
                </div>
                <ArrowRight size={18} />
              </a>
            </nav>
            <FellowshipSetup
              mode={setupMode}
              changeMode={setSetupMode}
              seats={seats}
              setSeats={setSeats}
              selectedDeck={selectedDeck}
              selectDeck={setSelectedDeck}
              inspect={setPreviewDeck}
              decks={decks}
              onBuild={() => nav("decks")}
            />
            {encounterReserveControls(setupMode)}
            {treasureControls(setupMode)}
            <AccountStrip account={account} open={() => setShowAccount(true)} />
            <section
              id="quest-selection"
              tabIndex={-1}
              className="mode-selection"
              aria-label="Choose game mode"
            >
              <div className="mode-heading">
                <span className="book-kicker">II · CHOOSE YOUR QUEST</span>
                <h2>Where will the road lead?</h2>
                <p>
                  {playMode === "normal"
                    ? `Choose from ${SCENARIOS.length} automated quests. Each adventure begins with a fresh fellowship.`
                    : `${CAMPAIGN_TITLES[campaignKind]} • Follow the quests in order. Boons, burdens, fallen heroes, and your story carry forward.`}
                </p>
              </div>
              <div className="mode-tabs" role="group" aria-label="Game mode">
                <button
                  aria-pressed={playMode === "normal"}
                  onClick={() => switchMode("normal")}
                >
                  <Compass size={19} />
                  <span>
                    Normal game<small>A standalone adventure</small>
                  </span>
                </button>
                <button
                  aria-pressed={playMode === "campaign"}
                  onClick={() => switchMode("campaign")}
                >
                  <Books size={19} />
                  <span>
                    Campaign mode
                    <small>One fellowship. Four campaigns.</small>
                  </span>
                </button>
              </div>
              {playMode === "campaign" && (
                <div
                  className="mode-tabs campaign-kind"
                  role="group"
                  aria-label="Campaign"
                >
                  <button
                    aria-pressed={campaignKind === "mirkwood"}
                    onClick={() => setCampaignKind("mirkwood")}
                  >
                    <span>
                      Mirkwood Paths
                      <small>
                        {CAMPAIGN_CHAPTERS.length} Core Set chapters · The Dark
                        of Mirkwood
                      </small>
                    </span>
                  </button>
                  <button
                    aria-pressed={campaignKind === "saga"}
                    onClick={() => setCampaignKind("saga")}
                  >
                    <span>
                      The Lord of the Rings
                      <small>
                        {
                          SAGA_CAMPAIGN_SUPPORTED.filter((id) =>
                            SAGA_CAMPAIGN_ORDER.includes(id),
                          ).length
                        }{" "}
                        of {SAGA_CAMPAIGN_ORDER.length} saga chapters ·{" "}
                        {
                          SAGA_CAMPAIGN_SUPPORTED.filter((id) =>
                            SAGA_INSERTS.includes(id),
                          ).length
                        }{" "}
                        optional
                      </small>
                    </span>
                  </button>
                  <button
                    aria-pressed={campaignKind === "angmar"}
                    onClick={() => setCampaignKind("angmar")}
                  >
                    <span>
                      Angmar Awakened
                      <small>
                        {ANGMAR_CAMPAIGN_SUPPORTED.length} of{" "}
                        {ANGMAR_CAMPAIGN_ORDER.length} chapters
                      </small>
                    </span>
                  </button>
                  <button
                    aria-pressed={campaignKind === "dreamchaser"}
                    onClick={() => setCampaignKind("dreamchaser")}
                  >
                    <span>
                      Dream-chaser
                      <small>
                        {DREAMCHASER_CAMPAIGN_SUPPORTED.length} of{" "}
                        {DREAMCHASER_CAMPAIGN_ORDER.length} chapters · XP
                      </small>
                    </span>
                  </button>
                  <button
                    aria-pressed={campaignKind === "ered"}
                    onClick={() => setCampaignKind("ered")}
                  >
                    <span>
                      Ered Mithrin
                      <small>
                        {ERED_CAMPAIGN_SUPPORTED.length} of{" "}
                        {ERED_CAMPAIGN_ORDER.length} chapters · treasures
                      </small>
                    </span>
                  </button>
                </div>
              )}
              {playMode === "campaign" &&
                campaignKind === "dreamchaser" &&
                !(
                  game?.campaign &&
                  campaignKindOf(game.campaign) === "dreamchaser"
                ) && (
                  <label className="dreamchaser-mode">
                    <span>Hard/Expert Mode card</span>
                    <select
                      aria-label="Hard or Expert Mode"
                      value={dcMode}
                      onChange={(e) =>
                        setDcMode(e.target.value as "" | "hard" | "expert")
                      }
                    >
                      <option value="">Not used</option>
                      <option value="hard">Hard Mode · +1 XP</option>
                      <option value="expert">Expert Mode · +2 XP</option>
                    </select>
                  </label>
                )}
              {playMode === "campaign" && campaignKind === "mirkwood" && (
                <label className="dreamchaser-mode">
                  <span>A new campaign begins with</span>
                  <select
                    aria-label="Mirkwood Paths start"
                    value={mirkwoodStart}
                    onChange={(e) =>
                      setMirkwoodStart(
                        e.target.value as "mirkwood" | "the-oath",
                      )
                    }
                  >
                    <option value="mirkwood">
                      Passage Through Mirkwood · Parts 1–5
                    </option>
                    <option value="the-oath">
                      The Oath · The Dark of Mirkwood mini campaign
                    </option>
                  </select>
                </label>
              )}
              {playMode === "campaign" &&
                mirkwoodLegacy(game?.campaign).ranger && (
                  <fieldset
                    className="dreamchaser-mode ranger-legacy"
                    aria-label="Ranger Sense legacy"
                  >
                    <span>
                      Ranger Sense · The Caves of Nibin-Dûm: at the start of
                      your next campaign, each player may shuffle 1 copy into
                      their deck
                    </span>
                    {rangerSeats
                      .slice(0, setupMode === "hotseat" ? seats.length : 1)
                      .map((on, seat) => (
                        <label key={seat}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) =>
                              setRangerSeats((list) =>
                                list.map((x, i) =>
                                  i === seat ? e.target.checked : x,
                                ),
                              )
                            }
                          />
                          {setupMode === "hotseat"
                            ? `Player ${seat + 1}`
                            : "Shuffle Ranger Sense into your deck"}
                        </label>
                      ))}
                  </fieldset>
                )}
            </section>
            <QuestIndex
              selected={quest.id}
              locked={playMode === "campaign"}
              completed={
                game?.campaign?.completed.map((c) => c.scenarioId) ?? []
              }
              onSelect={setSelectedScenario}
            />
            <section
              id="adventure-preview"
              tabIndex={-1}
              aria-labelledby="adventure-preview-title"
              className={`adventure-hero adventure-${quest.id}`}
            >
              <div className="forest-bg" />
              <Ambient />
              <div className="hero-copy">
                <div className="eyebrow">
                  <span />{" "}
                  {playMode === "campaign"
                    ? campaignKind === "saga"
                      ? `THE LORD OF THE RINGS · CHAPTER ${sagaChapterNumber(quest.id)}`
                      : campaignKind === "angmar"
                        ? `ANGMAR AWAKENED · CHAPTER ${ANGMAR_CAMPAIGN_ORDER.indexOf(quest.id) + 1}`
                        : campaignKind === "dreamchaser"
                          ? `DREAM-CHASER · PART ${DREAMCHASER_CAMPAIGN_ORDER.indexOf(quest.id) + 1}`
                          : campaignKind === "ered"
                            ? `ERED MITHRIN · PART ${ERED_CAMPAIGN_ORDER.indexOf(quest.id) + 1}`
                            : mirkwoodStart === "the-oath" &&
                                !(
                                  game?.campaign &&
                                  campaignKindOf(game.campaign) === "mirkwood"
                                )
                              ? `THE DARK OF MIRKWOOD · PART ${mirkwoodPart({ mini: true }, quest.id)}`
                              : `MIRKWOOD PATHS · PART ${mirkwoodPart(game?.campaign && campaignKindOf(game.campaign) === "mirkwood" ? game.campaign : {}, quest.id)}`
                    : quest.tagline.toUpperCase()}
                </div>
                <div className="adventure-preview-meta">
                  <span>{scenarioRelease(quest.id)}</span>
                  <span>
                    Difficulty <strong>{quest.difficulty}</strong> / 10
                  </span>
                </div>
                <h2 id="adventure-preview-title">
                  <QuestHeadline id={quest.id} />
                </h2>
                <p>{quest.description}</p>
                {resumable && game?.status === "playing" && (
                  <div className="resume-context">
                    <span className="green-dot" /> Saved journey · Round{" "}
                    {game.round || 1} · {phaseTitle(game)}
                  </div>
                )}
                {setupMode === "classic" && (
                  <div className="selected-fellowship-summary">
                    <span>YOUR FELLOWSHIP</span>
                    <strong>
                      {playMode === "campaign" && game?.campaign
                        ? (BUILT_IN_DECKS.find((d) => d.id === game.deckId)
                            ?.name ?? "Campaign fellowship")
                        : starter.name}
                    </strong>
                    <small>
                      {displayHeroes
                        .slice(0, 3)
                        .map((code) => card(code).name)
                        .join(" · ")}
                    </small>
                    <button
                      onClick={() => {
                        const el = document.getElementById("fellowship-setup");
                        el?.scrollIntoView({
                          behavior: reducedMotion ? "instant" : "smooth",
                          block: "start",
                        });
                        el?.focus({ preventScroll: true });
                      }}
                    >
                      Change fellowship <ArrowRight size={14} />
                    </button>
                  </div>
                )}
                {setupMode === "hotseat" && (
                  <div className="selected-company">
                    <UsersThree size={19} />
                    <span>
                      {seats
                        .map(
                          (p, i) =>
                            `Player ${i + 1}: ${describeDeck(p.deckId, decks)?.name ?? "Choose a deck"}`,
                        )
                        .join(" · ")}
                      <small>
                        {seats.length}{" "}
                        {seats.length === 1 ? "player" : "players"} ·{" "}
                        {seats.reduce((n, p) => n + p.heroes.length, 0)} heroes
                        · {seats.length} separate{" "}
                        {seats.length === 1 ? "deck" : "decks"} · You control
                        the whole company
                      </small>
                    </span>
                  </div>
                )}
                {playMode === "campaign" && game?.campaign && (
                  <small className="campaign-deck-note">
                    Change your deck between chapters or start a new campaign.
                  </small>
                )}
                {!(resumable && game?.status === "playing") && (
                  <label className="preference-check easy-toggle">
                    <div>
                      <strong>Easy mode</strong>
                      <small>
                        The official easy mode: each hero begins with 1 extra
                        resource, and the encounter cards marked for easy mode
                        stay out of the deck.
                      </small>
                    </div>
                    <input
                      type="checkbox"
                      checked={easyMode === "on"}
                      onChange={(e) =>
                        setEasyMode(e.target.checked ? "on" : "off")
                      }
                    />
                  </label>
                )}
                <button
                  className="primary hero-cta"
                  id="start-btn"
                  disabled={
                    !!selectedScenarioProblem &&
                    !(resumable && game?.status === "playing")
                  }
                  onClick={() =>
                    resumable &&
                    (game?.status === "playing" || playMode === "campaign")
                      ? nav("table")
                      : game
                        ? setRestart(true)
                        : start()
                  }
                >
                  {resumable &&
                  (game?.status === "playing" || playMode === "campaign")
                    ? game?.status === "playing"
                      ? "Continue adventure"
                      : "View campaign results"
                    : playMode === "campaign"
                      ? "Begin campaign"
                      : "Begin adventure"}
                  <ArrowRight size={20} />
                </button>
                {selectedScenarioProblem &&
                  !(resumable && game?.status === "playing") && (
                    <p className="builder-note" role="status">
                      {selectedScenarioProblem}
                    </p>
                  )}
                {game && (
                  <button
                    className="new-adventure"
                    onClick={() => setRestart(true)}
                  >
                    Start a new{" "}
                    {playMode === "campaign" ? "campaign" : "adventure"}{" "}
                    <ArrowCounterClockwise size={13} />
                  </button>
                )}
              </div>
              <div
                className="hero-fan"
                aria-label="First fellowship starting heroes"
              >
                {[displayHeroes[1], displayHeroes[0], displayHeroes[2]]
                  .filter(Boolean)
                  .map((code, i) => (
                    <motion.button
                      initial={reducedMotion ? false : { opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.12, duration: 0.6 }}
                      key={code}
                      className={`fan-card fan-${i}`}
                      onClick={() => setDetail(card(code))}
                      title={`Inspect ${card(code).name}`}
                    >
                      <Art c={card(code)} />
                    </motion.button>
                  ))}
                <div className="fan-caption">
                  <span />{" "}
                  {setupMode === "hotseat"
                    ? `${seats.reduce((n, p) => n + p.heroes.length, 0)} HEROES. ${seats.length} FELLOWSHIP${seats.length === 1 ? "" : "S"}.`
                    : `${starter.heroes.length} HEROES. ONE FELLOWSHIP.`}
                  <span />
                </div>
              </div>
              <div className="hero-bottom">
                <span>
                  <Compass size={17} /> {quest.name}
                </span>
                <span>
                  <UsersThree size={15} />{" "}
                  {setupMode === "hotseat"
                    ? `${seats.length} ${seats.length === 1 ? "player" : "players"} · Solo hot-seat`
                    : "1 player"}
                </span>
                <span>
                  <Diamond size={14} /> {scenarioRelease(quest.id)}
                </span>
                <span className="difficulty">
                  Difficulty {quest.difficulty} / 10
                </span>
              </div>
            </section>
            {playMode === "campaign" &&
              game?.campaign &&
              campaignKindOf(game.campaign) === campaignKind && (
                <details className="lobby-journal">
                  <summary>
                    <Books size={18} />
                    Campaign journal
                    <span>
                      {campaignProgress(game.campaign)} chapters recorded
                    </span>
                  </summary>
                  <CampaignJournal game={game} inspect={setDetail} />
                </details>
              )}
            <div className="lobby-lower">
              <section className="journey-panel">
                <div className="section-line">
                  <h3>The path ahead</h3>
                  <span>{scenarioStageCount(quest.id)} quest stages</span>
                </div>
                <div className="journey-stages">
                  {quest.stages
                    .map((stage, i) => ({
                      // A stage's alternative quest cards share its number.
                      index: "stage" in stage ? stage.stage - 1 : i,
                      title: stage.name,
                      text: stage.story,
                      icon: [Tree, Compass, Mountains][i % 3],
                    }))
                    .map((q) => ({
                      ...q,
                      n:
                        [
                          "I",
                          "II",
                          "III",
                          "IV",
                          "V",
                          "VI",
                          "VII",
                          "VIII",
                          "IX",
                          "X",
                        ][q.index] ?? String(q.index + 1),
                    }))
                    .map((q, i) => (
                      <div className="journey-stage" key={i}>
                        <div
                          className={`stage-emblem ${i === 0 ? "current" : ""}`}
                        >
                          <q.icon size={22} />
                        </div>
                        <div>
                          <span>STAGE {q.n}</span>
                          <h4>{q.title}</h4>
                          <p>{q.text}</p>
                        </div>
                        {i < quest.stages.length - 1 && (
                          <CaretRight className="stage-chevron" size={15} />
                        )}
                      </div>
                    ))}
                </div>
              </section>
              <section className="fellowship-mini">
                <div className="section-line">
                  <h3>Your fellowship</h3>
                  <button
                    className="text-link"
                    onClick={() => nav("fellowship")}
                  >
                    View deck <ArrowRight size={15} />
                  </button>
                </div>
                <div className="fellowship-summary">
                  <div className="avatar-stack">
                    {displayHeroes.slice(0, 3).map((code) => (
                      <div key={code}>
                        <Art c={card(code)} />
                      </div>
                    ))}
                  </div>
                  <div>
                    <strong>
                      {setupMode === "hotseat"
                        ? "Your travelling company"
                        : starter.name}
                    </strong>
                    <span>
                      {setupMode === "hotseat"
                        ? `${count(seats.length, "player")} · ${seats.reduce((n, p) => n + p.heroes.length, 0)} heroes · ${count(seats.length, "deck")}`
                        : `${starter.subtitle} · ${deckSize(deck)} cards · ${count(starter.heroes.length, "hero")}`}
                    </span>
                  </div>
                </div>
                <div className="fellowship-foot">
                  <span>
                    <Shield size={14} /> Fully scripted player cards
                  </span>
                  <span>
                    <Check size={14} /> Ready
                  </span>
                </div>
              </section>
            </div>
            <section
              className="official-resources"
              aria-label="About this fan project"
            >
              <div>
                <strong>An unofficial fan project</strong>
                <p>
                  Inspired by The Lord of the Rings: The Card Game. Not
                  affiliated with or endorsed by Fantasy Flight Games. Game
                  text, card artwork and trademarks belong to their respective
                  owners.
                </p>
              </div>
              <nav aria-label="Original game and official rules">
                <a
                  href="https://www.fantasyflightgames.com/en/products/the-lord-of-the-rings-the-card-game/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Original game <ArrowRight size={16} />
                </a>
                <a
                  href="https://images-cdn.fantasyflightgames.com/filer_public/e9/2f/e92f2465-8a1e-4bfa-8293-ad0edd5e55c0/mec101_learn_to_play_eng_v11-compressed.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Learn to Play (PDF) <ArrowRight size={16} />
                </a>
                <a
                  href="https://images-cdn.fantasyflightgames.com/filer_public/f2/87/f28704b2-5f25-4fd8-be7a-18d4a5d2c1c4/mec101_core_set_rules_reference_v10c-compressed.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Rules Reference (PDF) <ArrowRight size={16} />
                </a>
              </nav>
            </section>
            <footer className="lobby-footer">
              <span>
                <FloppyDisk size={13} /> Your journey is saved automatically on
                this device.
              </span>
              <button onClick={() => setShowRecords(true)}>
                Your record{" "}
                <span>
                  {records.length} {records.length === 1 ? "game" : "games"}{" "}
                  <ArrowRight size={13} />
                </span>
              </button>
              <button onClick={() => nav("guide")}>
                New to the game?{" "}
                <span>
                  Learn the way <ArrowRight size={13} />
                </span>
              </button>
            </footer>
          </main>
        )}
        {page === "library" && (
          <Suspense
            fallback={
              <main className="content-page library">
                <p className="library-loading">Opening the archives…</p>
              </main>
            }
          >
            <Library
              inspect={setDetail}
              notify={notify}
              initialProduct={libraryProduct}
              chooseAdventure={(id, mode) => {
                const chosenDeck = selectedDeck;
                const chosenSetup = setupMode;
                const chosenSeats = seats;
                switchMode(mode === "campaign" ? "campaign" : "normal");
                setSelectedDeck(chosenDeck);
                setSetupMode(chosenSetup);
                setSeats(chosenSeats);
                setSelectedScenario(id);
                setEasyMode(mode === "easy" ? "on" : "off");
                nav("adventures");
              }}
            />
          </Suspense>
        )}
        {page === "decks" && (
          <Suspense
            fallback={
              <main className="content-page deck-builder">
                <p className="library-loading">Opening the deck builder…</p>
              </main>
            }
          >
            <DeckBuilder
              decks={decks}
              setDecks={setDecks}
              inspect={setDetail}
              notify={notify}
              play={(id) => {
                setSelectedDeck(id);
                setSetupMode("classic");
                nav("adventures");
              }}
            />
          </Suspense>
        )}
        {page === "fellowship" && (
          <main id="main-content" tabIndex={-1} className="content-page">
            <div className="page-heading">
              <div>
                <h1>Choose your fellowship.</h1>
                <p>
                  Choose a supported fellowship, or explore every published hero
                  and the separately sold starter decks below.
                </p>
              </div>
              <button
                className="primary"
                onClick={() => {
                  setSetupMode("classic");
                  if (game) setRestart(true);
                  else start("classic");
                }}
              >
                Begin with {starter.subtitle} <ArrowRight />
              </button>
            </div>
            <SupportSummary />
            <DeckPicker
              value={selectedDeck}
              onChange={(id) => {
                setSelectedDeck(id);
                setSetupMode("classic");
              }}
              inspect={setPreviewDeck}
              custom={decks}
              onBuild={() => nav("decks")}
            />
            {encounterReserveControls("classic")}
            {treasureControls("classic")}
            <AccountStrip account={account} open={() => setShowAccount(true)} />
            <div className="hero-roster">
              {starter.heroes.map((code) => (
                <button key={code} onClick={() => setDetail(card(code))}>
                  <div className="roster-art">
                    <Art c={card(code)} />
                  </div>
                  <div>
                    <Sphere sphere={card(code).sphere_code} />
                    <h2>{card(code).name}</h2>
                    <p>{plain(card(code).text)}</p>
                    <span>{card(code).threat} printed threat</span>
                    <CardProductNote c={card(code)} />
                  </div>
                </button>
              ))}
            </div>
            <div className="deck-heading">
              <div>
                <h2>{starter.name}</h2>
                <p>
                  {starter.custom
                    ? "Your saved deck list."
                    : "Ready-to-play deck with registered cards."}{" "}
                  All cards below have scripted abilities.
                </p>
              </div>
              <strong>
                {deckSize(deck)}{" "}
                <span>
                  cards + {starter.heroes.length}{" "}
                  {starter.heroes.length === 1 ? "hero" : "heroes"}
                </span>
              </strong>
            </div>
            <DeckProductNote deck={starter} />
            <div className="deck-list">
              {Object.keys(deck).map((code) => (
                <div className="deck-row" key={code}>
                  <button
                    onClick={() => setDetail(card(code))}
                    className="deck-card-link"
                  >
                    <Art c={card(code)} />
                    <Sphere sphere={card(code).sphere_code} />
                    <span>
                      {card(code).name}
                      <small>
                        {card(code).type_code} · Cost {card(code).cost}
                      </small>
                    </span>
                  </button>
                  <span className="deck-quantity">× {deck[code]}</span>
                </div>
              ))}
            </div>
            <Suspense fallback={<p>Opening the published collection…</p>}>
              <PublishedContent
                inspect={setDetail}
                play={choosePublishedDeck}
                browse={(productId) => {
                  setLibraryProduct(productId);
                  nav("library");
                }}
              />
            </Suspense>
          </main>
        )}
        {page === "guide" && (
          <main id="main-content" tabIndex={-1} className="content-page guide">
            <div className="page-heading">
              <div>
                <h1>Every great journey starts here.</h1>
                <p>
                  Lead your fellowship through Middle-earth, one quest at a
                  time.
                </p>
              </div>
              <BookOpen size={45} weight="thin" />
            </div>
            <div className="guide-intro">
              <Tree size={40} />
              <div>
                <h2>Your first adventure</h2>
                <p>
                  Choose from {SCENARIOS.length} automated quests for a
                  standalone adventure, or follow the Mirkwood Paths campaign:
                  the {CAMPAIGN_CHAPTERS.length} Core Set chapters and The Dark
                  of Mirkwood's two. Choose an original 30-card starter with
                  three heroes, or build a deck of at least 50 cards with one to
                  three heroes. Solo hot-seat lets you command 1–4 players, each
                  with a separate deck, hand, and threat dial. Complete the
                  final quest together. A seat is eliminated at 50 threat or
                  when its last hero falls; surviving fellowships continue.
                </p>
                <button
                  className="primary"
                  onClick={() => (game ? nav("table") : start())}
                >
                  {game ? "Return to adventure" : "Begin adventure"}
                  <ArrowRight />
                </button>
              </div>
            </div>
            <section className="guide-note">
              <h2>You set the pace</h2>
              <p>
                Choose your reading pace in Table preferences. Hidden
                information & losses reviews encounters, shadows and harmful
                changes; Every event also reviews your own plays; Decisions only
                keeps information in the chronicle. Select Continue when an
                event is waiting. Rules choices always require your input.
              </p>
              <p>
                Inspect table lets you look around while the game stays paused.
                Open Review current event to return, or browse the last 80
                events in the chronicle. Revealed cards can be opened at full
                size. Your save preserves the exact event waiting for
                confirmation. These reading pauses do not create extra
                card-action windows.
              </p>
            </section>
            <section className="guide-note">
              <h2>One company. Separate fellowships.</h2>
              <p>
                In hot-seat mode, choose a starter or custom deck for each
                player. Each player’s selected heroes begin in play, with a
                separate player deck. Keep or mulligan each hand, plan for each
                player, then commit each fellowship to the shared quest. One
                encounter is revealed per active seat. Engagement, defense, and
                attacks follow the first-player order; the crown moves each
                round.
              </p>
              <p>
                Click a player’s banner to view their hand and fellowship. Each
                hero has their own resource pool; players cannot pool resources
                across seats. Sentinel characters can defend for another
                fellowship, Ranged characters can join its attacks, and support
                cards let you choose which player benefits. Normal games and
                campaigns both support this arrangement.
              </p>
              <p>
                These original 30-card learning decks are preserved, with their
                three hero cards kept separate from the draw deck. Starting
                threat is the sum of your selected heroes’ threat values. Each
                hero gains one resource per round. Dol Guldur captures one hero
                from the whole table; the other heroes remain available for the
                rescue.
              </p>
            </section>
            <section className="guide-note">
              <h2>Choose your journey</h2>
              <p>
                <strong>Normal game:</strong> select any of the{" "}
                {SCENARIOS.length} registered quests for a fresh, standalone
                adventure. <strong>Campaign mode:</strong> follow Mirkwood Paths
                in order. After a victory, select Continue campaign to prepare
                the next chapter with your earned boons and burdens.
              </p>
              <p>
                The campaign log records fallen heroes, scores, permanent cards,
                and the hero captured in Dol Guldur. Each hero replacement adds
                +1 to every player’s starting threat in later chapters. Each
                player may change one surviving hero between quests and replace
                any fallen heroes. Choose whether to add Mendor’s Support to
                your next deck.
              </p>
              <p>
                Keep Mendor alive: losing him ends the first two campaign
                quests. In Dol Guldur, claiming an unguarded objective frees
                Mendor; placing progress on stage two rescues your hero. Claim
                objectives from the staging area after clearing their guards.
              </p>
              <p>
                Normal games and campaigns save separately on this device. Retry
                this quest restarts a failed chapter with the campaign log from
                before that quest. Export a save to keep additional adventures
                or move to another device.
              </p>
            </section>
            <div className="guide-steps">
              {[
                {
                  name: "Resource",
                  text: "Each hero gains 1 resource, and you draw a card. The game handles this at the start of each round.",
                  icon: Coins,
                },
                {
                  name: "Planning",
                  text: "Spend matching sphere resources to play allies and attachments. Inspect a hand card, choose its target and payment, then play it.",
                  icon: UsersThree,
                },
                {
                  name: "Quest",
                  text: "Select ready characters to commit. They exhaust. Compare quest strength with staging threat: willpower normally, attack for Battle, defense for Siege. Success places progress; failure raises your threat.",
                  icon: Feather,
                },
                {
                  name: "Travel",
                  text: "Choose one staging location to travel to. It stops contributing threat, but future progress must explore it before reaching the quest.",
                  icon: Compass,
                },
                {
                  name: "Encounter",
                  text: "Optionally engage one enemy. Enemies with an engagement cost at or below your threat then engage automatically.",
                  icon: Eye,
                },
                {
                  name: "Combat",
                  text: "Choose an enemy, then a ready defender. Shadow effects resolve before damage. After enemy attacks, select ready attackers to strike back. Attack minus defense is damage.",
                  icon: Sword,
                },
                {
                  name: "Refresh",
                  text: "Characters and attachments ready, threat rises by 1, and the next round begins. Webbed heroes require 2 of their own resources to ready.",
                  icon: Moon,
                },
              ].map((step, i) => (
                <section key={step.name}>
                  <span className="guide-number">0{i + 1}</span>
                  <step.icon size={25} />
                  <div>
                    <h3>{step.name}</h3>
                    <p>{step.text}</p>
                  </div>
                </section>
              ))}
            </div>
            <section className="guide-note">
              <h2>A living adventure</h2>
              <p>
                The registered play pool currently includes {HERO_CARDS.length}{" "}
                heroes, {DECK_CARDS.length} deckbuilding cards,{" "}
                {SCENARIOS.length} quests and four campaigns, among them the{" "}
                {MIRKWOOD_PATHS_ORDER.length}-part Mirkwood Paths campaign with
                The Dark of Mirkwood. New releases become playable when their
                rules are implemented. The library includes the official player,
                encounter, quest, campaign and Nightmare card catalog, with
                original and revised product information.
              </p>
              <SupportSummary />
              <p>
                Some optional responses resolve automatically or in a fixed
                order, and intermediate attack action windows are simplified.
                Targeted effects, Valor, and cancellations use decision prompts.
                Undo is available for local solo play; it can reveal hidden
                information.
              </p>
              <div className="guide-links">
                <a
                  href="https://ringsdb.com/api/doc"
                  target="_blank"
                  rel="noreferrer"
                >
                  RingsDB API <ArrowRight />
                </a>
                <a
                  href="https://www.fantasyflightgames.com/en/products/the-lord-of-the-rings-the-card-game/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Official rules <ArrowRight />
                </a>
                <a
                  href="https://github.com/GeckoTH/Lord-of-the-Rings"
                  target="_blank"
                  rel="noreferrer"
                >
                  Encounter data <ArrowRight />
                </a>
              </div>
              <p className="fine-print">
                Unofficial fan project. Card text and artwork belong to Fantasy
                Flight Games and their respective owners. Card data from RingsDB
                and OCTGN; encounter scans from Hall of Beorn. Original forest
                illustration generated for this project.
              </p>
            </section>
            <section className="save-tools">
              <h3>Bring your journey with you</h3>
              <button
                className="secondary"
                onClick={exportSave}
                disabled={!game}
              >
                <DownloadSimple /> Export save
              </button>
              <button className="secondary" onClick={exportRecovery}>
                <DownloadSimple /> Export recovery backup
              </button>
              <label className="secondary file-label">
                Import save
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importSave(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </section>
          </main>
        )}
        {page === "table" && game && (
          <main
            id="main-content"
            tabIndex={-1}
            className="table-page card-table"
          >
            {significantMoment &&
              !["victory", "defeat"].includes(significantMoment.kind) && (
                <SignificantMoment
                  key={significantMoment.serial}
                  moment={significantMoment}
                  paused={
                    !!(game.choice || game.flow?.pending || detail || showQuest)
                  }
                  dismiss={dismissMoment}
                />
              )}
            {!saved && (
              <div
                className="save-failure-banner"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <WarningCircle size={23} aria-hidden="true" />
                <div>
                  <strong>Changes are not saved on this device.</strong>
                  <p>Export this adventure to keep your latest progress.</p>
                </div>
                <button
                  onClick={exportSave}
                  aria-label="Export unsaved adventure"
                >
                  <DownloadSimple size={18} aria-hidden="true" />
                  Export adventure
                </button>
              </div>
            )}
            <div className="table-heading">
              <div>
                <button className="text-link" onClick={() => nav("adventures")}>
                  <ArrowLeft size={14} /> Adventures
                </button>
                <h1>{scenario(game.scenarioId).name}</h1>
                <span className="game-mode-label">
                  {game.playMode === "campaign"
                    ? `${CAMPAIGN_TITLES[campaignKindOf(game.campaign)]} · Campaign`
                    : "Normal game"}
                </span>
              </div>
              <div className="table-tools">
                <button
                  className="playmat-trigger"
                  aria-label="Change playmat"
                  title={`Playmat: ${PLAYMATS[activePlaymat].name}`}
                  onClick={() => setShowSettings(true)}
                >
                  <span className={`playmat-swatch mat-${activePlaymat}`} />
                  <span>{PLAYMATS[activePlaymat].name}</span>
                  <SlidersHorizontal size={13} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Table preferences"
                  title="Table preferences & shortcuts"
                  onClick={() => setShowSettings(true)}
                >
                  <SlidersHorizontal size={18} />
                </button>
                <span
                  className={`save-status ${saved ? "" : "unsaved"}`}
                  role={saved ? "status" : undefined}
                  title={
                    saved
                      ? "Saved on this device"
                      : "Changes are not saved on this device."
                  }
                >
                  {saved ? <Check size={14} /> : <WarningCircle size={14} />}{" "}
                  {saved ? "Saved on this device" : "Not saved"}
                </span>
                <button
                  className="icon-button"
                  aria-label="Undo last action"
                  disabled={!history.length}
                  onClick={undo}
                >
                  <ArrowCounterClockwise size={18} />
                </button>
                <button
                  className="icon-button"
                  aria-label="View discard piles"
                  title="Discard piles"
                  onClick={() => setShowPiles(true)}
                >
                  <Stack size={19} />
                </button>
                <button
                  className="secondary compact"
                  onClick={() => setShowLog(true)}
                >
                  <Scroll /> Chronicle
                </button>
              </div>
            </div>
            <FellowshipSeats s={game} dispatch={dispatch} />
            {(game.prisoner || game.captiveMendor) && (
              <div className="prisoner-banner">
                <Shield size={22} />
                <div>
                  <strong>
                    {game.prisoner
                      ? `${name(game.prisoner)} is imprisoned`
                      : "The prisoner is free"}
                  </strong>
                  <p>
                    {game.prisoner
                      ? "This hero cannot act or collect resources. Add progress to stage 2 to rescue them."
                      : ""}
                    {game.captiveMendor
                      ? " Claim your first objective to free Mendor."
                      : ""}
                  </p>
                </div>
                {game.prisoner && (
                  <button
                    className="text-link"
                    onClick={() => setDetail(card(game.prisoner!.code))}
                  >
                    Inspect hero
                  </button>
                )}
              </div>
            )}
            <div className="round-strip">
              <div className="round-number">
                <span>ROUND</span>
                <strong>
                  {game.round ? <AnimatedNumber value={game.round} /> : "—"}
                </strong>
              </div>
              <div className="phase-track">
                {[
                  { label: "Resource", key: "resource" },
                  { label: "Planning", key: "planning" },
                  { label: "Quest", key: "quest" },
                  { label: "Travel", key: "travel" },
                  { label: "Encounter", key: "encounter" },
                  { label: "Combat", key: "attack" },
                  { label: "Refresh", key: "refresh" },
                ].map((p, i) => {
                  const active =
                    p.key === game.phase ||
                    (p.key === "resource" && game.phase === "setup") ||
                    (p.key === "quest" && game.phase === "staging") ||
                    (p.key === "attack" && game.phase === "defense");
                  return (
                    <div
                      key={p.key}
                      className={active ? "active" : ""}
                      aria-current={active ? "step" : undefined}
                    >
                      <span>{i + 1}</span>
                      {p.label}
                      {active && (
                        <motion.i
                          className="phase-cursor"
                          layoutId="phase-cursor"
                          transition={
                            reducedMotion ? { duration: 0 } : tableSpring
                          }
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <span className="shared-table-label">
                <Tree size={14} /> A SHARED JOURNEY
              </span>
            </div>
            <EscapeTestSummary s={game} />
            <HideTestSummary s={game} />
            <SailingTestSummary s={game} />
            <ScenarioState s={game} inspect={setDetail} />
            <DepthsScenarioState s={game} inspect={setDetail} />
            <DrownedScenarioState s={game} inspect={setDetail} />
            <CobasScenarioState s={game} inspect={setDetail} />
            <CityScenarioState s={game} inspect={setDetail} />
            <HaradScenarioState s={game} inspect={setDetail} />
            <MumakilScenarioState s={game} inspect={setDetail} />
            <RaceHaradScenarioState s={game} inspect={setDetail} />
            <BeneathSandsScenarioState s={game} inspect={setDetail} />
            <WitheredHeathScenarioState s={game} inspect={setDetail} />
            <MountGundabadScenarioState s={game} inspect={setDetail} />
            <FateWilderlandScenarioState s={game} inspect={setDetail} />
            <ShadowEastPlayerState s={game} inspect={setDetail} />
            <ShadowEastScenarioState s={game} inspect={setDetail} />
            <WrathRuinScenarioState s={game} inspect={setDetail} />
            <LandSorrowState s={game} inspect={setDetail} />
            <MessengerOfTheKingState s={game} inspect={setDetail} />
            <FortressNurnState s={game} inspect={setDetail} />
            <BondOfFriendshipState s={game} inspect={setDetail} />
            <MassingOsgiliathState s={game} inspect={setDetail} />
            <WeMustAwayState s={game} inspect={setDetail} />
            <MistyMountainsState s={game} inspect={setDetail} />
            <DungeonsDeepState s={game} inspect={setDetail} />
            <FliesSpidersState
              s={game}
              inspect={setDetail}
              dispatch={dispatch}
            />
            <LonelyMountainState s={game} inspect={setDetail} />
            <BattleFiveArmiesState
              s={game}
              inspect={setDetail}
              dispatch={dispatch}
            />
            <LakeTownState s={game} inspect={setDetail} dispatch={dispatch} />
            <ShadowPastState s={game} inspect={setDetail} />
            <KnifeDarkState s={game} inspect={setDetail} />
            <FlightFordState s={game} inspect={setDetail} />
            <StoneErechState s={game} inspect={setDetail} />
            <OldForestState s={game} inspect={setDetail} />
            <RingSouthState s={game} inspect={setDetail} />
            <JourneyDarkState s={game} inspect={setDetail} />
            <BreakingFellowshipState s={game} inspect={setDetail} />
            <FogBarrowState s={game} inspect={setDetail} />
            <UrukHaiState s={game} inspect={setDetail} />
            <HelmsDeepState s={game} inspect={setDetail} />
            <RoadIsengardState s={game} inspect={setDetail} />
            <PassageMarshesState s={game} inspect={setDetail} />
            <CrossRoadsState s={game} inspect={setDetail} />
            <ShelobLairState s={game} inspect={setDetail} />
            <GreyCompanyState s={game} inspect={setDetail} />
            <SiegeGondorState s={game} inspect={setDetail} />
            <PelennorFieldsState s={game} inspect={setDetail} />
            <CirithUngolState s={game} inspect={setDetail} />
            <BlackGateState s={game} inspect={setDetail} />
            <MountDoomState s={game} inspect={setDetail} />
            <OathState s={game} inspect={setDetail} />
            <RuinsBelegostState s={game} inspect={setDetail} />
            <PrancingPonyState s={game} inspect={setDetail} />
            <AnnuminasState s={game} inspect={setDetail} />
            <AttackDolGuldurState s={game} inspect={setDetail} />
            <CavesState s={game} inspect={setDetail} />
            <WizardsQuestState s={game} inspect={setDetail} />
            <WoodlandRealmState s={game} inspect={setDetail} />
            <MinesMoriaState s={game} inspect={setDetail} />
            <EscapeKhazadState s={game} inspect={setDetail} />
            <HuntDreadnaughtState s={game} inspect={setDetail} />
            <AshMountainsState s={game} inspect={setDetail} />
            <CouncilOfTheWiseState s={game} inspect={setDetail} />
            <WainridersScenarioState s={game} inspect={setDetail} />
            <WandererContractState
              s={game}
              inspect={setDetail}
              dispatch={dispatch}
            />
            <UlfastScenarioState s={game} inspect={setDetail} />
            <HuntersContractState
              s={game}
              inspect={setDetail}
              dispatch={dispatch}
            />
            <PerilousVoyageState
              s={game}
              inspect={setDetail}
              dispatch={dispatch}
            />
            <BurglarContractStateView s={game} inspect={setDetail} />
            <RoamRhovanionScenarioState s={game} inspect={setDetail} />
            <FireNightScenarioState s={game} inspect={setDetail} />
            <GhostFramsburgScenarioState
              s={game}
              onInspect={(code) => setDetail(card(code))}
            />
            <BlackSerpentScenarioState s={game} inspect={setDetail} />
            <CirithGuratScenarioState s={game} inspect={setDetail} />
            <CrossingsPorosScenarioState s={game} inspect={setDetail} />
            <WildsRhovanionScenarioState
              s={game}
              onInspect={(code) => setDetail(card(code))}
            />
            <div className="table-layout">
              <section className={`gameboard board-${game.scenarioId}`}>
                <JourneyArea
                  s={game}
                  dispatch={dispatch}
                  inspect={setDetail}
                  inspectQuest={() => setShowQuest(true)}
                />
                <TableDecks
                  s={game}
                  kind="encounter"
                  openDiscard={() => {
                    setPile("encounter");
                    setShowPiles(true);
                  }}
                />
                <TableDecks
                  s={game}
                  kind="player"
                  openDiscard={() => {
                    setPile("player");
                    setShowPiles(true);
                  }}
                />
                {game.temple && (
                  <TempleMap s={game} dispatch={dispatch} inspect={setDetail} />
                )}
                <div
                  className={`encounter-field ${allEngaged(game).length ? "has-engaged" : ""} ${game.assaultOsgiliath?.controlled.length ? "has-controlled" : ""} ${game.stormcaller ? "has-stormcaller" : ""}`}
                >
                  <motion.div layoutScroll className="encounter-zone">
                    <div className="zone-label">
                      <span>
                        <Eye size={16} /> STAGING AREA
                      </span>
                      <span>
                        <Eye size={15} aria-hidden="true" />{" "}
                        {stagingThreat(game)} threat
                      </span>
                    </div>
                    <motion.div layoutScroll className="board-cards">
                      {ordinaryStaging.map(renderStagingCard)}
                      {!ordinaryStaging.length && (
                        <div className="empty-zone">
                          <Tree size={34} weight="thin" />
                          <span>
                            {game.temple
                              ? "Nearby locations are shown on the Island Map."
                              : "For a moment, the path is clear."}
                          </span>
                        </div>
                      )}
                    </motion.div>
                  </motion.div>
                  {game.stormcaller && (
                    <motion.div
                      layoutScroll
                      className="engaged-zone stormcaller-zone"
                      aria-label="Stormcaller's area"
                    >
                      <div className="zone-label">
                        <span>
                          <Compass size={15} /> STORMCALLER'S AREA
                        </span>
                        <span>Stage {game.stormcaller.enemyStage}</span>
                      </div>
                      <StormcallerQuestSummary s={game} inspect={setDetail} />
                      <motion.div layoutScroll className="board-cards">
                        {stormcallerArea(game).map(renderStagingCard)}
                        {!stormcallerArea(game).length && (
                          <div className="empty-zone">
                            <span>The pursuit continues beyond this area.</span>
                          </div>
                        )}
                      </motion.div>
                    </motion.div>
                  )}
                  {!!game.assaultOsgiliath?.controlled.length && (
                    <motion.div
                      layoutScroll
                      className="engaged-zone controlled-zone"
                      aria-label="Controlled Osgiliath locations"
                    >
                      <div className="zone-label">
                        <span>
                          <Shield size={15} /> CONTROLLED
                        </span>
                        <span>{game.assaultOsgiliath.controlled.length}</span>
                      </div>
                      <motion.div layoutScroll className="board-cards">
                        {game.assaultOsgiliath.controlled.map((u) => (
                          <BoardCard
                            key={u.id}
                            s={game}
                            u={u}
                            dispatch={dispatch}
                            inspect={() => setDetail(card(u.code))}
                            inspectCard={setDetail}
                          />
                        ))}
                      </motion.div>
                    </motion.div>
                  )}
                  {allEngaged(game).length > 0 && (
                    <motion.div layoutScroll className="engaged-zone">
                      <div className="zone-label">
                        <span>
                          <Sword size={15} /> ENGAGED ENEMIES
                        </span>
                      </div>
                      <motion.div layoutScroll className="board-cards">
                        {allEngaged(game).map((u) => (
                          <BoardCard
                            key={u.id}
                            s={game}
                            u={u}
                            dispatch={dispatch}
                            inspect={() => setDetail(card(u.code))}
                            inspectCard={setDetail}
                            action={
                              (
                                game.phase === "defense"
                                  ? pendingEnemyAttack(game, u)
                                  : game.phase === "attack" &&
                                    (game.table || game.earlyAttackPlayers
                                      ? !u.attackedBy?.includes(
                                          activeSeat(game),
                                        )
                                      : !u.attacked) &&
                                    attackersFor(game, u).length > 0
                              )
                                ? () => {
                                    setCombatEnemy(u.id);
                                  }
                                : undefined
                            }
                            actionLabel={
                              game.phase === "defense"
                                ? "Defend"
                                : game.table &&
                                    ownerOf(game, u) !== activeSeat(game)
                                  ? `Ranged · ${seatName(game, ownerOf(game, u))}`
                                  : "Attack"
                            }
                            actionDisabled={
                              game.phase === "attack" &&
                              amonPlayerCannotDeclareAttack(game)
                                ? "Hobbit-sense prevents this fellowship from declaring attacks this round."
                                : null
                            }
                          />
                        ))}
                      </motion.div>
                    </motion.div>
                  )}
                </div>
                <motion.div layoutScroll className="fellowship-zone">
                  <div className="zone-label">
                    <span>
                      <UsersThree size={16} />{" "}
                      {game.table
                        ? `${seatName(game, activeSeat(game)).toUpperCase()}’S FELLOWSHIP`
                        : "YOUR FELLOWSHIP"}
                    </span>
                    <span>
                      {questWill(game) > 0 && (
                        <>
                          <Feather size={15} /> {questWill(game)} committed
                        </>
                      )}
                    </span>
                  </div>
                  {game.phase === "quest" && emynMuilMustCommit(game) && (
                    <p className="quest-selection-note" role="status">
                      The Falls of Rauros requires every eligible ready
                      character to quest. Select each ready card below.
                    </p>
                  )}
                  {allHeroes(game)
                    .flatMap((h) =>
                      h.attachments
                        .filter((a) => a.code === KHAZAD.book && !a.blanked)
                        .map((a) => ({ h, a })),
                    )
                    .map(({ h, a }) => (
                      <div className="abilities objective-actions" key={a.id}>
                        <button
                          disabled={
                            game.phase === "setup" ||
                            !!game.escapeTest ||
                            !!game.choice ||
                            !!game.flow?.pending ||
                            !game.heroes.some(
                              (hero) =>
                                !hero.exhausted &&
                                !khazadCannotExhaust(hero) &&
                                hero.id !== h.id,
                            )
                          }
                          onClick={() => setClaimId(a.id)}
                        >
                          Move Book of Mazarbul · Exhaust a hero
                        </button>
                      </div>
                    ))}
                  <motion.div layoutScroll className="character-row">
                    <div
                      className="hero-company"
                      role="group"
                      aria-label="Heroes"
                    >
                      {game.heroes.map((u) => (
                        <CharacterCard
                          key={u.id}
                          s={game}
                          u={u}
                          inspect={() => setDetail(card(u.code))}
                          inspectCard={setDetail}
                          dispatch={dispatch}
                        />
                      ))}
                    </div>
                    {game.allies.length > 0 && (
                      <div
                        className="ally-company"
                        role="group"
                        aria-label="Allies"
                      >
                        {game.allies.map((u) => (
                          <CharacterCard
                            key={u.id}
                            s={game}
                            u={u}
                            inspect={() => setDetail(card(u.code))}
                            inspectCard={setDetail}
                            dispatch={dispatch}
                          />
                        ))}
                      </div>
                    )}
                    <OtherFellowships
                      s={game}
                      dispatch={dispatch}
                      select={(seat) => dispatch({ type: "SELECT_SEAT", seat })}
                    />
                  </motion.div>
                </motion.div>
                <Hand
                  key={game.table?.active ?? "classic"}
                  s={game}
                  inspect={(u) => setDetail(card(u.code))}
                  play={beginPlay}
                  playDeck={beginDeckPlay}
                  dispatch={dispatch}
                  art={(u) => <Art c={card(u.code)} />}
                  onPiles={() => setShowPiles(true)}
                />
              </section>
              <aside className="turn-panel">
                <ThreatCounter s={game} inspect={setDetail} />
                <div className="turn-panel-top">
                  <span className="green-dot" />{" "}
                  {game.table
                    ? seatName(game, activeSeat(game)).toUpperCase()
                    : "YOUR TURN"}
                </div>
                <h2 key={game.phase} className="phase-title">
                  {phaseTitle(game)}
                </h2>
                <TurnActions
                  s={game}
                  dispatch={dispatch}
                  review={() => setShowResolution(true)}
                />
                {coach === "on" &&
                  (() => {
                    const tip = coachingTip;
                    return tip ? (
                      <aside
                        className={`coach-tip coach-${tip.tone}`}
                        aria-label="Coaching tip"
                      >
                        <Lightbulb size={18} weight="light" />
                        <div>
                          <strong>{tip.title}</strong>
                          <p>{tip.text}</p>
                          {tip.danger && <em>{tip.danger}</em>}
                        </div>
                      </aside>
                    ) : null;
                  })()}
                {!!game.pendingWolfReturns?.length && (
                  <p className="turn-tip">
                    {game.pendingWolfReturns.length} Wolf Rider shadow
                    {game.pendingWolfReturns.length === 1
                      ? " waits"
                      : "s wait"}{" "}
                    to return to the encounter deck at the end of combat.
                  </p>
                )}
                <details className="table-guidance">
                  <summary>Help with this phase</summary>
                  <p>{phaseHelp(game)}</p>
                  <div className="turn-tip">
                    {game.phase === "quest"
                      ? "Click a ready character to select it. Click again to unselect."
                      : game.phase === "planning"
                        ? `${game.hand.filter((u) => !playReason(game, u)).length} cards playable · Inspect a card for its rules and costs.`
                        : game.phase === "defense"
                          ? "Your defender exhausts. Damage is attack minus defense, after shadows."
                          : "Hover to preview a card. Click to read its full rules."}
                  </div>
                </details>
                {["quest", "staging"].includes(game.phase) && (
                  <QuestForecast s={game} />
                )}
                {game.lastQuest &&
                  ["quest", "staging", "travel"].includes(game.phase) && (
                    <div
                      className={`quest-result ${game.lastQuest.net >= 0 ? "success" : "failure"}`}
                    >
                      <span>
                        {game.lastQuest.net > 0
                          ? "Quest successful"
                          : game.lastQuest.net < 0
                            ? "Quest failed"
                            : "A stalemate"}
                      </span>
                      <strong>
                        {game.lastQuest.will} quest strength −{" "}
                        {game.lastQuest.threat} threat
                      </strong>
                      <small>
                        {game.lastQuest.net >= 0
                          ? `${game.lastQuest.net} progress gained`
                          : `Threat increased by ${-game.lastQuest.net}`}
                      </small>
                    </div>
                  )}
                <CooperativeActions s={game} dispatch={dispatch} />
                <details className="table-history">
                  <summary>Recent events</summary>
                  {game.lastReveal && (
                    <div className="last-reveal">
                      <h3>Last encounter</h3>
                      <button onClick={() => setDetail(card(game.lastReveal!))}>
                        <Art c={card(game.lastReveal)} />
                        <span>
                          {card(game.lastReveal).name}
                          <small>{card(game.lastReveal).type_code}</small>
                          <span>
                            Inspect <ArrowRight size={12} />
                          </span>
                        </span>
                      </button>
                    </div>
                  )}
                  {!!game.flow?.history.length && (
                    <div className="latest-event">
                      <button onClick={() => setShowLog(true)}>
                        <Scroll size={16} />
                        <span>
                          <strong>{game.flow.history.at(-1)!.title}</strong>
                          <small>Review the event chronicle</small>
                        </span>
                      </button>
                    </div>
                  )}
                  <div className="recent-log">
                    <h3>The chronicle</h3>
                    {game.log
                      .slice(-4)
                      .reverse()
                      .map((l) => (
                        <p key={l.id} className={l.kind}>
                          {l.text}
                        </p>
                      ))}
                  </div>
                  <button
                    className="text-link export-link"
                    onClick={exportSave}
                  >
                    <DownloadSimple size={14} /> Export adventure
                  </button>
                </details>
              </aside>
            </div>
            {game.status === "playing" && (
              <footer className="mobile-action-bar">
                <div>
                  <small>ROUND {game.round || 1}</small>
                  <strong>{phaseTitle(game)}</strong>
                </div>
                <TurnActions
                  s={game}
                  dispatch={dispatch}
                  review={() => setShowResolution(true)}
                />
              </footer>
            )}
          </main>
        )}
      </div>
      {toast && (
        <div className="toast" role="status">
          <Info size={18} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {page === "table" &&
        game &&
        tutorial === "pending" &&
        !game.flow?.pending &&
        !game.choice && (
          <Modal
            title="Your first adventure"
            className="tutorial-modal"
            onClose={() => setTutorial("seen")}
          >
            <p className="tutorial-lead">
              A round has seven phases, grouped here into five steps. The table
              walks you through them; this is the whole rhythm.
            </p>
            <ol className="tutorial-steps">
              <li>
                <strong>Resource & planning.</strong> Each hero gains 1
                resource. Play allies and attachments with matching sphere
                resources.
              </li>
              <li>
                <strong>Quest.</strong> Commit characters; their quest strength
                must beat staging threat to place progress. Use willpower
                normally, attack for Battle, and defense for Siege. Usually, one
                encounter card is revealed per player; quest effects can change
                this.
              </li>
              <li>
                <strong>Travel & engagement.</strong> Travel to a location to
                remove its threat. Enemies whose engagement cost is at or below
                your threat engage you.
              </li>
              <li>
                <strong>Combat.</strong> Choose a defender for each enemy, then
                strike back with ready characters.
              </li>
              <li>
                <strong>Refresh.</strong> Your characters ready and each
                player’s threat rises by 1. At 50 threat you are eliminated.
              </li>
            </ol>
            <p className="tutorial-note">
              A lit lamp in the turn panel suggests a move for each decision.
              Enter confirms an event review. Press ? for shortcuts and
              preferences.
            </p>
            <label className="preference-check">
              <div>
                <strong>Show coaching tips</strong>
              </div>
              <input
                type="checkbox"
                checked={coach === "on"}
                onChange={(e) => setCoach(e.target.checked ? "on" : "off")}
              />
            </label>
            <div className="modal-actions">
              <button
                className="primary"
                onClick={() => setTutorial("seen")}
                autoFocus
              >
                Start playing <ArrowRight />
              </button>
            </div>
          </Modal>
        )}
      {showRecords && (
        <Modal
          title="Your journey record"
          onClose={() => setShowRecords(false)}
        >
          <JourneyRecord
            records={records}
            onClear={() => {
              if (confirm("Clear your journey record on this device?")) {
                writeRecords([]);
                setRecords([]);
              }
            }}
          />
        </Modal>
      )}
      {recoveryImport && (
        <Modal
          title="Choose an adventure to restore"
          className="recovery-chooser"
          onClose={() => setRecoveryImport(null)}
        >
          <p>
            This backup contains both game modes. Restoring it replaces both
            matching adventure saves. Choose which adventure to open.
          </p>
          {recoveryImport.issues.length > 0 && (
            <p>
              Some entries could not be restored. Their original data remains in
              your backup.
            </p>
          )}
          <div className="modal-actions">
            {recoveryImport.candidates.map((candidate) => (
              <button
                key={candidate.key}
                className="secondary"
                onClick={() =>
                  restoreImportedAdventure(candidate, recoveryImport)
                }
              >
                Restore both and open {candidate.mode} adventure
                <small>
                  {scenario(candidate.game.scenarioId).shortName} · Round{" "}
                  {candidate.game.round || 1}
                </small>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {showSettings && (
        <Modal
          title="Make the table yours"
          onClose={() => setShowSettings(false)}
        >
          <AudioSettings
            preferences={audio.preferences}
            setMuted={audio.setMuted}
            setVolume={audio.setVolume}
          />
          <TableCollection
            selected={playmat}
            active={activePlaymat}
            select={setPlaymat}
          />
          <div className="preference-section">
            <h3>Card density</h3>
            <p>Choose more room to read, or more cards on screen.</p>
            <div className="preference-segments">
              {(["comfortable", "compact"] as const).map((v) => (
                <button
                  key={v}
                  aria-pressed={density === v}
                  onClick={() => setDensity(v)}
                >
                  {v === "comfortable" ? "Comfortable" : "Compact"}
                  {density === v && <Check size={16} />}
                </button>
              ))}
            </div>
          </div>
          <div className="preference-section">
            <h3>Event reviews</h3>
            <p>
              Choose when the table waits for Continue. Every event is still
              written to the chronicle.
            </p>
            <div className="preference-segments preference-stack">
              {REVIEW_MODES.map((v) => (
                <button
                  key={v}
                  aria-pressed={reviewMode === v}
                  onClick={() => setReviewMode(v)}
                >
                  <span>
                    {reviewModeLabel[v]}
                    <small>
                      {
                        {
                          all: "Confirm each recorded event, including your own plays.",
                          hidden:
                            "Pause for revealed encounters, shadows, damage, threat and quest results. Recommended.",
                          decisions:
                            "Never pause for information. Only choices stop the table.",
                        }[v]
                      }
                    </small>
                  </span>
                  {reviewMode === v && <Check size={16} />}
                </button>
              ))}
            </div>
          </div>
          <label className="preference-check">
            <div>
              <strong>Hover card previews</strong>
              <small>
                Read cards without leaving the table. Available with a mouse on
                larger screens.
              </small>
            </div>
            <input
              type="checkbox"
              checked={hoverCards === "on"}
              onChange={(e) => setHoverCards(e.target.checked ? "on" : "off")}
            />
          </label>
          <label className="preference-check">
            <div>
              <strong>Coaching tips</strong>
              <small>
                One suggestion for the current decision, computed from the
                visible table. Numbers only; the choice stays yours.
              </small>
            </div>
            <input
              type="checkbox"
              checked={coach === "on"}
              onChange={(e) => setCoach(e.target.checked ? "on" : "off")}
            />
          </label>
          <div className="keyboard-guide">
            <h3>
              <Keyboard size={19} />
              Keyboard shortcuts
            </h3>
            <dl>
              <div>
                <dt>Switch player</dt>
                <dd>
                  <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd>
                </dd>
              </div>
              <div>
                <dt>Next step</dt>
                <dd>
                  <kbd>N</kbd>
                </dd>
              </div>
              <div>
                <dt>Undo last action</dt>
                <dd>
                  <kbd>U</kbd>
                </dd>
              </div>
              <div>
                <dt>Jump to hand</dt>
                <dd>
                  <kbd>H</kbd>
                </dd>
              </div>
              <div>
                <dt>Preferences & shortcuts</dt>
                <dd>
                  <kbd>?</kbd>
                </dd>
              </div>
              <div>
                <dt>Close a card or menu</dt>
                <dd>
                  <kbd>Esc</kbd>
                </dd>
              </div>
            </dl>
            <p>Shortcuts pause while you’re typing or making a choice.</p>
          </div>
        </Modal>
      )}
      {showQuest && game && (
        <Modal title={stageInfo(game).name} onClose={() => setShowQuest(false)}>
          <div className="quest-inspector">
            <img
              src={questFace(game)}
              alt={`${stageInfo(game).name}, quest side ${questStageLabel(game)}`}
            />
            <p>{stageInfo(game).story}</p>
            {currentQuestUnit(game) && (
              <AttachmentStack
                u={currentQuestUnit(game)!}
                inspect={(c) => {
                  setShowQuest(false);
                  setDetail(c);
                }}
              />
            )}
            <QuestGoals s={game} />
            {campaignCardOf(game) && (
              <div className="saga-campaign-status" aria-label="Campaign card">
                <button
                  className="text-link"
                  onClick={() => {
                    setShowQuest(false);
                    setDetail(card(campaignCardOf(game)!));
                  }}
                >
                  Campaign card · {card(campaignCardOf(game)!).name}
                </button>
                {[
                  ...sagaCampaignStatus(game),
                  ...angmarCampaignStatus(game),
                  ...dreamchaserCampaignStatus(game),
                  ...darkMirkwoodCampaignStatus(game),
                  ...eredCampaignStatus(game),
                ].map((line) => (
                  <p key={line} className="campaign-note">
                    {line}
                  </p>
                ))}
              </div>
            )}
            <p>
              <strong>
                {currentQuestProgress(game)} /{" "}
                {stageInfo(game).quest || "Special objective"}
              </strong>{" "}
              quest progress · Stage {game.stage} of{" "}
              {scenarioStageCount(game.scenarioId)}
            </p>
            <small>
              {scenarioRelease(game.scenarioId)} · Quest card · Fantasy Flight
              Games
            </small>
            {"cardCode" in stageInfo(game) && (
              <button
                className="secondary"
                onClick={async () => {
                  const stage = stageInfo(game);
                  if (!("cardCode" in stage)) return;
                  try {
                    const local = [
                      ...ASH_QUESTS,
                      ...LAND_SORROW_QUESTS,
                      ...FORTRESS_NURN_QUESTS,
                      ...MASSING_QUESTS,
                      ...WMA_QUESTS,
                      ...OMM_QUESTS,
                      ...DDCD_QUESTS,
                      ...FAS_QUESTS,
                      ...TLM_QUESTS,
                      ...BOFA_QUESTS,
                      ...LAKE_QUESTS,
                      ...SHADOW_PAST_QUESTS,
                      ...KNIFE_DARK_QUESTS,
                      ...FLIGHT_FORD_QUESTS,
                      ...STONE_ERECH_QUESTS,
                      ...OLD_FOREST_QUESTS,
                      ...RING_SOUTH_QUESTS,
                      ...JOURNEY_DARK_QUESTS,
                      ...BREAKING_FELLOWSHIP_QUESTS,
                      ...FOG_BARROW_QUESTS,
                      ...URUK_HAI_QUESTS,
                      ...HELMS_DEEP_QUESTS,
                      ...ROAD_ISENGARD_QUESTS,
                      ...PASSAGE_MARSHES_QUESTS,
                      ...CROSS_ROADS_QUESTS,
                      ...SHELOB_LAIR_QUESTS,
                      ...GREY_COMPANY_QUESTS,
                      ...SIEGE_GONDOR_QUESTS,
                      ...PELENNOR_FIELDS_QUESTS,
                      ...CIRITH_UNGOL_QUESTS,
                      ...BLACK_GATE_QUESTS,
                      ...MOUNT_DOOM_QUESTS,
                      ...OATH_QUESTS,
                      ...RB_QUESTS,
                      ...PP_QUESTS,
                      ...SA_QUESTS,
                      ...ADG_QUESTS,
                      ...CAVES_QUESTS,
                      ...WQ_QUESTS,
                      ...WR_QUESTS,
                      ...MM_QUESTS,
                      ...EK_QUESTS,
                      ...HD_QUESTS,
                      ...(carrockQuestCards as Card[]),
                      ...EMYN_MUIL_QUESTS,
                      ...CITY_QUESTS,
                      ...HARAD_QUESTS,
                      ...MUMAKIL_QUESTS,
                      ...RACE_HARAD_QUESTS,
                      ...BENEATH_SANDS_QUESTS,
                      ...BLACK_SERPENT_QUESTS,
                      ...CIRITH_GURAT_QUESTS,
                      ...CROSSINGS_POROS_QUESTS,
                      ...WILDS_RHOVANION_QUESTS,
                    ].find((c) => c.code === stage.cardCode);
                    const printed =
                      local ??
                      (await loadCatalog()).find(
                        (c) => c.code === stage.cardCode,
                      );
                    if (printed) {
                      setShowQuest(false);
                      setDetail(currentQuestInspection(game, printed));
                    } else
                      notify(
                        "The printed quest is not available in the imported snapshot.",
                      );
                  } catch {
                    notify("The printed quest could not load. Try again.");
                  }
                }}
              >
                <BookOpen size={16} /> Read printed quest
              </button>
            )}
          </div>
        </Modal>
      )}
      {showPiles && game && (
        <Modal title="Discard piles" onClose={() => setShowPiles(false)}>
          <div className="preference-segments">
            {(["player", "encounter"] as const).map((p) => (
              <button
                key={p}
                aria-pressed={pile === p}
                onClick={() => setPile(p)}
              >
                {p === "player"
                  ? `Your cards · ${game.discard.length}`
                  : `Encounters · ${game.encounterDiscard.length}`}
              </button>
            ))}
          </div>
          <p className="pile-note">
            Only discarded cards are shown.{" "}
            {pile === "player" ? game.deck.length : game.encounterDeck.length}{" "}
            cards remain in the {pile === "player" ? "player" : "encounter"}{" "}
            deck.
          </p>
          <div className="pile-list">
            {[...(pile === "player" ? game.discard : game.encounterDiscard)]
              .reverse()
              .map((code, i) => (
                <div className="pile-entry" key={`${code}-${i}`}>
                  <button onClick={() => setDetail(card(code))}>
                    <Art c={card(code)} />
                    <span>
                      <strong>{card(code).name}</strong>
                      <small>
                        {card(code).type_code} · {card(code).sphere_code}
                      </small>
                    </span>
                    <Info size={17} />
                  </button>
                  {pile === "player" &&
                    // Durin's Dagger: an Ered Mithrin campaign treasure.
                    ["10121", "10145", "12006", ERED.dagger].includes(code) &&
                    (() => {
                      const index = game.discard.length - 1 - i;
                      const reason = replayEventProblem(
                        game,
                        discardPreview(game, index),
                      );
                      return (
                        <button
                          className="discard-play-button"
                          disabled={
                            !!reason || !!game.choice || !!game.flow?.pending
                          }
                          title={
                            reason ?? "Play this card from your discard pile"
                          }
                          onClick={() => beginDiscardPlay(index)}
                        >
                          Play {card(code).name} from discard
                        </button>
                      );
                    })()}
                </div>
              ))}
          </div>
          {!(pile === "player" ? game.discard : game.encounterDiscard)
            .length && (
            <div className="empty-zone">
              <Stack size={30} />
              <span>No cards have been discarded here.</span>
            </div>
          )}
        </Modal>
      )}
      {showAccount && (
        <Modal
          title="Your account"
          onClose={() => setShowAccount(false)}
          compact
        >
          <AccountPanel account={account} />
        </Modal>
      )}
      {previewDeck &&
        (() => {
          const d = describeDeck(previewDeck, decks);
          if (!d) return null;
          return (
            <Modal
              title={`${d.subtitle} · ${d.name}`}
              onClose={() => setPreviewDeck(null)}
              wide
            >
              <p>
                {d.description} {d.heroes.length} starting{" "}
                {d.heroes.length === 1 ? "hero" : "heroes"} and{" "}
                {deckSize(d.cards)} player cards.
              </p>
              <DeckProductNote deck={d} />
              <div className="deck-preview-heroes">
                {d.heroes.map((code) => (
                  <button key={code} onClick={() => setDetail(card(code))}>
                    <Art c={card(code)} />
                    <strong>{card(code).name}</strong>
                    <span>
                      {card(code).threat} printed threat · Inspect hero
                    </span>
                    <CardProductNote c={card(code)} />
                  </button>
                ))}
              </div>
              <h3>Inside this deck</h3>
              <div className="deck-list">
                {Object.entries(d.cards).map(([code, count]) => (
                  <div className="deck-row" key={code}>
                    <button
                      className="deck-card-link"
                      onClick={() => setDetail(card(code))}
                    >
                      <Art c={card(code)} />
                      <span>
                        {card(code).name}
                        <small>
                          {card(code).type_code} · Cost {card(code).cost}
                        </small>
                      </span>
                    </button>
                    <span className="deck-quantity">× {count}</span>
                  </div>
                ))}
              </div>
            </Modal>
          );
        })()}
      {detail && (
        <CardDetail
          c={
            game?.mountGundabad?.reforged && detail.code === GUNDABAD.sword
              ? { ...detail, initialReverse: true }
              : detail
          }
          onClose={() => setDetail(null)}
          action={
            inspectedHand && game ? (
              <div className="inspector-action">
                <p>
                  {playReason(game, inspectedHand) ??
                    `Available now · cost ${playCost(game, handPlayDefinition(game, inspectedHand))} resources`}
                </p>
                {availableAbilities(game, inspectedHand).map((a) => (
                  <button
                    key={a.id ?? a.label}
                    className="secondary"
                    disabled={
                      a.disabled || !!game.choice || !!game.flow?.pending
                    }
                    onClick={() => {
                      setDetail(null);
                      dispatch({
                        type: "ABILITY",
                        id: inspectedHand.id,
                        attachmentId: a.id,
                      });
                    }}
                  >
                    {a.label}
                  </button>
                ))}
                <button
                  className="primary"
                  disabled={!!playReason(game, inspectedHand)}
                  onClick={() => {
                    setDetail(null);
                    beginPlay(inspectedHand);
                  }}
                >
                  Play this card <ArrowRight size={18} />
                </button>
              </div>
            ) : undefined
          }
        />
      )}
      {restart && (
        <Modal title="A new journey?" onClose={() => setRestart(false)} wide>
          <p>
            Your current saved adventure will be replaced. You can export it
            first to keep a copy.
          </p>
          {setupMode === "classic" ? (
            <DeckPicker
              value={selectedDeck}
              onChange={setSelectedDeck}
              label="New adventure fellowship"
              custom={decks}
              compact
            />
          ) : (
            <p className="restart-company">
              New company:{" "}
              {seats
                .flatMap((p) => p.heroes)
                .map((h) => card(h).name)
                .join(" · ")}
              <br />
              {count(seats.length, "player")} ·{" "}
              {seats.reduce((n, p) => n + p.heroes.length, 0)} heroes · one deck
              per player.
            </p>
          )}
          <div className="modal-actions">
            <button className="secondary" onClick={exportSave}>
              Export current save
            </button>
            <button className="primary" onClick={() => start()}>
              Begin anew <ArrowRight />
            </button>
          </div>
        </Modal>
      )}
      {game?.flow?.pending && page === "table" && showResolution && (
        <ResolutionDialog
          s={game}
          inspect={setDetail}
          continueGame={(stepId) => dispatch({ type: "CONTINUE", stepId })}
          viewTable={() => setShowResolution(false)}
          openLog={() => setShowLog(true)}
        />
      )}
      {game && game.choice && !game.flow?.pending && page === "table" && (
        <ChoiceDialog
          s={
            templePrivateLookVisible(game)
              ? game
              : {
                  ...game,
                  choice: {
                    ...game.choice,
                    options: game.choice.options.map(
                      ({ code: _code, ...option }) => option,
                    ),
                  },
                }
          }
          choose={(id) => dispatch({ type: "CHOOSE", id })}
          inspect={setDetail}
        />
      )}
      {claimId && game && (
        <DecisionDialog
          title="Claim an objective"
          onClose={() => setClaimId(null)}
          description={objectiveClaimDescription(game, claimId)}
        >
          <div className="decision-grid choice-list">
            {(game.temple
              ? [...game.heroes, ...game.allies].filter(isHero)
              : game.heroes
            )
              .filter(
                (h) =>
                  !objectiveClaimExhausts(game, claimId) ||
                  (!h.exhausted &&
                    !khazadCannotExhaust(h) &&
                    !watcherWaterCannotExhaust(h) &&
                    !h.attachments.some((a) => a.id === claimId)),
              )
              .map((h) => (
                <DecisionCard
                  key={h.id}
                  c={card(h.code)}
                  inspect={setDetail}
                  onSelect={() => {
                    if (dispatch({ type: "CLAIM", id: claimId, heroId: h.id }))
                      setClaimId(null);
                  }}
                />
              ))}
          </div>
        </DecisionDialog>
      )}
      {game && playCard && (
        <DecisionDialog
          title={`Play ${name(playCard)}`}
          onClose={() => setPlayCard(null)}
          description={
            playCard.code === "10124"
              ? "Choose a player’s threat dial, check your payment, then play."
              : needsTarget(playCard)
                ? "Choose a target card, check your payment, then play."
                : "Check the card and your payment, then play."
          }
          footer={
            <>
              <span className="decision-hint">
                {needsTarget(playCard) && !target
                  ? "Select a target card to continue."
                  : !eligiblePayers(
                        game,
                        handPlayDefinition(game, playCard, xCost),
                        get(game, target),
                      ).length
                    ? "A matching sphere hero is required for this target."
                    : `${Object.values(payment).reduce((sum, n) => sum + n, 0)} resources selected`}
              </span>
              <div className="decision-actions">
                <button className="secondary" onClick={() => setPlayCard(null)}>
                  Cancel
                </button>
                <button
                  className="primary"
                  disabled={
                    (needsTarget(playCard) && !target) ||
                    (playDiscardIndex !== null &&
                      (!!replayEventProblem(
                        game,
                        playCard,
                        target || undefined,
                        xCost,
                      ) ||
                        !eventReplayPayments(
                          game,
                          playCard,
                          target || undefined,
                          xCost,
                        ).some((candidate) =>
                          [
                            ...new Set([
                              ...Object.keys(candidate),
                              ...Object.keys(payment),
                            ]),
                          ].every(
                            (id) => (candidate[id] ?? 0) === (payment[id] ?? 0),
                          ),
                        ))) ||
                    (["01036", "08143", "10085", "19149"].includes(
                      playCard.code,
                    ) &&
                      Object.entries(payment).filter(
                        ([id, n]) =>
                          n > 0 && game.heroes.some((h) => h.id === id),
                      ).length !== 3) ||
                    (["01067", "06083"].includes(playCard.code) &&
                      (!Number.isInteger(xCost) ||
                        xCost < 1 ||
                        xCost > eventXMaximum(game, playCard.code))) ||
                    !eligiblePayers(
                      game,
                      handPlayDefinition(game, playCard, xCost),
                      get(game, target),
                    ).length ||
                    Object.values(payment).reduce(
                      (n, value) => n + value,
                      0,
                    ) !==
                      playCost(
                        game,
                        handPlayDefinition(game, playCard, xCost),
                        get(game, target),
                      )
                  }
                  onClick={() => {
                    if (
                      dispatch(
                        playDeck
                          ? {
                              type: "PLAY_DECK",
                              target,
                              payment,
                              amount: xCost,
                            }
                          : playDiscardIndex === null
                            ? {
                                type: "PLAY",
                                id: playCard.id,
                                target,
                                payment,
                                amount: xCost,
                              }
                            : {
                                type: "PLAY_DISCARD",
                                index: playDiscardIndex,
                                target,
                                payment,
                                amount: xCost,
                              },
                      )
                    )
                      setPlayCard(null);
                  }}
                >
                  Play card <ArrowRight />
                </button>
              </div>
            </>
          }
        >
          <div className="play-selection">
            <aside className="play-source">
              <DecisionCard c={card(playCard.code)} inspect={setDetail} />
            </aside>
            <section className="play-options">
              <p className="rules-text">{plain(card(playCard.code).text)}</p>
              {needsTarget(playCard) && (
                <section
                  aria-label="Choose a target"
                  className="target-selection"
                >
                  <h3>Choose a target</h3>
                  <div className="decision-grid">
                    {playTargets(game, playCard).map((u) => (
                      <DecisionCard
                        key={u.id}
                        unitId={u.id}
                        c={
                          u.id.startsWith("threat:")
                            ? {
                                ...card(u.code),
                                name: `${seatName(game, Number(u.id.split(":")[1]))}’s threat dial`,
                              }
                            : u.id.startsWith("quest:")
                              ? { ...card(u.code), imagesrc: questFace(game) }
                              : card(u.code)
                        }
                        selected={target === u.id}
                        inspect={setDetail}
                        detail={
                          u.id.startsWith("threat:")
                            ? `${seatView(game, Number(u.id.split(":")[1])).threat} threat · Attach Favor of the Valar`
                            : u.id.startsWith("quest:")
                              ? "Current encounter quest"
                              : game.table
                                ? u.id.startsWith("discard-")
                                  ? `${seatName(game, Number(u.id.split("-")[1]))}’s discard`
                                  : `${seatName(game, ownerOf(game, u))}’s fellowship`
                                : undefined
                        }
                        onSelect={() => {
                          setTarget(u.id);
                          const c = handPlayDefinition(game, playCard);
                          const amount = ["01051", "19153"].includes(
                            playCard.code,
                          )
                            ? Number(card(u.code).cost) || 0
                            : xCost;
                          if (["01051", "19153"].includes(playCard.code))
                            setXCost(amount);
                          setPayment(
                            playDiscardIndex !== null
                              ? (eventReplayPayments(
                                  game,
                                  playCard,
                                  u.id,
                                  amount,
                                )[0] ?? {})
                              : planCardPayment(
                                  game,
                                  c.cost === "X" ? { ...c, cost: amount } : c,
                                  playCost(
                                    game,
                                    c.cost === "X" ? { ...c, cost: amount } : c,
                                    u,
                                  ),
                                  u,
                                ),
                          );
                        }}
                      >
                        {!u.id.startsWith("discard-") &&
                          ["hero", "ally", "enemy"].includes(
                            card(u.code).type_code,
                          ) && <DecisionStats s={game} u={u} />}
                      </DecisionCard>
                    ))}
                  </div>
                  {!playTargets(game, playCard).length && (
                    <p className="decision-empty">
                      No valid targets are available.
                    </p>
                  )}
                </section>
              )}
              <h3 className="payment-heading">
                Pay{" "}
                {playCost(
                  game,
                  handPlayDefinition(game, playCard, xCost),
                  get(game, target),
                )}{" "}
                resources
              </h3>
              {["01036", "08143", "10085", "19149"].includes(playCard.code) && (
                <p>Use resources from three different heroes.</p>
              )}
              {["01067", "06083"].includes(playCard.code) && (
                <label className="field-label">
                  Choose X
                  <input
                    aria-label="Choose X"
                    type="number"
                    min="1"
                    max={eventXMaximum(game, playCard.code)}
                    value={xCost}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setXCost(n);
                      const c = handPlayDefinition(game, playCard);
                      setPayment(
                        planCardPayment(
                          game,
                          { ...c, cost: n },
                          playCost(game, { ...c, cost: n }, get(game, target)),
                          get(game, target),
                        ),
                      );
                    }}
                  />
                </label>
              )}
              {eligiblePayers(
                game,
                handPlayDefinition(game, playCard, xCost),
                get(game, target),
              ).map((h) => (
                <div className="payment-row" key={h.id}>
                  <span>
                    <Sphere sphere={card(h.code).sphere_code} />
                    {name(h)} <small>({h.resources} available)</small>
                  </span>
                  <div className="stepper">
                    <button
                      disabled={!payment[h.id]}
                      onClick={() =>
                        setPayment((p) => ({ ...p, [h.id]: p[h.id] - 1 }))
                      }
                      aria-label={`Spend less from ${name(h)}`}
                    >
                      <Minus size={14} />
                    </button>
                    <span>{payment[h.id] ?? 0}</span>
                    <button
                      disabled={(payment[h.id] ?? 0) >= h.resources}
                      onClick={() =>
                        setPayment((p) => ({
                          ...p,
                          [h.id]: (p[h.id] ?? 0) + 1,
                        }))
                      }
                      aria-label={`Spend more from ${name(h)}`}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </section>
          </div>
        </DecisionDialog>
      )}
      {game &&
        combatEnemy &&
        (() => {
          const enemy = [...allEngaged(game), ...game.staging].find(
            (u) => u.id === combatEnemy,
          );
          return enemy ? (
            <CombatDialog
              key={`${game.phase}-${enemy.id}`}
              s={game}
              enemy={enemy}
              dispatch={dispatch}
              inspect={setDetail}
              onClose={() => setCombatEnemy(null)}
            />
          ) : null;
        })()}

      {showLog && game && (
        <Modal
          title="The chronicle"
          onClose={() => setShowLog(false)}
          wide
          className="chronicle-dialog"
        >
          {game.flow?.history.length ? (
            <ResolutionChronicle s={game} inspect={setDetail} />
          ) : null}
          <details
            className="chronicle-rules-log"
            open={!game.flow?.history.length}
          >
            <summary>
              <Scroll size={16} /> Detailed rules log{" "}
              <span>{game.log.length} entries</span>
            </summary>
            <div className="full-log">
              {game.log
                .slice()
                .reverse()
                .map((l) => (
                  <div className={l.kind} key={l.id}>
                    <span>R{l.round || "—"}</span>
                    <p>{l.text}</p>
                  </div>
                ))}
            </div>
          </details>
        </Modal>
      )}
      {interlude && game?.campaign && (
        <Modal
          title="Prepare the next chapter"
          wide
          onClose={() => setInterlude(false)}
        >
          <p>
            Continue to{" "}
            <strong>
              {(() => {
                const next =
                  game.campaign.kind === "saga"
                    ? nextChapter
                    : nextChapterOf(game.campaign);
                return next ? scenario(next).name : "Campaign complete";
              })()}
            </strong>
            . Heroes recover their damage and begin with a fresh deck.{" "}
            {freeHeroChange(game, nextChapter)
              ? "Heroes may be changed without adding to your permanent starting threat penalty."
              : "Each replaced hero adds +1 to your permanent starting threat penalty."}
          </p>
          {game.campaign.kind === "saga" &&
            sagaChapterOptions(game.campaign).length > 1 && (
              <label className="saga-next-chapter">
                <span>Next chapter</span>
                <select
                  aria-label="Next chapter"
                  value={nextChapter}
                  onChange={(e) => setNextChapter(e.target.value as ScenarioId)}
                >
                  {sagaChapterOptions(game.campaign).map((id) => (
                    <option key={id} value={id}>
                      {`Part ${sagaChapterNumber(id)} · ${scenario(id).name}${SAGA_INSERTS.includes(id) ? " (optional)" : ""}`}
                    </option>
                  ))}
                </select>
                <small>
                  The Old Forest and Fog on the Barrow-downs may be included
                  after A Shadow of the Past, in that order.
                </small>
              </label>
            )}
          {((game.campaign.kind === "saga" &&
            nextChapter !== "the-ring-goes-south") ||
            game.campaign.kind === "angmar" ||
            game.campaign.kind === "dreamchaser" ||
            game.campaign.kind === "ered") &&
            Object.keys(nextDeckBoons).length > 0 && (
              <fieldset className="saga-deck-boons">
                <legend>
                  {game.campaign.kind === "ered"
                    ? "Boons and discovered treasures in your decks"
                    : "Earned boon cards in your decks"}
                </legend>
                {Object.entries(nextDeckBoons).map(([key, seat]) => {
                  const [code, copy] = key.split("#");
                  const title = `${card(code).name}${copy === undefined ? "" : ` (copy ${Number(copy) + 1})`}`;
                  return (
                    <label key={key}>
                      <span>{title}</span>
                      <select
                        aria-label={`${title}: deck`}
                        value={seat === null ? "" : String(seat)}
                        onChange={(e) =>
                          setNextDeckBoons((d) => ({
                            ...d,
                            [key]:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          }))
                        }
                      >
                        <option value="">Not included</option>
                        {(game.table?.seats ?? [null]).map((_, i) => (
                          <option key={i} value={String(i)}>
                            {game.table
                              ? `Player ${i + 1}'s deck`
                              : "Your deck"}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
                <small>
                  Earned boons with a player card back may be included in a
                  player's deck; they do not count against its size.
                </small>
              </fieldset>
            )}
          {game.campaign.kind === "dreamchaser" && (
            <DreamchaserXp
              campaign={game.campaign}
              marks={nextMarks}
              onChange={setNextMarks}
              mode={dcMode}
              onMode={setDcMode}
            />
          )}
          <div className="campaign-hero-slots">
            {nextHeroes.map((code, i) => (
              <HeroPicker
                key={i}
                value={code}
                onChange={(code) =>
                  setNextHeroes((h) =>
                    h.map((old, j) => (j === i ? code : old)),
                  )
                }
                label={`${
                  game.table
                    ? `Player ${
                        campaignSeatCounts(game).findIndex(
                          (_, seat) =>
                            i <
                            campaignSeatCounts(game)
                              .slice(0, seat + 1)
                              .reduce((n, x) => n + x, 0),
                        ) + 1
                      } · `
                    : ""
                }Campaign hero ${i + 1}`}
                heroes={HERO_CARDS}
                inspect={setDetail}
                unavailable={(candidate) =>
                  game.campaign!.fallen.includes(candidate) ||
                  (game.campaign!.kind === "saga" &&
                    fallenNames(game.campaign!).includes(card(candidate).name))
                    ? "Fallen"
                    : forbiddenTitleOf(
                          game.campaign!,
                          nextChapter ?? nextChapterOf(game.campaign!),
                        ) === card(candidate).name
                      ? `No card titled ${card(candidate).name} in this chapter`
                      : nextHeroes.includes(candidate) && candidate !== code
                        ? "Already in the company"
                        : game.campaign!.prisoner === code && candidate !== code
                          ? "Keep the recorded prisoner"
                          : undefined
                }
              />
            ))}
          </div>
          {!game.table && game.deckId === "custom" && (
            <p className="campaign-deck-note">
              Your custom deck continues into the next chapter.
            </p>
          )}
          {!game.table && game.deckId !== "custom" && (
            <>
              <h3>Player deck</h3>
              <p>
                The deck supplies your player cards. Your chosen campaign heroes
                are shown above.
              </p>
              <DeckPicker
                value={nextDeck}
                onChange={setNextDeck}
                label="Campaign player deck"
                compact
                showHeroes={false}
              />
            </>
          )}
          {game.table && campaignSeatCounts(game).some((n) => n > 1) && (
            <div className="campaign-deck-choices">
              {nextSeatDecks.map((deckId, i) => (
                <section key={i}>
                  <h3>Player {i + 1} deck</h3>
                  <DeckPicker
                    value={deckId}
                    onChange={(id) =>
                      setNextSeatDecks((decks) =>
                        decks.map((d, j) => (j === i ? id : d)),
                      )
                    }
                    label={`Campaign player ${i + 1} deck`}
                    compact
                    showHeroes={false}
                  />
                </section>
              ))}
            </div>
          )}
          {game.table && (
            <p className="campaign-note">
              Each player keeps one deck shared by their heroes. Each hero
              replacement raises every seat’s starting threat by 1.
            </p>
          )}
          {game.campaign.kind !== "saga" && (
            <label className="support-toggle">
              <input
                type="checkbox"
                checked={includeSupport}
                onChange={(e) => setIncludeSupport(e.target.checked)}
              />{" "}
              Add earned Mendor’s Support to the deck
            </label>
          )}
          {game.campaign.prisoner && (
            <p className="campaign-note">
              The recorded prisoner, {card(game.campaign.prisoner).name}, must
              stay in your fellowship.
            </p>
          )}
          <p className="campaign-note">
            Starting threat penalty: +
            {game.campaign.threatPenalty +
              (freeHeroChange(game, nextChapter)
                ? 0
                : game.table
                  ? campaignSeatHeroes(
                      game,
                      game.campaign.kind === "saga" && game.campaign.seatHeroes
                        ? game.campaign.heroes
                        : game.table.seats.flatMap((p) => p.startingHeroes),
                    ).reduce((total, before, i) => {
                      const selected = campaignSeatHeroes(game, nextHeroes)[i];
                      return (
                        total +
                        before.filter((h) => !selected.includes(h)).length
                      );
                    }, 0)
                  : game.campaign.heroes.filter((h) => !nextHeroes.includes(h))
                      .length)}{" "}
            for every player.{" "}
            {freeHeroChange(game, nextChapter)
              ? "This chapter's campaign card lets each player change heroes without the +1 threat penalty."
              : "Each player may replace fallen heroes and voluntarily change one other hero."}
            {game.campaign.kind === "saga" &&
              game.campaign.playerPenalty?.some((n) => n > 0) &&
              ` Personal penalties: ${game.campaign.playerPenalty
                .map((n, i) =>
                  n > 0
                    ? `${game.table ? `Player ${i + 1}` : "you"} +${n}`
                    : "",
                )
                .filter(Boolean)
                .join(", ")}.`}
          </p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setInterlude(false)}>
              Back
            </button>
            <button className="primary" onClick={advanceCampaign}>
              Begin next chapter <ArrowRight />
            </button>
          </div>
        </Modal>
      )}
      {game &&
        game.status !== "playing" &&
        !game.flow?.pending &&
        page === "table" &&
        !interlude && (
          <Modal
            title={
              game.status === "won"
                ? "Beyond the shadow"
                : "The fellowship has fallen"
            }
          >
            <div className="endgame">
              <div className="endgame-moment-slot">
                {significantMoment &&
                ["victory", "defeat"].includes(significantMoment.kind) ? (
                  <SignificantMoment
                    key={significantMoment.serial}
                    moment={significantMoment}
                    inline
                    dismiss={dismissMoment}
                  />
                ) : game.status === "won" ? (
                  <Tree size={64} weight="thin" />
                ) : (
                  <Moon size={64} weight="thin" />
                )}
              </div>
              <h2>
                {game.status === "won"
                  ? game.campaign && !nextChapterOf(game.campaign)
                    ? "Your tale is complete."
                    : `${scenario(game.scenarioId).shortName} lies behind you.`
                  : "Every journey leaves a story."}
              </h2>
              <p>{game.reason}</p>
              <div>
                <span>
                  <strong>{game.round}</strong>Rounds
                </span>
                <span>
                  <strong>{game.threat}</strong>Threat
                </span>
                {game.status === "won" && (
                  <span>
                    <strong>{score(game)}</strong>Final score
                  </span>
                )}
              </div>
              {game.campaign && (
                <CampaignJournal game={game} inspect={setDetail} />
              )}
              {game.status === "won" && game.campaign?.resolution ? (
                <SagaResolution
                  game={game}
                  inspect={setDetail}
                  onRecord={(answers) => {
                    try {
                      setGame(
                        game.campaign?.kind === "angmar"
                          ? applyAngmarResolution(game, answers)
                          : game.campaign?.kind === "dreamchaser"
                            ? applyDreamchaserResolution(game, answers)
                            : game.campaign?.kind === "ered"
                              ? applyEredResolution(game, answers)
                              : !game.campaign?.kind
                                ? applyMirkwoodResolution(game, answers)
                                : applySagaResolution(game, answers),
                      );
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                />
              ) : game.campaign &&
                (game.status === "won" || sagaChapterComplete(game)) &&
                nextChapterOf(game.campaign) &&
                (game.campaign.kind === "saga"
                  ? sagaChapterSupported(nextChapterOf(game.campaign))
                  : game.campaign.kind === "angmar"
                    ? angmarChapterSupported(nextChapterOf(game.campaign))
                    : game.campaign.kind === "dreamchaser"
                      ? dreamchaserChapterSupported(
                          nextChapterOf(game.campaign),
                        )
                      : game.campaign.kind === "ered"
                        ? eredChapterSupported(nextChapterOf(game.campaign))
                        : true) ? (
                <>
                  {game.status === "lost" && (
                    <p className="campaign-note">
                      The Black Gate Opens cannot be won: in the campaign, the
                      players' defeat ends the chapter, and the Campaign Log
                      records the resource tokens on The Black Gate.
                    </p>
                  )}
                  <button className="primary" onClick={prepareNextChapter}>
                    Continue campaign <ArrowRight />
                  </button>
                </>
              ) : game.campaign?.kind === "saga" && game.campaign.outcome ? (
                <p className="campaign-note saga-outcome">
                  {game.campaign.outcome === "won"
                    ? "The One Ring is destroyed and the power of Sauron defeated: the players win The Lord of the Rings campaign."
                    : "The One Ring is kept, and its bearer succumbs to the power of Sauron: the players lose The Lord of the Rings campaign."}
                </p>
              ) : game.campaign?.kind === "angmar" &&
                game.campaign.outcome === "won" ? (
                <p className="campaign-note saga-outcome">
                  The Dread Realm · Resolution: the players win the Angmar
                  Awakened campaign!
                </p>
              ) : game.campaign?.kind === "dreamchaser" &&
                game.campaign.outcome === "won" ? (
                <p className="campaign-note saga-outcome">
                  The City of Corsairs · Resolution: the players win the
                  Dream-chaser campaign!
                </p>
              ) : (game.campaign?.kind === "angmar"
                  ? angmarChapterComplete(game)
                  : game.campaign?.kind === "dreamchaser"
                    ? dreamchaserChapterComplete(game)
                    : game.campaign?.kind === "ered" &&
                      eredChapterComplete(game)) &&
                nextChapterOf(game.campaign!) ? (
                <p className="campaign-note">
                  The campaign log is recorded. The next chapter,{" "}
                  {scenario(nextChapterOf(game.campaign!)!).name}, is not
                  available in campaign mode yet.
                </p>
              ) : game.status === "lost" ? (
                <button className="primary" onClick={retry}>
                  Retry this quest <ArrowCounterClockwise />
                </button>
              ) : (
                <button
                  className="primary"
                  onClick={() => {
                    nav("adventures");
                  }}
                >
                  Choose another adventure <ArrowRight />
                </button>
              )}
              {game.campaign &&
                !game.campaign.kind &&
                game.campaign.completed.at(-1)?.scenarioId === "dol-guldur" && (
                  <p className="campaign-note">
                    {game.campaign.mendorSaved
                      ? "Mendor survived: he begins The Oath and The Caves of Nibin-Dûm (Parts 4 and 5) in play, and his Support is available from the start of your next Mirkwood Paths campaign."
                      : "Mendor did not survive the escape. The Dark of Mirkwood's The Oath and The Caves of Nibin-Dûm may follow as Parts 4 and 5."}
                  </p>
                )}
              {game.campaign &&
                !game.campaign.kind &&
                !game.campaign.resolution &&
                game.campaign.completed.at(-1)?.scenarioId ===
                  "the-caves-of-nibin-dum" && (
                  <p className="campaign-note saga-outcome">
                    {game.campaign.mini
                      ? "The Dark of Mirkwood mini campaign is complete."
                      : "The Mirkwood Paths campaign is complete."}
                    {game.campaign.rangerRescued
                      ? " A retired Ranger was rescued: at the start of your next campaign, each player may shuffle 1 copy of Ranger Sense into their deck."
                      : ""}
                  </p>
                )}
              <button className="text-link" onClick={() => nav("adventures")}>
                Return to adventures
              </button>
            </div>
          </Modal>
        )}
    </div>
  );
}

/** The campaign card's resolution: the players' choices for the Campaign Log. */
function SagaResolution({
  game,
  inspect,
  onRecord,
}: {
  game: GameState;
  inspect: (c: Card) => void;
  onRecord: (answers: Record<string, string>) => void;
}) {
  const questions =
    game.campaign?.kind === "angmar"
      ? angmarResolutionQuestions(game)
      : game.campaign?.kind === "dreamchaser"
        ? dreamchaserResolutionQuestions(game)
        : game.campaign?.kind === "ered"
          ? eredResolutionQuestions(game)
          : !game.campaign?.kind
            ? mirkwoodResolutionQuestions(game)
            : sagaResolutionQuestions(game);
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, q.options[0]?.id ?? ""])),
  );
  return (
    <section
      className="campaign-journal saga-resolution"
      aria-label="Campaign resolution"
      data-saga-resolution={game.scenarioId}
    >
      <div className="section-line">
        <h3>
          <Books size={18} /> Resolution
        </h3>
        <button
          className="text-link"
          onClick={() => {
            const code = campaignCardOf(game);
            if (code) inspect({ ...card(code), initialReverse: true } as Card);
          }}
        >
          Inspect the campaign card
        </button>
      </div>
      {questions.map((q) => (
        <label key={q.id} className="saga-resolution-question">
          <span>{q.label}</span>
          <select
            value={answers[q.id]}
            onChange={(e) =>
              setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
            }
          >
            {q.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      <button className="primary" onClick={() => onRecord(answers)}>
        Record the resolution <ArrowRight />
      </button>
    </section>
  );
}

/** Does the next chapter's campaign card let each player change heroes without the +1 penalty? */
const freeHeroChange = (g: GameState, chosen?: ScenarioId) => {
  const c = g.campaign;
  if (c?.kind === "saga") return !!chosen && SAGA_FREE_CHANGES.includes(chosen);
  if (c?.kind === "angmar") {
    const next = nextAngmarChapter(c);
    return !!next && ANGMAR_FREE_CHANGES.includes(next);
  }
  if (c?.kind === "ered") {
    const next = nextEredChapter(c);
    return !!next && ERED_FREE_CHANGES.includes(next);
  }
  return false;
};
/** The campaign card of the chapter being played, in either campaign. */
const campaignCardOf = (game: GameState) =>
  !game.campaign
    ? undefined
    : game.campaign.kind === "saga"
      ? SAGA_CAMPAIGN_CARD_CODES[game.scenarioId]
      : game.campaign.kind === "angmar"
        ? ANGMAR_CAMPAIGN_CARDS[game.scenarioId]
        : game.campaign.kind === "dreamchaser"
          ? DREAMCHASER_CAMPAIGN_CARDS[game.scenarioId]
          : game.campaign.kind === "ered"
            ? ERED_CAMPAIGN_CARDS[game.scenarioId]
            : (CORE_CAMPAIGN_CARDS[game.scenarioId] ??
              DARK_MIRKWOOD_CAMPAIGN_CARDS[game.scenarioId]);
/**
 * The Dream-chaser campaign's interlude: spend XP on the Campaign Log's
 * checkboxes, and choose the Hard/Expert Mode card for the next chapter.
 */
function DreamchaserXp({
  campaign: c,
  marks,
  onChange,
  mode,
  onMode,
}: {
  campaign: CampaignState;
  marks: Record<string, number>;
  onChange: (m: Record<string, number>) => void;
  mode: "" | "hard" | "expert";
  onMode: (m: "" | "hard" | "expert") => void;
}) {
  const spent = DREAMCHASER_LOG.reduce(
    (n, l) => n + (marks[l.key] ?? 0) - (c.marks?.[l.key] ?? 0),
    0,
  );
  const left = (c.xp ?? 0) - spent;
  const mark = (key: string, delta: number) => {
    const next = { ...marks, [key]: (marks[key] ?? 0) + delta };
    if (!dreamchaserMarksProblem(c, next)) onChange(next);
  };
  return (
    <fieldset className="dreamchaser-xp" aria-label="Campaign Log XP">
      <legend>Campaign Log · {left} unspent XP</legend>
      <small>
        Spending 1 XP marks one checkbox. A scalable card's level is its number
        of marked checkboxes; an upgradable card uses its Upgraded side once all
        of its checkboxes are marked.
      </small>
      <ul>
        {DREAMCHASER_LOG.map((l) => {
          const before = c.marks?.[l.key] ?? 0;
          const now = marks[l.key] ?? 0;
          const addProblem = dreamchaserMarksProblem(c, {
            ...marks,
            [l.key]: now + 1,
          });
          return (
            <li key={l.key}>
              <span>
                {l.label}{" "}
                <span aria-label={`${now} of ${l.boxes} checkboxes`}>
                  {"■".repeat(now)}
                  {"□".repeat(l.boxes - now)}
                </span>
                {l.kind === "upgradable" && now >= l.boxes ? " · Upgraded" : ""}
                {l.kind === "scalable" ? ` · level ${now}` : ""}
              </span>
              <button
                className="text-link"
                aria-label={`Mark a checkbox: ${l.label}`}
                disabled={!!addProblem}
                title={addProblem ?? undefined}
                onClick={() => mark(l.key, 1)}
              >
                +1 XP
              </button>
              {now > before && (
                <button
                  className="text-link"
                  aria-label={`Unmark a checkbox: ${l.label}`}
                  onClick={() => mark(l.key, -1)}
                >
                  Undo
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <label>
        <span>Hard/Expert Mode card</span>
        <select
          aria-label="Hard or Expert Mode"
          value={mode}
          onChange={(e) => onMode(e.target.value as "" | "hard" | "expert")}
        >
          <option value="">Not used</option>
          <option value="hard">Hard Mode · +1 XP</option>
          <option value="expert">Expert Mode · +2 XP</option>
        </select>
      </label>
    </fieldset>
  );
}
/** The Dark of Mirkwood's entries in the Mirkwood Paths Campaign Log. */
function DarkMirkwoodNotes({ game }: { game: GameState }) {
  const c = game.campaign!;
  const player = (seat: number) =>
    (game.table?.seats.length ?? 1) > 1 ? `Player ${seat + 1}` : "you";
  const tokens =
    game.scenarioId === "the-oath" ? game.darkMirkwood?.tokens : undefined;
  const lines = [
    ...ADAPTATIONS.filter((code) => c.adaptations?.[code] !== undefined).map(
      (code) =>
        `${card(code).name} (${player(c.adaptations![code])})${c.adaptationsUsed?.includes(code) ? " · Action used" : ""}`,
    ),
    ...(c.noTimeToWaste?.length
      ? [
          `"No Time to Waste!" ×${c.noTimeToWaste.length} (${c.noTimeToWaste.map(player).join(", ")})`,
        ]
      : []),
    ...(c.rangerSense?.length
      ? [
          `${card(DOM.ranger).name} ×${c.rangerSense.length} (${c.rangerSense.map(player).join(", ")})`,
        ]
      : []),
    ...(c.rangerRescued ? ["A retired Ranger was rescued"] : []),
    ...(tokens !== undefined
      ? [
          `The Oath's campaign card: ${tokens} resource token${tokens === 1 ? "" : "s"}`,
        ]
      : []),
  ];
  return lines.length ? (
    <p className="campaign-note" data-dark-mirkwood-log>
      Notes · {lines.join(" · ")}
    </p>
  ) : null;
}

/** The Ered Mithrin Campaign Log: treasures, notes and the pool's encounter cards. */
function EredNotes({
  campaign: c,
  inspect,
}: {
  campaign: CampaignState;
  inspect: (c: Card) => void;
}) {
  const pool = Object.entries(c.encounterPool ?? {});
  return (
    <>
      <p className="campaign-note" data-ered-treasures>
        Notes · treasures:{" "}
        {c.treasures?.length ? (
          c.treasures.map((code, i) => (
            <span key={code}>
              {i ? ", " : ""}
              <button className="text-link" onClick={() => inspect(card(code))}>
                {card(code).name}
              </button>
            </span>
          ))
        ) : (
          <>none discovered yet</>
        )}
      </p>
      {c.notes?.map((note) => (
        <p key={note} className="campaign-note" data-ered-note={note}>
          Notes · “{ERED_NOTES[note] ?? note}”
        </p>
      ))}
      {c.beldis?.some((n) => n > 0) ? (
        <p className="campaign-note" data-ered-beldis>
          Notes · Beldis's uses marked:{" "}
          {c.beldis
            .map(
              (n, i) =>
                `${c.beldis!.length > 1 ? `Player ${i + 1} ` : ""}${n} of ${BELDIS_USES}`,
            )
            .join(", ")}
        </p>
      ) : null}
      {Object.keys(c.permanent ?? {}).length ? (
        <p className="campaign-note" data-ered-accolades>
          Notes · Accolades:{" "}
          {Object.entries(c.permanent).flatMap(([hero, codes], i) =>
            codes.map((code, j) => (
              <span key={code}>
                {i || j ? ", " : ""}
                <button
                  className="text-link"
                  onClick={() => inspect(card(code))}
                >
                  {card(code).name}
                </button>{" "}
                ({card(hero).name})
              </span>
            )),
          )}
        </p>
      ) : null}
      {pool.length ? (
        <p className="campaign-note" data-ered-pool>
          Notes · encounter cards in the Campaign Pool:{" "}
          {pool.map(([code, n], i) => (
            <span key={code}>
              {i ? ", " : ""}
              <button className="text-link" onClick={() => inspect(card(code))}>
                {card(code).name}
              </button>
              {n > 1 ? ` ×${n}` : ""}
            </span>
          ))}
        </p>
      ) : null}
    </>
  );
}

function CampaignJournal({
  game,
  inspect,
}: {
  game: GameState;
  inspect: (c: Card) => void;
}) {
  const c = game.campaign;
  if (!c) return null;
  return (
    <section className="campaign-journal" aria-label="Campaign log">
      <div className="section-line">
        <h3>
          <Books size={18} /> {CAMPAIGN_TITLES[campaignKindOf(c)]}
          {c.mini ? " · The Dark of Mirkwood" : ""}
        </h3>
        <span>{campaignProgress(c)} chapters</span>
      </div>
      <ol>
        {chaptersOf(c).map((id) => {
          const q = scenario(id);
          const result = c.completed.find((r) => r.scenarioId === q.id);
          // The Old Forest and Fog on the Barrow-downs are optional.
          const insert = c.kind === "saga" && SAGA_INSERTS.includes(id);
          const skipped =
            insert &&
            !result &&
            q.id !== game.scenarioId &&
            c.completed.length > 0 &&
            !sagaChapterOptions(c).includes(id);
          return (
            <li
              key={q.id}
              className={
                result ? "complete" : q.id === game.scenarioId ? "current" : ""
              }
            >
              <span>
                {result ? (
                  <Check size={15} />
                ) : c.kind === "saga" ? (
                  sagaChapterNumber(id)
                ) : c.kind === "angmar" ? (
                  ANGMAR_CAMPAIGN_ORDER.indexOf(id) + 1
                ) : c.kind === "dreamchaser" ? (
                  DREAMCHASER_CAMPAIGN_ORDER.indexOf(id) + 1
                ) : c.kind === "ered" ? (
                  ERED_CAMPAIGN_ORDER.indexOf(id) + 1
                ) : (
                  mirkwoodPart(c, id)
                )}
              </span>
              <strong>{q.name}</strong>
              <small>
                {result
                  ? `Score ${result.score}${result.xp !== undefined ? ` · ${result.xp} XP` : ""}`
                  : q.id === game.scenarioId
                    ? "Current chapter"
                    : skipped
                      ? "Not included"
                      : insert
                        ? "Optional"
                        : "Ahead"}
              </small>
            </li>
          );
        })}
      </ol>
      <div className="campaign-pool">
        <div>
          <span>BOONS</span>
          {c.boons.length ? (
            [...new Set(c.boons)].map((code) => {
              const copies =
                COPY_BOONS.includes(code) || code === ANGMAR.determination
                  ? (c.boonCopies?.[code]?.length ?? 1)
                  : c.boons.filter((x) => x === code).length;
              return (
                <button key={code} onClick={() => inspect(card(code))}>
                  <Sparkle size={13} />
                  {card(code).name}
                  {copies > 1 ? ` ×${copies}` : ""}
                </button>
              );
            })
          ) : (
            <small>Earned as your story unfolds</small>
          )}
        </div>
        <div>
          <span>BURDENS</span>
          {c.burdens.length ? (
            [...new Set(c.burdens)].map((code) => {
              const copies = DECK_BURDENS.includes(code)
                ? (c.deckBurdens?.[code]?.length ?? 1)
                : code === ERED.misplaced && c.kind === "ered"
                  ? (c.misplaced?.length ?? 1)
                  : (c.burdenCopies?.[code] ??
                    c.burdens.filter((x) => x === code).length);
              return (
                <button
                  key={code}
                  onClick={() =>
                    inspect(
                      code === ANGMAR.innocent && c.ravaged
                        ? ({ ...card(code), initialReverse: true } as Card)
                        : card(code),
                    )
                  }
                >
                  <Eye size={13} />
                  {code === ANGMAR.innocent && c.ravaged
                    ? "Arnor Ravaged"
                    : card(code).name}
                  {copies > 1 ? ` ×${copies}` : ""}
                </button>
              );
            })
          ) : (
            <small>No burdens recorded</small>
          )}
        </div>
      </div>
      {/* The Dark of Mirkwood (Ranger Sense may join any later campaign). */}
      <DarkMirkwoodNotes game={game} />
      {c.kind === "ered" ? <EredNotes campaign={c} inspect={inspect} /> : null}
      {c.captives?.length ? (
        <p className="campaign-note">
          Notes · captives:{" "}
          {c.captives.map((code) => card(code).name).join(", ")}
        </p>
      ) : null}
      {c.threatDials?.length ? (
        <p className="campaign-note">
          Notes · Overcome by Fear:{" "}
          {c.threatDials
            .map((seat) =>
              (c.seatHeroes?.length ?? 1) > 1 ? `Player ${seat + 1}` : "you",
            )
            .join(", ")}
        </p>
      ) : null}
      {c.corsairFleet !== undefined ? (
        <p className="campaign-note">
          Notes · The Corsair Fleet: {c.corsairFleet}{" "}
          {c.corsairFleet === 1 ? "resource" : "resources"}
        </p>
      ) : null}
      {c.determined?.length ? (
        <p className="campaign-note">
          Notes · determined:{" "}
          {c.determined.map((code) => card(code).name).join(", ")}
        </p>
      ) : null}
      {c.banned && Object.values(c.banned).some((list) => list.length) ? (
        <p className="campaign-note">
          Notes · left captured, out of the deck:{" "}
          {Object.entries(c.banned)
            .filter(([, list]) => list.length)
            .map(
              ([seat, list]) =>
                `${(c.seatHeroes?.length ?? 1) > 1 ? `Player ${Number(seat) + 1}: ` : ""}${list.map((code) => card(code).name).join(", ")}`,
            )
            .join("; ")}
        </p>
      ) : null}
      {c.threatReduction ? (
        <p className="campaign-note">
          Notes · Fend off Despair: each player's starting threat −
          {c.threatReduction}
        </p>
      ) : null}
      {c.heroDamage && Object.keys(c.heroDamage).length ? (
        <p className="campaign-note">
          Notes · damage after The Battle of Carn Dûm:{" "}
          {Object.entries(c.heroDamage)
            .map(([code, n]) => `${card(code).name} ${n}`)
            .join(", ")}
        </p>
      ) : null}
      {c.innocent !== undefined ? (
        <p className="campaign-note">
          Notes · {c.ravaged ? "Arnor Ravaged" : "Protect the Innocent"}:{" "}
          {c.innocent} damage
        </p>
      ) : null}
      {c.blackGateTokens !== undefined ? (
        <p className="campaign-note">
          Notes · The Black Gate: {c.blackGateTokens} resource{" "}
          {c.blackGateTokens === 1 ? "token" : "tokens"}
        </p>
      ) : null}
      {c.kind === "dreamchaser" ? (
        <p className="campaign-note">
          Notes · {c.xp ?? 0} unspent XP
          {DREAMCHASER_LOG.some((l) => c.marks?.[l.key])
            ? ` · ${DREAMCHASER_LOG.filter((l) => c.marks?.[l.key])
                .map(
                  (l) =>
                    `${l.label} ${c.marks![l.key]}/${l.boxes}${l.kind === "upgradable" && c.marks![l.key] >= l.boxes ? " (upgraded)" : ""}`,
                )
                .join(", ")}`
            : ""}
        </p>
      ) : null}
      {c.outcome ? (
        <p className="campaign-note">
          {c.kind === "angmar"
            ? "The campaign is won: The Dread Realm is complete."
            : c.kind === "dreamchaser"
              ? "The campaign is won: The City of Corsairs is complete."
              : c.outcome === "won"
                ? "The campaign is won: The One Ring is destroyed."
                : "The campaign is lost: The One Ring was kept."}
        </p>
      ) : null}
      {c.blackGateEnemies ? (
        <p className="campaign-note">
          Notes · under The Black Gate:{" "}
          {blackGateNote(c.blackGateEnemies) || "no enemy"}
        </p>
      ) : null}
      {c.playerPenalty?.some((n) => n > 0) ? (
        <p className="campaign-note">
          Personal starting threat penalties:{" "}
          {c.playerPenalty
            .map((n, i) =>
              n > 0
                ? `${c.playerPenalty!.length > 1 ? `Player ${i + 1}` : "You"} +${n}`
                : "",
            )
            .filter(Boolean)
            .join(", ")}
        </p>
      ) : null}
      {Object.entries(c.permanent).map(([hero, boons]) => (
        <p className="campaign-note" key={hero}>
          {hero === RING_BEARER_KEY
            ? "The Ring-bearer"
            : hero === ARAGORN_KEY
              ? "Aragorn (the Fellowship hero)"
              : card(hero).name}
          : {boons.map((code) => card(code).name).join(", ")}
        </p>
      ))}
      {c.kind === "saga" && (c.fallen.length > 0 || c.threatPenalty > 0) && (
        <p className="campaign-note">
          {c.fallen.length
            ? `Fallen heroes: ${c.fallen.map((h) => card(h).name).join(", ")}. `
            : ""}
          Starting threat penalty: +{c.threatPenalty}.
        </p>
      )}
      {c.prisoner && (
        <p className="campaign-note">
          Recorded prisoner: {card(c.prisoner).name}
        </p>
      )}
      {c.fallen.length > 0 && (
        <p className="campaign-note">
          Fallen heroes: {c.fallen.map((h) => card(h).name).join(", ")}
        </p>
      )}
      <footer>
        <span>
          Starting threat penalty <strong>+{c.threatPenalty}</strong>
        </span>
        <span>
          Campaign score{" "}
          <strong>{c.completed.reduce((sum, q) => sum + q.score, 0)}</strong>
        </span>
      </footer>
    </section>
  );
}

function phaseHelp(s: GameState) {
  if (s.sailing?.test)
    return s.sailing.test.phase === "actions"
      ? "Resolve the Sailing test to look at encounter cards and choose the fleet’s heading."
      : "Choose ready characters and resolve the fleet’s heading in the Sailing dialog. Player actions resume after the test.";
  if (s.hideTest)
    return s.hideTest.phase === "actions"
      ? `An action window is open after the ${isFortitude(s.hideTest) ? "Fortitude" : "Hide"} test's cards were discarded. Play events or use abilities, then resolve the test.`
      : isFortitude(s.hideTest)
        ? "Exhaust ready heroes to commit their willpower to the Fortitude test; then the encounter cards are discarded."
        : "Exhaust ready characters to commit their willpower to the Hide test; then the encounter cards are discarded.";
  if (s.escapeTest)
    return s.escapeTest.phase === "preparing"
      ? "Use end-of-quest actions, then choose ready characters for the escape test."
      : s.escapeTest.phase === "actions"
        ? "An action window is open. Play events or use abilities, then resolve the escape test to deal its cards."
        : "Choose ready heroes or allies to contribute their printed willpower or attack to the escape test.";
  switch (s.phase) {
    case "setup":
      return "Inspect your six starting cards. Keep them or take one mulligan before the first resource phase.";
    case "resource":
      return "Resources have been collected and cards drawn. Use eligible events and abilities, then continue to planning.";
    case "planning":
      return "Gather allies and equip your heroes. Spend resources from heroes with a matching sphere.";
    case "quest":
      return `Select ready characters below. Their ${questStat(s) === "attack" ? "attack" : questStat(s) === "defense" ? "defense" : "willpower"} contributes to this quest. Keep some ready to defend the dangers ahead.`;
    case "staging":
      return `The encounter has been revealed. Use available abilities or events before comparing ${questStat(s) === "attack" ? "attack" : questStat(s) === "defense" ? "defense" : "willpower"} and threat.`;
    case "travel":
      return s.staging.some(
        (u) => card(u.code).type_code === "location" && !canTravel(s, u),
      )
        ? "Choose an eligible location in staging. Check its travel cost before continuing."
        : allActiveLocations(s).length
          ? "Continue to the encounter phase after exploring the active locations."
          : "Continue to the encounter phase when you are ready.";
    case "encounter":
      return s.scenarioId === "anduin" && s.stage === 2
        ? "You may engage one enemy. Automatic engagement checks are skipped on the river."
        : "You may engage one enemy by choice. Then all enemies at or below your threat engage automatically.";
    case "defense":
      return "Each enemy attacks once. Assign a ready defender; its defense reduces incoming damage.";
    case "attack":
      return s.earlyAttackPlayers?.length
        ? "Oath of Eorl lets this fellowship attack before enemy attacks. Finish these attacks to continue the combat sequence."
        : s.table
          ? "Declare an attack with your ready characters. Other Ranged characters may join. Each fellowship may attack each eligible enemy once."
          : "Select an enemy and combine ready characters to attack it. Each enemy can be attacked once.";
    case "refresh":
      return "The fellowship has readied. Prepare for another round beneath the trees.";
  }
}
function BoardCard({
  s,
  u,
  inspect,
  inspectCard,
  action,
  actionLabel,
  actionDisabled,
  dispatch,
}: {
  s: GameState;
  u: Unit;
  inspect: () => void;
  inspectCard: (c: Card) => void;
  action?: () => void;
  actionLabel?: string;
  actionDisabled?: string | null;
  dispatch?: (a: Action) => unknown;
}) {
  const c = card(u.code);
  const combatStats = isEnemy(u) ? stats(s, u) : null;
  const consideredPlayers = livingSeats(s).filter((player) =>
    consideredEngaged(s, u, player),
  );
  const consideredLabel = consideredPlayers.length
    ? `Considered engaged with ${consideredPlayers
        .map((player) => (s.table ? `Player ${player + 1}` : "your fellowship"))
        .join(" · ")}`
    : "Considered engaged at threat 1 or higher";
  const damageRef = useDamageFeedback(u.damage);
  return (
    <MovingCard
      id={u.id}
      className={`board-card ${u.code === SHADOW_FLAME.bane && !u.blanked && s.staging.some((e) => e.id === u.id) ? "considered-enemy" : ""} ${u.attachments.length ? "has-attachments" : ""} ${(s.table && s.phase === "attack" ? u.attackedBy?.includes(activeSeat(s)) : u.attacked) ? "acted" : ""}`}
    >
      <ShadowCards count={u.shadows.length - faceupShadowCards(u).length} />
      <FaceupShadows u={u} inspect={inspectCard} />
      <AttachmentStack u={u} inspect={inspectCard} />
      <DepthsGrappleSummary s={s} location={u} inspect={inspectCard} />
      <button
        ref={damageRef}
        className="board-card-art"
        onClick={inspect}
        aria-label={`Inspect ${name(u)}`}
        aria-description={
          isEnemy(u)
            ? `${u.damage} damage. ${combatStats!.health - u.damage} hit points remaining.`
            : c.type_code === "location"
              ? `${u.progress} of ${locationQuest(s, u)} progress.`
              : undefined
        }
      >
        <Art
          c={u.flipped ? { ...c, name: name(u) } : c}
          imageSrc={u.flipped ? c.back_imagesrc : undefined}
        />
        <span className="card-table-tokens">
          {u.damage > 0 && <TableToken kind="damage" value={u.damage} />}
          {u.progress > 0 && <TableToken kind="progress" value={u.progress} />}
          {u.timeCounters !== undefined && (
            <TableToken kind="time" value={u.timeCounters} />
          )}
          {(u.resources > 0 ||
            u.code === WEATHER.mission ||
            u.code === CARROCK.grimbeorn ||
            u.code === DEAD.gollum ||
            u.code === S.flames ||
            (s.scenarioId === "encounter-at-amon-din" &&
              (c.type_code === "location" || u.code === A.rescued))) && (
            <TableToken kind="resource" value={u.resources} />
          )}
        </span>
      </button>
      {u.code === SHADOW_FLAME.bane &&
        s.staging.some((e) => e.id === u.id) &&
        !u.blanked && (
          <div
            className="engaged-owner considered-engagement"
            aria-label={consideredLabel}
            title={consideredLabel}
          >
            Considered engaged
            <span>
              {consideredPlayers.length
                ? s.table
                  ? `${consideredPlayers.length === 1 ? "Player" : "Players"} ${consideredPlayers.map((player) => player + 1).join(", ")}`
                  : "Your fellowship"
                : "At threat 1 or higher"}
            </span>
          </div>
        )}
      {s.assaultOsgiliath?.controlled.some((l) => l.id === u.id) && (
        <div className="engaged-owner">
          {s.table ? seatName(s, u.owner ?? 0) : "Your fellowship"}
        </div>
      )}
      {s.table && allEngaged(s).some((e) => e.id === u.id) && (
        <div className="engaged-owner">
          Engaged with {seatName(s, ownerOf(s, u))}
        </div>
      )}
      {s.phase === "defense" &&
        isEnemy(u) &&
        enemyAttackPrevented(
          s,
          u,
          allEngaged(s).some((e) => e.id === u.id)
            ? ownerOf(s, u)
            : activeSeat(s),
        ) && <div className="engaged-owner">Enemy attack prevented</div>}
      <div className="card-modifiers" aria-label="Modified card values">
        {threatOf(s, u) !== (c.threat ?? 0) && (
          <StatBadge kind="threat" value={threatOf(s, u)} />
        )}
        {isEnemy(u) && engagementCost(s, u) !== (c.engagement ?? 0) && (
          <span className="engaged-owner">
            Engagement cost {engagementCost(s, u)}
          </span>
        )}
        {isEnemy(u) && combatStats!.attack !== (c.attack ?? 0) && (
          <StatBadge kind="attack" value={combatStats!.attack} />
        )}
        {isEnemy(u) && combatStats!.defense !== (c.defense ?? 0) && (
          <StatBadge kind="defense" value={combatStats!.defense} />
        )}
      </div>
      {["player-side-quest", "encounter-side-quest"].includes(c.type_code) && (
        <div className="objective-status">
          <span>
            {selectedSideQuest(s)?.id === u.id
              ? "Current side quest"
              : "Side quest"}{" "}
            · {u.progress} / {c.quest} progress
          </span>
        </div>
      )}
      {u.code === DIKE.thaurdir && !u.blanked && (
        <div className="objective-status">
          <span>
            Indestructible · {Math.max(0, combatStats!.health - u.damage)} /{" "}
            {combatStats!.health} hit points remaining
          </span>
          <span>Cannot have attachments</span>
        </div>
      )}
      {s.chetwood?.captive?.questId === u.id && (
        <div
          className="objective-status"
          aria-label="Iârion is captured beneath this quest"
        >
          <span>Iârion captured · Defeat this quest before Time runs out</span>
        </div>
      )}
      {!!s.mountGram?.captured[u.id]?.length && (
        <div
          className="objective-status"
          aria-label={`${s.mountGram.captured[u.id].length} captured cards beneath this encounter card`}
        >
          <span>
            {s.mountGram.captured[u.id].length} captured cards · Rescue them
            when this card leaves play
          </span>
        </div>
      )}
      {!!(
        s.chetwood?.hiddenHands[u.id]?.length ??
        s.encounterHiddenHands?.[u.id]?.length
      ) && (
        <div
          className="objective-status"
          aria-label={`${s.chetwood?.hiddenHands[u.id]?.length ?? s.encounterHiddenHands?.[u.id]?.length} facedown hand cards`}
        >
          <span>
            {s.chetwood?.hiddenHands[u.id]?.length ??
              s.encounterHiddenHands?.[u.id]?.length}{" "}
            facedown hand cards · Returned to their owners on defeat
          </span>
        </div>
      )}
      {c.type_code === "attachment" &&
        c.traits?.split(".").some((trait) => trait.trim() === "Trap") && (
          <div className="objective-status">
            <span>
              {u.blanked
                ? "Trap in staging · printed ability blank"
                : "Trap in staging · awaiting an eligible enemy"}
              {s.table ? ` · ${seatName(s, u.owner ?? 0)}` : ""}
            </span>
          </div>
        )}
      {!!s.stewardFear?.underneath[u.id]?.length && (
        <div
          className="objective-status"
          aria-label={`${s.stewardFear.underneath[u.id].length} facedown Underworld cards`}
        >
          <span>
            <Stack size={14} /> {s.stewardFear.underneath[u.id].length} facedown
            Underworld
          </span>
        </div>
      )}
      {s.scenarioId === "encounter-at-amon-din" &&
        (c.type_code === "location" ||
          [A.rescued, A.dead].includes(u.code)) && (
          <div
            className="objective-status"
            aria-label={`${u.code === A.dead ? u.damage : u.resources} ${u.code === A.dead ? "dead" : u.code === A.rescued ? "rescued" : "remaining"} villagers`}
          >
            <span>
              {u.code === A.dead ? u.damage : u.resources}{" "}
              {u.code === A.dead
                ? "dead villagers"
                : u.code === A.rescued
                  ? "rescued villagers"
                  : "villagers to rescue"}
            </span>
          </div>
        )}
      {c.type_code === "objective" && ![A.rescued, A.dead].includes(u.code) && (
        <div className="objective-status">
          <span>
            <Shield />
            {u.code === CELEBRIMBOR.search
              ? `${s.celebrimbor?.search.length ?? 0} cards underneath`
              : isGuarded(s, u)
                ? "Guarded"
                : s.cobas && COBAS_OBJECTIVES.includes(u.code)
                  ? "Controlled by the players"
                  : "Unguarded"}
          </span>
        </div>
      )}
      {action && (
        <button
          className="card-action"
          onClick={action}
          disabled={!!actionDisabled || !!s.flow?.pending || !!s.choice}
          title={actionDisabled ?? undefined}
        >
          {actionLabel}
          <ArrowRight size={12} />
        </button>
      )}
      {dispatch && availableAbilities(s, u).length > 0 && (
        <div className="abilities">
          {availableAbilities(s, u).map((a, i) => (
            <button
              key={a.id ?? i}
              disabled={
                a.disabled ||
                !!s.flow?.pending ||
                !!s.choice ||
                s.phase === "setup"
              }
              onClick={() =>
                dispatch({ type: "ABILITY", id: u.id, attachmentId: a.id })
              }
            >
              <Sparkle size={11} /> {a.label}
            </button>
          ))}
        </div>
      )}
    </MovingCard>
  );
}
function CharacterCard({
  s,
  u,
  inspect,
  inspectCard,
  dispatch,
}: {
  s: GameState;
  u: Unit;
  inspect: () => void;
  inspectCard: (c: Card) => void;
  dispatch: (a: Action) => unknown;
}) {
  const c = card(u.code),
    selected = s.committedIds.includes(u.id) || u.committed,
    canQuest =
      canCommit(s, u) &&
      !s.escapeTest &&
      !s.hideTest &&
      !s.sailing?.test &&
      !s.flow?.pending &&
      !s.choice &&
      (!s.table || s.table.active === s.table.turn);
  const damageRef = useDamageFeedback(u.damage);
  const computed = stats(s, u);
  return (
    <MovingCard
      id={u.id}
      className={`character-card ${isHero(u) ? "hero-card" : "ally-card"} ${u.exhausted ? "exhausted" : ""} ${selected ? "committed" : ""} ${u.attachments.length ? "has-attachments" : ""}`}
    >
      <AttachmentStack u={u} inspect={inspectCard} />
      <button
        ref={damageRef}
        className="character-art"
        aria-description={`${u.exhausted ? "Exhausted. " : "Ready. "}${u.damage} damage. ${computed.health - u.damage} hit points remaining.`}
        onClick={
          canQuest
            ? () => dispatch({ type: "TOGGLE_QUEST", id: u.id })
            : inspect
        }
        aria-pressed={canQuest ? selected : undefined}
        aria-label={
          canQuest
            ? `${selected ? "Unselect" : "Commit"} ${name(u)}`
            : `Inspect ${name(u)}`
        }
      >
        <Art c={c} />
        {selected && (
          <span
            className="quest-badge"
            title="Committed to the quest"
            aria-label="Committed to the quest"
          >
            <Feather size={16} />
          </span>
        )}
        <span className="card-table-tokens">
          {(isHero(u) ||
            u.code === CARROCK.grimbeorn ||
            ["02059", "08146"].includes(u.code)) && (
            <TableToken kind="resource" value={u.resources} />
          )}
          {u.damage > 0 && <TableToken kind="damage" value={u.damage} />}
        </span>
      </button>
      <button
        className="character-inspect"
        onClick={inspect}
        aria-label={`Read ${name(u)} card`}
        title={`Read ${name(u)} card`}
      >
        <Info size={17} />
      </button>
      <Stats s={s} u={u} computed={computed} />
      {u.cobasShipObjective && (
        <div className="engaged-owner">Captured Ship objective</div>
      )}
      {u.unconscious ? (
        <div className="engaged-owner" data-unconscious="true">
          Unconscious · Cannot quest, fight, collect resources or ready
        </div>
      ) : (
        isSacked(u) && (
          <div className="engaged-owner">
            Sacked! · Cannot quest, fight or use own ability
          </div>
        )
      )}
      {u.attachments.some((a) => a.poison) && (
        <div
          className="engaged-owner"
          data-poison={u.attachments.filter((a) => a.poison).length}
        >
          Poisoned · {u.attachments.filter((a) => a.poison).length} poison
        </div>
      )}
      <div className="abilities">
        {availableAbilities(s, u).map((a, i) => (
          <button
            key={a.id ?? i}
            disabled={
              a.disabled ||
              (s.phase === "setup" && !s.escapeTest) ||
              !!s.flow?.pending ||
              !!s.choice
            }
            onClick={() =>
              dispatch({ type: "ABILITY", id: u.id, attachmentId: a.id })
            }
          >
            <Sparkle size={11} />
            {a.label}
          </button>
        ))}
      </div>
    </MovingCard>
  );
}
