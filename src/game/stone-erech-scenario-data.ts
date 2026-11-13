import {
  STONE_ERECH_ENCOUNTERS,
  STONE_ERECH_QUESTS,
} from "./stone-erech-support";
import type { ScenarioId } from "./types";
export { STONE_ERECH_ENCOUNTERS, STONE_ERECH_QUESTS };
export const STONE_ERECH_ADVENTURES = [
  {
    id: "the-stone-of-erech" as ScenarioId,
    name: "The Stone of Erech",
    shortName: "The Stone of Erech",
    chapter: "I",
    difficulty: 7,
    tagline: "Find Derufin at the Stone of Erech before midnight falls.",
    description:
      "The Lord of Lamedon's son has vanished into the Blackroot Vale, where the Dead Men of Dunharrow walk at night. Reach the Stone of Erech, rescue Derufin and escape the Shadow Host before the darkness deepens.",
    sets: ["The Stone of Erech"],
    stages: STONE_ERECH_QUESTS.map((q) => ({
      name: q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
