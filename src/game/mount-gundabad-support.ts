import encounters from "../data/mount-gundabad-encounter-cards.json";
import quests from "../data/mount-gundabad-quest-cards.json";
import recipes from "../data/mount-gundabad-recipes.json";
import { WILDS_RHOVANION as W } from "./wilds-rhovanion-support";
import type { Card, GameState, Unit } from "./types";

export const MOUNT_GUNDABAD_ENCOUNTERS = encounters as Card[];
export const MOUNT_GUNDABAD_QUESTS = quests as Card[];
export const MOUNT_GUNDABAD_RECIPES = recipes;
const definitions = [...encounters, ...quests];
const code = (name: string) =>
  definitions.find(
    (c) => c.name === name || ("back_name" in c && c.back_name === name),
  )!.code;
export const GUNDABAD = {
  door: code("The Side Door"),
  upper: code("The Upper Levels"),
  lower: code("The Lower Deeps"),
  warriors: code("Frenzied Warrens"),
  wrath: code("Dagnir's Wrath"),
  darkness: code("Foreboding Darkness"),
  pursuit: code("Imminent Pursuit"),
  worm: code("The Great Worm"),
  guardian: code("Guardian of Gundabad"),
  slave: code("Dagnir's Slave"),
  dweller: code("Deep-dweller"),
  dagnir: code("Dagnir"),
  ruins: code("Desecrated Ruins"),
  mines: code("Mines of Gundabad"),
  stairs: code("Narrow Stair"),
  forge: code("The First Forge"),
  hoard: code("Dagnir's Hoard"),
  throat: code("Throat of the Mountain"),
  bane: code("Wilderland's Bane"),
  shadows: code("Suffocating Shadows"),
  sword: code("Wormsbane"),
  troll: W.troll,
  hobgoblin: W.hobgoblin,
  fork: W.fork,
  tunnel: W.tunnel,
  darkPlaces: W.darkPlaces,
  afraid: W.afraid,
  eyes: W.eyes,
  scales: W.scales,
  breath: W.breath,
  armory: W.armory,
  treasury: W.treasury,
  lake: W.lake,
  cavern: W.cavern,
  den: W.den,
  grotto: W.grotto,
};
export const MOUNT_GUNDABAD_STAGE_TWOS = [
  GUNDABAD.upper,
  GUNDABAD.lower,
  GUNDABAD.warriors,
  GUNDABAD.wrath,
  GUNDABAD.darkness,
  GUNDABAD.pursuit,
  GUNDABAD.worm,
];
export const MOUNT_GUNDABAD_ALL_QUESTS = [
  GUNDABAD.door,
  ...MOUNT_GUNDABAD_STAGE_TWOS,
];
export const MOUNT_GUNDABAD_CAVES = [
  GUNDABAD.armory,
  GUNDABAD.treasury,
  GUNDABAD.lake,
  GUNDABAD.cavern,
  GUNDABAD.den,
  GUNDABAD.grotto,
  GUNDABAD.throat,
  GUNDABAD.hoard,
  GUNDABAD.forge,
];
export const mountGundabadUnits = (s: GameState): Unit[] =>
  s.mountGundabad
    ? [
        ...s.mountGundabad.cavesDeck,
        ...s.mountGundabad.setAside,
        ...s.mountGundabad.resolving,
        ...s.mountGundabad.removed,
        ...s.mountGundabad.guardedPlayerCards.map((g) => g.card),
      ]
    : [];
const QUEST_VICTORY_TYPES = [
  "quest",
  "player-side-quest",
  "encounter-side-quest",
];
// cards.ts owns the registry and also imports this module's encounter list.
// A direct card() import here would read that list before it is initialized.
let victoryType = (code: string): string => {
  throw new Error(
    `Gundabad quest count ran before the card registry could resolve ${code}`,
  );
};
export function registerGundabadCardTypes(lookup: (code: string) => string) {
  victoryType = lookup;
}
export const gundabadQuestCount = (s: GameState) =>
  (s.victoryCards ?? []).filter((code) =>
    QUEST_VICTORY_TYPES.includes(victoryType(code)),
  ).length;
export const gundabadX = (s: GameState) => 1 + gundabadQuestCount(s);
export const gundabadDragon = (s: GameState) =>
  [
    ...s.staging,
    ...s.engaged,
    ...(s.table?.seats.flatMap((p) => p.engaged) ?? []),
  ].find((u) => u.code === GUNDABAD.dagnir);
