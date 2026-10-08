import { CHETWOOD } from "./chetwood-support";
import * as Chetwood from "./chetwood";
import * as Weather from "./weather-hills";
import { removeCurrentQuestProgress } from "./side-quests";
import { selectedSideQuest } from "./side-quest-support";
import { addCurrentQuestProgress } from "./side-quests";
import { mainStageInfo } from "./core";
import { RANGER_NORTH, rangerRevealed } from "./ranger-north";
import { hasEncounterKeyword } from "./encounter-keyword";
import * as Realm from "./lost-realm-player";
import * as Antlered from "./antlered";
import { celebrimborProtected } from "./celebrimbor-support";
import * as Celebrimbor from "./celebrimbor";
import { NIN } from "./nin-eilph-support";
import { ninNoCardEconomy } from "./nin-eilph-support";
import * as Nin from "./nin-eilph";
import { threatElimination } from "./tharbad-support";
import * as Tharbad from "./tharbad";
import * as Trials from "./three-trials";
import { playerCardImmune } from "./card-immunity";
import * as DunlandQuest from "./dunland-trap";
import { FANGORN } from "./fangorn-support";
import * as Fangorn from "./fangorn";
import { cannotReady } from "./core";
import * as Catch from "./catch-orc";
import * as Fords from "./fords-isen";
import { canLeaveHand } from "./hand-rules";
import {
  finalRingAllyEntering,
  finalRingAllyEntered,
  finalRingFollowFirst,
  finalRingDamageTaken,
  finalRingQuestProgress,
  finalRingHastyWindow,
} from "./ring-maker-final-player";
import {
  offerRingMakerDoomed,
  ringMakerAllyEntered,
  ringMakerCharacterLeft,
  ringMakerEventPlayed,
  ringMakerLocationExplored,
  ringMakerLocationRevealed,
  ringMakerThreatRaised,
} from "./ring-maker-player";
import { heirsShadowDealt } from "./heirs-numenor";
import * as Isengard from "./voice-isengard";
import * as BloodQuest from "./blood-gondor";
import * as MorgulQuest from "./morgul-vale";
import * as Druadan from "./druadan-forest";
import * as Amon from "./amon-din";
import * as Osgiliath from "./assault-osgiliath";
import { canGainResources } from "./core";
import { enemyAttackPrevented } from "./core";
import {
  dunlandAllyEntered,
  dunlandEventPlayed,
  dunlandFallResponses,
  offerCloseCall,
} from "./dunland-trap-player";
import {
  engagedEnemies,
  normalAttackPending,
  consideredEngaged,
} from "./considered-engagement";
import {
  advanceShadowFlame,
  shadowFlameIndestructible,
  shadowFlameCanMove,
  shadowFlameLocationProgressBlocked,
  shadowFlameEventCancelled,
  shadowFlameCharactersCommitted,
  shadowFlameCharactersLeft,
  shadowFlameEncounter,
  shadowFlameShadow,
} from "./shadow-flame";
import { druadanPlayerLeavesPlay } from "./druadan-player-cards";
import { morgulPlayerCharactersCommitted } from "./morgul-player-cards";
import { osgiliathPlayerAllyEntered } from "./osgiliath-player-cards";
import {
  bloodPlayerEnemyAddedToStaging,
  bloodPlayerPhaseEndEffects,
} from "./blood-gondor-player-cards";
import {
  advanceLongDark,
  longDarkProgressLocation,
  longDarkDamageDealt,
  longDarkRevealSurge,
  longDarkEngaged,
  longDarkEncounter,
  longDarkShadow,
  longDarkCheck,
} from "./long-dark";
import {
  heirsPlayerAllyEntered,
  heirsPlayerCardPlayed,
  heirsPlayerEnemyAddedToStaging,
  heirsPlayerLocationExplored,
} from "./heirs-player-cards";
import { takePlayerDeck } from "./core";
import {
  advanceHeirs,
  heirsAttachmentLeaves,
  heirsThreatRaised,
  heirsDamageAmount,
  heirsDamageDealt,
  heirsCharacterLeaves,
  heirsRemoveCharacter,
  heirsCheck,
  heirsExplored,
  heirsLocationProgressBlocked,
  heirsRoundEnd,
  heirsPhaseEnd,
  heirsEnemyEntered,
  heirsEngaged,
  heirsEncounter,
  heirsShadow,
  heirsCannotCancel,
} from "./heirs-numenor";
import {
  advanceStewardFear,
  stewardFearCheck,
  stewardFearQuestProgress,
  stewardFearCharacterExhausted,
  stewardFearCharacterReadied,
  stewardFearHeroAbilityTriggered,
  stewardFearCharacterDestroyed,
  stewardFearLocationEntered,
  stewardFearLocationLeft,
  stewardFearEventPlayed,
  stewardFearCannotCancel,
  stewardFearEncounter,
  stewardFearShadow,
} from "./steward-fear";
import {
  advanceFoundationsStone,
  foundationsCharactersCommitted,
  foundationsCheck,
  foundationsHeroMissingAllowed,
  foundationsEngaged,
  foundationsLocationExplored,
  foundationsEncounter,
  foundationsShadow,
} from "./foundations-stone";
import { mainQuestCode, mainQuestUnit } from "./quest-state";
import {
  collectorAllyEntered,
  collectorEncounterRevealed,
  collectorEnemyCancelOptions,
  collectorLocationExplored,
  collectorQuestDefeated,
} from "./collector-player-cards";
import {
  advanceWatcherWater,
  watcherWaterCannotExhaust,
  watcherWaterProgressLocation,
  watcherWaterProgressCapacity,
  watcherWaterProgressPlaced,
  watcherWaterProgressBlocked,
  watcherWaterEncounter,
  watcherWaterShadow,
} from "./watcher-water";
import {
  roadRivendellCheck,
  roadRivendellFollowFirstPlayer,
  roadRivendellCharacterExhausted,
  advanceRoadRivendell,
  roadRivendellEncounter,
  roadRivendellShadow,
  roadRivendellEngaged,
  roadRivendellEnemyEntered,
  roadRivendellRevealedEnemy,
  roadRivendellCannotCancel,
  roadRivendellProgressPlaced,
} from "./road-rivendell";
import {
  redhornCheck,
  redhornFollowFirstPlayer,
  redhornCharacterExhausted,
  redhornPhaseEnd,
  advanceRedhorn,
  redhornEncounter,
  redhornShadow,
} from "./redhorn-gate";
import {
  foundationsPlayerCharactersCommitted,
  foundationsPlayerCardDiscarded,
  foundationsPlayerDiscardTaken,
} from "./foundations-player-cards";
import { holdPlayedEvent } from "./event-resolution";
import {
  amonPlayerAllyEntered,
  amonPlayerEnemyEngaged,
  amonPlayerEnemyAddedToStaging,
  amonPlayerCanEngage,
  amonPlayerDiscardAtZero,
  offerGondorianDiscipline,
  amonPlayerInterceptReveal,
} from "./amon-din-player-cards";
import { dwarfCharactersCommitted } from "./dwarf-player-cards";
import { elfCharactersCommitted } from "./elf-player-cards";
import { rohanCharactersCommitted } from "./rohan-player-cards";
import {
  rohanCharactersLeft,
  rohanAllyEntered,
  rohanPhaseEnd,
  rohanOathPlayers,
} from "./rohan-player-cards";
import { attachmentHasTrait, effectiveTraits } from "./expansion-passives";
import {
  watcherPlayerLeavesPlay,
  watcherPlayerLocationEntered,
} from "./watcher-player-cards";
import {
  longDarkPlayerEnemyAddedToStaging,
  longDarkPlayerCardPlayed,
} from "./long-dark-player-cards";
import { watcherPlayerCharacterExhausted } from "./watcher-player-cards";
import { khazadCannotExhaust } from "./khazad-dum";
import {
  roadPlayerThreatRaised,
  roadPlayerLeavesPlay,
} from "./road-player-cards";
import {
  advanceKhazad,
  khazadDamageCancelled,
  khazadAttachmentLeaves,
  khazadExplored,
  khazadQuestProgress,
  khazadResourcePhase,
  khazadEngaged,
  khazadRevealedEnemy,
  khazadDiscardRevealedEnemy,
  khazadCannotCancel,
  khazadEncounter,
  khazadShadow,
} from "./khazad-dum";
import { redhornPlayerEventPlayed } from "./redhorn-player-cards";
// Board rules: damage, destruction, progress, quest advancement, phases, encounter reveals and shadows.
import { card, name } from "./cards";
import type { Attachment, Effect, GameState, Option, Unit } from "./types";
import { OBJECTIVES, CLUE } from "./scenarios";

import {
  activeSeat,
  allCharacters,
  allActiveLocations,
  allHeroes,
  allEngaged,
  eachSeat,
  eachArea,
  globalEachSeat,
  globalCharacters,
  globalEngaged,
  globalLivingSeats,
  globalPlayerOrder,
  firstPlayer,
  forOwner,
  livingSeats,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
  selectSeat,
  syncSeat,
  startPhase,
  attachmentController,
  removeActiveLocation,
} from "./table";

import { pauseFor } from "./presentation";
import {
  characters,
  choose,
  draw,
  encounterDraw,
  enqueue,
  followFirstPlayer,
  fx,
  get,
  inPlay,
  log,
  make,
  objectiveCount,
  opts,
  pay,
  prepend,
  random,
  requireRule,
  removeShadowCard,
  restrictAttachments,
  shuffle,
  skip,
  locationQuest,
  stats,
  units,
  globalUnits,
  hasClue,
  riverlandsInPlay,
  canPay,
  playCost,
} from "./core";
import { rescuePrisoner } from "./scenario-rules";
import { resolveCampaign } from "./campaign";
import {
  restrictedSlots,
  restrictedLimit,
  resourcePhaseBonus,
} from "./expansion-passives";
import {
  CARROCK,
  advanceCarrock,
  carrockEncounter,
  carrockShadow,
  carrockDefeated,
  isSacked,
} from "./carrock";
import {
  advanceEmynMuil,
  emynMuilRevealSurge,
  emynMuilEncounter,
  emynMuilShadow,
} from "./emyn-muil";
import { syncAttachmentText } from "./attachment-text";
import {
  gondorAllyEntered,
  gondorLeavesPlay,
  gondorResourcesGained,
  gondorEnemyEngaged,
} from "./gondor-player-cards";
import {
  advanceRhosgobel,
  rhosgobelCheck,
  rhosgobelEncounter,
  rhosgobelShadow,
  rhosgobelExplored,
} from "./rhosgobel";
import {
  rhosgobelCharacterDestroyed,
  rhosgobelLocationExplored,
} from "./rhosgobel-player-cards";
import {
  huntResourceDrawBonus,
  huntAllyEntered,
  offerFrodoDamage,
  expansionLeavesPlay,
} from "./expansion-player-cards";
import {
  emynPlayerAllyEntered,
  emynPlayerLeavesPlay,
} from "./emyn-player-cards";
import {
  deadMarshesCheck,
  advanceDeadMarshes,
  deadMarshesEncounter,
} from "./dead-marshes";
import {
  marshPlayerThreatRaised,
  marshPlayerCharacterReadied,
  offerMarshDamageRedirect,
} from "./marsh-player-cards";
import {
  dwarfDeckDiscarded,
  dwarfDamageAssigned,
  dwarfAllyEntered,
  dwarfResourceDrawBonus,
} from "./dwarf-player-cards";

import {
  returnMirkwoodCheck,
  advanceReturnMirkwood,
  returnMirkwoodEncounter,
  returnMirkwoodShadow,
  returnMirkwoodEngaged,
  returnMirkwoodExplored,
} from "./return-mirkwood";

import {
  mirkwoodPlayerAllyEntered,
  mirkwoodPlayerLeavesPlay,
  type LeaveDestination,
} from "./mirkwood-player-cards";

import { khazadPlayerAllyEntered } from "./khazad-player-cards";

import {
  elfAllyEntered,
  elfEncounterRevealed,
  elfCharactersLeft,
} from "./elf-player-cards";

export type ThreatReason =
  | "quest-failure"
  | "encounter"
  | "quest-card"
  | "framework"
  | "player-card"
  | "cost";
