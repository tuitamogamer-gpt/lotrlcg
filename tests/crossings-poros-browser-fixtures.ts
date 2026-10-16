import { base, setStage } from "./crossings-poros-fixtures";
import { CROSSINGS_POROS as P } from "../src/game/crossings-poros-support";
import { make } from "../src/game/core";
import { syncSeat } from "../src/game/table";
export function porosTravel(code = P.land) {
  const s = base();
  setStage(s);
  s.phase = "travel";
  const location = make(s, code);
  s.staging.push(location);
  syncSeat(s);
  return { s, location };
}
export function porosReveal(code: string) {
  const s = base();
  setStage(s);
  s.phase = "quest";
  const hero = s.heroes[0];
  hero.tempWill = 30;
  s.encounterDeck = [code, ...Array(30).fill(P.waste)];
  syncSeat(s);
  return { s, hero };
}
export function porosQuest(code = P.desert) {
  const s = base();
  setStage(s, code);
  s.phase = "staging";
  const hero = s.heroes[0];
  hero.committed = true;
  hero.exhausted = true;
  hero.tempWill = 40;
  syncSeat(s);
  return { s, hero };
}
export function porosShadow(code: string, killed = false) {
  const s = base();
  setStage(s, P.battle);
  s.phase = "defense";
  const enemy = make(s, P.outrider);
  enemy.owner = 0;
  enemy.shadows = [code];
  enemy.revealedShadowCount = 0;
  s.engaged.push(enemy);
  const defender = s.heroes[1];
  defender.tempDefense = killed ? 0 : 20;
  if (killed) {
    defender.damage = 3;
    enemy.tempAttack = 30;
  }
  s.encounterDeck = [P.waste, P.waste];
  syncSeat(s);
  return { s, enemy, defender };
}
export function porosBoss() {
  const s = base();
  setStage(s, P.battle);
  s.phase = "attack";
  s.progress = 20;
  const g = s.allies.find((u) => u.code === P.garrison)!;
  const enemy = make(s, P.prowler);
  enemy.owner = 0;
  s.engaged.push(enemy);
  const hero = s.heroes[0];
  hero.tempAttack = 30;
  syncSeat(s);
  return { s, enemy, hero, garrison: g };
}
