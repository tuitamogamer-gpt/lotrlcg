import type { Card, GameState } from "../game/types";
import { card } from "../game/cards";
import { stats, threatOf } from "../game/core";
import { allCharacters, ownerOf, seatName } from "../game/table";
import {
  RACE_HARAD,
  RACE_HARAD_MAIN_QUESTS,
  RACE_HARAD_ENEMY_QUESTS,
  raceHaradAreaUnits,
  raceHaradStageInfo,
} from "../game/race-harad-support";
import "./race-harad.css";

export function RaceHaradScenarioState({
  s,
  inspect,
}: {
  s: GameState;
  inspect: (c: Card) => void;
}) {
  const q = s.raceHarad;
  if (!q) return null;
  const stage = raceHaradStageInfo(s);
  const enemyQuest = card(q.enemyQuest);
  const mounts = allCharacters(s).filter((u) => u.code === RACE_HARAD.tamed);
  const area = raceHaradAreaUnits(s);
  const gap = s.stage - q.enemyStage;
  const capKnown = q.counterRound === s.round && q.progressLimit > 0;
  return (
    <section
      className="race-harad-state"
      data-scenario-panel="race-harad"
      aria-label="Race Across Harad"
    >
      <div className="race-harad-journeys">
        <div className="race-harad-journey" data-race-harad-player-quest>
          <strong>Players · Stage {s.stage}B</strong>
          <button onClick={() => inspect(card(q.currentQuest))}>
            {stage?.name ?? card(q.currentQuest).name} · Inspect quest
          </button>
          <span>
            Quest progress · {s.progress} / {stage?.quest ?? 0}
          </span>
          {capKnown ? (
            <span data-race-harad-progress-cap>
              Progress placed this round · {q.progressThisRound} /{" "}
              {q.progressLimit}
            </span>
          ) : (
            <span data-race-harad-progress-cap>
              Round limit: 5 progress, or 10 if every Tamed Mumak is committed
              to the quest.
            </span>
          )}
          <span>
            {s.stage === 4
              ? "Defeat The Ford of Harnen before the Orcs catch you to win."
              : "Advance north before the Orcs overtake your quest stage."}
          </span>
        </div>
        <div className="race-harad-journey" data-race-harad-orc-quest>
          <strong>Orcs · Stage {q.enemyStage}D</strong>
          <button onClick={() => inspect(enemyQuest)}>
            {enemyQuest.back_name ?? enemyQuest.name} · Inspect quest
          </button>
          <span>
            Quest progress · {q.enemyProgress} / {enemyQuest.back_quest ?? 0}
          </span>
          <span data-race-harad-distance>
            {gap > 0
              ? `Players lead by ${gap} ${gap === 1 ? "stage" : "stages"}.`
              : gap === 0
                ? "The Orcs have reached the players' stage."
                : `The Orcs are ${-gap} ${gap === -1 ? "stage" : "stages"} ahead.`}
          </span>
          <span>
            The Orcs advance at the end of the quest phase. Their quest card
            determines the threat added as progress.
          </span>
        </div>
      </div>
      <div className="race-harad-journey" data-race-harad-orc-area>
        <strong>Orc’s area · {area.length} cards</strong>
        <span>
          Total threat · {area.reduce((n, u) => n + threatOf(s, u), 0)}
        </span>
        {s.stage === q.enemyStage && (
          <span>The Orc’s area shares the staging area at this stage.</span>
        )}
        {area.map((u) => (
          <button key={u.id} onClick={() => inspect(card(u.code))}>
            {card(u.code).name}
            {card(u.code).health !== undefined
              ? ` · ${u.damage} / ${stats(s, u).health} damage`
              : ""}
          </button>
        ))}
      </div>
      <div className="race-harad-journey" data-race-harad-mounts>
        <strong>Tamed Mumakil · {mounts.length}</strong>
        <span>
          Undefended attack damage must go to your Tamed Mumak. If it leaves
          play, its controller is eliminated.
        </span>
        {mounts.map((u) => (
          <button key={u.id} onClick={() => inspect(card(u.code))}>
            {seatName(s, ownerOf(s, u))} · {u.damage} / {stats(s, u).health}{" "}
            damage
            {u.committed ? " · Committed to the quest" : ""}
          </button>
        ))}
      </div>
      <details className="race-harad-reference">
        <summary>Printed race quests</summary>
        {[
          { label: "Players", codes: RACE_HARAD_MAIN_QUESTS, sides: "A/B" },
          { label: "Orcs", codes: RACE_HARAD_ENEMY_QUESTS, sides: "C/D" },
        ].map(({ label, codes, sides }) => (
          <div className="race-harad-quest-reference" key={label}>
            <strong>{label}</strong>
            {codes.map((code, i) => (
              <button key={code} onClick={() => inspect(card(code))}>
                {i + 1}
                {sides} · {card(code).name}
              </button>
            ))}
          </div>
        ))}
      </details>
    </section>
  );
}

export function RaceHaradQuestGoals({ s }: { s: GameState }) {
  const q = s.raceHarad;
  const stage = raceHaradStageInfo(s);
  if (!q || !stage) return null;
  return (
    <div className="quest-goals" data-race-harad-quest-goals>
      <span className={s.progress >= stage.quest ? "done" : ""}>
        {s.stage === 4 ? "Escape across the ford" : "Advance north"} ·{" "}
        {s.progress} / {stage.quest} quest progress
      </span>
      <span>Keep every player’s Tamed Mumak in play.</span>
      <span>
        {q.counterRound === s.round && q.progressLimit > 0
          ? `Progress this round: ${q.progressThisRound} / ${q.progressLimit}`
          : "Commit every Tamed Mumak to raise the round’s progress limit from 5 to 10."}
      </span>
      <span>
        Stay ahead of the Orcs · Stage {q.enemyStage}D · {q.enemyProgress} /{" "}
        {card(q.enemyQuest).back_quest ?? 0} progress
      </span>
    </div>
  );
}
