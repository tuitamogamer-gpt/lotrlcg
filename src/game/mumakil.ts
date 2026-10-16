import type { Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { isHero, isAlly } from "./card-types";
import { choose, encounterDraw, enemyAttackPrevented, fx, get, log, make, prepend, shuffle, stats, threatOf, units } from "./core";
import { addVictoryCard, advanceQuest, discardAttachment, discardCharacter, discardHandCard,
  discardPlayerDeck, enemyAddedToStaging, engage, questDefeated, removeFromQuest, win } from "./board";
import { activeSeat, allActiveLocations, allCharacters, allEngaged, attachmentController,
  firstPlayer, forOwner, ownerOf, playerOrder, seatName, seatView } from "./table";
import { allQuestUnits, mainQuestUnit } from "./quest-state";
import { MUMAKIL as M, MUMAKIL_CAPTURES, MUMAKIL_MAIN_QUESTS, MUMAKIL_RECIPES } from "./mumakil-support";
export * from "./mumakil-support";
const live = (s: GameState) => !!s.mumakil;
const stageLive = (s: GameState, stage: number) => live(s) && s.stage === stage && !mainQuestUnit(s)?.blanked;
const enemies = (s: GameState) => [...s.staging, ...allEngaged(s)].filter((u) => card(u.code).type_code === "enemy");
const own = (s: GameState, p: number) => allCharacters(s).filter((u) => ownerOf(s, u) === p);
const remaining = (s: GameState, u: Unit) => Math.max(0, stats(s, u).health - u.damage);
const captureAttachment = (u: Unit, code: string) => u.attachments.find((a) => a.code === code && !a.blanked);
const engaged = (s: GameState, u: Unit) => allEngaged(s).some((e) => e.id === u.id);
const skip = { id: "skip", label: "Decline the response", effects: [] };
type MumakilCombat = NonNullable<GameState["combat"]> & { mumakilKilledCharacter?: boolean; mumakilSavageReturn?: boolean };
export function setupMumakil(s: GameState) {
  const r = MUMAKIL_RECIPES.find((r) => r.mode === (s.easyMode ? "easy" : "standard"))!;
  // The reference recipe reserves a copy of each location for the setup search.
  // Return those exact copies first; only the Wild Mûmak and Capture cards stay aside.
  s.encounterDeck = r.cards.filter((c) => c.section !== "sharedQuestDeck" && ![M.wild, ...MUMAKIL_CAPTURES].includes(c.code))
    .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.mumakil = { initialized: false, advancing: false, currentQuest: M.welcome,
    questDeck: MUMAKIL_MAIN_QUESTS.slice(1), completedQuests: [],
    setAside: r.cards.filter((c) => [M.wild, ...MUMAKIL_CAPTURES].includes(c.code)).flatMap((c) => Array.from({ length: c.quantity }, () => make(s, c.code))),
    damageThisRound: [], blanked: [], cannotReady: [], exploredRound: 0 };
}
export function mumakilOpeningHandsKept(s: GameState) {
  if (!s.mumakil || s.mumakil.initialized) return false;
  prepend(s, ...playerOrder(s).map((player) => fx("mumakilSetupLocation", { player })),
    fx("mumakilSetupDone", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
export function mumakilAdvance(s: GameState) {
  const q = s.mumakil;
  if (!q) return false;
  if (!q.initialized || q.advancing || s.stageRevealing || s.phase === "setup" || s.status !== "playing") return true;
  if (s.progress < (s.stage === 1 ? 12 : 8)) return true;
  if (stageLive(s, 1) && enemies(s).filter((u) => u.code === M.wild).length !== playerOrder(s).length) return true;
  if (stageLive(s, 2) && enemies(s).some((u) => u.attachments.some((a) => MUMAKIL_CAPTURES.includes(a.code)))) return true;
  if (questDefeated(s, q.currentQuest)) return true;
  if (s.stage === 1) {
    q.advancing = true;
    prepend(s, fx("mumakilAdvance", { player: firstPlayer(s) }));
  } else {
    win(s); s.reason = "The Oliphaunts are captured alive. The fellowship rides north.";
  }
  return true;
}
export const mumakilImmune = (s: GameState, u: Unit) => live(s) && u.code === M.wild && !u.blanked;
export const mumakilIndestructible = mumakilImmune;
export function mumakilDamageAmount(s: GameState, u: Unit, amount: number) {
  if (!live(s) || u.code !== M.wild || u.blanked) return amount;
  const old = s.mumakil!.damageThisRound.find((p) => p.id === u.id && p.round === s.round)?.amount ?? 0;
  return Math.max(0, Math.min(amount, 3 - old));
}
export function mumakilStats(s: GameState, u: Unit): { attack: number } {
  return { attack: live(s) && u.code === M.ape && !u.blanked
    ? allActiveLocations(s).reduce((sum, l) => sum + threatOf(s, l), 0) : 0 };
}
export function mumakilThreatBonus(s: GameState, u: Unit): number {
  if (!live(s)) return 0;
  return mumakilStats(s, u).attack + (card(u.code).type_code === "location"
    ? s.staging.filter((q) => q.code === M.guardians && !q.blanked).length : 0);
}
export const mumakilCannotOptionallyEngage = (s: GameState, u: Unit) => live(s) && u.code === M.tiger && !u.blanked;
export const mumakilCannotReady = (s: GameState, u: Unit) => live(s) &&
  (u.attachments.some((a) => a.code === M.python && !a.blanked) ||
    s.mumakil!.cannotReady.some((p) => p.id === u.id && p.round === s.round));
export const mumakilCharacterBlanked = (s: GameState, u: Unit) =>
  !!s.mumakil?.blanked.some((p) => p.id === u.id && p.round === s.round);
export const mumakilPreservesTraits = (s: GameState, u: Unit) => {
  const p = s.mumakil?.blanked.find((p) => p.id === u.id && p.round === s.round);
  return !!p?.preserveTraits;
};
export function mumakilQuestBegin(s: GameState): Effect[] {
  return stageLive(s, 2) && !allActiveLocations(s).length ? [fx("mumakilAdditionalReveal")] : [];
}
export const mumakilExtraReveals = (s: GameState) => live(s) && playerOrder(s).some((p) => seatView(s, p).used.includes("phase:mumakil-extra-reveal")) ? 1 : 0;
export function mumakilQuestSucceeded(s: GameState) {
  if (!live(s)) return;
  prepend(s, ...enemies(s).filter((u) => engaged(s, u) && captureAttachment(u, M.spear))
    .map((u) => fx("mumakilCaptureResponse", { target: u.id, code: M.spear, player: ownerOf(s, u) })));
}
export function mumakilSideQuestSelected(s: GameState, u: Unit) {
  if (live(s) && u.code === M.guardians && !u.blanked)
    prepend(s, fx("mumakilSearchApe", { player: firstPlayer(s) }));
}
export function mumakilTravelEffects(s: GameState, u: Unit): Effect[] | undefined {
  return live(s) && u.code === M.trail && !u.blanked
    ? playerOrder(s).map((player) => fx("threat", { value: 1, player })) : undefined;
}
export function mumakilTravelEntered(s: GameState, u: Unit, actualTravel = true) {
  if (!live(s) || !actualTravel) return;
  prepend(s, ...enemies(s).filter((e) => engaged(s, e) && captureAttachment(e, M.pit) && (card(u.code).threat ?? 0) >= remaining(s, e))
    .map((e) => fx("mumakilCaptureResponse", { target: e.id, code: M.pit, player: ownerOf(s, e), value: card(u.code).threat ?? 0 })));
}
export function mumakilExplored(s: GameState, u: Unit, wasActive: boolean) {
  const q = s.mumakil;
  if (!q) return;
  q.exploredRound = s.round;
  // The stage's Forced shuffle precedes Mûmak Trail's optional Response, so the
  // newly shuffled physical Wild Mûmak is available to that very search.
  prepend(s,
    ...(wasActive && stageLive(s, 1) ? [fx("mumakilShuffleWild")] : []),
    ...(wasActive && u.code === M.trail && !u.blanked ? [fx("mumakilTrailResponse", { player: firstPlayer(s) })] : []));
}
export function mumakilRoundEnd(s: GameState): Effect[] {
  if (!live(s)) return [];
  return [
    ...allCharacters(s).flatMap((u) => u.attachments.filter((a) => a.code === M.fever && !a.blanked)
      .map(() => fx("damage", { target: u.id, value: 1, player: ownerOf(s, u) }))),
    ...allEngaged(s).filter((u) => u.code === M.wild && !u.blanked)
      .map((u) => fx("mumakilWildRoundEnd", { target: u.id, player: ownerOf(s, u) })),
  ];
}
function blank(s: GameState, u: Unit, preserveTraits: boolean) {
  const q = s.mumakil!;
  const old = q.blanked.find((p) => p.id === u.id && p.round === s.round);
  q.blanked = q.blanked.filter((p) => p.id !== u.id);
  q.blanked.push({ id: u.id, round: s.round, preserveTraits: preserveTraits && (!old || old.preserveTraits) });
}
export function mumakilDamageDealt(s: GameState, u: Unit, amount: number, context: DamageContext) {
  const q = s.mumakil;
  if (!q || amount <= 0) return;
  if (u.code === M.wild && !u.blanked) {
    const old = q.damageThisRound.find((p) => p.id === u.id && p.round === s.round)?.amount ?? 0;
    q.damageThisRound = q.damageThisRound.filter((p) => p.id !== u.id);
    q.damageThisRound.push({ id: u.id, round: s.round, amount: old + amount });
  }
  if (captureAttachment(u, M.lasso) && engaged(s, u))
    prepend(s, fx("mumakilCaptureResponse", { target: u.id, code: M.lasso, player: ownerOf(s, u) }));
  const enemy = get(s, context.enemyId);
  if (!enemy || enemy.blanked || !(isHero(u) || isAlly(u))) return;
  if (enemy.code === M.centipede) blank(s, u, true);
  if (enemy.code === M.python)
    prepend(s, fx("mumakilPythonAttach", { source: enemy.id, target: u.id, player: ownerOf(s, u) }));
}
export function mumakilCharacterDestroyed(s: GameState, u: Unit, context: DamageContext) {
  if (live(s) && s.combat && context.combatDamage && context.enemyId === s.combat.enemyId && (isHero(u) || isAlly(u)))
    (s.combat as MumakilCombat).mumakilKilledCharacter = true;
}
export function mumakilAttackFinished(s: GameState, completed: NonNullable<GameState["combat"]>): Effect[] {
  if (!live(s)) return [];
  const c = completed as MumakilCombat, enemy = get(s, c.enemyId), p = c.attackPlayer ?? activeSeat(s);
  if (!enemy) return [];
  const effects: Effect[] = [];
  // FAQ 1.42: a further attack receives fresh shadows, rather than restoring
  // the completed attack's physical shadows after its immediate continuation.
  if ((c.extraAttacks ?? 0) > 0) { s.encounterDiscard.push(...enemy.shadows); enemy.shadows = []; delete enemy.faceupShadows; enemy.revealedShadowCount = 0; }
  if (c.mumakilKilledCharacter && ((enemy.code === M.tiger && !enemy.blanked) || c.mumakilSavageReturn))
    effects.push(fx("mumakilReturn", { target: enemy.id, player: p }));
  if (!c.redirectedToEnemy && engaged(s, enemy) && captureAttachment(enemy, M.noose)) {
    const defenders = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : [])).map((id) => get(s, id)).filter((u): u is Unit => !!u);
    if (defenders.some((d) => remaining(s, d) > remaining(s, enemy)))
      effects.push(fx("mumakilCaptureResponse", { target: enemy.id, code: M.noose, player: ownerOf(s, enemy), ids: defenders.map((d) => d.id) }));
  }
  return effects;
}
export function mumakilEncounter(s: GameState, code: string, replay = false) {
  if (!live(s) || ![M.stampede, M.savage, M.fever, M.insects].includes(code)) return false;
  // Fever stays out of discard until its pending physical attachment is resolved.
  if (!replay && code !== M.fever) s.encounterDiscard.push(code);
  prepend(s, fx(code === M.stampede ? "mumakilStampede" : code === M.savage ? "mumakilSavageAll" : code === M.fever ? "mumakilFever" : "mumakilInsectsAll",
    { code, flag: replay, player: firstPlayer(s) }));
  return true;
}
export function mumakilShadow(s: GameState, code: string) {
  const c = s.combat as MumakilCombat | null;
  if (!live(s) || !c) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  const defenders = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : [])).map((id) => get(s, id)).filter((u): u is Unit => !!u);
  if (code === M.tiger) c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  else if (code === M.ape) c.attackBonus += s.mumakil!.exploredRound === s.round ? 2 : 1;
  else if (code === M.centipede) for (const u of defenders) blank(s, u, false);
  else if (code === M.savage) { c.attackBonus++; c.mumakilSavageReturn = true; }
  else if (code === M.fever) for (const u of defenders) {
    s.mumakil!.cannotReady = s.mumakil!.cannotReady.filter((x) => x.id !== u.id);
    s.mumakil!.cannotReady.push({ id: u.id, round: s.round });
  }
  else if (code === M.insects) prepend(s, fx("mumakilInsects", { player: p }));
  else return false;
  return true;
}
export const mumakilSharedEffect = (e: Effect) => e.kind.startsWith("mumakil") && !e.kind.startsWith("mumakilPlayer") &&
  !["mumakilCaptureResponse", "mumakilCaptureAttempt", "mumakilCapture", "mumakilInsects", "mumakilAssignDamage", "mumakilSavagePlayer"].includes(e.kind);
