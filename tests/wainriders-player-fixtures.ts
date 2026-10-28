import { make } from "../src/game/core";
import { card, playerCards } from "../src/game/cards";
import { forOwner } from "../src/game/table";
import { WAINRIDERS_PLAYER as P } from "../src/game/wainriders-player-support";
import type { GameState } from "../src/game/types";
export {
  fixture,
  act,
  hand,
  ally,
  attach,
  play,
  pick,
  reload,
  settle,
  ring,
} from "./shadow-east-player-fixtures";
const attachments = playerCards
  .filter(
    (c) =>
      c.type_code === "attachment" &&
      !c.is_unique &&
      (c.deck_limit ?? 3) >= 3 &&
      c.code !== "21001",
  )
  .slice(0, 17);
export const WANDERER_DECK = {
  ...Object.fromEntries(attachments.map((c, i) => [c.code, i === 16 ? 2 : 3])),
  [P.wanderer]: 1,
};
export function wanderer(s: GameState, p = 0) {
  let c!: NonNullable<GameState["wainridersPlayers"]>["contracts"][number];
  forOwner(s, p, () => {
    s.heroes = s.heroes.slice(0, 1);
    const unit = make(s, P.wanderer);
    unit.owner = p;
    c = {
      unit,
      player: p,
      hero: s.heroes[0].id,
      heroCode: s.heroes[0].code,
      side: "B",
    };
    (s.wainridersPlayers ??= {
      contracts: [],
      horns: [],
      scout: [],
    }).contracts.push(c);
  });
  return c;
}
