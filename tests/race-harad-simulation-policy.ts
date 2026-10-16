import { card } from "../src/game/cards";
import { canTravel, stats } from "../src/game/engine";
import { allCharacters } from "../src/game/table";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";

export const RACE_HARAD_SCENARIOS = [
  "race-across-harad",
] as const satisfies readonly ScenarioId[];
export type RaceHaradScenario = (typeof RACE_HARAD_SCENARIOS)[number];
export const isRaceHaradScenario = (id: ScenarioId): id is RaceHaradScenario =>
  id === "race-across-harad";

/** Selects only from public units and offered legal choices. */
export function raceHaradSimulationChoice(s: GameState): Option | undefined {
  if (!isRaceHaradScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  if (/Assign.*damage|damage.*character/i.test(title)) {
    const units = allCharacters(s);
    return [...options].sort((a, b) => {
      const ua = units.find((u) => u.id === a.id),
        ub = units.find((u) => u.id === b.id);
      return (
        (ub ? stats(s, ub).health - ub.damage : 0) -
        (ua ? stats(s, ua).health - ua.damage : 0)
      );
    })[0];
  }
  if (
    /Add.*different location|Choose.*location|Search for.*location/i.test(title)
  )
    return [...options].sort(
      (a, b) =>
        (a.code ? (card(a.code).threat ?? 0) : 0) -
        (b.code ? (card(b.code).threat ?? 0) : 0),
    )[0];
}

export function raceHaradSimulationAction(s: GameState): Action | undefined {
  if (
    !isRaceHaradScenario(s.scenarioId) ||
    s.choice ||
    s.flow?.pending ||
    s.phase !== "travel"
  )
    return;
  if (s.activeLocation) return { type: "NEXT" };
  const destination = s.staging
    .filter((u) => !canTravel(s, u))
    .sort((a, b) => (card(b.code).threat ?? 0) - (card(a.code).threat ?? 0))[0];
  return destination
    ? { type: "TRAVEL", id: destination.id }
    : { type: "NEXT" };
}
