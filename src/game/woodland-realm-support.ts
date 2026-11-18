// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/woodland-realm-encounter-cards.json";
import quests from "../data/woodland-realm-quest-cards.json";
import recipes from "../data/woodland-realm-recipes.json";
import type { Card, GameState, Unit } from "./types";
import {
  fellowshipEventPublicState,
  validFellowshipEvent,
  type FellowshipEventCards,
} from "./fellowship-event-support";
export type { WoodlandRealmState } from "./woodland-realm-types";

/** The Woodland Realm set; Mendor is Spider Den's objective-ally side. */
export const WR_ENCOUNTERS = encounters as Card[];
/** The seven quest cards in set order (1, the three stage 2, the three stage 3). */
export const WR_QUESTS: Card[] = [
  ...(quests as (Card & { position?: number })[]),
].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
export const WR_RECIPES = recipes;
export const WR_SCENARIO = "the-woodland-realm";
const enc = (title: string) =>
  WR_ENCOUNTERS.find((c) => c.name === title)!.code;
const quest = (back: string) =>
  WR_QUESTS.find((c) => (c.back_name ?? c.name) === back)!.code;
export const WR = {
  request: quest("Captured by Spiders"),
  dark: quest("Lost in the Dark"),
  path: quest('"Don\'t Leave the Path"'),
  ambush: quest("Ambushed at Night"),
  fear: quest("The Forest of Great Fear"),
  halls: quest("To the Elvenking's Halls"),
  escape: quest("Escape from Taur-nu-Fuin"),
  den: enc("Spider Den"),
  mendor: enc("Mendor"),
  spawn: enc("Ungoliant's Spawn"),
  grove: enc("Forest Grove"),
  despair: enc("Despair"),
  ufthak: enc("Chieftain Ufthak"),
  camp: enc("Abandoned Camp"),
  gloom: enc("Gathering Gloom"),
  bats: enc("Black Forest Bats"),
  stream: enc("Enchanted Stream"),
  exhaustion: enc("Exhaustion"),
  spiders: enc("Spiders of Mirkwood"),
  ring: enc("The Spiders' Ring"),
  web: enc("Caught in a Web"),
  wolf: enc("Wolf Rider"),
  caves: enc("The Goblins' Caves"),
  driven: enc("Driven by Shadow"),
  beast: enc("Beast of Taur-nu-Fuin"),
  woods: enc("Dark Black Woods"),
  rain: enc("Wind-whipped Rain"),
  giant: enc("Giant Spider"),
  giantWeb: enc("Giant Web"),
  eyes: enc("Eyes of the Forest"),
  patrol: enc("Mirkwood Patrol"),
  mountains: enc("Mountains of Mirkwood"),
  hatred: enc("Hatred Rekindled"),
  bear: enc("Wild Bear"),
  labyrinth: enc("Labyrinthine Woods"),
  vastness: enc("Vastness of Mirkwood"),
  flock: enc("Mirkwood Flock"),
  eaves: enc("The Eaves of Mirkwood"),
  massing: enc("Massing at Night"),
  wargs: enc("Wild Wargs"),
  watercourse: enc("Dry Watercourse"),
  turned: enc("Turned Around"),
  pack: enc("Pack of Wargs"),
  darkwood: enc("Dark-wood Grove"),
  witless: enc("Lost and Witless"),
  wicked: enc("Wicked Spider"),
  road: enc("Old Forest Road"),
  frightened: enc("A Frightened Beast"),
  orcs: enc("Ambushing Orcs"),
  trail: enc("Mirkwood Path"),
  wasted: enc("Wasted Provisions"),
} as const;
export const WR_STAGE2 = [WR.dark, WR.path, WR.ambush] as const;
export const WR_STAGE3 = [WR.fear, WR.halls, WR.escape] as const;
/** The physical card a code stands for: Mendor is Spider Den. */
export const wrPhysical = (c: string) => (c === WR.mendor ? WR.den : c);
const byCode = new Map(
  [...WR_ENCOUNTERS, ...WR_QUESTS].map((c) => [c.code, c]),
);
export const isWrCode = (c: string) => byCode.has(c);
const traitsOf = (c: string) =>
  (byCode.get(c)?.traits ?? "").split(".").map((t) => t.trim());
export const wrHasTrait = (c: string, trait: string) =>
  traitsOf(c).includes(trait);
/** The printed cost in the lower right corner (0 to 3). */
export const wrCost = (c: string) =>
  Number(
    (byCode.get(c) as { corner_text?: string } | undefined)?.corner_text,
  ) || 0;
