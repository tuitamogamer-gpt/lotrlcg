import { card } from "../src/game/cards";
import { canCommit, canTravel, characters, stats } from "../src/game/engine";
import { get, make, shuffle, stagingThreat } from "../src/game/core";
import {
  activeSeat,
  allCharacters,
  attackersFor,
  defendersFor,
  forOwner,
  ownerOf,
  playerOrder,
} from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import { enemyAttackPrevented } from "../src/game/engine";
import { FLAME_WEST_ARAGORN } from "../src/game/lotr-saga-codes";
import {
  PF,
  pfMinasTirith,
  pfMinasTirithHealth,
} from "../src/game/pelennor-fields-support";
import type {
  Action,
  GameState,
  Option,
  ScenarioId,
  Unit,
} from "../src/game/types";

export const PF_SCENARIOS = [
  "the-battle-of-the-pelennor-fields",
] as const satisfies readonly ScenarioId[];
export type PfScenario = (typeof PF_SCENARIOS)[number];
export const isPfScenario = (id: ScenarioId): id is PfScenario =>
  PF_SCENARIOS.some((scenario) => scenario === id);

const room = (s: GameState, id: string) => {
  const u = get(s, id);
  return u ? stats(s, u).health - u.damage : -99;
};
/** Aragorn must survive: if he leaves play the players lose. */
const precious = (s: GameState, id: string) =>
  get(s, id)?.code === FLAME_WEST_ARAGORN;
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
/** Minas Tirith can take this much damage and keep a safety margin of 10. */
const cityRoom = (s: GameState, amount: number) => {
  const mt = pfMinasTirith(s);
  if (!mt) return true;
  return mt.damage + amount <= pfMinasTirithHealth(players(s)) - 10;
};
const weakest = (options: Option[]) =>
  [...options].sort(
    (a, b) =>
      (card(a.code!).attack ?? 0) +
      (card(a.code!).threat ?? 0) -
      ((card(b.code!).attack ?? 0) + (card(b.code!).threat ?? 0)),
  )[0];
