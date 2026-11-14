import {
  PELENNOR_FIELDS_BOONS,
  PELENNOR_FIELDS_ENCOUNTERS,
  PELENNOR_FIELDS_QUESTS,
} from "./pelennor-fields-support";
import type { ScenarioId } from "./types";
export {
  PELENNOR_FIELDS_BOONS,
  PELENNOR_FIELDS_ENCOUNTERS,
  PELENNOR_FIELDS_QUESTS,
};
export const PELENNOR_FIELDS_ADVENTURES = [
  {
    id: "the-battle-of-the-pelennor-fields" as ScenarioId,
    name: "The Battle of the Pelennor Fields",
    shortName: "Pelennor Fields",
    chapter: "XV",
    difficulty: 8,
    tagline:
      "Hold the White City until the horns of Rohan and the black ships come.",
    description:
      "The garrison of Gondor gathers as the host of Mordor drives the defenders back from Osgiliath and lays siege to Minas Tirith; then Rohan comes, and on the Pelennor the Witch-king must fall while Aragorn fights and the White City still stands.",
    sets: ["The Battle of the Pelennor Fields"],
    stages: PELENNOR_FIELDS_QUESTS.map((q) => ({
      name: q.back_name ?? q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text!,
      questImage: q.back_imagesrc,
    })),
  },
];
