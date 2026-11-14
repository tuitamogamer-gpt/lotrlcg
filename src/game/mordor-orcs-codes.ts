// Printed identities of the Orcs of Mordor encounter set; no runtime dependencies.
import encounters from "../data/cirith-ungol-encounter-cards.json";

const code = (title: string) =>
  (encounters as { code: string; name: string }[]).find(
    (c) => c.name === title,
  )!.code;
/** The Orcs of Mordor set of The Mountain of Fire, shared by two scenarios. */
export const MORDOR_ORCS = {
  orc: code("Orc of Mordor"),
  archer: code("Snaga Archer"),
  soldier: code("Uruk Soldier"),
} as const;
