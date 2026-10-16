import type { Card, GameState } from "../game/types";
import { card } from "../game/cards";
import {
  CIRITH_GURAT_MAIN_QUESTS,
  CIRITH_GURAT,
  cirithGuratStageInfo,
} from "../game/cirith-gurat-support";
import { allActiveLocations, allEngaged, seatName } from "../game/table";
import "./cirith-gurat.css";
export function CirithGuratScenarioState({
  s,
  inspect,
}: {
  s: GameState;
  inspect: (c: Card) => void;
}) {
  const q = s.cirithGurat;
  if (!q) return null;
  const stage = cirithGuratStageInfo(s);
  const hosts = [...s.staging, ...allEngaged(s), ...allActiveLocations(s)];
  const abaan = q.captives.find((u) => u.code === CIRITH_GURAT.abaan);
  return (
    <section
      className="cirith-gurat-state"
      data-scenario-panel="cirith-gurat"
      aria-label="The prisoners of Cirith Gurat"
    >
      <div className="cirith-gurat-summary">
        <strong>
          Stage {s.stage}B · {stage?.name}
        </strong>
        <span>
          Quest progress · {s.progress} / {stage?.quest}
        </span>
        <button
          onClick={() =>
            inspect({ ...card(q.currentQuest), initialReverse: true } as Card)
          }
        >
          Inspect current quest
        </button>
        <span>
          {s.stage === 2
            ? `Quiet rounds · ${q.sneakResources} / 2. Enemies in staging cannot take damage and gain engagement cost equal to quest progress.`
            : `Rescue every guarded objective before ${s.stage === 3 ? "winning" : "advancing"}.`}
        </span>
      </div>
      <div className="cirith-gurat-summary">
        <strong>Captives · {q.captives.length}</strong>
        <span>
          {abaan
            ? "Abaan is held captive."
            : "Abaan is free. Keep him in play to protect the rescue."}
        </span>
        {q.captives.length ? (
          <ul>
            {q.captives.map((u) => (
              <li key={u.id}>
                <button onClick={() => inspect(card(u.code))}>
                  {card(u.code).name}
                </button>
                <span>
                  {seatName(s, u.owner ?? 0)} · Guarded by{" "}
                  {hosts.find((h) => h.id === q.guarding[u.id])
                    ? card(hosts.find((h) => h.id === q.guarding[u.id])!.code)
                        .name
                    : "the selected guard"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <span>All prisoners are free.</span>
        )}
      </div>
      <details>
        <summary>Printed quest cards · Both faces</summary>
        {CIRITH_GURAT_MAIN_QUESTS.map((code, i) => (
          <button key={code} onClick={() => inspect(card(code))}>
            {i + 1}A/B · {card(code).name}
          </button>
        ))}
      </details>
    </section>
  );
}
export function CirithGuratQuestGoals({ s }: { s: GameState }) {
  const q = s.cirithGurat;
  if (!q) return null;
  return (
    <div className="quest-goals" data-cirith-gurat-quest-goals>
      <span>
        Quest progress: {s.progress} / {s.stage === 2 ? 15 : 10}
      </span>
      <span>
        {s.stage === 2
          ? `Quiet rounds: ${q.sneakResources} / 2`
          : `Captives remaining: ${q.captives.length}`}
      </span>
      <span>
        {s.stage === 2
          ? "Avoid engaging enemies to earn a resource at round end."
          : "Defeat guards and explore cells to rescue the prisoners."}
      </span>
    </div>
  );
}
