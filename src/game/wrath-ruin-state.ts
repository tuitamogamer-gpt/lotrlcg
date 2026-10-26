import type { GameState, Unit } from "./types";
import { wrathRuinPublicState, wrathRuinUnits } from "./wrath-ruin-support";
import {
  wrathRuinPlayerPublicState,
  wrathRuinPlayerUnits,
} from "./wrath-ruin-player-support";
import {
  burglarContractPublicState,
  burglarContractUnits,
} from "./burglar-contract-support";

/** Includes controlled locations for independent physical-card inventory checks. */
export function wrathRuinAllUnits(s: GameState): Unit[] {
  return [
    ...wrathRuinUnits(s),
    ...wrathRuinPlayerUnits(s),
    ...burglarContractUnits(s),
  ];
}

/** Controlled locations already belong to the shared in-play unit collection. */
export function wrathRuinSavedExtraUnits(s: GameState): Unit[] {
  const q = s.wrathRuin;
  return [
    ...(q?.pendingExplored ?? []),
    ...(q?.resolving ?? []),
    ...(q?.looked ?? []),
    ...(q?.storedCards.flatMap((group) => group.cards) ?? []),
    ...wrathRuinPlayerUnits(s),
    ...burglarContractUnits(s),
  ];
}

export function wrathRuinAllPublicState(s: GameState) {
  const wrathRuin = wrathRuinPublicState(s),
    wrathRuinPlayers = wrathRuinPlayerPublicState(s),
    burglarContract = burglarContractPublicState(s);
  return {
    ...(wrathRuin ? { wrathRuin } : {}),
    ...(wrathRuinPlayers ? { wrathRuinPlayers } : {}),
    ...(burglarContract ? { burglarContract } : {}),
  };
}
