import type { GameState } from "../game/types";
import { card } from "../game/cards";
import {
  RI,
  RI_BREAKING_DAMAGE,
  RI_ENT_RESOURCES,
  roadIsengardPublicState,
} from "../game/road-isengard-support";
import { allActiveLocations } from "../game/table";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
export function RoadIsengardState({ s, inspect }: Props) {
  const q = roadIsengardPublicState(s);
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
  const orthanc = allActiveLocations(s).some((l) => l.code === RI.orthanc);
  const ents = s.staging.filter((u) => u.code === RI.ent);
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="the-road-to-isengard"
      aria-label="The Road to Isengard"
    >
      <div className="shadow-east-summary">
        <strong data-stage={s.stage}>
          {s.stage === 1
            ? "Rouse the Ents: the players cannot draw cards or gain resources, and they neither commit characters nor reveal encounter cards during the quest phase."
            : s.stage === 2
              ? "Breaking Isengard: the players cannot travel to Orthanc; each explored non-unique location places 1 damage here."
              : "The Voice of Saruman: a player with no cards in hand is eliminated; the players win when this stage is defeated and Saruman has no hit points remaining."}
        </strong>
        {s.stage === 1 && (
          <span data-rouse={q.rouse} data-ents={q.ents}>
            {q.rouse} resource{q.rouse === 1 ? "" : "s"} on Rouse the Ents (one
            encounter card each when the players advance) · {link(RI.ent)} in
            the staging area:{" "}
            {ents.length
              ? ents
                  .map((u) => `${u.resources} of ${RI_ENT_RESOURCES}`)
                  .join(", ")
              : "none"}
            .
          </span>
        )}
        {s.stage === 2 && (
          <span data-breaking={q.breaking}>
            {q.breaking} of {RI_BREAKING_DAMAGE} damage on Breaking Isengard;
            exhaust an {link(RI.ent)} you control to place 2 progress on a
            non-unique location.
          </span>
        )}
        {q.saruman && (
          <span
            data-saruman-hp={q.saruman.hitPoints}
            data-staff={q.saruman.staff ? "true" : "false"}
            data-engaged={orthanc && s.stage === 3 ? "true" : "false"}
          >
            {link(RI.saruman)}: {q.saruman.damage} damage, {q.saruman.hitPoints}{" "}
            hit point
            {q.saruman.hitPoints === 1 ? "" : "s"} remaining
            {q.saruman.staff ? (
              <>
                {" "}
                · {link(RI.staff)}: he attacks each player who draws cards (2
                shadow cards)
              </>
            ) : null}
            {s.stage === 3 ? (
              <>
                {" "}
                · {link(RI.orthanc)}{" "}
                {orthanc
                  ? "is the active location, so Saruman is engaged with the first player"
                  : "is not the active location"}
              </>
            ) : null}
            .
          </span>
        )}
      </div>
    </section>
  );
}
