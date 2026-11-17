import { ADG_ENCOUNTERS, ADG_QUESTS } from "./attack-dol-guldur-support";
import type { ScenarioId } from "./types";
export { ADG_ENCOUNTERS, ADG_QUESTS };
export const ATTACK_DOL_GULDUR_ADVENTURES = [
  {
    id: "attack-on-dol-guldur" as ScenarioId,
    name: "Attack on Dol Guldur",
    shortName: "Attack on Dol Guldur",
    chapter: "I",
    difficulty: 10,
    tagline:
      "Gather the power of Lórien, cross the Anduin and break the siege of the Necromancer's fortress.",
    description:
      "The armies of Dol Guldur cross the Anduin to assault Lórien. Hold the Golden Wood while the power of Lórien gathers, cross the river with the host of the Elves, then fight from front to front around the fortress until its city strength falls to 0 and no Lieutenant stands. Standard game mode for one to four players.",
    sets: ["Attack on Dol Guldur"],
    stages: ADG_QUESTS.map((q) => ({
      name: q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text || q.text || "",
      questImage: q.back_imagesrc,
    })),
  },
];
