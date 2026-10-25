import encounters from "../data/temple-doom-encounter-cards.json";
import quests from "../data/temple-doom-quest-cards.json";
import recipes from "../data/temple-doom-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { TempleDoomState } from "./temple-doom-types";

export const TEMPLE_DOOM_ENCOUNTERS = encounters as Card[];
export const TEMPLE_DOOM_QUESTS = quests as Card[];
export const TEMPLE_DOOM_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const TEMPLE_DOOM = {
  first: code("The Forgotten Temple"),
  memory: code("Memory of the Dark Years"),
  shrine: code("Shrine to Sauron"),
  lord: code("The Lord of Middle-earth"),
  legacy: code("The Legacy of Mordor"),
  temple: code("Temple of Sauron"),
  lost: code("Lost in the Dark"),
  shadows: code("Fearful Shadows"),
  opening: code("Narrow Opening"),
  passage: code("Crumbling Passage"),
  tunnel: code("Twisted Tunnel"),
  fanaticism: code("Fanaticism"),
  rage: code("Ulchor's Rage"),
  evil: code("Place of Evil"),
  guard: code("Ulchor's Guard"),
  hall: code("Hall of Horrors"),
  khamul: code("Khamûl the Easterling"),
  tower: code("The Tower of Barad-dûr"),
  eye: code("Under the Watchful Eye"),
  armies: code("The Armies of Mordor"),
  darkness: code("Covered in Darkness"),
  ulchor: code("Thane Ulchor"),
  tribute: code("Tribute to Mordor"),
};
export const TEMPLE_DOOM_STAGE_TWOS = [
  TEMPLE_DOOM.memory,
  TEMPLE_DOOM.shrine,
  TEMPLE_DOOM.lord,
  TEMPLE_DOOM.legacy,
];
export const TEMPLE_DOOM_POWER = [
  TEMPLE_DOOM.khamul,
  TEMPLE_DOOM.tower,
  TEMPLE_DOOM.eye,
  TEMPLE_DOOM.armies,
  TEMPLE_DOOM.darkness,
];
export const templeDoomPlayers = (s: GameState) =>
  s.table ? s.table.seats.filter((p) => !p.eliminated).length : 1;
/** The original insert explicitly excludes side quests from this count. */
export const templeDoomQuestCount = (s: GameState) =>
  (s.victoryCards ?? []).filter((code) =>
    TEMPLE_DOOM_QUESTS.some((q) => q.code === code),
  ).length;
export const templeDoomX = (s: GameState) => 1 + templeDoomQuestCount(s);
export function templeDoomStageInfo(s: GameState) {
  const q = TEMPLE_DOOM_QUESTS.find(
    (c) => c.code === s.templeDoom?.currentQuest,
  );
  if (!q) return undefined;
  const front = s.stageRevealing && q.code !== TEMPLE_DOOM.first;
  return {
    name: front ? q.name : (q.back_name ?? q.name),
    cardCode: q.code,
    quest:
      front || q.code === TEMPLE_DOOM.first
        ? 0
        : (q.back_quest ?? q.quest ?? 0) +
          (q.code === TEMPLE_DOOM.lord ? 4 * templeDoomPlayers(s) : 0),
    story: front ? (q.text ?? "") : (q.back_text ?? ""),
    questImage: front ? q.imagesrc : (q.back_imagesrc ?? q.imagesrc),
    side: front ? ("A" as const) : ("B" as const),
  };
}
export const templeDoomUnits = (s: GameState): Unit[] =>
  s.templeDoom
    ? [
        ...s.templeDoom.resolving,
        ...s.templeDoom.underDial.flatMap((g) => g.cards),
      ]
    : [];
export function templeDoomPublicState(s: GameState) {
  const q = s.templeDoom;
  if (!q) return undefined;
  const tribute = s.staging.find((u) => u.code === TEMPLE_DOOM.tribute);
  return {
    initialized: q.initialized,
    currentQuest: q.currentQuest,
    questDeck: q.questDeck.length,
    powerDeck: q.powerDeck.length,
    questResources: q.questResources,
    completedStages: templeDoomQuestCount(s),
    tributeDamage: tribute?.damage ?? 0,
    underDial: q.underDial.map((g) => ({
      questId: g.questId,
      player: g.player,
      count: g.cards.length,
    })),
    memoryThreat: q.memoryThreat.round === s.round ? q.memoryThreat.value : 0,
    lordLimit:
      q.lordLimit.round === s.round
        ? { value: q.lordLimit.value, placed: q.lordLimit.placed }
        : undefined,
    resolving: q.resolving.length,
  };
}
export function validateTempleDoom(
  s: GameState,
  validUnit: (u: unknown) => boolean,
): boolean {
  const q = s.templeDoom;
  if (q === undefined) return s.scenarioId !== "temple-of-doom";
  const nat = (n: unknown): n is number =>
    Number.isSafeInteger(n) && Number(n) >= 0;
  const round = (n: unknown) => nat(n) && n <= s.round;
  const ids = (v: unknown): v is string[] =>
    Array.isArray(v) &&
    v.every((n) => typeof n === "string" && !!n) &&
    new Set(v).size === v.length;
  const counts = (v: unknown) =>
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.entries(v).every(
      ([p, n]) =>
        /^\d+$/.test(p) && Number(p) < (s.table?.seats.length ?? 1) && nat(n),
    );
  const stamp = (v: { round: number; counts: Record<string, number> }) =>
    !!v && round(v.round) && counts(v.counts);
  return (
    !!q &&
    s.scenarioId === "temple-of-doom" &&
    [1, 2].includes(s.stage) &&
    typeof q.initialized === "boolean" &&
    typeof q.advancing === "boolean" &&
    TEMPLE_DOOM_QUESTS.some((c) => c.code === q.currentQuest) &&
    (s.stage === 1) === (q.currentQuest === TEMPLE_DOOM.first) &&
    ids(q.questDeck) &&
    q.questDeck.every(
      (c) =>
        TEMPLE_DOOM_STAGE_TWOS.includes(c) &&
        c !== q.currentQuest &&
        !(s.victoryCards ?? []).includes(c),
    ) &&
    ids(q.powerDeck) &&
    q.powerDeck.every((c) => TEMPLE_DOOM_POWER.includes(c)) &&
    nat(q.questResources) &&
    q.questResources <= 2 &&
    ids(q.enteredEnemies) &&
    Array.isArray(q.resolving) &&
    q.resolving.every(validUnit) &&
    Array.isArray(q.underDial) &&
    q.underDial.every(
      (g) =>
        !!g &&
        typeof g.questId === "string" &&
        !!g.questId &&
        nat(g.player) &&
        g.player < (s.table?.seats.length ?? 1) &&
        Array.isArray(g.cards) &&
        g.cards.every(validUnit),
    ) &&
    !!q.memoryThreat &&
    round(q.memoryThreat.round) &&
    nat(q.memoryThreat.value) &&
    !!q.lordLimit &&
    round(q.lordLimit.round) &&
    nat(q.lordLimit.value) &&
    nat(q.lordLimit.placed) &&
    Array.isArray(q.restrictions) &&
    q.restrictions.every(
      (r) =>
        !!r &&
        typeof r.id === "string" &&
        round(r.round) &&
        ["refresh", "round"].includes(r.until),
    ) &&
    Number.isSafeInteger(q.blankRound) &&
    q.blankRound >= -1 &&
    q.blankRound <= s.round &&
    stamp(q.played) &&
    stamp(q.reduced) &&
    Array.isArray(q.protected) &&
    q.protected.every((r) => !!r && typeof r.id === "string" && round(r.round))
  );
}
