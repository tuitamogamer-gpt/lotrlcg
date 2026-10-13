import { base } from "./against-shadow-final-fixtures";
import { make } from "../src/game/core";
import { activeSeat, forOwner, playerOrder } from "../src/game/table";
import { DROWNED_PLAYER as P } from "../src/game/drowned-player-support";
import type { Attachment, GameState, Unit } from "../src/game/types";

export function drownedPlayerFixture(players = 1) {
  const s = base("mirkwood", players);
  s.heroes = [make(s, P.argalad), make(s, "01001"), make(s, "01004")];
  s.startingHeroes = s.heroes.map((u) => u.code);
  if (s.table)
    forOwner(s, 1, () => {
      s.heroes = [make(s, "01007"), make(s, "01006"), make(s, "01012")];
      s.startingHeroes = s.heroes.map((u) => u.code);
    });
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      for (const hero of s.heroes) {
        hero.resources = 10;
        hero.phaseResourceIcons = ["leadership", "tactics", "spirit", "lore"];
      }
    });
  s.queue = [];
  s.choice = null;
  return s;
}
export function drownedPlayerAlly(
  s: GameState,
  code: string,
  player = activeSeat(s),
) {
  let u!: Unit;
  forOwner(s, player, () => {
    u = make(s, code);
    s.allies.push(u);
  });
  return u;
}
export function drownedPlayerHand(
  s: GameState,
  code: string,
  player = activeSeat(s),
) {
  let u!: Unit;
  forOwner(s, player, () => {
    u = make(s, code);
    s.hand.push(u);
  });
  return u;
}
export function drownedPlayerAttach(
  s: GameState,
  host: Unit,
  code: string,
  owner = activeSeat(s),
): Attachment {
  const attachment = { id: "a" + s.nextId++, code, owner, exhausted: false };
  host.attachments.push(attachment);
  return attachment;
}
