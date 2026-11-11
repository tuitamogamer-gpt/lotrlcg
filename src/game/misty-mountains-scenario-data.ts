import { OMM_ENCOUNTERS, OMM_QUESTS } from "./misty-mountains-support";
import type { ScenarioId } from "./types";
export { OMM_ENCOUNTERS, OMM_QUESTS };
export const OMM_ADVENTURES = [
  {
    id: "over-the-misty-mountains-grim" as ScenarioId,
    name: "Over the Misty Mountains Grim",
    shortName: "Misty Mountains Grim",
    chapter: "II",
    difficulty: 5,
    tagline: "Cross the high pass and escape Goblin Town.",
    description:
      "Climbing the Misty Mountains, the company shelters from the warring Stone-giants, only to be dragged down into Goblin Town, where the Great Goblin must fall.",
    sets: [
      "Over the Misty Mountains Grim",
      "Western Lands",
      "The Great Goblin",
      "Misty Mountain Goblins",
    ],
    stages: OMM_QUESTS.map((q) => ({
      name: q.name,
      quest: q.back_quest ?? q.quest ?? 0,
      cardCode: q.code,
      story: q.back_text || q.text || "",
      questImage: q.back_imagesrc,
    })),
  },
];
