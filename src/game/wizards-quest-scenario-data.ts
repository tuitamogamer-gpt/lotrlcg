import { WQ_ENCOUNTERS, WQ_QUESTS, wqStageOf } from "./wizards-quest-support";
import type { ScenarioId } from "./types";
export { WQ_ENCOUNTERS, WQ_QUESTS };
/** Radagast's Request, then the three stage 2 and the three stage 3 cards the players choose from. */
const stages = () =>
  WQ_QUESTS.map((q) => ({
    stage: wqStageOf(q.code),
    name: q.back_name ?? q.name,
    quest: q.back_quest ?? 0,
    cardCode: q.code,
    story: q.back_text || q.text || "",
    questImage: q.back_imagesrc,
  }));
export const WIZARDS_QUEST_ADVENTURES = [
  {
    id: "the-wizards-quest" as ScenarioId,
    name: "The Wizard's Quest",
    shortName: "The Wizard's Quest",
    chapter: "I",
    difficulty: 5,
    tagline:
      "Answer Radagast's summons: build your own quest and encounter deck, then scout Dol Guldur and return to Rhosgobel.",
    description:
      "Radagast sent an Eagle to spy on Dol Guldur and it returned with an evil wound. Travel to Rhosgobel, cross Mirkwood and gather what information you can at the Necromancer's Tower. The players choose one stage 2 and one stage 3 quest card and 7 of the 14 encounter sets; the first player resolves each 'opposing team' effect in the way that provides the greatest challenge.",
    sets: ["The Wizard's Quest"],
    /** Radagast's Request, then one chosen stage 2 and one chosen stage 3 card. */
    stageCount: 3,
    stages: stages(),
  },
];
