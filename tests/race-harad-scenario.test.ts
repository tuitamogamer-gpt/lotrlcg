import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, make, prepend, stats, threatOf } from "../src/game/core";
import { advanceQuest, check, damage, destroy, engage, placeEncounter, progressLocation, readyCharacter } from "../src/game/board";
import { flush } from "../src/game/effects";
import { allCharacters, allEngaged, forOwner, ownerOf, playerOrder, seatView, syncSeat } from "../src/game/table";
import { syncAttachmentText } from "../src/game/attachment-text";
import { mainQuestUnit } from "../src/game/quest-state";
import { RACE_HARAD as R, RACE_HARAD_RECIPES, raceHaradAdvance, raceHaradAreaUnits, raceHaradAttackFinished, raceHaradCannotLeave, raceHaradCharactersCommitted,
  raceHaradEndQuest, raceHaradExtraReveals, raceHaradProgress, raceHaradShadow, raceHaradStagingThreat, raceHaradSyncArea, raceHaradTravelEntered, raceHaradTravelProblem } from "../src/game/race-harad";
import { base, choose, reload, setStage, settle, start } from "./race-harad-fixtures";
import type { GameState, Unit } from "../src/game/types";
import * as BF from "./race-harad-browser-fixtures";
const add = (s: GameState, code: string) => { const u = make(s, code); s.staging.push(u); return u; };
const finish = (s: GameState, prefer?: string) => { flush(s); return settle(s, prefer); };
const combat = (s: GameState, e: Unit, d?: Unit) => { s.combat = { enemyId: e.id, attackPlayer: ownerOf(s, e), defenderId: d?.id ?? null, defenderIds: d ? [d.id] : [], attackBonus: 0 }; };

