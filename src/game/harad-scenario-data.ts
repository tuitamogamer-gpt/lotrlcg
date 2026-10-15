import encounters from "../data/harad-encounter-cards.json";
import quests from "../data/harad-quest-cards.json";
import { cachedImageSource } from "./scenario-image-source";
import type { Card, ScenarioId } from "./types";

export const HARAD_ENCOUNTERS = encounters as Card[];
export const HARAD_QUESTS = quests as Card[];

const adventures = [
  {
    id: "escape-from-umbar",
    name: "Escape from Umbar",
    shortName: "Escape from Umbar",
    chapter: "I",
    difficulty: 5,
    tagline: "Escape the city before the Southrons seize you.",
    description:
      "Keep moving through the streets of Umbar, evade the pursuing Haradrim and fight your way out of the city.",
    sets: ["Escape from Umbar", "Harad Soldiers", "Harad Territory"],
  },
  {
    id: "desert-crossing",
    name: "Desert Crossing",
    shortName: "Desert Crossing",
    chapter: "II",
    difficulty: 6,
    tagline: "Survive the burning sands and the rising temperature.",
    description:
      "Cross the desert of Harad, seek shade and water, and overcome the Were-worms before the heat becomes fatal.",
    sets: ["Desert Crossing", "Desert Creatures", "Desert Sands"],
  },
  {
    id: "the-long-arm-of-mordor",
    name: "The Long Arm of Mordor",
    shortName: "Long Arm of Mordor",
    chapter: "III",
    difficulty: 7,
    tagline: "Help Kahliel's companions rescue the heroes from Mordor's Orcs.",
    description:
      "Take control of the Haradrim objective-heroes, recover your companions and escape the Uruk Chieftain into the jungle.",
    sets: ["The Long Arm of Mordor", "Mordor Orcs", "Jungle Forest"],
  },
];

export const HARAD_ADVENTURES = adventures.map((adventure) => ({
  ...adventure,
  id: adventure.id as ScenarioId,
  stages: quests
    .filter((card) => card.encounter_set === adventure.name)
    .sort((a, b) => Number(a.cost) - Number(b.cost))
    .map((card) => ({
      name: card.back_name ?? card.name,
      quest: card.back_quest ?? 0,
      cardCode: card.code,
      story: card.back_text ?? card.text ?? "",
      questImage: cachedImageSource(card.back_imagesrc ?? card.imagesrc),
    })),
}));
