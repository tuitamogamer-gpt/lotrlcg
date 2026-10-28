import { WAINRIDERS_ENCOUNTERS, WAINRIDERS_QUESTS } from "./wainriders-support";
import type { ScenarioId } from "./types";
export { WAINRIDERS_ENCOUNTERS, WAINRIDERS_QUESTS };
export const WAINRIDERS_ADVENTURES = [
  {
    id: "challenge-of-the-wainriders" as ScenarioId,
    name: "Challenge of the Wainriders",
    shortName: "Wainriders",
    chapter: "VI",
    difficulty: 5,
    tagline: "Race the Wainrider champion for your freedom.",
    description:
      "Navigate a six-stage circuit twice, keep a driver ready and outrun the Wainriders before they deliver you to Mordor.",
    sets: ["Challenge of the Wainriders", "Rolling Plains", "Riders of Rhun"],
    stages: WAINRIDERS_QUESTS.map((q) => ({
      name: q.name,
      quest: 4,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
