import { LAKE_ENCOUNTERS, LAKE_QUESTS } from "./lake-town-support";
import type { ScenarioId } from "./types";
export { LAKE_ENCOUNTERS, LAKE_QUESTS };
export const LAKE_ADVENTURES = [
  {
    id: "the-battle-of-lake-town" as ScenarioId,
    name: "The Battle of Lake-town",
    shortName: "Battle of Lake-town",
    chapter: "I",
    difficulty: 9,
    tagline: "Douse the flames and bring down the dragon.",
    description:
      "Smaug descends on Esgaroth. The heroes must keep the burning town alive long enough to defeat the dragon, and save more of Lake-town than he destroys.",
    sets: ["The Battle of Lake-town"],
    stages: LAKE_QUESTS.map((q) => ({
      name: q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
