import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { seatName } from "../game/table";
import {
  ADG,
  ADG_LIEUTENANTS,
  ADG_STAGE3,
  attackDolGuldurPublicState,
} from "../game/attack-dol-guldur-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
const STAGE_RULES: Record<string, string> = {
  [ADG.golden]:
    "Assault on the Golden Wood: at the end of each round a resource is placed here and the progress moves to Power of Lórien; at 3 resources the players cross the Anduin. Raising each player's threat by 1 lets each player draw a card and gain a resource.",
  [ADG.anduin]:
    "Crossing the Anduin: Power of Lórien's progress buys Host of Lórien (10) and Power of Lórien itself (20 more); each player finds a Dol Guldur location, then the players choose a stage 3.",
  [ADG.siege]:
    "The Siege of Dol Guldur: at the end of the round remove 5 progress or Dol Guldur's city strength rises by 3; 5 more progress lowers it by 3.",
  [ADG.tower]:
    "The Tower of Sorcery: at the end of the round remove 5 progress or each player keeps 1 card in hand; 5 more let a player search his deck for a card.",
  [ADG.trees]:
    "Battle Under the Trees: at the end of the round remove 5 progress or each player is ambushed by an enemy from the encounter deck; 5 more destroy a non-unique enemy.",
  [ADG.dungeons]:
    "Dungeons of the Necromancer: at the end of the round remove 5 progress or each player discards an ally; 5 more let a player put an ally from his top 10 cards into play.",
};
const LIEUTENANT_PLACE = {
  aside: "set aside",
  play: "in play",
  victory: "in the victory display",
  gone: "out of play",
} as const;
export function AttackDolGuldurState({ s, inspect }: Props) {
  const q = attackDolGuldurPublicState(s);
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
  const stage3 = ADG_STAGE3[q.currentQuest];
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="attack-on-dol-guldur"
      aria-label="Attack on Dol Guldur"
    >
      <div className="shadow-east-summary">
        <strong data-side={q.side}>
          {q.side} · {STAGE_RULES[q.currentQuest] ?? ""}
        </strong>
        <span data-city-strength={q.cityStrength}>
          {link(ADG.city)}: city strength {q.cityStrength}
          {q.cityStrength === 0
            ? "; the Lieutenants have lost indestructible."
            : "; explored locations and destroyed enemies lower it by their siege values at stage 3."}
        </span>
        {q.stage === 3 && (
          <span data-siege={q.siege}>Siege value this round: {q.siege}.</span>
        )}
        {q.currentQuest === ADG.golden && (
          <span data-quest-resources={q.questResources}>
            Resources on Assault on the Golden Wood: {q.questResources} of 3.
          </span>
        )}
        <span data-lorien={q.lorien} data-lorien-progress={q.lorienProgress}>
          {link(ADG.power)}:{" "}
          {q.lorien === "staging"
            ? `${q.lorienProgress} progress in the staging area.`
            : q.lorien === "controlled"
              ? `controlled by ${q.lorienPlayer !== null && s.table ? seatName(s, q.lorienPlayer) : "you"}; it can cancel a revealed encounter card.`
              : q.lorien === "victory"
                ? "in the victory display."
                : "discarded."}
        </span>
        <span data-host-of-lorien={q.hostOfLorien}>
          {link(ADG.host)} is{" "}
          {q.hostOfLorien === "aside"
            ? "set aside"
            : q.hostOfLorien === "play"
              ? "in play"
              : "out of the game"}
          .
        </span>
        <span
          data-lieutenants={ADG_LIEUTENANTS.map((c) => q.lieutenants[c]).join(
            ",",
          )}
        >
          {ADG_LIEUTENANTS.map((c, i) => (
            <span key={c}>
              {i ? "; " : ""}
              {link(c)} {LIEUTENANT_PLACE[q.lieutenants[c]]}
              {stage3?.lieutenant === c ? " (this stage)" : ""}
            </span>
          ))}
          .
        </span>
      </div>
    </section>
  );
}
