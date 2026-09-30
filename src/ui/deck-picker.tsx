import { useState } from "react";
import {
  Check,
  Eye,
  Stack,
  Crown,
  Sword,
  Feather,
  Leaf,
} from "@phosphor-icons/react";
import { STARTERS, card, imageUrl, plain } from "../game/cards";
import type { Card } from "../game/types";
import { customId, deckProblems, deckSize } from "../game/decks";
import type { CustomDeck } from "../game/decks";

const icons = {
  leadership: Crown,
  tactics: Sword,
  spirit: Feather,
  lore: Leaf,
};
export function DeckPicker({
  value,
  onChange,
  label = "Choose your starter deck",
  unavailable = {},
  inspect,
  compact = false,
  showHeroes = true,
  custom = [],
  onBuild,
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
  unavailable?: Record<string, string>;
  inspect?: (id: string) => void;
  compact?: boolean;
  showHeroes?: boolean;
  custom?: CustomDeck[];
  onBuild?: () => void;
}) {
  const choices = [
    ...STARTERS.map((d) => ({ ...d, custom: false })),
    ...custom.map((d) => ({
      id: customId(d),
      name: d.name,
      subtitle: "Custom deck",
      description: d.source
        ? "Imported from RingsDB and limited to scripted cards."
        : "Assembled in the deck builder.",
      heroes: d.heroes,
      cards: d.cards,
      custom: true,
    })),
  ];
  return (
    <div
      className={`deck-picker ${compact ? "deck-picker-compact" : ""}`}
      role="group"
      aria-label={label}
    >
      {choices.map((d) => {
        const Icon = d.custom ? Stack : icons[d.id as keyof typeof icons];
        const selected = d.id === value;
        const count = deckSize(d.cards);
        const blocked =
          unavailable[d.id] ?? (d.custom ? deckProblems(d)[0] : undefined);
        return (
          <article
            key={d.id}
            className={`deck-choice sphere-${d.custom ? "custom" : d.id} ${selected ? "is-selected" : ""} ${blocked ? "is-unavailable" : ""}`}
          >
            <button
              className="deck-choice-select"
              aria-label={`Choose ${d.custom ? d.name : d.subtitle}`}
              aria-pressed={selected}
              disabled={!!blocked}
              title={blocked}
              onClick={() => onChange(d.id)}
            >
              <span className="deck-choice-top">
                <span>
                  <Icon size={19} /> {d.subtitle}
                </span>
                <span className="deck-check">
                  {selected ? <Check weight="bold" size={17} /> : <span />}
                </span>
              </span>
              <h3>{d.name}</h3>
              {!compact && <p>{d.description}</p>}
              {showHeroes && (
                <span className="deck-hero-triptych">
                  {d.heroes.map((code) => (
                    <span key={code}>
                      <img src={imageUrl(card(code))} alt="" loading="lazy" />
                      <strong>{card(code).name}</strong>
                    </span>
                  ))}
                </span>
              )}
              <span className="deck-choice-facts">
                <span>
                  <Stack size={15} /> {count} cards
                  {showHeroes
                    ? ` · ${d.heroes.length} ${d.heroes.length === 1 ? "hero" : "heroes"}`
                    : ""}
                </span>
                {showHeroes && (
                  <span>
                    <Eye size={15} />{" "}
                    {d.heroes.reduce(
                      (n, code) => n + (card(code).threat ?? 0),
                      0,
                    )}{" "}
                    threat
                  </span>
                )}
              </span>
              <span className="deck-choice-state">
                {blocked ??
                  (selected
                    ? showHeroes
                      ? "Selected fellowship"
                      : "Selected deck"
                    : showHeroes
                      ? "Choose this fellowship"
                      : "Choose this deck")}
              </span>
            </button>
            {inspect && (
              <button
                className="deck-view"
                onClick={() => inspect(d.id)}
                aria-label={`View ${d.custom ? d.name : d.subtitle} deck and heroes`}
              >
                View deck & heroes <Eye size={15} />
              </button>
            )}
          </article>
        );
      })}
      {onBuild && (
        <article className="deck-choice deck-choice-build">
          <button className="deck-choice-select" onClick={onBuild}>
            <span className="deck-choice-top">
              <span>
                <Stack size={19} /> Custom
              </span>
            </span>
            <h3>Build your own deck</h3>
            {!compact && (
              <p>
                Fifty scripted Core Set cards of your choice, or a RingsDB
                decklist.
              </p>
            )}
            <span className="deck-choice-state">Open the deck builder</span>
          </button>
        </article>
      )}
    </div>
  );
}

export function HeroPicker({
  value,
  onChange,
  label,
  heroes,
  unavailable,
  inspect,
}: {
  value: string;
  onChange: (code: string) => void;
  label: string;
  heroes: Card[];
  unavailable: (code: string) => string | undefined;
  inspect: (hero: Card) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const selected = card(value);
  return (
    <fieldset
      className={`campaign-hero-picker ${expanded ? "is-expanded" : ""}`}
    >
      <legend>{label}</legend>
      <div className="campaign-selected-hero" data-hero-code={value}>
        <button
          className="campaign-current-art"
          onClick={() => inspect(selected)}
          aria-label={`Inspect ${selected.name}`}
        >
          <img src={imageUrl(selected)} alt={selected.name} />
        </button>
        <div>
          <strong>{selected.name}</strong>
          <span>
            {selected.threat} threat · {selected.sphere_code}
          </span>
          {unavailable(value) && <small>{unavailable(value)}</small>}
          <button
            className="secondary"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Keep this hero" : "Change hero"}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="campaign-hero-options">
          {heroes.map((hero) => (
            <div
              className={`campaign-hero-choice ${value === hero.code ? "is-selected" : ""}`}
              key={hero.code}
            >
              <button
                aria-label={`Choose ${hero.name}`}
                aria-pressed={value === hero.code}
                disabled={!!unavailable(hero.code)}
                onClick={() => {
                  onChange(hero.code);
                  setExpanded(false);
                }}
              >
                <img src={imageUrl(hero)} alt="" loading="lazy" />
                <strong>{hero.name}</strong>
                <small>
                  {unavailable(hero.code) ??
                    `${hero.threat} threat · ${hero.sphere_code}`}
                </small>
                {value === hero.code && <Check size={17} />}
              </button>
              <button
                className="hero-inspect"
                onClick={() => inspect(hero)}
                title={plain(hero.text)}
              >
                Inspect {hero.name}
              </button>
            </div>
          ))}
        </div>
      )}
    </fieldset>
  );
}
