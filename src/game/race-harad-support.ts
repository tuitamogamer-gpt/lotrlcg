import encounters from "../data/race-harad-encounter-cards.json";
import quests from "../data/race-harad-quest-cards.json";
import recipes from "../data/race-harad-recipes.json";
import shared from "../data/harad-encounter-cards.json";
import type { Card, GameState, Unit } from "./types";

export const RACE_HARAD_ENCOUNTERS = encounters as Card[];
export const RACE_HARAD_QUESTS = quests as Card[];
export const RACE_HARAD_RECIPES = recipes;
const title = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const code = (name: string, side?: string) => [...encounters, ...quests, ...shared].find((c) => title(c.name) === title(name) && (!side || ("side" in c && c.side === side)))!.code;
export const RACE_HARAD = {
  settingOut: code("Setting Out", "A"), racingNorth: code("Racing North", "A"), hunted: code("Hunted in Harad", "A"), ford: code("The Ford of Harnen", "A"),
  settingOutEnemy: code("Setting Out", "C"), racingNorthEnemy: code("Racing North", "C"), huntedEnemy: code("Hunted in Harad", "C"), fordEnemy: code("The Ford of Harnen", "C"),
  chief: code("Uruk Chieftain"), tamed: code("Tamed Mûmak"), rider: code("Uruk Warg-Rider"), pursuer: code("Uruk Pursuer"), racingWarg: code("Racing Warg"),
  road: code("Harad Road"), expanse: code("Expanse of Harad"), erg: code("Blistering Erg"), river: code("River Harnen"), howling: code("Howling at their Heels"), pursuers: code("Pursuers from Mordor"),
  water: code("Find Water"), dunes: code("Towering Dunes"), oasis: code("Desert Oasis"), sandstorm: code("Sandstorm"), exhaustion: code("Heat Exhaustion"),
  uruks: code("Uruks of the Eye"), uruk: code("Uruk of Mordor"), warg: code("Mordor Warg"), fear: code("Fear of Mordor"),
};
export const RACE_HARAD_MAIN_QUESTS = [RACE_HARAD.settingOut, RACE_HARAD.racingNorth, RACE_HARAD.hunted, RACE_HARAD.ford];
export const RACE_HARAD_ENEMY_QUESTS = [RACE_HARAD.settingOutEnemy, RACE_HARAD.racingNorthEnemy, RACE_HARAD.huntedEnemy, RACE_HARAD.fordEnemy];
export interface RaceHaradState {
  initialized: boolean; advancing: boolean; currentQuest: string; questDeck: string[]; completedQuests: string[];
  setAside: Unit[]; removed: Unit[]; area: Unit[];
  enemyQuest: string; enemyQuestDeck: string[]; enemyCompletedQuests: string[]; enemyStage: number; enemyProgress: number; chieftainId: string;
  progressThisRound: number; progressLimit: number; counterRound: number;
  howling: { round: number; phase: GameState["phase"]; value: number; enemyBonus: number }[];
}
export const raceHaradAreaUnits = (s: GameState) => [...(s.raceHarad?.area ?? []), ...s.staging.filter((u) => u.raceHaradArea)];
export function raceHaradStageInfo(s: GameState) {
  const c = RACE_HARAD_QUESTS.find((c) => c.code === s.raceHarad?.currentQuest);
  return c ? { name: c.back_name ?? c.name, cardCode: c.code, quest: c.back_quest ?? 0, story: c.back_text ?? "", questImage: c.back_imagesrc ?? c.imagesrc } : undefined;
}
export function validateRaceHarad(s: GameState, validUnit: (u: unknown) => boolean) {
  const q = s.raceHarad;
  if (q === undefined) return s.scenarioId !== "race-across-harad";
  if (!q || s.scenarioId !== "race-across-harad" || ![q.questDeck, q.completedQuests, q.enemyQuestDeck, q.enemyCompletedQuests, q.setAside, q.removed, q.area, q.howling].every(Array.isArray)) return false;
  const main = [...q.completedQuests, q.currentQuest, ...q.questDeck], enemy = [...q.enemyCompletedQuests, q.enemyQuest, ...q.enemyQuestDeck];
  const staged = s.staging.filter((u) => u.raceHaradArea), same = s.stage === q.enemyStage;
  const external = [...s.heroes, ...s.allies, ...s.engaged, ...s.hand, ...(s.table?.seats ?? []).filter((_, i) => i !== s.table!.active).flatMap((p) => [...p.heroes, ...p.allies, ...p.engaged, ...p.hand]), ...(s.activeLocation ? [s.activeLocation] : []), ...(s.extraActiveLocations ?? [])];
  const physical = [...q.area, ...q.setAside, ...q.removed, ...s.staging, ...external];
  return typeof q.initialized === "boolean" && typeof q.advancing === "boolean" &&
    Number.isInteger(s.stage) && s.stage >= 1 && s.stage <= 4 && q.currentQuest === RACE_HARAD_MAIN_QUESTS[s.stage - 1] && main.length === 4 && main.every((c, i) => c === RACE_HARAD_MAIN_QUESTS[i]) &&
    Number.isInteger(q.enemyStage) && q.enemyStage >= 1 && q.enemyStage <= 4 && q.enemyQuest === RACE_HARAD_ENEMY_QUESTS[q.enemyStage - 1] && enemy.length === 4 && enemy.every((c, i) => c === RACE_HARAD_ENEMY_QUESTS[i]) &&
    [q.enemyProgress, q.progressThisRound, q.counterRound, q.progressLimit].every((n) => Number.isInteger(n) && n >= 0) && q.counterRound <= s.round && [0, 5, 10].includes(q.progressLimit) &&
    [...q.area, ...q.setAside, ...q.removed].every(validUnit) && q.area.every((u) => ["enemy", "location"].includes([...RACE_HARAD_ENCOUNTERS, ...shared].find((c) => c.code === u.code)?.type_code ?? "")) &&
    q.setAside.every((u) => [RACE_HARAD.tamed, RACE_HARAD.rider, RACE_HARAD.river].includes(u.code)) && q.removed.every((u) => u.code === RACE_HARAD.tamed) &&
    new Set(physical.map((u) => u.id)).size === physical.length && !external.some((u) => u.raceHaradArea) && (same ? !q.area.length : !staged.length) &&
    typeof q.chieftainId === "string" && q.howling.every((h) => h && Number.isInteger(h.round) && h.round >= 0 && h.round <= s.round && typeof h.phase === "string" && [h.value, h.enemyBonus].every((n) => Number.isInteger(n) && n >= 0));
}
