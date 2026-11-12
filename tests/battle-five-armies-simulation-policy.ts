import { card } from "../src/game/cards";
import { canCommit, canTravel, characters, stats } from "../src/game/engine";
import { get, questStat } from "../src/game/core";
import { allCharacters } from "../src/game/table";
import { availableAbilities } from "../src/game/actions";
import { isBagginsBilbo } from "../src/game/hobbit-codes";
import {
  BOFA,
  bofaComplete,
  bofaStageProgress,
} from "../src/game/battle-five-armies-support";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";

export const BOFA_SCENARIOS = [
  "the-battle-of-five-armies",
] as const satisfies readonly ScenarioId[];
export type BofaScenario = (typeof BOFA_SCENARIOS)[number];
export const isBofaScenario = (id: ScenarioId): id is BofaScenario =>
  BOFA_SCENARIOS.some((scenario) => scenario === id);

const room = (s: GameState, id: string) => {
  const u = get(s, id);
  return u ? stats(s, u).health - u.damage : -99;
};
/** Bilbo Baggins is protected: losing him loses the game. */
const notBilbo = (s: GameState, o: Option) =>
  !isBagginsBilbo(get(s, o.id)?.code ?? "");

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function bofaSimulationChoice(s: GameState): Option | undefined {
  if (!isBofaScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  const safest = (list: Option[]) => {
    const pool = list.filter((o) => notBilbo(s, o));
    return [...(pool.length ? pool : list)].sort(
      (a, b) => room(s, b.id) - room(s, a.id),
    )[0];
  };
  if (
    /Assign.*damage|damage.*hero|damage.*character|Gundabad Archer/i.test(
      title,
    ) &&
    options.some((o) => get(s, o.id))
  )
    return safest(options.filter((o) => get(s, o.id)));
  if (/defend|Immediate attack/i.test(title))
    return [...options].sort((a, b) => {
      const ua = units.find((u) => u.id === a.id);
      const ub = units.find((u) => u.id === b.id);
      return (
        (ub ? stats(s, ub).defense : -1) - (ua ? stats(s, ua).defense : -1)
      );
    })[0];
  // Finish the incomplete stage with the most progress first.
  if (/current quest/i.test(title)) {
    const open = options.filter((o) => !bofaComplete(s, o.id));
    return [...(open.length ? open : options)].sort(
      (a, b) => bofaStageProgress(s, b.id) - bofaStageProgress(s, a.id),
    )[0];
  }
  if (/Goblins are Upon You!/.test(title))
    return [...options].sort(
      (a, b) => (card(a.id).attack ?? 0) - (card(b.id).attack ?? 0),
    )[0];
  if (/Misty Mountain Eagle · Choose one/.test(title))
    return options.find((o) => o.id !== "control") ?? options[0];
  if (/Bilbo's Magic Ring · Raise your threat/i.test(title))
    return options.find((o) => o.id === (s.threat < 38 ? "use" : "skip"));
  if (/The Arkenstone · Raise your threat/.test(title))
    return options.find((o) => o.id === "x-1");
  if (/Thrór's Battle Axe/.test(title))
    return options.find((o) => o.id !== "skip") ?? options[0];
  for (const id of ["ring", "use", "gain", "draw"]) {
    const preferred = options.find((o) => o.id === id);
    if (preferred) return preferred;
  }
  if (/treasure/i.test(title))
    return options.find((o) => o.id.startsWith("card-")) ?? options[0];
  return (
    options.find((o) => o.id === "skip") ??
    options.find((o) => o.id === "resolve") ??
    options[0]
  );
}

export function bofaSimulationAction(s: GameState): Action | undefined {
  if (!isBofaScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
  // The first player calls the Misty Mountain Eagle with Baggins resources.
  const eagle = s.staging.find((u) => u.code === BOFA.eagle);
  if (
    eagle &&
    ["planning", "quest", "travel"].includes(s.phase) &&
    availableAbilities(s, eagle).some((a) => !a.disabled)
  )
    return { type: "ABILITY", id: eagle.id };
  if (s.phase === "quest") {
    // Keep the best defender (never Bilbo) back for the combat phase.
    const own = characters(s);
    const guard = own
      .filter((u) => !isBagginsBilbo(u.code))
      .sort((a, b) => stats(s, b).defense - stats(s, a).defense)[0];
    const stat = questStat(s) ?? "will";
    const ready = own.find(
      (u) =>
        u.id !== guard?.id &&
        canCommit(s, u) &&
        !s.committedIds.includes(u.id) &&
        stats(s, u)[stat === "will" ? "will" : stat] > 0,
    );
    return ready ? { type: "TOGGLE_QUEST", id: ready.id } : { type: "COMMIT" };
  }
  if (s.phase !== "travel") return;
  if (s.activeLocation) return { type: "NEXT" };
  const location = s.staging
    .filter((u) => !canTravel(s, u))
    .sort((a, b) => (card(b.code).threat ?? 0) - (card(a.code).threat ?? 0))[0];
  return location ? { type: "TRAVEL", id: location.id } : { type: "NEXT" };
}
