import { base, claim, setStage } from "./black-serpent-fixtures";
import { BLACK_SERPENT as B } from "../src/game/black-serpent-support";
import { make } from "../src/game/core";
import { syncSeat } from "../src/game/table";
export function serpentTravel(code = B.tower, players = 1) {
  const s = base(players);
  s.phase = "travel";
  const location = make(s, code);
  s.staging.push(location);
  s.encounterDeck = [B.guard, B.bastion, B.bastion];
  syncSeat(s);
  return { s, location };
}
export function serpentReveal(code: string, players = 1) {
  const s = base(players);
  s.phase = "quest";
  const hero = s.heroes[0];
  hero.tempWill = 20;
  s.encounterDeck = [code, ...Array(30).fill(B.bastion)];
  claim(s, B.banner);
  syncSeat(s);
  return { s, hero };
}
export function serpentShadow(code: string, players = 1) {
  const s = base(players);
  s.phase = "defense";
  const enemy = make(s, B.guard);
  s.engaged.push(enemy);
  enemy.owner = 0;
  enemy.shadows = [code];
  enemy.revealedShadowCount = 0;
  const defender = s.heroes[1];
  defender.tempDefense = 20;
  s.encounterDeck = [B.bastion, B.bastion];
  s.progress = 3;
  claim(s, B.banner);
  syncSeat(s);
  return { s, enemy, defender };
}
export function serpentQuest(stage = 1) {
  const s = base();
  setStage(s, stage);
  claim(s, B.banner);
  if (stage >= 2) claim(s, B.garb);
  s.phase = "staging";
  s.heroes[0].committed = true;
  s.heroes[0].exhausted = true;
  s.heroes[0].tempWill = 20;
  s.encounterDeck = [B.bastion, B.bastion, B.bastion];
  syncSeat(s);
  return { s };
}
export function serpentBoss(players = 1) {
  const s = base(players);
  setStage(s, 3);
  s.progress = 6;
  s.phase = "attack";
  claim(s, B.banner);
  claim(s, B.garb);
  const boss = s.staging[0],
    objective = s.blackSerpent!.setAside.shift()!;
  boss.attachments.push({
    id: objective.id,
    code: objective.code,
    exhausted: false,
  });
  s.staging = s.staging.filter((u) => u.id !== boss.id);
  s.engaged.push(boss);
  boss.owner = 0;
  s.heroes[0].tempAttack = 30;
  syncSeat(s);
  return { s, boss, hero: s.heroes[0] };
}

export function serpentObjective(code: string) {
  const s = base();
  claim(s, code);
  syncSeat(s);
  return { s };
}
