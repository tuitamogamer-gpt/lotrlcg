// Printed identities of the Deep Shadows encounter set; no runtime dependencies.
import encounters from "../data/cirith-ungol-encounter-cards.json";

const code = (title: string) =>
  (encounters as { code: string; name: string }[]).find(
    (c) => c.name === title,
  )!.code;
/** The Deep Shadows set of The Mountain of Fire, shared by two scenarios. */
export const DEEP_SHADOWS = {
  drawn: code("Drawn to the Ring"),
  deep: code("Deep Shadows"),
  vigilance: code("Evil Vigilance"),
} as const;
export const DEEP_SHADOWS_TREACHERIES: readonly string[] =
  Object.values(DEEP_SHADOWS);
