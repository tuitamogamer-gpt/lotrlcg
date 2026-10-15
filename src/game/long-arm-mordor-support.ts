import encounters from "../data/harad-encounter-cards.json";
import quests from "../data/harad-quest-cards.json";
import recipes from "../data/harad-recipes.json";
import type { Card, GameState, Unit } from "./types";

const c = (id: string) => `octgn:${id}`;
export const MORDOR = {
  surprise: c("5d991933-f49d-4ece-a288-7484ebc75d14"),
  find: c("947f8b80-5d96-43eb-89ac-95b7738f2d55"),
  free: c("98cc592d-6e3e-494a-bddf-ef5e0908c279"),
  escape: c("0bb77cd5-0340-4411-9e1f-997b1d6cb35a"),
  kahliel: c("a0e1e091-fbbb-459e-9cb7-2cc63bd85711"),
  firyal: c("b546c9b7-7721-4275-ba8b-ba28364aeb95"),
  yazan: c("278a52c1-d52e-4084-b985-dbf24eb35901"),
  jubayr: c("a0417d08-1905-46f9-bd65-067c1c59f0a3"),
  enforcers: c("c459cbdb-9831-4803-91b0-e791e349ace8"),
  boma: c("ec97b3a4-4904-42ac-beb0-9d4d935241fb"),
  hut: c("c179ea26-838b-449c-b0a0-f2049e20b01f"),
  savage: c("dd7ca673-fc3c-4caf-859a-ca32722e68dc"),
  overrun: c("4ae7d13b-4b73-477b-ab71-5bd6bfc7b912"),
  trail: c("e7413cb0-3443-40d4-88f4-06d7cfa1ab1d"),
  clearing: c("36e1a766-7b31-4bb4-be01-4995a9f9c2f3"),
  jungle: c("bb5d1d76-663f-4261-94ec-7a9bfc025acf"),
  overgrown: c("01a43351-0e36-4175-9a94-693ff91404ad"),
  uruks: c("8a0a834b-d10c-43b1-a43c-75b459c18374"),
  chieftain: c("27748abf-80e8-4928-b506-53d7c23d76c6"),
  uruk: c("ad251ffd-8653-4a45-b88e-def2ffecc2dc"),
  rider: c("f63cbcf5-e846-476f-abc6-a9e86e89a2fd"),
  warg: c("27d6c3df-c7dc-4ea0-941f-dcad65b3f1eb"),
  fear: c("cfcee6c8-9eee-4623-afd1-a49ea77e2322"),
};
export const MORDOR_MAIN_QUESTS = [MORDOR.surprise, MORDOR.find, MORDOR.free, MORDOR.escape];
export const MORDOR_OBJECTIVE_HEROES = [MORDOR.kahliel, MORDOR.firyal, MORDOR.yazan, MORDOR.jubayr];
export const MORDOR_QUESTS = quests.filter((q) => MORDOR_MAIN_QUESTS.includes(q.code)) as Card[];
export const MORDOR_ENCOUNTERS = encounters.filter((q) =>
  ["The Long Arm of Mordor", "Mordor Orcs", "Jungle Forest"].includes(q.encounter_set ?? ""),
) as Card[];
export const MORDOR_RECIPES = recipes.filter((r) => ["Q07.3", "E07.3"].includes(r.id));

export interface MordorState {
  initialized: boolean;
  advancing: boolean;
  currentQuest: string;
  questDeck: string[];
  completedQuests: string[];
  /** Physical uncontrolled heroes; unguarded entries are logically in staging. */
  captured: Unit[];
  /** Each physical hero is attached to a different guarding Orc at stage 3. */
  guarding: Record<string, string>;
  setAside: Unit[];
  removed: string[];
}
export function mordorStageInfo(s: GameState) {
  const q = MORDOR_QUESTS.find((q) => q.code === s.mordor?.currentQuest);
  return q ? { name: q.back_name ?? q.name, cardCode: q.code, quest: q.back_quest ?? 0,
    story: q.back_text ?? "", questImage: q.back_imagesrc ?? q.imagesrc } : undefined;
}
export function validateMordor(s: GameState, validUnit: (u: unknown) => boolean) {
  const q = s.mordor;
  if (q === undefined) return s.scenarioId !== "the-long-arm-of-mordor";
  if (!q || s.scenarioId !== "the-long-arm-of-mordor" ||
    !Array.isArray(q.captured) || !Array.isArray(q.setAside) ||
    !Array.isArray(q.removed) || !Array.isArray(q.completedQuests) ||
    !Array.isArray(q.questDeck) || !q.guarding || Array.isArray(q.guarding)) return false;
  const sequence = [...q.completedQuests, q.currentQuest, ...q.questDeck];
  return typeof q.initialized === "boolean" && typeof q.advancing === "boolean" &&
    Number.isInteger(s.stage) && s.stage >= 1 && s.stage <= 4 &&
    q.currentQuest === MORDOR_MAIN_QUESTS[s.stage - 1] && sequence.length === 4 &&
    sequence.every((code, i) => code === MORDOR_MAIN_QUESTS[i]) &&
    [...q.captured, ...q.setAside].every(validUnit) &&
    q.captured.every((u) => cardKind(u.code) === "hero" && Number.isInteger(u.owner) && u.owner! >= 0 && u.owner! < (s.table?.seats.length ?? 1)) &&
    q.setAside.every((u) => [...MORDOR_OBJECTIVE_HEROES, MORDOR.chieftain, MORDOR.enforcers].includes(u.code)) &&
    q.removed.every((code) => MORDOR_OBJECTIVE_HEROES.includes(code)) &&
    new Set([...q.captured, ...q.setAside].map((u) => u.id)).size === q.captured.length + q.setAside.length &&
    Object.entries(q.guarding).every(([hero, enemy]) => q.captured.some((u) => u.id === hero) && typeof enemy === "string" && enemy.length > 0) &&
    new Set(Object.values(q.guarding)).size === Object.values(q.guarding).length &&
    (s.stage === 3 || Object.keys(q.guarding).length === 0);
}
// Captured heroes are original player definitions, not imported encounter cards.
import { card } from "./cards";
const cardKind = (code: string) => card(code).type_code;
