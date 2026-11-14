import {
  GREY_COMPANY_ENCOUNTERS,
  GREY_COMPANY_QUESTS,
} from "./grey-company-support";
import type { ScenarioId } from "./types";
export { GREY_COMPANY_ENCOUNTERS, GREY_COMPANY_QUESTS };
export const GREY_COMPANY_ADVENTURES = [
  {
    id: "the-passing-of-the-grey-company" as ScenarioId,
    name: "The Passing of the Grey Company",
    shortName: "Grey Company",
    chapter: "XIII",
    difficulty: 7,
    tagline: "Take the Paths of the Dead and summon the Oathbreakers to Erech.",
    description:
      "Aragorn leads the Grey Company under the Dwimorberg, where the Dead of Dunharrow follow in the dark and fear grips every heart, to call the Oathbreakers to the Stone of Erech.",
    sets: ["The Passing of the Grey Company"],
    stages: GREY_COMPANY_QUESTS.map((q) => ({
      name: q.back_name ?? q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
