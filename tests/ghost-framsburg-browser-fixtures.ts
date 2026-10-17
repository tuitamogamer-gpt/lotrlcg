import { base, setStage } from "./ghost-framsburg-fixtures";
import { GHOST_FRAMSBURG as G } from "../src/game/ghost-framsburg-support";
import { make } from "../src/game/core";
import { syncSeat } from "../src/game/table";
export function ghostDiscover() {
  const s = base();
  s.phase = "travel";
  const location = make(s, G.hall);
  s.staging.push(location);
  s.encounterDeck = [G.key, G.lantern, G.spectre, G.moonlit];
  syncSeat(s);
  return { s, location };
}
export function ghostClaim() {
  const s = base();
  s.phase = "quest";
  const location = make(s, G.hall),
    loot = make(s, G.key);
  s.activeLocation = location;
  s.ghostFramsburg!.loot.push({ unit: loot, guardId: location.id });
  s.encounterDeck = [G.moonlit, ...Array(20).fill(G.moonlit)];
  const hero = s.heroes[0];
  hero.tempWill = 9;
  syncSeat(s);
  return { s, location, loot, hero };
}
export function ghostBoss() {
  const s = base();
  setStage(s, 3);
  s.phase = "attack";
  s.progress = 6;
  s.victoryCards = [G.tomb];
  s.victory = 5;
  const boss = make(s, G.shade);
  boss.damage = 5;
  s.engaged.push(boss);
  const hero = s.heroes[0];
  hero.tempAttack = 20;
  syncSeat(s);
  return { s, boss, hero };
}
export function ghostAbilities() {
  const s = base(),
    hero = s.heroes[0];
  s.activeLocation = make(s, G.moonlit);
  const lantern = make(s, G.lantern),
    teeth = make(s, G.teeth);
  hero.attachments.push(
    ...[lantern, teeth].map((u) => ({
      id: u.id,
      code: u.code,
      exhausted: false,
      owner: 0,
      controller: 0,
    })),
  );
  s.deck = ["01013", "01014", "01015", "01016"];
  syncSeat(s);
  return { s, hero, lantern, teeth };
}
export function ghostReveal(code: string) {
  const s = base();
  s.phase = "quest";
  const hero = s.heroes[0];
  hero.tempWill = 20;
  s.activeLocation = make(s, G.moonlit);
  s.encounterDeck = [code, ...Array(20).fill(G.moonlit)];
  syncSeat(s);
  return { s, hero };
}
