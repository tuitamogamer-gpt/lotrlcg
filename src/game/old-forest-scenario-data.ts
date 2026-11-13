import {
  OF,
  OLD_FOREST_ENCOUNTERS,
  OLD_FOREST_QUESTS,
} from "./old-forest-support";
import type { ScenarioId } from "./types";
export { OLD_FOREST_ENCOUNTERS, OLD_FOREST_QUESTS };
const quest = (code: string) => OLD_FOREST_QUESTS.find((q) => q.code === code)!;
const farewell = quest(OF.farewell),
  living = quest(OF.dark),
  wicked = quest(OF.wicked);
export const OLD_FOREST_ADVENTURES = [
  {
    id: "the-old-forest" as ScenarioId,
    name: "The Old Forest",
    shortName: "The Old Forest",
    chapter: "I",
    difficulty: 6,
    tagline: "Cross the Old Forest before its trees close in.",
    description:
      "Pursued through the Shire by black riders, Frodo and his friends cut through the Old Forest towards Rivendell. The trees shift and the paths turn back on themselves; find your way through to the Withywindle, where Old Man Willow is waiting.",
    sets: ["The Old Forest"],
    // Three stages: stage 2 is one of four random The Living Forest cards.
    stages: [
      {
        name: farewell.name,
        quest: farewell.back_quest ?? 0,
        cardCode: farewell.code,
        story: farewell.back_text!,
        questImage: farewell.back_imagesrc,
      },
      {
        name: living.name,
        quest: 0,
        cardCode: living.code,
        story: `${living.text} One of four stage 2B cards is in play at random: Dark Bad Place, Choked with Brambles, Shifting Trees or Closing in Around Them. After questing successfully, the players advance to stage 3A with 5 victory points per player on locations in the victory display, otherwise to a different random stage 2A.`,
        questImage: living.imagesrc,
      },
      {
        name: wicked.name,
        quest: wicked.back_quest ?? 0,
        cardCode: wicked.code,
        story: wicked.back_text!,
        questImage: wicked.back_imagesrc,
      },
    ],
  },
];