export function raiseThreat(
  s: GameState,
  amount: number,
  reason: ThreatReason,
) {
  if (amount <= 0) return;
  s.threat += amount;
  marshPlayerThreatRaised(s, activeSeat(s), amount, reason);
  roadPlayerThreatRaised(s, activeSeat(s), amount);
  heirsThreatRaised(s, activeSeat(s), amount);
  ringMakerThreatRaised(s, amount, reason);
}
/** Framework and card effects share actual exhaustion timing. */
export function exhaustCharacter(s: GameState, u: Unit): boolean {
  syncAttachmentText(s, u);
  if (u.exhausted || khazadCannotExhaust(u) || watcherWaterCannotExhaust(u))
    return false;
  u.exhausted = true;
  watcherPlayerCharacterExhausted(s, u);
  redhornCharacterExhausted(s, u);
  roadRivendellCharacterExhausted(s, u);
  stewardFearCharacterExhausted(s, u);
  return true;
}
/** Every addition to staging shares the response timing, including a return from engagement. */
export function enemyAddedToStaging(s: GameState, u: Unit) {
  Weather.weatherOrcAdded(s, u);
  amonPlayerEnemyAddedToStaging(s, u);
  heirsPlayerEnemyAddedToStaging(s, u);
  bloodPlayerEnemyAddedToStaging(s, u);
  longDarkPlayerEnemyAddedToStaging(s, u);
}

/** Responses to actual commitments, including commitments caused by card effects. */
export function charactersCommitted(
  s: GameState,
  committed: Unit[],
  exhaustedIds: string[] = [],
) {
  const actual = committed.filter(
    (u) => u.committed && allCharacters(s).some((c) => c.id === u.id),
  );
  shadowFlameCharactersCommitted(s, actual);
  foundationsCharactersCommitted(s, actual);
  dwarfCharactersCommitted(s, actual);
  elfCharactersCommitted(s, actual);
  rohanCharactersCommitted(s, actual);
  foundationsPlayerCharactersCommitted(s, actual, exhaustedIds);
  // Preserve the Core response order so Théodred can fund Aragorn's ready cost.
  for (const u of [
    ...actual.filter((u) => u.code === "01002"),
    ...actual.filter((u) => u.code !== "01002"),
  ]) {
    if (u.blanked) continue;
    const player = ownerOf(s, u);
    if (u.code === "01002" && !isSacked(u))
      enqueue(s, fx("theodred", { player }));
    if (u.code === "01001" && !isSacked(u))
      enqueue(s, fx("aragorn", { player }));
    if (u.code === "01044" && allActiveLocations(s).length)
      enqueue(
        s,
        fx("activeLocationEffect", {
          text: "locationProgress",
          value: 1,
          player,
        }),
      );
    if (u.code === "01045")
      enqueue(
        s,
        ...s.staging
          .filter((x) => card(x.code).type_code === "location")
          .map((x) =>
            fx("locationProgress", { target: x.id, value: 1, player }),
          ),
      );
  }
  morgulPlayerCharactersCommitted(s, actual);
}

export function readyCharacter(s: GameState, u: Unit) {
  syncAttachmentText(s, u);
  if (cannotReady(u, s)) return;
  const wasExhausted = u.exhausted;
  u.exhausted = false;
  if (wasExhausted) Fangorn.fangornCharacterReadied(s, u);
  if (wasExhausted) marshPlayerCharacterReadied(s, u);
  if (wasExhausted) stewardFearCharacterReadied(s, u);
}
/** Move actual top cards atomically; deck-discard responses run after the causing effect. */
export function discardPlayerDeck(
  s: GameState,
  count: number,
  player = activeSeat(s),
  offerResponses = true,
): string[] {
  const discarded: string[] = [];
  forOwner(s, player, () => {
    for (let i = 0; i < Math.max(0, count) && s.deck.length; i++) {
      const u = takePlayerDeck(s);
      forOwner(s, u.owner ?? player, () => {
        s.discard.push(u.code);
        foundationsPlayerCardDiscarded(s, u);
      });
      discarded.push(u.code);
    }
  });
  if (offerResponses) dwarfDeckDiscarded(s, discarded, player);
  return discarded;
}
/** Preserve an event's physical phase identity across discard and recovery. */
export function discardHandCard(s: GameState, id: string): Unit {
  const index = s.hand.findIndex((u) => u.id === id);
  requireRule(index >= 0, "That physical card must remain in your hand.");
  if (!canLeaveHand(s.hand[index])) return s.hand[index];
  const u = s.hand.splice(index, 1)[0];
  ringMakerCharacterLeft(s, u.id);
  forOwner(s, u.owner ?? activeSeat(s), () => {
    s.discard.push(u.code);
    foundationsPlayerCardDiscarded(s, u);
  });
  return u;
}
export function takePlayerDiscard(s: GameState, index: number): Unit {
  requireRule(
    index >= 0 && index < s.discard.length,
    "Choose an actual card in your discard pile.",
  );
  const identity = foundationsPlayerDiscardTaken(s, index),
    u = make(s, s.discard.splice(index, 1)[0]);
  if (identity) u.id = identity;
  return u;
}

export function advanceDefense(s: GameState) {
  if (s.phase !== "defense" || s.combat || s.weatherHills?.advancing) return;
  if (
    s.queue.some(
      (e) =>
        [
          "khazadRepeatAttack",
          "chetAttackEffects",
          "chetAttackFinished",
          "combatStartEffects",
          "prepareCombat",
          "bloodTurnAll",
          "bloodTurn",
          "bloodFaceup",
          "immediateAttack",
        ].includes(e.kind) ||
        (e.kind === "startCombat" && e.flag),
    )
  )
    return;
  const next = globalPlayerOrder(s).find((i) =>
    engagedEnemies(seatView(s, i), i).some(
      (u) =>
        normalAttackPending(seatView(s, i), u, i) &&
        !enemyAttackPrevented(seatView(s, i), u, i),
    ),
  );
  if (next !== undefined) {
    if (s.table) {
      s.table.turn = next;
      if (!s.choice) selectSeat(s, next);
    }
  } else {
    if (Realm.realmEmptyCombatWindow(s)) return;
    startPhase(s, "attack");
    [
      ...globalEngaged(s),
      ...s.staging.filter((u) =>
        playerOrder(s).some((p) => consideredEngaged(s, u, p)),
      ),
    ].forEach((u) => {
      u.attacked = false;
    });
    const later = globalPlayerOrder(s).filter(
      (i) => !rohanOathPlayers(seatView(s, i)).includes(i),
    );
    if (!later.length) enqueue(s, fx("phaseEnd"), fx("endCombat"));
    else if (s.table) {
      s.table.turn = later[0];
      selectSeat(s, later[0]);
    }
  }
}

export function check(s: GameState) {
  if (s.status !== "playing") return;
  eachArea(s, () => syncAttachmentText(s));
  finalRingFollowFirst(s);
  globalEachSeat(s, () => {
    for (const denethor of amonPlayerDiscardAtZero(s))
      if (get(s, denethor.id)) discardCharacter(s, denethor);
  });
  if (s.status !== "playing") return;
  const activeQuests = new Set(
    globalPlayerOrder(s).map((player) => mainQuestCode(seatView(s, player))),
  );
  for (const [code, attachments] of Object.entries(s.questAttachments ?? {})) {
    if (activeQuests.has(code)) continue;
    const host = {
      ...mainQuestUnit(s)!,
      id: `quest:${code}`,
      code,
      attachments,
    };
    for (const a of [...attachments]) discardAttachment(s, host, a);
    delete s.questAttachments![code];
  }
  rhosgobelCheck(s);
  returnMirkwoodCheck(s);
  deadMarshesCheck(s);
  redhornCheck(s);
  roadRivendellCheck(s);
  if (s.status !== "playing") return;
  Trials.trialsDiscardedKeys(s);
  if (s.prisoner) {
    const p = seatView(s, s.prisoner.owner ?? 0);
    if (
      p.threat >= 50 ||
      (!p.heroes.length && p.startingHeroes.some((h) => h !== s.prisoner!.code))
    ) {
      s.status = "lost";
      s.reason =
        "The prisoner's fellowship has been eliminated. The prisoner cannot be rescued.";
      s.choice = null;
      s.queue = [];
      log(s, s.reason, "danger");
      return;
    }
  }
  globalEachSeat(s, () => {
    s.committedIds = s.committedIds.filter((id) =>
      characters(s).some((u) => u.id === id && !u.exhausted),
    );
  });
  if (
    ["quest", "staging"].includes(s.phase) &&
    !s.encounterDeck.length &&
    s.encounterDiscard.length
  ) {
    s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
    log(s, "The empty encounter deck is refilled during the quest phase.");
  }
  let doomed: { unit: Unit; player: number } | undefined;
  eachArea(s, () => {
    if (doomed) return;
    const unit = [
      ...allCharacters(s),
      ...allEngaged(s),
      ...s.staging.filter((u) => card(u.code).type_code === "enemy"),
    ].find(
      (u) =>
        !shadowFlameIndestructible(u) &&
        !DunlandQuest.dunlandCannotLeave(u) &&
        !Trials.trialsCannotLeave(s, u) &&
        u.damage >= stats(s, u).health,
    );
    if (unit) doomed = { unit, player: activeSeat(s) };
  });
  if (doomed) {
    const target = doomed;
    forOwner(s, target.player, () => destroy(s, target.unit));
    return;
  }
  if (s.table) {
    globalEachSeat(s, (i) => {
      if (
        s.threat < threatElimination(s) &&
        (s.heroes.length ||
          s.prisoner?.owner === i ||
          foundationsHeroMissingAllowed(s, i))
      )
        return;
      if (s.table!.seats[i].eliminated) return;
      for (const host of [
        ...s.staging,
        ...allEngaged(s),
        ...allActiveLocations(s),
        ...(mainQuestUnit(s) ? [mainQuestUnit(s)!] : []),
      ]) {
        for (const a of [...host.attachments]) {
          if (
            card(a.code).sphere_code !== "encounter" &&
            attachmentController(s, host, a) === i
          )
            discardAttachment(s, host, a, true);
        }
        if (host.id.startsWith("quest:"))
          (s.questAttachments ??= {})[host.code] = host.attachments;
      }
      const traps = s.staging.filter(
        (u) => card(u.code).sphere_code !== "encounter" && ownerOf(s, u) === i,
      );
      for (const trap of traps) {
        s.staging = s.staging.filter((u) => u.id !== trap.id);
        seatView(s, trap.owner!).discard.push(trap.code);
      }
      Osgiliath.assaultOsgiliathPlayerEliminated(s, i);
      BloodQuest.bloodGondorEliminated(s, i);
      Catch.catchPlayerEliminated(s, i);
      Chetwood.chetwoodPlayerEliminated(s, i);
      s.table!.seats[i].eliminated = true;
      log(
        s,
        `${seatName(s, i)} is eliminated. The remaining heroes continue.`,
        "danger",
      );
      const leavingCharacters = [...s.heroes, ...s.allies];
      for (const u of leavingCharacters) {
        for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
        (hasEncounterKeyword(card(u.code))
          ? seatView(s, u.owner ?? i).removed
          : card(u.code).type_code === "objective-ally"
            ? s.encounterDiscard
            : seatView(s, u.owner ?? i).discard
        ).push(u.code);
        if (card(u.code).type_code === "hero")
          s.fallenThreat += card(u.code).threat ?? 0;
      }
      if (
        s.allies.some((u) => u.code === "rc135") &&
        s.campaign &&
        s.scenarioId !== "dol-guldur"
      ) {
        s.status = "lost";
        s.reason = "Mendor has left play. The campaign quest is lost.";
      }
      for (const u of s.hand) {
        seatView(s, u.owner ?? i).discard.push(u.code);
        ringMakerCharacterLeft(s, u.id);
      }
      while (s.deck.length) {
        const u = takePlayerDeck(s);
        seatView(s, u.owner ?? i).discard.push(u.code);
      }
      s.heroes = [];
      s.allies = [];
      s.hand = [];
      s.deck = [];
      s.used = s.used.filter(
        (key) =>
          !key.startsWith("phase:heavy-") &&
          !key.startsWith("game:foundations-hero-deck:"),
      );
      s.committedIds = [];
      for (const u of s.engaged) {
        s.encounterDiscard.push(...u.shadows);
        u.shadows = [];
        delete u.faceupShadows;
        u.revealedShadowCount = 0;
        delete u.shadowCancelsDamage;
        delete u.shadowCancelsCombatDamage;
        u.attacked = false;
        s.staging.push(u);
        enemyAddedToStaging(s, u);
      }
      s.engaged = [];
      for (const u of leavingCharacters) {
        ringMakerCharacterLeft(s, u.id);
        druadanPlayerLeavesPlay(s, u);
        Isengard.isengardCharacterLeft(s, u);
        Amon.amonDinCharacterLeftPlay(s, u);
        BloodQuest.bloodGondorCharacterLeft(s, u);
        Osgiliath.assaultOsgiliathCharacterLeft(s);
      }
      if (s.choice && activeSeat(s) === i) s.choice = null;
    });
    const alive = globalLivingSeats(s);
    if (!alive.length) {
      s.status = "lost";
      s.reason = "Every hero’s fellowship has fallen to the shadow.";
    } else {
      if (!alive.includes(s.table.first))
        s.table.first = globalPlayerOrder(s)[0];
      if (!alive.includes(s.table.turn))
        s.table.turn =
          globalPlayerOrder(s).find((i) => !s.table!.passed.includes(i)) ??
          alive[0];
      if (s.table.seats[s.table.active].eliminated) selectSeat(s, s.table.turn);
    }
  } else if (
    s.threat >= threatElimination(s) ||
    (!s.heroes.length && !s.prisoner && !foundationsHeroMissingAllowed(s, 0))
  ) {
    s.status = "lost";
    s.reason =
      s.threat >= threatElimination(s)
        ? `Your threat reached ${threatElimination(s)}. The shadow has found you.`
        : "The last hero has fallen.";
  }
  if (s.status === "lost") {
    s.choice = null;
    s.queue = [];
    delete s.escapeTest;
    log(s, s.reason, "danger");
  } else {
    deadMarshesCheck(s);
    // Elimination can remove the final Clue as well as ordinary damage/discard.
    if (
      s.scenarioId === "hunt-for-gollum" &&
      s.stage === 3 &&
      !allHeroes(s).some(hasClue)
    ) {
      s.stage = 2;
      s.progress = 0;
      log(
        s,
        "No hero holds a Clue. The trail is lost and the quest returns to stage 2.",
        "danger",
      );
    }
    if (s.earlyAttackPlayers) {
      s.earlyAttackPlayers = s.earlyAttackPlayers.filter((i) =>
        globalLivingSeats(s).includes(i),
      );
      if (!s.earlyAttackPlayers.length) {
        delete s.earlyAttackPlayers;
        startPhase(s, "defense");
      } else if (s.table && !s.earlyAttackPlayers.includes(s.table.turn)) {
        s.table.turn = s.earlyAttackPlayers[0];
        selectSeat(s, s.table.turn);
      }
    }
    followFirstPlayer(s);
    redhornFollowFirstPlayer(s);
    roadRivendellFollowFirstPlayer(s);
    longDarkCheck(s);
    foundationsCheck(s);
    heirsCheck(s);
    stewardFearCheck(s);
    Amon.amonDinCheck(s);
    BloodQuest.bloodGondorCheck(s);
    MorgulQuest.morgulValeCheck(s);
    Fords.fordsCheck(s);
    Catch.catchCheck(s);
    Fangorn.fangornCheck(s);
    DunlandQuest.dunlandCheck(s);
    Trials.trialsCheck(s);
    Tharbad.tharbadCheck(s);
    Celebrimbor.celebrimborCheck(s);
    Antlered.antleredCheck(s);
    Chetwood.chetwoodCheck(s);
    Weather.weatherCheck(s);
    const overloaded = globalCharacters(s).find(
      (u) => restrictedSlots(u) > restrictedLimit(u),
    );
    if (overloaded) {
      if (!s.choice) restrictAttachments(s, overloaded);
      syncSeat(s);
      return;
    }
    advanceDefense(s);
    advanceQuest(s);
  }
  syncSeat(s);
}

