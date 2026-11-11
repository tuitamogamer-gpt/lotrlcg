import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { ownerOf, seatName } from "../game/table";
import { OMM, ommPublicState } from "../game/misty-mountains-support";
import { bagginsBilbo } from "../game/hobbit-saga";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = { s: GameState; inspect: (c: InspectedCard) => void };
export function MistyMountainsState({ s, inspect }: Props) {
  const q = ommPublicState(s);
  if (!q) return null;
  const bilbo = bagginsBilbo(s);
  const defeated = !!s.victoryCards?.includes(OMM.greatGoblin);
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="over-the-misty-mountains-grim"
      aria-label="Over the Misty Mountains Grim"
    >
      <div className="shadow-east-summary">
        <strong>
          {q.goblinTown
            ? "Goblin Town · the Goblin encounter deck is active"
            : "The high pass · the first encounter deck is active"}
        </strong>
        {bilbo && (
          <span data-baggins-resources={bilbo.resources}>
            Bilbo Baggins ({seatName(s, ownerOf(s, bilbo))}): {bilbo.resources}{" "}
            Baggins resource
            {bilbo.resources === 1 ? "" : "s"}.
          </span>
        )}
        <span data-inactive-deck={q.inactiveDeck}>
          {q.goblinTown ? "The first deck" : "The Goblin deck"} waits set aside,
          inactive: {q.inactiveDeck} card{q.inactiveDeck === 1 ? "" : "s"}.
        </span>
        {s.stage === 3 && (
          <span>
            <button
              className="fortress-nurn-link"
              aria-label="Inspect The Great Goblin"
              onClick={() => inspect(card(OMM.greatGoblin))}
            >
              The Great Goblin
            </button>{" "}
            {defeated
              ? "is in the victory display; defeat this stage to win."
              : "must be in the victory display before this stage can be defeated."}
          </span>
        )}
        {q.guffawing.length > 0 && (
          <span>
            A Stone-giant engages the player with the highest threat at the end
            of the quest phase.
          </span>
        )}
      </div>
    </section>
  );
}
