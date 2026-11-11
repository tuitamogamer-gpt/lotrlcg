import { FAS_ENCOUNTERS, FAS_QUESTS } from "./flies-spiders-support";
import type { ScenarioId } from "./types";
export { FAS_ENCOUNTERS, FAS_QUESTS };
export const FAS_ADVENTURES = [
  {
    id: "flies-and-spiders" as ScenarioId,
    name: "Flies and Spiders",
    shortName: "Flies and Spiders",
    chapter: "I",
    difficulty: 6,
    tagline: "Escape the webs of Mirkwood's spiders.",
    description:
      "Lost on the elf-path of Mirkwood, the company is poisoned and bound by the great spiders; Bilbo must find his friends in the dark and free them before the spiders feast.",
    sets: ["Flies and Spiders", "Wilderland"],
    stages: FAS_QUESTS.map((q) => ({
      name: q.name,
      quest: q.back_quest ?? q.quest ?? 0,
      cardCode: q.code,
      story: q.back_text || q.text || "",
      questImage: q.back_imagesrc,
    })),
  },
];
