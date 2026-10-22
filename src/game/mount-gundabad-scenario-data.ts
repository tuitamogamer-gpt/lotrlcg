import {
  MOUNT_GUNDABAD_ENCOUNTERS,
  MOUNT_GUNDABAD_QUESTS,
  GUNDABAD,
} from "./mount-gundabad-support";
import { cachedImageSource } from "./scenario-image-source";
import type { ScenarioId } from "./types";
export { MOUNT_GUNDABAD_ENCOUNTERS, MOUNT_GUNDABAD_QUESTS };
export const MOUNT_GUNDABAD_ADVENTURE = {
  id: "mount-gundabad" as ScenarioId,
  name: "Mount Gundabad",
  shortName: "Mount Gundabad",
  chapter: "VIII",
  difficulty: 8,
  tagline: "Reforge Wormsbane in the dragon's mountain.",
  description:
    "Explore Gundabad's changing passages, find the First Forge and defeat Dagnir with Reforged Wormsbane.",
  sets: [
    "Mount Gundabad",
    "Lost Caves",
    "Deep Underground",
    "Fell Beasts",
    "Dragon Might",
    "Afraid of the Dark",
  ],
  stages: [GUNDABAD.door, GUNDABAD.upper]
    .map((code) => MOUNT_GUNDABAD_QUESTS.find((c) => c.code === code)!)
    .map((c) => ({
      name: c.back_name ?? c.name,
      cardCode: c.code,
      quest: c.back_quest ?? 0,
      story: c.back_text ?? "",
      questImage: cachedImageSource(c.back_imagesrc ?? c.imagesrc),
    })),
};
export const MOUNT_GUNDABAD_ADVENTURES = [MOUNT_GUNDABAD_ADVENTURE];
