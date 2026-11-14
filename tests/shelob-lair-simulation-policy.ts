import { card } from "../src/game/cards";
import {
  availableAbilities,
  canCommit,
  canTravel,
  characters,
  stats,
} from "../src/game/engine";
import { get, make, shuffle, stagingThreat } from "../src/game/core";
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
import { SL } from "../src/game/shelob-lair-support";
import type {
  Action,
  GameState,
  Option,
  ScenarioId,
  Unit,
} from "../src/game/types";

export const SL_SCENARIOS = [
  "shelobs-lair",
] as const satisfies readonly ScenarioId[];
export type SlScenario = (typeof SL_SCENARIOS)[number];
export const isSlScenario = (id: ScenarioId): id is SlScenario =>
  SL_SCENARIOS.some((scenario) => scenario === id);

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
  [LAND_SHADOW_FRODO, SL.smeagol].includes(get(s, id)?.code ?? "");
const isLocation = (code: string) => card(code).type_code === "location";
const shelobOf = (s: GameState) =>
  [...s.staging, ...globalEngaged(s)].find((u) => u.code === SL.shelob);
const handTotal = (s: GameState) =>
  s.table
    ? s.table.seats.reduce(
        (n, seat, i) =>
          n + (i === s.table!.active ? s.hand.length : seat.hand.length),
        0,
      )
    : s.hand.length;
