import type { Card, Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { isAlly, isHero } from "./card-types";
import { choose, encounterDraw, fx, get, log, make, prepend, removeShadowCard,
  shuffle, stats, threatOf, spendResources, canGainResources, takePlayerDeck, units } from "./core";
import { addVictoryCard, damage, discardCharacter, enemyAddedToStaging, engage,
  allyCanEnter, enterAlly, questDefeated, win } from "./board";
import { activeSeat, allActiveLocations, allCharacters, allEngaged, firstPlayer,
  forOwner, ownerOf, playerOrder, seatView, attachmentController } from "./table";
import { mainQuestUnit } from "./quest-state";
import { MORDOR as M, MORDOR_MAIN_QUESTS, MORDOR_OBJECTIVE_HEROES,
  MORDOR_RECIPES } from "./long-arm-mordor-support";
export * from "./long-arm-mordor-support";
/** Encounter and stage resolutions survive an individual player's elimination. */
export const mordorSharedEffect = (e: Effect) => e.kind.startsWith("mordor") &&
  !["mordorKahliel", "mordorFiryal", "mordorFiryalDiscard", "mordorYazan", "mordorYazanUse",
    "mordorJubayr", "mordorJubayrUse", "mordorSavageDiscard", "mordorBomaPay", "mordorBomaSpend"].includes(e.kind);

const trait = (u: Unit, text: string) => (card(u.code).traits ?? "").split(".").some((t) => t.trim() === text);
const enemies = (s: GameState) => [...s.staging, ...allEngaged(s)].filter((u) => card(u.code).type_code === "enemy");
const phaseKey = (s: GameState) => `${s.round}:${["quest", "staging"].includes(s.phase) ? "quest" : ["defense", "attack"].includes(s.phase) ? "combat" : s.phase}`;
const liveStage = (s: GameState, n: number) => !!s.mordor && s.stage === n && !mainQuestUnit(s)?.blanked;
const own = (s: GameState, p: number) => allCharacters(s).filter((u) => ownerOf(s, u) === p);
const printedCost = (u: Unit) => Number(card(u.code).cost) || 0;
const objectiveHero = (u: Unit) => MORDOR_OBJECTIVE_HEROES.includes(u.code);
const skip = { id: "skip", label: "Decline the response", effects: [] };
type MordorCombat = NonNullable<GameState["combat"]> & {
  mordorSavageShadows?: number;
  mordorAdditionalAttacks?: number;
  mordorDestroyedCharacter?: boolean;
};

export function setupLongArmMordor(s: GameState) {
  const recipe = MORDOR_RECIPES.find((r) => r.mode === (s.easyMode ? "easy" : "standard"))!;
  const pile = (section: string) => recipe.cards.filter((c) => c.section === section).flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, pile("sharedEncounterDeck"));
  s.mordor = { initialized: false, advancing: false, currentQuest: M.surprise,
    questDeck: MORDOR_MAIN_QUESTS.slice(1), completedQuests: [], captured: [],
    guarding: {}, setAside: pile("sharedSetAside").map((code) => make(s, code)), removed: [] };
}
export function mordorOpeningHandsKept(s: GameState) {
  if (!s.mordor || s.mordor.initialized) return false;
  prepend(s, ...playerOrder(s).map((player) => fx("mordorChooseHero", { player })),
    fx("mordorSetupDone", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
export const mordorBlanked = (s: GameState, u: Unit) => !!s.mordor?.captured.some((h) => h.id === u.id);
export function mordorImmune(s: GameState, u: Unit) {
  return mordorBlanked(s, u) ||
    (liveStage(s, 3) && Object.values(s.mordor!.guarding).includes(u.id)) ||
    u.attachments.some((a) => a.code === M.overgrown && !a.blanked);
}
/** Uncontrolled physical heroes can still be assigned encounter damage and destroyed. */
export function mordorRemoveCaptured(s: GameState, u: Unit) {
  if (!s.mordor?.captured.some((h) => h.id === u.id)) return false;
  s.mordor.captured = s.mordor.captured.filter((h) => h.id !== u.id);
  delete s.mordor.guarding[u.id];
  return false; // Normal destruction puts this original hero in its owner's discard.
}
export function mordorCharacterLeft(s: GameState, u: Unit, controller: number) {
  // Publisher rules explicitly make this text unmodifiable, including blanking.
  if (!s.mordor || !objectiveHero(u)) return;
  forOwner(s, controller, () => {
    if (!s.used.includes("game:mordor-objective-lost")) s.used.push("game:mordor-objective-lost");
  });
  log(s, `${name(u)} leaves play; its controller is eliminated.`, "danger");
}
export function mordorCapturedDoomed(s: GameState) {
  return s.mordor?.captured.find((u) => !s.mordor!.guarding[u.id] && u.damage >= stats(s, u).health);
}
export function mordorCheck(s: GameState) {
  const q = s.mordor; if (!q || !s.table) return;
  for (const h of [...q.captured]) {
    if (!s.table.seats[h.owner ?? 0]?.eliminated) continue;
    q.captured = q.captured.filter((u) => u.id !== h.id); delete q.guarding[h.id];
    seatView(s, h.owner ?? 0).removed.push(h.code);
  }
}
export function mordorStats(s: GameState, u: Unit) {
  const guarded = liveStage(s, 3) && Object.values(s.mordor!.guarding).includes(u.id) ? 1 : 0;
  const mount = u.attachments.filter((a) => a.code === M.warg && !a.blanked).length * 2;
  const enforcer = s.mordor && u.code === M.enforcers && !u.blanked ? s.stage : 0;
  return { attack: guarded + mount + enforcer, defense: guarded + mount + enforcer, health: mount,
    will: 0 };
}
export function mordorThreatBonus(s: GameState, u: Unit) {
  let n = 0;
  if (!u.blanked && s.mordor && [M.enforcers, M.boma].includes(u.code)) n += s.stage;
  if (liveStage(s, 3) && Object.values(s.mordor!.guarding).includes(u.id)) n++;
  n += u.attachments.filter((a) => a.code === M.warg && !a.blanked).length * 2;
  n += u.attachments.filter((a) => a.code === M.overgrown && !a.blanked).length;
  if (trait(u, "Orc") && allEngaged(s).some((e) => e.id === u.id))
    n += s.staging.filter((q) => q.code === M.uruks && !q.blanked).length;
  if (card(u.code).type_code === "location" && s.staging.some((l) => l.id === u.id) &&
    allActiveLocations(s).some((l) => l.code === M.trail && !l.blanked)) n--;
  return n;
}
export function mordorEngagementModifier(s: GameState, u: Unit) {
  if (!trait(u, "Orc")) return 0;
  return (liveStage(s, 4) && !card(u.code).is_unique ? -10 : 0) -
    (s.staging.some((e) => e.id === u.id) ? 5 * s.staging.filter((q) => q.code === M.uruks && !q.blanked).length : 0);
}
export const mordorCannotOptionallyEngage = (_s: GameState, u: Unit) => u.code === M.chieftain && !u.blanked;
export function mordorCanDefend(s: GameState, enemy: Unit, u: Unit) {
  return enemy.code !== M.uruk || !!enemy.blanked || !isAlly(u) || stats(s, u).will >= threatOf(s, enemy);
}
export function mordorAttackBonus(s: GameState, enemy: Unit, defenders: Unit[]) {
  return enemy.code === M.rider && !enemy.blanked && defenders.length
    ? Math.max(0, threatOf(s, enemy) - Math.min(...defenders.map((u) => stats(s, u).will))) : 0;
}
export function mordorDamageAmount(s: GameState, u: Unit, amount: number, context: DamageContext) {
  if (!context.cost && context.combatDamage && context.enemyId &&
    context.enemyId === s.combat?.enemyId && s.combat.cancelCombatDamage) return 0;
  if (u.code !== M.chieftain) return amount;
  if (liveStage(s, 4) && !context.combatDamage) return 0;
  if (u.blanked) return amount;
  if (allEngaged(s).some((e) => e.id === u.id) &&
    allEngaged(s).some((e) => e.id !== u.id && ownerOf(s, e) === ownerOf(s, u) && trait(e, "Orc"))) return 0;
  return amount;
}
export function mordorUndefendedTargets(s: GameState) {
  const heroes = s.mordor && s.stage <= 2 && !mainQuestUnit(s)?.blanked
    ? s.mordor.captured.filter((h) => !s.mordor!.guarding[h.id]) : [];
  return heroes.length ? heroes : undefined;
}
export const mordorIgnoresResourceMatch = (s: GameState) => !!s.mordor && s.stage <= 2 && !mainQuestUnit(s)?.blanked &&
  !s.used.includes(`round:mordor-play:${phaseKey(s)}`);
export function mordorCardPaid(s: GameState, _c: Card) {
  if (s.mordor) s.used.push(`round:mordor-play:${phaseKey(s)}`);
}
export function mordorSuccessfulQuest(s: GameState, amount: number) {
  if (amount <= 0 || !liveStage(s, 1) || s.mordor!.advancing) return;
  s.mordor!.advancing = true;
  prepend(s, ...playerOrder(s).map((player) => fx("mordorRescue", { player })),
    fx("mordorAdvance", { player: firstPlayer(s) }));
}
export function mordorAdvance(s: GameState) {
  const q = s.mordor;
  if (!q) return false;
  if (!q.initialized || q.advancing || s.stageRevealing || s.phase === "setup" || s.status !== "playing") return true;
  if (s.stage === 2 && s.progress >= 5) {
    if (questDefeated(s, q.currentQuest)) return true;
    q.advancing = true;
    prepend(s, ...playerOrder(s).map((player) => fx("mordorRescue", { player })), fx("mordorAdvance", { player: firstPlayer(s) }));
  } else if (s.stage === 3 && s.progress >= 10 && !Object.keys(q.guarding).length && !s.queue.some((e) => e.kind === "mordorRescueTake")) {
    if (questDefeated(s, q.currentQuest)) return true;
    q.advancing = true;
    prepend(s, fx("mordorAdvance", { player: firstPlayer(s) }));
  } else if (s.stage === 4 && s.progress >= 15 && !enemies(s).some((e) => e.code === M.chieftain)) {
    if (questDefeated(s, q.currentQuest)) return true;
    win(s);
    s.reason = "The Uruk Chieftain is defeated and the heroes escape into the jungle.";
  }
  return true;
}
export function mordorEngaged(s: GameState, u: Unit) {
  if (liveStage(s, 4) && u.code === M.chieftain)
    prepend(s, fx("immediateAttack", { target: u.id, player: ownerOf(s, u) }));
}
export function mordorEncounterEnd(s: GameState): Effect[] {
  return enemies(s).filter((u) => u.code === M.chieftain && !u.blanked)
    .map((u) => fx("mordorChieftainEngage", { target: u.id, player: firstPlayer(s) }));
}
export function mordorRoundEnd(s: GameState): Effect[] {
  return !s.mordor ? [] : enemies(s).filter((u) => u.code === M.enforcers && !u.blanked)
    .map((u) => fx("mordorAssignDamage", { source: u.id, value: s.stage, player: firstPlayer(s), flag: true }));
}
export function mordorPlanningBegin(s: GameState): Effect[] {
  return allCharacters(s).filter((u) => u.code === M.kahliel && !u.blanked)
    .map((u) => fx("mordorKahliel", { source: u.id, player: ownerOf(s, u) }));
}
export function mordorCharactersCommitted(s: GameState, ids: string[]) {
  prepend(s, ...ids.map((id) => get(s, id)).filter((u): u is Unit => !!u && u.code === M.firyal && !u.blanked)
    .map((u) => fx("mordorFiryal", { source: u.id, player: ownerOf(s, u) })));
}
export function mordorPlayerAttackEffects(s: GameState, _enemy: Unit, ids: string[]): Effect[] {
  return ids.map((id) => get(s, id)).filter((u): u is Unit => !!u && u.code === M.yazan && !u.blanked &&
    !seatView(s, ownerOf(s, u)).used.includes(`round:mordor-yazan:${phaseKey(s)}`))
    .map((u) => fx("mordorYazan", { source: u.id, player: ownerOf(s, u) }));
}
export function mordorDefendersDeclared(s: GameState, _enemy: Unit, defenders: Unit[]): Effect[] {
  return defenders.filter((u) => u.code === M.jubayr && !u.blanked &&
    !seatView(s, ownerOf(s, u)).used.includes(`round:mordor-jubayr:${phaseKey(s)}`))
    .map((u) => fx("mordorJubayr", { source: u.id, player: ownerOf(s, u) }));
}
export function mordorEnemyLeaves(s: GameState, u: Unit, destruction: boolean) {
  if (!s.mordor) return;
  const saved = s.mordor.captured.filter((h) => s.mordor!.guarding[h.id] === u.id);
  for (const h of saved) {
    delete s.mordor.guarding[h.id];
    if (destruction) prepend(s, fx("mordorRescueTake", { target: h.id, player: h.owner ?? 0 }));
    // An enemy removed without defeat leaves its attached objective unguarded in staging.
  }
}
export function mordorAttachmentLeaves(s: GameState, u: Unit, attachment: { id: string; code: string }, leaving: boolean) {
  if (attachment.code !== M.warg || !leaving) return false;
  const warg = make(s, M.warg); warg.id = attachment.id;
  s.staging.push(warg); enemyAddedToStaging(s, warg);
  log(s, `Mordor Warg leaves ${name(u)} and enters the staging area.`);
  return true;
}
export function mordorCardEntered(s: GameState, u: Unit, fromReveal = false, cancelled = false) {
  if (u.code === M.warg && fromReveal && !cancelled)
    prepend(s, fx("mordorWarg", { source: u.id, player: firstPlayer(s) }));
}
export function mordorTravelProblem(s: GameState, u: Unit) {
  if (u.blanked || u.code !== M.boma) return null;
  return playerOrder(s).some((p) => !own(s, p).some((h) => isHero(h) && h.resources > 0))
    ? "Every player must spend 1 resource to travel to Southron Boma." : null;
}
export function mordorTravelEffects(s: GameState, u: Unit): Effect[] | undefined {
  if (u.blanked) return undefined;
  if (u.code === M.boma) return playerOrder(s).map((player) => fx("mordorBomaPay", { player }));
  if (u.code === M.hut) return [fx("mordorDiscardEncounter", { text: "enemy", player: firstPlayer(s) })];
  if (u.code === M.trail) return [fx("reveal", { player: firstPlayer(s) })];
  return undefined;
}
export function mordorTravelEntered(s: GameState, u: Unit, actualTravel = true) {
  if (u.code === M.hut && !u.blanked && actualTravel)
    prepend(s, fx("mordorHutOffer", { source: u.id, player: firstPlayer(s) }));
}
export function mordorExplored(s: GameState, u: Unit) {
  if (u.blanked) return;
  if (u.code === M.clearing || u.code === M.jungle)
    prepend(s, fx("mordorDiscardEncounter", { text: u.code === M.clearing ? "enemy" : "location", player: firstPlayer(s) }));
}
export function mordorEncounter(s: GameState, code: string, replay = false) {
  if (![M.savage, M.overrun, M.overgrown, M.fear].includes(code)) return false;
  if (code !== M.overgrown && !replay) s.encounterDiscard.push(code);
  prepend(s, fx(code === M.savage ? "mordorSavageAll" : code === M.overrun ? "mordorOverrun" : code === M.overgrown ? "mordorOvergrown" : "mordorFear", { player: firstPlayer(s), flag: replay }));
  return true;
}
export function mordorShadow(s: GameState, code: string) {
  const c = s.combat, enemy = get(s, c?.enemyId);
  if (!c || !enemy) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  const defenders = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : [])).map((id) => get(s, id)).filter((u): u is Unit => !!u);
  if (code === M.boma) {
    if (defenders.some(objectiveHero)) {
      for (const u of defenders.filter(objectiveHero)) u.exhausted = false;
      c.cancelCombatDamage = true;
    }
  } else if (code === M.savage) {
    c.attackBonus++;
    (c as MordorCombat).mordorSavageShadows = ((c as MordorCombat).mordorSavageShadows ?? 0) + 1;
  } else if (code === M.overrun) prepend(s, fx("mordorAssignDamage", { value: s.mordor ? s.stage : 1, player: p }));
  else if (code === M.clearing) prepend(s, fx("mordorDiscardAttachment", { player: p }));
  else if (code === M.jungle) {
    forOwner(s, p, () => {
      if (s.hand.length) {
        // Seeded shuffle is already the engine's deterministic random primitive.
        const selected = shuffle(s, [...s.hand])[0];
        s.hand = s.hand.filter((h) => h.id !== selected.id); s.discard.push(selected.code);
      }
    });
  } else if (code === M.uruk) c.attackBonus += defenders.length && threatOf(s, enemy) > Math.min(...defenders.map((u) => stats(s, u).will)) ? 2 : 1;
  else if (code === M.rider) c.returnToStaging = true;
  else if (code === M.fear) {
    if (defenders.length && threatOf(s, enemy) > Math.min(...defenders.map((u) => stats(s, u).will)))
      (c as MordorCombat).mordorAdditionalAttacks = ((c as MordorCombat).mordorAdditionalAttacks ?? 0) + 1;
  } else return false;
  return true;
}
/** Deferred shadow follow-ups must run after this actual attack, including immediate attacks. */
export function mordorAttackFinished(s: GameState, completed: NonNullable<GameState["combat"]>): Effect[] {
  const c = completed as MordorCombat, p = c.attackPlayer ?? activeSeat(s);
  return [
    ...Array.from({ length: c.mordorDestroyedCharacter ? c.mordorSavageShadows ?? 0 : 0 }, () => fx("reveal", { player: p })),
    ...Array.from({ length: get(s, c.enemyId) ? c.mordorAdditionalAttacks ?? 0 : 0 }, () => fx("immediateAttack", { target: c.enemyId, player: p })),
  ];
}
export function mordorCharacterDestroyed(s: GameState, u: Unit, context: DamageContext) {
  if (s.combat && context.combatDamage && context.enemyId === s.combat.enemyId &&
    (isHero(u) || isAlly(u)) && u.damage >= stats(s, u).health)
    (s.combat as MordorCombat).mordorDestroyedCharacter = true;
}

function searchOrcs(s: GameState, p: number): Option[] {
  return (["deck", "discard"] as const).flatMap((zone) => (zone === "deck" ? s.encounterDeck : s.encounterDiscard).flatMap((code, i) =>
    card(code).type_code === "enemy" && trait({ code } as Unit, "Orc") ? [{ id: `${zone}:${i}`, code,
      label: `${card(code).name} · ${zone}`, effects: [fx("mordorOrcTake", { code, text: zone, value: i, player: p })] }] : []));
}
function takeAside(s: GameState, code: string) {
  const index = s.mordor!.setAside.findIndex((u) => u.code === code);
  return index < 0 ? undefined : s.mordor!.setAside.splice(index, 1)[0];
}
function returnEnemy(s: GameState, u: Unit) {
  for (const p of playerOrder(s)) forOwner(s, p, () => { s.engaged = s.engaged.filter((e) => e.id !== u.id); });
  if (!s.staging.some((e) => e.id === u.id)) { s.staging.push(u); enemyAddedToStaging(s, u); }
}
export function mordorEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("mordor")) return false;
  const p = e.player ?? activeSeat(s), q = s.mordor, u = get(s, e.target);
  switch (e.kind) {
    case "mordorChooseHero":
      if (q) choose(s, "The Long Arm of Mordor · Choose an objective-hero", q.setAside.filter(objectiveHero).map((h) => ({ id: h.id, code: h.code, label: name(h), effects: [fx("mordorTakeHero", { target: h.id, player: p })] })));
      break;
    case "mordorTakeHero": {
      if (!q) break;
      const i = q.setAside.findIndex((h) => h.id === e.target); if (i < 0) break;
      const h = q.setAside.splice(i, 1)[0]; h.owner = p; h.resources = 2;
      forOwner(s, p, () => {
        for (const old of s.heroes) { old.owner = p; old.committed = false; q.captured.push(old); }
        s.heroes = [h];
      });
      const enforcer = takeAside(s, M.enforcers);
      if (enforcer) { s.staging.push(enforcer); enemyAddedToStaging(s, enforcer); }
      break;
    }
    case "mordorSetupDone":
      if (q) {
        const unused = q.setAside.filter(objectiveHero); q.removed.push(...unused.map((h) => h.code));
        q.setAside = q.setAside.filter((h) => !objectiveHero(h)); q.initialized = true;
      }
      break;
    case "mordorRescue":
      if (q) choose(s, "Rescue a hero you own", q.captured.filter((h) => h.owner === p && !q.guarding[h.id]).map((h) => ({ id: h.id, code: h.code, label: name(h), effects: [fx("mordorRescueTake", { target: h.id, player: p })] })));
      break;
    case "mordorRescueTake": {
      if (!q) break;
      const i = q.captured.findIndex((h) => h.id === e.target); if (i < 0) break;
      const h = q.captured.splice(i, 1)[0]; delete q.guarding[h.id];
      delete h.blanked; delete h.immuneToPlayerEffects; h.exhausted = true;
      forOwner(s, h.owner ?? p, () => { s.heroes.push(h); });
      log(s, `${name(h)} is rescued, exhausted.`, "good");
      break;
    }
    case "mordorAdvance": {
      if (!q || s.stage >= 4) break;
      q.completedQuests.push(q.currentQuest); addVictoryCard(s, q.currentQuest);
      q.currentQuest = q.questDeck.shift()!; s.stage++; s.progress = 0; s.stageRevealing = true;
      log(s, `${card(q.currentQuest).name} · Stage ${s.stage}`, "chapter");
      if (s.stage === 3) prepend(s, ...playerOrder(s).map((player) => fx("mordorOrcSearch", { player })), fx("mordorGuardHeroes", { player: firstPlayer(s) }), fx("mordorStageReady"));
      else if (s.stage === 4) {
        const chief = takeAside(s, M.chieftain); if (chief) { s.staging.push(chief); enemyAddedToStaging(s, chief); }
        s.encounterDeck.push(...s.encounterDiscard.splice(0)); shuffle(s, s.encounterDeck);
        prepend(s, ...playerOrder(s).map((player) => fx("reveal", { player })), fx("mordorStageReady"));
      } else prepend(s, fx("mordorStageReady"));
      break;
    }
    case "mordorStageReady": if (q) { q.advancing = false; s.stageRevealing = false; } break;
    case "mordorOrcSearch": choose(s, "Free the Captives · Search for an Orc", searchOrcs(s, p)); break;
    case "mordorOrcTake": {
      const pile = e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
      if (pile[e.value!] !== e.code) break;
      const enemy = make(s, pile.splice(e.value!, 1)[0]); s.staging.push(enemy); enemyAddedToStaging(s, enemy);
      shuffle(s, s.encounterDeck); break;
    }
    case "mordorGuardHeroes": {
      if (!q) break;
      const h = q.captured.find((h) => !q.guarding[h.id]); if (!h) break;
      const orcs = s.staging.filter((orc) => card(orc.code).type_code === "enemy" && trait(orc, "Orc") && !Object.values(q.guarding).includes(orc.id));
      choose(s, `Choose the Orc guarding ${name(h)}`, orcs.map((orc) => ({ id: orc.id, code: orc.code, label: name(orc), effects: [fx("mordorGuardTake", { source: h.id, target: orc.id, player: p }), e] })));
      break;
    }
    case "mordorGuardTake": if (q && e.source && u) q.guarding[e.source] = u.id; break;
    case "mordorChieftainEngage": {
      if (!u || u.blanked) break;
      const counts = playerOrder(s).map((player) => ({ player, count: allEngaged(s).filter((orc) => ownerOf(s, orc) === player && !card(orc.code).is_unique && trait(orc, "Orc")).length }));
      const max = Math.max(...counts.map((n) => n.count));
      choose(s, "Uruk Chieftain · Most non-unique Orcs", counts.filter((n) => n.count === max).map(({ player }) => ({ id: String(player), label: `Player ${player + 1} · ${max} Orcs`, effects: [fx("mordorChieftainTake", { target: u.id, player })] })));
      break;
    }
    case "mordorChieftainTake":
      if (u && !allEngaged(s).some((h) => h.id === u.id && ownerOf(s, h) === p)) forOwner(s, p, () => engage(s, u));
      break;
    case "mordorAssignDamage": {
      const amount = e.value ?? 0;
      const targets = e.flag ? [...allCharacters(s), ...(q?.captured.filter((h) => !q.guarding[h.id]) ?? [])] : own(s, p);
      if (amount <= 0 || !targets.length) break;
      choose(s, `Assign ${amount} damage · ${e.flag ? "characters in play" : "characters you control"}`, targets.map((h) => ({ id: h.id, code: h.code, label: `Deal 1 damage to ${name(h)}`, effects: [fx("damage", { target: h.id, value: 1, player: p }), { ...e, value: amount - 1 }] })));
      break;
    }
    case "mordorKahliel": {
      const h = get(s, e.source); if (!h || h.blanked) break;
      choose(s, "Kahliel · Add 1 resource to a hero", [...allCharacters(s).filter((u) => isHero(u) && canGainResources(s, u))].map<Option>((u) => ({ id: u.id, code: u.code, label: name(u), effects: [fx("resource", { target: u.id, value: 1, player: p })] })).concat([skip])); break;
    }
    case "mordorFiryal": {
      const h = get(s, e.source); if (!h || h.blanked) break;
      const code = s.encounterDeck[0]; if (!code) break;
      choose(s, "Firyal · Look at the top encounter card", [{ id: "discard", code, label: `Discard ${card(code).name}`, effects: [fx("mordorFiryalDiscard", { code, player: p })] }, { id: "keep", code, label: `Leave ${card(code).name} on top`, effects: [] }]); break;
    }
    case "mordorFiryalDiscard": if (s.encounterDeck[0] === e.code) s.encounterDiscard.push(s.encounterDeck.shift()!); break;
    case "mordorYazan": {
      const h = get(s, e.source); if (!h || h.blanked) break;
      const options = enemies(s).filter((u) => !card(u.code).is_unique).map((u) => ({ id: u.id, code: u.code, label: `Deal 1 damage to ${name(u)}`, effects: [fx("mordorYazanUse", { target: u.id, source: h.id, player: p })] }));
      choose(s, "Yazan · Deal 1 damage to a non-unique enemy", [...options, skip]); break;
    }
    case "mordorYazanUse":
      forOwner(s, p, () => s.used.push(`round:mordor-yazan:${phaseKey(s)}`)); if (u) damage(s, u.id, 1); break;
    case "mordorJubayr": {
      const h = get(s, e.source); if (!h || h.blanked) break;
      const options = enemies(s).filter((u) => !card(u.code).is_unique).flatMap((u) => u.shadows.flatMap((_code, i) =>
        i >= (u.revealedShadowCount ?? 0) && !u.faceupShadows?.[i] ? [{ id: `${u.id}:${i}`, code: u.code, label: `Discard facedown shadow ${i + 1} from ${name(u)}`, effects: [fx("mordorJubayrUse", { target: u.id, value: i, source: h.id, player: p })] }] : []));
      choose(s, "Jubayr · Discard a facedown shadow", [...options, skip]); break;
    }
    case "mordorJubayrUse":
      if (u && e.value! >= (u.revealedShadowCount ?? 0) && !u.faceupShadows?.[e.value!]) {
        const code = removeShadowCard(u, e.value!); if (code) s.encounterDiscard.push(code);
        forOwner(s, p, () => s.used.push(`round:mordor-jubayr:${phaseKey(s)}`));
      }
      break;
    case "mordorWarg": {
      const warg = get(s, e.source); if (!warg) break;
      choose(s, "Mordor Warg · Attach to an Orc and return it to staging", enemies(s).filter((u) => u.id !== warg.id && trait(u, "Orc") && !u.attachments.some((a) => a.code === M.warg)).map((u) => ({ id: u.id, code: u.code, label: name(u), effects: [fx("mordorWargAttach", { source: warg.id, target: u.id, player: p })] })));
      break;
    }
    case "mordorWargAttach": {
      const warg = get(s, e.source); if (!u || !warg) break;
      s.staging = s.staging.filter((x) => x.id !== warg.id);
      u.attachments.push({ id: warg.id, code: M.warg, exhausted: false }); returnEnemy(s, u); break;
    }
    case "mordorBomaPay":
      choose(s, "Southron Boma · Spend 1 resource", own(s, p).filter((u) => isHero(u) && u.resources > 0).map((u) => ({ id: u.id, code: u.code, label: name(u), effects: [fx("mordorBomaSpend", { target: u.id, player: p })] })));
      break;
    case "mordorBomaSpend": if (u && u.resources > 0) spendResources(s, u, 1); break;
    case "mordorDiscardEncounter": {
      const code = encounterDraw(s); if (!code) break;
      if (card(code).type_code === e.text) {
        const unit = make(s, code); s.staging.push(unit); if (e.text === "enemy") enemyAddedToStaging(s, unit);
      } else s.encounterDiscard.push(code);
      break;
    }
    case "mordorHutOffer":
      choose(s, "Village Hut · Discard the top card of your deck", [{ id: "use", label: "Use the response", effects: [fx("mordorHut", { player: p })] }, skip]); break;
    case "mordorHut":
      forOwner(s, p, () => {
        if (!s.deck.length) return;
        const physical = takePlayerDeck(s);
        s.discard.push(physical.code);
        if (card(physical.code).type_code === "ally" && allyCanEnter(s, physical.code)) {
          s.discard.pop(); physical.exhausted = true; enterAlly(s, physical);
        }
      }); break;
    case "mordorSavageAll": prepend(s, ...playerOrder(s).map((player) => fx("mordorSavage", { player }))); break;
    case "mordorSavage": {
      const allies = own(s, p).filter(isAlly), max = Math.max(...allies.map(printedCost));
      choose(s, "Savage Attack · Discard your highest-cost ally or reveal", [
        ...allies.filter((u) => printedCost(u) === max).map((u) => ({ id: u.id, code: u.code, label: `Discard ${name(u)}`, effects: [fx("mordorSavageDiscard", { target: u.id, player: p })] })),
        { id: "reveal", label: "Reveal an encounter card", effects: [fx("reveal", { player: p })] }]); break;
    }
    case "mordorSavageDiscard": if (u) discardCharacter(s, u); break;
    case "mordorOverrun": s.threatModifier += 2 * (q ? s.stage : 1); break;
    case "mordorOvergrown": {
      const candidates = s.staging.filter((u) => card(u.code).type_code === "location" && !u.attachments.some((a) => a.code === M.overgrown));
      const max = Math.max(...candidates.map((u) => threatOf(s, u)));
      if (!candidates.length) { if (!e.flag) s.encounterDiscard.push(M.overgrown); break; }
      choose(s, "Overgrown · Attach to the highest-threat eligible location", candidates.filter((u) => threatOf(s, u) === max).map((u) => ({ id: u.id, code: u.code, label: name(u), effects: [fx("mordorOvergrownAttach", { target: u.id, flag: e.flag, player: p })] }))); break;
    }
    case "mordorOvergrownAttach":
      if (u) {
        if (e.flag) { const i = s.encounterDiscard.indexOf(M.overgrown); if (i >= 0) s.encounterDiscard.splice(i, 1); }
        const physical = make(s, M.overgrown); u.attachments.push({ id: physical.id, code: M.overgrown, exhausted: false });
      }
      break;
    case "mordorFear":
      for (const u of allCharacters(s).filter(isAlly)) {
        // Lasting round effects stay separate from transient printed-text modifiers.
        u.roundAttack = (u.roundAttack ?? 0) - 1; u.roundDefense = (u.roundDefense ?? 0) - 1;
        forOwner(s, ownerOf(s, u), () => s.used.push(`round:mordor-fear:${u.id}`));
      }
      break;
    case "mordorDiscardAttachment": {
      const options = units(s).flatMap((h) => h.attachments.filter((a) =>
        card(a.code).sphere_code !== "encounter" && attachmentController(s, h, a) === p && !/\bPermanent\b/i.test(card(a.code).text ?? ""))
        .map((a) => ({ id: a.id, code: a.code, label: `Discard ${card(a.code).name}`, effects: [fx("discardAttachment", { target: h.id, source: a.id, player: p })] })));
      choose(s, "Discard an attachment you control", options); break;
    }
    default: return false;
  }
  return true;
}
export function mordorWillBonus(s: GameState, u: Unit) {
  return -seatView(s, ownerOf(s, u)).used.filter((x) => x === `round:mordor-fear:${u.id}`).length;
}
