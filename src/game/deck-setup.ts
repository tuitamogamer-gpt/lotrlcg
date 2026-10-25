import type { ScenarioId } from "./types";

/** The original Sméagol hero is incompatible with quests already featuring Gollum. */
export function shadowEastPlayerScenarioProblem(
  scenarioId: ScenarioId,
  heroes: readonly string[],
): string | null {
  return heroes.includes("21072") &&
    [
      "hunt-for-gollum",
      "conflict-at-the-carrock",
      "journey-to-rhosgobel",
      "hills-of-emyn-muil",
      "dead-marshes",
      "return-to-mirkwood",
    ].includes(scenarioId)
    ? "Sméagol cannot be chosen as a starting hero for the Shadows of Mirkwood cycle."
    : null;
}
