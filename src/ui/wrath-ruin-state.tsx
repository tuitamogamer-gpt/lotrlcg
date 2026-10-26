import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { seatName } from "../game/table";
import {
  WRATH_RUIN,
  wrathRuinPublicState,
  wrathRuinStageInfo,
} from "../game/wrath-ruin-support";
import { currentQuestInspection, type InspectedCard } from "./quest-inspection";
import "./wrath-ruin.css";

export function WrathRuinQuestGoals({ s }: { s: GameState }) {
  const q = wrathRuinPublicState(s);
  if (!q) return null;
  return (
    <div className="quest-goals" data-wrath-quest-goals>
      <span>
        {s.stage === 1
          ? "At the end of the round, complete this quest and control more locations than remain in staging to advance."
          : "Place 12 progress on this quest and control more locations than remain in staging to travel to the Gate. Control the Gate at the end of the round to win."}
      </span>
    </div>
  );
}

export function WrathRuinScenarioState({
  s,
  inspect,
}: {
  s: GameState;
  inspect: (c: InspectedCard) => void;
}) {
  const q = wrathRuinPublicState(s),
    info = wrathRuinStageInfo(s);
  if (!q || !info) return null;
  return (
    <section
      className="wrath-ruin-state"
      data-scenario-panel="wrath-and-ruin"
      aria-label="Wrath and Ruin scenario state"
    >
      <div className="wrath-ruin-summary">
        <strong>
          Stage {s.stage} · {info.name}
        </strong>
        <span>
          Quest progress · {s.progress} / {info.quest}
        </span>
        <button
          onClick={() =>
            inspect(currentQuestInspection(s, card(q.currentQuest)))
          }
        >
          Inspect current quest
        </button>
        <WrathRuinQuestGoals s={s} />
      </div>
      <div className="wrath-ruin-summary" data-wrath-control-counts>
        <strong>Dorwinion · {q.controlledCount} locations controlled</strong>
        <span>{q.stagedCount} locations in the staging area</span>
        <span>
          {q.gateControlled
            ? "The Gate is controlled. Hold it until the end of the round."
            : "The Gate of Dorwinion remains contested."}
        </span>
        <button onClick={() => inspect(card(WRATH_RUIN.gate))}>
          Inspect Gate of Dorwinion
        </button>
      </div>
      {q.controlled.length > 0 && (
        <div
          className="wrath-ruin-controlled"
          data-wrath-controlled
          aria-label="Controlled locations"
        >
          {q.controlled.map((u) => (
            <button
              key={u.id}
              data-controlled-location={u.id}
              onClick={() => inspect(card(u.code))}
            >
              {card(u.code).name} · {seatName(s, u.player)}
              {u.resources > 0 ? ` · ${u.resources} resources` : ""}
            </button>
          ))}
        </div>
      )}
      {q.storedCards.length > 0 && (
        <div className="wrath-ruin-summary" data-wrath-hidden-cards>
          {q.storedCards.map((held) => (
            <span key={held.locationId}>
              Hidden beneath a location · {held.count} cards
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
