// Printed encounter definitions are independent of the runtime dependency graph.
import encounters from "../data/shadow-flame-encounter-cards.json";
import quests from "../data/shadow-flame-quest-cards.json";
import type { Card } from "./types";
export const SHADOW_FLAME_ENCOUNTERS = encounters as Card[];
export const SHADOW_FLAME_QUESTS = quests as Card[];
const titles = {
  counter: "Counter-Spell",
  pit: "Dark Pit",
  bane: "Durin's Bane",
  sword: "Fiery Sword",
  fires: "Fires in the Deep",
  flame: "Inner Flame",
  shadow: "Inner Shadow",
  lord: "Last Lord of Moria",
  leaping: "Leaping Flame",
  whip: "Many Thonged Whip",
  gate: "Nearing the Gate",
  ranging: "Ranging Goblin",
  deep: "Second Deep",
  hall: "Second Hall",
  rear: "The Rear Guard",
  lash: "Whip Lash",
};
export const SHADOW_FLAME = Object.fromEntries(
  Object.entries(titles).map(([key, title]) => [
    key,
    [...SHADOW_FLAME_ENCOUNTERS, ...SHADOW_FLAME_QUESTS].find(
      (c) => c.name === title,
    )!.code,
  ]),
) as Record<keyof typeof titles, string>;
