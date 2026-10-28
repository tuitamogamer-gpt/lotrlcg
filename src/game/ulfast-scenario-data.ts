import { ULFAST_ENCOUNTERS, ULFAST_QUESTS } from "./ulfast-support";
import type { ScenarioId } from "./types";
export { ULFAST_ENCOUNTERS, ULFAST_QUESTS };
export const ULFAST_ADVENTURES = [
  {
    id: "the-city-of-ulfast" as ScenarioId,
    name: "The City of Ulfast",
    shortName: "Ulfast",
    chapter: "V",
    difficulty: 6,
    tagline: "Slip through the city under the watch of the King's guard.",
    description:
      "Search for Ulchor, manage your threat and confront the City Guard before the streets close around you.",
    sets: ["The City of Ulfast", "Servants of Sauron", "Under Guard"],
    stages: ULFAST_QUESTS.map((q) => ({
      name: q.name,
      quest: q.back_quest!,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
