import {
  PASSAGE_MARSHES_ENCOUNTERS,
  PASSAGE_MARSHES_QUESTS,
} from "./passage-marshes-support";
import type { ScenarioId } from "./types";
export { PASSAGE_MARSHES_ENCOUNTERS, PASSAGE_MARSHES_QUESTS };
export const PASSAGE_MARSHES_ADVENTURES = [
  {
    id: "the-passage-of-the-marshes" as ScenarioId,
    name: "The Passage of the Marshes",
    shortName: "Passage of the Marshes",
    chapter: "X",
    difficulty: 6,
    tagline: "Tame Sméagol and cross the Dead Marshes.",
    description:
      "Frodo and Sam have left the Fellowship, and Gollum is following them. The Ring-bearer must first tame Sméagol, then let him guide the hobbits across the Dead Marshes, where the mire swallows locations, the dead lie in the pools and the Nazgûl answer the call of the Ring.",
    sets: ["The Passage of the Marshes", "Gollum", "Morgul Nazgûl"],
    stages: PASSAGE_MARSHES_QUESTS.map((q) => ({
      name: q.back_name ?? q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
