import encounters from "../data/harad-encounter-cards.json";
import quests from "../data/harad-quest-cards.json";
import recipes from "../data/harad-recipes.json";
import type { Card, GameState } from "./types";

const sets = new Set(["Desert Crossing", "Desert Sands", "Desert Creatures"]);
export const DESERT_CROSSING_ENCOUNTERS = (encounters as Card[]).filter((c) =>
  sets.has(c.encounter_set ?? ""),
);
export const DESERT_CROSSING_QUESTS = (quests as Card[]).filter(
  (c) => c.encounter_set === "Desert Crossing",
);
export const DESERT_CROSSING_RECIPES = recipes.filter((r) =>
  ["Q07.2", "E07.2"].includes(r.id),
);
const code = (name: string) =>
  [...DESERT_CROSSING_ENCOUNTERS, ...DESERT_CROSSING_QUESTS].find(
    (c) => c.name === name,
  )!.code;
export const DESERT_CROSSING = {
  desert: code("The Desert of Harad"),
  sun: code("Under the Merciless Sun"),
  beasts: code("Beasts of Legend"),
  shade: code("Seek Shade"),
  worm: code("Were-worm"),
  bird: code("Carrion Bird"),
  sands: code("Burnt Sands"),
  hamada: code("Scorched Hamada"),
  wadi: code("Parched Wadi"),
  mirage: code("Mirage"),
  heat: code("Unbearable Heat"),
  scorch: code("Scorching Sun"),
  water: code("Find Water"),
  dunes: code("Towering Dunes"),
  oasis: code("Desert Oasis"),
  sandstorm: code("Sandstorm"),
  exhaustion: code("Heat Exhaustion"),
  remedy: code("Craft Remedy"),
  viper: code("Sand Viper"),
  scorpion: code("Giant Scorpion"),
};
export const DESERT_CROSSING_MAIN_QUESTS = [
  DESERT_CROSSING.desert,
  DESERT_CROSSING.sun,
  DESERT_CROSSING.beasts,
];
export interface DesertCrossingState {
  initialized: boolean;
  advancing: boolean;
  currentQuest: string;
  questDeck: string[];
  completedQuests: string[];
  temperature: number;
  /** A resolving Mirage has not reached the discard pile that it shuffles. */
  resolving: string[];
  /** Poison survives save/reload and prevents the framework refresh ready, too. */
  poisoned: { id: string; round: number }[];
}
export const desertCrossingCurrentQuest = (s: GameState) =>
  s.desertCrossing?.currentQuest;
export function desertCrossingStageInfo(s: GameState) {
  const q = DESERT_CROSSING_QUESTS.find(
    (c) => c.code === desertCrossingCurrentQuest(s),
  );
  return q
    ? {
        name: q.back_name ?? q.name,
        cardCode: q.code,
        quest: q.back_quest ?? 0,
        story: q.back_text ?? "",
        questImage: q.back_imagesrc ?? q.imagesrc,
      }
    : undefined;
}
export function validateDesertCrossing(
  s: GameState,
  _validUnit?: (u: unknown) => boolean,
) {
  const q = s.desertCrossing;
  if (q === undefined) return s.scenarioId !== "desert-crossing";
  if (
    !q ||
    s.scenarioId !== "desert-crossing" ||
    !Array.isArray(q.questDeck) ||
    !Array.isArray(q.completedQuests) ||
    !Array.isArray(q.resolving) ||
    !Array.isArray(q.poisoned)
  )
    return false;
  const chain = [...q.completedQuests, q.currentQuest, ...q.questDeck];
  return (
    typeof q.initialized === "boolean" &&
    typeof q.advancing === "boolean" &&
    Number.isInteger(s.stage) &&
    s.stage >= 1 &&
    s.stage <= 3 &&
    q.currentQuest === DESERT_CROSSING_MAIN_QUESTS[s.stage - 1] &&
    chain.length === 3 &&
    chain.every((c, i) => c === DESERT_CROSSING_MAIN_QUESTS[i]) &&
    Number.isInteger(q.temperature) &&
    q.temperature >= 0 &&
    q.resolving.every((c) => c === DESERT_CROSSING.mirage) &&
    q.poisoned.every(
      (p) =>
        p &&
        typeof p.id === "string" &&
        Number.isInteger(p.round) &&
        p.round >= 0 &&
        p.round <= s.round,
    ) &&
    new Set(q.poisoned.map((p) => p.id)).size === q.poisoned.length
  );
}
export const desertCrossingTens = (s: GameState) =>
  Math.floor((s.desertCrossing?.temperature ?? 0) / 10);
