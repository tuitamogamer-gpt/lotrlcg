import { KNIFE_DARK_ENCOUNTERS, KNIFE_DARK_QUESTS } from "./knife-dark-support";
import type { ScenarioId } from "./types";
export { KNIFE_DARK_ENCOUNTERS, KNIFE_DARK_QUESTS };
export const KNIFE_DARK_ADVENTURES = [
  {
    id: "a-knife-in-the-dark" as ScenarioId,
    name: "A Knife in the Dark",
    shortName: "Knife in the Dark",
    chapter: "II",
    difficulty: 7,
    tagline: "Leave Bree, cross the Midgewater Marshes and survive Weathertop.",
    description:
      "Spies of the Enemy watch the hobbits at the Prancing Pony. Strider leads them into the wild, through the Midgewater Marshes to Weathertop, where the Ringwraiths close in at nightfall: drive off every Nazgûl to survive.",
    sets: ["A Knife in the Dark", "The Nazgûl", "Hunted", "The Ring"],
    stages: KNIFE_DARK_QUESTS.map((q) => ({
      name: q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
