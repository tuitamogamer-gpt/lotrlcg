import {
  ROAD_ISENGARD_ENCOUNTERS,
  ROAD_ISENGARD_QUESTS,
} from "./road-isengard-support";
import type { ScenarioId } from "./types";
export { ROAD_ISENGARD_ENCOUNTERS, ROAD_ISENGARD_QUESTS };
export const ROAD_ISENGARD_ADVENTURES = [
  {
    id: "the-road-to-isengard" as ScenarioId,
    name: "The Road to Isengard",
    shortName: "Road to Isengard",
    chapter: "IX",
    difficulty: 7,
    tagline: "Rouse the Ents and break the power of Saruman.",
    description:
      "After Helm's Deep the King rides to Isengard. The players must first rouse the Ents of Fangorn, then break the Ring-wall while Saruman's machines and sorcery strike back, and at last face the Voice of Saruman, whose Staff falls on every player who draws a card.",
    sets: ["The Road to Isengard", "Snaga Orcs"],
    stages: ROAD_ISENGARD_QUESTS.map((q) => ({
      name: q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
