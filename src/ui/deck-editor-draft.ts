import { DECK_CARDS, HERO_CARDS } from "../game/decks";
import type { CustomDeck } from "../game/decks";
import { burglarLootListValid } from "../game/burglar-contract-support";

export const DECK_EDITOR_DRAFT_KEY =
  "there-and-back-again.deck-editor-draft.v1";
export const DECK_EDITOR_DRAFT_LIMIT = 256_000;
const heroCodes = new Set(HERO_CARDS.map((c) => c.code));
const deckCodes = new Set(DECK_CARDS.map((c) => c.code));

export interface DeckEditorDraft {
  version: 1;
  deck: CustomDeck;
  /** Keep import adjustments alongside the unfinished imported list. */
  report: string[];
  savedAt: number;
}
export type DeckDraftStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, limit: number): value is string =>
  typeof value === "string" && value.length <= limit;
const timestamp = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** A working list may be incomplete, but its physical card definitions must exist. */
export function parseDeckEditorDraft(value: unknown): DeckEditorDraft | null {
  if (!object(value) || value.version !== 1 || !object(value.deck)) return null;
  const d = value.deck;
  if (
    !text(d.id, 64) ||
    !/^[\w-]{1,64}$/.test(d.id) ||
    !text(d.name, 60) ||
    !Array.isArray(d.heroes) ||
    d.heroes.length > 3 ||
    new Set(d.heroes).size !== d.heroes.length ||
    !d.heroes.every((h) => typeof h === "string" && heroCodes.has(h)) ||
    !object(d.cards) ||
    (d.loot !== undefined && !burglarLootListValid(d.loot)) ||
    Object.keys(d.cards).length > deckCodes.size ||
    Object.entries(d.cards).some(
      ([code, n]) =>
        !deckCodes.has(code) ||
        typeof n !== "number" ||
        !Number.isInteger(n) ||
        n < 0 ||
        n > 3,
    ) ||
    !timestamp(d.updatedAt) ||
    (d.source !== undefined && !text(d.source, 2048)) ||
    (d.productId !== undefined && !text(d.productId, 128)) ||
    (d.deckKind !== undefined &&
      d.deckKind !== "custom" &&
      d.deckKind !== "official-preconstructed") ||
    !timestamp(value.savedAt) ||
    !Array.isArray(value.report) ||
    value.report.length > 256 ||
    !value.report.every((line) => text(line, 1000))
  )
    return null;
  const deck: CustomDeck = {
    id: d.id,
    name: d.name,
    heroes: [...d.heroes] as string[],
    cards: Object.fromEntries(Object.entries(d.cards)) as Record<
      string,
      number
    >,
    updatedAt: d.updatedAt,
  };
  if (d.source !== undefined) deck.source = d.source as string;
  if (d.loot !== undefined) deck.loot = [...d.loot] as string[];
  if (d.productId !== undefined) deck.productId = d.productId as string;
  if (d.deckKind !== undefined)
    deck.deckKind = d.deckKind as CustomDeck["deckKind"];
  return {
    version: 1,
    deck,
    report: [...value.report] as string[],
    savedAt: value.savedAt,
  };
}

export function readDeckEditorDraft(
  storage?: DeckDraftStorage,
): DeckEditorDraft | null {
  try {
    const raw = (storage ?? globalThis.sessionStorage)?.getItem(
      DECK_EDITOR_DRAFT_KEY,
    );
    if (!raw || raw.length > DECK_EDITOR_DRAFT_LIMIT) return null;
    return parseDeckEditorDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeDeckEditorDraft(
  value: DeckEditorDraft,
  storage?: DeckDraftStorage,
) {
  try {
    const draft = parseDeckEditorDraft(value);
    if (!draft) return false;
    const raw = JSON.stringify(draft);
    if (raw.length > DECK_EDITOR_DRAFT_LIMIT) return false;
    const target = storage ?? globalThis.sessionStorage;
    if (!target) return false;
    target.setItem(DECK_EDITOR_DRAFT_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

export function clearDeckEditorDraft(storage?: DeckDraftStorage) {
  try {
    const target = storage ?? globalThis.sessionStorage;
    if (!target) return false;
    target.removeItem(DECK_EDITOR_DRAFT_KEY);
    return true;
  } catch {
    return false;
  }
}
