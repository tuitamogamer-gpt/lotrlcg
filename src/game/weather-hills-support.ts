import encounters from "../data/weather-hills-encounter-cards.json";
import quests from "../data/weather-hills-quest-cards.json";
import recipes from "../data/weather-hills-recipes.json";
import { CHETWOOD } from "./chetwood-support";
import type { Card, GameState, Unit } from "./types";

export const WEATHER_ENCOUNTERS = encounters as Card[];
export const WEATHER_QUESTS = quests as Card[];
export const WEATHER_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const WEATHER = {
  cornered: code("Cornered Orc"),
  search: code("Search the Ruins"),
  shelter: code("Find Shelter"),
  mission: code("Hunting the Orcs"),
  ridge: code("Exposed Ridge"),
  ice: code("Ice Storm"),
  camp: code("Make Camp"),
  ruins: code("Ruins of Arnor"),
  valley: code("Sheltered Valley"),
  hilltop: code("Weathered Hilltop"),
  wind: code("Biting Wind"),
  orcCamp: code("Concealed Orc-camp"),
  scattered: code("Scattered Among the Hills"),
  animals: code("Cornered Animals"),
  cold: code("Cold from Angmar"),
  blast: code("Freezing Blast"),
  forn: code("Amon Forn"),
  discovery: code("Tragic Discovery"),
  causeway: code("Ancient Causeway"),
};
export const WEATHER_ORC_CODES = [
  ...new Set(
    recipes.flatMap((r) =>
      r.cards
        .filter((c) => c.section === "sharedEncounterDeck2")
        .map((c) => c.code),
    ),
  ),
];
export const weatherSideTime = (code: string) =>
  code === WEATHER.shelter ? 4 : 0;

export interface WeatherState {
  initialized: boolean;
  orcDeck: string[];
  setAside: Unit[];
  weatherSurgeRound: number;
  advancing?: boolean;
}
export function validateWeather(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.weatherHills;
  if (q === undefined) return s.scenarioId !== "the-weather-hills";
  const missions = s.staging.filter((u) => u.code === WEATHER.mission);
  return (
    !!q &&
    s.scenarioId === "the-weather-hills" &&
    typeof q.initialized === "boolean" &&
    Array.isArray(q.orcDeck) &&
    q.orcDeck.every((c) => WEATHER_ORC_CODES.includes(c)) &&
    Array.isArray(q.setAside) &&
    q.setAside.every(
      (u) => validUnit(u) && [CHETWOOD.ambush, WEATHER.forn].includes(u.code),
    ) &&
    new Set(q.setAside.map((u) => u.code)).size === q.setAside.length &&
    Number.isSafeInteger(q.weatherSurgeRound) &&
    q.weatherSurgeRound >= 0 &&
    (q.advancing === undefined || typeof q.advancing === "boolean") &&
    [1, 2].includes(s.stage) &&
    (!q.initialized ||
      (missions.length === 1 &&
        validUnit(missions[0]) &&
        (s.stage === 1
          ? !missions[0].flipped || q.advancing === true
          : missions[0].flipped === true &&
            (q.orcDeck.length === 0 || q.advancing === true))))
  );
}
