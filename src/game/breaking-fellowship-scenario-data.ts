import {
  BREAKING_FELLOWSHIP_ENCOUNTERS,
  BREAKING_FELLOWSHIP_QUESTS,
} from "./breaking-fellowship-support";
import type { ScenarioId } from "./types";
export { BREAKING_FELLOWSHIP_ENCOUNTERS, BREAKING_FELLOWSHIP_QUESTS };
export const BREAKING_FELLOWSHIP_ADVENTURES = [
  {
    id: "breaking-of-the-fellowship" as ScenarioId,
    name: "Breaking of the Fellowship",
    shortName: "Breaking of the Fellowship",
    chapter: "VI",
    difficulty: 7,
    tagline: "Search the slopes of Amon Hen for the Ring-bearer.",
    description:
      "The Company rows down the Great River past Sarn Gebir and the Argonath. At Parth Galen the Ring-bearer vanishes; each player searches the woods of Amon Hen alone while the Uruk-hai close in, until Frodo makes his choice.",
    sets: ["Breaking of the Fellowship"],
    stages: BREAKING_FELLOWSHIP_QUESTS.map((q) => ({
      name: q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
