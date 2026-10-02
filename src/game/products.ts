import rawProducts from "../data/products.json";
import rawCardProducts from "../data/card-products.json";
import rawStarters from "../data/official-starter-decks.json";
import type { Card } from "./types";

export type ProductKind =
  | "core"
  | "deluxe"
  | "adventure-pack"
  | "saga"
  | "starter-deck"
  | "limited-starter"
  | "scenario-pack"
  | "hero-expansion"
  | "campaign-expansion"
  | "nightmare-deck"
  | "promo";

/** A published product or promotional printing. A Hero Expansion is a card pool. */
export interface Product {
  id: string;
  name: string;
  kind: ProductKind;
  packCodes: string[];
  cycle?: string;
  content: "player" | "encounter" | "mixed";
  description: string;
  sourceUrls: string[];
  /** Product ids of the original pools repackaged in this product. */
  reprints?: string[];
  requires?: string[];
  aliases?: string[];
  encounterSets?: string[];
  /** Canonical card designs for individual promotional printings. */
  cardCodes?: string[];
}

export interface PublishedStarterDeck {
  id: string;
  productId: string;
  name: string;
  deckKind: "official-preconstructed";
  heroes: string[];
  cards: Record<string, number>;
  /** Extra deckbuilding cards; the two Limited Starter decks have no extras. */
  sideboard: Record<string, number>;
  source_url: string;
}

export const PRODUCTS = rawProducts as Product[];
export const officialStarterDecks =
  rawStarters as unknown as PublishedStarterDeck[];
const byId = new Map(PRODUCTS.map((p) => [p.id, p]));
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const cardProducts = rawCardProducts as Record<
  string,
  {
    canonicalCode: string;
    originalPack: string;
    packs: string[];
    type: string;
    sphere: string;
  }
>;
const byPack = new Map<string, Product[]>();
const byName = new Map<string, Product[]>();
const reprintsByOriginal = new Map<string, Product[]>();
const printingsByCard = new Map<string, Product[]>();
for (const p of PRODUCTS) {
  for (const code of p.packCodes)
    byPack.set(code, [...(byPack.get(code) ?? []), p]);
  for (const name of [p.name, ...(p.aliases ?? [])]) {
    const key = normalize(name);
    byName.set(key, [...(byName.get(key) ?? []), p]);
  }
  for (const id of p.reprints ?? [])
    reprintsByOriginal.set(id, [...(reprintsByOriginal.get(id) ?? []), p]);
  for (const code of p.cardCodes ?? [])
    printingsByCard.set(code, [...(printingsByCard.get(code) ?? []), p]);
}

export const product = (id: string) => byId.get(id) ?? null;

export const productKindLabel = (kind: ProductKind) =>
  ({
    core: "Core Set",
    deluxe: "Deluxe expansion",
    "adventure-pack": "Adventure Pack",
    saga: "Saga expansion",
    "starter-deck": "Separately sold Starter Deck",
    "limited-starter": "Limited Collector’s Edition",
    "scenario-pack": "Scenario Pack",
    "hero-expansion": "Hero Expansion · deckbuilding pool",
    "campaign-expansion": "Campaign Expansion",
    "nightmare-deck": "Nightmare Deck",
    promo: "Promotional alternate art",
  })[kind];

type OriginCard = Pick<Card, "code" | "name" | "pack_code" | "pack_name"> &
  Partial<Pick<Card, "type_code" | "sphere_code" | "encounter_set">> & {
    packs?: (string | { pack_code: string; pack_name?: string })[];
  };

const fromPrintedPack = (
  packCode: string | undefined,
  packName?: string,
  encounterSet?: string,
) => {
  const candidates = [
    ...new Map(
      [
        ...(packCode ? (byPack.get(packCode) ?? []) : []),
        ...(packName ? (byName.get(normalize(packName)) ?? []) : []),
      ].map((p) => [p.id, p]),
    ).values(),
  ];
  // OCTGN stores cycle Nightmare cards together. Their encounter-set symbols
  // identify the separate physical Nightmare Adventure Packs.
  const nightmare = candidates.filter((p) => p.kind === "nightmare-deck");
  if (nightmare.length > 1 && encounterSet)
    return (
      nightmare.find((p) =>
        p.encounterSets?.some(
          (set) => normalize(set) === normalize(encounterSet),
        ),
      ) ?? null
    );
  return candidates[0] ?? null;
};

export interface CardProductInfo {
  original: Product | null;
  /** Original product plus other physical editions containing this card. */
  availableIn: Product[];
  originLabel: string;
  label: string;
}

