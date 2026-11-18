// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/wizards-quest-encounter-cards.json";
import quests from "../data/wizards-quest-quest-cards.json";
import recipes from "../data/wizards-quest-recipes.json";
import type { Card, GameState, Unit } from "./types";
import {
  fellowshipEventPublicState,
  validFellowshipEvent,
  type FellowshipEventCards,
} from "./fellowship-event-support";
export type { WizardsQuestState } from "./wizards-quest-types";

/** The Wizard's Quest set; Rider of Mirkwood is Rhosgobel's enemy side. */
export const WQ_ENCOUNTERS = encounters as Card[];
/** The seven quest cards in set order (1, the three stage 2, the three stage 3). */
export const WQ_QUESTS: Card[] = [
  ...(quests as (Card & { position?: number })[]),
].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
export const WQ_RECIPES = recipes;
export const WQ_SCENARIO = "the-wizards-quest";
const enc = (title: string) =>
  WQ_ENCOUNTERS.find((c) => c.name === title)!.code;
const quest = (back: string) =>
  WQ_QUESTS.find((c) => (c.back_name ?? c.name) === back)!.code;
export const WQ = {
  request: quest("Radagast's Request"),
  fork: quest("A Fork in the Road"),
  carried: quest("Carried Away"),
  terror: quest("A New Terror Abroad"),
  sorcery: quest("The Tower of Sorcery"),
  dungeons: quest("Dungeons of the Necromancer"),
  return: quest("Return to Rhosgobel"),
  rhosgobel: enc("Rhosgobel"),
  rider: enc("Rider of Mirkwood"),
  nazgul: enc("Nazgûl of Dol Guldur"),
  pass: enc("Necromancer's Pass"),
  pursued: enc("Pursued by Shadow"),
  bane: enc("Bane of Amon Lanc"),
  grove: enc("Oak-wood Grove"),
  blood: enc("Smoking Blood"),
  flies: enc("Forest Flies"),
  hall: enc("Twilight Hall"),
  mosquitoes: enc("Swarming Mosquitoes"),
  sniper: enc("Goblin Sniper"),
  pine: enc("Pine Slopes"),
  shadow: enc("Under the Shadow"),
  warg: enc("Necromancer's Warg"),
  beastmaster: enc("Dol Guldur Beastmaster"),
  path: enc("Watched Path"),
  storm: enc("Evil Storm"),
  spider: enc("Spider of Dol Guldur"),
  patch: enc("Patch of Midnight"),
  eyes: enc("Eyes in the Dark"),
  crows: enc("Eastern Crows"),
  tower: enc("The Sorcerer's Tower"),
  sevenfold: enc("Power Sevenfold"),
  troll: enc("Hill Troll"),
  cave: enc("Troll Cave"),
  befouled: enc("Befouled Equipment"),
  hunting: enc("Hunting Warg"),
  lookout: enc("Hunter's Lookout"),
  restless: enc("Restless Hunters"),
  orcs: enc("Dol Guldur Orcs"),
  road: enc("The Shadow Road"),
  reach: enc("The Necromancer's Reach"),
  ravenous: enc("Ravenous Spider"),
  gate: enc("Forest Gate"),
  nightfall: enc("Nightfall"),
  venomous: enc("Venomous Spider"),
  thicket: enc("Pitch-dark Thicket"),
  fastness: enc("Fastness of Mirkwood"),
  bats: enc("Dark Bats"),
  stream: enc("Forest Stream"),
  fog: enc("Treacherous Fog"),
  howling: enc("Howling Warg"),
  glade: enc("The Wargs' Glade"),
  weighed: enc("Weighed Down"),
} as const;
export const WQ_STAGE2 = [WQ.fork, WQ.carried, WQ.terror] as const;
export const WQ_STAGE3 = [WQ.sorcery, WQ.dungeons, WQ.return] as const;
/** The physical card a code stands for: Rider of Mirkwood is Rhosgobel. */
export const wqPhysical = (c: string) => (c === WQ.rider ? WQ.rhosgobel : c);
const byCode = new Map(
  [...WQ_ENCOUNTERS, ...WQ_QUESTS].map((c) => [c.code, c]),
);
export const isWqCode = (c: string) => byCode.has(c);
const traitsOf = (c: string) =>
  (byCode.get(c)?.traits ?? "").split(".").map((t) => t.trim());
export const wqHasTrait = (c: string, trait: string) =>
  traitsOf(c).includes(trait);
export const wqType = (c: string) => byCode.get(c)?.type_code;
/** The printed cost in the lower right corner (0 to 3). */
export const wqCost = (c: string) =>
  Number(
    (byCode.get(c) as { corner_text?: string } | undefined)?.corner_text,
  ) || 0;
