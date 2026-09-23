import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  ArrowCounterClockwise,
  Books,
  Check,
  Coins,
  Eye,
  Feather,
  Funnel,
  Pause,
  Shield,
  Stack,
  X,
} from "@phosphor-icons/react";
import { card, name } from "../game/cards";
import {
  canPlay,
  needsTarget,
  playTargets,
  questWill,
  responseCards,
  stagingThreat,
} from "../game/engine";
import {
  activeSeat,
  allHeroes,
  allCharacters,
  allEngaged,
  livingSeats,
  seatName,
} from "../game/table";
import type { Action, GameState, Unit } from "../game/types";

export function playReason(s: GameState, u: Unit): string | null {
  return (
    canPlay(s, u) ??
    (needsTarget(u) && !playTargets(s, u).length
      ? "No eligible target is available."
      : null)
  );
}

export function usePreference<T extends string>(
  key: string,
  initial: T,
  values: readonly T[],
) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(`there-and-back-again.${key}`) as T;
      return values.includes(stored) ? stored : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`there-and-back-again.${key}`, value);
    } catch {
      /* Preferences remain usable in memory. */
    }
  }, [key, value]);
  return [value, setValue] as const;
}
const offTurn = (s: GameState) =>
  s.table &&
  s.table.active !== s.table.turn &&
  ["setup", "planning", "quest", "encounter", "defense", "attack"].includes(
    s.phase,
  );
export const nextAction = (s: GameState): Action | null =>
  s.flow?.pending
    ? null
    : offTurn(s)
      ? { type: "SELECT_SEAT", seat: s.table!.turn }
      : s.choice || s.status !== "playing"
        ? null
        : s.phase === "setup"
          ? { type: "KEEP" }
          : s.phase === "quest"
            ? { type: "COMMIT" }
            : s.phase === "defense"
              ? null
              : s.phase === "attack"
                ? { type: "END_ATTACKS" }
                : { type: "NEXT" };
export const nextLabel = (s: GameState) =>
  offTurn(s)
    ? `Continue as ${seatName(s, s.table!.turn)}`
    : s.table && ["planning", "quest", "encounter", "attack"].includes(s.phase)
      ? {
          planning: "Finish this hero’s planning",
          quest: "Commit this fellowship",
          encounter: "Finish engagement choices",
          attack: "Finish this hero’s attacks",
        }[s.phase as "planning" | "quest" | "encounter" | "attack"]
      : {
          setup: "Keep hand",
          planning: "Begin quest",
          quest: "Commit & reveal",
          staging: "Resolve quest",
          travel: s.activeLocation
            ? "Continue to encounter"
            : "Continue without travel",
          encounter: "Engagement checks",
          defense: "Choose an enemy",
          attack: "Finish combat",
          refresh: "Begin next round",
        }[s.phase];
