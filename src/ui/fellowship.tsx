import { useEffect, useRef } from "react";
import {
  Crown,
  Eye,
  Stack,
  Cards,
  Coins,
  Check,
  ArrowRight,
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
  inspect,
}: {
  mode: "classic" | "hotseat";
  changeMode: (mode: "classic" | "hotseat") => void;
  seats: SeatConfig[];
  setSeats: (seats: SeatConfig[]) => void;
  inspect: (deckId: string) => void;
}) {
  return (
    <section className="fellowship-builder" aria-label="Fellowship setup">
      <div className="builder-heading">
        <div>
          <span className="book-kicker">I · ASSEMBLE YOUR COMPANY</span>
          <h2>Three heroes. One fellowship per player.</h2>
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
              Classic solo<small>One player · three heroes</small>
            </span>
          </button>
        </div>
      </div>
      {mode === "hotseat" ? (
        <>
          <div className="company-options">
            <p>
              Each player has three heroes, one deck, one hand, and one threat
              dial. You control every player.
            </p>
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
                  onClick={() => {
                    const next = seats.slice(0, n);
                    for (const d of STARTERS)
                      if (
                        next.length < n &&
                        !next.some((p) => p.deckId === d.id)
                      )
                        next.push({ heroes: [...d.heroes], deckId: d.id });
                    setSeats(next);
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className={`hero-selections players-${seats.length}`}>
            {seats.map((p, i) => {
              const d = STARTERS.find((d) => d.id === p.deckId)!;
              const threat = p.heroes.reduce(
                (n, h) => n + (card(h).threat ?? 0),
                0,
              );
              return (
                <article className={`hero-selection sphere-${d.id}`} key={i}>
                  <div className="hero-selection-body">
                    <label htmlFor={`seat-deck-${i}`}>PLAYER {i + 1}</label>
                    <select
                      id={`seat-deck-${i}`}
                      aria-label={`Player ${i + 1} starter deck`}
                      value={p.deckId}
                      onChange={(e) => {
                        const next = STARTERS.find(
                          (d) => d.id === e.target.value,
                        )!;
                        setSeats(
                          seats.map((old, j) =>
                            j === i
                              ? { heroes: [...next.heroes], deckId: next.id }
                              : old,
                          ),
                        );
                      }}
                    >
                      {STARTERS.map((d) => (
                        <option
                          value={d.id}
                          key={d.id}
                          disabled={seats.some(
                            (x, j) => j !== i && x.deckId === d.id,
                          )}
                        >
                          {d.subtitle} · {d.name}
                        </option>
                      ))}
                    </select>
                    <div
                      className="starter-heroes"
                      aria-label={`Player ${i + 1} starting heroes`}
                    >
                      {p.heroes.map((hero) => (
                        <div key={hero}>
                          <img
                            src={imageUrl(card(hero))}
                            alt={card(hero).name}
                          />
                          <span>{card(hero).name}</span>
                        </div>
                      ))}
                    </div>
                    <div className="hero-deck-info">
                      <span>
                        <Eye size={13} /> {threat} starting threat
                      </span>
                      <span>3 heroes · 30 player cards</span>
                    </div>
                    <button
                      className="deck-preview-link"
                      onClick={() => inspect(d.id)}
                    >
                      <Stack size={14} /> View starter deck{" "}
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <p className="company-note">
            <Check size={14} /> {seats.length}{" "}
            {seats.length === 1 ? "player" : "players"} · {seats.length * 3}{" "}
            heroes total. The table guides you from one player to the next. Each
            hero can appear only once.
          </p>
        </>
      ) : (
        <p className="classic-note">
          The original learning game: three heroes, one 30-card starter deck,
          and one threat dial. Choose your sphere below.
        </p>
      )}
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
