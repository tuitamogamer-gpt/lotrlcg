import type { Card, GameState, Unit } from "../game/types";
import { card, name } from "../game/cards";
import { stats, threatOf } from "../game/engine";
import {
  allActiveLocations,
  allCharacters,
  allEngaged,
  ownerOf,
  seatName,
} from "../game/table";
import {
  DEPTHS,
  depthsGrappledWith,
  depthsState,
} from "../game/depths-support";
import { CardBack } from "./tabletop";
import "./depths.css";

const shipLocations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) =>
      card(u.code).type_code === "location" &&
      card(u.code)
        .traits?.split(".")
        .some((t) => t.trim() === "Ship"),
  );

export function DepthsScenarioState({
  s,
  inspect,
}: {
  s: GameState;
  inspect: (c: Card) => void;
}) {
  const q = depthsState(s);
  if (!q) return null;
  const inPlay = [...s.staging, ...allEngaged(s), ...allCharacters(s)];
  const boss = inPlay.find((u) => u.code === DEPTHS.thing);
  const captains = [DEPTHS.sahir, DEPTHS.naasiyah].flatMap((code) => {
    const u = [...inPlay, ...q.setAside].find(
      (v) => v.code === code || v.code === `${code}:B`,
    );
    return u ? [u] : [];
  });
  const locations = shipLocations(s);
  const mostThreat = Math.max(0, ...locations.map((u) => threatOf(s, u)));
  const helmExplored = s.victoryCards?.includes(DEPTHS.helm);
  return (
    <section
      className="depths-scenario-state"
      data-scenario-panel="depths"
      aria-label="Stormcaller and the creature"
    >
      <div className="depths-objective-summary">
        <strong>
          {s.stage < 3 ? "Take the Stormcaller" : "Save the Stormcaller"}
        </strong>
        <span>
          {s.stage < 3
            ? helmExplored
              ? "Helm explored · quest progress is allowed."
              : "Explore Helm of the Stormcaller before placing quest progress."
            : "Defeat Creature enemies to damage The Thing in the Depths."}
        </span>
        {s.stage < 3 && (
          <span>{q.beastDeck.length} encounter cards set aside.</span>
        )}
        {boss && (
          <button onClick={() => inspect(card(boss.code))}>
            The Thing in the Depths ·{" "}
            {Math.max(0, stats(s, boss).health - boss.damage)}
            {" / "}
            {stats(s, boss).health} hit points
          </button>
        )}
      </div>
      <div className="depths-captains" aria-label="Corsair captains">
        {captains.map((u) => {
          const aside = q.setAside.some((v) => v.id === u.id);
          const ally = u.flipped || u.code.endsWith(":B");
          return (
            <button key={u.id} onClick={() => inspect(card(u.code))}>
              <strong>{name(u)}</strong>
              <span>
                {aside
                  ? "Set aside"
                  : ally
                    ? seatName(s, ownerOf(s, u))
                    : "Indestructible"}
                {" · "}
                {u.resources} resources
              </span>
            </button>
          );
        })}
      </div>
      {s.stage === 3 && (
        <div
          className={`depths-ship-danger${mostThreat >= 9 ? " is-sinking" : ""}`}
          role="status"
        >
          <strong>Highest Ship location threat · {mostThreat} / 9</strong>
          <span>
            {mostThreat >= 9
              ? "The ship will sink at the end of the round."
              : "If any Ship location reaches 9 threat at round end, the players lose."}
          </span>
          <span>
            {q.grappled.length} enemies grappled · each adds 2 threat to its
            location.
          </span>
        </div>
      )}
    </section>
  );
}

export function DepthsQuestGoals({ s }: { s: GameState }) {
  if (!depthsState(s)) return null;
  const helmExplored = s.victoryCards?.includes(DEPTHS.helm);
  return (
    <div className="quest-goals" data-depths-quest-goals>
      {s.stage === 1 ? (
        <>
          <span>
            {helmExplored
              ? "Place 4 quest progress to advance."
              : "Explore Helm of the Stormcaller to unlock quest progress."}
          </span>
          <span>
            Captain Sahír and Na'asiyah cannot be destroyed at this stage.
          </span>
        </>
      ) : s.stage === 2 ? (
        <span>The Corsair captains join the fight against the creature.</span>
      ) : (
        <>
          <span>Destroy Creature enemies to damage the sea-beast and win.</span>
          <span>
            Travel to release grappled enemies; you may replace the active
            location.
          </span>
          <span>Keep every Ship location below 9 threat at round end.</span>
          <span>Captain Sahír and Na'asiyah must remain in play.</span>
        </>
      )}
    </div>
  );
}

export function DepthsGrappleSummary({
  s,
  location,
}: {
  s: GameState;
  location: Unit;
  inspect?: (c: Card) => void;
}) {
  const count = depthsGrappledWith(s, location.id).length;
  if (!count) return null;
  return (
    <div
      className="depths-grapple-summary"
      data-depths-location-id={location.id}
      aria-label={`${count} facedown grappled enemies on ${name(location)}, adding ${count * 2} threat. Travel here or explore this location to release them.`}
      title="Travel here or explore this location to release the grappled enemies."
    >
      <div className="depths-grapple-backs" aria-hidden="true">
        {Array.from({ length: Math.min(3, count) }, (_, i) => (
          <CardBack key={i} encounter />
        ))}
      </div>
      <span>
        <strong>{count} grappled</strong>
        <small>+{count * 2} threat</small>
      </span>
    </div>
  );
}
