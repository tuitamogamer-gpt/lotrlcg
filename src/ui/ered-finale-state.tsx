import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { stats } from "../game/core";
import { allCharacters, allEngaged, seatName } from "../game/table";
import {
  GUNDABAD,
  MOUNT_GUNDABAD_ALL_QUESTS,
  gundabadDragon,
  gundabadQuestCount,
  gundabadX,
  mountGundabadStageInfo,
} from "../game/mount-gundabad-support";
import {
  FATE_WILDERLAND,
  FATE_WILDERLAND_QUESTS,
  fateWilderlandPublicState,
  fateWilderlandStageInfo,
} from "../game/fate-wilderland-support";
import "./ered-finale.css";
import { currentQuestInspection, type InspectedCard } from "./quest-inspection";

type Props = { s: GameState; inspect: (c: InspectedCard) => void };

export function MountGundabadQuestGoals({ s }: { s: GameState }) {
  const q = s.mountGundabad;
  if (!q) return null;
  return (
    <div className="quest-goals" data-gundabad-quest-goals>
      <span>
        {s.stage === 1
          ? "At the end of planning, choose a path into Gundabad."
          : q.questFront
            ? "This passage turns to side B at the beginning of the quest phase."
            : "Explore The First Forge to reforge Wormsbane. At The Great Worm, resolve an attack against Dagnir with no hit points remaining, then use the printed response to win."}
      </span>
    </div>
  );
}

