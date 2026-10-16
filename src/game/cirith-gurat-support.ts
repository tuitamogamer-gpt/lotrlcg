import encounters from "../data/cirith-gurat-encounter-cards.json";
import quests from "../data/cirith-gurat-quest-cards.json";
import recipes from "../data/cirith-gurat-recipes.json";
import shared from "../data/harad-encounter-cards.json";
import type { Card, GameState, Unit } from "./types";
export const CIRITH_GURAT_ENCOUNTERS = encounters as Card[];
export const CIRITH_GURAT_QUESTS = quests as Card[];
export const CIRITH_GURAT_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests, ...shared].find((c) => c.name === name)!.code;
export const CIRITH_GURAT = {
  rescue: code("Rescue the Prisoners"),
  sneak: code("Sneak Past the Guards"),
  fight: code("Fight Your Way Out"),
  captives: code("The Captives of Cirith Gurat"),
  abaan: code("Abaan"),
  chieftain: code("Uruk Chieftain"),
  jailer: code("Jailer of Cirith Gurat"),
  guard: code("Prison Guard"),
  warg: code("Dungeon Warg"),
  cell: code("Dungeon Cell"),
  gate: code("Gate of Iron"),
  guardroom: code("Uruk Guardroom"),
  mines: code("Mines of Cirith Gurat"),
  torture: code("Torture Room"),
  prisoner: code("Taken Prisoner"),
  tormented: code("Tormented by Orcs"),
  captured: code("Captured!"),
  uruk: code("Uruk of Mordor"),
  rider: code("Uruk Warg-Rider"),
  mount: code("Mordor Warg"),
  uruks: code("Uruks of the Eye"),
  fear: code("Fear of Mordor"),
};
export const CIRITH_GURAT_MAIN_QUESTS = [
  CIRITH_GURAT.rescue,
  CIRITH_GURAT.sneak,
  CIRITH_GURAT.fight,
];
export interface CirithGuratState {
  initialized: boolean;
  rescuePending: number;
  advancing: boolean;
  currentQuest: string;
  questDeck: string[];
  completedQuests: string[];
  /** Physical characters remain face up in play as uncontrolled, blank objectives. */
  captives: Unit[];
  guarding: Record<string, string>;
  setAside: Unit[];
  /** Different Orc titles selected by preceding players during setup. */
  setupOrcs: string[];
  engagedRound: number;
  sneakResources: number;
  stageThreeChecks: boolean;
  /** Round snapshots detect paid exhaustion without replacing character rules. */
  abaanExhausted: boolean;
  abaanBonuses: { id: string; round: number }[];
  /** Allies destroyed this attack trigger Taken Prisoner only after combat finishes. */
  destroyedAllies: string[];
  shadowDefense: { id: string; round: number; phase: string; value: number }[];
}
export const cirithGuratGuarded = (s: GameState, id: string) =>
  !!s.cirithGurat && Object.values(s.cirithGurat.guarding).includes(id);
export const cirithGuratCaptives = (s: GameState, id: string) =>
  s.cirithGurat?.captives.filter((u) => s.cirithGurat!.guarding[u.id] === id) ??
  [];
