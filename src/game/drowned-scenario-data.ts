import encounters from "../data/drowned-encounter-cards.json";
import quests from "../data/drowned-quest-cards.json";
import { cachedImageSource } from "./scenario-image-source";
import type { Card, ScenarioId } from "./types";
export const DROWNED_ENCOUNTERS = encounters as Card[];
export const DROWNED_QUESTS = quests as Card[];
export const DROWNED_ADVENTURES = [
  {
    id: "the-drowned-ruins" as ScenarioId,
    name: "The Drowned Ruins",
    shortName: "The Drowned Ruins",
    chapter: "VII",
    difficulty: 6,
    tagline: "Dive beneath the ruins and escape the rising waters.",
    description:
      "Explore the submerged grotto, uncover the shrine, and survive Sahír's betrayal.",
    sets: [
      ...new Set(
        DROWNED_ENCOUNTERS.map((c) => c.encounter_set).filter(
          (v): v is string => !!v,
        ),
      ),
    ],
    stages: DROWNED_QUESTS.map((c) => ({
      name: c.back_name ?? c.name,
      quest: c.back_quest ?? 0,
      cardCode: c.code,
      story: c.back_text ?? "",
      questImage: cachedImageSource(c.back_imagesrc ?? c.imagesrc),
    })),
  },
];
