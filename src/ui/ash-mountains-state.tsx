import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { playerOrder, seatName, seatView } from "../game/table";
import { ASH, ashPublicState } from "../game/ash-mountains-support";
import { ashQuestCount, ashX } from "../game/ash-mountains";
import { councilPublic } from "../game/ash-mountains-player";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
type Props = { s: GameState; inspect: (c: InspectedCard) => void };
export function AshMountainsState({ s }: Props) {
  const q = ashPublicState(s);
  if (!q) return null;
  return (
    <section
      className="shadow-east-state"
      data-scenario-panel="under-the-ash-mountains"
      aria-label="Torech Gorgor supplies"
    >
      <div className="shadow-east-summary">
        <strong>Escape before supplies run out</strong>
        <span>
          {ashQuestCount(s)} quest cards in play · Discard {ashX(s)} cards per
          player at round end.
        </span>
        <span>
          A player with an empty deck is eliminated at the end of the round.
          Event cards cannot shuffle discards back into decks.
        </span>
      </div>
      {playerOrder(s).map((p) => (
        <div className="shadow-east-summary" key={p}>
          <strong>{seatName(s, p)}</strong>
          <span>{seatView(s, p).deck.length} cards left in deck</span>
          <span>
            {q.custody
              .filter((g) => g.player === p && g.kind === "dial")
              .reduce((n, g) => n + g.count, 0)}{" "}
            cards under threat dial ·{" "}
            {q.custody
              .filter((g) => g.player === p && g.kind === "deeps")
              .reduce((n, g) => n + g.count, 0)}{" "}
            cards under Hideous Deeps
          </span>
        </div>
      ))}
      {s.staging.some((u) => u.code === ASH.patrol && !u.blanked) && (
        <div className="shadow-east-summary">
          <strong>Torech Gorgor Patrol</strong>
          <span>
            Main quest progress this round: {q.progressPlaced} / 5 while a
            Patrol remains in staging.
          </span>
        </div>
      )}
      {s.staging
        .filter((u) => u.code === ASH.tunnels)
        .map((u) => (
          <div className="shadow-east-summary" key={u.id}>
            <strong>The Tunnels of Torech Gorgor</strong>
            <span>
              {u.resources} / 3 active locations explored · Travel is mandatory
              when possible.
            </span>
          </div>
        ))}
    </section>
  );
}
export function CouncilOfTheWiseState({ s, inspect }: Props) {
  const cs = councilPublic(s);
  if (!cs?.length) return null;
  return (
    <section
      className="shadow-east-state"
      data-council-contract
      aria-label="Council of the Wise contracts"
    >
      {cs.map((c) => (
        <div className="shadow-east-summary" key={c.id}>
          <strong>Council of the Wise · {seatName(s, c.player)}</strong>
          <span>
            After playing an event from hand, choose a reward. Each reward is
            available once per round.
          </span>
          <span>
            {["threat", "draw", "resource"]
              .map(
                (o) =>
                  `${{ threat: "Reduce threat", draw: "Draw a card", resource: "Gain a resource" }[o]}: ${c.used.includes(o) ? "used" : "available"}`,
              )
              .join(" · ")}
          </span>
          <button onClick={() => inspect(card(c.code))}>
            Inspect Council of the Wise
          </button>
        </div>
      ))}
    </section>
  );
}
