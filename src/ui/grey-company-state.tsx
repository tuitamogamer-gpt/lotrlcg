import type { GameState } from "../game/types";
import { card } from "../game/cards";
import {
  GC,
  GC_STONE_PROGRESS,
  greyCompanyPublicState,
} from "../game/grey-company-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
export function GreyCompanyState({ s, inspect }: Props) {
  const q = greyCompanyPublicState(s);
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
  const seats = q.fear.length;
  const fearful = q.fear.filter(Boolean).length;
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="the-passing-of-the-grey-company"
      aria-label="The Passing of the Grey Company"
    >
      <div className="shadow-east-summary">
        <strong data-stage={q.stage}>
          {q.stage === 1
            ? "The Forbidden Door: at the end of the planning phase each player discards his hand, and the players advance to the Paths of the Dead."
            : q.stage === 2
              ? "The Paths of the Dead: X is the highest threat; no player can reduce his threat below his initial threat level, and at the beginning of each planning phase each player raises his threat by 1 or cannot play cards that phase."
              : `The Dead are Following: travel to The Stone of Erech by removing ${GC_STONE_PROGRESS} progress from this stage; while it is active, Oathbreaker enemies lose Phantom and get -20 engagement cost, and exploring it wins the game.`}
        </strong>
        <span
          data-fear={q.fear.map((f) => (f ? "1" : "0")).join("")}
          data-fear-aside={q.fearAside}
        >
          {link(GC.fear)}:{" "}
          {seats === 1
            ? q.fear[0]
              ? "on your threat dial (your threat cannot be reduced; +1 threat at the end of each round)."
              : "not on your threat dial."
            : `on ${fearful} of ${seats} threat dials${
                fearful
                  ? ` (${q.fear
                      .map((f, i) => (f ? `player ${i + 1}` : ""))
                      .filter(Boolean)
                      .join(", ")})`
                  : ""
              }.`}{" "}
          {q.fearAside} set aside, out of play
          {q.fearRemoved ? `; ${q.fearRemoved} removed from the game` : ""}.
        </span>
        <span>
          Phantom: the damage of an attack by a Phantom enemy raises the
          defending player&apos;s threat instead.
        </span>
        {q.noPlay.length > 0 && (
          <span data-no-play={q.noPlay.join(",")}>
            {seats === 1
              ? "You cannot play cards this phase."
              : `${q.noPlay.map((p) => `Player ${p + 1}`).join(", ")} cannot play cards this phase.`}
          </span>
        )}
        {q.shut && (
          <span data-way-shut="true">
            {link(GC.shut)}: progress cannot be placed on the current quest this
            round.
          </span>
        )}
        {q.stage === 3 && (
          <span
            data-stone={
              q.stoneActive ? "active" : q.stoneInStaging ? "staging" : "none"
            }
            data-army-victory={q.armyVictory ? "true" : "false"}
          >
            {link(GC.stone)}:{" "}
            {q.stoneActive
              ? "the active location; explore it to win."
              : q.stoneInStaging
                ? `in the staging area (travel: remove ${GC_STONE_PROGRESS} progress from stage 3B).`
                : "not in play."}{" "}
            {link(GC.army)}:{" "}
            {q.armyVictory
              ? "in the victory display."
              : q.armyInPlay
                ? "in play."
                : "not in play."}
          </span>
        )}
      </div>
    </section>
  );
}
