import type { Action, GameState } from "../game/types";
import { card } from "../game/cards";
import { availableAbilities } from "../game/actions";
import { mainQuestUnit } from "../game/quest-state";
import { LAKE, lakeTownPublicState } from "../game/lake-town-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
  dispatch?: (a: Action) => void;
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
export function LakeTownState({ s, inspect, dispatch }: Props) {
  const q = lakeTownPublicState(s);
  if (!q) return null;
  const link = (code: string) => (
    <button
      className="fortress-nurn-link"
      aria-label={`Inspect ${card(code).name}`}
      onClick={() => inspect(card(code))}
    >
      {card(code).name}
    </button>
  );
  const busy = !!s.choice || !!s.flow?.pending;
  const actions = [
    ...s.staging.filter((u) => u.code === LAKE.merchant),
    ...(s.activeLocation?.code === LAKE.merchant ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []).filter((u) => u.code === LAKE.merchant),
    ...(mainQuestUnit(s)?.code === LAKE.wrath ? [mainQuestUnit(s)!] : []),
  ].flatMap((u) => {
    const a = availableAbilities(s, u)[0];
    return a && !a.disabled ? [{ u, a }] : [];
  });
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="the-battle-of-lake-town"
      aria-label="The Battle of Lake-town"
    >
      <div className="shadow-east-summary">
        <strong>
          {link(LAKE.town)}: {q.townDamage}/{q.townLimit} damage
        </strong>
        <span data-lake-town-damage={q.townDamage} data-victory={q.victory}>
          Victory display: {plural(q.victory, "point")} against{" "}
          {`${q.townDamage} damage`} on Lake-town. Defeating Smaug at stage 3
          wins only with more victory points.
        </span>
        <span data-lake-burn={q.burn}>
          Burn in play: {`${q.burn} damage`}. When burn resolves, each player
          may exhaust characters to take it; the rest burns Lake-town.
        </span>
        <span data-lake-smaug={q.smaug?.code ?? ""}>
          {q.smaug ? (
            <>
              {link(q.smaug.code)}: {`${q.smaug.damage} damage`}
              {q.smaugCap !== null
                ? ` · no more than ${q.smaugCap} at this stage`
                : " · he can be defeated"}
              {q.reckless ? ` · Reckless in His Rage ×${q.reckless}` : ""}
            </>
          ) : (
            "Smaug is revealed at the beginning of each quest phase."
          )}
        </span>
        <span data-smaug-deck={q.smaugDeck}>
          Smaug deck: {plural(q.smaugDeck, "card")}
          {q.smaugDiscard.length
            ? ` · discard: ${q.smaugDiscard.map((c) => card(c).name).join(", ")}`
            : ""}
        </span>
        {dispatch &&
          actions.map(({ u, a }) => (
            <button
              key={u.id}
              className="secondary"
              disabled={busy}
              onClick={() => dispatch({ type: "ABILITY", id: u.id })}
            >
              {a.label}
            </button>
          ))}
      </div>
    </section>
  );
}
