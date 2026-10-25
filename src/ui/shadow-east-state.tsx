import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { stats } from "../game/core";
import { allActiveLocations, allEngaged, seatName } from "../game/table";
import {
  RIVER_RUNNING,
  riverRunningPublicState,
  riverRunningStageInfo,
} from "../game/river-running-support";
import {
  DANGER_DORWINION,
  dangerDorwinionPublicState,
  dangerDorwinionStageInfo,
} from "../game/danger-dorwinion-support";
import {
  TEMPLE_DOOM,
  TEMPLE_DOOM_QUESTS,
  templeDoomPublicState,
  templeDoomStageInfo,
  templeDoomX,
} from "../game/temple-doom-support";
import { currentQuestInspection, type InspectedCard } from "./quest-inspection";
import "./shadow-east.css";

export function ShadowEastQuestGoals({ s }: { s: GameState }) {
  const river = riverRunningPublicState(s);
  const danger = dangerDorwinionPublicState(s);
  const temple = templeDoomPublicState(s);
  if (!river && !danger && !temple) return null;
  return (
    <div className="quest-goals" data-shadow-east-quest-goals>
      {river && (
        <span>
          {s.stage === 1
            ? "Escape the pursuit and reach the Crossing of Araw. Each pursuit resource adds 1 staging threat."
            : "Defeat this quest to escape. While any player is engaged with an enemy, at most 5 progress can be placed here each round."}
        </span>
      )}
      {danger && (
        <span>
          {s.stage < 3
            ? `Explore active locations and find Evidence of the Cult. This quest needs ${danger.resourceGoal} resources before it can be defeated.`
            : "Defeat the Cultist to win. Its damage limit each round is the active location’s printed quest points."}
        </span>
      )}
      {temple && (
        <span>
          {s.stage === 1
            ? "The quest phase is skipped. After two planning phases, enter the temple’s next stage."
            : "Complete the temple stages to confront Ulchor. Once he has no hit points remaining, defeat Tribute to Mordor to win."}
        </span>
      )}
    </div>
  );
}

