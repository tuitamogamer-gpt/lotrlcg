import { card } from "../src/game/cards";
import { canTravel, stats } from "../src/game/engine";
import { allCharacters } from "../src/game/table";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";

export const WRATH_RUIN_SCENARIOS = [
  "wrath-and-ruin",
] as const satisfies readonly ScenarioId[];
export type WrathRuinScenario = (typeof WRATH_RUIN_SCENARIOS)[number];
export const isWrathRuinScenario = (id: ScenarioId): id is WrathRuinScenario =>
  WRATH_RUIN_SCENARIOS.some((scenario) => scenario === id);

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function wrathRuinSimulationChoice(s: GameState): Option | undefined {
  if (!isWrathRuinScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  if (/Assign.*damage|damage.*hero|damage.*character/i.test(title))
    return [...options].sort((a, b) => {
      const ua = units.find((u) => u.id === a.id);
      const ub = units.find((u) => u.id === b.id);
      return (
        (ub ? stats(s, ub).health - ub.damage : 0) -
        (ua ? stats(s, ua).health - ua.damage : 0)
      );
    })[0];
  if (/defend/i.test(title))
    return [...options].sort((a, b) => {
      const ua = units.find((u) => u.id === a.id);
      const ub = units.find((u) => u.id === b.id);
      return (
        (ub ? stats(s, ub).defense : -1) - (ua ? stats(s, ua).defense : -1)
      );
    })[0];
  if (title === "Choose the current quest")
    return [...options].sort(
      (a, b) =>
        (a.code ? (card(a.code).quest ?? 50) : 50) -
        (b.code ? (card(b.code).quest ?? 50) : 50),
    )[0];
  return (
    options.find((o) => o.id === "skip") ??
    options.find((o) => o.id === "resolve") ??
    options[0]
  );
}

export function wrathRuinSimulationAction(s: GameState): Action | undefined {
  if (
    !isWrathRuinScenario(s.scenarioId) ||
    s.choice ||
    s.flow?.pending ||
    s.phase !== "travel"
  )
    return;
  if (s.activeLocation) return { type: "NEXT" };
  const location = s.staging
    .filter((u) => !canTravel(s, u))
    .sort((a, b) => (card(b.code).threat ?? 0) - (card(a.code).threat ?? 0))[0];
  return location ? { type: "TRAVEL", id: location.id } : { type: "NEXT" };
}
