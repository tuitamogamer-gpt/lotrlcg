import { FORDS, fordsTimeLimit } from "../game/fords-isen-support";
import { allCharacters } from "../game/table";
import type { Card, GameState, Unit } from "../game/types";
import { card } from "../game/cards";
import { playerOrder, seatName } from "../game/table";
import { morgulTowerProgress } from "../game/morgul-vale";
import { faceupShadowCards } from "../game/voice-isengard";
import { CardBack } from "./tabletop";

export function ScenarioState({
  s,
  inspect,
}: {
  s: GameState;
  inspect: (c: Card) => void;
}) {
  if (
    !s.fordsIsen &&
    !s.bloodGondor &&
    !s.morgulVale &&
    !s.isengard?.outOfPlay.length
  )
    return null;
  return (
    <div className="scenario-state-summary" aria-label="Scenario counters">
      {s.bloodGondor &&
        playerOrder(s).map((p) => (
          <div
            className="hidden-card-count"
            key={p}
            aria-label={`${seatName(s, p)}: ${s.bloodGondor!.hidden[p]?.length ?? 0} hidden cards`}
          >
            <CardBack encounter />
            <span>
              {seatName(s, p)}
              <strong>
                {s.bloodGondor!.hidden[p]?.length ?? 0} hidden cards
              </strong>
            </span>
          </div>
        ))}
      {s.fordsIsen && (
        <div className="tower-counter">
          <strong>
            Time · {s.fordsIsen.time} / {fordsTimeLimit(s.stage)}
          </strong>
          <progress
            aria-label="Quest time counters"
            value={s.fordsIsen.time}
            max={fordsTimeLimit(s.stage)}
          />
          <span>
            {s.stage === 1
              ? "Rescue Gríma before time runs out."
              : s.stage === 2
                ? "When time runs out, take damage equal to your hand size."
                : "When time runs out, more enemies may arrive."}
          </span>
          <button onClick={() => inspect(card(FORDS.grima))}>
            {allCharacters(s).some((u) => u.code === FORDS.grima)
              ? "Gríma is rescued"
              : s.staging.some((u) => u.code === FORDS.grima)
                ? "Gríma is guarded by The Islet"
                : "Gríma has left play"}
          </button>
        </div>
      )}
      {s.morgulVale && (
        <div className="tower-counter">
          <strong>To the Tower · {morgulTowerProgress(s)} / 10</strong>
          <progress
            aria-label="To the Tower"
            value={morgulTowerProgress(s)}
            max={10}
          />
          <span>Rescue Faramir before the tenth progress.</span>
        </div>
      )}
      {!!s.bloodGondor?.captured.length && (
        <div className="scenario-captives">
          <strong>Captured!</strong>
          {s.bloodGondor.captured.map((u) => (
            <button key={u.id} onClick={() => inspect(card(u.code))}>
              {card(u.code).name}
            </button>
          ))}
        </div>
      )}
      {s.isengard?.outOfPlay.map((g) => (
        <div className="scenario-captives" key={g.source}>
          <strong>Saruman · Out of play</strong>
          {g.cards.map((u) => (
            <button key={u.id} onClick={() => inspect(card(u.code))}>
              {card(u.code).name}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
export function FaceupShadows({
  u,
  inspect,
}: {
  u: Unit;
  inspect: (c: Card) => void;
}) {
  const cards = faceupShadowCards(u);
  if (!cards.length) return null;
  return (
    <div className="faceup-shadows" aria-label="Faceup shadow cards">
      {cards.map(({ index, code, name }) => (
        <button
          key={index}
          onClick={() => inspect(card(code))}
          aria-label={`Inspect faceup shadow: ${name}`}
        >
          Shadow · {name}
        </button>
      ))}
    </div>
  );
}
