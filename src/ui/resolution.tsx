import { useEffect, useRef } from "react";
import {
  ArrowRight,
  Eye,
  Pause,
  Scroll,
  Shield,
  Sparkle,
  Sword,
} from "@phosphor-icons/react";
import { card, imageUrl } from "../game/cards";
import { nextResolutionLabel, phaseLabel } from "../game/presentation";
import { seatName } from "../game/table";
import type { Card, GameState, ResolutionStep } from "../game/types";

const plain = (text?: string) =>
  (text ?? "").replace(/<[^>]*>/g, "").replace(/\[([^\]]+)\]/g, "$1");
export function ResolutionContent({
  s,
  step,
  inspect,
  animate = false,
}: {
  s: GameState;
  step: ResolutionStep;
  inspect: (c: Card) => void;
  animate?: boolean;
}) {
  const featured = step.cards[0];
  const isReveal = step.kind === "reveal" || step.kind === "shadow";
  const attackers = step.cards.filter((c) => c.label === "Attacker");
  const targets = step.cards.filter(
    (c) => c.label === "Defender" || c.label === "Target",
  );
  const combat =
    step.kind === "combat" && attackers.length > 0 && targets.length > 0;
  const combatCodes = combat
    ? [...attackers, ...targets].map((c) => c.code)
    : [];
  const otherCards = (isReveal ? step.cards.slice(1) : step.cards).filter(
    (c) => !combatCodes.includes(c.code),
  );
  return (
    <div
      className={`resolution-content ${isReveal && featured ? "with-featured-card" : ""}`}
    >
      {isReveal && featured && (
        <button
          className="resolution-card"
          onClick={() => inspect(card(featured.code))}
          aria-label={`Inspect ${card(featured.code).name}`}
        >
          <img
            src={imageUrl(card(featured.code))}
            alt={card(featured.code).name}
            width={424}
            height={600}
          />
          <span>
            <Eye size={14} /> Open full card
          </span>
        </button>
      )}
      <div className="resolution-explanation">
        {combat && (
          <div
            key={step.id}
            className={`combat-scene ${animate ? "combat-animated" : ""}`}
            aria-label="Resolved attack"
          >
            <div className="combat-side combat-strikers">
              <h3>Attacking</h3>
              <div>
                {attackers.map((c, i) => (
                  <button
                    key={`${c.code}-${i}`}
                    onClick={() => inspect(card(c.code))}
                  >
                    <img
                      src={imageUrl(card(c.code))}
                      alt={card(c.code).name}
                      width={424}
                      height={600}
                    />
                    <strong>{card(c.code).name}</strong>
                  </button>
                ))}
              </div>
            </div>
            <div className="combat-impact" aria-hidden="true">
              <Sword size={30} />
              <ArrowRight size={22} />
            </div>
            <div className="combat-side combat-receivers">
              <h3>
                {targets[0].label === "Defender" ? "Defending" : "Target"}
              </h3>
              <div>
                {targets.map((c, i) => (
                  <button
                    key={`${c.code}-${i}`}
                    onClick={() => inspect(card(c.code))}
                  >
                    <img
                      src={imageUrl(card(c.code))}
                      alt={card(c.code).name}
                      width={424}
                      height={600}
                    />
                    <strong>{card(c.code).name}</strong>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        <p className="resolution-detail">{plain(step.detail)}</p>
        {isReveal && featured && (
          <section className="resolution-rules">
            <h3>
              {step.kind === "shadow" ? (
                <Shield size={16} />
              ) : (
                <Sparkle size={16} />
              )}
              {step.kind === "shadow" ? "Shadow text" : "Encounter text"}
            </h3>
            <p>
              {plain(
                step.kind === "shadow"
                  ? card(featured.code).shadow
                  : card(featured.code).text,
              ) ||
                (step.kind === "shadow"
                  ? "No shadow effect."
                  : "No additional card effects.")}
            </p>
          </section>
        )}
        {otherCards.length > 0 && (
          <div className="resolution-cards">
            {otherCards.map((c, i) => (
              <button
                key={`${c.code}-${i}`}
                onClick={() => inspect(card(c.code))}
              >
                <img
                  src={imageUrl(card(c.code))}
                  alt={card(c.code).name}
                  width={424}
                  height={600}
                />
                <span>
                  <strong>{card(c.code).name}</strong>
                  <small>{c.label}</small>
                </span>
                <Eye size={14} />
              </button>
            ))}
          </div>
        )}
        {step.changes.length > 0 && (
          <section className="resolution-changes" aria-label="What changed">
            <h3>What changed</h3>
            <dl>
              {step.changes.map((c, i) => (
                <div key={`${c.label}-${i}`}>
                  <dt>
                    {c.code ? (
                      <button onClick={() => inspect(card(c.code!))}>
                        {c.label}
                      </button>
                    ) : (
                      c.label
                    )}
                  </dt>
                  <dd>
                    <span>{c.before}</span>
                    <ArrowRight size={13} />
                    <strong>{c.after}</strong>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        {step.lines.length > 0 && (
          <div className="resolution-lines" aria-label="Event details">
            {step.lines.map((l) => (
              <p className={l.kind} key={l.id}>
                {s.table && l.player !== undefined && s.table.seats[l.player]
                  ? `${seatName(s, l.player)} · `
                  : ""}
                {plain(l.text)}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
export function ResolutionDialog({
  s,
  inspect,
  continueGame,
  viewTable,
  openLog,
}: {
  s: GameState;
  inspect: (c: Card) => void;
  continueGame: (id: number) => void;
  viewTable: () => void;
  openLog: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleRef = useRef<HTMLHeadingElement>(null),
    step = s.flow!.pending!;
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
    ref.current?.querySelector(".resolution-body")?.scrollTo(0, 0);
  }, [step.id]);
  return (
    <dialog
      ref={ref}
      className={`resolution-dialog ${
        (step.kind === "reveal" || step.kind === "shadow") && step.cards.length
          ? "resolution-with-card"
          : step.cards.length > 1 || step.changes.length > 7
            ? "resolution-summary"
            : "resolution-brief"
      }`}
      aria-labelledby="resolution-title"
      aria-describedby="resolution-pause-note"
      onCancel={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.repeat && ["Enter", " "].includes(e.key)) e.preventDefault();
      }}
    >
      <header className="resolution-header">
        <span className="resolution-kicker">
          <Pause size={14} weight="fill" /> GAME PAUSED · EVENT {step.id}
        </span>
        <div>
          <span>
            {step.round ? `Round ${step.round}` : "Setup"} ·{" "}
            {phaseLabel[step.phase]}
            {s.table ? ` · ${seatName(s, step.player)}` : ""}
          </span>
          <button
            onClick={viewTable}
            aria-label="Inspect table while paused"
            title="Inspect table while paused"
          >
            <Eye size={16} /> Inspect table
          </button>
        </div>
      </header>
      <div className="resolution-body">
        <h2 id="resolution-title" tabIndex={-1} ref={titleRef}>
          {step.title}
        </h2>
        <ResolutionContent s={s} step={step} inspect={inspect} animate />
      </div>
      <footer className="resolution-footer">
        <div>
          <p id="resolution-pause-note">
            <Pause size={13} /> Nothing advances until you continue.
          </p>
          <button className="text-link" onClick={openLog}>
            <Scroll size={15} /> Review earlier events
          </button>
        </div>
        <button
          className="primary resolution-continue"
          onClick={(e) => {
            if (e.detail < 2) continueGame(step.id);
          }}
        >
          <span>
            Continue<small>{nextResolutionLabel(s)}</small>
          </span>
          <ArrowRight size={20} />
        </button>
      </footer>
    </dialog>
  );
}
export function ResolutionChronicle({
  s,
  inspect,
}: {
  s: GameState;
  inspect: (c: Card) => void;
}) {
  return (
    <div className="resolution-chronicle">
      <p>
        Review the last 80 revealed cards and resolved events. Opening an event
        never advances the game.
      </p>
      {[...(s.flow?.history ?? [])].reverse().map((step) => (
        <details key={step.id}>
          <summary>
            <span className={`event-number event-${step.kind}`}>{step.id}</span>
            <span>
              <strong>{step.title}</strong>
              <small>
                {step.round ? `Round ${step.round}` : "Setup"} ·{" "}
                {phaseLabel[step.phase]}
              </small>
            </span>
            <Eye size={15} />
          </summary>
          <ResolutionContent s={s} step={step} inspect={inspect} />
        </details>
      ))}
    </div>
  );
}
