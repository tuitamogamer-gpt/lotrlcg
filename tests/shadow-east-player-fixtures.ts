import { fixture as previous } from "./ered-final-player-fixtures";
import { make } from "../src/game/core";
import { forOwner, syncSeat } from "../src/game/table";
import { SHADOW_EAST_PLAYER as P } from "../src/game/shadow-east-player-support";
import type { GameState } from "../src/game/types";
export {
  act,
  pick,
  hand,
  ally,
  attach,
  play,
  reload,
  settle,
} from "./ered-final-player-fixtures";
export function fixture(players = 1) {
  const s = previous(players);
  forOwner(s, 0, () => {
    s.heroes = [P.frodo, "01004", "01012"].map((code) => make(s, code));
    s.startingHeroes = s.heroes.map((h) => h.code);
    for (const h of s.heroes) {
      h.resources = 15;
      h.phaseResourceIcons = ["leadership", "lore", "spirit", "tactics"];
    }
  });
  syncSeat(s);
  return s;
}
export function ring(s: GameState, player = 0) {
  let host!: GameState["heroes"][number];
  forOwner(s, player, () => {
    host = s.heroes[0];
    const id = `a${s.nextId++}`;
    host.attachments.push({
      id,
      code: P.ring,
      owner: player,
      controller: player,
      exhausted: false,
    });
    s.shadowEastPlayers ??= { contracts: [], pendingRings: [] };
    s.shadowEastPlayers.ring = { id, heroId: host.id, player };
  });
  syncSeat(s);
  return host;
}
export function fellowship(s: GameState, player = 0, side: "A" | "B" = "A") {
  s.shadowEastPlayers ??= { contracts: [], pendingRings: [] };
  forOwner(s, player, () =>
    s.shadowEastPlayers!.contracts.push({
      player,
      unit: make(s, P.fellowship),
      side,
    }),
  );
}
