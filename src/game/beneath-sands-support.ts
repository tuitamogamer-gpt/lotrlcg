import encounters from "../data/beneath-sands-encounter-cards.json";
import quests from "../data/beneath-sands-quest-cards.json";
import recipes from "../data/beneath-sands-recipes.json";
import shared from "../data/harad-encounter-cards.json";
import type { Card, GameState, Unit } from "./types";

export const BENEATH_SANDS_ENCOUNTERS = encounters as Card[];
export const BENEATH_SANDS_QUESTS = quests as Card[];
export const BENEATH_SANDS_RECIPES = recipes;
const code = (name: string) => [...encounters, ...quests, ...shared].find((c) => c.name === name)!.code;
export const BENEATH_SANDS = {
  caves: code("Searching the Caves"), closer: code("Getting Closer"), hive: "octgn:8351cce0-b16e-4eba-93f2-24015bbc54c1",
  search: code("On Track"), broodMother: code("Brood Mother"), guardian: code("Hive Guardian"), broodling: code("Spider Broodling"),
  burrow: code("Spider Burrow"), tunnel: code("Pitch Black Tunnel"), nest: code("Nest of Vermin"), cavern: code("Cobwebbed Cavern"), passage: code("Blocked Passage"),
  forcedOff: code("Forced Off Track"), grabbed: code("Grabbed by Spiders"), lostUnderground: code("Lost Underground"),
  hostile: code("In Enemy Territory"), injured: code("Injured Companion"), enfeebled: code("Enfeebled"), remedy: code("Craft Remedy"), viper: code("Sand Viper"), scorpion: code("Giant Scorpion"),
};
export const BENEATH_SANDS_MAIN_QUESTS = [BENEATH_SANDS.caves, BENEATH_SANDS.closer, BENEATH_SANDS.hive];
export interface BeneathSandsState {
  initialized: boolean;
  advancing: boolean;
  currentQuest: string;
  questDeck: string[];
  completedQuests: string[];
  /** The unique physical boss, while outside play. */
  setAside: Unit[];
  /** The physical Search objective is in the staging area. */
  searchId: string;
  onTrack: boolean;
  /** Top cards temporarily held by the On Track search, including pending choice. */
  resolving: string[];
  poisoned: { id: string; round: number }[];
  ignoreSearch?: { round: number; phase: GameState["phase"] };
}
export const beneathSandsSearch = (s: GameState) => s.staging.find((u) => u.id === s.beneathSands?.searchId);
export const beneathSandsOnTrack = (s: GameState) => !!s.beneathSands?.onTrack;
export const beneathSandsTrackValue = (code: string) => Number((BENEATH_SANDS_ENCOUNTERS.find((c) => c.code === code)?.text ?? "").match(/Track (\d+)/)?.[1] ?? 0);
export const beneathSandsHasTrackSign = (code: string) => !!(BENEATH_SANDS_ENCOUNTERS.find((c) => c.code === code) as Card & { on_track?: boolean } | undefined)?.on_track;
export function beneathSandsStageInfo(s: GameState) {
  const q = BENEATH_SANDS_QUESTS.find((q) => q.code === s.beneathSands?.currentQuest);
  return q ? { name: q.back_name ?? q.name, cardCode: q.code, quest: q.back_quest ?? 0, story: q.back_text ?? "", questImage: q.back_imagesrc ?? q.imagesrc } : undefined;
}

export function validateBeneathSands(s: GameState, validUnit: (u: unknown) => boolean) {
  const q = s.beneathSands;
  if (q === undefined) return s.scenarioId !== "beneath-the-sands";
  if (!q || s.scenarioId !== "beneath-the-sands" ||
    ![q.questDeck, q.completedQuests, q.setAside, q.resolving, q.poisoned].every(Array.isArray)) return false;
  const chain = [...q.completedQuests, q.currentQuest, ...q.questDeck];
  const external = [...s.heroes, ...s.allies, ...s.engaged, ...s.hand,
    ...(s.table?.seats ?? []).filter((_, i) => i !== s.table!.active)
      .flatMap((p) => [...p.heroes, ...p.allies, ...p.engaged, ...p.hand]),
    ...s.staging, ...(s.activeLocation ? [s.activeLocation] : []), ...(s.extraActiveLocations ?? [])];
  const physical = [...external, ...q.setAside];
  const search = s.staging.filter((u) => u.id === q.searchId);
  const marker = (value: { id: string; round: number }) => value && typeof value.id === "string" &&
    Number.isInteger(value.round) && value.round >= 0 && value.round <= s.round;
  const encounterCodes = new Set([...BENEATH_SANDS_ENCOUNTERS, ...shared].map((c) => c.code));
  const phases = ["setup", "resource", "planning", "quest", "staging", "travel", "encounter", "defense", "attack", "refresh"];
  return typeof q.initialized === "boolean" && typeof q.advancing === "boolean" &&
    Number.isInteger(s.stage) && s.stage >= 1 && s.stage <= 3 &&
    q.currentQuest === BENEATH_SANDS_MAIN_QUESTS[s.stage - 1] &&
    chain.length === 3 && chain.every((c, i) => c === BENEATH_SANDS_MAIN_QUESTS[i]) &&
    q.setAside.every(validUnit) && q.setAside.length <= 1 && q.setAside.every((u) => u.code === BENEATH_SANDS.broodMother) &&
    new Set(physical.map((u) => u.id)).size === physical.length &&
    typeof q.searchId === "string" && search.length === 1 && search[0].code === BENEATH_SANDS.search &&
    typeof q.onTrack === "boolean" && search[0].flipped === !q.onTrack &&
    q.resolving.length <= 3 && q.resolving.every((c) => typeof c === "string" && encounterCodes.has(c)) &&
    q.poisoned.every(marker) && new Set(q.poisoned.map((p) => p.id)).size === q.poisoned.length &&
    (q.ignoreSearch === undefined || (q.ignoreSearch && Number.isInteger(q.ignoreSearch.round) &&
      q.ignoreSearch.round >= 0 && q.ignoreSearch.round <= s.round && phases.includes(q.ignoreSearch.phase)));
}