export function win(s: GameState) {
  if (s.status !== "playing") return;
  s.status = "won";
  s.reason =
    s.scenarioId === "the-weather-hills"
      ? "The Orc counter-attack is broken. Your fellowship survives the storm and clears Amon Forn."
      : s.scenarioId === "intruders-in-chetwood"
        ? "The Orc War Parties are defeated. Iârion and the Rangers keep Bree-land safe."
        : s.scenarioId === "the-antlered-crown"
          ? "The Raven Chief is defeated. Chief Turch unites the clans beneath the Antlered Crown."
          : s.scenarioId === "celebrimbors-secret"
            ? "Bellach is defeated. Your fellowship recovers Celebrimbor’s Mould and escapes the ruins of Ost-in-Edhil."
            : s.scenarioId === "the-nin-in-eilph"
              ? "The Ancient Marsh-dweller falls. Your fellowship and Nalir escape the shifting swamp."
              : s.scenarioId === "trouble-in-tharbad"
                ? "Your heroes and Nalir cross the ruined bridge and escape Tharbad with the map."
                : s.scenarioId === "the-three-trials"
                  ? "The three trials are complete. Your fellowship retrieves the Antlered Crown from the Hallowed Circle."
                  : s.scenarioId === "the-dunland-trap"
                    ? "Your heroes survive Chief Turch's final assault. The Dunland trap is broken."
                    : s.scenarioId === "the-druadan-forest"
                      ? "Drû-buri-Drû accepts your fellowship's peaceful intentions. The Woses let you pass through their forest."
                      : s.scenarioId === "encounter-at-amon-din"
                        ? "Ghulat is defeated. Your fellowship has rescued more villagers than the raiders killed."
                        : s.scenarioId === "assault-on-osgiliath"
                          ? "Your fellowships hold every Osgiliath location in play. The ruined city is reclaimed."
                          : s.scenarioId === "mirkwood"
                            ? "Your fellowship has passed safely through Mirkwood."
                            : s.scenarioId === "anduin"
                              ? "The ambush is broken. Your fellowship reaches the shores of Lórien."
                              : s.scenarioId === "hunt-for-gollum"
                                ? "You have found a true sign of Gollum’s passing. The trail leads on."
                                : s.scenarioId === "conflict-at-the-carrock"
                                  ? "The Trolls are defeated and the Carrock is free."
                                  : s.scenarioId === "hills-of-emyn-muil"
                                    ? "Your fellowship has explored Emyn Muil and collected at least 20 victory points."
                                    : s.scenarioId === "journey-to-rhosgobel"
                                      ? "Wilyador's wounds are healed. The Eagle survives your return to Rhosgobel."
                                      : s.scenarioId === "dead-marshes"
                                        ? "Your fellowship captures Gollum in the Dead Marshes."
                                        : s.scenarioId === "return-to-mirkwood"
                                          ? "Gollum arrives safely at Thranduil’s halls and the ambush is defeated."
                                          : s.scenarioId === "road-to-rivendell"
                                            ? "Arwen arrives safely in Rivendell with your fellowship."
                                            : s.scenarioId === "redhorn-gate"
                                              ? "Your fellowship escorts Arwen across Caradhras and through the snowbound pass."
                                              : s.scenarioId === "into-the-pit"
                                                ? "Your fellowship survives the depths beneath the East-gate of Moria."
                                                : s.scenarioId ===
                                                    "the-seventh-level"
                                                  ? "Your fellowship reaches the Seventh Level and uncovers the fate of Balin."
                                                  : s.scenarioId ===
                                                      "flight-from-moria"
                                                    ? "Your fellowship finds an exit and escapes the darkness of Moria."
                                                    : "The prisoner is free, the Nazgûl defeated, and your fellowship has escaped Dol Guldur.";
  s.choice = null;
  s.queue = [];
  delete s.escapeTest;
  if (s.campaign) resolveCampaign(s);
  log(s, `Victory! ${s.reason}`, "chapter");
}

/** Record a physical card moved into the shared victory display. */
export function addVictoryCard(s: GameState, code: string) {
  s.victoryCards ??= [];
  s.victoryCards.push(code);
  s.victory += card(code).victory ?? 0;
  if (s.khazad) s.khazad.victoryCards.push(code);
}

export function damage(
  s: GameState,
  id: string,
  value: number,
  context: import("./damage-context").DamageContext = {},
): boolean {
  syncAttachmentText(s);
  const u = get(s, id);
  if (
    !u ||
    Trials.trialsCannotDamage(s, u) ||
    Antlered.antleredCannotDamage(s, u) ||
    Chetwood.chetwoodCannotDamage(s, u)
  )
    return false;
  if (!context.cost && MorgulQuest.morgulRedirectDamage(s, u, value, context))
    return false;
  value = MorgulQuest.morgulDamageAmount(s, u, heirsDamageAmount(s, u, value));
  if (value <= 0) return false;
  if (
    value > 0 &&
    (u.roundCannotTakeDamage ||
      u.shadowCancelsDamage ||
      (context.combatDamage && u.shadowCancelsCombatDamage))
  )
    return false;
  if (khazadDamageCancelled(s, u, value)) return false;
  if (!context.cost && offerGondorianDiscipline(s, u, value, context))
    return false;
  if (!context.cost && offerCloseCall(s, u, value, context)) return false;
  if (!context.cost && offerMarshDamageRedirect(s, u, value, context))
    return false;
  if (
    !context.cost &&
    !context.bypassDori &&
    dwarfDamageAssigned(s, u, value, context)
  )
    return false;
  if (
    !context.cost &&
    !context.bypassFrodo &&
    offerFrodoDamage(s, u, value, context)
  )
    return false;
  u.damage += value;
  syncAttachmentText(s, u);
  Fangorn.fangornDamageTaken(s, u);
  finalRingDamageTaken(s, u);
  Druadan.druadanForestDamageDealt(s, u, value);
  heirsDamageDealt(s, u, value, context);
  longDarkDamageDealt(s, context.enemyId, value);
  if (value > 0 && s.combat && context.enemyId === s.combat.enemyId)
    s.combat.damageDealt = (s.combat.damageDealt ?? 0) + value;
  if (
    u.code === "01003" &&
    !u.blanked &&
    canGainResources(s, u) &&
    u.damage < stats(s, u).health
  ) {
    stewardFearHeroAbilityTriggered(s, u);
    u.resources += value;
    gondorResourcesGained(s, u, value, true);
  }
  log(s, `${name(u)} takes ${value} damage.`, value > 1 ? "danger" : "normal");
  // Signs of Gollum: a damaged bearer returns the clue to the top of the encounter deck.
  if (value > 0 && card(u.code).type_code === "hero")
    for (const a of [...u.attachments].filter(
      (a) => !a.blanked && a.code === CLUE,
    ))
      discardAttachment(s, u, a, true);
  if (card(u.code).type_code !== "location" && u.damage >= stats(s, u).health) {
    stewardFearCharacterDestroyed(s, u, context);
    Amon.amonDinCharacterDestroyed(s, u, context);
    BloodQuest.bloodGondorCharacterDestroyed(s, u, context);
    MorgulQuest.morgulCharacterDestroyed(s, u, context);
    Fords.fordsCharacterDestroyed(s, u, context);
    Catch.catchCharacterDestroyed(s, u, context);
    Trials.trialsCharacterDestroyed(s, u, context);
    Nin.ninCharacterDestroyed(s, u, context);
    Celebrimbor.celebrimborCharacterDestroyed(s, u, context);
    Antlered.antleredCharacterDestroyed(s, u, context);
    Chetwood.chetwoodCharacterDestroyed(s, u, context);
    Weather.weatherCharacterDestroyed(s, u, context);
    Osgiliath.assaultOsgiliathCharacterDestroyed(s, u, context);
    destroy(s, u);
  }
  check(s);
  return true;
}

export function discardAttachment(
  s: GameState,
  u: Unit,
  a: Attachment,
  leaving = false,
) {
  if (!leaving && card(a.code).text?.includes("Permanent")) return;
  Catch.catchAttachmentLeaves(s, u, a, leaving);
  u.attachments = u.attachments.filter((x) => x.id !== a.id);
  if (u.id.startsWith("quest:"))
    (s.questAttachments ??= {})[u.code] = u.attachments;
  syncAttachmentText(s);
  if (Celebrimbor.celebrimborAttachmentLeaves(s, u, a, leaving)) return;
  if (Trials.trialsAttachmentLeaves(s, a)) return;
  if (khazadAttachmentLeaves(s, u, a)) return;
  if (heirsAttachmentLeaves(s, u, a)) return;
  if (a.code === CLUE && leaving) {
    s.encounterDeck.unshift(a.code);
    log(
      s,
      `Signs of Gollum returns to the top of the encounter deck from ${name(u)}.`,
      "danger",
    );
    return;
  }
  if (OBJECTIVES.includes(a.code)) {
    s.staging.push(make(s, a.code));
    log(s, `${card(a.code).name} returns to staging, unclaimed.`);
    return;
  }
  (card(a.code).sphere_code === "encounter"
    ? s.encounterDiscard
    : seatView(s, a.owner ?? ownerOf(s, u)).discard
  ).push(a.code);
  log(s, `${card(a.code).name} is discarded from ${name(u)}.`);
}

