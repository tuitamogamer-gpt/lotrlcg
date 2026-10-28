import type { Action, GameState } from "../game/types";
import { card } from "../game/cards";
import { engagementCost, stats } from "../game/core";
import { activeSeat, seatName } from "../game/table";
import {
  ULFAST,
  ulfastPublicState,
  ulfastStageInfo,
} from "../game/ulfast-support";
import { huntersAbilityProblem } from "../game/ulfast-player-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";

type Props = { s: GameState; inspect: (c: InspectedCard) => void };
export function UlfastScenarioState({ s, inspect }: Props) {
  const q = ulfastPublicState(s),
    info = ulfastStageInfo(s);
  if (!q || !info) return null;
  const guard = s.staging.find((u) => u.code === ULFAST.guard);
  return (
    <section
      className="shadow-east-state"
      data-scenario-panel="the-city-of-ulfast"
      aria-label="The City of Ulfast scenario state"
    >
      <div className="shadow-east-summary">
        <strong>
          Stage {s.stage} · {info.name}
        </strong>
        <span>
          Main quest · {q.resources} resources · {s.progress} / {info.quest}{" "}
          progress
        </span>
        <span>
          At the end of the round, place 1 resource on the main quest. Each
          resource lowers City Guard’s engagement cost by 5.
        </span>
        <button
          onClick={() =>
            inspect({
              ...card(q.currentQuest),
              initialReverse: !s.stageRevealing,
            })
          }
        >
          Inspect current quest
        </button>
      </div>
      {guard && (
        <div className="shadow-east-summary" data-ulfast-guard>
          <strong>
            City Guard · {guard.damage} / {stats(s, guard).health} damage
          </strong>
          <span>
            Engagement cost · {engagementCost(s, guard)} · Damage limit this
            stage · {q.damageLimit}
          </span>
          <span>
            City Guard stays in staging and is considered engaged with each
            player whose threat meets its engagement cost.
          </span>
          {s.stage === 4 && (
            <span>
              To win, reach 20 progress and leave City Guard with no remaining
              hit points.
            </span>
          )}
          <button onClick={() => inspect(card(guard.code))}>
            Inspect City Guard
          </button>
        </div>
      )}
    </section>
  );
}
export function HuntersContractState({
  s,
  inspect,
  dispatch,
}: Props & { dispatch: (a: Action) => void }) {
  const contracts = s.ulfastPlayers?.contracts;
  if (!contracts?.length) return null;
  return (
    <section
      className="shadow-east-state"
      data-hunters-contract
      aria-label="Three Hunters contracts"
    >
      {contracts.map((c) => {
        const reason =
          c.player !== activeSeat(s)
            ? "This contract belongs to another player."
            : huntersAbilityProblem(s, c.unit.id);
        return (
          <div className="shadow-east-summary" key={c.unit.id}>
            <strong>Forth, The Three Hunters! · Side {c.side}</strong>
            <span>
              {seatName(s, c.player)} · Each hero may have one additional
              restricted attachment.
            </span>
            <span>
              {c.side === "A"
                ? "The first restricted attachment played on each of your heroes each round costs 1 less."
                : "Each of your heroes gains 1 willpower for each restricted attachment it has."}
            </span>
            <button
              onClick={() =>
                inspect({
                  ...card(c.unit.code),
                  initialReverse: c.side === "B",
                })
              }
            >
              Inspect Three Hunters contract
            </button>
            <button
              disabled={
                !!reason ||
                s.status !== "playing" ||
                !!s.choice ||
                !!s.flow?.pending ||
                !!s.combat
              }
              title={reason ?? undefined}
              onClick={() => dispatch({ type: "ABILITY", id: c.unit.id })}
            >
              {c.side === "A"
                ? "Flip Three Hunters contract"
                : "Heal each of your heroes"}
            </button>
          </div>
        );
      })}
    </section>
  );
}
