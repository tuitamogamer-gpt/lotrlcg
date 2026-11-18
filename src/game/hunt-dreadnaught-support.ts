// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/hunt-dreadnaught-encounter-cards.json";
import quests from "../data/hunt-dreadnaught-quest-cards.json";
import recipes from "../data/hunt-dreadnaught-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { HuntDreadnaughtState } from "./hunt-dreadnaught-types";

/**
 * The Hunt for the Dreadnaught set. The six unique ship-objectives, the
 * Dreadnaught and the three Setup cards are printed on both sides; each other
 * side is its own ':B' definition whose physical card is the front.
 */
export const HD_ENCOUNTERS = encounters as Card[];
/** The two quest cards in quest-deck order. */
export const HD_QUESTS: Card[] = [
  ...(quests as (Card & { position?: number })[]),
].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
export const HD_RECIPES = recipes;
export const HD_SCENARIO = "the-hunt-for-the-dreadnaught";
const front = (title: string) =>
  [...HD_ENCOUNTERS, ...HD_QUESTS].find(
    (c) => c.name === title && !c.code.endsWith(":B"),
  )!.code;
export const HD = {
  search: front("Searching the High Seas"),
  destroy: front("Destroy the Dreadnaught"),
  easy: front("Easy Mode"),
  standard: front("Standard Mode"),
  hard: front("Hard Mode"),
  eithiliant: front("Eithiliant"),
  goldenWing: front("Golden Wing"),
  pride: front("Pride of Lebennin"),
  silentMist: front("Silent Mist"),
  swan: front("Swan Ship of Dol Amroth"),
  twilight: front("Twilight's Call"),
  warship: front("Gondorian Warship"),
  dreadnaught: front("Dreadnaught"),
  captain: front("Captain of the Haven"),
  commander: front("Commander of the Dreadnaught"),
  descendant: front("Descendant of Castamir"),
  hydraken: front("Hydraken"),
  ophidian: front("Ophidian"),
  varjax: front("Varjax"),
  brash: front("Brash Corsair"),
  plunderer: front("Corsair Plunderer"),
  buccaneer: front("Daring Buccaneer"),
  marauder: front("Fierce Marauder"),
  sailor: front("Southron Sailor"),
  umbarCaptain: front("Umbar Captain"),
  blackSails: front("Black Sails"),
  skiff: front("Corsair Skiff"),
  skirmisher: front("Corsair Skirmisher"),
  corsairWarship: front("Corsair Warship"),
  ramming: front("Ramming Ship"),
  slave: front("Slave Ship"),
  galley: front("War Galley"),
  seaMonster: front("Sea Monster"),
  shipyard: front("Belfalas Shipyard"),
  cobas: front("Cobas Haven"),
  isle: front("Isle of Fortune"),
  mouths: front("Mouths of Anduin"),
  tolfalas: front("Tolfalas Landing"),
  cove: front("Wicked Cove"),
  ballista: front("Ballista Barrage"),
  boardingParty: front("Boarding Party"),
  grappled: front("Grappled!"),
  mist: front("Out of the Mist"),
  overworked: front("Overworked"),
  water: front("Taking on Water"),
  tempest: front("Violent Tempest"),
} as const;
/** The other side of a double-sided card. */
export const hdBack = (c: string) => `${c}:B`;
/** The physical card a code stands for (the front of a ':B' side). */
export const hdPhysical = (c: string) =>
  c.endsWith(":B") ? c.slice(0, -2) : c;
export const HD_DAMAGED = hdBack(HD.dreadnaught);
/** The six unique ship-objectives each player chooses from, Basic side faceup. */
export const HD_SHIPS: readonly string[] = [
  HD.eithiliant,
  HD.goldenWing,
  HD.pride,
  HD.silentMist,
  HD.swan,
  HD.twilight,
];
/** The six set-aside unique Corsair enemies the Damaged Dreadnaught sends. */
export const HD_UNIQUES: readonly string[] = [
  HD.captain,
  HD.commander,
  HD.descendant,
  HD.hydraken,
  HD.ophidian,
  HD.varjax,
];
export const HD_MODES: Record<"easy" | "standard" | "hard", string> = {
  easy: HD.easy,
  standard: HD.standard,
  hard: HD.hard,
};
const byCode = new Map(
  [...HD_ENCOUNTERS, ...HD_QUESTS].map((c) => [c.code, c]),
);
export const isHdCode = (c: string) => byCode.has(c);
type Recipe = (typeof recipes)[number];
export const hdRecipe = () => recipes[0] as Recipe;
/** A recipe section as physical card codes. */
export const hdSection = (title: string) =>
  hdRecipe()
    .cards.filter((c) => c.section === title)
    .flatMap((c) => Array<string>(c.quantity).fill(c.code));
