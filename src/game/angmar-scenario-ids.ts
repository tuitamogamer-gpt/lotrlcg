import type { ScenarioId } from "./types";

export const ANGMAR_SCENARIO_IDS: readonly ScenarioId[] = [
  "wastes-of-eriador",
  "escape-from-mount-gram",
  "across-the-ettenmoors",
  "the-treachery-of-rhudaur",
  "the-battle-of-carn-dum",
  "the-dread-realm",
];

export const isAngmarAdventure = (id: ScenarioId) =>
  ANGMAR_SCENARIO_IDS.includes(id);
