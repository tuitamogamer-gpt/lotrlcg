import {
  SHADOW_PAST_ENCOUNTERS,
  SHADOW_PAST_QUESTS,
} from "./shadow-past-support";
import type { ScenarioId } from "./types";
export { SHADOW_PAST_ENCOUNTERS, SHADOW_PAST_QUESTS };
export const SHADOW_PAST_ADVENTURES = [
  {
    id: "a-shadow-of-the-past" as ScenarioId,
    name: "A Shadow of the Past",
    shortName: "Shadow of the Past",
    chapter: "I",
    difficulty: 6,
    tagline: "Slip past the Black Riders and reach Bucklebury Ferry.",
    description:
      "Frodo carries The One Ring out of the Shire. Black Riders hunt the hobbits along the roads and through the woods: hide from them, reach the Brandywine and cross at Bucklebury Ferry.",
    sets: ["A Shadow of the Past", "Hunted", "The Ring", "The Black Riders"],
    stages: SHADOW_PAST_QUESTS.map((q) => ({
      name: q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
