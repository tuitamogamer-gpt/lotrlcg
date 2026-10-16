import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import { cannotReady, fx, get, make, prepend, stats, threatOf } from "../src/game/core";
import { advanceQuest, check, damage, destroy, discardAttachment, engage, progressLocation, readyCharacter } from "../src/game/board";
import { flush } from "../src/game/effects";
import { allEngaged, forOwner, ownerOf, seatView, syncSeat } from "../src/game/table";
import { syncAttachmentText } from "../src/game/attachment-text";
import { MUMAKIL as M, MUMAKIL_CAPTURES, mumakilAttackFinished, mumakilCharacterDestroyed, mumakilDamageAmount,
  mumakilEncounter, mumakilExplored, mumakilExtraReveals, mumakilQuestBegin, mumakilQuestSucceeded,
  mumakilRoundEnd, mumakilShadow, mumakilSideQuestSelected, mumakilTravelEntered, mumakilTravelEffects } from "../src/game/mumakil";
import { MORDOR } from "../src/game/long-arm-mordor-support";
import { captureFixture } from "./mumakil-browser-fixtures";
import { base, reload, setStage, settle, start } from "./mumakil-fixtures";
import type { GameState, Unit } from "../src/game/types";
const add = (s: GameState, code: string) => { const u = make(s, code); s.staging.push(u); return u; };
const finish = (s: GameState, prefer?: string) => { flush(s); return settle(s, prefer); };
function wild(s: GameState, objective?: string, p = 0) {
  const e = add(s, M.wild); forOwner(s, p, () => engage(s, e));
  if (objective) { const i = s.mumakil!.setAside.findIndex((u) => u.code === objective); const a = s.mumakil!.setAside.splice(i, 1)[0]; e.attachments.push({ id: a.id, code: a.code, exhausted: false }); }
  return e;
}
const combat = (s: GameState, e: Unit, d?: Unit) => { s.combat = { enemyId: e.id, attackPlayer: ownerOf(s, e), defenderId: d?.id ?? null, defenderIds: d ? [d.id] : [], attackBonus: 0 }; };
for (const players of [1, 2, 3, 4]) for (const easy of [false, true]) test(`Mûmakil original ${players}p ${easy ? "easy" : "standard"} setup selects different printed locations and retains eight physical set-aside cards`, () => {
  const s = reload(start(players, easy)); assert.equal(s.status, "playing"); assert.equal(s.stage, 1);
  assert.equal(s.staging.length, players); assert.equal(new Set(s.staging.map((l) => l.code)).size, players);
  assert.ok(s.staging.every((l) => card(l.code).type_code === "location"));
  assert.equal(s.encounterDeck.length, (easy ? 25 : 32) - players);
  assert.equal(s.mumakil!.setAside.length, 8); assert.equal(s.mumakil!.setAside.filter((u) => u.code === M.wild).length, 4);
  assert.equal(new Set(s.mumakil!.setAside.map((u) => u.id)).size, 8);
});
test("Mûmakil stage one requires exactly one Wild in play per player, not fewer or more", () => {
  let s = base(2); s.progress = 12; advanceQuest(s); assert.equal(s.stage, 1);
  add(s, M.wild); advanceQuest(s); assert.equal(s.stage, 1); add(s, M.wild); add(s, M.wild); advanceQuest(s); assert.equal(s.stage, 1);
  s.staging.pop(); advanceQuest(s); s = finish(s); assert.equal(s.stage, 2);
  assert.equal(s.staging.flatMap((u) => u.attachments).filter((a) => MUMAKIL_CAPTURES.includes(a.code)).length, 2);
  assert.equal(s.mumakil!.setAside.filter((u) => MUMAKIL_CAPTURES.includes(u.code)).length, 2);
});
test("Mûmakil stage two random objectives retain physical identities and may share one printed-legal target", () => {
  let s = base(2); const enemy = add(s, M.wild); add(s, M.wild); const ids = s.mumakil!.setAside.filter((u) => MUMAKIL_CAPTURES.includes(u.code)).map((u) => u.id);
  s.progress = 12; advanceQuest(s); flush(s); s = settle(s, enemy.id);
  assert.equal(s.stage, 2); assert.equal(get(s, enemy.id)!.attachments.length, 2);
  assert.ok(get(s, enemy.id)!.attachments.every((a) => ids.includes(a.id)));
});
test("Mûmakil active exploration shuffles exactly one physical set-aside Wild; staging exploration only records the round", () => {
  let s = base(); const l = add(s, M.trail); mumakilExplored(s, l, false); s = finish(s); assert.equal(s.mumakil!.setAside.length, 8);
  const active = make(s, MORDOR.clearing); s.activeLocation = active; s.encounterDeck = [];
  progressLocation(s, active, 2); s = finish(s); assert.equal(s.mumakil!.setAside.filter((u) => u.code === M.wild).length, 3);
  assert.ok(s.encounterDeck.includes(M.wild) || s.staging.some((u) => u.code === M.wild)); assert.equal(s.mumakil!.exploredRound, s.round);
});
test("Mûmak Trail optional search moves an actual encounter discard Wild into staging and charges every player travel threat", () => {
  let s = base(2); s.stage = 2; setStage(s); s.encounterDeck = []; s.encounterDiscard = [M.wild];
  const l = make(s, M.trail); mumakilExplored(s, l, true); s = finish(s, "discard");
  assert.ok(s.staging.some((u) => u.code === M.wild)); assert.ok(!s.encounterDiscard.includes(M.wild));
  const before = [seatView(s, 0).threat, seatView(s, 1).threat]; prepend(s, ...mumakilTravelEffects(s, l)!); s = finish(s);
  assert.equal(seatView(s, 0).threat, before[0] + 1); assert.equal(seatView(s, 1).threat, before[1] + 1);
});
test("Mûmakil Wild is immune and indestructible while only three actual damage may be dealt in one round", () => {
  let s = base(); const e = wild(s); damage(s, e.id, 2, { combatDamage: true }); damage(s, e.id, 8, { combatDamage: true });
  assert.equal(get(s, e.id)!.damage, 3); assert.equal(mumakilDamageAmount(s, e, 2), 0); s = reload(s);
  damage(s, e.id, 3, { combatDamage: true }); assert.equal(get(s, e.id)!.damage, 3); s.round++;
  damage(s, e.id, 3, { combatDamage: true }); assert.equal(get(s, e.id)!.damage, 6); s.round++;
  damage(s, e.id, 3, { combatDamage: true }); check(s); assert.ok(get(s, e.id)); assert.equal(get(s, e.id)!.damage, 9);
  destroy(s, get(s, e.id)!); assert.ok(get(s, e.id));
});
test("Horse-hair Lasso uses the current engaged player's shuffled physical deck and only triggering pair enters victory", () => {
  let s = base(2); setStage(s); const e = wild(s, M.lasso, 1); const extra = s.mumakil!.setAside.find((u) => u.code === M.pit)!;
  s.mumakil!.setAside = s.mumakil!.setAside.filter((u) => u.id !== extra.id); e.attachments.push({ id: extra.id, code: extra.code, exhausted: false });
  e.damage = 6; forOwner(s, 1, () => { s.deck = ["01073"]; });
  damage(s, e.id, 1, { combatDamage: true }); s = finish(s, "capture");
  assert.ok(!get(s, e.id)); assert.ok(s.victoryCards!.includes(M.wild)); assert.ok(s.victoryCards!.includes(M.lasso));
  assert.ok(s.encounterDiscard.includes(M.pit)); assert.ok(seatView(s, 1).discard.includes("01073")); assert.equal(s.victory, 4);
});
test("Poisoned Spear uses printed encounter threat after a successful quest even if progress will be buffered", () => {
  let s = base(); setStage(s); const e = wild(s, M.spear); e.damage = 6; s.activeLocation = make(s, M.trail); s.encounterDeck = [MORDOR.trail];
  mumakilQuestSucceeded(s); s = finish(s, "capture"); assert.ok(!get(s, e.id)); assert.ok(s.encounterDiscard.includes(MORDOR.trail)); assert.ok(s.victoryCards!.includes(M.spear));
});
test("Pit Trap compares printed active threat and requires actual travel, including optional response and win", () => {
  let s = base(); setStage(s); const e = wild(s, M.pit); e.damage = 6; const l = make(s, MORDOR.clearing);
  const queued = s.queue.length; mumakilTravelEntered(s, l, false); assert.equal(s.queue.length, queued); s.progress = 8;
  mumakilTravelEntered(s, l, true); s = finish(s, "capture"); assert.equal(s.status, "won"); assert.ok(!get(s, e.id));
});
test("Noose of Vines requires a surviving defender with strictly greater remaining hit points", () => {
  let s = base(); setStage(s); const e = wild(s, M.noose); e.damage = 6; const d = s.heroes[0]; d.damage = stats(s, d).health - 3;
  combat(s, e, d); assert.equal(mumakilAttackFinished(s, s.combat!).length, 0);
  d.damage = 0; prepend(s, ...mumakilAttackFinished(s, s.combat!)); s = finish(s, "capture"); assert.ok(!get(s, e.id)); assert.ok(s.victoryCards!.includes(M.noose));
});
test("Mûmakil stage two remains blocked until all in-play Capture attachments leave, then actual progress wins", () => {
  let s = base(); setStage(s); const e = wild(s, M.pit); s.progress = 8; advanceQuest(s); assert.equal(s.status, "playing");
  discardAttachment(s, e, e.attachments[0]); advanceQuest(s); assert.equal(s.status, "won");
});
test("Mûmakil additional staging reveal is fixed at quest beginning when the active location is absent", () => {
  let s = base(); setStage(s); prepend(s, ...mumakilQuestBegin(s)); s = finish(s); assert.equal(mumakilExtraReveals(s), 1);
  s.activeLocation = make(s, M.trail); assert.equal(mumakilExtraReveals(s), 1);
  s = base(); setStage(s); s.activeLocation = make(s, M.trail); assert.equal(mumakilQuestBegin(s).length, 0);
});
test("Wild Mûmak end-round departure keeps its Capture objective and physical shadows leave normally", () => {
  let s = base(); const e = wild(s, M.noose); e.shadows = [M.insects]; const id = e.attachments[0].id;
  prepend(s, ...mumakilRoundEnd(s)); s = finish(s, "return"); assert.equal(s.staging.find((u) => u.id === e.id)!.attachments[0].id, id); assert.ok(s.encounterDiscard.includes(M.insects));
});
test("Territorial Ape uses current active location threat including Guardians' global location bonus", () => {
  const s = base(); const e = add(s, M.ape); s.activeLocation = make(s, M.trail); assert.equal(stats(s, e).attack, 4); assert.equal(threatOf(s, e), 4);
  add(s, M.guardians); assert.equal(threatOf(s, s.activeLocation), 3); assert.equal(stats(s, e).attack, 5); assert.equal(threatOf(s, e), 5);
});
test("Guardians' current-quest Forced search takes an actual Ape and engages it with the first player", () => {
  let s = base(2); const q = add(s, M.guardians); s.encounterDeck = [M.ape, M.trail]; mumakilSideQuestSelected(s, q); s = finish(s);
  assert.equal(allEngaged(s).filter((u) => u.code === M.ape).length, 1); assert.equal(ownerOf(s, allEngaged(s)[0]), 0); assert.deepEqual(s.encounterDeck, [M.trail]);
});
test("Strangling Python attaches its exact physical card after damage and prevents refresh and player ready until discarded", () => {
  let s = base(); const python = add(s, M.python); engage(s, python); python.shadows = [M.trail]; const d = s.heroes[0]; d.exhausted = true;
  damage(s, d.id, 1, { enemyId: python.id, combatDamage: true }); s = finish(s);
  const h = get(s, d.id)!; assert.ok(!get(s, python.id)); assert.equal(h.attachments[0].id, python.id); assert.equal(cannotReady(h, s), true);
  readyCharacter(s, h); assert.equal(h.exhausted, true); s = reload(s); discardAttachment(s, get(s, d.id)!, get(s, d.id)!.attachments[0]);
  assert.equal(cannotReady(get(s, d.id)!, s), false); assert.ok(s.encounterDiscard.includes(M.python)); assert.ok(s.encounterDiscard.includes(M.trail));
});
test("Giant Centipede actual damage preserves traits while its shadow blanks the full text through reload and expires", () => {
  let s = base(); const e = add(s, M.centipede), d = s.heroes[0]; engage(s, e); damage(s, d.id, 1, { enemyId: e.id, combatDamage: true }); syncAttachmentText(s);
  assert.ok(d.blanked); assert.ok(d.printedTraitsPreserved); s = reload(s); combat(s, get(s, e.id)!, get(s, d.id)!); mumakilShadow(s, M.centipede); syncAttachmentText(s);
  assert.ok(get(s, d.id)!.blanked); assert.ok(!get(s, d.id)!.printedTraitsPreserved); s.round++; syncAttachmentText(s); assert.ok(!get(s, d.id)!.blanked);
});
test("Terrible Fever removes a committed hero, attaches one physical Condition, and deals end-round damage", () => {
  let s = base(2); const d = seatView(s, 1).heroes[0]; d.committed = true; d.exhausted = true; mumakilEncounter(s, M.fever); s = finish(s, d.id);
  const h = get(s, d.id)!; assert.ok(!h.committed); assert.equal(h.attachments[0].code, M.fever); assert.ok(!s.encounterDiscard.includes(M.fever));
  prepend(s, ...mumakilRoundEnd(s)); s = finish(s); assert.equal(get(s, d.id)!.damage, 1);
});
test("Terrible Fever without a questing hero is discarded rather than retained or attached", () => {
  let s = base(); mumakilEncounter(s, M.fever); s = finish(s); assert.deepEqual(s.encounterDiscard, [M.fever]);
});
test("Biting Insects discards a seeded random physical hand card and assigns its printed cost among the owner's characters", () => {
  let s = base(2); forOwner(s, 1, () => s.hand = [make(s, "01013")]); mumakilEncounter(s, M.insects); s = finish(s);
  assert.equal(seatView(s, 1).hand.length, 0); assert.ok(seatView(s, 1).discard.includes("01013"));
  assert.equal(seatView(s, 1).heroes.reduce((sum, h) => sum + h.damage, 0), Number(card("01013").cost));
  assert.equal(seatView(s, 0).heroes.reduce((sum, h) => sum + h.damage, 0), 0);
});
test("The Savage South discards top five atomically then each controlled card matching their titles, including a foreign-owned attachment controlled by its host player", () => {
  let s = base(2); const ally = make(s, "01013"), remote = seatView(s, 1).heroes[0], a = make(s, "01026"); s.allies.push(ally);
  remote.attachments.push({ id: a.id, code: a.code, owner: 0, controller: 0, exhausted: false });
  s.deck = ["01013", "01030", "01031", "01032", "01034", "01033"]; forOwner(s, 1, () => s.deck = ["01026"]);
  mumakilEncounter(s, M.savage); s = finish(s); assert.ok(!get(s, ally.id)); assert.equal(get(s, remote.id)!.attachments.length, 0);
  assert.deepEqual(s.deck, ["01033"]); assert.equal(s.discard.filter((c) => c === "01013").length, 2); assert.equal(s.discard.filter((c) => c === "01026").length, 1);
});
test("Stampeding Oliphaunt without a staging Wild searches deck or discard for an actual Mûmak Trail", () => {
  let s = base(); s.encounterDeck = []; s.encounterDiscard = [M.trail]; mumakilEncounter(s, M.stampede); s = finish(s, "discard");
  assert.ok(s.staging.some((u) => u.code === M.trail)); assert.equal(s.encounterDiscard.filter((c) => c === M.trail).length, 0);
});
test("Harad Tiger and Savage South shadow return the attacking enemy only when its actual attack destroyed a character", () => {
  const s = base(); const e = add(s, M.tiger), d = s.heroes[0]; engage(s, e); combat(s, e, d);
  assert.equal(mumakilAttackFinished(s, s.combat!).length, 0); mumakilCharacterDestroyed(s, d, { enemyId: e.id, combatDamage: true });
  assert.ok(mumakilAttackFinished(s, s.combat!).some((x) => x.kind === "mumakilReturn"));
  const ape = add(s, M.ape); combat(s, ape, d); mumakilShadow(s, M.savage); mumakilCharacterDestroyed(s, d, { enemyId: ape.id, combatDamage: true });
  assert.ok(mumakilAttackFinished(s, s.combat!).some((x) => x.kind === "mumakilReturn"));
});
test("Mûmakil original combat shadows honor exploration, additional attacks, ready lock, and Biting Insects", () => {
  let s = base(); const e = add(s, M.ape), d = s.heroes[0]; engage(s, e); combat(s, e, d);
  mumakilShadow(s, M.ape); assert.equal(s.combat!.attackBonus, 1); s.mumakil!.exploredRound = s.round; mumakilShadow(s, M.ape); assert.equal(s.combat!.attackBonus, 3);
  mumakilShadow(s, M.tiger); assert.equal(s.combat!.extraAttacks, 1); mumakilShadow(s, M.fever); assert.equal(cannotReady(d, s), true);
  s.hand = [make(s, "01073")]; mumakilShadow(s, M.insects); s = finish(s); assert.equal(s.hand.length, 0);
});
test("Mûmakil saved state rejects corrupt cap, quest chain, physical zones and round markers", () => {
  const s = base(); syncSeat(s); assert.equal(validateSave(s), true);
  for (const mutate of [
    (x: GameState) => x.mumakil!.damageThisRound.push({ id: "evil", round: x.round, amount: 4 }),
    (x: GameState) => x.mumakil!.setAside.push(x.mumakil!.setAside[0]),
    (x: GameState) => { x.mumakil!.currentQuest = M.capture; },
    (x: GameState) => { x.mumakil!.exploredRound = x.round + 1; },
  ]) { const x = structuredClone(s); mutate(x); assert.equal(validateSave(x), false); }
});

