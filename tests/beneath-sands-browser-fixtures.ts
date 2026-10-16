import { base, setStage } from "./beneath-sands-fixtures";
import { BENEATH_SANDS as B } from "../src/game/beneath-sands";
import { make } from "../src/game/core";
import { card } from "../src/game/cards";
import { forOwner, playerOrder, syncSeat } from "../src/game/table";
import type { GameState } from "../src/game/types";
const add = (s: GameState, code: string) => { const u = make(s, code); s.staging.push(u); return u; };
export function sandsTravel(code = B.passage, players = 1) {
  const s = base(players); s.phase = "travel"; const location = add(s, code); s.encounterDeck = code === B.nest ? [B.guardian, B.passage, B.cavern, B.cavern] : code === B.tunnel ? [B.cavern, B.passage, B.cavern, B.cavern, B.cavern] : [B.passage, B.cavern, B.cavern, B.cavern];
  syncSeat(s); return { s, location };
}
export function sandsReveal(code: string, players = 1, onTrack = true, stage = 1) {
  const s = base(players); setStage(s, stage, onTrack); s.phase = "quest"; const hero = s.heroes[0]; hero.tempWill = 20;
  s.encounterDeck = [code, ...Array(30).fill(B.cavern)];
  for (const p of playerOrder(s)) forOwner(s, p, () => { s.committedIds = []; for (const h of s.heroes) { h.committed = false; h.exhausted = false; } });
  syncSeat(s); return { s, hero };
}
export function sandsSearch(onTrack = true, players = 1) {
  const s = base(players); setStage(s, 1, onTrack); s.phase = "staging"; s.heroes[0].committed = true; s.heroes[0].exhausted = true; s.heroes[0].tempWill = 0;
  s.encounterDeck = [B.cavern, B.guardian, B.passage, B.cavern]; s.encounterDiscard = [B.nest]; syncSeat(s); return { s };
}
export function sandsShadow(code: string, onTrack = true, players = 1) {
  const s = base(players); setStage(s, 1, onTrack); s.phase = "defense";
  const enemy = make(s, B.guardian); s.engaged.push(enemy); enemy.owner = 0; enemy.shadows = [code]; enemy.revealedShadowCount = 0;
  const defender = s.heroes[1]; defender.tempDefense = 10; s.encounterDeck = [B.cavern, B.cavern];
  const attachment = make(s, "01026"); defender.attachments.push({ id: attachment.id, code: attachment.code, exhausted: false });
  syncSeat(s); return { s, enemy, defender };
}
export function sandsQuest(stage = 1) {
  const s = base(); setStage(s, stage, true); s.phase = "staging"; s.heroes[0].committed = true; s.heroes[0].exhausted = true; s.heroes[0].tempWill = 10;
  s.encounterDeck = [B.guardian, B.cavern, B.cavern, B.cavern];
  if (stage === 3) { const mother = s.beneathSands!.setAside.shift()!; s.engaged.push(mother); mother.owner = 0; mother.damage = (card(mother.code).health ?? 0) - 1; s.phase = "attack"; s.progress = 5; s.heroes[0].tempAttack = 30; }
  syncSeat(s); return { s };
}
/** Stage 3 is legally On Track after traveling through a Track location; five
 * progress removes the boss's damage prohibition, leaving one real attack. */
export function sandsBoss(players = 1) {
  const s = base(players); setStage(s, 3, true); s.progress = 5; s.phase = "attack";
  const mother = s.beneathSands!.setAside.shift()!; mother.owner = 0; s.engaged.push(mother); s.heroes[0].tempAttack = 30; syncSeat(s); return { s, mother, hero: s.heroes[0] };
}
