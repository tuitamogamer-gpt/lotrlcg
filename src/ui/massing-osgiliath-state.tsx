import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { seatName } from "../game/table";
import { MASSING, massingPublicState } from "../game/massing-osgiliath-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = { s: GameState; inspect: (c: InspectedCard) => void };
const TRAVEL = [
  "",
  "West Bank locations are closed.",
  "West Bank locations are closed.",
  "No East Bank or West Bank location can be traveled to.",
  "East Bank locations are closed.",
];
export function MassingOsgiliathState({ s, inspect }: Props) {
  const q = massingPublicState(s);
  if (!q) return null;
  const counts = Object.entries(q.handCards);
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="the-massing-at-osgiliath"
      aria-label="The Massing at Osgiliath"
    >
      <div className="shadow-east-summary">
        <strong>
          {q.crossed
            ? "Across the Anduin · race to Minas Tirith"
            : "East of the Anduin · the horde gathers"}
        </strong>
        <span>{TRAVEL[s.stage] ?? ""}</span>
        {s.stage === 2 && (
          <span>
            Each player may play or put into play 1 card from hand this round
            {counts.length
              ? ` · used: ${counts.map(([p, n]) => `${seatName(s, Number(p))} ${n}`).join(" · ")}`
              : ""}
            .
          </span>
        )}
        {s.stage === 3 && (
          <span>
            To commit characters, each player first discards a hero or Ranger of
            Ithilien they control. Card effects cannot place progress here or on
            the active location.
          </span>
        )}
        <span>
          {q.witchKingSetAside ? (
            <>
              <button
                className="fortress-nurn-link"
                aria-label="Inspect The Witch-king"
                onClick={() => inspect(card(MASSING.witchKing))}
              >
                The Witch-king
              </button>{" "}
              waits set aside until stage 4.
            </>
          ) : (
            "The Witch-king pursues the fellowship."
          )}
        </span>
      </div>
    </section>
  );
}
