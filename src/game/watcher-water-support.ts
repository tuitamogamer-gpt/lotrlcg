// Printed definitions remain independent of the runtime encounter hooks.
import encounters from "../data/watcher-water-encounter-cards.json";
import quests from "../data/watcher-water-quest-cards.json";
import type { Card } from "./types";

export const WATCHER_WATER_ENCOUNTERS = encounters as Card[];
export const WATCHER_WATER_QUESTS = quests as Card[];
export const WATCHER_WATER = Object.fromEntries(
  [
    ["west", "To the West-door"],
    ["lake", "The Seething Lake"],
    ["waters", "Disturbed Waters"],
    ["doors", "Doors of Durin"],
    ["grasping", "Grasping Tentacle"],
    ["ill", "Ill Purpose"],
    ["passage", "Makeshift Passage"],
    ["swamp", "Perilous Swamp"],
    ["creek", "Stagnant Creek"],
    ["falls", "Stair Falls"],
    ["striking", "Striking Tentacle"],
    ["watcher", "The Watcher"],
    ["thrashing", "Thrashing Tentacle"],
    ["wrapped", "Wrapped!"],
  ].map(([key, title]) => [
    key,
    [...WATCHER_WATER_ENCOUNTERS, ...WATCHER_WATER_QUESTS].find(
      (c) => c.name === title,
    )!.code,
  ]),
) as Record<
  | "west"
  | "lake"
  | "waters"
  | "doors"
  | "grasping"
  | "ill"
  | "passage"
  | "swamp"
  | "creek"
  | "falls"
  | "striking"
  | "watcher"
  | "thrashing"
  | "wrapped",
  string
>;
