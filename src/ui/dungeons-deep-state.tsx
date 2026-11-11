import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { ownerOf, seatName } from "../game/table";
import { DDCD, ddcdPublicState } from "../game/dungeons-deep-support";
import { bagginsBilbo } from "../game/hobbit-saga";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = { s: GameState; inspect: (c: InspectedCard) => void };
export function DungeonsDeepState({ s, inspect }: Props) {
  const q = ddcdPublicState(s);
  if (!q) return null;
  const bilbo = bagginsBilbo(s);
  const link = (code: string) => (
    <button
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
      data-scenario-panel="dungeons-deep-and-caverns-dim"
      aria-label="Dungeons Deep and Caverns Dim"
    >
      <div className="shadow-east-summary">
        <strong>
          {s.stage === 3
            ? "Into the Fire · riddles are ignored, treacheries surge"
            : "Riddles in the dark · two quests at once"}
        </strong>
        {s.stage === 1 && (
          <span data-riddle-progress={q.riddleProgress}>
            {link(DDCD.riddles)} (stage 2, riddle area): {q.riddleProgress}/
            {q.riddleGoal} progress, placed only by answering riddles. Both
            stages must be complete to advance.
          </span>
        )}
        {q.bilboInRiddleArea && (
          <span>
            Riddle area: {link(DDCD.gollum)} and Bilbo Baggins
            {bilbo ? ` (${seatName(s, ownerOf(s, bilbo))})` : ""} with{" "}
            {link(DDCD.ring)}. Bilbo cannot quest, attack or defend except
            against Gollum.
          </span>
        )}
        {bilbo && (
          <span data-baggins-resources={bilbo.resources}>
            Bilbo Baggins: {bilbo.resources} Baggins resource
            {bilbo.resources === 1 ? "" : "s"}.
          </span>
        )}
        {q.hiding && (
          <span>
            Hiding in the Trees: characters get −1 willpower and cannot attack
            this round.
          </span>
        )}
      </div>
    </section>
  );
}
