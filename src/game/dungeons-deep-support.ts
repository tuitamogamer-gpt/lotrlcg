import encounters from "../data/dungeons-deep-encounter-cards.json";
import quests from "../data/dungeons-deep-quest-cards.json";
import recipes from "../data/dungeons-deep-recipes.json";
import type { Card, GameState, Unit } from "./types";
import { OMM } from "./misty-mountains-support";
export type { DungeonsDeepState } from "./dungeons-deep-types";

export const DDCD_ENCOUNTERS = encounters as Card[];
export const DDCD_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const DDCD_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const DDCD = {
  pan: code("Out of the Frying Pan"),
  riddles: code("Riddles in the Dark"),
  fire: code("Into the Fire"),
  gollum: code("Gollum"),
  wolf: code("Great Gray Wolf"),
  wargs: code("Wild Wargs"),
  glade: code("The Wargs' Glade"),
  lake: code("Lake in the Cavern"),
  ring: code("Bilbo's Magic Ring"),
  bird: code("Come down little bird"),
  likes: code("It Likes Riddles?"),
  hiding: code("Hiding in the Trees"),
  pocket: code("What's In My Pocket?"),
  notFair: code("Not fair! Not fair!"),
  // Misty Mountain Goblins, shared with Over the Misty Mountains Grim.
  axeman: OMM.axeman,
  driver: OMM.driver,
  miners: OMM.miners,
  runners: OMM.runners,
  grip: OMM.grip,
  caves: OMM.caves,
};
export type RiddleItem = "type" | "sphere" | "cost";
/** The items each riddle names and how many player cards it discards. */
export const RIDDLES: Record<string, { items: RiddleItem[]; cards: number }> = {
  [DDCD.bird]: { items: ["type", "cost"], cards: 3 },
  [DDCD.wolf]: { items: ["type", "sphere", "cost"], cards: 3 },
  [DDCD.hiding]: { items: ["type", "sphere"], cards: 3 },
  [DDCD.likes]: { items: ["cost"], cards: 2 },
  [DDCD.glade]: { items: ["sphere"], cards: 1 },
  [DDCD.pocket]: { items: ["sphere", "cost"], cards: 2 },
  [DDCD.wargs]: { items: ["type"], cards: 2 },
};
export const hasRiddle = (code: string) => code in RIDDLES;
export const RIDDLE_TYPES = ["ally", "event", "attachment", "treasure"];
export const RIDDLE_SPHERES = [
  "leadership",
  "spirit",
  "lore",
  "tactics",
  "baggins",
];
export const RIDDLE_COSTS = [0, 1, 2, 3, 4, 5, 6];
/** Does a discarded player card feature every named item? */
export function riddleMatch(
  c: Card,
  named: Partial<Record<RiddleItem, string>>,
) {
  if (named.type !== undefined) {
    const type = c.treasure ? "treasure" : c.type_code;
    if (type !== named.type) return false;
  }
  if (named.sphere !== undefined && c.sphere_code !== named.sphere)
    return false;
  if (named.cost !== undefined && String(Number(c.cost)) !== named.cost)
    return false;
  return true;
}
export function ddcdStageInfo(s: GameState) {
  const q = DDCD_QUESTS[s.stage === 3 ? 2 : 0];
  if (!q || !s.dungeonsDeep) return undefined;
  const front = s.stageRevealing;
  return {
    name: q.name,
    cardCode: q.code,
    quest: front ? 0 : (q.back_quest ?? q.quest ?? 0),
    story: (front ? q.text : q.back_text) || (q.back_text ?? q.text ?? ""),
    questImage: front ? q.imagesrc : q.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
  };
}
export const ddcdUnits = (s: GameState): Unit[] => [
  ...(s.dungeonsDeep?.riddleArea ?? []),
  ...(s.dungeonsDeep?.resolving ?? []),
];
export function ddcdPublicState(s: GameState) {
  const q = s.dungeonsDeep;
  if (!q) return undefined;
  return {
    currentQuest: q.currentQuest,
    riddleProgress: q.riddleProgress,
    riddleGoal: DDCD_QUESTS[1].back_quest ?? 9,
    riddleArea: q.riddleArea.map((u) => u.code),
    bilboInRiddleArea: q.bilboInRiddleArea,
    hiding: q.hiding.includes(s.round),
  };
}
export function validateDungeonsDeep(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.dungeonsDeep;
  if (q === undefined) return s.scenarioId !== "dungeons-deep-and-caverns-dim";
  const n = (x: unknown) => Number.isSafeInteger(x) && Number(x) >= 0;
  return (
    !!q &&
    s.scenarioId === "dungeons-deep-and-caverns-dim" &&
    [1, 3].includes(s.stage) &&
    q.currentQuest === DDCD_QUESTS[s.stage === 3 ? 2 : 0].code &&
    typeof q.advancing === "boolean" &&
    n(q.riddleProgress) &&
    Array.isArray(q.riddleArea) &&
    q.riddleArea.every((u) => unit(u) && u.code === DDCD.gollum) &&
    q.riddleArea.length <= 1 &&
    typeof q.bilboInRiddleArea === "boolean" &&
    (s.stage === 1 ||
      (!q.bilboInRiddleArea && !q.riddleArea.length) ||
      s.stageRevealing) &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    Array.isArray(q.hiding) &&
    q.hiding.every((r) => n(r) && r <= s.round) &&
    typeof q.wolfReturn === "boolean" &&
    (q.lastRevealOrigin === null || typeof q.lastRevealOrigin === "string")
  );
}
