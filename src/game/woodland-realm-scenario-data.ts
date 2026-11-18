import { WR_ENCOUNTERS, WR_QUESTS, wrStageOf } from "./woodland-realm-support";
import type { ScenarioId } from "./types";
export { WR_ENCOUNTERS, WR_QUESTS };
/** Captured by Spiders, then the three stage 2 and the three stage 3 cards the players choose from. */
const stages = () =>
  WR_QUESTS.map((q) => ({
    stage: wrStageOf(q.code),
    name: q.back_name ?? q.name,
    quest: q.back_quest ?? 0,
    cardCode: q.code,
    story: q.back_text || q.text || "",
    questImage: q.back_imagesrc,
  }));
export const WOODLAND_REALM_ADVENTURES = [
  {
    id: "the-woodland-realm" as ScenarioId,
    name: "The Woodland Realm",
    shortName: "The Woodland Realm",
    chapter: "I",
    difficulty: 5,
    tagline:
      "Rescue Mendor from the Spider Den and follow him through Mirkwood to the Elvenking's halls: build your own quest and encounter deck.",
    description:
      "Lost in Mirkwood, the heroes find Mendor, an Elf of the Woodland Realm, captured by spiders. Free him and follow him to the halls of the Elvenking; if Mendor leaves play, the players lose. The players choose one stage 2 and one stage 3 quest card and 7 of the 14 encounter sets; the first player resolves each 'opposing team' effect in the way that provides the greatest challenge.",
    sets: ["The Woodland Realm"],
    /** Captured by Spiders, then one chosen stage 2 and one chosen stage 3 card. */
    stageCount: 3,
    stages: stages(),
  },
];
