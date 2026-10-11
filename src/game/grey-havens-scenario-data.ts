import { VOYAGE_ENCOUNTERS, VOYAGE_QUESTS } from "./voyage-belegaer-support";
import { FATE_ENCOUNTERS, FATE_QUESTS } from "./fate-numenor-support";
import { RAID_ENCOUNTERS, RAID_QUESTS } from "./raid-grey-havens-support";
import { cachedImageSource } from "./scenario-image-source";
import type { Card, ScenarioId } from "./types";

export const GREY_HAVENS_ENCOUNTERS: Card[] = [
  ...new Map(
    [...VOYAGE_ENCOUNTERS, ...FATE_ENCOUNTERS, ...RAID_ENCOUNTERS].map((c) => [
      c.code,
      c,
    ]),
  ).values(),
];
export const GREY_HAVENS_QUESTS: Card[] = [
  ...VOYAGE_QUESTS,
  ...FATE_QUESTS,
  ...RAID_QUESTS,
];

const adventure = (
  id: ScenarioId,
  name: string,
  chapter: string,
  difficulty: number,
  description: string,
  sets: string[],
  quests: Card[],
) => ({
  id,
  name,
  shortName: name.replace(/^The /, ""),
  chapter,
  difficulty,
  tagline: description,
  description,
  sets,
  stages: quests.map((c) => ({
    name: c.back_name ?? c.name,
    quest: c.back_quest ?? 0,
    cardCode: c.code,
    story: c.back_text ?? c.text ?? "",
    questImage: cachedImageSource(c.back_imagesrc ?? c.imagesrc),
  })),
});

export const GREY_HAVENS_ADVENTURES = [
  adventure(
    "voyage-across-belegaer",
    "Voyage Across Belegaer",
    "I",
    5,
    "Guide your fleet across the Great Sea, keep your heading and withstand the Corsairs.",
    [
      "Voyage Across Belegaer",
      "Vast Oceans",
      "Stormy Weather",
      "The Dream-chaser's Fleet",
      "Umbar Fleet",
      "Corsair Pirates",
    ],
    VOYAGE_QUESTS.slice(0, 3),
  ),
  adventure(
    "the-fate-of-numenor",
    "The Fate of Númenor",
    "II",
    5,
    "Explore uncharted islands, protect Calphon and discover the fate of Númenor.",
    ["The Fate of Numenor", "Drowned Dead", "Ruins of Numenor"],
    FATE_QUESTS,
  ),
  adventure(
    "raid-on-the-grey-havens",
    "Raid on the Grey Havens",
    "III",
    6,
    "Defend the burning Havens and confront the Corsair captains before the port falls.",
    ["Raid on the Grey Havens", "Corsair Raiders", "The Stormcaller Elite"],
    RAID_QUESTS,
  ),
];
