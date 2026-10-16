import encounters from "../data/mumakil-encounter-cards.json";
import quests from "../data/mumakil-quest-cards.json";
import recipes from "../data/mumakil-recipes.json";
import type { Card, GameState, Unit } from "./types";
const c = (id: string) => `octgn:${id}`;
export const MUMAKIL = {
  welcome: c("adf2480a-644a-47ee-8deb-bd08ff32bf31"),
  capture: c("fc6d1863-5007-4705-9d47-99d6d118e5ca"),
  lasso: c("f16aabcd-6a98-4e4a-89ca-0f0d69407d85"),
  spear: c("c08310b6-5201-4c70-975e-61a2e7ff329b"),
  pit: c("4a5c11eb-44b8-4c6e-a9fa-83112dbd57c0"),
  noose: c("fc351b81-fc50-40a5-9f94-7ab885cb7a8c"),
  wild: c("f35e7236-2e03-4e03-aa92-7c4803e79acf"),
  tiger: c("e6d7da0a-eb6d-429b-b9f9-e32027866d1b"),
  ape: c("257ffa68-7458-4f3c-bc7e-8d46b27cd837"),
  python: c("60e40838-a6f2-4dbd-8ed2-88ba94d9ac0b"),
  centipede: c("737724a5-2603-40b0-8a0b-4e72dbb3775e"),
  trail: c("6651f8a6-e442-4eba-a8b5-13fab4c1e93c"),
  stampede: c("4a28b128-1f89-4ad0-b27b-4cb1755c2d23"),
  savage: c("ad7fc95f-4a8d-4a15-b170-b0db3c3002f0"),
  fever: c("df69b078-0073-44b6-9f18-1fed38f9711c"),
  insects: c("855580e2-87b1-444c-b37a-1062c050d9ee"),
  guardians: c("f041d625-2075-4501-ad40-f17042c3d3df"),
};
export const MUMAKIL_CAPTURES = [MUMAKIL.lasso, MUMAKIL.spear, MUMAKIL.pit, MUMAKIL.noose];
export const MUMAKIL_MAIN_QUESTS = [MUMAKIL.welcome, MUMAKIL.capture];
export const MUMAKIL_ENCOUNTERS = encounters as Card[];
export const MUMAKIL_QUESTS = quests as Card[];
export const MUMAKIL_RECIPES = recipes;
export interface MumakilState {
  initialized: boolean;
  advancing: boolean;
  currentQuest: string;
  questDeck: string[];
  completedQuests: string[];
  /** Physical Wild Mûmak and Capture objectives. Setup locations are returned before searching. */
  setAside: Unit[];
  damageThisRound: { id: string; round: number; amount: number }[];
  blanked: { id: string; round: number; preserveTraits: boolean }[];
  cannotReady: { id: string; round: number }[];
  exploredRound: number;
}
export function mumakilStageInfo(s: GameState) {
  const q = MUMAKIL_QUESTS.find((q) => q.code === s.mumakil?.currentQuest);
  return q ? { name: q.back_name ?? q.name, cardCode: q.code, quest: q.back_quest ?? 0,
    story: q.back_text ?? "", questImage: q.back_imagesrc ?? q.imagesrc } : undefined;
}
export function validateMumakil(s: GameState, validUnit: (u: unknown) => boolean) {
  const q = s.mumakil;
  if (q === undefined) return s.scenarioId !== "the-mumakil";
  if (!q || s.scenarioId !== "the-mumakil" || !Array.isArray(q.setAside) ||
    !Array.isArray(q.questDeck) || !Array.isArray(q.completedQuests) ||
    !Array.isArray(q.damageThisRound) || !Array.isArray(q.blanked) || !Array.isArray(q.cannotReady)) return false;
  const chain = [...q.completedQuests, q.currentQuest, ...q.questDeck];
  const marker = (p: { id: string; round: number }) => p && typeof p.id === "string" && Number.isInteger(p.round) && p.round >= 0 && p.round <= s.round;
  const unique = (a: { id: string }[]) => new Set(a.map((p) => p.id)).size === a.length;
  return typeof q.initialized === "boolean" && typeof q.advancing === "boolean" &&
    Number.isInteger(s.stage) && s.stage >= 1 && s.stage <= 2 &&
    q.currentQuest === MUMAKIL_MAIN_QUESTS[s.stage - 1] && chain.length === 2 && chain.every((c, i) => c === MUMAKIL_MAIN_QUESTS[i]) &&
    q.setAside.every(validUnit) && q.setAside.every((u) => [MUMAKIL.wild, ...MUMAKIL_CAPTURES].includes(u.code)) &&
    new Set(q.setAside.map((u) => u.id)).size === q.setAside.length &&
    q.damageThisRound.every((p) => marker(p) && Number.isInteger(p.amount) && p.amount >= 0 && p.amount <= 3) && unique(q.damageThisRound) &&
    q.blanked.every((p) => marker(p) && typeof p.preserveTraits === "boolean") && unique(q.blanked) &&
    q.cannotReady.every(marker) && unique(q.cannotReady) &&
    Number.isInteger(q.exploredRound) && q.exploredRound >= 0 && q.exploredRound <= s.round;
}