/** Notify actual leaves of play with a precise physical destination, independently of destruction. */
export function characterLeftPlay(
  s: GameState,
  u: Unit,
  controller: number,
  destination: LeaveDestination,
  lastKnownAttack = stats(s, u).attack,
  lastKnownTraits = effectiveTraits(u),
) {
  if (!hasEncounterKeyword(card(u.code)))
    Celebrimbor.celebrimborCharacterLeft(s, u, destination);
  Tharbad.tharbadCharacterLeft(s, u, controller);
  ringMakerCharacterLeft(s, u.id);
  // A later entry starts a new instance even when its physical card keeps its id.
  globalEachSeat(s, () => {
    const targetEffects = [
      `phase:forth-eorlingas:${u.id}`,
      `phase:against-shadow:${u.id}`,
      `phase:mutual:Gondor:${u.id}`,
      `phase:mutual:Rohan:${u.id}`,
      `round:durin-song:${u.id}`,
      `round:beacons:${u.id}`,
      `phase:unseen-strike:${u.id}`,
      `round:miruvor:${u.id}`,
      `round:harbor-master:${u.id}`,
      `round:hirgon:${u.id}`,
      `round:captain:${u.id}`,
      `round:celeborn:${u.id}`,
      `round:naith-guide:${u.id}`,
      `round:elf-entered:${u.id}`,
    ];
    s.used = s.used.filter(
      (key) =>
        !targetEffects.includes(key) &&
        ![
          `round:arwen:${u.id}:`,
          `round:grave-cairn:${u.id}:`,
          `phase:nenya:${u.id}:`,
        ].some((prefix) => key.startsWith(prefix)),
    );
  });
  returnMirkwoodCheck(s);
  rhosgobelCheck(s);
  redhornCheck(s);
  roadRivendellCheck(s);
  if (s.status !== "playing") return;
  rohanCharactersLeft(s, [u], controller, lastKnownTraits);
  watcherPlayerLeavesPlay(s, u, controller, lastKnownAttack);
  expansionLeavesPlay(s, u, controller);
  roadPlayerLeavesPlay(s, u, controller);
  gondorLeavesPlay(s, u, controller);
  emynPlayerLeavesPlay(s, u, controller);
  elfCharactersLeft(s, [u], controller);
  mirkwoodPlayerLeavesPlay(s, u, controller, destination);
  prepend(s, ...shadowFlameCharactersLeft(s));
  druadanPlayerLeavesPlay(s, u);
  heirsCharacterLeaves(s, u);
  Isengard.isengardCharacterLeft(s, u);
  Amon.amonDinCharacterLeftPlay(s, u);
  BloodQuest.bloodGondorCharacterLeft(s, u);
  Osgiliath.assaultOsgiliathCharacterLeft(s);
}

/** Destruction is distinct from discard costs and forced discard effects. */
export function destroy(
  s: GameState,
  u: Unit,
  destruction = true,
  destination: "discard" | "removed" = "discard",
) {
  syncAttachmentText(s);
  if (DunlandQuest.dunlandCannotLeave(u) || Trials.trialsCannotLeave(s, u))
    return;
  if (destruction && shadowFlameIndestructible(u)) return;
  if (!destruction && MorgulQuest.morgulCannotLeave(s, u)) return;
  const previous = activeSeat(s);
  const lastKnownAttack = stats(s, u).attack;
  const lastKnownTraits = effectiveTraits(u);
  const lastAttachments = [...u.attachments];
  selectSeat(s, ownerOf(s, u));
  const c = card(u.code);
  if (hasEncounterKeyword(c)) destination = "removed";
  if (destruction && ["ally", "objective-ally", "hero"].includes(c.type_code)) {
    for (const h of allHeroes(s))
      for (const a of h.attachments)
        if (!a.blanked && a.code === "01042" && canGainResources(s, h)) {
          h.resources++;
          gondorResourcesGained(s, h, 1, true);
        }
  }
  if (["ally", "objective-ally", "hero"].includes(c.type_code)) {
    raiseThreat(
      s,
      characters(s).reduce(
        (n, h) =>
          n +
          h.attachments.filter((a) => !a.blanked && a.code === "rc138").length,
        0,
      ),
      "encounter",
    );
  }
  for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
  if (c.type_code === "enemy") {
    s.staging = s.staging.filter((x) => x.id !== u.id);
    s.engaged = s.engaged.filter((x) => x.id !== u.id);
    s.encounterDiscard.push(...u.shadows);
    if (u.facedownCard)
      forOwner(s, u.owner ?? activeSeat(s), () => {
        s.discard.push(u.facedownCard!);
        if (u.facedownCardId)
          foundationsPlayerCardDiscarded(s, {
            ...u,
            id: u.facedownCardId,
            code: u.facedownCard!,
          });
      });
    else if (u.code === "01115") {
      s.encounterDeck.push(u.code);
      shuffle(s, s.encounterDeck);
    } else if (c.victory) addVictoryCard(s, u.code);
    else if (
      !Tharbad.tharbadEnemyDestroyed(s, u, destruction) &&
      !Catch.catchEnemyDefeated(s, u, destruction) &&
      !(s.combat?.returnWolf && s.combat.enemyId === u.id)
    )
      s.encounterDiscard.push(u.code);
    if (destruction) Realm.realmEnemyDestroyed(s, u, lastAttachments);
    if (destruction) Weather.weatherEnemyDefeated(s, u);
    Antlered.antleredRoutePiles(s);
    if (u.code === "01102") s.nazgulDefeated = true;
    if (u.code === "01082" && s.campaign && s.scenarioId === "anduin")
      enqueue(
        s,
        ...playerOrder(s).map((player) =>
          fx("earnPermanent", { code: "rc133", player }),
        ),
      );
    log(s, `${c.name} is defeated.`, "good");
    carrockDefeated(s, u);
    if (destruction) Osgiliath.assaultOsgiliathEnemyDefeated(s);
    if (destruction) MorgulQuest.morgulEnemyDestroyed(s, u);
    Nin.ninEnemyDefeated(s, u, destruction);
    if (
      s.scenarioId === "mirkwood" &&
      s.stage === 3 &&
      s.branch === "spider" &&
      u.code === "01076"
    )
      win(s);
  } else {
    const removedByScenario = heirsRemoveCharacter(s, u);
    s.heroes = s.heroes.filter((x) => x.id !== u.id);
    s.allies = s.allies.filter((x) => x.id !== u.id);
    if (destination === "removed")
      seatView(s, u.owner ?? activeSeat(s)).removed.push(u.code);
    else if (u.code === "rc135") {
      s.removed.push(u.code);
      if (s.campaign && s.scenarioId !== "dol-guldur") {
        s.status = "lost";
        s.reason = "Mendor has left play. The campaign quest is lost.";
        s.choice = null;
        s.queue = [];
      }
    } else if (!removedByScenario)
      (c.type_code === "objective-ally"
        ? s.encounterDiscard
        : seatView(s, u.owner ?? activeSeat(s)).discard
      ).push(u.code);
    if (c.type_code === "hero") s.fallenThreat += c.threat ?? 0;
    log(
      s,
      destruction
        ? `${c.name} has fallen.`
        : destination === "removed"
          ? `${c.name} is removed from the game.`
          : `${c.name} is discarded from play.`,
      "danger",
    );
    const physicalOwner = u.owner ?? activeSeat(s),
      physical = seatView(s, physicalOwner);
    characterLeftPlay(
      s,
      u,
      activeSeat(s),
      {
        zone:
          u.code === "rc135" || destination === "removed"
            ? "removed"
            : "discard",
        player: physicalOwner,
        index:
          (u.code === "rc135" || destination === "removed"
            ? physical.removed
            : physical.discard
          ).length - 1,
      },
      lastKnownAttack,
      lastKnownTraits,
    );
    if (destruction) rhosgobelCharacterDestroyed(s, u, activeSeat(s));
    if (destruction) dunlandFallResponses(s, u, lastAttachments, activeSeat(s));
    if (["ally", "objective-ally"].includes(c.type_code))
      enqueue(s, fx("valiant"));
    if (c.type_code === "hero" && c.traits?.includes("Dwarf"))
      enqueue(s, fx("brok"));
  }
  DunlandQuest.dunlandCharacterDestroyed(s, u, destruction);
  syncSeat(s);
  selectSeat(s, previous);
  check(s);
}

export const discardCharacter = (s: GameState, u: Unit) => destroy(s, u, false);

export function progressLocation(s: GameState, u: Unit, value: number) {
  if (Trials.trialsRedirectProgress(s, value, u)) return;
  if (Tharbad.tharbadLocationBlocked(s, u)) return;
  if (Catch.catchLocationProgressBlocked(s, u)) return;
  if (heirsLocationProgressBlocked(s, u)) return;
  if (shadowFlameLocationProgressBlocked(s, u)) return;
  if (longDarkProgressLocation(s, u, value)) return;
  if (watcherWaterProgressLocation(s, u, value)) return;
  value = Math.min(
    Math.max(0, value),
    watcherWaterProgressCapacity(s, u) ?? Infinity,
  );
  u.progress += value;
  watcherWaterProgressPlaced(s, u, value);
  roadRivendellProgressPlaced(s, u, value);
  Celebrimbor.celebrimborProgressPlaced(s, u, value);
  if (u.progress < locationQuest(s, u)) return;
  log(s, `${name(u)} is explored.`, "good");
  const wasActive = allActiveLocations(s).some((l) => l.id === u.id);
  if (wasActive) removeActiveLocation(s, u.id);
  else s.staging = s.staging.filter((x) => x.id !== u.id);
  const captured = Osgiliath.assaultOsgiliathCapture(s, u);
  let exploredDiscardIndex: number | undefined;
  if (!captured) {
    if (u.code === "01113") s.encounterDeck.unshift(u.code);
    else if (card(u.code).victory) addVictoryCard(s, u.code);
    else {
      s.encounterDiscard.push(u.code);
      exploredDiscardIndex = s.encounterDiscard.length - 1;
    }
  }
  const exploredAttachments = [...u.attachments];
  stewardFearLocationLeft(s, u, true, wasActive);
  Amon.amonDinLocationLeft(s, u, true);
  BloodQuest.bloodGondorExplored(s, u);
  Catch.catchExplored(s, u);
  Weather.weatherExplored(s, u, wasActive);
  DunlandQuest.dunlandExplored(s, u);
  Tharbad.tharbadExplored(s, u);
  Nin.ninExplored(s, u);
  MorgulQuest.morgulExplored(s, u);
  foundationsLocationExplored(s, u);
  heirsExplored(s, u);
  khazadExplored(s, u);
  rhosgobelLocationExplored(s, u);
  if (!captured) for (const a of [...u.attachments]) discardAttachment(s, u, a);
  heirsPlayerLocationExplored(s, u, exploredDiscardIndex);
  collectorLocationExplored(s, u, exploredAttachments);
  ringMakerLocationExplored(s);
  rhosgobelExplored(s, u);
  returnMirkwoodExplored(s, u);
  if (u.code === "01078")
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("mountainReward", { player })),
    );
}