const bestDefense = (s: GameState) =>
  Math.max(
    0,
    ...characters(s)
      .filter((u) => !u.exhausted && !precious(s, u.id))
      .map((u) => stats(s, u).defense),
  );

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function slSimulationChoice(s: GameState): Option | undefined {
  if (!isSlScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  if (/^Revealed · /.test(title))
    return options.find((o) => o.id === "resolve");
  // Shelob and Lurking Malice: a resource while she has few, then her
  // attack; at the last stage each resource would cancel damage dealt to her.
  if (/^(Shelob|Lurking Malice) · Choose one/.test(title)) {
    const shelob = shelobOf(s);
    const resources = shelob?.resources ?? 0;
    const attack = shelob ? stats(s, shelob).attack : 0;
    const prefersAttack =
      s.stage === 3 || (resources >= 3 && bestDefense(s) >= attack - 2);
    return (
      options.find((o) => o.id === (prefersAttack ? "attack" : "resource")) ??
      options[0]
    );
  }
  if (/^Morgul Orc · Choose one/.test(title))
    return (
      options.find(
        (o) => o.id === (s.hand.length > 1 ? "discard" : "reveal"),
      ) ?? options[0]
    );
  if (/^Orc of Cirith Ungol · Choose one/.test(title))
    return (
      options.find((o) => o.id === (handTotal(s) > 2 ? "discard" : "attack")) ??
      options[0]
    );
  // Keep The One Ring ready while each player can afford a card.
  if (/^Morgul Vale · The first player must choose/.test(title))
    return options.find((o) => o.id === "discard") ?? options[0];
  if (/^Sméagol's Secret Way · Exhaust a character or discard/.test(title)) {
    if (s.hand.length > 1)
      return options.find((o) => o.id === "discard") ?? options[0];
    const ally = options.find((o) => isAlly(s, o.id) && !precious(s, o.id));
    return ally ?? options.find((o) => o.id === "discard") ?? options[0];
  }
  if (/^Sméagol's Secret Way · Travel cost/.test(title))
    return options.find((o) => o.id === "smeagol") ?? options[0];
  if (/^The Stairs of Cirith Ungol · Discard each Nazgûl enemy/.test(title))
    return (
      options.find((o) => o.id === (handTotal(s) >= 8 ? "discard" : "skip")) ??
      options[0]
    );
  // Shelob's Poison: the hero the fellowship needs least.
  if (/^Shelob's Poison · Attach to a hero/.test(title))
    return (
      [...options]
        .filter((o) => get(s, o.id)?.code !== LAND_SHADOW_FRODO)
        .sort((a, b) => {
          const ua = get(s, a.id)!,
            ub = get(s, b.id)!;
          const value = (u: Unit) =>
            stats(s, u).will + stats(s, u).attack + stats(s, u).defense;
          return value(ua) - value(ub);
        })[0] ?? options[0]
    );
  // Keep Sméagol: cancel We Hates Them! while he guides the hobbits.
  if (/^We Hates Them! · Cancel/.test(title))
    return options.find((o) => o.id === "cancel") ?? options[0];
  if (/^Call of the Ring · The first player must choose/.test(title))
    return options.find((o) => o.id === "search") ?? options[0];
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
    const ally = options.find((o) => isAlly(s, o.id) && !precious(s, o.id));
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
  if (u.code === SL.secretWay) return 0;
  if (u.code === SL.cleft) return 1;
  if (u.code === SL.vale) return 2;
  return 4;
}

export function slSimulationAction(s: GameState): Action | undefined {
  if (!isSlScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
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
      const ally = candidates.find(
        (u) => card(u.code).type_code === "ally" && !precious(s, u.id),
      );
      const attack = stats(s, enemy).attack;
      const survives = (u: (typeof candidates)[number]) =>
        stats(s, u).health - u.damage > attack - stats(s, u).defense;
      // Frodo and Sméagol never defend: a shadow card could destroy them.
      // Against Shelob at the last stage the weakest attacker defends, to
      // keep the others ready to destroy her.
      const keepAttackers = s.stage === 3 && enemy.code === SL.shelob;
      const defender =
        ally ??
        (keepAttackers
          ? [...candidates]
              .filter((u) => !precious(s, u.id))
              .sort((a, b) => stats(s, a).attack - stats(s, b).attack)[0]
          : undefined) ??
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
    // Gollum first at the last stage, then Shelob once she can be destroyed.
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
          Number(b.e.code === SL.gollum) - Number(a.e.code === SL.gollum) ||
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
    const players = s.table
      ? s.table.seats.filter((x) => !x.eliminated).length
      : 1;
    const done = s.stage === 3 && s.progress >= 8;
    const target = done
      ? stagingThreat(s) + 1
      : stagingThreat(s) + 2 * players + 3;
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
  // The Spider's Lair lets Shelob attack the first player: never while she is in play.
  const open = s.staging.filter(
    (u) =>
      isLocation(u.code) &&
      !canTravel(s, u) &&
      !(u.code === SL.spidersLair && shelobOf(s)),
  );
  const location = [...open].sort(
    (a, b) =>
      travelRank(s, a) - travelRank(s, b) ||
      (card(a.code).quest ?? 0) - (card(b.code).quest ?? 0),
  )[0];
  return location ? { type: "TRAVEL", id: location.id } : { type: "NEXT" };
}

/**
 * A late-game start: Gollum's Betrayal has its 8 progress and Gollum is
 * already in the victory display with Sméagol's Secret Way, Morgul Vale and
 * Cleft of Cirith Ungol; Shelob, back in the staging area without resources
 * but wounded (7 damage), has lost Indestructible and engages the first
 * player. The players win when they destroy her. The Great Spider is
 * shuffled into the encounter deck. Every physical card stays in a legal
 * zone.
 */
export function slBetrayal(s: GameState) {
  const q = s.shelobLair!;
  const first = s.table?.first ?? 0;
  const spider = q.setAside.filter((c) => c !== SL.shelob && c !== SL.cleft);
  s.encounterDeck.push(...spider);
  shuffle(s, s.encounterDeck);
  q.setAside = [];
  const way = s.staging.find((u) => u.code === SL.secretWay);
  s.staging = s.staging.filter((u) => u.code !== SL.secretWay);
  const vale = s.activeLocation?.code === SL.vale ? s.activeLocation : null;
  if (vale) s.activeLocation = null;
  let gollum = false;
  forOwner(s, first, () => {
    const smeagol = s.allies.find((u) => u.code === SL.smeagol);
    if (!smeagol) return;
    s.allies = s.allies.filter((u) => u.id !== smeagol.id);
    gollum = true;
  });
  s.victoryCards = [
    ...(s.victoryCards ?? []),
    ...(way ? [SL.secretWay] : []),
    ...(vale ? [SL.vale] : []),
    SL.cleft,
    ...(gollum ? [SL.gollum] : []),
  ];
  s.victory = (s.victory ?? 0) + (way ? 2 : 0) + (vale ? 4 : 0) + 4;
  s.staging.push({ ...make(s, SL.shelob), damage: 7 });
  s.stage = 3;
  s.progress = 8;
  q.currentQuest = SL.betrayal;
}
