import { card } from "./cards";
import { druadanPlayerStartingThreat } from "./druadan-player-cards";
import type { Card } from "./types";

/** Initial threat includes printed constant hero-cost modifiers. */
export const startingThreat = (heroes: (string | Card)[]) =>
  heroes.reduce(
    (total, hero) =>
      total + ((typeof hero === "string" ? card(hero) : hero).threat ?? 0),
    0,
  ) +
  druadanPlayerStartingThreat(heroes) -
  heroes.filter(
    (hero) => (typeof hero === "string" ? card(hero) : hero).code === "17109",
  ).length *
    heroes.filter((hero) =>
      ((typeof hero === "string" ? card(hero) : hero).traits ?? "")
        .split(".")
        .some((trait) => trait.trim() === "Hobbit"),
    ).length;
