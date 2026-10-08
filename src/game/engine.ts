// Public rules API. The implementation lives in the modules below;
// this file keeps every existing import path stable.
export { playCost, isGuarded, cluesInPlay, hasClue } from "./core";
export {
  RuleError,
  characters,
  units,
  stats,
  threatOf,
  stagingThreat,
  questWill,
  stageInfo,
  locationQuest,
  engagementCost,
  canFight,
  enemyAttackPrevented,
  objectiveFree,
  resources,
} from "./core";
export { newCampaign, continueCampaign, retryAdventure } from "./campaign";
export { createGame } from "./setup";
export {
  canPlay,
  canPlayAtNoCost,
  canCommit,
  canTravel,
  optionalEngagementProblem,
  playTargets,
  needsTarget,
  responseCards,
  availableAbilities,
  applyAction,
  score,
  publicState,
} from "./actions";
export { validateSave, restoreSave } from "./save";

export {
  currentQuestCode,
  currentQuestUnit,
  currentQuestProgress,
  mainQuestCode,
  mainQuestUnit,
} from "./quest-state";
export { collectorEnemyCannotAttack } from "./collector-player-cards";
