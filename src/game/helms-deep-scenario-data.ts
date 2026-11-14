import { HELMS_DEEP_ENCOUNTERS, HELMS_DEEP_QUESTS } from "./helms-deep-support";
import type { ScenarioId } from "./types";
export { HELMS_DEEP_ENCOUNTERS, HELMS_DEEP_QUESTS };
export const HELMS_DEEP_ADVENTURES = [
  {
    id: "helms-deep" as ScenarioId,
    name: "Helm's Deep",
    shortName: "Helm's Deep",
    chapter: "VIII",
    difficulty: 8,
    tagline: "Hold the Deeping Wall until the dawn.",
    description:
      "Saruman's army comes against the Hornburg in the night. The encounter deck itself assaults the stages of the battle; the players must hold Helm's Deep until The Defense of Helm's Deep reaches the dawn, then ride out with the King and drive the hosts of Isengard from the field.",
    sets: ["Helm's Deep", "Orcs of the White Hand"],
    stages: HELMS_DEEP_QUESTS.map((q) => ({
      name: q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