export function TurnActions({
  s,
  dispatch,
  review,
}: {
  s: GameState;
  dispatch: (a: Action) => unknown;
  review?: () => void;
}) {
  const action = nextAction(s);
  if (s.flow?.pending)
    return (
      <div className="turn-actions resolution-paused">
        <span>
          <Pause size={13} weight="fill" /> WAITING FOR YOU
        </span>
        <strong>{s.flow.pending.title}</strong>
        <p>The table is paused. Read the event before continuing.</p>
        <button className="primary" onClick={review}>
          Review current event <ArrowRight size={17} />
        </button>
      </div>
    );
  if (s.table?.seats[activeSeat(s)].eliminated || offTurn(s))
    return (
      <div className="turn-actions">
        <p>
          {s.table?.seats[activeSeat(s)].eliminated
            ? "This fellowship has been eliminated."
            : "You are viewing another hero’s cards."}
        </p>
        <button
          className="primary"
          disabled={!!s.choice}
          onClick={() => dispatch({ type: "SELECT_SEAT", seat: s.table!.turn })}
        >
          Continue as {seatName(s, s.table!.turn)} <ArrowRight size={18} />
        </button>
      </div>
    );
  const mandatoryTravel =
    s.phase === "travel" &&
    !s.activeLocation &&
    s.staging.some((u) => u.code === "01088");
  return (
    <div className="turn-actions">
      {s.phase === "setup" && (
        <button
          className="secondary mulligan-button"
          disabled={s.mulled || !!s.choice}
          onClick={() => dispatch({ type: "MULLIGAN" })}
        >
          <ArrowCounterClockwise size={16} />
          Mulligan {s.mulled ? "used" : "once"}
        </button>
      )}
      {s.phase === "defense" || mandatoryTravel ? (
        <button
          className="primary"
          onClick={() =>
            document
              .querySelector(
                s.phase === "defense" ? ".engaged-zone" : ".encounter-zone",
              )
              ?.scrollIntoView({
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "instant"
                  : "smooth",
                block: "center",
              })
          }
        >
          {s.phase === "defense" ? (
            <>
              <Shield size={17} />
              Choose an enemy
            </>
          ) : (
            <>
              Travel to The East Bight
              <ArrowRight size={17} />
            </>
          )}
        </button>
      ) : (
        <button
          className="primary"
          disabled={!action}
          onClick={() => action && dispatch(action)}
        >
          {nextLabel(s)}
          <ArrowRight size={18} />
        </button>
      )}
    </div>
  );
}
export function QuestForecast({ s }: { s: GameState }) {
  const will = questWill(s),
    threat = stagingThreat(s),
    net = will - threat;
  const committed = allCharacters(s).filter(
    (u) =>
      u.committed ||
      (s.table
        ? s.table.seats.some((p) => p.committedIds.includes(u.id))
        : s.committedIds.includes(u.id)),
  ).length;
  return (
    <div className="forecast" aria-label="Quest forecast">
      <div className="forecast-numbers">
        <span>
          <Feather size={17} />
          <strong>{will}</strong>
          <small>Willpower</small>
        </span>
        <span className="forecast-vs">vs</span>
        <span>
          <Eye size={17} />
          <strong>{threat}</strong>
          <small>Staging threat</small>
        </span>
      </div>
      <p
        className={
          net > 0 ? "forecast-positive" : net < 0 ? "forecast-negative" : ""
        }
      >
        {net > 0
          ? `+${net} potential progress`
          : net < 0
            ? `+${-net} potential threat`
            : "Willpower matches threat"}
      </p>
      <small>
        {s.phase === "quest"
          ? `${committed} selected · Encounters can change this.`
          : "After available actions, resolve the quest."}
      </small>
    </div>
  );
}
export function Hand({
  s,
  inspect,
  play,
  art,
  onPiles,
}: {
  s: GameState;
  inspect: (u: Unit) => void;
  play: (u: Unit) => void;
  art: (u: Unit) => ReactNode;
  onPiles: () => void;
}) {
  const [sort, setSort] = usePreference("hand-sort", "draw", [
    "draw",
    "cost",
    "name",
    "type",
  ] as const);
  const [onlyPlayable, setOnlyPlayable] = useState(false);
  const playable = s.hand.filter((u) => !playReason(s, u)).length;
  const cards = [...s.hand]
    .filter((u) => !onlyPlayable || !playReason(s, u))
    .sort((a, b) =>
      sort === "cost"
        ? (Number(card(a.code).cost) || 0) - (Number(card(b.code).cost) || 0)
        : sort === "name"
          ? name(a).localeCompare(name(b))
          : sort === "type"
            ? card(a.code).type_code.localeCompare(card(b.code).type_code)
            : 0,
    );
  return (
    <div
      className="hand-zone"
      id="your-hand"
      tabIndex={-1}
      aria-label="Your hand"
    >
      <div className="zone-label">
        <span>
          <Books size={17} />
          {s.table
            ? `${seatName(s, activeSeat(s)).toUpperCase()}’S HAND`
            : "YOUR HAND"}{" "}
          <b>{s.hand.length}</b>
        </span>
        <button className="pile-link" onClick={onPiles}>
          <Stack size={15} />
          {s.deck.length} in deck · {s.discard.length} discarded
        </button>
      </div>
      <div className="hand-toolbar">
        <button
          className="filter-toggle"
          aria-pressed={onlyPlayable}
          onClick={() => setOnlyPlayable(!onlyPlayable)}
        >
          <Funnel size={14} />
          {playable} playable now{onlyPlayable && <X size={12} />}
        </button>
        <label>
          Sort
          <select
            aria-label="Sort hand"
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
          >
            <option value="draw">Draw order</option>
            <option value="cost">Resource cost</option>
            <option value="name">Name</option>
            <option value="type">Card type</option>
          </select>
        </label>
      </div>
      <div className="hand-cards">
        {cards.map((u) => {
          const c = card(u.code),
            reason = playReason(s, u);
          return (
            <div key={u.id} className={`hand-card ${reason ? "" : "playable"}`}>
              <button
                className="hand-art"
                onClick={() => inspect(u)}
                aria-label={`Inspect ${name(u)}`}
              >
                {art(u)}
                <span
                  className={`hand-cost sphere-${c.sphere_code}`}
                  title="Resource cost"
                >
                  {c.cost}
                </span>
              </button>
              <button className="hand-card-title" onClick={() => inspect(u)}>
                {name(u)}
              </button>
              <div className="hand-card-type">
                {c.type_code}
                <span
                  className={`sphere-dot sphere-${c.sphere_code}`}
                  aria-label={c.sphere_code}
                />
              </div>
              <button
                className="hand-play"
                disabled={!!reason}
                title={reason ?? "Play this card"}
                onClick={() => play(u)}
              >
                {responseCards.includes(u.code) ? (
                  <>
                    <Shield size={13} />
                    Response
                  </>
                ) : !reason ? (
                  <>
                    <PlusIcon />
                    Play card
                    <ArrowRight size={13} />
                  </>
                ) : (
                  <>
                    <Coins size={13} />
                    {reason.includes("resource")
                      ? "Need resources"
                      : reason.includes("target")
                        ? "No target yet"
                        : "Inspect timing"}
                  </>
                )}
              </button>
            </div>
          );
        })}
        {!cards.length && (
          <div className="empty-zone hand-empty">
            <Books size={26} />
            <span>
              {onlyPlayable && s.hand.length
                ? "No cards are playable in this action window."
                : "Your hand is empty. Draw a card next round."}
            </span>
            {onlyPlayable && s.hand.length > 0 && (
              <button
                className="text-link"
                onClick={() => setOnlyPlayable(false)}
              >
                Show all cards
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
function PlusIcon() {
  return <span aria-hidden="true">+</span>;
}
export function CardHoverPreview({ enabled }: { enabled: boolean }) {
  const [preview, setPreview] = useState<{
    src: string;
    name: string;
    left: number;
    top: number;
  } | null>(null);
  useEffect(() => {
    if (!enabled) {
      setPreview(null);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      clearTimeout(timer);
      setPreview(null);
    };
    const over = (e: PointerEvent) => {
      if (
        e.pointerType !== "mouse" ||
        innerWidth < 1050 ||
        document.querySelector("dialog[open]")
      )
        return;
      const image = (e.target as Element).closest<HTMLImageElement>(
        "img[data-card-code]",
      );
      if (!image || image.closest(".hero-fan")) return;
      clearTimeout(timer);
      const rect = image.getBoundingClientRect(),
        width = 248,
        height = 420;
      timer = setTimeout(
        () =>
          setPreview({
            src: image.src,
            name: image.alt,
            left:
              rect.right + width + 20 < innerWidth
                ? rect.right + 14
                : Math.max(12, rect.left - width - 14),
            top: Math.max(
              12,
              Math.min(innerHeight - height - 12, rect.top - 40),
            ),
          }),
        350,
      );
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", clear);
    document.addEventListener("scroll", clear, true);
    window.addEventListener("resize", clear);
    document.addEventListener("click", clear);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", clear);
      document.removeEventListener("scroll", clear, true);
      window.removeEventListener("resize", clear);
      document.removeEventListener("click", clear);
    };
  }, [enabled]);
  return preview ? (
    <div
      className="hover-preview"
      aria-hidden="true"
      style={{ left: preview.left, top: preview.top }}
    >
      <img src={preview.src} alt="" />
      <span>
        {preview.name}
        <small>Click to inspect</small>
      </span>
    </div>
  ) : null;
}
export function QuestGoals({ s }: { s: GameState }) {
  const objectives = allHeroes(s)
    .flatMap((h) => h.attachments)
    .filter((a) => ["01108", "01109", "01110"].includes(a.code)).length;
  const goals =
    s.scenarioId === "anduin"
      ? s.stage === 1
        ? [
            {
              label: "Defeat every Hill Troll",
              done: ![...s.staging, ...allEngaged(s)].some(
                (u) => u.code === "01082",
              ),
            },
          ]
        : s.stage === 2
          ? [
              {
                label: `${livingSeats(s).length + 1} encounter reveals each quest phase`,
                done: false,
              },
            ]
          : [
              {
                label: "Defeat every remaining enemy",
                done: ![...s.staging, ...allEngaged(s)].some(
                  (u) => card(u.code).type_code === "enemy",
                ),
              },
            ]
      : s.scenarioId === "dol-guldur"
        ? [
            {
              label: `Objectives claimed · ${objectives}/3`,
              done: objectives === 3,
            },
            { label: "Rescue the prisoner", done: !s.prisoner },
            { label: "Defeat the Nazgûl", done: s.nazgulDefeated },
          ]
        : s.stage === 3
          ? [
              {
                label:
                  s.branch === "spider"
                    ? "Defeat Ungoliant’s Spawn"
                    : "Keep Ungoliant’s Spawn out of play",
                done:
                  s.branch === "spider"
                    ? s.status === "won"
                    : !s.staging
                        .concat(s.engaged)
                        .some((u) => u.code === "01076"),
              },
            ]
          : [];
  return goals.length ? (
    <div className="quest-goals">
      {goals.map((g) => (
        <span key={g.label} className={g.done ? "done" : ""}>
          {g.done ? <Check size={12} /> : <Shield size={12} />} {g.label}
        </span>
      ))}
    </div>
  ) : null;
}
