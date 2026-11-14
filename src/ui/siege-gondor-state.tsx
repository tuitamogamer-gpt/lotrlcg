import type { GameState } from "../game/types";
import { card } from "../game/cards";
import {
  SG,
  SG_QUAYS,
  SG_SHIPS_TO_TRAVEL,
  siegeGondorPublicState,
} from "../game/siege-gondor-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
export function SiegeGondorState({ s, inspect }: Props) {
  const q = siegeGondorPublicState(s);
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
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="the-siege-of-gondor"
      aria-label="The Siege of Gondor"
    >
      <div className="shadow-east-summary">
        <strong data-stage={q.stage}>
          Attack on Pelargir: each Ship location in the staging area is immune
          to player card effects. The players cannot defeat this stage while
          Great Corsair Ship is in play; when it is defeated, the players win.
        </strong>
        <span data-fleet={q.fleet}>
          {link(SG.fleet)}: {q.fleet} resource{q.fleet === 1 ? "" : "s"} (X). At
          the beginning of each staging step it gains 1 resource, then each
          player reveals an encounter card or assigns X damage among characters
          he controls.
        </span>
        <span
          data-ships={q.ships}
          data-great-ship={
            q.greatShipActive
              ? "active"
              : q.greatShipInStaging
                ? "staging"
                : "explored"
          }
        >
          Ship locations in the victory display: {q.ships} of{" "}
          {SG_SHIPS_TO_TRAVEL}. {link(SG.greatShip)}:{" "}
          {q.greatShipActive
            ? "the active location; explore it to defeat the stage."
            : q.greatShipInStaging
              ? q.ships >= SG_SHIPS_TO_TRAVEL
                ? `in the staging area (threat ${q.fleet}); the players may travel there.`
                : `in the staging area (threat ${q.fleet}); the players cannot travel there yet.`
              : "in the victory display."}
        </span>
        {q.port && (
          <span data-port="true">
            {link(SG.port)}: no more than 1 damage can be healed from each
            character each round.
          </span>
        )}
        {q.quays > 0 && (
          <span data-quays={q.quays}>
            {link(SG.quays)}: {q.quays} of {SG_QUAYS} damage tokens.
          </span>
        )}
        {q.raiding > 0 && (
          <span data-raiding={q.raiding}>
            {link(SG.raiding)}: +{q.raiding} total threat in the staging area
            until the end of the phase.
          </span>
        )}
      </div>
    </section>
  );
}
