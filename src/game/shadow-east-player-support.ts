import definitions from "../data/shadow-east-player-cards.json";
import type { Attachment, Card, GameState, Unit } from "./types";
import { card } from "./cards";
import {
  allCharacters,
  globalCharacters,
  globalEngaged,
  ownerOf,
  seatIndices,
  seatView,
} from "./table";
import { engagementCost } from "./core";
import { stormcallerEffectiveThreat } from "./threat-read";

export const SHADOW_EAST_PLAYER_CARDS = definitions as Card[];
export const SHADOW_EAST_PLAYER_CODES = definitions.map((c) => c.code);
export const SHADOW_EAST_PLAYER = {
  ring: "21001",
  frodo: "21002",
  merry: "21003",
  pippin: "21004",
  faramir: "21005",
  derufin: "21006",
  gathering: "21007",
  pursuit: "21008",
  master: "21009",
  ruling: "21010",
  power: "21011",
  stinker: "21071",
  smeagol: "21072",
  gollum: "21072.B",
  fellowship: "21074",
} as const;
export const SHADOW_EAST_PREFIX = "shadow-east:";
const P = SHADOW_EAST_PLAYER;
export const shadowEastMarks = (s: GameState) =>
  seatIndices(s).flatMap((p) => seatView(s, p).used);
export const shadowEastRing = (s: GameState) => {
  for (const host of globalCharacters(s)) {
    const attachment = host.attachments.find((a) => a.code === P.ring);
    if (attachment) return { host, attachment, player: ownerOf(s, host) };
  }
  return undefined;
};
export const shadowEastContract = (s: GameState, player: number) =>
  s.shadowEastPlayers?.contracts.find((c) => c.player === player);
export const shadowEastGollum = (s: GameState) =>
  [...globalEngaged(s), ...s.staging].find((u) => u.code === P.gollum);
export const shadowEastIsMaster = (code?: string) =>
  !!code && /(?:^|\.)\s*Master\s*\./.test(card(code).traits ?? "");
export const shadowEastPlayerCanHaveAttachments = (u: Unit) =>
  u.code !== P.smeagol || !!u.blanked;
export const shadowEastAttachmentImmune = (
  a: Attachment,
  sourceCode?: string,
) => a.code === P.ring && !a.blanked && !shadowEastIsMaster(sourceCode);
export const shadowEastPlayerImmune = (
  _s: GameState,
  u: Unit,
  sourceCode?: string,
) =>
  u.code === P.gollum &&
  !u.blanked &&
  (!sourceCode ||
    !/(?:^|\.)\s*Gollum\s*\./.test(card(sourceCode).traits ?? ""));
export const shadowEastPlayerThreatPenalty = (s: GameState, player: number) =>
  shadowEastRing(s)?.player === player ? 5 : 0;
export function shadowEastPlayerAllyProblem(
  s: GameState,
  code: string,
): string | null {
  const c = card(code),
    contract = shadowEastContract(s, s.table?.active ?? 0);
  if (c.type_code !== "ally" || !contract) return null;
  if (contract.side === "B")
    return "Fellowship's completed company cannot play allies or put allies into play.";
  return c.is_unique
    ? null
    : "Fellowship permits only unique allies to enter play.";
}
export function shadowEastPlayerStats(s: GameState, u: Unit) {
  const r = { will: 0, attack: 0, defense: 0, health: 0 };
  const marks = shadowEastMarks(s);
  r.will += marks.filter((k) =>
    k.startsWith(`round:${SHADOW_EAST_PREFIX}merry:${u.id}:`),
  ).length;
  const powers = marks.filter((k) =>
    k.startsWith(`phase:${SHADOW_EAST_PREFIX}power:${u.id}:`),
  ).length;
  r.will += powers;
  r.attack += powers;
  r.defense += powers;
  if (
    allCharacters(s).some((c) => c.id === u.id) &&
    shadowEastContract(s, ownerOf(s, u))?.side === "B"
  ) {
    r.will++;
    r.attack++;
    r.defense++;
  }
  return r;
}
export function shadowEastPlayerAttackBonus(
  s: GameState,
  u: Unit,
  enemy: Unit,
) {
  return u.code === P.pippin &&
    !u.blanked &&
    engagementCost(s, enemy) > stormcallerEffectiveThreat(s, ownerOf(s, u))
    ? 2
    : 0;
}
export function shadowEastPlayerCostReduction(s: GameState, c: Card) {
  if (c.type_code !== "ally") return 0;
  return s.used
    .filter((k) => k.startsWith(`phase:${SHADOW_EAST_PREFIX}gathering:`))
    .reduce((n, k) => n + Number(k.split(":").at(-1)), 0);
}
export const shadowEastPlayerPreventAttack = (
  s: GameState,
  enemy: Unit,
  player: number,
) =>
  seatView(s, player).used.includes(
    `phase:${SHADOW_EAST_PREFIX}ruling:${enemy.id}`,
  );
