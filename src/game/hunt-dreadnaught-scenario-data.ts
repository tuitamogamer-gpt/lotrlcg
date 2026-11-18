import { HD_ENCOUNTERS, HD_QUESTS } from "./hunt-dreadnaught-support";
import type { ScenarioId } from "./types";
export { HD_ENCOUNTERS, HD_QUESTS };
export const HUNT_DREADNAUGHT_ADVENTURES = [
  {
    id: "the-hunt-for-the-dreadnaught" as ScenarioId,
    name: "The Hunt for the Dreadnaught",
    shortName: "The Hunt for the Dreadnaught",
    chapter: "I",
    difficulty: 6,
    tagline:
      "Sail your own ship against the Corsairs of Umbar and sink their Dreadnaught before it reaches the coasts of Gondor.",
    description:
      "A fleet of Corsairs led by the mighty Dreadnaught threatens the coasts of Gondor. Each player commands one of six ships, fights off Corsair boarding parties from a separate Corsair deck, and then hunts down the Dreadnaught, which is considered engaged with every player. Choose Standard or Hard Mode (easy mode plays Easy Mode); one group of one to four players.",
    sets: ["The Hunt for the Dreadnaught"],
    stages: HD_QUESTS.map((q) => ({
      name: q.name,
      quest: 0,
      cardCode: q.code,
      story: q.back_text || q.text || "",
      questImage: q.back_imagesrc,
    })),
  },
];
