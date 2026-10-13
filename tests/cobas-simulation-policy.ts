import { card } from "../src/game/cards";
import { allCharacters } from "../src/game/table";
import { stats } from "../src/game/engine";
import type { GameState, Option } from "../src/game/types";

/** All decisions use presented options and visible cards, never hidden decks. */
export function cobasSimulationChoice(s: GameState): Option | undefined {
  if (!s.cobas || !s.choice) return;
  const { title, options } = s.choice;
  if (/Sailing test|Prepare the fleet/.test(title)) return;
  if (
    /discard.*all|all.*discard/i.test(title) &&
    options.some((o) => o.id === "skip")
  )
    return options.find((o) => o.id === "skip");
  if (/Ship objective|deal 2 damage/i.test(title))
    return [...options].sort((a, b) => {
      const ac = allCharacters(s).find((u) => u.id === a.id);
      const bc = allCharacters(s).find((u) => u.id === b.id);
      return (
        (bc ? stats(s, bc).health - bc.damage : 0) -
        (ac ? stats(s, ac).health - ac.damage : 0)
      );
    })[0];
  if (/Search.*Ship enemy/i.test(title))
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
}
