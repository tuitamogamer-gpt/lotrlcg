import { card, playerCards, SCRIPTED, STARTERS } from "./cards";
import type { Card } from "./types";

/** A player-built deck. Only scripted Core Set cards can be included. */
export interface CustomDeck {
  id: string;
  name: string;
  heroes: string[];
  cards: Record<string, number>;
  updatedAt: number;
  /** Where the list came from, for example a RingsDB decklist URL. */
  source?: string;
}
export const DECKS_KEY = "there-and-back-again.decks.v1";
export const CUSTOM_PREFIX = "custom:";
export const isCustomId = (id: string) => id.startsWith(CUSTOM_PREFIX);
export const customId = (deck: CustomDeck) => CUSTOM_PREFIX + deck.id;

export const HERO_CARDS: Card[] = playerCards.filter(
  (c) => c.type_code === "hero" && SCRIPTED.has(c.code),
);
export const DECK_CARDS: Card[] = playerCards.filter(
  (c) =>
    c.type_code !== "hero" &&
    c.sphere_code !== "encounter" &&
    SCRIPTED.has(c.code) &&
    !c.code.startsWith("rc"),
);
export const deckSize = (cards: Record<string, number>) =>
  Object.values(cards).reduce((n, v) => n + v, 0);

/** Card can be played by the chosen heroes' spheres (neutral cards always). */
export function legalSphere(code: string, heroes: string[]) {
  const sphere = card(code).sphere_code;
  return (
    sphere === "neutral" || heroes.some((h) => card(h).sphere_code === sphere)
  );
}

/** Deckbuilding rules from the Rules Reference, as readable problems. */
export function deckProblems(deck: Pick<CustomDeck, "heroes" | "cards">) {
  const problems: string[] = [];
  const heroes = deck.heroes.filter((h) =>
    HERO_CARDS.some((c) => c.code === h),
  );
  if (heroes.length < 1) problems.push("Choose at least one hero.");
  if (heroes.length > 3) problems.push("A deck has at most three heroes.");
  if (new Set(heroes).size !== heroes.length)
    problems.push("Each hero can appear only once.");
  const size = deckSize(deck.cards);
  if (size < 50) problems.push(`Add ${50 - size} more cards to reach 50.`);
  if (size > 100)
    problems.push("A deck of more than 100 cards is not supported.");
  for (const [code, n] of Object.entries(deck.cards)) {
    if (!DECK_CARDS.some((c) => c.code === code)) {
      problems.push(
        `${card(code).name} is not a scripted Core Set player card.`,
      );
      continue;
    }
    if (!Number.isInteger(n) || n < 0 || n > 3)
      problems.push(`${card(code).name}: at most 3 copies.`);
    if (n > 0 && !legalSphere(code, heroes))
      problems.push(
        `${card(code).name} needs a ${card(code).sphere_code} hero to pay for it.`,
      );
  }
  return problems;
}

export const sphereCounts = (cards: Record<string, number>) => {
  const counts: Record<string, number> = {};
  for (const [code, n] of Object.entries(cards))
    counts[card(code).sphere_code] = (counts[card(code).sphere_code] ?? 0) + n;
  return counts;
};
export const costCurve = (cards: Record<string, number>) => {
  const curve = [0, 0, 0, 0, 0, 0];
  for (const [code, n] of Object.entries(cards)) {
    const cost = Math.min(5, Math.max(0, Number(card(code).cost) || 0));
    curve[cost] += n;
  }
  return curve;
};

/** Parses a RingsDB decklist or deck URL/id into its numeric id. */
export function ringsDbId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{1,9}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/ringsdb\.com\/(?:decklist|deck)\/view\/(\d{1,9})/);
  return m ? m[1] : null;
}
export interface ImportReport {
  deck: CustomDeck;
  unsupported: { code: string; name: string; quantity: number }[];
  heroesDropped: string[];
}
/** Converts RingsDB decklist JSON into a custom deck, listing unsupported cards. */
export function parseRingsDbDeck(
  json: unknown,
  source: string,
  now = Date.now(),
): ImportReport {
  const v = (json ?? {}) as {
    name?: unknown;
    heroes?: Record<string, unknown>;
    slots?: Record<string, unknown>;
  };
  const cards: Record<string, number> = {};
  const unsupported: ImportReport["unsupported"] = [];
  const heroes: string[] = [];
  const heroesDropped: string[] = [];
  const known = new Map(playerCards.map((c) => [c.code, c]));
  for (const [code, qty] of Object.entries(v.heroes ?? {})) {
    if (HERO_CARDS.some((c) => c.code === code)) heroes.push(code);
    else heroesDropped.push(known.get(code)?.name ?? code);
    void qty;
  }
  for (const [code, qty] of Object.entries(v.slots ?? {})) {
    const quantity = Math.max(0, Math.min(3, Number(qty) || 0));
    if (!quantity) continue;
    if (DECK_CARDS.some((c) => c.code === code)) cards[code] = quantity;
    else if (!HERO_CARDS.some((c) => c.code === code))
      unsupported.push({
        code,
        name: known.get(code)?.name ?? code,
        quantity,
      });
  }
  return {
    deck: {
      id: `d${now.toString(36)}`,
      name:
        typeof v.name === "string" && v.name.trim()
          ? v.name.trim().slice(0, 60)
          : "Imported deck",
      heroes: heroes.slice(0, 3),
      cards,
      updatedAt: now,
      source,
    },
    unsupported,
    heroesDropped,
  };
}

const validDeck = (d: unknown): d is CustomDeck => {
  if (!d || typeof d !== "object") return false;
  const v = d as CustomDeck;
  return (
    typeof v.id === "string" &&
    /^[\w-]{1,64}$/.test(v.id) &&
    typeof v.name === "string" &&
    v.name.length <= 60 &&
    Array.isArray(v.heroes) &&
    v.heroes.every((h) => typeof h === "string" && SCRIPTED.has(h)) &&
    !!v.cards &&
    typeof v.cards === "object" &&
    Object.entries(v.cards).every(
      ([code, n]) =>
        SCRIPTED.has(code) && Number.isInteger(n) && n >= 0 && n <= 3,
    ) &&
    Number.isInteger(v.updatedAt)
  );
};
export function readDecks(): CustomDeck[] {
  try {
    const list = JSON.parse(localStorage.getItem(DECKS_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter(validDeck).slice(0, 50) : [];
  } catch {
    return [];
  }
}
export function writeDecks(decks: CustomDeck[]) {
  try {
    localStorage.setItem(DECKS_KEY, JSON.stringify(decks.slice(0, 50)));
    return true;
  } catch {
    return false;
  }
}
/** A starter-shaped description for the setup screens. */
export function describeDeck(id: string, decks: CustomDeck[]) {
  const starter = STARTERS.find((d) => d.id === id);
  if (starter) return { ...starter, custom: false as const };
  const deck = decks.find((d) => customId(d) === id);
  if (!deck) return null;
  return {
    id,
    name: deck.name,
    subtitle: "Custom deck",
    description: `${deckSize(deck.cards)} cards you assembled${deck.source ? " from RingsDB" : ""}.`,
    heroes: deck.heroes,
    cards: deck.cards,
    custom: true as const,
  };
}
