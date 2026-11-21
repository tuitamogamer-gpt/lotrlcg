import type { GameState, ScenarioId } from "./types";
import { fx, prepend } from "./core";

/**
 * Epic multiplayer mode: several teams, each with its own game (staging area,
 * encounter deck, quest deck and players): three teams at three stages of The
 * Siege of Annúminas, or two teams at The Black Gate Opens and Mount Doom. The
 * active team's game is the state itself; the other teams' games wait in
 * `epic.teams`. Within a round the teams take turns: every team resolves the
 * beginning of the round, then every team plays the round, then the end of
 * the round resolves team by team in team order (2B before 2D, 2D before 2F;
 * The Black Gate Opens before Mount Doom). Each turn ends at a barrier: the
 * team waits there until the last team arrives, and then the teams pass it in
 * order.
 */
export type EpicKind = "annuminas" | "mountain-of-fire";
/** Each kind's teams: their scenarios, in team order. */
export const EPIC_SCENARIOS: Record<EpicKind, readonly ScenarioId[]> = {
  annuminas: [
    "the-siege-of-annuminas",
    "the-siege-of-annuminas",
    "the-siege-of-annuminas",
  ],
  "mountain-of-fire": ["the-black-gate-opens", "mount-doom"],
};
/** The epic multiplayer mode a scenario can be played in. */
export const epicKindOf = (scenarioId: string): EpicKind | undefined =>
  (Object.keys(EPIC_SCENARIOS) as EpicKind[]).find((kind) =>
    EPIC_SCENARIOS[kind].includes(scenarioId as ScenarioId),
  );
export interface EpicState {
  kind: EpicKind;
  /** The active team (its game is the top-level state). */
  active: number;
  /** Each team's game while another team plays; the active team's is null. */
  teams: (GameState | null)[];
  /** The teams waiting at the barrier. */
  held: number[];
  /** The teams released past the barrier that have not yet passed it. */
  pass: number[];
  /** The Siege of Annúminas: the city strength of Annúminas (at stage A); 0 otherwise. */
  cityStrength: number;
  /** Lieutenant of Angmar: the last round he moved (he moves once a round). */
  lieutenantRound?: number;
  /** The Eye of Sauron: the last round its Forced effect resolved (once a round). */
  eyeRound?: number;
}
/** The Siege of Annúminas' teams. */
export const EPIC_TEAMS = 3;
/** The number of teams of an epic multiplayer mode. */
export const epicTeamCount = (kind: EpicKind) => EPIC_SCENARIOS[kind].length;
/** Each team's stage letter (the A, C and E quest decks). */
export const EPIC_LETTERS = ["A", "C", "E"] as const;
/** The game ends for the last player of a team: every team loses. */
export function epicEliminationReason(s: GameState) {
  if (epicKindOf(s.scenarioId) === "mountain-of-fire")
    return `The last player at ${s.epicTeam === 0 ? "The Black Gate Opens" : "Mount Doom"} is eliminated: both teams lose the game.`;
  return `The last player at stage ${s.stage}${"BDF"[s.epicTeam ?? 0]} is eliminated: the enemy has broken through the city's defenses and all teams lose the game.`;
}
/** The barriers between the teams' turns. */
export const EPIC_BARRIERS = ["nextRound", "epicRoundBegun", "endRound"];
export const isEpic = (s: GameState) => !!s.epic;
/** Each team's game, the active team's being the state itself. */
export function epicTeams(s: GameState): GameState[] {
  const e = s.epic;
  if (!e) return [s];
  return e.teams.map((t, i) => (i === e.active ? s : t!));
}
/** The other teams' games (the active team excluded). */
export const otherTeams = (s: GameState) =>
  epicTeams(s).filter((_, i) => i !== s.epic?.active);
/** A team's stage label at its current stage, such as "2D". */
export function teamStage(team: GameState, back = true) {
  const letter = EPIC_LETTERS[team.epicTeam ?? 0];
  const side = back ? String.fromCharCode(letter.charCodeAt(0) + 1) : letter;
  return `${team.stage}${side}`;
}
/** Make another team's game the state itself. */
export function selectTeam(s: GameState, team: number) {
  const e = s.epic;
  if (!e || team === e.active) return;
  const { epic: _held, ...current } = s;
  void _held;
  const next = e.teams[team]!;
  e.teams[e.active] = current as GameState;
  for (const key of Object.keys(s))
    if (key !== "epic") delete (s as unknown as Record<string, unknown>)[key];
  Object.assign(s, next);
  e.teams[team] = null;
  e.active = team;
}
/**
 * The game ends for every team at once: a win or a loss at any stage is every
 * team's (the waiting teams' games end with the active team's).
 */
export function epicSettle(s: GameState) {
  const e = s.epic;
  if (!e || s.status === "playing") return;
  for (const t of e.teams)
    if (t && t.status === "playing") {
      t.status = s.status;
      t.reason = s.reason;
      t.choice = null;
      t.queue = [];
    }
  e.held = [];
  e.pass = [];
}
/**
 * A team reaches a barrier. Released teams pass it (false); otherwise the
 * team waits with the barrier at the front of its queue, and the next team
 * that has not arrived takes its turn, or, when every team waits, all are
 * released and team A goes first (true: the effect is held).
 */
export function epicBarrier(s: GameState, kind: string): boolean {
  const e = s.epic;
  if (!e || s.status !== "playing") return false;
  const team = e.active;
  if (e.pass.includes(team)) {
    e.pass = e.pass.filter((t) => t !== team);
    return false;
  }
  prepend(s, fx(kind));
  if (!e.held.includes(team)) e.held.push(team);
  const count = e.teams.length;
  if (e.held.length < count) {
    const next = [...Array(count).keys()].find((t) => !e.held.includes(t))!;
    selectTeam(s, next);
  } else {
    e.held = [];
    e.pass = [...Array(count).keys()];
    selectTeam(s, 0);
  }
  return true;
}
