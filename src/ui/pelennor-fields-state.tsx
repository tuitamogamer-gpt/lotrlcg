import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { PF, pelennorFieldsPublicState } from "../game/pelennor-fields-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
const STAGE_RULES: Record<number, string> = {
  1: "The Garrison of Gondor: skip the quest phase and combat phase; at the end of each planning phase, 1 progress is placed here.",
  2: "Retreat from Osgiliath: X is the total cost of all allies in the staging area, which are blank, immune to player card effects and under no player's control; at the end of the round they take damage for each enemy in the staging area.",
  3: "The White City Besieged (Assault): no progress from questing or player card effects; an unsuccessful quest damages Minas Tirith instead of raising threat; each destroyed enemy places progress equal to its total threat; no travel to Pelennor locations.",
  4: "Rohan has Come!: progress from questing is assigned as damage among enemies in play; at the end of the quest phase, the players advance to stage 5A.",
  5: "Fighting in the Fields: The Witch-king and his shadow cards are immune to player card effects; when an enemy attack destroys a character, 1 damage to Minas Tirith; the stage cannot be defeated unless Aragorn is in play and The Witch-king is in the victory display.",
};
export function PelennorFieldsState({ s, inspect }: Props) {
  const q = pelennorFieldsPublicState(s);
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
      data-scenario-panel="the-battle-of-the-pelennor-fields"
      aria-label="The Battle of the Pelennor Fields"
    >
      <div className="shadow-east-summary">
        <strong data-stage={q.stage}>{STAGE_RULES[q.stage] ?? ""}</strong>
        <span
          data-minas-tirith={
            q.minasTirith
              ? `${q.minasTirith.damage}/${q.minasTirith.health}`
              : "set-aside"
          }
        >
          {link(PF.minasTirith)}:{" "}
          {q.minasTirith
            ? `${q.minasTirith.damage} damage of ${q.minasTirith.health} hit points; at the end of each round it takes 1 damage for each enemy in the staging area.`
            : "set aside until stage 3A."}
        </span>
        {q.grond !== null && (
          <span data-grond={q.grond}>
            {link(PF.grond)}: {q.grond} resource{q.grond === 1 ? "" : "s"} (X);
            at the beginning of each quest phase it gains 1 and deals X damage
            to Minas Tirith.
          </span>
        )}
        {(q.witchKing || q.witchKingVictory) && (
          <span
            data-witch-king={
              q.witchKingVictory ? "victory" : (q.witchKing ?? "none")
            }
          >
            {link(PF.witchKing)}:{" "}
            {q.witchKingVictory
              ? "in the victory display."
              : q.witchKing === "captain"
                ? "Captain side: immune, cannot take damage; at the beginning of each quest phase an enemy joins the staging area."
                : "Sorcerer side: at the beginning of each encounter phase he engages the first player and makes an immediate attack."}
          </span>
        )}
        {q.wraiths > 0 && (
          <span data-wraiths={q.wraiths}>
            {link(PF.wraith)}: {q.wraiths} in play, each +1 threat and -1
            engagement cost for each of its resources.
          </span>
        )}
        {q.allies > 0 && (
          <span data-staging-allies={q.allies}>
            Allies in the staging area: {q.allies}.
          </span>
        )}
        {q.despair > 0 && (
          <span data-despair={q.despair}>
            {link(PF.despair)}: +{q.despair} total threat in the staging area
            until the end of the phase.
          </span>
        )}
      </div>
    </section>
  );
}
