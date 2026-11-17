import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { SA, annuminasPublicState } from "../game/annuminas-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
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
        <strong data-side={q.side}>
          {q.side} · {STAGE_RULES[q.currentQuest] ?? ""}
        </strong>
        <span data-city-strength={q.cityStrength}>
          {link(SA.city)}: city strength {q.cityStrength}; at 0 the players
          lose.
        </span>
        {q.currentQuest === SA.rebuild && (
          <span data-quest-resources={q.questResources}>
            Resources on Rebuild the Defenses: {q.questResources} of 4.
          </span>
        )}
        {q.currentQuest === SA.defend && (
          <span data-hosts={q.hosts}>
            Hosts of Angmar in the victory display: {q.hosts}.
          </span>
        )}
        <span data-lieutenant={q.lieutenant}>
          {link(SA.lieutenant)} is{" "}
          {q.lieutenant === "aside"
            ? "set aside, out of play"
            : q.lieutenant === "play"
              ? "in play"
              : q.lieutenant === "victory"
                ? "in the victory display"
                : "out of play"}
          .
        </span>
      </div>
    </section>
  );
}