export function ShadowEastScenarioState({
  s,
  inspect,
}: {
  s: GameState;
  inspect: (c: InspectedCard) => void;
}) {
  const river = riverRunningPublicState(s);
  const danger = dangerDorwinionPublicState(s);
  const temple = templeDoomPublicState(s);
  const info =
    riverRunningStageInfo(s) ??
    dangerDorwinionStageInfo(s) ??
    templeDoomStageInfo(s);
  if (!info || (!river && !danger && !temple)) return null;
  const ulchor = [...s.staging, ...allEngaged(s)].find(
    (u) => u.code === TEMPLE_DOOM.ulchor,
  );
  const currentCode =
    river?.currentQuest ?? danger?.currentQuest ?? temple!.currentQuest;
  return (
    <section
      className="shadow-east-state"
      data-scenario-panel={s.scenarioId}
      aria-label={`${s.scenarioId === "the-river-running" ? "The River Running" : danger ? "Danger in Dorwinion" : "The Temple of Doom"} scenario state`}
    >
      <div className="shadow-east-summary">
        <strong>
          Stage {s.stage} · {info.name}
        </strong>
        <button
          onClick={() => inspect(currentQuestInspection(s, card(currentCode)))}
        >
          Inspect current quest
        </button>
        {info.quest > 0 && (
          <span>
            Quest progress · {s.progress} / {info.quest}
          </span>
        )}
        <ShadowEastQuestGoals s={s} />
      </div>
      {river && (
        <div className="shadow-east-summary" data-river-pursuit>
          <strong>Easterling Pursuit · {river.pursuit} resources</strong>
          <span>
            At 3 resources, the pursuit brings more enemies into play.
          </span>
          {s.stage === 2 && (
            <span>
              Progress placed this round · {river.progressPlaced}
              {allEngaged(s).length ? " / 5" : " · no engaged enemies"}
            </span>
          )}
          {s.staging.some(
            (u) => u.code === RIVER_RUNNING.arduous && !u.blanked,
          ) && (
            <span>
              At the end of refresh, each player discards down to 6 cards while
              An Arduous Journey remains in play.
            </span>
          )}
          <button onClick={() => inspect(card(RIVER_RUNNING.pursuit))}>
            Inspect Easterling Pursuit
          </button>
        </div>
      )}
      {danger && (
        <>
          <div className="shadow-east-summary" data-dorwinion-investigation>
            <strong>
              Investigation · {danger.resources}
              {danger.resourceGoal ? ` / ${danger.resourceGoal}` : ""} resources
            </strong>
            <span>Unrevealed cards set aside · {danger.setAside}</span>
            {danger.storedCards.map((held) => (
              <span key={held.locationId}>
                Hidden beneath a location · {held.count} cards
              </span>
            ))}
            {danger.cultist && (
              <>
                <strong>
                  {card(danger.cultist.code).name} · {danger.cultist.damage}{" "}
                  damage
                </strong>
                <span>
                  Damage counted this round · {danger.cultistDamageThisRound}
                </span>
                <span>
                  Active location’s printed quest points ·{" "}
                  {allActiveLocations(s)
                    .map((u) => card(u.code).quest ?? 0)
                    .join(" / ") || "0"}
                </span>
                <button onClick={() => inspect(card(danger.cultist!.code))}>
                  Inspect the Cultist
                </button>
              </>
            )}
            <button onClick={() => inspect(card(DANGER_DORWINION.evidence))}>
              Inspect Evidence of the Cult
            </button>
          </div>
          {danger.plot.map((plot) => (
            <div
              className="shadow-east-summary"
              key={plot.id}
              data-dorwinion-plot
            >
              <strong>{card(plot.code).name}</strong>
              <span>
                {plot.resources} resources · {plot.damage} damage
              </span>
              {plot.code === DANGER_DORWINION.worship && (
                <span>
                  Each player’s threat elimination level is reduced by{" "}
                  {danger.threatEliminationPenalty}.
                </span>
              )}
              <button onClick={() => inspect(card(plot.code))}>
                Inspect revealed plot
              </button>
            </div>
          ))}
        </>
      )}
      {temple && (
        <>
          <div className="shadow-east-summary" data-temple-doom-powers>
            <strong>
              Power of Mordor · {temple.powerDeck} face-down cards
            </strong>
            <span>Tribute to Mordor · {temple.tributeDamage} damage</span>
            <span>
              At 4 damage, reveal the next Power of Mordor card. If none
              remains, the players lose.
            </span>
            <span>
              Completed quest stages · {temple.completedStages} · X ={" "}
              {templeDoomX(s)}
            </span>
            <span>Unrevealed stages · {temple.questDeck}</span>
            {s.stage === 1 && (
              <span>Planning resources · {temple.questResources} / 2</span>
            )}
            {temple.lordLimit && (
              <span>
                Progress this round · {temple.lordLimit.placed} /{" "}
                {temple.lordLimit.value}
              </span>
            )}
            {temple.underDial.map((held) => (
              <span key={`${held.questId}:${held.player}`}>
                {seatName(s, held.player)} · {held.count} hidden cards beneath
                the threat dial
              </span>
            ))}
            <button onClick={() => inspect(card(TEMPLE_DOOM.tribute))}>
              Inspect Tribute to Mordor
            </button>
          </div>
          {ulchor && (
            <div className="shadow-east-summary" data-temple-doom-ulchor>
              <strong>
                Thane Ulchor · {ulchor.damage} / {stats(s, ulchor).health}{" "}
                damage
              </strong>
              <span>Indestructible · Immune to player card effects</span>
              <span>
                {templeDoomX(s) === 5
                  ? "Can now be engaged"
                  : "Cannot be engaged until X is 5"}
              </span>
              <button onClick={() => inspect(card(TEMPLE_DOOM.ulchor))}>
                Inspect Thane Ulchor
              </button>
            </div>
          )}
          {temple.completedStages > 0 && (
            <details className="shadow-east-reference">
              <summary>Completed quest stages</summary>
              <div>
                {(s.victoryCards ?? [])
                  .filter((code) =>
                    TEMPLE_DOOM_QUESTS.some((q) => q.code === code),
                  )
                  .map((code) => (
                    <button key={code} onClick={() => inspect(card(code))}>
                      {card(code).back_name ?? card(code).name}
                    </button>
                  ))}
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}
