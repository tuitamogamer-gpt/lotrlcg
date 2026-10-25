import type { Unit } from "./types";

/** Physical setup cards are outside draw decks and survive saved decisions. */
export interface ShadowEastPlayersState {
  contracts: { player: number; unit: Unit; side: "A" | "B" }[];
  pendingRings: { player: number; unit: Unit }[];
  ring?: { player: number; id: string; heroId: string };
  /** Extra cards gained before the six-card opening hand are not mulliganed. */
  setupHandIds?: Record<number, string[]>;
  smeagol?: { id: string; owner: number; stinkersAdded: boolean };
}