function searchOptions(s: GameState, code: string, kind: string, player: number): Option[] {
  return (["deck", "discard"] as const).flatMap((zone) => {
    const pile = zone === "deck" ? s.encounterDeck : s.encounterDiscard;
    const index = pile.indexOf(code);
    return index < 0 ? [] : [{ id: zone, code, label: `${card(code).name} · encounter ${zone}`,
      effects: [fx(kind, { code, text: zone, value: index, player })] }];
  });
}
function takeSearch(s: GameState, e: Effect) {
  const pile = e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
  if (pile[e.value!] !== e.code) return undefined;
  const u = make(s, pile.splice(e.value!, 1)[0]); s.staging.push(u);
  if (card(u.code).type_code === "enemy") enemyAddedToStaging(s, u);
  return u;
}
function returnEnemy(s: GameState, u: Unit) {
  s.staging = s.staging.filter((e) => e.id !== u.id);
  for (const p of playerOrder(s)) forOwner(s, p, () => { s.engaged = s.engaged.filter((e) => e.id !== u.id); });
  s.encounterDiscard.push(...u.shadows); u.shadows = []; delete u.faceupShadows; u.revealedShadowCount = 0;
  s.staging.push(u); enemyAddedToStaging(s, u);
}
/** When an enemy changes card kind or leaves during an immediate attack,
 * its suspended shadows leave with it instead of being restored to a missing enemy. */
