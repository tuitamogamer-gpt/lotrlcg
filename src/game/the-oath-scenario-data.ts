import { OATH_ENCOUNTERS, OATH_QUESTS } from "./the-oath-support";
import type { ScenarioId } from "./types";
export { OATH_ENCOUNTERS, OATH_QUESTS };
const stages = () =>
  OATH_QUESTS.map((q) => ({
    name: q.back_name ?? q.name,
    quest: q.back_quest ?? 0,
    cardCode: q.code,
    story: q.back_text || q.text || "",
    questImage: q.back_imagesrc,
  }));
const description =
  "Goblins have raided a woodman village on the eaves of Mirkwood and taken its people captive. Follow their trail through the forest past spiders and goblin snipers, find a Goblin Trail to the raiders' lair and defeat the rearguard of Goblin Troop to win.";
export const OATH_ADVENTURES = [
  {
    id: "the-oath-2018" as ScenarioId,
    name: "The Oath (Two-Player Limited Edition Starter)",
    shortName: "The Oath (2018)",
    chapter: "I",
    difficulty: 2,
    tagline:
      "Rescue the captured woodmen: the Two-Player Limited Edition Starter's version.",
    description,
    sets: ["The Oath", "The Goblins"],
    stages: stages(),
  },
  {
    id: "the-oath" as ScenarioId,
    name: "The Oath",
    shortName: "The Oath",
    chapter: "I",
    difficulty: 3,
    tagline:
      "Rescue the captured woodmen: The Dark of Mirkwood's version with Wild Wargs, Obsidian Arrows and Abandoned Camp.",
    description,
    sets: ["The Oath", "The Goblins"],
    stages: stages(),
  },
];
