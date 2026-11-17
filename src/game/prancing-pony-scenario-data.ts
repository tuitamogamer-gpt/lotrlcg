import { PP_ENCOUNTERS, PP_QUESTS } from "./prancing-pony-support";
import type { ScenarioId } from "./types";
export { PP_ENCOUNTERS, PP_QUESTS };
export const PRANCING_PONY_ADVENTURES = [
  {
    id: "murder-at-the-prancing-pony" as ScenarioId,
    name: "Murder at the Prancing Pony",
    shortName: "Murder at the Prancing Pony",
    chapter: "I",
    difficulty: 8,
    tagline:
      "Find the killer and the outlaw's hideout among the rogues of Bree-land before the trail goes cold.",
    description:
      "A guest has been murdered at The Prancing Pony. Investigate the streets of Bree, rule out suspects and hideouts from the Investigation deck, then name the killer and his lair, and bring the brigands to justice before your threat runs out.",
    sets: ["Murder at the Prancing Pony"],
    stages: PP_QUESTS.map((q) => ({
      name: q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text || q.text || "",
      questImage: q.back_imagesrc,
    })),
  },
];
