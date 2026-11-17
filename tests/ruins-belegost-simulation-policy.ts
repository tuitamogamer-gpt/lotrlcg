import { card } from "../src/game/cards";
import { canCommit, canTravel, characters, stats } from "../src/game/engine";
import { get, make, shuffle, stagingThreat, threatOf } from "../src/game/core";
import {
  availableAbilities,
  optionalEngagementProblem,
} from "../src/game/actions";
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
import { addVictoryCard } from "../src/game/board";
import {
  RB,
  RB_STAGE,
  isLoot,
  printedDiscover,
} from "../src/game/ruins-belegost-support";
import type {
  Action,
  GameState,
  Option,
  ScenarioId,
  Unit,
} from "../src/game/types";

export const RB_SIM_SCENARIOS = [
  "the-ruins-of-belegost",
] as const satisfies readonly ScenarioId[];
export type RbSimScenario = (typeof RB_SIM_SCENARIOS)[number];
export const isRbSimScenario = (id: ScenarioId): id is RbSimScenario =>
  RB_SIM_SCENARIOS.some((scenario) => scenario === id);

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
/** The Loot that takes the current stage to its preferred branch. */
const WANTED: Record<string, string> = {
  [RB.first]: RB.keys,
  [RB.evils]: RB.book,
  [RB.deeper]: RB.book,
  [RB.servants]: RB.torch,
  [RB.roots]: RB.map,
  [RB.mines]: RB.gem,
};

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function rbSimulationChoice(s: GameState): Option | undefined {
  if (!isRbSimScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  if (/^Revealed · /.test(title))
    return options.find((o) => o.id === "resolve");
  // Sword of Belegost cancels a shadow effect when it can.
  if (/^A shadow falls/.test(title))
    return (
      options.find((o) => o.id.startsWith("sword-")) ??
      options.find((o) => o.id === "resolve")
    );
  // Discover: the Loot that leads the quest on, else the first.
  if (/^Discover · Choose a Loot/.test(title)) {
    const want = WANTED[s.ruinsBelegost?.currentQuest ?? ""];
    return options.find((o) => o.id === want) ?? options[0];
  }
  // Claims: the hero with the fewest attachments.
  if (/· Attach it to a hero you control/.test(title))
    return [...options].sort(
      (a, b) =>
        (get(s, a.id)?.attachments.length ?? 9) -
        (get(s, b.id)?.attachments.length ?? 9),
    )[0];
  if (/^Secret Chamber · Attach a Loot/.test(title))
    return options.find((o) => o.id !== "skip") ?? options[0];
  if (/^Concealed Spikes · Assign \d+ damage or discard/.test(title))
    return options.find((o) => o.id === "damage") ?? options[0];
  // Assign damage: the character with the most remaining hit points.
  if (
    /Assign damage among|Deal \d+ damage|Assign.*damage|damage.*hero|damage.*character/i.test(
      title,
    ) &&
    options.some((o) => get(s, o.id))
  )
    return (
      [...options.filter((o) => get(s, o.id))].sort(
        (a, b) => room(s, b.id) - room(s, a.id),
      )[0] ?? options[0]
    );
  // Discard or exhaust the least valuable character: an ally if possible.
  if (/^Covered Pit · Discard an ally|Exhaust a character/.test(title))
    return (
      [...options.filter((o) => isAlly(s, o.id))].sort(
        (a, b) => room(s, a.id) - room(s, b.id),
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

/** A ready Loot with an Action the policy uses this phase. */
function lootAction(s: GameState): Action | undefined {
  for (const h of s.heroes)
    for (const a of h.attachments) {
      if (!isLoot(a.code) || a.exhausted) continue;
      const useful =
        (a.code === RB.keys && s.phase === "planning") ||
        (a.code === RB.book && s.phase === "planning") ||
        (a.code === RB.gem && s.threat >= 25);
      if (
        useful &&
        availableAbilities(s, h).some((o) => o.id === a.id && !o.disabled)
      )
        return { type: "ABILITY", id: h.id, attachmentId: a.id };
    }
  return undefined;
}

export function rbSimulationAction(s: GameState): Action | undefined {
  if (!isRbSimScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
  const loot = lootAction(s);
  if (loot) return loot;
  // The encounter phase: a player with one enemy engaged or none engages the
  // weakest enemy in the staging area.
  if (s.phase === "encounter") {
    // Naurlhûg only once he can take damage.
    const lair = (s.victoryCards ?? []).includes(RB.lair);
    const weakest = s.staging
      .filter(
        (u) =>
          card(u.code).type_code === "enemy" &&
          !optionalEngagementProblem(s, u) &&
          (u.code !== RB.naurlhug || (s.stage === 4 && lair)),
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
  // Old Stone Troll: only the engaged player declares attackers against it.
  if (s.phase === "attack") {
    const me = activeSeat(s);
    const enemy = engagedEnemies(s).find(
      (e) =>
        !e.attackedBy?.includes(me) &&
        attackersFor(s, e).some((u) => ownerOf(s, u) === me),
    );
    if (!enemy) return { type: "END_ATTACKS" };
    const ids = attackersFor(s, enemy)
      .filter((u) => enemy.code !== RB.troll || ownerOf(s, u) === me)
      .map((u) => u.id);
    return { type: "ATTACK", enemyId: enemy.id, attackerIds: ids };
  }
  if (s.phase === "quest") {
    // Commit enough willpower for the staging area and some progress; the
    // best defender stays back. 4B has no quest points: the players only
    // keep their threat down and hold Sword of Belegost back to attack.
    const beast =
      s.ruinsBelegost?.currentQuest === RB.beast && !s.stageRevealing;
    const target = stagingThreat(s) + (beast ? 0 : 3 * players(s));
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
    const sword = (u: Unit) =>
      beast && u.attachments.some((a) => a.code === RB.sword);
    const next =
      own.find((u) => u.id !== guard?.id && !sword(u)) ??
      (committed || beast ? undefined : own[0]);
    return next && committed < target
      ? { type: "TOGGLE_QUEST", id: next.id }
      : { type: "COMMIT" };
  }
  if (s.phase !== "travel") return;
  if (s.activeLocation) return { type: "NEXT" };
  const open = s.staging.filter(
    (u) => card(u.code).type_code === "location" && !canTravel(s, u),
  );
  // Naurlhûg's Lair must be explored before Naurlhûg can take damage; else
  // the location with the best Discover value for its threat.
  const score = (u: Unit) =>
    (u.code === RB.lair ? 20 : 0) +
    2 * printedDiscover(u.code) -
    threatOf(s, u) / 2;
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
/** Take a card out of the encounter deck or discard pile. */
function take(s: GameState, c: string) {
  for (const zone of [s.encounterDeck, s.encounterDiscard]) {
    const i = zone.indexOf(c);
    if (i >= 0) {
      zone.splice(i, 1);
      return true;
    }
  }
  return false;
}
/** Attach a Loot objective from the encounter deck to the first player's hero. */
function claim(s: GameState, c: string, index = 0) {
  const q = s.ruinsBelegost!;
  if (q.under === c) q.under = null;
  else if (!take(s, c)) return;
  const first = playerOrder(s)[0];
  forOwner(s, first, () => {
    const hero = s.heroes[index % s.heroes.length];
    hero.attachments.push({ id: `a${s.nextId++}`, code: c, exhausted: false });
  });
}
/**
 * A late-game start at the end of Deeper into the Past: the first player's
 * heroes hold Keys of Belegost and Book of Aulë's Children, 2D holds its 3
 * resources and 9 progress, so it is defeated at once and the quest goes on at
 * The Mines of Belegost (3E), which reveals an encounter card for each player;
 * 3F then needs Blue Mountain Gem for The Beast of Belegost. Each player's
 * threat is 10 and each player has put up to 3 non-unique allies from his deck
 * into play.
 */
export function rbMines(s: GameState) {
  const q = s.ruinsBelegost!;
  if (s.activeLocation) s.encounterDiscard.push(s.activeLocation.code);
  s.activeLocation = null;
  reinforce(s);
  for (const p of playerOrder(s)) forOwner(s, p, () => (s.threat = 10));
  claim(s, RB.keys, 0);
  claim(s, RB.book, 1);
  s.encounterDeck = shuffle(s, s.encounterDeck);
  q.currentQuest = RB.deeper;
  s.stage = RB_STAGE[RB.deeper];
  q.questResources = 3;
  s.progress = 9;
}
/**
 * The last fight, at 4B: Naurlhûg's Lair is in the victory display, Naurlhûg
 * is engaged with the first player with 14 damage (6 hit points left) and
 * Sword of Belegost is attached to the first player's first hero; Stalking the
 * Ruins holds no resources. Each player's threat is 10 and each player has put
 * up to 3 non-unique allies from his deck into play.
 */
export function rbFinal(s: GameState) {
  const q = s.ruinsBelegost!;
  if (s.activeLocation) s.encounterDiscard.push(s.activeLocation.code);
  s.activeLocation = null;
  reinforce(s);
  for (const p of playerOrder(s)) forOwner(s, p, () => (s.threat = 10));
  q.setAside = q.setAside.filter(
    (c) => c !== RB.sword && c !== RB.lair && c !== RB.naurlhug,
  );
  addVictoryCard(s, RB.lair);
  const first = playerOrder(s)[0];
  forOwner(s, first, () => {
    s.heroes[0].attachments.push({
      id: `a${s.nextId++}`,
      code: RB.sword,
      exhausted: false,
    });
    const dragon = make(s, RB.naurlhug);
    dragon.damage = 14;
    s.engaged.push(dragon);
  });
  const stalking = s.staging.find((u) => u.code === RB.stalking);
  if (stalking) stalking.resources = 0;
  s.encounterDeck = shuffle(s, s.encounterDeck);
  q.currentQuest = RB.beast;
  s.stage = RB_STAGE[RB.beast];
  s.progress = 0;
}
/**
 * A late-game start at the end of The Servants of Morgoth: Dwarven Torch is
 * attached to a hero of the first player and 3B holds its 6 progress, so The
 * Beast of Belegost begins at once: Naurlhûg and his lair are added to the
 * staging area. Naurlhûg's Lair is already in the victory display, so he can
 * take damage, and Sword of Belegost is attached to the first player's first
 * hero. Each player's threat is 10 and each player has put up to 3
 * non-unique allies from his deck into play.
 */
export function rbBeast(s: GameState) {
  const q = s.ruinsBelegost!;
  if (s.activeLocation) s.encounterDiscard.push(s.activeLocation.code);
  s.activeLocation = null;
  reinforce(s);
  for (const p of playerOrder(s)) forOwner(s, p, () => (s.threat = 10));
  claim(s, RB.torch, 0);
  q.setAside = q.setAside.filter((c) => c !== RB.sword && c !== RB.lair);
  addVictoryCard(s, RB.lair);
  const first = playerOrder(s)[0];
  forOwner(s, first, () =>
    s.heroes[0].attachments.push({
      id: `a${s.nextId++}`,
      code: RB.sword,
      exhausted: false,
    }),
  );
  s.encounterDeck = shuffle(s, s.encounterDeck);
  q.currentQuest = RB.servants;
  s.stage = RB_STAGE[RB.servants];
  s.progress = 6;
}
