import { ASH_ENCOUNTERS, ASH_QUESTS } from "./ash-mountains-support";
import type { ScenarioId } from "./types";
export { ASH_ENCOUNTERS, ASH_QUESTS };
export const ASH_ADVENTURES = [
  {
    id: "under-the-ash-mountains" as ScenarioId,
    name: "Under the Ash Mountains",
    shortName: "Ash Mountains",
    chapter: "VII",
    difficulty: 7,
    tagline: "Escape the tunnels before your supplies run out.",
    description:
      "Navigate Torech Gorgor, overcome its side quests and preserve your dwindling decks on the road into Mordor.",
    sets: ["Under the Ash Mountains", "Twisting Tunnels"],
    stages: ASH_QUESTS.map((q) => ({
      name: q.name,
      quest: 25,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
