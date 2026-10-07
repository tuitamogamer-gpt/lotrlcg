import { startingThreat } from "../game/decks";
import { Fragment, useState } from "react";
import {
  Check,
  Eye,
  Stack,
  Crown,
  Sword,
  Feather,
  Leaf,
} from "@phosphor-icons/react";
import { card, imageUrl, plain } from "../game/cards";
import { BUILT_IN_DECKS } from "../game/built-in-decks";
import type { Card } from "../game/types";
import { customId, deckProblems, deckSize } from "../game/decks";
import type { CustomDeck } from "../game/decks";
import { CardProductNote, DeckProductNote } from "./product-note";

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
    ...BUILT_IN_DECKS.map((d) => ({ ...d, custom: false })),
    ...custom.map((d) => ({
      id: customId(d),
      name: d.name,
      subtitle: "Custom deck",
      description: d.source
        ? "Imported deck list using supported cards."
        : "Assembled in the deck builder.",
      heroes: d.heroes,
      cards: d.cards,
      source: d.source,
      productId: d.productId,
      deckKind: d.deckKind ?? "custom",
      group: "custom" as const,
      custom: true,
    })),
  ];
  return (
    <div
      className={`deck-picker ${compact ? "deck-picker-compact" : ""}`}
      role="group"
      aria-label={label}
    >
      {choices.map((d, i) => {
        const Icon = d.custom
          ? Stack
          : (icons[d.id as keyof typeof icons] ?? Stack);
        const selected = d.id === value;
        const count = deckSize(d.cards);
        const blocked =
          unavailable[d.id] ?? (d.custom ? deckProblems(d)[0] : undefined);
        const choiceName = d.custom || d.deckKind ? d.name : d.subtitle;
        return (
          <Fragment key={d.id}>
            {(i === 0 || choices[i - 1].group !== d.group) && (
              <h4 className="deck-picker-group">
                {
                  {
                    core: "Core Set · 30-card learning decks",
                    starter: "Starter Decks · 50-card precons",
                    collector: "Collector’s Edition · 50-card precons",
                    custom: "Your saved decks",
                  }[d.group]
                }
              </h4>
            )}
            <article
              data-deck-id={d.id}
              className={`deck-choice sphere-${d.custom ? "custom" : d.id} ${selected ? "is-selected" : ""} ${blocked ? "is-unavailable" : ""}`}
            >
              <button
                className="deck-choice-select"
                aria-label={`Choose ${choiceName}`}
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
                <DeckProductNote deck={d} compact={compact} brief />
                {showHeroes && (
                  <span className="deck-hero-triptych">
                    {d.heroes.map((code) => (
                      <span key={code}>
                        <img src={imageUrl(card(code))} alt="" loading="lazy" />
                        <strong>{card(code).name}</strong>
                        <CardProductNote c={card(code)} />
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
                      <Eye size={15} /> {startingThreat(d.heroes)} threat
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
                  aria-label={`View ${choiceName} deck and heroes`}
                >
                  View deck & heroes <Eye size={15} />
                </button>
              )}
            </article>
          </Fragment>
        );
      })}
      {onBuild && (
        <Fragment>
          {!custom.length && (
            <h4 className="deck-picker-group">Build your own fellowship</h4>
          )}
          <article className="deck-choice deck-choice-build">
            <button className="deck-choice-select" onClick={onBuild}>
              <span className="deck-choice-top">
                <span>
                  <Stack size={19} /> Custom
                </span>
              </span>
              <h3>Build your own deck</h3>
              <span className="deck-product-note" data-deck-origin="custom">
                <strong>Custom deck · Supported play pool</strong>
                <small>Choose cards from the supported play pool.</small>
              </span>
              {!compact && (
                <p>
                  At least fifty supported cards of your choice, or a RingsDB
                  decklist.
                </p>
              )}
              <span className="deck-choice-state">Open the deck builder</span>
            </button>
          </article>
        </Fragment>
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
          <CardProductNote c={selected} />
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
              data-card-code={hero.code}
            >
              <button
                aria-label={`Choose ${hero.name}`}
                aria-description={`${hero.sphere_code} · ${hero.pack_name}`}
                aria-pressed={value === hero.code}
                disabled={!!unavailable(hero.code)}
                onClick={() => {
                  onChange(hero.code);
                  setExpanded(false);
                }}
              >
                <img src={imageUrl(hero)} alt="" loading="lazy" />
                <strong>{hero.name}</strong>
                <CardProductNote c={hero} />
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
