import { base, setStage } from "./long-arm-mordor-fixtures";
import { MORDOR as M } from "../src/game/long-arm-mordor-support";
import { make } from "../src/game/core";
import { allCharacters, forOwner, playerOrder, syncSeat } from "../src/game/table";
import type { GameState } from "../src/game/types";
export { base, setStage };
export function mordorQuestFixture(stage = 1, players = 1) {
  const s = base(players); setStage(s, stage); s.phase = "staging";
  for (const p of playerOrder(s)) forOwner(s, p, () => {
    s.heroes[0].committed = true; s.heroes[0].exhausted = true;
    s.heroes[0].tempWill = 30; s.committedIds = [s.heroes[0].id];
  });
  if (stage === 2) {
    for (const p of playerOrder(s)) {
      const h = s.mordor!.captured.find((h) => h.owner === p)!;
      s.mordor!.captured = s.mordor!.captured.filter((u) => u.id !== h.id);
      delete h.blanked; delete h.immuneToPlayerEffects;
      forOwner(s, p, () => { s.heroes.push(h); });
    }
    s.encounterDeck = Array(8).fill(M.uruk);
  }
  syncSeat(s); return s;
}
export function mordorGuardFixture() {
  const s = base(); setStage(s, 3); s.phase = "attack";
  const hero = s.mordor!.captured[0];
  for (const h of s.mordor!.captured.slice(1)) s.removed.push(h.code);
  s.mordor!.captured = [hero];
  const enemy = make(s, M.uruk); s.engaged.push(enemy);
  s.mordor!.guarding[hero.id] = enemy.id; s.heroes[0].tempAttack = 30;
  return { s, enemy, hero, attacker: s.heroes[0] };
}
export function mordorFinalFixture(loss = false) {
  const s = base(); setStage(s, 4); s.phase = loss ? "defense" : "attack";
  // The original heroes have fallen in earlier stages; none remains guarded.
  s.discard.push(...s.mordor!.captured.map((h) => h.code)); s.mordor!.captured = [];
  const index = s.mordor!.setAside.findIndex((u) => u.code === M.chieftain);
  const enemy = s.mordor!.setAside.splice(index, 1)[0]; s.engaged.push(enemy);
  if (loss) { enemy.tempAttack = 30; s.heroes[0].damage = 2; }
  else { s.heroes[0].tempAttack = 30; s.progress = 15; }
  return { s, enemy, hero: s.heroes[0] };
}
export function mordorShadowFixture(code: string, allyDefender = false) {
  const s = base(); setStage(s, 2); s.phase = "defense";
  const enemy = make(s, M.uruk); enemy.shadows = [code]; enemy.tempAttack = 2; s.engaged.push(enemy);
  // Faramir's 2 willpower satisfies Uruk of Mordor's printed defender restriction.
  const defender = allyDefender ? make(s, "01014") : s.heroes[0];
  if (allyDefender) { defender.damage = 2; s.allies.push(defender); }
  s.encounterDeck = [M.hut, M.hut]; return { s, enemy, defender };
}
export function mordorWargFixture() {
  const s = base(); s.phase = "quest"; s.encounterDeck = [M.warg, M.hut];
  const enemy = make(s, M.uruk); s.engaged.push(enemy);
  return { s, enemy, hero: allCharacters(s)[0] };
}
