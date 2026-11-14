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
  seatView,
} from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import { enemyAttackPrevented } from "../src/game/engine";
import { hideValue, isFortitude } from "../src/game/hide-test";
import { isRingBearerCode } from "../src/game/lotr-saga-codes";
import { MD, MD_GASP_PROGRESS } from "../src/game/mount-doom-support";
import type {
  Action,
  GameState,
  Option,
  ScenarioId,
  Unit,
} from "../src/game/types";

export const MD_SCENARIOS = [
  "mount-doom",
] as const satisfies readonly ScenarioId[];
export type MdScenario = (typeof MD_SCENARIOS)[number];
export const isMdScenario = (id: ScenarioId): id is MdScenario =>
  MD_SCENARIOS.some((scenario) => scenario === id);

const room = (s: GameState, id: string) => {
  const u = get(s, id);
  return u ? stats(s, u).health - u.damage : -99;
};
/** The Ring-bearer must survive: if he leaves play, The One Ring goes too. */
const precious = (s: GameState, id: string) => {
  const u = get(s, id);
  return !!u && isRingBearerCode(u.code);
};
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
/** The locations the players prefer to search for at setup. */
const SEARCH = [MD.water, MD.mordorRoad, MD.plain, MD.hold, MD.brake];

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function mdSimulationChoice(s: GameState): Option | undefined {
  if (!isMdScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  const unit = (o: Option) => units.find((u) => u.id === o.id);
  if (/^Revealed · /.test(title))
    return options.find((o) => o.id === "resolve");
  // Fortitude tests: commit heroes until the willpower should beat the icons;
  // everything for the last test and for The Lidless Eye.
  const test = s.hideTest;
  if (test && isFortitude(test) && test.phase === "committing") {
    // Foul Fumes would kill a wounded Ring-bearer.
    const fragile = allCharacters(s).some(
      (u) => precious(s, u.id) && room(s, u.id) <= 1,
    );
    const all =
      test.source === MD.crack ||
      test.source === MD.eye ||
      test.source === MD.doom ||
      (test.source === MD.fumes && fragile);
    const committed = test.committedIds.reduce((n, id) => {
      const u = get(s, id);
      return n + (u ? Math.max(0, stats(s, u).will) : 0);
    }, 0);
    const brakes = s.staging.filter((u) => u.code === MD.brake).length;
    const target = hideValue(s) + brakes + 1;
    const heroes = options
      .filter((o) => unit(o))
      .sort((a, b) => stats(s, unit(b)!).will - stats(s, unit(a)!).will);
    return (
      (all || committed < target ? heroes[0] : undefined) ??
      pick(options, "done")
    );
  }
  if (/^The Land of Mordor · Search the encounter deck/.test(title))
    return (
      SEARCH.map((c) => options.find((o) => o.code === c)).find(Boolean) ??
      options[0]
    );
  // Damage assignment: never the Ring-bearer, the character with most room.
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
  if (/^Little Snuffler · Choose one/.test(title))
    return s.threat <= 70
      ? pick(options, "threat")
      : (options.find((o) => o.id.startsWith("discard-")) ?? options[0]);
  if (/^Big Uruk · Choose one/.test(title))
    return s.threat <= 70 ? pick(options, "threat") : pick(options, "attack");
  if (/^Evil Vigilance · Choose one/.test(title))
    return s.threat <= 70
      ? pick(options, "threat")
      : (options.find(
          (o) => o.id.startsWith("discard-") && !precious(s, o.id.slice(8)),
        ) ?? options[0]);
  if (/^Deep Shadows · Choose one/.test(title)) return pick(options, "reveal");
  if (/^Drawn to the Ring · Choose one/.test(title))
    return pick(options, "enemy", "ring");
  if (/^Heavy and Tired · /.test(title))
    return options.find((o) => !precious(s, o.id)) ?? options[0];
  if (/^Old Water-course · Response/.test(title))
    return pick(options, "reduce");
  if (/^Old Water-course · Exhaust a hero/.test(title))
    return (
      [...options.filter((o) => !precious(s, o.id))].sort(
        (a, b) => stats(s, unit(a)!).will - stats(s, unit(b)!).will,
      )[0] ?? options[0]
    );
  if (/^Gollum · Choose an encounter card/.test(title)) return options[0];
  if (/Discard a non-objective attachment/.test(title)) return options[0];
  // Immediate attacks: a defender that survives, else another character with
  // the best defense, never the Ring-bearer.
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
  if (u.code === MD.doom) return 0;
  if (u.code === MD.water) return 1;
  if (u.code === MD.mordorRoad) return 2;
  if (u.code === MD.plain) return 3;
  if (u.code === MD.hold) return 4;
  return 5;
}

export function mdSimulationAction(s: GameState): Action | undefined {
  if (!isMdScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
  if (s.hideTest) return;
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
    // Commit enough willpower for the staging area and some progress; the
    // best defender stays back.
    const target = stagingThreat(s) + 3 * players(s);
    const committed = characters(s)
      .filter((u) => s.committedIds.includes(u.id))
      .reduce((n, u) => n + stats(s, u).will, 0);
    // At The Crack of Doom the first player keeps enough heroes ready for
    // the last Fortitude test: more willpower than the cards it discards (the
    // tens digit of his threat and 1 for each player).
    const lastTest = s.stage === 4 && activeSeat(s) === (s.table?.first ?? 0);
    const reserve = new Set<string>();
    if (lastTest) {
      const cards = (Math.floor(s.threat / 10) % 10) + players(s);
      let will = 0;
      for (const h of seatView(s, activeSeat(s))
        .heroes.filter((h) => !h.exhausted && stats(s, h).will > 0)
        .sort((a, b) => stats(s, b).will - stats(s, a).will)) {
        if (will > cards) break;
        reserve.add(h.id);
        will += stats(s, h).will;
      }
    }
    const own = characters(s)
      .filter(
        (u) =>
          canCommit(s, u) &&
          stats(s, u).will > 0 &&
          !s.committedIds.includes(u.id) &&
          !reserve.has(u.id),
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
  // Mount Doom waits for the last stage's 20 progress.
  if (location?.code === MD.doom && s.progress < MD_GASP_PROGRESS)
    return { type: "NEXT" };
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
/** Take a location out of the encounter deck or its discard pile. */
function takeLocation(s: GameState, code: string) {
  for (const zone of [s.encounterDeck, s.encounterDiscard]) {
    const i = zone.indexOf(code);
    if (i >= 0) {
      zone.splice(i, 1);
      return make(s, code);
    }
  }
  return undefined;
}
/** The active location returns to the encounter discard pile. */
function clearActive(s: GameState) {
  if (s.activeLocation) s.encounterDiscard.push(s.activeLocation.code);
  s.activeLocation = null;
  s.extraActiveLocations = [];
}

/**
 * A late-game start at The Road to Isenmouthe: Mordor Road is in the staging
 * area with no active location, the quest card holds a resource for each
 * player but one, each player's threat is 15 and each player has put up to 3
 * non-unique allies
 * from his deck into play. One passed Fortitude test after a successful
 * quest takes the players to The Last Gasp.
 */
export function mdRoad(s: GameState) {
  const q = s.mountDoom!;
  clearActive(s);
  const road = takeLocation(s, MD.mordorRoad);
  if (road) s.staging.push(road);
  reinforce(s);
  for (const p of playerOrder(s)) forOwner(s, p, () => (s.threat = 15));
  s.encounterDeck = shuffle(s, s.encounterDeck);
  s.stage = 2;
  s.progress = 0;
  q.currentQuest = MD.road;
  q.resources = Math.max(0, playerOrder(s).length - 1);
}
/**
 * A late-game start at The Last Gasp with 20 progress: the players may travel
 * to Mount Doom (each player makes a Fortitude test), which defeats the stage
 * at once; The Crack of Doom then needs Mount Doom explored and the first
 * player's last Fortitude test. Each player's threat is 10 and each player
 * has put up to 3 non-unique allies from his deck into play.
 */
export function mdGasp(s: GameState) {
  const q = s.mountDoom!;
  clearActive(s);
  reinforce(s);
  for (const p of playerOrder(s)) forOwner(s, p, () => (s.threat = 10));
  s.encounterDeck = shuffle(s, s.encounterDeck);
  s.stage = 3;
  s.progress = MD_GASP_PROGRESS;
  q.currentQuest = MD.gasp;
}
/**
 * A late-game start at The Crack of Doom: Mount Doom is the active location
 * with 8 of its 9 progress, each player's threat is 10 and each player has put
 * up to 3 non-unique allies from his deck into play. The first player keeps
 * his heroes ready for the test, so one successful quest explores Mount Doom
 * and the first player's last Fortitude test wins or loses the game.
 */
export function mdCrack(s: GameState) {
  const q = s.mountDoom!;
  clearActive(s);
  const doom = s.staging.find((u) => u.code === MD.doom);
  if (doom) {
    s.staging = s.staging.filter((u) => u.id !== doom.id);
    doom.progress = 8;
    s.activeLocation = doom;
  }
  reinforce(s);
  for (const p of playerOrder(s)) forOwner(s, p, () => (s.threat = 10));
  s.encounterDeck = shuffle(s, s.encounterDeck);
  s.stage = 4;
  s.progress = 0;
  q.currentQuest = MD.crack;
}
export const mdHeroCount = (s: GameState, p: number) =>
  seatView(s, p).heroes.length;