export const shadowEastPlayerLocationQuestBonus = (_s: GameState, u: Unit) =>
  u.attachments.filter((a) => a.code === P.pursuit && !a.blanked && !a.facedown)
    .length * 2;
export const shadowEastPlayerUnits = (s: GameState) => [
  ...(s.shadowEastPlayers?.contracts.map((c) => c.unit) ?? []),
  ...(s.shadowEastPlayers?.pendingRings.map((c) => c.unit) ?? []),
];
export function shadowEastPlayerPublicState(s: GameState) {
  const state = s.shadowEastPlayers;
  if (!state) return undefined;
  const ring = shadowEastRing(s);
  return {
    contracts: state.contracts.map((c) => ({
      player: c.player,
      id: c.unit.id,
      code: c.unit.code,
      side: c.side,
    })),
    pendingRings: state.pendingRings.length,
    ...(ring
      ? {
          ring: {
            player: ring.player,
            id: ring.attachment.id,
            heroId: ring.host.id,
            ready: !ring.attachment.exhausted,
          },
        }
      : {}),
    ...(state.smeagol
      ? {
          smeagol: {
            id: state.smeagol.id,
            owner: state.smeagol.owner,
            side: shadowEastGollum(s) ? "B" : "A",
            inPlay:
              !!shadowEastGollum(s) ||
              globalCharacters(s).some((u) => u.id === state.smeagol!.id),
          },
        }
      : {}),
  };
}

/** Reject malformed physical setup state without requiring a living Sméagol. */
export function validateShadowEastPlayers(
  s: GameState,
  validUnit: (unit: unknown) => boolean,
): boolean {
  const q = s.shadowEastPlayers;
  if (q === undefined) return true;
  if (
    !q ||
    typeof q !== "object" ||
    !Array.isArray(q.contracts) ||
    !Array.isArray(q.pendingRings)
  )
    return false;
  const seats = seatIndices(s);
  const player = (n: unknown) =>
    typeof n === "number" && Number.isInteger(n) && seats.includes(n);
  const id = (v: unknown) => typeof v === "string" && v.length > 0;
  if (q.contracts.length > seats.length || q.pendingRings.length > seats.length)
    return false;
  if (
    !q.contracts.every(
      (c) =>
        c &&
        typeof c === "object" &&
        player(c.player) &&
        (c.side === "A" || c.side === "B") &&
        validUnit(c.unit) &&
        c.unit.code === P.fellowship,
    )
  )
    return false;
  if (new Set(q.contracts.map((c) => c.player)).size !== q.contracts.length)
    return false;
  if (
    !q.pendingRings.every(
      (r) =>
        r &&
        typeof r === "object" &&
        player(r.player) &&
        validUnit(r.unit) &&
        r.unit.code === P.ring,
    )
  )
    return false;
  if (
    new Set(q.pendingRings.map((r) => r.player)).size !== q.pendingRings.length
  )
    return false;
  const ids = [
    ...q.contracts.map((c) => c.unit.id),
    ...q.pendingRings.map((r) => r.unit.id),
  ];
  if (new Set(ids).size !== ids.length) return false;
  if (q.ring !== undefined) {
    const r = q.ring;
    if (
      !r ||
      typeof r !== "object" ||
      !player(r.player) ||
      !id(r.id) ||
      !id(r.heroId) ||
      ids.includes(r.id)
    )
      return false;
    const physical = shadowEastRing(s);
    if (
      s.status === "playing" &&
      (!physical ||
        physical.attachment.id !== r.id ||
        physical.host.id !== r.heroId ||
        physical.player !== r.player)
    )
      return false;
  }
  if (
    q.setupHandIds !== undefined &&
    (!q.setupHandIds ||
      typeof q.setupHandIds !== "object" ||
      Array.isArray(q.setupHandIds) ||
      Object.entries(q.setupHandIds).some(
        ([p, ids]) =>
          !player(Number(p)) ||
          !Array.isArray(ids) ||
          !ids.every(id) ||
          new Set(ids).size !== ids.length,
      ))
  )
    return false;
  if (q.smeagol !== undefined) {
    const u = q.smeagol;
    if (
      !u ||
      typeof u !== "object" ||
      !player(u.owner) ||
      !id(u.id) ||
      typeof u.stinkersAdded !== "boolean"
    )
      return false;
    const living = [
      ...globalCharacters(s),
      ...globalEngaged(s),
      ...s.staging,
    ].find((c) => c.id === u.id);
    if (
      living &&
      ![P.smeagol, P.gollum].includes(living.code as typeof P.smeagol)
    )
      return false;
  }
  return true;
}

export const shadowEastPlayerMissingHeroAllowed = (
  s: GameState,
  player: number,
) => {
  const info = s.shadowEastPlayers?.smeagol;
  return !!info && info.owner === player && shadowEastGollum(s)?.id === info.id;
};
