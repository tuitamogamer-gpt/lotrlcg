// Printed definitions and pure projections have no runtime-handler dependencies.
import cards from "../data/mof-epic-cards.json";
import type { Card, GameState, Unit } from "./types";

/**
 * The Mountain of Fire's epic multiplayer mode: the Epic Multiplayer Mode
 * setup card, In Darkness Bind Them (one copy for each encounter deck) and
 * the two sides of The Eye of Sauron.
 */
export const MOF_EPIC_CARDS = cards as Card[];
const code = (title: string) =>
  MOF_EPIC_CARDS.find((c) => c.name === title)!.code;
export const ME = {
  mode: code("Epic Multiplayer Mode"),
  bind: code("In Darkness Bind Them"),
  /** The Eye of Sauron, its Mount Doom side (1/4). */
  eyeDoom: "octgn:c4b7ea64-91b2-4037-bfce-45e487a96b01",
  /** The Eye of Sauron, its The Black Gate Opens side (2/4). */
  eyeGate: "octgn:2f6a81bb-951f-434a-9cfd-7605a7122fd2",
} as const;
export const ME_SCENARIOS = ["the-black-gate-opens", "mount-doom"] as const;
/** Each team's scenario name, in team order. */
export const ME_NAMES = ["The Black Gate Opens", "Mount Doom"] as const;
/** The Mountain of Fire's epic multiplayer mode is live for this team's game. */
export const mofEpicLive = (s: GameState) =>
  s.epicTeam !== undefined &&
  (ME_SCENARIOS as readonly string[]).includes(s.scenarioId);
/** The Eye of Sauron in this staging area, with the side that belongs here. */
export const meEye = (s: GameState): Unit | undefined =>
  s.staging.find((u) => u.code === ME.eyeDoom || u.code === ME.eyeGate);
/** Each team's game, the active team's being the state itself. */
const teamsOf = (s: GameState): GameState[] =>
  s.epic ? s.epic.teams.map((t, i) => (i === s.epic!.active ? s : t!)) : [s];
/** The epic multiplayer mode's public state, for the panel and the browser checks. */
export function mofEpicPublicState(s: GameState) {
  if (!mofEpicLive(s) || !s.epic) return undefined;
  const teams = teamsOf(s);
  const at = teams.find((t) => meEye(t));
  return {
    team: s.epicTeam ?? 0,
    /** The Eye of Sauron's scenario: "gate" or "doom". */
    eye: at
      ? at.epicTeam === 0
        ? ("gate" as const)
        : ("doom" as const)
      : undefined,
    /** In Darkness Bind Them: no readying by player card effects this round. */
    bound: s.epicBound === s.round,
    teams: teams.map((t, i) => ({
      team: i,
      name: ME_NAMES[i] ?? "",
      active: i === s.epic!.active,
      players: t.table?.seats.length ?? 1,
      stage: t.stage,
      status: t.status,
      eye: !!meEye(t),
    })),
  };
}
