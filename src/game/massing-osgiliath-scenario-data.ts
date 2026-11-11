import {
  MASSING_ENCOUNTERS,
  MASSING_QUESTS,
} from "./massing-osgiliath-support";
import type { ScenarioId } from "./types";
export { MASSING_ENCOUNTERS, MASSING_QUESTS };
export const MASSING_ADVENTURES = [
  {
    id: "the-massing-at-osgiliath" as ScenarioId,
    name: "The Massing at Osgiliath",
    shortName: "Massing at Osgiliath",
    chapter: "I",
    difficulty: 8,
    tagline: "Outrun the horde across the Anduin.",
    description:
      "Scouting Osgiliath, the heroes find an army beyond all expectation; they must slip through the ruins, cross the Anduin and race the Witch-king to Minas Tirith.",
    sets: ["The Massing at Osgiliath"],
    stages: MASSING_QUESTS.map((q) => ({
      name: q.name,
      quest: q.back_quest ?? q.quest ?? 0,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
