import type { Card, GameState } from "../game/types";
import { card } from "../game/cards";
import { allEngaged } from "../game/table";
import { CITY, cityStageInfo } from "../game/city-support";
import { cityIndestructible } from "../game/city";
import { sailingOnCourse } from "../game/sailing";
import "./city.css";

export function CityScenarioState({
  s,
  inspect,
}: {
  s: GameState;
  inspect: (c: Card) => void;
}) {
  const q = s.city;
  if (!q) return null;
  const enemies = [...s.staging, ...allEngaged(s)];
  const sahir = enemies.find((u) => u.code === CITY.sahir);
  const stormcaller = enemies.find((u) => u.code === CITY.stormcaller);
  return (
    <section
      className="city-scenario-state"
      data-scenario-panel="city"
      aria-label="Pursuit through Umbar"
    >
      <div className="city-journey-summary">
        <strong>
          {s.stage <= 2 ? "The coast of Umbar" : "The streets of Umbar"}
        </strong>
        <span>
          {s.stage <= 2
            ? "Pursue the Stormcaller with the Dream-chaser's fleet."
            : "The fleet is gone. End Captain Sahír's plot."}
        </span>
        {s.stage === 1 && (
          <>
            <span>
              Corsair deck · {q.corsairDeck.length} · discarded ·{" "}
              {q.corsairDiscard.length}
            </span>
            <span>
              {sailingOnCourse(s)
                ? "On-course · Quest progress can be placed."
                : "Off-course · No progress can be placed on The Coast of Umbar."}
            </span>
            {stormcaller && (
              <button onClick={() => inspect(card(stormcaller.code))}>
                Stormcaller · {stormcaller.damage} / 18 damage
              </button>
            )}
          </>
        )}
        {s.stage >= 3 && (
          <span
            className={q.stormcallerDestroyed ? "city-success" : "city-warning"}
          >
            {q.stormcallerDestroyed
              ? "Stormcaller destroyed · The Haven's Raiders receive no pursuit resource."
              : "Stormcaller escaped · The Haven adds 1 resource to every Raider."}
          </span>
        )}
      </div>
      {sahir && (
        <div className="city-sahir-state">
          <button onClick={() => inspect(card(sahir.code))}>
            <strong>Captain Sahír</strong>
          </button>
          <span>
            {sahir.resources} resources · {sahir.damage} / 8 damage
          </span>
          <span>
            {sahir.blanked
              ? "Printed abilities are blanked."
              : `Cancels up to ${sahir.resources} incoming damage by discarding resources.`}
          </span>
          <span
            className={
              cityIndestructible(s, sahir) ? "city-warning" : "city-success"
            }
          >
            {cityIndestructible(s, sahir)
              ? "Indestructible while any enemy has resources, including Sahír."
              : "No enemy resources remain · Sahír can be destroyed."}
          </span>
          <span>
            {sahir.blanked ? 0 : Math.floor(sahir.resources / 5)} additional
            attacks this combat phase
          </span>
        </div>
      )}
    </section>
  );
}
export function CityQuestGoals({ s }: { s: GameState }) {
  const stage = cityStageInfo(s);
  if (!stage) return null;
  return (
    <div className="quest-goals" data-city-quest-goals>
      {s.stage === 1 && (
        <>
          <span className={s.progress >= 15 ? "done" : ""}>
            Place 15 quest progress while on-course · {s.progress} / 15
          </span>
          <span>Or destroy Stormcaller to advance.</span>
          <span>Keep the Dream-chaser afloat until reaching Umbar.</span>
        </>
      )}
      {s.stage === 2 && (
        <span>
          Assign ship damage to non-Ship characters, then continue on land.
        </span>
      )}
      {s.stage === 3 && (
        <span className={s.progress >= 18 ? "done" : ""}>
          Place 18 quest progress · {s.progress} / 18
        </span>
      )}
      {s.stage === 4 && (
        <>
          <span>Destroy Captain Sahír to win.</span>
          <span>
            Remove resources from every enemy to end his indestructibility.
          </span>
          <span>
            Destroyed heroes and enemies transfer their resources to Sahír.
          </span>
        </>
      )}
    </div>
  );
}