type Recipe = (typeof recipes)[number];
export const wrRecipe = () => recipes[0] as Recipe;
/** The 14 encounter sets of 5 cards, by number. */
export const WR_SETS: { number: number; cards: string[] }[] = (() => {
  const sets = new Map<number, string[]>();
  for (const row of wrRecipe().cards) {
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
export const wrSetLabel = (n: number) => {
  const set = WR_SETS.find((x) => x.number === n);
  if (!set) return `Set ${n}`;
  const counts = new Map<string, number>();
  for (const c of set.cards) counts.set(c, (counts.get(c) ?? 0) + 1);
  return `Set ${n}: ${[...counts.entries()]
    .map(([c, n]) => `${byCode.get(c)!.name}${n > 1 ? ` ×${n}` : ""}`)
    .join(", ")}`;
};
/** The stage number of a quest card (its printed cost: 1, 2 or 3). */
export const wrStageOf = (c: string) => Number(byCode.get(c)?.cost) || 0;
/** The quest cards, sets and costs the shared quick build uses. */
export const WR_EVENT_CARDS: FellowshipEventCards = {
  title: "The Woodland Realm",
  request: WR.request,
  special: WR.den,
  stage2: WR_STAGE2,
  stage3: WR_STAGE3,
  sets: WR_SETS,
  setLabel: wrSetLabel,
  stageOf: wrStageOf,
  cost: wrCost,
};
const STAGE_QUEST: Record<string, number> = {
  [WR.request]: 10,
  [WR.dark]: 20,
  [WR.path]: 20,
  [WR.ambush]: 20,
  [WR.fear]: 15,
  [WR.escape]: 20,
};
const seats = (s: GameState) =>
  s.table ? s.table.seats.filter((x) => !x.eliminated) : [{ threat: s.threat }];
export function wrStageInfo(s: GameState) {
  const q = s.woodlandRealm;
  if (!q) return undefined;
  const c = byCode.get(q.currentQuest);
  if (!c) return undefined;
  const front = s.stageRevealing;
  // To the Elvenking's Halls: X is the highest threat; Turned Around adds 5.
  const turned = (s.questAttachments?.[q.currentQuest] ?? []).filter(
    (a) => a.code === WR.turned,
  ).length;
  const goal =
    (q.currentQuest === WR.halls
      ? Math.max(...seats(s).map((x) => x.threat))
      : (STAGE_QUEST[q.currentQuest] ?? 0)) +
    5 * turned;
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
const alliesOf = (s: GameState) => [
  ...(s.allies ?? []),
  ...(s.table?.seats.flatMap((seat) => seat.allies ?? []) ?? []),
];
export const wrUnits = (s: GameState): Unit[] => [
  ...(s.woodlandRealm?.resolving ?? []),
];
/** The scenario's public state, for the panel and the browser checks. */
export function woodlandRealmPublicState(s: GameState) {
  const q = s.woodlandRealm;
  if (!q) return undefined;
  const den = s.staging.some((u) => u.code === WR.den)
    ? ("staging" as const)
    : s.activeLocation?.code === WR.den
      ? ("active" as const)
      : ("out" as const);
  const mendorSeat = s.table
    ? s.table.seats.findIndex((seat) =>
        seat.allies.some((u) => u.code === WR.mendor),
      )
    : alliesOf(s).some((u) => u.code === WR.mendor)
      ? 0
      : -1;
  const marked = q.markedId
    ? [...s.staging, ...engagedUnits(s)].find((u) => u.id === q.markedId)
    : undefined;
  return {
    ...fellowshipEventPublicState(s, q, WR_EVENT_CARDS),
    den,
    mendor: mendorSeat >= 0 ? mendorSeat : null,
    marked: marked?.code ?? null,
    cap: q.cap?.round === s.round ? q.cap.limit - q.cap.placed : null,
    turned: (s.questAttachments?.[q.currentQuest] ?? []).filter(
      (a) => a.code === WR.turned,
    ).length,
  };
}
export function validateWoodlandRealm(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.woodlandRealm;
  if (q === undefined) return s.scenarioId !== WR_SCENARIO;
  const known = (c: unknown) => typeof c === "string" && byCode.has(c);
  const player = (p: unknown) => Number.isInteger(p) && (p as number) >= 0;
  const round = (r: unknown) => Number.isInteger(r);
  const id = (v: unknown) => typeof v === "string";
  const keyed = (list: unknown) =>
    Array.isArray(list) &&
    list.every((x) => id(x?.id) && typeof x.key === "string");
  return (
    !!q &&
    s.scenarioId === WR_SCENARIO &&
    validFellowshipEvent(s, q, WR_EVENT_CARDS, (c) => byCode.has(c)) &&
    (q.mendorId === null || id(q.mendorId)) &&
    (q.markedId === null || id(q.markedId)) &&
    (q.cap === null ||
      (round(q.cap?.round) &&
        Number.isInteger(q.cap.limit) &&
        Number.isInteger(q.cap.placed))) &&
    (q.firstTreachery === null ||
      (round(q.firstTreachery?.round) &&
        known(q.firstTreachery.code) &&
        typeof q.firstTreachery.open === "boolean")) &&
    (q.hallsProgress === null ||
      (typeof q.hallsProgress?.key === "string" &&
        Number.isInteger(q.hallsProgress.amount))) &&
    Array.isArray(q.reduced) &&
    q.reduced.every(
      (x) => player(x?.player) && round(x.round) && Number.isInteger(x.amount),
    ) &&
    (q.despairRound === null || round(q.despairRound)) &&
    keyed(q.blankShadow) &&
    (q.noPlayerReady === null || round(q.noPlayerReady)) &&
    Array.isArray(q.noReady) &&
    q.noReady.every((x) => id(x?.id) && round(x.round)) &&
    Array.isArray(q.streamHeroes) &&
    q.streamHeroes.every(id) &&
    (q.labyrinth === null ||
      (typeof q.labyrinth?.key === "string" &&
        Number.isInteger(q.labyrinth.count))) &&
    Array.isArray(q.labyrinthShadow) &&
    q.labyrinthShadow.every(
      (x) => player(x?.player) && typeof x.key === "string",
    ) &&
    keyed(q.defenseBoosts) &&
    q.defenseBoosts.every((x) => Number.isInteger(x.value)) &&
    keyed(q.noDamage) &&
    Array.isArray(q.eaves) &&
    q.eaves.every(
      (x) => id(x?.id) && round(x.round) && Number.isInteger(x.amount),
    ) &&
    Array.isArray(q.engagedRound) &&
    q.engagedRound.every((x) => id(x?.id) && round(x.round)) &&
    Array.isArray(q.webPaid) &&
    q.webPaid.every(id) &&
    Array.isArray(q.uncancelable) &&
    q.uncancelable.every(known) &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit)
  );
}
