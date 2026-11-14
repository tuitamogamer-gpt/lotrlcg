import type { GameState } from "../game/types";
import { card } from "../game/cards";
import {
  MD,
  MD_GASP_CAP,
  MD_GASP_PROGRESS,
  mountDoomPublicState,
} from "../game/mount-doom-support";
import { threatElimination } from "../game/threat-elimination";
import { seatName } from "../game/table";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
const STAGE_RULES: Record<number, string> = {
  1: "The Land of Mordor: the first treachery revealed each quest phase is immune to player card effects and gains surge.",
  2: "The Road to Isenmouthe: after progress is placed here from a successful quest, each player makes a Fortitude test — a resource here if he passes, an enemy engaged with him if he fails. With a resource for each player at the end of the quest phase, the players advance.",
  3: `The Last Gasp: at the beginning of each quest phase the first player makes a Fortitude test (no more than ${MD_GASP_CAP} progress here this round if he fails); the first treachery revealed each quest phase is immune and gains surge. With ${MD_GASP_PROGRESS} progress the players may travel to Mount Doom, and the stage is defeated only while it is the active location.`,
  4: "The Crack of Doom: allies cannot enter play and 'when revealed' effects cannot be canceled. When Mount Doom is explored, the first player makes a last Fortitude test, discarding 1 extra card for each player: the players win if he passes and lose if he fails.",
};
export function MountDoomState({ s, inspect }: Props) {
  const q = mountDoomPublicState(s);
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
  const failed = q.failed.map((p) => (s.table ? seatName(s, p) : "You"));
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="mount-doom"
      aria-label="Mount Doom"
    >
      <div className="shadow-east-summary">
        <strong data-stage={q.stage}>{STAGE_RULES[q.stage] ?? ""}</strong>
        <span data-fortitude>
          Fortitude test: exhaust heroes to commit their willpower, then discard
          the top X encounter cards (X is the tens digit of your threat dial);
          you pass only if the willpower is greater than their Sauron's Eye
          icons.
        </span>
        <span data-failed={q.failed.length}>
          {failed.length
            ? `${failed.join(", ")} failed a Fortitude test this round.`
            : "No Fortitude test was failed this round."}
        </span>
        {q.stage === 2 && (
          <span data-resources={q.resources}>
            {link(MD.road)}: {q.resources} resource
            {q.resources === 1 ? "" : "s"} on the quest.
          </span>
        )}
        {q.capped && (
          <span data-capped>
            The Last Gasp: no more than {MD_GASP_CAP} progress here this round.
          </span>
        )}
        <span data-doom={q.doom} data-doom-progress={q.doomProgress}>
          {link(MD.doom)}:{" "}
          {q.doom === "active"
            ? `the active location, ${q.doomProgress} of 9 progress.`
            : q.doom === "staging"
              ? "in the staging area; X is the tens digit of the first player's threat dial."
              : q.doom === "explored"
                ? "explored."
                : "not in play."}
        </span>
        {q.tower && (
          <span data-tower>
            {link(MD.tower)}: no threat raise at the end of the refresh phase;
            at the end of the round each player raises his threat by 1 for each
            non-Fellowship character he controls.
          </span>
        )}
        <span data-gollum={q.gollum}>
          {link(MD.gollum)}:{" "}
          {q.gollum === "engaged"
            ? "engaged with a player."
            : q.gollum === "staging"
              ? "in the staging area."
              : "in the encounter deck, discard pile or out of play."}
        </span>
        <span data-dire={threatElimination(s)}>
          Dire: threat elimination is {threatElimination(s)}; threat cannot be
          reduced by more than 1 each round by non-boon player cards, and Valour
          triggers at 80.
        </span>
      </div>
    </section>
  );
}
