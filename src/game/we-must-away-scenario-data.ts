import { WMA_ENCOUNTERS, WMA_QUESTS } from "./we-must-away-support";
import type { ScenarioId } from "./types";
export { WMA_ENCOUNTERS, WMA_QUESTS };
export const WMA_ADVENTURES = [
  {
    id: "we-must-away-ere-break-of-day" as ScenarioId,
    name: "We Must Away, Ere Break of Day",
    shortName: "We Must Away",
    chapter: "I",
    difficulty: 7,
    tagline: "Outwit the three Trolls before dawn.",
    description:
      "Bilbo Baggins joins Thorin's company. In the Trollshaws three hungry Trolls stuff the travellers into sacks; the heroes must hold out until dawn turns them to stone, and may find their hoard.",
    sets: ["We Must Away, Ere Break of Day", "Western Lands"],
    stages: WMA_QUESTS.map((q) => ({
      name: q.name,
      quest: q.back_quest ?? q.quest ?? 0,
      cardCode: q.code,
      story: q.back_text || q.text || "",
      questImage: q.back_imagesrc,
    })),
  },
];
