import encounters from "../data/stormcaller-encounter-cards.json";
import quests from "../data/stormcaller-quest-cards.json";
import { cachedImageSource } from "./scenario-image-source";
import type { Card, ScenarioId } from "./types";

export const STORMCALLER_ENCOUNTERS = encounters as Card[];
export const STORMCALLER_QUESTS = quests as Card[];

export const STORMCALLER_ADVENTURES = [
  {
    id: "flight-of-the-stormcaller" as ScenarioId,
    name: "Flight of the Stormcaller",
    shortName: "Flight of the Stormcaller",
    chapter: "IV",
    difficulty: 6,
    tagline:
      "Catch the Corsair flagship before it escapes around the Cape of Andrast.",
    description:
      "Keep your fleet on course and catch the Stormcaller as it races through its own quest stages.",
    sets: [
      "Flight of the Stormcaller",
      "The Dream-chaser's Fleet",
      "Vast Oceans",
      "Stormy Weather",
      "Corsair Pirates",
    ],
    stages: quests
      .filter((c) => c.side === "A")
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
