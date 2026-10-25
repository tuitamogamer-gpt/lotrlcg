import encounters from "../data/danger-dorwinion-encounter-cards.json";
import quests from "../data/danger-dorwinion-quest-cards.json";
import recipes from "../data/danger-dorwinion-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { DangerDorwinionState } from "./danger-dorwinion-types";

export const DANGER_DORWINION_ENCOUNTERS = encounters as Card[];
export const DANGER_DORWINION_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const DANGER_DORWINION_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const DANGER_DORWINION = {
  first: code("A City in Turmoil"),
  second: code("The Shadow of Mordor"),
  third: code("Leader of the Cult"),
  servant: code("Servant of Sauron"),
  easterling: code("Treacherous Easterling"),
  darkness: code("Darkness in the East"),
  forum: code("City Forum"),
  tavern: code("Seedy Tavern"),
  overwhelmed: code("Overwhelmed"),
  backstabber: code("Rhûn Backstabber"),
  fear: code("Shadow of Fear"),
  guard: code("Under Guard"),
  secret: code("Secret Cultist"),
  messenger: code("Messenger from Mordor"),
  evidence: code("Evidence of the Cult"),
  disappearances: code("Disappearances"),
  manor: code("Hillside Manor"),
  unwelcome: code("Unwelcome Travelers"),
  catacombs: code("Catacombs"),
  street: code("Side Street"),
  worship: code("Sauron Worship"),
  bribes: code("Bribes"),
  submit: code("Submit or Die"),
  black: "octgn:52b0bc28-37bb-4097-b96a-cc7dc4af8721",
  governor: code("The Governor"),
  priest: code("Priest of Sauron"),
};
export const dangerDorwinionPhase = (s: GameState) =>
  ["quest", "staging"].includes(s.phase)
    ? "quest"
    : ["defense", "attack"].includes(s.phase)
      ? "combat"
      : s.phase;
export const dangerDorwinionPlayers = (s: GameState) =>
  s.table ? s.table.seats.filter((p) => !p.eliminated).length : 1;
export const dangerDorwinionCultists = [
  DANGER_DORWINION.black,
  DANGER_DORWINION.governor,
  DANGER_DORWINION.priest,
];
export const dangerDorwinionPlots = [
  DANGER_DORWINION.worship,
  DANGER_DORWINION.bribes,
  DANGER_DORWINION.submit,
];
export function dangerDorwinionStageInfo(s: GameState) {
  const q = DANGER_DORWINION_QUESTS.find(
    (c) => c.code === s.dangerDorwinion?.currentQuest,
  );
  return q
    ? {
        name: q.back_name ?? q.name,
        cardCode: q.code,
        quest: q.back_quest ?? 0,
        story: q.back_text ?? "",
        questImage: q.back_imagesrc ?? q.imagesrc,
        side: "B" as const,
      }
    : undefined;
}
export function dangerDorwinionUnits(s: GameState): Unit[] {
  const q = s.dangerDorwinion;
  return q
    ? [
        ...q.setAside,
        ...q.looked,
        ...q.resolving,
        ...q.storedCards.flatMap((g) => g.cards),
      ]
    : [];
}
export const dangerDorwinionThreatReduction = (s: GameState) =>
  s.dangerDorwinion
    ? s.staging
        .filter((u) => u.code === DANGER_DORWINION.worship && !u.blanked)
        .reduce((n, u) => n + u.damage, 0)
    : 0;
