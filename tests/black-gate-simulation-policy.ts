import { card } from "../src/game/cards";
import { canCommit, canTravel, characters, stats } from "../src/game/engine";
import { get, stagingThreat } from "../src/game/core";
import {
  activeSeat,
  allCharacters,
  attackersFor,
  defendersFor,
  ownerOf,
} from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import { enemyAttackPrevented } from "../src/game/engine";
import { MOUNTAIN_FIRE_ARAGORN } from "../src/game/lotr-saga-codes";
import { BG } from "../src/game/black-gate-support";
import { mountainFirePlayerAbilityProblem } from "../src/game/mountain-fire-player-cards";
import type {
  Action,
  GameState,
  Option,
  ScenarioId,
  Unit,
} from "../src/game/types";

export const BG_SCENARIOS = [
  "the-black-gate-opens",
] as const satisfies readonly ScenarioId[];
export type BgScenario = (typeof BG_SCENARIOS)[number];
export const isBgScenario = (id: ScenarioId): id is BgScenario =>
  BG_SCENARIOS.some((scenario) => scenario === id);

const room = (s: GameState, id: string) => {
  const u = get(s, id);
  return u ? stats(s, u).health - u.damage : -99;
};
/** Aragorn must survive: if he leaves play the players lose. */
const precious = (s: GameState, id: string) =>
  get(s, id)?.code === MOUNTAIN_FIRE_ARAGORN;
const isLocation = (code: string) => card(code).type_code === "location";
const pick = (options: Option[], ...ids: string[]) => {
  for (const id of ids) {
    const option = options.find((o) => o.id === id);
    if (option) return option;
  }
  return undefined;
};
const players = (s: GameState) =>
  s.table ? s.table.seats.filter((x) => !x.eliminated).length : 1;
const menace = (code: string) =>
  (card(code).attack ?? 0) + (card(code).threat ?? 0);
const weakest = (options: Option[]) =>
  [...options].sort((a, b) => menace(a.code ?? "") - menace(b.code ?? ""))[0];
