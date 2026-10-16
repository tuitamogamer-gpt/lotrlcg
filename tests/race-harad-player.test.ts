import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { card, playerCards, SCRIPTED } from "../src/game/cards";
import { applyAction, availableAbilities, canPlay, createGame, playTargets } from "../src/game/engine";
import { fx, get, make, prepend, stagingThreat, stats, threatOf } from "../src/game/core";
import { engage, enterAlly, phaseEnd, progressLocation } from "../src/game/board";
import { flush } from "../src/game/effects";
import { forOwner, seatView, selectSeat } from "../src/game/table";
import { restrictedAttachment, hasTrait } from "../src/game/expansion-passives";
import { addQuestProgress } from "../src/game/side-quests";
import {
  RACE_HARAD_PLAYER as P,
  RACE_HARAD_PLAYER_CARDS,
  raceHaradPlayerWillBonus,
} from "../src/game/race-harad-player-support";
import {
  raceHaradPlayerSetup,
  raceHaradPlayerPlayProblem,
  raceHaradPlayerAbilityProblem,
  raceHaradProudHuntersCondition,
  raceHaradPlayerAttackKilled,
  raceHaradPlayerLocationExplored,
  raceHaradPlayerAttachmentPlayed,
  raceHaradMainQuestHasKeywords,
} from "../src/game/race-harad-player";
import {
  raceHaradPlayerFixture as fixture,
  raceHaradPlayerHand as hand,
  raceHaradPlayerAlly as ally,
  raceHaradPlayerAttach as attach,
} from "./race-harad-player-fixtures";
import { DESERT_CROSSING as D } from "../src/game/desert-crossing-support";
import { choose, reload, base } from "./against-shadow-final-fixtures";
import type { GameState } from "../src/game/types";

const pick = (s: GameState, id: string) => choose(reload(s), id);
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) => applyAction(reload(s), action);
function settle(s: GameState) {
  for (let n = 0; s.choice && n < 50; n++)
    s = pick(s, s.choice.options.find((o) => ["skip", "none", "continue"].includes(o.id))?.id ?? s.choice.options[0].id);
  assert.equal(s.choice, null);
  return s;
}

