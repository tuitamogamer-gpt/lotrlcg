// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/escape-khazad-encounter-cards.json";
import quests from "../data/escape-khazad-quest-cards.json";
import recipes from "../data/escape-khazad-recipes.json";
import type { Card, GameState, Unit } from "./types";
import {
  fellowshipEventPublicState,
  validFellowshipEvent,
  type FellowshipEventCards,
} from "./fellowship-event-support";
export type { EscapeKhazadState } from "./escape-khazad-types";

/** The Escape from Khazad-dûm set; Durin's Bane is Dark Pit's other side. */
export const EK_ENCOUNTERS = encounters as Card[];
/** The seven quest cards in set order (1, the three stage 2, the three stage 3). */
export const EK_QUESTS: Card[] = [
  ...(quests as (Card & { position?: number })[]),
].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
export const EK_RECIPES = recipes;
export const EK_SCENARIO = "escape-from-khazad-dum";
const enc = (title: string) =>
  EK_ENCOUNTERS.find((c) => c.name === title)!.code;
const quest = (back: string) =>
  EK_QUESTS.find((c) => (c.back_name ?? c.name) === back)!.code;
export const EK = {
  depths: quest("Out of the Depths"),
  lair: quest("Old One Lair"),
  wrongTurn: quest("A Wrong Turn"),
  wayUp: quest("A Way Up"),
  bridge: quest("The Bridge of Khazad-dûm"),
  lastLord: quest("Last Lord of Moria"),
  rearGuard: quest("The Rear Guard"),
  pit: enc("Dark Pit"),
  bane: enc("Durin's Bane"),
  blackBats: enc("Black Bats"),
  nest: enc("Nest of Vermin"),
  swarm: enc("Swarm of Bats"),
  caveSpider: enc("Cave Spider"),
  roots: enc("The Mountain's Roots"),
  eyes: enc("Watchful Eyes"),
  caveTroll: enc("Cave-troll"),
  twisting: enc("Twisting Passage"),
  bones: enc("Undisturbed Bones"),
  stoneTroll: enc("Old Stone-troll"),
  den: enc("Frightful Den"),
  deepDark: enc("Deep Deep Dark"),
  adder: enc("Rock Adder"),
  chasm: enc("Bottomless Chasm"),
  lost: enc("Lost and Alone"),
  hobgoblin: enc("Hobgoblin"),
  hall: enc("Western Hall"),
  devilry: enc("New Devilry"),
  unspeakable: enc("Unspeakable Thing"),
  grotto: enc("Lightless Grotto"),
  roads: enc("Many Roads"),
  dweller: enc("Shadow Dweller"),
  branching: enc("Branching Paths"),
  fatigue: enc("Fatigue"),
  elder: enc("Elder Nameless Thing"),
  caverns: enc("Silent Caverns"),
  darkPlaces: enc("Dark Places"),
  horn: enc("Orc Horn Blower"),
  dungeon: enc("Goblin Dungeon"),
  fissure: enc("Deep Fissure"),
  uruks: enc("Black Uruks"),
  gap: enc("Dreadful Gap"),
  howls: enc("Orcish Howls"),
  raiders: enc("Orc Raiders"),
  greatBridge: enc("The Great Bridge"),
  vast: enc("Vast and Intricate"),
  chieftain: enc("Chieftain of the Pit"),
  forked: enc("Forked Passage"),
  chance: enc("Chance Encounter"),
  nameless: enc("Nameless Thing"),
  mithril: enc("Mithril Lode"),
  foe: enc("A Foe Beyond"),
} as const;
export const EK_STAGE2 = [EK.lair, EK.wrongTurn, EK.wayUp] as const;
export const EK_STAGE3 = [EK.bridge, EK.lastLord, EK.rearGuard] as const;
/** The undefended-damage target of Durin's Bane's attack at The Bridge of Khazad-dûm. */
export const EK_BRIDGE_TARGET = "escape-khazad:bridge";
/** The physical card a code stands for: Durin's Bane is Dark Pit. */
export const ekPhysical = (c: string) => (c === EK.bane ? EK.pit : c);
const byCode = new Map(
  [...EK_ENCOUNTERS, ...EK_QUESTS].map((c) => [c.code, c]),
);
export const isEkCode = (c: string) => byCode.has(c);
const traitsOf = (c: string) =>
  (byCode.get(c)?.traits ?? "").split(".").map((t) => t.trim());
