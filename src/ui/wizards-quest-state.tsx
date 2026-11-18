import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { WQ, wizardsQuestPublicState } from "../game/wizards-quest-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
const STAGE_RULES: Record<string, string> = {
  [WQ.request]:
    "Radagast's Request: 10 quest points; cannot be defeated while Rhosgobel is in play. Explored, Rhosgobel flips to Rider of Mirkwood.",
  [WQ.fork]:
    "A Fork in the Road: 5 quest points; the location with a resource is immune to player card effects, cannot be traveled to while the stage has quest points remaining and must leave play first.",
  [WQ.carried]:
    "Carried Away: 20 quest points; allies with the titles of the guarded allies cannot be played or put into play.",
  [WQ.terror]:
    "A New Terror Abroad: 5 quest points, +5 per player; Rider of Mirkwood attacks the first player at the beginning of each quest phase.",
  [WQ.sorcery]:
    "The Tower of Sorcery: 20 quest points; after the players commit, the encounter deck is discarded until a treachery, which is revealed.",
  [WQ.dungeons]:
    "Dungeons of the Necromancer: 15 quest points; cannot be defeated while a hero is guarded.",
  [WQ.return]:
    "Return to Rhosgobel: 10 quest points; Rider of Mirkwood engages at cost 0 and takes no more damage than the stage's progress; it must leave play first.",
};
export function WizardsQuestState({ s, inspect }: Props) {
  const q = wizardsQuestPublicState(s);
  if (!q) return null;
  // A quest card is named by its B side; Rhosgobel by its own face.
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
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="the-wizards-quest"
      aria-label="The Wizard's Quest"
    >
      <div className="shadow-east-summary">
        <strong data-side={q.side}>
          {q.side} ·{" "}
          {q.building
            ? "The quick build: the players choose a stage 2 and a stage 3 quest card and 7 encounter sets."
            : (STAGE_RULES[q.currentQuest] ?? "")}
        </strong>
        <span data-stage2={q.stage2 ?? ""} data-stage3={q.stage3 ?? ""}>
          Quest deck: {link(WQ.request)}
          {q.stage2 ? <> · {link(q.stage2)}</> : null}
          {q.stage3 ? <> · {link(q.stage3)}</> : null}
        </span>
        <span data-sets={q.sets.join(",")}>
          Encounter sets: {q.sets.length ? q.sets.join(", ") : "not chosen yet"}
          .
        </span>
        <span data-rhosgobel={q.rhosgobel} data-rider={q.rider}>
          {q.rider !== "out" ? (
            <>
              {link(WQ.rider)}:{" "}
              {q.rider === "staging"
                ? "in the staging area"
                : q.rider === "engaged"
                  ? "engaged"
                  : "in the victory display"}
              .
            </>
          ) : (
            <>
              {link(WQ.rhosgobel)}:{" "}
              {q.rhosgobel === "out"
                ? "not in play"
                : q.rhosgobel === "active"
                  ? "the active location"
                  : "in the staging area"}
              .
            </>
          )}
        </span>
        {q.carried || q.passGuards || q.guardedHeroes ? (
          <span data-guarded={q.carried + q.passGuards + q.guardedHeroes}>
            Guarded: {q.carried} {q.carried === 1 ? "ally" : "allies"} under the
            stage, {q.passGuards} card{q.passGuards === 1 ? "" : "s"} under
            Necromancer's Pass, {q.guardedHeroes} hero
            {q.guardedHeroes === 1 ? "" : "es"} in the dungeons.
          </span>
        ) : null}
        {q.underShadow || q.nightfall ? (
          <span data-conditions={q.underShadow + q.nightfall}>
            {q.underShadow ? (
              <>
                {link(WQ.shadow)}: each player plays at most 1 card each
                phase.{" "}
              </>
            ) : null}
            {q.nightfall ? (
              <>
                {link(WQ.nightfall)} ×{q.nightfall}: 1 more threat in the
                refresh phase.
              </>
            ) : null}
          </span>
        ) : null}
      </div>
    </section>
  );
}
