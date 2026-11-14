import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { OATH, oathPublicState } from "../game/the-oath-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
const STAGE_RULES: Record<number, string> = {
  1: "After the Raid: follow the Goblins' trail into Mirkwood.",
  2: "Mirkwood Forest: this stage cannot be defeated unless at least 1 copy of Goblin Trail is in the victory display.",
  3: "The Rearguard: this stage cannot be defeated while Goblin Troop is in play. When it is defeated, the players win.",
};
export function OathState({ s, inspect }: Props) {
  const q = oathPublicState(s);
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
      data-scenario-panel="the-oath"
      aria-label="The Oath"
    >
      <div className="shadow-east-summary">
        <strong data-stage={q.stage}>{STAGE_RULES[q.stage] ?? ""}</strong>
        <span data-edition={q.edition}>
          {q.edition === "2018"
            ? "The Two-Player Limited Edition Starter's encounter deck."
            : "The Dark of Mirkwood's encounter deck, with Wild Wargs, Obsidian Arrows and Abandoned Camp."}
        </span>
        <span data-trails={q.trails}>
          {link(OATH.trail)}: {q.trails} in the victory display.
        </span>
        <span data-troop={q.troop}>
          {link(OATH.troop)}:{" "}
          {q.troop === "aside"
            ? "set aside until The Rearguard."
            : q.troop === "play"
              ? "in play; The Rearguard cannot be defeated."
              : "no longer in play."}
        </span>
        {q.eaves && (
          <span data-eaves>
            {link(OATH.eaves)} is the active location: encounter card effects
            cannot be canceled.
          </span>
        )}
      </div>
    </section>
  );
}
