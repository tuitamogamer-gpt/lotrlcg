import type { GameState } from "./types";
import { playerOrder, seatView } from "./table";

/** Printed duplicate codes do not permit reusing the same physical leave-play event. */
export const leaveCardAvailable = (s: GameState, id: string | undefined) =>
  !!id &&
  !playerOrder(s).some((player) =>
    seatView(s, player).used.includes(`leave:consumed:${id}`),
  );
export function consumeLeaveCard(s: GameState, id: string) {
  for (const player of playerOrder(s))
    seatView(s, player).used.push(`leave:consumed:${id}`);
}
