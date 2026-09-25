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
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
  unavailable?: Record<string, string>;
  inspect?: (id: string) => void;
  compact?: boolean;
  showHeroes?: boolean;
}) {
  return (
    <div
      className={`deck-picker ${compact ? "deck-picker-compact" : ""}`}
      role="group"
      aria-label={label}
    >
      {STARTERS.map((d) => {
        const Icon = icons[d.id as keyof typeof icons];
        const selected = d.id === value;
        const count = Object.values(d.cards).reduce((n, v) => n + v, 0);
        return (
          <article
            key={d.id}
            className={`deck-choice sphere-${d.id} ${selected ? "is-selected" : ""} ${unavailable[d.id] ? "is-unavailable" : ""}`}
          >
            <button
              className="deck-choice-select"
              aria-label={`Choose ${d.subtitle}`}
              aria-pressed={selected}
              disabled={!!unavailable[d.id]}
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
                  {showHeroes ? " · 3 heroes" : ""}
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
                {unavailable[d.id] ??
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
                aria-label={`View ${d.subtitle} deck and heroes`}
              >
                View deck & heroes <Eye size={15} />
              </button>
            )}
          </article>
        );
      })}
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
