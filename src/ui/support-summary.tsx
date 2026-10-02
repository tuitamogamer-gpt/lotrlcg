import { HERO_CARDS, DECK_CARDS } from "../game/decks";
import { SCENARIOS } from "../game/scenarios";
import { cardProductInfo } from "../game/products";
import "./product-note.css";

export const playableProductNames = [
  ...new Set(
    [...HERO_CARDS, ...DECK_CARDS].map((c) => cardProductInfo(c).originLabel),
  ),
].sort((a, b) => a.localeCompare(b));

/** Counts describe the registered play pool, rather than imported definitions. */
export function SupportSummary({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`support-summary ${compact ? "is-compact" : ""}`}
      aria-label="Automated play coverage"
      data-supported-heroes={HERO_CARDS.length}
      data-supported-deck-cards={DECK_CARDS.length}
      data-supported-quests={SCENARIOS.length}
    >
      <strong>Automated play</strong>
      <span>
        {HERO_CARDS.length} heroes · {DECK_CARDS.length} deck card designs ·{" "}
        {SCENARIOS.length} quests
      </span>
      {!compact && (
        <details>
          <summary>
            Player cards from {playableProductNames.length} releases
          </summary>
          <p>{playableProductNames.join(" · ")}</p>
        </details>
      )}
    </div>
  );
}
