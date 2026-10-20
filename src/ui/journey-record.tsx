import { useState } from "react";
import { SCENARIOS, scenario } from "../game/scenarios";
import { summarize } from "./records";
import type { GameRecord } from "./records";
import "./journey-record.css";

function RecordedDate({ at }: { at: number }) {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? null : (
    <time dateTime={date.toISOString()}>
      {date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}
    </time>
  );
}

export function JourneyRecord({
  records,
  onClear,
}: {
  records: GameRecord[];
  onClear: () => void;
}) {
  const [allQuests, setAllQuests] = useState(false);
  const sum = summarize(records);
  const playedQuests = SCENARIOS.filter((q) => sum.byScenario[q.id]?.played);
  const quests = allQuests ? SCENARIOS : playedQuests;
  return (
    <div className="journey-record">
      <div className="records-summary">
        <div>
          <strong>{sum.played}</strong>
          <small>games</small>
        </div>
        <div>
          <strong>{sum.won}</strong>
          <small>victories</small>
        </div>
        <div>
          <strong>
            {sum.played ? Math.round((sum.won / sum.played) * 100) : 0}%
          </strong>
          <small>win rate</small>
        </div>
        <div>
          <strong>{sum.bestScore ?? "—"}</strong>
          <small>best score · lower is better</small>
        </div>
      </div>
      {records.length === 0 ? (
        <p>Finish an adventure and it will be recorded here.</p>
      ) : (
        <>
          <h3>Recent adventures</h3>
          <p className="journey-record-note">
            Your latest {Math.min(records.length, 15)} games on this device.
          </p>
          <div
            className="journey-record-scroll"
            role="region"
            tabIndex={0}
            aria-label="Recent adventure results"
          >
            <table
              className="records-table recent-adventures-table"
              aria-label="Recent adventures"
            >
              <thead>
                <tr>
                  <th scope="col">Result</th>
                  <th scope="col">Quest</th>
                  <th scope="col">Deck</th>
                  <th scope="col">Rounds</th>
                  <th scope="col">Score</th>
                </tr>
              </thead>
              <tbody>
                {[...records]
                  .reverse()
                  .slice(0, 15)
                  .map((r) => (
                    <tr key={r.key}>
                      <td>
                        <span
                          className={r.result === "won" ? "is-won" : "is-lost"}
                        >
                          {r.result === "won" ? "Won" : "Lost"}
                        </span>
                        <RecordedDate at={r.at} />
                      </td>
                      <td>
                        {scenario(r.scenarioId).shortName}
                        {r.playMode === "campaign" ? " · campaign" : ""}
                        {r.easy ? " · easy" : ""}
                      </td>
                      <td>
                        {r.deck}
                        {r.players > 1 ? ` · ${r.players} players` : ""}
                      </td>
                      <td>{r.rounds}</td>
                      <td>{r.result === "won" ? r.score : "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="journey-record-heading">
            <h3>Results by quest</h3>
            <button
              className="secondary"
              aria-pressed={allQuests}
              onClick={() => setAllQuests((value) => !value)}
            >
              {allQuests ? "Show played quests" : "Show all quests"}
            </button>
          </div>
          <p className="journey-record-note" role="status">
            {quests.length} {quests.length === 1 ? "quest" : "quests"} shown ·{" "}
            {playedQuests.length} played
          </p>
          <div
            className="journey-record-scroll"
            role="region"
            tabIndex={0}
            aria-label="Quest result totals"
          >
            <table
              className="records-table quest-results-table"
              aria-label="Results by quest"
            >
              <thead>
                <tr>
                  <th scope="col">Quest</th>
                  <th scope="col">Played</th>
                  <th scope="col">Won</th>
                </tr>
              </thead>
              <tbody>
                {quests.map((q) => (
                  <tr key={q.id}>
                    <td>{q.name}</td>
                    <td>{sum.byScenario[q.id]?.played ?? 0}</td>
                    <td>{sum.byScenario[q.id]?.won ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="modal-actions">
            <button className="secondary" onClick={onClear}>
              Clear record
            </button>
          </div>
        </>
      )}
    </div>
  );
}
