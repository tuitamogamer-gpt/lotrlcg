// Printed Long Dark definitions do not import encounter runtime hooks.
import encounters from "../data/long-dark-encounter-cards.json";
import quests from "../data/long-dark-quest-cards.json";
import type { Card } from "./types";
export const LONG_DARK_ENCOUNTERS = encounters as Card[];
export const LONG_DARK_QUESTS = quests as Card[];
export const LONG_DARK = Object.fromEntries(
  [
    ["journey", "Journey in the Black Pit"],
    ["east", "Continuing Eastward"],
    ["mine", "Abandoned Mine"],
    ["spider", "Cave Spider"],
    ["greaves", "Durin's Greaves"],
    ["forge", "Dwarven Forge"],
    ["fatigue", "Fatigue"],
    ["air", "Foul Air"],
    ["gathering", "Gathering Ground"],
    ["sneak", "Goblin Sneak"],
    ["warlord", "Goblin Warlord"],
    ["adder", "Rock Adder"],
    ["caverns", "Silent Caverns"],
    ["twisting", "Twisting Passage"],
    ["vast", "Vast and Intricate"],
  ].map(([key, title]) => [
    key,
    [...LONG_DARK_ENCOUNTERS, ...LONG_DARK_QUESTS].find(
      (c) => c.name === title,
    )!.code,
  ]),
) as Record<
  | "journey"
  | "east"
  | "mine"
  | "spider"
  | "greaves"
  | "forge"
  | "fatigue"
  | "air"
  | "gathering"
  | "sneak"
  | "warlord"
  | "adder"
  | "caverns"
  | "twisting"
  | "vast",
  string
>;
/** PASS is a printed corner label, never a numeric victory value. */
export const LONG_DARK_PASS = encounters
  .filter((c) => c.corner_text === "PASS")
  .map((c) => c.code);
