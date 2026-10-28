import type { GameState, Effect, Unit } from "./types";
import { name } from "./cards";
import { cannotReady, choose, fx, get, prepend, skip } from "./core";
import { damage, exhaustCharacter, readyCharacter } from "./board";
import { activeSeat, allHeroes, ownerOf, playerOrder, seatView } from "./table";
import { RIVER_RUNNING as R } from "./river-running-support";
const live = (s: GameState, code: string) =>
  s.staging.filter((u) => u.code === code && !u.blanked);
const heroes = (s: GameState, p: number) =>
  allHeroes(s).filter((u) => ownerOf(s, u) === p);
const ready = (s: GameState, p: number) =>
  [...seatView(s, p).heroes, ...seatView(s, p).allies].filter(
    (u) => !u.exhausted,
  );
export function plainsCannotReady(s: GameState, u: Unit) {
  return (
    s.phase === "refresh" &&
    live(s, R.arduous).length > 0 &&
    u.exhausted &&
    !(s.refreshReadied?.[ownerOf(s, u)] ?? []).includes(u.id) &&
    (s.refreshReadied?.[ownerOf(s, u)]?.length ?? 0) >= 6
  );
}
export const plainsRefreshCharacters = (s: GameState, player: number) =>
  live(s, R.arduous).length
    ? [fx("plainsRefresh", { player, ids: [] })]
    : undefined;
export function plainsSideDefeated(s: GameState, u: Unit) {
  if (u.code === R.arduous && !u.blanked)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("plainsArduousReady", { player })),
    );
}
export function plainsEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("plains")) return false;
  const player = e.player ?? activeSeat(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "plainsFatigue":
      choose(
        s,
        "Painful Fatigue · Exhaust a character and deal 1 damage to it",
        [...seatView(s, player).heroes, ...seatView(s, player).allies].map(
          (u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: [fx("plainsFatiguePay", { target: u.id, player })],
          }),
        ),
      );
      break;
    case "plainsFatiguePay":
      if (u) {
        exhaustCharacter(s, u);
        damage(s, u.id, 1);
      }
      break;
    case "plainsFatigueShadow":
      choose(
        s,
        "Painful Fatigue · Exhaust a character or return the attacker after this attack",
        [
          ...ready(s, player).map((u) => ({
            id: u.id,
            code: u.code,
            label: `Exhaust ${name(u)}`,
            effects: [fx("exhaust", { target: u.id, player })],
          })),
          {
            id: "return",
            label: "Return the attacking enemy to staging after this attack",
            effects: [fx("plainsReturnAfterAttack", { player })],
          },
        ],
      );
      break;
    case "plainsReturnAfterAttack":
      if (s.combat) s.combat.returnToStaging = true;
      break;
    case "plainsRefresh": {
      const considered = e.ids ?? [],
        candidates = [
          ...seatView(s, player).heroes,
          ...seatView(s, player).allies,
        ].filter(
          (u) =>
            u.exhausted && !considered.includes(u.id) && !cannotReady(u, s),
        );
      const remaining = 6 - (s.refreshReadied?.[player]?.length ?? 0);
      if (!candidates.length || remaining <= 0) break;
      const effect = (u: Unit) => [
        fx(
          u.attachments.some((a) => a.code === "01080" && !a.blanked)
            ? "plainsWebRefresh"
            : "plainsFrameworkReady",
          { target: u.id, player },
        ),
        fx("plainsRefresh", { player, ids: [...considered, u.id] }),
      ];
      if (candidates.length <= remaining) prepend(s, ...effect(candidates[0]));
      else
        choose(
          s,
          `An Arduous Journey · Choose a character to ready (${remaining} remaining)`,
          candidates.map((u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: effect(u),
          })),
        );
      break;
    }
    case "plainsFrameworkReady":
      if (u) readyCharacter(s, u, false);
      break;
    case "plainsWebRefresh": {
      const cost =
        (u?.attachments.filter((a) => a.code === "01080" && !a.blanked)
          .length ?? 0) * 2;
      if (u && u.exhausted && cost && u.resources >= cost && !cannotReady(u, s))
        choose(s, `Free ${name(u)} from the web?`, [
          {
            id: "pay",
            label: `Pay ${cost} resources to ready`,
            effects: [
              fx("resource", {
                target: u.id,
                value: -cost,
                flag: true,
                player,
              }),
              fx("plainsFrameworkReady", { target: u.id, player }),
            ],
          },
          skip,
        ]);
      break;
    }
    case "plainsArduousReady":
      choose(s, "An Arduous Journey · You may ready a hero", [
        ...heroes(s, player)
          .filter((u) => u.exhausted && !cannotReady(u, s))
          .map((u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: [fx("plainsFrameworkReady", { target: u.id, player })],
          })),
        skip,
      ]);
      break;
    default:
      return false;
  }
  return true;
}
