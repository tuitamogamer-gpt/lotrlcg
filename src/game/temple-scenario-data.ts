import encounters from "../data/temple-encounter-cards.json";
import quests from "../data/temple-quest-cards.json";
import { cachedImageSource } from "./scenario-image-source";
import type { Card, ScenarioId } from "./types";

export const TEMPLE_ENCOUNTERS = encounters as Card[];
export const TEMPLE_QUESTS = quests as Card[];
export const TEMPLE_ADVENTURES = [
  {
    id: "temple-of-the-deceived" as ScenarioId,
    name: "Temple of the Deceived",
    shortName: "Temple of the Deceived",
    chapter: "VI",
    difficulty: 4,
    tagline: "Explore a lost island and find the hidden grotto.",
    description:
      "Chart the island's paths, recover the Gate Key and discover the entrance hidden within the temple.",
    sets: [
      ...new Set(
        TEMPLE_ENCOUNTERS.map((c) => c.encounter_set).filter(
          (name): name is string => typeof name === "string",
        ),
      ),
    ],
    stages: TEMPLE_QUESTS.map((c) => ({
      name: c.back_name ?? c.name,
      quest: c.back_quest ?? 0,
      cardCode: c.code,
      story: c.back_text ?? "",
      questImage: cachedImageSource(c.back_imagesrc ?? c.imagesrc),
    })),
  },
];
