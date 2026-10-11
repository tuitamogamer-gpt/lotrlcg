import { base } from "./against-shadow-final-fixtures";
import { make } from "../src/game/core";
import { activeSeat, forOwner, playerOrder } from "../src/game/table";
import { STORMCALLER_PLAYER as P } from "../src/game/stormcaller-player-support";
import type { Attachment, GameState, Unit } from "../src/game/types";

export function stormcallerPlayerFixture(players = 1) {
  const s = base("mirkwood", players);
  s.heroes = [make(s, P.denethor), make(s, "08084"), make(s, "01001")];
  s.startingHeroes = s.heroes.map((u) => u.code);
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
export function stormcallerPlayerAlly(
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
export function stormcallerPlayerHand(
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
export function stormcallerPlayerAttach(
  s: GameState,
  u: Unit,
  code: string,
  owner = activeSeat(s),
): Attachment {
  const a = { id: `a${s.nextId++}`, code, owner, exhausted: false };
  u.attachments.push(a);
  return a;
}
