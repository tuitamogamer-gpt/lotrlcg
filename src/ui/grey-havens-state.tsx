import type { Card, GameState } from "../game/types";
import { card, name } from "../game/cards";
import { allCharacters, ownerOf, seatName } from "../game/table";
import { stats } from "../game/engine";
import { isShipObjective } from "../game/ships";
import { sailingCommitCount, sailingHeadingLabel } from "../game/sailing";

export function SailingTestSummary({ s }: { s: GameState }) {
  const test = s.sailing?.test;
  if (!test) return null;
  return (
    <section
      className="escape-test-summary"
      aria-label="Sailing test"
      aria-live="polite"
    >
      <div>
        <strong>Sailing test · {seatName(s, test.player)}</strong>
        <span>
          {sailingHeadingLabel(s.sailing!.heading)} · {sailingCommitCount(s)}{" "}
          Sailing cards
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
  return (
    <div className="quest-goals" data-grey-havens-quest-goals>
      {s.voyageBelegaer ? (
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
