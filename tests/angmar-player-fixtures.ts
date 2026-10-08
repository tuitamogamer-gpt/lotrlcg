import { base } from "./against-shadow-final-fixtures";
import { make } from "../src/game/core";
import { activeSeat, forOwner, playerOrder } from "../src/game/table";
import { ANGMAR as A } from "../src/game/angmar-player-support";
import type { Attachment, GameState, Unit } from "../src/game/types";

export function angmarFixture(players = 1) {
  const s = base("mirkwood", players);
  s.heroes = [make(s, A.arwen), make(s, A.dori), make(s, A.amarthiul)];
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
export function angmarAlly(s: GameState, code: string, player = activeSeat(s)) {
  let u: Unit;
  forOwner(s, player, () => {
    u = make(s, code);
    s.allies.push(u);
  });
  return u!;
}
export function angmarHand(s: GameState, code: string, player = activeSeat(s)) {
  let u: Unit;
  forOwner(s, player, () => {
    u = make(s, code);
    s.hand.push(u);
  });
  return u!;
}
export function angmarAttach(
  s: GameState,
  u: Unit,
  code: string,
  owner = activeSeat(s),
  controller = owner,
): Attachment {
  const a = { id: `a${s.nextId++}`, code, owner, controller, exhausted: false };
  u.attachments.push(a);
  return a;
}
