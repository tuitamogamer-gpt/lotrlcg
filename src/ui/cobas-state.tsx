import type { Card, GameState } from "../game/types";
import { card, name } from "../game/cards";
import { allActiveLocations, allEngaged } from "../game/table";
import { COBAS, COBAS_OBJECTIVES, cobasStageInfo } from "../game/cobas-support";
import { sailingOnCourse } from "../game/sailing";
import { cobasGuardsObjective, cobasObjectiveControlled } from "../game/cobas";
import "./cobas.css";

export function CobasScenarioState({
  s,
  inspect,
}: {
  s: GameState;
  inspect: (c: Card) => void;
}) {
  const q = s.cobas;
  if (!q) return null;
  const inPlay = [...s.staging, ...allEngaged(s), ...allActiveLocations(s)];
  const objectives = s.staging.filter((u) => COBAS_OBJECTIVES.includes(u.code));
  const guarded = objectives.filter((u) => !cobasObjectiveControlled(s, u));
  const warships = q.setAside.filter((u) => u.code === COBAS.warship).length;
  return (
    <section
      className="cobas-scenario-state"
      data-scenario-panel="cobas"
      aria-label="Battle for Cobas Haven"
    >
      <div className="cobas-battle-summary">
        <strong>Defend Dol Amroth</strong>
        <span>
          {objectives.length - guarded.length} coastal defenses controlled ·{" "}
          {guarded.length} guarded
        </span>
        <span>
          Corsair deck · {q.corsairDeck.length} · discarded ·{" "}
          {q.corsairDiscard.length}
        </span>
        <span>{warships} Dol Amroth Warships available at The Beacon</span>
        {s.stage === 1 && (
          <span>
            {sailingOnCourse(s)
              ? "On-course · engaging Ship enemies take 2 damage."
              : "Off-course · engaging a Ship enemy deals 2 damage to one of your ships."}
          </span>
        )}
        {s.stage === 2 && guarded.length > 0 && (
          <span className="cobas-warning">
            Free every guarded objective before advancing.
          </span>
        )}
        {q.belfalas.map(({ enemy }) => (
          <button key={enemy.id} onClick={() => inspect(card(enemy.code))}>
            {name(enemy)} · out of play while Belfalas Islet is active
          </button>
        ))}
      </div>
      <div className="cobas-objectives" aria-label="Coastal defenses">
        {objectives.map((objective) => {
          const guards = inPlay.filter((u) =>
            cobasGuardsObjective(u, objective.id),
          );
          const controlled = cobasObjectiveControlled(s, objective);
          return (
            <div
              key={objective.id}
              className={
                controlled
                  ? "cobas-objective controlled"
                  : "cobas-objective guarded"
              }
            >
              <button
                onClick={() => inspect(card(objective.code))}
                aria-label={`Inspect coastal defense: ${name(objective)}`}
              >
                <strong>{name(objective)}</strong>
              </button>
              {guards.length ? (
                guards.map((guard) => (
                  <button
                    key={guard.id}
                    onClick={() => inspect(card(guard.code))}
                  >
                    Guarded by {name(guard)}
                  </button>
                ))
              ) : (
                <span>
                  {controlled
                    ? "Controlled by the players"
                    : "Guarded reveal pending"}
                </span>
              )}
              {objective.exhausted && <span>Exhausted</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function CobasQuestGoals({ s }: { s: GameState }) {
  const stage = cobasStageInfo(s);
  if (!stage) return null;
  const guardedObjectives = s.staging.filter(
    (u) => COBAS_OBJECTIVES.includes(u.code) && !cobasObjectiveControlled(s, u),
  );
  return (
    <div className="quest-goals" data-cobas-quest-goals>
      <span className={s.progress >= stage.quest ? "done" : ""}>
        Place {stage.quest} quest progress · {s.progress} / {stage.quest}
      </span>
      {s.stage === 2 && (
        <span className={guardedObjectives.length === 0 ? "done" : ""}>
          Free all guarded objectives · {guardedObjectives.length} remaining
        </span>
      )}
      {s.stage === 3 && (
        <span>Or defeat Raider Flagship to win. Only ships can attack it.</span>
      )}
      <span>Keep the fleet on-course and protect the Dream-chaser.</span>
    </div>
  );
}
