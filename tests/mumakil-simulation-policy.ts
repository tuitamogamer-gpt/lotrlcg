import { card } from "../src/game/cards";
import { canTravel, stats } from "../src/game/engine";
import { allCharacters } from "../src/game/table";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";

export const MUMAKIL_SCENARIOS = [
  "the-mumakil",
] as const satisfies readonly ScenarioId[];
export type MumakilScenario = (typeof MUMAKIL_SCENARIOS)[number];
export const isMumakilScenario = (id: ScenarioId): id is MumakilScenario =>
  id === "the-mumakil";

/** Uses public units and offered legal choices, never hidden deck order. */
export function mumakilSimulationChoice(s: GameState): Option | undefined {
  if (!isMumakilScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  if (title.includes("Return it to staging or defend another attack"))
    return options.find((o) => o.id === "return");
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
  if (
    /Capture|Pit Trap|Poisoned Spear|Horse.hair Lasso|Noose of Vines|Mumak Trail/i.test(
      title,
    )
  )
    return options.find((o) => !["skip", "decline"].includes(o.id));
}

export function mumakilSimulationAction(s: GameState): Action | undefined {
  if (
    !isMumakilScenario(s.scenarioId) ||
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
