import {
  TEMPLE_DOOM_ENCOUNTERS,
  TEMPLE_DOOM_QUESTS,
  TEMPLE_DOOM,
} from "./temple-doom-support";
import { cachedImageSource } from "./scenario-image-source";
import type { ScenarioId } from "./types";
export { TEMPLE_DOOM_ENCOUNTERS, TEMPLE_DOOM_QUESTS };
export const TEMPLE_DOOM_ADVENTURES = [
  {
    id: "temple-of-doom" as ScenarioId,
    name: "The Temple of Doom",
    shortName: "Temple of Doom",
    chapter: "III",
    difficulty: 7,
    tagline: "Break the tribute before Mordor's power overwhelms the temple.",
    description:
      "Explore four hidden chambers, withstand the growing Power of Mordor, and overcome Thane Ulchor to end the tribute.",
    sets: [
      "The Temple of Doom",
      "The Power of Mordor",
      "Easterling Raiders",
      "Twisted Tunnels",
    ],
    stages: [...TEMPLE_DOOM_QUESTS]
      .sort(
        (a, b) =>
          Number(b.code === TEMPLE_DOOM.first) -
          Number(a.code === TEMPLE_DOOM.first),
      )
      .map((q) => ({
        name: q.back_name ?? q.name,
        quest: q.back_quest ?? q.quest ?? 0,
        cardCode: q.code,
        story: q.back_text ?? "",
        questImage: cachedImageSource(q.back_imagesrc ?? q.imagesrc),
      })),
  },
];
