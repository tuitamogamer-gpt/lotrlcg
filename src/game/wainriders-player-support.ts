import type { Card, GameState, Unit } from "./types";
import { card, plain, SCRIPTED } from "./cards";
import { activeSeat, allHeroes, ownerOf, seatIndices, seatView } from "./table";
import { isSacked } from "./carrock";
export const WAINRIDERS_PLAYER = {
  saruman: "22054",
  command: "22055",
  horns: "22056",
  soldier: "22057",
  sighted: "22058",
  nori: "22059",
  belt: "22060",
  scout: "22061",
  muster: "22062",
  staff: "22063",
  wanderer: "22074",
} as const;
export const wainPrintedDoomed = (code: string) =>
  /(?:^|[.\n]\s*)Doomed\s+(\d+|X)\b/i.exec(plain(card(code).text))?.[1];
export const wandererContract = (s: GameState, p = activeSeat(s)) =>
  s.wainridersPlayers?.contracts.find((c) => c.player === p);
export const wandererHero = (s: GameState, p = activeSeat(s)) => {
  const c = wandererContract(s, p);
  return c
    ? (allHeroes(s).find((h) => h.id === c.hero) ??
        allHeroes(s).find(
          (h) => h.code === c.heroCode && (h.owner ?? ownerOf(s, h)) === p,
        ))
    : undefined;
};
export const wandererNoMatch = (s: GameState, c: Card) =>
  s.phase === "planning" &&
  !c.is_unique &&
  wandererContract(s)?.side === "B" &&
  !s.used.includes("phase:wain-wanderer");
export const sarumanPays = (h: Unit, c: Card) =>
  h.code === WAINRIDERS_PLAYER.saruman &&
  !h.blanked &&
  !isSacked(h) &&
  c.type_code === "event" &&
  !!wainPrintedDoomed(c.code) &&
  ["leadership", "spirit", "tactics"].includes(c.sphere_code);
export const sarumanThreatReduction = (
  s: GameState,
  n: number,
  reason: string,
) =>
  reason === "player-card" &&
  s.heroes.some(
    (h) => h.code === WAINRIDERS_PLAYER.saruman && !h.blanked && !isSacked(h),
  )
    ? Math.min(n, 1)
    : n;
export const wainridersNoEngagement = (s: GameState, u: Unit, player: number) =>
  s.wainridersPlayers?.scout.some(
    (x) => x.enemy === u.id && x.player === player && x.round === s.round,
  ) ?? false;
export function wainridersPlayerCardPlayed(s: GameState, c: Card) {
  if (wandererNoMatch(s, c)) s.used.push("phase:wain-wanderer");
}
export function wainridersDoomedAmount(
  s: GameState,
  u: Unit,
  n: number,
  played: boolean,
) {
  if (
    played &&
    card(u.code).type_code === "event" &&
    wainPrintedDoomed(u.code)
  ) {
    const uses = s.used.filter((k) => k === "phase:wain-staff").length;
    s.used = s.used.filter((k) => k !== "phase:wain-staff");
    return Math.max(0, n - uses * 2);
  }
  return n;
}
export function validateWainridersPlayers(
  s: GameState,
  validUnit: (v: unknown) => boolean,
) {
  const q = s.wainridersPlayers;
  if (q === undefined) return true;
  const ps = seatIndices(s),
    id = (v: unknown) => typeof v === "string" && !!v;
  return (
    !!q &&
    Array.isArray(q.contracts) &&
    Array.isArray(q.horns) &&
    Array.isArray(q.scout) &&
    q.contracts.every(
      (c) =>
        !!c &&
        ps.includes(c.player) &&
        validUnit(c.unit) &&
        c.unit.code === WAINRIDERS_PLAYER.wanderer &&
        (c.unit.owner ?? c.player) === c.player &&
        ["A", "B"].includes(c.side) &&
        id(c.hero) &&
        id(c.heroCode) &&
        SCRIPTED.has(c.heroCode) &&
        card(c.heroCode).type_code === "hero",
    ) &&
    new Set(q.contracts.map((c) => c.player)).size === q.contracts.length &&
    q.horns.every(id) &&
    new Set(q.horns).size === q.horns.length &&
    q.scout.every(
      (x) =>
        !!x &&
        ps.includes(x.player) &&
        id(x.enemy) &&
        Number.isSafeInteger(x.round) &&
        x.round >= 0 &&
        x.round <= s.round,
    )
  );
}
export const wainridersPlayerPublic = (s: GameState) =>
  s.wainridersPlayers?.contracts.map((c) => ({
    player: c.player,
    code: c.unit.code,
    id: c.unit.id,
    side: c.side,
    exhausted: c.unit.exhausted,
    hero: c.hero,
  }));
export function wandererDeckProblems(
  heroes: string[],
  cards: Record<string, number>,
) {
  return cards[WAINRIDERS_PLAYER.wanderer] && heroes.length > 1
    ? ["The Grey Wanderer cannot choose more than one starting hero."]
    : [];
}
export const wainStaffDiscounts = (s: GameState, p = activeSeat(s)) =>
  seatView(s, p).used.filter((k) => k === "phase:wain-staff").length;
