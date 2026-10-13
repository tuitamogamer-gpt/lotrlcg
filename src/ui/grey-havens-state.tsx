import type { Card, GameState } from "../game/types";
import { card, name } from "../game/cards";
import { allCharacters, ownerOf, seatName } from "../game/table";
import { stats } from "../game/engine";
import { isShipObjective } from "../game/ships";
import { sailingCommitCount, sailingHeadingLabel } from "../game/sailing";
import { sailingOnCourse } from "../game/sailing";
import { voyageSailingExtraCards } from "../game/voyage-belegaer";
import { cobasSailingExtraCards } from "../game/cobas";
import { stormcallerSameStage } from "../game/stormcaller";
import { stormcallerState } from "../game/stormcaller-support";
import { Art } from "./card-art";
import { TableToken } from "./tabletop";

export function StormcallerQuestSummary({
  s,
  inspect,
}: {
  s: GameState;
  inspect: (c: Card) => void;
}) {
  const pursuit = stormcallerState(s);
  if (!pursuit) return null;
  const quest = card(pursuit.enemyQuest);
  const damageLimit =
    pursuit.enemyStage === 2 ? 4 : pursuit.enemyStage === 3 ? 8 : null;
  const damageThisRound =
    pursuit.counterRound === s.round ? pursuit.damageThisRound : 0;
  return (
    <section
      className="stormcaller-quest-summary"
      data-scenario-panel="stormcaller"
      aria-label="Stormcaller's quest"
    >
      <button
        className="quest-card-stack"
        aria-label="Inspect Stormcaller quest"
        onClick={() => inspect(quest)}
      >
        <Art c={quest} imageSrc={quest.back_imagesrc ?? quest.imagesrc} />
        <span className="quest-stage-seal">{pursuit.enemyStage}D</span>
        <TableToken kind="progress" value={pursuit.enemyProgress} />
      </button>
      <div className="stormcaller-pursuit-values">
        <strong>{quest.back_name ?? quest.name}</strong>
        <span>
          Stage {pursuit.enemyStage} · {pursuit.enemyProgress} /{" "}
          {quest.back_quest ?? 0} progress
        </span>
        <progress
          value={pursuit.enemyProgress}
          max={quest.back_quest ?? 1}
          aria-label="Stormcaller quest progress"
        />
        <span>
          {stormcallerSameStage(s)
            ? "At your stage · this area's cards contribute staging threat and can be engaged or traveled to."
            : "At a different stage · this area is immune to player card effects and its enemies cannot be engaged."}
        </span>
        <span>
          Stormcaller damage this round · {damageThisRound}
          {damageLimit !== null ? ` / ${damageLimit}` : " · no stage limit"}
        </span>
        <span>
          {pursuit.enemyQuestDeck.length} pursuit stages remain · Corsair deck{" "}
          {pursuit.corsairDeck.length} · discarded{" "}
          {pursuit.corsairDiscard.length}
        </span>
      </div>
    </section>
  );
}

export function SailingTestSummary({ s }: { s: GameState }) {
  const test = s.sailing?.test;
  if (!test) return null;
  const extra = voyageSailingExtraCards(s) + cobasSailingExtraCards(s);
  return (
    <section
      className="escape-test-summary"
      aria-label="Sailing test"
      aria-live="polite"
    >
      <div>
        <strong>Sailing test · {seatName(s, test.player)}</strong>
        <span>
          {sailingHeadingLabel(s.sailing!.heading)} ·{" "}
          {sailingCommitCount(s) + extra} Sailing cards
          {extra > 0 && ` · ${extra} additional cards`}
        </span>
      </div>
      <p>
        {test.phase === "committing"
          ? "Choose ready characters in the Sailing dialog. Each exhausts; the Dream-chaser counts as two."
          : test.phase === "results"
            ? "Choose how many successful symbols to use to turn the fleet on-course."
            : "Resolve the test to look at encounter cards. Player actions pause until the test is complete."}
      </p>
    </section>
  );
}

export function GreyHavensScenarioState({
  s,
  inspect,
}: {
  s: GameState;
  inspect: (c: Card) => void;
}) {
  return (
    <>
      {s.sailing && (
        <div className="tower-counter" data-scenario-panel="sailing">
          <strong>
            Fleet heading · {sailingHeadingLabel(s.sailing.heading)}
          </strong>
          <span>
            The fleet turns off-course at the beginning of each Sailing test.
          </span>
          {allCharacters(s)
            .filter(isShipObjective)
            .map((u) => (
              <button key={u.id} onClick={() => inspect(card(u.code))}>
                {name(u)} · {seatName(s, ownerOf(s, u))} ·{" "}
                {Math.max(0, stats(s, u).health - u.damage)} /{" "}
                {stats(s, u).health} hit points
              </button>
            ))}
        </div>
      )}
      {s.fateNumenor && (
        <div className="tower-counter" data-scenario-panel="fate-numenor">
          <strong>Uncharted islands</strong>
          <span>
            {s.fateNumenor.unchartedDeck.length} islands remain in the Uncharted
            deck.
          </span>
          <span>
            Travel to Lost Islands to discover their reverse. Protect Calphon.
          </span>
        </div>
      )}
      {s.raidGreyHavens && (
        <div className="tower-counter" data-scenario-panel="raid-grey-havens">
          <strong>The Havens are burning</strong>
          <span>
            {s.raidGreyHavens.burned.length} locations destroyed by fire.
          </span>
          <span>
            Aflame locations in staging take 1 damage at the end of each round.
          </span>
        </div>
      )}
    </>
  );
}

export function GreyHavensQuestGoals({ s }: { s: GameState }) {
  const pursuit = stormcallerState(s);
  const progressLimit = sailingOnCourse(s) ? 8 : 4;
  return (
    <div className="quest-goals" data-grey-havens-quest-goals>
      {pursuit ? (
        <>
          <span>
            {s.stage === 1
              ? "Place 8 quest progress to begin the pursuit."
              : s.stage === 4 || stormcallerSameStage(s)
                ? "Defeat this quest stage to catch the Stormcaller and win."
                : "Complete this crossing to catch up with the Stormcaller."}
          </span>
          {s.stage === 2 && (
            <span>
              Quest progress this round ·{" "}
              {pursuit.counterRound === s.round ? pursuit.progressThisRound : 0}{" "}
              / {progressLimit}
            </span>
          )}
          <span>
            Make the Stormcaller leave play to win, or catch it before it
            escapes stage 4.
          </span>
          <span>Keep the fleet on-course and protect the Dream-chaser.</span>
        </>
      ) : s.voyageBelegaer ? (
        <>
          <span>Keep the fleet on-course to complete each crossing.</span>
          <span>
            Protect the Dream-chaser and every player's remaining ship.
          </span>
        </>
      ) : s.fateNumenor ? (
        <>
          <span>
            {s.stage === 1
              ? "Explore Uncharted locations to place quest progress."
              : "Find and explore the Shrine to Morgoth."}
          </span>
          <span>Calphon must remain in play.</span>
        </>
      ) : s.raidGreyHavens ? (
        <>
          <span>
            {s.stage === 1
              ? `Place 18 quest progress · ${Math.min(18, s.progress)} / 18`
              : "Defeat Captain Sahír and remove all damage from locations to win."}
          </span>
          <span>Prevent the fires from consuming the Havens.</span>
        </>
      ) : null}
    </div>
  );
}
