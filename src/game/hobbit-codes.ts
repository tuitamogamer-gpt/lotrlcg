import wmaEncounters from "../data/we-must-away-encounter-cards.json";

/** The Baggins-sphere Bilbo Baggins who joins the first player in The Hobbit. */
export const HOBBIT_BILBO = "131001";
/** The Hobbit: Over Hill and Under Hill scenarios that use this Bilbo. */
export const HOBBIT_SCENARIO_IDS: readonly string[] = [
  "we-must-away-ere-break-of-day",
  "over-the-misty-mountains-grim",
  "dungeons-deep-and-caverns-dim",
];
/** Over Hill and Under Hill treasures: Sting, Orcrist and Glamdring. */
export const HOBBIT_TREASURES: readonly string[] = [
  "131020",
  "131021",
  "131022",
];
/** Hobbit scenarios whose setup lists the Over Hill and Under Hill treasure set. */
export const HOBBIT_TREASURE_SCENARIOS: readonly string[] = [
  "over-the-misty-mountains-grim",
  "dungeons-deep-and-caverns-dim",
];
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
