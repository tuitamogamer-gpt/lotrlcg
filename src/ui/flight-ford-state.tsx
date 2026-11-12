import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { ringBearer, oneRing } from "../game/lotr-saga";
import {
  FF,
  RING_BEARER_LIFE,
  flightFordPublicState,
} from "../game/flight-ford-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
export function FlightFordState({ s, inspect }: Props) {
  const q = flightFordPublicState(s);
  if (!q) return null;
  const link = (code: string, label = card(code).name) => (
    <button
      className="fortress-nurn-link"
      aria-label={`Inspect ${card(code).name}`}
      onClick={() => inspect(card(code))}
    >
      {label}
    </button>
  );
  const bearer = ringBearer(s);
  const ring = oneRing(s);
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="flight-to-the-ford"
      aria-label="Flight to the Ford"
    >
      <div className="shadow-east-summary">
        <strong data-life={q.life}>
          {bearer ? link(bearer.code, "The Ring-bearer") : "The Ring-bearer"}
          {`: life ${q.life} of ${RING_BEARER_LIFE} · `}
          {ring
            ? ring.exhausted
              ? "The One Ring is exhausted"
              : "The One Ring is ready"
            : "The One Ring has left play"}
        </strong>
        <span data-ring-exhausted={ring?.exhausted ? "true" : "false"}>
          {link(FF.wound)}: damage to the Ring-bearer reduces this life instead,
          and it cannot be healed. Each stage reduces it by 1 at the end of the
          round; at zero the players lose.
        </span>
        <span data-burdens={q.burdens}>
          Burden deck: {q.burdens} card{q.burdens === 1 ? "" : "s"}.
          {q.extraReveals
            ? ` ${q.extraReveals} additional encounter card${q.extraReveals === 1 ? "" : "s"} this phase.`
            : ""}
        </span>
        <span data-bridge={q.bridge}>
          {link(FF.bridge)}:{" "}
          {q.bridge === "explored"
            ? "in the victory display."
            : "the players cannot advance from stage 1 until it is in the victory display. Travel there reveals a burden."}
        </span>
        <span data-ford={q.ford}>
          {link(FF.ford)}:{" "}
          {q.ford === "aside"
            ? "set aside until stage 2B."
            : q.ford === "in-play"
              ? "in play. Reveal an encounter card to travel there; exploring it discards every engaged enemy."
              : "explored."}
        </span>
        <span
          data-nazgul={q.nazgul}
          data-blank={q.blankThisRound ? "true" : "false"}
          data-pain={q.painThisRound ? "true" : "false"}
        >
          Nazgûl in play: {q.nazgul}.
          {s.stage === 2
            ? q.nazgul
              ? " Race to Rivendell gets +15 quest points."
              : " Race to Rivendell needs only its printed 15 quest points."
            : ""}
          {q.blankThisRound
            ? " The Nine are Abroad: character text boxes are blank this round."
            : ""}
          {q.painThisRound
            ? " Pain Assailed Him: the Ring-bearer's statistics are 0 this round."
            : ""}
        </span>
      </div>
    </section>
  );
}
