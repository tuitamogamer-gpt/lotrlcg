import type { GameState } from "./types";
import { foundationsArea } from "./foundations-stone-support";
import { gramArea } from "./mount-gram-support";

/** Each separated staging area chooses its own current quest. */
export const sideQuestArea = (s: GameState) =>
  s.mountGram?.split
    ? (gramArea(s)?.id ?? "shared")
    : s.foundationsStone?.split
      ? (foundationsArea(s)?.id ?? "shared")
      : "shared";
export const selectedSideQuest = (s: GameState) => {
  const selected = s.sideQuestSelections?.[sideQuestArea(s)];
  return selected &&
    (selected.phase === s.phase ||
      (["quest", "staging"].includes(s.phase) &&
        (!selected.phase || ["quest", "staging"].includes(selected.phase))))
    ? selected
    : undefined;
};
export const selectedSideQuestUnit = (s: GameState) => {
  const selected = selectedSideQuest(s);
  return selected && !selected.defeated
    ? s.staging.find((u) => u.id === selected.id && u.code === selected.code)
    : undefined;
};
