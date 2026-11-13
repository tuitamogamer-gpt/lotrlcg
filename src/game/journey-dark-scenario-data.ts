import {
  JOURNEY_DARK_ENCOUNTERS,
  JOURNEY_DARK_QUESTS,
} from "./journey-dark-support";
import type { ScenarioId } from "./types";
export { JOURNEY_DARK_ENCOUNTERS, JOURNEY_DARK_QUESTS };
export const JOURNEY_DARK_ADVENTURES = [
  {
    id: "journey-in-the-dark" as ScenarioId,
    name: "Journey in the Dark",
    shortName: "Journey in the Dark",
    chapter: "V",
    difficulty: 8,
    tagline: "Cross the Mines of Moria before Durin's Bane awakens.",
    description:
      "The Company of the Ring passes through the long dark of Moria. Orcs and trolls hunt them through the halls, the drums sound from the deep, and the Balrog waits at the Bridge of Khazad-dûm.",
    sets: ["Journey in the Dark"],
    stages: JOURNEY_DARK_QUESTS.map((q) => ({
      name: q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
