import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { allCharacters, allEngaged, seatName } from "../game/table";
import {
  WILDS_RHOVANION as W,
  WILDS_RHOVANION_QUESTS,
  WILDS_OBJECTIVE_LOCATIONS,
  wildsRhovanionStageInfo,
} from "../game/wilds-rhovanion-support";
import "./wilds-rhovanion.css";
export function WildsRhovanionScenarioState({
  s,
  onInspect,
}: {
  s: GameState;
  onInspect: (code: string) => void;
}) {
  const q = s.wildsRhovanion;
  if (!q) return null;
  const stage = wildsRhovanionStageInfo(s),
    enemies = [...s.staging, ...allEngaged(s)],
    guards = [
      ...enemies,
      ...(s.activeLocation ? [s.activeLocation] : []),
      ...(s.extraActiveLocations ?? []),
    ],
    haldan = [...s.staging, ...allCharacters(s)].find(
      (u) => u.code === W.haldan,
    ),
    dragon = enemies.find((u) => u.code === W.drake),
    nemesis = enemies.find((u) => u.id === q.nemesisId);
  const quests = WILDS_RHOVANION_QUESTS.filter(
    (c) => c.encounter_set === card(q.currentQuest).encounter_set,
  );
  return (
    <section
      className="wilds-rhovanion-state"
      data-scenario-panel="wilds-rhovanion"
      aria-label="The Wilds of Rhovanion scenario state"
    >
      <div className="wilds-rhovanion-summary">
        <strong>
          Stage {s.stage} · {stage?.name}
        </strong>
        <button onClick={() => onInspect(q.currentQuest)}>
          Inspect current quest · Both faces
        </button>
        <span>
          Quest progress · {s.progress}
          {stage?.quest ? ` / ${stage.quest}` : ""}
        </span>
        <WildsRhovanionQuestGoals s={s} />
      </div>
      {s.scenarioId === "journey-up-the-anduin" && (
        <div className="wilds-rhovanion-summary" data-wilds-evil>
          <strong>Evil Creatures</strong>
          <span>
            Deck · {q.evilDeck.length} cards · Discard · {q.evilDiscard.length}{" "}
            cards
          </span>
          <span>Stage resources · {q.questResources}</span>
          {q.evilDiscard.map((code, i) => (
            <button key={i} onClick={() => onInspect(code)}>
              {card(code).name} · Evil Creatures discard
            </button>
          ))}
          <span>
            Haldan ·{" "}
            {haldan
              ? q.haldanGuardId
                ? "Guarded"
                : "Rescued"
              : "At Woodmen Village"}
          </span>
          {haldan && (
            <button onClick={() => onInspect(W.haldan)}>Inspect Haldan</button>
          )}
        </div>
      )}
      {s.scenarioId === "lost-in-mirkwood" && (
        <div className="wilds-rhovanion-summary" data-wilds-search>
          <strong>Searching for a Way Out</strong>
          <button onClick={() => onInspect(W.searching)}>
            Inspect Searching for a Way Out
          </button>
          {s.staging
            .filter((u) => WILDS_OBJECTIVE_LOCATIONS.includes(u.code))
            .map((u) => (
              <button key={u.id} onClick={() => onInspect(u.code)}>
                {card(u.code).name} ·{" "}
                {guards.some(
                  (e) => e.guarding === u.id || e.cobasGuarding?.includes(u.id),
                ) || q.pendingGuarded.includes(u.id)
                  ? "Guarded"
                  : "Free to travel"}
              </button>
            ))}
          {q.guardedHeroes.map((g) => (
            <button key={g.hero.id} onClick={() => onInspect(g.hero.code)}>
              {card(g.hero.code).name} · {seatName(s, g.player)} · Guarded
            </button>
          ))}
          {q.storedCards.map((g, i) => (
            <span key={i}>
              {seatName(s, g.player)} · {g.cards.length} cards stored facedown
              under a location
            </span>
          ))}
          {nemesis && (
            <button onClick={() => onInspect(nemesis.code)}>
              Nemesis · {card(nemesis.code).name} · {nemesis.damage} damage
            </button>
          )}
        </div>
      )}
      {s.scenarioId === "the-kings-quest" && (
        <div className="wilds-rhovanion-summary" data-wilds-caves>
          <strong>Caves deck · {q.cavesDeck.length} cards</strong>
          <span>
            Victory locations ·{" "}
            {
              (s.victoryCards ?? []).filter(
                (c) =>
                  card(c).type_code === "location" &&
                  (card(c).victory ?? 0) > 0,
              ).length
            }{" "}
            / 3
          </span>
          <span>
            After travel to a Deep location, replace it with the next cave.
          </span>
          <button onClick={() => onInspect(W.drake)}>Inspect Fire-drake</button>
          <span>
            Fire-drake ·{" "}
            {dragon
              ? `${dragon.damage} / 17 damage`
              : s.status === "won"
                ? "Defeated"
                : "Set aside"}
          </span>
          {q.guardedPlayerCards.map((g) => (
            <button key={g.card.id} onClick={() => onInspect(g.card.code)}>
              {card(g.card.code).name} · Guarded
            </button>
          ))}
        </div>
      )}
      <details className="wilds-rhovanion-reference">
        <summary>Original quest cards · Both faces</summary>
        <div>
          {quests.map((c) => (
            <button key={c.code} onClick={() => onInspect(c.code)}>
              {c.cost}
              {[W.orcs, W.trulyLost, W.escape].includes(c.code)
                ? "C/D"
                : "A/B"}{" "}
              · {c.name}
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}
export function WildsRhovanionQuestGoals({ s }: { s: GameState }) {
  const q = s.wildsRhovanion;
  if (!q) return null;
  let text = "";
  if (s.scenarioId === "journey-up-the-anduin")
    text =
      s.stage === 1
        ? "Reach 10 progress and defeat every Evil Creature in play."
        : s.stage === 2
          ? "Reach 5 progress and rescue Haldan for the first player."
          : "Reach 5 progress, then travel to and explore The Old Ford.";
  else if (s.scenarioId === "lost-in-mirkwood")
    text =
      s.stage < 4
        ? "Find an objective-location, defeat its guard and travel there to advance."
        : q.currentQuest === W.fear
          ? "Reach 8 progress, then defeat the nemesis."
          : "Reach 16 progress and defeat every enemy engaged with a player.";
  else
    text =
      s.stage === 1
        ? "Explore 3 locations with victory points."
        : s.stage === 2
          ? "Find Dragon Hoard in the Caves deck and make it active."
          : "Defeat Fire-drake. Remove 1 quest progress for each declared attacker.";
  return (
    <div className="quest-goals" data-wilds-quest-goals>
      <span>{text}</span>
    </div>
  );
}