export const ekHasTrait = (c: string, trait: string) =>
  traitsOf(c).includes(trait);
/** The printed cost in the lower right corner (0 to 3), read from the scans. */
export const ekCost = (c: string) =>
  Number(
    (byCode.get(c) as { corner_text?: string } | undefined)?.corner_text,
  ) || 0;
type Recipe = (typeof recipes)[number];
export const ekRecipe = () => recipes[0] as Recipe;
/** The 14 encounter sets of 5 cards, by number (15 to 28). */
export const EK_SETS: { number: number; cards: string[] }[] = (() => {
  const sets = new Map<number, string[]>();
  for (const row of ekRecipe().cards) {
    const set = Number(
      /(\d+)$/.exec(byCode.get(row.code)?.encounter_set ?? "")?.[1],
    );
    // The recipe lists the encounter sets as its quest deck section.
    if (!set) continue;
    sets.set(set, [
      ...(sets.get(set) ?? []),
      ...Array<string>(row.quantity).fill(row.code),
    ]);
  }
  return [...sets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([number, cards]) => ({ number, cards }));
})();
export const ekSetLabel = (n: number) => {
  const set = EK_SETS.find((x) => x.number === n);
  if (!set) return `Set ${n}`;
  const counts = new Map<string, number>();
  for (const c of set.cards) counts.set(c, (counts.get(c) ?? 0) + 1);
  return `Set ${n}: ${[...counts.entries()]
    .map(([c, n]) => `${byCode.get(c)!.name}${n > 1 ? ` ×${n}` : ""}`)
    .join(", ")}`;
};
/** The stage number of a quest card (its printed cost: 1, 2 or 3). */
export const ekStageOf = (c: string) => Number(byCode.get(c)?.cost) || 0;
/** The quest cards, sets and costs the shared quick build uses. */
export const EK_EVENT_CARDS: FellowshipEventCards = {
  title: "Escape from Khazad-dûm",
  request: EK.depths,
  special: EK.pit,
  stage2: EK_STAGE2,
  stage3: EK_STAGE3,
  sets: EK_SETS,
  setLabel: ekSetLabel,
  stageOf: ekStageOf,
  cost: ekCost,
};
const STAGE_QUEST: Record<string, number> = {
  [EK.depths]: 10,
  [EK.lair]: 10,
  [EK.wrongTurn]: 15,
  [EK.wayUp]: 20,
  [EK.bridge]: 10,
  [EK.lastLord]: 15,
  [EK.rearGuard]: 20,
};
export function ekStageInfo(s: GameState) {
  const q = s.escapeKhazad;
  if (!q) return undefined;
  const c = byCode.get(q.currentQuest);
  if (!c) return undefined;
  const front = s.stageRevealing;
  return {
    name: front ? c.name : (c.back_name ?? c.name),
    cardCode: c.code,
    quest: front ? 0 : (STAGE_QUEST[q.currentQuest] ?? 0),
    story: (front ? c.text : c.back_text) || (c.back_text ?? c.text ?? ""),
    questImage: front ? c.imagesrc : c.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
  };
}
const engagedUnits = (s: GameState) => [
  ...(s.engaged ?? []),
  ...(s.table?.seats.flatMap((seat) => seat.engaged ?? []) ?? []),
];
/** The scenario's units out of the ordinary zones (treacheries, guarded allies). */
export const ekUnits = (s: GameState): Unit[] => [
  ...(s.escapeKhazad?.resolving ?? []),
  ...(s.escapeKhazad?.dungeon.map((g) => g.ally) ?? []),
];
/** The scenario's public state, for the panel and the browser checks. */
export function escapeKhazadPublicState(s: GameState) {
  const q = s.escapeKhazad;
  if (!q) return undefined;
  const pit = s.staging.some((u) => u.code === EK.pit)
    ? ("staging" as const)
    : s.activeLocation?.code === EK.pit
      ? ("active" as const)
      : ("out" as const);
  const bane = q.baneAside
    ? ("aside" as const)
    : s.staging.some((u) => u.code === EK.bane)
      ? ("staging" as const)
      : engagedUnits(s).some((u) => u.code === EK.bane)
        ? ("engaged" as const)
        : (s.victoryCards ?? []).includes(EK.bane)
          ? ("victory" as const)
          : ("out" as const);
  const bridge =
    q.currentQuest === EK.bridge && !s.stageRevealing
      ? Math.max(
          0,
          5 - (q.bridgePlaced?.round === s.round ? q.bridgePlaced.placed : 0),
        )
      : null;
  return {
    ...fellowshipEventPublicState(s, q, EK_EVENT_CARDS),
    pit,
    bane,
    bridgeDamage: q.bridgeDamage,
    bridgeCap: bridge,
    lair: !!q.lair,
    dungeon: q.dungeon.length,
    nameless: q.nameless.length,
  };
}
export function validateEscapeKhazad(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.escapeKhazad;
  if (q === undefined) return s.scenarioId !== EK_SCENARIO;
  const player = (p: unknown) => Number.isInteger(p) && (p as number) >= 0;
  const round = (r: unknown) => Number.isInteger(r);
  const id = (v: unknown) => typeof v === "string";
  const keyed = (list: unknown) =>
    Array.isArray(list) &&
    list.every((x) => id(x?.id) && typeof x.key === "string");
  const count = (n: unknown) => Number.isInteger(n) && (n as number) >= 0;
  return (
    !!q &&
    s.scenarioId === EK_SCENARIO &&
    validFellowshipEvent(s, q, EK_EVENT_CARDS, (c) => byCode.has(c)) &&
    typeof q.baneAside === "boolean" &&
    (q.baneSafe === null || round(q.baneSafe)) &&
    (q.baneDamage === null ||
      (round(q.baneDamage?.round) && count(q.baneDamage.amount))) &&
    count(q.bridgeDamage) &&
    (q.bridgePlaced === null ||
      (round(q.bridgePlaced?.round) && count(q.bridgePlaced.placed))) &&
    (q.lair === null || id(q.lair)) &&
    keyed(q.blank) &&
    keyed(q.penalties) &&
    q.penalties.every(
      (x) =>
        Number.isInteger(x.will) &&
        Number.isInteger(x.attack) &&
        Number.isInteger(x.defense),
    ) &&
    keyed(q.enemyDefense) &&
    q.enemyDefense.every((x) => Number.isInteger(x.value)) &&
    keyed(q.noDamage) &&
    (q.fatigue === null || round(q.fatigue)) &&
    Array.isArray(q.noReady) &&
    q.noReady.every((x) => id(x?.id) && round(x.round)) &&
    Array.isArray(q.reduced) &&
    q.reduced.every(
      (x) => player(x?.player) && round(x.round) && count(x.amount),
    ) &&
    Array.isArray(q.dungeon) &&
    q.dungeon.every(
      (g) => id(g?.locationId) && player(g.player) && unit(g.ally),
    ) &&
    Array.isArray(q.nameless) &&
    q.nameless.every(
      (g) => id(g?.enemyId) && player(g.player) && typeof g.code === "string",
    ) &&
    (q.excess === null || (id(q.excess?.id) && count(q.excess.amount))) &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit)
  );
}
