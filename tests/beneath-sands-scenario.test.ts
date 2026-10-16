import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, make, prepend, stats, threatOf } from "../src/game/core";
import { damage, engage, placeEncounter, progressLocation, readyCharacter } from "../src/game/board";
import { flush } from "../src/game/effects";
import { addQuestProgress } from "../src/game/side-quests";
import { mainQuestUnit } from "../src/game/quest-state";
import { allCharacters, allEngaged, forOwner, ownerOf, seatView, syncSeat } from "../src/game/table";
import { BENEATH_SANDS as B, BENEATH_SANDS_RECIPES, beneathSandsEndQuest, beneathSandsQuestFailed, beneathSandsRoundEnd, beneathSandsSearch, beneathSandsShadow, beneathSandsTravelEntered } from "../src/game/beneath-sands";
import { base, choose, reload, setStage, settle, start } from "./beneath-sands-fixtures";
import * as BF from "./beneath-sands-browser-fixtures";
import type { GameState, Unit } from "../src/game/types";
const add = (s: GameState, code: string) => { const u = make(s, code); s.staging.push(u); return u; };
const finish = (s: GameState, prefer?: string) => { flush(s); return settle(s, prefer); };
const setTrack = (s: GameState, on: boolean) => { s.beneathSands!.onTrack = on; beneathSandsSearch(s)!.flipped = !on; };
const combat = (s: GameState, enemy: Unit, defender?: Unit) => { s.combat = { enemyId: enemy.id, attackPlayer: ownerOf(s, enemy), defenderId: defender?.id ?? null, defenderIds: defender ? [defender.id] : [], attackBonus: 0 }; };

