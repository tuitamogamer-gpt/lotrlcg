import { card } from "../src/game/cards";
import { canTravel, stats } from "../src/game/engine";
import { allCharacters } from "../src/game/table";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";

export const BENEATH_SANDS_SCENARIOS = [
  "beneath-the-sands",
] as const satisfies readonly ScenarioId[];
export type BeneathSandsScenario = (typeof BENEATH_SANDS_SCENARIOS)[number];
export const isBeneathSandsScenario = (
  id: ScenarioId,
): id is BeneathSandsScenario => id === "beneath-the-sands";

/** Selects only from public units and offered legal choices. */
export function beneathSandsSimulationChoice(s: GameState): Option | undefined {
  if (!isBeneathSandsScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  if (title.startsWith("Off Track"))
    return options.find((option) => option.id === "location");
  if (title.startsWith("Forced Off Track")) {
    const safe = allCharacters(s)
      .filter((unit) => unit.committed)
      .every((unit) => stats(s, unit).health - unit.damage > 1);
    return options.find((option) => option.id === (safe ? "damage" : "flip"));
  }
  if (title.startsWith("Brood Mother"))
    return options.find((option) => option.id === "discard");
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
    /Add.*different location|Choose.*location|Search for.*location|On Track/i.test(
      title,
    )
  )
    return [...options].sort(
      (a, b) =>
        (a.code ? (card(a.code).threat ?? 0) : 0) -
        (b.code ? (card(b.code).threat ?? 0) : 0),
    )[0];
}

export function beneathSandsSimulationAction(s: GameState): Action | undefined {
  if (
    !isBeneathSandsScenario(s.scenarioId) ||
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
