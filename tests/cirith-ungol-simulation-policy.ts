import { card } from "../src/game/cards";
import { canCommit, canTravel, characters, stats } from "../src/game/engine";
import { get, make, shuffle, stagingThreat } from "../src/game/core";
import {
  activeSeat,
  allCharacters,
  attackersFor,
  defendersFor,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
} from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import { enemyAttackPrevented } from "../src/game/engine";
import { isOneRing, ringBearer } from "../src/game/lotr-saga";
import {
  CU,
  CU_CHAMBER_PROGRESS,
  CU_ESCAPE_PROGRESS,
} from "../src/game/cirith-ungol-support";
import { mountainFirePlayerAbilityProblem } from "../src/game/mountain-fire-player-cards";
import type {
  Action,
  GameState,
  Option,
  ScenarioId,
  Unit,
} from "../src/game/types";

export const CU_SCENARIOS = [
  "the-tower-of-cirith-ungol",
] as const satisfies readonly ScenarioId[];
export type CuScenario = (typeof CU_SCENARIOS)[number];
export const isCuScenario = (id: ScenarioId): id is CuScenario =>
  CU_SCENARIOS.some((scenario) => scenario === id);

const room = (s: GameState, id: string) => {
  const u = get(s, id);
  return u ? stats(s, u).health - u.damage : -99;
};
/** The hero carrying The One Ring must survive: if it leaves play the players lose. */
const precious = (s: GameState, id: string) => ringBearer(s)?.id === id;
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
const cheapest = (options: Option[]) =>
  [...options].sort(
    (a, b) =>
      (Number(card(a.code ?? "").cost) || 0) -
      (Number(card(b.code ?? "").cost) || 0),
  )[0];
