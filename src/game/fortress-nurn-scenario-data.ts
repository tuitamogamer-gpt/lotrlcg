import {
  FORTRESS_NURN_ENCOUNTERS,
  FORTRESS_NURN_QUESTS,
} from "./fortress-nurn-support";
import type { ScenarioId } from "./types";
export { FORTRESS_NURN_ENCOUNTERS, FORTRESS_NURN_QUESTS };
export const FORTRESS_NURN_ADVENTURES = [
  {
    id: "the-fortress-of-nurn" as ScenarioId,
    name: "The Fortress of Nurn",
    shortName: "Fortress of Nurn",
    chapter: "IX",
    difficulty: 10,
    tagline: "Storm Dol Rhugar and bring Thane Ulchor low.",
    description:
      "Lead the freed slaves against Ulchor’s fortress: storm four unknown castle defences, reclaim the cards buried beneath them and face the Thane in his great hall.",
    sets: [
      "The Fortress of Nurn",
      "Ulchor's Guard",
      "Under Guard",
      "The Power of Mordor",
    ],
    stages: FORTRESS_NURN_QUESTS.map((q) => ({
      name: q.name,
      quest: q.back_quest ?? q.quest ?? 0,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
