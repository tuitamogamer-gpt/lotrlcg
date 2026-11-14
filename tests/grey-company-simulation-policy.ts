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
import { GC, GC_STONE_PROGRESS } from "../src/game/grey-company-support";
import type {
  Action,
  GameState,
  Option,
  ScenarioId,
  Unit,
} from "../src/game/types";

export const GC_SCENARIOS = [
  "the-passing-of-the-grey-company",
] as const satisfies readonly ScenarioId[];
export type GcScenario = (typeof GC_SCENARIOS)[number];
export const isGcScenario = (id: ScenarioId): id is GcScenario =>
  GC_SCENARIOS.some((scenario) => scenario === id);

const room = (s: GameState, id: string) => {
  const u = get(s, id);
  return u ? stats(s, u).health - u.damage : -99;
};
const isAlly = (s: GameState, id: string) => {
  const u = get(s, id);
  return !!u && card(u.code).type_code === "ally";
};
/** Aragorn must survive: if he leaves play the players lose. */
const precious = (s: GameState, id: string) =>
  get(s, id)?.code === FLAME_WEST_ARAGORN;
const isLocation = (code: string) => card(code).type_code === "location";
/** The threat of the player who must choose. */
const threat = (s: GameState) => s.threat;
const pick = (options: Option[], ...ids: string[]) => {
  for (const id of ids) {
    const option = options.find((o) => o.id === id);
    if (option) return option;
  }
  return undefined;
};

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function gcSimulationChoice(s: GameState): Option | undefined {
  if (!isGcScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  if (/^Revealed · /.test(title))
    return options.find((o) => o.id === "resolve");
  // 1B: the resources are worth 3 threat early on.
  if (/^The Forbidden Door · Add resources/.test(title))
    return pick(options, threat(s) <= 30 ? "resources" : "skip");
  // 2A: the location with the least threat.
  if (/^The Paths of the Dead · Search the encounter deck/.test(title))
    return [...options].sort(
      (a, b) => (card(a.code!).threat ?? 0) - (card(b.code!).threat ?? 0),
    )[0];
  // 2B: play cards while the threat allows it.
  if (/^The Paths of the Dead · Choose one/.test(title))
    return pick(
      options,
      threat(s) < 38 && s.hand.length ? "threat" : "noplay",
      "threat",
    );
  if (/^Overcome by Fear · Spend 1 Fellowship resource/.test(title))
    return pick(options, "detach");
  if (/^The Dead are Following · Overcome by Fear/.test(title))
    return pick(options, threat(s) <= 38 ? "detach" : "skip");
  // The "either … or" choices of the encounter cards.
  if (/^Whispers in the Dark · Choose one/.test(title))
    return pick(options, threat(s) < 36 ? "fear" : "weaken", "weaken");
  if (/^The Way is Shut · Choose one/.test(title))
    return pick(options, threat(s) < 36 ? "fear" : "shut", "shut");
  if (/^No Turning Back · Choose one/.test(title))
    return pick(options, "ally", "fear", "attack");
  if (/^Army of the Dead · Choose one/.test(title))
    return pick(options, "ally", "fear");
  if (/^(Ghosts of Men|Shadow Host) · Choose one/.test(title))
    return pick(options, threat(s) < 40 ? "attack" : "fear", "attack");
  if (/^Dead Man of Dunharrow · Choose one/.test(title))
    return pick(options, threat(s) < 40 ? "threat" : "fear", "threat");
  if (/^Haunted Path · Choose one/.test(title))
    return pick(options, "return", "threat");
  if (/^Faithless Dead · Choose one/.test(title))
    return pick(options, "reveal");
  // Allies discarded: the cheapest one.
  if (/Discard an ally you control/.test(title))
    return [...options].sort(
      (a, b) =>
        (Number(card(get(s, a.id)?.code ?? a.code ?? "").cost) || 0) -
        (Number(card(get(s, b.id)?.code ?? b.code ?? "").cost) || 0),
    )[0];
  // Oathbreaker searches: the weakest enemy.
  if (/Search for an Oathbreaker enemy/.test(title))
    return [...options].sort(
      (a, b) =>
        (card(a.code!).attack ?? 0) +
        (card(a.code!).threat ?? 0) -
        ((card(b.code!).attack ?? 0) + (card(b.code!).threat ?? 0)),
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
  // Immediate attacks: the best defender, never Aragorn.
  if (/Immediate attack/i.test(title)) {
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

/** The order the players prefer locations in. */
function travelRank(s: GameState, u: Unit) {
  if (u.code === GC.stone) return 0;
  // Trysting Place puts an Oathbreaker enemy into play engaged.
  if (u.code === GC.trysting) return 3;
  return 1;
}

export function gcSimulationAction(s: GameState): Action | undefined {
  if (!isGcScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
  if (s.phase === "defense") {
    const enemy = engagedEnemies(s).find(
      (u) => normalAttackPending(s, u) && !enemyAttackPrevented(s, u),
    );
    if (enemy) {
      const candidates = defendersFor(s, enemy);
      const attack = stats(s, enemy).attack;
      const survives = (u: (typeof candidates)[number]) =>
        stats(s, u).health - u.damage > attack - stats(s, u).defense;
      // Aragorn defends only when he survives; the best defender keeps the
      // Phantom threat down.
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
    const next = own.find((u) => u.id !== guard?.id);
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
 * A late-game start: The Dead are Following is under way with 5 progress,
 * The Stone of Erech is in the staging area and Army of the Dead is in the
 * victory display; each player's Overcome by Fear is set aside. The players
 * travel to the Stone by removing the progress and win by exploring it.
 * Every physical card stays in a legal zone.
 */
export function gcStone(s: GameState) {
  const q = s.greyCompany!;
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      if (s.threatAttachments?.some((a) => a.code === GC.fear)) {
        delete s.threatAttachments;
        q.fearAside++;
      }
    });
  const stone = q.setAside.indexOf(GC.stone);
  if (stone >= 0) {
    q.setAside.splice(stone, 1);
    s.staging.push(make(s, GC.stone));
  }
  const army = q.setAside.indexOf(GC.army);
  if (army >= 0) {
    q.setAside.splice(army, 1);
    s.victoryCards = [...(s.victoryCards ?? []), GC.army];
    s.victory = (s.victory ?? 0) + (card(GC.army).victory ?? 0);
  }
  delete q.noPlay;
  shuffle(s, s.encounterDeck);
  s.stage = 3;
  s.progress = GC_STONE_PROGRESS;
  q.currentQuest = GC.following;
}
