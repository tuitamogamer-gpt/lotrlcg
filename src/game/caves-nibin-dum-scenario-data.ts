import { CAVES_ENCOUNTERS, CAVES_QUESTS } from "./caves-nibin-dum-support";
import type { ScenarioId } from "./types";
export { CAVES_ENCOUNTERS, CAVES_QUESTS };
const stages = () =>
  CAVES_QUESTS.map((q) => ({
    name: q.back_name ?? q.name,
    quest: q.back_quest ?? 0,
    cardCode: q.code,
    story: q.back_text || q.text || "",
    questImage: q.back_imagesrc,
  }));
const description =
  "The Goblins have taken the woodmen's captives into the caves of Nibin-Dûm. Light the way with a Cave Torch, survive the surprise attack led by Goblin Chieftain, break Cracked Pillar to cross the chasm and defeat the Chieftain to rescue the captives.";
export const CAVES_ADVENTURES = [
  {
    id: "the-caves-of-nibin-dum-2018" as ScenarioId,
    name: "The Caves of Nibin-Dûm (Two-Player Limited Edition Starter)",
    shortName: "The Caves of Nibin-Dûm (2018)",
    chapter: "II",
    difficulty: 5,
    tagline:
      "Rescue the captives from the Goblins' caves: the Two-Player Limited Edition Starter's version.",
    description,
    sets: ["The Caves of Nibin-Dûm", "The Goblins"],
    stages: stages(),
  },
  {
    id: "the-caves-of-nibin-dum" as ScenarioId,
    name: "The Caves of Nibin-Dûm",
    shortName: "The Caves of Nibin-Dûm",
    chapter: "II",
    difficulty: 6,
    tagline:
      "Rescue the captives from the Goblins' caves: The Dark of Mirkwood's version with Crumbling Stairs, Wild Wargs and Obsidian Arrows.",
    description,
    sets: ["The Caves of Nibin-Dûm", "The Goblins"],
    stages: stages(),
  },
];
