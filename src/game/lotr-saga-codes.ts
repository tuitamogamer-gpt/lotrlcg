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
/** Every One Ring objective a Saga scenario may place. */
export const ONE_RINGS: readonly string[] = [ONE_RING, ROAD_DARKENS_ONE_RING];
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
/** Standalone scenarios played with the Saga's Ring-bearer rules. */
export const LOTR_SAGA_STANDALONE_IDS: readonly string[] = ["the-old-forest"];
export const LOTR_SAGA_SCENARIO_IDS: readonly string[] = [
  ...BLACK_RIDERS_SCENARIO_IDS,
  ...LOTR_SAGA_STANDALONE_IDS,
  ...ROAD_DARKENS_SCENARIO_IDS,
];
export const isLotrSagaScenarioId = (id: string | undefined) =>
  !!id && LOTR_SAGA_SCENARIO_IDS.includes(id);
/** The Ring-bearer and The One Ring that a Saga scenario places at setup. */
export const sagaRingCards = (id: string | undefined) =>
  !!id && ROAD_DARKENS_SCENARIO_IDS.includes(id)
    ? { frodo: ROAD_DARKENS_FRODO, ring: ROAD_DARKENS_ONE_RING }
    : { frodo: SAGA_FRODO, ring: ONE_RING };
/** Every Fellowship-sphere Ring-bearer a Saga scenario may place. */
export const RING_BEARERS: readonly string[] = [SAGA_FRODO, ROAD_DARKENS_FRODO];
export const isRingBearerCode = (code: string) => RING_BEARERS.includes(code);
