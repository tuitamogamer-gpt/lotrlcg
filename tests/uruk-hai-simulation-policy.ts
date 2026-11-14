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
  ownerOf,
  playerOrder,
} from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import { enemyAttackPrevented } from "../src/game/engine";
import { TOS_ARAGORN } from "../src/game/lotr-saga-codes";
import { UH, isUrukHaiCode, uhToughness } from "../src/game/uruk-hai-support";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";

export const UH_SCENARIOS = [
  "the-uruk-hai",
] as const satisfies readonly ScenarioId[];
export type UhScenario = (typeof UH_SCENARIOS)[number];
export const isUhScenario = (id: ScenarioId): id is UhScenario =>
  UH_SCENARIOS.some((scenario) => scenario === id);

const room = (s: GameState, id: string) => {
  const u = get(s, id);
  return u ? stats(s, u).health - u.damage : -99;
};
const isAlly = (s: GameState, id: string) => {
  const u = get(s, id);
  return !!u && card(u.code).type_code === "ally";
};
const aragorn = (s: GameState, id: string) => get(s, id)?.code === TOS_ARAGORN;
const pursuit = (s: GameState) => s.urukHai?.pursuit ?? 0;

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function uhSimulationChoice(s: GameState): Option | undefined {
  if (!isUhScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  if (/^Revealed · /.test(title))
    return options.find((o) => o.id === "resolve");
  // The sturdiest hero is the Captive, to outlast Grishnákh.
  if (/^Follow the Orcs · Choose a hero to be a Captive/.test(title))
    return (
      [...options].sort(
        (a, b) => (card(b.code!).health ?? 0) - (card(a.code!).health ?? 0),
      )[0] ?? options[0]
    );
  // Rest by Night?: take the damage unless it would destroy a character.
  if (/^Rest by Night\? · /.test(title)) {
    const fatal = units.some(
      (u) => u.committed && stats(s, u).health - u.damage <= 1,
    );
    return options.find((o) => o.id === (fatal ? "end" : "damage"));
  }
  // Uglúk's Uruk-hai and Banks of Entwash: raise the pursuit value while it is low.
  if (/^(Uglúk's Uruk-hai|Banks of Entwash) · /.test(title))
    return (
      options.find((o) => o.id === (pursuit(s) < 22 ? "pursuit" : "reveal")) ??
      options.find((o) => o.id === "undefended") ??
      options[0]
    );
  // Isengard Uruk: take the damage while the characters can absorb it.
  if (/^Isengard Uruk · Choose one/.test(title)) {
    const spare = units
      .filter((u) => u.code !== TOS_ARAGORN)
      .reduce((n, u) => n + Math.max(0, stats(s, u).health - u.damage - 1), 0);
    return options.find((o) => o.id === (spare >= 3 ? "damage" : "reveal"));
  }
  // Saruman's Orders: return an engaged enemy rather than reveal a card.
  if (/^Saruman's Orders · /.test(title))
    return options.find((o) => o.id.startsWith("return-")) ?? options[0];
  // The weakest Uruk-hai when a search reveals one.
  if (/Reveal an Uruk-hai enemy/.test(title))
    return (
      [...options]
        .filter((o) => isUrukHaiCode(o.code!))
        .sort(
          (a, b) => (card(a.code!).attack ?? 0) - (card(b.code!).attack ?? 0),
        )[0] ?? options[0]
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

export function uhSimulationAction(s: GameState): Action | undefined {
  if (!isUhScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
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
      // A hero defends if it survives the printed attack; Aragorn only then.
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
    // Attack an enemy the ready characters can destroy, Toughness included.
    const p = activeSeat(s);
    const targets = engagedEnemies(s)
      .filter((e) => !e.attackedBy?.includes(p))
      .map((e) => {
        const attackers = attackersFor(s, e).filter((u) => ownerOf(s, u) === p);
        const damage =
          attackers.reduce((n, u) => n + stats(s, u).attack, 0) -
          stats(s, e).defense -
          uhToughness(e.code);
        return { e, attackers, short: stats(s, e).health - e.damage - damage };
      })
      .filter((t) => t.attackers.length)
      .sort((a, b) => a.short - b.short);
    // Otherwise wear down the enemy closest to defeat, if damage gets through.
    const best = targets.find(
      (t) => t.short <= 0 || t.short < stats(s, t.e).health - t.e.damage,
    );
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
  const open = s.staging.filter(
    (u) => card(u.code).type_code === "location" && !canTravel(s, u),
  );
  // Banks of Entwash raises the pursuit value with its progress; otherwise
  // travel to the location with the fewest quest points.
  const location = [...open]
    .filter((u) => u.code !== UH.banks || open.length === 1)
    .sort((a, b) => (card(a.code).quest ?? 0) - (card(b.code).quest ?? 0))[0];
  return location ? { type: "TRAVEL", id: location.id } : { type: "NEXT" };
}

/**
 * A late-game start for the stage 2 matrix: Follow the Orcs is defeated and
 * Rescue the Captives has added one Uruk-hai enemy for each player from the
 * encounter deck to the staging area. Every physical card stays in a legal zone.
 */
export function uhStageTwo(s: GameState) {
  const q = s.urukHai!;
  for (const _ of playerOrder(s)) {
    const i = s.encounterDeck.findIndex((c) => isUrukHaiCode(c));
    if (i < 0) break;
    const [code] = s.encounterDeck.splice(i, 1);
    s.staging.push(make(s, code));
  }
  s.stage = 2;
  s.progress = 0;
  q.currentQuest = UH.rescue;
}
