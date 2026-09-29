import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  DownloadSimple,
  MagnifyingGlass,
  Minus,
  Plus,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { card, plain } from "../game/cards";
import {
  DECK_CARDS,
  HERO_CARDS,
  costCurve,
  customId,
  deckProblems,
  deckSize,
  legalSphere,
  parseRingsDbDeck,
  ringsDbId,
  sphereCounts,
} from "../game/decks";
import type { CustomDeck } from "../game/decks";
import type { Card } from "../game/types";
import { Art, Sphere } from "./card-art";

const newDeck = (): CustomDeck => ({
  id: `d${Date.now().toString(36)}`,
  name: "New deck",
  heroes: [],
  cards: {},
  updatedAt: Date.now(),
});

export default function DeckBuilder({
  decks,
  setDecks,
  inspect,
  notify,
  play,
}: {
  decks: CustomDeck[];
  setDecks: (decks: CustomDeck[]) => void;
  inspect: (c: Card) => void;
  notify: (message: string) => void;
  play: (id: string) => void;
}) {
  const [editing, setEditing] = useState<CustomDeck | null>(null);
  const [query, setQuery] = useState("");
  const [sphere, setSphere] = useState("all");
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<string[]>([]);
  const problems = useMemo(
    () => (editing ? deckProblems(editing) : []),
    [editing],
  );
  const size = editing ? deckSize(editing.cards) : 0;
  const save = () => {
    if (!editing) return;
    const deck = { ...editing, updatedAt: Date.now() };
    const others = decks.filter((d) => d.id !== deck.id);
    setDecks([deck, ...others]);
    setEditing(null);
    notify(`${deck.name} saved.`);
  };
  const remove = (deck: CustomDeck) => {
    if (!confirm(`Delete ${deck.name}? This cannot be undone.`)) return;
    setDecks(decks.filter((d) => d.id !== deck.id));
  };
  const setCount = (code: string, n: number) => {
    if (!editing) return;
    const cards = { ...editing.cards };
    if (n <= 0) delete cards[code];
    else cards[code] = Math.min(3, n);
    setEditing({ ...editing, cards });
  };
  const toggleHero = (code: string) => {
    if (!editing) return;
    const heroes = editing.heroes.includes(code)
      ? editing.heroes.filter((h) => h !== code)
      : editing.heroes.length < 3
        ? [...editing.heroes, code]
        : editing.heroes;
    setEditing({ ...editing, heroes });
  };
  const importDeck = async () => {
    const id = ringsDbId(importText);
    if (!id) {
      notify(
        "Paste a RingsDB decklist link, for example ringsdb.com/decklist/view/12345.",
      );
      return;
    }
    setImporting(true);
    setReport([]);
    try {
      const res = await fetch(
        `https://ringsdb.com/api/public/decklist/${id}.json`,
        {
          signal: AbortSignal.timeout(12000),
        },
      );
      if (!res.ok) throw new Error(`RingsDB answered ${res.status}.`);
      const result = parseRingsDbDeck(
        await res.json(),
        `https://ringsdb.com/decklist/view/${id}`,
      );
      const lines = [
        `${result.deck.name}: ${deckSize(result.deck.cards)} supported cards and ${result.deck.heroes.length} supported heroes imported.`,
        ...result.heroesDropped.map(
          (h) => `Hero not available in this app: ${h}.`,
        ),
        ...result.unsupported.map(
          (u) =>
            `${u.quantity} × ${u.name} skipped (not a scripted Core Set card).`,
        ),
      ];
      setReport(lines);
      setEditing(result.deck);
      setImportText("");
    } catch (e) {
      notify(
        e instanceof Error && e.message.startsWith("RingsDB")
          ? e.message
          : "RingsDB could not be reached. Public decklists only; private decks cannot be imported.",
      );
    } finally {
      setImporting(false);
    }
  };
  if (editing) {
    const visible = DECK_CARDS.filter(
      (c) =>
        (sphere === "all" || c.sphere_code === sphere) &&
        (c.name + " " + (c.traits ?? ""))
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    );
    const spheres = sphereCounts(editing.cards);
    const curve = costCurve(editing.cards);
    const peak = Math.max(1, ...curve);
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="content-page deck-builder"
      >
        <div className="page-heading">
          <div>
            <label className="deck-name-field">
              <span>Deck name</span>
              <input
                value={editing.name}
                maxLength={60}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
                aria-label="Deck name"
              />
            </label>
            <p>
              Choose up to three heroes, then add cards their spheres can pay
              for. The Rules Reference asks for at least 50 cards and at most 3
              copies.
            </p>
          </div>
          <div className="builder-actions">
            <button className="secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={problems.length > 0}
              onClick={save}
            >
              Save deck <Check size={16} />
            </button>
          </div>
        </div>
        {report.length > 0 && (
          <div className="import-report" role="status">
            {report.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        )}
        <section className="builder-heroes" aria-label="Heroes">
          <h2>Heroes · {editing.heroes.length}/3</h2>
          <div className="builder-hero-grid">
            {HERO_CARDS.map((h) => {
              const on = editing.heroes.includes(h.code);
              return (
                <div
                  key={h.code}
                  className={`builder-hero ${on ? "is-selected" : ""}`}
                >
                  <button
                    aria-pressed={on}
                    aria-label={`${on ? "Remove" : "Add"} ${h.name}`}
                    onClick={() => toggleHero(h.code)}
                    disabled={!on && editing.heroes.length >= 3}
                  >
                    <Art c={h} />
                    <span>
                      <Sphere sphere={h.sphere_code} /> {h.name}
                      <small>{h.threat} threat</small>
                    </span>
                    {on && <Check size={15} weight="bold" />}
                  </button>
                  <button className="text-link" onClick={() => inspect(h)}>
                    Read card
                  </button>
                </div>
              );
            })}
          </div>
        </section>
        <div className="builder-body">
          <section className="builder-cards" aria-label="Cards">
            <div className="library-toolbar">
              <label className="search-field">
                <MagnifyingGlass size={19} />
                <input
                  aria-label="Search cards"
                  placeholder="Search by name or trait…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <select
                aria-label="Filter sphere"
                value={sphere}
                onChange={(e) => setSphere(e.target.value)}
              >
                <option value="all">All spheres</option>
                {["leadership", "tactics", "spirit", "lore", "neutral"].map(
                  (v) => (
                    <option key={v} value={v}>
                      {v[0].toUpperCase() + v.slice(1)}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div className="builder-card-list">
              {visible.map((c) => {
                const n = editing.cards[c.code] ?? 0;
                const legal = legalSphere(c.code, editing.heroes);
                return (
                  <div
                    key={c.code}
                    className={`builder-card ${n ? "in-deck" : ""} ${legal ? "" : "not-legal"}`}
                  >
                    <button
                      className="builder-card-info"
                      onClick={() => inspect(c)}
                      title={plain(c.text)}
                    >
                      <Art c={c} />
                      <span>
                        <strong>{c.name}</strong>
                        <small>
                          <Sphere sphere={c.sphere_code} /> {c.type_code} · cost{" "}
                          {c.cost}
                          {!legal && " · no matching hero"}
                        </small>
                      </span>
                    </button>
                    <span
                      className="builder-counter"
                      role="group"
                      aria-label={`${c.name} copies`}
                    >
                      <button
                        aria-label={`Remove one ${c.name}`}
                        disabled={!n}
                        onClick={() => setCount(c.code, n - 1)}
                      >
                        <Minus size={14} />
                      </button>
                      <strong>{n}</strong>
                      <button
                        aria-label={`Add one ${c.name}`}
                        disabled={n >= 3}
                        onClick={() => setCount(c.code, n + 1)}
                      >
                        <Plus size={14} />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
          <aside className="builder-summary" aria-label="Deck summary">
            <h2>
              {size} <span>/ 50 cards</span>
            </h2>
            <div className="builder-spheres">
              {Object.entries(spheres).map(([s, n]) => (
                <span key={s}>
                  <Sphere sphere={s} /> {n}
                </span>
              ))}
            </div>
            <div className="builder-curve" aria-label="Cost curve">
              {curve.map((n, cost) => (
                <span
                  key={cost}
                  title={`${n} cards costing ${cost === 5 ? "5+" : cost}`}
                >
                  <i style={{ height: `${(n / peak) * 100}%` }} />
                  <small>{cost === 5 ? "5+" : cost}</small>
                </span>
              ))}
            </div>
            <ul className="builder-problems">
              {problems.length === 0 ? (
                <li className="is-ok">
                  <Check size={15} /> This deck follows the deckbuilding rules.
                </li>
              ) : (
                problems.slice(0, 6).map((p) => (
                  <li key={p}>
                    <WarningCircle size={15} /> {p}
                  </li>
                ))
              )}
            </ul>
            <div className="builder-deck-list">
              {Object.entries(editing.cards)
                .sort((a, b) => card(a[0]).name.localeCompare(card(b[0]).name))
                .map(([code, n]) => (
                  <button key={code} onClick={() => inspect(card(code))}>
                    <span>{n} ×</span> {card(code).name}
                  </button>
                ))}
            </div>
          </aside>
        </div>
      </main>
    );
  }
  return (
    <main id="main-content" tabIndex={-1} className="content-page deck-builder">
      <div className="page-heading">
        <div>
          <h1>Your decks</h1>
          <p>
            Build a 50-card deck from the scripted Core Set, or import a public
            RingsDB decklist. Decks stay on this device.
          </p>
        </div>
        <button className="primary" onClick={() => setEditing(newDeck())}>
          <Plus size={16} /> New deck
        </button>
      </div>
      <section className="import-panel" aria-label="Import from RingsDB">
        <h2>
          <DownloadSimple size={18} /> Import from RingsDB
        </h2>
        <p>
          Paste a public decklist link. Cards outside the scripted Core Set are
          listed and left out, so you can fill the gaps here.
        </p>
        <form
          className="import-form"
          onSubmit={(e) => {
            e.preventDefault();
            void importDeck();
          }}
        >
          <input
            aria-label="RingsDB decklist link"
            placeholder="https://ringsdb.com/decklist/view/…"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <button
            className="secondary"
            disabled={importing || !importText.trim()}
          >
            {importing ? "Importing…" : "Import"}
          </button>
        </form>
      </section>
      {decks.length === 0 ? (
        <div className="library-empty">
          <h2>No custom decks yet.</h2>
          <p>Start a new deck or import one to see it here.</p>
        </div>
      ) : (
        <div className="deck-shelf">
          {decks.map((d) => {
            const issues = deckProblems(d);
            return (
              <article
                key={d.id}
                className={`deck-shelf-item ${issues.length ? "has-problems" : ""}`}
              >
                <div className="deck-shelf-heroes">
                  {d.heroes.map((h) => (
                    <img
                      key={h}
                      src={`/cards/${h}.png`}
                      alt=""
                      loading="lazy"
                    />
                  ))}
                </div>
                <div className="deck-shelf-body">
                  <h3>{d.name}</h3>
                  <p>
                    {d.heroes.map((h) => card(h).name).join(" · ") ||
                      "No heroes yet"}
                    <br />
                    {deckSize(d.cards)} cards
                    {d.source && " · from RingsDB"}
                  </p>
                  {issues.length > 0 && (
                    <small className="deck-shelf-warning">
                      <WarningCircle size={13} /> {issues[0]}
                    </small>
                  )}
                </div>
                <div className="deck-shelf-actions">
                  <button
                    className="primary"
                    disabled={issues.length > 0}
                    onClick={() => play(customId(d))}
                  >
                    Play <ArrowRight size={15} />
                  </button>
                  <button
                    className="secondary"
                    onClick={() =>
                      setEditing({
                        ...d,
                        cards: { ...d.cards },
                        heroes: [...d.heroes],
                      })
                    }
                  >
                    Edit
                  </button>
                  <button
                    className="text-link"
                    onClick={() => remove(d)}
                    aria-label={`Delete ${d.name}`}
                  >
                    <Trash size={15} /> Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
