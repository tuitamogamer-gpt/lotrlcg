import encounters from "../data/harad-encounter-cards.json";
import quests from "../data/harad-quest-cards.json";
import recipes from "../data/harad-recipes.json";
import type { Card, GameState, Unit } from "./types";

export const UMBAR_ENCOUNTERS = (encounters as Card[]).filter((c) =>
  ["Escape from Umbar", "Harad Soldiers", "Harad Territory"].includes(
    c.encounter_set ?? "",
  ),
);
export const UMBAR_QUESTS = (quests as Card[]).filter(
  (c) => c.encounter_set === "Escape from Umbar",
);
export const UMBAR_RECIPES = recipes.filter(
  (r) => r.id === "Q07.1" || r.id === "E07.1",
);
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const UMBAR = {
  stranded: code("Stranded in Umbar"),
  flee: code("Flee the City"),
  seize: code("“Seize them!”"),
  alley: code("Narrow Alleyway"),
  street: code("Umbar Street"),
  square: code("Umbar Square"),
  port: code("Port of Harad"),
  estate: code("Haradrim Estate"),
  sentry: code("Umbar Sentry"),
  pursuit: code("Enemy Pursuit"),
  champion: code("Southron Champion"),
  captain: code("Southron Captain"),
  soldier: code("Southron Soldier"),
  archer: code("Southron Archer"),
  nowhere: code("Nowhere to Hide"),
  hostile: "octgn:24772594-75f3-4789-aeec-41526d845e11",
  injured: code("Injured Companion"),
  enfeebled: code("Enfeebled"),
};
export const UMBAR_MAIN_QUESTS = [UMBAR.stranded, UMBAR.flee];
export interface EscapeUmbarState {
  initialized: boolean;
  advancing: boolean;
  currentQuest: string;
  questDeck: string[];
  completedQuests: string[];
  /** A main stage entered during this round has not been in play the whole round. */
  stageEnteredRound: number;
  /** Faceup cards under Alleyway are out of play, with their physical identities retained. */
  underAlley: { locationId: string; enemies: Unit[] }[];
  champions: { questId: string; enemyId: string }[];
}
export function umbarStageInfo(s: GameState) {
  const q = UMBAR_QUESTS.find((c) => c.code === s.umbar?.currentQuest);
  return q
    ? {
        name: q.back_name ?? q.name,
        cardCode: q.code,
        quest: q.back_quest ?? 15,
        story: q.back_text ?? "",
        questImage: q.back_imagesrc ?? q.imagesrc,
      }
    : undefined;
}
export function validateUmbar(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.umbar;
  if (q === undefined) return s.scenarioId !== "escape-from-umbar";
  if (
    !q ||
    s.scenarioId !== "escape-from-umbar" ||
    !Array.isArray(q.questDeck) ||
    !Array.isArray(q.completedQuests) ||
    !Array.isArray(q.underAlley) ||
    !Array.isArray(q.champions)
  )
    return false;
  const all = [...q.completedQuests, q.currentQuest, ...q.questDeck];
  const hidden: Unit[] = [];
  for (const entry of q.underAlley) {
    if (
      !entry ||
      typeof entry.locationId !== "string" ||
      !Array.isArray(entry.enemies) ||
      !entry.enemies.every((u) => validUnit(u) && cardType(u) === "enemy")
    )
      return false;
    hidden.push(...entry.enemies);
  }
  const publicIds = [
    ...s.staging,
    ...s.engaged,
    ...s.heroes,
    ...s.allies,
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []),
    ...(s.table?.seats ?? [])
      .filter((_, i) => i !== s.table!.active)
      .flatMap((p) => [...p.heroes, ...p.allies, ...p.engaged]),
  ].map((u) => u.id);
  const ids = [...publicIds, ...hidden.map((u) => u.id)];
  return (
    typeof q.initialized === "boolean" &&
    typeof q.advancing === "boolean" &&
    Number.isInteger(q.stageEnteredRound) &&
    q.stageEnteredRound >= 0 &&
    q.stageEnteredRound <= s.round &&
    [1, 2].includes(s.stage) &&
    q.currentQuest === UMBAR_MAIN_QUESTS[s.stage - 1] &&
    all.length === 2 &&
    all.every((c, i) => c === UMBAR_MAIN_QUESTS[i]) &&
    new Set(ids).size === ids.length &&
    new Set(q.underAlley.map((e) => e.locationId)).size ===
      q.underAlley.length &&
    q.champions.every(
      (e) =>
        e && typeof e.questId === "string" && typeof e.enemyId === "string",
    ) &&
    new Set(q.champions.map((e) => e.questId)).size === q.champions.length
  );
}
const cardType = (u: Unit) =>
  UMBAR_ENCOUNTERS.find((c) => c.code === u.code)?.type_code;
