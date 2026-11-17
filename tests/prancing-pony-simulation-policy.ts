import { card } from "../src/game/cards";
import { canCommit, canTravel, characters, stats } from "../src/game/engine";
import { get, make, shuffle, stagingThreat, threatOf } from "../src/game/core";
import { optionalEngagementProblem } from "../src/game/actions";
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
  PP,
  PP_HIDEOUTS,
  PP_STAGE,
  PP_SUSPECTS,
  isHideout,
  isSuspect,
  printedInvestigate,
} from "../src/game/prancing-pony-support";
import type {
  Action,
  GameState,
  Option,
  ScenarioId,
  Unit,
} from "../src/game/types";

export const PP_SIM_SCENARIOS = [
  "murder-at-the-prancing-pony",
] as const satisfies readonly ScenarioId[];
export type PpSimScenario = (typeof PP_SIM_SCENARIOS)[number];
export const isPpSimScenario = (id: ScenarioId): id is PpSimScenario =>
  PP_SIM_SCENARIOS.some((scenario) => scenario === id);

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
/** The Suspects and Hideouts the players have not ruled out. */
const unchecked = (s: GameState, list: readonly string[]) =>
  list.filter((c) => !s.prancingPony?.checked.includes(c));
/** Name the only possibility, else the first unchecked card. */
const suspectGuess = (s: GameState) => unchecked(s, PP_SUSPECTS)[0];
const hideoutGuess = (s: GameState) => unchecked(s, PP_HIDEOUTS)[0];
/** The first player accuses once the list is narrowed down or time runs out. */
function readyToAccuse(s: GameState) {
  const q = s.prancingPony;
  if (!q) return true;
  const sure =
    unchecked(s, PP_SUSPECTS).length <= 1 &&
    unchecked(s, PP_HIDEOUTS).length <= 1;
  return sure || !q.investigation.length || s.threat >= 38;
}

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function ppSimulationChoice(s: GameState): Option | undefined {
  if (!isPpSimScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  const by = (id: string) => options.find((o) => o.id === id);
  if (/^Revealed · /.test(title)) return by("resolve");
  // 1B: raise threat while it is low, else reveal another card.
  if (/^Investigating the Crime · Raise your threat by 2/.test(title))
    return s.threat < 32 ? by("threat") : by("reveal");
  if (/^The Prancing Pony · Look at the top 2/.test(title)) return by("look");
  if (/^Old Warehouse · /.test(title))
    return unchecked(s, PP_SUSPECTS).length + unchecked(s, PP_HIDEOUTS).length >
      2
      ? by("look")
      : by("threat");
  if (/^Village Stable · /.test(title)) return by("skip");
  if (/^Running out of Time · Reveal an encounter card, or make/.test(title))
    return readyToAccuse(s) ? by("accuse") : by("reveal");
  if (/^The accusation · Name a Suspect/.test(title))
    return by(suspectGuess(s) ?? "") ?? options[0];
  if (/^The accusation · Name a Hideout/.test(title))
    return by(hideoutGuess(s) ?? "") ?? options[0];
  if (/^Rising Body Count · /.test(title))
    return s.threat < 30 ? by("threat") : by("shuffle");
  if (/^Greenway Footpad · /.test(title))
    return s.threat < 30 ? by("threat") : by("attack");
  if (/^Bill Ferny · /.test(title))
    return s.threat < 30 ? by("threat") : by("undefended");
  if (/^Chetwood Outlaw · /.test(title)) return by("return");
  if (/^Bree-land Informant · /.test(title))
    return s.threat < 35
      ? (options.find((o) => o.id !== "skip") ?? by("skip"))
      : by("skip");
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
      by("undefended") ??
      options[0]
    );
  }
  for (const id of ["use", "gain", "draw"]) {
    const preferred = by(id);
    if (preferred) return preferred;
  }
  return by("skip") ?? by("resolve") ?? options[0];
}