const cheapest = (options: Option[]) =>
  [...options].sort(
    (a, b) =>
      (Number(card(a.code ?? "").cost) || 0) -
      (Number(card(b.code ?? "").cost) || 0),
  )[0];

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function pfSimulationChoice(s: GameState): Option | undefined {
  if (!isPfScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  if (/^Revealed · /.test(title))
    return options.find((o) => o.id === "resolve");
  // The Esquires go to the first heroes offered.
  if (/^The Garrison of Gondor · Attach/.test(title))
    return options.find((o) => o.id !== "skip") ?? options[0];
  if (/Search for a different enemy|Search for an enemy/.test(title))
    return weakest(options);
  if (/^Rohan has Come! · Put an ally into play/.test(title))
    return [...options].sort(
      (a, b) =>
        (Number(card(b.code!).cost) || 0) - (Number(card(a.code!).cost) || 0),
    )[0];
  if (/^Black Dart · Remove a hero/.test(title))
    return (
      options.find((o) => !/questing/.test(o.label) && !precious(s, o.id)) ??
      options.find((o) => !precious(s, o.id)) ??
      options[0]
    );
  if (/^Spells of Ruin · Choose one/.test(title))
    return pick(options, cityRoom(s, 5) ? "minas" : "exhausted", "exhausted");
  if (
    /^(Orc of the Eye|Southron Champion|The Rammas is Breached) · Choose one/.test(
      title,
    )
  )
    return pick(
      options,
      cityRoom(s, 3)
        ? "minas"
        : options.some((o) => o.id === "hero")
          ? "hero"
          : "attack",
      "minas",
    );
  if (
    /Discard an ally you control|Discard a non-objective attachment/.test(title)
  )
    return cheapest(options);
  // Damage among enemies in play (Rohan has Come!): the enemy closest to defeat.
  if (/Assign damage among enemies in play/.test(title))
    return [...options].sort((a, b) => room(s, a.id) - room(s, b.id))[0];
  if (
    /Assign.*damage|damage.*hero|damage.*character/i.test(title) &&
    options.some((o) => get(s, o.id))
  )
    return (
      [...options.filter((o) => get(s, o.id) && !precious(s, o.id))].sort(
        (a, b) => room(s, b.id) - room(s, a.id),
      )[0] ?? options[0]
    );
  // Immediate attacks: a defender that survives (Aragorn included), else
  // another character with the best defense, never Aragorn.
  if (/Immediate attack/i.test(title)) {
    const enemy = s.combat ? get(s, s.combat.enemyId) : undefined;
    const attack = enemy
      ? stats(s, enemy).attack + (s.combat?.attackBonus ?? 0)
      : 0;
    const candidates = options.filter((o) => units.some((u) => u.id === o.id));
    const unit = (o: Option) => units.find((u) => u.id === o.id)!;
    const survives = (o: Option) =>
      stats(s, unit(o)).health - unit(o).damage >
      attack - stats(s, unit(o)).defense;
    const byDefense = (a: Option, b: Option) =>
      stats(s, unit(b)).defense - stats(s, unit(a)).defense;
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

/** Fighting in the Fields: The Witch-king is in play and not yet defeated. */
const witchKingAlive = (s: GameState) =>
  s.pelennorFields?.currentQuest === PF.fields &&
  [...s.staging, ...engagedEnemies(s)].some((u) => u.code === PF.witchKing);
/** The order the players prefer locations in. */
function travelRank(s: GameState, u: Unit) {
  // City Wall takes Minas Tirith's damage while it is active.
  if (u.code === PF.wall) return pfMinasTirith(s) ? 0 : 2;
  // Grond's travel makes The Witch-king attack each player; Gate of Gondor
  // engages every enemy.
  if (u.code === PF.grond || u.code === PF.gate) return 4;
  return 1;
}

export function pfSimulationAction(s: GameState): Action | undefined {
  if (!isPfScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
  if (s.phase === "defense") {
    const enemy = engagedEnemies(s).find(
      (u) => normalAttackPending(s, u) && !enemyAttackPrevented(s, u),
    );
    if (enemy) {
      const candidates = defendersFor(s, enemy);
      const attack = stats(s, enemy).attack;
      const survives = (u: (typeof candidates)[number]) =>
        stats(s, u).health - u.damage > attack - stats(s, u).defense;
      // Aragorn defends only when he survives. Against The Witch-king the
      // weakest attackers defend, so that the others can strike back.
      const keepAttackers = witchKingAlive(s);
      const defender = [...candidates]
        .filter((u) => !precious(s, u.id) || survives(u))
        .sort(
          (a, b) =>
            Number(survives(b)) - Number(survives(a)) ||
            (keepAttackers ? stats(s, a).attack - stats(s, b).attack : 0) ||
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
        let attackers = attackersFor(s, e).filter((u) => ownerOf(s, u) === p);
        // The Black Serpent: one attacker at a time, the strongest.
        if (e.code === PF.serpent)
          attackers = [...attackers]
            .sort((a, b) => stats(s, b).attack - stats(s, a).attack)
            .slice(0, 1);
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
    // 5B: while The Witch-king lives, the first player keeps his characters
    // ready to defend his attacks and strike him down.
    if (witchKingAlive(s) && activeSeat(s) === (s.table?.first ?? 0))
      return { type: "COMMIT" };
    // Commit enough willpower for the staging area and some progress; the
    // best defender and Aragorn stay back.
    const target = stagingThreat(s) + 2 * players(s) + 3;
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
      own.find((u) => u.id !== guard?.id && !precious(s, u.id)) ??
      (committed ? undefined : own.find((u) => u.id !== guard?.id));
    return next && committed < target
      ? { type: "TOGGLE_QUEST", id: next.id }
      : { type: "COMMIT" };
  }
  if (s.phase !== "travel" || s.activeLocation) return;
  const open = s.staging.filter((u) => isLocation(u.code) && !canTravel(s, u));
  const location = [...open].sort(
    (a, b) =>
      travelRank(s, a) - travelRank(s, b) ||
      (card(a.code).quest ?? 0) - (card(b.code).quest ?? 0),
  )[0];
  return location ? { type: "TRAVEL", id: location.id } : { type: "NEXT" };
}

/**
 * A late-game start at Fighting in the Fields with 16 progress and no active
 * location (its card is in the discard pile): Minas Tirith
 * is in the staging area, Grond and one Wraith on Wings per player are in the
 * victory display, The Witch-king (Sorcerer side) is in the staging area with
 * 12 damage, and each player has put up to 3 non-unique allies from his deck
 * into play (those with the most attack). The players must defeat The
 * Witch-king with Aragorn in play and place the last progress. Every physical
 * card stays in a legal zone.
 */
export function pfFields(s: GameState) {
  const q = s.pelennorFields!;
  const victory = (code: string) => {
    const i = q.setAside.indexOf(code);
    if (i >= 0) q.setAside.splice(i, 1);
    s.victoryCards = [...(s.victoryCards ?? []), code];
    s.victory = (s.victory ?? 0) + (card(code).victory ?? 0);
  };
  victory(PF.grond);
  for (let i = 0; i < players(s); i++) victory(PF.wraith);
  const mt = q.setAside.indexOf(PF.minasTirith);
  if (mt >= 0) {
    q.setAside.splice(mt, 1);
    s.staging.push(make(s, PF.minasTirith));
  }
  const wk = q.setAside.indexOf(PF.witchKing);
  if (wk >= 0) {
    q.setAside.splice(wk, 1);
    const witch = make(s, PF.witchKing);
    witch.flipped = true;
    witch.damage = 12;
    s.staging.push(witch);
  }
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      const picks = [...s.deck.entries()]
        .filter(([, c]) => card(c).type_code === "ally" && !card(c).is_unique)
        .sort(
          ([i, a], [j, b]) =>
            (card(b).attack ?? 0) - (card(a).attack ?? 0) || i - j,
        )
        .slice(0, 3)
        .map(([i]) => i)
        .sort((i, j) => j - i);
      for (const i of picks) {
        const ally = make(s, s.deck.splice(i, 1)[0]);
        ally.owner = p;
        s.allies.push(ally);
      }
    });
  // The active location was explored earlier: its card is in the discard pile.
  if (s.activeLocation) {
    s.encounterDiscard.push(s.activeLocation.code);
    s.activeLocation = null;
  }
  shuffle(s, s.encounterDeck);
  s.stage = 5;
  q.currentQuest = PF.fields;
  s.progress = 16;
}
