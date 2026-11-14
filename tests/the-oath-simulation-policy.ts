import { card } from "../src/game/cards";
import { canCommit, canTravel, characters, stats } from "../src/game/engine";
import { get, make, shuffle, stagingThreat, threatOf } from "../src/game/core";
import {
  availableAbilities,
  optionalEngagementProblem,
} from "../src/game/actions";
import { addVictoryCard } from "../src/game/board";
import {
  allCharacters,
  defendersFor,
  forOwner,
  playerOrder,
} from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import { enemyAttackPrevented } from "../src/game/engine";
import { OATH } from "../src/game/the-oath-support";
import type {
  Action,
  GameState,
  Option,
  ScenarioId,
  Unit,
} from "../src/game/types";

export const OATH_SIM_SCENARIOS = [
  "the-oath-2018",
  "the-oath",
] as const satisfies readonly ScenarioId[];
export type OathSimScenario = (typeof OATH_SIM_SCENARIOS)[number];
export const isOathSimScenario = (id: ScenarioId): id is OathSimScenario =>
  OATH_SIM_SCENARIOS.some((scenario) => scenario === id);

const room = (s: GameState, id: string) => {
  const u = get(s, id);
  return u ? stats(s, u).health - u.damage : -99;
};
const isAlly = (s: GameState, id: string) => {
  const u = get(s, id);
  return !!u && card(u.code).type_code === "ally";
};
const players = (s: GameState) =>
  s.table ? s.table.seats.filter((x) => !x.eliminated).length : 1;
const attackOf = (code: string) => Number(card(code).attack) || 0;
/** The threat a searched card would add: Tangled Grove's X counts locations. */
const addedThreat = (s: GameState) => (code: string) =>
  code === OATH.grove
    ? s.staging.filter((u) => card(u.code).type_code === "location").length + 1
    : Number(card(code).threat) || 0;
/** The option whose title is the weakest card by a stat. */
const weakest = (options: Option[], value: (code: string) => number) =>
  [...options].sort(
    (a, b) =>
      value(a.code ?? codeOf(a.label)) - value(b.code ?? codeOf(b.label)),
  )[0];
const codeOf = (title: string) =>
  Object.values(OATH).find((c) => card(c).name === title) ?? "";

