import encounters from "../data/dread-realm-encounter-cards.json";
import quests from "../data/dread-realm-quest-cards.json";
import recipes from "../data/dread-realm-recipes.json";
import { DIKE } from "./deadmens-dike-support";
import type { Card, GameState, Unit } from "./types";

export const DREAD_ENCOUNTERS = encounters as Card[];
export const DREAD_QUESTS = quests as Card[];
export const DREAD_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const DREAD = {
  catacombs: code("The Catacombs of Carn Dûm"),
  awakened: code("Angmar Awakened"),
  fall: code("Daechanar's Fall"),
  daechanar: code("Daechanar"),
  dwimmerlaik: code("Dwimmerlaik"),
  witch: code("Witch of Angmar"),
  wraith: code("Wraith of Carn Dûm"),
  altar: code("Altar of Midwinter"),
  tombs: code("Tombs of Carn Dûm"),
  crypt: code("Unholy Crypt"),
  halls: code("Dark Halls"),
  dungeon: code("Sinister Dungeon"),
  calamity: code("Death and Calamity"),
  fell: code("A Fell Dread"),
  possession: code("Possession"),
  reanimated: "dread:reanimated-dead",
  restless: DIKE.restless,
  cursed: DIKE.cursed,
  seal: DIKE.seal,
  curse: DIKE.curse,
  lord: DIKE.lord,
  power: DIKE.power,
  terror: DIKE.terror,
  sorcery: DIKE.sorcery,
};
export { DREAD_REANIMATED_CARD } from "./dread-reanimated-card";
export interface DreadDiscardBinding {
  id: string;
  code: string;
  owner: number;
  index: number;
}
export interface DreadKilledCharacter {
  id: string;
  code: string;
  owner: number;
  player: number;
}
export interface DreadRealmState {
  initialized: boolean;
  daechanarDefeated: boolean;
  setAside: Unit[];
  pendingWraiths: Unit[];
  discardBindings: DreadDiscardBinding[];
  terrorRound: number;
  terrorThreat: number;
}
export function validateDreadRealm(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.dreadRealm;
  if (q === undefined) return s.scenarioId !== "the-dread-realm";
  if (
    !q ||
    s.scenarioId !== "the-dread-realm" ||
    typeof q.initialized !== "boolean" ||
    typeof q.daechanarDefeated !== "boolean" ||
    ![1, 2, 3].includes(s.stage) ||
    !Array.isArray(q.setAside) ||
    q.setAside.length > 2 ||
    !q.setAside.every(
      (u) => validUnit(u) && [DREAD.daechanar, DREAD.altar].includes(u.code),
    ) ||
    new Set(q.setAside.map((u) => u.code)).size !== q.setAside.length ||
    !Array.isArray(q.pendingWraiths) ||
    !q.pendingWraiths.every((u) => validUnit(u) && u.code === DREAD.wraith) ||
    !Array.isArray(q.discardBindings) ||
    !Number.isSafeInteger(q.terrorRound) ||
    q.terrorRound < -1 ||
    q.terrorRound > s.round ||
    !Number.isSafeInteger(q.terrorThreat) ||
    q.terrorThreat < 0 ||
    (q.terrorThreat > 0 && q.terrorRound < 0)
  )
    return false;
  const count = s.table?.seats.length ?? 1;
  return (
    q.discardBindings.every(
      (b) =>
        b &&
        typeof b.id === "string" &&
        typeof b.code === "string" &&
        Number.isSafeInteger(b.owner) &&
        b.owner >= 0 &&
        b.owner < count &&
        Number.isSafeInteger(b.index) &&
        b.index >= 0 &&
        (s.table
          ? b.owner === s.table.active
            ? s.discard
            : s.table.seats[b.owner].discard
          : s.discard)[b.index] === b.code,
    ) &&
    new Set(q.discardBindings.map((b) => b.id)).size ===
      q.discardBindings.length &&
    new Set([...q.setAside, ...q.pendingWraiths].map((u) => u.id)).size ===
      q.setAside.length + q.pendingWraiths.length
  );
}
