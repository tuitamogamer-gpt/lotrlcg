import { card } from "../src/game/cards";
import {
  availableAbilities,
  canCommit,
  canTravel,
  characters,
  stats,
} from "../src/game/engine";
import { optionalEngagementProblem } from "../src/game/actions";
import { get, stagingThreat } from "../src/game/core";
import {
  activeSeat,
  allCharacters,
  attackersFor,
  defendersFor,
  globalEngaged,
  ownerOf,
} from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import { enemyAttackPrevented } from "../src/game/engine";
import { LAND_SHADOW_FRODO } from "../src/game/lotr-saga-codes";
import {
  JTC,
  JTC_BLACK_GATE_BASE,
  JTC_CROSSROADS_PROGRESS,
} from "../src/game/cross-roads-support";
import type {
  Action,
  GameState,
  Option,
  ScenarioId,
  Unit,
} from "../src/game/types";

export const JTC_SCENARIOS = [
  "journey-to-the-cross-roads",
] as const satisfies readonly ScenarioId[];
export type JtcScenario = (typeof JTC_SCENARIOS)[number];
export const isJtcScenario = (id: ScenarioId): id is JtcScenario =>
  JTC_SCENARIOS.some((scenario) => scenario === id);

const room = (s: GameState, id: string) => {
  const u = get(s, id);
  return u ? stats(s, u).health - u.damage : -99;
};
const isAlly = (s: GameState, id: string) => {
  const u = get(s, id);
  return !!u && card(u.code).type_code === "ally";
};
/** Frodo must survive: if the Ring-bearer is destroyed, the players lose. */
const precious = (s: GameState, id: string) =>
  get(s, id)?.code === LAND_SHADOW_FRODO;
const isLocation = (code: string) => card(code).type_code === "location";
const isHarad = (u: Unit) =>
  card(u.code).type_code === "enemy" &&
  (card(u.code).traits ?? "").includes("Harad");
const players = (s: GameState) =>
  s.table ? s.table.seats.filter((x) => !x.eliminated).length : 1;
/** How many more Harad enemies The Black Gate can take before the players lose. */
const gateMargin = (s: GameState) =>
  JTC_BLACK_GATE_BASE +
  players(s) -
  1 -
  (s.crossRoads?.underBlackGate.length ?? 0);
