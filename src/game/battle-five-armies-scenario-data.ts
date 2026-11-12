import { BOFA_ENCOUNTERS, BOFA_QUESTS } from "./battle-five-armies-support";
import type { ScenarioId } from "./types";
export { BOFA_ENCOUNTERS, BOFA_QUESTS };
export const BOFA_ADVENTURES = [
  {
    id: "the-battle-of-five-armies" as ScenarioId,
    name: "The Battle of Five Armies",
    shortName: "Five Armies",
    chapter: "III",
    difficulty: 7,
    tagline: "Hold three fronts and bring down Bolg.",
    description:
      "Goblins and wolves pour down from the North; Men, Elves and Dwarves must hold the Eastern Spur, the Dale and Ravenhill at once before the clouds burst and Bolg's bodyguard falls upon them.",
    sets: ["The Battle of Five Armies", "Wilderland"],
    stages: BOFA_QUESTS.map((q) => ({
      name: q.name,
      quest: q.back_quest ?? q.quest ?? 0,
      cardCode: q.code,
      story: q.back_text || q.text || "",
      questImage: q.back_imagesrc,
    })),
  },
];
