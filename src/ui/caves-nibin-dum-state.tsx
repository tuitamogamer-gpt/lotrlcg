import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { CAVES, cavesPublicState } from "../game/caves-nibin-dum-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
const STAGE_RULES: Record<number, string> = {
  1: "The Dark of Nibin-Dûm: 8 quest points.",
  2: "Surprise Attack: 0 quest points, +4 for each enemy in play; during the encounter phase each enemy's engagement cost is 0.",
  3: "The Chasm: an additional encounter card is revealed during the quest phase; no progress on Cracked Pillar in the staging area. Its exploration advances the quest.",
  4: "Oathkeepers: 8 quest points; at 8 progress Goblin Chieftain can take damage. The stage cannot be defeated while the Chieftain is in play; when it is, the players win.",
};
export function CavesState({ s, inspect }: Props) {
  const q = cavesPublicState(s);
  if (!q) return null;
  const link = (code: string, label = card(code).name) => (
    <button
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
      data-scenario-panel="the-caves-of-nibin-dum"
      aria-label="The Caves of Nibin-Dûm"
    >
      <div className="shadow-east-summary">
        <strong data-side={q.side}>
          {q.side} · {STAGE_RULES[q.stage] ?? ""}
        </strong>
        <span data-edition={q.edition}>
          {q.edition === "2018"
            ? "The Two-Player Limited Edition Starter's encounter deck."
            : "The Dark of Mirkwood's encounter deck, with Crumbling Stairs, Wild Wargs and Obsidian Arrows."}
        </span>
        <span data-torch={q.torch}>
          {link(CAVES.torch)}:{" "}
          {q.torch === "gone"
            ? "no longer in play."
            : `${q.torch === "ready" ? "ready" : "exhausted"} on ${q.torchHero ? card(q.torchHero).name : "a hero"}.`}
        </span>
        <span data-chieftain={q.chieftain}>
          {link(CAVES.chieftain)}:{" "}
          {q.chieftain === "aside"
            ? "set aside, out of play."
            : q.chieftain === "play"
              ? `in play with ${q.stage} attack and defense.`
              : "no longer in play."}
        </span>
        <span data-pillar={q.pillar} data-pillar-damage={q.pillarDamage}>
          {link(CAVES.pillar)}:{" "}
          {q.pillar === "aside"
            ? "set aside until The Chasm."
            : q.pillar === "staging"
              ? `${q.pillarDamage} damage in the staging area; 4 damage let the players travel there.`
              : q.pillar === "active"
                ? "the active location."
                : "explored."}
        </span>
      </div>
    </section>
  );
}
