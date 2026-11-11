import wmaEncounters from "../data/we-must-away-encounter-cards.json";

/** The Baggins-sphere Bilbo Baggins who joins the first player in The Hobbit. */
export const HOBBIT_BILBO = "131001";
/** The Hobbit: Over Hill and Under Hill scenarios that use this Bilbo. */
export const HOBBIT_SCENARIO_IDS: readonly string[] = [
  "we-must-away-ere-break-of-day",
];
export const isHobbitScenarioId = (id: string | undefined) =>
  !!id && HOBBIT_SCENARIO_IDS.includes(id);
/** We Must Away's seven Sack objectives. */
export const HOBBIT_SACKS: readonly string[] = wmaEncounters
  .filter((c) => /\bSack\b/.test(c.traits ?? ""))
  .map((c) => c.code);
