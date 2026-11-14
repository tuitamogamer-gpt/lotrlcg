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
  SG,
  SG_SHIPS_TO_TRAVEL,
  isSgShipCode,
  sgFleet,
  sgFleetResources,
} from "../src/game/siege-gondor-support";
import type {
  Action,
  GameState,
  Option,
  ScenarioId,
  Unit,
} from "../src/game/types";

export const SG_SCENARIOS = [
  "the-siege-of-gondor",
] as const satisfies readonly ScenarioId[];
export type SgScenario = (typeof SG_SCENARIOS)[number];
export const isSgScenario = (id: ScenarioId): id is SgScenario =>
  SG_SCENARIOS.some((scenario) => scenario === id);

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
/** The health the choosing player's characters can spare, Aragorn excluded. */
const spare = (s: GameState, questing = false) =>
  characters(s)
    .filter(
      (u) =>
        u.code !== FLAME_WEST_ARAGORN &&
        (!questing || u.committed || s.committedIds.includes(u.id)),
    )
    .reduce((n, u) => n + Math.max(0, stats(s, u).health - u.damage - 1), 0);
const costIn = (label: string) => Number(/cost (\d+)/.exec(label)?.[1] ?? 99);
const byThreat = (options: Option[]) =>
  [...options].sort(
    (a, b) => (card(a.code!).threat ?? 0) - (card(b.code!).threat ?? 0),
  );

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function sgSimulationChoice(s: GameState): Option | undefined {
  if (!isSgScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  if (/^Revealed · /.test(title))
    return options.find((o) => o.id === "resolve");
  // Setup and Black Sails: the Ship location with the least threat.
  if (/Search (the encounter deck )?for a Ship location/.test(title))
    return byThreat(options)[0];
  // Great Corsair Ship: the weakest Corsair enemy (Corsair Captain when it must be chosen).
  if (/^Great Corsair Ship · Search for a Corsair enemy/.test(title))
    return [...options].sort(
      (a, b) =>
        (card(a.code!).attack ?? 0) +
        (card(a.code!).health ?? 0) -
        ((card(b.code!).attack ?? 0) + (card(b.code!).health ?? 0)),
    )[0];
  // The Corsair Fleet: damage while the characters can spare it, else a card.
  if (/^The Corsair Fleet · Choose one/.test(title)) {
    const x = sgFleetResources(s);
    return pick(
      options,
      (x <= 2 && spare(s) >= x + 1) || spare(s) >= 2 * x + 2
        ? "damage"
        : "reveal",
    );
  }
  // Driven to the Brink: the questing characters take the damage when they
  // can spare it, so that the quest still resolves.
  if (/^Driven to the Brink · Choose one/.test(title)) {
    const x = sgFleetResources(s);
    return pick(options, spare(s, true) >= x + 1 ? "damage" : "end");
  }
  if (/^Fell Folk of Umbar · Choose one/.test(title))
    return pick(options, "return", "discard");
  if (/^Raiding the Coasts · Choose one/.test(title)) {
    const attachment = options.find((o) => o.id === "attachment");
    return attachment && costIn(attachment.label) <= 1
      ? attachment
      : pick(options, "threat");
  }
  // An attachment to discard: the cheapest one offered.
  if (/Discard (the highest cost |an )attachment you control/.test(title))
    return [...options].sort(
      (a, b) =>
        (Number(card(a.code ?? "").cost) || 0) -
        (Number(card(b.code ?? "").cost) || 0),
    )[0];
  // A character to exhaust: the weakest one, never Aragorn while another is offered.
  if (/Exhaust a character you control/.test(title))
    return (
      [...options.filter((o) => get(s, o.id) && !precious(s, o.id))].sort(
        (a, b) => {
          const ua = get(s, a.id)!;
          const ub = get(s, b.id)!;
          return (
            stats(s, ua).attack +
            stats(s, ua).defense -
            (stats(s, ub).attack + stats(s, ub).defense)
          );
        },
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

/** The order the players prefer locations in. */
function travelRank(_s: GameState, u: Unit) {
  if (u.code === SG.greatShip) return 0;
  if (isSgShipCode(u.code)) return 1;
  // Pelargir Quays gathers damage tokens; Port of Pelargir limits healing in the staging area.
  if (u.code === SG.quays) return 2;
  return 3;
}

export function sgSimulationAction(s: GameState): Action | undefined {
  if (!isSgScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
  if (s.phase === "defense") {
    const enemy = engagedEnemies(s).find(
      (u) => normalAttackPending(s, u) && !enemyAttackPrevented(s, u),
    );
    if (enemy) {
      const candidates = defendersFor(s, enemy);
      const attack = stats(s, enemy).attack;
      const survives = (u: (typeof candidates)[number]) =>
        stats(s, u).health - u.damage > attack - stats(s, u).defense;
      // Aragorn defends only when he survives.
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
    const players = s.table
      ? s.table.seats.filter((x) => !x.eliminated).length
      : 1;
    const target = stagingThreat(s) + 2 * players + 3;
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
    // Aragorn stays back to defend and attack the Corsairs unless nobody else quests.
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
 * A late-game start: three Ship locations are in the victory display, The
 * Corsair Fleet has no resource, Attack on Pelargir has 19 progress and each
 * player has put up to 3 non-unique allies from his deck into play (those with
 * the most willpower). The
 * players travel to Great Corsair Ship (each player adds a Corsair enemy to
 * the staging area, one of them Corsair Captain), explore it and place the
 * last progress on the stage. Every physical card stays in a legal zone.
 */
export function sgShips(s: GameState) {
  const victory = (code: string) => {
    s.victoryCards = [...(s.victoryCards ?? []), code];
    s.victory = (s.victory ?? 0) + (card(code).victory ?? 0);
  };
  // The Ship locations of the setup searches, then more from the encounter deck.
  for (const ship of s.staging.filter(
    (u) => isSgShipCode(u.code) && u.code !== SG.greatShip,
  )) {
    s.staging = s.staging.filter((u) => u.id !== ship.id);
    victory(ship.code);
  }
  while (
    (s.victoryCards ?? []).filter(isSgShipCode).length < SG_SHIPS_TO_TRAVEL
  ) {
    const i = s.encounterDeck.findIndex(isSgShipCode);
    if (i < 0) break;
    victory(s.encounterDeck.splice(i, 1)[0]);
  }
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      // The allies with the most willpower, the first copies in deck order.
      const picks = [...s.deck.entries()]
        .filter(([, c]) => card(c).type_code === "ally" && !card(c).is_unique)
        .sort(
          ([i, a], [j, b]) =>
            (card(b).willpower ?? 0) - (card(a).willpower ?? 0) || i - j,
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
  sgFleet(s)!.resources = 0;
  shuffle(s, s.encounterDeck);
  s.progress = 19;
}
