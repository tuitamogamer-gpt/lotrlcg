import type { Unit } from "./types";
/** A Perilous Voyage (The Hunt for the Dreadnaught's contract), one per player. */
export interface PerilousVoyageState {
  contracts: { player: number; unit: Unit; side: "A" | "B" }[];
}
