import type { GameState } from "../game/types";
import { card } from "../game/cards";
import {
  JD,
  JD_BRIDGE_CAP,
  journeyDarkPublicState,
} from "../game/journey-dark-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
export function JourneyDarkState({ s, inspect }: Props) {
  const q = journeyDarkPublicState(s);
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
  const stage = s.stage;
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="journey-in-the-dark"
      aria-label="Journey in the Dark"
    >
      <div className="shadow-east-summary">
        <strong data-stage={stage}>
          {stage === 1
            ? "The Long Dark of Moria: after a player optionally engages an enemy, 1 damage token is removed from Doom, Doom, Doom."
            : stage === 2
              ? `Drums in the Deep: the players cannot advance while Chamber of Mazarbul is in play or with fewer than ${q.drumsGoal} resource tokens on the stage; each defeated enemy places 1. With no enemy in the staging area as the quest phase begins, the first player reveals an additional card.`
              : `The Bridge of Khazad-dûm: no more than ${JD_BRIDGE_CAP} progress on this stage each round; it cannot be defeated while The Great Bridge is in play, and defeating it wins the game.`}
        </strong>
        <span
          data-doom={q.doom}
          data-balrog={q.balrog}
          data-balrog-damage={q.balrogDamage}
          data-unbound={q.balrogUnbound ? "true" : "false"}
        >
          {link(JD.doom)}: {q.doom} damage token{q.doom === 1 ? "" : "s"}; at
          the end of each quest phase 1 is removed, and with none left{" "}
          {link(JD.balrog)} enters the staging area and attacks.{" "}
          {q.balrog === "aside"
            ? "The Balrog is set aside."
            : q.balrog === "defeated"
              ? "The Balrog is defeated."
              : `The Balrog is ${q.balrog === "staging" ? "in the staging area, engaged with the first player" : "engaged"} (${q.balrogDamage} damage${q.balrogUnbound ? "; it has lost all keywords" : "; Indestructible"}).`}
        </span>
        {stage === 2 && (
          <span data-drums={q.drums} data-drums-goal={q.drumsGoal}>
            Resource tokens on Drums in the Deep: {q.drums} of {q.drumsGoal}.
          </span>
        )}
        {stage === 3 && (
          <span data-bridge-placed={q.bridgePlaced}>
            Progress on the stage this round: {q.bridgePlaced} of{" "}
            {JD_BRIDGE_CAP}.
          </span>
        )}
        <span data-set-aside={q.setAside.length}>
          {q.setAside.length
            ? `Set aside: ${q.setAside.map((c) => card(c).name).join(", ")}.`
            : "No card is set aside."}
        </span>
      </div>
    </section>
  );
}
