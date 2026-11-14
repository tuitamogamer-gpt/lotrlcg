import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { CU, cirithUngolPublicState } from "../game/cirith-ungol-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
const STAGE_RULES: Record<number, string> = {
  1: "Pass the Two Watchers: each non-unique location gets -1 threat and cannot leave the staging area; the stage cannot be defeated while The Two Watchers is in play.",
  2: "Fighting in the Tower: at the beginning of each quest phase an enemy is discarded from the encounter deck (with its copy in the staging area, if any, or into the staging area); the stage cannot be defeated unless Topmost Chamber is in the victory display.",
  3: "Escape from Cirith Ungol: no travel to The Two Watchers unless there is at least 12 progress here; The Two Watchers gets +3 threat and +3 defense; defeating this stage wins the game.",
};
export function CirithUngolState({ s, inspect }: Props) {
  const q = cirithUngolPublicState(s);
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
      data-scenario-panel="the-tower-of-cirith-ungol"
      aria-label="The Tower of Cirith Ungol"
    >
      <div className="shadow-east-summary">
        <strong data-stage={q.stage}>{STAGE_RULES[q.stage] ?? ""}</strong>
        <span data-watchers={q.watchers ?? "none"}>
          {link(CU.twoWatchers)}:{" "}
          {q.watchers === "enemy"
            ? "enemy side in the staging area, considered to be engaged with each player; its damage raises the defending player's threat instead."
            : q.watchers === "location"
              ? "location side in the staging area (threat X, twice the stage number); travel there to flip it to its enemy side."
              : q.watchers === "victory"
                ? "in the victory display."
                : "not in play."}
        </span>
        <span data-captive={q.captive ? "true" : "false"}>
          {q.captive
            ? "The Ring-bearer lies faceup under "
            : "The Ring-bearer is free of encounters; "}
          {q.captive ? (
            <>
              {link(CU.chamber)} as a guarded objective until the Chamber leaves
              play.
            </>
          ) : (
            "the first player controls him."
          )}
        </span>
        {q.chamber && (
          <span data-chamber={q.chamber}>
            {link(CU.chamber)}:{" "}
            {q.chamber === "victory"
              ? "in the victory display."
              : "no travel unless there is at least 18 progress on stage 2B; its Travel cost adds Shagrat to the staging area."}
          </span>
        )}
        <span data-shagrat={q.shagrat}>
          {link(CU.shagrat)}:{" "}
          {q.shagrat === "set-aside"
            ? "set aside, out of play."
            : "in play or defeated."}
        </span>
      </div>
    </section>
  );
}