export function progress(
  s: GameState,
  n: number,
  playerEffect = false,
  fromSuccessfulQuest = false,
) {
  if (n <= 0 || s.status !== "playing") return;
  if (
    Trials.trialsRedirectProgress(
      s,
      n,
      undefined,
      playerEffect,
      fromSuccessfulQuest,
    )
  )
    return;
  const allLocations = allActiveLocations(s);
  const locations = allLocations.filter(
    (l) => !playerEffect || !playerCardImmune(l),
  );
  if (playerEffect && allLocations.length && !locations.length) {
    log(s, "The active location is immune to this progress effect.");
    return;
  }
  if (locations.some((l) => shadowFlameLocationProgressBlocked(s, l))) return;
  if (locations.length > 1) {
    const remaining = (l: Unit) =>
      Math.max(
        0,
        watcherWaterProgressCapacity(s, l) ?? locationQuest(s, l) - l.progress,
      );
    const total = locations.reduce((sum, l) => sum + remaining(l), 0);
    if (n > 0 && n < total) {
      selectSeat(s, firstPlayer(s));
      choose(
        s,
        "Divide progress between active locations",
        locations.flatMap((l) =>
          Array.from({ length: Math.min(n, remaining(l)) }, (_, i) => ({
            id: `${l.id}:${i + 1}`,
            label: `${name(l)} · ${i + 1} progress`,
            code: l.code,
            effects: [
              fx("allocateActiveProgress", {
                target: l.id,
                value: i + 1,
                count: n - i - 1,
                flag: playerEffect,
                text: fromSuccessfulQuest ? "quest" : undefined,
                player: firstPlayer(s),
              }),
            ],
          })),
        ),
        "Both locations buffer the quest. The first player chooses where to place this progress.",
      );
      return;
    }
    for (const l of locations) {
      const amount = remaining(l);
      if (
        longDarkProgressLocation(s, l, amount, [
          fx("continueProgress", {
            value: n - amount,
            flag: playerEffect,
            text: fromSuccessfulQuest ? "quest" : undefined,
            player: firstPlayer(s),
          }),
        ])
      )
        return;
      progressLocation(s, l, amount);
      n -= amount;
    }
  }
  if (locations.length === 1) {
    const location = locations[0];
    const toLocation = Math.min(
      n,
      watcherWaterProgressCapacity(s, location) ??
        locationQuest(s, location) - location.progress,
    );
    if (
      longDarkProgressLocation(s, location, toLocation, [
        fx("continueProgress", {
          value: n - toLocation,
          flag: playerEffect,
          text: fromSuccessfulQuest ? "quest" : undefined,
          player: firstPlayer(s),
        }),
      ])
    )
      return;
    progressLocation(s, location, toLocation);
    n -= toLocation;
  }
  if (
    !selectedSideQuest(s) &&
    fromSuccessfulQuest &&
    s.catchOrc?.cancelQuestProgress
  )
    return;
  if (
    n > 0 &&
    fromSuccessfulQuest &&
    !allActiveLocations(s).length &&
    finalRingQuestProgress(s, n)
  )
    return;
  if (
    (playerEffect && allActiveLocations(s).length) ||
    watcherWaterProgressBlocked(s)
  )
    return;
  if (n <= 0 || s.status !== "playing") return;
  if (selectedSideQuest(s)) {
    addCurrentQuestProgress(s, n);
    return;
  }
  if (Catch.catchProgressBlocked(s)) return;
  if (Trials.trialsQuestProgress(s, n)) return;
  if (Tharbad.tharbadQuestProgress(s, n)) return;
  if (s.ninEilph && s.stage === 4) return;
  if (khazadQuestProgress(s, n)) return;
  if (stewardFearQuestProgress(s)) return;
  if (Amon.amonDinQuestProgress(s, n)) return;
  if (["assault-on-osgiliath", "the-morgul-vale"].includes(s.scenarioId))
    return;
  addCurrentQuestProgress(s, n);
  Fangorn.fangornProgressPlaced(s);
  if (s.scenarioId === "dol-guldur" && s.stage === 2 && s.prisoner)
    rescuePrisoner(s);
  advanceQuest(s);
}

/** Leaving a quest discards its attachments; merely advancing does not defeat it. */
export function discardQuestAttachments(
  s: GameState,
  code: string,
  id?: string,
) {
  const host =
    s.staging.find((u) => u.code === code && (!id || u.id === id)) ??
    mainQuestUnit(s);
  if (!host || host.code !== code) return [];
  const attachments = [...host.attachments];
  for (const a of attachments) discardAttachment(s, host, a);
  if (s.questAttachments) delete s.questAttachments[code];
  return attachments;
}
/** Discard physical quest attachments and finish defeat responses before changing stages. */
export function questDefeated(s: GameState, code: string): boolean {
  if (s.pendingQuestDefeat === code) return true;
  const attachments = discardQuestAttachments(s, code);
  if (!attachments.length) return false;
  const before = s.queue.length;
  collectorQuestDefeated(s, code, attachments);
  const responses = s.queue.splice(0, s.queue.length - before);
  if (!responses.length) return false;
  s.pendingQuestDefeat = code;
  prepend(s, ...responses, fx("finishQuestDefeat", { code }));
  return true;
}

export function advanceQuest(s: GameState) {
  if (s.status !== "playing" || s.stageRevealing || s.phase === "setup") return;
  if (Druadan.advanceDruadanForest(s)) return;
  if (Amon.advanceAmonDin(s)) return;
  if (BloodQuest.advanceBloodGondor(s)) return;
  if (MorgulQuest.advanceMorgulVale(s)) return;
  if (Fords.advanceFordsIsen(s)) return;
  if (Catch.advanceCatchOrc(s)) return;
  if (Fangorn.advanceFangorn(s)) return;
  if (DunlandQuest.advanceDunlandTrap(s)) return;
  if (Trials.advanceThreeTrials(s)) return;
  if (Tharbad.advanceTharbad(s)) return;
  if (Nin.advanceNin(s)) return;
  if (Celebrimbor.advanceCelebrimbor(s)) return;
  if (Antlered.advanceAntlered(s)) return;
  if (Chetwood.advanceChetwood(s)) return;
  if (Weather.weatherAdvance(s)) return;
  if (s.scenarioId === "assault-on-osgiliath") return;
  if (advanceHeirs(s)) return;
  if (advanceStewardFear(s)) return;
  if (advanceShadowFlame(s)) return;
  if (advanceFoundationsStone(s)) return;
  if (advanceLongDark(s)) return;
  if (advanceKhazad(s)) return;
  if (advanceWatcherWater(s)) return;
  if (advanceRoadRivendell(s)) return;
  if (advanceRedhorn(s)) return;
  if (advanceCarrock(s)) return;
  if (advanceEmynMuil(s)) return;
  if (advanceRhosgobel(s)) return;
  if (advanceDeadMarshes(s)) return;
  if (advanceReturnMirkwood(s)) return;
  if (s.stage === 3) {
    if (
      s.scenarioId === "anduin" &&
      !s.queue.length &&
      !s.choice &&
      ![...s.staging, ...allEngaged(s)].some(
        (u) => card(u.code).type_code === "enemy",
      )
    )
      win(s);
    else if (
      s.scenarioId === "dol-guldur" &&
      s.progress >= 7 &&
      s.nazgulDefeated &&
      !inPlay(s, "01102")
    )
      win(s);
    else if (
      s.scenarioId === "mirkwood" &&
      s.branch === "beorn" &&
      s.progress >= 10 &&
      !inPlay(s, "01076")
    )
      win(s);
    else if (s.scenarioId === "hunt-for-gollum" && s.progress >= 8) win(s);
    return;
  }
  if (s.progress < mainStageInfo(s).quest) return;
  if (s.scenarioId === "anduin" && s.stage === 1 && inPlay(s, "01082")) return;
  if (
    s.scenarioId === "dol-guldur" &&
    (objectiveCount(s) < (s.stage === 1 ? 1 : 3) ||
      (s.stage === 2 && s.prisoner))
  )
    return;
  if (questDefeated(s, mainQuestCode(s)!)) return;
  const mendor = allCharacters(s).find((u) => u.code === "rc135");
  if (mendor) {
    readyCharacter(s, mendor);
    eachSeat(s, () => draw(s, 1));
    log(
      s,
      "Mendor readies and you draw a card after defeating a quest stage.",
      "good",
    );
  }
  s.stage = (s.stage + 1) as 2 | 3;
  s.progress = 0;
  if (s.stage === 3 && s.scenarioId === "mirkwood") {
    s.branch = random(s) < 0.5 ? "beorn" : "spider";
    if (s.branch === "spider")
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("findSpider", { player })),
      );
  }
  if (s.stage === 3 && s.scenarioId === "anduin") {
    s.stageRevealing = true;
    prepend(
      s,
      ...Array.from({ length: livingSeats(s).length * 2 }, () =>
        fx("reveal", { player: firstPlayer(s) }),
      ),
      fx("stageRevealed"),
    );
  }
  log(s, `A new chapter: ${mainStageInfo(s).name}.`, "chapter");
}

export function phaseEnd(s: GameState) {
  const bloodEffects: Effect[] = [];
  eachArea(s, () => bloodEffects.push(...bloodPlayerPhaseEndEffects(s)));
  const departures = globalCharacters(s)
    .filter((u) => u.temporary || u.beornReturn)
    .map((u) => fx("allyDeparture", { target: u.id, player: ownerOf(s, u) }));
  globalEachSeat(s, () => phaseEndPlayer(s));
  eachArea(s, () => redhornPhaseEnd(s));
  prepend(s, ...bloodEffects, ...departures);
  eachArea(s, () => rohanPhaseEnd(s));
  if (s.bloodGondor) s.bloodGondor.conflict = false;
  eachArea(s, () => heirsPhaseEnd(s));
}

export function phaseEndPlayer(s: GameState) {
  s.faramir = 0;
  s.gondor = false;
  s.questDebuff = 0;
  s.threatModifier = 0;
  s.fog = 0;
  s.standTogether = false;
  s.used = s.used.filter(
    (k) => !k.startsWith("protector:") && !k.startsWith("phase:"),
  );
  for (const x of [
    ...characters(s),
    ...s.engaged,
    ...s.staging,
    ...allActiveLocations(s),
  ]) {
    x.tempThreat = 0;
    x.tempWill = 0;
    x.tempAttack = 0;
    x.tempDefense = 0;
    x.suppressed = false;
    x.feinted = false;
    x.preventedAttacks = [];
    delete x.phaseResourceIcons;
  }
  for (const u of [...characters(s)]) {
    if (u.code === "01007") u.boost = 0;
  }
}

export function returnAlly(s: GameState, u: Unit, toDeck = false) {
  if (toDeck && hasEncounterKeyword(card(u.code))) {
    destroy(s, u, false, "removed");
    return;
  }
  if (!toDeck) {
    returnAlliesToHand(s, [u]);
    return;
  }
  const controller = ownerOf(s, u),
    owner = u.owner ?? controller;
  const lastKnownAttack = stats(s, u).attack;
  const lastKnownTraits = effectiveTraits(u);
  for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
  forOwner(s, controller, () => {
    s.allies = s.allies.filter((a) => a.id !== u.id);
  });
  let returnedId: string | undefined;
  forOwner(s, owner, () => {
    if (toDeck) {
      s.deck.push(u.code);
      shuffle(s, s.deck);
    } else {
      const returned = make(s, u.code);
      returnedId = returned.id;
      s.hand.push(returned);
    }
  });
  log(
    s,
    `${name(u)} returns to ${seatName(s, owner)}’s ${toDeck ? "deck" : "hand"}.`,
  );
  prepend(s, fx("valiant", { player: controller }));
  characterLeftPlay(
    s,
    u,
    controller,
    {
      zone: toDeck ? "deck" : "hand",
      player: owner,
      id: returnedId,
      index: toDeck ? seatView(s, owner).deck.indexOf(u.code) : undefined,
    },
    lastKnownAttack,
    lastKnownTraits,
  );
}

