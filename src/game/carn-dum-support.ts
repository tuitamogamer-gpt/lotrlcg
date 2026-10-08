import encounters from "../data/carn-dum-encounter-cards.json";
import quests from "../data/carn-dum-quest-cards.json";
import recipes from "../data/carn-dum-recipes.json";
import { CHETWOOD } from "./chetwood-support";
import { DIKE } from "./deadmens-dike-support";
import type { Card, GameState } from "./types";

export const CARN_ENCOUNTERS = encounters as Card[];
export const CARN_QUESTS = quests as Card[];
export const CARN_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const CARN = {
  furious: code("Furious Charge"),
  blight: code("Blight of Carn Dûm"),
  wolf: code("Werewolf of Angmar"),
  will: code("Daechanar's Will"),
  garrison: code("Carn Dûm Garrison"),
  mountains: code("Mountains of Angmar"),
  clutches: code("The Clutches of Carn Dûm"),
  crux: code("Midwinter's Crux"),
  walls: code("Fortress Walls"),
  thaurdir: code("Thaurdir"),
  vile: code("Vile Affliction"),
  sky: code("The Sky Darkens"),
  grunts: code("Orc Grunts"),
  battlefield: code("Accursed Battlefield"),
  orc: CHETWOOD.orc,
  marauder: CHETWOOD.marauder,
  captain: CHETWOOD.captain,
  ambush: CHETWOOD.ambush,
  power: DIKE.power,
  curse: DIKE.curse,
  sorcery: DIKE.sorcery,
  terror: DIKE.terror,
};

export interface CarnDumState {
  initialized: boolean;
  furiousRound: number;
  furiousPenalty: number;
  terrorRound: number;
  terrorThreat: number;
  /** A condition only triggers again after its count/zone becomes false. */
  threeShadowIds: string[];
}

export function validateCarnDum(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.carnDum;
  if (q === undefined) return s.scenarioId !== "the-battle-of-carn-dum";
  if (!q || s.scenarioId !== "the-battle-of-carn-dum") return false;
  const bosses = s.staging.filter((u) => u.code === CARN.thaurdir);
  const engaged = [
    ...s.engaged,
    ...(s.table?.seats.flatMap((p) => p.engaged) ?? []),
  ];
  return (
    typeof q.initialized === "boolean" &&
    [q.furiousRound, q.terrorRound].every(
      (n) => Number.isSafeInteger(n) && n >= -1 && n <= s.round,
    ) &&
    Number.isSafeInteger(q.terrorThreat) &&
    q.terrorThreat >= 0 &&
    (q.terrorThreat === 0 || q.terrorRound >= 0) &&
    Number.isSafeInteger(q.furiousPenalty) &&
    q.furiousPenalty >= 0 &&
    q.furiousPenalty % 2 === 0 &&
    (q.furiousPenalty === 0 || q.furiousRound >= 0) &&
    Array.isArray(q.threeShadowIds) &&
    q.threeShadowIds.length <= 64 &&
    q.threeShadowIds.every(
      (id) => typeof id === "string" && /^c\d+$/.test(id),
    ) &&
    new Set(q.threeShadowIds).size === q.threeShadowIds.length &&
    [1, 2].includes(s.stage) &&
    !engaged.some((u) => u.code === CARN.thaurdir) &&
    !s.encounterDeck.includes(CARN.thaurdir) &&
    [...s.staging, ...engaged].every(
      (u) => !u.shadows.includes(CARN.thaurdir),
    ) &&
    bosses.every(validUnit) &&
    bosses.length <= 1 &&
    (!q.initialized ||
      bosses.length === 1 ||
      (s.stage === 2 && s.status === "won"))
  );
}
