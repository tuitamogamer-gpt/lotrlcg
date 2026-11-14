import {
  SHELOB_LAIR_ENCOUNTERS,
  SHELOB_LAIR_QUESTS,
} from "./shelob-lair-support";
import type { ScenarioId } from "./types";
export { SHELOB_LAIR_ENCOUNTERS, SHELOB_LAIR_QUESTS };
export const SHELOB_LAIR_ADVENTURES = [
  {
    id: "shelobs-lair" as ScenarioId,
    name: "Shelob's Lair",
    shortName: "Shelob's Lair",
    chapter: "XII",
    difficulty: 8,
    tagline: "Climb the stairs of Cirith Ungol and escape Shelob's Lair.",
    description:
      "Sméagol leads the hobbits from the Morgul Vale up a secret way over the Mountains of Shadow, but the pass runs through the tunnels of Torech Ungol, where the great spider waits in the dark and Gollum plots his betrayal.",
    sets: ["Shelob's Lair", "The Great Spider", "Gollum", "Morgul Nazgûl"],
    stages: SHELOB_LAIR_QUESTS.map((q) => ({
      name: q.back_name ?? q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
