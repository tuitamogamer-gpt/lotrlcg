import { SA_ENCOUNTERS, SA_QUESTS } from "./annuminas-support";
import type { ScenarioId } from "./types";
export { SA_ENCOUNTERS, SA_QUESTS };
export const ANNUMINAS_ADVENTURES = [
  {
    id: "the-siege-of-annuminas" as ScenarioId,
    name: "The Siege of Annúminas",
    shortName: "The Siege of Annúminas",
    chapter: "I",
    difficulty: 8,
    tagline:
      "Hold the Dúnedain capital against the host of Angmar until you can strike down its Lieutenant.",
    description:
      "An army from Angmar marches on Annúminas. Rebuild the defenses while the city strength holds, defend the walls against the host and its siege engines, then lead a sortie to defeat the Lieutenant of Angmar. Standard game mode for one to four players.",
    sets: ["The Siege of Annúminas"],
    stages: SA_QUESTS.map((q) => ({
      name: q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text || q.text || "",
      questImage: q.back_imagesrc,
    })),
  },
];
