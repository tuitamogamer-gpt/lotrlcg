import type { Card, GameState } from "../game/types";
import { card } from "../game/cards";
import { allCharacters, ownerOf, seatName } from "../game/table";
import {
  CROSSINGS_POROS as P,
  CROSSINGS_POROS_MAIN_QUESTS,
  CROSSINGS_POROS_SETS,
  crossingsPorosSet,
  crossingsPorosStageInfo,
} from "../game/crossings-poros-support";
import "./crossings-poros.css";
export function CrossingsPorosScenarioState({
  s,
  inspect,
}: {
  s: GameState;
  inspect: (c: Card) => void;
}) {
  const q = s.crossingsPoros;
  if (!q) return null;
  const currentQuest = { ...card(q.currentQuest), initialReverse: true };
  const stage = crossingsPorosStageInfo(s),
    g = allCharacters(s).find((u) => u.code === P.garrison);
  return (
    <section
      className="crossings-poros-state"
      data-scenario-panel="crossings-poros"
      aria-label="The road to the Crossings of Poros"
    >
      <div className="crossings-poros-summary">
        <strong>
          Stage {s.stage}B · {stage?.name}
        </strong>
        <button onClick={() => inspect(currentQuest)}>
          Inspect current quest
        </button>
        <span>
          Quest progress · {s.progress} / {stage?.quest ?? 0}
        </span>
        <span>
          {s.stage === 1
            ? "At the end of planning, advance to a random stage 2. Allies enter play exhausted."
            : s.stage === 4
              ? "Hold 20 progress until the end of combat to win. A character destroyed by an enemy attack costs progress equal to that enemy’s printed threat."
              : "Defeat this stage to continue along the road to Gondor."}
        </span>
      </div>
      <div className="crossings-poros-summary">
        <strong>The pursuit</strong>
        {CROSSINGS_POROS_SETS.map((set) => {
          const count = q.setAside.filter(
            (u) => crossingsPorosSet(u.code) === set,
          ).length;
          const removed = q.removed.some(
            (u) => crossingsPorosSet(u.code) === set,
          );
          return (
            <span key={set}>
              {set} · {removed ? "Removed from the game" : `${count} set aside`}
            </span>
          );
        })}
        <span>
          Cards taken from a set aside set join the encounter deck for the rest
          of this game.
        </span>
      </div>
      <div className="crossings-poros-summary">
        <strong>Poros Garrison</strong>
        <button onClick={() => inspect(card(P.garrison))}>
          Inspect Poros Garrison
        </button>
        <span>
          {g
            ? `Controlled by ${seatName(s, ownerOf(s, g))} · ${g.damage} / 6 damage`
            : q.garrisonEntered
              ? "Left play"
              : "Set aside until stage 4"}
        </span>
        <span>If Poros Garrison leaves play, the players lose the game.</span>
      </div>
      <details className="crossings-poros-reference">
        <summary>Printed quest cards · Both faces</summary>
        <div>
          {CROSSINGS_POROS_MAIN_QUESTS.map((code) => {
            const c = card(code);
            return (
              <button key={code} onClick={() => inspect(c)}>
                {c.cost}A/B · {c.name}
              </button>
            );
          })}
        </div>
      </details>
    </section>
  );
}
export function CrossingsPorosQuestGoals({ s }: { s: GameState }) {
  const stage = crossingsPorosStageInfo(s);
  if (!stage) return null;
  return (
    <div className="quest-goals" data-crossings-poros-quest-goals>
      <span className={s.progress >= stage.quest ? "done" : ""}>
        {s.stage === 1
          ? "Escape at the end of planning"
          : `${s.progress} / ${stage.quest} quest progress`}
      </span>
      {s.stage === 4 && (
        <span>Win at the end of combat. Keep Poros Garrison in play.</span>
      )}
    </div>
  );
}
