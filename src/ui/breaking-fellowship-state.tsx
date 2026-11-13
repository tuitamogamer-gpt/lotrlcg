import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { seatName } from "../game/table";
import {
  BF,
  breakingFellowshipPublicState,
} from "../game/breaking-fellowship-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
export function BreakingFellowshipState({ s, inspect }: Props) {
  const q = breakingFellowshipPublicState(s);
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
      data-scenario-panel="breaking-of-the-fellowship"
      aria-label="Breaking of the Fellowship"
    >
      <div className="shadow-east-summary">
        <strong data-stage={stage} data-split={q.split ? "true" : "false"}>
          {stage === 1
            ? "The Great River: enemies get +2 defense and cannot be engaged, and the players skip the encounter phase. They cannot advance while The Argonath is in play."
            : stage === 2
              ? "The Company Divided: at the end of the refresh phase each player creates his own staging area and advances to a different stage 3A."
              : "Each player is at his own stage. While Frodo's Choice is not in play, progress at stage 3 discards encounter cards instead; the stage where Frodo's Choice is revealed advances to The Ring-bearer Sets Out, which wins the game when defeated."}
        </strong>
        {q.split && (
          <span data-areas={q.areas.length}>
            {q.areas
              .map(
                (a) =>
                  `${a.players.map((p) => seatName(s, p)).join(", ") || "Stage 2"}: ${a.quest} (${a.progress} progress, ${a.cards} card${a.cards === 1 ? "" : "s"} in the staging area)`,
              )
              .join(" · ")}
          </span>
        )}
        <span
          data-ring-bearer={
            q.ringBearerOut ? "out" : q.frodoPlayer !== null ? "choice" : "in"
          }
        >
          {q.ringBearerOut ? (
            "The Ring-bearer has been removed from the game until Frodo's Choice is revealed."
          ) : q.frodoPlayer !== null ? (
            <>
              {link(BF.choice)}: {seatName(s, q.frodoPlayer)} controls the
              Ring-bearer and keeps the first player token.
            </>
          ) : (
            "The Ring-bearer travels with the Company."
          )}
        </span>
        <span data-set-aside={q.setAside.length}>
          {q.setAside.length
            ? `Set aside: ${q.setAside.map((c) => card(c).name).join(", ")}.`
            : "No card is set aside."}
        </span>
      </div>
    </section>
  );
}
