import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { BG, blackGatePublicState } from "../game/black-gate-support";
import { threatElimination } from "../game/threat-elimination";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
const STAGE_RULES: Record<number, string> = {
  1: "Embassy from The Dark Tower: four player cards are paired with four encounter cards; for each pair the first player discards both, or reveals the encounter card to play the player card at no cost.",
  2: "The Battle of the Morannon cannot be defeated: during the staging step the first player reveals 1 encounter card for each resource on The Black Gate, and an unsuccessful quest discards the active location.",
};
export function BlackGateState({ s, inspect }: Props) {
  const q = blackGatePublicState(s);
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
      data-scenario-panel="the-black-gate-opens"
      aria-label="The Black Gate Opens"
    >
      <div className="shadow-east-summary">
        <strong data-stage={q.stage}>{STAGE_RULES[q.stage] ?? ""}</strong>
        <span data-gate={q.gate}>
          {link(BG.gate)}: {q.gate} resource{q.gate === 1 ? "" : "s"} — the
          rounds the players have held the Morannon, and their result when they
          fall. At the beginning of each quest phase it gains a resource and
          each player raises his threat by 1.
        </span>
        <span data-dire={threatElimination(s)}>
          Dire: threat elimination is {threatElimination(s)}; threat cannot be
          reduced by more than 1 each round by non-boon player cards, and Valour
          triggers at 80.
        </span>
        <span data-mouth={q.mouth ? "staging" : "gone"}>
          {link(BG.mouth)}:{" "}
          {q.mouth
            ? "in the staging area, immune and unable to leave it; he attacks a player who cancels a 'when revealed' effect."
            : "not in play."}
        </span>
        <span data-gwaihir={q.gwaihir}>
          {link(BG.gwaihir)}:{" "}
          {q.gwaihir === "set-aside"
            ? "set aside, out of play, until 2A shuffles him into the encounter deck."
            : q.gwaihir === "ally"
              ? "under the first player's control."
              : "in the encounter deck or discard pile."}
        </span>
        {q.moat > 0 && (
          <span data-moat={q.moat}>
            {link(BG.moat)}: {q.moat} enem{q.moat === 1 ? "y" : "ies"} facedown
            under it.
          </span>
        )}
        {q.embassy > 0 && (
          <span data-embassy={q.embassy}>
            Embassy: {q.embassy} pair{q.embassy === 1 ? "" : "s"} to decide.
          </span>
        )}
      </div>
    </section>
  );
}
