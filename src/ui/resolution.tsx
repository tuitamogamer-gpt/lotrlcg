import { useEffect, useRef } from "react";
import {
  ArrowRight,
  Check,
  CaretDown,
  Compass,
  Eye,
  Leaf,
  Moon,
  Pause,
  Scroll,
  Shield,
  Sparkle,
  Sword,
} from "@phosphor-icons/react";
import { card, imageUrl } from "../game/cards";
import { SCENARIOS } from "../game/scenarios";
import { nextResolutionLabel, phaseLabel } from "../game/presentation";
import { seatName } from "../game/table";
import type { Card, GameState, ResolutionStep } from "../game/types";
import { CardBack } from "./tabletop";

const plain = (text?: string) =>
  (text ?? "").replace(/<[^>]*>/g, "").replace(/\[([^\]]+)\]/g, "$1");

const eventIdentity = {
  phase: { label: "The journey continues", icon: Compass },
  reveal: { label: "Encounter revealed", icon: Eye },
  shadow: { label: "From the shadows", icon: Moon },
  combat: { label: "The clash of steel", icon: Sword },
  quest: { label: "The fate of the quest", icon: Compass },
  round: { label: "A new round", icon: Leaf },
  setup: { label: "An adventure begins", icon: Compass },
  action: { label: "A moment in your journey", icon: Sparkle },
  effect: { label: "The story unfolds", icon: Scroll },
} satisfies Record<ResolutionStep["kind"], { label: string; icon: typeof Eye }>;

const journeyPhases = [
  "Resource",
  "Planning",
  "Quest",
  "Travel",
  "Engagement",
  "Combat",
  "Refresh",
];
const journeyIndex: Record<GameState["phase"], number> = {
  setup: -1,
  resource: 0,
  planning: 1,
  quest: 2,
  staging: 2,
  travel: 3,
  encounter: 4,
  defense: 5,
  attack: 5,
  refresh: 6,
};

