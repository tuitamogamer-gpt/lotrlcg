import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { OF, oldForestPublicState } from "../game/old-forest-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
export function OldForestState({ s, inspect }: Props) {
  const q = oldForestPublicState(s);
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
  const current = card(q.currentQuest);
  const willow = q.setAside.includes(OF.willow) ? "aside" : "staging";
  const played = q.played.some((n) => n > 0)
    ? `Cards played this round: ${q.played.join(" / ")}.`
    : "No card has been played this round.";
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="the-old-forest"
      aria-label="The Old Forest"
    >
      <div className="shadow-east-summary">
        <strong
          data-stage-two={stage === 2 ? current.back_name : ""}
          data-victory={q.victory}
          data-victory-goal={q.victoryGoal}
        >
          {stage === 2 ? (
            <>
              The Living Forest: {link(q.currentQuest, current.back_name)}. The
              locations in the victory display are worth {q.victory} of{" "}
              {q.victoryGoal} victory points; after questing successfully the
              players advance to stage 3A if they have enough, otherwise to a
              different random stage 2A.
            </>
          ) : stage === 3 ? (
            <>
              {link(OF.wicked)}: Old Man Willow is engaged with each player and
              attacks each of them. The players cannot win while Withywindle is
              in play.
            </>
          ) : (
            <>
              {link(OF.farewell)}: each player adds a different location to the
              staging area, then the players advance to a random stage 2A.
            </>
          )}
        </strong>
        <span data-stage-two-left={q.stageTwo.length}>
          {stage === 2
            ? `${q.stageTwo.length} other stage 2 cards wait in the quest deck: ${q.stageTwo.map((c) => card(c).back_name).join(", ")}.`
            : `Victory display: ${q.victory} victory points on locations.`}
        </span>
        <span data-willow={willow}>
          {link(OF.willow)} and {link(OF.withywindle)}:{" "}
          {willow === "aside"
            ? "set aside until stage 3A."
            : "in play since stage 3A."}
        </span>
        <span
          data-ending={q.endingFailing}
          data-tom={q.tom ? "true" : "false"}
          data-played={q.played.join(",")}
        >
          {q.endingFailing
            ? `Ending and Failing: at the end of this phase each player raises their threat by the number of enemies in the staging area${q.endingFailing > 1 ? ` (${q.endingFailing} times)` : ""}. `
            : ""}
          {q.tom
            ? "Tom Bombadil is discarded at the end of the round, then the encounter discard pile is shuffled into the encounter deck. "
            : ""}
          {played}
        </span>
      </div>
    </section>
  );
}
