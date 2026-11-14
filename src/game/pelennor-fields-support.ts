// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/pelennor-fields-encounter-cards.json";
import quests from "../data/pelennor-fields-quest-cards.json";
import boons from "../data/pelennor-fields-boon-cards.json";
import recipes from "../data/pelennor-fields-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { PelennorFieldsState } from "./pelennor-fields-types";

export const PELENNOR_FIELDS_ENCOUNTERS = encounters as Card[];
export const PELENNOR_FIELDS_BOONS = boons as Card[];
export const PELENNOR_FIELDS_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const PELENNOR_FIELDS_RECIPES = recipes;
export const PELENNOR_FIELDS_SCENARIO = "the-battle-of-the-pelennor-fields";
const printed = [...encounters, ...quests, ...boons] as Card[];
const code = (name: string) => printed.find((c) => c.name === name)!.code;
export const PF = {
  garrison: code("The Garrison of Gondor"),
  retreat: code("Retreat from Osgiliath"),
  besieged: code("The White City Besieged"),
  rohan: code("Rohan has Come!"),
  fields: code("Fighting in the Fields"),
  rules: printed.find(
    (c) =>
      c.name === "The Battle of the Pelennor Fields" && c.type_code === "rules",
  )!.code,
  minasTirith: code("Minas Tirith"),
  grond: code("Grond"),
  witchKing: code("The Witch-king"),
  wraith: code("Wraith on Wings"),
  esquireRohan: code("Esquire of Rohan"),
  esquireGondor: code("Esquire of Gondor"),
  gate: code("Gate of Gondor"),
  field: code("Pelennor Field"),
  wall: code("City Wall"),
  tower: code("Siege Tower"),
  trench: code("Fire-filled Trench"),
  champion: code("Southron Champion"),
  eye: code("Orc of the Eye"),
  serpent: code("The Black Serpent"),
  mumak: code("War Mûmak"),
  captain: code("Morgul Captain"),
  orc: code("Mordor Orc"),
  despair: code("Dread and Despair"),
  ruin: code("Spells of Ruin"),
  beast: code("Fell Beast"),
  shadow: code("Shadow of Mordor"),
  dart: code("Black Dart"),
  rammas: code("The Rammas is Breached"),
} as const;
export const PF_STAGES = [
  PF.garrison,
  PF.retreat,
  PF.besieged,
  PF.rohan,
  PF.fields,
] as const;
/** Minas Tirith: 30 hit points plus 10 for each player. */
export const pfMinasTirithHealth = (players: number) => 30 + 10 * players;
/** Wraith on Wings: limit 5 resources. */
export const PF_WRAITH_LIMIT = 5;
/** The White City Besieged: +4 quest points for each player in the game. */
export const PF_BESIEGED_PER_PLAYER = 4;
/** City Wall: +3 threat for each player as it is discarded. */
export const PF_WALL_THREAT = 3;
/** War Mûmak: no more than 3 damage each round; defeated, -4 threat each. */
export const PF_MUMAK_CAP = 3;
export const PF_MUMAK_THREAT = 4;
/** Rohan has Come!: each player searches the top 10 cards of his deck. */
export const PF_ROHAN_SEARCH = 10;
const quest = (c: string) => PELENNOR_FIELDS_QUESTS.find((q) => q.code === c);
/** The players still in the game: "for each player" counts them. */
const living = (s: GameState) =>
  s.table ? s.table.seats.filter((seat) => !seat.eliminated).length : 1;
const printedCodes = new Set(printed.map((c) => c.code));
/** The card registry is injected by the scenario module (no import cycle with cards.ts). */
let lookup: ((code: string) => Card) | undefined;
export function setPelennorCardLookup(fn: (code: string) => Card) {
  lookup = fn;
}
/** The allies the players own in the staging area (stage 2): the only player cards there. */
export const pfStagingAllies = (s: GameState) =>
  s.staging.filter(
    (u) =>
      !printedCodes.has(u.code) &&
      (lookup ? lookup(u.code).type_code === "ally" : true),
  );
