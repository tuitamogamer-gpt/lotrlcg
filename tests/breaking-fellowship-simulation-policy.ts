import { card } from "../src/game/cards";
import { canCommit, canTravel, characters, stats } from "../src/game/engine";
import { get } from "../src/game/core";
import {
  allCharacters,
  defendersFor,
  forOwner,
  playerOrder,
} from "../src/game/table";
import { ringBearer } from "../src/game/lotr-saga";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import { enemyAttackPrevented } from "../src/game/engine";
import { isRingBearerCode } from "../src/game/lotr-saga-codes";
import { BF } from "../src/game/breaking-fellowship-support";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";

export const BF_SCENARIOS = [
  "breaking-of-the-fellowship",
] as const satisfies readonly ScenarioId[];
export type BfScenario = (typeof BF_SCENARIOS)[number];
export const isBfScenario = (id: ScenarioId): id is BfScenario =>
  BF_SCENARIOS.some((scenario) => scenario === id);

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
export function bfSimulationChoice(s: GameState): Option | undefined {
  if (!isBfScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  if (/^Revealed · /.test(title))
    return options.find((o) => o.id === "resolve");
  if (/^Frodo Baggins · Response/.test(title))
    return options.find((o) => o.id === "use") ?? options[0];
  // Growing Threat: move an engaged enemy away rather than gain doomed 2.
  if (/^Growing Threat · Choose/.test(title))
    return options.find((o) => o.id !== "doomed") ?? options[0];
  // Uruk-hai Hunter: reveal a card rather than take an attack.
  if (/^Uruk-hai Hunter · Choose/.test(title))
    return options.find((o) => o.id.startsWith("reveal-")) ?? options[0];
  // Fallen into Evil: never the Ring-bearer's controller's strongest hero.
  if (/^Fallen into Evil/.test(title))
    return (
      [...options].sort(
        (a, b) =>
          (card(a.code!).willpower ?? 0) - (card(b.code!).willpower ?? 0),
      )[0] ?? options[0]
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

export function bfSimulationAction(s: GameState): Action | undefined {
  if (!isBfScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
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
  if (s.phase !== "travel" || s.activeLocation) return;
  const open = s.staging.filter(
    (u) => card(u.code).type_code === "location" && !canTravel(s, u),
  );
  // Sarn Gebir and The Argonath stand between the players and stage 2;
  // otherwise travel to the location with the fewest quest points.
  const location =
    open.find((u) => u.code === BF.sarn || u.code === BF.argonath) ??
    [...open].sort(
      (a, b) => (card(a.code).quest ?? 0) - (card(b.code).quest ?? 0),
    )[0];
  return location ? { type: "TRAVEL", id: location.id } : { type: "NEXT" };
}

/**
 * A late-game start for the split matrix: The Argonath and Sarn Gebir have
 * been explored (victory display), stage 1 is defeated and 2A has removed
 * the Ring-bearer from the game, so stage 2B separates the players at the
 * end of the round. Every physical card stays in a legal zone.
 */
export function bfStageTwo(s: GameState) {
  const q = s.breakingFellowship!;
  for (const code of [BF.argonath, BF.sarn]) {
    const u = s.staging.find((x) => x.code === code);
    if (!u) continue;
    s.staging = s.staging.filter((x) => x.id !== u.id);
    (s.victoryCards ??= []).push(code);
    s.victory += card(code).victory ?? 0;
  }
  s.stage = 2;
  s.progress = 0;
  q.currentQuest = BF.divided;
  const bearer = ringBearer(s);
  if (bearer) {
    for (const p of playerOrder(s))
      forOwner(s, p, () => {
        s.heroes = s.heroes.filter((h) => h.id !== bearer.id);
      });
    q.ringBearerOut = bearer;
  }
}
