import type { GameState } from "../game/types";
import { card } from "../game/cards";
import {
  JTC,
  JTC_CROSSROADS_PROGRESS,
  crossRoadsPublicState,
} from "../game/cross-roads-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
export function CrossRoadsState({ s, inspect }: Props) {
  const q = crossRoadsPublicState(s);
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
  const ready =
    q.underCrossroads === 0 && s.progress >= JTC_CROSSROADS_PROGRESS;
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="journey-to-the-cross-roads"
      aria-label="Journey to the Cross-roads"
    >
      <div className="shadow-east-summary">
        <strong data-stage={s.stage}>
          Ambush the Men of Harad: at the beginning of each quest phase a card
          from under The Cross-roads is revealed; the players win when they
          explore The Cross-roads.
        </strong>
        <span
          data-under-crossroads={q.underCrossroads}
          data-crossroads-ready={ready ? "true" : "false"}
        >
          {link(JTC.crossroads)}: {q.underCrossroads} facedown card
          {q.underCrossroads === 1 ? "" : "s"} under it ·{" "}
          {Math.min(s.progress, JTC_CROSSROADS_PROGRESS)} of{" "}
          {JTC_CROSSROADS_PROGRESS} progress on the stage
          {ready
            ? " · the players can travel there"
            : " · the players cannot travel there yet"}
          .
        </span>
        <span
          data-under-black-gate={q.underBlackGate}
          data-black-gate-limit={q.blackGateLimit}
        >
          {link(JTC.blackGate)}: {q.underBlackGate} of {q.blackGateLimit}{" "}
          facedown Harad enemies (the players lose at {q.blackGateLimit}); at
          the end of the planning phase each Harad enemy in the staging area
          goes under it.
        </span>
        {q.refuge && (
          <span data-refuge="true">
            {link(JTC.henneth)} is the active location: the encounter and combat
            phases are skipped, and the Forced effects of stage 1B and The Black
            Gate are ignored.
          </span>
        )}
      </div>
    </section>
  );
}
