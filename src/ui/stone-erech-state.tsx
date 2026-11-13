import type { GameState } from "../game/types";
import { card } from "../game/cards";
import {
  NIGHT_LIMIT,
  SE,
  stoneErechPublicState,
} from "../game/stone-erech-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
const DERUFIN: Record<string, string> = {
  aside: "set aside until stage 2A.",
  attached:
    "attached to The Stone of Erech. The first player gains control of him after the players travel there.",
  controlled:
    "controlled by the players. If he leaves play, the players lose. The Shadow Host needs him to receive progress.",
  lost: "gone from play while his text box was blank. The Shadow Host can no longer receive progress.",
};
export function StoneErechState({ s, inspect }: Props) {
  const q = stoneErechPublicState(s);
  if (!q) return null;
  const link = (code: string, label = card(code).name) => (
    <button
      className="fortress-nurn-link"
      aria-label={`Inspect ${card(code).name}`}
      onClick={() => inspect(card(code))}
    >
      {label}
    </button>
  );
  const midnight = q.night === SE.midnight;
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="the-stone-of-erech"
      aria-label="The Stone of Erech"
    >
      <div className="shadow-east-summary">
        <strong
          data-night={card(q.night).name}
          data-night-progress={q.nightProgress}
        >
          {link(q.night)}
          {midnight
            ? `: ${q.nightProgress} progress. At the end of each round it gains 1 progress and each player raises their threat by its progress.`
            : `: ${q.nightProgress} of ${NIGHT_LIMIT} progress. At ${NIGHT_LIMIT} it goes to the victory display and ${q.night === SE.eventide ? "Dusk" : "Midnight"} comes into play.`}
        </strong>
        <span>
          {q.night === SE.eventide
            ? "The Dusk and Midnight effects of encounter cards are not yet active."
            : midnight
              ? "Midnight effects of encounter cards are active."
              : "Dusk effects of encounter cards are active."}{" "}
          Spectral enemies are attacked with willpower instead of attack.
        </span>
        <span data-derufin={q.derufin}>
          {link(SE.derufin)}: {DERUFIN[q.derufin]}
        </span>
        <span
          data-no-events={q.noEvents ? "true" : "false"}
          data-skip-travel={q.skipTravel ? "true" : "false"}
          data-skip-planning={q.skipPlanning ? "true" : "false"}
          data-no-resources={q.noResources ? "true" : "false"}
        >
          {q.noEvents
            ? "Shadow-man: the players cannot play events this round. "
            : ""}
          {q.skipTravel
            ? "Groping Horror: the next travel phase is skipped. "
            : ""}
          {q.skipPlanning
            ? "Terror of the Dead: each player skips the next planning phase. "
            : ""}
          {q.noResources
            ? "Terror of the Dead: heroes do not collect resources this round. "
            : ""}
          {!q.noEvents && !q.skipTravel && !q.skipPlanning && !q.noResources
            ? "No round restriction is in effect."
            : ""}
        </span>
      </div>
    </section>
  );
}
