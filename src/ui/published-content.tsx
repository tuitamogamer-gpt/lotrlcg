import { startingThreat } from "../game/decks";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, MagnifyingGlass, Stack } from "@phosphor-icons/react";
import { isScriptedCard, loadCatalog, searchCards } from "../game/catalog";
import { PRODUCTS, cardProductInfo } from "../game/products";
import type { Card } from "../game/types";
import { Art, Sphere } from "./card-art";
import { CardProductNote } from "./product-note";
import { DECK_CARDS, HERO_CARDS, deckProblems } from "../game/decks";
import type { CustomDeck } from "../game/decks";
import { SupportSummary } from "./support-summary";
import "./catalog.css";

interface PublishedDeck {
  id: string;
  productId: string;
  name: string;
  heroes: string[];
  cards: Record<string, number>;
  sideboard?: Record<string, number>;
  source_url: string;
}
export type PublishedPlayRecipe = Pick<
  CustomDeck,
  "name" | "heroes" | "cards" | "source"
> & {
  productId: string;
  deckKind: "official-preconstructed";
};
const size = (cards: Record<string, number>) =>
  Object.values(cards).reduce((n, v) => n + v, 0);

/** Published content is reviewable here without assigning missing rule handlers. */
export default function PublishedContent({
  inspect,
  browse,
  play,
}: {
  inspect: (c: Card) => void;
  browse: (productId: string) => void;
  play: (recipe: PublishedPlayRecipe) => void;
}) {
  const [catalog, setCatalog] = useState<Card[]>([]);
  const [decks, setDecks] = useState<PublishedDeck[]>([]);
  const [tab, setTab] = useState("decks");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sphere, setSphere] = useState("all");
  const [limit, setLimit] = useState(18);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let ignore = false;
    Promise.all([
      loadCatalog(),
      fetch("/published-decks.json", { signal: AbortSignal.timeout(20000) })
        .then((r) => {
          if (!r.ok) throw new Error("Published decks could not load.");
          return r.json();
        })
        .then((data: unknown) => {
          if (
            !Array.isArray(data) ||
            !data.every(
              (d) =>
                typeof d?.id === "string" &&
                typeof d?.productId === "string" &&
                Array.isArray(d?.heroes) &&
                d?.cards &&
                typeof d?.source_url === "string",
            )
          )
            throw new Error("Invalid published deck snapshot.");
          return data as PublishedDeck[];
        }),
    ])
      .then(([cards, lists]) => {
        if (!ignore) {
          setCatalog(cards);
          setDecks(lists);
        }
      })
      .catch(() => {
        if (!ignore) setFailed(true);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);
  const byCode = useMemo(
    () => new Map(catalog.map((c) => [c.code, c])),
    [catalog],
  );
  const heroes = useMemo(
    () =>
      catalog
        .filter((c) => c.type_code === "hero")
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name) || a.code.localeCompare(b.code),
        ),
    [catalog],
  );
  const matches = searchCards(heroes, query).filter(
    (c) => sphere === "all" || c.sphere_code === sphere,
  );
  const productCounts = useMemo(() => {
    const counts = new Map<string, number>();
    catalog.forEach((c) =>
      cardProductInfo(c).availableIn.forEach((p) =>
        counts.set(p.id, (counts.get(p.id) ?? 0) + 1),
      ),
    );
    return counts;
  }, [catalog]);
  const deck = decks.find((d) => d.id === selected);
  const bundled = (d: PublishedDeck) =>
    PRODUCTS.find((p) => p.id === d.productId)?.kind === "limited-starter";
  const visibleProducts = PRODUCTS.filter((p) =>
    p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const supportedHeroes = new Set(HERO_CARDS.map((c) => c.code));
  const supportedCards = new Set(DECK_CARDS.map((c) => c.code));
  const supportFor = (published: PublishedDeck) => {
    const engineCode = (code: string) => byCode.get(code)?.engine_code ?? code;
    const recipe: PublishedPlayRecipe = {
      name: published.name,
      heroes: published.heroes.map(engineCode),
      cards: {},
      source: published.source_url,
      productId: published.productId,
      deckKind: "official-preconstructed",
    };
    for (const [code, quantity] of Object.entries(published.cards)) {
      const resolved = engineCode(code);
      recipe.cards[resolved] = (recipe.cards[resolved] ?? 0) + quantity;
    }
    const missingHeroes = recipe.heroes.filter(
      (code) => !supportedHeroes.has(code),
    ).length;
    const missingCards = Object.keys(recipe.cards).filter(
      (code) => !supportedCards.has(code),
    ).length;
    const total = recipe.heroes.length + Object.keys(recipe.cards).length;
    const problems = deckProblems(recipe);
    return {
      recipe,
      missingHeroes,
      missingCards,
      total,
      automated: total - missingHeroes - missingCards,
      problems,
      ready: problems.length === 0,
    };
  };
  const selectedSupport = deck ? supportFor(deck) : null;
  const retailDeckCount = decks.filter((d) => !bundled(d)).length;
  const bundledDeckCount = decks.length - retailDeckCount;
  return (
    <section className="published-content" aria-labelledby="published-heading">
      <div className="page-heading">
        <div>
          <h2 id="published-heading">Published decks & heroes</h2>
          <p>
            Explore the full official collection and see which box or pack each
            card comes from.
          </p>
        </div>
        <Stack size={30} />
      </div>
      <SupportSummary compact />
      <div
        className="catalog-sections"
        role="group"
        aria-label="Published content"
      >
        {[
          ["decks", "Starter decks"],
          ["heroes", "Heroes"],
          ["products", "Sets & expansions"],
        ].map(([id, label]) => (
          <button
            key={id}
            className="secondary"
            aria-pressed={tab === id}
            onClick={() => {
              setTab(id);
              setQuery("");
              setLimit(18);
            }}
          >
            {label}
            {id === "heroes" && heroes.length > 0 ? ` · ${heroes.length}` : ""}
          </button>
        ))}
      </div>
      {loading && <p role="status">Opening the published collection…</p>}
      {failed && (
        <p role="status">
          The published snapshot could not load. Reopen this page to try again.
        </p>
      )}
      {!loading && !failed && tab === "decks" && (
        <>
          <p className="published-intro">
            {retailDeckCount} preconstructed Starter Decks were sold separately.{" "}
            {bundledDeckCount} decks were included in the Limited Collector’s
            Edition. Hero expansions contain a card pool for deckbuilding; the
            original Core Set learning decks above are included in the Core Set.
          </p>
          <div className="published-decks">
            {decks.map((d) => (
              <button
                key={d.id}
                className="published-starter"
                aria-pressed={selected === d.id}
                onClick={() => setSelected(d.id)}
              >
                <span className="published-product-kind">
                  {bundled(d)
                    ? "Included in the Limited Collector’s Edition"
                    : "Sold separately · official starter deck"}
                </span>
                <h3>{d.name}</h3>
                <span className="published-deck-heroes">
                  {d.heroes.map((code) => {
                    const c = byCode.get(code);
                    return (
                      c && (
                        <span key={code}>
                          <Art c={c} />
                          <strong>{c.name}</strong>
                        </span>
                      )
                    );
                  })}
                </span>
                <span>
                  {size(d.cards)} player cards · {d.heroes.length} heroes
                </span>
                <span className="published-deck-state">
                  {supportFor(d).ready
                    ? "Ready for automated play"
                    : "Inspect deck & origin"}{" "}
                  <ArrowRight size={16} />
                </span>
              </button>
            ))}
          </div>
          {deck && (
            <div className="published-deck-detail" aria-live="polite">
              <div className="page-heading">
                <div>
                  <h3>{deck.name}</h3>
                  <p>
                    Official preconstructed list ·{" "}
                    {bundled(deck)
                      ? "included in the Limited Collector’s Edition."
                      : "sold as its own starter deck."}
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() => browse(deck.productId)}
                >
                  Browse this product <ArrowRight size={16} />
                </button>
              </div>
              <p className="published-support">
                {selectedSupport?.automated} / {selectedSupport?.total} card
                designs automated.
                {selectedSupport?.ready
                  ? " Ready for automated play."
                  : selectedSupport &&
                      selectedSupport.missingHeroes +
                        selectedSupport.missingCards >
                        0
                    ? ` ${selectedSupport.missingHeroes} heroes and ${selectedSupport.missingCards} deck card designs still need rules automation.`
                    : ` ${selectedSupport?.problems[0] ?? "Choose an available recipe."}`}
              </p>
              <button
                className="secondary"
                disabled={!selectedSupport?.ready}
                onClick={() =>
                  selectedSupport?.ready && play(selectedSupport.recipe)
                }
              >
                Choose for play
              </button>
              <div className="published-selected-heroes">
                {deck.heroes.map((code) => {
                  const c = byCode.get(code);
                  return (
                    c && (
                      <button key={code} onClick={() => inspect(c)}>
                        <Art c={c} />
                        <strong>{c.name}</strong>
                        <CardProductNote c={c} />
                      </button>
                    )
                  );
                })}
              </div>
              <h4>Starting deck · {size(deck.cards)} cards</h4>
              <p>{startingThreat(deck.heroes)} starting threat</p>
              <div className="deck-list">
                {Object.entries(deck.cards).map(([code, count]) => {
                  const c = byCode.get(code);
                  return (
                    <div className="deck-row" key={code}>
                      <button
                        className="deck-card-link"
                        disabled={!c}
                        onClick={() => c && inspect(c)}
                      >
                        {c && <Art c={c} />}
                        <span>
                          {c?.name ?? code}
                          {c && <CardProductNote c={c} />}
                        </span>
                      </button>
                      <span className="deck-quantity">× {count}</span>
                    </div>
                  );
                })}
              </div>
              {!!deck.sideboard && Object.keys(deck.sideboard).length > 0 && (
                <details className="published-extra-cards">
                  <summary>
                    Additional cards in the pack · {size(deck.sideboard)} cards
                  </summary>
                  {Object.entries(deck.sideboard).map(([code, count]) => {
                    const c = byCode.get(code);
                    return (
                      <button
                        key={code}
                        className="text-link"
                        disabled={!c}
                        onClick={() => c && inspect(c)}
                      >
                        {count} × {c?.name ?? code}
                      </button>
                    );
                  })}
                </details>
              )}
              <a
                className="text-link"
                href={deck.source_url}
                target="_blank"
                rel="noreferrer"
              >
                Decklist & rules source <ArrowRight size={16} />
              </a>
            </div>
          )}
        </>
      )}
      {!loading && !failed && tab === "heroes" && (
        <>
          <div className="library-toolbar">
            <label className="search-field">
              <MagnifyingGlass size={19} />
              <input
                className="published-hero-search"
                aria-label="Search published heroes"
                value={query}
                placeholder="Hero, trait or original set…"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(18);
                }}
              />
            </label>
            <select
              aria-label="Filter published hero sphere"
              value={sphere}
              onChange={(e) => {
                setSphere(e.target.value);
                setLimit(18);
              }}
            >
              <option value="all">All spheres</option>
              {[...new Set(heroes.map((h) => h.sphere_code))]
                .sort()
                .map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
            </select>
          </div>
          <p className="published-intro">
            {matches.length} hero cards. Inspect any hero to see its original
            release and later products. The scripted marker identifies available
            automated abilities.
          </p>
          <div className="catalog-grid">
            {matches.slice(0, limit).map((c) => (
              <button
                key={c.code}
                className="catalog-card published-hero"
                onClick={() => inspect(c)}
              >
                <Art c={c} />
                <div>
                  <span>{c.name}</span>
                  <Sphere sphere={c.sphere_code} />
                </div>
                <CardProductNote c={c} />
                <small>
                  {c.threat} threat ·{" "}
                  {isScriptedCard(c) ? "Scripted" : "Imported · reference"}
                </small>
              </button>
            ))}
          </div>
          {matches.length > limit && (
            <button
              className="secondary load-more"
              onClick={() => setLimit((n) => n + 18)}
            >
              Show more heroes
            </button>
          )}
          {matches.length === 0 && <p>No heroes match these filters.</p>}
        </>
      )}
      {!loading && !failed && tab === "products" && (
        <>
          <label className="search-field published-product-search">
            <MagnifyingGlass size={19} />
            <input
              aria-label="Search published products"
              placeholder="Find an expansion, cycle, starter or Nightmare pack…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <p className="published-intro">
            {visibleProducts.length} products · original releases and revised
            packages. Reprints share card definitions.
          </p>
          <div className="published-products">
            {visibleProducts.map((p) => (
              <button
                key={p.id}
                className="published-product"
                onClick={() => browse(p.id)}
              >
                <span className="published-product-kind">
                  {p.kind.replace(/[-_]/g, " ")}
                </span>
                <strong>{p.name}</strong>
                <span>
                  {productCounts.get(p.id) ?? 0} card records · Browse{" "}
                  <ArrowRight size={14} />
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
