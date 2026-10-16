import { card } from "../src/game/cards";
import { canTravel, stats } from "../src/game/engine";
import { allCharacters } from "../src/game/table";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";
export const BATCH4_SCENARIOS = [
  "the-black-serpent",
  "the-dungeons-of-cirith-gurat",
  "the-crossings-of-poros",
  "journey-up-the-anduin",
  "lost-in-mirkwood",
  "the-kings-quest",
] as const satisfies readonly ScenarioId[];
export type Batch4Scenario = (typeof BATCH4_SCENARIOS)[number];
export const isBatch4Scenario = (id: ScenarioId): id is Batch4Scenario =>
  BATCH4_SCENARIOS.some((s) => s === id);
/** Policies inspect public cards and legal offered options only. */
export function batch4SimulationChoice(s: GameState): Option | undefined {
  if (!isBatch4Scenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  if (/Assign.*damage|damage.*hero|damage.*character/i.test(title)) {
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
  if (/Choose.*pursuit cost|Prowler|Desert Warg|Outrider/.test(title))
    return options.find((o) => o.id === "discard");
  if (/Black Serpent|Serpent Guard|Redoubt|Roofless Tower/.test(title))
    return options.find((o) => o.id === "progress");
  if (
    /Choos.*location|Search for.*location|Iron Hills.*location|Caves deck/.test(
      title,
    )
  )
    return [...options].sort(
      (a, b) =>
        (a.code ? (card(a.code).threat ?? 0) : 0) -
        (b.code ? (card(b.code).threat ?? 0) : 0),
    )[0];
  if (/Chaos in the Night/.test(title))
    return options.find((o) => o.id === "threat");
  return (
    options.find((o) => o.id === "skip") ??
    options.find((o) => o.id === "resolve")
  );
}
export function batch4SimulationAction(s: GameState): Action | undefined {
  if (
    !isBatch4Scenario(s.scenarioId) ||
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
