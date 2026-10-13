import { useId, useRef } from "react";
import type { KeyboardEvent } from "react";
import type { Action, Card, GameState } from "../game/types";
import { card } from "../game/cards";
import { templePublicState } from "../game/temple";
import { Art } from "./card-art";
import "./temple-map.css";

/** The map reads only the public face projection, including paid seat knowledge. */
export function TempleMap({
  s,
  dispatch,
  inspect,
}: {
  s: GameState;
  dispatch: (action: Action) => unknown;
  inspect: (visibleCard: Card) => void;
}) {
  const descriptionId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const map = templePublicState(s);
  if (!map) return null;
  const active = map.cells.find((cell) => cell.active);

  const navigateMap = (
    event: KeyboardEvent<HTMLButtonElement>,
    row: number,
    column: number,
  ) => {
    const directions: Record<string, readonly [number, number]> = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
    };
    const direction = directions[event.key];
    if (!direction) return;
    const next = scrollRef.current?.querySelector<HTMLButtonElement>(
      `[data-temple-inspect-row="${row + direction[0]}"][data-temple-inspect-column="${column + direction[1]}"]`,
    );
    if (!next) return;
    event.preventDefault();
    next.focus();
    next.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  return (
    <section
      className="temple-map"
      data-scenario-panel="temple"
      aria-label="Island exploration"
    >
      <header className="temple-map-header">
        <div>
          <h2>Island map</h2>
          <p id={descriptionId}>
            Fill the active location, then move to a reachable location during
            the Travel phase. Its progress clears when you leave. The temple
            lies to the right.
          </p>
        </div>
        {active && (
          <div className="temple-active-summary" role="status">
            <strong>{active.name}</strong>
            <span>
              Active · row {active.row + 1}, column {active.column + 1}
            </span>
            <span>
              {active.progress}
              {active.quest !== null ? ` / ${active.quest}` : ""} progress
              {active.quest !== null && active.progress >= active.quest
                ? " · Ready to leave"
                : ""}
            </span>
          </div>
        )}
      </header>
      <div className="temple-map-legend" aria-label="Map legend">
        <span className="temple-legend-active">Active location</span>
        <span className="temple-legend-staged">In the staging area</span>
        <span>Hidden sides stay hidden until revealed or looked at.</span>
      </div>
      <p className="temple-map-scroll-hint">
        Scroll across the map on a small screen. Focus a card and use the arrow
        keys to move between locations.
      </p>
      <div
        className="temple-map-scroll"
        ref={scrollRef}
        role="region"
        aria-label="Three-row, five-column island map"
        aria-describedby={descriptionId}
        tabIndex={0}
      >
        <div className="temple-map-grid" role="list">
          {[...map.cells]
            .sort((a, b) => a.row - b.row || a.column - b.column)
            .map((cell) => {
              // Never derive a hidden face from the physical map unit.
              const visibleCard = {
                ...card(cell.code),
                name: cell.name,
                imagesrc: cell.image,
              };
              const coordinate = `row ${cell.row + 1}, column ${cell.column + 1}`;
              const lostIsland = cell.code === "temple-lost-island";
              return (
                <article
                  key={cell.id}
                  role="listitem"
                  className={`temple-map-cell${cell.active ? " is-active" : ""}${cell.staged ? " is-staged" : ""}`}
                  data-temple-map-cell={cell.id}
                  data-temple-row={cell.row}
                  data-temple-column={cell.column}
                  aria-label={`${cell.name}, ${coordinate}${cell.active ? ", active location" : cell.staged ? ", in the staging area" : ""}`}
                >
                  <div className="temple-cell-position">
                    <span>
                      {cell.row + 1} · {cell.column + 1}
                    </span>
                    <span>
                      {cell.active
                        ? "Active"
                        : cell.staged
                          ? "Staging"
                          : cell.adjacent
                            ? "Adjacent"
                            : cell.travelProblem === null
                              ? "Reachable"
                              : ""}
                    </span>
                  </div>
                  <button
                    className="temple-card-inspect"
                    data-temple-inspect-row={cell.row}
                    data-temple-inspect-column={cell.column}
                    aria-label={`Inspect ${cell.name}, ${coordinate}`}
                    aria-current={cell.active ? "location" : undefined}
                    onKeyDown={(event) =>
                      navigateMap(event, cell.row, cell.column)
                    }
                    onClick={() => inspect(visibleCard)}
                  >
                    <Art c={visibleCard} imageSrc={cell.image} />
                  </button>
                  <strong className="temple-cell-name">{cell.name}</strong>
                  <span className="temple-cell-progress">
                    {cell.staged ? `${cell.threat} threat · ` : ""}
                    {cell.progress}
                    {cell.quest !== null ? ` / ${cell.quest}` : ""} progress
                  </span>
                  {cell.looked && (
                    <button
                      className="temple-map-action temple-looked-inspect"
                      onClick={() =>
                        inspect({
                          ...card(cell.looked!.code),
                          name: cell.looked!.name,
                          imagesrc: cell.looked!.image,
                        })
                      }
                      aria-label={`Read the side you looked at, ${coordinate}`}
                    >
                      Read known side
                    </button>
                  )}
                  {!cell.active &&
                    (cell.adjacent || cell.travelProblem === null) && (
                      <button
                        className="temple-map-action temple-map-travel"
                        disabled={cell.travelProblem !== null}
                        title={cell.travelProblem ?? `Travel to ${cell.name}`}
                        aria-description={cell.travelProblem ?? undefined}
                        aria-label={`Travel to ${cell.name}, ${coordinate}`}
                        onClick={() =>
                          dispatch({ type: "TRAVEL", id: cell.id })
                        }
                      >
                        Travel here
                      </button>
                    )}
                  {lostIsland && cell.progress >= 4 && (
                    <button
                      className="temple-map-action temple-map-peek"
                      disabled={cell.peekProblem !== null}
                      title={
                        cell.peekProblem ??
                        "Remove 4 progress to look at the hidden side."
                      }
                      aria-description={cell.peekProblem ?? undefined}
                      aria-label={`Look at Lost Island, ${coordinate}: remove 4 progress`}
                      onClick={() => dispatch({ type: "ABILITY", id: cell.id })}
                    >
                      Look · remove 4 progress
                    </button>
                  )}
                </article>
              );
            })}
        </div>
      </div>
    </section>
  );
}
