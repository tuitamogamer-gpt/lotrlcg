import { selectedSideQuest } from "./side-quest-support";
import { ninTimeRemoved } from "./nin-eilph";
import { tharbadTimeBlocked, tharbadTimeRemoved } from "./tharbad";
import { fangornTimeRemoved } from "./fangorn";
import type { GameState } from "./types";
import { card } from "./cards";
import { fx, log, prepend } from "./core";
import { currentQuestCode, mainQuestCode } from "./quest-state";
import { firstPlayer } from "./table";

/** Printed main-quest Time remains in play while a side quest is current. */
export const questTime = (s: GameState) =>
  selectedSideQuest(s) && s.phase !== "refresh"
    ? undefined
    : (s.fordsIsen ??
      s.catchOrc ??
      s.fangorn ??
      s.dunlandTrap ??
      s.tharbad ??
      s.ninEilph ??
      s.celebrimbor ??
      s.antlered ??
      s.rhudaur);
export const canRemoveQuestTime = (s: GameState) =>
  !!questTime(s)?.time && !tharbadTimeBlocked(s);
export function removeQuestTime(s: GameState, count = 1) {
  const timer = questTime(s);
  if (!timer?.time || count <= 0 || tharbadTimeBlocked(s)) return;
  const removed = Math.min(timer.time, count);
  timer.time -= removed;
  log(
    s,
    `${card(s.phase === "refresh" ? mainQuestCode(s)! : currentQuestCode(s)!).name} · ${timer.time} time counters.`,
    "danger",
  );
  const effects = [
    ...fangornTimeRemoved(s, removed),
    ...tharbadTimeRemoved(s, removed),
    ...ninTimeRemoved(s),
  ];
  if (!timer.time)
    effects.push(
      fx(
        s.rhudaur
          ? "rhudaurTimeExpired"
          : s.antlered
            ? "crownTimeExpired"
            : s.celebrimbor
              ? "celebTimeExpired"
              : s.ninEilph
                ? "ninTimeExpired"
                : s.tharbad
                  ? "tharbadTimeExpired"
                  : s.fordsIsen
                    ? "fordsTimeExpired"
                    : s.catchOrc
                      ? "catchTimeExpired"
                      : s.dunlandTrap
                        ? "dunlandTimeExpired"
                        : "fangornTimeExpired",
        {
          value: s.stage,
          code: s.phase === "refresh" ? mainQuestCode(s) : currentQuestCode(s),
          player: firstPlayer(s),
        },
      ),
    );
  if (effects.length > 1)
    prepend(s, fx("fangornOrder", { effects, player: firstPlayer(s) }));
  else prepend(s, ...effects);
}
