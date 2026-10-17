import type { Card, GameState } from "../game/types";
import { card } from "../game/cards";
import {
  allCharacters,
  allEngaged,
  allActiveLocations,
  seatName,
  ownerOf,
} from "../game/table";
import {
  ROAM_RHOVANION as R,
  ROAM_RHOVANION_QUEST_CODES,
  roamRhovanionStageInfo,
} from "../game/roam-rhovanion-support";
import "./roam-rhovanion.css";
const instructions = (s: GameState) =>
  s.stage === 1
    ? "Explore the active location while the first player controls Urdug to follow a random task. Progress cannot be placed on staging locations."
    : s.stage === 3
      ? "Defeat Tiny to make Urdug vulnerable, then deal 5 damage to Urdug. Failed quests place progress here; 5 progress loses the game."
      : s.roamRhovanion?.currentQuest === R.rescue
        ? "Place 5 quest progress to unlock Tiny's Grey Moorland. Explore his guard and recover Tiny while the first player controls Urdug."
        : s.roamRhovanion?.currentQuest === R.hornQuest
          ? "Place 5 quest progress to make the Giant guarding the horn vulnerable. Defeat the Giant and return the horn to Urdug."
          : "Place 5 quest progress to unlock the Deep Ravine guarding Durin's Key. Explore it and attach the key to the first player's hero.";
export function RoamRhovanionScenarioState({
  s,
  inspect,
}: {
  s: GameState;
  inspect: (c: Card) => void;
}) {
  const q = s.roamRhovanion;
  if (!q) return null;
  const stage = roamRhovanionStageInfo(s),
    hosts = [...s.staging, ...allEngaged(s), ...allActiveLocations(s)],
    companions = allCharacters(s).filter((u) =>
      [R.urdug, R.tiny].includes(u.code),
    );
  return (
    <section
      className="roam-rhovanion-state"
      data-scenario-panel="roam-rhovanion"
      aria-label="Urdug's journey across Rhovanion"
    >
      <div>
        <strong>
          Stage {s.stage}B · {stage?.name}
        </strong>
        <span>
          Quest progress · {s.progress} / {stage?.quest}
        </span>
        <p>{instructions(s)}</p>
        <button
          onClick={() =>
            inspect({ ...card(q.currentQuest), initialReverse: true } as Card)
          }
        >
          Inspect current quest
        </button>
      </div>
      <div>
        <strong>
          {s.stage === 3
            ? "The Goblin's betrayal"
            : "Urdug's companions and treasures"}
        </strong>
        {companions.map((u) => (
          <span key={u.id}>
            <button onClick={() => inspect(card(u.code))}>
              {card(u.code).name}
            </button>{" "}
            · {seatName(s, ownerOf(s, u))} · {u.damage} damage
            {u.exhausted ? " · Exhausted" : ""}
          </span>
        ))}
        {q.guarded.map((g) => (
          <span key={g.card.id}>
            <button onClick={() => inspect(card(g.card.code))}>
              {card(g.card.code).name}
            </button>{" "}
            · Guarded by{" "}
            {card(hosts.find((h) => h.id === g.guardId)?.code ?? R.ravine).name}
          </span>
        ))}
        {s.stage === 3 &&
          hosts
            .filter((u) => [R.urdugEnemy, R.tinyEnemy].includes(u.code))
            .map((u) => (
              <span key={u.id}>
                <button onClick={() => inspect(card(u.code))}>
                  {card(u.code).name}
                </button>{" "}
                · {u.damage} / {card(u.code).health} damage
              </span>
            ))}
        {q.guardedPlayerCards.map((g) => (
          <span key={g.card.id}>
            Hobgoblin guards{" "}
            <button onClick={() => inspect(card(g.card.code))}>
              {card(g.card.code).name}
            </button>{" "}
            · {seatName(s, g.player)}
          </span>
        ))}
        {q.storedCards.map((g, i) => (
          <span key={`${g.locationId}-${i}`}>
            Lonely Lands · {g.cards.length} facedown event
            {g.cards.length === 1 ? "" : "s"}
          </span>
        ))}
        <span>
          Tasks completed ·{" "}
          {
            q.completedQuests.filter((c) =>
              [R.rescue, R.hornQuest, R.keyQuest].includes(c),
            ).length
          }{" "}
          / 3
        </span>
      </div>
      <details>
        <summary>Printed quest cards · Both faces</summary>
        {ROAM_RHOVANION_QUEST_CODES.map((code) => (
          <button key={code} onClick={() => inspect(card(code))}>
            {card(code).name}
          </button>
        ))}
      </details>
    </section>
  );
}
export function RoamRhovanionQuestGoals({ s }: { s: GameState }) {
  if (!s.roamRhovanion) return null;
  return (
    <div className="quest-goals" data-roam-rhovanion-quest-goals>
      <span>
        {s.stage === 1
          ? "Explore the active location"
          : s.stage === 3
            ? `Escape progress: ${s.progress} / 5 (lose at 5)`
            : `Quest progress: ${s.progress} / 5`}
      </span>
      <span>{instructions(s)}</span>
    </div>
  );
}
