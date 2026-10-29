import encounters from "../data/ash-mountains-encounter-cards.json";
import quests from "../data/ash-mountains-quest-cards.json";
import recipes from "../data/ash-mountains-recipes.json";
import type { Card, GameState, Unit } from "./types";
export const ASH_ENCOUNTERS = encounters as Card[];
export const ASH_QUESTS = quests as Card[];
export const ASH_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const ASH = {
  first: code("Passage into Mordor"),
  last: code("An Evil Place"),
  tunnels: code("The Tunnels of Torech Gorgor"),
  haunt: code("A Haunt for Beasts"),
  darkness: code("Overwhelming Darkness"),
  beast: code("Nameless Beast"),
  troll: code("Mordor Cave Troll"),
  wolf: code("Ash Mountain Werewolf"),
  spawn: code("Spawn of Shelob"),
  patrol: code("Torech Gorgor Patrol"),
  chasm: code("Fiery Chasm"),
  deeps: code("Hideous Deeps"),
  orc: code("Orc Passage"),
  supplies: code("Ransacked Supplies"),
  reek: code("Burning Reek"),
  writhing: code("Writhing Shadows"),
  tunnel: code("Twisted Tunnel"),
  opening: code("Narrow Opening"),
  passage: code("Crumbling Passage"),
  shadows: code("Fearful Shadows"),
  lost: code("Lost in the Dark"),
};
export const ashPhase = (s: GameState) =>
  ["quest", "staging"].includes(s.phase)
    ? "quest"
    : ["attack", "defense"].includes(s.phase)
      ? "combat"
      : s.phase;
export const ashStageInfo = (s: GameState) => {
  const c = ASH_QUESTS[s.stage - 1];
  return c && s.ashMountains
    ? {
        name: c.name,
        cardCode: c.code,
        quest: s.stageRevealing ? 0 : 25,
        story: s.stageRevealing ? c.text! : c.back_text!,
        questImage: s.stageRevealing ? c.imagesrc : c.back_imagesrc,
        side: s.stageRevealing ? ("A" as const) : ("B" as const),
      }
    : undefined;
};
export const ashPublicState = (s: GameState) =>
  s.ashMountains
    ? {
        currentQuest: s.ashMountains.currentQuest,
        custody: s.ashMountains.custody.map((g) => ({
          host: g.host,
          player: g.player,
          kind: g.kind,
          count: g.cards.length,
        })),
        starved: s.ashMountains.starved,
        progressPlaced:
          s.ashMountains.progressLimit.round === s.round
            ? s.ashMountains.progressLimit.placed
            : 0,
      }
    : undefined;
export const ashExtraUnits = (s: GameState): Unit[] => [
  ...(s.ashMountains?.resolving ?? []),
  ...(s.ashMountains?.custody.flatMap((g) => g.cards) ?? []),
];
export function validateAsh(s: GameState, unit: (u: unknown) => boolean) {
  const q = s.ashMountains;
  if (q === undefined) return s.scenarioId !== "under-the-ash-mountains";
  const n = (x: unknown) => Number.isSafeInteger(x) && Number(x) >= 0;
  const p = (x: unknown) => n(x) && Number(x) < (s.table?.seats.length ?? 1);
  const counts = (x: Record<string, number>) =>
    !!x &&
    typeof x === "object" &&
    !Array.isArray(x) &&
    Object.values(x).every(n);
  return (
    !!q &&
    s.scenarioId === "under-the-ash-mountains" &&
    [1, 2].includes(s.stage) &&
    q.currentQuest === ASH_QUESTS[s.stage - 1].code &&
    typeof q.initialized === "boolean" &&
    typeof q.advancing === "boolean" &&
    Array.isArray(q.setupChosen) &&
    q.setupChosen.every((c) =>
      encounters.some((x) => x.code === c && x.type_code === "location"),
    ) &&
    new Set(q.setupChosen).size === q.setupChosen.length &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    !!q.writhing &&
    typeof q.writhing === "object" &&
    !Array.isArray(q.writhing) &&
    Object.values(q.writhing).every(
      (ids) =>
        Array.isArray(ids) &&
        ids.every((id) => typeof id === "string") &&
        new Set(ids).size === ids.length,
    ) &&
    Array.isArray(q.custody) &&
    q.custody.every(
      (g) =>
        !!g &&
        typeof g.host === "string" &&
        !!g.host &&
        p(g.player) &&
        ["deeps", "dial"].includes(g.kind) &&
        Array.isArray(g.cards) &&
        g.cards.every(unit),
    ) &&
    Array.isArray(q.starved) &&
    q.starved.every(p) &&
    new Set(q.starved).size === q.starved.length &&
    Number.isInteger(q.blankRound) &&
    q.blankRound >= -1 &&
    q.blankRound <= s.round &&
    Array.isArray(q.noReady) &&
    q.noReady.every(
      (x) =>
        !!x && typeof x.id === "string" && n(x.round) && x.round <= s.round,
    ) &&
    !!q.played &&
    n(q.played.round) &&
    q.played.round <= s.round &&
    counts(q.played.counts) &&
    !!q.progressLimit &&
    n(q.progressLimit.round) &&
    q.progressLimit.round <= s.round &&
    n(q.progressLimit.placed) &&
    !!q.damage &&
    n(q.damage.round) &&
    q.damage.round <= s.round &&
    counts(q.damage.counts) &&
    Array.isArray(q.supplies) &&
    q.supplies.every(
      (x) =>
        !!x &&
        n(x.round) &&
        x.round <= s.round &&
        typeof x.phase === "string" &&
        n(x.amount),
    )
  );
}
