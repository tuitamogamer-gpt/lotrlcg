import encounters from "../data/depths-encounter-cards.json";
import quests from "../data/depths-quest-cards.json";
import recipes from "../data/depths-recipes.json";
import type { Card, Effect, GameState, Unit } from "./types";
import { dcBase } from "./dreamchaser-campaign-support";
export { DEPTHS_ADVENTURES } from "./depths-scenario-data";

export const DEPTHS_ENCOUNTERS = encounters as Card[];
export const DEPTHS_QUESTS = quests as Card[];
export const DEPTHS_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find(
    (c) => c.name === name && !c.code.endsWith(":B"),
  )!.code;
export const DEPTHS = {
  take: code("Take the Ship!"),
  change: code("Change of Plans"),
  defend: code("Defend the Ship!"),
  thing: code("The Thing in the Depths"),
  eye: code("Eye of the Beast"),
  thrashing: code("Thrashing Arm"),
  crushing: code("Crushing Arm"),
  grasping: code("Grasping Arm"),
  giant: code("Giant Arm"),
  from: code("From the Depths"),
  lashing: code("Lashing Tentacles"),
  helm: code("Helm of the Stormcaller"),
  forecastle: code("Forecastle Deck"),
  weather: code("Weather Deck"),
  cargo: code("Cargo Hold"),
  crew: code("Crew Quarters"),
  quarter: code("Quarter Deck"),
  steady: code("Hold Steady!"),
  sahir: code("Captain Sahír"),
  naasiyah: code("Na'asiyah"),
  sahirAlly: `${code("Captain Sahír")}:B`,
  naasiyahAlly: `${code("Na'asiyah")}:B`,
  raider: code("Umbar Raider"),
  infiltrator: code("Corsair Infiltrator"),
  leader: code("Raid Leader"),
  hardened: code("Battle-Hardened"),
};
export const DEPTHS_MAIN_QUESTS = [DEPTHS.take, DEPTHS.change, DEPTHS.defend];
/**
 * The Nightmare Deck's cards (docs/NIGHTMARE.md): the Arms and Deep Maelstrom
 * bear The Thing in the Depths' icon (the set aside beast deck), the Ship
 * locations and Tumultuous Waters The Stormcaller's, and Corsair Duelist the
 * Corsair Raiders' (removed with that set at Change of Plans).
 */
export const DEPTHS_NIGHTMARE = {
  quarters: "octgn:5fa05845-7cdd-46da-9862-4f3f10525ef1",
  aftCabin: "octgn:671e838c-630c-4bd7-91d8-20ec6c144f9f",
  tumultuous: "octgn:26cf3d89-9cfe-45a9-8deb-c2840193ba0f",
  duelist: "octgn:e5b4ba4a-99dc-4f01-9216-21406aa05bd0",
  slithering: "octgn:5e1bbe70-dae7-404a-a420-93e393538fa3",
  crashing: "octgn:a926afdc-c770-4315-b4eb-6b417e765c55",
  maelstrom: "octgn:58f19ebb-2e0f-4ff9-9ec1-1984e9faca02",
};
/** The Nightmare Deck's cards of the set aside The Thing in the Depths encounter set. */
export const DEPTHS_NIGHTMARE_BEAST = [
  DEPTHS_NIGHTMARE.slithering,
  DEPTHS_NIGHTMARE.crashing,
  DEPTHS_NIGHTMARE.maelstrom,
];
const DEPTHS_NIGHTMARE_LOCATIONS = [
  DEPTHS_NIGHTMARE.quarters,
  DEPTHS_NIGHTMARE.aftCabin,
];
export const DEPTHS_CREATURES = [
  DEPTHS.thing,
  DEPTHS.eye,
  DEPTHS.thrashing,
  DEPTHS.crushing,
  DEPTHS.grasping,
  DEPTHS.giant,
  DEPTHS_NIGHTMARE.slithering,
  DEPTHS_NIGHTMARE.crashing,
];
export const DEPTHS_TENTACLES = [
  DEPTHS.thrashing,
  DEPTHS.crushing,
  DEPTHS.grasping,
  DEPTHS.giant,
  DEPTHS_NIGHTMARE.slithering,
  DEPTHS_NIGHTMARE.crashing,
];
export const DEPTHS_CORSAIR_RAIDERS = [
  DEPTHS.raider,
  DEPTHS.infiltrator,
  DEPTHS.leader,
  DEPTHS.hardened,
  DEPTHS_NIGHTMARE.duelist,
];
export interface DepthsState {
  initialized: boolean;
  advancing: boolean;
  currentQuest: string;
  questDeck: string[];
  completedQuests: string[];
  setAside: Unit[];
  /** Unrevealed set aside encounter cards, mixed into the deck only at stage 2. */
  beastDeck: string[];
  /** These physical enemies are facedown attachments and never staging targets. */
  grappled: { enemy: Unit; locationId: string }[];
  /** A physical Giant Arm shadow waits here until its after-attack choice. */
  pendingEnemies: Unit[];
  removed: string[];
  removedUnits: Unit[];
  travelUsed: boolean;
  /** A blanked loss clause does not trigger when its physical companion leaves. */
  blankedDepartures: string[];
  combatBoosts: {
    characterId: string;
    enemyId: string;
    playerAttack: boolean;
    attack: number;
    defense: number;
  }[];
}
export type DepthsCombat = NonNullable<GameState["combat"]> & {
  depthsAfterAttack?: Effect[];
};
type State = GameState & { depths?: DepthsState };
export const depthsState = (s: GameState) => (s as State).depths;
export const depthsCurrentQuest = (s: GameState) =>
  depthsState(s)?.currentQuest;
