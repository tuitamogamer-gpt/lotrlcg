import type { Card } from "./types";

/** Player cards with encounter backs never belong in a player draw deck. */
export const hasEncounterKeyword = (c: Card) =>
  c.sphere_code !== "encounter" &&
  /(?:^|[.\n]\s*)Encounter\./i.test((c.text ?? "").replace(/<[^>]*>/g, ""));
