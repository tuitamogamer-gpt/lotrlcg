import { card } from "../src/game/cards";
import { canCommit, canTravel, characters, stats } from "../src/game/engine";
import { get } from "../src/game/core";
import { allCharacters, defendersFor } from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import { enemyAttackPrevented } from "../src/game/engine";
import { OF, ofVictory } from "../src/game/old-forest-support";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";

export const OF_SCENARIOS = [
  "the-old-forest",
] as const satisfies readonly ScenarioId[];
export type OfScenario = (typeof OF_SCENARIOS)[number];
export const isOfScenario = (id: ScenarioId): id is OfScenario =>
  OF_SCENARIOS.some((scenario) => scenario === id);

const room = (s: GameState, id: string) => {
  const u = get(s, id);
  return u ? stats(s, u).health - u.damage : -99;
};
const isAlly = (s: GameState, id: string) => {
  const u = get(s, id);
  return !!u && card(u.code).type_code === "ally";
};
/** Locations worth victory points first, the cheaper to explore first. */
const locationValue = (s: GameState, code: string) =>
  ofVictory(s, code) * 10 - (card(code).quest ?? 0);

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function ofSimulationChoice(s: GameState): Option | undefined {
  if (!isOfScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  if (/^Revealed · /.test(title))
    return options.find((o) => o.id === "resolve");
  // Setup and stage 2A searches: the most valuable location.
  if (
    /^Farewell to the Shire · Add/.test(title) ||
    /^The Living Forest · Search/.test(title)
  )
    return [...options].sort(
      (a, b) => locationValue(s, b.code!) - locationValue(s, a.code!),
    )[0];
  // Swaying Without Wind: return the least valuable location.
  if (/^Swaying Without Wind/.test(title))
    return [...options].sort(
      (a, b) => ofVictory(s, a.code!) - ofVictory(s, b.code!),
    )[0];
  // Falling Branches and Song of Sleep: the sturdiest hero, never Frodo.
  if (/^Falling Branches|^Song of Sleep|^Dark Bad Place/.test(title))
    return (
      [...options]
        .filter((o) => !isAlly(s, o.id))
        .sort((a, b) => room(s, b.id) - room(s, a.id))[0] ?? options[0]
    );
  if (
    /Assign.*damage|damage.*hero|damage.*character/i.test(title) &&
    options.some((o) => get(s, o.id))
  )
    return (
      [...options.filter((o) => get(s, o.id))].sort(
        (a, b) => room(s, b.id) - room(s, a.id),
      )[0] ?? options[0]
    );
  // Chump attacks with allies.
  if (/Immediate attack/i.test(title)) {
    const ally = options.find((o) => isAlly(s, o.id));
    if (ally) return ally;
    return (
      [...options.filter((o) => get(s, o.id))].sort((a, b) => {
        const ua = units.find((u) => u.id === a.id)!;
        const ub = units.find((u) => u.id === b.id)!;
        return stats(s, ub).defense - stats(s, ua).defense;
      })[0] ??
      options.find((o) => o.id === "undefended") ??
      options[0]
    );
  }
  for (const id of ["use", "gain", "draw"]) {
    const preferred = options.find((o) => o.id === id);
    if (preferred) return preferred;
  }
  return (
    options.find((o) => o.id === "skip") ??
    options.find((o) => o.id === "resolve") ??
    options[0]
  );
}

export function ofSimulationAction(s: GameState): Action | undefined {
  if (!isOfScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
  if (s.phase === "defense") {
    const enemy = engagedEnemies(s).find(
      (u) => normalAttackPending(s, u) && !enemyAttackPrevented(s, u),
    );
    if (enemy) {
      const candidates = defendersFor(s, enemy);
      const ally = candidates.find((u) => card(u.code).type_code === "ally");
      const defender =
        ally ??
        [...candidates].sort(
          (a, b) => stats(s, b).defense - stats(s, a).defense,
        )[0];
      return {
        type: "DEFEND",
        enemyId: enemy.id,
        defenderId: defender?.id ?? null,
      };
    }
  }
  if (s.phase === "quest") {
    // Keep the best defender back.
    const own = characters(s);
    const guard = [...own].sort(
      (a, b) => stats(s, b).defense - stats(s, a).defense,
    )[0];
    const ready = own.find(
      (u) =>
        u.id !== guard?.id &&
        canCommit(s, u) &&
        !s.committedIds.includes(u.id) &&
        stats(s, u).will > 0,
    );
    return ready ? { type: "TOGGLE_QUEST", id: ready.id } : { type: "COMMIT" };
  }
  if (s.phase !== "travel") return;
  if (s.activeLocation) return { type: "NEXT" };
  const open = s.staging.filter(
    (u) => card(u.code).type_code === "location" && !canTravel(s, u),
  );
  // Misleading Path must be travelled to; otherwise the most valuable location.
  const forced = open.find((u) => u.code === OF.misleading);
  const location =
    forced ??
    [...open].sort(
      (a, b) => locationValue(s, b.code) - locationValue(s, a.code),
    )[0];
  return location ? { type: "TRAVEL", id: location.id } : { type: "NEXT" };
}