for (const players of [1, 2, 3, 4]) for (const easy of [false, true]) test(`Race original ${players}p ${easy ? "easy" : "standard"} setup preserves both four-card quest decks, physical mounts and different locations`, () => {
  const s = reload(start(players, easy)), q = s.raceHarad!;
  assert.equal(s.status, "playing"); assert.equal(s.stage, 2); assert.equal(q.enemyStage, 1);
  assert.equal(s.staging.filter((u) => card(u.code).type_code === "location").length, players);
  assert.equal(new Set(s.staging.filter((u) => card(u.code).type_code === "location").map((u) => u.code)).size, players);
  assert.equal(s.encounterDeck.length, (easy ? 34 : 38) - players);
  assert.equal(allCharacters(s).filter((u) => u.code === R.tamed).length, players); assert.equal(q.removed.length, 4 - players);
  assert.deepEqual(q.setAside.map((u) => u.code), [R.river]); assert.equal(q.area.length, 2); assert.ok(q.area.some((u) => u.code === R.chief)); assert.ok(q.area.some((u) => u.code === R.rider));
  assert.equal(q.completedQuests.length + 1 + q.questDeck.length, 4); assert.equal(q.enemyCompletedQuests.length + 1 + q.enemyQuestDeck.length, 4);
  assert.equal(RACE_HARAD_RECIPES.find((r) => r.mode === (easy ? "easy" : "standard"))!.cards.reduce((n, c) => n + c.quantity, 0), easy ? 49 : 53);
});
test("Orc area has no staging threat while remote and physically joins staging when the two original stages match", () => {
  let s = base(); const e = make(s, R.pursuer); e.raceHaradArea = true; s.raceHarad!.area.push(e); raceHaradSyncArea(s);
  assert.ok(raceHaradCannotLeave(s, e)); assert.ok(!s.staging.includes(e)); assert.ok(get(s, e.id)); s = reload(s);
  setStage(s, 2, 2); assert.equal(s.raceHarad!.area.length, 0); assert.ok(s.staging.some((u) => u.id === e.id)); assert.ok(!raceHaradCannotLeave(s, get(s, e.id)!));
  const target = get(s, e.id)!; engage(s, target); assert.ok(!target.raceHaradArea); assert.equal(allEngaged(s).length, 1); reload(s);
});
test("Native end-of-quest pursuit discards one physical card, counts Orc area and resets excess progress when advancing", () => {
  let s = base(); const q = s.raceHarad!; const chief = make(s, R.chief); chief.id = q.chieftainId; q.area.push(chief); raceHaradSyncArea(s); s.encounterDeck = [R.road, R.erg];
  q.enemyProgress = 8; raceHaradEndQuest(s); s = finish(s); assert.equal(s.raceHarad!.enemyStage, 2); assert.equal(s.raceHarad!.enemyProgress, 0); assert.deepEqual(s.encounterDiscard, [R.road]); assert.deepEqual(s.encounterDeck, [R.erg]); assert.ok(s.staging.some((u) => u.id === chief.id));
});
test("Defeating the Orc stage while caught is a loss, including Orc stage four", () => {
  for (const stage of [2, 3, 4]) { let s = base(); setStage(s, stage, stage); prepend(s, fx("raceHaradEnemyProgress", { value: 50 })); s = finish(s); assert.equal(s.status, "lost"); assert.match(s.reason!, /Orcs/); }
});
test("Orc stage four counts engaged enemies rather than the separate Orc area", () => {
  let s = base(); setStage(s, 4, 4); const e = add(s, R.pursuer); engage(s, e); add(s, R.rider); s.encounterDeck = [R.road]; raceHaradEndQuest(s); s = finish(s); assert.equal(s.raceHarad!.enemyProgress, 5 + threatOf(s, get(s, e.id)!));
});
test("The 5/10 progress cap is fixed by real Tamed Mûmak commitments, persists through reload and resets next round", () => {
  let s = base(2); s.round = 3; raceHaradCharactersCommitted(s); assert.equal(s.raceHarad!.progressLimit, 5);
  assert.equal(raceHaradProgress(s, 4, mainQuestUnit(s)!), 4); s = reload(s); assert.equal(raceHaradProgress(s, 8, mainQuestUnit(s)!), 1);
  s.round++; for (const u of allCharacters(s).filter((u) => u.code === R.tamed)) u.committed = true; raceHaradCharactersCommitted(s); assert.equal(s.raceHarad!.progressLimit, 10); assert.equal(raceHaradProgress(s, 20, mainQuestUnit(s)!), 10);
});
test("Player stage three reshuffles discarded physical cards, finds a real Orc and adds an extra reveal only with the chief at 2D", () => {
  let s = base(); s.encounterDeck = []; s.encounterDiscard = [R.pursuer]; s.progress = 15; advanceQuest(s); s = finish(s); assert.equal(s.stage, 3); assert.ok(raceHaradAreaUnits(s).some((u) => u.code === R.pursuer)); assert.equal(raceHaradExtraReveals(s), 0);
  const chief = make(s, R.chief); chief.id = s.raceHarad!.chieftainId; s.raceHarad!.area.push(chief); setStage(s, 3, 2); assert.equal(raceHaradExtraReveals(s), 1);
});
test("River Harnen enters from its exact set-aside card and blocks victory in play, with its printed progress gate", () => {
  let s = base(); setStage(s, 3, 1); const id = s.raceHarad!.setAside.find((u) => u.code === R.river)!.id; s.encounterDeck = []; s.encounterDiscard = [R.pursuer]; s.progress = 20; advanceQuest(s); s = finish(s); assert.equal(s.stage, 4); assert.equal(s.staging.find((u) => u.code === R.river)!.id, id);
  const river = get(s, id)!; assert.ok(raceHaradTravelProblem(s, river)); s.progress = 20; assert.equal(raceHaradTravelProblem(s, river), null); raceHaradAdvance(s); assert.equal(s.status, "playing"); s.staging = s.staging.filter((u) => u.id !== id); raceHaradAdvance(s); assert.equal(s.status, "won");
});
test("Uruk Chieftain cannot take damage at player stages 2/3 or while River Harnen is staged at Orc stage four", () => {
  const s = base(); const chief = add(s, R.chief); damage(s, chief.id, 8, { combatDamage: true }); assert.equal(chief.damage, 0);
  setStage(s, 4, 4); add(s, R.river); damage(s, chief.id, 8, { combatDamage: true }); assert.equal(chief.damage, 0); s.staging = s.staging.filter((u) => u.code !== R.river); damage(s, chief.id, 1, { combatDamage: true }); assert.equal(chief.damage, 1);
});
test("Native Racing Warg revelation attaches the exact physical unit even to a remote Orc, stacks with Mordor Warg and returns once when host leaves", () => {
  let s = base(); const target = make(s, R.uruk); target.raceHaradArea = true; s.raceHarad!.area.push(target); raceHaradSyncArea(s); placeEncounter(s, R.racingWarg, false, 0, undefined, true); flush(s); assert.ok(s.choice);
  const warg = s.staging.find((u) => u.code === R.racingWarg)!; s = choose(reload(s), target.id); s = settle(s); const host = get(s, target.id)!; assert.equal(host.attachments[0].id, warg.id); assert.equal(stats(s, host).attack, (card(host.code).attack ?? 0) + 1);
  setStage(s, 2, 2); const m = make(s, R.warg); host.attachments.push({ id: m.id, code: m.code, exhausted: false }); assert.equal(stats(s, host).health, (card(host.code).health ?? 0) + 3);
  destroy(s, host); s = finish(s); assert.equal(s.staging.filter((u) => u.id === warg.id).length, 1); assert.equal(s.staging.filter((u) => u.id === m.id).length, 1); assert.ok(!s.encounterDiscard.includes(R.racingWarg));
});
test("Uruk Pursuer and Harad Road enter the Orc area from real revealed cards; only the Pursuer gains conditional surge", () => {
  let s = base(); s.encounterDeck = [R.erg]; placeEncounter(s, R.pursuer, false, 0, undefined, true); s = finish(s); assert.ok(s.raceHarad!.area.some((u) => u.code === R.pursuer)); assert.ok(s.staging.some((u) => u.code === R.erg));
  placeEncounter(s, R.road, false, 0, undefined, true); s = finish(s); assert.ok(s.raceHarad!.area.some((u) => u.code === R.road));
});
test("Howling snapshots the remote Orc threat for this phase, or gives every enemy +1 threat when caught", () => {
  let s = base(); const e = make(s, R.pursuer); e.raceHaradArea = true; s.raceHarad!.area.push(e); raceHaradSyncArea(s); s.phase = "staging"; placeEncounter(s, R.howling); s = finish(s); assert.equal(raceHaradStagingThreat(s), 2); s.phase = "travel"; assert.equal(raceHaradStagingThreat(s), 0);
  setStage(s, 2, 2); placeEncounter(s, R.howling); s = finish(s); assert.equal(threatOf(s, get(s, e.id)!), 3);
});
test("Pursuers from Mordor discards non-Orcs physically until an Orc enters the separate area", () => {
  let s = base(); s.encounterDeck = [R.erg, R.racingWarg, R.uruk, R.road]; placeEncounter(s, R.pursuers); s = finish(s); assert.deepEqual(s.encounterDeck, [R.road]); assert.ok(s.encounterDiscard.includes(R.erg)); assert.ok(s.encounterDiscard.includes(R.racingWarg)); assert.ok(s.raceHarad!.area.some((u) => u.code === R.uruk));
});
test("Shared Heat Exhaustion native chosen damage and Sandstorm continuation survive save/reload without Desert scenario state", () => {
  let s = base(2); const remote = seatView(s, 1).heroes[0]; placeEncounter(s, R.exhaustion); flush(s); s = settle(s, remote.id); assert.ok(allCharacters(s).some((u) => u.damage === 1)); assert.equal(allCharacters(s).reduce((n, u) => n + u.damage, 0), 2);
  forOwner(s, 1, () => { s.hand = [make(s, "01073"), make(s, "01073")]; }); placeEncounter(s, R.sandstorm); flush(s); s = settle(s, "damage"); assert.equal(allCharacters(s).reduce((n, u) => n + u.damage, 0), 4); assert.equal(seatView(s, 1).hand.length, 2);
});
test("Shared Fear of Mordor affects a snapshot of physical allies' will, attack and defense through the round", () => {
  let s = base(); const ally = make(s, "01013"); s.allies.push(ally); const before = stats(s, ally); placeEncounter(s, R.fear); s = finish(s); const actual = stats(s, get(s, ally.id)!); assert.equal(actual.attack, Math.max(0, before.attack - 1)); assert.equal(actual.defense, Math.max(0, before.defense - 1)); assert.equal(actual.will, Math.max(0, before.will - 1));
});
test("Blistering Erg uses main stage X and its per-player native assigned damage; Oasis exhausts each player", () => {
  let s = base(2); const erg = add(s, R.erg); assert.equal(threatOf(s, erg), 2); raceHaradTravelEntered(s, erg); s = finish(s); assert.equal(allCharacters(s).reduce((n, u) => n + u.damage, 0), 4);
  raceHaradTravelEntered(s, make(s, R.oasis)); s = finish(s); assert.equal(allCharacters(s).filter((u) => u.exhausted).length, 2);
});
test("Towering Dunes blocks staging-location progress and Find Water blocks player ready but allows framework ready", () => {
  const s = base(); const l = add(s, R.expanse); add(s, R.dunes); progressLocation(s, l, 2, true); assert.equal(l.progress, 0); add(s, R.water); const h = s.heroes[0]; h.exhausted = true; readyCharacter(s, h, true); assert.equal(h.exhausted, true); readyCharacter(s, h, false); assert.equal(h.exhausted, false);
});
test("A Tamed Mûmak leaving play eliminates only its controller at two players and loses the solo game", () => {
  let s = base(2); const t = seatView(s, 1).allies.find((u) => u.code === R.tamed)!; damage(s, t.id, 99, { combatDamage: true }); check(s); assert.equal(s.table!.seats[1].eliminated, true); assert.equal(s.table!.seats[0].eliminated, false); assert.equal(s.status, "playing"); s = reload(s);
  const solo = base(); damage(solo, solo.allies.find((u) => u.code === R.tamed)!.id, 99, { combatDamage: true }); check(solo); assert.equal(solo.status, "lost");
});
test("Actual native undefended combat must assign damage to the controlling Tamed Mûmak", () => {
  let s = base(); s.phase = "defense"; const e = add(s, R.pursuer); engage(s, e); const t = s.allies.find((u) => u.code === R.tamed)!;
  s = applyAction(reload(s), { type: "DEFEND", enemyId: e.id }); s = settle(s); assert.ok(get(s, t.id)!.damage > 0); assert.ok(s.heroes.every((h) => !h.damage));
});
test("Uruk Pursuer shadow transfers its exact physical shadow copy to engagement and preserves later shadows", () => {
  let s = base(); const e = add(s, R.uruk); engage(s, e); e.shadows = [R.pursuer, R.howling]; e.revealedShadowCount = 1; combat(s, e, s.heroes[0]); raceHaradShadow(s, R.pursuer); assert.deepEqual(e.shadows, [R.howling]); assert.equal(e.revealedShadowCount, 0); assert.equal(allEngaged(s).filter((u) => u.code === R.pursuer).length, 1); s = reload(s);
});
test("Road shadow returns the attacker to the real Orc area; a lethal Pursuers shadow adds its two progress after the attack", () => {
  let s = base(); const e = add(s, R.uruk); engage(s, e); combat(s, e, s.heroes[0]); raceHaradShadow(s, R.road); raceHaradShadow(s, R.pursuers); s.combat!.raceHaradDestroyedCharacter = true;
  prepend(s, ...raceHaradAttackFinished(s, s.combat!)); s = finish(s); assert.equal(s.raceHarad!.enemyProgress, 2); assert.ok(s.raceHarad!.area.some((u) => u.id === e.id));
});
test("Race saves reject corrupt independent quest chains, progress limits and duplicate physical area identities", () => {
  const s = start(); assert.ok(validateSave(s)); const bad = structuredClone(s); bad.raceHarad!.enemyQuestDeck.reverse(); assert.equal(validateSave(bad), false); const cap = structuredClone(s); cap.raceHarad!.progressLimit = 8; assert.equal(validateSave(cap), false); const dupe = structuredClone(s); dupe.raceHarad!.area.push(structuredClone(dupe.raceHarad!.area[0])); assert.equal(validateSave(dupe), false);
});
test("Native Uruk Pursuer shadow engages its exact copy and opens Steed of the North's saved engagement response", () => {
  const f = BF.raceShadow(R.pursuer); let s = f.s; const hero = s.heroes[0], defender = s.heroes[1]; hero.exhausted = true; defender.tempDefense = 10;
  const steed = make(s, "17030"); hero.attachments.push({ id: steed.id, code: steed.code, exhausted: false });
  s = applyAction(reload(s), { type: "DEFEND", enemyId: f.enemy.id, defenderId: defender.id });
  assert.match(s.choice!.title, /Steed of the North/); assert.equal(allEngaged(s).filter((u) => u.code === R.pursuer).length, 1);
  assert.ok(!get(s, f.enemy.id)!.shadows.includes(R.pursuer)); s = settle(reload(s), "use");
  assert.equal(get(s, hero.id)!.exhausted, false); assert.equal(get(s, hero.id)!.attachments.find((a) => a.id === steed.id)!.exhausted, true); assert.ok(!s.encounterDiscard.includes(R.pursuer));
});
for (const code of [R.racingWarg, R.pursuer, R.road, R.howling, R.pursuers, R.sandstorm, R.exhaustion, R.fear]) test(`Native browser rehearsal: commit and reveal ${card(code).name}`, () => {
  const f = BF.raceReveal(code); let s = applyAction(reload(f.s), { type: "TOGGLE_QUEST", id: f.hero.id }); s = applyAction(reload(s), { type: "COMMIT" }); s = settle(s);
  if (code === R.racingWarg) assert.ok(get(s, f.target.id)!.attachments.some((a) => a.code === code));
  else if (code === R.pursuer || code === R.road) assert.ok(s.raceHarad!.area.some((u) => u.code === code));
  else if (code === R.howling) assert.ok(s.raceHarad!.howling.length);
  else if (code === R.sandstorm) assert.equal(s.hand.length, 0);
  else if (code === R.exhaustion) assert.ok(allCharacters(s).some((u) => u.damage > 0));
  else if (code === R.fear) assert.ok(s.used.some((v) => v.startsWith("round:mordor-fear")));
  else assert.ok(s.encounterDiscard.includes(code));
});
for (const code of [R.erg, R.expanse, R.dunes, R.oasis, R.river]) test(`Native browser rehearsal: travel to ${card(code).name}`, () => {
  const f = BF.raceTravel(code); let s = applyAction(reload(f.s), { type: "TRAVEL", id: f.location.id }); s = settle(s); assert.equal(s.activeLocation?.id, f.location.id);
});
for (const code of [R.pursuer, R.howling, R.pursuers, R.road, R.sandstorm, R.exhaustion]) test(`Native browser rehearsal: defend the real ${card(code).name} shadow`, () => {
  const f = BF.raceShadow(code, code === R.pursuers); let s = applyAction(reload(f.s), { type: "DEFEND", enemyId: f.enemy.id, defenderId: f.defender.id }); s = settle(s);
  if (code === R.pursuer) assert.ok(allEngaged(s).some((u) => u.code === R.pursuer));
  if (code === R.road) assert.ok(s.raceHarad!.area.some((u) => u.id === f.enemy.id));
  if (code === R.pursuers) assert.equal(s.raceHarad!.enemyProgress, 3);
});
for (const stage of [2, 3, 4]) test(`Native browser rehearsal: resolve player stage ${stage}`, () => {
  const f = BF.raceQuest(stage); let s = applyAction(reload(f.s), { type: "NEXT" }); s = settle(s); assert.equal(s.stage, Math.min(4, stage + 1)); if (stage === 4) assert.equal(s.status, "won");
});
for (const caught of [false, true]) test(`Native quest resolution reaches the real Orc pursuit ${caught ? "caught loss" : "stage convergence"}`, () => {
  const f = BF.racePursuit(caught); let s = applyAction(reload(f.s), { type: "NEXT" }); s = settle(s);
  assert.equal(s.status, caught ? "lost" : "playing"); assert.equal(s.raceHarad!.enemyStage, 2);
});
test("Put-into-play and canceled Racing Warg/Pursuer revelations do not execute their When Revealed instructions", () => {
  for (const code of [R.racingWarg, R.pursuer]) for (const canceled of [false, true]) {
    let s = base(); add(s, R.uruk); s.encounterDeck = [R.erg]; placeEncounter(s, code, canceled, 0, undefined, canceled); s = finish(s);
    assert.deepEqual(s.encounterDeck, [R.erg]); assert.equal(s.raceHarad!.area.length, 0); assert.ok(s.staging.some((u) => u.code === code)); assert.ok(!s.choice); assert.ok(s.staging.every((u) => !u.attachments.length));
  }
});
