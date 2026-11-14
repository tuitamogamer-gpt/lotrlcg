import { card } from "../src/game/cards";
import {
  availableAbilities,
  canCommit,
  canTravel,
  characters,
  stats,
} from "../src/game/engine";
import { get, make, stagingThreat } from "../src/game/core";
import {
  activeSeat,
  allCharacters,
  attackersFor,
  defendersFor,
  forOwner,
  globalEngaged,
  ownerOf,
} from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import { enemyAttackPrevented } from "../src/game/engine";
import { LAND_SHADOW_FRODO } from "../src/game/lotr-saga-codes";
import { POM } from "../src/game/passage-marshes-support";
import type {
  Action,
  GameState,
  Option,
  ScenarioId,
  Unit,
} from "../src/game/types";

export const POM_SCENARIOS = [
  "the-passage-of-the-marshes",
] as const satisfies readonly ScenarioId[];
export type PomScenario = (typeof POM_SCENARIOS)[number];
export const isPomScenario = (id: ScenarioId): id is PomScenario =>
  POM_SCENARIOS.some((scenario) => scenario === id);

const room = (s: GameState, id: string) => {
  const u = get(s, id);
  return u ? stats(s, u).health - u.damage : -99;
};
const isAlly = (s: GameState, id: string) => {
  const u = get(s, id);
  return !!u && card(u.code).type_code === "ally";
};
/** Frodo and Sméagol must survive: losing either loses the game. */
const precious = (s: GameState, id: string) =>
  [LAND_SHADOW_FRODO, POM.smeagol].includes(get(s, id)?.code ?? "");
const isLocation = (code: string) => card(code).type_code === "location";
const weakest = (options: Option[]) =>
  [...options].sort(
    (a, b) => (card(a.code!).attack ?? 0) - (card(b.code!).attack ?? 0),
  )[0];

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function pomSimulationChoice(s: GameState): Option | undefined {
  if (!isPomScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  if (/^Revealed · /.test(title))
    return options.find((o) => o.id === "resolve");
  // Setup: the location with the least threat and no surge.
  if (/^The Taming of Sméagol · Reveal a location/.test(title))
    return (
      [...options].sort(
        (a, b) =>
          Number(a.code === POM.quagmire) - Number(b.code === POM.quagmire) ||
          (card(a.code!).threat ?? 0) - (card(b.code!).threat ?? 0),
      )[0] ?? options[0]
    );
  // Keep Sméagol: cancel We Hates Them! while he guides the hobbits.
  if (/^We Hates Them! · Cancel/.test(title))
    return options.find((o) => o.id === "cancel") ?? options[0];
  // The Nazgûl rather than an exhausted Ring and another card.
  if (/^Call of the Ring · The first player must choose/.test(title))
    return options.find((o) => o.id === "search") ?? options[0];
  if (/^Bitter Reek · Choose one/.test(title)) {
    const mine = [...s.heroes, ...s.allies].filter((u) => u.committed).length;
    return (
      options.find((o) => o.id === (mine <= 2 ? "threat" : "damage")) ??
      options[0]
    );
  }
  if (/^Shifting Quagmire · Choose one/.test(title)) {
    const locations = (s.victoryCards ?? []).filter(isLocation).length;
    return (
      options.find((o) => o.id === (locations <= 2 ? "threat" : "return")) ??
      options[0]
    );
  }
  // The weakest Undead enemy when a search reveals or engages one.
  if (
    /^(Haunted Mere · Reveal|"Don't Look at the Lights!" · Put) an Undead enemy/.test(
      title,
    )
  )
    return weakest(options) ?? options[0];
  if (
    /Assign.*damage|damage.*hero|damage.*character/i.test(title) &&
    options.some((o) => get(s, o.id))
  )
    return (
      [...options.filter((o) => get(s, o.id) && !precious(s, o.id))].sort(
        (a, b) => room(s, b.id) - room(s, a.id),
      )[0] ?? options[0]
    );
  // Chump attacks with allies, never with Frodo or Sméagol.
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

export function pomSimulationAction(s: GameState): Action | undefined {
  if (!isPomScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
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
      // Frodo and Sméagol never defend: a shadow card could destroy them.
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
    // Gollum first: the players cannot advance until he is Sméagol.
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
          Number(b.e.code === POM.gollum) - Number(a.e.code === POM.gollum) ||
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
    // and some progress when it can be placed; the others stay ready to
    // defend and to attack. Frodo stays back once he is wounded.
    const undead = globalEngaged(s).some(
      (u) => card(u.code).traits === "Undead.",
    );
    const blocked = s.stage === 3 && undead;
    const players = s.table
      ? s.table.seats.filter((x) => !x.eliminated).length
      : 1;
    const progress = blocked
      ? 0
      : s.stage === 3
        ? Math.max(3, 24 - s.progress)
        : 3;
    const target = stagingThreat(s) + 2 * players + progress;
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
  // The location with the most mire tokens relative to its Mire value, then the quickest.
  const open = s.staging.filter((u) => isLocation(u.code) && !canTravel(s, u));
  const location = [...open].sort(
    (a, b) =>
      b.resources - a.resources ||
      (card(a.code).quest ?? 0) - (card(b.code).quest ?? 0),
  )[0];
  return location ? { type: "TRAVEL", id: location.id } : { type: "NEXT" };
}

/**
 * A late-game start: "Don't Look at the Lights!" is under way with 21 of its
 * 24 progress, and Gollum has been tamed: the first player controls a ready
 * Sméagol. Every physical card stays in a legal zone.
 */
export function pomLights(s: GameState) {
  const q = s.passageMarshes!;
  const gollum = globalEngaged(s).find((u) => u.code === POM.gollum);
  const first = s.table?.first ?? 0;
  if (gollum)
    forOwner(s, first, () => {
      s.engaged = s.engaged.filter((u) => u.id !== gollum.id);
      s.allies.push({
        ...make(s, POM.smeagol),
        id: gollum.id,
        owner: first,
        controller: first,
      });
    });
  s.stage = 3;
  s.progress = 21;
  q.currentQuest = POM.lights;
}
