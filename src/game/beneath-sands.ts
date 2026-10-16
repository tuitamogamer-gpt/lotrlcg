import type { Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { isAlly, isHero } from "./card-types";
import { choose, encounterDraw, fx, get, log, make, prepend, removeShadowCard, shuffle } from "./core";
import { attachToQuest, mainQuestUnit } from "./quest-state";
import { discardAttachment, discardCharacter, enemyAddedToStaging, engage, questDefeated, win } from "./board";
import { activeSeat, allCharacters, allEngaged, attachmentController, firstPlayer, forOwner, ownerOf, playerOrder, seatName } from "./table";
import { BENEATH_SANDS as B, BENEATH_SANDS_MAIN_QUESTS, BENEATH_SANDS_RECIPES, beneathSandsHasTrackSign, beneathSandsOnTrack, beneathSandsSearch, beneathSandsTrackValue } from "./beneath-sands-support";
export * from "./beneath-sands-support";

const live = (s: GameState) => !!s.beneathSands;
const stageLive = (s: GameState, stage: number) => live(s) && s.stage === stage && !mainQuestUnit(s)?.blanked;
const sideLive = (s: GameState, code: string) => live(s) && s.staging.some((u) => u.code === code && !u.blanked);
const own = (s: GameState, p: number) => allCharacters(s).filter((u) => ownerOf(s, u) === p);
const enemies = (s: GameState) => [...s.staging, ...allEngaged(s)].filter((u) => card(u.code).type_code === "enemy");
const creature = (code: string) => (card(code).traits ?? "").split(".").some((t) => t.trim() === "Creature");
const searchLive = (s: GameState) => live(s) && !!beneathSandsSearch(s) && !beneathSandsSearch(s)?.blanked;
const searchIgnored = (s: GameState) => s.beneathSands?.ignoreSearch?.round === s.round && s.beneathSands?.ignoreSearch?.phase === s.phase;
type SandsCombat = NonNullable<GameState["combat"]> & { beneathSandsPoisonShadow?: boolean };

export function setupBeneathSands(s: GameState) {
  const recipe = BENEATH_SANDS_RECIPES.find((r) => r.mode === (s.easyMode ? "easy" : "standard"))!;
  s.encounterDeck = recipe.cards.filter((c) => c.section === "sharedEncounterDeck").flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const search = make(s, B.search); search.flipped = true; s.staging.push(search);
  s.beneathSands = { initialized: false, advancing: false, currentQuest: B.caves, questDeck: BENEATH_SANDS_MAIN_QUESTS.slice(1), completedQuests: [],
    setAside: [make(s, B.broodMother)], searchId: search.id, onTrack: false, resolving: [], poisoned: [] };
}
export function beneathSandsOpeningHandsKept(s: GameState) {
  if (!s.beneathSands || s.beneathSands.initialized) return false;
  prepend(s, fx("beneathSandsSetup", { player: firstPlayer(s) }), fx("nextRound")); return true;
}
export function beneathSandsCheck(s: GameState) {
  if (!live(s) || s.status !== "playing") return;
  const boss = enemies(s).find((u) => u.code === B.broodMother && !u.blanked);
  if (boss && (s.staging.some((u) => u.id === boss.id) || ownerOf(s, boss) !== firstPlayer(s))) {
    const pending = (e: Effect) => e.kind === "beneathSandsEngageMother" && e.target === boss.id;
    if (!s.queue.some(pending) && !s.choice?.options.some((o) => o.effects.some(pending))) prepend(s, fx("beneathSandsEngageMother", { target: boss.id, player: firstPlayer(s) }));
  }
}
export function beneathSandsAdvance(s: GameState) {
  const q = s.beneathSands; if (!q) return false;
  if (!q.initialized || q.advancing || s.stageRevealing || s.phase === "setup" || s.status !== "playing") return true;
  if (s.progress < 5 || (stageLive(s, 3) && enemies(s).some((u) => u.code === B.broodMother))) return true;
  if (questDefeated(s, q.currentQuest)) return true;
  if (s.stage === 3) { win(s); s.reason = "The Brood Mother is defeated and the missing companions are rescued from the spiders’ hive."; }
  else { q.advancing = true; prepend(s, fx("beneathSandsAdvance", { player: firstPlayer(s) })); }
  return true;
}
export const beneathSandsProgress = (s: GameState, amount: number, quest: Unit) => live(s) && !beneathSandsOnTrack(s) && searchLive(s) && quest.code === s.beneathSands!.currentQuest ? 0 : amount;
export const beneathSandsCannotCancel = (s: GameState) => stageLive(s, 2) && beneathSandsOnTrack(s);
export const beneathSandsRevealSurge = (s: GameState, code: string) => live(s) && code === B.broodling && beneathSandsOnTrack(s);
export function beneathSandsStats(s: GameState, u: Unit) { return { attack: live(s) && !u.blanked && u.code === B.guardian && beneathSandsOnTrack(s) ? 2 : 0, defense: 0 }; }
export const beneathSandsThreatBonus = (s: GameState, u: Unit) => !live(s) || u.blanked ? 0 : u.code === B.tunnel ? own(s, firstPlayer(s)).length : u.code === B.cavern && beneathSandsOnTrack(s) ? 2 : 0;
export const beneathSandsEngagementBonus = (s: GameState, u: Unit) => live(s) && !u.blanked && u.code === B.guardian && beneathSandsOnTrack(s) ? -5 : 0;
export const beneathSandsEngagementPlayer = (s: GameState, u: Unit) => live(s) && !u.blanked && u.code === B.broodMother ? firstPlayer(s) : undefined;
export const beneathSandsDamageAmount = (s: GameState, u: Unit, amount: number) => live(s) && u.code === B.broodMother && !u.blanked && !(stageLive(s, 3) && s.progress >= 5) ? 0 : amount;
export const beneathSandsCannotDefend = (s: GameState, u: Unit) => live(s) && u.code === B.viper && !u.blanked;
export const beneathSandsCannotReady = (s: GameState, u: Unit) => !!s.beneathSands?.poisoned.some((p) => p.id === u.id && p.round === s.round);
export const beneathSandsCharacterBlanked = (s: GameState, u: Unit) => u.damage > 0 && (isHero(u) || isAlly(u)) && sideLive(s, B.remedy);
export const beneathSandsLocationProgressBlocked = (s: GameState, u: Unit) => live(s) && beneathSandsOnTrack(s) && card(u.code).type_code === "location" && s.staging.some((l) => l.id === u.id) && sideLive(s, B.passage);
export function beneathSandsDamageDealt(s: GameState, u: Unit, amount: number, context: DamageContext) {
  if (!s.beneathSands || amount <= 0 || !context.enemyId || !(isHero(u) || isAlly(u))) return;
  const enemy = get(s, context.enemyId), combat = s.combat as SandsCombat | null;
  const poison = (u: Unit) => { const q = s.beneathSands!; q.poisoned = q.poisoned.filter((p) => p.id !== u.id); q.poisoned.push({ id: u.id, round: s.round }); };
  if (enemy?.code === B.scorpion && !enemy.blanked) poison(u);
  if (context.combatDamage && combat?.enemyId === context.enemyId && combat.beneathSandsPoisonShadow)
    for (const id of combat.defenderIds?.length ? combat.defenderIds : combat.defenderId ? [combat.defenderId] : []) { const d = get(s, id); if (d) poison(d); }
}
/** Flip only on a real change. Lost Underground blocks all flips except its own defeated Response. */
function flip(s: GameState, on: boolean, override = false) {
  const q = s.beneathSands, objective = beneathSandsSearch(s);
  if (!q || !objective || q.onTrack === on || (!override && sideLive(s, B.lostUnderground))) return false;
  q.onTrack = on; objective.flipped = !on;
  if (on) objective.resources = 0;
  else {
    if (stageLive(s, 3)) s.progress = 0;
    const quest = mainQuestUnit(s);
    for (const a of quest?.attachments.filter((a) => a.code === B.grabbed && !a.blanked) ?? []) {
      // The trigger is fixed now; the physical Condition leaves after all players finish.
      prepend(s, ...playerOrder(s).map((player) => fx("beneathSandsDiscardAlly", { player })), fx("discardAttachment", { target: quest!.id, source: a.id }));
    }
  }
  log(s, `The search is now ${on ? "On Track" : "Off Track"}.`, on ? "good" : "danger"); return true;
}
export function beneathSandsQuestFailed(s: GameState) { if (searchLive(s) && beneathSandsOnTrack(s) && !searchIgnored(s)) prepend(s, fx("beneathSandsFlip", { flag: false, player: firstPlayer(s) })); }
export function beneathSandsEndQuest(s: GameState) { if (s.beneathSands?.initialized && searchLive(s) && !searchIgnored(s)) prepend(s, fx("beneathSandsSearchEnd", { player: firstPlayer(s) })); }
export function beneathSandsRoundEnd(s: GameState): Effect[] { return live(s) ? enemies(s).filter((u) => u.code === B.broodMother && !u.blanked).map((u) => fx("beneathSandsMotherBrood", { source: u.id, player: firstPlayer(s) })) : []; }
export function beneathSandsTravelEffects(s: GameState, u: Unit): Effect[] | undefined {
  if (!live(s) || u.blanked) return undefined;
  if (u.code === B.tunnel) return [fx("reveal", { player: firstPlayer(s) })];
  if (u.code === B.nest) return [fx("beneathSandsNest", { player: firstPlayer(s) })];
}
export function beneathSandsTravelEntered(s: GameState, u: Unit, actualTravel = true) {
  if (!live(s)) return;
  const effects: Effect[] = [];
  if (u.code === B.burrow && !u.blanked) effects.push(fx("beneathSandsBurrow", { player: firstPlayer(s) }));
  if (actualTravel) {
    effects.push(...enemies(s).filter((e) => e.code === B.viper && !e.blanked && (!allEngaged(s).some((x) => x.id === e.id) || ownerOf(s, e) !== firstPlayer(s))).map((e) => fx("beneathSandsViperEngage", { target: e.id, player: firstPlayer(s) })));
    if (!u.blanked && beneathSandsTrackValue(u.code) > 0) effects.push(fx("beneathSandsTrack", { target: u.id, value: beneathSandsTrackValue(u.code), player: firstPlayer(s) }));
  }
  prepend(s, ...effects);
}
export function beneathSandsExplored(s: GameState, u: Unit, _wasActive: boolean) {
  if (live(s) && u.code === B.burrow && !u.blanked && s.stage !== 3) prepend(s, fx("beneathSandsSetMotherAside", { player: firstPlayer(s) }));
}
export function beneathSandsSideDefeated(s: GameState, u: Unit) {
  if (!live(s) || u.blanked) return;
  if (u.code === B.lostUnderground) prepend(s, fx("beneathSandsLostResponse", { player: firstPlayer(s) }));
  if (u.code === B.remedy) prepend(s, fx("desertRemedyResponse", { player: firstPlayer(s) }));
}
export function beneathSandsCardEntered(_s: GameState, _u: Unit, _fromReveal = false, _cancel = false) { return false; }
export function beneathSandsEncounter(s: GameState, code: string, replay = false, fromReveal = true) {
  if (!live(s)) return false;
  if (code === B.lostUnderground) { if (fromReveal) prepend(s, fx("beneathSandsLostReveal", { player: firstPlayer(s) })); return true; }
  if (![B.forcedOff, B.grabbed].includes(code)) return false;
  if (!fromReveal) { if (!replay) s.encounterDiscard.push(code); return true; }
  if (!replay) { if (code === B.grabbed) s.beneathSands!.resolving.push(code); else s.encounterDiscard.push(code); }
  prepend(s, fx(code === B.forcedOff ? "beneathSandsForcedOff" : "beneathSandsGrabbed", { flag: replay, player: firstPlayer(s) })); return true;
}
function dealShadow(s: GameState, u: Unit) { const code = encounterDraw(s, true); if (code) { u.shadows.push(code); if (u.faceupShadows) u.faceupShadows.push(false); } }
export function beneathSandsShadow(s: GameState, code: string) {
  const c = s.combat as SandsCombat | null; if (!live(s) || !c) return false;
  const player = c.attackPlayer ?? activeSeat(s);
  if (code === B.guardian) c.attackBonus += beneathSandsOnTrack(s) ? 2 : 1;
  else if (code === B.broodling) {
    if (beneathSandsOnTrack(s)) {
      const attacker = get(s, c.enemyId), index = attacker?.shadows.slice(0, attacker.revealedShadowCount ?? 0).lastIndexOf(code);
      if (attacker && index !== undefined && index >= 0) { removeShadowCard(attacker, index); const broodling = make(s, code); s.staging.push(broodling); forOwner(s, player, () => engage(s, broodling)); dealShadow(s, broodling); }
    }
  }
  else if (code === B.forcedOff) { if (beneathSandsOnTrack(s)) c.extraAttacks = (c.extraAttacks ?? 0) + 1; }
  else if (code === B.cavern) prepend(s, fx("beneathSandsExhaust", { player }));
  else if (code === B.passage) prepend(s, fx("beneathSandsDiscardAttachment", { player }));
  else if (code === B.scorpion) c.beneathSandsPoisonShadow = true;
  else return false;
  return true;
}
function addEnemy(s: GameState, u: Unit) { s.staging.push(u); enemyAddedToStaging(s, u); }
function addMother(s: GameState) {
  const q = s.beneathSands!, i = q.setAside.findIndex((u) => u.code === B.broodMother);
  if (i >= 0) addEnemy(s, q.setAside.splice(i, 1)[0]);
}
function setMotherAside(s: GameState) {
  const mother = enemies(s).find((u) => u.code === B.broodMother); if (!mother) return;
  s.staging = s.staging.filter((u) => u.id !== mother.id);
  for (const p of playerOrder(s)) forOwner(s, p, () => { s.engaged = s.engaged.filter((u) => u.id !== mother.id); });
  s.encounterDiscard.push(...mother.shadows); mother.shadows = []; delete mother.faceupShadows; mother.revealedShadowCount = 0;
  for (const c of [s.combat, ...(s.suspendedCombats ?? [])]) if (c?.enemyId === mother.id && c.immediatePreviousShadows !== undefined) {
    s.encounterDiscard.push(...c.immediatePreviousShadows); c.immediatePreviousShadows = []; delete c.immediatePreviousFaceupShadows; c.immediatePreviousRevealedShadowCount = 0;
  }
  for (const a of [...mother.attachments]) discardAttachment(s, mother, a, true);
  const reset = make(s, mother.code); reset.id = mother.id;
  s.beneathSands!.setAside.push(reset);
}
function shuffleDiscard(s: GameState) { s.encounterDeck = shuffle(s, [...s.encounterDeck, ...s.encounterDiscard.splice(0)]); }
function discardUntil(s: GameState, count: number, accepts: (code: string) => boolean) {
  while (count > 0 && s.encounterDeck.length) { const code = s.encounterDeck.shift()!; if (accepts(code)) { const u = make(s, code); card(code).type_code === "enemy" ? addEnemy(s, u) : s.staging.push(u); count--; } else s.encounterDiscard.push(code); }
}
export const beneathSandsSharedEffect = (e: Effect) => e.kind.startsWith("beneathSands") && !e.kind.startsWith("beneathSandsPlayer") && !["beneathSandsDiscardAlly", "beneathSandsExhaust", "beneathSandsDiscardAttachment"].includes(e.kind);
export function beneathSandsEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("beneathSands") || e.kind.startsWith("beneathSandsPlayer")) return false;
  const q = s.beneathSands; if (!q) return true;
  const player = e.player ?? firstPlayer(s), u = get(s, e.target);
  switch (e.kind) {
    case "beneathSandsSetup": discardUntil(s, playerOrder(s).length, (code) => card(code).type_code === "location"); q.initialized = true; break;
    case "beneathSandsAdvance": {
      q.completedQuests.push(q.currentQuest); q.currentQuest = q.questDeck.shift()!; s.stage++; s.progress = 0; q.advancing = false; s.stageRevealing = true;
      prepend(s, fx("beneathSandsStageReveal", { player: firstPlayer(s) }), fx("stageRevealed")); break;
    }
    case "beneathSandsStageReveal":
      if (s.stage === 2) { flip(s, false); shuffleDiscard(s); discardUntil(s, playerOrder(s).length, (code) => card(code).type_code === "enemy"); }
      if (s.stage === 3) { addMother(s); prepend(s, ...playerOrder(s).slice(1).map((player) => fx("reveal", { player })), fx("beneathSandsFlip", { flag: false })); }
      break;
    case "beneathSandsEngageMother": if (u && u.code === B.broodMother && !u.blanked) forOwner(s, firstPlayer(s), () => engage(s, u)); break;
    case "beneathSandsFlip": flip(s, !!e.flag); break;
    case "beneathSandsLostReveal": {
      // Its When Revealed flip happens before its continuous lock applies.
      const lost = s.staging.filter((u) => u.code === B.lostUnderground);
      const otherLock = lost.some((u) => u.id !== lost.at(-1)?.id && !u.blanked);
      if (!otherLock) flip(s, false, true); break;
    }
    case "beneathSandsSearchEnd": {
      if (!searchLive(s) || searchIgnored(s)) break;
      if (q.onTrack) {
        q.resolving.push(...s.encounterDeck.splice(0, 3));
        const opts = q.resolving.flatMap((code, index) => beneathSandsHasTrackSign(code) ? [{ id: String(index), code, label: card(code).name,
          effects: [fx("beneathSandsOnTrackTake", { code, value: index, player })] }] : []);
        if (opts.length) choose(s, "On Track · Add one card with the On Track sign", opts);
        else { s.encounterDiscard.push(...q.resolving.splice(0)); flip(s, false); }
      } else {
        const search = beneathSandsSearch(s)!; search.resources++;
        const reverseIndex = [...s.encounterDiscard].reverse().findIndex((code) => card(code).type_code === "location");
        const i = reverseIndex < 0 ? -1 : s.encounterDiscard.length - 1 - reverseIndex;
        const threat = { id: "threat", label: `Raise each player’s threat by ${search.resources}`, effects: playerOrder(s).map((player) => fx("threat", { value: search.resources, player })) };
        if (i >= 0) choose(s, "Off Track · Return a location or raise threat", [{ id: "location", code: s.encounterDiscard[i], label: `Return ${card(s.encounterDiscard[i]).name} to staging`, effects: [fx("beneathSandsOffTrackLocation", { code: s.encounterDiscard[i], value: i })] }, threat]);
        else prepend(s, ...threat.effects);
      }
      break;
    }
    case "beneathSandsOnTrackTake": {
      if (q.resolving[e.value!] === e.code) { const code = q.resolving.splice(e.value!, 1)[0]; const unit = make(s, code); card(code).type_code === "enemy" ? addEnemy(s, unit) : s.staging.push(unit); s.encounterDiscard.push(...q.resolving.splice(0)); }
      else { s.encounterDiscard.push(...q.resolving.splice(0)); flip(s, false); }
      break;
    }
    case "beneathSandsOffTrackLocation": if (s.encounterDiscard[e.value!] === e.code) s.staging.push(make(s, s.encounterDiscard.splice(e.value!, 1)[0])); break;
    case "beneathSandsTrack": {
      if (q.onTrack || sideLive(s, B.lostUnderground)) break;
      let sign = false;
      for (let i = 0; i < (e.value ?? 0); i++) {
        if (!s.encounterDeck.length && s.encounterDiscard.length) shuffleDiscard(s);
        const code = s.encounterDeck.shift(); if (!code) break; s.encounterDiscard.push(code); sign ||= beneathSandsHasTrackSign(code);
      }
      if (sign) flip(s, true); break;
    }
    case "beneathSandsBurrow": flip(s, true); addMother(s); break;
    case "beneathSandsSetMotherAside": setMotherAside(s); break;
    case "beneathSandsViperEngage": if (u) forOwner(s, firstPlayer(s), () => engage(s, u)); break;
    case "beneathSandsNest": shuffleDiscard(s); discardUntil(s, 1, (code) => card(code).type_code === "enemy" && creature(code)); break;
    case "beneathSandsMotherBrood": {
      if (!get(s, e.source)) break;
      const opts = (["deck", "discard"] as const).flatMap((zone) => { const pile = zone === "deck" ? s.encounterDeck : s.encounterDiscard, i = pile.indexOf(B.broodling); return i < 0 ? [] : [{ id: zone, code: B.broodling, label: `Add Spider Broodling from encounter ${zone}`, effects: [fx("beneathSandsMotherTake", { value: i, text: zone })] }]; });
      if (opts.length) choose(s, "Brood Mother · Search for a Spider Broodling", opts); else shuffle(s, s.encounterDeck); break;
    }
    case "beneathSandsMotherTake": { const pile = e.text === "discard" ? s.encounterDiscard : s.encounterDeck; if (pile[e.value!] === B.broodling) addEnemy(s, make(s, pile.splice(e.value!, 1)[0])); shuffle(s, s.encounterDeck); break; }
    case "beneathSandsForcedOff": {
      const questers = allCharacters(s).filter((u) => u.committed);
      choose(s, "Forced Off Track · Flip the search or damage questing characters", [
        ...(q.onTrack && !sideLive(s, B.lostUnderground) ? [{ id: "flip", label: "Flip the Search objective to Off Track", effects: [fx("beneathSandsFlip", { flag: false })] }] : []),
        { id: "damage", label: "Deal 1 damage to each questing character", effects: questers.map((u) => fx("damage", { target: u.id, value: 1, player: ownerOf(s, u) })) },
      ]); break;
    }
    case "beneathSandsGrabbed": {
      const quest = mainQuestUnit(s);
      if (!e.flag) { const i = q.resolving.indexOf(B.grabbed); if (i >= 0) q.resolving.splice(i, 1); }
      else { const i = s.encounterDiscard.indexOf(B.grabbed); if (i >= 0) s.encounterDiscard.splice(i, 1); }
      if (quest && !quest.attachments.some((a) => a.code === B.grabbed)) { const physical = make(s, B.grabbed); attachToQuest(s, quest.code, { id: physical.id, code: physical.code, exhausted: false }); }
      else s.encounterDiscard.push(B.grabbed);
      break;
    }
    case "beneathSandsDiscardAlly": {
      const allies = own(s, player).filter(isAlly);
      if (allies.length) choose(s, `${seatName(s, player)} · Grabbed by Spiders: discard an ally`, allies.map((u) => ({ id: u.id, code: u.code, label: `Discard ${name(u)}`, effects: [fx("beneathSandsDiscardChosen", { target: u.id, player })] }))); break;
    }
    case "beneathSandsDiscardChosen": if (u && isAlly(u) && ownerOf(s, u) === player) discardCharacter(s, u); break;
    case "beneathSandsLostResponse": choose(s, "Lost Underground · Flip On Track and ignore Search Forced effects this phase?", [
      { id: "use", label: "Flip On Track", effects: [fx("beneathSandsLostResolved")] }, { id: "skip", label: "Skip response", effects: [] },
    ]); break;
    case "beneathSandsLostResolved": flip(s, true, true); q.ignoreSearch = { round: s.round, phase: s.phase }; break;
    case "beneathSandsExhaust": {
      const chars = own(s, player).filter((u) => !u.exhausted);
      if (chars.length) choose(s, `${seatName(s, player)} · Exhaust a character`, chars.map((u) => ({ id: u.id, code: u.code, label: `Exhaust ${name(u)}`, effects: [fx("exhaust", { target: u.id, player })] }))); break;
    }
    case "beneathSandsDiscardAttachment": {
      const hosts = [...allCharacters(s), ...s.staging, ...(mainQuestUnit(s) ? [mainQuestUnit(s)!] : [])];
      const options = hosts.flatMap((host) => host.attachments.filter((a) => attachmentController(s, host, a) === player).map((a) => ({ id: a.id, code: a.code, label: `Discard ${card(a.code).name}`, effects: [fx("discardAttachment", { target: host.id, source: a.id, player })] })));
      if (options.length) choose(s, `${seatName(s, player)} · Discard an attachment you control`, options); break;
    }
    default: return false;
  }
  return true;
}
