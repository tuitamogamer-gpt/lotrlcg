import { RB, RB_ENCOUNTERS, RB_QUESTS } from "./ruins-belegost-support";
import type { ScenarioId } from "./types";
export { RB_ENCOUNTERS, RB_QUESTS };
const quest = (code: string) => RB_QUESTS.find((q) => q.code === code)!;
/** One atlas stage per stage number; stages 2 and 3 have alternative cards. */
const STAGES = [
  [RB.first],
  [RB.evils, RB.deeper],
  [RB.servants, RB.roots, RB.mines],
  [RB.beast],
];
export const RUINS_BELEGOST_ADVENTURES = [
  {
    id: "the-ruins-of-belegost" as ScenarioId,
    name: "The Ruins of Belegost",
    shortName: "The Ruins of Belegost",
    chapter: "I",
    difficulty: 8,
    tagline:
      "Search the drowned Dwarf city for its treasures while the dragon Naurlhûg stalks the ruins.",
    description:
      "Explore the half-sunken ruins of Belegost: each location you travel to reveals its dangers and may hide a Loot objective. The treasures you claim decide which way the quest branches, and the dragon Naurlhûg, drawn by your search, must be slain at the end.",
    sets: ["The Ruins of Belegost"],
    stages: STAGES.map((codes) => ({
      name: codes.map((c) => quest(c).name).join(" / "),
      quest: quest(codes[0]).back_quest ?? 0,
      cardCode: codes[0],
      story: codes
        .map((c) => quest(c).back_text || quest(c).text || "")
        .join("\n\n"),
      questImage: quest(codes[0]).back_imagesrc,
    })),
  },
];