export function dangerDorwinionPublicState(s: GameState) {
  const q = s.dangerDorwinion;
  if (!q) return undefined;
  const bosses = [
    ...s.staging,
    ...s.engaged,
    ...(s.table?.seats.flatMap((p) => p.engaged) ?? []),
  ];
  const boss = bosses.find((u) => dangerDorwinionCultists.includes(u.code));
  return {
    initialized: q.initialized,
    currentQuest: q.currentQuest,
    resources: q.resources,
    resourceGoal:
      s.stage === 1 ? 2 : s.stage === 2 ? 3 + dangerDorwinionPlayers(s) : 0,
    setAside: q.setAside.length,
    looked: q.looked.length,
    resolving: q.resolving.length,
    storedCards: q.storedCards.map((g) => ({
      locationId: g.locationId,
      count: g.cards.length,
    })),
    cultist: boss
      ? { id: boss.id, code: boss.code, damage: boss.damage }
      : null,
    cultistDamageThisRound:
      q.cultistDamage.round === s.round ? q.cultistDamage.amount : 0,
    threatEliminationPenalty: dangerDorwinionThreatReduction(s),
    plot: s.staging
      .filter((u) => dangerDorwinionPlots.includes(u.code))
      .map((u) => ({
        id: u.id,
        code: u.code,
        resources: u.resources,
        damage: u.damage,
      })),
  };
}
export function validateDangerDorwinion(
  s: GameState,
  validUnit: (u: unknown) => boolean,
): boolean {
  const q = s.dangerDorwinion;
  if (q === undefined) return s.scenarioId !== "danger-in-dorwinion";
  const integer = (n: unknown): n is number =>
    Number.isSafeInteger(n) && (n as number) >= 0;
  const player = (p: unknown) => integer(p) && p < (s.table?.seats.length ?? 1);
  const round = (r: unknown) => integer(r) && r <= s.round;
  const list = (xs: unknown): xs is Unit[] =>
    Array.isArray(xs) && xs.every(validUnit);
  const record = (v: unknown) =>
    !!v && typeof v === "object" && !Array.isArray(v);
  return (
    !!q &&
    s.scenarioId === "danger-in-dorwinion" &&
    [1, 2, 3].includes(s.stage) &&
    q.currentQuest === DANGER_DORWINION_QUESTS[s.stage - 1]?.code &&
    typeof q.initialized === "boolean" &&
    typeof q.cultistDefeated === "boolean" &&
    integer(q.resources) &&
    list(q.setAside) &&
    q.setAside.every((u) =>
      [...dangerDorwinionPlots, ...dangerDorwinionCultists].includes(u.code),
    ) &&
    list(q.looked) &&
    q.looked.length <= 5 &&
    list(q.resolving) &&
    Array.isArray(q.storedCards) &&
    q.storedCards.every(
      (g) =>
        !!g &&
        typeof g.locationId === "string" &&
        !!g.locationId &&
        list(g.cards),
    ) &&
    Array.isArray(q.resolvingTreacheries) &&
    q.resolvingTreacheries.every((c) =>
      DANGER_DORWINION_ENCOUNTERS.some(
        (d) => d.code === c && d.type_code === "treachery",
      ),
    ) &&
    !!q.cultistDamage &&
    round(q.cultistDamage.round) &&
    integer(q.cultistDamage.amount) &&
    record(q.threatRaised) &&
    Object.entries(q.threatRaised).every(
      ([p, r]) => player(Number(p)) && round(r),
    ) &&
    record(q.servantAttacks) &&
    Object.values(q.servantAttacks).every(
      (v) =>
        !!v &&
        round(v.round) &&
        [
          "setup",
          "resource",
          "planning",
          "quest",
          "travel",
          "encounter",
          "combat",
          "refresh",
        ].includes(v.phase),
    ) &&
    Array.isArray(q.prevented) &&
    q.prevented.every(
      (p) => !!p && typeof p.id === "string" && round(p.round),
    ) &&
    Array.isArray(q.overwhelmed) &&
    q.overwhelmed.every((p) => !!p && player(p.player) && round(p.round)) &&
    !!q.manorReduction &&
    round(q.manorReduction.round) &&
    record(q.manorReduction.players) &&
    Object.entries(q.manorReduction.players).every(
      ([p, n]) => player(Number(p)) && integer(n),
    ) &&
    Array.isArray(q.secretCultists) &&
    q.secretCultists.every(
      (v) => !!v && typeof v.id === "string" && player(v.owner),
    )
  );
}
