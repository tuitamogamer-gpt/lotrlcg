import { WRATH_RUIN_ENCOUNTERS, WRATH_RUIN_QUESTS } from "./wrath-ruin-support";
import { cachedImageSource } from "./scenario-image-source";
import type { ScenarioId } from "./types";
export { WRATH_RUIN_ENCOUNTERS, WRATH_RUIN_QUESTS };
export const WRATH_RUIN_ADVENTURES = [
  {
    id: "wrath-and-ruin" as ScenarioId,
    name: "Wrath and Ruin",
    shortName: "Wrath and Ruin",
    chapter: "IV",
    difficulty: 7,
    tagline: "Retake Dorwinion from Thane Ulchor’s army.",
    description:
      "Capture the city’s locations, withstand the Easterling assault, and hold the Gate of Dorwinion at the end of the round.",
    sets: ["Wrath and Ruin", "Easterling Raiders", "City of Rhûn"],
    stages: WRATH_RUIN_QUESTS.map((q) => ({
      name: q.back_name ?? q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text ?? "",
      questImage: cachedImageSource(q.back_imagesrc ?? q.imagesrc),
    })),
  },
];
