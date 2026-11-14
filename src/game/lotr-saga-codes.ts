// Printed identities of The Lord of the Rings Saga framework; no runtime dependencies.
import sagaCards from "../data/lotr-saga-cards.json";

/** The Black Riders' Fellowship-sphere Frodo Baggins, the first Ring-bearer. */
export const SAGA_FRODO = "141001";
/** The Road Darkens' Fellowship-sphere Frodo Baggins. */
export const ROAD_DARKENS_FRODO = "142001";
/** The One Ring objective of The Black Riders. */
export const ONE_RING = sagaCards.find(
  (c) => c.name === "The One Ring" && c.pack_code === "TBR",
)!.code;
/** The One Ring objective of The Road Darkens. */
export const ROAD_DARKENS_ONE_RING = sagaCards.find(
  (c) => c.name === "The One Ring" && c.pack_code === "TRD",
)!.code;
/** The Land of Shadow's Fellowship-sphere Frodo Baggins. */
export const LAND_SHADOW_FRODO = "144001";
/** The One Ring objective of The Land of Shadow. */
export const LAND_SHADOW_ONE_RING = sagaCards.find(
  (c) => c.name === "The One Ring" && c.pack_code === "LoS",
)!.code;
/** Every One Ring objective a Saga scenario may place. */
export const ONE_RINGS: readonly string[] = [
  ONE_RING,
  ROAD_DARKENS_ONE_RING,
  LAND_SHADOW_ONE_RING,
];
export const isOneRing = (code: string) => ONE_RINGS.includes(code);
/** The Lord of the Rings Saga scenarios of The Black Riders. */
export const BLACK_RIDERS_SCENARIO_IDS: readonly string[] = [
  "a-shadow-of-the-past",
  "a-knife-in-the-dark",
  "flight-to-the-ford",
];
/** The Lord of the Rings Saga scenarios of The Road Darkens. */
export const ROAD_DARKENS_SCENARIO_IDS: readonly string[] = [
  "the-ring-goes-south",
  "journey-in-the-dark",
  "breaking-of-the-fellowship",
];
/** The Treason of Saruman's Fellowship-sphere Aragorn, who stands in for the Ring-bearer. */
export const TOS_ARAGORN = "143001";
/** The Lord of the Rings Saga scenarios of The Treason of Saruman. */
export const TREASON_SARUMAN_SCENARIO_IDS: readonly string[] = [
  "the-uruk-hai",
  "helms-deep",
  "the-road-to-isengard",
];
export const isTreasonSarumanScenarioId = (id: string | undefined) =>
  !!id && TREASON_SARUMAN_SCENARIO_IDS.includes(id);
/** The Lord of the Rings Saga scenarios of The Land of Shadow. */
export const LAND_SHADOW_SCENARIO_IDS: readonly string[] = [
  "the-passage-of-the-marshes",
  "journey-to-the-cross-roads",
  "shelobs-lair",
];
export const isLandShadowScenarioId = (id: string | undefined) =>
  !!id && LAND_SHADOW_SCENARIO_IDS.includes(id);
/** The Flame of the West's Fellowship-sphere Aragorn, who stands in for the Ring-bearer. */
export const FLAME_WEST_ARAGORN = "145001";
/** The Lord of the Rings Saga scenarios of The Flame of the West. */
export const FLAME_WEST_SCENARIO_IDS: readonly string[] = [
  "the-passing-of-the-grey-company",
];
export const isFlameWestScenarioId = (id: string | undefined) =>
  !!id && FLAME_WEST_SCENARIO_IDS.includes(id);
/** The Fellowship Aragorn of a Saga box, if its scenarios place him. */
export const fellowshipAragornCode = (id: string | undefined) =>
  isTreasonSarumanScenarioId(id)
    ? TOS_ARAGORN
    : isFlameWestScenarioId(id)
      ? FLAME_WEST_ARAGORN
      : undefined;
/** Standalone scenarios played with the Saga's Ring-bearer rules. */
export const LOTR_SAGA_STANDALONE_IDS: readonly string[] = [
  "the-old-forest",
  "fog-on-the-barrow-downs",
];
export const LOTR_SAGA_SCENARIO_IDS: readonly string[] = [
  ...BLACK_RIDERS_SCENARIO_IDS,
  ...LOTR_SAGA_STANDALONE_IDS,
  ...ROAD_DARKENS_SCENARIO_IDS,
  ...TREASON_SARUMAN_SCENARIO_IDS,
  ...LAND_SHADOW_SCENARIO_IDS,
  ...FLAME_WEST_SCENARIO_IDS,
];
export const isLotrSagaScenarioId = (id: string | undefined) =>
  !!id && LOTR_SAGA_SCENARIO_IDS.includes(id);
/**
 * The Fellowship hero a Saga scenario places at setup, and The One Ring he
 * carries: The Treason of Saruman places Aragorn without The One Ring.
 */
export const sagaRingCards = (
  id: string | undefined,
): { frodo: string; ring?: string } =>
  fellowshipAragornCode(id)
    ? { frodo: fellowshipAragornCode(id)! }
    : isLandShadowScenarioId(id)
      ? { frodo: LAND_SHADOW_FRODO, ring: LAND_SHADOW_ONE_RING }
      : !!id && ROAD_DARKENS_SCENARIO_IDS.includes(id)
        ? { frodo: ROAD_DARKENS_FRODO, ring: ROAD_DARKENS_ONE_RING }
        : { frodo: SAGA_FRODO, ring: ONE_RING };
/** Every Fellowship-sphere Ring-bearer a Saga scenario may place. */
export const RING_BEARERS: readonly string[] = [
  SAGA_FRODO,
  ROAD_DARKENS_FRODO,
  LAND_SHADOW_FRODO,
];
export const isRingBearerCode = (code: string) => RING_BEARERS.includes(code);
