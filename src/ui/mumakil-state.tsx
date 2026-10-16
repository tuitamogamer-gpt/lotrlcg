import type { Card, GameState } from "../game/types";
import { card } from "../game/cards";
import { stats } from "../game/core";
import { allEngaged, ownerOf, playerOrder, seatName } from "../game/table";
import {
  MUMAKIL,
  MUMAKIL_CAPTURES,
  mumakilStageInfo,
} from "../game/mumakil-support";
import "./mumakil.css";

export function MumakilScenarioState({
  s,
  inspect,
}: {
  s: GameState;
  inspect: (c: Card) => void;
}) {
  const q = s.mumakil;
  if (!q) return null;
  const stage = mumakilStageInfo(s);
  const engaged = allEngaged(s);
  const enemies = [...s.staging, ...engaged].filter(
    (u) => card(u.code).type_code === "enemy",
  );
  const wild = enemies.filter((u) => u.code === MUMAKIL.wild);
  const captures = [
    ...s.staging.filter((u) => MUMAKIL_CAPTURES.includes(u.code)),
    ...enemies.flatMap((u) =>
      u.attachments.filter((a) => MUMAKIL_CAPTURES.includes(a.code)),
    ),
  ];
  const captured = (s.victoryCards ?? []).filter(
    (code) => code === MUMAKIL.wild,
  ).length;
  return (
    <section
      className="mumakil-scenario-state"
      data-scenario-panel="mumakil"
      aria-label="The Mûmakil hunt"
    >
      <div className="mumakil-journey">
        <strong>{stage?.name ?? "The Mûmakil"}</strong>
        {stage && (
          <button onClick={() => inspect(card(stage.cardCode))}>
            Inspect current quest
          </button>
        )}
        <span>
          Quest progress · {s.progress} /{" "}
          {stage?.quest ?? (s.stage === 1 ? 12 : 8)}
        </span>
        {s.stage === 1 ? (
          <span>
            Wild Mûmak in play · {wild.length} / {playerOrder(s).length}
          </span>
        ) : (
          <span>
            Win with 8 quest progress and no Capture objectives in play.
          </span>
        )}
        <span data-mumakil-captured>Captured Mûmakil · {captured}</span>
        <span data-mumakil-objectives>
          Capture objectives in play · {captures.length}
        </span>
        <span>
          Set aside · {q.setAside.filter((u) => u.code === MUMAKIL.wild).length}{" "}
          Mûmakil ·{" "}
          {q.setAside.filter((u) => MUMAKIL_CAPTURES.includes(u.code)).length}{" "}
          Capture objectives
        </span>
      </div>
      {wild.map((u) => {
        const damage =
          q.damageThisRound.find((p) => p.id === u.id && p.round === s.round)
            ?.amount ?? 0;
        const isEngaged = engaged.some((enemy) => enemy.id === u.id);
        return (
          <div className="mumakil-journey" data-mumakil-wild key={u.id}>
            <button onClick={() => inspect(card(u.code))}>
              <strong>{card(u.code).name}</strong>
            </button>
            <span>
              {isEngaged
                ? `Engaged with ${seatName(s, ownerOf(s, u))}`
                : "In the staging area"}
            </span>
            <span>
              Damage · {u.damage} / {stats(s, u).health}
            </span>
            <span>
              {u.blanked
                ? "Printed abilities are blanked."
                : `Damage this round · ${damage} / 3`}
            </span>
            {u.attachments
              .filter((a) => MUMAKIL_CAPTURES.includes(a.code))
              .map((a) => (
                <button key={a.id} onClick={() => inspect(card(a.code))}>
                  {card(a.code).name}
                </button>
              ))}
          </div>
        );
      })}
      {s.staging.some((u) => MUMAKIL_CAPTURES.includes(u.code)) && (
        <div className="mumakil-journey">
          <strong>Capture objectives in staging</strong>
          {s.staging
            .filter((u) => MUMAKIL_CAPTURES.includes(u.code))
            .map((u) => (
              <button key={u.id} onClick={() => inspect(card(u.code))}>
                {card(u.code).name}
              </button>
            ))}
        </div>
      )}
    </section>
  );
}