export const pfMinasTirith = (s: GameState) =>
  s.staging.find((u) => u.code === PF.minasTirith);
/** X at stage 2B: the total cost of all allies in the staging area. */
export const pfRetreatX = (s: GameState) =>
  pfStagingAllies(s).reduce(
    (n, u) => n + (Number(lookup?.(u.code).cost) || 0),
    0,
  );

export function pelennorFieldsStageInfo(s: GameState) {
  const q = s.pelennorFields;
  const c = quest(q?.currentQuest ?? "");
  if (!c || !q) return undefined;
  const front = s.stageRevealing;
  const points =
    c.code === PF.retreat
      ? pfRetreatX(s)
      : c.code === PF.besieged
        ? (c.back_quest ?? 0) + PF_BESIEGED_PER_PLAYER * living(s)
        : (c.back_quest ?? 0);
  return {
    name: front ? c.name : (c.back_name ?? c.name),
    cardCode: c.code,
    quest: front ? 0 : points,
    story: (front ? c.text : c.back_text) || (c.back_text ?? ""),
    questImage: front ? c.imagesrc : c.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
    questNumber: Number(c.cost),
  };
}
/** Units the scenario holds outside the ordinary zones. */
export const pelennorFieldsUnits = (s: GameState): Unit[] =>
  s.pelennorFields?.resolving ?? [];
/** The scenario's public state, for the panel and the browser checks. */
export function pelennorFieldsPublicState(s: GameState) {
  const q = s.pelennorFields;
  if (!q) return undefined;
  const mt = pfMinasTirith(s);
  const engaged = [
    ...(s.engaged ?? []),
    ...(s.table?.seats.flatMap((seat) => seat.engaged ?? []) ?? []),
  ];
  const witch = [...s.staging, ...engaged].find((u) => u.code === PF.witchKing);
  return {
    currentQuest: q.currentQuest,
    stage: s.stage,
    minasTirith: mt
      ? { damage: mt.damage, health: pfMinasTirithHealth(living(s)) }
      : null,
    grond: s.staging.find((u) => u.code === PF.grond)?.resources ?? null,
    witchKing: witch ? (witch.flipped ? "sorcerer" : "captain") : null,
    witchKingVictory: (s.victoryCards ?? []).includes(PF.witchKing),
    wraiths: [...s.staging, ...engaged].filter((u) => u.code === PF.wraith)
      .length,
    allies: pfStagingAllies(s).length,
    despair: q.despair?.round === s.round ? q.despair.amount : 0,
    setAside: q.setAside.length,
    resolving: q.resolving.length,
  };
}
const integer = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n);
const natural = (n: unknown) => integer(n) && n >= 0;
const codes = (v: unknown) =>
  Array.isArray(v) && v.every((c) => typeof c === "string");
export function validatePelennorFields(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.pelennorFields;
  if (q === undefined) return s.scenarioId !== PELENNOR_FIELDS_SCENARIO;
  return (
    !!q &&
    s.scenarioId === PELENNOR_FIELDS_SCENARIO &&
    (PF_STAGES as readonly string[]).includes(q.currentQuest) &&
    s.stage === (PF_STAGES as readonly string[]).indexOf(q.currentQuest) + 1 &&
    typeof q.advancing === "boolean" &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    codes(q.setAside) &&
    (q.despair === undefined ||
      (!!q.despair &&
        natural(q.despair.round) &&
        typeof q.despair.phase === "string" &&
        natural(q.despair.amount))) &&
    (q.shadowed === undefined ||
      (!!q.shadowed && natural(q.shadowed.round) && codes(q.shadowed.ids))) &&
    (q.mumak === undefined ||
      (!!q.mumak &&
        natural(q.mumak.round) &&
        !!q.mumak.damage &&
        typeof q.mumak.damage === "object" &&
        Object.values(q.mumak.damage).every(natural))) &&
    (q.searched === undefined || codes(q.searched))
  );
}