function PhaseJourney({ step }: { step: ResolutionStep }) {
  const current = journeyIndex[step.phase];
  if (current < 0) return null;
  return (
    <ol className="event-phase-journey" aria-label="Round phases">
      {journeyPhases.map((label, i) => (
        <li
          key={label}
          className={i < current ? "is-complete" : ""}
          aria-current={i === current ? "step" : undefined}
        >
          <span aria-hidden="true">
            {i < current ? <Check size={11} /> : <i />}
          </span>
          <small>{label}</small>
        </li>
      ))}
    </ol>
  );
}
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
  const hasCardSummary =
    !isReveal && !combat && otherCards.length > 0 && step.changes.length > 0;
  const phaseChange =
    step.kind === "phase"
      ? step.changes.find((change) => change.label === "Phase")
      : undefined;
  const changes = step.changes.filter((change) => change !== phaseChange);
  // The latest rules line is often also the event description. Show it once.
  const lines = step.lines.filter(
    (line) => plain(line.text) !== plain(step.detail),
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
          <span className={`reveal-card-face ${animate ? "is-revealing" : ""}`}>
            <span className="reveal-card-back" aria-hidden="true">
              <CardBack encounter />
            </span>
            <img
              src={imageUrl(card(featured.code))}
              alt={card(featured.code).name}
              width={424}
              height={600}
            />
          </span>
          <span>
            <Eye size={14} /> Open full card
          </span>
        </button>
      )}
      <div
        className={`resolution-explanation${hasCardSummary ? " with-card-summary" : ""}`}
      >
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
        {phaseChange && (
          <div className="event-phase-transition" aria-label="Phase change">
            <div>
              <small>Completed</small>
              <span>{phaseChange.before}</span>
            </div>
            <span className="event-transition-arrow" aria-hidden="true">
              <ArrowRight size={22} weight="light" />
            </span>
            <div>
              <small>Up next</small>
              <strong>{phaseChange.after}</strong>
            </div>
          </div>
        )}
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
        {changes.length > 0 && (
          <section className="resolution-changes" aria-label="What changed">
            <h3>
              <Sparkle size={15} weight="light" /> What changed{" "}
              <span>{changes.length}</span>
            </h3>
            <dl>
              {changes.map((c, i) => (
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
        {lines.length > 0 && (
          <div className="resolution-lines" aria-label="Event details">
            {lines.map((l) => (
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
  const identity = eventIdentity[step.kind];
  const EventIcon = identity.icon;
  const scenic = step.kind === "phase";
  const scenario =
    SCENARIOS.find((item) => item.id === s.scenarioId) ?? SCENARIOS[0];
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
      } ${scenic ? "resolution-scenic" : ""}`}
      aria-labelledby="resolution-title"
      data-resolution-kind={step.kind}
      aria-describedby="resolution-pause-note"
      onCancel={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (!["Enter", " "].includes(e.key)) return;
        // A held key never advances; one deliberate press confirms once.
        if (e.repeat) {
          e.preventDefault();
          return;
        }
        if (
          e.target instanceof Element &&
          e.target.closest("button, a, input, select, textarea")
        )
          return;
        e.preventDefault();
        continueGame(step.id);
      }}
    >
      <header className="resolution-header">
        <span className="resolution-kicker">
          <Pause size={12} weight="fill" /> Game paused
        </span>
        <span className="event-reference">
          Event {String(step.id).padStart(2, "0")}
        </span>
        <button
          onClick={viewTable}
          aria-label="Inspect table while paused"
          title="Inspect table while paused"
        >
          <Eye size={17} weight="light" /> Inspect table
        </button>
      </header>
      <div className="resolution-body" key={step.id}>
        {scenic && (
          <aside
            className={`event-landscape event-landscape-${scenario.id}`}
            aria-label={scenario.name}
          >
            <span className="event-landscape-round">
              {step.round
                ? `Round ${String(step.round).padStart(2, "0")}`
                : "Prologue"}
            </span>
            <div className="event-seal" aria-hidden="true">
              <Compass size={52} weight="light" />
            </div>
            <div className="event-landscape-caption">
              <span>Your adventure</span>
              <strong>{scenario.name}</strong>
              <i>{scenario.tagline}</i>
            </div>
          </aside>
        )}
        <section className="event-reading">
          <div className="event-heading">
            <span className="event-heading-symbol" aria-hidden="true">
              <EventIcon size={25} weight="light" />
            </span>
            <div>
              <p className="event-eyebrow">{identity.label}</p>
              <h2 id="resolution-title" tabIndex={-1} ref={titleRef}>
                {step.title.replace(/^Next phase · /, "")}
              </h2>
            </div>
          </div>
          <p className="event-context">
            {step.round ? `Round ${step.round}` : "Setup"}
            {!scenic && (
              <>
                {" "}
                <span>·</span> {phaseLabel[step.phase]}
              </>
            )}
            {s.table && (
              <>
                {" "}
                <span>·</span> {seatName(s, step.player)}
              </>
            )}
          </p>
          <ResolutionContent s={s} step={step} inspect={inspect} animate />
          {scenic && <PhaseJourney step={step} />}
        </section>
      </div>
      <footer className="resolution-footer">
        <div>
          <button className="text-link" onClick={openLog}>
            <Scroll size={18} weight="light" /> Review earlier events
          </button>
          <p id="resolution-pause-note">
            Nothing advances until you continue. Enter also continues.
          </p>
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
          <span className="event-continue-arrow" aria-hidden="true">
            <ArrowRight size={21} weight="light" />
          </span>
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
      <div className="chronicle-intro">
        <span className="chronicle-seal">
          <Scroll size={30} weight="light" />
        </span>
        <div>
          <p className="event-eyebrow">The story so far</p>
          <p>Every encounter. Every turning point.</p>
          <small>
            Revisit up to 80 events. Your adventure stays right where you left
            it.
          </small>
        </div>
        <span className="chronicle-count">
          <strong>{s.flow?.history.length ?? 0}</strong> events
        </span>
      </div>
      <div className="chronicle-timeline">
        {[...(s.flow?.history ?? [])].reverse().map((step) => {
          const EventIcon = eventIdentity[step.kind].icon;
          return (
            <details
              key={step.id}
              className={`chronicle-event event-${step.kind}`}
            >
              <summary>
                <span className="event-number">
                  <EventIcon size={20} weight="light" />
                </span>
                <span>
                  <strong>{step.title}</strong>
                  <small>
                    Event {String(step.id).padStart(2, "0")} ·{" "}
                    {step.round ? `Round ${step.round}` : "Setup"} ·{" "}
                    {phaseLabel[step.phase]}
                  </small>
                </span>
                {s.flow?.pending?.id === step.id && (
                  <span className="chronicle-current">Current</span>
                )}
                <CaretDown className="chronicle-chevron" size={16} />
              </summary>
              <ResolutionContent s={s} step={step} inspect={inspect} />
            </details>
          );
        })}
      </div>
    </div>
  );
}