export function MountGundabadScenarioState({ s, inspect }: Props) {
  const q = s.mountGundabad;
  if (!q) return null;
  const stage = mountGundabadStageInfo(s);
  const dragon = gundabadDragon(s);
  const bearer = allCharacters(s).find((u) =>
    u.attachments.some((a) => a.code === GUNDABAD.sword),
  );
  const victoryQuests = gundabadQuestCount(s);
  const limit = gundabadX(s);
  const damage = q.damageRound === s.round ? q.damageTaken : 0;
  return (
    <section
      className="ered-finale-state"
      data-scenario-panel="mount-gundabad"
      aria-label="Mount Gundabad scenario state"
    >
      <div className="ered-finale-summary">
        <strong>
          Stage {s.stage}
          {q.questFront ? "A" : "B"} · {stage?.name}
        </strong>
        <button
          onClick={() =>
            inspect(currentQuestInspection(s, card(q.currentQuest)))
          }
        >
          Inspect current quest · {q.questFront ? "Side A" : "Both faces"}
        </button>
        {!q.questFront && !!stage?.quest && (
          <span>
            Quest progress · {s.progress} / {stage.quest}
          </span>
        )}
        <MountGundabadQuestGoals s={s} />
      </div>
      <div className="ered-finale-summary" data-gundabad-decks>
        <strong>Passages and Caves</strong>
        <span>Quest deck · {q.questDeck.length} face-down cards</span>
        <span>Caves deck · {q.cavesDeck.length} face-down cards</span>
        <span>
          Quest cards in victory · {victoryQuests} · X = {limit}
        </span>
        <span>
          Deep replaces the traveled-to location with the next Caves card.
        </span>
        {q.completedQuests.map((code) => (
          <button
            key={code}
            onClick={() => inspect({ ...card(code), initialReverse: true })}
          >
            Completed · {card(code).back_name ?? card(code).name}
          </button>
        ))}
        {q.guardedPlayerCards.map((held) => (
          <span key={held.card.id}>
            Hobgoblin guard · {seatName(s, held.player)} · 1 captured card
          </span>
        ))}
      </div>
      <div className="ered-finale-summary" data-gundabad-dragon>
        <strong>
          Dagnir ·{" "}
          {dragon
            ? `${dragon.damage} / ${stats(s, dragon).health} damage`
            : "In victory"}
        </strong>
        <span>
          Damage counted this round · {damage} / {limit}
        </span>
        <span>
          {victoryQuests >= 5
            ? "In staging · Considered engaged with each player"
            : "Indestructible · Immune to player card effects"}
        </span>
        <button onClick={() => inspect(card(GUNDABAD.dagnir))}>
          Inspect Dagnir
        </button>
        <strong>Wormsbane · {q.reforged ? "Reforged" : "Broken"}</strong>
        <span>
          {bearer
            ? `${card(bearer.code).name} · ${seatName(s, bearer.owner ?? 0)}`
            : "No bearer in play"}
        </span>
        <span>If its attached hero leaves play, the players lose.</span>
        <button
          onClick={() =>
            inspect({ ...card(GUNDABAD.sword), initialReverse: q.reforged })
          }
        >
          Inspect Wormsbane · Both faces
        </button>
        <button onClick={() => inspect(card(GUNDABAD.forge))}>
          Inspect The First Forge
        </button>
      </div>
      <details className="ered-finale-reference">
        <summary>Printed quest reference · Both faces</summary>
        <div>
          {MOUNT_GUNDABAD_ALL_QUESTS.map((code) => (
            <button key={code} onClick={() => inspect(card(code))}>
              {card(code).back_name ?? card(code).name}
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}

export function FateWilderlandQuestGoals({ s }: { s: GameState }) {
  if (!s.fateWilderland) return null;
  return (
    <div className="quest-goals" data-wilderland-quest-goals>
      <span>
        Defeat Urdug to win. He can take damage only after resolving an attack
        this phase.
      </span>
      <span>
        Stage thresholds are checked at the end of the round; quest progress
        does not advance these stages.
      </span>
    </div>
  );
}

export function FateWilderlandScenarioState({ s, inspect }: Props) {
  const q = s.fateWilderland;
  const view = fateWilderlandPublicState(s);
  if (!q || !view) return null;
  const stage = fateWilderlandStageInfo(s);
  const urdug = [...s.staging, ...allEngaged(s)].find(
    (u) => u.code === FATE_WILDERLAND.urdug,
  );
  return (
    <section
      className="ered-finale-state"
      data-scenario-panel="fate-wilderland"
      aria-label="The Fate of Wilderland scenario state"
    >
      <div className="ered-finale-summary">
        <strong>
          Stage {s.stage}B · {stage?.name}
        </strong>
        <button
          onClick={() =>
            inspect({ ...card(q.currentQuest), initialReverse: true })
          }
        >
          Inspect current quest · Both faces
        </button>
        <FateWilderlandQuestGoals s={s} />
      </div>
      <div className="ered-finale-summary" data-wilderland-assault>
        <strong>The Goblins’ Assault · {view.assaultProgress} progress</strong>
        <span>
          {s.stage === 3
            ? "End-of-round defeat threshold"
            : "End-of-round advance threshold"}{" "}
          · {view.assaultLimit}
        </span>
        <span>
          {s.stage === 1
            ? "At round end, add 1 progress for each enemy in staging."
            : s.stage === 2
              ? "After an enemy attacks, add 1 progress."
              : "At round end, add 1 progress for each enemy in play."}
        </span>
        <span>An unsuccessful quest adds 1 progress per player.</span>
        <button onClick={() => inspect(card(FATE_WILDERLAND.assault))}>
          Inspect The Goblins’ Assault
        </button>
      </div>
      <div className="ered-finale-summary" data-wilderland-defense>
        <strong>
          The Heroes’ Defense · {view.defenseResources} / {view.defenseGoal}{" "}
          resources
        </strong>
        <span>
          {view.defenseResources >= view.defenseGoal
            ? "Urdug is considered engaged with each player."
            : "After an enemy is destroyed, use the response to add 1 resource."}
        </span>
        <button onClick={() => inspect(card(FATE_WILDERLAND.defense))}>
          Inspect The Heroes’ Defense
        </button>
        <strong>
          Urdug ·{" "}
          {urdug
            ? `${urdug.damage} / ${stats(s, urdug).health} damage`
            : "Defeated"}
        </strong>
        <span>
          {view.urdugCanTakeDamage
            ? "Urdug has resolved an attack this phase and can take damage."
            : "Urdug cannot take damage until he resolves an attack this phase."}
        </span>
        {urdug && (
          <span>
            Defense · {stats(s, urdug).defense} · Includes +2 for each other
            enemy in play
          </span>
        )}
        <button onClick={() => inspect(card(FATE_WILDERLAND.urdug))}>
          Inspect Urdug
        </button>
        {view.storedCards.map((held) => (
          <span key={`${held.locationId}:${held.player}`}>
            Lonely Lands · {seatName(s, held.player)} · {held.count} stored
            event{held.count === 1 ? "" : "s"}
          </span>
        ))}
      </div>
      <details className="ered-finale-reference">
        <summary>Printed quest reference · Both faces</summary>
        <div>
          {FATE_WILDERLAND_QUESTS.map((c) => (
            <button key={c.code} onClick={() => inspect(c)}>
              {c.name}
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}