type Recipe = (typeof recipes)[number];
export const wqRecipe = () => recipes[0] as Recipe;
/** The 14 encounter sets of 5 cards, by number. */
export const WQ_SETS: { number: number; cards: string[] }[] = (() => {
  const sets = new Map<number, string[]>();
  for (const row of wqRecipe().cards) {
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
export const wqSetLabel = (n: number) => {
  const set = WQ_SETS.find((x) => x.number === n);
  if (!set) return `Set ${n}`;
  const counts = new Map<string, number>();
  for (const c of set.cards) counts.set(c, (counts.get(c) ?? 0) + 1);
  return `Set ${n}: ${[...counts.entries()]
    .map(([c, n]) => `${byCode.get(c)!.name}${n > 1 ? ` ×${n}` : ""}`)
    .join(", ")}`;
};
/** The stage number of a quest card (its printed cost: 1, 2 or 3). */
export const wqStageOf = (c: string) => Number(byCode.get(c)?.cost) || 0;
/** The quest cards, sets and costs the shared quick build uses. */
export const WQ_EVENT_CARDS: FellowshipEventCards = {
  title: "The Wizard's Quest",
  request: WQ.request,
  special: WQ.rhosgobel,
  stage2: WQ_STAGE2,
  stage3: WQ_STAGE3,
  sets: WQ_SETS,
  setLabel: wqSetLabel,
  stageOf: wqStageOf,
  cost: wqCost,
};
const STAGE_QUEST: Record<string, number> = {
  [WQ.request]: 10,
  [WQ.fork]: 5,
  [WQ.carried]: 20,
  [WQ.terror]: 5,
  [WQ.sorcery]: 20,
  [WQ.dungeons]: 15,
  [WQ.return]: 10,
};
const playerCount = (s: GameState) =>
  s.table ? s.table.seats.filter((x) => !x.eliminated).length : 1;
export function wqStageInfo(s: GameState) {
  const q = s.wizardsQuest;
  if (!q) return undefined;
  const c = byCode.get(q.currentQuest);
  if (!c) return undefined;
  const front = s.stageRevealing;
  // A New Terror Abroad: +5 quest points per player.
  const goal =
    (STAGE_QUEST[q.currentQuest] ?? 0) +
    (q.currentQuest === WQ.terror ? 5 * playerCount(s) : 0);
  return {
    name: front ? c.name : (c.back_name ?? c.name),
    cardCode: c.code,
    quest: front ? 0 : goal,
    story: (front ? c.text : c.back_text) || (c.back_text ?? c.text ?? ""),
    questImage: front ? c.imagesrc : c.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
  };
}
const engagedUnits = (s: GameState) => [
  ...(s.engaged ?? []),
  ...(s.table?.seats.flatMap((seat) => seat.engaged ?? []) ?? []),
];
export const wqUnits = (s: GameState): Unit[] => [
  ...(s.wizardsQuest?.resolving ?? []),
  ...(s.wizardsQuest?.carried.map((x) => x.ally) ?? []),
  ...(s.wizardsQuest?.passGuards.map((x) => x.card) ?? []),
  ...(s.wizardsQuest?.guardedHeroes.map((x) => x.hero) ?? []),
];
/** The scenario's public state, for the panel and the browser checks. */
export function wizardsQuestPublicState(s: GameState) {
  const q = s.wizardsQuest;
  if (!q) return undefined;
  const where = (code: string) => {
    if (s.staging.some((u) => u.code === code)) return "staging" as const;
    if (engagedUnits(s).some((u) => u.code === code)) return "engaged" as const;
    if (
      s.activeLocation?.code === code ||
      (s.extraActiveLocations ?? []).some((u) => u.code === code)
    )
      return "active" as const;
    if ((s.victoryCards ?? []).includes(code)) return "victory" as const;
    return "out" as const;
  };
  const rhosgobel = where(WQ.rhosgobel);
  const rider = where(WQ.rider);
  return {
    ...fellowshipEventPublicState(s, q, WQ_EVENT_CARDS),
    rhosgobel,
    rider,
    carried: q.carried.length,
    passGuards: q.passGuards.length,
    guardedHeroes: q.guardedHeroes.length,
    underShadow: (s.questAttachments?.[q.currentQuest] ?? []).filter(
      (a) => a.code === WQ.shadow,
    ).length,
    nightfall: q.nightfall.length,
  };
}
export function validateWizardsQuest(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.wizardsQuest;
  if (q === undefined) return s.scenarioId !== WQ_SCENARIO;
  const player = (p: unknown) => Number.isInteger(p) && (p as number) >= 0;
  const key = (v: unknown) =>
    v === null ||
    (typeof v === "object" && typeof (v as { key?: unknown }).key === "string");
  return (
    !!q &&
    s.scenarioId === WQ_SCENARIO &&
    validFellowshipEvent(s, q, WQ_EVENT_CARDS, (c) => byCode.has(c)) &&
    (q.forkId === null || typeof q.forkId === "string") &&
    Array.isArray(q.carried) &&
    q.carried.every((x) => player(x?.player) && unit(x.ally)) &&
    Array.isArray(q.passGuards) &&
    q.passGuards.every(
      (x) =>
        player(x?.player) && typeof x.locationId === "string" && unit(x.card),
    ) &&
    Array.isArray(q.guardedHeroes) &&
    q.guardedHeroes.every(
      (x) => player(x?.player) && typeof x.guardId === "string" && unit(x.hero),
    ) &&
    (q.huntingAttack === null || typeof q.huntingAttack === "string") &&
    Array.isArray(q.nightfall) &&
    q.nightfall.every((x) => player(x?.player) && byCode.has(x.code)) &&
    Array.isArray(q.plays) &&
    q.plays.every(
      (x) =>
        player(x?.player) &&
        typeof x.key === "string" &&
        Number.isInteger(x.count),
    ) &&
    key(q.storm) &&
    key(q.fog) &&
    (q.pine === null || (key(q.pine) && Number.isInteger(q.pine.count))) &&
    Array.isArray(q.fogShadow) &&
    q.fogShadow.every((x) => player(x?.player) && typeof x.key === "string") &&
    [q.noReady, q.noDamage, q.engagedRound].every(
      (list) =>
        Array.isArray(list) &&
        list.every(
          (x) => typeof x?.id === "string" && Number.isInteger(x.round),
        ),
    ) &&
    Array.isArray(q.boosts) &&
    q.boosts.every(
      (x) =>
        typeof x?.id === "string" &&
        typeof x.key === "string" &&
        Number.isInteger(x.attack),
    ) &&
    (q.gladeRound === null || Number.isInteger(q.gladeRound)) &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit)
  );
}
