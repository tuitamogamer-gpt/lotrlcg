import { MUMAKIL_ENCOUNTERS, MUMAKIL_QUESTS } from "./mumakil-support";
import { cachedImageSource } from "./scenario-image-source";
import type { ScenarioId } from "./types";
export { MUMAKIL_ENCOUNTERS, MUMAKIL_QUESTS };
export const MUMAKIL_ADVENTURES = [{
  id: "the-mumakil" as ScenarioId, name: "The Mûmakil", shortName: "The Mûmakil", chapter: "IV", difficulty: 4,
  tagline: "Track the Oliphaunts through Harad's jungle and capture them alive.",
  description: "Explore the jungle, find a Wild Mûmak for each player, and use the Capture objectives to secure mounts for the journey north.",
  sets: ["The Mumakil", "Jungle Forest"],
  stages: MUMAKIL_QUESTS.map((q) => ({ name: q.back_name ?? q.name, quest: q.back_quest ?? 0, cardCode: q.code,
    story: q.back_text ?? q.text ?? "", questImage: cachedImageSource(q.back_imagesrc ?? q.imagesrc) })),
}];