/** Simultaneous returns leave every card out of play before any response is offered. */
export function returnAlliesToHand(s: GameState, allies: Unit[]) {
  const moves = [...new Map(allies.map((u) => [u.id, u])).values()]
    .filter(
      (u) =>
        allCharacters(s).some((c) => c.id === u.id) &&
        ["ally", "objective-ally"].includes(card(u.code).type_code),
    )
    .map((u) => ({
      u,
      controller: ownerOf(s, u),
      owner: u.owner ?? ownerOf(s, u),
      lastKnownAttack: stats(s, u).attack,
      lastKnownTraits: effectiveTraits(u),
      id: "",
    }));
  for (const move of moves) {
    for (const a of [...move.u.attachments])
      discardAttachment(s, move.u, a, true);
    forOwner(s, move.controller, () => {
      s.allies = s.allies.filter((u) => u.id !== move.u.id);
    });
    forOwner(s, move.owner, () => {
      if (move.u.code === "rc135" || hasEncounterKeyword(card(move.u.code)))
        s.removed.push(move.u.code);
      else {
        const returned = make(s, move.u.code);
        move.id = returned.id;
        s.hand.push(returned);
      }
    });
  }
  if (
    moves.some((move) => move.u.code === "rc135") &&
    s.campaign &&
    s.scenarioId !== "dol-guldur"
  ) {
    s.status = "lost";
    s.reason = "Mendor has left play. The campaign quest is lost.";
    s.choice = null;
    s.queue = [];
    log(s, s.reason, "danger");
  }
  check(s);
  for (const move of moves) {
    log(
      s,
      move.u.code === "rc135" || hasEncounterKeyword(card(move.u.code))
        ? `${name(move.u)} leaves play and is removed from the game.`
        : `${name(move.u)} returns to ${seatName(s, move.owner)}’s hand.`,
    );
    if (s.status !== "playing") continue;
    prepend(s, fx("valiant", { player: move.controller }));
    characterLeftPlay(
      s,
      move.u,
      move.controller,
      {
        zone:
          move.u.code === "rc135" || hasEncounterKeyword(card(move.u.code))
            ? "removed"
            : "hand",
        player: move.owner,
        id: move.id,
      },
      move.lastKnownAttack,
      move.lastKnownTraits,
    );
  }
  return moves
    .filter((move) => move.id)
    .map((move) => ({ id: move.id, code: move.u.code, player: move.owner }));
}

export function nextRound(s: GameState) {
  for (const u of globalUnits(s)) {
    delete u.roundThreat;
    delete u.roundAttack;
    delete u.roundCannotTakeDamage;
  }
  heirsRoundEnd(s);
  for (const u of globalCharacters(s)) {
    delete u.roundKeywords;
    delete u.roundDefense;
  }
  s.round++;
  startPhase(s, "resource");
  s.alliesPlayed = 0;
  s.mendorBoost = false;
  delete s.refreshReadied;
  globalEachSeat(s, () => {
    s.used = s.used.filter((key) => key.startsWith("game:"));
    s.peek = null;
    s.optionalEngagement = false;
  });
  if (Fangorn.fangornResourceStart(s)) return;
  collectResources(s);
}

export function collectResources(s: GameState) {
  const draws: Effect[] = [];
  globalEachSeat(s, (player) => {
    for (const h of s.heroes)
      if (!isSacked(h) && khazadResourcePhase(s))
        h.resources += 1 + (ninNoCardEconomy(s) ? 0 : resourcePhaseBonus(h));
    for (const ally of s.allies)
      if (
        ["02059", "08146"].includes(ally.code) &&
        !ally.blanked &&
        canGainResources(s, ally)
      )
        ally.resources++;
    const frameworkDraw = DunlandQuest.dunlandResourceDraw(s) ?? 1;
    const count =
      frameworkDraw === 0
        ? 0
        : frameworkDraw +
          huntResourceDrawBonus(s, player) +
          dwarfResourceDrawBonus(s, player);
    // Resolve each player's draw reactions before moving to the next player.
    if (s.dunlandTrap) draws.push(fx("draw", { value: count, player }));
    else if (ninNoCardEconomy(s)) draw(s, frameworkDraw, false);
    else draw(s, count, false);
  });
  prepend(s, ...draws);
  log(s, `Round ${s.round} · Each hero gains 1 resource.`, "chapter");
}

export function engage(s: GameState, u: Unit, optional = false) {
  if (celebrimborProtected(s, u)) return;
  if (!shadowFlameCanMove(s, u) || !amonPlayerCanEngage(s, u, activeSeat(s)))
    return;
  if (allEngaged(s).some((e) => e.id === u.id))
    forOwner(s, ownerOf(s, u), () => {
      s.engaged = s.engaged.filter((e) => e.id !== u.id);
    });
  s.staging = s.staging.filter((x) => x.id !== u.id);
  s.engaged.push(u);
  if (!s.used.includes("round:engaged-enemy"))
    s.used.push("round:engaged-enemy");
  if (s.table && !u.facedownCard) u.owner = activeSeat(s);
  if (u.preventedAttacks)
    u.feinted = u.preventedAttacks.includes(activeSeat(s));
  log(s, `${name(u)} engages your fellowship.`, "danger");
  const realmBefore = s.queue.length;
  BloodQuest.bloodGondorEngaged(s, u);
  MorgulQuest.morgulEngaged(s, u, optional);
  Fords.fordsEngaged(s, u);
  Antlered.antleredEngaged(s, u);
  Weather.weatherEngaged(s, u);
  Catch.catchEngaged(s, u);
  DunlandQuest.dunlandEngaged(s, u);
  longDarkEngaged(s, u);
  foundationsEngaged(s, u);
  heirsEngaged(s, u, activeSeat(s), optional);
  gondorEnemyEngaged(s, u, activeSeat(s), optional);
  returnMirkwoodEngaged(s, u);
  roadRivendellEngaged(s, u);
  khazadEngaged(s, u);
  amonPlayerEnemyEngaged(s, u);
  if (u.code === "01096") u.boost = 1;
  if (u.code === "rc136") prepend(s, fx("chooseExhaust", { count: 2 }));
  if (u.code === "01075")
    prepend(s, fx("chooseDamage", { value: 5, flag: true }));
  s.queue.splice(
    s.queue.length - realmBefore,
    0,
    Realm.realmEngagementResponse(s, u),
  );
}

export function returnTreachery(s: GameState, code: string) {
  if (!["01080", "01105"].includes(code)) s.encounterDiscard.push(code);
}

export function revealed(
  s: GameState,
  code: string,
  guarding?: string,
  revealOrigin: Effect["revealOrigin"] = "encounter",
) {
  if (revealOrigin === "encounter" && amonPlayerInterceptReveal(s, code)) {
    ringMakerLocationRevealed(s, code, true);
    return;
  }
  const c = card(code);
  s.lastReveal = code;
  if (revealOrigin === "encounter") {
    elfEncounterRevealed(s, code);
    collectorEncounterRevealed(s, code);
  }
  log(
    s,
    `Revealed ${c.name}.`,
    c.type_code === "treachery" ? "danger" : "normal",
  );
  const warden =
    revealOrigin === "encounter"
      ? ringMakerLocationRevealed(s, code)
      : { progress: 0, explored: false };
  if (warden.explored) {
    if (s.flow)
      pauseFor(s, {
        kind: "reveal",
        title: `Explored on reveal · ${c.name}`,
        detail:
          "Warden of Arnor explores this location before its keywords and When Revealed effects.",
        cards: [{ code, label: "Explored location" }],
      });
    return;
  }
  const thalinDamage =
    revealOrigin === "encounter" &&
    c.type_code === "enemy" &&
    allHeroes(s).some((h) => h.code === "01006" && !h.blanked && h.committed)
      ? 1
      : 0;
  // Thalin's passive resolves before the pre-keyword response window.
  if (thalinDamage && (c.health ?? 0) <= 1) {
    resolveReveal(
      s,
      code,
      guarding,
      revealOrigin,
      false,
      warden.progress,
      thalinDamage,
    );
    return;
  }
  const revealKeywords = Druadan.druadanForestRevealEffects(
    s,
    code,
    revealOrigin,
  );
  revealKeywords.unshift(...finalRingHastyWindow(s));
  if (s.flow) {
    prepend(
      s,
      ...revealKeywords,
      fx("resolveReveal", {
        code,
        source: guarding,
        revealOrigin,
        count: warden.progress,
        value: thalinDamage,
      }),
    );
    pauseFor(s, {
      kind: "reveal",
      title: `Revealed · ${c.name}`,
      detail: "Read the encounter. Its revealed effects have not resolved yet.",
      cards: [
        { code, label: guarding ? "Objective guard" : "Encounter revealed" },
      ],
    });
    return;
  }
  if (revealKeywords.length) {
    prepend(
      s,
      ...revealKeywords,
      fx("resolveReveal", {
        code,
        source: guarding,
        revealOrigin,
        count: warden.progress,
        value: thalinDamage,
      }),
    );
    return;
  }
  resolveReveal(
    s,
    code,
    guarding,
    revealOrigin,
    false,
    warden.progress,
    thalinDamage,
  );
}

export function resolveReveal(
  s: GameState,
  code: string,
  guarding?: string,
  revealOrigin: Effect["revealOrigin"] = "encounter",
  doomedResolved = false,
  initialProgress = 0,
  thalinSnapshot?: number,
) {
  const c = card(code);
  let thalin = false;
  if (
    revealOrigin === "encounter" &&
    c.type_code === "enemy" &&
    (thalinSnapshot === undefined
      ? allHeroes(s).some(
          (h) => h.code === "01006" && !h.blanked && h.committed,
        )
      : thalinSnapshot > 0)
  ) {
    thalin = true;
    if ((c.health ?? 0) <= 1) {
      const crow = make(s, code);
      roadRivendellRevealedEnemy(s, crow);
      khazadRevealedEnemy(s, crow);
      s.staging.push(crow);
      heirsEnemyEntered(s, crow, true);
      destroy(s, crow);
      log(s, `Thalin defeats ${c.name} as it is revealed.`, "good");
      return;
    }
  }
  const doomed = /Doomed (\d+)/.exec(c.text ?? "");
  if (doomed && !doomedResolved) {
    prepend(
      s,
      fx("resolveReveal", {
        code,
        source: guarding,
        revealOrigin,
        flag: true,
        count: initialProgress,
        value: thalin ? 1 : 0,
      }),
    );
    Isengard.resolveDoomed(s, Number(doomed[1]), "encounter");
    return;
  }
  const emynSurge = emynMuilRevealSurge(s, code);
  if (
    /(?:^|[.\n]\s*)Surge(?:[.\s]|$)/i.test(c.text ?? "") ||
    emynSurge ||
    longDarkRevealSurge(s, code) ||
    Fords.fordsRevealSurge(s, code) ||
    Weather.weatherRevealSurge(s, code, revealOrigin) ||
    (code === CHETWOOD.hills && Chetwood.chetwoodQuestCount(s) === 1)
  )
    prepend(s, fx("amonSurgeWindow", { code }), fx("reveal"));
  if (
    revealOrigin === "encounter" &&
    ["treachery", "encounter-side-quest"].includes(c.type_code)
  )
    prepend(
      s,
      fx("afterEncounterRevealed", {
        code,
        revealOrigin,
        player: activeSeat(s),
      }),
    );
  // The Eaves of Mirkwood: encounter card effects cannot be canceled.
  const when =
    (c.text ?? "").includes("When Revealed") &&
    !hasEncounterKeyword(c) &&
    c.type_code !== "encounter-side-quest" &&
    code !== CARROCK.sacked &&
    code !== FANGORN.malice &&
    code !== NIN.remnants &&
    !Fords.fordsCannotCancel(s, code) &&
    !khazadCannotCancel(code) &&
    !heirsCannotCancel(code) &&
    !stewardFearCannotCancel(code) &&
    !Osgiliath.assaultOsgiliathCannotCancel(code) &&
    !roadRivendellCannotCancel(s) &&
    !allActiveLocations(s).some((l) => l.code === "02016");
  const options: Option[] = [];
  const revealingPlayer = activeSeat(s);
  eachSeat(s, (player) => {
    if (
      when &&
      s.hand.some((u) => u.code === "01050") &&
      canPay(s, card("01050"))
    )
      options.push({
        id: s.table ? `cancel-${player}` : "cancel",
        label: `Play A Test of Will · ${playCost(s, card("01050"))} Spirit${s.table ? " · " + seatName(s, player) : ""}`,
        code: "01050",
        effects: [
          fx("eventPlay", {
            code: "01050",
            player,
            effects: [
              fx("placeEncounter", {
                text: "revealed",
                code,
                flag: true,
                player: revealingPlayer,
                value: thalin ? 1 : 0,
                count: initialProgress,
                source: guarding,
                revealOrigin,
              }),
            ],
            cancelledEffects: [
              fx("placeEncounter", {
                text: "revealed",
                code,
                player: revealingPlayer,
                value: thalin ? 1 : 0,
                count: initialProgress,
                source: guarding,
                revealOrigin,
              }),
            ],
          }),
        ],
      });
    const eleanor = s.heroes.find(
      (h) => h.code === "01008" && !h.exhausted && !h.blanked && !isSacked(h),
    );
    if (when && c.type_code === "treachery" && eleanor)
      options.push({
        id: s.table ? `eleanor-${player}` : "eleanor",
        label: "Exhaust Eleanor to cancel and replace",
        code: "01008",
        effects: [
          fx("exhaust", {
            target: eleanor.id,
            source: eleanor.id,
            code: eleanor.code,
          }),
          fx("cancelReplace", {
            code,
            source: guarding,
            revealOrigin,
            player: revealingPlayer,
          }),
        ],
      });
  });
  if (when)
    options.push(
      ...collectorEnemyCancelOptions(
        s,
        code,
        fx("placeEncounter", {
          text: "revealed",
          code,
          player: revealingPlayer,
          value: thalin ? 1 : 0,
          count: initialProgress,
          source: guarding,
          revealOrigin,
        }),
      ),
    );
  if (options.length) {
    choose(
      s,
      `Revealed: ${c.name}`,
      [
        ...options,
        {
          id: "resolve",
          label: "Resolve the encounter",
          code,
          effects: [
            fx("placeEncounter", {
              text: "revealed",
              code,
              value: thalin ? 1 : 0,
              count: initialProgress,
              source: guarding,
              revealOrigin,
            }),
          ],
        },
      ],
      c.text,
    );
    return;
  }
  prepend(
    s,
    fx("placeEncounter", {
      text: "revealed",
      code,
      value: thalin ? 1 : 0,
      count: initialProgress,
      source: guarding,
      revealOrigin,
    }),
  );
}

