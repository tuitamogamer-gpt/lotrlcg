import {
  WITHERED_HEATH_ENCOUNTERS,
  WITHERED_HEATH_QUESTS,
  WITHERED_HEATH_MAIN_QUESTS,
} from "./withered-heath-support";
import { cachedImageSource } from "./scenario-image-source";
import type { ScenarioId } from "./types";
export { WITHERED_HEATH_ENCOUNTERS, WITHERED_HEATH_QUESTS };
export const WITHERED_HEATH_ADVENTURES = [
  {
    id: "the-withered-heath" as ScenarioId,
    name: "The Withered Heath",
    shortName: "The Withered Heath",
    chapter: "IV",
    difficulty: 6,
    tagline: "Track a Cold-Drake through the caves of the Grey Mountains.",
    description:
      "Follow Dragon Sign into the Lost Caves, survive the Cold-Drake's ambush and corner the wounded beast.",
    sets: [
      "The Withered Heath",
      "Lost Caves",
      "Wild Creatures",
      "Lost in Wilderland",
    ],
    stages: WITHERED_HEATH_MAIN_QUESTS.map((code) =>
      WITHERED_HEATH_QUESTS.find((c) => c.code === code)!,
    ).map((q) => ({
      name: q.back_name ?? q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text ?? q.text ?? "",
      questImage: cachedImageSource(q.back_imagesrc ?? q.imagesrc),
    })),
  },
];
