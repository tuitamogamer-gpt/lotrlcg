import type { Action, GameState } from "../game/types";
import { card } from "../game/cards";
import { availableAbilities } from "../game/actions";
import {
  BOFA,
  STAGE_GOAL,
  bofaPublicState,
} from "../game/battle-five-armies-support";
import { bagginsBilbo } from "../game/hobbit-saga";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
  dispatch?: (a: Action) => void;
};
export function BattleFiveArmiesState({ s, inspect, dispatch }: Props) {
  const q = bofaPublicState(s);
  if (!q) return null;
  const bilbo = bagginsBilbo(s);
  const link = (code: string) => (
    <button
      className="fortress-nurn-link"
      aria-label={`Inspect ${card(code).name}`}
      onClick={() => inspect(card(code))}
    >
      {card(code).name}
    </button>
  );
  const eagle = s.staging.find((u) => u.code === BOFA.eagle);
  const eagleAction = eagle ? availableAbilities(s, eagle)[0] : undefined;
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="the-battle-of-five-armies"
      aria-label="The Battle of Five Armies"
    >
      <div className="shadow-east-summary">
        <strong>
          {q.stage === 5
            ? "The Clouds Burst · Bolg and his bodyguard"
            : q.stage === 1
              ? "The Gathering of the Clouds"
              : "Three fronts · Spur, Dale and Ravenhill"}
        </strong>
        {q.stages
          .filter((st) => st.code !== BOFA.gathering)
          .map((st) => (
            <span
              key={st.code}
              data-bofa-stage={st.code}
              data-progress={st.progress}
              data-current={st.current ? "true" : undefined}
            >
              {link(st.code)}: {st.progress}
              {st.code === BOFA.clouds ? "" : `/${STAGE_GOAL}`} progress
              {st.current ? " · current quest" : ""}
              {st.complete ? " · complete" : ""}
              {st.code === BOFA.dale ? " · Battle (attack)" : ""}
              {st.code === BOFA.ravenhill ? " · Siege (defense)" : ""}
            </span>
          ))}
        <span data-empty-stages={q.emptyStages}>
          {q.emptyStages} quest stage{q.emptyStages === 1 ? "" : "s"} with no
          progress strengthen{q.emptyStages === 1 ? "s" : ""} the Goblin host.
        </span>
        {q.stage === 5 && (
          <span>
            {link(BOFA.bolg)} is considered engaged with the first player; he
            cannot take damage while any {link(BOFA.bodyguard)} is in play.
          </span>
        )}
        {bilbo && (
          <span data-baggins-resources={bilbo.resources}>
            Bilbo Baggins: {bilbo.resources} Baggins resource
            {bilbo.resources === 1 ? "" : "s"}.
          </span>
        )}
        {q.weighedDown && (
          <span>
            Weighed Down: exhausted characters get −1 willpower, attack and
            defense this round.
          </span>
        )}
        {eagle && eagleAction && dispatch && (
          <button
            className="secondary"
            disabled={eagleAction.disabled || !!s.choice || !!s.flow?.pending}
            onClick={() => dispatch({ type: "ABILITY", id: eagle.id })}
          >
            {eagleAction.label}
          </button>
        )}
      </div>
    </section>
  );
}
