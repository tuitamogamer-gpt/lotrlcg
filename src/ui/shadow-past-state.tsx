import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { ringBearer, oneRing } from "../game/lotr-saga";
import { hideFailed } from "../game/hide-test";
import { allEngaged, playerOrder } from "../game/table";
import {
  SP,
  isNazgul,
  shadowPastPublicState,
} from "../game/shadow-past-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
export function ShadowPastState({ s, inspect }: Props) {
  const q = shadowPastPublicState(s);
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
  const nazgul = [...s.staging, ...allEngaged(s)].filter(
    (u) => isNazgul(u) && card(u.code).type_code === "enemy",
  ).length;
  const failed = playerOrder(s).filter((p) => hideFailed(s, p, "round"));
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="a-shadow-of-the-past"
      aria-label="A Shadow of the Past"
    >
      <div className="shadow-east-summary">
        <strong>
          {bearer ? link(bearer.code, "The Ring-bearer") : "The Ring-bearer"}
          {": "}
          {ring
            ? ring.exhausted
              ? "The One Ring is exhausted"
              : "The One Ring is ready"
            : "The One Ring has left play"}
          {bearer
            ? ` · ${bearer.resources} resource${bearer.resources === 1 ? "" : "s"}`
            : ""}
        </strong>
        <span data-ring-exhausted={ring?.exhausted ? "true" : "false"}>
          If The One Ring leaves play, the players lose. Frodo may spend 1
          resource and exhaust it to cancel an encounter card just revealed.
        </span>
        <span data-bag-end={q.bagEndExplored ? "explored" : "pending"}>
          {link(SP.bagEnd)}:{" "}
          {q.bagEndExplored
            ? "in the victory display."
            : "the players cannot advance from stage 1 until it is in the victory display."}
        </span>
        <span
          data-ferry={
            q.ferryInPlay ? "in-play" : q.ferryAside ? "aside" : "gone"
          }
        >
          {link(SP.ferry)}:{" "}
          {q.ferryInPlay
            ? "in play. Travel only when no other location is in play, after a Hide 3 test; exploring it wins."
            : q.ferryAside
              ? "set aside until stage 3A."
              : "explored."}
        </span>
        <span data-nazgul={nazgul} data-hide-failed={failed.length}>
          Nazgûl in play: {nazgul}.{" "}
          {failed.length
            ? `Failed a Hide test this round: ${failed.map((p) => (s.table ? `Player ${p + 1}` : "you")).join(", ")}.`
            : "No Hide test has been failed this round."}
        </span>
      </div>
    </section>
  );
}
