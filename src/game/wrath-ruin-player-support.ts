import definitions from "../data/wrath-ruin-player-cards.json";
import type { Card, GameState, Unit } from "./types";
import { playerEffectImmune } from "./player-effect-immunity";
import { seatIndices } from "./table";

export const WRATH_RUIN_PLAYER_CARDS = definitions as Card[];
export const WRATH_RUIN_PLAYER_CODES = definitions.map((c) => c.code);
export const WRATH_RUIN_PLAYER = {
  thorin: "22001",
  soldier: "22002",
  pillars: "22003",
  halfling: "22004",
  bombadillo: "22005",
  axe: "22006",
  charge: "22007",
  circlet: "22008",
  strength: "22009",
  tom: "22010",
  burglar: "22024",
} as const;

export const wrathBombadilReserve = (
  s: GameState,
  player = s.table?.active ?? 0,
) => s.wrathBombadilReserves?.[player] ?? 0;
export const wrathRuinPlayerUnits = (_s: GameState): Unit[] => [];

export function wrathRuinPlayerStats(s: GameState, u: Unit) {
  const r = { will: 0, attack: 0, defense: 0, health: 0 };
  for (const a of u.attachments.filter((a) => !a.blanked && !a.facedown)) {
    if (playerEffectImmune(s, u, a.code)) continue;
    if (a.code === WRATH_RUIN_PLAYER.axe) r.attack += 2;
    if (a.code === WRATH_RUIN_PLAYER.strength) r.defense++;
  }
  return r;
}

export function wrathRuinPlayerPublicState(s: GameState) {
  const q = s.wrathRuinPlayers;
  if (!q && !Object.values(s.wrathBombadilReserves ?? {}).some((n) => n > 0))
    return undefined;
  return {
    reserves: seatIndices(s).map((player) => ({
      player,
      count: wrathBombadilReserve(s, player),
    })),
    departingTomIds: q?.tomDelays.map((d) => d.id) ?? [],
  };
}

export function validateWrathRuinPlayers(s: GameState): boolean {
  const q = s.wrathRuinPlayers;
  if (q === undefined) return true;
  const players = seatIndices(s),
    player = (v: unknown) =>
      Number.isInteger(v) && players.includes(v as number),
    id = (v: unknown) => typeof v === "string" && v.length > 0;
  return (
    !!q &&
    typeof q === "object" &&
    Array.isArray(q.tomDelays) &&
    Array.isArray(q.bombadilloOwners) &&
    q.tomDelays.every((d) => !!d && id(d.id) && player(d.player)) &&
    q.bombadilloOwners.every((d) => !!d && id(d.id) && player(d.owner)) &&
    new Set(q.tomDelays.map((d) => d.id)).size === q.tomDelays.length &&
    new Set(q.bombadilloOwners.map((d) => d.id)).size ===
      q.bombadilloOwners.length
  );
}
