import type { Attachment, Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { isHero, isAlly } from "./card-types";
import { choose, encounterDraw, fx, get, locationQuest, log, make, prepend, removeShadowCard, shuffle, threatOf } from "./core";
import { enemyAddedToStaging, engage, progressLocation, questDefeated, win } from "./board";
import { activeSeat, allActiveLocations, allCharacters, allEngaged, firstPlayer, forOwner, ownerOf, playerOrder } from "./table";
import { mainQuestUnit } from "./quest-state";
import { RACE_HARAD as R, RACE_HARAD_MAIN_QUESTS, RACE_HARAD_ENEMY_QUESTS, RACE_HARAD_RECIPES, raceHaradAreaUnits } from "./race-harad-support";
export * from "./race-harad-support";

const live = (s: GameState) => !!s.raceHarad;
const stageLive = (s: GameState) => live(s) && !mainQuestUnit(s)?.blanked;
const orc = (u: Unit) => (card(u.code).traits ?? "").split(".").some((x) => x.trim() === "Orc");
const enemy = (u: Unit) => card(u.code).type_code === "enemy";
const allEnemies = (s: GameState) => [...s.staging, ...allEngaged(s), ...(s.raceHarad?.area ?? [])].filter(enemy);
type RaceCombat = NonNullable<GameState["combat"]> & { raceHaradDestroyedCharacter?: boolean; raceHaradPursuerShadows?: number; raceHaradReturnToOrcs?: boolean };
export const raceHaradSameStage = (s: GameState) => !!s.raceHarad && s.stage === s.raceHarad.enemyStage && card(s.raceHarad.currentQuest).name === card(s.raceHarad.enemyQuest).name;
export function raceHaradSyncArea(s: GameState) {
  const q = s.raceHarad; if (!q) return;
  if (raceHaradSameStage(s)) {
    const added = q.area.splice(0);
    for (const u of added) { u.raceHaradArea = true; delete u.immuneToPlayerEffects; s.staging.push(u); }
    prepend(s, ...added.filter((u) => card(u.code).type_code === "location" && u.progress >= locationQuest(s, u)).map((u) => fx("raceHaradAreaExplore", { target: u.id })));
  } else {
    const moved = s.staging.filter((u) => u.raceHaradArea);
    s.staging = s.staging.filter((u) => !u.raceHaradArea); q.area.push(...moved);
    for (const u of q.area) u.immuneToPlayerEffects = true;
  }
}
export function raceHaradAreaLeft(s: GameState, u: Unit) {
  if (s.raceHarad) s.raceHarad.area = s.raceHarad.area.filter((x) => x.id !== u.id);
  delete u.raceHaradArea;
  delete u.immuneToPlayerEffects;
}
function addArea(s: GameState, u: Unit) {
  const q = s.raceHarad; if (!q) return;
  s.staging = s.staging.filter((x) => x.id !== u.id);
  for (const player of playerOrder(s)) forOwner(s, player, () => { s.engaged = s.engaged.filter((x) => x.id !== u.id); });
  q.area = q.area.filter((x) => x.id !== u.id); u.raceHaradArea = true; q.area.push(u); raceHaradSyncArea(s);
}
export const raceHaradAreaImmune = (s: GameState, u: Unit) => live(s) && !raceHaradSameStage(s) && raceHaradAreaUnits(s).some((x) => x.id === u.id);
export const raceHaradChiefCannotLeave = (s: GameState, u: Unit) => !!s.raceHarad && u.code === R.chief &&
  (s.raceHarad.enemyStage === 1 || (s.raceHarad.enemyStage === 2 && s.stage === 3) || (s.raceHarad.enemyStage === 3 && s.stage === 4));
export const raceHaradCannotLeave = (s: GameState, u: Unit) => raceHaradAreaImmune(s, u) || (raceHaradChiefCannotLeave(s, u) && raceHaradAreaUnits(s).some((x) => x.id === u.id));
export function raceHaradCardEntered(s: GameState, u: Unit, fromReveal = false, cancel = false) {
  if (!live(s) || !fromReveal || cancel) return false;
  if (u.code === R.racingWarg) prepend(s, fx("raceHaradWarg", { source: u.id, player: firstPlayer(s) }));
  if ([R.pursuer, R.road].includes(u.code)) {
    addArea(s, u);
    if (u.code === R.pursuer && !raceHaradSameStage(s)) prepend(s, fx("reveal", { player: activeSeat(s) }));
    return true;
  }
  return false;
}
function resetRound(s: GameState) {
  const q = s.raceHarad;
  if (q && q.counterRound !== s.round) { q.counterRound = s.round; q.progressThisRound = 0; q.progressLimit = 0; }
}
export function raceHaradCharactersCommitted(s: GameState) {
  if (!stageLive(s) || s.stage < 2) return;
  resetRound(s);
  s.raceHarad!.progressLimit = allCharacters(s).filter((u) => u.code === R.tamed).every((u) => u.committed) ? 10 : 5;
}
export function raceHaradProgress(s: GameState, amount: number, quest: Unit) {
  const q = s.raceHarad;
  if (!q || quest.code !== q.currentQuest) return amount;
  resetRound(s);
  const allowed = !quest.blanked && q.progressLimit > 0 ? Math.min(amount, Math.max(0, q.progressLimit - q.progressThisRound)) : amount;
  q.progressThisRound += allowed; return allowed;
}
export const raceHaradExtraReveals = (s: GameState) => stageLive(s) && s.stage === 3 && s.raceHarad!.enemyStage === 2 && raceHaradAreaUnits(s).some((u) => u.code === R.chief) ? 1 : 0;
export const raceHaradStagingThreat = (s: GameState) => (s.raceHarad?.howling ?? []).filter((h) => h.round === s.round && h.phase === s.phase).reduce((n, h) => n + h.value, 0);
export function raceHaradThreatBonus(s: GameState, u: Unit) {
  if (!live(s)) return 0;
  const mount = u.attachments.filter((a) => a.code === R.racingWarg && !a.blanked).length;
  return mount + (u.code === R.erg && !u.blanked ? s.stage : 0) + (u.code === R.expanse && !u.blanked && !raceHaradSameStage(s) ? 2 : 0) +
    (enemy(u) ? (s.raceHarad!.howling.filter((h) => h.round === s.round && h.phase === s.phase).reduce((n, h) => n + h.enemyBonus, 0)) : 0) +
    (enemy(u) && s.raceHarad!.enemyStage === 3 && s.stage === 4 && raceHaradAreaUnits(s).some((x) => x.id === u.id) ? 1 : 0);
}
export function raceHaradStats(s: GameState, u: Unit) {
  const mount = live(s) ? u.attachments.filter((a) => a.code === R.racingWarg && !a.blanked).length : 0;
  return { attack: mount, defense: mount, health: mount };
}
export function raceHaradDamageAmount(s: GameState, u: Unit, amount: number) {
  if (!s.raceHarad || u.code !== R.chief) return amount;
  if ((stageLive(s) && [2, 3].includes(s.stage)) || (s.raceHarad.enemyStage === 4 && s.staging.some((l) => l.code === R.river))) return 0;
  return amount;
}
export const raceHaradCannotPlayerReady = (s: GameState) => live(s) && s.staging.some((q) => q.code === R.water && !q.blanked);
export const raceHaradLocationProgressBlocked = (s: GameState, u: Unit) => live(s) && u.code !== R.dunes && card(u.code).type_code === "location" && s.staging.some((l) => l.id === u.id) && s.staging.some((l) => l.code === R.dunes && !l.blanked);
export function raceHaradUndefendedTargets(s: GameState) {
  if (!live(s)) return undefined;
  const mounts = allCharacters(s).filter((u) => u.code === R.tamed && !u.blanked && ownerOf(s, u) === activeSeat(s));
  return mounts.length ? mounts : undefined;
}
export function raceHaradCharacterLeft(s: GameState, u: Unit, controller: number) {
  if (!live(s) || u.code !== R.tamed || u.blanked) return;
  forOwner(s, controller, () => { s.used.push("game:race-harad-mumak-lost"); });
}
export function setupRaceHarad(s: GameState) {
  const r = RACE_HARAD_RECIPES.find((r) => r.mode === (s.easyMode ? "easy" : "standard"))!;
  // The reference recipe reserves location copies for the printed search; they
  // are returned to the physical deck before any player chooses a location.
  s.encounterDeck = r.cards.filter((c) => !["sharedQuestDeck", "sharedQuestDeck2"].includes(c.section) && ![R.tamed, R.chief, R.settingOutEnemy, R.river].includes(c.code) && !(c.code === R.rider && c.section === "sharedSetAside"))
    .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const chief = make(s, R.chief); chief.raceHaradArea = true;
  s.raceHarad = { initialized: false, advancing: false, currentQuest: R.settingOut, questDeck: RACE_HARAD_MAIN_QUESTS.slice(1), completedQuests: [],
    setAside: [make(s, R.river), make(s, R.rider), ...Array.from({ length: 4 }, () => make(s, R.tamed))], removed: [], area: [chief],
    enemyQuest: R.settingOutEnemy, enemyQuestDeck: RACE_HARAD_ENEMY_QUESTS.slice(1), enemyCompletedQuests: [], enemyStage: 1, enemyProgress: 0, chieftainId: chief.id,
    progressThisRound: 0, progressLimit: 0, counterRound: s.round, howling: [] };
  raceHaradSyncArea(s);
}
export function raceHaradOpeningHandsKept(s: GameState) {
  if (!s.raceHarad || s.raceHarad.initialized) return false;
  prepend(s, fx("raceHaradSetupMounts"), ...playerOrder(s).map((player) => fx("raceHaradSetupLocation", { player })), fx("raceHaradSetupDone", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
export function raceHaradAdvance(s: GameState) {
  const q = s.raceHarad; if (!q) return false;
  if (!q.initialized || q.advancing || s.status !== "playing" || s.stageRevealing || s.phase === "setup") return true;
  if (s.progress < ([0, 15, 20, 20][s.stage - 1])) return true;
  if (s.stage === 4 && stageLive(s) && [...s.staging, ...allActiveLocations(s), ...q.area].some((u) => u.code === R.river)) return true;
  if (questDefeated(s, q.currentQuest)) return true;
  if (s.stage === 4) { win(s); s.reason = "The Oliphaunts cross the river Harnen and escape their pursuers."; }
  else { q.advancing = true; prepend(s, fx("raceHaradAdvance", { player: firstPlayer(s) })); }
  return true;
}
export function raceHaradEndQuest(s: GameState) {
  if (s.raceHarad?.initialized) prepend(s, fx("raceHaradEnemyRound", { player: firstPlayer(s) }));
}
export const raceHaradTravelProblem = (s: GameState, u: Unit) => live(s) && u.code === R.river && !u.blanked && s.progress < 20 ? "River Harnen requires at least 20 progress on stage 4B." : null;
export function raceHaradTravelEffects(s: GameState, u: Unit): Effect[] | undefined {
  return live(s) && u.code === R.river && !u.blanked ? playerOrder(s).map((player) => fx("reveal", { player })) : undefined;
}
export function raceHaradTravelEntered(s: GameState, u: Unit, _actualTravel = true) {
  if (!live(s) || u.blanked) return;
  if (u.code === R.erg) prepend(s, ...playerOrder(s).map((player) => fx("desertAssignDamage", { value: s.stage, player, text: "Blistering Erg" })));
  else if (u.code === R.expanse) prepend(s, ...playerOrder(s).map((player) => fx("threat", { value: 2, player })));
  else if (u.code === R.dunes) prepend(s, fx("reveal", { player: firstPlayer(s) }));
  else if (u.code === R.oasis) prepend(s, ...playerOrder(s).map((player) => fx("desertExhaust", { player, text: "Desert Oasis" })));
}
export function raceHaradExplored(s: GameState, u: Unit, wasActive: boolean) {
  raceHaradAreaLeft(s, u);
  if (live(s) && wasActive && u.code === R.oasis && !u.blanked) prepend(s, fx("desertOasisResponse", { player: firstPlayer(s) }));
}
export function raceHaradSideDefeated(s: GameState, u: Unit) {
  if (live(s) && u.code === R.water && !u.blanked) prepend(s, fx("desertWaterResponse", { player: firstPlayer(s) }));
}
export function raceHaradEncounter(s: GameState, code: string, replay = false) {
  if (!live(s)) return false;
  if ([R.sandstorm, R.exhaustion, R.howling, R.pursuers].includes(code)) {
    if (!replay) s.encounterDiscard.push(code);
    prepend(s, fx(code === R.sandstorm ? "desertSandstormAll" : code === R.exhaustion ? "desertExhaustAll" : code === R.howling ? "raceHaradHowling" : "raceHaradDiscardOrc", { player: firstPlayer(s) })); return true;
  }
  return [R.racingWarg, R.pursuer, R.road].includes(code);
}
export function raceHaradShadow(s: GameState, code: string) {
  const c = s.combat as RaceCombat | null;
  if (!live(s) || !c) return false;
  const player = c.attackPlayer ?? activeSeat(s);
  if (code === R.howling) prepend(s, fx("threat", { value: 1, player }));
  else if (code === R.pursuers) { c.attackBonus++; c.raceHaradPursuerShadows = (c.raceHaradPursuerShadows ?? 0) + 1; }
  else if (code === R.road) { if (!raceHaradSameStage(s)) c.raceHaradReturnToOrcs = true; }
  else if (code === R.pursuer) {
    if (!raceHaradSameStage(s)) {
      // The face-up shadow remains physically on the attacker until this queued
      // continuation takes that exact copy rather than inventing another card.
      const attacker = get(s, c.enemyId);
      const index = attacker?.shadows.slice(0, attacker.revealedShadowCount ?? 0).lastIndexOf(code);
      if (attacker && index !== undefined && index >= 0) {
        removeShadowCard(attacker, index);
        const pursuer = make(s, code); s.staging.push(pursuer); forOwner(s, player, () => engage(s, pursuer));
      }
    }
  }
  else if (code === R.exhaustion) prepend(s, fx("desertExhaust", { player, text: "Heat Exhaustion" }));
  else if (code === R.sandstorm) prepend(s, fx("desertSandstormShadow", { player }));
  else return false;
  return true;
}
export function raceHaradCharacterDestroyed(s: GameState, u: Unit, context: DamageContext) {
  if (live(s) && s.combat && context.combatDamage && context.enemyId === s.combat.enemyId && (isHero(u) || isAlly(u))) (s.combat as RaceCombat).raceHaradDestroyedCharacter = true;
}
export function raceHaradAttackFinished(s: GameState, completed: NonNullable<GameState["combat"]>): Effect[] {
  if (!live(s)) return [];
  const c = completed as RaceCombat, effects: Effect[] = [];
  if (c.raceHaradDestroyedCharacter) {
    const amount = (stageLive(s) && s.stage === 4 ? 1 : 0) + 2 * (c.raceHaradPursuerShadows ?? 0);
    if (amount) effects.push(fx("raceHaradEnemyProgress", { value: amount, player: firstPlayer(s) }));
  }
  if (c.raceHaradReturnToOrcs && get(s, c.enemyId)) effects.push(fx("raceHaradReturnToOrcs", { target: c.enemyId }));
  return effects;
}
export function raceHaradAttachmentLeaves(s: GameState, _host: Unit, a: Attachment, leaving: boolean) {
  if (!live(s) || a.code !== R.racingWarg || !leaving || a.blanked) return false;
  const unit = make(s, a.code); unit.id = a.id; s.staging.push(unit); enemyAddedToStaging(s, unit); return true;
}
function discardShadows(s: GameState, u: Unit) {
  s.encounterDiscard.push(...u.shadows); u.shadows = []; delete u.faceupShadows; u.revealedShadowCount = 0;
  for (const c of [s.combat, ...(s.suspendedCombats ?? [])]) if (c?.enemyId === u.id && c.immediatePreviousShadows !== undefined) {
    s.encounterDiscard.push(...c.immediatePreviousShadows); c.immediatePreviousShadows = []; delete c.immediatePreviousFaceupShadows; c.immediatePreviousRevealedShadowCount = 0;
  }
}
function takeAside(s: GameState, code: string) {
  const q = s.raceHarad!, index = q.setAside.findIndex((u) => u.code === code);
  return index >= 0 ? q.setAside.splice(index, 1)[0] : undefined;
}
function lose(s: GameState) {
  s.status = "lost"; s.reason = "The Orcs overtake the caravan before it can escape across the Harnen.";
  s.choice = null; s.queue = []; if (s.flow) s.flow.pending = null; log(s, s.reason, "danger");
}
function shuffleDiscard(s: GameState) { s.encounterDeck = shuffle(s, [...s.encounterDeck, ...s.encounterDiscard.splice(0)]); }
export const raceHaradSharedEffect = (e: Effect) => e.kind.startsWith("raceHarad") && !e.kind.startsWith("raceHaradPlayer") && !["raceHaradSetupLocation", "raceHaradTakeLocation"].includes(e.kind);
export function raceHaradEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("raceHarad") || e.kind.startsWith("raceHaradPlayer")) return false;
  const q = s.raceHarad; if (!q) return true;
  const u = get(s, e.target), player = e.player ?? firstPlayer(s);
  switch (e.kind) {
    case "raceHaradSetupMounts":
      for (const p of playerOrder(s)) { const mount = takeAside(s, R.tamed); if (mount) { mount.owner = p; forOwner(s, p, () => { s.allies.push(mount); }); } }
      q.removed.push(...q.setAside.filter((u) => u.code === R.tamed)); q.setAside = q.setAside.filter((u) => u.code !== R.tamed); break;
    case "raceHaradSetupLocation": {
      const selected = new Set(s.staging.filter((u) => card(u.code).type_code === "location").map((u) => card(u.code).name));
      const seen = new Set<string>();
      const opts = s.encounterDeck.flatMap((code, index) => {
        if (card(code).type_code !== "location" || selected.has(card(code).name) || seen.has(code)) return [];
        seen.add(code); return [{ id: String(index), code, label: card(code).name, effects: [fx("raceHaradTakeLocation", { code, value: index, player })] }];
      });
      if (opts.length) choose(s, "Setting Out · Choose a different location", opts); break;
    }
    case "raceHaradTakeLocation": if (s.encounterDeck[e.value!] === e.code) s.staging.push(make(s, s.encounterDeck.splice(e.value!, 1)[0])); break;
    case "raceHaradSetupDone": shuffle(s, s.encounterDeck); q.initialized = true; q.advancing = true; prepend(s, fx("raceHaradAdvance", { player: firstPlayer(s) })); break;
    case "raceHaradAdvance": {
      q.completedQuests.push(q.currentQuest); q.currentQuest = q.questDeck.shift()!; s.stage++; s.progress = 0; q.progressThisRound = 0; q.progressLimit = 0; q.counterRound = s.round;
      q.advancing = false; s.stageRevealing = true; raceHaradSyncArea(s);
      prepend(s, fx("raceHaradStageReveal", { player: firstPlayer(s) }), fx("stageRevealed")); break;
    }
    case "raceHaradStageReveal":
      if (s.stage === 2) choose(s, "Racing North · Add the Uruk Warg-Rider to an area", [
        { id: "staging", label: "Add Uruk Warg-Rider to the staging area", code: R.rider, effects: [fx("raceHaradAddRider", { flag: false })] },
        { id: "orcs", label: "Add Uruk Warg-Rider to the Orcs’ area", code: R.rider, effects: [fx("raceHaradAddRider", { flag: true })] },
      ]);
      else { if (s.stage === 4) { const river = takeAside(s, R.river); if (river) s.staging.push(river); } shuffleDiscard(s); prepend(s, fx("raceHaradDiscardOrc")); }
      break;
    case "raceHaradAddRider": { const rider = takeAside(s, R.rider); if (rider) { if (e.flag) addArea(s, rider); else { s.staging.push(rider); enemyAddedToStaging(s, rider); } } break; }
    case "raceHaradDiscardOrc": {
      while (s.encounterDeck.length) {
        const code = s.encounterDeck.shift()!;
        if (card(code).type_code === "enemy" && orc({ code } as Unit)) { addArea(s, make(s, code)); break; }
        s.encounterDiscard.push(code);
      }
      break;
    }
    case "raceHaradEnemyRound": {
      if (!q.initialized) break;
      if ([2, 3].includes(q.enemyStage)) { const chief = get(s, q.chieftainId); if (chief) { discardShadows(s, chief); addArea(s, chief); } }
      const code = encounterDraw(s); if (code) s.encounterDiscard.push(code);
      const area = q.enemyStage === 4 ? allEngaged(s) : raceHaradAreaUnits(s);
      const amount = (code ? card(code).threat ?? 0 : 0) + area.reduce((n, u) => n + threatOf(s, u), 0);
      log(s, `The Orcs place ${amount} progress on ${card(q.enemyQuest).name}${code ? ` after discarding ${card(code).name}` : ""}.`, "danger");
      prepend(s, fx("raceHaradEnemyProgress", { value: amount })); break;
    }
    case "raceHaradEnemyProgress": q.enemyProgress += Math.max(0, e.value ?? 0); prepend(s, fx("raceHaradEnemyAdvance")); break;
    case "raceHaradEnemyAdvance": {
      if (q.enemyProgress < (card(q.enemyQuest).back_quest ?? Infinity)) break;
      if (q.enemyStage === 4 || (q.enemyStage === 2 && s.stage === 2) || (q.enemyStage === 3 && s.stage === 3)) { lose(s); break; }
      q.enemyCompletedQuests.push(q.enemyQuest); q.enemyQuest = q.enemyQuestDeck.shift()!; q.enemyStage++; q.enemyProgress = 0; raceHaradSyncArea(s);
      log(s, `The Orcs advance to stage ${q.enemyStage} · ${card(q.enemyQuest).name}.`, "danger");
      if ((q.enemyStage === 2 && s.stage >= 3) || (q.enemyStage === 3 && s.stage >= 4)) prepend(s, fx("raceHaradDiscardOrc"));
      break;
    }
    case "raceHaradHowling": q.howling.push({ round: s.round, phase: s.phase, value: raceHaradSameStage(s) ? 0 : raceHaradAreaUnits(s).reduce((n, u) => n + threatOf(s, u), 0), enemyBonus: raceHaradSameStage(s) ? 1 : 0 }); break;
    case "raceHaradWarg": {
      const warg = get(s, e.source); if (!warg) break;
      const opts = allEnemies(s).filter((u) => u.id !== warg.id && orc(u) && !u.attachments.some((a) => a.code === R.racingWarg)).map((u) => ({ id: u.id, code: u.code, label: name(u), effects: [fx("raceHaradWargAttach", { source: warg.id, target: u.id, player })] }));
      if (opts.length) choose(s, "Racing Warg · Attach to an Orc enemy", opts); break;
    }
    case "raceHaradWargAttach": {
      const warg = get(s, e.source); if (!warg || !u || !orc(u) || u.attachments.some((a) => a.code === R.racingWarg)) break;
      s.staging = s.staging.filter((x) => x.id !== warg.id); raceHaradAreaLeft(s, warg); discardShadows(s, warg);
      u.attachments.push({ id: warg.id, code: warg.code, exhausted: false }); break;
    }
    case "raceHaradReturnToOrcs": if (u) { discardShadows(s, u); addArea(s, u); } break;
    case "raceHaradAreaExplore": if (u && raceHaradSameStage(s) && s.staging.some((x) => x.id === u.id)) progressLocation(s, u, 0); break;
    default: return false;
  }
  return true;
}
