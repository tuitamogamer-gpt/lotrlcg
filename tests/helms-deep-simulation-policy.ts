import { card } from "../src/game/cards";
import {
  availableAbilities,
  canCommit,
  canTravel,
  characters,
  stats,
} from "../src/game/engine";
import { get, make } from "../src/game/core";
import {
  activeSeat,
  allCharacters,
  attackersFor,
  defendersFor,
  globalPlayerOrder,
  ownerOf,
} from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import { enemyAttackPrevented } from "../src/game/engine";
import { TOS_ARAGORN } from "../src/game/lotr-saga-codes";
import { HD, helmsDeepDefense } from "../src/game/helms-deep-support";
import { whiteHandToughness } from "../src/game/white-hand";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";

export const HD_SCENARIOS = [
  "helms-deep",
] as const satisfies readonly ScenarioId[];
export type HdScenario = (typeof HD_SCENARIOS)[number];
export const isHdScenario = (id: ScenarioId): id is HdScenario =>
  HD_SCENARIOS.some((scenario) => scenario === id);

const room = (s: GameState, id: string) => {
  const u = get(s, id);
  return u ? stats(s, u).health - u.damage : -99;
};
const isAlly = (s: GameState, id: string) => {
  const u = get(s, id);
  return !!u && card(u.code).type_code === "ally";
};
const aragorn = (s: GameState, id: string) => get(s, id)?.code === TOS_ARAGORN;

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function hdSimulationChoice(s: GameState): Option | undefined {
  if (!isHdScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  if (/^Revealed · /.test(title))
    return options.find((o) => o.id === "resolve");
  // An odd number of players takes Poisoned Counsels and stage 1B; an even
  // number advances straight to stage 2A.
  if (/^The King of the Golden Hall · The players must choose/.test(title))
    return options.find(
      (o) =>
        o.id === (globalPlayerOrder(s).length % 2 ? "counsels" : "advance"),
    );
  // The most expensive ally enters play.
  if (/^The King of the Golden Hall · Put an ally into play/.test(title))
    return (
      [...options].sort(
        (a, b) =>
          (Number(card(b.code!).cost) || 0) - (Number(card(a.code!).cost) || 0),
      )[0] ?? options[0]
    );
  // Night Without End: remove a token rather than reveal two cards.
  if (/^Night Without End · /.test(title))
    return options.find((o) => o.id === "token") ?? options[0];
  // Isengard Uruk: take the damage while the characters can absorb it.
  if (/^Isengard Uruk · Choose one/.test(title)) {
    const spare = units
      .filter((u) => u.code !== TOS_ARAGORN)
      .reduce((n, u) => n + Math.max(0, stats(s, u).health - u.damage - 1), 0);
    return options.find((o) => o.id === (spare >= 3 ? "damage" : "reveal"));
  }
  // The weakest enemy when a search reveals one.
  if (/Reveal an (Uruk-hai )?enemy/.test(title))
    return (
      [...options].sort(
        (a, b) => (card(a.code!).attack ?? 0) - (card(b.code!).attack ?? 0),
      )[0] ?? options[0]
    );
  // Soldier of Isengard: exhaust the weakest character.
  if (/^Soldier of Isengard · Exhaust/.test(title))
    return (
      [...options].sort((a, b) => {
        const ua = get(s, a.id),
          ub = get(s, b.id);
        return (
          (ua ? stats(s, ua).defense : 0) - (ub ? stats(s, ub).defense : 0)
        );
      })[0] ?? options[0]
    );
  // Aragorn readies the best defender.
  if (/^Aragorn · Ready a hero/.test(title))
    return (
      [...options].sort((a, b) => {
        const ua = get(s, a.id),
          ub = get(s, b.id);
        return (
          (ub ? stats(s, ub).defense : 0) - (ua ? stats(s, ua).defense : 0)
        );
      })[0] ?? options[0]
    );
  if (
    /Assign.*damage|damage.*hero|damage.*character/i.test(title) &&
    options.some((o) => get(s, o.id))
  )
    return (
      [...options.filter((o) => get(s, o.id) && !aragorn(s, o.id))].sort(
        (a, b) => room(s, b.id) - room(s, a.id),
      )[0] ?? options[0]
    );
  // Chump attacks with allies.
  if (/Immediate attack/i.test(title)) {
    const ally = options.find((o) => isAlly(s, o.id));
    if (ally) return ally;
    return (
      [...options.filter((o) => get(s, o.id) && !aragorn(s, o.id))].sort(
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

export function hdSimulationAction(s: GameState): Action | undefined {
  if (!isHdScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
  // Before the quest resolves, Aragorn readies a questing hero.
  if (s.phase === "staging") {
    const hero = s.heroes.find((h) => h.code === TOS_ARAGORN);
    if (
      hero &&
      availableAbilities(s, hero).some(
        (a) => a.label.startsWith("Aragorn") && !a.disabled,
      )
    )
      return { type: "ABILITY", id: hero.id };
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
      const defender =
        ally ??
        [...candidates]
          .filter((u) => u.code !== TOS_ARAGORN || survives(u))
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
    // Attack an enemy the ready characters can wear down, Toughness included.
    const p = activeSeat(s);
    const targets = engagedEnemies(s)
      .filter((e) => !e.attackedBy?.includes(p))
      .map((e) => {
        const attackers = attackersFor(s, e).filter((u) => ownerOf(s, u) === p);
        const damage =
          attackers.reduce((n, u) => n + stats(s, u).attack, 0) -
          stats(s, e).defense -
          whiteHandToughness(e.code);
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
  // Under Defense an active location absorbs the encounter deck's progress:
  // travel to the location with the most quest points, Deeping Culvert last.
  const open = s.staging.filter(
    (u) => card(u.code).type_code === "location" && !canTravel(s, u),
  );
  const location = [...open].sort(
    (a, b) =>
      Number(a.code === HD.culvert) - Number(b.code === HD.culvert) ||
      (card(b.code).quest ?? 0) - (card(a.code).quest ?? 0),
  )[0];
  return location ? { type: "TRAVEL", id: location.id } : { type: "NEXT" };
}

/**
 * A late-game start: Assault on Helm's Deep is under way (from stage 1B, its
 * set-aside cards enter play as 2A puts them) and The Defense of Helm's Deep
 * holds 7 resource tokens, so the next quest phase sends the players to The
 * King Rides Out. Every physical card stays in a legal zone.
 */
export function hdDawn(s: GameState) {
  const q = s.helmsDeep!;
  if (q.currentQuest === HD.king) {
    for (const code of [...q.setAside]) {
      q.setAside.splice(q.setAside.indexOf(code), 1);
      if (code === HD.wall) {
        if (s.activeLocation) s.staging.push(s.activeLocation);
        s.activeLocation = make(s, code);
      } else s.staging.push(make(s, code));
    }
    s.stage = 2;
    s.progress = 0;
    q.currentQuest = HD.assault;
  }
  const defense = helmsDeepDefense(s);
  if (defense) defense.resources = 7;
}
