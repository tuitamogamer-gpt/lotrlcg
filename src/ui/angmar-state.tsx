import type { Card, GameState } from "../game/types";
import { card } from "../game/cards";
import { stats } from "../game/engine";
import {
  allActiveLocations,
  allCharacters,
  allEngaged,
  seatIndices,
  seatName,
  seatView,
} from "../game/table";
import { WASTES } from "../game/wastes-eriador-support";
import { GRAM, gramQuestUnit } from "../game/mount-gram-support";
import { ETTEN_SAFE } from "../game/ettenmoors-support";
import { RHUDAUR_CLUES } from "../game/rhudaur-support";
import { CARN } from "../game/carn-dum-support";
import { DREAD } from "../game/dread-realm-support";

/** Choose the visible face without changing the original front/back printing. */
function currentFace(
  c: Card,
  flipped?: boolean,
): Card & { initialReverse?: boolean } {
  return { ...c, initialReverse: !!flipped };
}

/** Public physical counts only: prisoners and reanimated card faces stay hidden. */
export function AngmarScenarioState({
  s,
  inspect,
}: {
  s: GameState;
  inspect: (c: Card) => void;
}) {
  const enemies = [...s.staging, ...allEngaged(s)];
  const time = s.staging.find((u) => u.code === WASTES.time);
  const quest = s.mountGram ? gramQuestUnit(s) : undefined;
  const clues = allCharacters(s).flatMap((u) =>
    u.attachments.filter((a) => RHUDAUR_CLUES.includes(a.code)),
  );
  const boss = enemies.find((u) => u.code === CARN.thaurdir);
  return (
    <>
      {s.wastesEriador && (
        <div className="tower-counter" data-scenario-panel="wastes">
          <strong>{time?.flipped ? "Nightfall" : "Daybreak"}</strong>
          <button
            onClick={() =>
              inspect(currentFace(card(WASTES.time), time?.flipped))
            }
          >
            Read the Time objective
          </button>
          <span>
            {time?.flipped
              ? "No progress on quest cards. Encounter card effects cannot be canceled."
              : "No engagement checks. Optional engagement remains available."}
          </span>
          <span>The Time objective flips at the end of the round.</span>
          {s.stage === 3 && (
            <span>
              Warg Pack Leader · {s.progress} / 5 quest progress ·{" "}
              {enemies.some((u) => u.code === WASTES.leader)
                ? "In play"
                : "Defeated or out of play"}
            </span>
          )}
        </div>
      )}
      {s.mountGram && (
        <>
          <div className="tower-counter" data-scenario-panel="gram">
            <strong>Captured cards</strong>
            {seatIndices(s).map((p) => (
              <span key={p}>
                {seatName(s, p)} · {s.mountGram!.capturedDecks[p]?.length ?? 0}{" "}
                in captured deck
              </span>
            ))}
            <span>
              {Object.values(s.mountGram.captured).reduce(
                (n, cards) => n + cards.length,
                0,
              )}{" "}
              prisoners beneath encounter cards
            </span>
            {s.stage === 2 && quest?.code === GRAM.dungeons && (
              <span>
                Current dungeon · {s.mountGram.captured[quest.id]?.length ?? 0}{" "}
                prisoners remaining · Progress rescues a random prisoner.
              </span>
            )}
          </div>
          {s.mountGram.split && (
            <div className="tower-counter" data-scenario-panel="gram-areas">
              <strong>Separate staging areas</strong>
              {s.mountGram.areas.map((a) => (
                <span key={a.id}>
                  {a.players.map((p) => seatName(s, p)).join(" & ")} ·{" "}
                  {s.mountGram!.captured[a.quest.id]?.length ?? 0} dungeon
                  prisoners · {a.staging.length} staging cards
                  {a.id === s.mountGram!.activeArea ? " · Viewing" : ""}
                </span>
              ))}
            </div>
          )}
          {s.stage === 3 && (
            <span>
              Flight from Mount Gram · {s.progress} / 16 quest progress ·
              Southern Gate{" "}
              {s.staging.some((u) => u.code === GRAM.gate) ||
              allActiveLocations(s).some((u) => u.code === GRAM.gate)
                ? "remains in play"
                : "cleared"}
            </span>
          )}
        </>
      )}
      {s.ettenmoors && (
        <div className="tower-counter" data-scenario-panel="etten">
          <strong>Safe locations</strong>
          {allActiveLocations(s).some((u) => ETTEN_SAFE.includes(u.code)) ? (
            allActiveLocations(s)
              .filter((u) => ETTEN_SAFE.includes(u.code))
              .map((u) => (
                <button key={u.id} onClick={() => inspect(card(u.code))}>
                  {card(u.code).name} · Active Safe location
                </button>
              ))
          ) : (
            <span>No active Safe location</span>
          )}
          <span>
            {s.staging.filter((u) => ETTEN_SAFE.includes(u.code)).length} Safe
            locations in staging
          </span>
        </div>
      )}
      {s.rhudaur && (
        <div className="tower-counter" data-scenario-panel="rhudaur">
          <strong>
            {s.stage === 1
              ? `Time · ${s.rhudaur.time} / 5`
              : "Thaurdir’s Pursuit"}
          </strong>
          {s.stage === 1 && (
            <progress
              aria-label="Rhudaur quest time counters"
              value={s.rhudaur.time}
              max={5}
            />
          )}
          <span>
            {clues.length} Clue{clues.length === 1 ? "" : "s"} recovered ·{" "}
            {clues.length * 5} reduction to the final quest’s requirement
          </span>
          {clues.map((a) => (
            <button key={a.id} onClick={() => inspect(card(a.code))}>
              {card(a.code).name}
            </button>
          ))}
        </div>
      )}
      {s.carnDum && (
        <div className="tower-counter" data-scenario-panel="carn">
          <strong>Thaurdir · {boss?.flipped ? "Champion" : "Captain"}</strong>
          {boss && (
            <>
              <button
                onClick={() =>
                  inspect(currentFace(card(boss.code), boss.flipped))
                }
              >
                Read Thaurdir’s current face
              </button>
              <span>
                {Math.max(0, stats(s, boss).health - boss.damage)} /{" "}
                {stats(s, boss).health} hit points · {boss.shadows.length}{" "}
                shadow cards
              </span>
            </>
          )}
          <span>
            {enemies.reduce((n, u) => n + u.shadows.length, 0)} shadow cards on
            enemies in play
          </span>
        </div>
      )}
      {s.dreadRealm && (
        <div className="tower-counter" data-scenario-panel="dread">
          <strong>
            Reanimated Dead ·{" "}
            {enemies.filter((u) => u.code === DREAD.reanimated).length} in play
          </strong>
          <span>
            {s.staging.filter((u) => u.code === DREAD.reanimated).length} in
            staging
          </span>
          {seatIndices(s).map((p) => (
            <span key={p}>
              {seatName(s, p)} ·{" "}
              {
                seatView(s, p).engaged.filter(
                  (u) => u.code === DREAD.reanimated,
                ).length
              }{" "}
              engaged
            </span>
          ))}
          <span>
            {s.dreadRealm.daechanarDefeated
              ? "Daechanar defeated"
              : "Daechanar remains a threat"}
          </span>
        </div>
      )}
    </>
  );
}
