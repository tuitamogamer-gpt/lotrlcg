import { MM_ENCOUNTERS, MM_QUESTS, mmStageOf } from "./mines-moria-support";
import type { ScenarioId } from "./types";
export { MM_ENCOUNTERS, MM_QUESTS };
/** To the West-door, then the three stage 2 and the three stage 3 cards the players choose from. */
const stages = () =>
  MM_QUESTS.map((q) => ({
    stage: mmStageOf(q.code),
    name: q.back_name ?? q.name,
    quest: q.back_quest ?? 0,
    cardCode: q.code,
    story: q.back_text || q.text || "",
    questImage: q.back_imagesrc,
  }));
export const MINES_MORIA_ADVENTURES = [
  {
    id: "the-mines-of-moria" as ScenarioId,
    name: "The Mines of Moria",
    shortName: "The Mines of Moria",
    chapter: "I",
    difficulty: 5,
    tagline:
      "Pass The Watcher at the West-door and search the Mines for the Chamber of Mazarbul: build your own quest and encounter deck.",
    description:
      "There has been no news of Balin's expedition for years, and rumours of darkness in Moria grow. Defeat The Watcher at the West-door, cross the Black Pit and search for the Chamber of Mazarbul. The players choose one stage 2 and one stage 3 quest card and 7 of the 14 encounter sets; the first player resolves each 'opposing team' effect in the way that provides the greatest challenge.",
    sets: ["The Mines of Moria"],
    /** To the West-door, then one chosen stage 2 and one chosen stage 3 card. */
    stageCount: 3,
    stages: stages(),
  },
];
