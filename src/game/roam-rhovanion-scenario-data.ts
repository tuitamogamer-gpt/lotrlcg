import {
  ROAM_RHOVANION_ENCOUNTERS,
  ROAM_RHOVANION_QUESTS,
  ROAM_RHOVANION as R,
} from "./roam-rhovanion-support";
import { cachedImageSource } from "./scenario-image-source";
import type { ScenarioId } from "./types";
export { ROAM_RHOVANION_ENCOUNTERS, ROAM_RHOVANION_QUESTS };
export const ROAM_RHOVANION_ADVENTURES = [
  {
    id: "roam-across-rhovanion" as ScenarioId,
    name: "Roam Across Rhovanion",
    shortName: "Roam Across Rhovanion",
    chapter: "II",
    difficulty: 5,
    tagline: "Recover the Goblin's treasures across Wilderland.",
    description:
      "Trust Urdug's guidance, recover Tiny, the horn and Durin's Key, then survive the Goblin's betrayal.",
    sets: [
      "Roam Across Rhovanion",
      "Fell Beasts",
      "Lost in Wilderland",
      "Hills of Wilderland",
    ],
    stages: [R.task, R.rescue, R.gambit]
      .map((code) => ROAM_RHOVANION_QUESTS.find((q) => q.code === code)!)
      .map((q) => ({
        name: q.back_name ?? q.name,
        quest: q.back_quest ?? 0,
        cardCode: q.code,
        story: q.back_text ?? q.text ?? "",
        questImage: cachedImageSource(q.back_imagesrc ?? q.imagesrc),
      })),
  },
];
