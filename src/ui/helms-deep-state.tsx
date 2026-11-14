import type { GameState } from "../game/types";
import { card } from "../game/cards";
import {
  HD,
  HD_DEFENSE_TOKENS,
  helmsDeepPublicState,
} from "../game/helms-deep-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
export function HelmsDeepState({ s, inspect }: Props) {
  const q = helmsDeepPublicState(s);
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
      data-scenario-panel="helms-deep"
      aria-label="Helm's Deep"
    >
      <div className="shadow-east-summary">
        <strong
          data-stage={s.stage}
          data-defense={q.defense ? "true" : "false"}
        >
          {s.stage === 1
            ? "The King of the Golden Hall: the players skip the quest phase and the combat phase, and advance to stage 2A at the end of the round."
            : s.stage === 5
              ? "The King Rides Out: the players skip the quest phase and cannot reduce their threat; they win once no enemy is in play."
              : `Defense: the players cannot place progress by questing successfully; a failed quest places the difference as progress here instead of raising threat.${s.stage === 4 ? " If this stage is defeated, the players lose the game." : ""}`}
        </strong>
        <span data-tokens={q.tokens ?? "none"}>
          {q.tokens === null ? (
            <>
              {link(HD.defense)}{" "}
              {s.stage === 5
                ? "is in the victory display."
                : "is set aside until Assault on Helm's Deep."}
            </>
          ) : (
            <>
              {link(HD.defense)}: {q.tokens} of {HD_DEFENSE_TOKENS} resource
              tokens, each adding 1 threat to the staging area; one more is
              placed at the end of each quest phase, and at {HD_DEFENSE_TOKENS}{" "}
              the players advance to The King Rides Out.
            </>
          )}
        </span>
        <span data-counsels={String(q.counsels)}>
          {q.counsels === null
            ? "The players have not chosen yet."
            : q.counsels
              ? `Each player shuffled ${card(HD.counsels).name} into his deck.`
              : "The players advanced to stage 2A, bypassing stage 1B."}
        </span>
        {(q.devilry || q.postern || q.gate) && (
          <span data-round-effects="true">
            {[
              q.devilry &&
                "Devilry of Saruman: each character's text box is blank",
              q.postern && "Postern Door: players cannot declare attacks",
              q.gate &&
                "Helm's Gate: each enemy has -20 engagement cost and +2 attack",
            ]
              .filter(Boolean)
              .join(" · ")}{" "}
            until the end of the round.
          </span>
        )}
      </div>
    </section>
  );
}
