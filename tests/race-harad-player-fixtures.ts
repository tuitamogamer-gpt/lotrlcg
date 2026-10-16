import { base } from "./against-shadow-final-fixtures";
import { make } from "../src/game/core";
import { forOwner, playerOrder } from "../src/game/table";
import { RACE_HARAD_PLAYER as P } from "../src/game/race-harad-player-support";
import { playerCards } from "../src/game/cards";
import { createGame } from "../src/game/engine";
export {
  drownedPlayerAlly as raceHaradPlayerAlly,
  drownedPlayerHand as raceHaradPlayerHand,
  drownedPlayerAttach as raceHaradPlayerAttach,
} from "./drowned-player-fixtures";

export function raceHaradPlayerFixture(players = 1) {
  const s = base("mirkwood", players);
  const groups = [
    [P.thurindir, "01001", "01006"],
    ["01007", "01004", "01012"],
    ["01002", "01005", "01009"],
    ["01003", "01008", "01011"],
  ];
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      s.heroes = groups[player].map((code) => ({
        ...make(s, code),
        resources: 10,
        phaseResourceIcons: ["leadership", "tactics", "spirit", "lore"],
      }));
      s.startingHeroes = s.heroes.map((h) => h.code);
    });
  return s;
}

export function raceHaradThurindirSetupFixture() {
  const deck = Object.fromEntries([
    ...playerCards.filter((c) => c.type_code !== "hero" && c.type_code !== "player-side-quest" && (c.deck_limit ?? 3) >= 3)
      .slice(0, 20).map((c) => [c.code, 3]),
    [P.secretWays, 3],
  ]);
  return createGame(91, deck, [P.thurindir, "01001", "01006"], "custom", { scenarioId: "mirkwood" });
}