export function depthsStageInfo(s: GameState) {
  const c = DEPTHS_QUESTS.find((c) => c.code === depthsCurrentQuest(s));
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
export const depthsGrappledWith = (s: GameState, locationId: string) =>
  depthsState(s)
    ?.grappled.filter((g) => g.locationId === locationId)
    .map((g) => g.enemy) ?? [];
/** Captain's Quarters (the Nightmare Deck): "While Captain's Quarters is grappled, Raider characters are considered to have no resources." */
export const depthsQuartersGrappled = (s: GameState) =>
  !!s.nightmareMode &&
  s.staging.some(
    (l) =>
      l.code === DEPTHS_NIGHTMARE.quarters &&
      !l.blanked &&
      depthsGrappledWith(s, l.id).length > 0,
  );
export function validateDepths(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = depthsState(s);
  if (q === undefined) return s.scenarioId !== "the-thing-in-the-depths";
  if (
    !q ||
    s.scenarioId !== "the-thing-in-the-depths" ||
    typeof q.initialized !== "boolean" ||
    typeof q.advancing !== "boolean" ||
    typeof q.travelUsed !== "boolean" ||
    ![1, 2, 3].includes(s.stage)
  )
    return false;
  if (
    ![
      q.questDeck,
      q.completedQuests,
      q.setAside,
      q.beastDeck,
      q.grappled,
      q.pendingEnemies,
      q.removed,
      q.removedUnits,
      q.blankedDepartures,
    ].every(Array.isArray)
  )
    return false;
  if (
    !q.blankedDepartures.every((c) =>
      [DEPTHS.sahirAlly, DEPTHS.naasiyahAlly].includes(c),
    ) ||
    new Set(q.blankedDepartures).size !== q.blankedDepartures.length
  )
    return false;
  if (
    q.currentQuest !== DEPTHS_MAIN_QUESTS[s.stage - 1] ||
    [...q.completedQuests, q.currentQuest, ...q.questDeck].join("|") !==
      DEPTHS_MAIN_QUESTS.join("|")
  )
    return false;
  const allowedAside = [
    DEPTHS.thing,
    DEPTHS.sahir,
    DEPTHS.naasiyah,
    ...(!q.initialized ? [DEPTHS.helm, DEPTHS.raider] : []),
  ];
  if (
    !q.setAside.every(
      (u) => validUnit(u) && allowedAside.includes(dcBase(u.code)),
    ) ||
    new Set(q.setAside.map((u) => u.code)).size !== q.setAside.length
  )
    return false;
  if (
    !q.beastDeck.every(
      (c) =>
        DEPTHS_ENCOUNTERS.some(
          (v) =>
            v.code === c &&
            v.encounter_set === "The Thing in the Depths" &&
            c !== DEPTHS.thing,
        ) ||
        (!!s.nightmareMode && DEPTHS_NIGHTMARE_BEAST.includes(c)),
    )
  )
    return false;
  if (
    !q.grappled.every(
      (g) =>
        g &&
        typeof g.locationId === "string" &&
        validUnit(g.enemy) &&
        DEPTHS_TENTACLES.includes(g.enemy.code) &&
        s.staging.some(
          (u) =>
            u.id === g.locationId &&
            (DEPTHS_ENCOUNTERS.some(
              (c) => c.code === u.code && c.type_code === "location",
            ) ||
              DEPTHS_NIGHTMARE_LOCATIONS.includes(u.code)),
        ),
    )
  )
    return false;
  if (
    !q.pendingEnemies.every(
      (u) => validUnit(u) && DEPTHS_TENTACLES.includes(u.code),
    )
  )
    return false;
  if (
    !Array.isArray(q.combatBoosts) ||
    !q.combatBoosts.every(
      (b) =>
        b &&
        typeof b.characterId === "string" &&
        typeof b.enemyId === "string" &&
        typeof b.playerAttack === "boolean" &&
        [b.attack, b.defense].every((n) => Number.isInteger(n) && n >= 0),
    )
  )
    return false;
  if (
    !q.removed.every((c) => DEPTHS_CORSAIR_RAIDERS.includes(c)) ||
    !q.removedUnits.every(
      (u) => validUnit(u) && DEPTHS_CORSAIR_RAIDERS.includes(u.code),
    )
  )
    return false;
  const hiddenUnits = [
    ...q.setAside,
    ...q.grappled.map((g) => g.enemy),
    ...q.pendingEnemies,
    ...q.removedUnits,
  ];
  if (new Set(hiddenUnits.map((u) => u.id)).size !== hiddenUnits.length)
    return false;
  return !(
    q.initialized &&
    s.stage === 3 &&
    (q.setAside.length || q.beastDeck.length)
  );
}
