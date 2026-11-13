import { card } from "../src/game/cards";
import {
  canCommit,
  canPlay,
  canTravel,
  characters,
  stats,
} from "../src/game/engine";
import { get, objectiveFree } from "../src/game/core";
import { availableAbilities } from "../src/game/actions";
import { allCharacters, defendersFor } from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import { enemyAttackPrevented } from "../src/game/engine";
import { SE, isMidnight } from "../src/game/stone-erech-support";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";

export const SE_SCENARIOS = [
  "the-stone-of-erech",
] as const satisfies readonly ScenarioId[];
export type SeScenario = (typeof SE_SCENARIOS)[number];
export const isSeScenario = (id: ScenarioId): id is SeScenario =>
  SE_SCENARIOS.some((scenario) => scenario === id);

const room = (s: GameState, id: string) => {
  const u = get(s, id);
  return u ? stats(s, u).health - u.damage : -99;
};
const isAlly = (s: GameState, id: string) => {
  const u = get(s, id);
  return !!u && card(u.code).type_code === "ally";
};
/** Battle at Midnight on 3B: characters quest with their attack. */
const battle = (s: GameState) => s.stage === 3 && isMidnight(s);

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function seSimulationChoice(s: GameState): Option | undefined {
  if (!isSeScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  if (/^Revealed · /.test(title))
    return options.find((o) => o.id === "resolve");
  // Tarlang's Neck: engage a lone weak enemy, otherwise end the encounter phase.
  if (/^Tarlang's Neck/.test(title)) {
    const enemies = s.staging.filter((u) => card(u.code).type_code === "enemy");
    return enemies.length === 1 && stats(s, enemies[0]).attack <= 3
      ? options.find((o) => o.id === "engage")
      : options.find((o) => o.id === "end");
  }
  if (/^Terror of the Dead/.test(title))
    return options.find(
      (o) => o.id === (s.round % 2 ? "planning" : "resources"),
    );
  if (/^Groping Horror/.test(title))
    return options.find((o) => o.id === "travel") ?? options[0];
  // Driven by Fear: the hero with the least willpower.
  if (/^Driven by Fear/.test(title))
    return [...options].sort((a, b) => {
      const ua = get(s, a.id),
        ub = get(s, b.id);
      return (ua ? stats(s, ua).will : 99) - (ub ? stats(s, ub).will : 99);
    })[0];
  if (
    /Assign.*damage|damage.*hero|damage.*character/i.test(title) &&
    options.some((o) => get(s, o.id))
  )
    return (
      [
        ...options.filter(
          (o) => get(s, o.id) && get(s, o.id)!.code !== SE.derufin,
        ),
      ].sort((a, b) => room(s, b.id) - room(s, a.id))[0] ?? options[0]
    );
  // Chump attacks with allies other than Derufin.
  if (/Immediate attack/i.test(title)) {
    const ally = options.find(
      (o) => isAlly(s, o.id) && get(s, o.id)?.code !== SE.derufin,
    );
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

export function seSimulationAction(s: GameState): Action | undefined {
  if (!isSeScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
  if (s.phase === "planning") {
    // Relic from the Dark Years at Midnight.
    const relic = s.staging.find(
      (u) => u.code === SE.relic && objectiveFree(s, u),
    );
    if (relic && s.heroes.length)
      return { type: "CLAIM", id: relic.id, heroId: s.heroes[0].id };
    // Haunted Valley: exhaust a rich hero to pay for an ally.
    const valley = s.staging.find((u) => u.code === SE.haunted);
    const rich = s.heroes.find((h) => !h.exhausted && h.resources >= 2);
    if (
      valley &&
      rich &&
      s.hand.some(
        (u) => card(u.code).type_code === "ally" && canPlay(s, u) !== null,
      ) &&
      availableAbilities(s, valley).some((a) => !a.disabled)
    )
      return { type: "ABILITY", id: valley.id };
  }
  if (s.phase === "defense") {
    const enemy = engagedEnemies(s).find(
      (u) => normalAttackPending(s, u) && !enemyAttackPrevented(s, u),
    );
    if (enemy) {
      const candidates = defendersFor(s, enemy).filter(
        (u) => u.code !== SE.derufin,
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
    // Keep the best defender back; quest with attack in a Midnight battle.
    const own = characters(s);
    const guard = [...own].sort(
      (a, b) => stats(s, b).defense - stats(s, a).defense,
    )[0];
    const ready = own.find(
      (u) =>
        u.id !== guard?.id &&
        canCommit(s, u) &&
        !s.committedIds.includes(u.id) &&
        (battle(s) ? stats(s, u).attack : stats(s, u).will) > 0,
    );
    return ready ? { type: "TOGGLE_QUEST", id: ready.id } : { type: "COMMIT" };
  }
  if (s.phase !== "travel") return;
  if (s.activeLocation) return { type: "NEXT" };
  const open = s.staging.filter(
    (u) => card(u.code).type_code === "location" && !canTravel(s, u),
  );
  // The Stone of Erech brings Derufin under the players' control.
  const key = open.find((u) => [SE.stone, SE.neck].includes(u.code));
  const location =
    key ??
    open.sort(
      (a, b) => (card(b.code).threat ?? 0) - (card(a.code).threat ?? 0),
    )[0];
  return location ? { type: "TRAVEL", id: location.id } : { type: "NEXT" };
}