/** The 13 non-Ship, non-unique Corsair enemies (encounter cards 18 to 30). */
export const HD_CORSAIR_DECK: readonly string[] = hdSection(
  "sharedEncounterDeck2",
);
const CORSAIR_CODES = new Set(HD_CORSAIR_DECK);
/** A non-Ship Corsair enemy goes to the Corsair discard pile. */
export const isCorsairDeckCode = (c: string) => CORSAIR_CODES.has(c);
/** Printed Boarding X (the Dreadnaught's Massive ships board through other cards). */
export const hdPrintedBoarding = (c: string) =>
  Number(
    /(?:^|\n|\.\s)Boarding (\d+)\./.exec(byCode.get(c)?.text ?? "")?.[1] ?? 0,
  );
/** Printed Pillage X. */
export const hdPrintedPillage = (c: string) =>
  Number(
    /(?:^|\n|\.\s)Pillage (\d+)\./.exec(byCode.get(c)?.text ?? "")?.[1] ?? 0,
  );
export const hdStageOf = (c: string) => (c === HD.destroy ? 2 : 1);
/** The global values (one group): 8 quest points and 15 hit points per player. */
export const hdPlayers = (s: GameState) => (s.table ? s.table.seats.length : 1);
export const hdQuestPoints = (s: GameState) => 8 * hdPlayers(s);
export const hdDreadnaughtHealth = (s: GameState) => 15 * hdPlayers(s);
/** No more than 5 progress (on each stage) or damage (on the Dreadnaught) per player each round. */
export const hdRoundCap = (s: GameState) => 5 * hdPlayers(s);
export function hdStageInfo(s: GameState) {
  const q = s.huntDreadnaught;
  if (!q) return undefined;
  const c = byCode.get(q.currentQuest)!;
  const revealing = s.stageRevealing;
  return {
    name: c.name,
    cardCode: c.code,
    quest: q.currentQuest === HD.search ? hdQuestPoints(s) : 0,
    story: (revealing ? c.text : c.back_text) || (c.back_text ?? c.text ?? ""),
    questImage: revealing ? c.imagesrc : c.back_imagesrc,
    side: revealing ? ("A" as const) : ("B" as const),
  };
}
export const hdUnits = (s: GameState): Unit[] => [
  ...(s.huntDreadnaught?.resolving ?? []),
  ...(s.huntDreadnaught?.capture ?? []),
];
/** Each seat's zones: the active seat's live zones are on the state. */
const seatZones = (s: GameState): Pick<GameState, "allies" | "engaged">[] =>
  s.table
    ? s.table.seats.map((seat, i) => (i === s.table!.active ? s : seat))
    : [s];
const engagedUnits = (s: GameState) =>
  seatZones(s).flatMap((z) => z.engaged ?? []);
