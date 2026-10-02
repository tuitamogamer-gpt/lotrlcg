import type { Card } from "../game/types";
import { cardProductInfo, deckProductInfo } from "../game/products";
import "./product-note.css";

/** Printed origin is separate from the deck list's author and play support. */
export function CardProductNote({ c }: { c: Card }) {
  const info = cardProductInfo(c);
  return (
    <small className="card-product-note" title={info.label}>
      {info.originLabel}
    </small>
  );
}

export function DeckProductNote({
  deck,
  compact = false,
  brief = false,
}: {
  deck: Parameters<typeof deckProductInfo>[0];
  compact?: boolean;
  brief?: boolean;
}) {
  const info = deckProductInfo(deck);
  const detail = brief
    ? info.kind === "app-built"
      ? "Included in the Core Set."
      : info.kind === "official-preconstructed"
        ? info.product?.kind === "limited-starter"
          ? "Included in the Collector’s Edition."
          : "Sold as its own starter deck."
        : info.originalProducts.length
          ? `Cards from ${info.originalProducts.map((product) => product.name).join(", ")}.`
          : "Assembled from individual cards."
    : info.detail;
  return (
    <span
      className={`deck-product-note ${compact ? "is-compact" : ""}`}
      data-deck-origin={info.kind}
    >
      <strong>{info.label}</strong>
      <small>{detail}</small>
    </span>
  );
}
