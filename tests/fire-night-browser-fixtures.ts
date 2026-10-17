import { base, revealSide } from "./fire-night-fixtures";
import { FIRE_NIGHT as F } from "../src/game/fire-night-support";
import { make } from "../src/game/core";
import { syncSeat } from "../src/game/table";
export function firePlanning(loss = false) {
  const s = base();
  const q = s.fireNight!,
    i = q.sideDeck.findIndex((u) => u.code === F.hold);
  q.sideDeck.unshift(q.sideDeck.splice(i, 1)[0]);
  if (loss) q.hillDamage = 49;
  syncSeat(s);
  return { s };
}
export function fireVictory() {
  const s = base(),
    side = revealSide(s, F.face),
    hero = s.heroes[0];
  s.phase = "staging";
  s.staging[0].damage = 15;
  s.fireNight!.nonQuestDamage = { round: s.round, amount: 1 };
  hero.committed = true;
  hero.exhausted = true;
  hero.tempWill = 30;
  s.committedIds = [hero.id];
  s.sideQuestSelections = { shared: { id: side.id, code: side.code } };
  syncSeat(s);
  return { s, side, hero };
}
export function fireTravel(code = F.palisade) {
  const s = base();
  s.phase = "travel";
  const location = make(s, code);
  s.staging.push(location);
  s.heroes[0].exhausted = true;
  syncSeat(s);
  return { s, location, hero: s.heroes[0] };
}
export function fireReveal(code = F.orc) {
  const s = base();
  s.phase = "quest";
  const hero = s.heroes[0];
  hero.tempWill = 30;
  s.encounterDeck.unshift(code);
  syncSeat(s);
  return { s, hero };
}
export function fireShadow(code = F.wrath) {
  const s = base();
  s.phase = "defense";
  const enemy = make(s, F.orc);
  enemy.owner = 0;
  enemy.shadows = [code];
  enemy.revealedShadowCount = 0;
  enemy.tempAttack = 8;
  s.engaged.push(enemy);
  const hero = s.heroes[0];
  hero.damage = 3;
  hero.tempDefense = 0;
  syncSeat(s);
  return { s, enemy, hero };
}
