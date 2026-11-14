// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/passage-marshes-encounter-cards.json";
import quests from "../data/passage-marshes-quest-cards.json";
import recipes from "../data/passage-marshes-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { PassageMarshesState } from "./passage-marshes-types";

export const PASSAGE_MARSHES_ENCOUNTERS = encounters as Card[];
export const PASSAGE_MARSHES_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const PASSAGE_MARSHES_RECIPES = recipes;
export const PASSAGE_MARSHES_SCENARIO = "the-passage-of-the-marshes";
const printed = [...encounters, ...quests] as Card[];
const code = (name: string) =>
  printed.find((c) => c.name === name && !c.code.endsWith(":B"))!.code;
export const POM = {
  taming: code("The Taming of Sméagol"),
  across: code("Across the Marshes"),
  lights: code('"Don\'t Look at the Lights!"'),
  gollum: code("Gollum"),
  smeagol: `${code("Gollum")}:B`,
  groping: code("Groping Dead"),
  deadThings: code("Dead Things"),
  candle: code("Candle-bearer"),
  wraith: code("Morgul Wraith"),
  mere: code("Haunted Mere"),
  softMires: code("Soft Mires"),
  pools: code("Stagnant Pools"),
  quagmire: code("Shifting Quagmire"),
  fens: code("Evil-smelling Fens"),
  creeping: code("Creeping Marshes"),
  reek: code("Bitter Reek"),
  fellLight: code("A Fell Light"),
  hates: code("We Hates Them!"),
  call: code("Call of the Ring"),
} as const;
/** Across the Marshes: locations needed in the victory display to advance. */
export const POM_VICTORY_LOCATIONS = 4;
/** "Mire X": the location is discarded once it has X mire tokens. */
export function mireValue(c: string): number {
  const m = /(?:^|[.\n]\s*)Mire (\d+)/.exec(
    (printed.find((x) => x.code === c)?.text ?? "").replace(/<[^>]*>/g, ""),
  );
  return m ? Number(m[1]) : 0;
}
const quest = (c: string) => PASSAGE_MARSHES_QUESTS.find((q) => q.code === c);

export function passageMarshesStageInfo(s: GameState) {
  const q = s.passageMarshes;
  const c = quest(q?.currentQuest ?? "");
  if (!c || !q) return undefined;
  const front = s.stageRevealing;
  return {
    name: front ? c.name : (c.back_name ?? c.name),
    cardCode: c.code,
    quest: front ? 0 : (c.back_quest ?? 0),
    story: (front ? c.text : c.back_text) || (c.back_text ?? ""),
    questImage: front ? c.imagesrc : c.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
    questNumber: Number(c.cost),
  };
}
/** Units the scenario holds outside the ordinary zones. */
export const passageMarshesUnits = (s: GameState): Unit[] =>
  s.passageMarshes?.resolving ?? [];
const locationCode = (c: string) =>
  (printed.find((x) => x.code === c)?.type_code ?? "") === "location";
export function passageMarshesPublicState(s: GameState) {
  const q = s.passageMarshes;
  if (!q) return undefined;
  // Each seat's zones; the active seat's live on the state itself.
  const seats = s.table
    ? s.table.seats.map((seat, i) =>
        i === s.table!.active ? s : (seat as unknown as GameState),
      )
    : [s];
  const smeagol = seats
    .flatMap((x) => x.allies ?? [])
    .find((u) => u.code === POM.smeagol);
  const gollum = [...seats.flatMap((x) => x.engaged ?? []), ...s.staging].find(
    (u) => u.code === POM.gollum,
  );
  return {
    currentQuest: q.currentQuest,
    side: smeagol ? ("smeagol" as const) : gollum ? ("gollum" as const) : null,
    smeagolExhausted: smeagol?.exhausted ?? false,
    victoryLocations: (s.victoryCards ?? []).filter(locationCode).length,
    mire: s.staging
      .filter((u) => mireValue(u.code) > 0)
      .map((u) => ({ id: u.id, code: u.code, tokens: u.resources })),
    resolving: q.resolving.length,
  };
}
const integer = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n);
const natural = (n: unknown) => integer(n) && n >= 0;
export function validatePassageMarshes(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.passageMarshes;
  if (q === undefined) return s.scenarioId !== PASSAGE_MARSHES_SCENARIO;
  const codes = PASSAGE_MARSHES_QUESTS.map((c) => c.code);
  return (
    !!q &&
    s.scenarioId === PASSAGE_MARSHES_SCENARIO &&
    [1, 2, 3].includes(s.stage) &&
    codes.includes(q.currentQuest) &&
    typeof q.advancing === "boolean" &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    (q.gollumDefense === undefined ||
      (!!q.gollumDefense &&
        typeof q.gollumDefense.id === "string" &&
        natural(q.gollumDefense.value))) &&
    (q.failedRound === undefined || natural(q.failedRound))
  );
}
