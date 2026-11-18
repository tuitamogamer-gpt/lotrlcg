import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { seatName } from "../game/table";
import { WR, woodlandRealmPublicState } from "../game/woodland-realm-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
const STAGE_RULES: Record<string, string> = {
  [WR.request]:
    "Captured by Spiders: 10 quest points; explored, Spider Den flips to Mendor under the first player's control. It cannot be defeated unless the first player controls Mendor.",
  [WR.dark]:
    "Lost in the Dark: 20 quest points; the first treachery revealed each round gains Doomed 1 and cannot be canceled. After the commit, no more than 5 progress this round (10 if Mendor is committed).",
  [WR.path]:
    '"Don\'t Leave the Path": 20 quest points; no progress on staged locations and the players must travel if able. After the commit, no more than 5 progress this round (10 if Mendor is committed).',
  [WR.ambush]:
    "Ambushed at Night: 20 quest points; staged enemies get -10 engagement cost, cannot be optionally engaged and cannot take damage. After the commit, no more than 5 progress this round (10 if Mendor is committed).",
  [WR.fear]:
    "The Forest of Great Fear: 15 quest points; the enemy with a resource gets +2 attack and +2 defense, is immune to player card effects and must leave play first.",
  [WR.halls]:
    "To the Elvenking's Halls: X quest points, the highest threat; each player's threat is reduced by at most 1 each round, and 10 progress in a quest phase reveal the top encounter card.",
  [WR.escape]:
    "Escape from Taur-nu-Fuin: 20 quest points; at the beginning of each quest phase the encounter deck is discarded until a location, which is staged.",
};
export function WoodlandRealmState({ s, inspect }: Props) {
  const q = woodlandRealmPublicState(s);
  if (!q) return null;
  // A quest card is named by its B side; the other cards by their own face.
  const link = (
    code: string,
    label = card(code).type_code === "quest"
      ? (card(code).back_name ?? card(code).name)
      : card(code).name,
  ) => (
    <button
      className="fortress-nurn-link"
      aria-label={`Inspect ${label}`}
      onClick={() => inspect(card(code))}
    >
      {label}
    </button>
  );
  const seat = (p: number) => (s.table ? seatName(s, p) : "you");
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="the-woodland-realm"
      aria-label="The Woodland Realm"
    >
      <div className="shadow-east-summary">
        <strong data-side={q.side}>
          {q.side} ·{" "}
          {q.building
            ? "The quick build: the players choose a stage 2 and a stage 3 quest card and 7 encounter sets."
            : (STAGE_RULES[q.currentQuest] ?? "")}
        </strong>
        <span data-stage2={q.stage2 ?? ""} data-stage3={q.stage3 ?? ""}>
          Quest deck: {link(WR.request)}
          {q.stage2 ? <> · {link(q.stage2)}</> : null}
          {q.stage3 ? <> · {link(q.stage3)}</> : null}
        </span>
        <span data-sets={q.sets.join(",")}>
          Encounter sets: {q.sets.length ? q.sets.join(", ") : "not chosen yet"}
          .
        </span>
        <span data-den={q.den} data-mendor={q.mendor ?? ""}>
          {q.mendor !== null ? (
            <>
              {link(WR.mendor)}: under {seat(q.mendor)}
              {s.table ? "'s" : "r"} control; if Mendor leaves play, the players
              lose.
            </>
          ) : (
            <>
              {link(WR.den)}:{" "}
              {q.den === "out"
                ? "not in play"
                : q.den === "active"
                  ? "the active location"
                  : "in the staging area"}
              .
            </>
          )}
        </span>
        {q.marked || q.cap !== null || q.turned ? (
          <span
            data-marked={q.marked ?? ""}
            data-cap={q.cap ?? ""}
            data-turned={q.turned}
          >
            {q.marked ? (
              <>The enemy with a resource: {link(q.marked)}. </>
            ) : null}
            {q.cap !== null ? (
              <>{q.cap} more progress can be placed on the stage this round. </>
            ) : null}
            {q.turned ? (
              <>
                {link(WR.turned)} ×{q.turned}: +{5 * q.turned} quest points.
              </>
            ) : null}
          </span>
        ) : null}
      </div>
    </section>
  );
}
