import { card } from "../game/cards";
import { BUILT_IN_DECKS } from "../game/built-in-decks";
import { customId, deckProblems, describeDeck } from "../game/decks";
import type { CustomDeck } from "../game/decks";
import type { GameState, SeatConfig } from "../game/types";

type SavedDeck = Pick<GameState, "deckId" | "customDeck" | "startingHeroes">;
const sameHeroes = (a: string[], b: string[]) =>
  [...a].sort().join() === [...b].sort().join();
const sameCards = (a: Record<string, number>, b: Record<string, number>) => {
  const entries = (cards: Record<string, number>) =>
    Object.entries(cards)
      .filter(([, n]) => n > 0)
      .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries(a)) === JSON.stringify(entries(b));
};

/** A save owns its original list, even after the local deck is edited. */
export function matchesSavedDeck(
  saved: SavedDeck,
  id: string,
  decks: CustomDeck[],
) {
  const selected = describeDeck(id, decks);
  if (!selected) return false;
  return selected.custom
    ? saved.deckId === "custom" &&
        !!saved.customDeck &&
        sameCards(saved.customDeck, selected.cards) &&
        sameHeroes(saved.startingHeroes, selected.heroes)
    : saved.deckId === id;
}

export function savedDeckId(saved: SavedDeck, decks: CustomDeck[]) {
  if (saved.deckId !== "custom") return saved.deckId;
  const deck = decks.find((d) => matchesSavedDeck(saved, customId(d), decks));
  return deck ? customId(deck) : "leadership";
}

/** Imported or older saves can rebuild a missing custom deck without altering play. */
export function recoverSavedDecks(game: GameState | null, decks: CustomDeck[]) {
  const list = [...decks];
  const saved = game?.table?.seats ?? (game ? [game] : []);
  saved.forEach((p, i) => {
    if (
      p.deckId !== "custom" ||
      !p.customDeck ||
      list.some((d) => matchesSavedDeck(p, customId(d), list))
    )
      return;
    const base = `recovered-${game!.originalSeed}-${i + 1}`;
    let id = base;
    for (let n = 2; list.some((d) => d.id === id); n++) id = `${base}-${n}`;
    list.unshift({
      id,
      name: `Recovered fellowship${saved.length > 1 ? ` ${i + 1}` : ""}`,
      heroes: [...p.startingHeroes],
      cards: { ...p.customDeck },
      updatedAt: Date.now(),
    });
  });
  return list;
}

/** Restore device/cloud choices against decks that actually exist on this device. */
export function setupSeats(
  saved: { deckId: string }[] | undefined,
  decks: CustomDeck[],
) {
  const used = new Set<string>();
  const heroes = new Set<string>();
  return (saved ?? [{ deckId: "leadership" }]).flatMap((p): SeatConfig[] => {
    const selected = describeDeck(p.deckId, decks);
    const d =
      selected &&
      !used.has(selected.id) &&
      !selected.heroes.some((h) => heroes.has(card(h).name))
        ? selected
        : [
            ...BUILT_IN_DECKS,
            ...decks
              .filter((d) => !deckProblems(d).length)
              .map((d) => ({ ...d, id: customId(d) })),
          ].find(
            (d) =>
              !used.has(d.id) &&
              !d.heroes.some((h) => heroes.has(card(h).name)),
          );
    if (!d) return [];
    used.add(d.id);
    d.heroes.forEach((h) => heroes.add(card(h).name));
    return [{ deckId: d.id, heroes: [...d.heroes] }];
  });
}

export function savedSeats(game: GameState, decks: CustomDeck[]) {
  return setupSeats(
    game.table?.seats.map((p) => ({ deckId: savedDeckId(p, decks) })),
    decks,
  );
}

/** Add seats only when a complete fellowship with different heroes is available. */
export function expandSeats(
  seats: SeatConfig[],
  n: number,
  decks: CustomDeck[],
): SeatConfig[] | null {
  const current = seats.slice(0, n);
  if (current.length === n) return current;
  const candidates = [
    ...BUILT_IN_DECKS,
    ...decks
      .filter((d) => !deckProblems(d).length)
      .map((d) => ({ ...d, id: customId(d) })),
  ];
  const add = (picked: SeatConfig[]): SeatConfig[] | null => {
    if (picked.length === n) return picked;
    const heroes = new Set(
      picked.flatMap((p) => p.heroes.map((h) => card(h).name)),
    );
    for (const d of candidates) {
      if (
        picked.some((p) => p.deckId === d.id) ||
        d.heroes.some((h) => heroes.has(card(h).name))
      )
        continue;
      const result = add([...picked, { deckId: d.id, heroes: [...d.heroes] }]);
      if (result) return result;
    }
    return null;
  };
  return add(current);
}
