import encounters from "../data/voyage-belegaer-encounter-cards.json";
import quests from "../data/voyage-belegaer-quest-cards.json";
import recipes from "../data/voyage-belegaer-recipes.json";
import nightmareCards from "../data/nightmare-encounter-cards.json";
import type { Card, GameState, Unit } from "./types";
import { DC, isFleetShip } from "./dreamchaser-campaign-support";

export const VOYAGE_ENCOUNTERS = encounters as Card[];
export const VOYAGE_QUESTS = quests as Card[];
export const VOYAGE_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const VOYAGE = {
  departure: code("Departure from the Havens"),
  storm: code("Into the Storm"),
  mists: code("Cursed Mists"),
  divination: code("Calphon's Divination"),
  guidance: code("The Star's Guidance"),
  pursuit: code("Corsair Pursuit"),
  dream: code("Dream-chaser"),
  narelenya: code("Nárelenya"),
  dawn: code("Dawn Star"),
  silver: code("Silver Wing"),
  heading: code("Heading"),
  scout: code("Scouting Ship"),
  cruiser: code("Light Cruiser"),
  warship: code("Corsair Warship"),
  sailor: code("Southron Sailor"),
  pirate: code("Cunning Pirate"),
  marauder: code("Vicious Marauder"),
  captain: code("Umbar Captain"),
  calm: code("Calm Waters"),
  rough: code("Rough Waters"),
  waterspout: code("Waterspout"),
  starlit: code("Starlit Sea"),
  rolling: code("Rolling Seas"),
  fog: code("Fog Bank"),
  thrown: code("Thrown Off Course"),
  winds: code("Winds of Wrath"),
  sudden: code("Sudden Storms"),
  boarding: code("Boarding Party"),
};
export const VOYAGE_SHIPS = [
  VOYAGE.dream,
  VOYAGE.narelenya,
  VOYAGE.dawn,
  VOYAGE.silver,
];
export const VOYAGE_STAGE_TWO = [
  VOYAGE.storm,
  VOYAGE.mists,
  VOYAGE.divination,
  VOYAGE.guidance,
];
export const VOYAGE_CORSAIRS = [
  VOYAGE.sailor,
  VOYAGE.pirate,
  VOYAGE.marauder,
  VOYAGE.captain,
];
/** The Nightmare Deck's stage 2 quest cards: Corsair Confrontation and Lost at Sea (docs/NIGHTMARE.md). */
export const VOYAGE_NIGHTMARE_STAGE_TWO = [
  "octgn:2e5c938b-9b70-4d8b-b632-479fedda84de",
  "octgn:5583464f-f2e7-44cc-9d8f-87ea065b7e08",
];
/** The Nightmare Deck's Corsair: Brash Corsair joins the Corsair deck. */
export const VOYAGE_NIGHTMARE_CORSAIRS = [
  "octgn:5212a036-a6f3-4979-a4cf-6f4a221bdf36",
];
const VOYAGE_NIGHTMARE_QUESTS = (nightmareCards as Card[]).filter((c) =>
  VOYAGE_NIGHTMARE_STAGE_TWO.includes(c.code),
);
/** The quest cards of a game: the Nightmare Deck adds two stage 2 cards. */
export const voyageQuests = (s: GameState) =>
  s.nightmareMode
    ? [...VOYAGE_QUESTS, ...VOYAGE_NIGHTMARE_QUESTS]
    : VOYAGE_QUESTS;
export interface VoyageState {
  initialized: boolean;
  currentQuest: string;
  /** Randomized physical quest order is private until the printed look effect. */
  questDeck: string[];
  completedQuests: string[];
  setAside: Unit[];
  corsairDeck: string[];
  corsairDiscard: string[];
  advancing: boolean;
}
type State = GameState & { voyageBelegaer?: VoyageState };
export const voyageState = (s: GameState) => (s as State).voyageBelegaer;
export const voyageCurrentQuest = (s: GameState) =>
  voyageState(s)?.currentQuest;
export function voyageStageInfo(s: GameState) {
  const c = voyageQuests(s).find((c) => c.code === voyageCurrentQuest(s));
  return c
    ? {
        name: c.back_name ?? c.name,
        cardCode: c.code,
        quest: c.back_quest ?? 0,
        story: c.back_text ?? "",
        questImage: c.back_imagesrc ?? c.imagesrc,
      }
    : undefined;
}
export function validateVoyage(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = voyageState(s);
  if (q === undefined) return s.scenarioId !== "voyage-across-belegaer";
  if (!q || s.scenarioId !== "voyage-across-belegaer") return false;
  if (!Array.isArray(q.questDeck) || !Array.isArray(q.completedQuests))
    return false;
  const all = [q.currentQuest, ...q.questDeck, ...q.completedQuests];
  const quests = voyageQuests(s);
  const stageTwo = s.nightmareMode
    ? [...VOYAGE_STAGE_TWO, ...VOYAGE_NIGHTMARE_STAGE_TWO]
    : VOYAGE_STAGE_TWO;
  const corsairs = s.nightmareMode
    ? [...VOYAGE_CORSAIRS, ...VOYAGE_NIGHTMARE_CORSAIRS]
    : VOYAGE_CORSAIRS;
  return (
    typeof q.initialized === "boolean" &&
    typeof q.advancing === "boolean" &&
    [1, 2, 3].includes(s.stage) &&
    quests.some((c) => c.code === q.currentQuest) &&
    Array.isArray(q.questDeck) &&
    Array.isArray(q.completedQuests) &&
    all.length === quests.length &&
    new Set(all).size === all.length &&
    all.every((c) => quests.some((def) => def.code === c)) &&
    (s.stage === 1
      ? q.currentQuest === VOYAGE.departure
      : s.stage === 2
        ? stageTwo.includes(q.currentQuest)
        : q.currentQuest === VOYAGE.pursuit) &&
    Array.isArray(q.setAside) &&
    q.setAside.every((u) => validUnit(u) && isFleetShip(u.code)) &&
    new Set(q.setAside.map((u) => u.code)).size === q.setAside.length &&
    Array.isArray(q.corsairDeck) &&
    q.corsairDeck.every((c) => corsairs.includes(c) || c === DC.crowley) &&
    Array.isArray(q.corsairDiscard) &&
    q.corsairDiscard.every((c) => corsairs.includes(c) || c === DC.crowley)
  );
}
