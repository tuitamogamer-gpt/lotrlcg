import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import type { Card, ScenarioId } from "../game/types";
import { automatedScenarioId } from "../game/support";
import { SCENARIOS } from "../game/scenarios";
import { Art } from "./card-art";

interface Recipe {
  id: string;
  name: string;
  mode: string;
  pack_codes: string[];
  card_codes: string[];
  cards: { code: string; quantity: number; section: string }[];
  source_url: string;
}
const sectionNames: Record<string, string> = {
  player1Play1: "Cards in play",
  sharedActiveLocation: "Active location",
  sharedEncounterDeck: "Encounter deck",
  sharedEncounterDeck2: "Second encounter deck",
  sharedEncounterDeck3: "Third encounter deck",
  sharedMap: "Map",
  sharedQuestDeck: "Quest deck",
  sharedQuestDeck2: "Second quest deck",
  sharedSetAside: "Set aside",
  sharedStagingArea: "Staging area",
  sharedBoons: "Campaign cards",
};
export default function ScenarioArchive({
  catalog,
  query,
  edition,
  productCodes,
  inspect,
  chooseAdventure,
}: {
  catalog: Card[];
  query: string;
  edition: string;
  productCodes?: Set<string>;
  inspect: (c: Card) => void;
  chooseAdventure?: (id: ScenarioId, mode: string) => void;
}) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [status, setStatus] = useState("Loading scenario lists…");
  const [mode, setMode] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [limit, setLimit] = useState(24);
  useEffect(() => {
    let ignore = false;
    Promise.all(
      ["/scenarios.json", "/campaign-pools.json"].map((url) =>
        fetch(url, { signal: AbortSignal.timeout(20000) }).then((r) => {
          if (!r.ok) throw new Error();
          return r.json();
        }),
      ),
    )
      .then((pools) => pools.flat())
      .then((data: unknown) => {
        if (
          !Array.isArray(data) ||
          !data.every(
            (s) =>
              typeof s?.id === "string" &&
              typeof s?.name === "string" &&
              Array.isArray(s?.cards) &&
              Array.isArray(s?.card_codes),
          )
        )
          throw new Error();
        if (!ignore) {
          setRecipes(data as Recipe[]);
          setStatus("");
        }
      })
      .catch(() => {
        if (!ignore)
          setStatus(
            "Scenario lists could not load. Reopen the archives to try again.",
          );
      });
    return () => {
      ignore = true;
    };
  }, []);
  const byCode = useMemo(
    () => new Map(catalog.map((c) => [c.code, c])),
    [catalog],
  );
  const found = recipes.filter(
    (r) =>
      r.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
      (mode === "all" || r.mode === mode) &&
      (edition === "all" ||
        (edition === "nightmare"
          ? r.mode === "nightmare"
          : r.mode !== "nightmare")) &&
      (!productCodes || r.card_codes.some((code) => productCodes.has(code))),
  );
  const recipe = recipes.find((r) => r.id === selected);
  const supported = recipe ? automatedScenarioId(recipe) : null;
  return (
    <section className="scenario-archive" aria-label="Published scenario lists">
      <div className="library-summary">
        <span>
          {found.length} scenario & campaign lists · {SCENARIOS.length}{" "}
          automated adventures
        </span>
        <label>
          Mode{" "}
          <select
            aria-label="Filter scenario mode"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setLimit(24);
            }}
          >
            <option value="all">All modes</option>
            {[...new Set(recipes.map((r) => r.mode))].sort().map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>
      {status && <p role="status">{status}</p>}
      <div className="published-products">
        {found.slice(0, limit).map((r) => (
          <button
            key={r.id}
            className="published-product scenario-recipe"
            aria-pressed={r.id === selected}
            onClick={() => setSelected(r.id)}
          >
            <span className="published-product-kind">{r.mode}</span>
            <strong>{r.name}</strong>
            <span>
              {automatedScenarioId(r)
                ? "Automated play available"
                : "Imported · rules automation pending"}
            </span>
            <span>
              {r.cards.reduce((n, c) => n + c.quantity, 0)} cards across setup
              sections · Inspect list <ArrowRight size={14} />
            </span>
          </button>
        ))}
      </div>
      {found.length > limit && (
        <button
          className="secondary load-more"
          onClick={() => setLimit((n) => n + 24)}
        >
          Show more scenario lists
        </button>
      )}
      {!status && !found.length && (
        <p>No scenario lists match these filters.</p>
      )}
      {recipe && (
        <div className="published-deck-detail">
          <h2>{recipe.name}</h2>
          <p className="published-support">
            {recipe.mode} ·{" "}
            {supported
              ? "Automated play is available for this adventure. Review its fellowship and difficulty before beginning."
              : "Imported scenario list. Its rules are not automated yet."}
          </p>
          {chooseAdventure && (
            <button
              className="secondary"
              disabled={!supported}
              onClick={() =>
                supported && chooseAdventure(supported, recipe.mode)
              }
            >
              Choose adventure <ArrowRight size={16} />
            </button>
          )}
          {[...new Set(recipe.cards.map((c) => c.section))].map((section) => (
            <div key={section}>
              <h3>{sectionNames[section] ?? "Additional cards"}</h3>
              <div className="deck-list">
                {recipe.cards
                  .filter((c) => c.section === section)
                  .map((entry, i) => {
                    const c = byCode.get(entry.code);
                    return (
                      <div className="deck-row" key={`${entry.code}-${i}`}>
                        <button
                          className="deck-card-link"
                          disabled={!c}
                          onClick={() => c && inspect(c)}
                        >
                          {c && <Art c={c} />}
                          <span>{c?.name ?? entry.code}</span>
                        </button>
                        <span className="deck-quantity">
                          × {entry.quantity}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
          {/^https?:\/\//.test(recipe.source_url) && (
            <a
              className="text-link"
              href={recipe.source_url}
              target="_blank"
              rel="noreferrer"
            >
              View scenario data source <ArrowRight size={16} />
            </a>
          )}
        </div>
      )}
    </section>
  );
}