export function mountGundabadStageInfo(s: GameState) {
  const q = s.mountGundabad,
    c = MOUNT_GUNDABAD_QUESTS.find((c) => c.code === q?.currentQuest);
  if (!q || !c) return undefined;
  return {
    side: q.questFront ? ("A" as const) : ("B" as const),
    name: q.questFront ? c.name : (c.back_name ?? c.name),
    // All seven 2A faces are identical. A fixed public reference prevents the
    // file UUID from identifying the still-hidden paired 2B quest.
    cardCode: q.questFront ? GUNDABAD.upper : c.code,
    quest: q.questFront ? 0 : (c.back_quest ?? 0),
    story: q.questFront ? (c.text ?? "") : (c.back_text ?? ""),
    questImage: q.questFront
      ? MOUNT_GUNDABAD_QUESTS.find((c) => c.code === GUNDABAD.upper)!.imagesrc
      : (c.back_imagesrc ?? c.imagesrc),
  };
}
/** Counts only: hidden Caves/quest identities never enter the public state panel. */
export function mountGundabadPublicState(s: GameState) {
  const q = s.mountGundabad;
  return q
    ? {
        initialized: q.initialized,
        currentQuest: q.questFront ? GUNDABAD.upper : q.currentQuest,
        questFront: q.questFront,
        questDeck: q.questDeck.length,
        cavesDeck: q.cavesDeck.length,
        completedQuests: [...q.completedQuests],
        reforged: q.reforged,
        damageTaken: q.damageRound === s.round ? q.damageTaken : 0,
        damageLimit: gundabadX(s),
      }
    : undefined;
}
export function validateMountGundabad(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.mountGundabad;
  if (q === undefined) return s.scenarioId !== "mount-gundabad";
  if (
    !q ||
    s.scenarioId !== "mount-gundabad" ||
    typeof q.initialized !== "boolean" ||
    typeof q.advancing !== "boolean" ||
    typeof q.questFront !== "boolean" ||
    typeof q.reforged !== "boolean"
  )
    return false;
  if (
    ![
      q.questDeck,
      q.completedQuests,
      q.cavesDeck,
      q.setAside,
      q.resolving,
      q.removed,
      q.guardedPlayerCards,
      q.phasePlays,
      q.noPlayerReady,
      q.darkPlaces,
      q.usedResponses,
    ].every(Array.isArray)
  )
    return false;
  const chain = [
    ...q.completedQuests,
    ...(q.advancing && q.completedQuests.includes(q.currentQuest)
      ? []
      : [q.currentQuest]),
    ...q.questDeck,
  ];
  if (
    chain.length !== 8 ||
    new Set(chain).size !== 8 ||
    chain.some((c) => !MOUNT_GUNDABAD_ALL_QUESTS.includes(c)) ||
    s.stage !== (q.currentQuest === GUNDABAD.door ? 1 : 2) ||
    q.completedQuests.some((c) => !s.victoryCards?.includes(c))
  )
    return false;
  if (q.currentQuest === GUNDABAD.door && q.questFront) return false;
  const seats = s.table?.seats.length ?? 1,
    owner = (p: number) => Number.isInteger(p) && p >= 0 && p < seats;
  const round = (n: number) =>
    Number.isSafeInteger(n) && n >= 0 && n <= s.round;
  const allowed = new Set(MOUNT_GUNDABAD_RECIPES.flatMap((r) => r.card_codes));
  const physical = [
    ...q.cavesDeck,
    ...q.setAside,
    ...q.resolving,
    ...q.removed,
    ...q.guardedPlayerCards.map((g) => g.card),
  ];
  if (
    !physical.every(validUnit) ||
    new Set(physical.map((u) => u.id)).size !== physical.length
  )
    return false;
  if (
    ![...q.cavesDeck, ...q.setAside, ...q.resolving, ...q.removed].every((u) =>
      allowed.has(u.code),
    )
  )
    return false;
  const local = s.table?.active ?? 0,
    board = [
      ...s.heroes,
      ...s.allies,
      ...s.hand,
      ...s.engaged,
      ...s.staging,
      ...(s.activeLocation ? [s.activeLocation] : []),
      ...(s.extraActiveLocations ?? []),
      ...(s.table?.seats.flatMap((p, i) =>
        i === local ? [] : [...p.heroes, ...p.allies, ...p.hand, ...p.engaged],
      ) ?? []),
    ];
  const ids = [...board, ...physical].flatMap((u) => [
    u.id,
    ...u.attachments.map((a) => a.id),
  ]);
  if (new Set(ids).size !== ids.length) return false;
  const guards = new Set(
    board.filter((u) => u.code === GUNDABAD.hobgoblin).map((u) => u.id),
  );
  return (
    q.cavesDeck.every((u) => MOUNT_GUNDABAD_CAVES.includes(u.code)) &&
    q.setAside.every(
      (u) => u.code === GUNDABAD.forge || u.code === GUNDABAD.sword,
    ) &&
    q.guardedPlayerCards.every(
      (g) => owner(g.player) && guards.has(g.guardId),
    ) &&
    round(q.damageRound) &&
    Number.isSafeInteger(q.damageTaken) &&
    q.damageTaken >= 0 &&
    Number.isSafeInteger(q.firstTreacheryRound) &&
    q.firstTreacheryRound >= -1 &&
    q.firstTreacheryRound <= s.round &&
    (q.protectedTreachery === undefined || allowed.has(q.protectedTreachery)) &&
    q.phasePlays.every(
      (m) =>
        owner(m.player) &&
        round(m.round) &&
        typeof m.phase === "string" &&
        Number.isSafeInteger(m.count) &&
        m.count > 0,
    ) &&
    q.noPlayerReady.every((m) => typeof m.id === "string" && round(m.round)) &&
    q.darkPlaces.every(
      (m) =>
        round(m.round) &&
        typeof m.phase === "string" &&
        Number.isFinite(m.amount) &&
        m.amount >= 0,
    ) &&
    q.usedResponses.every((v) => typeof v === "string")
  );
}
