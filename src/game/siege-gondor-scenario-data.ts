import {
  SIEGE_GONDOR_ENCOUNTERS,
  SIEGE_GONDOR_QUESTS,
} from "./siege-gondor-support";
import type { ScenarioId } from "./types";
export { SIEGE_GONDOR_ENCOUNTERS, SIEGE_GONDOR_QUESTS };
export const SIEGE_GONDOR_ADVENTURES = [
  {
    id: "the-siege-of-gondor" as ScenarioId,
    name: "The Siege of Gondor",
    shortName: "Siege of Gondor",
    chapter: "XIV",
    difficulty: 6,
    tagline: "Fall upon the fleet of Umbar at Pelargir and take its ships.",
    description:
      "Aragorn and the Dead come upon Pelargir, where the Corsairs' great fleet gathers to sail against Minas Tirith: the Grey Company must take three of their ships and then the great ship itself before the fleet is ready.",
    sets: ["The Siege of Gondor"],
    stages: SIEGE_GONDOR_QUESTS.map((q) => ({
      name: q.back_name ?? q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