const unitValue = (s: GameState, u: Unit) =>
  stats(s, u).attack + stats(s, u).defense + stats(s, u).will;

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function cuSimulationChoice(s: GameState): Option | undefined {
  if (!isCuScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  const unit = (o: Option) => units.find((u) => u.id === o.id);
  if (/^Revealed · /.test(title))
    return options.find((o) => o.id === "resolve");
  // The Ring-bearer for the climb: the sturdiest hero, who must survive.
  if (/^Pass the Two Watchers · Attach Last of the Company/.test(title))
    return [...options].sort((a, b) => {
      const ua = get(s, a.id)!,
        ub = get(s, b.id)!;
      return (
        stats(s, ub).health +
          stats(s, ub).defense -
          (stats(s, ua).health + stats(s, ua).defense) ||
        stats(s, ub).will - stats(s, ua).will
      );
    })[0];
  if (/^Drawn to the Ring · Choose one/.test(title))
    return pick(options, "ring", "enemy");
  if (/^Deep Shadows · Choose one/.test(title))
    return pick(
      options,
      s.hand.length <= 4 ? "hand" : "reveal",
      "reveal",
      "hand",
    );
  // Evil Vigilance: discard a questing ally, never a hero, unless the threat is low.
  if (/^Evil Vigilance · Choose one/.test(title)) {
    const threat = options.find((o) => o.id === "threat");
    const allies = options.filter(
      (o) =>
        o.id.startsWith("discard-") && card(o.code ?? "").type_code === "ally",
    );
    if (threat && (s.threat <= 35 || !allies.length)) return threat;
    return cheapest(allies) ?? threat ?? options[0];
  }
  // Exhaust the least useful ready character, never the Ring-bearer first.
  if (/Exhaust a character you control/.test(title))
    return [...options].sort((a, b) => {
      const ua = unit(a),
        ub = unit(b);
      if (!ua || !ub) return 0;
      return (
        Number(precious(s, ua.id)) - Number(precious(s, ub.id)) ||
        unitValue(s, ua) - unitValue(s, ub)
      );
    })[0];
  if (/^Orcish Howls · Resolve this attack against another enemy/.test(title))
    return [...options].sort((a, b) => room(s, a.id) - room(s, b.id))[0];
  if (/Discard a non-objective attachment/.test(title))
    return cheapest(options);
  if (/^Last of the Company · Choose an enemy/.test(title))
    return [...options].sort(
      (a, b) =>
        (card(b.code ?? "").threat ?? 0) - (card(a.code ?? "").threat ?? 0),
    )[0];
  if (/^Frodo Baggins · Add 1 resource/.test(title))
    return [...options].sort(
      (a, b) => (get(s, a.id)?.resources ?? 0) - (get(s, b.id)?.resources ?? 0),
    )[0];
  if (
    /Assign.*damage|damage.*hero|damage.*character/i.test(title) &&
    options.some((o) => get(s, o.id))
  )
    return (
      [...options.filter((o) => get(s, o.id) && !precious(s, o.id))].sort(
        (a, b) => room(s, b.id) - room(s, a.id),
      )[0] ?? options[0]
    );
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

/** The Two Watchers' enemy side in the staging area. */
const watchersEnemy = (s: GameState) =>
  s.staging.find((u) => u.code === CU.watchersEnemy);
/**
 * The attack one player keeps ready to break The Two Watchers this round:
 * its defense plus a share of its remaining hit points, once it is flipped
 * or when the players will travel to it this round.
 */
function watchersNeed(s: GameState) {
  const w = watchersEnemy(s);
  const share = (health: number) => Math.ceil(health / players(s));
  if (w) return stats(s, w).defense + share(stats(s, w).health - w.damage);
  const location = s.staging.find((u) => u.code === CU.twoWatchers);
  if (!location || s.activeLocation) return 0;
  const enemy = card(CU.watchersEnemy);
  if (s.cirithUngol?.currentQuest === CU.watchers)
    return (enemy.defense ?? 0) + share(enemy.health ?? 0);
  if (
    s.cirithUngol?.currentQuest === CU.escape &&
    s.progress >= CU_ESCAPE_PROGRESS
  )
    return (enemy.defense ?? 0) + 3 + share(enemy.health ?? 0);
  return 0;
}
/** The active player's ready attack. */
const readyAttack = (s: GameState) =>
  characters(s)
    .filter((u) => !u.exhausted)
    .reduce((n, u) => n + stats(s, u).attack, 0);

/** The order the players prefer locations in. */
function travelRank(s: GameState, u: Unit) {
  // The Two Watchers and Topmost Chamber are the way forward once allowed.
  if (u.code === CU.twoWatchers || u.code === CU.chamber) return 0;
  // Winding Stairs exhausts a character of each player; the Courtyard raises threat.
  if (u.code === CU.stairs) return 3;
  if (u.code === CU.courtyard) return 2;
  return 1;
}
export function cuSimulationAction(s: GameState): Action | undefined {
  if (!isCuScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
  // Frodo Baggins: exhaust The One Ring for a resource at each planning phase.
  if (s.phase === "planning") {
    const frodo = allCharacters(s).find(
      (u) => u.code === "146001" && ownerOf(s, u) === activeSeat(s),
    );
    if (frodo && !mountainFirePlayerAbilityProblem(s, frodo))
      return { type: "ABILITY", id: frodo.id };
    return;
  }
  if (s.phase === "defense") {
    const enemy = engagedEnemies(s).find(
      (u) => normalAttackPending(s, u) && !enemyAttackPrevented(s, u),
    );
    if (enemy) {
      const candidates = defendersFor(s, enemy);
      const attack = stats(s, enemy).attack;
      // The Two Watchers' damage raises threat instead: no defender is at
      // risk, but a defender is one attacker less to break it this round.
      const harmless = enemy.code === CU.watchersEnemy;
      const ready = readyAttack(s);
      const need = watchersNeed(s);
      const survives = (u: (typeof candidates)[number]) =>
        harmless ||
        stats(s, u).health - u.damage > attack - stats(s, u).defense;
      const defender = [...candidates]
        .filter((u) => !precious(s, u.id) || survives(u))
        .filter(
          (u) =>
            !harmless || ready - (u.exhausted ? 0 : stats(s, u).attack) >= need,
        )
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
          // The Two Watchers first: it blocks the stage.
          Number(b.e.code === CU.watchersEnemy) -
            Number(a.e.code === CU.watchersEnemy) ||
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
    // best defender stays back, and so does the Ring-bearer while The Two
    // Watchers attacks.
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
    // The strongest attackers stay ready to break The Two Watchers.
    const reserve = new Set<string>();
    const need = watchersNeed(s);
    let kept = 0;
    for (const u of [...characters(s)]
      .filter((u) => !u.exhausted && !s.committedIds.includes(u.id))
      .sort((a, b) => stats(s, b).attack - stats(s, a).attack)) {
      if (kept >= need) break;
      reserve.add(u.id);
      kept += stats(s, u).attack;
    }
    const next =
      own.find((u) => u.id !== guard?.id && !reserve.has(u.id)) ??
      (committed ? undefined : own.find((u) => !reserve.has(u.id)));
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

/** Each player puts up to 3 non-unique allies from his deck into play (those with the most attack). */
function reinforce(s: GameState) {
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
}
/** Move a card from the encounter deck, its discard pile or the staging area to the victory display. */
function toVictory(s: GameState, code: string) {
  const fromStaging = s.staging.findIndex((u) => u.code === code);
  if (fromStaging >= 0) s.staging.splice(fromStaging, 1);
  else if (s.activeLocation?.code === code) s.activeLocation = null;
  s.victoryCards = [...(s.victoryCards ?? []), code];
  s.victory = (s.victory ?? 0) + (card(code).victory ?? 0);
}

/**
 * A late-game start at Fighting in the Tower with 18 progress, just after
 * the players travelled to Topmost Chamber: The Two Watchers is in the
 * victory display, Topmost Chamber is the active location with the captive
 * Ring-bearer, its Travel cost put Shagrat into play (engaged with the first
 * player), and each player has put up to 3 non-unique allies from his deck
 * into play. The players must explore the Chamber to free the Ring-bearer,
 * which defeats 2B, then escape. Every physical card stays in a legal zone.
 */
export function cuTower(s: GameState) {
  const q = s.cirithUngol!;
  const w = s.staging.find((u) => u.code === CU.twoWatchers);
  if (w) {
    s.staging = s.staging.filter((u) => u.id !== w.id);
    s.victoryCards = [...(s.victoryCards ?? []), CU.watchersEnemy];
    s.victory = (s.victory ?? 0) + (card(CU.watchersEnemy).victory ?? 0);
  }
  if (s.activeLocation) {
    s.encounterDiscard.push(s.activeLocation.code);
    s.activeLocation = null;
  }
  const chamber = s.staging.find((u) => u.code === CU.chamber);
  if (chamber) {
    s.staging = s.staging.filter((u) => u.id !== chamber.id);
    s.activeLocation = chamber;
  }
  const shagrat = q.setAside.indexOf(CU.shagrat);
  if (shagrat >= 0) {
    q.setAside.splice(shagrat, 1);
    const first = firstPlayer(s);
    forOwner(s, first, () => {
      const enemy = make(s, CU.shagrat);
      enemy.owner = first;
      s.engaged.push(enemy);
    });
  }
  reinforce(s);
  shuffle(s, s.encounterDeck);
  s.stage = 2;
  q.currentQuest = CU.tower;
  s.progress = CU_CHAMBER_PROGRESS;
}

/**
 * A late-game start at Escape from Cirith Ungol with 12 progress: Topmost
 * Chamber and Last of the Company are in the victory display, Frodo is free
 * with The One Ring, The Two Watchers (enemy side) is in the staging area
 * with 2 damage, and each player has put up to 3 non-unique allies from his
 * deck into play. The players must destroy The Two Watchers to win.
 */
export function cuEscape(s: GameState) {
  const q = s.cirithUngol!;
  const first = firstPlayer(s);
  // Last of the Company leaves its host; The One Ring goes to Frodo.
  for (const host of allCharacters(s)) {
    const lotc = host.attachments.find((a) => a.code === CU.company);
    if (lotc) host.attachments = host.attachments.filter((a) => a !== lotc);
  }
  toVictory(s, CU.company);
  toVictory(s, CU.chamber);
  const frodo = q.captive!;
  delete q.captive;
  frodo.owner = first;
  frodo.controller = first;
  const bearer = ringBearer(s);
  const ring = bearer?.attachments.find((a) => isOneRing(a.code));
  if (bearer && ring) {
    bearer.attachments = bearer.attachments.filter((a) => a !== ring);
    frodo.attachments.push(ring);
  }
  forOwner(s, first, () => s.heroes.push(frodo));
  const w = s.staging.find((u) => u.code === CU.twoWatchers);
  if (w) {
    s.staging = s.staging.filter((u) => u.id !== w.id);
    const enemy = make(s, CU.watchersEnemy);
    enemy.id = w.id;
    enemy.damage = 2;
    s.staging.push(enemy);
  }
  reinforce(s);
  if (s.activeLocation) {
    s.encounterDiscard.push(s.activeLocation.code);
    s.activeLocation = null;
  }
  shuffle(s, s.encounterDeck);
  s.stage = 3;
  q.currentQuest = CU.escape;
  s.progress = CU_ESCAPE_PROGRESS;
}
