import { fangornTimeRemoved } from "./fangorn";
import type { GameState } from "./types";
import { card } from "./cards";
import { fx, log, prepend } from "./core";
import { currentQuestCode } from "./quest-state";
import { firstPlayer } from "./table";

/** Only the active quest's Time keyword loses a counter at refresh phase end. */
export const questTime = (s: GameState) =>
  s.fordsIsen ?? s.catchOrc ?? s.fangorn;
export function removeQuestTime(s: GameState, count = 1) {
  const timer = questTime(s);
  if (!timer?.time || count <= 0) return;
  const removed = Math.min(timer.time, count);
  timer.time -= removed;
  log(
    s,
    `${card(currentQuestCode(s)!).name} · ${timer.time} time counters.`,
    "danger",
  );
  const effects = fangornTimeRemoved(s, removed);
  if (!timer.time)
    effects.push(
      fx(
        s.fordsIsen
          ? "fordsTimeExpired"
          : s.catchOrc
            ? "catchTimeExpired"
            : "fangornTimeExpired",
        {
          value: s.stage,
          player: firstPlayer(s),
        },
      ),
    );
  if (effects.length > 1)
    prepend(s, fx("fangornOrder", { effects, player: firstPlayer(s) }));
  else prepend(s, ...effects);
}
