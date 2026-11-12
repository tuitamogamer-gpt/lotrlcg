// Printed identities of The Lord of the Rings Saga framework; no runtime dependencies.
import sagaCards from "../data/lotr-saga-cards.json";

/** The Black Riders' Fellowship-sphere Frodo Baggins, the first Ring-bearer. */
export const SAGA_FRODO = "141001";
/** The One Ring objective of The Black Riders. */
export const ONE_RING = sagaCards.find((c) => c.name === "The One Ring")!.code;
/** The Lord of the Rings Saga scenarios of The Black Riders. */
export const BLACK_RIDERS_SCENARIO_IDS: readonly string[] = [
  "a-shadow-of-the-past",
  "a-knife-in-the-dark",
  "flight-to-the-ford",
];
export const LOTR_SAGA_SCENARIO_IDS: readonly string[] = [
  ...BLACK_RIDERS_SCENARIO_IDS,
];
export const isLotrSagaScenarioId = (id: string | undefined) =>
  !!id && LOTR_SAGA_SCENARIO_IDS.includes(id);
/** Every Fellowship-sphere Ring-bearer a Saga scenario may place. */
export const RING_BEARERS: readonly string[] = [SAGA_FRODO];
export const isRingBearerCode = (code: string) => RING_BEARERS.includes(code);
