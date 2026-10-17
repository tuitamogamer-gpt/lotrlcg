import type { Card, GameState } from "../game/types";
import { card } from "../game/cards";
import {
  FIRE_NIGHT as F,
  FIRE_NIGHT_SIDE_QUESTS,
  fireNightSideCount,
} from "../game/fire-night-support";
import "./fire-night.css";

export function FireNightScenarioState({
  s,
  inspect,
}: {
  s: GameState;
  inspect: (c: Card) => void;
}) {
  const q = s.fireNight;
  if (!q) return null;
  const dragon = s.staging.find((u) => u.code === F.dagnir),
    count = fireNightSideCount(s),
    cap = count + 1;
  const dealt =
    q.nonQuestDamage.round === s.round ? q.nonQuestDamage.amount : 0;
  return (
    <section
      className="fire-night-state"
      data-scenario-panel="fire-night"
      aria-label="Defend Hrogar’s Hill"
    >
      <div className="fire-night-summary">
        <strong>Hrogar’s Hill · {q.hillDamage} / 50 damage</strong>
        <meter
          min={0}
          max={50}
          value={q.hillDamage}
          aria-label="Damage to Hrogar’s Hill"
        />
        <span>
          The town falls at 50 damage. At the end of planning, reveal a side
          quest; Dagnir attacks the town without a shadow card.
        </span>
        <button
          onClick={() =>
            inspect({ ...card(F.hill), initialReverse: true } as Card)
          }
        >
          Inspect Hrogar’s Hill · Both faces
        </button>
      </div>
      <div className="fire-night-summary">
        <strong>Dagnir · {dragon?.damage ?? 0} / 20 damage</strong>
        <span>
          {count >= 3
            ? "Engaged with each player"
            : `Engages each player after 3 side quests are defeated · ${count} / 3`}
        </span>
        <span>
          Non-quest damage this round · {dealt} / {cap}. Face the Dragon deals 5
          quest damage outside this limit.
        </span>
        <button onClick={() => inspect(card(F.dagnir))}>Inspect Dagnir</button>
      </div>
      <div className="fire-night-summary">
        <strong>Side quests · {count} defeated</strong>
        <span>
          {q.sideDeck.length} facedown side quests remain. The first player
          chooses the current quest each quest phase.
        </span>
        <span>Dagnir and Burning Watchtower have {cap} threat.</span>
      </div>
      <details className="fire-night-reference">
        <summary>Side quest reference · Printed cards</summary>
        <div>
          {FIRE_NIGHT_SIDE_QUESTS.map((code) => (
            <button key={code} onClick={() => inspect(card(code))}>
              {card(code).name}
              {s.victoryCards?.includes(code) ? " · Defeated" : ""}
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}
export function FireNightQuestGoals({ s }: { s: GameState }) {
  if (!s.fireNight) return null;
  const dragon = s.staging.find((u) => u.code === F.dagnir);
  return (
    <div className="quest-goals" data-fire-night-quest-goals>
      <span>Save the town · {s.fireNight.hillDamage} / 50 damage</span>
      <span className={(dragon?.damage ?? 0) >= 20 ? "done" : ""}>
        Drive off Dagnir · {dragon?.damage ?? 0} / 20 damage
      </span>
    </div>
  );
}
