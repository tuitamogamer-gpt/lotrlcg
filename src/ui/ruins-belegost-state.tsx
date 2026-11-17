import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { RB, ruinsBelegostPublicState } from "../game/ruins-belegost-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
const STAGE_RULES: Record<string, string> = {
  [RB.first]:
    "Ruins of the First Age: the players cannot advance unless they control 1 Loot objective. With Keys of Belegost the quest continues at 2C, otherwise at 2A.",
  [RB.evils]:
    "Ancient Evils Disturbed: 2 Loot objectives and Lurker of the Depths in the victory display are needed. With Book of Aulë's Children the quest continues at 3C, otherwise at 3A.",
  [RB.deeper]:
    "Deeper into the Past: 2 Loot objectives and 3 resources here are needed; each explored active location adds one. With Book of Aulë's Children the quest continues at 3E, otherwise at 3C.",
  [RB.servants]:
    "The Servants of Morgoth: the first Hazard revealed each round gains surge, and the players must travel. With Dwarven Torch the quest continues at 4A, otherwise at 3C.",
  [RB.roots]:
    "The Roots of Ered Luin: the active location's Discover value is 1 higher, and the players must travel. With Map of Ered Luin the quest continues at 4A, otherwise at 3E.",
  [RB.mines]:
    "The Mines of Belegost: a Discover that reveals no Hazard reveals the top encounter card, and the players must travel. With Blue Mountain Gem the quest continues at 4A, otherwise at 3A.",
  [RB.beast]:
    "The Beast of Belegost: while Naurlhûg's Lair is in the victory display, Naurlhûg can take damage. Defeating Naurlhûg wins the game.",
};
export function RuinsBelegostState({ s, inspect }: Props) {
  const q = ruinsBelegostPublicState(s);
  if (!q) return null;
  const link = (code: string, label = card(code).name) => (
    <button
      key={code}
      className="fortress-nurn-link"
      aria-label={`Inspect ${label}`}
      onClick={() => inspect(card(code))}
    >
      {label}
    </button>
  );
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="the-ruins-of-belegost"
      aria-label="The Ruins of Belegost"
    >
      <div className="shadow-east-summary">
        <strong data-side={q.side}>
          {q.side} · {STAGE_RULES[q.currentQuest] ?? ""}
        </strong>
        <span data-loot={q.loot.length}>
          Loot controlled:{" "}
          {q.loot.length ? q.loot.map((c) => link(c)) : "none yet"}.
        </span>
        <span data-stalking={q.stalking}>
          {link(RB.stalking)}: {q.stalking} resource
          {q.stalking === 1 ? "" : "s"}; at 3, {link(RB.naurlhug)} comes out.
          {q.hidden ? " A Loot objective lies facedown underneath." : ""}
        </span>
        <span data-naurlhug={q.naurlhug}>
          Naurlhûg is{" "}
          {q.naurlhug === "aside"
            ? "set aside, out of play"
            : q.naurlhug === "play"
              ? "in play"
              : "defeated"}
          .
        </span>
        {q.currentQuest === RB.deeper && (
          <span data-quest-resources={q.questResources}>
            Resources on Deeper into the Past: {q.questResources} of 3.
          </span>
        )}
      </div>
    </section>
  );
}
