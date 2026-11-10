import encounters from "../data/fortress-nurn-encounter-cards.json";
import quests from "../data/fortress-nurn-quest-cards.json";
import recipes from "../data/fortress-nurn-recipes.json";
import type { Card, GameState, Unit } from "./types";
import { TEMPLE_DOOM as T } from "./temple-doom-support";
import { DANGER_DORWINION as D } from "./danger-dorwinion-support";
export type { FortressNurnState } from "./fortress-nurn-types";

export const FORTRESS_NURN_ENCOUNTERS = encounters as Card[];
export const FORTRESS_NURN_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const FORTRESS_NURN_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
/** The four identical Storm the Castle fronts, each with a different reverse. */
export const NURN_STORMS = encounters
  .filter((c) => c.name === "Storm the Castle")
  .map((c) => c.code);
export const NURN_BACKS = NURN_STORMS.map((c) => `${c}:B`);
export const NURN = {
  first: code("Assault on Dol Rhugar"),
  last: code("The Final Confrontation"),
  ulchor: code("Thane Ulchor"),
  soldier: code("Soldier of Nurn"),
  mercenary: code("Easterling Mercenary"),
  olog: code("Mordor Olog-hai"),
  dogs: code("Guard Dogs"),
  walls: code("Fortress Walls"),
  tower: code("Guard Tower"),
  plaza: code("Plaza of Nurn"),
  defense: code("Determined Defense"),
  reach: code("The Dark Lord's Reach"),
  dungeons: code("The Dungeons of Dol Rhugar"),
  quarter: code("No Quarter"),
  stronghold: code("Stronghold of Mordor"),
  counterattack: code("Lethal Counterattack"),
  garrison: code("Castle Garrison"),
  guard: T.guard,
  rage: T.rage,
  fanaticism: T.fanaticism,
  khamul: T.khamul,
  barad: T.tower,
  eye: T.eye,
  armies: T.armies,
  darkness: T.darkness,
  street: D.street,
  catacombs: D.catacombs,
  underGuard: D.guard,
  unwelcome: D.unwelcome,
};
export const NURN_POWER = [
  NURN.khamul,
  NURN.barad,
  NURN.eye,
  NURN.armies,
  NURN.darkness,
];
export const QUEST_DECK = "quest-deck";
export const nurnPhase = (s: GameState) =>
  ["quest", "staging"].includes(s.phase)
    ? "quest"
    : ["attack", "defense"].includes(s.phase)
      ? "combat"
      : s.phase;
export const nurnPlayers = (s: GameState) =>
  s.table ? s.table.seats.filter((p) => !p.eliminated).length : 1;
const CASTLES = new Set([...NURN_STORMS, ...NURN_BACKS]);
/** Castle side quests: every Storm the Castle, faceup or turned to its reverse. */
export const nurnIsCastle = (u: Unit | string) =>
  CASTLES.has(typeof u === "string" ? u : u.code);
export const nurnIsStormFront = (u: Unit) => NURN_STORMS.includes(u.code);
export const nurnCastles = (s: GameState) =>
  s.staging.filter((u) => nurnIsCastle(u));
/** Castle side quests in the victory display. Only defeated reverses reach it. */
export const nurnCastleWins = (s: GameState) =>
  (s.victoryCards ?? []).filter((c) => nurnIsCastle(c)).length;
export const nurnX = (s: GameState) => 1 + nurnCastleWins(s);
export function nurnStageInfo(s: GameState) {
  const q = FORTRESS_NURN_QUESTS[s.stage - 1];
  if (!q || !s.fortressNurn) return undefined;
  const front = s.stageRevealing;
  return {
    name: q.name,
    cardCode: q.code,
    quest: front ? 0 : (q.back_quest ?? q.quest ?? 0),
    story: (front ? q.text : q.back_text) ?? "",
    questImage: front ? q.imagesrc : q.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
  };
}
export const fortressNurnUnits = (s: GameState): Unit[] => [
  ...(s.fortressNurn?.resolving ?? []),
  ...(s.fortressNurn?.under.flatMap((g) => g.cards) ?? []),
];
export function fortressNurnPublicState(s: GameState) {
  const q = s.fortressNurn;
  if (!q) return undefined;
  return {
    currentQuest: q.currentQuest,
    powerDeck: q.powerDeck.length,
    x: nurnX(s),
    castleWins: nurnCastleWins(s),
    castles: nurnCastles(s).map((u) => ({
      id: u.id,
      code: u.code,
      flipped: !nurnIsStormFront(u),
      progress: u.progress,
      power: q.powered.find((p) => p.questId === u.id)?.code ?? null,
      under: q.under
        .filter((g) => g.questId === u.id)
        .map((g) => ({ player: g.player, count: g.cards.length })),
    })),
    questDeck: q.under
      .filter((g) => g.questId === QUEST_DECK)
      .map((g) => ({ player: g.player, count: g.cards.length })),
    resolving: q.resolving.length,
  };
}
export function validateFortressNurn(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.fortressNurn;
  if (q === undefined) return s.scenarioId !== "the-fortress-of-nurn";
  const n = (x: unknown) => Number.isSafeInteger(x) && Number(x) >= 0;
  const round = (x: unknown) => n(x) && Number(x) <= s.round;
  const id = (x: unknown) => typeof x === "string" && x.length > 0;
  const seats = s.table?.seats.length ?? 1;
  const phase = (x: unknown) =>
    [
      "setup",
      "resource",
      "planning",
      "quest",
      "travel",
      "encounter",
      "combat",
      "refresh",
    ].includes(x as string);
  return (
    !!q &&
    s.scenarioId === "the-fortress-of-nurn" &&
    [1, 2].includes(s.stage) &&
    q.currentQuest === FORTRESS_NURN_QUESTS[s.stage - 1].code &&
    typeof q.initialized === "boolean" &&
    typeof q.advancing === "boolean" &&
    Array.isArray(q.powerDeck) &&
    q.powerDeck.every((c) => NURN_POWER.includes(c)) &&
    Array.isArray(q.powered) &&
    q.powered.every(
      (p) => !!p && id(p.questId) && NURN_POWER.includes(p.code),
    ) &&
    new Set(q.powered.map((p) => p.questId)).size === q.powered.length &&
    new Set([...q.powerDeck, ...q.powered.map((p) => p.code)]).size ===
      q.powerDeck.length + q.powered.length &&
    Array.isArray(q.under) &&
    q.under.every(
      (g) =>
        !!g &&
        id(g.questId) &&
        n(g.player) &&
        g.player < seats &&
        Array.isArray(g.cards) &&
        g.cards.every(unit),
    ) &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    Array.isArray(q.phaseThreat) &&
    q.phaseThreat.every(
      (m) => !!m && round(m.round) && phase(m.phase) && n(m.value),
    ) &&
    Array.isArray(q.noProgress) &&
    q.noProgress.every((m) => !!m && round(m.round) && phase(m.phase)) &&
    !!q.dungeons &&
    round(q.dungeons.round) &&
    n(q.dungeons.placed) &&
    Array.isArray(q.protected) &&
    q.protected.every((m) => !!m && id(m.id) && round(m.round)) &&
    !!q.reduced &&
    round(q.reduced.round) &&
    !!q.reduced.counts &&
    typeof q.reduced.counts === "object" &&
    Object.entries(q.reduced.counts).every(
      ([p, v]) => /^\d+$/.test(p) && Number(p) < seats && n(v),
    )
  );
}