for (const objective of [M.lasso, M.spear, M.pit, M.noose]) test(`Mûmakil native ${card(objective).name} control opens a saved optional capture and moves its exact pair`, () => {
  const f = captureFixture(objective);
  let s = applyAction(reload(f.s), objective === M.lasso ? { type: "ATTACK", enemyId: f.enemy.id, attackerIds: [f.hero.id] } :
    objective === M.spear ? { type: "NEXT" } : objective === M.pit ? { type: "TRAVEL", id: f.s.staging[0].id } :
      { type: "DEFEND", enemyId: f.enemy.id, defenderId: f.hero.id });
  assert.match(s.choice!.title, /Attempt to capture/); s = settle(reload(s), "capture");
  assert.ok(!get(s, f.enemy.id)); assert.ok(s.victoryCards!.includes(objective)); assert.ok(s.victoryCards!.includes(M.wild));
  if ([M.spear, M.pit].includes(objective)) assert.equal(s.status, "won");
});
test("Mûmakil native Python defense converts the exact damaged attacker to a Condition", () => {
  let s = base(); setStage(s); s.phase = "defense";
  const python = add(s, M.python), hero = s.heroes[0]; engage(s, python);
  s = settle(applyAction(reload(s), { type: "DEFEND", enemyId: python.id, defenderId: hero.id }));
  assert.ok(!get(s, python.id)); assert.ok(get(s, hero.id)!.attachments.some((a) => a.id === python.id && a.code === M.python));
  assert.ok(cannotReady(get(s, hero.id)!, s));
});

