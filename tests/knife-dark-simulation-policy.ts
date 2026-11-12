import { card } from "../src/game/cards";
import { canCommit, canTravel, characters, stats } from "../src/game/engine";
import { get } from "../src/game/core";
import {
  allCharacters,
  defendersFor,
  firstPlayer,
  seatView,
} from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import { enemyAttackPrevented } from "../src/game/engine";
import { SAGA_FRODO } from "../src/game/lotr-saga-codes";
import { KD, isKdNazgul } from "../src/game/knife-dark-support";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";

export const KD_SCENARIOS = [
  "a-knife-in-the-dark",
] as const satisfies readonly ScenarioId[];
export type KdScenario = (typeof KD_SCENARIOS)[number];
export const isKdScenario = (id: ScenarioId): id is KdScenario =>
  KD_SCENARIOS.some((scenario) => scenario === id);

const room = (s: GameState, id: string) => {
  const u = get(s, id);
  return u ? stats(s, u).health - u.damage : -99;
};
const isAlly = (s: GameState, id: string) => {
  const u = get(s, id);
  return !!u && card(u.code).type_code === "ally";
};
const notFrodo = (s: GameState, o: Option) => get(s, o.id)?.code !== SAGA_FRODO;
const firstThreat = (s: GameState) => seatView(s, firstPlayer(s)).threat;

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function kdSimulationChoice(s: GameState): Option | undefined {
  if (!isKdScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  // Frodo cancels Black Breath and Ringwraiths when he can.
  if (/^Revealed · /.test(title)) {
    const frodo = options.find((o) => o.code === SAGA_FRODO);
    if (frodo && /Black Breath|Ringwraith/.test(title)) return frodo;
    return options.find((o) => o.id === "resolve");
  }
  if (/^Bill Ferny/.test(title))
    return firstThreat(s) < 36
      ? options.find((o) => o.id === "threat")
      : options.find((o) => o.id === "ringwraith");
  if (/^Squint-eyed Southerner/.test(title))
    return options.find((o) => o.id === "ringwraith") ?? options[0];
  if (/^Unwanted Attention ·/.test(title)) return options[0];
  if (/^Unwanted Attention/.test(title))
    return options.find((o) => o.id === "ringwraith") ?? options[0];
  if (/^Into the Wild/.test(title))
    return options.find((o) => o.id === "progress") ?? options[0];
  if (/Lure of the Ring/.test(title))
    return firstThreat(s) < 40
      ? options.find((o) => o.id === "threat")
      : options.find((o) => o.id === "exhaust");
  if (/Piercing Cry/.test(title))
    return options.find((o) => o.id === "staging");
  // Hide the strongest non-unique enemy under Weather Hills.
  if (/^Weather Hills/.test(title))
    return (
      options.find((o) => o.code && isKdNazgul(o.code)) ??
      options.find((o) => o.id !== "skip") ??
      options[0]
    );
  if (/^The Prancing Pony/.test(title))
    return (
      [...options.filter((o) => o.id !== "skip")].sort(
        (a, b) =>
          Number(card(b.code!).cost ?? 0) - Number(card(a.code!).cost ?? 0),
      )[0] ?? options[0]
    );
  // Black Breath goes on the Ring-bearer, who never defends.
  if (/^Black Breath/.test(title))
    return options.find((o) => o.code === SAGA_FRODO) ?? options[0];
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

export function kdSimulationAction(s: GameState): Action | undefined {
  if (!isKdScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
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
    (u) =>
      card(u.code).type_code === "location" &&
      u.code !== KD.weathertop &&
      !canTravel(s, u),
  );
  // The Prancing Pony and Midgewater block the quest; clear them first.
  const blocker = open.find((u) => [KD.pony, KD.midgewater].includes(u.code));
  const location =
    blocker ??
    open.sort(
      (a, b) => (card(b.code).threat ?? 0) - (card(a.code).threat ?? 0),
    )[0];
  return location ? { type: "TRAVEL", id: location.id } : { type: "NEXT" };
}
