import type { Unit } from "./types";
/** Gwaihir (The Land of Sorrow) does not ready during the refresh phase's
 * framework step; card effects in that phase can still ready him. */
export const skipsFrameworkRefresh = (u: Unit) =>
  u.code === "22108" && !u.blanked;
