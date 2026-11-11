import { card } from "../src/game/cards";
import { canTravel, stats } from "../src/game/engine";
import { get } from "../src/game/core";
import { allCharacters } from "../src/game/table";
import { availableAbilities } from "../src/game/actions";
import { fasCurrentQuest } from "../src/game/flies-spiders-support";
import { isBagginsBilbo } from "../src/game/hobbit-codes";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";

export const FAS_SCENARIOS = [
  "flies-and-spiders",
] as const satisfies readonly ScenarioId[];
export type FasScenario = (typeof FAS_SCENARIOS)[number];
export const isFasScenario = (id: ScenarioId): id is FasScenario =>
  FAS_SCENARIOS.some((scenario) => scenario === id);

const poison = (s: GameState, id: string) =>
  get(s, id)?.attachments.filter((a) => a.poison).length ?? 0;
const room = (s: GameState, id: string) => {
  const u = get(s, id);
  return u ? stats(s, u).health - u.damage - poison(s, id) : -99;
};
/** Bilbo Baggins is protected: losing him loses the game. */
const notBilbo = (s: GameState, o: Option) =>
  !isBagginsBilbo(get(s, o.id)?.code ?? "");

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function fasSimulationChoice(s: GameState): Option | undefined {
  if (!isFasScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  const safest = (list: Option[]) => {
    const pool = list.filter((o) => notBilbo(s, o));
    return [...(pool.length ? pool : list)].sort(
      (a, b) => room(s, b.id) - room(s, a.id),
    )[0];
  };
  if (
    /Assign.*damage|damage.*hero|damage.*character|poison|Crazy Cob|Old Tomnoddy|Caught in Webs/i.test(
      title,
    ) &&
    options.some((o) => get(s, o.id))
  )
    return safest(options.filter((o) => get(s, o.id)));
  if (/defend/i.test(title))
    return [...options].sort((a, b) => {
      const ua = units.find((u) => u.id === a.id);
      const ub = units.find((u) => u.id === b.id);
      return (
        (ub ? stats(s, ub).defense : -1) - (ua ? stats(s, ua).defense : -1)
      );
    })[0];
  if (/Discard an unconscious/i.test(title))
    return options.find((o) => notBilbo(s, o)) ?? options[0];
  if (/Search the encounter deck for a Spider/i.test(title))
    return [...options].sort(
      (a, b) => (card(a.id).attack ?? 0) - (card(b.id).attack ?? 0),
    )[0];
  if (/Bilbo's Magic Ring · Raise your threat/i.test(title))
    return options.find((o) => o.id === (s.threat < 38 ? "use" : "skip"));
  for (const id of ["ring", "use", "gain", "draw"]) {
    const preferred = options.find((o) => o.id === id);
    if (preferred) return preferred;
  }
  if (/Ready an unconscious|Forest Stream/i.test(title))
    return options.find((o) => o.id !== "skip") ?? options[0];
  if (/treasure/i.test(title))
    return options.find((o) => o.id.startsWith("card-")) ?? options[0];
  return (
    options.find((o) => o.id === "skip") ??
    options.find((o) => o.id === "resolve") ??
    options[0]
  );
}

export function fasSimulationAction(s: GameState): Action | undefined {
  if (!isFasScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
  // Spend Baggins resources to wake an unconscious character.
  const current = fasCurrentQuest(s);
  const quest = current ? get(s, `quest:${current}`) : undefined;
  if (
    quest &&
    ["planning", "quest", "staging"].includes(s.phase) &&
    availableAbilities(s, quest).some((a) => !a.disabled)
  )
    return { type: "ABILITY", id: quest.id };
  if (s.phase !== "travel") return;
  if (s.activeLocation) return { type: "NEXT" };
  const location = s.staging
    .filter((u) => !canTravel(s, u))
    .sort((a, b) => (card(b.code).threat ?? 0) - (card(a.code).threat ?? 0))[0];
  return location ? { type: "TRAVEL", id: location.id } : { type: "NEXT" };
}
