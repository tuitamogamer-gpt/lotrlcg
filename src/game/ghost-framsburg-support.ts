import encounters from "../data/ghost-framsburg-encounter-cards.json";
import quests from "../data/ghost-framsburg-quest-cards.json";
import recipes from "../data/ghost-framsburg-recipes.json";
import { WILDS_RHOVANION_ENCOUNTERS } from "./wilds-rhovanion-support";
import type { Card, GameState } from "./types";
export const GHOST_FRAMSBURG_ENCOUNTERS = encounters as Card[];
export const GHOST_FRAMSBURG_QUESTS = quests as Card[];
export const GHOST_FRAMSBURG_RECIPES = recipes;
const definitions = [...encounters, ...quests, ...WILDS_RHOVANION_ENCOUNTERS];
const code = (name: string) => definitions.find((c) => c.name === name)!.code;
export const GHOST_FRAMSBURG = {
  keep: code("The Haunted Keep"),
  ruinsQuest: code("Searching the Ruins"),
  shadeQuest: code("The Cursed Shade"),
  key: code("Crypt Key"),
  lantern: code("Old Lantern"),
  teeth: code("Scatha's Teeth"),
  shade: code("Fram's Shade"),
  stalker: code("Crypt Stalker"),
  spectre: code("Evil Spectre"),
  tomb: code("The Cursed Tomb"),
  crypt: code("Forgotten Crypt"),
  hall: code("Haunted Hall"),
  staircase: code("Hidden Staircase"),
  moonlit: code("Moonlit Passage"),
  tower: code("Cursed Tower"),
  ruins: code("Abandoned Ruins"),
  terrible: code("Terrible Shadows"),
  slammed: code("Slammed Shut"),
  spider: code("Giant Spider"),
  bats: code("Black Bats"),
  werewolf: code("Werewolf"),
  afraid: code("Afraid of the Dark"),
  eyes: code("Eyes in the Dark"),
};
export const GHOST_FRAMSBURG_QUEST_CHAIN = [
  GHOST_FRAMSBURG.keep,
  GHOST_FRAMSBURG.ruinsQuest,
  GHOST_FRAMSBURG.shadeQuest,
];
export const GHOST_FRAMSBURG_LOOT = [
  GHOST_FRAMSBURG.key,
  GHOST_FRAMSBURG.lantern,
  GHOST_FRAMSBURG.teeth,
];
export function ghostFramsburgStageInfo(s: GameState) {
  const c = GHOST_FRAMSBURG_QUESTS.find(
    (c) => c.code === s.ghostFramsburg?.currentQuest,
  );
  return c
    ? {
        name: c.back_name ?? c.name,
        cardCode: c.code,
        quest: c.back_quest ?? 0,
        story: c.back_text ?? "",
        questImage: c.back_imagesrc ?? c.imagesrc,
      }
    : undefined;
}
export function ghostFramsburgPublicState(s: GameState) {
  const q = s.ghostFramsburg;
  return q
    ? {
        initialized: q.initialized,
        currentQuest: q.currentQuest,
        questDeck: q.questDeck.length,
        setAside: q.setAside.length,
        discoverCards: q.discoverCards.length,
        loot: q.loot.map((v) => ({
          id: v.unit.id,
          code: v.unit.code,
          guardId: v.guardId,
        })),
        completedQuests: [...q.completedQuests],
      }
    : undefined;
}
export function validateGhostFramsburg(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.ghostFramsburg;
  if (q === undefined) return s.scenarioId !== "the-ghost-of-framsburg";
  if (
    !q ||
    s.scenarioId !== "the-ghost-of-framsburg" ||
    typeof q.initialized !== "boolean" ||
    typeof q.advancing !== "boolean"
  )
    return false;
  if (
    ![
      q.questDeck,
      q.completedQuests,
      q.setAside,
      q.discoverCards,
      q.loot,
      q.removed,
      q.setupLocations,
      q.discoverModifiers,
      q.noReady,
      q.noDamage,
      q.shadows,
      q.threatReduced,
      q.destroyedEnemies,
    ].every(Array.isArray)
  )
    return false;
  const chain = [...q.completedQuests, q.currentQuest, ...q.questDeck];
  if (
    chain.length !== 3 ||
    chain.some((c, i) => c !== GHOST_FRAMSBURG_QUEST_CHAIN[i]) ||
    s.stage < 1 ||
    s.stage > 3 ||
    q.completedQuests.length !== s.stage - 1
  )
    return false;
  if (q.currentQuest !== GHOST_FRAMSBURG_QUEST_CHAIN[s.stage - 1]) return false;
  const validRound = (n: number) =>
    Number.isSafeInteger(n) && n >= 0 && n <= s.round;
  const all = [
    ...q.setAside,
    ...q.discoverCards,
    ...q.removed,
    ...q.loot.map((v) => v.unit),
  ];
  const allowed = new Set(GHOST_FRAMSBURG_RECIPES.flatMap((r) => r.card_codes));
  if (
    !all.every((u) => validUnit(u) && allowed.has(u.code)) ||
    new Set(all.map((u) => u.id)).size !== all.length
  )
    return false;
  const seats = s.table?.seats.length ?? 1;
  const guardIds = new Set(
    [
      ...s.staging,
      ...s.engaged,
      ...(s.activeLocation ? [s.activeLocation] : []),
      ...(s.table?.seats.flatMap((p) => p.engaged) ?? []),
    ].map((u) => u.id),
  );
  const inPlayLoot = [
    ...s.heroes,
    ...s.allies,
    ...(s.table?.seats.flatMap((p) => [...p.heroes, ...p.allies]) ?? []),
  ]
    .filter((u, i, a) => a.findIndex((v) => v.id === u.id) === i)
    .flatMap((u) =>
      u.attachments
        .filter((a) => GHOST_FRAMSBURG_LOOT.includes(a.code))
        .map((a) => a.code),
    );
  const lootCodes = [...inPlayLoot, ...q.loot.map((v) => v.unit.code)];
  if (new Set(lootCodes).size !== lootCodes.length) return false;
  return (
    q.loot.every(
      (v) =>
        GHOST_FRAMSBURG_LOOT.includes(v.unit.code) &&
        typeof v.guardId === "string" &&
        (!v.guardId || guardIds.has(v.guardId)),
    ) &&
    q.setupLocations.every((c) => allowed.has(c)) &&
    new Set(q.setupLocations).size === q.setupLocations.length &&
    q.discoverModifiers.every(
      (m) =>
        typeof m.id === "string" &&
        Number.isInteger(m.amount) &&
        Math.abs(m.amount) <= 1,
    ) &&
    q.noReady.every((m) => typeof m.id === "string" && validRound(m.round)) &&
    q.noDamage.every(
      (m) =>
        typeof m.id === "string" &&
        validRound(m.round) &&
        typeof m.phase === "string",
    ) &&
    q.shadows.every(
      (m) =>
        typeof m.id === "string" &&
        validRound(m.round) &&
        Number.isSafeInteger(m.amount) &&
        m.amount > 0,
    ) &&
    q.threatReduced.every(
      (m) =>
        Number.isInteger(m.player) &&
        m.player >= 0 &&
        m.player < seats &&
        validRound(m.round) &&
        Number.isSafeInteger(m.amount) &&
        m.amount >= 0,
    ) &&
    (q.claiming === undefined ||
      q.loot.some((v) => v.unit.id === q.claiming && !v.guardId)) &&
    (q.revealing === undefined ||
      q.discoverCards.some((v) => v.id === q.revealing)) &&
    (q.slammedRound === undefined || validRound(q.slammedRound)) &&
    q.destroyedEnemies.every((v) => typeof v === "string")
  );
}