export function cardProductInfo(card: OriginCard): CardProductInfo {
  const metadata = cardProducts[card.code];
  const original = fromPrintedPack(
    metadata?.originalPack ?? card.pack_code,
    card.pack_name,
    card.encounter_set,
  );
  const printed = [
    ...new Set(
      [
        metadata?.originalPack,
        ...(metadata?.packs ?? []),
        card.pack_code,
        ...(card.packs ?? []).map((p) =>
          typeof p === "string" ? p : p.pack_code,
        ),
      ].filter((p): p is string => !!p),
    ),
  ]
    .map((code) => fromPrintedPack(code, undefined, card.encounter_set))
    .filter((p): p is Product => !!p);
  if (original) printed.unshift(original);
  const player =
    !["encounter", "boon", "burden"].includes(
      card.sphere_code ?? metadata?.sphere ?? "",
    ) &&
    [
      "hero",
      "ally",
      "attachment",
      "event",
      "player-side-quest",
      "treasure",
      "contract",
    ].includes(card.type_code ?? metadata?.type ?? "");
  const repackaged = original
    ? (reprintsByOriginal.get(original.id) ?? []).filter(
        (p) =>
          p.content === "mixed" ||
          (player ? p.content === "player" : p.content === "encounter"),
      )
    : [];
  const availableIn = [
    ...new Map(
      [
        ...printed,
        ...repackaged,
        ...(printingsByCard.get(metadata?.canonicalCode ?? card.code) ?? []),
      ].map((p) => [p.id, p]),
    ).values(),
  ];
  const originLabel =
    original?.name ?? card.pack_name ?? "Product source unavailable";
  const reprints = availableIn.filter((p) => p.id !== original?.id);
  return {
    original,
    availableIn,
    originLabel,
    label: `${originLabel}${original ? ` · ${productKindLabel(original.kind)}` : ""}${reprints.length ? ` · Also included in ${reprints.map((p) => p.name).join(", ")}` : ""}`,
  };
}

type OriginDeck = {
  id?: string;
  heroes: string[];
  cards: Record<string, number>;
  source?: string;
  productId?: string;
  deckKind?: string;
};
export interface DeckProductInfo {
  kind: "official-preconstructed" | "app-built" | "custom";
  product: Product | null;
  originalProducts: Product[];
  /** Products that each contain all of the deck's card designs. */
  availableIn: Product[];
  label: string;
  detail: string;
}
const positiveEntries = (cards: Record<string, number>) =>
  Object.entries(cards)
    .filter(([, quantity]) => quantity > 0)
    .sort(([a], [b]) => a.localeCompare(b));
const sameRecipe = (deck: OriginDeck, recipe: PublishedStarterDeck) =>
  JSON.stringify([...deck.heroes].sort()) ===
    JSON.stringify([...recipe.heroes].sort()) &&
  JSON.stringify(positiveEntries(deck.cards)) ===
    JSON.stringify(positiveEntries(recipe.cards));
const coreLearningIds = new Set(["leadership", "tactics", "spirit", "lore"]);

export function deckProductInfo(deck: OriginDeck): DeckProductInfo {
  const codes = [
    ...new Set([
      ...deck.heroes,
      ...positiveEntries(deck.cards).map(([code]) => code),
    ]),
  ];
  const info = codes.map((code) => cardProductInfo({ code, name: code }));
  const originalProducts = [
    ...new Map(
      info.flatMap((i) =>
        i.original ? [[i.original.id, i.original] as const] : [],
      ),
    ).values(),
  ];
  const availableIn = info.length
    ? info[0].availableIn.filter((p) =>
        info.every((i) => i.availableIn.some((other) => other.id === p.id)),
      )
    : [];
  const recipe = officialStarterDecks.find((s) => sameRecipe(deck, s));
  if (recipe && deck.deckKind !== "custom") {
    const boxed = product(recipe.productId)!;
    const bundled = boxed.kind === "limited-starter";
    return {
      kind: "official-preconstructed",
      product: boxed,
      originalProducts,
      availableIn,
      label: `${boxed.name} · ${bundled ? "Included in Collector’s Edition" : "Separately sold Starter Deck"}`,
      detail: bundled
        ? "One of two official ready-to-play decks included in the Limited Collector’s Edition bundle: 3 heroes and 50 playing cards."
        : "Official ready-to-play recipe: 3 heroes and 50 playing cards. Additional cards supplied in the pack are kept separately for deckbuilding.",
    };
  }
  if (
    deck.id &&
    coreLearningIds.has(deck.id) &&
    !deck.source &&
    originalProducts.length === 1 &&
    originalProducts[0].id === "core"
  ) {
    return {
      kind: "app-built",
      product: product("core"),
      originalProducts,
      availableIn,
      label: "Core Set · Learning deck",
      detail:
        "Assembled from the Core Set’s printed single-sphere learning list. The app gives this list its own title; it is included in the Core Set.",
    };
  }
  const sourceProduct = deck.productId ? product(deck.productId) : null;
  return {
    kind: "custom",
    product: sourceProduct,
    originalProducts,
    availableIn,
    label: deck.source
      ? "Imported deck · Assembled list"
      : "Custom deck · Assembled list",
    detail: sourceProduct
      ? `${sourceProduct.name} supplies a deckbuilding pool; this list is assembled from individual cards.`
      : originalProducts.length
        ? `Cards originally published in ${originalProducts.map((p) => p.name).join(", ")}.`
        : "The source product is shown on each imported card when available.",
  };
}