test("Race Across Harad registers ten original player designs, 28 physical cards and original printed text", () => {
  const catalog = JSON.parse(fs.readFileSync("public/catalog.json", "utf8"));
  assert.deepEqual(RACE_HARAD_PLAYER_CARDS, catalog.filter((c: {code:string}) => Object.values(P).includes(c.code as typeof P.thurindir)));
  assert.equal(RACE_HARAD_PLAYER_CARDS.length, 10);
  assert.equal(RACE_HARAD_PLAYER_CARDS.reduce((n,c) => n+c.quantity!, 0), 28);
  for (const c of RACE_HARAD_PLAYER_CARDS) {
    assert.ok(SCRIPTED.has(c.code), c.name);
    assert.equal(playerCards.filter((p) => p.code === c.code).length, 1);
    assert.equal(card(c.code).text, c.text);
  }
  assert.equal(card(P.secretWays).quest, 6);
  assert.equal(card(P.secretWays).victory, 1);
});
test("Thurindir native setup follows the actual mulligan, offers only physical side quests and survives pending reload", () => {
  let s = createGame(91, Object.fromEntries([...playerCards.filter(c=>c.type_code!=="hero" && c.type_code!=="player-side-quest" && (c.deck_limit??3)>=3).slice(0,20).map(c=>[c.code,3]),[P.secretWays,3]]), [P.thurindir,"01001","01006"], "custom", {scenarioId:"mirkwood"});
  assert.equal(s.choice,null);
  s=act(s,{type:"MULLIGAN"});
  assert.equal(s.choice,null);assert.equal(s.hand.length,6);
  for (let i=0;i<12 && !s.choice?.title.includes("Thurindir");i++) s=applyAction(s,{type:"KEEP"});
  assert.match(s.choice!.title,/Thurindir/);
  const option = s.choice!.options.find((o) => o.code === P.secretWays);
  // The opening hand can naturally contain every side quest in a short deck.
  if (option) {
    const before=s.hand.filter((u)=>u.code===P.secretWays).length;
    s=pick(s,option.id);
    assert.ok(s.hand.filter((u)=>u.code===P.secretWays).length>=before+1);
  } else s=pick(s,"none");
  assert.equal(s.choice,null);
});
test("Thurindir searches physical duplicate deck positions without taking another player's cards", () => {
  let s=fixture(2);
  s.deck=["01013",P.secretWays,P.secretWays,"01014"];
  forOwner(s,1,()=>s.deck=[P.secretWays]);
  raceHaradPlayerSetup(s); flush(s);
  assert.deepEqual(s.choice!.options.filter(o=>o.id!=="none").map(o=>o.id),["deck-1","deck-2"]);
  s=pick(s,"deck-2");
  assert.equal(s.hand.filter(u=>u.code===P.secretWays).length,1);
  assert.equal(s.deck.filter(c=>c===P.secretWays).length,1);
  assert.deepEqual(seatView(s,1).deck,[P.secretWays]);
});
test("Thurindir counts both encounter and player side quests in victory, excluding main quests and locations", () => {
  const s=fixture(), h=s.heroes[0], before=stats(s,h).will;
  s.victoryCards=[P.secretWays,"09014",D.water,"01119","01098"];
  const sideCount=s.victoryCards.filter(code=>["player-side-quest","encounter-side-quest"].includes(card(code).type_code)).length;
  assert.equal(stats(s,h).will,before+sideCount);
  h.blanked=true;
  assert.equal(raceHaradPlayerWillBonus(s,h),0);
});
test("Tribesman's native action targets another player's Harad character, pays exhaustion once and persists phase bonuses", () => {
  let s=fixture(2), t=ally(s,P.tribesman), remote=ally(s,"17008",1);
  const before=stats(s,remote);
  s=act(s,{type:"ABILITY",id:t.id});
  assert.ok(!s.choice!.options.some(o=>o.id===t.id));
  s=pick(s,remote.id);
  assert.equal(get(s,t.id)!.exhausted,true);
  const after=stats(reload(s),get(s,remote.id)!);
  assert.equal(after.will,before.will+1); assert.equal(after.attack,before.attack+1); assert.equal(after.defense,before.defense+1);
  assert.ok(availableAbilities(reload(s),get(s,t.id)!)[0].disabled);
});
test("Tribesman's lasting bonus survives its source leaving play and ends at phase end", () => {
  let s=fixture(), t=ally(s,P.tribesman), target=ally(s,"17008");
  const before=stats(s,target);
  s=act(s,{type:"ABILITY",id:t.id}); s=pick(s,target.id);
  s.allies=s.allies.filter(u=>u.id!==t.id);
  assert.equal(stats(s,get(s,target.id)!).will,before.will+1);
  phaseEnd(s);
  assert.equal(stats(s,get(s,target.id)!).will,before.will);
});
test("Tribesman cannot target itself, non-Harad characters or immune Harad characters", () => {
  const s=fixture(), t=ally(s,P.tribesman), remote=ally(s,"17008");
  remote.immuneToPlayerEffects=true;
  assert.match(raceHaradPlayerAbilityProblem(s,t)!,/another Harad/);
  t.blanked=true;
  assert.match(raceHaradPlayerAbilityProblem(s,t)!,/active text/);
});
test("Steed attaches only to Dunedain or Ranger heroes and counts as Restricted", () => {
  const s=fixture(), a=hand(s,P.steed), harad=ally(s,"17008");
  const ids=playTargets(s,a).map(u=>u.id);
  assert.ok(ids.includes(s.heroes[0].id)); assert.ok(ids.includes(s.heroes[1].id));
  assert.ok(!ids.includes(s.heroes[2].id)); assert.ok(!ids.includes(harad.id));
  attach(s,s.heroes[0],"01039"); attach(s,s.heroes[0],"01040");
  assert.ok(restrictedAttachment(P.steed));
});
test("Steed responds to actual engagement, reloads its optional window and exhausts to ready attached hero", () => {
  let s=fixture(), h=s.heroes[0], a=attach(s,h,P.steed), enemy=make(s,"01089");
  h.exhausted=true; s.staging=[enemy];
  engage(s,enemy); flush(s);
  assert.match(s.choice!.title,/Steed/);
  s=pick(s,"use");
  assert.equal(get(s,h.id)!.exhausted,false);
  assert.equal(get(s,h.id)!.attachments.find(x=>x.id===a.id)!.exhausted,true);
});
test("Steed's response belongs to its controller when attached to another player's hero", () => {
  let s=fixture(2), host=seatView(s,1).heroes[0], a=attach(s,host,P.steed,0), enemy=make(s,"01089");
  host.exhausted=true;
  forOwner(s,1,()=>engage(s,enemy));flush(s);
  assert.equal(s.table!.active,1); assert.match(s.choice!.title,/Steed/);
  s=pick(s,"use");
  assert.equal(get(s,host.id)!.exhausted,false);
  assert.equal(get(s,host.id)!.attachments.find(x=>x.id===a.id)!.exhausted,true);
});
test("Steed does not respond for another player's engagement and declining spends no cost", () => {
  let s=fixture(2), h=s.heroes[0], a=attach(s,h,P.steed), enemy=make(s,"01089"); h.exhausted=true;
  forOwner(s,1,()=>engage(s,enemy)); flush(s);
  assert.equal(s.choice,null);
  engage(s,make(s,"01089"));flush(s);s=pick(s,"skip");
  assert.equal(get(s,h.id)!.exhausted,true);assert.equal(get(s,h.id)!.attachments.find(x=>x.id===a.id)!.exhausted,false);
});
test("Mighty Warrior is limited to one per hero, grants Warrior and draws only through its optional native hand-play response", () => {
  let s=fixture(), h=s.heroes[0], a=hand(s,P.warrior);s.deck=["01013","01014"];
  assert.ok(!hasTrait(h,"Warrior"));
  s=act(s,{type:"PLAY",id:a.id,target:h.id});
  assert.match(s.choice!.title,/Mighty Warrior/);assert.ok(hasTrait(get(s,h.id)!,"Warrior"));
  const before=s.hand.length;s=pick(s,"use");assert.equal(s.hand.length,before+1);
  const duplicate=hand(s,P.warrior);
  assert.ok(!playTargets(s,duplicate).some(u=>u.id===h.id));
});
test("Mighty Warrior put into play or played from the deck grants its trait without the hand-play draw response", () => {
  const s=fixture(), h=s.heroes[0], a=attach(s,h,P.warrior);
  raceHaradPlayerAttachmentPlayed(s,h,a,false,true);flush(s);assert.equal(s.choice,null);
  raceHaradPlayerAttachmentPlayed(s,h,a,true,false);flush(s);assert.equal(s.choice,null);
  assert.ok(hasTrait(h,"Warrior"));a.blanked=true;assert.ok(!hasTrait(h,"Warrior"));
});
test("Mighty Warrior attached to another player's hero does not grant that controller a response to a card they did not play", () => {
  let s=fixture(2);const host=seatView(s,1).heroes[0],attachment=hand(s,P.warrior),before=seatView(s,1).hand.length;
  s=act(s,{type:"PLAY",id:attachment.id,target:host.id});
  assert.equal(s.choice,null);assert.ok(hasTrait(get(s,host.id)!,"Warrior"));
  assert.equal(seatView(s,1).hand.length,before);
  assert.ok(get(s,host.id)!.attachments.some(a=>a.id===attachment.id));
});
test("Proud Hunters requires distinct unique Noble and Ranger characters controlled by its caster", () => {
  const s=fixture(2);s.heroes=[s.heroes[1]];
  assert.equal(raceHaradProudHuntersCondition(s),false);
  s.heroes[0].dynamicTraits=["Noble","Ranger"];assert.equal(raceHaradProudHuntersCondition(s),false);
  const ranger=ally(s,"17008",1);ranger.dynamicTraits=["Ranger"];
  assert.equal(raceHaradProudHuntersCondition(s),false);
  const own=ally(s,"17008");own.dynamicTraits=["Ranger"];
  assert.equal(raceHaradProudHuntersCondition(s),true);
});
test("Proud Hunters native killing attack rewards only a participating owned hero with printed enemy threat", () => {
  let s=fixture(), h=s.heroes[1], event=hand(s,P.hunters), enemy=make(s,"01089");
  h.tempAttack=20;s.engaged=[enemy];s.phase="attack";enemy.tempThreat=30;
  const before=h.resources;
  assert.match(canPlay(s,event)!,/responds/);
  s=act(s,{type:"ATTACK",enemyId:enemy.id,attackerIds:[h.id]});
  assert.match(s.choice!.title,/Proud Hunters/);
  assert.deepEqual(s.choice!.options.filter(o=>o.id!=="skip").map(o=>o.id),[h.id]);
  s=pick(s,h.id);
  assert.equal(get(s,h.id)!.resources,before+(card(enemy.code).threat??0));
  assert.ok(!s.hand.some(u=>u.id===event.id));assert.ok(s.discard.includes(P.hunters));
});
test("Proud Hunters never offers for ally-only attacks or heroes owned by another player", () => {
  const s=fixture(2), event=hand(s,P.hunters), a=ally(s,"17004"), enemy=make(s,"01089");
  raceHaradPlayerAttackKilled(s,enemy,[a.id,seatView(s,1).heroes[0].id]);flush(s);
  assert.equal(s.choice,null);assert.ok(s.hand.some(u=>u.id===event.id));
});
test("Proud Hunters can decline without spending its physical event and a second physical copy can answer the same kill", () => {
  let s=fixture(), h=s.heroes[1], first=hand(s,P.hunters), second=hand(s,P.hunters), enemy=make(s,"01089");
  raceHaradPlayerAttackKilled(s,enemy,[h.id]);flush(s);s=pick(s,"skip");
  assert.match(s.choice!.title,/Proud Hunters/);s=pick(s,h.id);
  assert.ok(s.hand.some(u=>u.id===first.id));assert.ok(!s.hand.some(u=>u.id===second.id));
});
test("Pathfinder's native play searches only top five and adds the exact chosen nonunique location without revealing it", () => {
  let s=fixture(), p=hand(s,P.pathfinder);
  s.encounterDeck=["01077","01099","01089","01077","01077","01098"];
  s=act(s,{type:"PLAY",id:p.id});
  assert.match(s.choice!.title,/Pathfinder/);assert.ok(!s.choice!.options.some(o=>o.code==="01098"));
  s=pick(s,"deck-1");
  assert.ok(get(s,p.id));assert.equal(s.staging.filter(u=>u.code==="01099").length,1);
  assert.equal(s.encounterDeck.filter(c=>c==="01099").length,0);
  assert.equal(s.queue.length,0);
});
test("Pathfinder entering by an effect still runs its Forced search and discards itself when no location enters", () => {
  let s=fixture(), p=make(s,P.pathfinder);s.encounterDeck=Array(6).fill("01089");
  enterAlly(s,p,false,false,false);flush(s);assert.match(s.choice!.title,/Pathfinder/);
  s=pick(s,"none");assert.equal(get(s,p.id),undefined);assert.ok(s.discard.includes(P.pathfinder));
  assert.equal(s.encounterDeck.length,6);
});
test("Pathfinder's failed search does not discard an identical ally already in play", () => {
  let s=fixture(), kept=ally(s,P.pathfinder), entered=hand(s,P.pathfinder);s.encounterDeck=[];
  s=act(s,{type:"PLAY",id:entered.id});s=pick(s,"none");
  assert.ok(get(s,kept.id));assert.equal(get(s,entered.id),undefined);
});
test("Desert stage one's native ally-entry Forced resolves before Pathfinder's Forced search, once each across both saved choices", () => {
  let s=base("desert-crossing");
  for(const hero of s.heroes) hero.phaseResourceIcons=["leadership","tactics","spirit","lore"];
  const p=hand(s,P.pathfinder);s.encounterDeck=["01099","01089"];
  s=act(s,{type:"PLAY",id:p.id});
  assert.match(s.choice!.title,/Desert of Harad/);
  assert.ok(!s.staging.some(u=>u.code==="01099"));
  s=pick(s,"damage");
  assert.equal(get(s,p.id)!.damage,1);assert.match(s.choice!.title,/Pathfinder/);
  s=pick(s,"deck-0");
  assert.equal(get(s,p.id)!.damage,1);assert.equal(s.staging.filter(u=>u.code==="01099").length,1);
  assert.equal(s.choice,null);assert.equal(s.queue.length,0);
});
test("Backtrack moves a chosen amount from the main quest and explores its staging target after both pending windows reload", () => {
  let s=fixture(), event=hand(s,P.backtrack), location=make(s,"01099");
  s.progress=5;s.staging=[location];
  assert.equal(canPlay(s,event),null);
  s=act(s,{type:"PLAY",id:event.id});assert.match(s.choice!.title,/Backtrack/);
  s=pick(s,location.id);assert.equal(s.choice!.options.length,5);
  s=pick(s,"3");assert.equal(s.progress,2);assert.equal(get(s,location.id),undefined);
  assert.ok(s.encounterDiscard.includes(location.code));assert.ok(s.discard.includes(P.backtrack));
});
test("Backtrack always removes main quest progress even while a side quest is selected", () => {
  let s=fixture(), event=hand(s,P.backtrack), location=make(s,"01099"), side=make(s,P.secretWays);
  s.progress=4;side.progress=2;s.staging=[location,side];s.phase="quest";
  s.sideQuestSelections={shared:{id:side.id,code:side.code,phase:"quest"}};
  s=act(s,{type:"PLAY",id:event.id});s=pick(s,location.id);s=pick(s,"1");
  assert.equal(s.progress,3);assert.equal(get(s,side.id)!.progress,2);assert.equal(get(s,location.id)!.progress,1);
});
test("Backtrack refuses a main quest with keywords and cannot move progress to an immune location", () => {
  const s=fixture(), event=hand(s,P.backtrack), location=make(s,"01099");s.progress=4;s.staging=[location];
  location.immuneToPlayerEffects=true;assert.match(raceHaradPlayerPlayProblem(s,event)!,/location/);
  s.scenarioId="into-ithilien";s.stage=1;location.immuneToPlayerEffects=false;
  assert.ok(raceHaradMainQuestHasKeywords(s));assert.match(canPlay(s,event)!,/keywords/);
});
test("Settler responds only to active exploration, discards its exact physical ally and matching staged location after reload", () => {
  let s=fixture(), cost=ally(s,P.settler), kept=ally(s,P.settler), active=make(s,"01099"), target=make(s,"01099");
  s.activeLocation=active;s.staging=[target];
  progressLocation(s,active,card(active.code).quest!);flush(s);
  assert.match(s.choice!.title,/Settler/);
  s=pick(s,target.id);s=settle(s);
  assert.equal(get(s,cost.id),undefined);assert.ok(get(s,kept.id));assert.equal(get(s,target.id),undefined);
  assert.equal(s.encounterDiscard.filter(c=>c===active.code).length,2);
  assert.equal(s.discard.filter(c=>c===P.settler).length,1);
});
test("Settler is offered to its owner when another player explored the active location", () => {
  let s=fixture(2), cost=ally(s,P.settler,1), active=make(s,"01099"), target=make(s,"01099");
  s.staging=[target];raceHaradPlayerLocationExplored(s,active,true);flush(s);
  assert.equal(s.table!.active,1);s=pick(s,target.id);
  assert.equal(get(s,cost.id),undefined);assert.ok(seatView(s,1).discard.includes(P.settler));
  assert.equal(seatView(s,0).discard.includes(P.settler),false);
});
test("Settler's browser fixture triggers from a native quest commit and preserves physical duplicate ally and location costs", () => {
  let s=fixture();const cost=ally(s,P.settler),kept=ally(s,P.settler),active=make(s,"01099"),matching=make(s,"01099"),hero=s.heroes[0];
  s.activeLocation=active;s.staging=[matching];s.phase="quest";hero.tempWill=10;s.encounterDeck=["01077","01089"];
  s=act(s,{type:"TOGGLE_QUEST",id:hero.id});s=act(s,{type:"COMMIT"});s=act(s,{type:"NEXT"});
  assert.match(s.choice!.title,/Settler/);s=pick(s,matching.id);s=settle(s);
  assert.equal(get(s,cost.id),undefined);assert.ok(get(s,kept.id));assert.equal(get(s,matching.id),undefined);
  assert.equal(s.encounterDiscard.filter(c=>c===active.code).length,2);
});
test("Settler cannot respond to staging exploration, discard a different title or choose an immune matching location", () => {
  const s=fixture(), a=ally(s,P.settler), active=make(s,"01099"), target=make(s,"01099"), other=make(s,"01077");s.staging=[target,other];
  raceHaradPlayerLocationExplored(s,active,false);flush(s);assert.equal(s.choice,null);
  target.immuneToPlayerEffects=true;raceHaradPlayerLocationExplored(s,active,true);flush(s);assert.equal(s.choice,null);
  assert.ok(get(s,a.id));
});
test("Explore Secret Ways removes only matching location contribution from staging and preserves its current threat", () => {
  const s=fixture(), active=make(s,"01099"), same=make(s,"01099"), other=make(s,"01077"), enemy=make(s,"01089");
  s.activeLocation=active;s.staging=[same,other,enemy];
  const before=stagingThreat(s), printed=threatOf(s,same);
  s.victoryCards=[P.secretWays];assert.equal(stagingThreat(s),before-printed);assert.equal(threatOf(s,same),printed);
  same.immuneToPlayerEffects=true;assert.equal(stagingThreat(s),before);
});
test("Explore Secret Ways is a six-progress side quest and additional victory-display copies go to their physical owner's discard", () => {
  const s=fixture(2), quest=make(s,P.secretWays);quest.owner=1;quest.controller=0;s.staging=[quest];
  addQuestProgress(s,quest,6);assert.deepEqual(s.victoryCards,[P.secretWays]);
  const duplicate=make(s,P.secretWays);duplicate.owner=1;duplicate.controller=0;s.staging=[duplicate];
  addQuestProgress(s,duplicate,6);assert.deepEqual(s.victoryCards,[P.secretWays]);
  assert.equal(seatView(s,1).discard.filter(c=>c===P.secretWays).length,1);
  assert.ok(!seatView(s,0).discard.includes(P.secretWays));
});
test("Secret Ways' browser fixture defeats its selected side quest from a native quest commitment without putting progress on the main quest", () => {
  let s=fixture();const quest=make(s,P.secretWays),hero=s.heroes[0];s.staging=[quest];s.phase="quest";
  s.sideQuestSelections={shared:{id:quest.id,code:quest.code,phase:"quest"}};hero.tempWill=7;s.encounterDeck=["01077","01089"];
  s=act(s,{type:"TOGGLE_QUEST",id:hero.id});s=act(s,{type:"COMMIT"});s=act(s,{type:"NEXT"});s=settle(s);
  assert.ok(s.victoryCards!.includes(P.secretWays));assert.equal(s.progress,0);
});
test("Steward's native event-play response raises every player's threat once then draws before the event resolves", () => {
  let s=fixture(2), steward=ally(s,P.steward), event=hand(s,"01020"), target=steward;target.exhausted=true;s.deck=["01013","01014"];
  s=act(s,{type:"PLAY",id:event.id,target:target.id});assert.match(s.choice!.title,/Steward/);
  assert.ok(s.resolvingEvents?.some(e=>e.unit.id===event.id));assert.equal(get(s,target.id)!.exhausted,true);
  s=pick(s,"use");assert.equal(s.threat,21);assert.equal(seatView(s,1).threat,21);
  assert.equal(s.hand.at(-1)!.code,"01013");assert.equal(get(s,target.id)!.exhausted,false);
  assert.ok(get(s,steward.id));assert.ok(s.discard.includes("01020"));
});
test("Steward's once-round limit is shared by its controller's copies and survives reloading", () => {
  let s=fixture();ally(s,P.steward);ally(s,P.steward);const event=hand(s,"01022");s.heroes[0].exhausted=true;
  s=act(s,{type:"PLAY",id:event.id,target:s.heroes[0].id});s=pick(s,"use");
  assert.equal(s.choice,null);const second=hand(s,"01022");s.heroes[0].exhausted=true;
  s=act(s,{type:"PLAY",id:second.id,target:s.heroes[0].id});assert.equal(s.choice,null);assert.equal(s.threat,21);
});
test("Declining one Steward does not consume the ability and lets another physical copy answer that event", () => {
  let s=fixture();ally(s,P.steward);ally(s,P.steward);const event=hand(s,"01022");s.heroes[0].exhausted=true;
  s=act(s,{type:"PLAY",id:event.id,target:s.heroes[0].id});s=pick(s,"skip");assert.match(s.choice!.title,/Steward/);
  s=pick(s,"use");assert.equal(s.threat,21);
});
test("Steward never answers another player's event with a copy controlled by this player", () => {
  let s=fixture(2);ally(s,P.steward);const event=hand(s,"01022",1);selectSeat(s,1);s.table!.turn=1;s.heroes[0].exhausted=true;
  s=act(s,{type:"PLAY",id:event.id,target:s.heroes[0].id});assert.equal(s.choice,null);assert.equal(s.threat,20);
});
test("Steward also answers a real triggered-response event while it is held outside hand and discard", () => {
  let s=fixture();ally(s,P.steward);const event=hand(s,P.hunters), hero=s.heroes[1], enemy=make(s,"01089");
  raceHaradPlayerAttackKilled(s,enemy,[hero.id]);flush(s);s=pick(s,hero.id);
  assert.match(s.choice!.title,/Steward/);assert.ok(s.resolvingEvents?.some(e=>e.unit.id===event.id));
  s=pick(s,"use");assert.equal(s.threat,21);assert.ok(s.discard.includes(P.hunters));
});
test("Steward preserves native Doomed response ordering before its draw, including a saved Isengard ally window", () => {
  let s=fixture();ally(s,P.steward);const guard=ally(s,"07004"), event=hand(s,"01022");guard.exhausted=true;s.heroes[0].exhausted=true;s.deck=["01013"];
  s=act(s,{type:"PLAY",id:event.id,target:s.heroes[0].id});s=pick(s,"use");
  assert.match(s.choice!.title,/Doomed|Orthanc|Guard/);assert.equal(s.hand.length,0);
  s=settle(s);assert.equal(s.hand[0].code,"01013");
});
