import type { Unit } from "./types";
export interface UlfastPlayersState {
  contracts: { player: number; unit: Unit; side: "A" | "B" }[];
  attackBonuses: { hero: string; enemy: string; value: number }[];
}
