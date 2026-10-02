import { card } from "./cards";
import { druadanPlayerStartingThreat } from "./druadan-player-cards";
import type { Card } from "./types";

/** Initial threat includes printed constant hero-cost modifiers. */
export const startingThreat = (heroes: (string | Card)[]) =>
  heroes.reduce(
    (total, hero) =>
      total + ((typeof hero === "string" ? card(hero) : hero).threat ?? 0),
    0,
  ) + druadanPlayerStartingThreat(heroes);
