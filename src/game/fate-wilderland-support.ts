import encounters from "../data/fate-wilderland-encounter-cards.json";
import quests from "../data/fate-wilderland-quest-cards.json";
import recipes from "../data/fate-wilderland-recipes.json";
import { WILDS_RHOVANION } from "./wilds-rhovanion-support";
import { ROAM_RHOVANION } from "./roam-rhovanion-support";
import type { Card, GameState, Unit } from "./types";
export type { FateWilderlandState } from "./fate-wilderland-types";

export const FATE_WILDERLAND_ENCOUNTERS = encounters as Card[];
export const FATE_WILDERLAND_QUESTS = quests as Card[];
export const FATE_WILDERLAND_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const FATE_WILDERLAND = {
  first: code("Urdug's Assault"),
  second: code("Outflanked"),
  third: code("The Final Push"),
  defense: code("The Heroes' Defense"),
  assault: code("The Goblins' Assault"),
  urdug: code("Urdug"),
  elite: code("Urdug's Elite"),
  vanguard: code("Fierce Vanguard"),
  rider: code("Warg-rider"),
  gate: code("Gate of Gundabad"),
  battlements: code("Hilltop Battlements"),
  watchtower: code("Dwarven Watchtower"),
  slopes: code("Slopes of Gundabad"),
  fierce: code("Fierce Attack"),
  command: code("Urdug's Command"),
  clouds: code("Dark Clouds"),
  troop: WILDS_RHOVANION.troop,
  stray: WILDS_RHOVANION.stray,
  gloom: WILDS_RHOVANION.gloom,
  bats: WILDS_RHOVANION.swarm,
  wargs: ROAM_RHOVANION.wargs,
  hills: ROAM_RHOVANION.hills,
  lonely: ROAM_RHOVANION.lonely,
};
export const fateWilderlandPhase = (s: GameState) =>
  ["quest", "staging"].includes(s.phase)
    ? "quest"
    : ["defense", "attack"].includes(s.phase)
      ? "combat"
      : s.phase;
/** Elimination reduces the players in the game (RR, Player Elimination). */
export const fateWilderlandPlayers = (s: GameState) =>
  s.table ? s.table.seats.filter((p) => !p.eliminated).length : 1;
export function fateWilderlandStageInfo(s: GameState) {
  const q = FATE_WILDERLAND_QUESTS.find(
    (c) => c.code === s.fateWilderland?.currentQuest,
  );
  return q
    ? {
        name: q.back_name ?? q.name,
        cardCode: q.code,
        quest: 0,
        story: q.back_text ?? "",
        questImage: q.back_imagesrc ?? q.imagesrc,
      }
    : undefined;
}
export const fateWilderlandUnits = (s: GameState): Unit[] =>
  s.fateWilderland?.storedCards.flatMap((g) => g.cards) ?? [];
export function fateWilderlandPublicState(s: GameState) {
  const q = s.fateWilderland;
  if (!q) return undefined;
  const n = fateWilderlandPlayers(s);
  const boss = s.staging.find((u) => u.code === FATE_WILDERLAND.urdug);
  const assaultLive = s.staging.some(
    (u) => u.code === FATE_WILDERLAND.assault && !u.blanked,
  );
  const stored = new Map<
    string,
    { locationId: string; player: number; count: number }
  >();
  for (const g of q.storedCards) {
    const key = `${g.locationId}:${g.player}`;
    const existing = stored.get(key);
    if (existing) existing.count += g.cards.length;
    else
      stored.set(key, {
        locationId: g.locationId,
        player: g.player,
        count: g.cards.length,
      });
  }
  return {
    initialized: q.initialized,
    currentQuest: q.currentQuest,
    assaultProgress:
      s.staging.find((u) => u.code === FATE_WILDERLAND.assault)?.progress ?? 0,
    assaultLimit:
      s.stage === 1 ? 2 + 2 * n : s.stage === 2 ? 4 + 4 * n : 8 + 8 * n,
    defenseResources:
      s.staging.find((u) => u.code === FATE_WILDERLAND.defense)?.resources ?? 0,
    defenseGoal: 5 * n,
    urdugCanTakeDamage:
      !!boss &&
      (!assaultLive ||
        (q.urdugAttack?.round === s.round &&
          q.urdugAttack.phase === fateWilderlandPhase(s))) &&
      !q.preventDamage.some(
        (m) =>
          m.id === boss.id &&
          m.round === s.round &&
          m.phase === fateWilderlandPhase(s),
      ),
    storedCards: [...stored.values()],
    resolving: q.resolving.length,
  };
}
export function validateFateWilderland(
  s: GameState,
  validUnit: (u: unknown) => boolean,
): boolean {
  const q = s.fateWilderland;
  if (q === undefined) return s.scenarioId !== "the-fate-of-wilderland";
  const integer = (v: unknown): v is number => Number.isSafeInteger(v);
  const phase = (v: unknown) =>
    typeof v === "string" &&
    [
      "setup",
      "resource",
      "planning",
      "quest",
      "travel",
      "encounter",
      "combat",
      "refresh",
    ].includes(v);
  const stamp = (v: { round: number; phase: string }) =>
    !!v &&
    integer(v.round) &&
    v.round >= 0 &&
    v.round <= s.round &&
    phase(v.phase);
  const hosts = [
    ...s.staging,
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []),
  ];
  return (
    !!q &&
    s.scenarioId === "the-fate-of-wilderland" &&
    [1, 2, 3].includes(s.stage) &&
    q.currentQuest === FATE_WILDERLAND_QUESTS[s.stage - 1]?.code &&
    typeof q.initialized === "boolean" &&
    typeof q.urdugDestroyed === "boolean" &&
    !!q.blankShadows &&
    typeof q.blankShadows === "object" &&
    !Array.isArray(q.blankShadows) &&
    Object.entries(q.blankShadows).every(
      ([id, n]) => !!id && integer(n) && n >= 0,
    ) &&
    Array.isArray(q.modifiers) &&
    q.modifiers.every(
      (m) =>
        !!m &&
        typeof m.id === "string" &&
        !!m.id &&
        integer(m.round) &&
        m.round >= 0 &&
        m.round <= s.round &&
        (m.phase === undefined || phase(m.phase)) &&
        integer(m.attack) &&
        integer(m.defense),
    ) &&
    Array.isArray(q.preventDamage) &&
    q.preventDamage.every(
      (m) => !!m && typeof m.id === "string" && !!m.id && stamp(m),
    ) &&
    (q.urdugAttack === undefined || stamp(q.urdugAttack)) &&
    Array.isArray(q.darkClouds) &&
    q.darkClouds.every((m) => stamp(m) && integer(m.count) && m.count > 0) &&
    Array.isArray(q.resolving) &&
    q.resolving.every((code) =>
      [
        FATE_WILDERLAND.fierce,
        FATE_WILDERLAND.command,
        FATE_WILDERLAND.clouds,
        FATE_WILDERLAND.gloom,
        FATE_WILDERLAND.bats,
      ].includes(code),
    ) &&
    Array.isArray(q.storedCards) &&
    q.storedCards.every(
      (g) =>
        !!g &&
        typeof g.locationId === "string" &&
        hosts.some(
          (u) => u.id === g.locationId && u.code === FATE_WILDERLAND.lonely,
        ) &&
        integer(g.player) &&
        g.player >= 0 &&
        (!s.table || g.player < s.table.seats.length) &&
        Array.isArray(g.cards) &&
        g.cards.length === 1 &&
        g.cards.every(validUnit),
    )
  );
}
