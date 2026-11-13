import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { seatName } from "../game/table";
import {
  RS,
  RS_DOORS_DAMAGE,
  RS_WATCHER_DAMAGE,
  ringSouthPublicState,
} from "../game/ring-south-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
export function RingSouthState({ s, inspect }: Props) {
  const q = ringSouthPublicState(s);
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
  const stage = s.stage;
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="the-ring-goes-south"
      aria-label="The Ring Goes South"
    >
      <div className="shadow-east-summary">
        <strong data-stage={stage}>
          {stage === 1
            ? "The Council of Elrond: at the end of the planning phase, 4 cards are placed faceup from the players' decks; 1 is played for 0 cost, 1 goes to its owner's hand, 1 is discarded and 1 is shuffled back. Then Lust for the Ring is shuffled into the encounter deck or each player raises his threat by 5."
            : stage === 4
              ? "The Gates of Moria: there can be 2 active locations; after an enemy engages a player, 1 damage is placed on each active location. Exploring Doors of Durin wins the game."
              : `${card(q.currentQuest).name}: the players must travel to a location if able; after an enemy engages a player, 1 damage is placed on the active location${stage === 3 ? ", and each location that enters play gets 1 damage" : ""}.`}
        </strong>
        {q.council.length > 0 && (
          <span data-council={q.council.length}>
            Faceup at the Council:{" "}
            {q.council
              .map(
                (c) =>
                  `${card(c.code).name}${s.table ? ` (${seatName(s, c.owner)})` : ""}`,
              )
              .join(", ")}
            .
          </span>
        )}
        {stage === 4 && (
          <span
            data-under-watcher={q.underWatcher ? "true" : "false"}
            data-watcher-damage={q.watcherDamage}
            data-doors-damage={q.doorsDamage}
          >
            {link(RS.watcher)}:{" "}
            {q.underWatcher
              ? `the Ring-bearer is facedown under it; at ${RS_WATCHER_DAMAGE} damage the first player takes him back (${q.watcherDamage} of ${RS_WATCHER_DAMAGE}).`
              : `${q.watcherDamage} damage; the Ring-bearer is free.`}{" "}
            {link(RS.doors)}: {q.doorsDamage} of {RS_DOORS_DAMAGE} damage; at{" "}
            {RS_DOORS_DAMAGE} the players lose. Progress goes on it only after
            the other active location and while the first player controls the
            Ring-bearer.
          </span>
        )}
        <span data-set-aside={q.setAside.length}>
          {q.setAside.length
            ? `Set aside: ${q.setAside.map((c) => card(c).name).join(", ")}.`
            : "No card is set aside."}
          {q.lustZero
            ? " Lust for the Ring: a hero has 0 willpower this round."
            : ""}
        </span>
      </div>
    </section>
  );
}
