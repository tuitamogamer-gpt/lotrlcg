import {
  CIRITH_GURAT_ENCOUNTERS,
  CIRITH_GURAT_QUESTS,
  CIRITH_GURAT_MAIN_QUESTS,
} from "./cirith-gurat-support";
import { cachedImageSource } from "./scenario-image-source";
import type { ScenarioId } from "./types";
export { CIRITH_GURAT_ENCOUNTERS, CIRITH_GURAT_QUESTS };
export const CIRITH_GURAT_ADVENTURES = [
  {
    id: "the-dungeons-of-cirith-gurat" as ScenarioId,
    name: "The Dungeons of Cirith Gurat",
    shortName: "Cirith Gurat",
    chapter: "VIII",
    difficulty: 7,
    tagline: "Break into the Orc dungeons and rescue your companions.",
    description:
      "Free Abaan and the captured allies, slip past the guards, and fight your way out of Cirith Gurat.",
    sets: ["The Dungeons of Cirith Gurat", "Harad Territory", "Mordor Orcs"],
    stages: CIRITH_GURAT_MAIN_QUESTS.map((code) =>
      CIRITH_GURAT_QUESTS.find((q) => q.code === code)!,
    ).map((q) => ({
      name: q.back_name ?? q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text ?? q.text ?? "",
      questImage: cachedImageSource(q.back_imagesrc ?? q.imagesrc),
    })),
  },
];
