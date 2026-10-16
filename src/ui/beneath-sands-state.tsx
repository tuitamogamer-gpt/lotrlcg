import type { Card, GameState } from "../game/types";
import { card } from "../game/cards";
import { stats } from "../game/core";
import { allEngaged, ownerOf, seatName } from "../game/table";
import {
  BENEATH_SANDS,
  BENEATH_SANDS_MAIN_QUESTS,
  beneathSandsSearch,
  beneathSandsStageInfo,
  beneathSandsTrackValue,
} from "../game/beneath-sands-support";
import "./beneath-sands.css";

export function BeneathSandsScenarioState({
  s,
  inspect,
}: {
  s: GameState;
  inspect: (c: Card) => void;
}) {
  const q = s.beneathSands;
  if (!q) return null;
  const stage = beneathSandsStageInfo(s);
  const search = beneathSandsSearch(s);
  const engaged = allEngaged(s);
  const broodMother = [...s.staging, ...engaged].find(
    (u) => u.code === BENEATH_SANDS.broodMother,
  );
  const defeated = (s.victoryCards ?? []).includes(BENEATH_SANDS.broodMother);
  const lost = s.staging.some((u) => u.code === BENEATH_SANDS.lostUnderground);
  const track = s.activeLocation
    ? beneathSandsTrackValue(s.activeLocation.code)
    : 0;
  const searchCard = {
    ...card(BENEATH_SANDS.search),
    initialReverse: !q.onTrack,
  };
  const currentQuestCard = { ...card(q.currentQuest), initialReverse: true };
  return (
    <section
      className="beneath-sands-state"
      data-scenario-panel="beneath-sands"
      aria-label="The search beneath the sands"
    >
      <div className="beneath-sands-summary" data-beneath-sands-quest>
        <strong>
          Stage {s.stage}B · {stage?.name ?? card(q.currentQuest).name}
        </strong>
        <button onClick={() => inspect(currentQuestCard)}>
          Inspect current quest
        </button>
        <span>
          Quest progress · {s.progress} / {stage?.quest ?? 5}
        </span>
        <span>
          {s.stage === 3
            ? "Reach 5 progress and defeat Brood Mother to win. Flipping Off Track removes all progress from this stage."
            : "Find the right path, then place 5 progress to advance."}
        </span>
        {s.stage === 2 && q.onTrack && (
          <span>Encounter card effects cannot be canceled while On Track.</span>
        )}
      </div>
      <div className="beneath-sands-summary" data-beneath-sands-search>
        <strong>Search · {q.onTrack ? "On Track" : "Off Track"}</strong>
        <button onClick={() => inspect(searchCard)}>
          Inspect {q.onTrack ? "On Track" : "Off Track"} objective
        </button>
        <span>Search resources · {search?.resources ?? 0}</span>
        <span>
          {q.onTrack
            ? "Main quest progress is allowed. At quest end, search the top 3 encounter cards for an On Track card."
            : "Main quest progress is blocked. At quest end, add 1 resource, then return the topmost discarded location or raise each player’s threat by the resources here."}
        </span>
        {lost ? (
          <span>
            Lost Underground prevents the Search objective from flipping. Track
            does not resolve.
          </span>
        ) : (
          <span>
            {q.onTrack
              ? "An unsuccessful quest or a search that adds no card flips the objective Off Track."
              : "After travel, Track discards cards to find an On Track symbol. Flipping On Track clears all Search resources."}
          </span>
        )}
        {!!track && <span>Active location · Track {track}</span>}
      </div>
      <div className="beneath-sands-summary" data-beneath-sands-brood-mother>
        <strong>Brood Mother</strong>
        <button onClick={() => inspect(card(BENEATH_SANDS.broodMother))}>
          Inspect Brood Mother
        </button>
        {broodMother ? (
          <>
            <span>
              {engaged.some((u) => u.id === broodMother.id)
                ? `Engaged with ${seatName(s, ownerOf(s, broodMother))}`
                : "In the staging area"}
              {" · "}
              {broodMother.damage} / {stats(s, broodMother).health} damage
            </span>
            <span>
              {broodMother.blanked
                ? "Printed abilities are blanked."
                : s.stage === 3 && s.progress >= 5
                  ? "5 quest progress reached · Brood Mother can take damage."
                  : "Brood Mother cannot take damage. Reach 5 progress on stage 3B to remove this protection."}
            </span>
          </>
        ) : (
          <span>
            {defeated
              ? "Defeated · In the victory display"
              : "Set aside · Out of play"}
          </span>
        )}
      </div>
      <details className="beneath-sands-reference">
        <summary>Printed quest cards · Both faces</summary>
        <div className="beneath-sands-reference-list">
          {BENEATH_SANDS_MAIN_QUESTS.map((code, i) => (
            <button key={code} onClick={() => inspect(card(code))}>
              {i + 1}A/B · {card(code).name}
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}

export function BeneathSandsQuestGoals({ s }: { s: GameState }) {
  const q = s.beneathSands;
  const stage = beneathSandsStageInfo(s);
  if (!q || !stage) return null;
  const defeated = (s.victoryCards ?? []).includes(BENEATH_SANDS.broodMother);
  return (
    <div className="quest-goals" data-beneath-sands-quest-goals>
      <span className={s.progress >= stage.quest ? "done" : ""}>
        {s.stage === 3 ? "Reach the hive" : "Search the tunnels"} · {s.progress}{" "}
        / {stage.quest} quest progress
      </span>
      <span>
        {q.onTrack
          ? "On Track · Progress can be placed on the main quest."
          : "Off Track · Find an On Track symbol through Track to allow main quest progress."}
      </span>
      {s.stage === 3 && (
        <>
          <span className={defeated ? "done" : ""}>
            {defeated
              ? "Brood Mother defeated."
              : "Defeat Brood Mother after reaching 5 quest progress."}
          </span>
          <span>Flipping Off Track removes all progress from this stage.</span>
        </>
      )}
      {s.stage === 2 && q.onTrack && (
        <span>Encounter card effects cannot be canceled.</span>
      )}
    </div>
  );
}
