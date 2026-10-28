import encounters from "../data/ulfast-encounter-cards.json";
import quests from "../data/ulfast-quest-cards.json";
import recipes from "../data/ulfast-recipes.json";
import type { Card, GameState } from "./types";

export const ULFAST_ENCOUNTERS = encounters as Card[];
export const ULFAST_QUESTS = quests as Card[];
export const ULFAST_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const ULFAST = {
  guard: code("City Guard"),
  sentry: code("Ulfast Sentry"),
  elite: code("The King's Elite"),
  agent: code("Ulchor's Agent"),
  lawn: code("The King's Lawn"),
  archway: code("Guarded Archway"),
  market: code("Crowded Market"),
  streets: code("Streets of Ulfast"),
  vigil: code("Extra Vigil"),
  seen: code("We've Been Seen"),
  patrol: code("Patrolling the Streets"),
  cat: code("Cat and Mouse"),
  servant: code("Servant of Sauron"),
  messenger: code("Messenger from Mordor"),
  overwhelmed: code("Overwhelmed"),
  fear: code("Shadow of Fear"),
  street: code("Side Street"),
  catacombs: code("Catacombs"),
  underGuard: code("Under Guard"),
  unwelcome: code("Unwelcome Travelers"),
};
export const ulfastPhase = (s: GameState) =>
  ["quest", "staging"].includes(s.phase)
    ? "quest"
    : ["defense", "attack"].includes(s.phase)
      ? "combat"
      : s.phase;
export function ulfastStageInfo(s: GameState) {
  const q = ULFAST_QUESTS[s.stage - 1];
  if (!s.ulfast || !q) return undefined;
  return {
    name: q.name,
    cardCode: q.code,
    quest: s.stageRevealing ? 0 : q.back_quest!,
    story: (s.stageRevealing ? q.text : q.back_text) ?? "",
    questImage: s.stageRevealing ? q.imagesrc : q.back_imagesrc,
    side: s.stageRevealing ? ("A" as const) : ("B" as const),
  };
}
export const ulfastPublicState = (s: GameState) =>
  s.ulfast
    ? {
        currentQuest: s.ulfast.currentQuest,
        resources: s.ulfast.resources,
        damageLimit: s.stage * 5,
        resolving: s.ulfast.resolving.length,
      }
    : undefined;
export function validateUlfast(
  s: GameState,
  validUnit: (v: unknown) => boolean,
) {
  const q = s.ulfast;
  if (q === undefined) return s.scenarioId !== "the-city-of-ulfast";
  const n = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
  const round = (v: unknown) => n(v) && Number(v) <= s.round;
  const stamp = (v: { round: number; phase: string }) =>
    !!v &&
    round(v.round) &&
    [
      "setup",
      "resource",
      "planning",
      "quest",
      "travel",
      "encounter",
      "combat",
      "refresh",
    ].includes(v.phase);
  return (
    !!q &&
    s.scenarioId === "the-city-of-ulfast" &&
    [1, 2, 3, 4].includes(s.stage) &&
    q.currentQuest === ULFAST_QUESTS[s.stage - 1].code &&
    typeof q.initialized === "boolean" &&
    n(q.resources) &&
    Array.isArray(q.setupChosen) &&
    q.setupChosen.every((c) =>
      ULFAST_ENCOUNTERS.some((x) => x.code === c && x.type_code === "location"),
    ) &&
    new Set(q.setupChosen).size === q.setupChosen.length &&
    Array.isArray(q.resolving) &&
    q.resolving.every(validUnit) &&
    !!q.servantAttacks &&
    typeof q.servantAttacks === "object" &&
    !Array.isArray(q.servantAttacks) &&
    Object.values(q.servantAttacks).every(stamp) &&
    Array.isArray(q.overwhelmed) &&
    q.overwhelmed.every(
      (x) =>
        !!x &&
        n(x.player) &&
        x.player < (s.table?.seats.length ?? 1) &&
        round(x.round),
    ) &&
    Array.isArray(q.prevented) &&
    q.prevented.every(
      (x) => !!x && typeof x.id === "string" && round(x.round),
    ) &&
    (q.blockedProgress === undefined || stamp(q.blockedProgress))
  );
}
