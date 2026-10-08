import WASTES_ENCOUNTERS_DATA from "../data/wastes-eriador-encounter-cards.json";
import WASTES_QUESTS_DATA from "../data/wastes-eriador-quest-cards.json";
import GRAM_ENCOUNTERS_DATA from "../data/mount-gram-encounter-cards.json";
import GRAM_QUESTS_DATA from "../data/mount-gram-quest-cards.json";
import ETTEN_ENCOUNTERS_DATA from "../data/ettenmoors-encounter-cards.json";
import ETTEN_QUESTS_DATA from "../data/ettenmoors-quest-cards.json";
import RHUDAUR_ENCOUNTERS_DATA from "../data/rhudaur-encounter-cards.json";
import RHUDAUR_QUESTS_DATA from "../data/rhudaur-quest-cards.json";
import CARN_ENCOUNTERS_DATA from "../data/carn-dum-encounter-cards.json";
import CARN_QUESTS_DATA from "../data/carn-dum-quest-cards.json";
import DREAD_ENCOUNTERS_DATA from "../data/dread-realm-encounter-cards.json";
import DREAD_QUESTS_DATA from "../data/dread-realm-quest-cards.json";
import { DREAD_REANIMATED_CARD } from "./dread-reanimated-card";
import art from "../data/reference-scenario-art.json";
import type { Card, ScenarioId } from "./types";

const WASTES_ENCOUNTERS = WASTES_ENCOUNTERS_DATA as Card[];
const WASTES_QUESTS = WASTES_QUESTS_DATA as Card[];
const GRAM_ENCOUNTERS = GRAM_ENCOUNTERS_DATA as Card[];
const GRAM_QUESTS = GRAM_QUESTS_DATA as Card[];
const ETTEN_ENCOUNTERS = ETTEN_ENCOUNTERS_DATA as Card[];
const ETTEN_QUESTS = ETTEN_QUESTS_DATA as Card[];
const RHUDAUR_ENCOUNTERS = RHUDAUR_ENCOUNTERS_DATA as Card[];
const RHUDAUR_QUESTS = RHUDAUR_QUESTS_DATA as Card[];
const CARN_ENCOUNTERS = CARN_ENCOUNTERS_DATA as Card[];
const CARN_QUESTS = CARN_QUESTS_DATA as Card[];
const DREAD_ENCOUNTERS = DREAD_ENCOUNTERS_DATA as Card[];
const DREAD_QUESTS = DREAD_QUESTS_DATA as Card[];

export const ANGMAR_ENCOUNTERS: Card[] = [
  ...new Map(
    [
      ...WASTES_ENCOUNTERS,
      ...GRAM_ENCOUNTERS,
      ...ETTEN_ENCOUNTERS,
      ...RHUDAUR_ENCOUNTERS,
      ...CARN_ENCOUNTERS,
      ...DREAD_ENCOUNTERS,
      DREAD_REANIMATED_CARD,
    ].map((c) => [c.code, c]),
  ).values(),
];
export const ANGMAR_QUESTS: Card[] = [
  ...WASTES_QUESTS,
  ...GRAM_QUESTS,
  ...ETTEN_QUESTS,
  ...RHUDAUR_QUESTS,
  ...CARN_QUESTS,
  ...DREAD_QUESTS,
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
    questImage:
      art[(c.back_imagesrc ?? c.imagesrc) as keyof typeof art] ??
      c.back_imagesrc ??
      c.imagesrc,
  })),
});
export const ANGMAR_ADVENTURES = [
  adventure(
    "wastes-of-eriador",
    "The Wastes of Eriador",
    "I",
    5,
    "Survive the changing day and night, protect Amarthiúl and confront the Warg pack.",
    ["The Wastes of Eriador", "Eriador Wilds", "Foul Weather", "Amarthiúl"],
    WASTES_QUESTS,
  ),
  adventure(
    "escape-from-mount-gram",
    "Escape from Mount Gram",
    "II",
    6,
    "Escape the Orc prison, rescue your captured fellowship and reunite at the Southern Gate.",
    ["Escape from Mount Gram", "Angmar Orcs"],
    GRAM_QUESTS,
  ),
  adventure(
    "across-the-ettenmoors",
    "Across the Ettenmoors",
    "III",
    4,
    "Find safe shelter and guide Amarthiúl past the Trolls and Giants of the Ettenmoors.",
    ["Across the Ettenmoors", "Eriador Wilds", "Foul Weather", "Amarthiúl"],
    ETTEN_QUESTS,
  ),
  adventure(
    "the-treachery-of-rhudaur",
    "The Treachery of Rhudaur",
    "IV",
    5,
    "Search the haunted keep for ancient secrets before time runs out and Thaurdir returns.",
    [
      "The Treachery of Rhudaur",
      "Cursed Dead",
      "Ruins of Arnor",
      "Eriador Wilds",
      "Amarthiúl",
    ],
    RHUDAUR_QUESTS,
  ),
  adventure(
    "the-battle-of-carn-dum",
    "The Battle of Carn Dûm",
    "V",
    8,
    "Break the siege of Carn Dûm and withstand the changing forms and relentless attacks of Thaurdir.",
    ["The Battle of Carn Dûm", "Angmar Orcs", "Dark Sorcery", "Amarthiúl"],
    CARN_QUESTS,
  ),
  adventure(
    "the-dread-realm",
    "The Dread Realm",
    "VI",
    7,
    "Face the reanimated dead, defeat Daechanar and escape the crumbling catacombs.",
    ["The Dread Realm", "Dark Sorcery", "Cursed Dead"],
    DREAD_QUESTS,
  ),
];