function discardDepartingShadows(s: GameState, u: Unit) {
  s.encounterDiscard.push(...u.shadows); u.shadows = []; delete u.faceupShadows; u.revealedShadowCount = 0;
  for (const c of [s.combat, ...(s.suspendedCombats ?? [])]) {
    if (!c || c.enemyId !== u.id || c.immediatePreviousShadows === undefined) continue;
    s.encounterDiscard.push(...c.immediatePreviousShadows); c.immediatePreviousShadows = [];
    delete c.immediatePreviousFaceupShadows; c.immediatePreviousRevealedShadowCount = 0;
  }
}
function capture(s: GameState, u: Unit, code: string) {
  const a = captureAttachment(u, code);
  if (!a || !engaged(s, u)) return;
  u.attachments = u.attachments.filter((x) => x.id !== a.id);
  // Capturing is not destruction. Only the triggering objective and this enemy
  // enter victory; any other attached Capture objective leaves normally.
  for (const other of [...u.attachments]) discardAttachment(s, u, other, true);
  for (const p of playerOrder(s)) forOwner(s, p, () => { s.engaged = s.engaged.filter((e) => e.id !== u.id); });
  s.staging = s.staging.filter((e) => e.id !== u.id);
  discardDepartingShadows(s, u);
  addVictoryCard(s, a.code); addVictoryCard(s, u.code);
  log(s, `${name(u)} is captured with ${card(a.code).name}.`, "good");
  advanceQuest(s);
}
export function mumakilEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("mumakil") || e.kind.startsWith("mumakilPlayer")) return false;
  const q = s.mumakil;
  if (!q) return true;
  const p = e.player ?? activeSeat(s), u = get(s, e.target);
  switch (e.kind) {
    case "mumakilSetupLocation": {
      const seen = new Set(s.staging.map((l) => l.code));
      const choices = [...new Set(s.encounterDeck.filter((code) => card(code).type_code === "location" && !seen.has(code)))];
      choose(s, `${seatName(s, p)} · Add a different location to the staging area`, choices.map((code) => ({ id: code, code, label: card(code).name,
        effects: [fx("mumakilSetupTake", { code, player: p })] }))); break;
    }
    case "mumakilSetupTake": {
      const i = s.encounterDeck.indexOf(e.code!);
      if (i >= 0 && !s.staging.some((l) => l.code === e.code)) s.staging.push(make(s, s.encounterDeck.splice(i, 1)[0]));
      break;
    }
    case "mumakilSetupDone": shuffle(s, s.encounterDeck); q.initialized = true; break;
    case "mumakilAdvance": {
      if (s.stage !== 1 || (stageLive(s, 1) && enemies(s).filter((u) => u.code === M.wild).length !== playerOrder(s).length)) { q.advancing = false; break; }
      q.completedQuests.push(q.currentQuest); addVictoryCard(s, q.currentQuest);
      q.currentQuest = q.questDeck.shift()!; s.stage = 2; s.progress = 0; s.stageRevealing = true;
      prepend(s, ...playerOrder(s).map((player) => fx("mumakilRandomCapture", { player })), fx("mumakilStageReady"));
      break;
    }
    case "mumakilRandomCapture": {
      const objectives = q.setAside.filter((u) => MUMAKIL_CAPTURES.includes(u.code));
      if (!objectives.length) break;
      const objective = shuffle(s, [...objectives])[0];
      choose(s, `${seatName(s, p)} · Attach ${name(objective)} to a Wild Mûmak`, enemies(s).filter((u) => u.code === M.wild).map((u) => ({
        id: u.id, code: u.code, label: `${name(u)} · ${engaged(s, u) ? `engaged with ${seatName(s, ownerOf(s, u))}` : "staging area"}`,
        effects: [fx("mumakilAttachCapture", { target: u.id, source: objective.id, player: p })] }))); break;
    }
    case "mumakilAttachCapture": {
      const i = q.setAside.findIndex((a) => a.id === e.source);
      if (u && u.code === M.wild && i >= 0) {
        const a = q.setAside.splice(i, 1)[0]; u.attachments.push({ id: a.id, code: a.code, exhausted: false });
      }
      break;
    }
    case "mumakilStageReady": q.advancing = false; s.stageRevealing = false; break;
    case "mumakilShuffleWild": {
      const i = q.setAside.findIndex((u) => u.code === M.wild);
      if (i >= 0) { s.encounterDeck.push(q.setAside.splice(i, 1)[0].code); shuffle(s, s.encounterDeck); }
      break;
    }
    case "mumakilTrailResponse": {
      const opts = searchOptions(s, M.wild, "mumakilTakeWild", p);
      if (opts.length) choose(s, "Mûmak Trail · Search for a Wild Mûmak?", [...opts, skip]);
      break;
    }
    case "mumakilTakeWild": takeSearch(s, e); shuffle(s, s.encounterDeck); break;
    case "mumakilAdditionalReveal": forOwner(s, firstPlayer(s), () => s.used.push("phase:mumakil-extra-reveal")); break;
    case "mumakilSearchApe": {
      const opts = searchOptions(s, M.ape, "mumakilTakeApe", p);
      if (opts.length) choose(s, "Guardians of the Jungle · Search for a Territorial Ape", opts);
      break;
    }
    case "mumakilTakeApe": { const ape = takeSearch(s, e); if (ape) forOwner(s, p, () => engage(s, ape)); break; }
    case "mumakilStampede": {
      const wilds = s.staging.filter((u) => u.code === M.wild);
      if (wilds.length) choose(s, "Stampeding Oliphaunt · Choose a Wild Mûmak to attack the first player", wilds.map((u) => ({ id: u.id, code: u.code,
        label: name(u), effects: [fx("mumakilStampedeAttack", { target: u.id, player: firstPlayer(s) })] })));
      else prepend(s, fx("mumakilSearchTrail", { player: p }));
      break;
    }
    case "mumakilStampedeAttack":
      if (u && !enemyAttackPrevented(s, u, firstPlayer(s))) prepend(s, fx("immediateAttack", { target: u.id, player: firstPlayer(s) }));
      else prepend(s, fx("mumakilSearchTrail", { player: firstPlayer(s) }));
      break;
    case "mumakilSearchTrail": {
      const opts = searchOptions(s, M.trail, "mumakilTakeTrail", p);
      if (opts.length) choose(s, "Stampeding Oliphaunt · Search for Mûmak Trail", opts);
      else shuffle(s, s.encounterDeck);
      break;
    }
    case "mumakilTakeTrail": takeSearch(s, e); shuffle(s, s.encounterDeck); break;
    case "mumakilWildRoundEnd":
      if (u && u.code === M.wild && !u.blanked && engaged(s, u)) choose(s, "Wild Mûmak · Return it to staging or defend another attack", [
        { id: "return", label: "Return Wild Mûmak to the staging area", effects: [fx("mumakilReturn", { target: u.id, player: ownerOf(s, u) })] },
        { id: "attack", label: "Wild Mûmak makes an immediate attack", effects: [fx("immediateAttack", { target: u.id, player: ownerOf(s, u) })] },
      ]);
      break;
    case "mumakilReturn": if (u) returnEnemy(s, u); break;
    case "mumakilPythonAttach": {
      const python = get(s, e.source);
      if (!python || !u || !(isHero(u) || isAlly(u)) || python.code !== M.python) break;
      s.staging = s.staging.filter((e) => e.id !== python.id);
      for (const player of playerOrder(s)) forOwner(s, player, () => { s.engaged = s.engaged.filter((e) => e.id !== python.id); });
      discardDepartingShadows(s, python);
      u.attachments.push({ id: python.id, code: python.code, exhausted: false });
      break;
    }
    case "mumakilFever": {
      const heroes = allCharacters(s).filter((u) => isHero(u) && u.committed);
      if (heroes.length) choose(s, "Terrible Fever · Remove a questing hero and attach the Condition", heroes.map((u) => ({ id: u.id, code: u.code,
        label: name(u), effects: [fx("mumakilFeverAttach", { target: u.id, flag: e.flag, player: p })] })));
      else if (!e.flag) s.encounterDiscard.push(M.fever);
      break;
    }
    case "mumakilFeverAttach":
      if (u && isHero(u) && u.committed) {
        removeFromQuest(s, u);
        if (e.flag) { const i = s.encounterDiscard.indexOf(M.fever); if (i >= 0) s.encounterDiscard.splice(i, 1); }
        const a = make(s, M.fever); u.attachments.push({ id: a.id, code: a.code, exhausted: false });
      } else if (!e.flag) s.encounterDiscard.push(M.fever);
      break;
    case "mumakilInsectsAll": prepend(s, ...playerOrder(s).map((player) => fx("mumakilInsects", { player }))); break;
    case "mumakilInsects": {
      const hand = seatView(s, p).hand;
      if (!hand.length) break;
      const physical = shuffle(s, [...hand])[0], amount = Number(card(physical.code).cost) || 0;
      forOwner(s, p, () => discardHandCard(s, physical.id));
      prepend(s, fx("mumakilAssignDamage", { value: Math.max(0, amount), player: p }));
      break;
    }
    case "mumakilAssignDamage":
      if ((e.value ?? 0) > 0 && own(s, p).length) choose(s, `Biting Insects · Assign ${e.value} damage`, own(s, p).map((u) => ({ id: u.id, code: u.code,
        label: `Deal 1 damage to ${name(u)}`, effects: [fx("damage", { target: u.id, value: 1, player: p }), { ...e, value: e.value! - 1 }] })));
      break;
    case "mumakilSavageAll": prepend(s, ...playerOrder(s).map((player) => fx("mumakilSavagePlayer", { player }))); break;
    case "mumakilSavagePlayer": {
      // The five cards leave atomically. Their title set is fixed before any
      // deck-discard response can recover one of those physical cards.
      const discarded = discardPlayerDeck(s, 5, p);
      const titles = new Set(discarded.map((code) => card(code).name));
      const hosts = [...units(s), ...allQuestUnits(s)];
      const effects = hosts.flatMap((host) => [
        ...(allCharacters(s).some((u) => u.id === host.id) && ownerOf(s, host) === p && titles.has(card(host.code).name)
          ? [fx("mumakilDiscardCharacter", { target: host.id, player: p })] : []),
        ...host.attachments.filter((a) => attachmentController(s, host, a) === p && titles.has(card(a.code).name))
          .map((a) => fx("discardAttachment", { target: host.id, source: a.id, player: p })),
        ...(card(host.code).type_code === "player-side-quest" && (host.owner ?? 0) === p && titles.has(card(host.code).name)
          ? [fx("mumakilDiscardSideQuest", { target: host.id, player: p })] : []),
      ]);
      prepend(s, ...effects); break;
    }
    case "mumakilDiscardCharacter": if (u) discardCharacter(s, u); break;
    case "mumakilDiscardSideQuest":
      if (u) { for (const a of [...u.attachments]) discardAttachment(s, u, a, true); s.staging = s.staging.filter((q) => q.id !== u.id); forOwner(s, u.owner ?? p, () => s.discard.push(u.code)); }
      break;
    case "mumakilCaptureResponse": {
      if (!u || !engaged(s, u) || !captureAttachment(u, e.code!)) break;
      const title = card(e.code!).name;
      choose(s, `${title} · Attempt to capture ${name(u)}?`, [{ id: "capture", code: e.code, label: `Use ${title}`,
        effects: [{ ...e, kind: "mumakilCaptureAttempt" }] }, skip]); break;
    }
    case "mumakilCaptureAttempt": {
      if (!u || !engaged(s, u) || !captureAttachment(u, e.code!)) break;
      let succeeds = false;
      if (e.code === M.lasso) {
        forOwner(s, ownerOf(s, u), () => shuffle(s, s.deck));
        const discarded = discardPlayerDeck(s, 1, ownerOf(s, u))[0];
        succeeds = discarded !== undefined && (Number(card(discarded).cost) || 0) >= remaining(s, u);
      } else if (e.code === M.spear) {
        const discarded = encounterDraw(s);
        if (discarded) { s.encounterDiscard.push(discarded); succeeds = (card(discarded).threat ?? 0) >= remaining(s, u); }
      } else if (e.code === M.pit) succeeds = (e.value ?? 0) >= remaining(s, u);
      else if (e.code === M.noose) succeeds = (e.ids ?? []).some((id) => { const d = get(s, id); return !!d && remaining(s, d) > remaining(s, u); });
      if (succeeds) capture(s, u, e.code!);
      else log(s, `${card(e.code!).name} does not capture ${name(u)}.`, "danger");
      break;
    }
    default: return false;
  }
  return true;
}
