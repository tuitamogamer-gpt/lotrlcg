import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { get } from "../game/core";
import { allEngaged, seatName } from "../game/table";
import { NURN, fortressNurnPublicState } from "../game/fortress-nurn-support";
import { fortressNurnPlayerPublic } from "../game/fortress-nurn-player";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = { s: GameState; inspect: (c: InspectedCard) => void };
const piles = (s: GameState, list: { player: number; count: number }[]) =>
  list.length
    ? list.map((g) => `${seatName(s, g.player)} ${g.count}`).join(" · ")
    : "none";
export function FortressNurnState({ s, inspect }: Props) {
  const q = fortressNurnPublicState(s);
  if (!q) return null;
  const ulchor = [...s.staging, ...allEngaged(s)].find(
    (u) => u.code === NURN.ulchor,
  );
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="the-fortress-of-nurn"
      aria-label="The Fortress of Nurn castles"
    >
      <div className="shadow-east-summary">
        <strong>
          {s.stage === 1 ? "Storm the castle defences" : "Face Thane Ulchor"}
        </strong>
        {s.stage === 1 ? (
          <>
            <span>
              Castles defeated {q.castleWins} / 3 · X {q.x} · Power deck{" "}
              {q.powerDeck}
            </span>
            <span>
              {s.progress >= 3
                ? "Main quest at 3 progress: choose a side quest each quest phase."
                : `Main quest ${s.progress} / 3 progress.`}{" "}
              Defeated at round end with 3 Castles.
            </span>
          </>
        ) : (
          <>
            <span>
              Ulchor’s damage cannot exceed {s.progress} progress
              {ulchor ? ` · ${ulchor.damage} damage now` : ""}.
            </span>
            <span>
              Encounter effects cannot be canceled. Defeat him to win.
            </span>
          </>
        )}
        <span>Under the quest deck: {piles(s, q.questDeck)}</span>
      </div>
      {q.castles.map((c) => {
        const quest = get(s, c.id);
        return (
          <div className="shadow-east-summary" key={c.id}>
            <strong>
              {c.flipped && quest ? (
                <button
                  className="fortress-nurn-link"
                  onClick={() => inspect(card(quest.code))}
                >
                  {card(c.code).name} · {c.progress}/{card(c.code).quest ?? 0}
                </button>
              ) : (
                "Storm the Castle · reverse unknown"
              )}
            </strong>
            {c.power && (
              <span>
                Beneath, not in play:{" "}
                <button
                  className="fortress-nurn-link"
                  aria-label={`Inspect ${card(c.power).name}`}
                  onClick={() => inspect(card(c.power!))}
                >
                  {card(c.power).name}
                </button>
              </span>
            )}
            <span>Buried: {piles(s, c.under)}</span>
          </div>
        );
      })}
    </section>
  );
}
export function BondOfFriendshipState({ s, inspect }: Props) {
  const q = fortressNurnPlayerPublic(s);
  if (!q?.contracts.length) return null;
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-bond-contract
      aria-label="Bond of Friendship contracts"
    >
      {q.contracts.map((c) => (
        <div className="shadow-east-summary" key={c.id}>
          <strong>
            <button
              className="fortress-nurn-link"
              aria-label="Inspect Bond of Friendship"
              onClick={() => inspect(card("22147"))}
            >
              Bond of Friendship
            </button>{" "}
            · {seatName(s, c.player)}
          </strong>
          <span>Four heroes of different spheres began in play.</span>
        </div>
      ))}
    </section>
  );
}
