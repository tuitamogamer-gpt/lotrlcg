import { card } from "../src/game/cards";
import { canCommit, canTravel, characters, stats } from "../src/game/engine";
import { get } from "../src/game/core";
import { allCharacters, defendersFor } from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import { enemyAttackPrevented } from "../src/game/engine";
import { isRingBearerCode } from "../src/game/lotr-saga-codes";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";

export const RS_SCENARIOS = [
  "the-ring-goes-south",
] as const satisfies readonly ScenarioId[];
export type RsScenario = (typeof RS_SCENARIOS)[number];
export const isRsScenario = (id: ScenarioId): id is RsScenario =>
  RS_SCENARIOS.some((scenario) => scenario === id);

const room = (s: GameState, id: string) => {
  const u = get(s, id);
  return u ? stats(s, u).health - u.damage : -99;
};
const isAlly = (s: GameState, id: string) => {
  const u = get(s, id);
  return !!u && card(u.code).type_code === "ally";
};
const bearer = (s: GameState, id: string) => {
  const u = get(s, id);
  return !!u && isRingBearerCode(u.code);
};

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function rsSimulationChoice(s: GameState): Option | undefined {
  if (!isRsScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  if (/^Revealed · /.test(title))
    return options.find((o) => o.id === "resolve");
  // The Council: play an ally if one is faceup.
  if (/^The Council of Elrond · Choose a card to be played/.test(title))
    return (
      options.find((o) => card(o.code!).type_code === "ally") ?? options[0]
    );
  if (/^The Council of Elrond · The players choose/.test(title))
    return options.find((o) => o.id === "lust") ?? options[0];
  if (/^Frodo Baggins · Response/.test(title))
    return options.find((o) => o.id === "use") ?? options[0];
  if (/^Crebain from Dunland/.test(title))
    return options.find((o) => o.id !== "engage") ?? options[0];
  if (/^Bitter Cold/.test(title))
    return options.find((o) => o.id === "threat") ?? options[0];
  if (/^Storm of Howls · Choose/.test(title))
    return options.find((o) => o.id === "engage") ?? options[0];
  // Never exhaust or damage the Ring-bearer when another choice exists.
  if (/^Tree-crowned Hill|^Eregion · The players discard/.test(title))
    return options.find((o) => !bearer(s, o.id)) ?? options[0];
  if (/^Lust for the Ring/.test(title))
    return (
      [...options].sort((a, b) => room(s, b.id) - room(s, a.id))[0] ??
      options[0]
    );
  if (
    /Assign.*damage|damage.*hero|damage.*character/i.test(title) &&
    options.some((o) => get(s, o.id))
  )
    return (
      [...options.filter((o) => get(s, o.id) && !bearer(s, o.id))].sort(
        (a, b) => room(s, b.id) - room(s, a.id),
      )[0] ?? options[0]
    );
  // Chump attacks with allies.
  if (/Immediate attack/i.test(title)) {
    const ally = options.find((o) => isAlly(s, o.id));
    if (ally) return ally;
    return (
      [...options.filter((o) => get(s, o.id) && !bearer(s, o.id))].sort(
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

export function rsSimulationAction(s: GameState): Action | undefined {
  if (!isRsScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
  if (s.phase === "defense") {
    const enemy = engagedEnemies(s).find(
      (u) => normalAttackPending(s, u) && !enemyAttackPrevented(s, u),
    );
    if (enemy) {
      const candidates = defendersFor(s, enemy);
      const ally = candidates.find((u) => card(u.code).type_code === "ally");
      // The Ring-bearer defends when his response can cancel the damage.
      const frodo = candidates.find(
        (u) => isRingBearerCode(u.code) && u.resources > 0,
      );
      const defender =
        ally ??
        frodo ??
        [...candidates]
          .filter((u) => !isRingBearerCode(u.code))
          .sort((a, b) => stats(s, b).defense - stats(s, a).defense)[0];
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
  const open = s.staging.filter(
    (u) => card(u.code).type_code === "location" && !canTravel(s, u),
  );
  // Travel to the least threatening location when travel is required.
  const location = [...open].sort(
    (a, b) => (card(a.code).quest ?? 0) - (card(b.code).quest ?? 0),
  )[0];
  return location ? { type: "TRAVEL", id: location.id } : { type: "NEXT" };
}
