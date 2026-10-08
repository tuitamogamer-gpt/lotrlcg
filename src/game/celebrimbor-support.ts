import encounters from "../data/celebrimbor-encounter-cards.json";
import quests from "../data/celebrimbor-quest-cards.json";
import recipes from "../data/celebrimbor-recipes.json";
import type { Card, GameState, Unit } from "./types";
export const CELEBRIMBOR_ENCOUNTERS = encounters as Card[],
  CELEBRIMBOR_QUESTS = quests as Card[],
  CELEBRIMBOR_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const CELEBRIMBOR = {
  ruins: code("The Ruins of Ost-in-Edhil"),
  servant: code("The Enemy's Servant"),
  bellach: code("Bellach"),
  search: code("The Orcs' Search"),
  chamber: code("The Secret Chamber"),
  mould: code("Celebrimbor's Mould"),
  scout: code("Bellach's Scout"),
  prowler: code("Prowling Orc"),
  plaza: code("Ruined Plaza"),
  tower: code("Collapsed Tower"),
  foundation: code("Ancient Foundation"),
  remains: code("City Remains"),
  discovered: code("Discovered!"),
  desecrated: code("Desecrated Ruins"),
  spies: code("Spies from Mordor"),
};
export const CELEBRIMBOR_LOCATIONS = [
  CELEBRIMBOR.plaza,
  CELEBRIMBOR.tower,
  CELEBRIMBOR.foundation,
  CELEBRIMBOR.remains,
];
export const CELEBRIMBOR_SCOUR = [
  CELEBRIMBOR.bellach,
  CELEBRIMBOR.scout,
  CELEBRIMBOR.prowler,
  CELEBRIMBOR.tower,
  CELEBRIMBOR.foundation,
];
export interface CelebrimborState {
  initialized: boolean;
  time: number;
  search: Unit[];
  setupLocations: string[];
  stagingLocations: string[];
  advancing?: boolean;
  spiesExhausted?: number;
}
export const celebrimborProtected = (s: GameState, u: Unit) =>
  !!s.celebrimbor &&
  u.code === CELEBRIMBOR.bellach &&
  !s.stageRevealing &&
  (s.stage === 1 || s.progress < 12);
export function validateCelebrimbor(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.celebrimbor;
  if (q === undefined) return s.scenarioId !== "celebrimbors-secret";
  return (
    !!q &&
    s.scenarioId === "celebrimbors-secret" &&
    typeof q.initialized === "boolean" &&
    Number.isInteger(q.time) &&
    q.time >= 0 &&
    (q.advancing === undefined || typeof q.advancing === "boolean") &&
    (q.spiesExhausted === undefined ||
      (Number.isInteger(q.spiesExhausted) && q.spiesExhausted >= 0)) &&
    Array.isArray(q.search) &&
    q.search.every(
      (u) =>
        validUnit(u) &&
        u.attachments.length === 0 &&
        u.damage === 0 &&
        u.progress === 0 &&
        u.resources === 0 &&
        u.shadows.length === 0,
    ) &&
    Array.isArray(q.setupLocations) &&
    q.setupLocations.every((c) => CELEBRIMBOR_LOCATIONS.includes(c)) &&
    new Set(q.setupLocations).size === q.setupLocations.length &&
    Array.isArray(q.stagingLocations) &&
    q.stagingLocations.every((id) => typeof id === "string") &&
    new Set(q.stagingLocations).size === q.stagingLocations.length
  );
}
