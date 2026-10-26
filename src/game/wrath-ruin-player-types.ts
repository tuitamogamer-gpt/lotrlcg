/** Delayed effects and ownership metadata; these are not additional physical cards. */
export interface WrathRuinPlayersState {
  tomDelays: { id: string; player: number }[];
  bombadilloOwners: { id: string; owner: number }[];
}
