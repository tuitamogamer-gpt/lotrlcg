import encounters from "../data/druadan-forest-encounter-cards.json";
import quests from "../data/druadan-forest-quest-cards.json";
import recipes from "../data/druadan-forest-recipes.json";
import type { Card, GameState } from "./types";

export const DRUADAN_FOREST_ENCOUNTERS = encounters as Card[];
export const DRUADAN_FOREST_QUESTS = quests as Card[];
export const DRUADAN_FOREST_RECIPES = recipes;
const code = (title: string) =>
  [...DRUADAN_FOREST_ENCOUNTERS, ...DRUADAN_FOREST_QUESTS].find(
    (c) => c.name === title,
  )!.code;
export const DRUADAN_FOREST = {
  pursuit: code("The Pursuit"),
  untimely: code("An Untimely End"),
  passage: code("The Passage Out"),
  boss: code("Dru-buri-Dru"),
  drummer: code("Drúadan Drummer"),
  elite: code("Drúadan Elite"),
  hunter: code("Drúadan Hunter"),
  thief: code("Drúadan Thief"),
  clearing: code("Ancestral Clearing"),
  garden: code("Garden of Poisons"),
  glade: code("Glade of Cleansing"),
  men: code("Men in the Dark"),
  stars: code("Stars in Sky"),
  leaves: code("Leaves on Tree"),
} as const;

export interface DruadanForestState {
  /** The public setup card remains outside all decks until stage 3. */
  bossSetAside?: string;
  /** Tracks actual hero damage through optional damage replacements. */
  menDamageTaken?: boolean;
}
export function validateDruadanForestState(s: GameState): boolean {
  const q = s.druadanForest;
  if (q === undefined) return s.scenarioId !== "the-druadan-forest";
  if (s.scenarioId !== "the-druadan-forest" || !q || typeof q !== "object")
    return false;
  return (
    (q.bossSetAside === undefined || q.bossSetAside === DRUADAN_FOREST.boss) &&
    (q.menDamageTaken === undefined || typeof q.menDamageTaken === "boolean") &&
    !(
      q.bossSetAside &&
      (s.encounterDeck.includes(q.bossSetAside) ||
        s.encounterDiscard.includes(q.bossSetAside) ||
        s.victoryCards?.includes(q.bossSetAside) ||
        [
          ...s.staging,
          ...s.engaged,
          ...(s.table?.seats.flatMap((p) => p.engaged) ?? []),
        ].some((u) => u.code === q.bossSetAside))
    )
  );
}
