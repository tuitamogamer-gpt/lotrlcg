import { BLACK_GATE_ENCOUNTERS, BLACK_GATE_QUESTS } from "./black-gate-support";
import type { ScenarioId } from "./types";
export { BLACK_GATE_ENCOUNTERS, BLACK_GATE_QUESTS };
export const BLACK_GATE_ADVENTURES = [
  {
    id: "the-black-gate-opens" as ScenarioId,
    name: "The Black Gate Opens",
    shortName: "Black Gate",
    chapter: "XVII",
    difficulty: 7,
    tagline:
      "Hold the Morannon for as long as you can while the Ring-bearer climbs Mount Doom.",
    description:
      "Aragorn has led the Men of the West to the Black Gate to keep the Eye of Sauron away from the Ring-bearer. The Mouth of Sauron rides out with his embassy, then the armies of Mordor pour through the Gate: this battle cannot be won, and each round the players hold gives Frodo more time. Your result is the number of resources on The Black Gate when you fall.",
    sets: ["The Black Gate Opens", "Orcs of Mordor"],
    stages: BLACK_GATE_QUESTS.map((q) => ({
      name: q.back_name ?? q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
