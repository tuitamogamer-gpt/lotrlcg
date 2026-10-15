import {
  DESERT_CROSSING_ENCOUNTERS,
  DESERT_CROSSING_QUESTS,
} from "./desert-crossing-support";
import { cachedImageSource } from "./scenario-image-source";
import type { ScenarioId } from "./types";
export { DESERT_CROSSING_ENCOUNTERS, DESERT_CROSSING_QUESTS };
export const DESERT_CROSSING_ADVENTURES = [
  {
    id: "desert-crossing" as ScenarioId,
    name: "Desert Crossing",
    shortName: "Desert Crossing",
    chapter: "II",
    difficulty: 6,
    tagline: "Cross the burning sands before the temperature reaches 60.",
    description:
      "Seek shade, find water and survive the desert's creatures as the merciless heat climbs.",
    sets: ["Desert Crossing", "Desert Sands", "Desert Creatures"],
    stages: DESERT_CROSSING_QUESTS.slice()
      .sort((a, b) => Number(a.cost) - Number(b.cost))
      .map((c) => ({
        name: c.back_name ?? c.name,
        quest: c.back_quest ?? 0,
        cardCode: c.code,
        story: c.back_text ?? c.text ?? "",
        questImage: cachedImageSource(c.back_imagesrc ?? c.imagesrc),
      })),
  },
];
