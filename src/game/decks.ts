export { startingThreat } from "./starting-threat";
import { card, playerCards, SCRIPTED } from "./cards";
import { BUILT_IN_DECKS } from "./built-in-decks";
import type { Card } from "./types";

/** A player-built deck. Only registered, scripted player cards can be included. */
export interface CustomDeck {
  id: string;
  name: string;
  heroes: string[];
  cards: Record<string, number>;
  updatedAt: number;
  /** Where the list came from, for example a RingsDB decklist URL. */
  source?: string;
  productId?: string;
  deckKind?: "official-preconstructed" | "custom";
}
export const DECKS_KEY = "there-and-back-again.decks.v1";
export const CUSTOM_PREFIX = "custom:";
export const isCustomId = (id: string) => id.startsWith(CUSTOM_PREFIX);
export const customId = (deck: CustomDeck) => CUSTOM_PREFIX + deck.id;
let nextDeckId = 0;
/** Two imports or new decks created in one millisecond must not overwrite one another. */
export const createDeckId = (now = Date.now()) =>
  `d${now.toString(36)}-${globalThis.crypto?.randomUUID?.() ?? ++nextDeckId}`;

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
const heroCodes = new Set(HERO_CARDS.map((c) => c.code));
const deckCodes = new Set(DECK_CARDS.map((c) => c.code));
const names = new Map(playerCards.map((c) => [c.code, c.name]));
export const deckSize = (cards: Record<string, number>) =>
  Object.values(cards).reduce((n, v) => n + v, 0);

/** Card has a matching printed hero sphere; effects may provide other ways to play it. */
export function legalSphere(code: string, heroes: string[]) {
  const sphere = card(code).sphere_code;
  return (
    sphere === "neutral" || heroes.some((h) => card(h).sphere_code === sphere)
  );
}

/** Deckbuilding rules from the Rules Reference, as readable problems. */
export function deckProblems(deck: Pick<CustomDeck, "heroes" | "cards">) {
  const problems: string[] = [];
  const heroes = deck.heroes.filter((h) => heroCodes.has(h));
  for (const h of deck.heroes)
    if (!heroCodes.has(h))
      problems.push(`${names.get(h) ?? h} is not a supported hero.`);
  if (heroes.length < 1) problems.push("Choose at least one hero.");
  if (heroes.length > 3) problems.push("A deck has at most three heroes.");
  if (new Set(heroes).size !== heroes.length)
    problems.push("Each hero can appear only once.");
  if (new Set(heroes.map((h) => card(h).name)).size !== heroes.length)
    problems.push(
      "Different versions of the same unique hero cannot share a deck.",
    );
  const size = deckSize(deck.cards);
  if (size < 50) problems.push(`Add ${50 - size} more cards to reach 50.`);
  if (size > 100)
    problems.push("A deck of more than 100 cards is not supported.");
  for (const [code, n] of Object.entries(deck.cards)) {
    if (!deckCodes.has(code)) {
      problems.push(
        `${names.get(code) ?? code} is not a scripted player card.`,
      );
      continue;
    }
    const limit = Math.min(3, card(code).deck_limit ?? 3);
    if (!Number.isInteger(n) || n < 0 || n > limit)
      problems.push(`${card(code).name}: at most ${limit} copies.`);
  }
  return problems;
}

