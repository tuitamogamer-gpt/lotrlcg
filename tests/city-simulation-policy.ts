import { card } from "../src/game/cards";
import { canTravel, stats } from "../src/game/engine";
import { allCharacters } from "../src/game/table";
import type { Action, GameState, Option } from "../src/game/types";

/** Decisions consult only public faces and currently presented legal options. */
export function citySimulationChoice(s: GameState): Option | undefined {
  if (!s.city || !s.choice) return;
  const { title, options } = s.choice;
  if (/Sailing test|Prepare the fleet/.test(title)) return;
  if (/Search.*(?:enemy|Corsair)|chooses an enemy/i.test(title))
    return [...options].sort((a, b) => {
      const ac = a.code ? card(a.code) : undefined;
      const bc = b.code ? card(b.code) : undefined;
      return (
        (ac?.attack ?? 0) +
        (ac?.threat ?? 0) -
        (bc?.attack ?? 0) -
        (bc?.threat ?? 0)
      );
    })[0];
  if (/assign.*damage|damage.*character/i.test(title))
    return [...options].sort((a, b) => {
      const ac = allCharacters(s).find((u) => u.id === a.id);
      const bc = allCharacters(s).find((u) => u.id === b.id);
      return (
        (bc ? stats(s, bc).health - bc.damage : 0) -
        (ac ? stats(s, ac).health - ac.damage : 0)
      );
    })[0];
  if (
    /Stormcaller/.test(title) &&
    options.some((o) => /return.*staging/i.test(o.label))
  )
    return options.find((o) => /return.*staging/i.test(o.label));
}

export function citySimulationAction(s: GameState): Action | undefined {
  if (!s.city || s.choice || s.flow?.pending || s.phase !== "travel") return;
  if (s.activeLocation) return { type: "NEXT" };
  const destination = s.staging
    .filter((u) => !canTravel(s, u))
    .sort((a, b) => (card(b.code).threat ?? 0) - (card(a.code).threat ?? 0))[0];
  return destination
    ? { type: "TRAVEL", id: destination.id }
    : { type: "NEXT" };
}
