import type { Card, GameState } from "../game/types";
import { card } from "../game/cards";
import { allHeroes, allEngaged, ownerOf, seatName } from "../game/table";
import {
  BLACK_SERPENT as B,
  BLACK_SERPENT_MAIN_QUESTS,
  blackSerpentControlledObjectives,
  blackSerpentObjectives,
  blackSerpentStageInfo,
} from "../game/black-serpent-support";
import "./black-serpent.css";
export function BlackSerpentScenarioState({
  s,
  inspect,
}: {
  s: GameState;
  inspect: (c: Card) => void;
}) {
  const q = s.blackSerpent;
  if (!q) return null;
  const info = blackSerpentStageInfo(s),
    boss = [...s.staging, ...allEngaged(s)].find((u) => u.code === B.serpent);
  const controlled = blackSerpentControlledObjectives(s),
    held = blackSerpentObjectives(s),
    currentQuestCard = { ...card(q.currentQuest), initialReverse: true };
  return (
    <section
      className="black-serpent-state"
      data-scenario-panel="black-serpent"
      aria-label="The Black Serpent caravan raid"
    >
      <div>
        <strong>
          Stage {s.stage}B · {info?.name}
        </strong>
        <button onClick={() => inspect(currentQuestCard)}>
          Inspect current quest
        </button>
        <span>
          Quest progress · {s.progress} / {info?.quest}
        </span>
        <span>Claim each Harad objective in play to advance.</span>
      </div>
      <div>
        <strong>Harad objectives · {controlled.length} controlled</strong>
        <span>Set aside · {q.setAside.length}</span>
        {held.map(({ host, attachment: a }) => (
          <span key={a.id}>
            <button onClick={() => inspect(card(a.code))}>
              {card(a.code).name}
            </button>
            {allHeroes(s).some((h) => h.id === host.id)
              ? `Claimed by ${seatName(s, ownerOf(s, host))} · ${card(host.code).name}`
              : `Attached to ${card(host.code).name}`}
            {a.exhausted ? " · Exhausted" : ""}
          </span>
        ))}
        <span>
          Unguarded objectives attach to a hero controlled by the first player.
        </span>
      </div>
      <div>
        <strong>The Black Serpent</strong>
        <button onClick={() => inspect(card(B.serpent))}>
          Inspect The Black Serpent
        </button>
        <span>{boss ? `${boss.damage} / 8 damage` : "Defeated"}</span>
        <span>
          {boss?.blanked
            ? "Printed abilities are blanked."
            : s.stage === 3 && s.progress >= 6
              ? "The Serpent can leave staging and take damage."
              : "The Serpent cannot leave staging or take damage."}
        </span>
        {s.stage === 2 && (
          <span>
            Considered engaged with each player controlling a Harad objective.
          </span>
        )}
        <span>
          End of encounter phase · Remove {s.stage} quest progress or face an
          attack against the first player.
        </span>
      </div>
      <details>
        <summary>Printed quest cards · Both faces</summary>
        {BLACK_SERPENT_MAIN_QUESTS.map((code, i) => (
          <button key={code} onClick={() => inspect(card(code))}>
            {i + 1}A/B · {card(code).name}
          </button>
        ))}
      </details>
    </section>
  );
}
export function BlackSerpentQuestGoals({ s }: { s: GameState }) {
  const q = s.blackSerpent,
    info = blackSerpentStageInfo(s);
  if (!q || !info) return null;
  return (
    <div className="quest-goals" data-black-serpent-quest-goals>
      <span className={s.progress >= info.quest ? "done" : ""}>
        Quest progress · {s.progress} / {info.quest}
      </span>
      <span>Every Harad objective in play must be attached to a hero.</span>
      {s.stage === 3 && (
        <span>
          Reach 6 progress, defeat the Serpent and claim the final objective.
        </span>
      )}
    </div>
  );
}