export function placeEncounter(
  s: GameState,
  code: string,
  cancel = false,
  initialDamage = 0,
  guarding?: string,
  fromReveal = false,
  revealOrigin: Effect["revealOrigin"] = "encounter",
  initialProgress = 0,
) {
  const c = card(code);
  if (c.type_code !== "treachery") {
    const fresh =
      Trials.trialsRevealedUnit(s, code) ??
      Weather.weatherRevealedUnit(s, code) ??
      make(s, code);
    Trials.trialsCardEntered(s, fresh, fromReveal);
    Antlered.antleredCardEntered(s, fresh, fromReveal);
    Chetwood.chetwoodCardEntered(s, fresh, fromReveal);
    Weather.weatherCardEntered(s, fresh, fromReveal);
    fresh.progress = initialProgress;
    fresh.damage =
      initialDamage && khazadDamageCancelled(s, fresh, initialDamage)
        ? 0
        : initialDamage;
    if (guarding && ["enemy", "location"].includes(c.type_code))
      fresh.guarding = guarding;
    s.staging.push(fresh);
    if (fromReveal && revealOrigin === "encounter" && c.type_code === "enemy") {
      khazadRevealedEnemy(s, fresh);
      khazadDiscardRevealedEnemy(s, fresh);
    }
    if (c.type_code === "enemy" && s.staging.some((u) => u.id === fresh.id))
      enemyAddedToStaging(s, fresh);
    if (c.type_code === "enemy")
      roadRivendellEnemyEntered(
        s,
        fresh,
        fromReveal && revealOrigin === "encounter",
      );
    if (c.type_code === "enemy") heirsEnemyEntered(s, fresh, fromReveal);
    if (c.type_code === "location") {
      stewardFearLocationEntered(s, fresh);
      Amon.amonDinLocationEntered(s, fresh);
      watcherPlayerLocationEntered(s, fresh);
      if (fromReveal && revealOrigin === "encounter")
        prepend(s, fx("huntLocationResponse", { target: fresh.id }));
    }
    if (c.type_code === "objective") {
      prepend(
        s,
        ...(guarding ? [fx("guardObjective", { target: guarding })] : []),
        ...(/\bGuarded\b/i.test(c.text ?? "")
          ? [fx("guardObjective", { target: fresh.id })]
          : []),
      );
    }
  }
  if (code === RANGER_NORTH && fromReveal) {
    const ranger = [...s.staging].reverse().find((u) => u.code === code);
    if (ranger) rangerRevealed(s, ranger.id);
    return;
  }
  if (cancel) {
    Weather.weatherCanceled(s, code);
    if (c.type_code === "treachery") s.encounterDiscard.push(code);
    log(s, `${c.name}’s when-revealed effect was cancelled.`, "good");
    return;
  }
  if (shadowFlameEncounter(s, code)) return;
  if (Druadan.druadanForestEncounter(s, code)) return;
  if (Amon.amonDinEncounter(s, code)) return;
  if (Osgiliath.assaultOsgiliathEncounter(s, code)) return;
  if (BloodQuest.bloodGondorEncounter(s, code)) return;
  if (MorgulQuest.morgulEncounter(s, code)) return;
  if (Fords.fordsEncounter(s, code)) return;
  if (Catch.catchEncounter(s, code)) return;
  if (Fangorn.fangornEncounter(s, code)) return;
  if (DunlandQuest.dunlandEncounter(s, code)) return;
  if (Trials.trialsEncounter(s, code)) return;
  if (Tharbad.tharbadEncounter(s, code)) return;
  if (Nin.ninEncounter(s, code)) return;
  if (Celebrimbor.celebrimborEncounter(s, code)) return;
  if (Antlered.antleredEncounter(s, code)) return;
  if (Chetwood.chetwoodEncounter(s, code)) return;
  if (Weather.weatherEncounter(s, code)) return;
  if (heirsEncounter(s, code)) return;
  if (stewardFearEncounter(s, code)) return;
  if (foundationsEncounter(s, code)) return;
  if (longDarkEncounter(s, code)) return;
  if (watcherWaterEncounter(s, code)) return;
  if (roadRivendellEncounter(s, code)) return;
  if (redhornEncounter(s, code)) return;
  if (khazadEncounter(s, code)) return;
  if (carrockEncounter(s, code)) return;
  if (emynMuilEncounter(s, code)) return;
  if (rhosgobelEncounter(s, code)) return;
  if (returnMirkwoodEncounter(s, code)) return;
  if (deadMarshesEncounter(s, code)) return;
  switch (code) {
    case "01086":
      removeCurrentQuestProgress(s, 4);
      break;
    case "01104":
      s.threatModifier += livingSeats(s).length;
      break;
    case "01105":
      forOwner(s, firstPlayer(s), () => {
        s.shackles++;
      });
      break;
    case "01112":
      prepend(
        s,
        ...playerOrder(s).map(() => fx("reveal", { player: firstPlayer(s) })),
      );
      break;
    case "01116":
      eachSeat(s, () => {
        if (s.threat >= 35)
          for (const x of [...characters(s)]) damage(s, x.id, 1);
      });
      break;
    case "01117":
      eachSeat(s, () => {
        raiseThreat(
          s,
          characters(s).filter((x) => !x.committed).length,
          "encounter",
        );
      });
      break;
    case "01118":
      s.fog = (s.fog ?? 0) + 1;
      prepend(
        s,
        ...playerOrder(s)
          .filter((i) => seatView(s, i).threat >= 35)
          .map((player) => fx("discardHand", { player })),
      );
      break;
    case "rc137":
      prepend(s, ...playerOrder(s).map((player) => fx("venom", { player })));
      break;
    case "01074":
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("chooseExhaust", { count: 1, player }),
        ),
      );
      break;
    case "01076":
      s.questDebuff++;
      break;
    case "01079":
      eachSeat(s, () => {
        const events = s.hand.filter((u) => card(u.code).type_code === "event");
        for (const event of events) discardHandCard(s, event.id);
      });
      break;
    case "01080":
      choose(
        s,
        "Caught in a Web",
        opts(
          allHeroes(s).filter(
            (h) =>
              seatView(s, ownerOf(s, h)).threat ===
              Math.max(...livingSeats(s).map((i) => seatView(s, i).threat)),
          ),
          (u) => [fx("web", { target: u.id })],
        ),
        "The player with the highest threat chooses one of their heroes. The web prevents normal refreshing unless that hero pays 2 resources.",
      );
      break;
    case "01089":
      choose(
        s,
        "Dol Guldur Orcs",
        opts(
          allCharacters(s).filter((u) => u.committed),
          (u) => [fx("damage", { target: u.id, value: 2 })],
        ),
        "Choose a character committed to the quest to take 2 damage.",
      );
      break;
    case "01092":
      if (s.staging.length)
        s.staging
          .filter((u) => ["enemy", "location"].includes(card(u.code).type_code))
          .forEach((u) => {
            u.tempThreat = (u.tempThreat ?? 0) + 1;
          });
      else prepend(s, fx("reveal"));
      break;
    case "01093":
      for (const u of [...allCharacters(s)].filter((u) => u.exhausted))
        damage(s, u.id, 1);
      break;
    case "01098":
      prepend(s, ...playerOrder(s).map((player) => fx("bats", { player })));
      break;
    case "02020": {
      // Goblintown Scavengers: each player discards the top card of their deck.
      let total = 0;
      eachSeat(s, () => {
        const top = discardPlayerDeck(s, 1)[0];
        if (top) {
          total += Number(card(top).cost) || 0;
        }
      });
      const scavengers = [...s.staging].reverse().find((x) => x.code === code);
      if (scavengers)
        scavengers.tempThreat = (scavengers.tempThreat ?? 0) + total;
      log(
        s,
        `Goblintown Scavengers gain ${total} threat until the end of the phase.`,
        "danger",
      );
      break;
    }
    case "02022": {
      const inStaging = s.staging.filter((x) => x.code === CLUE);
      const held = allHeroes(s).flatMap((h) =>
        h.attachments.filter((a) => a.code === CLUE).map((a) => ({ h, a })),
      );
      if (!inStaging.length && !held.length) {
        log(s, "No Clue is in play. False Lead surges.", "danger");
        prepend(s, fx("reveal"));
        break;
      }
      selectSeat(s, firstPlayer(s));
      choose(
        s,
        "False Lead",
        [
          ...opts(inStaging, (x) => [fx("clueShuffle", { target: x.id })]),
          ...held.map(({ h, a }) => ({
            id: `clue-${h.id}-${a.id}`,
            code: CLUE,
            label: `Signs of Gollum on ${name(h)}`,
            effects: [fx("clueShuffle", { target: h.id, source: a.id })],
          })),
        ],
        "Choose a Clue card in play and shuffle it back into the encounter deck.",
      );
      break;
    }
    case "02023":
      for (const x of riverlandsInPlay(s)) x.progress = 0;
      log(
        s,
        "Flooding washes all progress from the Riverland locations.",
        "danger",
      );
      break;
    case "02024":
      eachSeat(s, () => {
        for (const h of s.heroes) {
          if (h.resources > 0) h.resources--;
          else exhaustCharacter(s, h);
        }
      });
      break;
  }
  if (c.type_code === "treachery") returnTreachery(s, code);
}

/** Put-into-play legality is shared with normal play, without play costs or caps. */
export function allyCanEnter(s: GameState, code: string): boolean {
  const c = card(code);
  if (c.type_code !== "ally") return false;
  if (s.scenarioId === "the-morgul-vale" && c.name === "Faramir") return false;
  const key = (title: string) =>
    title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  const title = key(c.name);
  if (
    ["redhorn-gate", "road-to-rivendell"].includes(s.scenarioId) &&
    title === "arwen undomiel"
  )
    return false;
  return (
    !c.is_unique ||
    !globalUnits(s).some(
      (u) =>
        key(card(u.code).name) === title ||
        u.attachments.some(
          (a) =>
            !a.facedown && !a.namelessCard && key(card(a.code).name) === title,
        ),
    )
  );
}

export function enterAlly(
  s: GameState,
  u: Unit,
  temporary = false,
  played = false,
  fromHand = played,
) {
  requireRule(
    allyCanEnter(s, u.code),
    "This ally cannot enter play: its unique title or scenario restriction is already in effect.",
  );
  u.temporary = temporary;
  s.allies.push(u);
  finalRingAllyEntering(u);
  if (offerRingMakerDoomed(s, u, played, fromHand)) return;
  resolveAllyKeywords(s, u, played, fromHand);
}

export function resolveAllyKeywords(
  s: GameState,
  u: Unit,
  played: boolean,
  fromHand: boolean,
  gainedDoomed = 0,
) {
  if (
    Isengard.isengardPlayerPlayed(
      s,
      u,
      played && fromHand,
      fx("allyEntryResponses", {
        target: u.id,
        flag: played,
        value: fromHand ? 1 : 0,
      }),
      0,
      gainedDoomed,
    )
  )
    return;
  allyEntryResponses(s, u, played, fromHand);
}

