import {
  RIVER_RUNNING_ENCOUNTERS,
  RIVER_RUNNING_QUESTS,
} from "./river-running-support";
import { cachedImageSource } from "./scenario-image-source";
import type { ScenarioId } from "./types";
export { RIVER_RUNNING_ENCOUNTERS, RIVER_RUNNING_QUESTS };
export const RIVER_RUNNING_ADVENTURES = [
  {
    id: "the-river-running" as ScenarioId,
    name: "The River Running",
    shortName: "River Running",
    chapter: "I",
    difficulty: 6,
    tagline: "Escape the Easterling riders and cross the river.",
    description:
      "Choose your pursuers, outrun the Easterling pursuit, and force a crossing before the riders overwhelm the fellowship.",
    sets: [
      "The River Running",
      "Riders of Rhûn",
      "Easterling Raiders",
      "Rolling Plains",
    ],
    stages: RIVER_RUNNING_QUESTS.map((q) => ({
      name: q.back_name ?? q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text ?? "",
      questImage: cachedImageSource(q.back_imagesrc ?? q.imagesrc),
    })),
  },
];
