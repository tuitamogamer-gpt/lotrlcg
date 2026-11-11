import type { GameState } from "../game/types";
import { card } from "../game/cards";
import {
  BURGLES,
  SMAUG_PROGRESS_LIMIT,
  TLM,
  burgleItemLabel,
  tlmPublicState,
} from "../game/lonely-mountain-support";
import { bagginsBilbo } from "../game/hobbit-saga";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = { s: GameState; inspect: (c: InspectedCard) => void };
export function LonelyMountainState({ s, inspect }: Props) {
  const q = tlmPublicState(s);
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
  const burgle = q.burgle;
  const revealed = burgle?.revealed ? card(burgle.revealed) : undefined;
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="the-lonely-mountain"
      aria-label="The Lonely Mountain"
    >
      <div className="shadow-east-summary">
        <strong>
          {q.stage === 4
            ? "Smaug wakes · Thieves! Fire! Murder!"
            : q.stage === 3
              ? "Inside Information · The bare patch"
              : "Burglary in Erebor · Smaug sleeps"}
        </strong>
        <span data-treasure-stack={q.stack}>
          {q.stack} treasure{q.stack === 1 ? "" : "s"} under{" "}
          {link(TLM.mountain)}
          {q.stack ? ` (−${2 * q.stack} threat, immune)` : ""}.
        </span>
        {q.treasures.length > 0 && (
          <span data-burgled={q.treasures.join(" ")}>
            Burgled: {q.treasures.map((c) => card(c).name).join(", ")}.
          </span>
        )}
        {q.smaugProgress !== null && (
          <span data-smaug-progress={q.smaugProgress}>
            {link(TLM.golden)}: {q.smaugProgress} of {SMAUG_PROGRESS_LIMIT}{" "}
            progress tokens; the 6th wakes him.
          </span>
        )}
        {q.magnificentDamage !== null && (
          <span data-smaug-damage={q.magnificentDamage}>
            {link(TLM.magnificent)}: {q.magnificentDamage} damage
            {q.barePatch ? " · A Bare Patch attached (−3 defense)" : ""}.
            {q.stage === 3
              ? " He leaves play once the stage's progress exceeds his remaining hit points."
              : ""}
          </span>
        )}
        {burgle && revealed && (
          <span data-burgle={burgle.code}>
            Burgle attempt ({link(burgle.code)}): revealed {revealed.name} ·
            match {BURGLES[burgle.code].cards} by{" "}
            {BURGLES[burgle.code].items
              .map((i) => burgleItemLabel(revealed, i))
              .join(" and ")}
            .
          </span>
        )}
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
        {q.noTravel && (
          <span>
            {link(TLM.entrance)} turned the players back: no more travel this
            round.
          </span>
        )}
      </div>
    </section>
  );
}
