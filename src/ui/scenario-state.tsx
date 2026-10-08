import { CELEBRIMBOR } from "../game/celebrimbor-support";
import { WEATHER } from "../game/weather-hills-support";
import { DIKE } from "../game/deadmens-dike-support";
import { stats } from "../game/engine";
import { units } from "../game/core";
import { ninQuestName } from "../game/nin-eilph-support";
import { tharbadTimeLimit } from "../game/tharbad-support";
import { TRIALS } from "../game/three-trials-support";
import { trialsKeys } from "../game/three-trials";
import { allEngaged, seatIndices, seatView } from "../game/table";
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
import { AngmarScenarioState } from "./angmar-state";

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
    !s.threeTrials &&
    !s.tharbad &&
    !s.ninEilph &&
    !s.antlered &&
    !s.weatherHills &&
    !s.deadmensDike &&
    !s.wastesEriador &&
    !s.mountGram &&
    !s.ettenmoors &&
    !s.rhudaur &&
    !s.carnDum &&
    !s.dreadRealm &&
    !s.celebrimbor &&
    !s.bloodGondor &&
    !s.morgulVale &&
    !s.isengard?.outOfPlay.length
  )
    return null;
  return (
    <div className="scenario-state-summary" aria-label="Scenario counters">
      <AngmarScenarioState s={s} inspect={inspect} />
      {s.deadmensDike && (
        <>
          <div className="tower-counter">
            <strong>Player decks</strong>
            {seatIndices(s).map((player) => {
              const seat = seatView(s, player);
              return (
                <span key={player}>
                  {seatName(s, player)} · {seat.deck.length} cards remaining
                  {s.table?.seats[player]?.eliminated ? " · Eliminated" : ""}
                </span>
              );
            })}
            <span>If your deck runs out, you are eliminated.</span>
          </div>
          <div className="tower-counter">
            <strong>
              {s.stage === 1 ? "The Shades of Angmar" : "A Fell Wraith"}
            </strong>
            <span>Protect Iârion. If he leaves play, the players lose.</span>
            {s.staging.some((u) => u.code === DIKE.power && !u.blanked) && (
              <span>
                The Power of Angmar · Player card effects cannot move cards out
                of discard piles.
              </span>
            )}
            <button onClick={() => inspect(card(DIKE.thaurdir))}>
              {(() => {
                const thaurdir = [...s.staging, ...allEngaged(s)].find(
                  (u) => u.code === DIKE.thaurdir,
                );
                return thaurdir
                  ? `Thaurdir · ${Math.max(0, stats(s, thaurdir).health - thaurdir.damage)} / ${stats(s, thaurdir).health} hit points remaining · Indestructible`
                  : s.deadmensDike!.setAside.length
                    ? "Thaurdir · Set aside"
                    : "Thaurdir · Not in play";
              })()}
            </button>
            {s.deadmensDike.terrorRound === s.round &&
              s.deadmensDike.terrorThreat > 0 && (
                <span>
                  Terror of the North · +{s.deadmensDike.terrorThreat} staging
                  threat this round
                </span>
              )}
          </div>
        </>
      )}
      {s.weatherHills && (
        <div className="tower-counter">
          <strong>Orc deck · {s.weatherHills.orcDeck.length} cards</strong>
          <span>
            {s.stage === 1
              ? `Hunting the Orcs · ${s.staging.find((u) => u.code === WEATHER.mission)?.resources ?? 0} / ${3 + (s.table?.seats.length ?? 1)} resources`
              : `Savage Counter-attack · ${s.staging.find((u) => u.code === WEATHER.mission)?.resources ?? 0} resources remaining`}
          </span>
          <span>
            {s.stage === 1
              ? "Explore active locations to reveal Orc cards. Defeat enemies to advance the hunt."
              : "Keep a resource on the Mission. Clear Amon Forn and place 20 quest progress."}
          </span>
        </div>
      )}
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
      {s.antlered && (
        <div className="tower-counter">
          <strong>
            Time · {s.antlered.time} / {s.stage === 3 ? 2 : 3}
          </strong>
          <progress
            aria-label="Quest time counters"
            value={s.antlered.time}
            max={Math.max(s.antlered.time, s.stage === 3 ? 2 : 3)}
          />
          <span>
            Raven deck · {s.antlered.ravenDeck.length} cards ·{" "}
            {s.antlered.ravenDiscard.length} discarded
          </span>
          <span>
            {s.stage === 1
              ? "When time runs out, remove 1 time counter from each location."
              : s.stage === 2
                ? "Staging locations get +2 quest points. When time runs out, reveal a Raven enemy."
                : "When time runs out, each engaged enemy attacks. Defeat Raven Chief and survive until round end."}
          </span>
        </div>
      )}
      {s.celebrimbor && (
        <div className="tower-counter">
          <strong>Time · {s.celebrimbor.time} / 3</strong>
          <progress
            aria-label="Quest time counters"
            value={s.celebrimbor.time}
            max={Math.max(3, s.celebrimbor.time)}
          />
          <span>The Orcs’ Search · {s.celebrimbor.search.length} cards</span>
          <button onClick={() => inspect(card(CELEBRIMBOR.mould))}>
            Mould ·{" "}
            {(() => {
              const host = units(s).find((u) =>
                u.attachments.some((a) => a.code === CELEBRIMBOR.mould),
              );
              return host ? card(host.code).name : "Unclaimed";
            })()}
          </button>
          <span>
            At refresh end, each player gains {s.celebrimbor.search.length}{" "}
            threat. When time expires, resolve every Scour effect.
          </span>
        </div>
      )}
      {s.ninEilph && (
        <div className="tower-counter">
          <strong>Time · {s.ninEilph.time}</strong>
          <progress
            aria-label="Quest time counters"
            value={s.ninEilph.time}
            max={Math.max(s.ninEilph.time, s.stage === 4 ? 2 : 3)}
          />
          <span>{ninQuestName(s)}</span>
          <span>
            {s.stage === 4
              ? "When time expires, the Marsh-dweller attacks every player."
              : "When time expires, reveal a different random stage and lose quest progress."}
          </span>
        </div>
      )}
      {s.tharbad && (
        <div className="tower-counter">
          <strong>
            Time · {s.tharbad.time} / {tharbadTimeLimit(s.stage)}
          </strong>
          <progress
            aria-label="Quest time counters"
            value={s.tharbad.time}
            max={Math.max(s.tharbad.time, tharbadTimeLimit(s.stage))}
          />
          <span>Threat elimination · {s.tharbad.elimination}</span>
          <span>
            {s.stage === 1
              ? "Reduce every player's threat to zero. Protect Nalir."
              : "Explore the Crossing at Tharbad. Protect Nalir."}
          </span>
        </div>
      )}
      {s.threeTrials && (
        <div className="tower-counter">
          <strong>
            Trials completed · {s.threeTrials.completed.length} / 3
          </strong>
          <span>Keys held · {trialsKeys(s).length} / 3</span>
          <span>
            {s.stage === 3
              ? "Explore Hallowed Circle, then place 1 quest progress."
              : s.threeTrials.activeQuest === TRIALS.intuition
                ? "Quest progress searches the encounter deck for the current Key."
                : s.threeTrials.activeQuest === TRIALS.perseverance
                  ? "Explore the Barrow. Its Guardian cannot be damaged."
                  : s.stage === 1
                    ? "Keep your hand, then choose the first trial."
                    : "Defeat the Guardian. Barrows cannot be active during this trial."}
          </span>
          {[...s.staging, ...allEngaged(s)]
            .filter((u) => u.timeCounters !== undefined)
            .map((u) => (
              <button key={u.id} onClick={() => inspect(card(u.code))}>
                {card(u.code).name} · Time {u.timeCounters}
              </button>
            ))}
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
