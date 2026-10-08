import encounters from "../data/wastes-eriador-encounter-cards.json";
import quests from "../data/wastes-eriador-quest-cards.json";
import recipes from "../data/wastes-eriador-recipes.json";
import { CHETWOOD } from "./chetwood-support";
import { WEATHER } from "./weather-hills-support";
import type { Card, GameState, Unit } from "./types";

export const WASTES_ENCOUNTERS = encounters as Card[];
export const WASTES_QUESTS = quests as Card[];
export const WASTES_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const WASTES = {
  across: code("Across the Wastes"),
  howling: code("Howling at Night"),
  battle: code("Battle with the Pack"),
  northern: code("Northern Warg"),
  blood: code("Blood-thirsty Warg"),
  hunting: code("Hunting Pack"),
  white: code("White Warg"),
  wolf: code("Wolf of Angmar"),
  wastes: code("Eriador Wastes"),
  den: code("Warg's Den"),
  downs: code("North Downs"),
  darkness: code("Sudden Darkness"),
  predatory: code("Predatory Wolves"),
  leader: code("Pack Leader"),
  time: code("Daybreak"),
  amarthiul: code("Amarthiúl"),
  hills: CHETWOOD.hills,
  rugged: CHETWOOD.country,
  needs: CHETWOOD.needs,
  weight: CHETWOOD.weight,
  lost: CHETWOOD.wilderness,
  wind: WEATHER.wind,
  blast: WEATHER.blast,
  cold: WEATHER.cold,
  camp: WEATHER.camp,
};
export interface WastesState {
  initialized: boolean;
  setAside: Unit[];
  progressRound: number;
  progressPlaced: Record<string, number>;
}
export function validateWastes(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.wastesEriador;
  if (q === undefined) return s.scenarioId !== "wastes-of-eriador";
  const time = s.staging.filter((u) => u.code === WASTES.time);
  return (
    !!q &&
    s.scenarioId === "wastes-of-eriador" &&
    typeof q.initialized === "boolean" &&
    Array.isArray(q.setAside) &&
    q.setAside.length <= 1 &&
    q.setAside.every((u) => validUnit(u) && u.code === WASTES.leader) &&
    Number.isSafeInteger(q.progressRound) &&
    q.progressRound >= -1 &&
    q.progressRound <= s.round &&
    !!q.progressPlaced &&
    typeof q.progressPlaced === "object" &&
    !Array.isArray(q.progressPlaced) &&
    Object.entries(q.progressPlaced).every(
      ([id, n]) => id.length > 0 && Number.isSafeInteger(n) && n >= 0,
    ) &&
    [1, 2, 3].includes(s.stage) &&
    (!q.initialized ||
      (time.length === 1 &&
        validUnit(time[0]) &&
        (s.stage === 3
          ? q.setAside.length === 0 || s.stageRevealing
          : q.setAside.length === 1)))
  );
}
