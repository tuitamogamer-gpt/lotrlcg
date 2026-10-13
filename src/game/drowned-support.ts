import recipes from "../data/drowned-recipes.json";
import { DROWNED_ENCOUNTERS, DROWNED_QUESTS } from "./drowned-scenario-data";
import type { GameState, Unit } from "./types";
export { DROWNED_ENCOUNTERS, DROWNED_QUESTS };
export const DROWNED_RECIPES = recipes;
const code = (name: string) =>
  [...DROWNED_ENCOUNTERS, ...DROWNED_QUESTS].find(
    (c) =>
      c.name === name &&
      !c.code.endsWith(":B") &&
      !c.code.startsWith("drowned-"),
  )!.code;
export const DROWNED = {
  grotto: code("The Grotto"),
  betrayal: code("Sahír's Betrayal"),
  shrine: code("Shrine to Morgoth"),
  cave: code("Drowned Cave"),
  undertow: code("Powerful Undertow"),
  abyss: code("Into the Abyss"),
  tangling: code("Tangling and Grasping"),
  ancient: code("Ancient Depths"),
  scorpion: code("Sea-Scorpion"),
  eel: code("Cave Eel"),
  drowned: code("Drowned Dead"),
  cadaver: code("Soulless Cadaver"),
  throngs: code("Throngs of Unfaithful"),
  curse: code("Curse of the Downfallen"),
  sahir: code("Captain Sahír"),
  naasiyah: code("Na'asiyah"),
  sahirAlly: code("Captain Sahír") + ":B",
  naasiyahAlly: code("Na'asiyah") + ":B",
  undersea: "drowned-undersea-grotto",
  caverns: "drowned-cursed-caverns",
  halls: "drowned-water-logged-halls",
};
export const DROWNED_GROTTO_CODES = recipes[0].cards
  .filter((c) => c.section === "sharedEncounterDeck2")
  .flatMap((c) => Array<string>(c.quantity).fill(c.code));
export const drownedFront = (physical: string) => {
  const c = DROWNED_ENCOUNTERS.find((c) => c.code === physical)!;
  return physical === DROWNED.shrine
    ? physical
    : `drowned-${c.name.toLowerCase().replaceAll(" ", "-")}`;
};
export interface DrownedState {
  /** In-flight Then clauses survive damage replacement choices and save/reload. */
  thenSequence?: number;
  thenReceipts?: {
    id: string;
    locationId: string;
    locationCode: string;
    expected: string[];
    resolved: string[];
  }[];
  initialized: boolean;
  advancing: boolean;
  currentQuest: string;
  grottoDeck: Unit[];
  setAside: Unit[];
  victoryLocations: Unit[];
  removedUnits: Unit[];
  /** Private face pairings. A shuffled hidden pile receives fresh public handles. */
  originalCodes: Record<string, string>;
  flipLockedRound: number;
  firstAllyRound: number;
  bottomOnDestroy: string[];
  blankedDepartures: string[];
  combatBoosts: {
    characterId: string;
    enemyId: string;
    playerAttack: boolean;
    attack: number;
    defense: number;
  }[];
}
export const drownedState = (s: GameState) => s.drowned;
export const drownedUnderwater = (s: GameState) =>
  !!s.drowned &&
  [
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []),
  ].some((u) =>
    (DROWNED_ENCOUNTERS.find((c) => c.code === u.code)?.traits ?? "").includes(
      "Underwater.",
    ),
  );
