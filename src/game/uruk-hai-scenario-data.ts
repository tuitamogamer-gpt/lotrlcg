import { URUK_HAI_ENCOUNTERS, URUK_HAI_QUESTS } from "./uruk-hai-support";
import type { ScenarioId } from "./types";
export { URUK_HAI_ENCOUNTERS, URUK_HAI_QUESTS };
export const URUK_HAI_ADVENTURES = [
  {
    id: "the-uruk-hai" as ScenarioId,
    name: "The Uruk-hai",
    shortName: "The Uruk-hai",
    chapter: "VII",
    difficulty: 6,
    tagline: "Run down the Uruk-hai before they reach Isengard.",
    description:
      "The Uruk-hai carry members of the Company across the plains of Rohan towards Isengard. Aragorn and his companions give chase, with the pursuit value rising every round, and must catch Uglúk's band before the Orcs escape with their Captives.",
    sets: ["The Uruk-hai", "Orcs of the White Hand", "Snaga Orcs"],
    stages: URUK_HAI_QUESTS.map((q) => ({
      name: q.name,
      // X is the pursuit value, which starts at 10.
      quest: 10,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
