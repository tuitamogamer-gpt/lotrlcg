import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { ME, mofEpicPublicState } from "../game/mof-epic-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
import "./annuminas-epic.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
/** The Mountain of Fire's epic multiplayer mode: both teams and The Eye of Sauron. */
export function MofEpicState({ s, inspect }: Props) {
  const q = mofEpicPublicState(s);
  if (!q) return null;
  const link = (code: string, label = card(code).name) => (
    <button
      className="fortress-nurn-link"
      aria-label={`Inspect ${label}`}
      onClick={() => inspect(card(code))}
    >
      {label}
    </button>
  );
  const here = q.team === 0 ? "The Black Gate Opens" : "Mount Doom";
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="mof-epic"
      aria-label="Epic multiplayer mode"
    >
      <div className="shadow-east-summary">
        <strong data-epic-scenario={q.team}>
          Epic multiplayer mode: this team plays {here}; the teams take turns
          within each round, and the end of the round resolves The Black Gate
          Opens first.
        </strong>
        <span data-eye={q.eye ?? "none"}>
          {link(
            q.eye === "gate" ? ME.eyeGate : ME.eyeDoom,
            "The Eye of Sauron",
          )}
          :{" "}
          {q.eye === "gate"
            ? "at The Black Gate Opens, where each enemy in the staging area gets +1 threat and -10 engagement cost."
            : "at Mount Doom, where it adds 1 Sauron's Eye icon to each Fortitude test."}{" "}
          At the end of the round it moves to the other scenario with each
          Nazgûl enemy in its staging area, unless the first player raises each
          player's threat by 3.
        </span>
        <span>
          {link(ME.mode)}: at the end of each round, Mount Doom's first player
          chooses a scenario; each player there draws 1 card and each player at
          the other reduces his threat by 3; then Gwaihir's controller may give
          him to another player. If Mount Doom is defeated, both teams win; if
          the last player at either scenario is eliminated, both lose.
        </span>
        {q.bound && (
          <span data-bound="true">
            {link(ME.bind)}: characters cannot be readied by player card effects
            this round.
          </span>
        )}
        <ul className="epic-teams" aria-label="Epic multiplayer teams">
          {q.teams.map((team) => (
            <li
              key={team.team}
              data-epic-scenario={team.team}
              aria-current={team.active ? "true" : undefined}
            >
              <strong>
                {team.name}
                {team.active ? " · this team" : ""}
              </strong>{" "}
              · stage {team.stage} · {team.players}{" "}
              {team.players === 1 ? "player" : "players"}
              {team.eye ? " · The Eye of Sauron" : ""}
              {team.status !== "playing" ? ` · ${team.status}` : ""}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
