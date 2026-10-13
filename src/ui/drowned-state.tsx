import type { Card, GameState } from "../game/types";
import { card, imageUrl, name } from "../game/cards";
import { allCharacters, ownerOf, seatName } from "../game/table";
import { DROWNED } from "../game/drowned-support";
import { drownedPublicState } from "../game/drowned";
import "./drowned.css";

export function DrownedScenarioState({
  s,
  inspect,
}: {
  s: GameState;
  inspect: (c: Card) => void;
}) {
  const q = drownedPublicState(s);
  if (!q) return null;
  const top = q.topGrottoCode ? card(q.topGrottoCode) : undefined;
  const captains = allCharacters(s).filter((u) =>
    [DROWNED.sahirAlly, DROWNED.naasiyahAlly].includes(u.code),
  );
  return (
    <section
      className="drowned-scenario-state"
      data-scenario-panel="drowned"
      aria-label="The flooded grotto"
    >
      <div className="drowned-objective-summary">
        <strong>
          {s.stage === 1 ? "Explore the flooded grotto" : "Escape the shrine"}
        </strong>
        <span>
          {s.stage === 1
            ? `${q.underwaterVictories} / 3 Underwater locations in the victory display · ${s.progress} / 15 quest progress`
            : "Explore Shrine to Morgoth to escape and win."}
        </span>
        <span>
          {q.underwater
            ? "Underwater · allies and attachments cannot be played."
            : "Grotto · you may dive after travelling to a double-sided location."}
        </span>
        {q.flipLocked && (
          <span className="drowned-warning" role="status">
            Powerful Undertow · the active location cannot flip this round.
          </span>
        )}
      </div>
      <div className="drowned-deck-summary">
        <strong>Grotto deck · {q.grottoCount}</strong>
        {top ? (
          <button
            className="drowned-top-card"
            onClick={() => inspect(top)}
            aria-label={`Inspect top Grotto location: ${top.name}`}
          >
            <img src={imageUrl(top)} alt={top.name} />
            <span>
              {top.name}
              <small>Top location · Grotto side</small>
            </span>
          </button>
        ) : (
          <span>The Grotto deck is empty.</span>
        )}
      </div>
      <div className="drowned-captains" aria-label="Corsair companions">
        {captains.map((u) => (
          <button key={u.id} onClick={() => inspect(card(u.code))}>
            <strong>{name(u)}</strong>
            <span>
              {seatName(s, ownerOf(s, u))} · {u.resources} resources
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function DrownedQuestGoals({ s }: { s: GameState }) {
  const q = drownedPublicState(s);
  if (!q) return null;
  return (
    <div className="quest-goals" data-drowned-quest-goals>
      {s.stage === 1 ? (
        <>
          <span className={s.progress >= 15 ? "done" : ""}>
            Place 15 quest progress.
          </span>
          <span className={q.underwaterVictories >= 3 ? "done" : ""}>
            Explore 3 Underwater locations · {q.underwaterVictories} / 3
          </span>
          <span>Keep Captain Sahír and Na'asiyah in play.</span>
        </>
      ) : (
        <>
          <span>Explore Shrine to Morgoth to win.</span>
          <span>Keep Na'asiyah in play.</span>
          <span>
            The submerged shrine raises each player's threat by 5 at the end of
            the quest phase.
          </span>
        </>
      )}
    </div>
  );
}
