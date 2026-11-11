import { TLM_ENCOUNTERS, TLM_QUESTS } from "./lonely-mountain-support";
import type { ScenarioId } from "./types";
export { TLM_ENCOUNTERS, TLM_QUESTS };
export const TLM_ADVENTURES = [
  {
    id: "the-lonely-mountain" as ScenarioId,
    name: "The Lonely Mountain",
    shortName: "Lonely Mountain",
    chapter: "II",
    difficulty: 7,
    tagline: "Burgle Smaug's hoard and survive his wrath.",
    description:
      "Bilbo creeps into the hall of Erebor while Smaug sleeps on his gold; every burgled treasure risks waking the dragon, and only the bare patch on his breast can bring him down.",
    sets: ["The Lonely Mountain", "Wilderland"],
    stages: TLM_QUESTS.map((q) => ({
      name: q.name,
      quest: q.back_quest ?? q.quest ?? 0,
      cardCode: q.code,
      story: q.back_text || q.text || "",
      questImage: q.back_imagesrc,
    })),
  },
];
