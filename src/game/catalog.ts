import type { Card } from "./types";
import { isAutomatedCard } from "./support";
export const isScriptedCard = isAutomatedCard;

/** Imported definitions are reference data; this never registers gameplay handlers. */
export function validateCatalog(value: unknown): Card[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error("The card snapshot is empty or invalid.");
  const codes = new Set<string>();
  for (const c of value) {
    if (
      !c ||
      typeof c !== "object" ||
      typeof c.code !== "string" ||
      !c.code ||
      typeof c.name !== "string" ||
      typeof c.type_code !== "string" ||
      typeof c.sphere_code !== "string" ||
      codes.has(c.code)
    )
      throw new Error(
        "The card snapshot contains invalid or duplicate records.",
      );
    codes.add(c.code);
  }
  return value as Card[];
}

let snapshot: Promise<Card[]> | undefined;
let loadedCardCount: number | null = null;
export const catalogCardCount = () => loadedCardCount;
/** Shared lazy snapshot keeps thousands of reference cards out of the game bundle. */
export function loadCatalog(refresh = false) {
  if (refresh) snapshot = undefined;
  snapshot ??= fetch("/catalog.json", {
    signal: AbortSignal.timeout(20000),
    cache: refresh ? "reload" : "default",
  })
    .then((res) => {
      if (!res.ok) throw new Error(`Card snapshot: HTTP ${res.status}`);
      return res.json();
    })
    .then(validateCatalog)
    .then((cards) => {
      loadedCardCount = cards.length;
      return cards;
    })
    .catch((error: unknown) => {
      snapshot = undefined;
      throw error;
    });
  return snapshot;
}

export function searchCards(cards: Card[], query: string) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return cards;
  return cards.filter((c) =>
    [c.name, c.traits, c.pack_name, c.encounter_set, c.text]
      .filter(Boolean)
      .join(" ")
      .replace(/<[^>]*>/g, "")
      .toLocaleLowerCase()
      .includes(needle),
  );
}
