import {
  GHOST_FRAMSBURG_QUESTS,
  GHOST_FRAMSBURG_QUEST_CHAIN,
} from "./ghost-framsburg-support";
import { cachedImageSource } from "./scenario-image-source";
import type { ScenarioId } from "./types";
export {
  GHOST_FRAMSBURG_ENCOUNTERS,
  GHOST_FRAMSBURG_QUESTS,
} from "./ghost-framsburg-support";
export const GHOST_FRAMSBURG_ADVENTURE = {
  id: "the-ghost-of-framsburg" as ScenarioId,
  name: "The Ghost of Framsburg",
  shortName: "Ghost of Framsburg",
  chapter: "VII",
  difficulty: 5,
  tagline: "Discover the lost treasures of Fram's haunted keep.",
  description:
    "Explore the ruins of Framsburg, discover three guarded treasures and confront Fram's Shade at The Cursed Tomb.",
  sets: ["The Ghost of Framsburg", "Wild Creatures", "Afraid of the Dark"],
  stages: GHOST_FRAMSBURG_QUEST_CHAIN.map((code) =>
    GHOST_FRAMSBURG_QUESTS.find((c) => c.code === code)!,
  ).map((c) => ({
    name: c.back_name ?? c.name,
    quest: c.back_quest ?? 0,
    cardCode: c.code,
    story: c.back_text ?? "",
    questImage: cachedImageSource(c.back_imagesrc ?? c.imagesrc),
  })),
};
export const GHOST_FRAMSBURG_ADVENTURES = [GHOST_FRAMSBURG_ADVENTURE];
