import type { GameState } from "../game/types";
import { card } from "../game/cards";
import {
  HD,
  HD_MODES,
  hdBack,
  huntDreadnaughtPublicState,
} from "../game/hunt-dreadnaught-support";
import { seatName } from "../game/table";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
const MODE_NAME = {
  easy: "Easy Mode",
  standard: "Standard Mode",
  hard: "Hard Mode",
} as const;
const DREADNAUGHT: Record<string, string> = {
  aside: "set aside until Destroy the Dreadnaught",
  elite: "Elite side, in the staging area",
  damaged: "Damaged side, in the staging area",
  gone: "destroyed",
};
export function HuntDreadnaughtState({ s, inspect }: Props) {
  const q = huntDreadnaughtPublicState(s);
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
  const owner = (p: number) => (s.table ? seatName(s, p) : "You");
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="the-hunt-for-the-dreadnaught"
      aria-label="The Hunt for the Dreadnaught"
    >
      <div className="shadow-east-summary">
        <strong data-stage={q.stage} data-mode={q.mode ?? ""}>
          {q.stage === 1
            ? `1B Searching the High Seas: ${q.questPoints} quest points (8 per player); the players advance only at the end of the quest phase.`
            : "2B Destroy the Dreadnaught: destroy the Dreadnaught to win."}{" "}
          No more than {q.progressCap} progress each round (
          {q.progressThisRound} placed this round).
        </strong>
        <span data-fleet={q.fleet.map((f) => f.code).join(",")}>
          {q.mode
            ? link(hdBack(HD_MODES[q.mode]), MODE_NAME[q.mode])
            : "The fleet is being prepared"}
          {q.mode && q.mode !== "hard"
            ? ` · Quest Action ${q.questActionUsed ? "used" : "available once per game"}`
            : ""}
          . Fleet:{" "}
          {q.ships.length
            ? q.ships.map((ship, i) => (
                <span key={ship.id} data-ship={ship.code}>
                  {i ? ", " : ""}
                  {owner(ship.owner)}: {link(ship.code)}
                  {ship.upgraded ? " (Upgraded)" : ""}
                </span>
              ))
            : "no ship yet"}
          .
        </span>
        <span
          data-dreadnaught={q.dreadnaught}
          data-dread-damage={q.dreadnaughtDamage}
          data-dread-health={q.dreadnaughtHealth}
        >
          {link(HD.dreadnaught)}: {DREADNAUGHT[q.dreadnaught]}
          {q.dreadnaught === "elite" || q.dreadnaught === "damaged"
            ? ` · ${q.dreadnaughtDamage} of ${q.dreadnaughtHealth} damage (${q.dreadnaughtDamageThisRound} of ${q.progressCap} this round). Massive: considered engaged with each player.`
            : "."}
        </span>
        <span
          data-corsair-deck={q.corsairDeck}
          data-corsair-discard={q.corsairDiscard.length}
          data-uniques={q.uniquesAside}
          data-warships={q.warshipsAside}
        >
          Corsair deck: {q.corsairDeck} card{q.corsairDeck === 1 ? "" : "s"}
          {q.corsairDiscard.length
            ? ` · discard: ${q.corsairDiscard.map((c) => card(c).name).join(", ")}`
            : ""}
          . Set aside: {q.uniquesAside} unique Corsair
          {q.uniquesAside === 1 ? "" : "s"}, {q.warshipsAside}{" "}
          {link(HD.warship, "Gondorian Warship")}
          {q.warshipsAside === 1 ? "" : "s"}.
        </span>
      </div>
    </section>
  );
}
