import {
  CROSS_ROADS_ENCOUNTERS,
  CROSS_ROADS_QUESTS,
} from "./cross-roads-support";
import type { ScenarioId } from "./types";
export { CROSS_ROADS_ENCOUNTERS, CROSS_ROADS_QUESTS };
export const CROSS_ROADS_ADVENTURES = [
  {
    id: "journey-to-the-cross-roads" as ScenarioId,
    name: "Journey to the Cross-roads",
    shortName: "Journey to the Cross-roads",
    chapter: "XI",
    difficulty: 8,
    tagline: "Ambush the Men of Harad on the road to the Cross-roads.",
    description:
      "In Ithilien the hobbits fall in with Faramir's rangers, who lie in wait for the Men of Harad marching to the Black Gate. The players must ambush the companies that come up the road before too many of them reach Mordor, then travel to the Cross-roads.",
    sets: ["Journey to the Cross-roads", "Men of Harad"],
    stages: CROSS_ROADS_QUESTS.map((q) => ({
      name: q.back_name ?? q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