const strongest = (options: Option[]) =>
  [...options].sort((a, b) => menace(b.code ?? "") - menace(a.code ?? ""))[0];

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function bgSimulationChoice(s: GameState): Option | undefined {
  if (!isBgScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  const unit = (o: Option) => units.find((u) => u.id === o.id);
  if (/^Revealed · /.test(title))
    return options.find((o) => o.id === "resolve");
  // The embassy: a free card for a location, never for an enemy or a treachery.
  if (/^Embassy from The Dark Tower · /.test(title)) {
    const reveal = options.find((o) => o.id === "reveal");
    return reveal && isLocation(reveal.code ?? "")
      ? reveal
      : pick(options, "discard");
  }
  if (/Search for a different Orc, Troll or Nazgûl enemy/.test(title))
    return weakest(options);
  if (/^Hell-hawk · Choose one/.test(title))
    return pick(options, "attach", "search");
  if (/^Gwaihir · Choose one/.test(title))
    return (
      options.find(
        (o) => o.id.startsWith("discard-") && menace(o.code ?? "") >= 8,
      ) ?? pick(options, "control")
    );
  if (/^The Hour of Doom · Choose one/.test(title)) {
    const threat = options.find((o) => o.id === "threat");
    return threat && s.threat <= 70
      ? threat
      : (options.find((o) => o.id.startsWith("discard-")) ?? options[0]);
  }
  if (/^Nazgûl of Mordor · Choose one/.test(title))
    return pick(options, "return", "threat");
  if (/^Reeking Moat · /.test(title)) return strongest(options);
  if (
    /^(Beleaguered Hills|Onslaught of Mordor) · Engage a non-unique enemy/.test(
      title,
    )
  )
    return weakest(options);
  if (/Remove a questing character you control from the quest/.test(title))
    return [...options].sort((a, b) => {
      const ua = unit(a),
        ub = unit(b);
      return ua && ub ? stats(s, ua).will - stats(s, ub).will : 0;
    })[0];
  if (/Discard a non-objective attachment/.test(title)) return options[0];
  if (
    /Assign.*damage|damage.*hero|damage.*character|Deal 1 damage/i.test(
      title,
    ) &&
    options.some((o) => get(s, o.id))
  )
    return (
      [...options.filter((o) => get(s, o.id) && !precious(s, o.id))].sort(
        (a, b) => room(s, b.id) - room(s, a.id),
      )[0] ?? options[0]
    );
  // Immediate attacks: a defender that survives, else another character with
  // the best defense, never Aragorn.
  if (/Immediate attack/i.test(title)) {
    const enemy = s.combat ? get(s, s.combat.enemyId) : undefined;
    const attack = enemy
      ? stats(s, enemy).attack + (s.combat?.attackBonus ?? 0)
      : 0;
    const candidates = options.filter((o) => unit(o));
    const survives = (o: Option) =>
      stats(s, unit(o)!).health - unit(o)!.damage >
      attack - stats(s, unit(o)!).defense;
    const byDefense = (a: Option, b: Option) =>
      stats(s, unit(b)!).defense - stats(s, unit(a)!).defense;
    return (
      [...candidates.filter(survives)].sort(byDefense)[0] ??
      [...candidates.filter((o) => !precious(s, o.id))].sort(byDefense)[0] ??
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

/** The order the players prefer locations in. */
function travelRank(u: Unit) {
  // Reeking Moat hides an enemy; Beleaguered Hills and the Slopes bring enemies.
  if (u.code === BG.moat) return 0;
  if (u.code === BG.hills || u.code === BG.slopes) return 3;
  if (u.code === BG.towers) return 2;
  return 1;
}

export function bgSimulationAction(s: GameState): Action | undefined {
  if (!isBgScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
  // Aragorn readies himself once per phase to defend or attack.
  if (s.phase === "defense" || s.phase === "attack") {
    const aragorn = allCharacters(s).find(
      (u) =>
        u.code === MOUNTAIN_FIRE_ARAGORN &&
        ownerOf(s, u) === activeSeat(s) &&
        u.exhausted,
    );
    if (aragorn && !mountainFirePlayerAbilityProblem(s, aragorn))
      return { type: "ABILITY", id: aragorn.id };
  }
  if (s.phase === "defense") {
    const enemy = engagedEnemies(s).find(
      (u) => normalAttackPending(s, u) && !enemyAttackPrevented(s, u),
    );
    if (enemy) {
      const candidates = defendersFor(s, enemy);
      const attack = stats(s, enemy).attack;
      const survives = (u: (typeof candidates)[number]) =>
        stats(s, u).health - u.damage > attack - stats(s, u).defense;
      const defender = [...candidates]
        .filter((u) => !precious(s, u.id) || survives(u))
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
        const attackers = attackersFor(s, e).filter((u) => ownerOf(s, u) === p);
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
    // Commit enough willpower for the staging area and some progress; the
    // best defender stays back.
    const target = stagingThreat(s) + 2 * players(s);
    const committed = characters(s)
      .filter((u) => s.committedIds.includes(u.id))
      .reduce((n, u) => n + stats(s, u).will, 0);
    const own = characters(s)
      .filter(
        (u) =>
          canCommit(s, u) &&
          stats(s, u).will > 0 &&
          !s.committedIds.includes(u.id),
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
    const next =
      own.find((u) => u.id !== guard?.id) ?? (committed ? undefined : own[0]);
    return next && committed < target
      ? { type: "TOGGLE_QUEST", id: next.id }
      : { type: "COMMIT" };
  }
  if (s.phase !== "travel" || s.activeLocation) return;
  const open = s.staging.filter((u) => isLocation(u.code) && !canTravel(s, u));
  const location = [...open].sort(
    (a, b) =>
      travelRank(a) - travelRank(b) ||
      (card(b.code).threat ?? 0) - (card(a.code).threat ?? 0),
  )[0];
  return location ? { type: "TRAVEL", id: location.id } : { type: "NEXT" };
}
