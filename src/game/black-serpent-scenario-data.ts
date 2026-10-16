import {
  BLACK_SERPENT_ENCOUNTERS,
  BLACK_SERPENT_QUESTS,
  BLACK_SERPENT_MAIN_QUESTS,
} from "./black-serpent-support";
import { cachedImageSource } from "./scenario-image-source";
import type { ScenarioId } from "./types";
export { BLACK_SERPENT_ENCOUNTERS, BLACK_SERPENT_QUESTS };
export const BLACK_SERPENT_ADVENTURES = [
  {
    id: "the-black-serpent" as ScenarioId,
    name: "The Black Serpent",
    shortName: "The Black Serpent",
    chapter: "VI",
    difficulty: 8,
    tagline: "Seize the Serpent’s caravan at the crossroads fortress.",
    description:
      "Capture three guarded Harad objectives, withstand the Serpent’s attacks and seize his disguises and summons to enter Cirith Gurat.",
    sets: ["The Black Serpent", "Harad Soldiers"],
    stages: BLACK_SERPENT_MAIN_QUESTS.map((code) =>
      BLACK_SERPENT_QUESTS.find((q) => q.code === code)!,
    ).map((q) => ({
      name: q.back_name ?? q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text ?? q.text ?? "",
      questImage: cachedImageSource(q.back_imagesrc ?? q.imagesrc),
    })),
  },
];
