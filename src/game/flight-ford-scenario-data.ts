import {
  FLIGHT_FORD_ENCOUNTERS,
  FLIGHT_FORD_QUESTS,
} from "./flight-ford-support";
import type { ScenarioId } from "./types";
export { FLIGHT_FORD_ENCOUNTERS, FLIGHT_FORD_QUESTS };
export const FLIGHT_FORD_ADVENTURES = [
  {
    id: "flight-to-the-ford" as ScenarioId,
    name: "Flight to the Ford",
    shortName: "Flight to the Ford",
    chapter: "III",
    difficulty: 6,
    tagline: "Carry the wounded Ring-bearer over the Last Bridge to the Ford.",
    description:
      "Frodo was stabbed on Weathertop and the Morgul-wound is killing him. Cross the Last Bridge and race the Black Riders to the Ford of Bruinen before the Ring-bearer's life runs out.",
    sets: ["Flight to the Ford", "The Black Riders", "Hunted", "The Nazgûl"],
    stages: FLIGHT_FORD_QUESTS.map((q) => ({
      name: q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
