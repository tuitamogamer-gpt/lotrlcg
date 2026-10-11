import { base } from "./against-shadow-final-fixtures";
import { make } from "../src/game/core";
import { activeSeat, forOwner, playerOrder } from "../src/game/table";
import { DEPTHS_PLAYER as P } from "../src/game/depths-player-support";
import type { Attachment, GameState, Unit } from "../src/game/types";

export function depthsPlayerFixture(players = 1) {
  const s = base("mirkwood", players);
  s.heroes = [make(s, P.lanwyn), make(s, "12001"), make(s, "01004")];
  s.startingHeroes = s.heroes.map((u) => u.code);
  if (s.table)
    forOwner(s, 1, () => {
      s.heroes = [make(s, "01012"), make(s, "01011"), make(s, "01007")];
      s.startingHeroes = s.heroes.map((u) => u.code);
    });
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      for (const h of s.heroes) {
        h.resources = 10;
        h.phaseResourceIcons = ["leadership", "tactics", "spirit", "lore"];
      }
    });
  s.queue = [];
  s.choice = null;
  return s;
}
export function depthsPlayerAlly(
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
export function depthsPlayerHand(
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
export function depthsPlayerAttach(
  s: GameState,
  host: Unit,
  code: string,
  owner = activeSeat(s),
): Attachment {
  const a = { id: "a" + s.nextId++, code, owner, exhausted: false };
  host.attachments.push(a);
  return a;
}
