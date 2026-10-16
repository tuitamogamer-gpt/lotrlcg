import { BENEATH_SANDS_ENCOUNTERS, BENEATH_SANDS_QUESTS, BENEATH_SANDS_MAIN_QUESTS } from "./beneath-sands-support";
import { cachedImageSource } from "./scenario-image-source";
import type { ScenarioId } from "./types";
export { BENEATH_SANDS_ENCOUNTERS, BENEATH_SANDS_QUESTS };
export const BENEATH_SANDS_ADVENTURES = [{
  id: "beneath-the-sands" as ScenarioId, name: "Beneath the Sands", shortName: "Beneath the Sands", chapter: "V", difficulty: 5,
  tagline: "Follow the spiders into the labyrinth beneath the desert.", description: "Search the twisting tunnels for your missing companions, stay On Track, and confront the Brood Mother in the spiders’ hive.",
  sets: ["Beneath the Sands", "Desert Creatures", "Harad Territory"],
  stages: BENEATH_SANDS_MAIN_QUESTS.map((code) => BENEATH_SANDS_QUESTS.find((q) => q.code === code)!).map((q) => ({ name: q.back_name ?? q.name, quest: q.back_quest ?? 0, cardCode: q.code, story: q.back_text ?? q.text ?? "", questImage: cachedImageSource(q.back_imagesrc ?? q.imagesrc) })),
}];
