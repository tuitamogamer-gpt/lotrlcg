import type { Unit } from "./types";

export interface BurglarContractState {
  contracts: { player: number; unit: Unit; side: "B"; loot: Unit[] }[];
  /** Metadata only: the physical guarded objectives are attachments on locations. */
  guarded: { locationId: string; attachmentId: string; player: number }[];
  /** Explored loot stays physical while its optional destination is chosen. */
  claims: {
    locationId: string;
    unit: Unit;
    remainingPlayers: number[];
    regularGuarded?: boolean;
    /** Controller of an ordinary Guarded card before contract choices. */
    regularPlayer?: number;
    fallback?: boolean;
  }[];
}
