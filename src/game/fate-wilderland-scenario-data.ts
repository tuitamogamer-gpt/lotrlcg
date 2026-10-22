import {
  FATE_WILDERLAND_ENCOUNTERS,
  FATE_WILDERLAND_QUESTS,
} from "./fate-wilderland-support";
import { cachedImageSource } from "./scenario-image-source";
import type { ScenarioId } from "./types";
export { FATE_WILDERLAND_ENCOUNTERS, FATE_WILDERLAND_QUESTS };
export const FATE_WILDERLAND_ADVENTURES = [
  {
    id: "the-fate-of-wilderland" as ScenarioId,
    name: "The Fate of Wilderland",
    shortName: "Fate of Wilderland",
    chapter: "IX",
    difficulty: 6,
    tagline: "Hold the pass against Urdug’s Goblin army.",
    description:
      "Build the heroes’ defense, withstand the Goblins’ assault, and defeat Urdug before the final push overwhelms Wilderland.",
    sets: [
      "The Fate of Wilderland",
      "Grey Mountain Goblins",
      "Gathering Gloom",
      "Hills of Wilderland",
    ],
    stages: FATE_WILDERLAND_QUESTS.map((q) => ({
      name: q.back_name ?? q.name,
      quest: 0,
      cardCode: q.code,
      story: q.back_text ?? "",
      questImage: cachedImageSource(q.back_imagesrc ?? q.imagesrc),
    })),
  },
];
