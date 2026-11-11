// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/lonely-mountain-encounter-cards.json";
import quests from "../data/lonely-mountain-quest-cards.json";
import recipes from "../data/lonely-mountain-recipes.json";
import type { Card, GameState, Unit } from "./types";
import { FAS } from "./flies-spiders-support";
import { EREBOR_TREASURES } from "./hobbit-codes";
export type {
  BurgleReason,
  LonelyMountainBurgle,
  LonelyMountainState,
} from "./lonely-mountain-types";

export const TLM_ENCOUNTERS = encounters as Card[];
export const TLM_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const TLM_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const TLM = {
  welcome: code("A Warm Welcome"),
  burglar: code("The Burglar's Turn"),
  inside: code("Inside Information"),
  thieves: code("Thieves! Fire! Murder!"),
  mountain: code("The Lonely Mountain"),
  golden: code("Smaug the Golden"),
  magnificent: code("Smaug the Magnificent"),
  patch: code("A Bare Patch"),
  hall: code("Great Hall"),
  slopes: code("Western Slopes"),
  desolation: code("Desolation of Smaug"),
  entrance: code("Secret Entrance"),
  belching: code("Belching Fire"),
  crows: code("Croaking Crows"),
  ounce: code("Known to an Ounce"),
  pretending: code("Pretending to Sleep"),
  spell: code("Dragon-Spell"),
  // Wilderland, shared with Flies and Spiders.
  bats: FAS.bats,
  path: FAS.path,
  weighed: FAS.weighed,
  friends: FAS.friends,
} as const;
export const TLM_SCENARIO = "the-lonely-mountain";
export const isLonelyMountain = (s: GameState) =>
  (s.scenarioId as string) === TLM_SCENARIO;
/** Smaug the Golden advances the players to stage 4A on his 6th progress token. */
export const SMAUG_PROGRESS_LIMIT = 6;

export type BurgleItem = "type" | "sphere" | "cost";
/** Each burgle effect: what discarded cards match and how many are needed. */
export const BURGLES: Readonly<
  Record<string, { items: readonly BurgleItem[]; cards: number }>
> = {
  [TLM.hall]: { items: ["type"], cards: 3 },
  [TLM.slopes]: { items: ["sphere"], cards: 2 },
  [TLM.desolation]: { items: ["cost"], cards: 2 },
  [TLM.belching]: { items: ["type", "cost"], cards: 1 },
  [TLM.pretending]: { items: ["type"], cards: 2 },
  [TLM.crows]: { items: ["sphere", "type"], cards: 1 },
  [TLM.ounce]: { items: ["sphere", "cost"], cards: 1 },
};
export const hasBurgle = (code: string) => code in BURGLES;
/** The printed item of a player card that a burgle effect compares. */
export function burgleItem(c: Card, item: BurgleItem) {
  if (item === "type") return c.treasure ? "treasure" : c.type_code;
  if (item === "sphere") return c.sphere_code ?? "";
  return c.cost === undefined || c.cost === null ? "" : String(c.cost).trim();
}
export const burgleMatch = (
  c: Card,
  revealed: Card,
  items: readonly BurgleItem[],
) => items.every((item) => burgleItem(c, item) === burgleItem(revealed, item));
export const burgleItemLabel = (c: Card, item: BurgleItem) => {
  const value = burgleItem(c, item);
  if (item === "cost") return `cost ${value || "–"}`;
  return value ? value[0].toUpperCase() + value.slice(1) : "no sphere";
};

export const tlmStageNumber = (questCode: string | undefined) =>
  TLM_QUESTS.findIndex((q) => q.code === questCode) + 1;
export function tlmStageInfo(s: GameState) {
  const state = s.lonelyMountain;
  const q = TLM_QUESTS.find((c) => c.code === state?.currentQuest);
  if (!q || !state) return undefined;
  const front = s.stageRevealing;
  return {
    name: q.name,
    cardCode: q.code,
    quest: front ? 0 : (q.back_quest ?? 0),
    story: (front ? q.text : q.back_text) || (q.back_text ?? q.text ?? ""),
    questImage: front ? q.imagesrc : q.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
  };
}
/** Out-of-play and resolving physical encounter cards. */
export const tlmUnits = (s: GameState): Unit[] => [
  ...(s.lonelyMountain?.setAside ?? []),
  ...(s.lonelyMountain?.resolving ?? []),
];
export function tlmPublicState(s: GameState) {
  const q = s.lonelyMountain;
  if (!q) return undefined;
  const golden = s.staging.find((u) => u.code === TLM.golden);
  const magnificent = s.staging.find((u) => u.code === TLM.magnificent);
  return {
    currentQuest: q.currentQuest,
    stage: tlmStageNumber(q.currentQuest),
    stack: q.stack.length,
    treasures: [...q.treasures],
    smaugProgress: golden?.progress ?? null,
    magnificentDamage: magnificent ? magnificent.damage : null,
    barePatch: !!magnificent?.attachments.some((a) => a.code === TLM.patch),
    burgle: q.burgle
      ? {
          reason: q.burgle.reason,
          code: q.burgle.code,
          revealed: q.burgle.revealed,
        }
      : null,
    weighedDown: q.weighedDown.includes(s.round),
    noTravel: q.noTravelRound === s.round,
  };
}
export function validateLonelyMountain(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.lonelyMountain;
  if (q === undefined) return s.scenarioId !== TLM_SCENARIO;
  const n = (x: unknown) => Number.isSafeInteger(x) && Number(x) >= 0;
  const stage = tlmStageNumber(q?.currentQuest);
  const treasureList = (list: unknown) =>
    Array.isArray(list) && list.every((c) => EREBOR_TREASURES.includes(c));
  const outOfPlay: string[] = [TLM.golden, TLM.magnificent, TLM.patch];
  return (
    !!q &&
    s.scenarioId === TLM_SCENARIO &&
    stage >= 1 &&
    s.stage === stage &&
    typeof q.advancing === "boolean" &&
    treasureList(q.stack) &&
    treasureList(q.treasures) &&
    new Set([...q.stack, ...q.treasures]).size ===
      q.stack.length + q.treasures.length &&
    Array.isArray(q.setAside) &&
    q.setAside.every((u) => unit(u) && outOfPlay.includes(u.code)) &&
    new Set(q.setAside.map((u) => u.code)).size === q.setAside.length &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    (q.burgle === null ||
      (!!q.burgle &&
        typeof q.burgle === "object" &&
        ["stage", "patch"].includes(q.burgle.reason) &&
        hasBurgle(q.burgle.code) &&
        typeof q.burgle.revealed === "string")) &&
    Array.isArray(q.weighedDown) &&
    q.weighedDown.every((r) => n(r) && r <= s.round) &&
    n(q.treacheryRound) &&
    n(q.treacheryReveals) &&
    Array.isArray(q.ounce) &&
    q.ounce.every(
      (o) =>
        !!o &&
        n(o.round) &&
        o.round <= s.round &&
        typeof o.phase === "string" &&
        n(o.amount),
    ) &&
    (q.noTravelRound === null || n(q.noTravelRound)) &&
    (q.entranceNamed === null ||
      ["enemy", "location", "treachery"].includes(q.entranceNamed))
  );
}
