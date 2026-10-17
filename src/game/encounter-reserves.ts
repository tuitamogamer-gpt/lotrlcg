/** Default allocation of the shared three-card Encounter reserve. */
export function encounterReserveDefaults(deck: readonly string[]) {
  const wind = deck.includes("17140"),
    eagles = deck.includes("19032"),
    rangers = deck.includes("09007");
  if (!eagles)
    return {
      wind: wind ? (rangers ? 1 : 3) : 0,
      eagles: 0,
      rangers: wind ? (rangers ? 2 : 0) : 3,
    };
  if (!wind && !rangers) return { wind: 0, eagles: 3, rangers: 0 };
  return {
    wind: wind ? 1 : 0,
    eagles: rangers ? 1 : 2,
    rangers: rangers ? (wind ? 1 : 2) : 0,
  };
}
