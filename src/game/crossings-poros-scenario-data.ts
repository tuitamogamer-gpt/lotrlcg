import {
  CROSSINGS_POROS_ENCOUNTERS,
  CROSSINGS_POROS_QUESTS,
} from "./crossings-poros-support";
import { cachedImageSource } from "./scenario-image-source";
import type { ScenarioId } from "./types";
export { CROSSINGS_POROS_ENCOUNTERS, CROSSINGS_POROS_QUESTS };
export const CROSSINGS_POROS_ADVENTURES = [
  {
    id: "the-crossings-of-poros" as ScenarioId,
    name: "The Crossings of Poros",
    shortName: "Crossings of Poros",
    chapter: "VIII",
    difficulty: 5,
    tagline: "Lead the refugees across the Poros and into Gondor.",
    description:
      "Choose a dangerous route through Harad, evade the three pursuing forces, and hold the crossings with the Gondorian garrison.",
    sets: [
      "Crossings of Poros",
      "Mountains of Shadow",
      "Desert Sands",
      "Desert Creatures",
      "Harad Soldiers",
      "Mordor Orcs",
    ],
    stages: CROSSINGS_POROS_QUESTS.map((q) => ({
      name: q.back_name ?? q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text ?? q.text ?? "",
      questImage: cachedImageSource(q.back_imagesrc ?? q.imagesrc),
    })),
  },
];
