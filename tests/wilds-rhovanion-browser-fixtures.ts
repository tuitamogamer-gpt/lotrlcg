import { base, setStage } from "./wilds-rhovanion-fixtures";
import { WILDS_RHOVANION as W } from "../src/game/wilds-rhovanion-support";
import { make } from "../src/game/core";
import { syncSeat } from "../src/game/table";
import type { ScenarioId } from "../src/game/types";
export function wildsDeep() {
  const s = base("the-kings-quest");
  s.phase = "travel";
  const location = make(s, W.tunnel);
  s.staging.push(location);
  const cave = s.wildsRhovanion!.cavesDeck[0];
  cave.code = W.lake;
  s.wildsRhovanion!.cavesDeck = [cave];
  syncSeat(s);
  return { s, location, cave };
}
export function wildsBranch(code = W.hilltop) {
  const s = base("lost-in-mirkwood");
  s.phase = "travel";
  const location = make(s, code);
  s.staging.push(location);
  s.encounterDeck = Array(30).fill(W.twilight);
  s.wildsRhovanion!.pendingGuarded = [];
  syncSeat(s);
  return { s, location };
}
export function wildsBoss() {
  const s = base("the-kings-quest");
  setStage(s, 3);
  s.phase = "attack";
  s.progress = 1;
  const boss = s.wildsRhovanion!.setAside.splice(
    s.wildsRhovanion!.setAside.findIndex((u) => u.code === W.drake),
    1,
  )[0];
  boss.owner = 0;
  boss.damage = 16;
  s.engaged.push(boss);
  s.heroes[0].tempAttack = 30;
  syncSeat(s);
  return { s, boss, hero: s.heroes[0] };
}
export function wildsReveal(
  code: string,
  id: ScenarioId = "journey-up-the-anduin",
) {
  const s = base(id);
  s.phase = "quest";
  const hero = s.heroes[0];
  hero.tempWill = 20;
  s.encounterDeck = [
    code,
    ...Array(30).fill(id === "the-kings-quest" ? W.contested : W.lonely),
  ];
  syncSeat(s);
  return { s, hero };
}