/** Matching spheres are deckbuilding advice, not a deck legality requirement. */
export function deckWarnings(deck: Pick<CustomDeck, "heroes" | "cards">) {
  const heroes = deck.heroes.filter((h) => heroCodes.has(h));
  return Object.entries(deck.cards)
    .filter(
      ([code, n]) => deckCodes.has(code) && n > 0 && !legalSphere(code, heroes),
    )
    .map(
      ([code]) =>
        `${card(code).name} has no matching hero sphere; plan an effect that lets you play it.`,
    );
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

/** Public decklists have a public API; private /deck/view ids do not. */
export function ringsDbId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{1,9}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(
      /^[\w.+-]+:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !["ringsdb.com", "www.ringsdb.com"].includes(url.hostname)
    )
      return null;
    return (
      url.pathname.match(/^\/decklist\/view\/(\d{1,9})(?:\/|$)/)?.[1] ?? null
    );
  } catch {
    return null;
  }
}
export interface ImportReport {
  deck: CustomDeck;
  unsupported: { code: string; name: string; quantity: number }[];
  heroesDropped: string[];
  adjustments: string[];
}
/** Converts RingsDB decklist JSON into a custom deck, listing unsupported cards. */
export function parseRingsDbDeck(
  json: unknown,
  source: string,
  now = Date.now(),
): ImportReport {
  const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  if (
    !object(json) ||
    !object(json.slots) ||
    (json.heroes !== undefined && !object(json.heroes))
  )
    throw new Error("RingsDB returned an invalid decklist.");
  const v = json as {
    name?: unknown;
    heroes?: Record<string, unknown>;
    slots?: Record<string, unknown>;
  };
  const cards: Record<string, number> = {};
  const unsupported: ImportReport["unsupported"] = [];
  const heroes: string[] = [];
  const heroesDropped: string[] = [];
  const adjustments: string[] = [];
  const known = new Map(playerCards.map((c) => [c.code, c]));
  const quantityOf = (code: string, qty: unknown) => {
    const n =
      typeof qty === "number" || (typeof qty === "string" && /^\d+$/.test(qty))
        ? Number(qty)
        : NaN;
    if (!Number.isSafeInteger(n) || n < 0) {
      adjustments.push(
        `${known.get(code)?.name ?? code} skipped (invalid quantity).`,
      );
      return 0;
    }
    return n;
  };
  // Some exports only provide slots, so discover their supported heroes too.
  const heroEntries =
    v.heroes ??
    Object.fromEntries(
      Object.entries(v.slots ?? {}).filter(([code]) => heroCodes.has(code)),
    );
  for (const [code, qty] of Object.entries(heroEntries)) {
    if (!quantityOf(code, qty)) continue;
    if (heroCodes.has(code) && heroes.length < 3) heroes.push(code);
    else heroesDropped.push(known.get(code)?.name ?? code);
  }
  for (const [code, qty] of Object.entries(v.slots ?? {})) {
    if (heroCodes.has(code) || Object.hasOwn(heroEntries, code)) continue;
    const quantity = quantityOf(code, qty);
    if (!quantity) continue;
    if (deckCodes.has(code)) {
      cards[code] = Math.min(3, quantity);
      if (quantity > 3)
        adjustments.push(
          `${known.get(code)?.name ?? code}: ${quantity} copies reduced to the limit of 3.`,
        );
    } else
      unsupported.push({
        code,
        name: known.get(code)?.name ?? code,
        quantity,
      });
  }
  return {
    deck: {
      id: createDeckId(now),
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
    adjustments,
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
    v.heroes.length <= 3 &&
    new Set(v.heroes).size === v.heroes.length &&
    v.heroes.every((h) => typeof h === "string" && heroCodes.has(h)) &&
    !!v.cards &&
    typeof v.cards === "object" &&
    !Array.isArray(v.cards) &&
    Object.entries(v.cards).every(
      ([code, n]) =>
        deckCodes.has(code) && Number.isInteger(n) && n >= 0 && n <= 3,
    ) &&
    Number.isSafeInteger(v.updatedAt) &&
    v.updatedAt >= 0 &&
    (v.source === undefined ||
      (typeof v.source === "string" && v.source.length <= 2048)) &&
    (v.productId === undefined ||
      (typeof v.productId === "string" && v.productId.length <= 128)) &&
    (v.deckKind === undefined ||
      ["official-preconstructed", "custom"].includes(v.deckKind))
  );
};
export function readDecks(): CustomDeck[] {
  try {
    const list = JSON.parse(localStorage.getItem(DECKS_KEY) ?? "[]");
    if (!Array.isArray(list)) return [];
    const ids = new Set<string>();
    return list
      .filter((d) => {
        if (!validDeck(d) || ids.has(d.id)) return false;
        ids.add(d.id);
        return true;
      })
      .slice(0, 50);
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
  const starter = BUILT_IN_DECKS.find((d) => d.id === id);
  if (starter) return { ...starter, custom: false as const };
  const deck = decks.find((d) => customId(d) === id);
  if (!deck) return null;
  return {
    id,
    name: deck.name,
    subtitle: "Custom deck",
    description: `${deckSize(deck.cards)} cards in this saved list${deck.source ? "; its source is linked" : ""}.`,
    heroes: deck.heroes,
    cards: deck.cards,
    source: deck.source,
    productId: deck.productId,
    deckKind: deck.deckKind,
    custom: true as const,
  };
}
