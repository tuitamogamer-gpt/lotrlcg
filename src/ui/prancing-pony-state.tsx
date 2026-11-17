import type { GameState } from "../game/types";
import { card } from "../game/cards";
import {
  PP,
  PP_HIDEOUTS,
  PP_SUSPECTS,
  prancingPonyPublicState,
} from "../game/prancing-pony-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
const STAGE_RULES: Record<string, string> = {
  [PP.crime]:
    "Investigating the Crime: no more than 4 progress on this stage each round; at the beginning of each quest phase, each player raises his threat by 2 or reveals an additional encounter card.",
  [PP.time]:
    "Running out of Time: an unsuccessful quest removes a random Investigation card unseen; after progress from a successful quest, the first player reveals an encounter card or makes the accusation.",
  [PP.killer]:
    "Apprehending the Killer: the Investigate keyword is ignored; each Suspect engages the first player at the beginning of the encounter phase and cannot take damage while a Hideout is in play. With no Suspect in play, the players win.",
};
export function PrancingPonyState({ s, inspect }: Props) {
  const q = prancingPonyPublicState(s);
  if (!q) return null;
  const link = (code: string) => (
    <button
      key={code}
      className="fortress-nurn-link"
      aria-label={`Inspect ${card(code).name}`}
      onClick={() => inspect(card(code))}
    >
      {card(code).name}
    </button>
  );
  const list = (codes: readonly string[]) =>
    codes.map((c, i) => (
      <span key={c} data-checked={q.checked.includes(c)}>
        {i ? " · " : " "}
        {q.checked.includes(c) ? "✓ " : "☐ "}
        {link(c)}
      </span>
    ));
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="murder-at-the-prancing-pony"
      aria-label="Murder at the Prancing Pony"
    >
      <div className="shadow-east-summary">
        <strong data-side={q.side}>
          {q.side} · {STAGE_RULES[q.currentQuest] ?? ""}
        </strong>
        <span data-investigation={q.investigation}>
          Investigation deck: {q.investigation} card
          {q.investigation === 1 ? "" : "s"}
          {q.removed ? `; ${q.removed} removed from the game` : ""}.
        </span>
        <span data-suspects>Suspects: {list(PP_SUSPECTS)}</span>
        <span data-hideouts>Hideouts: {list(PP_HIDEOUTS)}</span>
        <span data-hidden={q.hidden}>
          {q.hidden
            ? "A Suspect and a Hideout lie facedown, out of play."
            : q.accusation
              ? `Accusation: ${card(q.accusation.suspect).name} at ${card(q.accusation.hideout).name} — ${q.accusation.correct ? "correct" : "not correct"}.`
              : ""}
        </span>
        {q.currentQuest === PP.crime && (
          <span data-stage-progress={q.stageProgress}>
            Progress on this stage this round: {q.stageProgress} of 4.
          </span>
        )}
      </div>
    </section>
  );
}
