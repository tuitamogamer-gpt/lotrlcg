import {
  DANGER_DORWINION_ENCOUNTERS,
  DANGER_DORWINION_QUESTS,
} from "./danger-dorwinion-support";
import { cachedImageSource } from "./scenario-image-source";
import type { ScenarioId } from "./types";
export { DANGER_DORWINION_ENCOUNTERS, DANGER_DORWINION_QUESTS };
export const DANGER_DORWINION_ADVENTURES = [
  {
    id: "danger-in-dorwinion" as ScenarioId,
    name: "Danger in Dorwinion",
    shortName: "Dorwinion",
    chapter: "II",
    difficulty: 5,
    tagline: "Uncover the cult hiding in Dorwinion.",
    description:
      "Explore the silent city, uncover evidence of a sinister plot, and confront the hidden leader of the cult.",
    sets: [
      "Danger in Dorwinion",
      "Servants of Sauron",
      "City of Rhun",
      "Under Guard",
    ],
    stages: DANGER_DORWINION_QUESTS.map((q) => ({
      name: q.back_name ?? q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text ?? "",
      questImage: cachedImageSource(q.back_imagesrc ?? q.imagesrc),
    })),
  },
];
