import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { ownerOf, seatName } from "../game/table";
import { WMA, wmaPublicState } from "../game/we-must-away-support";
import { bagginsBilbo } from "../game/hobbit-saga";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = { s: GameState; inspect: (c: InspectedCard) => void };
export function WeMustAwayState({ s, inspect }: Props) {
  const q = wmaPublicState(s);
  if (!q) return null;
  const bilbo = bagginsBilbo(s);
  const key = bilbo?.attachments.some((a) => a.code === WMA.key);
  const purse = bilbo?.attachments.some((a) => a.code === WMA.purse);
  const link = (code: string) => (
    <button
      key={code}
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
      data-scenario-panel="we-must-away-ere-break-of-day"
      aria-label="We Must Away, Ere Break of Day"
    >
      <div className="shadow-east-summary">
        <strong>
          {q.treasures.length
            ? "Dawn has come · the Trolls' hoard is found"
            : s.stage === 1
              ? "The Lone-lands · the Trolls are not yet in play"
              : "The Trolls' fire · hold out until dawn"}
        </strong>
        {bilbo && (
          <span data-baggins-resources={bilbo.resources}>
            Bilbo Baggins ({seatName(s, ownerOf(s, bilbo))}): {bilbo.resources}{" "}
            Baggins resource
            {bilbo.resources === 1 ? "" : "s"}
            {key ? " · holds the Troll Key" : ""}
            {purse ? " · holds the Troll Purse" : ""}.
          </span>
        )}
        <span data-sack-deck={q.sackDeck}>
          Sack deck: {q.sackDeck} face-down card{q.sackDeck === 1 ? "" : "s"}.
        </span>
        {q.setAside.length > 0 && (
          <span>
            Set aside until Roast Mutton:{" "}
            {q.setAside.map((code, i) => (
              <span key={code}>
                {i ? ", " : ""}
                {link(code)}
              </span>
            ))}
            .
          </span>
        )}
        {s.stage === 2 && (
          <span>
            Progress on Roast Mutton discards encounter cards instead; the stage
            advances when no Troll is left in play or the encounter deck is
            empty.
          </span>
        )}
        {q.treasures.length > 0 && (
          <span data-treasures={q.treasures.join(",")}>
            Treasures discovered: Sting, Glamdring and Orcrist. They may join
            later Hobbit scenarios played with the same heroes.
          </span>
        )}
      </div>
    </section>
  );
}