/** Entry keywords precede the ally's optional responses, including older direct-choice handlers. */
export function allyEntryResponses(
  s: GameState,
  u: Unit,
  played: boolean,
  fromHand: boolean,
) {
  if (played) longDarkPlayerCardPlayed(s, card(u.code), activeSeat(s));
  if (played) heirsPlayerCardPlayed(s, card(u.code));
  heirsPlayerAllyEntered(s, u, played, fromHand);
  amonPlayerAllyEntered(s, u, played);
  osgiliathPlayerAllyEntered(s, u, played);
  collectorAllyEntered(s, u, played, fromHand);
  huntAllyEntered(s, u, played && fromHand);
  mirkwoodPlayerAllyEntered(s, u, played && fromHand);
  khazadPlayerAllyEntered(s, u);
  rohanAllyEntered(s, u);
  Realm.realmAllyPlayed(s, u, played);
  Isengard.isengardAllyEntered(s, u);
  dunlandAllyEntered(s, u);
  ringMakerAllyEntered(s, u, played, fromHand);
  finalRingAllyEntered(s, u);
  Realm.realmAllyEntered(s, u);
  elfAllyEntered(s, u, played);
  gondorAllyEntered(s, u);
  emynPlayerAllyEntered(s, u, played);
  dwarfAllyEntered(s, u, played && fromHand);
  switch (u.code) {
    case "01073":
      prepend(s, fx("gandalf", { source: u.id, code: u.code }));
      break;
    case "01016":
      choose(
        s,
        "Snowbourn Scout",
        [
          ...opts(
            [
              ...s.staging.filter((x) => card(x.code).type_code === "location"),
              ...allActiveLocations(s),
            ].filter((x) => x.code !== CARROCK.carrock),
            (x) => [fx("locationProgress", { target: x.id, value: 1 })],
          ),
          skip,
        ],
        "Place 1 progress on a location.",
      );
      break;
    case "01015":
      choose(
        s,
        "Son of Arnor",
        [
          ...opts(
            [
              ...s.staging.filter((x) => card(x.code).type_code === "enemy"),
              ...allEngaged(s).filter((x) => ownerOf(s, x) !== activeSeat(s)),
            ],
            (x) => [fx("engage", { target: x.id })],
          ),
          skip,
        ],
        "You may engage an enemy from staging or another fellowship.",
      );
      break;
    case "01059": {
      if (!played) break;
      if (s.table) {
        choose(s, "Erebor Hammersmith", [
          ...playerOrder(s).flatMap((player) => {
            const discard = seatView(s, player).discard;
            const code = [...discard]
              .reverse()
              .find((c) => card(c).type_code === "attachment");
            return code
              ? [
                  {
                    id: `player-${player}`,
                    label: `${card(code).name} · ${seatName(s, player)}`,
                    code,
                    effects: [fx("recoverAttachment", { player, code })],
                  },
                ]
              : [];
          }),
          skip,
        ]);
        break;
      }
      const attachment = [...s.discard]
        .reverse()
        .find((code) => card(code).type_code === "attachment");
      if (attachment) {
        const i = s.discard.lastIndexOf(attachment);
        s.discard.splice(i, 1);
        s.hand.push(make(s, attachment));
        log(
          s,
          `Erebor Hammersmith returns ${card(attachment).name} to your hand.`,
        );
      }
      break;
    }
    case "01061":
      choose(s, "Miner of the Iron Hills", [
        ...[
          ...units(s),
          ...(mainQuestUnit(s) ? [mainQuestUnit(s)!] : []),
        ].flatMap((h) =>
          h.attachments
            .filter(
              (a) =>
                attachmentHasTrait(a, "Condition") &&
                !card(a.code).text?.includes("Permanent"),
            )
            .map((a) => ({
              id: a.id,
              code: a.code,
              label: `Discard ${card(a.code).name} from ${name(h)}`,
              effects: [
                fx("discardAttachment", { target: h.id, source: a.id }),
              ],
            })),
        ),
        ...playerOrder(s)
          .filter((i) => seatView(s, i).shackles > 0)
          .map((player) => ({
            id: `shackles-${player}`,
            code: "01105",
            label: `Discard Iron Shackles · ${seatName(s, player)}`,
            effects: [fx("discardShackles", { player })],
          })),
        skip,
      ]);
      break;
    case "01018":
      for (const x of [...s.staging, ...allEngaged(s)].filter((x) =>
        card(x.code).traits?.includes("Orc"),
      ))
        damage(s, x.id, 1);
      break;
  }
}

export function spendEvent(
  s: GameState,
  code: string,
  id?: string,
  doomedX = 0,
) {
  const problem =
    Antlered.antleredPlayProblem(s, code) ?? Nin.ninPlayProblem(s, code);
  requireRule(!problem, problem ?? "");
  const u = s.hand.find((u) => u.code === code && (!id || u.id === id));
  requireRule(u, "That event is no longer in hand.");
  pay(s, card(code));
  redhornPlayerEventPlayed(s, code);
  dunlandEventPlayed(s, code);
  ringMakerEventPlayed(s, code);
  longDarkPlayerCardPlayed(s, card(code), activeSeat(s));
  s.hand = s.hand.filter((x) => x.id !== u.id);
  if (s.ninEilph) s.used.push("nin:played");
  holdPlayedEvent(s, u);
  Isengard.isengardPlayerPlayed(s, u, true, undefined, doomedX);
  stewardFearEventPlayed(s);
  log(s, `Played ${card(code).name}.`, "good");
  return !shadowFlameEventCancelled(s);
}

export function attachmentChoice(s: GameState, defenderOnly = false) {
  const c = s.combat;
  const list = defenderOnly
    ? (c?.defenderIds ?? (c?.defenderId ? [c.defenderId] : [])).map((id) =>
        get(s, id)!,
      )
    : units(s);
  const options: Option[] = [];
  for (const u of list.filter(Boolean))
    for (const a of u.attachments) {
      if (
        !card(a.code).text?.includes("Permanent") &&
        (defenderOnly || attachmentController(s, u, a) === activeSeat(s))
      )
        options.push({
          id: a.id,
          label: `${card(a.code).name} · ${name(u)}`,
          code: a.code,
          effects: [fx("discardAttachment", { target: u.id, source: a.id })],
        });
    }
  choose(s, "Choose an attachment to discard", options);
}

export function shadow(s: GameState, code: string) {
  if (Druadan.druadanForestShadow(s, code)) return;
  if (Amon.amonDinShadow(s, code)) return;
  if (Osgiliath.assaultOsgiliathShadow(s, code)) return;
  if (BloodQuest.bloodGondorShadow(s, code)) return;
  if (MorgulQuest.morgulShadow(s, code)) return;
  if (Fords.fordsShadow(s, code)) return;
  if (Catch.catchShadow(s, code)) return;
  if (Fangorn.fangornShadow(s, code)) return;
  if (DunlandQuest.dunlandShadow(s, code)) return;
  if (Trials.trialsShadow(s, code)) return;
  if (Tharbad.tharbadShadow(s, code)) return;
  if (Nin.ninShadow(s, code)) return;
  if (Celebrimbor.celebrimborShadow(s, code)) return;
  if (Antlered.antleredShadow(s, code)) return;
  if (Chetwood.chetwoodShadow(s, code)) return;
  if (Weather.weatherShadow(s, code)) return;
  if (heirsShadow(s, code)) return;
  if (stewardFearShadow(s, code)) return;
  if (shadowFlameShadow(s, code)) return;
  const foundationsAttacker = get(s, s.combat?.enemyId);
  if (foundationsAttacker && foundationsShadow(s, foundationsAttacker, code))
    return;
  const longDarkAttacker = get(s, s.combat?.enemyId);
  if (longDarkAttacker && longDarkShadow(s, longDarkAttacker, code)) return;
  if (watcherWaterShadow(s, code)) return;
  if (roadRivendellShadow(s, code)) return;
  if (redhornShadow(s, code)) return;
  if (khazadShadow(s, code)) return;
  if (returnMirkwoodShadow(s, code)) return;
  if (carrockShadow(s, code)) return;
  if (emynMuilShadow(s, code)) return;
  if (rhosgobelShadow(s, code)) return;
  const c = s.combat;
  if (!c) return;
  const undefended = !(
    c.defenderIds ?? (c.defenderId ? [c.defenderId] : [])
  ).some((id) => !!get(s, id));
  switch (code) {
    case "01081":
      prepend(s, fx("wolfAttack"));
      break;
    case "01085":
      c.attackBonus += undefended ? 2 : 1;
      break;
    case "01086":
      c.ignoreDefense = true;
      break;
    case "01103":
      if (undefended) {
        for (const x of units(s))
          for (const a of [...x.attachments])
            if (attachmentController(s, x, a) === activeSeat(s))
              discardAttachment(s, x, a);
      } else attachmentChoice(s);
      break;
    case "01104":
      raiseThreat(s, s.engaged.length, "encounter");
      break;
    case "01105": {
      // The shadow card becomes a Condition on the deck. It must no longer be
      // discarded with this enemy's remaining shadow cards at combat end.
      const enemy = get(s, c.enemyId);
      const index = enemy?.shadows.indexOf(code) ?? -1;
      if (enemy && index >= 0) removeShadowCard(enemy, index);
      forOwner(s, firstPlayer(s), () => {
        s.shackles++;
      });
      break;
    }
    case "01111":
      removeCurrentQuestProgress(s, undefended ? 3 : 1);
      break;
    case "01112": {
      const enemy = get(s, c.enemyId),
        effects: Effect[] = [];
      for (const _player of livingSeats(s)) {
        const extra = encounterDraw(s, true);
        if (enemy && extra) {
          enemy.shadows.push(extra);
          heirsShadowDealt(s, enemy);
          effects.push(fx("shadowReveal", { code: extra }));
        }
      }
      prepend(s, ...effects);
      break;
    }
    case "01115":
      c.attackBonus += s.threat >= 35 ? 2 : 1;
      break;
    case "01117": {
      const exhausted = s.allies.filter((a) => a.exhausted);
      if (!exhausted.length) raiseThreat(s, 3, "encounter");
      else
        choose(
          s,
          "Pursued by Shadow",
          opts(exhausted, (a) => [fx("returnAlly", { target: a.id })]),
        );
      break;
    }
    case "rc136": {
      const enemy = get(s, c.enemyId);
      if (enemy) removeShadowCard(enemy, enemy.shadows.indexOf(code));
      const swarm = make(s, code);
      s.staging.push(swarm);
      engage(s, swarm);
      break;
    }
    case "rc137":
      characters(s)
        .filter((x) => x.damage > 0)
        .forEach((x) => exhaustCharacter(s, x));
      break;
    case "01074":
      prepend(s, fx("chooseExhaust", { count: undefended ? 2 : 1 }));
      break;
    case "01075":
      for (const u of [...characters(s)]) damage(s, u.id, undefended ? 2 : 1);
      break;
    case "01076":
      raiseThreat(s, undefended ? 8 : 4, "encounter");
      break;
    case "01089":
      c.attackBonus += undefended ? 3 : 1;
      break;
    case "01092":
      if (undefended) {
        for (const u of units(s))
          for (const a of [...u.attachments])
            if (attachmentController(s, u, a) === activeSeat(s))
              discardAttachment(s, u, a);
      } else attachmentChoice(s, true);
      break;
    case "01096":
      attachmentChoice(s);
      break;
    case "01097":
      c.attackBonus++;
      if (undefended) raiseThreat(s, 3, "encounter");
      break;
    case "02015": {
      const rivers = riverlandsInPlay(s).length;
      prepend(
        s,
        ...allCharacters(s)
          .filter(
            (x) =>
              card(x.code).type_code === "ally" &&
              (Number(card(x.code).cost) || 0) < rivers,
          )
          .map((x) =>
            fx("discardCharacter", { target: x.id, player: ownerOf(s, x) }),
          ),
      );
      break;
    }
    case "02017":
      removeCurrentQuestProgress(s, undefended ? 2 : 1);
      break;
    case "02018":
      if (!s.heroes.some(hasClue)) c.returnToStaging = true;
      break;
    case "02019": {
      const enemy = get(s, c.enemyId);
      if (enemy && !s.heroes.some(hasClue))
        c.attackBonus += card(enemy.code).attack ?? 0;
      break;
    }
    case "02021":
      for (const h of allHeroes(s).filter(hasClue))
        damage(s, h.id, undefended ? 3 : 1);
      break;
    case "02023":
      for (const x of riverlandsInPlay(s)) x.progress = 0;
      break;
  }
  check(s);
}
