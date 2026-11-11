import type { Action, GameState } from "../game/types";
import { card } from "../game/cards";
import { allCharacters, seatName } from "../game/table";
import {
  FAS,
  fasCurrentQuest,
  fasPublicState,
} from "../game/flies-spiders-support";
import { bagginsBilbo } from "../game/hobbit-saga";
import { availableAbilities } from "../game/actions";
import { get } from "../game/core";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
  dispatch?: (a: Action) => void;
};
export function FliesSpidersState({ s, inspect, dispatch }: Props) {
  const q = fasPublicState(s);
  if (!q) return null;
  const bilbo = bagginsBilbo(s);
  const link = (code: string) => (
    <button
      className="fortress-nurn-link"
      aria-label={`Inspect ${card(code).name}`}
      onClick={() => inspect(card(code))}
    >
      {card(code).name}
    </button>
  );
  const current = fasCurrentQuest(s);
  const questUnit = current ? get(s, `quest:${current}`) : undefined;
  const wake = questUnit ? availableAbilities(s, questUnit)[0] : undefined;
  const poisoned = allCharacters(s).filter((u) =>
    u.attachments.some((a) => a.poison),
  ).length;
  const unconscious = allCharacters(s).filter((u) => u.unconscious).length;
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="flies-and-spiders"
      aria-label="Flies and Spiders"
    >
      <div className="shadow-east-summary">
        <strong>
          {q.split
            ? "Lost in the dark · separate staging areas"
            : "Poison and webs · Mirkwood's spiders"}
        </strong>
        {q.split &&
          q.areas.map((a) => (
            <span key={a.id} data-fas-area={a.id}>
              {a.players.map((p) => seatName(s, p)).join(", ")}: {a.quest} ·{" "}
              {a.progress} progress · {a.cards} card
              {a.cards === 1 ? "" : "s"} in the staging area
            </span>
          ))}
        {q.stageThreeComplete && (
          <span>
            {link(FAS.captured)} is complete: the first player joins{" "}
            {link(FAS.battle)} at the end of the quest phase.
          </span>
        )}
        {q.gladeSetAside && (
          <span>{link(FAS.glade)} waits out of play until stage 4.</span>
        )}
        <span data-poisoned={poisoned} data-unconscious-count={unconscious}>
          {poisoned} poisoned · {unconscious} unconscious character
          {unconscious === 1 ? "" : "s"}. Poison equal to printed hit points
          makes a character unconscious.
        </span>
        {bilbo && (
          <span data-baggins-resources={bilbo.resources}>
            Bilbo Baggins: {bilbo.resources} Baggins resource
            {bilbo.resources === 1 ? "" : "s"}.
          </span>
        )}
        {q.weighedDown && (
          <span>
            Weighed Down: exhausted characters get −1 willpower, attack and
            defense this round.
          </span>
        )}
        {wake && dispatch && questUnit && (
          <button
            className="secondary"
            disabled={wake.disabled || !!s.choice || !!s.flow?.pending}
            onClick={() => dispatch({ type: "ABILITY", id: questUnit.id })}
          >
            {wake.label}
          </button>
        )}
      </div>
    </section>
  );
}
