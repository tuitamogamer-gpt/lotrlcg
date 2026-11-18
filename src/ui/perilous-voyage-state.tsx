import type { Action, GameState } from "../game/types";
import { card } from "../game/cards";
import { activeSeat, seatName } from "../game/table";
import {
  voyageAbilityProblem,
  VOYAGE_MINIMUM_DECK,
} from "../game/perilous-voyage-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";

type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
  dispatch: (a: Action) => void;
};
/** A Perilous Voyage: each player's contract, its side and its Action. */
export function PerilousVoyageState({ s, inspect, dispatch }: Props) {
  const contracts = s.perilousVoyage?.contracts;
  if (!contracts?.length) return null;
  return (
    <section
      className="shadow-east-state"
      data-perilous-voyage
      aria-label="A Perilous Voyage contracts"
    >
      {contracts.map((c) => {
        const reason =
          c.player !== activeSeat(s)
            ? "This contract belongs to another player."
            : voyageAbilityProblem(s, c.unit.id);
        return (
          <div
            className="shadow-east-summary"
            key={c.unit.id}
            data-voyage-side={c.side}
            data-voyage-exhausted={c.unit.exhausted ? "true" : "false"}
          >
            <strong>A Perilous Voyage · Side {c.side}</strong>
            <span>
              {s.table ? `${seatName(s, c.player)} · ` : ""}
              {c.side === "A"
                ? `Minimum deck size ${VOYAGE_MINIMUM_DECK}. Your threat cannot be reduced by player card effects; reaching your threat elimination level flips the contract instead.`
                : "Your threat cannot be reduced by non-contract player card effects. Your heroes do not exhaust to quest."}
            </span>
            <button
              onClick={() =>
                inspect({
                  ...card(c.unit.code),
                  initialReverse: c.side === "B",
                })
              }
            >
              Inspect A Perilous Voyage
            </button>
            {c.side === "A" && (
              <button
                disabled={
                  !!reason ||
                  s.status !== "playing" ||
                  !!s.choice ||
                  !!s.flow?.pending ||
                  !!s.combat
                }
                title={reason ?? undefined}
                onClick={() => dispatch({ type: "ABILITY", id: c.unit.id })}
              >
                Exhaust and raise your threat by 1 to look at the top 2 cards
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}
