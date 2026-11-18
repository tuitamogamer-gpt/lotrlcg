import { EK_ENCOUNTERS, EK_QUESTS, ekStageOf } from "./escape-khazad-support";
import type { ScenarioId } from "./types";
export { EK_ENCOUNTERS, EK_QUESTS };
/** Out of the Depths, then the three stage 2 and the three stage 3 cards the players choose from. */
const stages = () =>
  EK_QUESTS.map((q) => ({
    stage: ekStageOf(q.code),
    name: q.back_name ?? q.name,
    quest: q.back_quest ?? 0,
    cardCode: q.code,
    story: q.back_text || q.text || "",
    questImage: q.back_imagesrc,
  }));
export const ESCAPE_KHAZAD_ADVENTURES = [
  {
    id: "escape-from-khazad-dum" as ScenarioId,
    name: "Escape from Khazad-dûm",
    shortName: "Escape from Khazad-dûm",
    chapter: "I",
    difficulty: 6,
    tagline:
      "Climb out of the Dark Pit, find a way through Moria and flee Durin's Bane: build your own quest and encounter deck.",
    description:
      "You entered Moria hoping to find mithril, but you are lost below the ancient mansions of the Dwarves. Climb out of the Dark Pit, search for an exit and escape the Balrog at the East Gate. The players choose one stage 2 and one stage 3 quest card and 7 of the 14 encounter sets; the first player resolves each 'opposing team' effect in the way that provides the greatest challenge.",
    sets: ["Escape from Khazad-dûm"],
    /** Out of the Depths, then one chosen stage 2 and one chosen stage 3 card. */
    stageCount: 3,
    stages: stages(),
  },
];
