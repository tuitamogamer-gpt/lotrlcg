import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { SA, annuminasPublicState } from "../game/annuminas-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
import "./annuminas-epic.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
const STAGE_RULES: Record<string, string> = {
  [SA.rebuild]:
    "Rebuild the Defenses: a resource is placed on the stage at the beginning of each round, and at 4 the players advance; at the end of the round, 10 progress here can raise the city strength by 10.",
  [SA.defend]:
    "Defend the City: 50 quest points, 10 fewer for each Host of Angmar in the victory display; after the commitments the strongest enemy in the staging area attacks each player, and at the end of the round each player heals 1 damage.",
  [SA.sortie]:
    "Lead the Sortie: no progress while Battering Ram is in play; with Lieutenant of Angmar in the victory display at the end of the round, the players win.",
};
/** Epic multiplayer mode: each team's stages. */
const EPIC_RULES: Record<string, string> = {
  [SA.rebuild]:
    "Rebuild the Defenses: a resource is placed on the stage at the beginning of each round, and at 4 this team advances; at the end of the round, 10 progress here can raise the city strength by 10.",
  [SA.defend]:
    "Defend the City: 50 quest points, 10 fewer for each Host of Angmar in a victory display; after the commitments the strongest enemy in the staging area attacks each player; at the end of the round, the players at a chosen stage each heal 1 damage.",
  [SA.sortie]:
    "Lead the Sortie: no progress while Battering Ram is in play; at the end of the round, each player's threat can rise by 1 to reveal a card and discard an enemy at another stage; with Lieutenant of Angmar in a victory display, the players win.",
  [SA.levee]:
    "Raise the Levee: a resource is placed on the stage at the beginning of each round, and at 4 this team advances; at the end of the round, 10 progress here gives the first player at each stage a Dúnedain of Annúminas.",
  [SA.guard]:
    "Guard the Gate: 50 quest points, 10 fewer for each Host of Angmar in a victory display; 1 additional encounter card in each quest phase; at the end of the round, the players at a chosen stage each add 1 resource to a hero.",
  [SA.captives]:
    "Rescue the Captives: no progress while Enemy Camp is in play; at the end of the round, each player's threat can rise by 1 to reveal a card and discard an enemy at another stage; with Lieutenant of Angmar in a victory display, the players win.",
  [SA.delay]:
    "Delay the Enemy: a resource is placed on the stage at the beginning of each round, and at 4 this team advances; at the end of the round, 10 progress here makes each other stage reveal 1 fewer card in its next quest phase.",
  [SA.manWalls]:
    "Man the Walls: 50 quest points, 10 fewer for each Host of Angmar in a victory display; a set-aside Host of Angmar joins the staging area at the beginning of each round; at the end of the round, the players at a chosen stage each draw 1 card.",
  [SA.stopAttack]:
    "Stop the Attack: no progress while Siege Tunnel is in play; at the end of the round, each player's threat can rise by 1 to reveal a card and discard an enemy at another stage; with Lieutenant of Angmar in a victory display, the players win.",
};
export function AnnuminasState({ s, inspect }: Props) {
  const q = annuminasPublicState(s);
  if (!q) return null;
  const link = (code: string) => (
    <button
      key={code}
      className="fortress-nurn-link"
      aria-label={`Inspect ${card(code).name}`}
      onClick={() => inspect(card(code))}
    >
      {card(code).name}
    </button>
  );
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="the-siege-of-annuminas"
      aria-label="The Siege of Annúminas"
    >
      <div className="shadow-east-summary">
        {q.teams && (
          <span data-epic-team={q.side}>
            Epic multiplayer mode: this team plays at stage {q.side}; the teams
            take turns within each round, and the end of the round resolves in
            stage order.
          </span>
        )}
        <strong data-side={q.side}>
          {q.side} ·{" "}
          {(q.teams ? EPIC_RULES : STAGE_RULES)[q.currentQuest] ?? ""}
        </strong>
        <span data-city-strength={q.cityStrength}>
          {link(SA.city)}: city strength {q.cityStrength}; at 0 the players
          lose.
        </span>
        {[SA.rebuild, SA.levee, SA.delay].includes(q.currentQuest) && (
          <span data-quest-resources={q.questResources}>
            Resources on {card(q.currentQuest).name}: {q.questResources} of 4.
          </span>
        )}
        {[SA.defend, SA.guard, SA.manWalls].includes(q.currentQuest) && (
          <span data-hosts={q.hosts}>
            Hosts of Angmar in {q.teams ? "a" : "the"} victory display:{" "}
            {q.hosts}.
          </span>
        )}
        {q.captives > 0 && (
          <span data-captives={q.captives}>
            Heroes facedown under the main quest: {q.captives}.
          </span>
        )}
        <span data-lieutenant={q.lieutenant}>
          {link(SA.lieutenant)} is{" "}
          {q.lieutenant === "aside"
            ? "set aside, out of play"
            : q.lieutenant === "play"
              ? "in play"
              : q.lieutenant === "victory"
                ? `in ${q.teams ? "a" : "the"} victory display`
                : "out of play"}
          {q.lieutenantStage ? ` at stage ${q.lieutenantStage}` : ""}.
        </span>
        {q.teams && (
          <ul className="epic-teams" aria-label="Epic multiplayer teams">
            {q.teams.map((team) => (
              <li
                key={team.team}
                data-epic-stage={team.side}
                aria-current={team.active ? "true" : undefined}
              >
                <strong>
                  Stage {team.side}
                  {team.active ? " · this team" : ""}
                </strong>{" "}
                {team.name} · {team.players}{" "}
                {team.players === 1 ? "player" : "players"} · {team.progress}{" "}
                progress · {team.enemies}{" "}
                {team.enemies === 1 ? "enemy" : "enemies"}
                {team.status !== "playing" ? ` · ${team.status}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
