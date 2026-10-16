import { base, setStage } from "./mumakil-fixtures";
import { MUMAKIL as M } from "../src/game/mumakil-support";
import { MORDOR } from "../src/game/long-arm-mordor-support";
import { make } from "../src/game/core";
import { forOwner, playerOrder, syncSeat } from "../src/game/table";
import type { GameState } from "../src/game/types";
export { base, setStage };
export function addWild(s: GameState, objective?: string) {
  const i = s.mumakil!.setAside.findIndex((u) => u.code === M.wild);
  const enemy = s.mumakil!.setAside.splice(i, 1)[0]; s.engaged.push(enemy);
  if (objective) { const j = s.mumakil!.setAside.findIndex((u) => u.code === objective), a = s.mumakil!.setAside.splice(j, 1)[0];
    enemy.attachments.push({ id: a.id, code: a.code, exhausted: false }); }
  return enemy;
}
export function questFixture(stage = 1, players = 1) {
  const s = base(players); setStage(s, stage); s.phase = "staging";
  for (const p of playerOrder(s)) forOwner(s, p, () => { s.heroes[0].committed = true; s.heroes[0].exhausted = true; s.heroes[0].tempWill = 30; });
  if (stage === 1) for (const _p of playerOrder(s)) addWild(s);
  syncSeat(s); return s;
}
export function captureFixture(code: string) {
  const s = base(); setStage(s); const enemy = addWild(s, code), hero = s.heroes[0]; enemy.damage = 6;
  if (code === M.lasso) { s.phase = "attack"; hero.tempAttack = 4; s.deck = ["01073"]; }
  if (code === M.spear) { s.phase = "staging"; hero.committed = true; hero.exhausted = true; hero.tempWill = 30; s.encounterDeck = [MORDOR.trail]; }
  if (code === M.pit) { s.phase = "travel"; s.progress = 8; s.staging.push(make(s, MORDOR.clearing)); }
  if (code === M.noose) { s.phase = "defense"; hero.tempDefense = 10; }
  return { s, enemy, hero };
}
export function revealFixture(code: string, players = 1) {
  const s = base(players); setStage(s); s.phase = "quest"; s.activeLocation = make(s, M.trail); s.encounterDeck = [code, ...Array(6).fill(M.trail)];
  if (code === M.insects) forOwner(s, players - 1, () => s.hand = [make(s, "01073")]);
  if (code === M.savage) { s.deck = ["01013", "01026", "01030", "01031", "01032", "01033"]; s.allies.push(make(s, "01013")); }
  return { s, hero: s.heroes[0] };
}
export function shadowFixture(code: string, kill = false) {
  const s = base(); setStage(s); s.phase = "defense";
  const enemy = make(s, M.ape); enemy.shadows = [code]; s.engaged.push(enemy);
  const defender = kill ? make(s, "01013") : s.heroes[0];
  if (kill) { defender.damage = 1; s.allies.push(defender); }
  else defender.tempDefense = 10;
  s.hand = [make(s, "01073")]; s.encounterDeck = Array(8).fill(M.trail);
  return { s, enemy, defender };
}
