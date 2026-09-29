import { useEffect, useState } from "react";
import {
  ArrowCounterClockwise,
  Check,
  MagnifyingGlass,
  Plus,
} from "@phosphor-icons/react";
import { playerCards, SCRIPTED } from "../game/cards";
import type { Card } from "../game/types";
import { Art, Sphere } from "./card-art";

export default function Library({
  inspect,
  notify,
}: {
  inspect: (c: Card) => void;
  notify: (s: string) => void;
}) {
  const [catalog, setCatalog] = useState<Card[]>(playerCards);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sphere, setSphere] = useState("all");
  const [type, setType] = useState("all");
  const [scripted, setScripted] = useState(false);
  const [limit, setLimit] = useState(32);
  useEffect(() => {
    let ignore = false;
    fetch("/catalog.json")
      .then((r) => r.json())
      .then((data: Card[]) => {
        if (!ignore) setCatalog(data);
      })
      .catch(() =>
        notify("Showing the cached Core Set. The full catalog could not load."),
      )
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [notify]);
  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("https://ringsdb.com/api/public/cards/", {
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (
        !Array.isArray(data) ||
        !data.every(
          (c) =>
            typeof c.code === "string" &&
            typeof c.name === "string" &&
            typeof c.type_code === "string" &&
            typeof c.sphere_code === "string",
        )
      )
        throw new Error();
      setCatalog(data);
      notify(
        `Library refreshed: ${data.length.toLocaleString()} player cards from RingsDB.`,
      );
    } catch {
      notify("RingsDB is unavailable. Your cached library is still available.");
    } finally {
      setLoading(false);
    }
  };
  const found = catalog.filter(
    (c) =>
      (c.name + " " + (c.traits ?? ""))
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()) &&
      (sphere === "all" || c.sphere_code === sphere) &&
      (type === "all" || c.type_code === type) &&
      (!scripted || SCRIPTED.has(c.code)),
  );
  return (
    <main id="main-content" tabIndex={-1} className="content-page library">
      <div className="page-heading">
        <div>
          <h1>The archives of Middle-earth</h1>
          <p>Discover the heroes, allies, and artifacts of your next story.</p>
        </div>
        <button
          className="secondary"
          disabled={loading}
          onClick={() => void refresh()}
        >
          <ArrowCounterClockwise />
          {loading ? "Loading cards…" : "Refresh RingsDB"}
        </button>
      </div>
      <div className="library-toolbar">
        <label className="search-field">
          <MagnifyingGlass size={19} />
          <input
            aria-label="Search cards"
            placeholder="Search by name or trait…"
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
          {["leadership", "spirit", "lore", "tactics", "neutral"].map((v) => (
            <option key={v} value={v}>
              {v[0].toUpperCase() + v.slice(1)}
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
          {["hero", "ally", "attachment", "event"].map((v) => (
            <option key={v} value={v}>
              {v[0].toUpperCase() + v.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <div className="library-summary">
        <span>
          {found.length.toLocaleString()} cards {query && `matching “${query}”`}
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
              {c.pack_name} · {c.type_code}
              {SCRIPTED.has(c.code) && <Check size={12} />}
            </small>
          </button>
        ))}
      </div>
      {found.length === 0 && (
        <div className="library-empty">
          <MagnifyingGlass size={40} weight="thin" />
          <h2>No cards on this path.</h2>
          <p>Try another name, trait, or filter.</p>
          <button
            className="secondary"
            onClick={() => {
              setQuery("");
              setSphere("all");
              setType("all");
              setScripted(false);
            }}
          >
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
      <p className="library-source">
        Player-card data from{" "}
        <a href="https://ringsdb.com/api/" target="_blank" rel="noreferrer">
          RingsDB’s public API
        </a>
        . A local snapshot keeps the library available. Browsing does not imply
        gameplay support.
      </p>
    </main>
  );
}
