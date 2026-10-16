import {
  WILDS_RHOVANION_ENCOUNTERS,
  WILDS_RHOVANION_QUESTS,
  WILDS_ANDUIN_QUESTS,
  WILDS_KINGS_QUESTS,
  WILDS_RHOVANION as W,
} from "./wilds-rhovanion-support";
import { cachedImageSource } from "./scenario-image-source";
import type { ScenarioId } from "./types";
export { WILDS_RHOVANION_ENCOUNTERS, WILDS_RHOVANION_QUESTS };
const adventures = [
  {
    id: "journey-up-the-anduin",
    name: "Journey Up the Anduin",
    shortName: "Journey Up the Anduin",
    chapter: "I",
    tagline: "Save the Woodmen and cross the Old Ford.",
    description:
      "Follow the Anduin north, confront the Evil Creatures and rescue Haldan before crossing the Old Ford.",
    sets: [
      "Journey Up the Anduin",
      "Grey Mountain Goblins",
      "Hills of Wilderland",
      "Lost in Wilderland",
      "Journey Along the Anduin",
      "Wilderlands",
    ],
    quests: WILDS_ANDUIN_QUESTS,
  },
  {
    id: "lost-in-mirkwood",
    name: "Lost in Mirkwood",
    shortName: "Lost in Mirkwood",
    chapter: "II",
    tagline: "Search the forest for a way out.",
    description:
      "Follow guarded paths through Mirkwood, recover your companions and escape the forest's greatest fears.",
    sets: [
      "Lost in Mirkwood",
      "Dark Woods",
      "Gathering Gloom",
      "Passage Through Mirkwood",
      "Spiders of Mirkwood",
      "Dol Guldur Orcs",
    ],
    quests: [
      W.ambushed,
      W.spiders,
      W.orcs,
      W.carried,
      W.trulyLost,
      W.fear,
      W.escape,
    ],
  },
  {
    id: "the-kings-quest",
    name: "The King's Quest",
    shortName: "The King's Quest",
    chapter: "III",
    tagline: "Descend through the caves and confront the Fire-drake.",
    description:
      "Explore the Lost Caves under the Iron Hills, find the Dragon Hoard and defeat the Fire-drake.",
    sets: [
      "The King's Quest",
      "Fell Beasts",
      "Wild Creatures",
      "Deep Underground",
      "Afraid of the Dark",
      "Dragon Might",
      "Lost Caves",
    ],
    quests: WILDS_KINGS_QUESTS,
  },
];
export const WILDS_RHOVANION_ADVENTURES = adventures.map((a) => ({
  ...a,
  id: a.id as ScenarioId,
  difficulty: 5,
  stages: a.quests
    .map((code) => WILDS_RHOVANION_QUESTS.find((q) => q.code === code)!)
    .map((q) => ({
      name: q.back_name ?? q.name,
      quest: q.back_quest ?? 0,
      cardCode: q.code,
      story: q.back_text ?? q.text ?? "",
      questImage: cachedImageSource(q.back_imagesrc ?? q.imagesrc),
    })),
}));
