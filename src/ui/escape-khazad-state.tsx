import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { EK, escapeKhazadPublicState } from "../game/escape-khazad-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
const STAGE_RULES: Record<string, string> = {
  [EK.depths]:
    "Out of the Depths: 10 quest points; explored, Dark Pit flips over and Durin's Bane is set aside, and each player searches the top 5 cards of their deck for a card. The stage cannot be defeated while Dark Pit is in play.",
  [EK.lair]:
    "Old One Lair: 10 quest points; the enemy with a resource is immune to player card effects, and no progress can be placed on the stage while it is in play.",
  [EK.wrongTurn]:
    "A Wrong Turn: 15 quest points; when revealed, each player kept 1 card in hand and shuffled the rest into their deck.",
  [EK.wayUp]:
    "A Way Up: 20 quest points; the active location's threat is added to the staging area, and the players must travel to a location, if able.",
  [EK.bridge]:
    "The Bridge of Khazad-dûm: 10 quest points, no more than 5 progress each round; at the beginning of each quest phase Durin's Bane attacks the first player, and undefended or excess damage goes onto the stage. 10 damage on the stage loses the game.",
  [EK.lastLord]:
    "Last Lord of Moria: 15 quest points; Durin's Bane engages the first player and cannot take more than X damage each round (X the progress on the stage). Durin's Bane must leave play first.",
  [EK.rearGuard]:
    "The Rear Guard: 20 quest points; threat cannot be reduced by player card effects, and Durin's Bane is considered engaged with each player and attacks each of them.",
};
const BANE: Record<string, string> = {
  aside: "set aside, out of play",
  staging: "in the staging area",
  engaged: "engaged",
  victory: "in the victory display",
  out: "not in play",
};
export function EscapeKhazadState({ s, inspect }: Props) {
  const q = escapeKhazadPublicState(s);
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
      data-scenario-panel="escape-from-khazad-dum"
      aria-label="Escape from Khazad-dûm"
    >
      <div className="shadow-east-summary">
        <strong data-side={q.side}>
          {q.side} ·{" "}
          {q.building
            ? "The quick build: the players choose a stage 2 and a stage 3 quest card and 7 encounter sets."
            : (STAGE_RULES[q.currentQuest] ?? "")}
        </strong>
        <span data-stage2={q.stage2 ?? ""} data-stage3={q.stage3 ?? ""}>
          Quest deck: {link(EK.depths)}
          {q.stage2 ? <> · {link(q.stage2)}</> : null}
          {q.stage3 ? <> · {link(q.stage3)}</> : null}
        </span>
        <span data-sets={q.sets.join(",")}>
          Encounter sets: {q.sets.length ? q.sets.join(", ") : "not chosen yet"}
          .
        </span>
        <span data-pit={q.pit} data-bane={q.bane}>
          {q.pit !== "out" ? (
            <>
              {link(EK.pit)}:{" "}
              {q.pit === "active"
                ? "the active location"
                : "in the staging area"}
              .
            </>
          ) : (
            <>
              {link(EK.bane)}: {BANE[q.bane]}.
            </>
          )}
        </span>
        {q.bridgeCap !== null || q.dungeon || q.nameless || q.lair ? (
          <span
            data-bridge-damage={q.bridgeDamage}
            data-bridge-cap={q.bridgeCap ?? ""}
            data-dungeon={q.dungeon}
            data-nameless={q.nameless}
            data-lair={q.lair ? "1" : ""}
          >
            {q.bridgeCap !== null ? (
              <>
                {link(EK.bridge)}: {q.bridgeDamage} of 10 damage; {q.bridgeCap}{" "}
                more progress can be placed on it this round.{" "}
              </>
            ) : null}
            {q.lair ? (
              <>
                {link(EK.lair)}: the enemy with a resource is in play; no
                progress can be placed on the stage.{" "}
              </>
            ) : null}
            {q.dungeon ? (
              <>
                Guarded under {link(EK.dungeon)}: {q.dungeon} all
                {q.dungeon === 1 ? "y" : "ies"}.{" "}
              </>
            ) : null}
            {q.nameless ? (
              <>
                {link(EK.nameless)}: {q.nameless} player card
                {q.nameless === 1 ? "" : "s"} attached as guarded attachments.
              </>
            ) : null}
          </span>
        ) : null}
      </div>
    </section>
  );
}
