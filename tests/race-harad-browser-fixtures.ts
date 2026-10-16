import { base, setStage } from "./race-harad-fixtures";
import { RACE_HARAD as R } from "../src/game/race-harad-support";
import { raceHaradSyncArea } from "../src/game/race-harad";
import { fx, make, prepend } from "../src/game/core";
import { placeEncounter } from "../src/game/board";
import { flush } from "../src/game/effects";
import { forOwner, playerOrder, syncSeat } from "../src/game/table";
export { base, setStage };
export function raceSetup(players = 2) { return base(players); }
/** The real encounter placement opens the native saved physical Mount choice. */
export function raceWarg() {
  const s = base(); const target = make(s, R.uruk); s.staging.push(target);
  placeEncounter(s, R.racingWarg, false, 0, undefined, true); flush(s); syncSeat(s); return { s, target };
}
export function raceReveal(code: string) {
  const s = base(); s.phase = "quest"; s.encounterDeck = [code, ...Array(12).fill(R.erg)];
  const target = make(s, R.uruk); s.staging.push(target); s.activeLocation = make(s, R.expanse);
  if (code === R.sandstorm) s.hand = [make(s, "01073")];
  if (code === R.pursuers) s.encounterDeck = [code, R.erg, R.erg, R.pursuer, ...Array(8).fill(R.erg)];
  syncSeat(s); return { s, target, hero: s.heroes[0] };
}
export function raceQuest(stage = 2, enemyStage = 1) {
  const s = base(); setStage(s, stage, enemyStage); s.phase = "staging"; s.encounterDeck = [R.pursuer, ...Array(10).fill(R.erg)]; s.heroes[0].committed = true; s.heroes[0].exhausted = true; s.heroes[0].tempWill = 40;
  if (stage === 2) s.progress = 14;
  if (stage === 3) s.progress = 19;
  if (stage === 4) { s.progress = 19; const i = s.raceHarad!.setAside.findIndex((u) => u.code === R.river); const river = s.raceHarad!.setAside.splice(i, 1)[0]; river.progress = 9; s.activeLocation = river; }
  syncSeat(s); return { s, hero: s.heroes[0] };
}
export function racePursuit(caught = false) {
  const s = base(); setStage(s, 2, caught ? 2 : 1); s.phase = "staging";
  const chief = make(s, R.chief); chief.id = s.raceHarad!.chieftainId; chief.raceHaradArea = true; s.raceHarad!.area.push(chief); raceHaradSyncArea(s); s.encounterDeck = [R.road, ...Array(8).fill(R.erg)]; s.raceHarad!.enemyProgress = caught ? 14 : 9;
  // Equal quest totals resolve normally, then the actual quest-end Forced runs.
  s.heroes[0].committed = true; s.heroes[0].tempWill = caught ? 3 : 0; syncSeat(s); return { s, chief };
}
export function raceTravel(code: string, players = 1) {
  const s = base(players); setStage(s, code === R.river ? 4 : 2, 1); s.phase = "travel"; s.encounterDeck = Array(15).fill(R.erg);
  const i = s.raceHarad!.setAside.findIndex((u) => u.code === code), location = i >= 0 ? s.raceHarad!.setAside.splice(i, 1)[0] : make(s, code);
  s.staging.push(location); if (code === R.river) s.progress = 20; syncSeat(s); return { s, location };
}
export function raceShadow(code: string, kill = false) {
  const s = base(); setStage(s, 4, 1); s.phase = "defense"; s.encounterDeck = Array(10).fill(R.erg); const enemy = make(s, R.uruk); enemy.shadows = [code]; s.engaged.push(enemy);
  const defender = kill ? make(s, "01013") : s.heroes[0]; if (kill) { defender.tempWill = 3; s.allies.push(defender); } else defender.tempDefense = 10; syncSeat(s); return { s, enemy, defender };
}
export function raceMountDeath(players = 1) {
  const s = base(players); s.phase = "defense"; const enemy = make(s, R.uruk); enemy.tempAttack = 100; s.engaged.push(enemy);
  for (const player of playerOrder(s)) forOwner(s, player, () => { for (const h of s.heroes) h.tempDefense = 0; }); syncSeat(s); return { s, enemy };
}
export function raceEndQuestQueued() { const s = base(); prepend(s, fx("raceHaradEnemyRound")); return s; }
