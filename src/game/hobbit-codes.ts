import wmaEncounters from "../data/we-must-away-encounter-cards.json";

/** The Baggins-sphere Bilbo Baggins who joins the first player in The Hobbit. */
export const HOBBIT_BILBO = "131001";
/** The On the Doorstep Bilbo Baggins, the only Bilbo in its scenarios. */
export const OTD_BILBO = "132001";
/** Every Baggins-sphere Bilbo Baggins hero. */
export const BAGGINS_BILBOS: readonly string[] = [HOBBIT_BILBO, OTD_BILBO];
export const isBagginsBilbo = (code: string) => BAGGINS_BILBOS.includes(code);
/** The Hobbit: Over Hill and Under Hill scenarios that use the first Bilbo. */
export const OHAUH_SCENARIO_IDS: readonly string[] = [
  "we-must-away-ere-break-of-day",
  "over-the-misty-mountains-grim",
  "dungeons-deep-and-caverns-dim",
];
/** The Hobbit: On the Doorstep scenarios that use its Bilbo. */
export const OTD_SCENARIO_IDS: readonly string[] = [
  "flies-and-spiders",
  "the-lonely-mountain",
];
export const HOBBIT_SCENARIO_IDS: readonly string[] = [
  ...OHAUH_SCENARIO_IDS,
  ...OTD_SCENARIO_IDS,
];
/** The Bilbo Baggins a Hobbit scenario places with the first player. */
export const hobbitBilboCode = (scenarioId: string | undefined) =>
  scenarioId && OTD_SCENARIO_IDS.includes(scenarioId)
    ? OTD_BILBO
    : HOBBIT_BILBO;
/** On the Doorstep's Bilbo's Magic Ring (a treasure player card). */
export const OTD_RING = "132019";
/** Over Hill and Under Hill treasures: Sting, Orcrist and Glamdring. */
export const HOBBIT_TREASURES: readonly string[] = [
  "131020",
  "131021",
  "131022",
];
/** The Erebor treasures stacked under The Lonely Mountain. */
export const EREBOR_TREASURES: readonly string[] = [
  "132020",
  "132021",
  "132022",
  "132023",
  "132024",
];
/**
 * Treasure sets by the scenario whose icon they bear: We Must Away's Trolls'
 * hoard, Flies and Spiders' Bilbo's Magic Ring and The Lonely Mountain's
 * Erebor treasures.
 */
export const TREASURE_SETS: Readonly<Record<string, readonly string[]>> = {
  "we-must-away-ere-break-of-day": HOBBIT_TREASURES,
  "flies-and-spiders": [OTD_RING],
  "the-lonely-mountain": EREBOR_TREASURES,
};
/** Every treasure a group of heroes can discover and remember. */
export const DISCOVERABLE_TREASURES: readonly string[] =
  Object.values(TREASURE_SETS).flat();
/** The treasure sets each scenario's setup lists. */
const SCENARIO_TREASURE_SETS: Readonly<Record<string, readonly string[]>> = {
  "over-the-misty-mountains-grim": ["we-must-away-ere-break-of-day"],
  "dungeons-deep-and-caverns-dim": ["we-must-away-ere-break-of-day"],
  "flies-and-spiders": ["we-must-away-ere-break-of-day"],
  "the-lonely-mountain": ["we-must-away-ere-break-of-day", "flies-and-spiders"],
};
/** The discovered treasures that may join decks in a scenario. */
export const scenarioTreasures = (scenarioId: string | undefined) =>
  (SCENARIO_TREASURE_SETS[scenarioId ?? ""] ?? []).flatMap(
    (set) => TREASURE_SETS[set],
  );
/** Hobbit scenarios whose setup lists at least one treasure set. */
export const HOBBIT_TREASURE_SCENARIOS: readonly string[] = Object.keys(
  SCENARIO_TREASURE_SETS,
);
/** Printed X threat: The High Pass (X = players), Lake in the Cavern (2×). */
export const HOBBIT_X_THREAT: Readonly<Record<string, number>> = {
  "octgn:51223bd0-ffd1-11df-a976-1801204c9079": 1,
  "octgn:51223bd0-ffd1-11df-a976-1801204c9056": 2,
};
export const isHobbitScenarioId = (id: string | undefined) =>
  !!id && HOBBIT_SCENARIO_IDS.includes(id);
/** We Must Away's seven Sack objectives. */
export const HOBBIT_SACKS: readonly string[] = wmaEncounters
  .filter((c) => /\bSack\b/.test(c.traits ?? ""))
  .map((c) => c.code);
