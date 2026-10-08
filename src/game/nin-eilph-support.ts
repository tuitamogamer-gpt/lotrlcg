import encounters from "../data/nin-eilph-encounter-cards.json";
import quests from "../data/nin-eilph-quest-cards.json";
import recipes from "../data/nin-eilph-recipes.json";
import type { Card, GameState, Unit } from "./types";
export const NIN_ENCOUNTERS = encounters as Card[],
  NIN_QUESTS = quests as Card[],
  NIN_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find(
    (c) => c.name === name || ("back_name" in c && c.back_name === name),
  )!.code;
export const NIN = {
  fleeing: code("Fleeing from Tharbad"),
  forgotten: code("A Forgotten Land"),
  noEnd: code("No End in Sight"),
  weary: code("A Weary Passage"),
  treacherous: code("A Treacherous Swamp"),
  creatures: code("Creatures of a Forgotten Age"),
  impassable: code("Impassable Marshland"),
  out: code("Out of the Swamp"),
  nalir: code("Nalir"),
  dweller: code("Ancient Marsh-dweller"),
  adder: code("Giant Swamp Adder"),
  neeker: code("Neekerbreekers"),
  eyot: code("Hidden Eyot"),
  bog: code("Sinking Bog"),
  reeds: code("Fen of Reeds"),
  finger: code("Finger of Glanduin"),
  remnants: code("Remnants of Elder Days"),
  shifting: code("Shifting Marshland"),
};
export const NIN_STAGE_TWO = [NIN.noEnd, NIN.weary, NIN.forgotten],
  NIN_STAGE_THREE = [NIN.impassable, NIN.treacherous, NIN.creatures];
export const NIN_LOCATIONS = [NIN.reeds, NIN.finger, NIN.eyot, NIN.bog];
export interface NinState {
  initialized: boolean;
  activeQuest: string;
  time: number;
  setAside: Unit[];
  setupLocations: string[];
  advancing?: boolean;
}
export const ninCurrentQuest = (s: GameState) => s.ninEilph?.activeQuest;
export const ninNoCardEconomy = (s: GameState) =>
  ninCurrentQuest(s) === NIN.noEnd && !s.stageRevealing;
export const ninReadyLimit = (s: GameState) =>
  ninCurrentQuest(s) === NIN.treacherous && !s.stageRevealing;
export const ninQuestName = (s: GameState) =>
  NIN_QUESTS.find((c) => c.code === ninCurrentQuest(s))?.back_name;
export function validateNin(s: GameState, validUnit: (u: unknown) => boolean) {
  const q = s.ninEilph;
  if (q === undefined) return s.scenarioId !== "the-nin-in-eilph";
  return (
    !!q &&
    s.scenarioId === "the-nin-in-eilph" &&
    typeof q.initialized === "boolean" &&
    Number.isInteger(q.time) &&
    q.time >= 0 &&
    (q.advancing === undefined || typeof q.advancing === "boolean") &&
    NIN_QUESTS.some((c) => c.code === q.activeQuest && c.cost === s.stage) &&
    Array.isArray(q.setAside) &&
    q.setAside.length <= 1 &&
    q.setAside.every((u) => validUnit(u) && u.code === NIN.dweller) &&
    Array.isArray(q.setupLocations) &&
    q.setupLocations.every((c) => NIN_LOCATIONS.includes(c)) &&
    new Set(q.setupLocations).size === q.setupLocations.length
  );
}
