import type { Card, GameState } from "../game/types";
import { card } from "../game/cards";
import { get, stageInfo } from "../game/core";
import { UMBAR } from "../game/escape-umbar-support";
import "./harad.css";

export function HaradScenarioState({
  s,
  inspect,
}: {
  s: GameState;
  inspect: (c: Card) => void;
}) {
  if (!s.umbar && !s.desertCrossing && !s.mordor) return null;
  const stage = stageInfo(s);
  const questCode = "cardCode" in stage ? stage.cardCode : undefined;
  const pursuit = s.staging.find((u) => u.code === UMBAR.seize);
  return (
    <section
      className="harad-scenario-state"
      data-scenario-panel="harad"
      aria-label="The Sands of Harad journey"
    >
      <div className="harad-journey">
        <strong>{stage.name}</strong>
        {questCode && (
          <button onClick={() => inspect(card(questCode))}>
            Inspect current quest
          </button>
        )}
        <span>
          Quest progress · {s.progress}
          {stage.quest ? ` / ${stage.quest}` : ""}
        </span>
      </div>
      {s.umbar && (
        <div className="harad-journey" data-harad-umbar>
          <strong>Escape from Umbar</strong>
          {pursuit && (
            <button onClick={() => inspect(card(pursuit.code))}>
              “Seize them!” · {pursuit.progress} progress
            </button>
          )}
          {s.umbar.underAlley.length > 0 && (
            <span>
              {s.umbar.underAlley.reduce((n, a) => n + a.enemies.length, 0)}{" "}
              enemies underneath Narrow Alleyway
            </span>
          )}
        </div>
      )}
      {s.desertCrossing && (
        <div className="harad-journey" data-harad-temperature>
          <strong>Temperature · {s.desertCrossing.temperature} / 60</strong>
          <meter
            min={0}
            max={60}
            low={20}
            high={40}
            optimum={10}
            value={Math.min(60, s.desertCrossing.temperature)}
            aria-label="Desert temperature"
          />
          <span>At 60 temperature, the players lose the game.</span>
        </div>
      )}
      {s.mordor && (
        <div className="harad-journey" data-harad-captured>
          <strong>Captured heroes · {s.mordor.captured.length}</strong>
          {s.mordor.captured.map((hero) => {
            const guard = get(s, s.mordor!.guarding[hero.id]);
            return (
              <button key={hero.id} onClick={() => inspect(card(hero.code))}>
                {card(hero.code).name} · Player {(hero.owner ?? 0) + 1}
                {hero.damage ? ` · ${hero.damage} damage` : ""}
                {guard ? ` · guarded by ${card(guard.code).name}` : ""}
              </button>
            );
          })}
          <span>
            If a Harad objective-hero leaves play, its controller is eliminated.
          </span>
        </div>
      )}
    </section>
  );
}
