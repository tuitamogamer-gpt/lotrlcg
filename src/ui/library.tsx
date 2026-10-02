import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  ArrowCounterClockwise,
  Check,
  MagnifyingGlass,
  Plus,
} from "@phosphor-icons/react";
import { playerCards } from "../game/cards";
import { isScriptedCard, loadCatalog, searchCards } from "../game/catalog";
import { PRODUCTS, cardProductInfo } from "../game/products";
import type { Card, ScenarioId } from "../game/types";
import { Art, Sphere } from "./card-art";
import "./catalog.css";
import { SupportSummary } from "./support-summary";
const ScenarioArchive = lazy(() => import("./scenario-archive"));

const playerTypes = new Set([
  "hero",
  "ally",
  "attachment",
  "event",
  "contract",
  "player-side-quest",
  "player_side_quest",
  "treasure",
]);

export default function Library({
  inspect,
  notify,
  initialProduct = "all",
  chooseAdventure,
}: {
  inspect: (c: Card) => void;
  notify: (s: string) => void;
  initialProduct?: string;
  chooseAdventure?: (id: ScenarioId, mode: string) => void;
}) {
  const [catalog, setCatalog] = useState<Card[]>(playerCards);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [sphere, setSphere] = useState("all");
  const [type, setType] = useState("all");
  const [product, setProduct] = useState(initialProduct);
  const [edition, setEdition] = useState("all");
  const [section, setSection] = useState("all");
  const [scripted, setScripted] = useState(false);
  const [limit, setLimit] = useState(32);
  useEffect(() => {
    let ignore = false;
    loadCatalog()
      .then((data) => {
        if (!ignore) {
          setCatalog(data);
          setFailed(false);
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
  const refresh = async () => {
    setLoading(true);
    try {
      const data = await loadCatalog(true);
      setCatalog(data);
      setFailed(false);
      notify(
        `Library reloaded: ${data.length.toLocaleString()} official card records.`,
      );
    } catch {
      setFailed(true);
      notify(
        "The full snapshot could not load. The cards already on screen remain available.",
      );
    } finally {
      setLoading(false);
    }
  };
  const origins = useMemo(
    () => new Map(catalog.map((c) => [c.code, cardProductInfo(c)])),
    [catalog],
  );
  const types = useMemo(
    () => [...new Set(catalog.map((c) => c.type_code))].sort(),
    [catalog],
  );
  const spheres = useMemo(
    () => [...new Set(catalog.map((c) => c.sphere_code))].sort(),
    [catalog],
  );
  const found = searchCards(catalog, query).filter(
    (c) =>
      (sphere === "all" || c.sphere_code === sphere) &&
      (type === "all" || c.type_code === type) &&
      (section === "all" ||
        (section === "heroes"
          ? c.type_code === "hero"
          : section === "players"
            ? playerTypes.has(c.type_code)
            : !playerTypes.has(c.type_code))) &&
      (edition === "all" ||
        (edition === "nightmare" ? c.nightmare : !c.nightmare)) &&
      (product === "all" ||
        origins.get(c.code)?.availableIn.some((p) => p.id === product)) &&
      (!scripted || isScriptedCard(c)),
  );
  const clear = () => {
    setQuery("");
    setSphere("all");
    setType("all");
    setProduct("all");
    setEdition("all");
    setSection("all");
    setScripted(false);
    setLimit(32);
  };
  return (
    <main id="main-content" tabIndex={-1} className="content-page library">
      <div className="page-heading">
        <div>
          <h1>The archives of Middle-earth</h1>
          <p>
            Official player cards, encounters, quests, campaigns and Nightmare
            editions.
          </p>
        </div>
        <button
          className="secondary"
          disabled={loading}
          onClick={() => void refresh()}
        >
          <ArrowCounterClockwise />
          {loading ? "Loading cards…" : "Reload library"}
        </button>
      </div>
      <SupportSummary compact />
      {failed && (
        <p className="catalog-load-error" role="status">
          The complete snapshot could not load. Showing the available cached
          cards.{" "}
          <button className="text-link" onClick={() => void refresh()}>
            Try again
          </button>
        </p>
      )}
      <div
        className="catalog-sections"
        role="group"
        aria-label="Content category"
      >
        {[
          ["all", "All cards"],
          ["players", "Player cards"],
          ["heroes", "Heroes"],
          ["encounters", "Encounters & quests"],
          ["scenarios", "Scenario lists"],
        ].map(([id, title]) => (
          <button
            key={id}
            className="secondary"
            aria-pressed={section === id}
            onClick={() => {
              setSection(id);
              setType("all");
              setLimit(32);
            }}
          >
            {title}
          </button>
        ))}
      </div>
      <div className="library-toolbar">
        <label className="search-field">
          <MagnifyingGlass size={19} />
          <input
            aria-label="Search cards"
            placeholder="Name, trait, set or rules text…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(32);
            }}
          />
        </label>
        <select
          aria-label="Filter sphere"
          value={sphere}
          onChange={(e) => {
            setSphere(e.target.value);
            setLimit(32);
          }}
        >
          <option value="all">All spheres</option>
          {spheres.map((v) => (
            <option key={v} value={v}>
              {v[0]?.toUpperCase() + v.slice(1)}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter card type"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setLimit(32);
          }}
        >
          <option value="all">All card types</option>
          {types.map((v) => (
            <option key={v} value={v}>
              {v.replace(/[-_]/g, " ")}
            </option>
          ))}
        </select>
      </div>
      <div className="catalog-product-filters">
        <label>
          <span>Set or product</span>
          <select
            aria-label="Filter set or product"
            value={product}
            onChange={(e) => {
              setProduct(e.target.value);
              setLimit(32);
            }}
          >
            <option value="all">All sets & products</option>
            {PRODUCTS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Edition</span>
          <select
            aria-label="Filter edition"
            value={edition}
            onChange={(e) => {
              setEdition(e.target.value);
              setLimit(32);
            }}
          >
            <option value="all">All editions</option>
            <option value="standard">Standard editions</option>
            <option value="nightmare">Nightmare editions</option>
          </select>
        </label>
      </div>
      {section === "scenarios" ? (
        <Suspense fallback={<p>Loading scenario lists…</p>}>
          <ScenarioArchive
            catalog={catalog}
            query={query}
            edition={edition}
            productCodes={
              product === "all"
                ? undefined
                : new Set(
                    catalog
                      .filter((c) =>
                        origins
                          .get(c.code)
                          ?.availableIn.some((p) => p.id === product),
                      )
                      .map((c) => c.code),
                  )
            }
            inspect={inspect}
            chooseAdventure={chooseAdventure}
          />
        </Suspense>
      ) : (
        <>
          <div className="library-summary" aria-live="polite">
            <span>
              {found.length.toLocaleString()} cards{" "}
              {query && `matching “${query}”`} ·{" "}
              {catalog.length.toLocaleString()} imported records
            </span>
            <label>
              <input
                type="checkbox"
                checked={scripted}
                onChange={(e) => {
                  setScripted(e.target.checked);
                  setLimit(32);
                }}
              />{" "}
              Scripted cards only
            </label>
          </div>
          <div className="catalog-grid">
            {found.slice(0, limit).map((c) => (
              <button
                className="catalog-card"
                key={c.code}
                onClick={() => inspect(c)}
              >
                <Art c={c} />
                <div>
                  <span>{c.name}</span>
                  <Sphere sphere={c.sphere_code} />
                </div>
                <small>
                  {c.pack_name} · {c.type_code.replace(/[-_]/g, " ")}
                  {c.nightmare && " · Nightmare"}
                  {isScriptedCard(c) && <Check size={12} />}
                </small>
              </button>
            ))}
          </div>
          {found.length === 0 && (
            <div className="library-empty">
              <MagnifyingGlass size={40} weight="thin" />
              <h2>No cards on this path.</h2>
              <p>Try another name, trait, or filter.</p>
              <button className="secondary" onClick={clear}>
                Clear filters
              </button>
            </div>
          )}
          {found.length > limit && (
            <button
              className="secondary load-more"
              onClick={() => setLimit((v) => v + 32)}
            >
              Show more cards <Plus size={16} />
            </button>
          )}
        </>
      )}
      <p className="library-source">
        Player-card data from{" "}
        <a href="https://ringsdb.com/api/" target="_blank" rel="noreferrer">
          RingsDB
        </a>
        ; encounter and quest definitions from{" "}
        <a href="https://dragncards.com/" target="_blank" rel="noreferrer">
          DragnCards
        </a>{" "}
        and{" "}
        <a
          href="https://github.com/GeckoTH/Lord-of-the-Rings"
          target="_blank"
          rel="noreferrer"
        >
          OCTGN
        </a>
        . The bundled snapshot includes original releases and product
        provenance. Cards without the scripted marker are available for
        reference; their abilities are not automated.
      </p>
    </main>
  );
}
