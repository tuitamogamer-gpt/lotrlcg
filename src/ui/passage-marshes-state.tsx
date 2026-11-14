import type { GameState } from "../game/types";
import { card } from "../game/cards";
import {
  POM,
  POM_VICTORY_LOCATIONS,
  mireValue,
  passageMarshesPublicState,
} from "../game/passage-marshes-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
export function PassageMarshesState({ s, inspect }: Props) {
  const q = passageMarshesPublicState(s);
  if (!q) return null;
  const link = (code: string, label = card(code).name) => (
    <button
      className="fortress-nurn-link"
      aria-label={`Inspect ${label}`}
      onClick={() => inspect(card(code))}
    >
      {label}
    </button>
  );
  const creeping = Object.values(s.questAttachments ?? {})
    .flat()
    .filter((a) => a.code === POM.creeping).length;
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="the-passage-of-the-marshes"
      aria-label="The Passage of the Marshes"
    >
      <div className="shadow-east-summary">
        <strong data-stage={s.stage}>
          {s.stage === 1
            ? "The Taming of Sméagol: the players cannot advance unless the first player controls Sméagol; each attack on Gollum discards the top encounter card and adds its threat to his defense."
            : s.stage === 2
              ? `Across the Marshes: no progress on locations in the staging area; to advance, the first player must control Sméagol and the victory display must hold ${POM_VICTORY_LOCATIONS} locations.`
              : '"Don\'t Look at the Lights!": no progress here while any player is engaged with an Undead enemy; the players win when this stage is defeated and the first player controls Sméagol.'}
        </strong>
        <span data-gollum-side={q.side ?? "none"}>
          {q.side === "smeagol" ? (
            <>
              {link(POM.smeagol, "Sméagol")} is with the first player
              {q.smeagolExhausted ? " (exhausted)" : " (ready)"}: if he is
              destroyed, the players lose; an unsuccessful quest flips him to{" "}
              {link(POM.gollum)}.
            </>
          ) : q.side === "gollum" ? (
            <>
              {link(POM.gollum)} is engaged with the first player: defeat him to
              flip him to Sméagol.
            </>
          ) : (
            "Gollum is not in play."
          )}
        </span>
        {s.stage === 2 && (
          <span data-victory-locations={q.victoryLocations}>
            {q.victoryLocations} of {POM_VICTORY_LOCATIONS} locations in the
            victory display.
          </span>
        )}
        <span data-mire={q.mire.map((m) => m.tokens).join(",")}>
          Mire: at the end of the refresh phase each location in the staging
          area gets 1 mire token and is discarded, with its Forced effect, at
          its Mire value
          {q.mire.length
            ? ` · ${q.mire.map((m) => `${card(m.code).name} ${m.tokens} of ${mireValue(m.code)}`).join(", ")}`
            : ""}
          {creeping
            ? ` · ${creeping} Creeping Marshes on the quest add 1 token each`
            : ""}
          .
        </span>
      </div>
    </section>
  );
}
