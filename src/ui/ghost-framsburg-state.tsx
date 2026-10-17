import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { allEngaged, seatName } from "../game/table";
import {
  ghostControlledLoot,
  ghostDiscoverValue,
} from "../game/ghost-framsburg";
import {
  GHOST_FRAMSBURG as G,
  GHOST_FRAMSBURG_QUEST_CHAIN,
  ghostFramsburgStageInfo,
} from "../game/ghost-framsburg-support";
import "./ghost-framsburg.css";
export function GhostFramsburgQuestGoals({ s }: { s: GameState }) {
  if (!s.ghostFramsburg) return null;
  return (
    <div className="quest-goals" data-ghost-quest-goals>
      <span>
        {s.stage === 1
          ? "Reach 6 progress and control at least 1 Loot objective."
          : s.stage === 2
            ? "Reach 12 progress and control at least 2 Loot objectives."
            : "Control all 3 Loot objectives to travel to The Cursed Tomb. Explore it, defeat Fram’s Shade and reach 6 quest progress."}
      </span>
    </div>
  );
}
export function GhostFramsburgScenarioState({
  s,
  onInspect,
}: {
  s: GameState;
  onInspect: (code: string) => void;
}) {
  const q = s.ghostFramsburg;
  if (!q) return null;
  const stage = ghostFramsburgStageInfo(s),
    loot = ghostControlledLoot(s),
    guards = [
      ...s.staging,
      ...allEngaged(s),
      ...(s.activeLocation ? [s.activeLocation] : []),
    ],
    shade = guards.find((u) => u.code === G.shade);
  return (
    <section
      className="ghost-framsburg-state"
      data-scenario-panel="ghost-framsburg"
      aria-label="The Ghost of Framsburg scenario state"
    >
      <div className="ghost-framsburg-summary">
        <strong>
          Stage {s.stage} · {stage?.name}
        </strong>
        <button onClick={() => onInspect(q.currentQuest)}>
          Inspect current quest · Both faces
        </button>
        <span>
          Quest progress · {s.progress} / {stage?.quest}
        </span>
        <GhostFramsburgQuestGoals s={s} />
      </div>
      <div className="ghost-framsburg-summary" data-ghost-loot>
        <strong>Loot objectives · {loot.length} / 3 controlled</strong>
        <span>
          Discover locations to find Loot. Explore its guarding location or
          defeat its guarding enemy to claim it.
        </span>
        {q.loot.map((l) => (
          <button key={l.unit.id} onClick={() => onInspect(l.unit.code)}>
            {card(l.unit.code).name} ·{" "}
            {l.guardId
              ? `Guarded by ${card(guards.find((u) => u.id === l.guardId)?.code ?? G.crypt).name}`
              : "Awaiting the first player’s claim"}
          </button>
        ))}
        {loot.map(({ host, a }) => (
          <button key={a.id} onClick={() => onInspect(a.code)}>
            {card(a.code).name} · {seatName(s, host.owner ?? 0)} ·{" "}
            {card(host.code).name} · {a.exhausted ? "Exhausted" : "Ready"}
          </button>
        ))}
        {!q.loot.length && !loot.length && (
          <span>No Loot has been discovered.</span>
        )}
      </div>
      <div className="ghost-framsburg-summary" data-ghost-discover>
        <strong>Discover {ghostDiscoverValue(s)}</strong>
        <span>
          {s.activeLocation
            ? `Active location · ${card(s.activeLocation.code).name}`
            : "Travel to a Discover location to search the encounter deck."}
        </span>
        {q.discoverCards.length > 0 && (
          <span>
            {q.discoverCards.length} cards being examined by the resolving
            player
          </span>
        )}
        <span>
          Choose one Loot objective and reveal one random Hazard. Discard the
          remaining looked-at cards.
        </span>
        <button onClick={() => onInspect(G.tomb)}>
          Inspect The Cursed Tomb ·{" "}
          {s.victoryCards?.includes(G.tomb)
            ? "Explored"
            : q.setAside.some((u) => u.code === G.tomb)
              ? "Set aside"
              : "In play"}
        </button>
        <button onClick={() => onInspect(G.shade)}>
          Inspect Fram’s Shade ·{" "}
          {s.victoryCards?.includes(G.shade)
            ? "Defeated"
            : shade
              ? `${shade.damage} / 6 damage`
              : "Not in play"}
        </button>
      </div>
      <details className="ghost-framsburg-reference">
        <summary>Original quest cards · Both faces</summary>
        <div>
          {GHOST_FRAMSBURG_QUEST_CHAIN.map((code, i) => (
            <button key={code} onClick={() => onInspect(code)}>
              {i + 1}A/B · {card(code).name}
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}
