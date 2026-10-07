import encounters from "../data/assault-osgiliath-encounter-cards.json";
import quests from "../data/assault-osgiliath-quest-cards.json";
import recipes from "../data/assault-osgiliath-recipes.json";
import type { Card, GameState, Unit } from "./types";

export const ASSAULT_OSGILIATH_ENCOUNTERS = encounters as Card[];
export const ASSAULT_OSGILIATH_QUESTS = quests as Card[];
export const ASSAULT_OSGILIATH_RECIPES = recipes;
const code = (title: string) =>
  [...ASSAULT_OSGILIATH_ENCOUNTERS, ...ASSAULT_OSGILIATH_QUESTS].find(
    (c) => c.name === title,
  )!.code;
export const ASSAULT_OSGILIATH = {
  retake: code("Retake the City"),
  pinned: code("Pinned Down"),
  harbor: code("Ancient Harbor"),
  phalanx: code("Southron Phalanx"),
  counter: code("Counter-attack"),
  street: code("Street Fighting"),
  commander: code("Southron Commander"),
  gate: code("West Gate"),
  east: code("East Quarter"),
  tower: code("Ruined Tower"),
  west: code("West Quarter"),
  lieutenant: code("Uruk Lieutenant"),
  bridge: code("The Old Bridge"),
  soldier: code("Uruk Soldier"),
  library: code("The King's Library"),
  square: code("Ruined Square"),
} as const;

/** Controlled locations remain public, physical encounter cards in play. */
export interface AssaultOsgiliathState {
  controlled: Unit[];
  archeryBonus: number;
  /** Conflicting active-quarter replacements are ordered by the first player. */
  questStat?: "attack" | "defense";
}
export function validateAssaultOsgiliathState(
  s: GameState,
  validUnit?: (value: unknown) => boolean,
): boolean {
  const q = s.assaultOsgiliath;
  if (q === undefined) return s.scenarioId !== "assault-on-osgiliath";
  if (
    s.scenarioId !== "assault-on-osgiliath" ||
    !q ||
    !Array.isArray(q.controlled) ||
    !Number.isInteger(q.archeryBonus) ||
    q.archeryBonus < 0 ||
    (q.questStat !== undefined && !["attack", "defense"].includes(q.questStat))
  )
    return false;
  const combats = [s.combat, ...(s.suspendedCombats ?? [])].filter(Boolean);
  if (
    combats.some((combat) =>
      ["osgiliathReturnIfKilled", "osgiliathUndefended"].some((key) => {
        const value = (combat as unknown as Record<string, unknown>)[key];
        return value !== undefined && typeof value !== "boolean";
      }),
    )
  )
    return false;
  const count = s.table?.seats.length ?? 1;
  const other = [
    ...s.staging,
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []),
    ...s.heroes,
    ...s.allies,
    ...s.hand,
    ...s.engaged,
    ...(s.table?.seats.flatMap((p) => [
      ...p.heroes,
      ...p.allies,
      ...p.hand,
      ...p.engaged,
    ]) ?? []),
  ];
  if (new Set(q.controlled.map((u) => u?.id)).size !== q.controlled.length)
    return false;
  return q.controlled.every(
    (u) =>
      !!u &&
      (!validUnit || validUnit(u)) &&
      !other.some((o) => o.id === u.id) &&
      ASSAULT_OSGILIATH_ENCOUNTERS.some(
        (c) =>
          c.code === u.code &&
          c.type_code === "location" &&
          /\bOsgiliath\b/.test(c.traits ?? ""),
      ) &&
      Number.isInteger(u.owner) &&
      (u.owner ?? -1) >= 0 &&
      (u.owner ?? count) < count &&
      !s.table?.seats[u.owner ?? 0]?.eliminated &&
      Number.isInteger(u.progress) &&
      u.progress >= 0,
  );
}
