import {
  LAND_SORROW_ENCOUNTERS,
  LAND_SORROW_QUESTS,
} from "./land-sorrow-support";
import type { ScenarioId } from "./types";
export { LAND_SORROW_ENCOUNTERS, LAND_SORROW_QUESTS };
export const LAND_SORROW_ADVENTURES = [
  {
    id: "the-land-of-sorrow" as ScenarioId,
    name: "The Land of Sorrow",
    shortName: "Land of Sorrow",
    chapter: "VIII",
    difficulty: 9,
    tagline: "Free Ulchor’s captives and lead their revolt.",
    description:
      "Storm three guarded slave camps in the fields of Nurn, defeat their Easterling Wardens and lead the freed captives against the returning garrison.",
    sets: ["The Land of Sorrow", "Easterling Raiders", "Rolling Plains"],
    stages: LAND_SORROW_QUESTS.map((q, i) => ({
      name: q.name,
      quest: i === 0 ? 15 : 20,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
