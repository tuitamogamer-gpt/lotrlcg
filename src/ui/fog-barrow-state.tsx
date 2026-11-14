import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { seatName } from "../game/table";
import { FB, fogBarrowPublicState } from "../game/fog-barrow-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
export function FogBarrowState({ s, inspect }: Props) {
  const q = fogBarrowPublicState(s);
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
  const victory = s.victoryCards ?? [];
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="fog-on-the-barrow-downs"
      aria-label="Fog on the Barrow-downs"
    >
      <div className="shadow-east-summary">
        <strong data-stage={stage} data-split={q.split ? "true" : "false"}>
          {stage === 1 ? (
            "The House of Tom Bombadil: the players skip the quest phase, and at the end of the round 1 progress is placed here."
          ) : stage === 2 ? (
            <>
              Across the Downs: each player raises his threat by 1 at the end of
              the refresh phase; the players cannot defeat this stage until{" "}
              {link(FB.hollow)} is in the victory display (
              {victory.includes(FB.hollow) ? "it is" : "it is not"}).
            </>
          ) : (
            <>
              Lost in the Fog: no progress is placed here while a{" "}
              {link(FB.great)} is in play. The players win at 16 progress with
              every player at this stage and {link(FB.standing)} in the victory
              display ({victory.includes(FB.standing) ? "it is" : "it is not"}
              ).
            </>
          )}
        </strong>
        {q.split && (
          <span data-areas={q.areas.length}>
            {q.areas
              .map(
                (a) =>
                  `${a.players.map((p) => seatName(s, p)).join(", ") || "No player"}: ${a.quest} (${a.progress} progress, ${a.cards} card${a.cards === 1 ? "" : "s"} in the staging area)`,
              )
              .join(" · ")}
          </span>
        )}
        <span data-escaped={q.escaped.length}>
          {q.escaped.length
            ? "A player who escaped a barrow returns to Lost in the Fog at the beginning of the travel phase."
            : "Trapped Inside a Barrow: 9 progress lets the player return to Lost in the Fog and place 1 progress on a Great Barrow."}
        </span>
        <span data-buried={q.buried.length}>
          {q.buried.length
            ? `${q.buried.length} all${q.buried.length === 1 ? "y is" : "ies are"} facedown under an Ancient Barrow.`
            : "No ally is under an Ancient Barrow."}
        </span>
        {q.frozen.length > 0 && (
          <span data-frozen={q.frozen.length}>
            {link(FB.frozen)}: until the end of the round,{" "}
            {q.frozen.map((p) => seatName(s, p)).join(", ")} cannot trigger
            Action or Response effects.
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