export function cirithGuratStageInfo(s: GameState) {
  const q = CIRITH_GURAT_QUESTS.find(
    (q) => q.code === s.cirithGurat?.currentQuest,
  );
  return q
    ? {
        name: q.back_name ?? q.name,
        cardCode: q.code,
        quest: q.back_quest ?? 0,
        story: q.back_text ?? "",
        questImage: q.back_imagesrc ?? q.imagesrc,
      }
    : undefined;
}
export function validateCirithGurat(
  s: GameState,
  validUnit: (u: unknown) => boolean,
  cardKind?: (code: string) => string,
) {
  const q = s.cirithGurat;
  if (q === undefined) return s.scenarioId !== "the-dungeons-of-cirith-gurat";
  if (
    !q ||
    s.scenarioId !== "the-dungeons-of-cirith-gurat" ||
    ![
      q.questDeck,
      q.completedQuests,
      q.captives,
      q.setAside,
      q.setupOrcs,
      q.abaanBonuses,
      q.destroyedAllies,
      q.shadowDefense,
    ].every(Array.isArray) ||
    !q.guarding ||
    typeof q.guarding !== "object" ||
    Array.isArray(q.guarding)
  )
    return false;
  const seats = s.table?.seats.filter((_, i) => i !== s.table!.active) ?? [];
  const external = [
    ...s.heroes,
    ...s.allies,
    ...s.engaged,
    ...s.hand,
    ...seats.flatMap((p) => [
      ...p.heroes,
      ...p.allies,
      ...p.engaged,
      ...p.hand,
    ]),
    ...s.staging,
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []),
  ];
  const physical = [...external, ...q.captives, ...q.setAside];
  const chain = [...q.completedQuests, q.currentQuest, ...q.questDeck];
  const guards = [
    ...s.staging,
    ...s.engaged,
    ...seats.flatMap((p) => p.engaged),
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []),
  ];
  const guardedIds = new Set(q.captives.map((u) => u.id));
  return (
    typeof q.initialized === "boolean" &&
    Number.isInteger(q.rescuePending) &&
    q.rescuePending >= 0 &&
    typeof q.advancing === "boolean" &&
    Number.isInteger(s.stage) &&
    s.stage >= 1 &&
    s.stage <= 3 &&
    q.currentQuest === CIRITH_GURAT_MAIN_QUESTS[s.stage - 1] &&
    chain.length === 3 &&
    chain.every((c, i) => c === CIRITH_GURAT_MAIN_QUESTS[i]) &&
    q.captives.every(validUnit) &&
    q.captives.every(
      (u) =>
        (!cardKind ||
          ["hero", "ally", "objective-ally", "objective-hero"].includes(
            cardKind(u.code),
          )) &&
        Number.isInteger(u.owner) &&
        u.owner! >= 0 &&
        u.owner! < (s.table?.seats.length ?? 1) &&
        !u.attachments.length &&
        u.damage === 0 &&
        u.resources === 0 &&
        !u.committed,
    ) &&
    q.setAside.every(validUnit) &&
    q.setAside.length <= 1 &&
    q.setAside.every((u) => u.code === CIRITH_GURAT.chieftain) &&
    new Set(physical.map((u) => u.id)).size === physical.length &&
    Object.entries(q.guarding).every(
      ([id, guard]) =>
        guardedIds.has(id) &&
        typeof guard === "string" &&
        ((guard === "pending" &&
          [
            ...s.queue,
            ...(s.choice?.options.flatMap((o) => o.effects) ?? []),
          ].some(
            (e) =>
              ["cirithGuratChooseHost", "cirithGuratAttach"].includes(e.kind) &&
              e.target === id,
          )) ||
          guards.some(
            (u) =>
              u.id === guard &&
              ["enemy", "location", "encounter-side-quest"].includes(
                [...encounters, ...shared].find((c) => c.code === u.code)
                  ?.type_code ?? "",
              ),
          )),
    ) &&
    q.captives.every((u) => typeof q.guarding[u.id] === "string") &&
    q.setupOrcs.every(
      (c) =>
        typeof c === "string" &&
        [...encounters, ...shared].some(
          (u) =>
            u.code === c &&
            (u.traits ?? "").split(".").some((t) => t.trim() === "Orc"),
        ),
    ) &&
    new Set(q.setupOrcs).size === q.setupOrcs.length &&
    q.setupOrcs.length <= 4 &&
    Number.isInteger(q.sneakResources) &&
    q.sneakResources >= 0 &&
    typeof q.stageThreeChecks === "boolean" &&
    Number.isInteger(q.engagedRound) &&
    q.engagedRound >= -1 &&
    q.engagedRound <= s.round &&
    typeof q.abaanExhausted === "boolean" &&
    q.abaanBonuses.every(
      (m) =>
        m &&
        typeof m.id === "string" &&
        Number.isInteger(m.round) &&
        m.round >= 0 &&
        m.round <= s.round,
    ) &&
    q.destroyedAllies.every((id) => typeof id === "string") &&
    q.shadowDefense.every(
      (m) =>
        m &&
        typeof m.id === "string" &&
        Number.isInteger(m.round) &&
        m.round >= 0 &&
        m.round <= s.round &&
        typeof m.phase === "string" &&
        Number.isInteger(m.value) &&
        m.value > 0,
    )
  );
}
/** Face-up objectives are public; unrevealed physical deck order stays private. */
export function cirithGuratPublicState(s: GameState) {
  const q = s.cirithGurat;
  return q
    ? {
        initialized: q.initialized,
        currentQuest: q.currentQuest,
        completedQuests: q.completedQuests,
        questDeck: q.questDeck.length,
        setAside: q.setAside.length,
        captives: q.captives.map((u) => ({
          id: u.id,
          code: u.code,
          owner: u.owner,
          guardId: q.guarding[u.id],
        })),
        sneakResources: q.sneakResources,
        engagedThisRound: q.engagedRound === s.round,
      }
    : undefined;
}
