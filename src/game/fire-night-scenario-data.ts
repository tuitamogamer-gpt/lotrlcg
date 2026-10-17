import { FIRE_NIGHT_ENCOUNTERS, FIRE_NIGHT_QUESTS } from "./fire-night-support";
import { cachedImageSource } from "./scenario-image-source";
import type { ScenarioId } from "./types";
export { FIRE_NIGHT_ENCOUNTERS, FIRE_NIGHT_QUESTS };
export const FIRE_NIGHT_ADVENTURES = [
  {
    id: "fire-in-the-night" as ScenarioId,
    name: "Fire in the Night",
    shortName: "Fire in the Night",
    chapter: "VI",
    difficulty: 7,
    tagline: "Defend Hrogar’s Hill against Dagnir’s fire.",
    description:
      "Protect the Woodmen town, defeat eight side quests, and drive Dagnir into the night.",
    sets: [
      "Fire in the Night",
      "Grey Mountain Goblins",
      "Dark Woods",
      "Gathering Gloom",
    ],
    stages: FIRE_NIGHT_QUESTS.map((q) => ({
      name: q.back_name ?? q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text ?? "",
      questImage: cachedImageSource(q.back_imagesrc ?? q.imagesrc),
    })),
  },
];
