import type { Action, GameState } from "../game/types";
import { card } from "../game/cards";
import { activeSeat, seatName } from "../game/table";
import {
  WAINRIDERS_QUESTS,
  wainridersGoal,
  wainridersPublicState,
} from "../game/wainriders-support";
import { wainridersPlayerAbilityProblem } from "../game/wainriders-player";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
type Props = { s: GameState; inspect: (c: InspectedCard) => void };
export function WainridersScenarioState({ s, inspect }: Props) {
  const q = wainridersPublicState(s);
  if (!q) return null;
  return (
    <section
      className="shadow-east-state"
      data-scenario-panel="challenge-of-the-wainriders"
      aria-label="Wainrider circuit"
    >
      <div className="shadow-east-summary">
        <strong>Race for freedom · Two circuits</strong>
        <span>
          Challengers: {q.challengerSteps} / 12 stages · Wainriders:{" "}
          {q.wainriderSteps} / 12 stages
        </span>
        <span>
          Wainriders’ current stage: {q.damage} / {wainridersGoal(s)} damage
        </span>
        <span>
          Keep a character ready for the first player’s racing test. Each stage
          completed this round raises the next test’s difficulty.
        </span>
      </div>
      {WAINRIDERS_QUESTS.map((c, i) => (
        <div
          key={c.code}
          className="shadow-east-summary"
          data-race-stage={i + 1}
        >
          <strong>
            {i + 1} · {c.name}
          </strong>
          <span>
            {q.challengerSteps % 6 === i ? "Challengers here · " : ""}
            {q.wainriderSteps % 6 === i ? "Wainriders here · " : ""}
            {q.progress[i]} progress
          </span>
          <button onClick={() => inspect({ ...c, initialReverse: true })}>
            Inspect stage {i + 1}
          </button>
        </div>
      ))}
      {q.lastTest && (
        <div className="shadow-east-summary" data-racing-result>
          <strong>
            Last racing test · {q.lastTest.passed ? "Passed" : "Failed"}
          </strong>
          <span>
            {q.lastTest.matches} / {q.lastTest.required} matching results
          </span>
          <span>
            {q.lastTest.cards.map((c) => card(c).name).join(" · ") ||
              "No character could commit to the test."}
          </span>
        </div>
      )}
    </section>
  );
}
export function WandererContractState({
  s,
  inspect,
  dispatch,
}: Props & { dispatch: (a: Action) => void }) {
  const cs = s.wainridersPlayers?.contracts;
  if (!cs?.length) return null;
  return (
    <section
      className="shadow-east-state"
      data-wanderer-contract
      aria-label="The Grey Wanderer contracts"
    >
      {cs.map((c) => {
        const reason =
          c.player !== activeSeat(s)
            ? "This contract belongs to another player."
            : wainridersPlayerAbilityProblem(s, c.unit);
        return (
          <div className="shadow-east-summary" key={c.unit.id}>
            <strong>The Grey Wanderer · Side {c.side}</strong>
            <span>
              {seatName(s, c.player)} ·{" "}
              {c.side === "B"
                ? "Your first non-unique card each planning phase needs no resource match."
                : "Search for a printed cost 1 attachment during setup."}
            </span>
            <button
              onClick={() =>
                inspect({
                  ...card(c.unit.code),
                  initialReverse: c.side === "B",
                })
              }
            >
              Inspect Grey Wanderer contract
            </button>
            <button
              disabled={
                !!reason ||
                s.status !== "playing" ||
                !!s.choice ||
                !!s.flow?.pending ||
                !!s.combat ||
                s.phase === "setup"
              }
              title={reason ?? undefined}
              onClick={() => dispatch({ type: "ABILITY", id: c.unit.id })}
            >
              Exhaust · Raise threat 1 · Choose two effects
            </button>
          </div>
        );
      })}
    </section>
  );
}
