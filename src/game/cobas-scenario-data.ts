import encounters from "../data/cobas-encounter-cards.json";
import quests from "../data/cobas-quest-cards.json";
import { cachedImageSource } from "./scenario-image-source";
import type { Card, ScenarioId } from "./types";
export const COBAS_ENCOUNTERS = encounters as Card[];
export const COBAS_QUESTS = quests as Card[];
export const COBAS_ADVENTURES = [
  {
    id: "a-storm-on-cobas-haven" as ScenarioId,
    name: "A Storm on Cobas Haven",
    shortName: "Cobas Haven",
    chapter: "VIII",
    difficulty: 7,
    tagline:
      "Break through the Corsair fleet and rally the defenses of Dol Amroth.",
    description:
      "Sail into battle, liberate the coastal towers and break the Raider Flagship's blockade.",
    sets: [
      "A Storm on Cobas Haven",
      "Voyage Across Belegaer",
      "Umbar Fleet",
      "Corsair Pirates",
      "Corsair Raiders",
      "The Dream-chaser's Fleet",
    ],
    stages: quests
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