export function ppSimulationAction(s: GameState): Action | undefined {
  if (!isPpSimScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
  const q = s.prancingPony;
  const killer = q?.currentQuest === PP.killer && !s.stageRevealing;
  // The encounter phase: a player with one enemy engaged or none engages the
  // weakest enemy in the staging area.
  if (s.phase === "encounter") {
    const weakest = s.staging
      .filter(
        (u) =>
          card(u.code).type_code === "enemy" &&
          !optionalEngagementProblem(s, u) &&
          // No Suspect is fought while a Hideout protects it at 3B.
          !(isSuspect(u.code) && !killer),
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
  // Staddle Hiding Hole: only the engaged player declares attackers against a
  // Suspect; the players attack the enemy that can take damage.
  if (s.phase === "attack") {
    const me = activeSeat(s);
    const staddle = (s.victoryCards ?? []).includes(PP.staddle);
    const enemy = engagedEnemies(s).find(
      (e) =>
        !e.attackedBy?.includes(me) &&
        attackersFor(s, e).some((u) => ownerOf(s, u) === me),
    );
    if (!enemy) return { type: "END_ATTACKS" };
    const ids = attackersFor(s, enemy)
      .filter(
        (u) => !(staddle && isSuspect(enemy.code)) || ownerOf(s, u) === me,
      )
      .map((u) => u.id);
    return { type: "ATTACK", enemyId: enemy.id, attackerIds: ids };
  }
  if (s.phase === "quest") {
    // Commit enough willpower for the staging area and some progress; the
    // best defender stays back. At 3B with no Hideout left in play, the
    // players only keep their threat down and hold the rest back to attack.
    const hideout = [
      ...s.staging,
      ...(s.activeLocation ? [s.activeLocation] : []),
    ].some((u) => isHideout(u.code));
    const target = stagingThreat(s) + (killer && !hideout ? 0 : 3 * players(s));
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
      own.find((u) => u.id !== guard?.id) ??
      (committed || (killer && !hideout) ? undefined : own[0]);
    return next && committed < target
      ? { type: "TOGGLE_QUEST", id: next.id }
      : { type: "COMMIT" };
  }
  if (s.phase !== "travel") return;
  if (s.activeLocation) return { type: "NEXT" };
  const open = s.staging.filter(
    (u) => card(u.code).type_code === "location" && !canTravel(s, u),
  );
  // At 3B the Hideouts must go; before, the best Investigate value for its
  // threat.
  const score = (u: Unit) =>
    (killer && isHideout(u.code) ? 20 : 0) +
    (killer ? 0 : 2 * printedInvestigate(u.code)) -
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
/**
 * A late-game start at stage 2B (Running out of Time): the players have
 * looked at every card of the Investigation deck but one Suspect and one
 * Hideout, so the accusation can be made with certainty. Each player's threat
 * is 15 and each player has put up to 3 non-unique allies from his deck into
 * play.
 */
export function ppAccuse(s: GameState) {
  const q = s.prancingPony!;
  reinforce(s);
  for (const p of playerOrder(s)) forOwner(s, p, () => (s.threat = 15));
  q.checked = [
    ...PP_SUSPECTS.filter((c) => c !== q.guilty?.suspect),
    ...PP_HIDEOUTS.filter((c) => c !== q.guilty?.hideout),
  ];
  q.investigation = shuffle(s, q.investigation);
  q.currentQuest = PP.time;
  s.stage = PP_STAGE[PP.time];
  s.progress = 0;
}
/**
 * A late-game start at stage 3B (Apprehending the Killer) after a correct
 * accusation: the guilty Suspect is engaged with the first player and the
 * guilty Hideout is in the staging area. Each player's threat is 15 and each
 * player has put up to 3 non-unique allies from his deck into play.
 */
export function ppKiller(s: GameState) {
  const q = s.prancingPony!;
  reinforce(s);
  for (const p of playerOrder(s)) forOwner(s, p, () => (s.threat = 15));
  const guilty = q.guilty!;
  q.guilty = null;
  q.accusation = { ...guilty, correct: true };
  q.checked = [...PP_SUSPECTS, ...PP_HIDEOUTS];
  if (s.activeLocation) s.encounterDiscard.push(s.activeLocation.code);
  s.activeLocation = null;
  s.staging.push(make(s, guilty.hideout));
  const first = playerOrder(s)[0];
  forOwner(s, first, () => s.engaged.push(make(s, guilty.suspect)));
  q.currentQuest = PP.killer;
  s.stage = PP_STAGE[PP.killer];
  s.progress = 0;
}
/**
 * The last fight, at 3B after a correct accusation: the guilty Hideout has
 * been explored into the victory display, so the guilty Suspect, engaged with
 * the first player, can take damage; it has 3 hit points left. Each player's
 * threat is 15 and each player has put up to 3 non-unique allies from his deck
 * into play.
 */
export function ppFinal(s: GameState) {
  const q = s.prancingPony!;
  reinforce(s);
  for (const p of playerOrder(s)) forOwner(s, p, () => (s.threat = 15));
  const guilty = q.guilty!;
  q.guilty = null;
  q.accusation = { ...guilty, correct: true };
  q.checked = [...PP_SUSPECTS, ...PP_HIDEOUTS];
  if (s.activeLocation) s.encounterDiscard.push(s.activeLocation.code);
  s.activeLocation = null;
  addVictoryCard(s, guilty.hideout);
  const first = playerOrder(s)[0];
  forOwner(s, first, () => {
    const suspect = make(s, guilty.suspect);
    suspect.damage = (card(guilty.suspect).health ?? 3) - 3;
    s.engaged.push(suspect);
  });
  q.currentQuest = PP.killer;
  s.stage = PP_STAGE[PP.killer];
  s.progress = 0;
}
