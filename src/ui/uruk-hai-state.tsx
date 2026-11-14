import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { seatName } from "../game/table";
import {
  UH,
  UH_LOST_PURSUIT,
  urukHaiPublicState,
} from "../game/uruk-hai-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
export function UrukHaiState({ s, inspect }: Props) {
  const q = urukHaiPublicState(s);
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
  const holder = (id?: string) =>
    id ? [...s.staging, ...s.engaged].find((u) => u.id === id) : undefined;
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="the-uruk-hai"
      aria-label="The Uruk-hai"
    >
      <div className="shadow-east-summary">
        <strong data-stage={s.stage} data-pursuit={q.pursuit}>
          Pursuit value {q.pursuit} of {UH_LOST_PURSUIT}:{" "}
          {s.stage === 1 ? (
            <>
              Follow the Orcs needs {q.pursuit} progress; {link(UH.ugluk)}{" "}
              cannot leave the staging area or take damage, and each enemy in
              the staging area adds 1 at the end of the combat phase.
            </>
          ) : (
            <>
              Rescue the Captives needs {q.pursuit} progress, and cannot be
              defeated while {link(UH.ugluk)} is in play; each defeated enemy
              reduces the pursuit value by 1.
            </>
          )}
        </strong>
        <span data-captives={q.captives.length}>
          {link(UH.isengard)}:{" "}
          {q.captives.length
            ? q.captives
                .map((c) => {
                  const g = holder(c.holder);
                  return `${card(c.code).name}${s.table ? ` (${seatName(s, c.owner)})` : ""}${c.damage ? `, ${c.damage} damage` : ""}${g ? `, attached to ${card(g.code).name}` : ""}`;
                })
                .join(" · ") + "."
            : "no Captive is in play."}{" "}
          At the end of the refresh phase the pursuit value increases by 1; at{" "}
          {UH_LOST_PURSUIT} or more the players lose.
        </span>
        {q.barrier && (
          <span data-barrier={q.barrier.placed}>
            {link(UH.barrier)}: {q.barrier.placed} of {q.barrier.limit} progress
            placed on the current quest this round.
          </span>
        )}
        {q.fighting.length > 0 && (
          <span data-fighting={q.fighting.length}>
            {link(UH.fighting)}: until the end of the round, each enemy engaged
            with {q.fighting.map((p) => seatName(s, p)).join(", ")} adds its
            threat to the staging area.
          </span>
        )}
      </div>
    </section>
  );
}