/** The scenario's public state, for the panel and the browser checks. */
export function huntDreadnaughtPublicState(s: GameState) {
  const q = s.huntDreadnaught;
  if (!q) return undefined;
  const dread = [...s.staging, ...engagedUnits(s)].find(
    (u) => hdPhysical(u.code) === HD.dreadnaught,
  );
  const ships = seatZones(s).flatMap((z, owner) =>
    (z.allies ?? [])
      .filter(
        (u) =>
          HD_SHIPS.includes(hdPhysical(u.code)) ||
          u.code === HD.warship ||
          (u.code === HD.skirmisher && !!u.cobasShipObjective),
      )
      .map((u) => ({ u, owner })),
  );
  const round = (v: { round: number; amount: number } | null) =>
    v?.round === s.round ? v.amount : 0;
  return {
    mode: q.mode,
    currentQuest: q.currentQuest,
    stage: hdStageOf(q.currentQuest),
    questPoints: q.currentQuest === HD.search ? hdQuestPoints(s) : null,
    progressCap: hdRoundCap(s),
    progressThisRound: round(q.questProgress),
    fleet: q.fleet.map((f) => ({ ...f })),
    fleetReady: q.fleetReady,
    ships: ships.map(({ u, owner }) => ({
      id: u.id,
      code: u.code,
      upgraded: u.code.endsWith(":B"),
      owner,
    })),
    corsairDeck: q.corsairDeck.length,
    corsairDiscard: [...q.corsairDiscard],
    dreadnaught: dread
      ? dread.code === HD_DAMAGED
        ? ("damaged" as const)
        : ("elite" as const)
      : q.setAside.includes(HD.dreadnaught) || !q.mode
        ? ("aside" as const)
        : ("gone" as const),
    dreadnaughtDamage: dread?.damage ?? 0,
    dreadnaughtHealth: hdDreadnaughtHealth(s),
    dreadnaughtDamageThisRound: round(q.dreadDamage),
    uniquesAside: HD_UNIQUES.filter((c) => q.setAside.includes(c)).length,
    warshipsAside: q.setAside.filter((c) => c === HD.warship).length,
    questActionUsed: q.questActionUsed,
  };
}
export function validateHuntDreadnaught(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.huntDreadnaught;
  if (q === undefined) return s.scenarioId !== HD_SCENARIO;
  const codes = (v: unknown) =>
    Array.isArray(v) && v.every((c) => typeof c === "string" && byCode.has(c));
  const marks = (v: unknown) =>
    Array.isArray(v) &&
    v.every((m) => typeof m?.id === "string" && Number.isInteger(m.round));
  const roundAmount = (v: unknown) =>
    v === null ||
    (typeof v === "object" &&
      Number.isInteger((v as { round: unknown }).round) &&
      Number.isInteger((v as { amount: unknown }).amount));
  const round = (v: unknown) => v === null || Number.isInteger(v);
  return (
    !!q &&
    s.scenarioId === HD_SCENARIO &&
    (q.mode === null || ["easy", "standard", "hard"].includes(q.mode)) &&
    [HD.search, HD.destroy].includes(q.currentQuest) &&
    Array.isArray(q.fleet) &&
    q.fleet.every(
      (f) => Number.isInteger(f.player) && HD_SHIPS.includes(f.code),
    ) &&
    new Set(q.fleet.map((f) => f.code)).size === q.fleet.length &&
    typeof q.fleetReady === "boolean" &&
    codes(q.corsairDeck) &&
    q.corsairDeck.every(isCorsairDeckCode) &&
    codes(q.corsairDiscard) &&
    q.corsairDiscard.every(isCorsairDeckCode) &&
    codes(q.setAside) &&
    codes(q.removed) &&
    roundAmount(q.questProgress) &&
    roundAmount(q.dreadDamage) &&
    typeof q.questActionUsed === "boolean" &&
    Array.isArray(q.boarding) &&
    q.boarding.every(
      (b) => typeof b.id === "string" && Number.isInteger(b.value),
    ) &&
    (q.ballista === null ||
      (Number.isInteger(q.ballista.round) &&
        Number.isInteger(q.ballista.count))) &&
    round(q.overworked) &&
    marks(q.ramming) &&
    marks(q.cove) &&
    round(q.hydraken) &&
    marks(q.ophidian) &&
    Array.isArray(q.threatReduced) &&
    q.threatReduced.every(
      (m) =>
        Number.isInteger(m.player) &&
        Number.isInteger(m.round) &&
        Number.isInteger(m.amount),
    ) &&
    Array.isArray(q.cancelled) &&
    q.cancelled.every(
      (m) => Number.isInteger(m.player) && Number.isInteger(m.round),
    ) &&
    Array.isArray(q.extraShadows) &&
    q.extraShadows.every(
      (m) => typeof m.id === "string" && Number.isInteger(m.count),
    ) &&
    Array.isArray(q.ranged) &&
    q.ranged.every((id) => typeof id === "string") &&
    Array.isArray(q.traits) &&
    q.traits.every(
      (m) =>
        typeof m.id === "string" &&
        Array.isArray(m.traits) &&
        m.traits.every((t) => typeof t === "string"),
    ) &&
    Array.isArray(q.eliminated) &&
    q.eliminated.every((p) => Number.isInteger(p)) &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    Array.isArray(q.capture) &&
    q.capture.every(unit)
  );
}
