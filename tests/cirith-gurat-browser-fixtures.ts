import { add, ally, base, setStage } from "./cirith-gurat-fixtures";
import { CIRITH_GURAT as C } from "../src/game/cirith-gurat-support";
import { make } from "../src/game/core";
import { syncSeat } from "../src/game/table";
export function cirithTravel(code = C.gate) {
  const s = base();
  s.phase = "travel";
  const location = add(s, code);
  s.encounterDeck = [C.guard, C.mines, C.mines, C.mines];
  s.deck = ["01013", "01050", "01017", "01050"];
  syncSeat(s);
  return { s, location };
}
export function cirithReveal(code: string) {
  const s = base();
  s.phase = "quest";
  const hero = s.heroes[0];
  hero.tempWill = 0;
  ally(s);
  add(s, C.guard);
  s.encounterDeck = [code, ...Array(30).fill(C.mines)];
  s.deck = ["01050", "01017", "01050"];
  syncSeat(s);
  return { s, hero };
}
export function cirithShadow(code: string) {
  const s = base();
  s.phase = "defense";
  const enemy = make(s, C.guard);
  s.engaged.push(enemy);
  enemy.owner = 0;
  enemy.shadows = [code];
  enemy.revealedShadowCount = 0;
  const defender = ally(s);
  defender.tempDefense = 10;
  s.encounterDeck = [C.mines, C.mines];
  syncSeat(s);
  return { s, enemy, defender };
}
export function cirithQuest(stage = 1) {
  const s = base();
  setStage(s, stage);
  s.phase = "staging";
  s.heroes[0].committed = true;
  s.heroes[0].exhausted = true;
  s.heroes[0].tempWill = 20;
  s.cirithGurat!.sneakResources = 2;
  s.encounterDeck = [C.guard, C.mines, C.mines];
  if (stage === 2) add(s, C.guard);
  syncSeat(s);
  return { s };
}
export function cirithVictory() {
  const s = base();
  setStage(s, 3);
  s.phase = "attack";
  s.progress = 10;
  const guard = add(s, C.guard);
  const captive = make(s, "01013");
  captive.owner = 0;
  s.cirithGurat!.captives.push(captive);
  s.cirithGurat!.guarding[captive.id] = guard.id;
  s.staging = s.staging.filter((u) => u.id !== guard.id);
  guard.owner = 0;
  s.engaged.push(guard);
  s.heroes[0].tempAttack = 30;
  syncSeat(s);
  return { s, guard, hero: s.heroes[0] };
}
