import { RING_SOUTH_ENCOUNTERS, RING_SOUTH_QUESTS } from "./ring-south-support";
import type { ScenarioId } from "./types";
export { RING_SOUTH_ENCOUNTERS, RING_SOUTH_QUESTS };
export const RING_SOUTH_ADVENTURES = [
  {
    id: "the-ring-goes-south" as ScenarioId,
    name: "The Ring Goes South",
    shortName: "The Ring Goes South",
    chapter: "IV",
    difficulty: 6,
    tagline: "Take the Ring south from Rivendell to the gates of Moria.",
    description:
      "The Council of Elrond sends the Company of the Ring south through Hollin. Wargs and crebain hunt them across the Redhorn Pass until they reach the Doors of Durin, where the Watcher in the Water seizes the Ring-bearer.",
    sets: ["The Ring Goes South"],
    stages: RING_SOUTH_QUESTS.map((q) => ({
      name: q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