export function drownedStageInfo(s: GameState) {
  const c = DROWNED_QUESTS.find((c) => c.code === s.drowned?.currentQuest);
  return c
    ? {
        name: c.back_name ?? c.name,
        cardCode: c.code,
        quest: c.back_quest ?? 0,
        story: c.back_text ?? "",
        questImage: c.back_imagesrc ?? c.imagesrc,
      }
    : undefined;
}
export function validateDrowned(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.drowned;
  if (q === undefined) return s.scenarioId !== "the-drowned-ruins";
  if (
    !q ||
    s.scenarioId !== "the-drowned-ruins" ||
    ![1, 2].includes(s.stage) ||
    typeof q.initialized !== "boolean" ||
    typeof q.advancing !== "boolean" ||
    q.currentQuest !== [DROWNED.grotto, DROWNED.betrayal][s.stage - 1]
  )
    return false;
  if (
    ![
      q.grottoDeck,
      q.setAside,
      q.victoryLocations,
      q.removedUnits,
      q.bottomOnDestroy,
      q.blankedDepartures,
      q.combatBoosts,
    ].every(Array.isArray) ||
    !q.originalCodes ||
    typeof q.originalCodes !== "object"
  )
    return false;
  if (
    ![q.flipLockedRound, q.firstAllyRound].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    )
  )
    return false;
  if (
    q.thenSequence !== undefined &&
    (!Number.isSafeInteger(q.thenSequence) || q.thenSequence < 0)
  )
    return false;
  if (
    q.thenReceipts !== undefined &&
    (!Array.isArray(q.thenReceipts) ||
      new Set(q.thenReceipts.map((r) => r?.id)).size !==
        q.thenReceipts.length ||
      !q.thenReceipts.every(
        (r) =>
          r &&
          typeof r.id === "string" &&
          /^drowned-then-[1-9][0-9]*$/.test(r.id) &&
          Number(r.id.slice(13)) <= (q.thenSequence ?? 0) &&
          typeof r.locationId === "string" &&
          typeof r.locationCode === "string" &&
          Array.isArray(r.expected) &&
          Array.isArray(r.resolved) &&
          r.expected.every(
            (t) => typeof t === "string" && t.startsWith(r.id + "/"),
          ) &&
          new Set(r.expected).size === r.expected.length &&
          r.resolved.every(
            (t) => typeof t === "string" && r.expected.includes(t),
          ) &&
          new Set(r.resolved).size === r.resolved.length,
      ))
  )
    return false;
  const hidden = [
    ...q.grottoDeck,
    ...q.setAside,
    ...q.victoryLocations,
    ...q.removedUnits,
  ];
  if (
    !hidden.every(validUnit) ||
    new Set(hidden.map((u) => u.id)).size !== hidden.length
  )
    return false;
  const expected = [...DROWNED_GROTTO_CODES, DROWNED.shrine].sort();
  if (Object.values(q.originalCodes).sort().join("|") !== expected.join("|"))
    return false;
  const locations = [
    ...q.grottoDeck,
    ...q.setAside,
    ...q.victoryLocations,
    ...s.staging,
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []),
  ].filter((u) => q.originalCodes[u.id]);
  if (
    locations.length !== expected.length ||
    new Set(locations.map((u) => u.id)).size !== expected.length
  )
    return false;
  if (
    !locations.every(
      (u) =>
        u.code === drownedFront(q.originalCodes[u.id]) ||
        u.code === q.originalCodes[u.id] + ":B",
    )
  )
    return false;
  if (
    !q.grottoDeck.every(
      (u) => u.code === drownedFront(q.originalCodes[u.id]),
    ) ||
    !q.victoryLocations.every(
      (u) =>
        (u.code.endsWith(":B") || u.code === DROWNED.shrine) &&
        s.victoryCards?.includes(u.code),
    )
  )
    return false;
  if (
    !q.setAside.every(
      (u) =>
        u.code === DROWNED.shrine ||
        (!q.initialized &&
          [DROWNED.sahirAlly, DROWNED.naasiyahAlly].includes(u.code)),
    )
  )
    return false;
  if (
    !q.removedUnits.every((u) =>
      [DROWNED.sahir, DROWNED.sahirAlly, DROWNED.naasiyahAlly].includes(u.code),
    )
  )
    return false;
  return (
    q.bottomOnDestroy.every((v) => typeof v === "string") &&
    q.blankedDepartures.every((c) =>
      [DROWNED.sahirAlly, DROWNED.naasiyahAlly].includes(c),
    ) &&
    q.combatBoosts.every(
      (b) =>
        b &&
        typeof b.characterId === "string" &&
        typeof b.enemyId === "string" &&
        typeof b.playerAttack === "boolean" &&
        [b.attack, b.defense].every((n) => Number.isInteger(n) && n >= 0),
    )
  );
}
