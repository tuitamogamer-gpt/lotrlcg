import type { GameState, Unit } from "./types";
import {
  witheredHeathDragon,
  witheredHeathSigns,
} from "./withered-heath-support";
import { roamRhovanionPublicState } from "./roam-rhovanion-support";
import { ghostFramsburgPublicState } from "./ghost-framsburg-support";

/** Physical cards outside ordinary play zones still participate in save identity checks. */
export function eredScenarioUnits(s: GameState): Unit[] {
  const h = s.witheredHeath,
    r = s.roamRhovanion,
    f = s.fireNight,
    g = s.ghostFramsburg;
  return [
    ...(h
      ? [
          ...h.setAside,
          ...h.cavesDeck,
          ...h.resolving,
          ...h.removed,
          ...h.guards.map((x) => x.sign),
        ]
      : []),
    ...(r
      ? [
          ...r.setAside,
          ...r.removed,
          ...r.guarded.map((x) => x.card),
          ...r.guardedPlayerCards.map((x) => x.card),
          ...r.storedCards.flatMap((x) => x.cards),
        ]
      : []),
    ...(f?.sideDeck ?? []),
    ...(g
      ? [
          ...g.setAside,
          ...g.discoverCards,
          ...g.removed,
          ...g.loot.map((x) => x.unit),
        ]
      : []),
  ];
}

/** Report counts for unrevealed zones; never expose looked-at cards or hidden order. */
export function eredScenarioPublicState(s: GameState) {
  return {
    ...(s.witheredHeath
      ? {
          witheredHeath: {
            initialized: s.witheredHeath.initialized,
            currentQuest: s.witheredHeath.currentQuest,
            questDeck: s.witheredHeath.questDeck.length,
            completedQuests: [...s.witheredHeath.completedQuests],
            setAside: s.witheredHeath.setAside.length,
            cavesDeck: s.witheredHeath.cavesDeck.length,
            resolving: s.witheredHeath.resolving.length,
            removed: s.witheredHeath.removed.length,
            guards: s.witheredHeath.guards.map((x) => ({
              signId: x.sign.id,
              guardId: x.guardId,
            })),
            damageTakenThisRound:
              s.witheredHeath.damageRound === s.round
                ? s.witheredHeath.damageTaken
                : 0,
            dragonDamage: witheredHeathDragon(s)?.damage ?? null,
            dragonSigns: witheredHeathSigns(s),
          },
        }
      : {}),
    ...(s.roamRhovanion ? { roamRhovanion: roamRhovanionPublicState(s) } : {}),
    ...(s.fireNight
      ? {
          fireNight: {
            initialized: s.fireNight.initialized,
            currentQuest: s.fireNight.currentQuest,
            hillDamage: s.fireNight.hillDamage,
            sideDeck: s.fireNight.sideDeck.length,
            resolving: s.fireNight.resolving.length,
            locationProgress: s.fireNight.locationProgress,
          },
        }
      : {}),
    ...(s.ghostFramsburg
      ? { ghostFramsburg: ghostFramsburgPublicState(s) }
      : {}),
  };
}
