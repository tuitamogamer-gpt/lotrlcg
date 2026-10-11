import encounters from "../data/depths-encounter-cards.json";
import quests from "../data/depths-quest-cards.json";
import { cachedImageSource } from "./scenario-image-source";
import type { Card, ScenarioId } from "./types";
export const DEPTHS_ENCOUNTERS = encounters as Card[];
export const DEPTHS_QUESTS = quests as Card[];
export const DEPTHS_ADVENTURES = [
  {
    id: "the-thing-in-the-depths" as ScenarioId,
    name: "The Thing in the Depths",
    shortName: "The Thing in the Depths",
    chapter: "V",
    difficulty: 5,
    tagline: "Take the Stormcaller, then save it from the creature below.",
    description:
      "Subdue the Corsair captains and free the Stormcaller from the grasp of a giant sea-beast.",
    sets: [
      "The Stormcaller",
      "Corsair Raiders",
      "The Stormcaller Elite",
      "The Thing in the Depths",
    ],
    stages: [...quests]
      .sort((a, b) => Number(a.cost) - Number(b.cost))
      .map((c) => ({
        name: c.back_name ?? c.name,
        quest: c.back_quest ?? 0,
        cardCode: c.code,
        story: c.back_text ?? "",
        questImage: cachedImageSource(c.back_imagesrc ?? c.imagesrc),
      })),
  },
];
