import { card } from "../src/game/cards";
import { canCommit, canTravel, characters, stats } from "../src/game/engine";
import { get } from "../src/game/core";
import { allCharacters, defendersFor } from "../src/game/table";
import { shuffle } from "../src/game/core";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import { enemyAttackPrevented } from "../src/game/engine";
import { isRingBearerCode } from "../src/game/lotr-saga-codes";
import { FB } from "../src/game/fog-barrow-support";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";

export const FB_SCENARIOS = [
  "fog-on-the-barrow-downs",
] as const satisfies readonly ScenarioId[];
export type FbScenario = (typeof FB_SCENARIOS)[number];
export const isFbScenario = (id: ScenarioId): id is FbScenario =>
  FB_SCENARIOS.some((scenario) => scenario === id);

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
export function fbSimulationChoice(s: GameState): Option | undefined {
  if (!isFbScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  if (/^Revealed · /.test(title))
    return options.find((o) => o.id === "resolve");
  if (/^Frodo Baggins · Response/.test(title))
    return options.find((o) => o.id === "use") ?? options[0];
  // The weakest Wight when a search puts one into play.
  if (/^(Long Groping Arm|Hollow Circle) · Put a Wight/.test(title))
    return (
      [...options].sort(
        (a, b) => (card(a.code!).attack ?? 0) - (card(b.code!).attack ?? 0),
      )[0] ?? options[0]
    );
  // A Great Barrow from the deck rather than the victory display.
  if (/^Standing Stones · Add a Great Barrow/.test(title))
    return options.find((o) => o.id !== "victory") ?? options[0];
  // The cheapest ally goes under an Ancient Barrow or is discarded.
  if (/^(Ancient Barrow|Trapped Inside a Barrow) · /.test(title))
    return (
      [...options].sort(
        (a, b) =>
          (Number(card(a.code!).cost) || 0) - (Number(card(b.code!).cost) || 0),
      )[0] ?? options[0]
    );
  // Dreadful Song on the hero with the least willpower.
  if (/^Dreadful Song · /.test(title))
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

export function fbSimulationAction(s: GameState): Action | undefined {
  if (!isFbScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
  if (s.phase === "defense") {
    const enemy = engagedEnemies(s).find(
      (u) => normalAttackPending(s, u) && !enemyAttackPrevented(s, u),
    );
    if (enemy) {
      const candidates = defendersFor(s, enemy);
      const ally = candidates.find((u) => card(u.code).type_code === "ally");
      const defender =
        ally ??
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
  // Hollow Circle and Standing Stones are needed to defeat stages 2 and 3;
  // otherwise travel to the location with the fewest quest points.
  const location =
    open.find((u) => u.code === FB.hollow || u.code === FB.standing) ??
    [...open].sort(
      (a, b) => (card(a.code).quest ?? 0) - (card(b.code).quest ?? 0),
    )[0];
  return location ? { type: "TRAVEL", id: location.id } : { type: "NEXT" };
}

/**
 * A late-game start for the stage 3 matrix: Hollow Circle has been explored
 * (victory display), stage 2 is defeated and 3A has put Standing Stones in
 * the staging area and shuffled each Great Barrow into the encounter deck.
 * Every physical card stays in a legal zone.
 */
export function fbStageThree(s: GameState) {
  const q = s.fogBarrow!;
  const take = (code: string) => {
    const i = q.setAside.indexOf(code);
    if (i >= 0) q.setAside.splice(i, 1);
    return i >= 0;
  };
  if (take(FB.hollow)) {
    (s.victoryCards ??= []).push(FB.hollow);
    s.victory += card(FB.hollow).victory ?? 0;
  }
  if (take(FB.standing))
    s.staging.push({
      id: `c${s.nextId++}`,
      code: FB.standing,
      exhausted: false,
      damage: 0,
      progress: 0,
      resources: 0,
      committed: false,
      attachments: [],
      boost: 0,
      attacked: false,
      shadows: [],
    });
  const barrows = q.setAside.filter((c) => c === FB.great);
  q.setAside = q.setAside.filter((c) => c !== FB.great);
  s.encounterDeck.push(...barrows);
  shuffle(s, s.encounterDeck);
  s.stage = 3;
  s.progress = 0;
  q.currentQuest = FB.lost;
}
