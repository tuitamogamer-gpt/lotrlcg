import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { MM, minesMoriaPublicState } from "../game/mines-moria-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
const STAGE_RULES: Record<string, string> = {
  [MM.request]:
    "To the West-door: 5 quest points; with 5 progress, The Watcher is considered engaged with each player and attacks each of them. Defeated, it flips to Chamber of Mazarbul; the stage cannot be defeated while it is in play.",
  [MM.presence]:
    "A Presence in the Dark: 20 quest points; at the beginning of the staging step, the opposing team puts 1 of the top 2 encounter cards on the bottom.",
  [MM.longDark]:
    "The Long Dark of Moria: 20 quest points; when revealed, the opposing team added one different 0 cost location per player.",
  [MM.narrow]:
    "Narrow Paths: 20 quest points; an attachment of each player is guarded under the stage, and attachments with those titles cannot be played until it is defeated.",
  [MM.drums]:
    "Drums in the Deep: 10 quest points; enemies cannot take damage while Chamber of Mazarbul is in the staging area, and the stage cannot be defeated while an enemy is in play.",
  [MM.balin]:
    "The Fate of Balin: 20 quest points; at the beginning of the staging step, reveal another card or allow at most 5 progress this phase. Chamber of Mazarbul must leave play first.",
  [MM.eastward]:
    "Continuing Eastward: 15 quest points; staged locations get +1 threat and +3 quest points, and the explored active location reveals a card. Chamber of Mazarbul must leave play first.",
};
export function MinesMoriaState({ s, inspect }: Props) {
  const q = minesMoriaPublicState(s);
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
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="the-mines-of-moria"
      aria-label="The Mines of Moria"
    >
      <div className="shadow-east-summary">
        <strong data-side={q.side}>
          {q.side} ·{" "}
          {q.building
            ? "The quick build: the players choose a stage 2 and a stage 3 quest card and 7 encounter sets."
            : (STAGE_RULES[q.currentQuest] ?? "")}
        </strong>
        <span data-stage2={q.stage2 ?? ""} data-stage3={q.stage3 ?? ""}>
          Quest deck: {link(MM.request)}
          {q.stage2 ? <> · {link(q.stage2)}</> : null}
          {q.stage3 ? <> · {link(q.stage3)}</> : null}
        </span>
        <span data-sets={q.sets.join(",")}>
          Encounter sets: {q.sets.length ? q.sets.join(", ") : "not chosen yet"}
          .
        </span>
        <span data-watcher={q.watcher} data-chamber={q.chamber}>
          {q.watcher !== "out" ? (
            <>
              {link(MM.watcher)}:{" "}
              {q.watcher === "staging" ? "in the staging area" : "engaged"}.
            </>
          ) : (
            <>
              {link(MM.chamber)}:{" "}
              {q.chamber === "out"
                ? "not in play"
                : q.chamber === "active"
                  ? "the active location"
                  : q.chamber === "victory"
                    ? "in the victory display"
                    : "in the staging area"}
              .
            </>
          )}
        </span>
        {q.guarded || q.hidden || q.cap !== null ? (
          <span
            data-guarded={q.guarded}
            data-hidden={q.hidden}
            data-cap={q.cap ?? ""}
          >
            {q.guarded ? (
              <>
                Guarded under {link(MM.narrow)}: {q.guarded} attachment
                {q.guarded === 1 ? "" : "s"}.{" "}
              </>
            ) : null}
            {q.hidden ? (
              <>
                {link(MM.hidden)}: {q.hidden} facedown card
                {q.hidden === 1 ? "" : "s"} under the main quest.{" "}
              </>
            ) : null}
            {q.cap !== null ? (
              <>{q.cap} more progress can be placed on the stage this phase.</>
            ) : null}
          </span>
        ) : null}
      </div>
    </section>
  );
}
