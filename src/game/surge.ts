import type { Effect } from "./types";

/** Resolve the response to gaining Surge before revealing its extra card. */
export function surgeEffects(code: string): Effect[] {
  return [{ kind: "amonSurgeWindow", code }, { kind: "reveal" }];
}