/** Mirkwood Forest cannot be defeated until a Goblin Trail is in the victory display. */
const trailNeeded = (s: GameState) =>
  s.stage <= 2 && !(s.victoryCards ?? []).includes(OATH.trail);

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function oathSimulationChoice(s: GameState): Option | undefined {
  if (!isOathSimScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  if (/^Revealed · /.test(title))
    return options.find((o) => o.id === "resolve");
  // 2A: the players search for the Goblin Trail that 2B needs in the victory
  // display, then for the location with the least threat.
  if (/Add a Forest location/.test(title))
    return (
      (trailNeeded(s) &&
      !s.staging.some((u) => u.code === OATH.trail) &&
      s.activeLocation?.code !== OATH.trail
        ? options.find((o) => o.id === card(OATH.trail).name)
        : undefined) ?? weakest(options, addedThreat(s))
    );
  // 3A and Goblins are Upon You!: the Goblin enemy with the least attack.
  if (/Add a Goblin enemy|Put a Goblin enemy/.test(title))
    return weakest(options, attackOf);
  // Spider Den: the Spider with the least attack.
  if (/^Spider Den/.test(title)) return weakest(options, attackOf);
  // Surprising Speed: return the strongest enemy to the staging area.
  if (/^Surprising Speed/.test(title))
    return [...options].sort(
      (a, b) =>
        (get(s, b.id) ? stats(s, get(s, b.id)!).attack : 0) -
        (get(s, a.id) ? stats(s, get(s, a.id)!).attack : 0),
    )[0];
  // Eyes in the Dark: raise threat by a little, otherwise lose an ally.
  if (/^Eyes in the Dark · Choose/.test(title)) {
    const raise = options.find((o) => o.id === "threat");
    const ally = options.find((o) => isAlly(s, o.id));
    const questing = options.length - 1;
    return (questing <= 2 && s.threat < 40) || !ally ? raise : ally;
  }
  // Exhaust or discard the least valuable character: an ally if possible.
  if (
    /^Eyes in the Dark · Discard|^Great Spider · Exhaust|^Spiders of Mirkwood/.test(
      title,
    )
  )
    return (
      [...options.filter((o) => isAlly(s, o.id))].sort(
        (a, b) => room(s, b.id) - room(s, a.id),
      )[0] ?? [...options].sort((a, b) => room(s, b.id) - room(s, a.id))[0]
    );
  if (
    /Deal \d+ damage|Assign.*damage|damage.*hero|damage.*character/i.test(
      title,
    ) &&
    options.some((o) => get(s, o.id))
  )
    return (
      [...options.filter((o) => get(s, o.id))].sort(
        (a, b) => room(s, b.id) - room(s, a.id),
      )[0] ?? options[0]
    );
  // Chump attacks with allies.
  if (/Immediate attack/i.test(title)) {
    const ally = options.find((o) => isAlly(s, o.id));
    if (ally) return ally;
    return (
      [...options.filter((o) => get(s, o.id))].sort((a, b) => {
        const ua = units.find((u) => u.id === a.id)!;
        const ub = units.find((u) => u.id === b.id)!;
        return stats(s, ub).defense - stats(s, ua).defense;
      })[0] ??
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

export function oathSimulationAction(s: GameState): Action | undefined {
  if (!isOathSimScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
  // The encounter phase: a player with one enemy engaged or none engages the
  // weakest enemy in the staging area, so that its threat leaves the quest.
  if (s.phase === "encounter") {
    const weakest = s.staging
      .filter(
        (u) =>
          card(u.code).type_code === "enemy" &&
          !optionalEngagementProblem(s, u),
      )
      .sort((a, b) => stats(s, a).attack - stats(s, b).attack)[0];
    const ready = characters(s).filter((u) => !u.exhausted).length;
    if (weakest && s.engaged.length < 2 && ready >= 2)
      return { type: "ENGAGE", id: weakest.id };
    return;
  }
  if (s.phase === "defense") {
    const enemy = engagedEnemies(s).find(
      (u) => normalAttackPending(s, u) && !enemyAttackPrevented(s, u),
    );
    if (enemy) {
      const candidates = defendersFor(s, enemy);
      const attack = stats(s, enemy).attack;
      // A hero that survives the attack defends; otherwise an ally chumps.
      const hero = [...candidates]
        .filter(
          (u) =>
            card(u.code).type_code === "hero" &&
            room(s, u.id) + stats(s, u).defense > attack + 1,
        )
        .sort((a, b) => stats(s, b).defense - stats(s, a).defense)[0];
      const ally = [...candidates]
        .filter((u) => card(u.code).type_code === "ally")
        .sort((a, b) => stats(s, a).attack - stats(s, b).attack)[0];
      const defender =
        hero ??
        ally ??
        [...candidates].sort(
          (a, b) => stats(s, b).defense - stats(s, a).defense,
        )[0];
      return {
        type: "DEFEND",
        enemyId: enemy.id,
        defenderId: defender?.id ?? null,
      };
    }
  }
  if (s.phase === "quest") {
    // Spider Den: a player with a ready defender discards its 4 threat.
    const den = s.staging.find((u) => u.code === OATH.den);
    if (
      den &&
      s.committedIds.length === 0 &&
      characters(s).filter((u) => !u.exhausted).length >= 3 &&
      availableAbilities(s, den).some((a) => !a.disabled)
    )
      return { type: "ABILITY", id: den.id };
    // Commit enough willpower for the staging area and some progress; the
    // best defender stays back.
    const target = stagingThreat(s) + 3 * players(s);
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
    const guard = [...characters(s)].sort(
      (a, b) => stats(s, b).defense - stats(s, a).defense,
    )[0];
    const next =
      own.find((u) => u.id !== guard?.id) ?? (committed ? undefined : own[0]);
    return next && committed < target
      ? { type: "TOGGLE_QUEST", id: next.id }
      : { type: "COMMIT" };
  }
  if (s.phase !== "travel") return;
  if (s.activeLocation) return { type: "NEXT" };
  const open = s.staging.filter(
    (u) => card(u.code).type_code === "location" && !canTravel(s, u),
  );
  // 2B needs a Goblin Trail in the victory display: it is worth 2 threat more.
  const score = (u: Unit) =>
    threatOf(s, u) + (u.code === OATH.trail && trailNeeded(s) ? 2 : 0);
  const location = open.sort((a, b) => score(b) - score(a))[0];
  return location ? { type: "TRAVEL", id: location.id } : { type: "NEXT" };
}

/** Each player puts up to 3 non-unique allies from his deck into play. */
function reinforce(s: GameState) {
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
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
}
/** The active location returns to the encounter discard pile. */
function clearActive(s: GameState) {
  if (s.activeLocation) s.encounterDiscard.push(s.activeLocation.code);
  s.activeLocation = null;
  s.extraActiveLocations = [];
}
/**
 * A late-game start at the end of After the Raid: 1B holds its 9 progress, so
 * it is defeated at once and 2A's When Revealed makes each player search for
 * a Forest location. Mirkwood Forest then needs a Goblin Trail explored. Each
 * player's threat is 10 and each player has put up to 3 non-unique allies
 * from his deck into play.
 */
export function oathForest(s: GameState) {
  clearActive(s);
  reinforce(s);
  for (const p of playerOrder(s)) forOwner(s, p, () => (s.threat = 10));
  s.progress = 9;
}
/**
 * A late-game start at the end of Mirkwood Forest: a Goblin Trail is in the
 * victory display and 2B holds its 12 progress, so it is defeated at once and
 * 3A adds the set-aside Goblin Troop to the staging area, with a Goblin enemy
 * for each other player. The Rearguard cannot be defeated while Goblin Troop
 * is in play. Each player's threat is 10 and each player has put up to 3
 * non-unique allies from his deck into play.
 */
export function oathRearguard(s: GameState) {
  const q = s.oath!;
  clearActive(s);
  reinforce(s);
  for (const p of playerOrder(s)) forOwner(s, p, () => (s.threat = 10));
  for (const zone of [s.encounterDeck, s.encounterDiscard]) {
    const i = zone.indexOf(OATH.trail);
    if (i < 0) continue;
    zone.splice(i, 1);
    addVictoryCard(s, OATH.trail);
    break;
  }
  s.encounterDeck = shuffle(s, s.encounterDeck);
  s.stage = 2;
  q.currentQuest = OATH.forest;
  s.progress = 12;
}
