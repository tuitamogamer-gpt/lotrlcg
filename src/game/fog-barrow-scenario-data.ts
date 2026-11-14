import {
  FB,
  FOG_BARROW_ENCOUNTERS,
  FOG_BARROW_QUESTS,
} from "./fog-barrow-support";
import type { ScenarioId } from "./types";
export { FOG_BARROW_ENCOUNTERS, FOG_BARROW_QUESTS };
const quest = (code: string) => FOG_BARROW_QUESTS.find((q) => q.code === code)!;
export const FOG_BARROW_ADVENTURES = [
  {
    id: "fog-on-the-barrow-downs" as ScenarioId,
    name: "Fog on the Barrow-downs",
    shortName: "Fog on the Barrow-downs",
    chapter: "I",
    difficulty: 8,
    tagline: "Find the way north through the fog and the barrows.",
    description:
      "Rested in the house of Tom Bombadil, the hobbits set out across the downs for the East Road. A cold fog closes about them among the standing stones, and the Barrow-wights wait in the great barrows for any who stray.",
    sets: ["Fog on the Barrow-downs"],
    stages: [FB.house, FB.across, FB.lost, FB.trapped].map((c) => {
      const q = quest(c);
      return {
        name: q.name,
        quest: q.back_quest ?? 0,
        cardCode: q.code,
        story: q.back_text!,
        questImage: q.back_imagesrc,
      };
    }),
  },
];
