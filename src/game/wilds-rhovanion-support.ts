import encounters from "../data/wilds-rhovanion-encounter-cards.json";
import quests from "../data/wilds-rhovanion-quest-cards.json";
import recipes from "../data/wilds-rhovanion-recipes.json";
import type { Card, GameState, Unit } from "./types";
export const WILDS_RHOVANION_ENCOUNTERS = encounters as Card[];
export const WILDS_RHOVANION_QUESTS = quests as Card[];
export const WILDS_RHOVANION_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find(
    (c) =>
      c.name ===
        (
          {
            "Fire Drake": "Fire-drake",
            "Stone Troll": "Stone-troll",
            "Swarms of Bats": "Swarm of Bats",
          } as Record<string, string>
        )[name] || c.name === name,
  )!.code;
export const WILDS_RHOVANION = {
  north: code("Traveling North"),
  villageQuest: code("Woodmen Under Attack"),
  fordQuest: code("The Passage of the Ford"),
  village: code("Woodmen Village"),
  haldan: "wilds-haldan",
  ford: code("The Old Ford"),
  riverbank: code("Wooded Riverbank"),
  frenzied: code("Frenzied Creature"),
  crossing: code("Dangerous Crossing"),
  troop: code("Goblin Troop"),
  stray: code("Stray Goblin"),
  wargs: code("Pack of Wargs"),
  hills: code("Hills of Wilderland"),
  lonely: code("Lonely Lands"),
  supplies: code("Ruined Supplies"),
  lostWild: code("Lost in the Wild"),
  weighed: code("Weighed Down"),
  ambushed: code("Ambushed at Night"),
  spiders: code("Spiders of Mirkwood"),
  orcs: code("Dol Guldur Orcs"),
  carried: code("Carried Away"),
  trulyLost: code("Truly Lost"),
  fear: code("The Forest of Great Fear"),
  escape: code("Escape from Taur-nu-Fuin"),
  searching: code("Searching for a Way Out"),
  path: code("Overgrown Path"),
  abandoned: code("Abandoned Village"),
  hilltop: code("Bare Hilltop"),
  clearing: code("Forest Clearing"),
  twilight: code("Twilight Hall"),
  patrol: code("Mirkwood Patrol"),
  spider: code("Ravenous Spider"),
  unseen: code("Unseen Danger"),
  vastness: code("Vastness of Mirkwood"),
  accursed: code("Accursed Forest"),
  darkWoods: code("Dark Black Woods"),
  gloom: code("Gathering Gloom"),
  swarm: code("Swarms of Bats"),
  iron: code("The Iron Hills"),
  lower: code("The Lower Depths"),
  fireWorm: code("The Fire Worm"),
  drake: code("Fire Drake"),
  hoard: code("Dragon Hoard"),
  mine: code("Iron Hills Mine"),
  contested: code("Contested Depths"),
  chasm: code("Deep Chasm"),
  denizen: code("Denizen of the Deep"),
  hobgoblin: code("Hobgoblin"),
  troll: code("Stone Troll"),
  giantSpider: code("Giant Spider"),
  blackBats: code("Black Bats"),
  werewolf: code("Werewolf"),
  tunnel: code("Dark Tunnel"),
  fork: code("Forked Passage"),
  darkPlaces: code("Dark Places"),
  eyes: code("Eyes in the Dark"),
  afraid: code("Afraid of the Dark"),
  breath: code("Dragon Breath"),
  scales: code("Dragon Scales"),
  grotto: code("Lightless Grotto"),
  cavern: code("Crumbling Cavern"),
  lake: code("Underground Lake"),
  armory: code("Lost Armory"),
  den: code("Frightful Den"),
  treasury: code("Ancient Treasury"),
};
export const WILDS_RHOVANION_IDS = [
  "journey-up-the-anduin",
  "lost-in-mirkwood",
  "the-kings-quest",
];
export const WILDS_ANDUIN_QUESTS = [
  WILDS_RHOVANION.north,
  WILDS_RHOVANION.villageQuest,
  WILDS_RHOVANION.fordQuest,
];
export const WILDS_KINGS_QUESTS = [
  WILDS_RHOVANION.iron,
  WILDS_RHOVANION.lower,
  WILDS_RHOVANION.fireWorm,
];
export const WILDS_OBJECTIVE_LOCATIONS = [
  WILDS_RHOVANION.path,
  WILDS_RHOVANION.abandoned,
  WILDS_RHOVANION.hilltop,
  WILDS_RHOVANION.clearing,
];
export const WILDS_EVIL_CREATURES = [
  "01081",
  "01082",
  "01083",
  "01084",
  "01085",
];
export interface WildsRhovanionState {
  initialized: boolean;
  advancing: boolean;
  currentQuest: string;
  questDeck: string[];
  completedQuests: string[];
  setAside: Unit[];
  evilDeck: string[];
  evilDiscard: string[];
  cavesDeck: Unit[];
  /** Actual hidden player cards retain owner and physical IDs. */
  storedCards: { locationId: string; player: number; cards: Unit[] }[];
  guardedHeroes: { hero: Unit; player: number; guardId: string }[];
  guardedPlayerCards: { guardId: string; player: number; card: Unit }[];
  pendingGuarded: string[];
  resolving: string[];
  removed: Unit[];
  noReady: { id: string; round: number }[];
  locationProgress: { id: string; round: number; amount: number }[];
  questResources: number;
  firstTraitRevealedRound: number;
  firstTraitRevealedPhase?: string;
  nemesisId?: string;
  haldanId?: string;
  haldanGuardId?: string;
  /** Temporary encounter modifiers are scoped to an actual phase. */
  vastness: { round: number; phase: string; amount: number }[];
  darkPlaces: { round: number; phase: string; amount: number }[];
  noDamage: { id: string; round: number; phase: string }[];
  usedResponses: string[];
}
export function wildsRhovanionStageInfo(s: GameState) {
  const c = WILDS_RHOVANION_QUESTS.find(
    (c) => c.code === s.wildsRhovanion?.currentQuest,
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
export function validateWildsRhovanion(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.wildsRhovanion;
  if (q === undefined) return !WILDS_RHOVANION_IDS.includes(s.scenarioId);
  if (
    !q ||
    !WILDS_RHOVANION_IDS.includes(s.scenarioId) ||
    typeof q.initialized !== "boolean" ||
    typeof q.advancing !== "boolean"
  )
    return false;
  if (
    ![
      q.questDeck,
      q.completedQuests,
      q.setAside,
      q.evilDeck,
      q.evilDiscard,
      q.cavesDeck,
      q.storedCards,
      q.guardedHeroes,
      q.guardedPlayerCards,
      q.pendingGuarded,
      q.resolving,
      q.removed,
      q.noReady,
      q.locationProgress,
      q.vastness,
      q.darkPlaces,
      q.noDamage,
      q.usedResponses,
    ].every(Array.isArray)
  )
    return false;
  const qs = WILDS_RHOVANION_QUESTS.filter(
    (c) =>
      c.encounter_set ===
      (s.scenarioId === "journey-up-the-anduin"
        ? "Journey Up the Anduin"
        : s.scenarioId === "lost-in-mirkwood"
          ? "Lost in Mirkwood"
          : "The King's Quest"),
  ).map((c) => c.code);
  const chain = [...q.completedQuests, q.currentQuest, ...q.questDeck];
  if (
    !qs.includes(q.currentQuest) ||
    chain.some((c) => !qs.includes(c)) ||
    new Set(chain).size !== chain.length ||
    !Number.isInteger(s.stage) ||
    s.stage < 1 ||
    s.stage > (s.scenarioId === "lost-in-mirkwood" ? 4 : 3)
  )
    return false;
  const printedStage = Number(
    WILDS_RHOVANION_QUESTS.find((c) => c.code === q.currentQuest)?.cost,
  );
  if (printedStage !== s.stage) return false;
  if (
    s.scenarioId !== "lost-in-mirkwood" &&
    (chain.length !== 3 ||
      chain.some(
        (c, i) =>
          c !==
          (s.scenarioId === "journey-up-the-anduin"
            ? WILDS_ANDUIN_QUESTS
            : WILDS_KINGS_QUESTS)[i],
      ))
  )
    return false;
  const remote = (s.table?.seats ?? []).filter((_, i) => i !== s.table!.active);
  const recipe = WILDS_RHOVANION_RECIPES.find(
    (r) =>
      r.id ===
      (s.easyMode ? "E" : "Q") +
        (s.scenarioId === "journey-up-the-anduin"
          ? "08.1"
          : s.scenarioId === "lost-in-mirkwood"
            ? "08.2"
            : "08.3"),
  );
  const allowed = new Set(recipe?.card_codes ?? []);
  allowed.add(WILDS_RHOVANION.haldan);
  if (
    !q.setAside.every((u) => allowed.has(u.code)) ||
    !q.removed.every((u) => allowed.has(u.code))
  )
    return false;
  if (
    s.scenarioId === "lost-in-mirkwood" &&
    (chain.length !== 7 ||
      q.completedQuests.length !== s.stage - 1 ||
      q.completedQuests.some(
        (c, i) =>
          Number(WILDS_RHOVANION_QUESTS.find((v) => v.code === c)?.cost) !==
          i + 1,
      ))
  )
    return false;
  const physical = [
    ...s.heroes,
    ...s.allies,
    ...s.engaged,
    ...s.hand,
    ...remote.flatMap((p) => [
      ...p.heroes,
      ...p.allies,
      ...p.engaged,
      ...p.hand,
    ]),
    ...s.staging,
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []),
    ...q.setAside,
    ...q.cavesDeck,
    ...q.removed,
    ...q.storedCards.flatMap((p) => p.cards),
    ...q.guardedHeroes.map((p) => p.hero),
    ...q.guardedPlayerCards.map((p) => p.card),
  ];
  if (
    !physical.every(validUnit) ||
    new Set(physical.map((u) => u.id)).size !== physical.length
  )
    return false;
  const ids = new Set(physical.map((u) => u.id));
  const owner = (p: number) =>
    Number.isInteger(p) && p >= 0 && p < (s.table?.seats.length ?? 1);
  const known = new Set([
    ...WILDS_RHOVANION_ENCOUNTERS.map((c) => c.code),
    ...WILDS_EVIL_CREATURES,
    "01074",
    "01075",
    "01076",
    "01077",
    "01078",
    "01079",
    "01080",
    "01089",
    "01090",
    "01091",
    "01092",
    "01093",
    "01094",
    "01095",
    "01096",
    "01097",
    "01098",
    "01099",
    "01100",
    "01111",
    "01112",
    "01113",
    "01114",
  ]);
  return (
    q.evilDeck.every((c) => WILDS_EVIL_CREATURES.includes(c)) &&
    q.evilDiscard.every((c) => WILDS_EVIL_CREATURES.includes(c)) &&
    q.cavesDeck.every(
      (u) =>
        cardSet(u.code) === "Lost Caves" || u.code === WILDS_RHOVANION.hoard,
    ) &&
    q.resolving.every((c) => known.has(c)) &&
    q.storedCards.every(
      (p) => ids.has(p.locationId) && owner(p.player) && Array.isArray(p.cards),
    ) &&
    q.guardedHeroes.every(
      (p) => owner(p.player) && (p.guardId === "" || ids.has(p.guardId)),
    ) &&
    q.guardedPlayerCards.every(
      (p) => owner(p.player) && (p.guardId === "" || ids.has(p.guardId)),
    ) &&
    q.pendingGuarded.every((id) => ids.has(id)) &&
    new Set(q.pendingGuarded).size === q.pendingGuarded.length &&
    [q.questResources, q.firstTraitRevealedRound].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) &&
    q.noReady.every(
      (m) =>
        typeof m.id === "string" &&
        Number.isInteger(m.round) &&
        m.round >= 0 &&
        m.round <= s.round,
    ) &&
    q.locationProgress.every(
      (m) =>
        typeof m.id === "string" &&
        Number.isInteger(m.round) &&
        m.round >= 0 &&
        m.round <= s.round &&
        Number.isInteger(m.amount) &&
        m.amount >= 0,
    ) &&
    [...q.vastness, ...q.darkPlaces].every(
      (m) =>
        Number.isInteger(m.round) &&
        m.round >= 0 &&
        m.round <= s.round &&
        typeof m.phase === "string" &&
        Number.isFinite(m.amount) &&
        m.amount >= 0,
    ) &&
    q.noDamage.every(
      (m) =>
        typeof m.id === "string" &&
        Number.isInteger(m.round) &&
        m.round >= 0 &&
        m.round <= s.round &&
        typeof m.phase === "string",
    ) &&
    q.usedResponses.every((k) => typeof k === "string") &&
    (q.nemesisId === undefined || typeof q.nemesisId === "string") &&
    (q.haldanId === undefined || typeof q.haldanId === "string") &&
    (q.haldanGuardId === undefined || typeof q.haldanGuardId === "string")
  );
}
const cardSet = (code: string) =>
  WILDS_RHOVANION_ENCOUNTERS.find((c) => c.code === code)?.encounter_set;
