import { add, base, finale, setStage } from "./roam-rhovanion-fixtures";
import { ROAM_RHOVANION as R } from "../src/game/roam-rhovanion-support";
import { syncSeat } from "../src/game/table";
import { make } from "../src/game/core";
export function roamTravel() {
  const s = base(2);
  setStage(s, R.rescue);
  s.phase = "travel";
  const location = add(s, R.ravine);
  syncSeat(s);
  return { s, location };
}
export function roamReveal() {
  const s = base();
  s.phase = "quest";
  const hero = s.heroes[0];
  s.encounterDeck = [R.weather, ...Array(15).fill(R.slopes)];
  syncSeat(s);
  return { s, hero };
}
export function roamStage() {
  const s = base();
  s.phase = "staging";
  s.activeLocation = make(s, R.slopes);
  s.activeLocation.progress = 3;
  s.heroes[0].committed = true;
  s.heroes[0].exhausted = true;
  s.heroes[0].tempWill = 20;
  syncSeat(s);
  return { s };
}
export function roamVictory() {
  const f = finale();
  f.s.phase = "attack";
  f.s.heroes[0].tempAttack = 20;
  f.s.heroes[1].tempAttack = 20;
  syncSeat(f.s);
  return { ...f, first: f.s.heroes[0], second: f.s.heroes[1] };
}
export function roamLoss() {
  const f = finale();
  f.s.phase = "staging";
  f.s.staging = f.s.engaged.splice(0);
  add(f.s, R.giant);
  syncSeat(f.s);
  return f;
}
export function roamCancellation(code = R.bear) {
  const s = base();
  setStage(s, R.rescue);
  s.phase = "quest";
  const hero = s.heroes[0];
  hero.code = "01007";
  hero.resources = 1;
  const event = make(s, "01050");
  event.owner = 0;
  s.hand = [event];
  s.encounterDeck = [code, ...Array(15).fill(R.slopes)];
  syncSeat(s);
  return { s, hero, event };
}
