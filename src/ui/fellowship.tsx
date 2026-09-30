import { useEffect, useRef, useState } from "react";
import {
  Crown,
  Eye,
  Stack,
  Cards,
  Coins,
  Check,
  UsersThree,
  Sword,
} from "@phosphor-icons/react";
import { card, imageUrl, STARTERS } from "../game/cards";
import type { Action, GameState, SeatConfig } from "../game/types";
import {
  activeSeat,
  allCharacters,
  playerOrder,
  ownerOf,
  seatIndices,
  seatName,
  seatView,
} from "../game/table";

import { DeckPicker } from "./deck-picker";
import { describeDeck } from "../game/decks";
import type { CustomDeck } from "../game/decks";
import { expandSeats } from "./setup-decks";

import { availableAbilities } from "../game/engine";

// New games always use complete starters. Existing saves keep their original heroes.
export function starterSeats(saved?: { deckId: string }[]): SeatConfig[] {
  const used = new Set<string>();
  return (saved ?? [{ deckId: "leadership" }]).map((p) => {
    const d =
      STARTERS.find((d) => d.id === p.deckId && !used.has(d.id)) ??
      STARTERS.find((d) => !used.has(d.id))!;
    used.add(d.id);
    return { heroes: [...d.heroes], deckId: d.id };
  });
}
export const DEFAULT_SEATS = starterSeats();
export function FellowshipSetup({
  mode,
  changeMode,
  seats,
  setSeats,
  selectedDeck,
  selectDeck,
  inspect,
  decks = [],
  onBuild,
}: {
  mode: "classic" | "hotseat";
  changeMode: (mode: "classic" | "hotseat") => void;
  seats: SeatConfig[];
  setSeats: (seats: SeatConfig[]) => void;
  selectedDeck: string;
  selectDeck: (id: string) => void;
  inspect: (deckId: string) => void;
  decks?: CustomDeck[];
  onBuild?: () => void;
}) {
  const [editingSeat, setEditingSeat] = useState(0);
  const active = Math.min(editingSeat, seats.length - 1);
  const unavailable =
    mode === "hotseat"
      ? Object.fromEntries(
          [
            ...STARTERS.map((d) => d.id),
            ...decks.map((d) => `custom:${d.id}`),
          ].flatMap((id) => {
            const d = describeDeck(id, decks)!;
            const other = seats.findIndex(
              (p, i) =>
                i !== active && p.heroes.some((h) => d.heroes.includes(h)),
            );
            return other < 0
              ? []
              : [[id, `Shares a hero with Player ${other + 1}`]];
          }),
        )
      : {};
  return (
    <section
      id="fellowship-setup"
      className="fellowship-builder"
      aria-label="Fellowship setup"
      tabIndex={-1}
    >
      <div className="builder-heading">
        <div>
          <span className="book-kicker">I · ASSEMBLE YOUR COMPANY</span>
          <h2>Choose the heroes of your story.</h2>
        </div>
        <div className="play-style" role="group" aria-label="Deck arrangement">
          <button
            aria-pressed={mode === "hotseat"}
            onClick={() => changeMode("hotseat")}
          >
            <UsersThree size={18} />
            <span>
              Solo hot-seat<small>You control 1–4 players</small>
            </span>
          </button>
          <button
            aria-pressed={mode === "classic"}
            onClick={() => changeMode("classic")}
          >
            <Cards size={18} />
            <span>
              Classic solo<small>One player · one fellowship</small>
            </span>
          </button>
        </div>
      </div>
      <div className="company-options">
        <p>
          Each starter includes the three heroes shown and its original 30-card
          deck. Select a complete fellowship, then inspect any card.
        </p>
        {mode === "hotseat" && (
          <div
            className="hero-count"
            role="group"
            aria-label="Number of players"
          >
            <span>PLAYERS</span>
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                aria-pressed={seats.length === n}
                aria-label={`${n} ${n === 1 ? "player" : "players"}`}
                disabled={!expandSeats(seats, n, decks)}
                onClick={() => {
                  const next = expandSeats(seats, n, decks);
                  if (next) setSeats(next);
                }}
              >
                {n}
              </button>
            ))}
          </div>
        )}
      </div>
      {mode === "hotseat" && (
        <div
          className="setup-seats"
          role="group"
          aria-label="Choose player to edit"
        >
          {seats.map((p, i) => {
            const d = describeDeck(p.deckId, decks) ?? {
              subtitle: "Missing deck",
            };
            return (
              <button
                key={i}
                aria-pressed={active === i}
                aria-label={`Edit Player ${i + 1} fellowship`}
                onClick={() => setEditingSeat(i)}
              >
                <span className="setup-seat-number">{i + 1}</span>
                <span>
                  <small>
                    PLAYER {i + 1}
                    {active === i ? " · CHOOSING" : ""}
                  </small>
                  <strong>{d.subtitle}</strong>
                  <span>{p.heroes.map((h) => card(h).name).join(" · ")}</span>
                </span>
                {active === i && <Check size={17} />}
              </button>
            );
          })}
        </div>
      )}
      <div className="deck-picker-heading">
        <h3>
          {mode === "hotseat"
            ? `Player ${active + 1} · Choose a fellowship`
            : "Four fellowships. Four ways to play."}
        </h3>
        <span>CORE SET · ALL CARDS SCRIPTED</span>
      </div>
      <DeckPicker
        value={mode === "hotseat" ? seats[active].deckId : selectedDeck}
        onChange={(id) => {
          if (mode === "classic") selectDeck(id);
          else
            setSeats(
              seats.map((p, i) =>
                i === active
                  ? {
                      deckId: id,
                      heroes: [...(describeDeck(id, decks)?.heroes ?? [])],
                    }
                  : p,
              ),
            );
        }}
        unavailable={unavailable}
        inspect={inspect}
        custom={decks}
        onBuild={onBuild}
      />
      <p className="company-note">
        <Check size={15} />
        {mode === "hotseat"
          ? `${seats.length} ${seats.length === 1 ? "player" : "players"} · ${seats.reduce((n, p) => n + p.heroes.length, 0)} heroes · one deck per player. Each hero can appear only once.`
          : `One player · ${describeDeck(selectedDeck, decks)?.heroes.length ?? 3} heroes · one deck. Your selected heroes begin in play.`}
      </p>
    </section>
  );
}
export function FellowshipSeats({
  s,
  dispatch,
}: {
  s: GameState;
  dispatch: (action: Action) => unknown;
}) {
  const tabs = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = tabs.current?.querySelector<HTMLElement>(".seat-tab.selected");
    if (tabs.current && el)
      tabs.current.scrollTo({
        left: el.offsetLeft - tabs.current.offsetLeft,
        behavior: "instant",
      });
  }, [s.table?.active]);
  if (!s.table) return null;
  return (
    <section className="fellowship-seats" aria-label="Player seats">
      <div className="seat-section-heading">
        <span>
          <UsersThree size={17} /> THE COMPANY
        </span>
        <small>Switch players to manage their fellowships</small>
      </div>
      <div
        ref={tabs}
        className="seat-tabs"
        role="group"
        aria-label="Switch active player"
      >
        {seatIndices(s).map((i) => {
          const p = seatView(s, i),
            code = p.startingHeroes[0],
            gone = s.table!.seats[i].eliminated;
          return (
            <button
              key={i}
              className={`seat-tab ${activeSeat(s) === i ? "selected" : ""} ${gone ? "eliminated" : ""}`}
              aria-pressed={activeSeat(s) === i}
              aria-label={`Control ${seatName(s, i)}`}
              aria-keyshortcuts={String(i + 1)}
              title={`Control ${seatName(s, i)} · ${i + 1}`}
              disabled={!!s.choice && activeSeat(s) !== i}
              onClick={() => dispatch({ type: "SELECT_SEAT", seat: i })}
            >
              <div className="seat-portrait">
                <img src={imageUrl(card(code))} alt="" />
                {s.table!.first === i && (
                  <Crown
                    className="first-player-crown"
                    weight="fill"
                    size={16}
                    aria-label="First player"
                  />
                )}
              </div>
              <div className="seat-information">
                <span className="seat-eyebrow">
                  {gone
                    ? "ELIMINATED"
                    : activeSeat(s) === i
                      ? "IN YOUR HANDS"
                      : s.table!.passed.includes(i)
                        ? "TURN COMPLETE"
                        : s.table!.turn === i
                          ? "AWAITING YOUR TURN"
                          : `FELLOWSHIP ${i + 1}`}
                </span>
                <strong>
                  Player {i + 1} · {seatName(s, i)}
                </strong>
                <div className="seat-counts">
                  <span title="Cards in hand">
                    <Cards size={13} /> {p.hand.length}
                  </span>
                  <span title="Cards in deck">
                    <Stack size={13} /> {p.deck.length}
                  </span>
                  <span title="Resources">
                    <Coins size={13} />{" "}
                    {p.heroes.reduce((n, h) => n + h.resources, 0)}
                  </span>
                  {p.engaged.length > 0 && (
                    <span title="Engaged enemies">
                      <Sword size={13} /> {p.engaged.length}
                    </span>
                  )}
                </div>
              </div>
              <div className="seat-threat">
                <Eye size={15} />
                <strong>{p.threat}</strong>
                <small>THREAT</small>
              </div>
            </button>
          );
        })}
      </div>
      <div className="company-status">
        <span>
          {s.choice
            ? `${seatName(s, activeSeat(s))} · Resolve the decision below`
            : `${seatName(s, s.table.turn)} · ${s.phase === "setup" ? "Choose an opening hand" : "Next in the turn order"}`}
        </span>
        <span>
          {allCharacters(s).filter((u) => u.committed).length} questing ·{" "}
          {playerOrder(s).length} active{" "}
          {playerOrder(s).length === 1 ? "deck" : "decks"}
        </span>
      </div>
    </section>
  );
}

