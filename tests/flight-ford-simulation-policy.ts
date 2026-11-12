import { card } from "../src/game/cards";
import { canCommit, canTravel, characters, stats } from "../src/game/engine";
import { get } from "../src/game/core";
import { allCharacters, defendersFor } from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import { enemyAttackPrevented } from "../src/game/engine";
import { SAGA_FRODO } from "../src/game/lotr-saga-codes";
import { FF } from "../src/game/flight-ford-support";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";

export const FF_SCENARIOS = [
  "flight-to-the-ford",
] as const satisfies readonly ScenarioId[];
export type FfScenario = (typeof FF_SCENARIOS)[number];
export const isFfScenario = (id: ScenarioId): id is FfScenario =>
  FF_SCENARIOS.some((scenario) => scenario === id);

const room = (s: GameState, id: string) => {
  const u = get(s, id);
  return u ? stats(s, u).health - u.damage : -99;
};
const isAlly = (s: GameState, id: string) => {
  const u = get(s, id);
  return !!u && card(u.code).type_code === "ally";
};
const notFrodo = (s: GameState, o: Option) => get(s, o.id)?.code !== SAGA_FRODO;
const life = (s: GameState) => s.flightFord?.life ?? 15;

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function ffSimulationChoice(s: GameState): Option | undefined {
  if (!isFfScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  // Frodo cancels The Enemy is Upon Us! and Pain Assailed Him when he can.
  if (/^Revealed · /.test(title)) {
    const frodo = options.find((o) => o.code === SAGA_FRODO);
    if (frodo && /Enemy is Upon Us|Pain Assailed Him/.test(title)) return frodo;
    return options.find((o) => o.id === "resolve");
  }
  // Spend the Ring-bearer's life on Fell Riders while it is healthy.
  if (/^Fell Rider/.test(title))
    return life(s) > 8
      ? options.find((o) => o.id === "life")
      : options.find((o) => o.id === "engage");
  if (/^Stricken Dumb/.test(title))
    return options.find((o) => o.id === "burden") ?? options[0];
  if (/^Weight of the Ring/.test(title))
    return options.find((o) => o.id === "reveal") ?? options[0];
  if (/^Fear of Discovery/.test(title))
    return options.find((o) => o.id === "exhaust") ?? options[0];
  // Eaten Alive!: never on the Ring-bearer.
  if (/^Eaten Alive!/.test(title))
    return (
      [...options.filter((o) => notFrodo(s, o))].sort(
        (a, b) => room(s, b.id) - room(s, a.id),
      )[0] ?? options[0]
    );
  if (/Piercing Cry/.test(title))
    return options.find((o) => o.id === "staging");
  if (
    /Assign.*damage|damage.*hero|damage.*character/i.test(title) &&
    options.some((o) => get(s, o.id))
  )
    return (
      [...options.filter((o) => get(s, o.id) && notFrodo(s, o))].sort(
        (a, b) => room(s, b.id) - room(s, a.id),
      )[0] ?? options[0]
    );
  // Chump attacks with allies; never defend with the Ring-bearer.
  if (/Immediate attack/i.test(title)) {
    const ally = options.find((o) => isAlly(s, o.id));
    if (ally) return ally;
    return (
      [...options.filter((o) => get(s, o.id) && notFrodo(s, o))].sort(
        (a, b) => {
          const ua = units.find((u) => u.id === a.id)!;
          const ub = units.find((u) => u.id === b.id)!;
          return stats(s, ub).defense - stats(s, ua).defense;
        },
      )[0] ??
      options.find((o) => o.id === "undefended") ??
      options[0]
    );
  }
  if (/Panicked · Exhaust/.test(title))
    return options.find((o) => notFrodo(s, o)) ?? options[0];
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

export function ffSimulationAction(s: GameState): Action | undefined {
  if (!isFfScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
  if (s.phase === "defense") {
    const enemy = engagedEnemies(s).find(
      (u) => normalAttackPending(s, u) && !enemyAttackPrevented(s, u),
    );
    if (enemy) {
      const candidates = defendersFor(s, enemy).filter(
        (u) => u.code !== SAGA_FRODO,
      );
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
    // Keep the best defender back; the Ring-bearer always quests.
    const own = characters(s);
    const guard = [...own]
      .filter((u) => u.code !== SAGA_FRODO)
      .sort((a, b) => stats(s, b).defense - stats(s, a).defense)[0];
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
  // The Last Bridge and the Ford of Bruinen decide the race.
  const key = open.find((u) => [FF.bridge, FF.ford].includes(u.code));
  const location =
    key ??
    open.sort(
      (a, b) => (card(b.code).threat ?? 0) - (card(a.code).threat ?? 0),
    )[0];
  return location ? { type: "TRAVEL", id: location.id } : { type: "NEXT" };
}
