import { RACE_HARAD_ENCOUNTERS, RACE_HARAD_QUESTS, RACE_HARAD_MAIN_QUESTS } from "./race-harad-support";
import { cachedImageSource } from "./scenario-image-source";
import type { ScenarioId } from "./types";
export { RACE_HARAD_ENCOUNTERS, RACE_HARAD_QUESTS };
export const RACE_HARAD_ADVENTURES = [{
  id: "race-across-harad" as ScenarioId, name: "Race Across Harad", shortName: "Race Across Harad", chapter: "IV", difficulty: 6,
  tagline: "Ride north before the Orcs catch the caravan.", description: "Guide the Tamed Mûmakil through the desert and across the river Harnen while the Orcs advance through their own quest deck.",
  sets: ["Race Across Harad", "Desert Sands", "Mordor Orcs"],
  stages: RACE_HARAD_MAIN_QUESTS.map((code) => RACE_HARAD_QUESTS.find((q) => q.code === code)!).map((q) => ({ name: q.back_name ?? q.name, quest: q.back_quest ?? 0, cardCode: q.code, story: q.back_text ?? q.text ?? "", questImage: cachedImageSource(q.back_imagesrc ?? q.imagesrc) })),
}];
