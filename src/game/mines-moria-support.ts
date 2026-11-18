// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/mines-moria-encounter-cards.json";
import quests from "../data/mines-moria-quest-cards.json";
import recipes from "../data/mines-moria-recipes.json";
import type { Card, GameState, Unit } from "./types";
import {
  fellowshipEventPublicState,
  validFellowshipEvent,
  type FellowshipEventCards,
} from "./fellowship-event-support";
export type { MinesMoriaState } from "./mines-moria-types";

/** The Mines of Moria set; Chamber of Mazarbul is The Watcher's location side. */
export const MM_ENCOUNTERS = encounters as Card[];
/** The seven quest cards in set order (1, the three stage 2, the three stage 3). */
export const MM_QUESTS: Card[] = [
  ...(quests as (Card & { position?: number })[]),
].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
export const MM_RECIPES = recipes;
export const MM_SCENARIO = "the-mines-of-moria";
const enc = (title: string) =>
  MM_ENCOUNTERS.find((c) => c.name === title)!.code;
const quest = (back: string) =>
  MM_QUESTS.find((c) => (c.back_name ?? c.name) === back)!.code;
export const MM = {
  request: quest("To the West-door"),
  presence: quest("A Presence in the Dark"),
  longDark: quest("The Long Dark of Moria"),
  narrow: quest("Narrow Paths"),
  drums: quest("Drums in the Deep"),
  balin: quest("The Fate of Balin"),
  eastward: quest("Continuing Eastward"),
  watcher: enc("The Watcher"),
  chamber: enc("Chamber of Mazarbul"),
  savage: enc("Savage Werewolf"),
  hall: enc("Many-pillared Hall"),
  fear: enc("Shadow of Fear"),
  dweller: enc("Deep-dweller"),
  stairway: enc("Darkened Stairway"),
  cannot: enc("We Cannot Get Out"),
  broodling: enc("Spider Broodling"),
  burrow: enc("Spider Burrow"),
  grabbed: enc("Grabbed by Spiders"),
  bats: enc("Moria Bats"),
  guardroom: enc("Ancient Guardroom"),
  denizen: enc("Denizen of the Deep"),
  werewolf: enc("Werewolf"),
  well: enc("Fouled Well"),
  caveIn: enc("Cave In"),
  hive: enc("Hive Guardian"),
  mines: enc("Abandoned Mines"),
  pitfall: enc("Sudden Pitfall"),
  spinner: enc("Web-spinner"),
  cavern: enc("Cobwebbed Cavern"),
  foul: enc("Foul Air"),
  brood: enc("Brood Mother"),
  lightless: enc("Lightless Passage"),
  malice: enc("Lurking Malice"),
  dreadful: enc("Dark and Dreadful"),
  troll: enc("Great Cave-troll"),
  zigil: enc("Zigil Mineshaft"),
  follower: enc("Goblin Follower"),
  stairs: enc("Stairs of Náin"),
  hidden: enc("Hidden Threat"),
  warlord: enc("Goblin Warlord"),
  forge: enc("Dwarven Forge"),
  signs: enc("Signs of Conflict"),
  archer: enc("Goblin Archer"),
  fissure: enc("Narrow Fissure"),
  ruin: enc("Crumbling Ruin"),
  sneak: enc("Goblin Sneak"),
  armoury: enc("Plundered Armoury"),
  coming: enc("They Are Coming!"),
  swarming: enc("Swarming Goblins"),
  tunnels: enc("Goblin Tunnels"),
  massing: enc("Massing in the Deep"),
} as const;
export const MM_STAGE2 = [MM.presence, MM.longDark, MM.narrow] as const;
export const MM_STAGE3 = [MM.drums, MM.balin, MM.eastward] as const;
/** The physical card a code stands for: Chamber of Mazarbul is The Watcher. */
export const mmPhysical = (c: string) => (c === MM.chamber ? MM.watcher : c);
const byCode = new Map(
  [...MM_ENCOUNTERS, ...MM_QUESTS].map((c) => [c.code, c]),
);
export const isMmCode = (c: string) => byCode.has(c);
const traitsOf = (c: string) =>
  (byCode.get(c)?.traits ?? "").split(".").map((t) => t.trim());
export const mmHasTrait = (c: string, trait: string) =>
  traitsOf(c).includes(trait);
/** The printed cost in the lower right corner (0 to 3), read from the scans. */
export const mmCost = (c: string) =>
  Number(
    (byCode.get(c) as { corner_text?: string } | undefined)?.corner_text,
  ) || 0;
