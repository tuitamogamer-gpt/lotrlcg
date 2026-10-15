import { card } from "../src/game/cards";
import { canTravel, stats } from "../src/game/engine";
import { allCharacters } from "../src/game/table";
import { MORDOR } from "../src/game/long-arm-mordor-support";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";

export const HARAD_SCENARIOS = [
  "escape-from-umbar",
  "desert-crossing",
  "the-long-arm-of-mordor",
] as const satisfies readonly ScenarioId[];
export type HaradScenario = (typeof HARAD_SCENARIOS)[number];
export const isHaradScenario = (id: ScenarioId): id is HaradScenario =>
  HARAD_SCENARIOS.includes(id as HaradScenario);

/** Uses only public units and the currently offered legal choice. */
export function haradSimulationChoice(s: GameState): Option | undefined {
  if (!isHaradScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  if (title.includes("Choose an objective-hero"))
    return [MORDOR.firyal, MORDOR.kahliel, MORDOR.jubayr, MORDOR.yazan]
      .map((code) => options.find((o) => o.code === code))
      .find(Boolean);
  if (/Rescue a hero|Ready 1 hero|Heal \d/.test(title))
    return [...options].sort(
      (a, b) =>
        (b.code ? (card(b.code).willpower ?? 0) : 0) -
        (a.code ? (card(a.code).willpower ?? 0) : 0),
    )[0];
  if (/Assign.*damage|damage.*character/i.test(title)) {
    const units = [...allCharacters(s), ...(s.mordor?.captured ?? [])];
    return [...options].sort((a, b) => {
      const ua = units.find((u) => u.id === a.id);
      const ub = units.find((u) => u.id === b.id);
      return (
        (ub ? stats(s, ub).health - ub.damage : 0) -
        (ua ? stats(s, ua).health - ua.damage : 0)
      );
    })[0];
  }
  if (/Add a different location|Search for.*(?:enemy|Orc)/i.test(title))
    return [...options].sort((a, b) => {
      const ac = a.code ? card(a.code) : undefined;
      const bc = b.code ? card(b.code) : undefined;
      return (
        (ac?.threat ?? 0) +
        (ac?.attack ?? 0) -
        (bc?.threat ?? 0) -
        (bc?.attack ?? 0)
      );
    })[0];
  if (
    /Seek Shade.*Reduce|Desert Oasis.*Heal|Craft Remedy.*Heal|Find Water.*readies/.test(
      title,
    )
  )
    return options.find((o) => o.id !== "skip");
  if (title.includes("Injured Companion"))
    return options.find((o) => o.id === "threat");
  if (title.includes("Exhaust the ally or deal"))
    return options.find((o) => o.id === "exhaust");
  if (/Firyal.*Look/.test(title))
    return options.find((o) => o.id === "discard");
}

export function haradSimulationAction(s: GameState): Action | undefined {
  if (
    !isHaradScenario(s.scenarioId) ||
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
