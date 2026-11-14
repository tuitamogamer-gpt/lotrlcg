import type { GameState } from "../game/types";
import { card } from "../game/cards";
import {
  SL,
  SL_PASS_PROGRESS,
  shelobLairPublicState,
} from "../game/shelob-lair-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
export function ShelobLairState({ s, inspect }: Props) {
  const q = shelobLairPublicState(s);
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
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="shelobs-lair"
      aria-label="Shelob's Lair"
    >
      <div className="shadow-east-summary">
        <strong data-stage={q.stage}>
          {q.stage === 1
            ? "The Stairs of Cirith Ungol: no progress on Underground locations; with Sméagol's Secret Way in the victory display at the end of the quest phase, the players advance."
            : q.stage === 2
              ? `The Spider's Pass: Shelob cannot leave the staging area, Sméagol cannot attack or defend, each player can bring 1 ally into play each round, and at most ${SL_PASS_PROGRESS} progress is placed on the stage each round.`
              : "Gollum's Betrayal: the players win when they defeat this stage with both Shelob and Gollum in the victory display."}
        </strong>
        {q.stage === 1 && (
          <span data-secret-way-victory={q.secretWayVictory ? "true" : "false"}>
            {link(SL.secretWay)}:{" "}
            {q.secretWayVictory
              ? "in the victory display; the players advance at the end of the quest phase."
              : "not yet explored."}{" "}
            {q.setAside} cards are set aside, out of play.
          </span>
        )}
        {q.stage === 2 && (
          <span data-pass-progress={q.passProgress}>
            {q.passProgress} of {SL_PASS_PROGRESS} progress placed on The
            Spider&apos;s Pass this round.
          </span>
        )}
        {q.shelobInPlay && (
          <span
            data-shelob-resources={q.shelobResources}
            data-cleft-victory={q.cleftVictory ? "true" : "false"}
          >
            {link(SL.shelob)}: {q.shelobResources} resource
            {q.shelobResources === 1 ? "" : "s"} (+1 threat each
            {q.stage === 3 ? "; each cancels the damage dealt to her once" : ""}
            ).{" "}
            {q.cleftVictory
              ? "Cleft of Cirith Ungol is in the victory display: she has +2 attack, is not Indestructible and engages the first player."
              : "She is Indestructible."}
          </span>
        )}
        {q.stage === 3 && (
          <span
            data-shelob-victory={q.shelobVictory ? "true" : "false"}
            data-gollum-victory={q.gollumVictory ? "true" : "false"}
          >
            Victory display: {link(SL.shelob)} {q.shelobVictory ? "✓" : "—"} ·{" "}
            {link(SL.gollum)} {q.gollumVictory ? "✓" : "—"}.
          </span>
        )}
      </div>
    </section>
  );
}
