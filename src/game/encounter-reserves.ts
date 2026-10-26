/** Current published Encounter rule: up to three copies of each card per player.
 * MEC107 Angmar Awakened Hero Expansion rules, page 2; older saved allocations
 * remain valid. Relevant enabling events select each reserve independently.
 */
export function encounterReserveDefaults(deck: readonly string[]): {
  rangers: number;
  wind: number;
  eagles: number;
  bombadil?: number;
} {
  const wind = deck.includes("17140"),
    eagles = deck.includes("19032"),
    rangers = deck.includes("09007"),
    bombadil = deck.includes("22005");
  return {
    rangers: rangers || (!wind && !eagles && !bombadil) ? 3 : 0,
    wind: wind ? 3 : 0,
    eagles: eagles ? 3 : 0,
    ...(bombadil ? { bombadil: 3 } : {}),
  };
}
