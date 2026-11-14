import { MOUNT_DOOM_ENCOUNTERS, MOUNT_DOOM_QUESTS } from "./mount-doom-support";
import type { ScenarioId } from "./types";
export { MOUNT_DOOM_ENCOUNTERS, MOUNT_DOOM_QUESTS };
export const MOUNT_DOOM_ADVENTURES = [
  {
    id: "mount-doom" as ScenarioId,
    name: "Mount Doom",
    shortName: "Mount Doom",
    chapter: "XVIII",
    difficulty: 8,
    tagline:
      "Carry the Ring across the Land of Mordor and up the slopes of Mount Doom.",
    description:
      "The Ring-bearer crosses the Plain of Gorgoroth under the Eye of Sauron. Fortitude tests weigh your committed heroes' willpower against the Sauron's Eye icons on the encounter cards you discard, The Tower of Barad-dûr raises your threat for every non-Fellowship character, and at the Crack of Doom the first player must pass one last test or the Ring-bearer claims The One Ring.",
    sets: ["Mount Doom", "Deep Shadows"],
    stages: MOUNT_DOOM_QUESTS.map((q) => ({
      name: q.back_name ?? q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