const attackOf = (s: GameState, id: string) => {
  const u = get(s, id) ?? s.staging.find((x) => x.id === id);
  return u ? stats(s, u).attack : 99;
};

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function jtcSimulationChoice(s: GameState): Option | undefined {
  if (!isJtcScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  if (/^Revealed · /.test(title))
    return options.find((o) => o.id === "resolve");
  // Setup: the location with the least threat.
  if (/^Ambush the Men of Harad · Add a location/.test(title))
    return (
      [...options].sort(
        (a, b) => (card(a.code!).threat ?? 0) - (card(b.code!).threat ?? 0),
      )[0] ?? options[0]
    );
  // Foothills of Ephel Dúath: the Harad enemy with the lowest attack, which
  // would otherwise go under The Black Gate.
  if (/^Foothills of Ephel Dúath · Engage an enemy/.test(title))
    return (
      [...options].sort(
        (a, b) =>
          Number(
            isHarad(get(s, b.id) ?? s.staging.find((x) => x.id === b.id)!),
          ) -
            Number(
              isHarad(get(s, a.id) ?? s.staging.find((x) => x.id === a.id)!),
            ) || attackOf(s, a.id) - attackOf(s, b.id),
      )[0] ?? options[0]
    );
  // The Dark Lord's Summons: the Men of Harad must leave The Cross-roads, so
  // reveal one unless the engaged enemies are already too many.
  if (/^The Dark Lord's Summons · Choose one/.test(title)) {
    const crowded = s.engaged.length >= 2 && gateMargin(s) > 1;
    return (
      options.find((o) => o.id === (crowded ? "gate" : "cross-roads")) ??
      options[0]
    );
  }
  // Marching Up the Road: a weak Harad enemy from the deck while The Black
  // Gate is close to full, otherwise return the strongest engaged enemy.
  if (/^Marching Up the Road · Choose one/.test(title)) {
    const returns = options.filter((o) => o.id.startsWith("return-"));
    const deck = options
      .filter((o) => o.id.startsWith("deck-"))
      .sort(
        (a, b) => (card(a.code!).attack ?? 0) - (card(b.code!).attack ?? 0),
      );
    if (returns.length && (gateMargin(s) > 1 || !deck.length))
      return [...returns].sort(
        (a, b) => (card(b.code!).attack ?? 0) - (card(a.code!).attack ?? 0),
      )[0];
    return deck[0] ?? options[0];
  }
  // Fierce Southrons: the immediate attacks when they are few and weak.
  if (/^Fierce Southrons · Choose one/.test(title)) {
    const attack = s.staging
      .filter((u) => card(u.code).type_code === "enemy")
      .reduce((n, u) => n + stats(s, u).attack, 0);
    const gate = options.find((o) => o.id === "gate");
    return attack <= 3 || !gate || gateMargin(s) <= 1
      ? (options.find((o) => o.id === "attack") ?? options[0])
      : gate;
  }
  // Arrows Thick in the Air's shadow: no second attack while The Black Gate has room.
  if (/^Arrows Thick in the Air · Choose one/.test(title))
    return (
      options.find((o) => o.id === (gateMargin(s) > 1 ? "gate" : "again")) ??
      options[0]
    );
  // Ithilien Woods: the best defender.
  if (/^Ithilien Woods · Ready a character/.test(title))
    return (
      [...options].sort(
        (a, b) =>
          (get(s, b.id) ? stats(s, get(s, b.id)!).defense : 0) -
          (get(s, a.id) ? stats(s, get(s, a.id)!).defense : 0),
      )[0] ?? options[0]
    );
  if (
    /Assign.*damage|damage.*hero|damage.*character/i.test(title) &&
    options.some((o) => get(s, o.id))
  )
    return (
      [...options.filter((o) => get(s, o.id) && !precious(s, o.id))].sort(
        (a, b) => room(s, b.id) - room(s, a.id),
      )[0] ?? options[0]
    );
  // Chump attacks with allies, never with Frodo.
  if (/Immediate attack/i.test(title)) {
    const ally = options.find((o) => isAlly(s, o.id));
    if (ally) return ally;
    return (
      [...options.filter((o) => get(s, o.id) && !precious(s, o.id))].sort(
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

const frodoAbility = (s: GameState, u: Unit) =>
  availableAbilities(s, u).some(
    (a) => a.label.startsWith("Frodo Baggins") && !a.disabled,
  );
/** The order the players prefer locations in. */
function travelRank(s: GameState, u: Unit) {
  if (u.code === JTC.crossroads) return 0;
  if (u.code === JTC.foothills && s.staging.some(isHarad)) return 1;
  if (u.code === JTC.southward) return 2;
  if (u.code === JTC.henneth && !globalEngaged(s).length) return 3;
  if (u.code === JTC.hills) return 4;
  return 5;
}

export function jtcSimulationAction(s: GameState): Action | undefined {
  if (!isJtcScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
  // Before the quest resolves, Frodo uses The One Ring when it turns the quest.
  if (s.phase === "staging") {
    const frodo = s.heroes.find((h) => h.code === LAND_SHADOW_FRODO);
    if (frodo && frodo.committed && frodoAbility(s, frodo)) {
      const will = characters(s)
        .filter((u) => u.committed)
        .reduce((n, u) => n + stats(s, u).will, 0);
      const short = stagingThreat(s) - will;
      if (short >= 0 && short < 2) return { type: "ABILITY", id: frodo.id };
    }
  }
  // The encounter phase: engage the weakest Harad enemy in the staging
  // area, which would otherwise go under The Black Gate.
  if (s.phase === "encounter") {
    const harad = s.staging
      .filter((u) => isHarad(u) && !optionalEngagementProblem(s, u))
      .sort((a, b) => stats(s, a).attack - stats(s, b).attack);
    const engaged = s.engaged.length;
    const weakest = harad[0];
    if (weakest && (engaged < 2 || gateMargin(s) <= 1))
      return { type: "ENGAGE", id: weakest.id };
    return;
  }
  if (s.phase === "defense") {
    const enemy = engagedEnemies(s).find(
      (u) => normalAttackPending(s, u) && !enemyAttackPrevented(s, u),
    );
    if (enemy) {
      const candidates = defendersFor(s, enemy);
      const ally = candidates.find((u) => card(u.code).type_code === "ally");
      const attack = stats(s, enemy).attack;
      const survives = (u: (typeof candidates)[number]) =>
        stats(s, u).health - u.damage > attack - stats(s, u).defense;
      // Frodo never defends: a shadow card could destroy him.
      const defender =
        ally ??
        [...candidates]
          .filter((u) => !precious(s, u.id))
          .sort(
            (a, b) =>
              Number(survives(b)) - Number(survives(a)) ||
              stats(s, b).defense - stats(s, a).defense,
          )[0];
      return {
        type: "DEFEND",
        enemyId: enemy.id,
        defenderId: defender?.id ?? null,
      };
    }
  }
  if (s.phase === "attack") {
    const p = activeSeat(s);
    const targets = engagedEnemies(s)
      .filter((e) => !e.attackedBy?.includes(p))
      .map((e) => {
        const attackers = attackersFor(s, e).filter(
          (u) => ownerOf(s, u) === p && !precious(s, u.id),
        );
        const damage =
          attackers.reduce((n, u) => n + stats(s, u).attack, 0) -
          stats(s, e).defense;
        return { e, attackers, damage };
      })
      .filter((t) => t.attackers.length && t.damage > 0)
      .sort(
        (a, b) =>
          stats(s, a.e).health -
          a.e.damage -
          a.damage -
          (stats(s, b.e).health - b.e.damage - b.damage),
      );
    const best = targets[0];
    return best
      ? {
          type: "ATTACK",
          enemyId: best.e.id,
          attackerIds: best.attackers.map((u) => u.id),
        }
      : { type: "END_ATTACKS" };
  }
  if (s.phase === "quest") {
    // Commit enough willpower for the staging area and the coming reveals,
    // and progress toward the 20 the stage needs (or the active location);
    // the others stay ready to defend and to attack.
    const needed =
      s.activeLocation?.code === JTC.crossroads
        ? 9
        : Math.max(3, JTC_CROSSROADS_PROGRESS - s.progress);
    const target = stagingThreat(s) + 2 * players(s) + Math.min(needed, 6);
    const committed = characters(s)
      .filter((u) => s.committedIds.includes(u.id))
      .reduce((n, u) => n + stats(s, u).will, 0);
    const own = characters(s)
      .filter(
        (u) =>
          canCommit(s, u) &&
          stats(s, u).will > 0 &&
          !s.committedIds.includes(u.id) &&
          !(u.code === LAND_SHADOW_FRODO && u.damage > 0),
      )
      .sort(
        (a, b) =>
          stats(s, b).will -
            stats(s, b).attack -
            (stats(s, a).will - stats(s, a).attack) ||
          stats(s, b).will - stats(s, a).will,
      );
    const guard = [...characters(s)]
      .filter((u) => !precious(s, u.id))
      .sort((a, b) => stats(s, b).defense - stats(s, a).defense)[0];
    const next = own.find((u) => u.id !== guard?.id);
    return next && committed < target
      ? { type: "TOGGLE_QUEST", id: next.id }
      : { type: "COMMIT" };
  }
  if (s.phase !== "travel" || s.activeLocation) return;
  const open = s.staging.filter((u) => isLocation(u.code) && !canTravel(s, u));
  const location = [...open].sort(
    (a, b) =>
      travelRank(s, a) - travelRank(s, b) ||
      (card(b.code).threat ?? 0) - (card(a.code).threat ?? 0),
  )[0];
  return location ? { type: "TRAVEL", id: location.id } : { type: "NEXT" };
}

/**
 * A late-game start: the Men of Harad have all left The Cross-roads and were
 * defeated (they are in the encounter discard pile), and stage 1B has its 20
 * progress, so the players can travel to The Cross-roads and win by
 * exploring it. Every physical card stays in a legal zone.
 */
export function jtcCrossroadsReady(s: GameState) {
  const q = s.crossRoads!;
  s.encounterDiscard.push(...q.underCrossroads);
  q.underCrossroads = [];
  s.progress = JTC_CROSSROADS_PROGRESS;
}
