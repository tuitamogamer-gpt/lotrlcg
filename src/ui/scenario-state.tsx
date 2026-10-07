import { DUNLAND_TRAP, dunlandTimeLimit } from "../game/dunland-trap-support";
import { FANGORN, fangornTimeLimit } from "../game/fangorn-support";
import { fangornCarrier } from "../game/fangorn";
import { FORDS, fordsTimeLimit } from "../game/fords-isen-support";
import { CATCH_ORC } from "../game/catch-orc-support";
import { mugashCarrier } from "../game/catch-orc";
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
    !s.catchOrc &&
    !s.fangorn &&
    !s.dunlandTrap &&
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
      {s.dunlandTrap && (
        <div className="tower-counter">
          <strong>
            {!s.dunlandTrap.initialized
              ? "Prepare the ambush"
              : s.stage === 2
                ? "A Well Laid Trap"
                : `Time · ${s.dunlandTrap.time} / ${dunlandTimeLimit(s)}`}
          </strong>
          {s.dunlandTrap.initialized && s.stage !== 2 && (
            <progress
              aria-label="Quest time counters"
              value={s.dunlandTrap.time}
              max={dunlandTimeLimit(s)}
            />
          )}
          <span>
            {!s.dunlandTrap.initialized
              ? "Keep your opening hands before choosing a Boar Clan enemy."
              : s.stage === 1
                ? "When time runs out, discard your hand and draw 2 cards."
                : s.stage === 2
                  ? "Survive until the end of combat to confront Chief Turch."
                  : "Protect every hero. Survive the final attacks when time runs out."}
          </span>
          <button onClick={() => inspect(card(DUNLAND_TRAP.turch))}>
            Chief Turch · the Boar Clan leader
          </button>
        </div>
      )}
      {s.fangorn && (
        <div className="tower-counter">
          <strong>
            Time · {s.fangorn.time} / {fangornTimeLimit(s.stage)}
          </strong>
          <progress
            aria-label="Quest time counters"
            value={s.fangorn.time}
            max={fangornTimeLimit(s.stage)}
          />
          <span>
            {s.stage === 3
              ? "Find Mugash and place 6 progress to resume your escape."
              : "Escape before Mugash disappears into the forest."}
          </span>
          <button onClick={() => inspect(card(FANGORN.mugash))}>
            {fangornCarrier(s)
              ? "Mugash is captured"
              : "Mugash must be recaptured"}
          </button>
        </div>
      )}
      {s.catchOrc && (
        <>
          <div className="tower-counter">
            <strong>
              {s.catchOrc.initialized
                ? `Time · ${s.catchOrc.time}`
                : "Prepare the search"}
            </strong>
            <span>
              {!s.catchOrc.initialized
                ? "Keep your opening hands before preparing the out-of-play decks."
                : s.stage === 2
                  ? "Quest beyond the active location to gain time or pursue Mugash."
                  : "Guard Mugash and return before he escapes."}
            </span>
            {s.catchOrc.initialized && (
              <button onClick={() => inspect(card(CATCH_ORC.mugash))}>
                {mugashCarrier(s)
                  ? `Mugash · guarded by ${card(mugashCarrier(s)!.code).name}`
                  : [
                        ...s.staging,
                        ...s.engaged,
                        ...(s.table?.seats.flatMap((p) => p.engaged) ?? []),
                      ].some((u) => u.code === CATCH_ORC.mugash)
                    ? "Mugash is free"
                    : "Find Mugash"}
              </button>
            )}
          </div>
          {s.catchOrc.initialized &&
            playerOrder(s).map((p) => (
              <div
                className="hidden-card-count"
                key={`search-${p}`}
                aria-label={`${seatName(s, p)}: ${s.catchOrc!.decks[p]?.length ?? 0} out-of-play cards`}
              >
                <CardBack />
                <span>
                  {seatName(s, p)}
                  <strong>
                    {s.catchOrc!.decks[p]?.length ?? 0} out-of-play cards
                  </strong>
                </span>
              </div>
            ))}
        </>
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
