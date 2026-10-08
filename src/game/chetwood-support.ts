import encounters from "../data/chetwood-encounter-cards.json";
import quests from "../data/chetwood-quest-cards.json";
import recipes from "../data/chetwood-recipes.json";
import type { Card, GameState, Unit } from "./types";

export const CHETWOOD_ENCOUNTERS = encounters as Card[];
export const CHETWOOD_QUESTS = quests as Card[];
export const CHETWOOD_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const CHETWOOD = {
  quest: code("Stop the War Party"),
  iarion: code("Iârion"),
  party: code("Orc War Party"),
  forest: code("Chetwood Forest"),
  borders: code("Borders of Bree-land"),
  homestead: code("Outlying Homestead"),
  assault: code("Sudden Assault"),
  speed: code("Surprising Speed"),
  rearguard: code("Orc Rearguard"),
  rescue: code("Rescue Iârion"),
  orc: code("Angmar Orc"),
  marauder: code("Angmar Marauder"),
  captain: code("Angmar Captain"),
  ambush: code("Orc Ambush"),
  country: code("Rugged Country"),
  hills: code("Shrouded Hills"),
  needs: code("Pressing Needs"),
  weight: code("Weight of Responsibility"),
  wilderness: code("Lost in the Wilderness"),
};
export const chetwoodSideTime = (code: string) =>
  code === CHETWOOD.rescue ? 4 : 0;
export interface ChetwoodState {
  initialized: boolean;
  setupLocations: string[];
  captive?: { questId: string; unit: Unit };
  hiddenHands: Record<string, Unit[]>;
  progressRound: number;
  progressPlaced: Record<string, number>;
}
export function validateChetwood(
  s: GameState,
  validUnit: (u: unknown) => boolean,
  isPlayerCard: (code: string) => boolean,
) {
  const q = s.chetwood;
  if (q === undefined) return s.scenarioId !== "intruders-in-chetwood";
  const locations = encounters
    .filter((c) => c.type_code === "location")
    .map((c) => c.code);
  const seatCount = s.table?.seats.length ?? 1;
  return (
    !!q &&
    s.scenarioId === "intruders-in-chetwood" &&
    typeof q.initialized === "boolean" &&
    Array.isArray(q.setupLocations) &&
    q.setupLocations.every((c) => locations.includes(c)) &&
    new Set(q.setupLocations).size === q.setupLocations.length &&
    Number.isSafeInteger(q.progressRound) &&
    q.progressRound >= 0 &&
    !!q.progressPlaced &&
    typeof q.progressPlaced === "object" &&
    !Array.isArray(q.progressPlaced) &&
    Object.entries(q.progressPlaced).every(
      ([id, n]) => !!id && Number.isSafeInteger(n) && n >= 0,
    ) &&
    (q.captive === undefined ||
      (!!q.captive &&
        typeof q.captive.questId === "string" &&
        validUnit(q.captive.unit) &&
        q.captive.unit.code === CHETWOOD.iarion)) &&
    !!q.hiddenHands &&
    typeof q.hiddenHands === "object" &&
    !Array.isArray(q.hiddenHands) &&
    Object.entries(q.hiddenHands).every(
      ([id, hand]) =>
        !!id &&
        Array.isArray(hand) &&
        hand.every(
          (u) =>
            validUnit(u) &&
            u.owner !== undefined &&
            Number.isInteger(u.owner) &&
            u.owner >= 0 &&
            u.owner < seatCount &&
            isPlayerCard(u.code),
        ),
    )
  );
}
