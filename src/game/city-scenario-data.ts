import encounters from "../data/city-encounter-cards.json";
import quests from "../data/city-quest-cards.json";
import { cachedImageSource } from "./scenario-image-source";
import type { Card, ScenarioId } from "./types";
export const CITY_ENCOUNTERS = encounters as Card[];
export const CITY_QUESTS = quests as Card[];
export const CITY_ADVENTURES = [
  {
    id: "the-city-of-corsairs" as ScenarioId,
    name: "The City of Corsairs",
    shortName: "City of Corsairs",
    chapter: "IX",
    difficulty: 8,
    tagline: "Pursue the Stormcaller and confront Captain Sahír in Umbar.",
    description:
      "Sail through the Corsair fleet, survive the fate of the Dream-chaser and end Sahír's plot in the streets of Umbar.",
    sets: [
      "The City of Corsairs",
      "Coast of Umbar",
      "Stormy Weather",
      "Umbar Fleet",
      "Voyage Across Belegaer",
      "Corsair Raiders",
      "The Dream-chaser's Fleet",
    ],
    stages: quests
      .slice()
      .sort((a, b) => Number(a.cost) - Number(b.cost))
      .map((c) => ({
        name: c.back_name ?? c.name,
        quest: c.back_quest ?? 0,
        cardCode: c.code,
        story: c.back_text ?? c.text ?? "",
        questImage: cachedImageSource(c.back_imagesrc ?? c.imagesrc),
      })),
  },
];