test("Mûmakil Python attachment during a native immediate defense discards its held previous shadows exactly once", () => {
  let s = base(); setStage(s); const python = add(s, M.python), hero = s.heroes[0]; engage(s, python);
  python.shadows = [M.insects]; s.encounterDeck = [M.trail]; prepend(s, fx("immediateAttack", { target: python.id, player: 0 })); flush(s);
  assert.deepEqual(s.combat!.immediatePreviousShadows, [M.insects]);
  s = applyAction(reload(s), { type: "CHOOSE", id: hero.id }); s = settle(s);
  assert.ok(get(s, hero.id)!.attachments.some((a) => a.id === python.id));
  assert.equal(s.encounterDiscard.filter((c) => c === M.insects).length, 1);
  assert.equal(s.encounterDiscard.filter((c) => c === M.trail).length, 1);
  assert.equal(s.combat, null); assert.equal(s.suspendedCombats.length, 0);
});

test("Mûmak Trail's stage-one Forced shuffle precedes its optional search for that same physical Wild", () => {
  let s = base(); s.activeLocation = make(s, M.trail); s.encounterDeck = []; s.encounterDiscard = [];
  progressLocation(s, s.activeLocation, 3); flush(s);
  assert.match(s.choice!.title, /Mûmak Trail/); assert.ok(s.choice!.options.some((o) => o.id === "deck"));
  s = settle(reload(s), "deck"); assert.equal(s.staging.filter((u) => u.code === M.wild).length, 1);
  assert.equal(s.mumakil!.setAside.filter((u) => u.code === M.wild).length, 3);
});
