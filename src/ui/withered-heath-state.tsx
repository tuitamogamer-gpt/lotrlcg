import type { Card, GameState } from "../game/types";
import { card } from "../game/cards";
import {
  WITHERED_HEATH as H,
  WITHERED_HEATH_MAIN_QUESTS,
  witheredHeathDragon,
  witheredHeathHosts,
  witheredHeathSigns,
  witheredHeathStageInfo,
} from "../game/withered-heath-support";
import "./withered-heath.css";
export function WitheredHeathScenarioState({
  s,
  inspect,
}: {
  s: GameState;
  inspect: (c: Card) => void;
}) {
  const q = s.witheredHeath;
  if (!q) return null;
  const info = witheredHeathStageInfo(s),
    dragon = witheredHeathDragon(s),
    signs = witheredHeathSigns(s),
    hosts = witheredHeathHosts(s),
    dealt = q.damageRound === s.round ? q.damageTaken : 0,
    currentQuestCard = { ...card(q.currentQuest), initialReverse: true };
  return (
    <section
      className="withered-heath-state"
      data-scenario-panel="withered-heath"
      aria-label="The Withered Heath dragon hunt"
    >
      <div>
        <strong>
          Stage {s.stage}B · {info?.name}
        </strong>
        <button onClick={() => inspect(currentQuestCard)}>
          Inspect current quest
        </button>
        <span>
          {s.stage === 4
            ? "Defeat Cold-Drake to win."
            : `Quest progress · ${s.progress} / ${info?.quest}`}
        </span>
        {(s.stage === 1 || s.stage === 3) && (
          <span>
            Need {s.stage === 1 ? 1 : 3} Dragon Sign{s.stage === 3 ? "s" : ""}{" "}
            in victory to advance.
          </span>
        )}
        {s.stage === 2 && (
          <span>Cold-Drake must have no hit points remaining to advance.</span>
        )}
      </div>
      <div>
        <strong>Dragon Signs · {signs} / 4 in victory</strong>
        <span>Caves deck · {q.cavesDeck.length} face-down cards</span>
        <span>Set aside · {q.setAside.length} cards</span>
        <button onClick={() => inspect(card(H.sign))}>
          Inspect Dragon Sign
        </button>
        {q.guards.map((g) => (
          <span key={g.sign.id}>
            Dragon Sign guarded by{" "}
            {card(hosts.find((u) => u.id === g.guardId)?.code ?? H.sign).name} ·
            Guard immune to player card effects
          </span>
        ))}
        <span>
          {s.stage === 2
            ? "Deep is ignored during this stage."
            : "After travel to a Deep location, replace it with the next Caves card."}
        </span>
      </div>
      <div>
        <strong>
          Cold-Drake · {dragon ? `${dragon.damage} / 18 damage` : "Defeated"}
        </strong>
        <button onClick={() => inspect(card(H.drake))}>
          Inspect Cold-Drake
        </button>
        {s.stage === 1 && (
          <span>Set aside until the first Dragon Sign is found.</span>
        )}
        {s.stage === 2 && (
          <>
            <span>In staging · Considered engaged with each player</span>
            <span>Damage this round · {dealt} / 6</span>
          </>
        )}
        {s.stage === 3 && (
          <span>Set aside · Heals 3 damage at the end of each round</span>
        )}
        {s.stage === 4 && (
          <>
            <span>
              Damage this round · {dealt} / {signs}
            </span>
            <span>
              At the beginning of the quest phase, returns to staging and
              attacks every player.
            </span>
          </>
        )}
        <span>Cannot have attachments or take non-combat damage.</span>
      </div>
      <details>
        <summary>Printed quest cards · Both faces</summary>
        {WITHERED_HEATH_MAIN_QUESTS.map((code, i) => (
          <button key={code} onClick={() => inspect(card(code))}>
            {i + 1}A/B · {card(code).name}
          </button>
        ))}
      </details>
    </section>
  );
}
export function WitheredHeathQuestGoals({ s }: { s: GameState }) {
  const q = s.witheredHeath,
    info = witheredHeathStageInfo(s);
  if (!q || !info) return null;
  return (
    <div className="quest-goals" data-withered-heath-quest-goals>
      {s.stage !== 4 && (
        <span className={s.progress >= info.quest ? "done" : ""}>
          Quest progress · {s.progress} / {info.quest}
        </span>
      )}
      <span>
        Dragon Signs in victory · {witheredHeathSigns(s)} /{" "}
        {s.stage < 3 ? 1 : 3}
      </span>
      {s.stage === 2 && (
        <span>Place 18 damage on Cold-Drake; maximum 6 each round.</span>
      )}
      {s.stage === 4 && (
        <span>
          Defeat Cold-Drake · Damage each round is limited to Dragon Signs in
          victory.
        </span>
      )}
    </div>
  );
}