type Recipe = (typeof recipes)[number];
export const mmRecipe = () => recipes[0] as Recipe;
/** The 14 encounter sets of 5 cards, by number. */
export const MM_SETS: { number: number; cards: string[] }[] = (() => {
  const sets = new Map<number, string[]>();
  for (const row of mmRecipe().cards) {
    if (row.section !== "sharedEncounterDeck") continue;
    const set = Number(
      /(\d+)$/.exec(byCode.get(row.code)?.encounter_set ?? "")?.[1],
    );
    sets.set(set, [
      ...(sets.get(set) ?? []),
      ...Array<string>(row.quantity).fill(row.code),
    ]);
  }
  return [...sets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([number, cards]) => ({ number, cards }));
})();
export const mmSetLabel = (n: number) => {
  const set = MM_SETS.find((x) => x.number === n);
  if (!set) return `Set ${n}`;
  const counts = new Map<string, number>();
  for (const c of set.cards) counts.set(c, (counts.get(c) ?? 0) + 1);
  return `Set ${n}: ${[...counts.entries()]
    .map(([c, n]) => `${byCode.get(c)!.name}${n > 1 ? ` ×${n}` : ""}`)
    .join(", ")}`;
};
/** The stage number of a quest card (its printed cost: 1, 2 or 3). */
export const mmStageOf = (c: string) => Number(byCode.get(c)?.cost) || 0;
/** The quest cards, sets and costs the shared quick build uses. */
export const MM_EVENT_CARDS: FellowshipEventCards = {
  title: "The Mines of Moria",
  request: MM.request,
  special: MM.watcher,
  stage2: MM_STAGE2,
  stage3: MM_STAGE3,
  sets: MM_SETS,
  setLabel: mmSetLabel,
  stageOf: mmStageOf,
  cost: mmCost,
};
const STAGE_QUEST: Record<string, number> = {
  [MM.request]: 5,
  [MM.presence]: 20,
  [MM.longDark]: 20,
  [MM.narrow]: 20,
  [MM.drums]: 10,
  [MM.balin]: 20,
  [MM.eastward]: 15,
};
export function mmStageInfo(s: GameState) {
  const q = s.minesMoria;
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
export const mmUnits = (s: GameState): Unit[] => [
  ...(s.minesMoria?.resolving ?? []),
];
/** The scenario's public state, for the panel and the browser checks. */
export function minesMoriaPublicState(s: GameState) {
  const q = s.minesMoria;
  if (!q) return undefined;
  const watcher = s.staging.some((u) => u.code === MM.watcher)
    ? ("staging" as const)
    : engagedUnits(s).some((u) => u.code === MM.watcher)
      ? ("engaged" as const)
      : ("out" as const);
  const chamber = s.staging.some((u) => u.code === MM.chamber)
    ? ("staging" as const)
    : s.activeLocation?.code === MM.chamber
      ? ("active" as const)
      : (s.victoryCards ?? []).includes(MM.chamber)
        ? ("victory" as const)
        : ("out" as const);
  const key = `${s.round}:${s.phase === "staging" ? "quest" : s.phase}`;
  const cap = q.caps
    .filter((x) => x.key === key)
    .reduce<number | null>(
      (m, x) => Math.min(m ?? Infinity, x.limit - x.placed),
      null,
    );
  return {
    ...fellowshipEventPublicState(s, q, MM_EVENT_CARDS),
    watcher,
    chamber,
    guarded: q.guarded.length,
    hidden: q.hidden.length,
    cap,
  };
}
export function validateMinesMoria(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.minesMoria;
  if (q === undefined) return s.scenarioId !== MM_SCENARIO;
  const known = (c: unknown) => typeof c === "string" && byCode.has(c);
  const player = (p: unknown) => Number.isInteger(p) && (p as number) >= 0;
  const round = (r: unknown) => Number.isInteger(r);
  const id = (v: unknown) => typeof v === "string";
  const keyed = (list: unknown) =>
    Array.isArray(list) &&
    list.every((x) => id(x?.id) && typeof x.key === "string");
  return (
    !!q &&
    s.scenarioId === MM_SCENARIO &&
    validFellowshipEvent(s, q, MM_EVENT_CARDS, (c) => byCode.has(c)) &&
    Array.isArray(q.guarded) &&
    q.guarded.every(
      (g) =>
        player(g?.owner) &&
        id(g.attachment?.id) &&
        typeof g.attachment.code === "string",
    ) &&
    (q.guarding === null || (id(q.guarding?.id) && player(q.guarding.owner))) &&
    Array.isArray(q.hidden) &&
    q.hidden.every(known) &&
    Array.isArray(q.stagingBonus) &&
    q.stagingBonus.every(
      (x) =>
        typeof x?.key === "string" &&
        Number.isInteger(x.amount) &&
        known(x.source),
    ) &&
    (q.signs === null ||
      (typeof q.signs?.key === "string" && Number.isInteger(q.signs.count))) &&
    keyed(q.zigil) &&
    q.zigil.every((x) => Number.isInteger(x.amount)) &&
    Array.isArray(q.caps) &&
    q.caps.every(
      (x) =>
        typeof x?.key === "string" &&
        Number.isInteger(x.limit) &&
        Number.isInteger(x.placed) &&
        known(x.source),
    ) &&
    (q.brood === null ||
      (round(q.brood?.round) && Number.isInteger(q.brood.placed))) &&
    Array.isArray(q.lightless) &&
    q.lightless.every(
      (x) => id(x?.id) && round(x.round) && Number.isInteger(x.amount),
    ) &&
    (q.firstTreachery === null ||
      (round(q.firstTreachery?.round) &&
        known(q.firstTreachery.code) &&
        typeof q.firstTreachery.open === "boolean")) &&
    (q.questEnded === null || round(q.questEnded)) &&
    Array.isArray(q.noReady) &&
    q.noReady.every((x) => id(x?.id) && round(x.round)) &&
    keyed(q.noDamage) &&
    Array.isArray(q.engagedRound) &&
    q.engagedRound.every((x) => id(x?.id) && round(x.round)) &&
    Array.isArray(q.massing) &&
    q.massing.every((x) => player(x?.player) && typeof x.key === "string") &&
    Array.isArray(q.warlords) &&
    q.warlords.every(id) &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit)
  );
}
