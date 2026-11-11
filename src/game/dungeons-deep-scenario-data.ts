import { DDCD_ENCOUNTERS, DDCD_QUESTS } from "./dungeons-deep-support";
import type { ScenarioId } from "./types";
export { DDCD_ENCOUNTERS, DDCD_QUESTS };
export const DDCD_ADVENTURES = [
  {
    id: "dungeons-deep-and-caverns-dim" as ScenarioId,
    name: "Dungeons Deep and Caverns Dim",
    shortName: "Dungeons Deep",
    chapter: "III",
    difficulty: 6,
    tagline: "Win the riddle game and flee the wargs.",
    description:
      "Lost beneath the mountains, Bilbo must outwit Gollum in a game of riddles while his companions fight their way out of the goblin tunnels; then wolves hunt them all in the pines.",
    sets: ["Dungeons Deep and Caverns Dim", "Misty Mountain Goblins"],
    stages: DDCD_QUESTS.map((q) => ({
      name: q.name,
      quest: q.back_quest ?? q.quest ?? 0,
      cardCode: q.code,
      story: q.back_text || q.text || "",
      questImage: q.back_imagesrc,
    })),
  },
];
