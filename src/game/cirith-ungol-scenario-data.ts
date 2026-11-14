import {
  CIRITH_UNGOL_ENCOUNTERS,
  CIRITH_UNGOL_QUESTS,
} from "./cirith-ungol-support";
import type { ScenarioId } from "./types";
export { CIRITH_UNGOL_ENCOUNTERS, CIRITH_UNGOL_QUESTS };
export const CIRITH_UNGOL_ADVENTURES = [
  {
    id: "the-tower-of-cirith-ungol" as ScenarioId,
    name: "The Tower of Cirith Ungol",
    shortName: "Cirith Ungol",
    chapter: "XVI",
    difficulty: 7,
    tagline:
      "Pass the Watchers, climb the tower and bring the Ring-bearer out.",
    description:
      "Frodo lies captive at the top of the Tower of Cirith Ungol. Carrying The One Ring as the last of the Company, the players must slip past The Two Watchers, fight through the warring orcs of Shagrat and Gorbag to the Topmost Chamber, and escape past the Watchers again with the Ring-bearer.",
    sets: ["The Tower of Cirith Ungol"],
    stages: CIRITH_UNGOL_QUESTS.map((q) => ({
      name: q.back_name ?? q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
