import { useMemo, useState } from "react";
import { card } from "../game/cards";
import type { Card, GameState } from "../game/types";
import {
  burglarContractPublicState,
  burglarLootCards,
} from "../game/burglar-contract-support";
import { seatName } from "../game/table";
import { normalizeSearchText } from "../search-text";
import type { InspectedCard } from "./quest-inspection";
import "./burglar-contract.css";
import "./shadow-east.css";

export function BurglarLootSelector({
  loot,
  onChange,
  inspect,
}: {
  loot: string[];
  onChange: (loot: string[]) => void;
  inspect: (card: Card) => void;
}) {
  const [query, setQuery] = useState("");
  const choices = useMemo(
    () => burglarLootCards().sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
  const selected = new Set(loot.map((code) => card(code).name));
  const filtered = choices.filter((c) =>
    normalizeSearchText(`${c.name} ${c.traits} ${c.pack_name}`).includes(
      normalizeSearchText(query),
    ),
  );
  return (
    <section
      className="burglar-loot-selector"
      aria-label="Burglar loot deck"
      data-loot-selector
    >
      <h2>The Burglar’s Turn · Loot deck</h2>
      <p>
        Choose 14 different Item or Artifact attachments. These cards stay
        separate from your player deck, which cannot include attachments.
      </p>
      <strong data-loot-count role="status">
        {loot.length} / 14 loot attachments
      </strong>
      <div
        className="burglar-selected-loot"
        aria-label="Selected loot attachments"
      >
        {loot.map((code) => (
          <div key={code} data-selected-loot-code={code}>
            <button className="text-link" onClick={() => inspect(card(code))}>
              Inspect {card(code).name}
            </button>
            <button
              className="secondary"
              aria-label={`Remove ${card(code).name} from loot deck`}
              onClick={() => onChange(loot.filter((c) => c !== code))}
            >
              Remove
            </button>
          </div>
        ))}
        {!loot.length && <p>No loot attachments selected yet.</p>}
      </div>
      <label className="burglar-loot-search">
        Search loot attachments
        <input
          type="search"
          value={query}
          placeholder="Find an Item or Artifact…"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="burglar-loot-options">
        {filtered.map((c) => (
          <div key={c.code} data-loot-code={c.code}>
            <span>
              <strong>{c.name}</strong>
              <small>{c.traits}</small>
            </span>
            <button
              className="secondary"
              aria-label={`Add ${c.name} to loot deck`}
              disabled={selected.has(c.name) || loot.length >= 14}
              onClick={() => onChange([...loot, c.code])}
            >
              {selected.has(c.name) ? "Selected" : "Add"}
            </button>
          </div>
        ))}
        {!filtered.length && <p>No eligible attachments match this search.</p>}
      </div>
    </section>
  );
}

export function BurglarContractStateView({
  s,
  inspect,
}: {
  s: GameState;
  inspect: (card: InspectedCard) => void;
}) {
  const q = burglarContractPublicState(s);
  if (!q?.contracts.length) return null;
  return (
    <section
      className="shadow-east-state"
      data-burglar-contract
      aria-label="Burglar loot decks"
    >
      {q.contracts.map((c) => (
        <div className="shadow-east-summary" key={c.id}>
          <strong>The Burglar’s Turn · Side B</strong>
          <span>
            {seatName(s, c.player)} · {c.loot} cards remain in the loot deck
          </span>
          <span>
            Travel reveals one loot attachment. Explore the active location to
            claim guarded attachments.
          </span>
          <button
            onClick={() => inspect({ ...card(c.code), initialReverse: true })}
          >
            Inspect The Burglar’s Turn
          </button>
          {q.guarded
            .filter((g) => g.player === c.player)
            .map((g) => (
              <button key={g.id} onClick={() => inspect(card(g.code))}>
                Guarded loot · {card(g.code).name}
              </button>
            ))}
        </div>
      ))}
    </section>
  );
}