export function CooperativeActions({
  s,
  dispatch,
}: {
  s: GameState;
  dispatch: (action: Action) => unknown;
}) {
  if (!s.table || s.phase === "setup") return null;
  const eowyn = allCharacters(s).find(
    (u) => u.code === "01007" && ownerOf(s, u) !== activeSeat(s),
  );
  const borrowed = allCharacters(s)
    .filter((u) => ownerOf(s, u) !== activeSeat(s))
    .flatMap((u) =>
      availableAbilities(s, u)
        .filter((a) => a.id)
        .map((a) => ({ u, a })),
    );
  if (!eowyn && !borrowed.length) return null;
  return (
    <div className="cooperative-section">
      <h3>Help the company</h3>
      <div className="cooperative-actions">
        {eowyn && (
          <button
            disabled={
              !!s.choice ||
              !!s.flow?.pending ||
              s.eowynUsed ||
              !s.hand.length ||
              s.status !== "playing" ||
              s.table.seats[activeSeat(s)].eliminated
            }
            onClick={() => dispatch({ type: "ABILITY", id: eowyn.id })}
          >
            Support Éowyn · Discard 1 for +1 willpower
          </button>
        )}
        {borrowed.map(({ u, a }) => (
          <button
            key={a.id}
            disabled={
              a.disabled ||
              !!s.choice ||
              !!s.flow?.pending ||
              s.status !== "playing" ||
              s.table!.seats[activeSeat(s)].eliminated
            }
            onClick={() =>
              dispatch({ type: "ABILITY", id: u.id, attachmentId: a.id })
            }
          >
            {a.label} · {card(u.code).name}
          </button>
        ))}
      </div>
    </div>
  );
}
