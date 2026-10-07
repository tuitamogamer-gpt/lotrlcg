import type { GameState } from "./types";
import { card } from "./cards";
import { fx, log, prepend } from "./core";
import { currentQuestCode } from "./quest-state";
import { firstPlayer } from "./table";

/** Only the active quest's Time keyword loses a counter at refresh phase end. */
export const questTime = (s: GameState) => s.fordsIsen ?? s.catchOrc;
export function removeQuestTime(s: GameState, count = 1) {
  const timer = questTime(s);
  if (!timer?.time || count <= 0) return;
  timer.time = Math.max(0, timer.time - count);
  log(
    s,
    `${card(currentQuestCode(s)!).name} · ${timer.time} time counters.`,
    "danger",
  );
  if (!timer.time)
    prepend(
      s,
      fx(s.fordsIsen ? "fordsTimeExpired" : "catchTimeExpired", {
        value: s.stage,
        player: firstPlayer(s),
      }),
    );
}
