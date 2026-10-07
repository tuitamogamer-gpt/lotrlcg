import encounters from "../data/amon-din-encounter-cards.json";
import quests from "../data/amon-din-quest-cards.json";
import recipes from "../data/amon-din-recipes.json";
import type { Card, GameState } from "./types";
export const AMON_DIN_ENCOUNTERS = encounters as Card[];
export const AMON_DIN_QUESTS = quests as Card[];
export const AMON_DIN_RECIPES = recipes;
const code = (title: string) =>
  [...AMON_DIN_ENCOUNTERS, ...AMON_DIN_QUESTS].find((c) => c.name === title)!
    .code;
export const AMON_DIN = {
  savagery: code("Savagery of the Orcs"),
  protect: code("Protect the Villagers"),
  rescued: code("Rescued Villagers"),
  dead: code("Dead Villagers"),
  alcaron: code("Lord Alcaron"),
  ghulat: code("Ghulat"),
  marauder: code("Marauding Orc"),
  ravager: code("Orc Ravager"),
  eagle: code("Craven Eagle"),
  burning: code("Burning Farmhouse"),
  hamlet: code("Gondorian Hamlet"),
  secluded: code("Secluded Farmhouse"),
  homestead: code("Burnt Homestead"),
  trapped: code("Trapped Inside"),
  panicked: code("Panicked!"),
} as const;
export interface AmonDinState {
  questVillagers: number;
  ghulatSetAside: boolean;
}
export function validateAmonDinState(s: GameState): boolean {
  const q = (s as GameState & { amonDin?: AmonDinState }).amonDin;
  if (q === undefined)
    return (s.scenarioId as string) !== "encounter-at-amon-din";
  return (
    (s.scenarioId as string) === "encounter-at-amon-din" &&
    !!q &&
    typeof q === "object" &&
    Number.isInteger(q.questVillagers) &&
    q.questVillagers >= 0 &&
    q.questVillagers <= 5 &&
    typeof q.ghulatSetAside === "boolean" &&
    (s.stage === 1 || q.questVillagers === 0) &&
    (s.stage === 1 || s.stageRevealing || !q.ghulatSetAside)
  );
}