for (const players of [1, 2, 3, 4]) for (const easy of [false, true]) test(`Beneath original ${players}p ${easy ? "easy" : "standard"} setup conserves quest deck, Search and boss`, () => {
  const s = reload(start(players, easy)), q = s.beneathSands!;
  assert.equal(s.status, "playing"); assert.equal(s.stage, 1); assert.equal(q.onTrack, false); assert.equal(beneathSandsSearch(s)?.resources, 0);
  assert.equal(q.setAside.length, 1); assert.equal(q.setAside[0].code, B.broodMother); assert.equal(s.staging.filter((u) => card(u.code).type_code === "location").length, players);
  assert.equal(s.encounterDeck.length + s.encounterDiscard.length + players, easy ? 36 : 39);
  assert.equal(q.completedQuests.length + 1 + q.questDeck.length, 3);
  assert.equal(BENEATH_SANDS_RECIPES.find((r) => r.mode === (easy ? "easy" : "standard"))!.cards.reduce((n, c) => n + c.quantity, 0), easy ? 41 : 44);
});
test("Off Track blocks all main quest progress but permits location and side quest progress", () => {
  const s = base(); addQuestProgress(s, mainQuestUnit(s)!, 8); assert.equal(s.progress, 0);
  const location = add(s, B.cavern); progressLocation(s, location, 1); assert.equal(location.progress, 1);
  const side = add(s, B.lostUnderground); addQuestProgress(s, side, 2); assert.equal(side.progress, 2);
  setTrack(s, true); addQuestProgress(s, mainQuestUnit(s)!, 3); assert.equal(s.progress, 3);
});
test("Native Track travel discards X physical cards, flips once on a printed sign and clears Search resources", () => {
  const f = BF.sandsTravel(); f.s.staging.find((u) => u.code === B.search)!.resources = 3;
  let s = applyAction(reload(f.s), { type: "TRAVEL", id: f.location.id }); s = settle(s);
  assert.equal(s.activeLocation?.id, f.location.id); assert.equal(s.beneathSands!.onTrack, true); assert.equal(beneathSandsSearch(s)!.resources, 0); assert.equal(beneathSandsSearch(s)!.flipped, false);
  assert.deepEqual(s.encounterDiscard, [B.passage, B.cavern]); assert.equal(s.encounterDeck.length, 2);
});
test("Track reshuffles the discard pile if the deck empties during its counted discard", () => {
  let s = base(); const l = add(s, B.tunnel); s.activeLocation = l; s.staging = s.staging.filter((u) => u.id !== l.id); s.encounterDeck = [B.cavern]; s.encounterDiscard = [B.passage];
  beneathSandsTravelEntered(s, l); s = finish(s); assert.equal(s.beneathSands!.onTrack, true); assert.equal(s.encounterDeck.length + s.encounterDiscard.length, 2);
});
test("Travel effects precede Track, and putting a location active without travel does not resolve Track", () => {
  const f = BF.sandsTravel(B.nest); let s = applyAction(reload(f.s), { type: "TRAVEL", id: f.location.id }); s = settle(s);
  assert.ok(s.staging.some((u) => u.code === B.guardian)); assert.equal(s.beneathSands!.onTrack, true); assert.equal(s.encounterDiscard.length, 3);
  s = base(); const l = add(s, B.passage); beneathSandsTravelEntered(s, l, false); s = finish(s); assert.equal(s.encounterDeck.length, 30); assert.equal(s.beneathSands!.onTrack, false);
});
test("On Track searches top three without reveal keywords and preserves pending physical selection across reload", () => {
  let s = base(); setTrack(s, true); s.encounterDeck = [B.cavern, B.broodling, B.passage, B.guardian];
  beneathSandsEndQuest(s); flush(s); assert.equal(s.beneathSands!.resolving.length, 3); assert.equal(s.choice!.options.length, 2); s = reload(s); s = choose(s, "1"); s = settle(s);
  assert.ok(s.staging.some((u) => u.code === B.broodling)); assert.deepEqual(s.encounterDeck, [B.guardian]); assert.deepEqual(s.encounterDiscard, [B.cavern, B.passage]); assert.equal(s.beneathSands!.resolving.length, 0);
});
test("On Track with no sign flips Off Track, and Off Track offers only the topmost discarded location or scaled threat", () => {
  let s = base(2); setTrack(s, true); s.encounterDeck = [B.cavern, B.grabbed, B.forcedOff, B.guardian]; beneathSandsEndQuest(s); s = finish(s); assert.equal(s.beneathSands!.onTrack, false); assert.equal(beneathSandsSearch(s)!.resources, 0);
  s.encounterDiscard = [B.nest, B.injured, B.passage, B.guardian]; beneathSandsEndQuest(s); flush(s); assert.equal(beneathSandsSearch(s)!.resources, 1); assert.equal(s.choice!.options.find((o) => o.id === "location")!.code, B.passage); s = choose(reload(s), "location"); s = settle(s); assert.ok(s.staging.some((u) => u.code === B.passage)); assert.ok(s.encounterDiscard.includes(B.nest));
  beneathSandsEndQuest(s); s = finish(s, "threat"); assert.equal(beneathSandsSearch(s)!.resources, 2); assert.equal(seatView(s, 0).threat, 22); assert.equal(seatView(s, 1).threat, 22);
});
test("Unsuccessful quest flips once and clears stage three progress only on the actual On→Off transition", () => {
  let s = base(); setStage(s, 3, true); s.progress = 5; beneathSandsQuestFailed(s); s = finish(s); assert.equal(s.beneathSands!.onTrack, false); assert.equal(s.progress, 0);
  s.progress = 3; prepend(s, fx("beneathSandsFlip", { flag: false })); s = finish(s); assert.equal(s.progress, 3);
});
test("Lost Underground flips Off Track only when actually revealed, locks Track, then defeated Response flips and suppresses Search this phase", () => {
  let s = base(); setTrack(s, true); placeEncounter(s, B.lostUnderground, false, 0, undefined, true); s = finish(s); assert.equal(s.beneathSands!.onTrack, false);
  const l = add(s, B.passage); s.encounterDeck = [B.guardian, B.passage]; beneathSandsTravelEntered(s, l); s = finish(s); assert.deepEqual(s.encounterDeck, [B.guardian, B.passage]);
  const lost = s.staging.find((u) => u.code === B.lostUnderground)!; addQuestProgress(s, lost, 5); s = finish(s, "use"); assert.equal(s.beneathSands!.onTrack, true); const before = [...s.encounterDeck]; beneathSandsEndQuest(s); s = finish(s); assert.deepEqual(s.encounterDeck, before);
  s.phase = "travel"; beneathSandsEndQuest(s); s = finish(s); assert.notDeepEqual(s.encounterDeck, before);
  for (const canceled of [false, true]) { let other = base(); setTrack(other, true); placeEncounter(other, B.lostUnderground, canceled, 0, undefined, canceled); other = finish(other); assert.equal(other.beneathSands!.onTrack, true); }
});
test("Grabbed by Spiders attaches one exact Condition to the main quest, discards allies per player on flip and leaves once", () => {
  let s = base(2); setTrack(s, true); for (const p of [0, 1]) forOwner(s, p, () => { const a = make(s, "01013"); a.owner = p; s.allies.push(a); });
  placeEncounter(s, B.grabbed, false, 0, undefined, true); s = finish(s); const a = mainQuestUnit(s)!.attachments.find((a) => a.code === B.grabbed)!; assert.ok(a); assert.equal(s.beneathSands!.resolving.length, 0); assert.ok(!s.encounterDiscard.includes(B.grabbed));
  placeEncounter(s, B.grabbed, false, 0, undefined, true); s = finish(s); assert.equal(mainQuestUnit(s)!.attachments.filter((a) => a.code === B.grabbed).length, 1);
  prepend(s, fx("beneathSandsFlip", { flag: false })); s = finish(s); assert.equal(allCharacters(s).filter((u) => card(u.code).type_code === "ally").length, 0); assert.ok(!mainQuestUnit(s)!.attachments.some((x) => x.id === a.id)); assert.equal(s.encounterDiscard.filter((c) => c === B.grabbed).length, 2);
});
test("Spider Burrow uses its exact set aside boss, engages natively, then exploration sets it aside with physical shadows", () => {
  let s = base(); const motherId = s.beneathSands!.setAside[0].id, l = add(s, B.burrow); s.activeLocation = l; s.staging = s.staging.filter((u) => u.id !== l.id); beneathSandsTravelEntered(s, l, false); s = finish(s); assert.equal(s.beneathSands!.onTrack, true);
  assert.equal(allEngaged(s).find((u) => u.code === B.broodMother)!.id, motherId); const mother = get(s, motherId)!; mother.shadows = [B.guardian]; mother.tempAttack = 4; mother.noEngagementRound = s.round; progressLocation(s, get(s, l.id)!, 2); s = finish(s);
  assert.equal(s.beneathSands!.setAside[0].id, motherId); assert.equal(s.beneathSands!.setAside[0].tempAttack, undefined); assert.equal(s.beneathSands!.setAside[0].noEngagementRound, undefined); assert.ok(!allEngaged(s).some((u) => u.id === motherId)); assert.ok(s.encounterDiscard.includes(B.guardian));
});
test("Brood Mother takes no damage until stage three has five progress and cannot block victory after a native lethal attack", () => {
  let s = base(); const mother = s.beneathSands!.setAside.shift()!; s.staging.push(mother); damage(s, mother.id, 99, { combatDamage: true }); assert.equal(mother.damage, 0);
  setStage(s, 3, true); s.progress = 4; damage(s, mother.id, 99, { combatDamage: true }); assert.equal(mother.damage, 0); s.progress = 5; damage(s, mother.id, 1, { combatDamage: true }); assert.equal(mother.damage, 1);
  const f = BF.sandsBoss(); s = applyAction(reload(f.s), { type: "ATTACK", enemyId: f.mother.id, attackerIds: [f.hero.id] }); s = settle(s); assert.equal(s.status, "won"); assert.ok(s.victoryCards?.includes(B.broodMother));
});
test("Brood Mother's round-end search returns one actual broodling and shuffles, without resolving conditional surge", () => {
  let s = base(); const mother = s.beneathSands!.setAside.shift()!; s.engaged.push(mother); mother.owner = 0; setTrack(s, true); s.encounterDeck = [B.cavern]; s.encounterDiscard = [B.broodling];
  prepend(s, ...beneathSandsRoundEnd(s)); s = finish(s, "discard"); assert.equal(s.staging.filter((u) => u.code === B.broodling).length, 1); assert.deepEqual(s.encounterDeck, [B.cavern]); assert.ok(!s.encounterDiscard.includes(B.broodling));
});
test("On Track guardian/cavern/tunnel values and Blocked Passage location progress gate use current printed state", () => {
  const s = base(); const guardian = add(s, B.guardian), cavern = add(s, B.cavern), tunnel = add(s, B.tunnel); add(s, B.passage);
  const attack = stats(s, guardian).attack; assert.equal(threatOf(s, tunnel), 3); assert.equal(threatOf(s, cavern), card(B.cavern).threat);
  setTrack(s, true); assert.equal(stats(s, guardian).attack, attack + 2); assert.equal(threatOf(s, cavern), (card(B.cavern).threat ?? 0) + 2); progressLocation(s, cavern, 1); assert.equal(cavern.progress, 0);
});
test("Shared Harad cards: native Injured/Enfeebled, damaged-character Remedy blanking and Scorpion ready restriction", () => {
  let s = base(2); placeEncounter(s, B.injured, false, 0, undefined, true); s = finish(s, "threat"); assert.equal(seatView(s, 0).threat, 23); assert.equal(seatView(s, 1).threat, 23);
  placeEncounter(s, B.enfeebled, false, 0, undefined, true); s = finish(s); assert.equal(allCharacters(s).filter((u) => u.exhausted).length, 2); const hero = allCharacters(s).find((u) => u.exhausted)!; readyCharacter(s, hero); assert.equal(hero.exhausted, true);
  s = base(); const enemy = add(s, B.scorpion); engage(s, enemy); combat(s, enemy, s.heroes[0]); damage(s, s.heroes[0].id, 1, { enemyId: enemy.id, combatDamage: true }); const h = s.heroes[0]; h.exhausted = true; readyCharacter(s, h); assert.equal(h.exhausted, true); s.round++; readyCharacter(s, h); assert.equal(h.exhausted, false);
});
test("Native broodling shadow transfers its revealed physical copy into play, deals a fresh shadow and preserves later shadows", () => {
  let s = base(); setTrack(s, true); const e = add(s, B.guardian); engage(s, e); e.shadows = [B.broodling, B.guardian]; e.revealedShadowCount = 1; s.encounterDeck = [B.cavern]; combat(s, e, s.heroes[0]); beneathSandsShadow(s, B.broodling);
  assert.deepEqual(e.shadows, [B.guardian]); assert.equal(e.revealedShadowCount, 0); const b = allEngaged(s).find((u) => u.code === B.broodling)!; assert.ok(b); assert.deepEqual(b.shadows, [B.cavern]); assert.equal(s.encounterDeck.length, 0); s = reload(s);
});
for (const code of [B.guardian, B.broodling, B.forcedOff, B.cavern, B.passage, B.scorpion]) test(`Native defense resolves ${card(code).name} shadow and reloads its continuations`, () => {
  const f = BF.sandsShadow(code); let s = applyAction(reload(f.s), { type: "DEFEND", enemyId: f.enemy.id, defenderId: f.defender.id }); s = settle(s); assert.equal(s.status, "playing"); if (code === B.broodling) assert.ok(allEngaged(s).some((u) => u.code === B.broodling));
});
for (const stage of [1, 2]) test(`Native quest resolution advances stage ${stage} with real quest chain and WR search`, () => {
  const f = BF.sandsQuest(stage); let s = applyAction(reload(f.s), { type: "NEXT" }); s = settle(s); assert.equal(s.stage, stage + 1); assert.equal(s.beneathSands!.completedQuests.length, stage); assert.equal(s.beneathSands!.onTrack, false); if (stage === 2) assert.ok(allEngaged(s).some((u) => u.code === B.broodMother));
});
test("Beneath saves reject malformed objective state, quest chain, physical duplicate boss and pending cards", () => {
  const s = start(); assert.ok(validateSave(s));
  for (const mutate of [(x: GameState) => { x.beneathSands!.questDeck.reverse(); }, (x: GameState) => { x.beneathSands!.onTrack = 1 as unknown as boolean; }, (x: GameState) => { x.beneathSands!.setAside.push(structuredClone(x.beneathSands!.setAside[0])); }, (x: GameState) => { x.beneathSands!.resolving = ["fake"]; }]) { const bad = structuredClone(s); mutate(bad); assert.equal(validateSave(bad), false); }
});
for (const code of [B.forcedOff, B.grabbed, B.lostUnderground, B.injured, B.enfeebled]) test(`Native commit/reveal rehearsal: ${card(code).name}`, () => {
  const f = BF.sandsReveal(code); let s = applyAction(reload(f.s), { type: "TOGGLE_QUEST", id: f.hero.id }); s = applyAction(reload(s), { type: "COMMIT" }); s = settle(s); assert.equal(s.status, "playing");
  if (code === B.grabbed) assert.ok(mainQuestUnit(s)!.attachments.some((a) => a.code === code));
  if (code === B.lostUnderground) { assert.ok(s.staging.some((u) => u.code === code)); assert.equal(s.beneathSands!.onTrack, false); }
});
test("An actual unsuccessful quest flips On Track before quest-end Search and its Off Track threat can eliminate the player", () => {
  const f = BF.sandsSearch(true); f.s.encounterDeck = []; f.s.encounterDiscard = []; f.s.heroes[0].tempWill = 0; add(f.s, B.guardian); f.s.threat = 49; syncSeat(f.s);
  let s = applyAction(reload(f.s), { type: "NEXT" }); s = settle(s); assert.equal(s.status, "lost");
});
test("Stage two On Track prevents native encounter and shadow cancellation; Off Track restores both", () => {
  for (const onTrack of [false, true]) {
    const f = BF.sandsReveal(B.forcedOff, 1, onTrack, 2); f.hero.code = "01007"; f.s.hand.push(make(f.s, "01050"));
    let s = applyAction(reload(f.s), { type: "TOGGLE_QUEST", id: f.hero.id }); s = applyAction(reload(s), { type: "COMMIT" });
    assert.equal(!!s.choice?.options.some((o) => o.id === "cancel"), !onTrack);
    if (!onTrack) { s = choose(reload(s), "cancel"); s = settle(s); assert.equal(s.beneathSands!.onTrack, false); assert.ok(s.encounterDiscard.includes(B.forcedOff)); }
    const shadow = BF.sandsShadow(B.guardian, onTrack); setStage(shadow.s, 2, onTrack); shadow.s.heroes[0].code = "01007"; shadow.s.hand.push(make(shadow.s, "01048"));
    s = applyAction(reload(shadow.s), { type: "DEFEND", enemyId: shadow.enemy.id, defenderId: shadow.defender.id });
    assert.equal(!!s.choice?.options.some((o) => o.id === "cancel"), !onTrack);
  }
});
test("Broodling shadow engagement opens the native Steed of the North response and survives its pending reload", () => {
  const f = BF.sandsShadow(B.broodling); const hero = f.s.heroes[0]; hero.exhausted = true; const steed = make(f.s, "17030"); hero.attachments.push({ id: steed.id, code: steed.code, exhausted: false });
  let s = applyAction(reload(f.s), { type: "DEFEND", enemyId: f.enemy.id, defenderId: f.defender.id }); assert.match(s.choice!.title, /Steed of the North/); s = settle(reload(s), "use");
  assert.equal(get(s, hero.id)!.exhausted, false); assert.equal(get(s, hero.id)!.attachments.find((a) => a.id === steed.id)!.exhausted, true); assert.ok(!get(s, f.enemy.id)!.shadows.includes(B.broodling));
});
