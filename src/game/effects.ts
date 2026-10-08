import {
  afterPlayerAbility,
  resolvePlayerAbility,
  choosePlayerResponse,
} from "./player-ability-triggers";
import { DIKE } from "./deadmens-dike-support";
import { dikeCannotLeaveDiscard } from "./deadmens-discard";
import * as Dike from "./deadmens-dike";
import * as Chetwood from "./chetwood";
import * as Weather from "./weather-hills";
import { removeCurrentQuestProgress } from "./side-quests";
import { sideQuestEffect } from "./side-quests";
import { rangerEffect } from "./ranger-north";
import * as Realm from "./lost-realm-player";
import * as Angmar from "./angmar-player";
import * as Wastes from "./wastes-eriador";
import * as Gram from "./mount-gram";
import * as Etten from "./ettenmoors";
import * as Rhudaur from "./rhudaur";
import * as Carn from "./carn-dum";
import * as Dread from "./dread-realm";
/** Shared continuations must finish even if the player resolving a cost was eliminated. */
const ANGMAR_SHARED_EFFECTS = new Set([
  "ettenSetup",
  "ettenStageReveal",
  "ettenFindSide",
  "ettenMainProgress",
  "ettenLieLowPenalty",
  "ettenSafeVictory",
  "ettenFellsSearch",
  "ettenFellsTake",
  "ettenRemoveAllQuestProgress",
  "ettenShuffleSafe",
  "ettenShuffleSafeTake",
  "ettenLieLowShuffle",
  "ettenLieLowTake",
  "ettenScavengeTroll",
  "ettenScavengeTake",
  "rhudaurSetup",
  "rhudaurStageTwo",
  "rhudaurTimeExpired",
  "rhudaurShuffle",
  "rhudaurAddProgress",
  "rhudaurDescentProgress",
  "rhudaurResumeProgress",
  "rhudaurHall",
  "rhudaurReturnUndead",
  "rhudaurThaurdirSorcery",
  "rhudaurRemoveQuestProgress",
  "rhudaurSwitchQuest",
  "rhudaurSelectQuest",
  "rhudaurAttachFog",
  "rhudaurQuietChoose",
  "carnSetup",
  "carnDealAll",
  "carnFlip",
  "carnBossForced",
  "carnWolf",
  "carnWill",
  "carnWillSurge",
  "carnStageTwo",
  "carnStageReady",
  "carnMainProgress",
  "carnCurse",
  "carnTerror",
  "carnAttackEffects",
  "carnAttackFinished",
  "carnHealEnemy",
  "dreadSetup",
  "dreadStageReady",
  "dreadStageTwo",
  "dreadStageThree",
  "dreadFindLocations",
  "dreadAddLocation",
  "dreadWraithAttach",
  "dreadAttachWraith",
  "dreadRemoveSorcery",
  "dreadRemoveSorceryCard",
  "dreadQuestAttach",
  "dreadFellPlayer",
  "dreadPossession",
  "dreadPossessAlly",
  "dreadSeal",
  "dreadAltar",
  "dreadTombs",
  "dreadTombsTravel",
  "dreadEscape",
  "dreadDivideProgress",
  "dreadPlaceProgress",
  "dreadDungeonExplored",
  "dreadDungeonShadow",
  "dreadShadowSorcery",
  "dreadDiscardSorcery",
  "dreadTerror",
  "dreadTerrorShadow",
  "dreadDiscardPossessed",
  "gramCreateAreas",
  "gramStageTwoSetup",
  "gramStageReady",
  "gramAreaStaging",
  "gramAreaQuestDone",
  "gramJoinOrder",
  "gramJoin",
  "gramStageThree",
  "gramTravelReady",
  "wastesSetup",
  "wastesStage",
  "wastesStageReady",
  "wastesFlip",
  "wastesAllThreat",
  "wastesReturnEnemies",
  "wastesClearStage",
  "wastesClearCurrentQuest",
  "wastesShuffle",
]);
import * as Antlered from "./antlered";
import { celebrimborProtected } from "./celebrimbor-support";
import * as Celebrimbor from "./celebrimbor";
import { ninNoCardEconomy } from "./nin-eilph-support";
import {
  commitCharacters,
  freeHandPlayProblem,
  playCardFromHandEffect,
  effectCardPlayTargets,
  needsTarget,
  handlePaidPlayerCardEntry,
} from "./actions";
import * as Nin from "./nin-eilph";
import { reduceThreat } from "./threat-reduction";
import * as Tharbad from "./tharbad";
import { threatOf } from "./core";
import * as Trials from "./three-trials";
import { playerCardImmune } from "./card-immunity";
import * as DunlandQuest from "./dunland-trap";
import { enemyAttackPrevented } from "./core";
import * as Fangorn from "./fangorn";
import * as Catch from "./catch-orc";
import { removeQuestTime } from "./quest-time";
import * as Fords from "./fords-isen";
import { ringMakerEffect, ringMakerRoundEnd } from "./ring-maker-player";
import {
  finalRingEffect,
  finalRingDefenseFinished,
  finalRingShadowOptions,
  finalRingUndefendedTargets,
} from "./ring-maker-final-player";
import * as Isengard from "./voice-isengard";
import * as BloodQuest from "./blood-gondor";
import { allyEntryResponses, coreBoardResponse } from "./board";
import * as MorgulQuest from "./morgul-vale";
import * as Druadan from "./druadan-forest";
import * as Amon from "./amon-din";
import * as Osgiliath from "./assault-osgiliath";
import { canGainResources } from "./core";
import { dunlandEffect } from "./dunland-trap-player";
import {
  engagedEnemies,
  consideredEngaged,
  prepareEnemyShadows,
  markEnemyAttack,
  finishEnemyShadows,
} from "./considered-engagement";
import { finishPlayedEvent } from "./event-resolution";
import { handlePlayerEventAbilityEffect, resolveQuestResult } from "./actions";
import {
  handleHeirsEffect,
  heirsEncounter,
  heirsQuestStart,
  heirsCombatStart,
  heirsNoEngagementChecks,
  heirsAttackFinished,
  heirsCanSpendResources,
  heirsStagingCountBonus,
  heirsQuestFailed,
  heirsForcedCombatDamageTarget,
  heirsUndefendedDamage,
  heirsShadowDealt,
} from "./heirs-numenor";
import {
  handleStewardFearEffect,
  stewardHeroResponseEffect,
  stewardFearTravelEntered,
  stewardFearEncounter,
  stewardFearRoundEndEffects,
  stewardFearAttackFinished,
  stewardFearExtraRevealCount,
  stewardFearTreacheryRevealed,
} from "./steward-fear";
import {
  foundationsBeginStaging,
  handleFoundationsStoneEffect,
} from "./foundations-stone";
import { handleMorgulPlayerEffect } from "./morgul-player-cards";
import { handleOsgiliathPlayerEffect } from "./osgiliath-player-cards";
import {
  handleBloodPlayerEffect,
  bloodPlayerRoundEndEffects,
} from "./blood-gondor-player-cards";
import {
  handleAmonPlayerEffect,
  amonPlayerCanEngage,
  amonPlayerEnemyAttackTarget,
  amonPlayerSurgeRevealed,
} from "./amon-din-player-cards";
import { shadowFlameRoundEnd, shadowFlameCanMove } from "./shadow-flame";
import {
  handleDruadanPlayerEffect,
  druadanPlayerUndefendedTargets,
  druadanPlayerNoEngagementChecks,
} from "./druadan-player-cards";
import { handleStewardPlayerEffect } from "./steward-player-cards";
import {
  longDarkProgressLocation,
  longDarkRoundEnd,
  longDarkQuestFailed,
} from "./long-dark";
import {
  handleHeirsPlayerEffect,
  heirsPlayerNoEngagementCheck,
} from "./heirs-player-cards";
import {
  handleCollectorPlayerEffect,
  collectorRoundEndEffects,
  collectorEnemyAttackFinished,
} from "./collector-player-cards";
import {
  watcherWaterTravelEntered,
  watcherWaterCombatEnd,
  watcherWaterRoundEnd,
  watcherWaterRefresh,
} from "./watcher-water";
import {
  handleShadowFlamePlayerEffect,
  shadowFlamePlayerEnemyAttackEnded,
} from "./shadow-flame-player-cards";
import { handleFoundationsPlayerEffect } from "./foundations-player-cards";
import {
  roadRivendellTravelEntered,
  roadRivendellRoundEnd,
  roadRivendellCannotCancel,
} from "./road-rivendell";
import { redhornCanMakeActive, redhornRoundEnd } from "./redhorn-gate";
import {
  handleLongDarkPlayerEffect,
  longDarkPlayerIgnoreEngagement,
  longDarkPlayerTravelled,
} from "./long-dark-player-cards";
import {
  handleRohanPlayerEffect,
  rohanQuestSucceeded,
  rohanRevealReduction,
  rohanQuestBegins,
  rohanCombatBegins,
  rohanRoundEnd,
  rohanOathPlayers,
} from "./rohan-player-cards";
import {
  handleWatcherPlayerEffect,
  watcherPlayerDefended,
} from "./watcher-player-cards";
import {
  handleRoadPlayerEffect,
  roadPlayerAttackerDeclared,
} from "./road-player-cards";
import {
  handleRedhornPlayerEffect,
  redhornPlayerDefenderDeclared,
  redhornPlayerQuestSucceeded,
} from "./redhorn-player-cards";
import {
  khazadBeforeStaging,
  khazadStagingEnd,
  khazadCombatEnd,
  khazadRoundEnd,
  khazadAutoEngageAllowed,
  khazadAttackBonus,
  khazadCannotExhaust,
} from "./khazad-dum";
// The effect interpreter: every queued effect kind resolves here, plus queue flushing.
import { card, name } from "./cards";
import type { Effect, GameState, Unit } from "./types";

import {
  activeSeat,
  defendersFor,
  allCharacters,
  allActiveLocations,
  allHeroes,
  allEngaged,
  eachSeat,
  eachArea,
  globalEachSeat,
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
  passSeat,
} from "./table";

import { pauseFor, recordObservation } from "./presentation";
import {
  characters,
  choose,
  draw,
  encounterDraw,
  enqueue,
  followFirstPlayer,
  fx,
  get,
  has,
  log,
  make,
  observation,
  opts,
  prepend,
  random,
  requireRule,
  spendResources,
  shuffle,
  skip,
  stats,
  canPay,
  playCost,
  engagementCost,
  takePlayerDeck,
  putPlayerDeck,
} from "./core";
import {
  advanceDefense,
  check,
  characterLeftPlay,
  damage,
  discardAttachment,
  discardHandCard,
  engage,
  enterAlly,
  nextRound,
  collectResources,
  phaseEnd,
  placeEncounter,
  progressLocation,
  progress,
  resolveReveal,
  returnAlly,
  revealed,
  shadow,
  spendEvent,
  raiseThreat,
  readyCharacter,
  exhaustCharacter,
  enemyAddedToStaging,
  takePlayerDiscard,
} from "./board";
import {
  beginEnemyAttack,
  combatDamage,
  playerAttack,
  playerAttackResolved,
  enemyAttackStarted,
  combatDefenderDefense,
} from "./combat";
import { orcGuard, scenarioEffect } from "./scenario-rules";
import {
  CARROCK,
  carrockAfterAttack,
  carrockTravel,
  isSacked,
} from "./carrock";
import {
  handleExpansionPlayerEffect,
  huntDefenseEffects,
  expansionShadowOptions,
} from "./expansion-player-cards";
import { emynMuilTravel, emynMuilQuestStart } from "./emyn-muil";
import {
  handleGondorPlayerEffect,
  gondorResourcesGained,
} from "./gondor-player-cards";
import {
  rhosgobelQuestStart,
  rhosgobelRoundEnd,
  rhosgobelHeal,
} from "./rhosgobel";
import {
  handleRhosgobelPlayerEffect,
  rhosgobelQuestResolved,
} from "./rhosgobel-player-cards";
import {
  handleEmynPlayerEffect,
  emynPlayerRevealReduction,
} from "./emyn-player-cards";
import { deadMarshesTravel, deadMarshesRoundEnd } from "./dead-marshes";
import {
  handleMarshPlayerEffect,
  marshPlayerShadowOptions,
} from "./marsh-player-cards";
import { handleDwarfPlayerEffect } from "./dwarf-player-cards";

import {
  returnMirkwoodEncounterStart,
  returnMirkwoodCombatStart,
  returnMirkwoodRoundEnd,
  returnMirkwoodTravel,
  returnMirkwoodUndefendedTarget,
} from "./return-mirkwood";

import {
  handleMirkwoodPlayerEffect,
  mirkwoodPlayerCombatWindow,
} from "./mirkwood-player-cards";

import {
  handleKhazadPlayerEffect,
  khazadPlayerFailedQuest,
  khazadPlayerQuestFailureAmount,
} from "./khazad-player-cards";

import { handleElfPlayerEffect } from "./elf-player-cards";

function restoreImmediateShadows(
  s: GameState,
  enemy: Unit,
  combat: NonNullable<GameState["combat"]>,
) {
  s.encounterDiscard.push(...enemy.shadows);
  enemy.shadows = [...(combat.immediatePreviousShadows ?? [])];
  enemy.faceupShadows = combat.immediatePreviousFaceupShadows?.slice();
  enemy.revealedShadowCount = combat.immediatePreviousRevealedShadowCount ?? 0;
  enemy.attacked = !!combat.immediatePreviousAttacked;
  if (combat.immediatePreviousShadowCancelsDamage)
    enemy.shadowCancelsDamage = true;
  else delete enemy.shadowCancelsDamage;
  if (combat.immediatePreviousShadowCancelsCombatDamage)
    enemy.shadowCancelsCombatDamage = true;
  else delete enemy.shadowCancelsCombatDamage;
}

export function handle(s: GameState, e: Effect) {
  const continuation = new Set(s.queue);
  handleEffect(s, e);
  const finishes = s.queue.filter(
    (effect) => effect.kind === "eventFinish" && !continuation.has(effect),
  );
  if (finishes.length) {
    const finishSet = new Set(finishes);
    s.queue = [
      ...s.queue.filter(
        (effect) => !continuation.has(effect) && !finishSet.has(effect),
      ),
      ...finishes,
      ...s.queue.filter((effect) => continuation.has(effect)),
    ];
  }
  const costForced = s.queue.filter(
    (effect) =>
      ["ettenForageDamage", "carnResourceTax"].includes(effect.kind) &&
      !continuation.has(effect),
  );
  if (costForced.length) {
    const mandatory = new Set(costForced);
    s.queue = [
      ...costForced,
      ...s.queue.filter((effect) => !mandatory.has(effect)),
    ];
  }
}

function handleEffect(s: GameState, e: Effect) {
  if (handlePaidPlayerCardEntry(s, e)) return;
  if (e.kind === "finishQuestPhase" && e.text !== "angmar-quest-end") {
    prepend(s, { ...e, text: "angmar-quest-end" });
    eachArea(s, () => {
      Etten.ettenEndQuest(s);
      prepend(s, ...Dread.dreadQuestEnd(s));
    });
    return;
  }
  if (e.kind === "startTravel" && s.mountGram?.split) startPhase(s, "travel");
  if (Wastes.wastesEffect(s, e)) return;
  if (Gram.gramEffect(s, e)) return;
  if (Etten.ettenEffect(s, e)) return;
  if (Rhudaur.rhudaurEffect(s, e)) return;
  if (Carn.carnEffect(s, e)) return;
  if (Dread.dreadEffect(s, e)) return;
  if (coreBoardResponse(s, e)) return;
  if (dunlandEffect(s, e)) return;
  if (ringMakerEffect(s, e)) return;
  if (finalRingEffect(s, e)) return;
  if (rangerEffect(s, e)) return;
  if (sideQuestEffect(s, e)) return;
  if (Chetwood.chetwoodEffect(s, e)) return;
  if (Weather.weatherEffect(s, e)) return;
  if (Dike.dikeEffect(s, e)) return;
  if (Realm.realmEffect(s, e)) return;
  if (Angmar.angmarEffect(s, e)) return;
  stewardHeroResponseEffect(s, e);
  if (handlePlayerEventAbilityEffect(s, e)) return;
  if (Druadan.handleDruadanForestEffect(s, e)) return;
  if (Amon.handleAmonDinEffect(s, e)) return;
  if (Osgiliath.assaultOsgiliathEffect(s, e)) return;
  if (BloodQuest.bloodGondorEffect(s, e)) return;
  if (MorgulQuest.morgulEffect(s, e)) return;
  if (Fords.fordsEffect(s, e)) return;
  if (Catch.catchEffect(s, e)) return;
  if (Fangorn.fangornEffect(s, e)) return;
  if (DunlandQuest.dunlandTrapEffect(s, e)) return;
  if (Trials.trialsEffect(s, e)) return;
  if (Tharbad.tharbadEffect(s, e)) return;
  if (Nin.ninEffect(s, e)) return;
  if (Celebrimbor.celebrimborEffect(s, e)) return;
  if (Antlered.antleredEffect(s, e)) return;
  if (Isengard.isengardEffect(s, e)) return;
  if (handleHeirsEffect(s, e)) return;
  if (handleStewardFearEffect(s, e)) return;
  if (handleFoundationsStoneEffect(s, e)) return;
  if (handleMorgulPlayerEffect(s, e)) return;
  if (handleOsgiliathPlayerEffect(s, e)) return;
  if (handleBloodPlayerEffect(s, e)) return;
  if (handleAmonPlayerEffect(s, e)) return;
  if (handleDruadanPlayerEffect(s, e)) return;
  if (handleStewardPlayerEffect(s, e)) return;
  if (handleHeirsPlayerEffect(s, e)) return;
  if (handleCollectorPlayerEffect(s, e)) return;
  if (handleShadowFlamePlayerEffect(s, e)) return;
  if (handleFoundationsPlayerEffect(s, e)) return;
  if (e.kind === "finishQuestPhase") rhosgobelQuestResolved(s);
  if (handleExpansionPlayerEffect(s, e)) return;
  if (handleGondorPlayerEffect(s, e)) return;
  if (handleRhosgobelPlayerEffect(s, e)) return;
  if (handleEmynPlayerEffect(s, e)) return;
  if (handleMarshPlayerEffect(s, e)) return;
  if (handleDwarfPlayerEffect(s, e)) return;
  if (handleMirkwoodPlayerEffect(s, e)) return;
  if (handleKhazadPlayerEffect(s, e)) return;
  if (handleRohanPlayerEffect(s, e)) return;
  if (handleLongDarkPlayerEffect(s, e)) return;
  if (handleWatcherPlayerEffect(s, e)) return;
  if (handleRoadPlayerEffect(s, e)) return;
  if (handleElfPlayerEffect(s, e)) return;
  if (handleRedhornPlayerEffect(s, e)) return;
  const u = get(s, e.target);
  switch (e.kind) {
    case "afterPlayerAbility":
      afterPlayerAbility(s, ...(e.effects ?? []));
      break;
    case "playerAbilityResolve":
      resolvePlayerAbility(
        s,
        {
          player: e.player ?? activeSeat(s),
          source: e.source!,
          code: e.code!,
          type: "response",
        },
        () => prepend(s, ...(e.effects ?? [])),
      );
      break;
    case "playerAbilityFinish":
      Dike.dikePlayerTriggered(s, e.player ?? activeSeat(s));
      break;
    case "allyEntryResponses":
      if (u) allyEntryResponses(s, u, !!e.flag, !!e.value);
      break;
    case "eventFinish":
      finishPlayedEvent(s, e.target!);
      break;
    case "amonSurgeWindow":
      amonPlayerSurgeRevealed(s, { ...make(s, e.code!), code: e.code! });
      break;
    case "immediateAttack": {
      if (
        !u ||
        card(u.code).type_code !== "enemy" ||
        enemyAttackPrevented(s, u)
      )
        break;
      const existingCarnShadows = Carn.carnUsesExistingShadows(s, u);
      const previous = {
        shadows: [...u.shadows],
        faceup: u.faceupShadows?.slice(),
        revealed: u.revealedShadowCount ?? 0,
        attacked: !!u.attacked,
        damage: u.shadowCancelsDamage,
        combat: u.shadowCancelsCombatDamage,
      };
      if (s.combat) s.suspendedCombats.push(s.combat);
      s.combat = {
        enemyId: u.id,
        attackPlayer: activeSeat(s),
        defenderId: null,
        defenderIds: [],
        attackBonus: 0,
        damageDealt: 0,
        ...(Trials.trialsGuardian(u)
          ? { trialsGuardianThreat: threatOf(s, u) }
          : {}),
        ...(e.damageTarget ? { undefendedTargetId: e.damageTarget } : {}),
        immediate: true,
        immediatePendingDeclaration: true,
        immediatePreviousAttacked: previous.attacked,
        ...(!existingCarnShadows
          ? {
              immediatePreviousShadows: previous.shadows,
              immediatePreviousFaceupShadows: previous.faceup,
              immediatePreviousRevealedShadowCount: previous.revealed,
              immediatePreviousShadowCancelsDamage: previous.damage,
              immediatePreviousShadowCancelsCombatDamage: previous.combat,
            }
          : {}),
      };
      if (!Carn.carnImmediateShadows(s, u, !!e.flag)) {
        u.shadows = [];
        delete u.faceupShadows;
        u.revealedShadowCount = 0;
        delete u.shadowCancelsDamage;
        delete u.shadowCancelsCombatDamage;
        const code = encounterDraw(s, true);
        if (code) {
          u.shadows.push(code);
          heirsShadowDealt(s, u);
          Carn.carnShadowDealt(s, u);
        }
      }
      prepend(
        s,
        fx("immediateChooseDefender", { target: u.id, player: activeSeat(s) }),
      );
      enemyAttackStarted(s, u, activeSeat(s));
      break;
    }
    case "immediateChooseDefender":
      if (!u) {
        prepend(s, fx("enemyDone", { flag: true }));
        break;
      }
      choose(s, `${name(u)} · Immediate attack`, [
        ...opts(defendersFor(s, u), (d) => [
          fx("immediateDefend", {
            target: u.id,
            ids: [d.id],
            player: activeSeat(s),
          }),
        ]),
        {
          id: "undefended",
          label: "Leave the attack undefended",
          effects: [
            fx("immediateDefend", {
              target: u.id,
              ids: [],
              player: activeSeat(s),
            }),
          ],
        },
      ]);
      break;
    case "immediateDefend": {
      const prior = s.combat;
      requireRule(
        u && prior?.immediate && prior.enemyId === u.id,
        "The same immediate attack must remain pending.",
      );
      beginEnemyAttack(s, u, e.ids ?? [], false, false, true);
      if (s.combat)
        Object.assign(s.combat, {
          immediate: true,
          immediatePendingDeclaration: false,
          undefendedTargetId: prior.undefendedTargetId,
          attackPlayer: prior.attackPlayer,
          immediatePreviousAttacked: prior.immediatePreviousAttacked,
          immediatePreviousShadows: prior.immediatePreviousShadows,
          immediatePreviousFaceupShadows: prior.immediatePreviousFaceupShadows,
          immediatePreviousRevealedShadowCount:
            prior.immediatePreviousRevealedShadowCount,
          immediatePreviousShadowCancelsDamage:
            prior.immediatePreviousShadowCancelsDamage,
          immediatePreviousShadowCancelsCombatDamage:
            prior.immediatePreviousShadowCancelsCombatDamage,
        });
      break;
    }
    case "startPlanning":
      startPhase(s, "planning");
      break;
    case "freeHandPlay":
      choose(s, "Play a card from your hand at no cost", [
        ...opts(
          s.hand.filter((h) => !freeHandPlayProblem(s, h)),
          (h) => [
            fx("freeHandPlayChoose", { target: h.id, player: activeSeat(s) }),
          ],
        ),
        skip,
      ]);
      break;
    case "freeHandPlayChoose": {
      const physical = s.hand.find((h) => h.id === e.target);
      if (!physical || freeHandPlayProblem(s, physical)) break;
      if (needsTarget(physical))
        choose(
          s,
          `${name(physical)} · Choose a target`,
          opts(effectCardPlayTargets(s, physical), (host) => [
            fx("freeHandPlayResolve", {
              target: physical.id,
              source: host.id,
              player: activeSeat(s),
            }),
          ]),
        );
      else
        prepend(
          s,
          fx("freeHandPlayResolve", {
            target: physical.id,
            player: activeSeat(s),
          }),
        );
      break;
    }
    case "freeHandPlayResolve":
      if (e.target) playCardFromHandEffect(s, e.target, e.source);
      break;
    case "finishQuestDefeat":
      if (s.pendingQuestDefeat === e.code) delete s.pendingQuestDefeat;
      break;
    case "roadAttackers":
      for (const id of e.ids ?? []) {
        const a = get(s, id);
        if (a) roadPlayerAttackerDeclared(s, a);
      }
      break;
    case "redhornDefenders":
      for (const id of e.ids ?? []) {
        const d = get(s, id);
        if (d) redhornPlayerDefenderDeclared(s, d);
      }
      break;
    case "questSucceeded": {
      const first = firstPlayer(s);
      prepend(
        s,
        ...(s.scenarioId === "hunt-for-gollum" && s.stage === 1
          ? [fx("huntLook", { count: 3, player: first })]
          : []),
        fx("questSuccessResponses", { player: first }),
        ...(s.scenarioId === "hunt-for-gollum"
          ? [fx("huntClaim", { player: first })]
          : []),
        ...(s.catchOrc
          ? [fx("catchQuestResponse", { value: e.value, player: first })]
          : []),
        fx("successfulQuestProgress", { value: e.value, player: first }),
        ...(s.catchOrc
          ? [fx("catchQuestProgressDone", { player: first })]
          : []),
      );
      break;
    }
    case "questSuccessResponses":
      redhornPlayerQuestSucceeded(s);
      rohanQuestSucceeded(s);
      break;
    case "successfulQuestProgress":
      progress(s, e.value ?? 0, false, true);
      break;
    case "allocateActiveProgress": {
      const pending = s.queue.length;
      if (u && allActiveLocations(s).some((l) => l.id === u.id)) {
        if (
          longDarkProgressLocation(
            s,
            u,
            e.value ?? 0,
            e.count
              ? [
                  fx("continueProgress", {
                    value: e.count,
                    flag: e.flag,
                    text: e.text,
                    player: e.player,
                  }),
                ]
              : [],
          )
        )
          break;
        progressLocation(s, u, e.value ?? 0);
      }
      if (e.count)
        s.queue.splice(
          s.queue.length - pending,
          0,
          fx("continueProgress", {
            value: e.count,
            flag: e.flag,
            text: e.text,
            player: e.player,
          }),
        );
      break;
    }
    case "continueProgress":
      progress(s, e.value ?? 0, !!e.flag, e.text === "quest");
      break;
    case "activeLocationEffect": {
      const locations = allActiveLocations(s);
      if (!locations.length) break;
      const next = (location: Unit) => ({
        ...e,
        kind: e.text!,
        target: location.id,
        text: undefined,
      });
      if (locations.length === 1) prepend(s, next(locations[0]));
      else {
        selectSeat(s, firstPlayer(s));
        choose(
          s,
          "Choose the active location",
          opts(locations, (l) => [next(l)]),
          "This effect targets one active location. The first player chooses.",
        );
      }
      break;
    }
    case "failedQuest":
      if (Angmar.angmarPreventQuestThreat(s)) {
        log(
          s,
          "Doom Hangs Still prevents threat from this unsuccessful quest.",
          "good",
        );
        break;
      }
      if (e.text !== "heirsFailureResolved") {
        const continuationCount = s.queue.length;
        if (heirsQuestFailed(s)) break;
        const forced = s.queue.splice(0, s.queue.length - continuationCount);
        if (forced.length) {
          prepend(s, ...forced, { ...e, text: "heirsFailureResolved" });
          break;
        }
      }
      if (
        s.scenarioId === "the-long-dark" &&
        !e.flag &&
        e.text !== "longDarkLostResolved"
      ) {
        prepend(s, { ...e, text: "longDarkLostResolved" });
        longDarkQuestFailed(s);
        break;
      }
      if (!e.flag && khazadPlayerFailedQuest(s, e.value ?? 0)) break;
      eachSeat(s, (player) =>
        raiseThreat(
          s,
          khazadPlayerQuestFailureAmount(s, player, e.value ?? 0),
          "quest-failure",
        ),
      );
      for (const jailor of s.staging.filter((u) => u.code === "01101"))
        prepend(s, fx("jailor", { source: jailor.id }));
      log(
        s,
        `Quest fails by ${e.value}. Each unprotected player raises threat.`,
        "danger",
      );
      break;
    case "mirkwoodCombatWindow":
      mirkwoodPlayerCombatWindow(s);
      break;
    case "commitSeat": {
      if (!passSeat(s)) break;
      if (Angmar.angmarSkipQuest(s)) {
        log(s, "Doom Hangs Still · Skip the quest phase.", "good");
        prepend(s, fx("finishQuestPhase", { player: firstPlayer(s) }));
        break;
      }
      if (Gram.gramBeginStaging(s)) break;
      if (foundationsBeginStaging(s)) break;
      const reveals = rohanRevealReduction(
        s,
        emynPlayerRevealReduction(
          s,
          s.scenarioId === "anduin" && s.stage === 3
            ? 0
            : livingSeats(s).length +
                (s.scenarioId === "anduin" && s.stage === 2 ? 1 : 0) +
                heirsStagingCountBonus(s) +
                Weather.weatherStagingCountBonus(s) +
                Etten.ettenExtraReveals(s) +
                stewardFearExtraRevealCount(s),
        ),
      );
      const player = firstPlayer(s);
      khazadBeforeStaging(s);
      enqueue(
        s,
        ...Array.from({ length: reveals }, () => fx("reveal", { player })),
        fx("khazadStagingEnd", { player }),
        fx("questReady", { player }),
      );
      break;
    }
    case "bats":
      choose(
        s,
        "Black Forest Bats",
        opts(
          characters(s).filter((u) => u.committed),
          (u) => [fx("uncommit", { target: u.id })],
        ),
        "Remove one of this player’s characters from the quest.",
      );
      break;
    case "venom": {
      const most = Math.max(0, ...s.heroes.map((h) => h.damage));
      choose(s, "Lingering Venom", [
        {
          id: "exhaust",
          label: "Exhaust every damaged character you control",
          effects: characters(s)
            .filter((x) => x.damage > 0)
            .map((x) => fx("exhaust", { target: x.id })),
        },
        ...opts(
          s.heroes.filter((h) => h.damage === most),
          (h) => [fx("damage", { target: h.id, value: 2 })],
          () => "Deal 2 damage to this most-damaged hero",
        ),
      ]);
      break;
    }
    case "recoverAttachment": {
      if (dikeCannotLeaveDiscard(s)) break;
      const i = s.discard.lastIndexOf(e.code!);
      if (i >= 0) s.hand.push(takePlayerDiscard(s, i));
      break;
    }
    case "searchPlayer":
      choose(
        s,
        "Gandalf’s Search",
        s.deck.slice(0, e.value).map((code, i) => ({
          id: `search-${i}`,
          code,
          label: card(code).name,
          effects: [fx("searchTake", { code, value: i, count: e.value })],
        })),
        "Add one card to its owner’s hand, then order the rest on top of the deck.",
      );
      break;
    case "rainOfArrows":
      for (const enemy of [...engagedEnemies(s)]) damage(s, enemy.id, 1);
      break;
    case "standTogether":
      s.standTogether = true;
      break;
    case "hospitality":
      s.heroes.forEach((h) => {
        rhosgobelHeal(s, h, h.damage, { code: "01068" });
      });
      break;
    case "feintEnemy":
      if (u) {
        const player = e.value ?? activeSeat(s);
        u.preventedAttacks = [
          ...new Set([...(u.preventedAttacks ?? []), player]),
        ];
        if (!s.staging.some((enemy) => enemy.id === u.id)) u.feinted = true;
        advanceDefense(s);
      }
      break;
    case "thicket":
      engagedEnemies(s).forEach((enemy) => {
        enemy.preventedAttacks = [
          ...new Set([...(enemy.preventedAttacks ?? []), activeSeat(s)]),
        ];
        if (!s.staging.some((u) => u.id === enemy.id)) enemy.feinted = true;
      });
      break;
    case "discardShackles":
      if (s.shackles > 0) {
        s.shackles--;
        s.encounterDiscard.push("01105");
        log(s, "Miner of the Iron Hills discards Iron Shackles.", "good");
      }
      break;
    case "payPass":
      for (let i = 0; i < 2; i++) {
        const index = Math.floor(random(s) * s.hand.length);
        discardHandCard(s, s.hand[index].id);
      }
      log(
        s,
        "Necromancer’s Pass discards 2 random cards to pay its travel cost.",
      );
      break;
    case "playerAttackResolved":
      if (u)
        playerAttackResolved(s, u, e.ids ?? [], e.value ?? 0, e.count ?? 0);
      break;
    case "travelEnter":
      if (
        u &&
        redhornCanMakeActive(u) &&
        !Trials.trialsCannotMakeActive(s, u) &&
        !Tharbad.tharbadCannotMakeActive(u) &&
        !Etten.ettenTravelProblem(s, u) &&
        s.staging.some((x) => x.id === u.id)
      ) {
        s.staging = s.staging.filter((x) => x.id !== u.id);
        const priorActive = allActiveLocations(s);
        s.activeLocation = u;
        s.extraActiveLocations = [
          "strider-replace",
          "osgiliath-second",
        ].includes(e.text ?? "")
          ? priorActive
          : [];
        returnMirkwoodTravel(s, u);
        roadRivendellTravelEntered(s, u);
        longDarkPlayerTravelled(s, u);
        watcherWaterTravelEntered(s, u);
        stewardFearTravelEntered(s, u);
        Fords.fordsTravelEntered(s, u);
        Trials.trialsTravelEntered(s, u);
        Tharbad.tharbadTravelEntered(s, u);
        Etten.ettenTravelEntered(s, u);
        Gram.gramTraveled(s, u);
        Gram.gramActiveLocationChanged(s, u);
        Angmar.angmarTraveled(s);
        log(s, `Travelled to ${name(u)}.`, "good");
        if (u.code === "01087") progressLocation(s, u, 1);
        if (u.code === "01107") eachSeat(s, () => orcGuard(s));
        const responses = [
          ...(u.code === "01099"
            ? [fx("travelReady", { player: firstPlayer(s) })]
            : []),
          ...(u.code === "01100"
            ? [fx("draw", { value: 2, player: firstPlayer(s) })]
            : []),
          ...playerOrder(s).map((player) =>
            fx("strengthOfWill", { target: u.id, player }),
          ),
          ...(e.flag ? [] : [fx("travelDone", { player: firstPlayer(s) })]),
        ];
        if (e.flag) prepend(s, ...responses);
        else enqueue(s, ...responses);
        carrockTravel(s, u);
        emynMuilTravel(s, u);
        deadMarshesTravel(s, u);
      }
      break;
    case "reshufflePlayer":
      if (dikeCannotLeaveDiscard(s)) break;
      while (s.discard.length) putPlayerDeck(s, takePlayerDiscard(s, 0));
      shuffle(s, s.deck);
      break;
    case "faramir":
      characters(s).forEach((u) => {
        u.tempWill = (u.tempWill ?? 0) + 1;
      });
      break;
    case "transferTook":
      if (u && e.value !== undefined) {
        eachSeat(s, () => {
          s.used.push(`took:${u.id}`);
        });
        const from = ownerOf(s, u);
        forOwner(s, from, () => {
          s.allies = s.allies.filter((a) => a.id !== u.id);
          reduceThreat(s, 3, {
            id: u.id,
            code: u.code,
            owner: u.owner ?? from,
          });
        });
        forOwner(s, e.value, () => {
          s.allies.push(u);
          raiseThreat(s, 3, "player-card");
        });
      }
      break;
    case "eowynDiscard": {
      const h = s.hand.find((x) => x.id === e.target);
      if (h) {
        discardHandCard(s, h.id);
        const eowyn = allHeroes(s).find((x) => x.code === "01007");
        if (eowyn) eowyn.boost++;
        s.eowynUsed = true;
        log(s, "Éowyn gains +1 willpower this phase.", "good");
      }
      break;
    }
    case "resource":
      if (u && !((e.value ?? 1) > 0 && !canGainResources(s, u))) {
        const amount = e.value ?? 1;
        if (amount < 0 && e.flag) spendResources(s, u, -amount);
        else u.resources += amount;
        gondorResourcesGained(s, u, amount, true);
      }
      break;
    case "ready":
      if (u) readyCharacter(s, u);
      break;
    case "exhaust":
      if (u) {
        requireRule(
          !khazadCannotExhaust(u),
          "Shadow of Fear prevents exhausting this hero.",
        );
        exhaustCharacter(s, u);
      }
      break;
    case "damage":
      if (u) damage(s, u.id, e.value ?? 0);
      break;
    case "draw":
      draw(s, e.value ?? 1);
      break;
    case "threat":
      if ((e.value ?? 0) > 0) raiseThreat(s, e.value!, "player-card");
      else
        reduceThreat(
          s,
          -(e.value ?? 0),
          e.source || e.code
            ? { id: e.source, code: e.code, owner: e.owner }
            : undefined,
        );
      break;
    case "uncommit":
      if (u) u.committed = false;
      break;
    case "web":
      if (u)
        u.attachments.push({
          id: `a${s.nextId++}`,
          code: "01080",
          exhausted: false,
        });
      break;
    case "eventPlay": {
      const physical = s.hand.find(
        (u) => u.code === e.code && (!e.source || u.id === e.source),
      );
      if (
        physical &&
        !s.queue.some(
          (effect) =>
            effect.kind === "playerAbilityFinish" &&
            effect.source === physical.id,
        )
      ) {
        resolvePlayerAbility(
          s,
          {
            player: e.player ?? activeSeat(s),
            source: physical.id,
            code: physical.code,
            type: "response",
          },
          () => prepend(s, { ...e, source: physical.id }),
        );
        break;
      }
      if (e.costEffects?.length) {
        prepend(s, ...e.costEffects, { ...e, costEffects: undefined });
        break;
      }
      const continuationCount = s.queue.length;
      const resolved = spendEvent(
        s,
        e.code!,
        e.source,
        e.code === "08005" ? e.value : 0,
      );
      const mandatory = s.queue.splice(0, s.queue.length - continuationCount);
      const finish = mandatory.filter(
        (effect) => effect.kind === "eventFinish",
      );
      // A canceled event still paid and initiated its ability; the original
      // framework resumes only after that ability and its Gate Forced finish.
      if (!resolved) afterPlayerAbility(s, ...(e.cancelledEffects ?? []));
      prepend(
        s,
        ...mandatory.filter((effect) => effect.kind !== "eventFinish"),
        ...(resolved ? (e.effects ?? []) : []),
        ...finish,
      );
      break;
    }
    case "spendEvent":
      spendEvent(s, e.code!);
      break;
    case "resolveReveal":
      resolveReveal(
        s,
        e.code!,
        e.source,
        e.revealOrigin,
        e.flag,
        e.count,
        e.value,
      );
      break;
    case "afterEncounterRevealed":
      Chetwood.chetwoodAfterReveal(s, e.code!, e.revealOrigin);
      Dike.dikeAfterReveal(s, e.code!, e.revealOrigin);
      Weather.weatherAfterReveal(s, e.code!);
      stewardFearTreacheryRevealed(s, e.code!, e.revealOrigin);
      Amon.amonDinTreacheryRevealed(s, e.code!, e.revealOrigin);
      Rhudaur.rhudaurAfterReveal(s, e.code!, e.revealOrigin);
      Carn.carnAfterReveal(s, e.code!, e.revealOrigin);
      break;
    case "revealCard":
      if (e.code)
        revealed(
          s,
          e.code,
          e.source,
          e.revealOrigin,
          e.text === "angmar-resume",
        );
      break;
    case "placeEncounter":
      placeEncounter(
        s,
        e.code!,
        e.flag,
        e.value,
        e.source,
        e.text === "revealed",
        e.revealOrigin,
        e.count,
      );
      break;
    case "reveal": {
      const code = encounterDraw(s);
      if (code) revealed(s, code, e.source, e.revealOrigin);
      break;
    }
    case "resolvePrintedWhenRevealed":
      if (e.code)
        requireRule(
          Wastes.wastesEncounter(s, e.code, true) ||
            Gram.gramEncounter(s, e.code, true) ||
            Etten.ettenEncounter(s, e.code, true) ||
            Rhudaur.rhudaurEncounter(s, e.code, true) ||
            Carn.carnEncounter(s, e.code, true) ||
            Dread.dreadEncounter(s, e.code, true) ||
            Druadan.druadanForestEncounter(s, e.code, true) ||
            Amon.amonDinEncounter(s, e.code, true) ||
            Osgiliath.assaultOsgiliathEncounter(s, e.code, true) ||
            BloodQuest.bloodGondorEncounter(s, e.code, true) ||
            MorgulQuest.morgulEncounter(s, e.code, true) ||
            Fords.fordsEncounter(s, e.code, true) ||
            Catch.catchEncounter(s, e.code, true) ||
            Fangorn.fangornEncounter(s, e.code, true) ||
            DunlandQuest.dunlandEncounter(s, e.code, true) ||
            Trials.trialsEncounter(s, e.code, true) ||
            Tharbad.tharbadEncounter(s, e.code, true) ||
            Nin.ninEncounter(s, e.code, true) ||
            Celebrimbor.celebrimborEncounter(s, e.code, true) ||
            Antlered.antleredEncounter(s, e.code, true) ||
            Chetwood.chetwoodEncounter(s, e.code, true) ||
            Weather.weatherEncounter(s, e.code, true) ||
            Dike.dikeEncounter(s, e.code, true) ||
            heirsEncounter(s, e.code, true) ||
            stewardFearEncounter(s, e.code, true),
          "Unsupported repeated When Revealed effect.",
        );
      break;
    case "engage":
      if (u) engage(s, u);
      break;
    case "locationProgress":
      if (u && !playerCardImmune(u)) progressLocation(s, u, e.value ?? 0);
      break;
    case "discardAttachment": {
      const a = u?.attachments.find((a) => a.id === e.source);
      if (u && a) discardAttachment(s, u, a);
      break;
    }
    case "chooseExhaust": {
      const available = characters(s).filter((u) => !u.exhausted);
      choose(
        s,
        "Choose a character to exhaust",
        opts(available, (u) => [
          fx("exhaust", { target: u.id }),
          ...((e.count ?? 1) > 1
            ? [fx("chooseExhaust", { count: (e.count ?? 1) - 1 })]
            : []),
        ]),
      );
      break;
    }
    case "chooseDamage":
      choose(
        s,
        `Assign ${e.value} damage`,
        opts(e.flag ? s.heroes : characters(s), (u) => [
          fx("damage", { target: u.id, value: e.value }),
        ]),
        e.flag ? "All damage must be assigned to a single hero." : undefined,
      );
      break;
    case "gandalf":
      choosePlayerResponse(
        s,
        e.source!,
        e.code ?? "01073",
        "Gandalf has arrived",
        [
          ...(ninNoCardEconomy(s)
            ? []
            : [
                {
                  id: "draw",
                  label: "Draw 3 cards",
                  effects: [fx("draw", { value: 3 })],
                },
              ]),
          {
            id: "threat",
            label: "Reduce threat by 5",
            effects: [
              fx("threat", {
                value: -5,
                source: e.source,
                code: e.code ?? "01073",
              }),
            ],
          },
          ...opts(
            [...s.staging, ...allEngaged(s)].filter(
              (u) => card(u.code).type_code === "enemy",
            ),
            (u) => [fx("damage", { target: u.id, value: 4 })],
            () => "Deal 4 damage",
          ),
          ...(s.scenarioId === "deadmens-dike" &&
          allActiveLocations(s).some(
            (location) => location.code === DIKE.gate && !location.blanked,
          )
            ? [skip]
            : []),
        ],
      );
      break;
    case "mountainReward": {
      const top = s.deck.slice(0, 5);
      choose(
        s,
        "Beyond the Mountains of Mirkwood",
        top.map((code, i) => ({
          id: `top${i}`,
          label: card(code).name,
          code,
          effects: [fx("takeSearched", { code, value: i })],
        })),
        "Choose one of the top five cards. The rest are shuffled back into your deck.",
      );
      break;
    }
    case "takeSearched": {
      s.hand.push(takePlayerDeck(s, e.value!));
      shuffle(s, s.deck);
      break;
    }
    case "findSpider": {
      const codes = [
        ...new Set(
          [...s.encounterDeck, ...s.encounterDiscard].filter((code) =>
            card(code).traits?.includes("Spider"),
          ),
        ),
      ];
      choose(
        s,
        "Don’t Leave the Path!",
        codes.map((code) => ({
          id: code,
          code,
          label: card(code).name,
          effects: [fx("fetchSpider", { code })],
        })),
        "Choose a Spider from the encounter deck or discard pile to add to staging. Defeat Ungoliant’s Spawn to win.",
      );
      break;
    }
    case "fetchSpider": {
      const pile = s.encounterDeck.includes(e.code!)
        ? s.encounterDeck
        : s.encounterDiscard;
      pile.splice(pile.indexOf(e.code!), 1);
      const spider = make(s, e.code!);
      s.staging.push(spider);
      enemyAddedToStaging(s, spider);
      shuffle(s, s.encounterDeck);
      log(s, `${card(e.code!).name} emerges from the trees.`, "danger");
      break;
    }
    case "theodred": {
      const theodred = s.heroes.find(
        (hero) => hero.code === "01002" && !hero.blanked && !isSacked(hero),
      );
      if (!theodred) break;
      choosePlayerResponse(
        s,
        theodred.id,
        theodred.code,
        "Théodred’s response",
        [
          ...opts(
            allHeroes(s).filter((u) => u.committed && !isSacked(u)),
            (u) => [
              fx("resource", {
                target: u.id,
                value: 1,
                source: s.heroes.find((h) => h.code === "01002")?.id,
                code: "01002",
              }),
            ],
          ),
          skip,
        ],
        "Give 1 resource to a hero committed to the quest.",
      );
      break;
    }
    case "aragorn": {
      const a = s.heroes.find((h) => h.code === "01001");
      if (
        a?.committed &&
        a.exhausted &&
        a.resources > 0 &&
        !isSacked(a) &&
        heirsCanSpendResources(s, a)
      )
        choosePlayerResponse(s, a.id, a.code, "Aragorn’s response", [
          {
            id: "ready",
            label: "Spend 1 resource to ready Aragorn",
            code: a.code,
            effects: [
              fx("resource", {
                target: a.id,
                value: -1,
                source: a.id,
                code: a.code,
                flag: true,
              }),
              fx("ready", { target: a.id }),
            ],
          },
          skip,
        ]);
      break;
    }
    case "khazadStagingEnd":
      khazadStagingEnd(s);
      break;
    case "resolveQuestResult":
      resolveQuestResult(s);
      break;
    case "questReady":
      if (!e.flag && Chetwood.chetwoodEndStaging(s)) break;
      if (e.text !== "angmar-staging-end") {
        prepend(s, { ...e, text: "angmar-staging-end" });
        Dread.dreadStagingEnd(s);
        break;
      }
      if (Osgiliath.assaultOsgiliathPrepareQuest(s, e)) break;
      s.phase = "staging";
      log(
        s,
        "An encounter has been revealed. Use actions, then resolve the quest.",
      );
      break;
    case "removeQuestTime":
      removeQuestTime(s, e.value ?? 1);
      break;
    case "phaseEnd":
      phaseEnd(s);
      if (s.phase === "refresh") {
        Trials.trialsRemoveEnemyTime(s);
        Chetwood.chetwoodRefreshEnd(s);
        Weather.weatherRefreshEnd(s);
        Dike.dikeRefreshEnd(s);
        Gram.gramRefreshEnd(s);
        eachArea(s, () => Dread.dreadRefreshEnd(s));
      }
      if (
        s.phase === "refresh" &&
        !Antlered.antleredRefreshTime(s) &&
        !Fangorn.fangornRefreshTime(s)
      )
        removeQuestTime(s);
      break;
    case "ninCommitAfterCost":
      commitCharacters(s);
      break;
    case "startQuest":
      if (Angmar.angmarSkipQuest(s)) {
        log(s, "Doom Hangs Still · Skip the quest phase.", "good");
        prepend(s, fx("startTravel", { player: firstPlayer(s) }));
        break;
      }
      startPhase(s, "quest");
      emynMuilQuestStart(s);
      rhosgobelQuestStart(s);
      rohanQuestBegins(s);
      heirsQuestStart(s);
      BloodQuest.bloodGondorQuestStart(s);
      Tharbad.tharbadQuestStart(s);
      s.lastQuest = null;
      log(s, "Quest phase · Choose characters to commit.");
      if (s.scenarioId === "dol-guldur" && s.stage === 3)
        eachSeat(s, () => orcGuard(s));
      if (s.scenarioId === "hunt-for-gollum" && s.stage === 2)
        prepend(s, fx("huntLook", { count: 2, player: firstPlayer(s) }));
      Chetwood.chetwoodQuestStart(s);
      Weather.weatherQuestStart(s);
      Rhudaur.rhudaurQuestStart(s);
      // Ettenmoors may first find a missing encounter side quest.
      prepend(s, fx("sideQuestStart", { player: firstPlayer(s) }));
      Etten.ettenQuestStart(s);
      break;
    case "startTravel":
      startPhase(s, "travel");
      break;
    case "startEncounter":
      startPhase(s, "encounter");
      returnMirkwoodEncounterStart(s);
      Catch.catchEncounterStart(s);
      globalEachSeat(s, () => {
        s.optionalEngagement = false;
      });
      break;
    case "allyDeparture":
      if (u?.temporary && u.beornReturn) {
        selectSeat(s, firstPlayer(s));
        choose(
          s,
          `Beorn · Choose the first end-of-phase effect`,
          [
            {
              id: "hand",
              label: "Sneak Attack · Return Beorn to his owner's hand",
              code: u.code,
              effects: [fx("returnAlly", { target: u.id })],
            },
            {
              id: "deck",
              label: "Beorn's fury · Shuffle Beorn into his owner's deck",
              code: u.code,
              effects: [fx("returnAllyDeck", { target: u.id })],
            },
          ],
          "Both effects are due now. The first player chooses; leaving play ends the other effect.",
        );
      } else if (u) returnAlly(s, u, !!u.beornReturn);
      break;
    case "returnAllyDeck":
      if (u) returnAlly(s, u, true);
      break;
    case "endCombat":
      MorgulQuest.morgulCombatEnd(s);
      eachArea(s, () => {
        for (const enemy of [
          ...allEngaged(s),
          ...s.staging.filter((u) => card(u.code).type_code === "enemy"),
        ]) {
          if (Carn.carnCombatEndShadows(s, enemy)) continue;
          delete enemy.shadowCancelsDamage;
          delete enemy.shadowCancelsCombatDamage;
          if (s.staging.some((u) => u.id === enemy.id)) {
            s.encounterDiscard.push(...enemy.shadows);
            enemy.shadows = [];
            delete enemy.faceupShadows;
            enemy.revealedShadowCount = 0;
          }
        }
      });
      globalEachSeat(s, () => {
        for (const enemy of s.engaged) {
          if (Carn.carnCombatEndShadows(s, enemy)) {
            enemy.attacked = false;
            continue;
          }
          s.encounterDiscard.push(...enemy.shadows);
          enemy.shadows = [];
          delete enemy.faceupShadows;
          enemy.revealedShadowCount = 0;
          enemy.attacked = false;
        }
      });
      if (s.pendingWolfReturns?.length) {
        s.encounterDeck.unshift(...s.pendingWolfReturns);
        log(
          s,
          `${s.pendingWolfReturns.length} Wolf Rider shadow card(s) return to the encounter deck at the end of combat.`,
        );
        s.pendingWolfReturns = [];
      }
      prepend(
        s,
        ...playerOrder(s).flatMap((player) =>
          s.staging
            .filter((u) => u.code === "01083")
            .map((u) => fx("chooseDamage", { value: 1, source: u.id, player })),
        ),
        ...DunlandQuest.dunlandCombatEndEffects(s),
        fx("khazadCombatEnd"),
        fx("refreshReady"),
      );
      break;
    case "khazadCombatEnd":
      khazadCombatEnd(s);
      watcherWaterCombatEnd(s);
      break;
    case "refreshReady":
      if (!e.flag) {
        startPhase(s, "refresh");
        const effects = Tharbad.tharbadRefreshStart(s);
        if (effects.length) {
          prepend(s, ...effects, fx("refreshReady", { flag: true }));
          break;
        }
      }
      s.refreshReadied = {};
      globalEachSeat(s, (player) => {
        const fangornReady = Fangorn.fangornRefreshCharacters(s, player);
        for (const u of characters(s)) {
          u.committed = false;
          u.attacked = false;
          u.boost = 0;
          for (const a of u.attachments) a.exhausted = false;
          if (!fangornReady) {
            if (!has(u, "01080")) readyCharacter(s, u);
            else enqueue(s, fx("webRefresh", { target: u.id, player }));
          }
        }
        s.eowynUsed = false;
        if (fangornReady) enqueue(s, ...fangornReady);
      });
      enqueue(s, fx("refreshEnd"));
      break;
    case "endRound": {
      const passives: Effect[] = ringMakerRoundEnd(s),
        forced: Effect[] = [];
      eachArea(s, () => {
        passives.push(...bloodPlayerRoundEndEffects(s));
        passives.push(...Isengard.isengardRoundEnd(s));
        passives.push(...Angmar.angmarRoundEnd(s));
        forced.push(...Dread.dreadRoundEnd(s));
        forced.push(...collectorRoundEndEffects(s));
        forced.push(...Amon.amonDinRoundEndEffects(s));
        forced.push(
          ...BloodQuest.bloodGondorRoundEnd(s),
          ...MorgulQuest.morgulRoundEnd(s),
        );
        for (const effect of stewardFearRoundEndEffects(s)) {
          (effect.kind === "stewardCounsels" ? passives : forced).push(effect);
        }
      });
      prepend(s, ...passives, ...forced, fx("endRoundAfterCollector"));
      break;
    }
    case "endRoundAfterCollector": {
      const before = s.queue.length;
      eachArea(s, () => {
        Wastes.wastesEndRound(s);
        Carn.carnEndRound(s);
      });
      const added = s.queue.length - before;
      if (added)
        s.queue.splice(
          added,
          0,
          fx("endRoundScenarioDone", { player: firstPlayer(s) }),
        );
      else handleEffect(s, fx("endRoundScenarioDone"));
      break;
    }
    case "endRoundScenarioDone":
      Antlered.antleredEndRound(s);
      Nin.ninEndRound(s);
      shadowFlameRoundEnd(s);
      longDarkRoundEnd(s);
      watcherWaterRoundEnd(s);
      khazadRoundEnd(s);
      redhornRoundEnd(s);
      roadRivendellRoundEnd(s);
      eachArea(s, () => rohanRoundEnd(s));
      deadMarshesRoundEnd(s);
      rhosgobelRoundEnd(s);
      returnMirkwoodRoundEnd(s);
      if (s.status !== "playing") break;
      s.mendorBoost = false;
      globalEachSeat(s, () => {
        for (const ally of [...s.allies])
          if (ally.code === "01073") {
            s.allies = s.allies.filter((a) => a.id !== ally.id);
            for (const a of [...ally.attachments])
              discardAttachment(s, ally, a, true);
            seatView(s, ally.owner ?? activeSeat(s)).discard.push(ally.code);
            enqueue(s, fx("valiant"));
            const owner = ally.owner ?? activeSeat(s);
            characterLeftPlay(s, ally, activeSeat(s), {
              zone: "discard",
              player: owner,
              index: seatView(s, owner).discard.length - 1,
            });
            log(s, "Gandalf departs at the end of the round.");
          }
        for (const h of [...s.heroes]) {
          if (has(h, "01109")) raiseThreat(s, 2, "encounter");
          if (has(h, "01110")) damage(s, h.id, 1);
        }
      });
      eachArea(s, () => {
        for (const location of allActiveLocations(s).filter(
          (l) => l.code === "02017",
        )) {
          location.progress = Math.max(0, location.progress - 1);
          removeCurrentQuestProgress(s, 1);
          log(
            s,
            "River Ninglor washes away 1 progress from itself and the quest.",
            "danger",
          );
        }
        for (const enemy of [...s.staging, ...allEngaged(s)]) {
          enemy.boost = 0;
          delete enemy.tempEngagement;
          delete enemy.roundAttack;
        }
      });
      Osgiliath.assaultOsgiliathRoundEnd(s);
      enqueue(s, fx("nextRound"));
      break;
    case "resourceCollect":
      collectResources(s);
      break;
    case "nextRound":
      nextRound(s);
      break;
    case "travelDone":
      prepend(s, fx("phaseEnd"), fx("startEncounter"));
      break;
    case "travelReady":
      choose(
        s,
        "Old Forest Road",
        [
          ...opts(
            seatView(s, firstPlayer(s))
              .heroes.concat(seatView(s, firstPlayer(s)).allies)
              .filter((u) => u.exhausted),
            (u) => [fx("ready", { target: u.id })],
          ),
          skip,
        ],
        "You may ready one character.",
      );
      break;
    case "travelExhaust":
      choose(
        s,
        "Great Forest Web",
        opts(
          s.heroes.filter((u) => !u.exhausted),
          (u) => [fx("exhaust", { target: u.id })],
        ),
        "Exhaust one hero to pay the travel cost.",
      );
      break;
    case "engagementRound": {
      if (
        druadanPlayerNoEngagementChecks(s) ||
        heirsNoEngagementChecks(s) ||
        Tharbad.tharbadNoEngagementChecks(s) ||
        Chetwood.chetwoodNoEngagementChecks(s) ||
        !Wastes.wastesEngagementChecksAllowed(s) ||
        Etten.ettenNoEngagementChecks(s)
      )
        break;
      if (s.scenarioId === "anduin" && s.stage === 2) break;
      const eligible = playerOrder(s).some((i) =>
        s.staging.some(
          (u) =>
            card(u.code).type_code === "enemy" &&
            !Carn.carnCannotEngage(s, u) &&
            amonPlayerCanEngage(s, u, i) &&
            shadowFlameCanMove(s, u) &&
            khazadAutoEngageAllowed(s, u) &&
            !heirsPlayerNoEngagementCheck(u) &&
            u.noEngagementRound !== s.round &&
            !longDarkPlayerIgnoreEngagement(s, u) &&
            engagementCost(s, u) <= seatView(s, i).threat,
        ),
      );
      if (eligible)
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("automaticEngagement", { player }),
          ),
          fx("engagementRound"),
        );
      break;
    }
    case "engagementAllAreas": {
      const rounds: Effect[] = [];
      eachArea(s, () =>
        rounds.push(fx("engagementRound", { player: firstPlayer(s) })),
      );
      prepend(s, ...rounds);
      break;
    }
    case "automaticEngagement": {
      if (
        druadanPlayerNoEngagementChecks(s) ||
        heirsNoEngagementChecks(s) ||
        Tharbad.tharbadNoEngagementChecks(s) ||
        Chetwood.chetwoodNoEngagementChecks(s) ||
        !Wastes.wastesEngagementChecksAllowed(s) ||
        Etten.ettenNoEngagementChecks(s)
      )
        break;
      const enemy = s.staging
        .filter(
          (u) =>
            card(u.code).type_code === "enemy" &&
            !Carn.carnCannotEngage(s, u) &&
            amonPlayerCanEngage(s, u, activeSeat(s)) &&
            !celebrimborProtected(s, u) &&
            shadowFlameCanMove(s, u) &&
            khazadAutoEngageAllowed(s, u) &&
            !heirsPlayerNoEngagementCheck(u) &&
            u.noEngagementRound !== s.round &&
            !longDarkPlayerIgnoreEngagement(s, u) &&
            engagementCost(s, u) <= s.threat,
        )
        .sort((a, b) => engagementCost(s, b) - engagementCost(s, a))[0];
      if (enemy && !s.table?.seats[activeSeat(s)].eliminated) engage(s, enemy);
      break;
    }
    case "startCombat":
      startPhase(s, "defense");
      if (!e.flag && returnMirkwoodCombatStart(s)) break;
      prepend(
        s,
        fx("combatStartEffects"),
        fx("prepareCombat", { player: firstPlayer(s) }),
      );
      BloodQuest.bloodGondorCombatStart(s);
      rohanCombatBegins(s);
      break;
    case "combatStartEffects":
      heirsCombatStart(s);
      Druadan.druadanForestCombatStart(s);
      Fangorn.fangornCombatStart(s);
      Tharbad.tharbadCombatStart(s);
      break;
    case "prepareCombat":
      globalEachSeat(s, () => {
        for (const enemy of [...s.engaged].sort(
          (a, b) => engagementCost(s, b) - engagementCost(s, a),
        )) {
          prepareEnemyShadows(s, enemy);
        }
      });
      for (const enemy of s.staging.filter((u) =>
        playerOrder(s).some((p) => consideredEngaged(s, u, p)),
      ))
        prepareEnemyShadows(s, enemy);
      {
        const early = globalPlayerOrder(s).filter((player) =>
          rohanOathPlayers(seatView(s, player)).includes(player),
        );
        if (early.length) {
          s.earlyAttackPlayers = early;
          s.phase = "attack";
          if (s.table) {
            s.table.turn = early[0];
            s.table.passed = [];
          }
          selectSeat(s, early[0]);
          log(
            s,
            "Oath of Eorl · These fellowships attack before enemy attacks.",
            "good",
          );
        } else advanceDefense(s);
      }
      break;
    case "shadowReveal": {
      const enemy = get(s, s.combat?.enemyId);
      if (!enemy) break;
      const unrevealed = enemy.shadows.slice(enemy.revealedShadowCount ?? 0);
      if (!unrevealed.includes(e.code!)) break;
      enemy.revealedShadowCount = (enemy.revealedShadowCount ?? 0) + 1;
      const shadowText = Carn.carnShadowText(s, e.code!);
      // This completion survives cancellation of the triggered shadow effect.
      prepend(
        s,
        fx("shadowResolved", {
          code: e.code,
          source: enemy.id,
          player: s.combat?.attackPlayer ?? activeSeat(s),
        }),
      );
      log(
        s,
        `Shadow: ${card(e.code!).name}${shadowText ? " — " + shadowText : " · no effect"}.`,
      );
      if (s.flow) {
        prepend(s, fx("shadowResponse", { code: e.code }));
        pauseFor(s, {
          kind: "shadow",
          title: `Shadow · ${card(e.code!).name}`,
          detail: shadowText
            ? "The shadow is faceup. Review it before its response window and effect."
            : "This card has no shadow effect. Normal encounter text does not resolve here.",
          cards: [{ code: e.code!, label: "Revealed shadow" }],
        });
        break;
      }
      shadowResponse(s, e.code!);
      break;
    }
    case "shadowResponse":
      shadowResponse(s, e.code!);
      break;
    case "shadowResolved": {
      const enemy = get(s, e.source);
      if (enemy && e.code) Dread.dreadShadowResolved(s, enemy, e.code);
      break;
    }
    case "shadowEffect": {
      const enemyId = s.combat?.enemyId,
        before = s.queue.length;
      shadow(s, e.code!);
      if (enemyId && get(s, enemyId)?.code === "01102" && card(e.code!).shadow)
        s.queue.splice(
          s.queue.length - before,
          0,
          fx("nazgulDiscard", { target: enemyId }),
        );
      break;
    }
    case "enemyDamage": {
      const c = s.combat;
      const enemy = get(s, c?.enemyId);
      if (!c || !enemy) break;
      const defenders = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
        .map((id) => get(s, id))
        .filter((x): x is Unit => !!x);
      if (!defenders.length) Osgiliath.assaultOsgiliathAttackUndefended(s, c);
      const power =
        stats(s, enemy).attack +
        c.attackBonus +
        khazadAttackBonus(s, enemy, !defenders.length);
      const redirected = amonPlayerEnemyAttackTarget(s, enemy);
      if (redirected !== undefined) {
        c.redirectedToEnemy = true;
        if (redirected) {
          const amount = Math.max(0, power - stats(s, redirected).defense);
          damage(s, redirected.id, amount, {
            enemyId: enemy.id,
            combatDamage: true,
          });
          log(
            s,
            `${name(enemy)} attacks ${name(redirected)} for ${amount} damage.`,
          );
        }
        break;
      }
      const defense = c.ignoreDefense
        ? 0
        : defenders.reduce(
            (n, d) => n + combatDefenderDefense(s, d, enemy, c),
            0,
          );
      const amount = Math.max(0, power - defense);
      const forcedHero = heirsForcedCombatDamageTarget(s);
      if (forcedHero)
        combatDamage(s, forcedHero, enemy, defenders.length ? amount : power);
      else if (
        !defenders.length &&
        Amon.amonDinUndefendedDamage(s, enemy, power)
      ) {
        /* The quest replaces undefended damage with rescued villager losses. */
      } else if (!defenders.length && heirsUndefendedDamage(s, enemy, power)) {
        /* Damage redirected to a battleground. */
      } else if (defenders.length > 1) {
        if (amount)
          choose(
            s,
            `Assign ${amount} combat damage`,
            opts(defenders, (d) => [
              fx("combatDamage", {
                target: d.id,
                value: amount,
                source: enemy.id,
              }),
            ]),
            "Stand Together: all damage from this attack goes to one defender.",
          );
      } else if (defenders.length) combatDamage(s, defenders[0], enemy, amount);
      else if (returnMirkwoodUndefendedTarget(s, activeSeat(s)))
        combatDamage(
          s,
          returnMirkwoodUndefendedTarget(s, activeSeat(s))!,
          enemy,
          power,
        );
      else if (c.undefendedTargetId && get(s, c.undefendedTargetId))
        combatDamage(s, get(s, c.undefendedTargetId)!, enemy, power);
      else
        choose(
          s,
          `Assign ${power} damage`,
          opts(
            [
              ...s.heroes,
              ...druadanPlayerUndefendedTargets(s),
              ...finalRingUndefendedTargets(s),
            ],
            (h) => [
              fx("combatDamage", {
                target: h.id,
                source: enemy.id,
                value: power,
              }),
            ],
          ),
          druadanPlayerUndefendedTargets(s).length ||
            finalRingUndefendedTargets(s).length
            ? "Assign all damage to one hero or an eligible ally."
            : "All undefended damage goes to one hero.",
        );
      log(
        s,
        defenders.length
          ? `${name(enemy)} attacks for ${power} − ${defense} defense = ${amount} damage${c.ignoreDefense ? " (defense ignored)" : ""}.`
          : `${name(enemy)} attacks for ${power} damage (undefended).`,
      );
      break;
    }
    case "enemyDone": {
      const attackPlayer = s.combat?.attackPlayer ?? activeSeat(s);
      const completed = s.combat;
      const immediate = completed?.immediate,
        previousAttacked = completed?.immediatePreviousAttacked;
      if (e.flag) {
        const skipped = get(s, s.combat?.enemyId);
        if (skipped && !immediate) markEnemyAttack(s, skipped, attackPlayer);
        if (skipped) finishEnemyShadows(s, skipped);
        if (
          immediate &&
          skipped &&
          completed?.immediatePreviousShadows !== undefined
        )
          restoreImmediateShadows(s, skipped, completed);
        if (
          immediate &&
          skipped &&
          completed?.immediatePreviousShadows === undefined &&
          !Carn.carnUsesExistingShadows(s, skipped)
        ) {
          skipped.attacked = !!previousAttacked;
          if (!["defense", "attack"].includes(s.phase)) {
            s.encounterDiscard.push(...skipped.shadows);
            skipped.shadows = [];
            delete skipped.faceupShadows;
            skipped.revealedShadowCount = 0;
            delete skipped.shadowCancelsDamage;
            delete skipped.shadowCancelsCombatDamage;
          }
        }
        s.combat = s.suspendedCombats.pop() ?? null;
        if (!s.combat && !immediate) advanceDefense(s);
        break;
      }
      if (!s.used.includes("phase:attack-resolved"))
        s.used.push("phase:attack-resolved");
      const enemy = get(s, s.combat?.enemyId);
      if (enemy) {
        if (!immediate) markEnemyAttack(s, enemy, attackPlayer);
        carrockAfterAttack(s, enemy);
        if (enemy.code === "01090") enemy.resources++;
        if (enemy.code === "01111") removeCurrentQuestProgress(s, 1);
        if (s.combat?.returnToStaging || s.combat?.returnWolf) {
          s.staging = s.staging.filter((x) => x.id !== enemy.id);
          s.engaged = s.engaged.filter((x) => x.id !== enemy.id);
          s.encounterDiscard.push(...enemy.shadows);
          enemy.shadows = [];
          delete enemy.faceupShadows;
          enemy.revealedShadowCount = 0;
          delete enemy.shadowCancelsDamage;
          delete enemy.shadowCancelsCombatDamage;
          if (s.combat.returnWolf) {
            log(
              s,
              "Wolf Rider's attack ends. Its shadow card returns to the deck when combat ends.",
            );
          } else {
            s.staging.push(enemy);
            enemyAddedToStaging(s, enemy);
          }
        }
      }
      finalRingDefenseFinished(s);
      for (const id of s.combat?.defenderIds ??
        (s.combat?.defenderId ? [s.combat.defenderId] : [])) {
        const d = get(s, id);
        if (d) watcherPlayerDefended(s, d);
      }
      prepend(
        s,
        ...huntDefenseEffects(
          s,
          s.combat?.defenderIds ??
            (s.combat?.defenderId ? [s.combat.defenderId] : []),
        ),
      );
      collectorEnemyAttackFinished(
        s,
        s.combat?.desperateDefenderIds ?? [],
        (s.combat?.damageDealt ?? 0) === 0,
      );
      if (enemy && !completed?.redirectedToEnemy)
        shadowFlamePlayerEnemyAttackEnded(s, enemy, attackPlayer);
      if (completed) {
        Chetwood.chetwoodAttackFinished(s, completed);
        Weather.weatherAttackFinished(s, completed);
        Dike.dikeAttackFinished(s, completed);
        Wastes.wastesAttackFinished(s, completed);
        Rhudaur.rhudaurAttackFinished(s, completed);
        Carn.carnAttackFinished(s, completed);
        Dread.dreadAttackFinished(s, completed);
        Trials.trialsAttackFinished(s, completed);
        Tharbad.tharbadAttackFinished(s, completed);
        Nin.ninAttackFinished(s, completed);
        Celebrimbor.celebrimborAttackFinished(s, completed);
        if (enemy) {
          stewardFearAttackFinished(s, enemy, attackPlayer);
          Druadan.druadanForestAttackFinished(s, enemy, completed);
          Amon.amonDinAttackFinished(s, enemy, completed);
          MorgulQuest.morgulAttackFinished(s, enemy, attackPlayer, completed);
          Fords.fordsAttackFinished(s, enemy, attackPlayer, completed);
        }
        BloodQuest.bloodGondorAttackFinished(s, completed);
        prepend(s, ...heirsAttackFinished(s, completed));
      }
      if (enemy) finishEnemyShadows(s, enemy);
      s.combat = s.suspendedCombats.pop() ?? null;
      if (
        immediate &&
        enemy &&
        completed?.immediatePreviousShadows !== undefined
      )
        restoreImmediateShadows(s, enemy, completed);
      if (
        immediate &&
        enemy &&
        completed?.immediatePreviousShadows === undefined &&
        !Carn.carnUsesExistingShadows(s, enemy)
      ) {
        enemy.attacked = !!previousAttacked;
        if (!["defense", "attack"].includes(s.phase)) {
          s.encounterDiscard.push(...enemy.shadows);
          enemy.shadows = [];
          delete enemy.faceupShadows;
          enemy.revealedShadowCount = 0;
          delete enemy.shadowCancelsDamage;
          delete enemy.shadowCancelsCombatDamage;
        }
      }
      if (s.combat || immediate) break;
      advanceDefense(s);
      break;
    }
    case "webRefresh": {
      const cost =
        (u?.attachments.filter((a) => !a.blanked && a.code === "01080")
          .length ?? 0) * 2;
      if (
        u?.exhausted &&
        !Fangorn.fangornCannotReady(s, u) &&
        cost &&
        u.resources >= cost
      )
        choose(s, `Free ${name(u)} from the web?`, [
          {
            id: "pay",
            label: `Pay ${cost} resources from this hero to ready`,
            effects: [
              fx("resource", { target: u.id, value: -cost, flag: true }),
              fx("ready", { target: u.id }),
            ],
          },
          { id: "skip", label: "Leave this hero exhausted", effects: [] },
        ]);
      break;
    }
    case "refreshEnd":
      globalEachSeat(s, () => {
        raiseThreat(s, 1, "framework");
        raiseThreat(
          s,
          allActiveLocations(s).filter((l) => l.code === "01114").length,
          "encounter",
        );
      });
      s.phase = "refresh";
      log(s, "Refresh · Threat increases by 1.");
      check(s);
      if (s.status !== "playing") break;
      if (s.table) {
        const order = globalPlayerOrder(s);
        s.table.first = order[1 % order.length] ?? 0;
        followFirstPlayer(s);
      }
      watcherWaterRefresh(s);
      check(s);
      break;
    case "sneak": {
      const a = s.hand.find((x) => x.id === e.target);
      if (a) {
        s.hand = s.hand.filter((x) => x.id !== a.id);
        enterAlly(s, a, true);
      }
      break;
    }
    default:
      extraEffect(s, e);
  }
}

export function shadowResponse(s: GameState, code: string) {
  if (!Wastes.wastesCancelAllowed(s)) {
    prepend(s, fx("shadowEffect", { code }));
    return;
  }
  const shadowText = Carn.carnShadowText(s, code);
  const erkenbrand =
    roadRivendellCannotCancel(s) ||
    allActiveLocations(s).some((l) => l.code === "02016")
      ? []
      : finalRingShadowOptions(s, code, !!shadowText);
  const eligible = playerOrder(s).filter((i) => {
    const p = seatView(s, i);
    return (
      !roadRivendellCannotCancel(s) &&
      !allActiveLocations(s).some((l) => l.code === "02016") &&
      shadowText &&
      p.hand.some((u) => u.code === "01048") &&
      canPay(p, card("01048"))
    );
  });
  const brand = roadRivendellCannotCancel(s)
    ? []
    : expansionShadowOptions(s, code, !!shadowText);
  const watcher = roadRivendellCannotCancel(s)
    ? []
    : marshPlayerShadowOptions(s, code, !!shadowText);
  if (eligible.length || brand.length || watcher.length || erkenbrand.length)
    choose(
      s,
      "A shadow falls",
      [
        ...brand,
        ...erkenbrand,
        ...watcher,
        ...eligible.map((player) => ({
          id: s.table ? `cancel-${player}` : "cancel",
          label: `Play Hasty Stroke · ${playCost(s, card("01048"))} Spirit${s.table ? " · " + seatName(s, player) : ""}`,
          code: "01048",
          effects: [
            fx("eventPlay", {
              code: "01048",
              player,
              effects: [],
              cancelledEffects: [
                fx("shadowEffect", {
                  code,
                  player: s.combat?.attackPlayer ?? activeSeat(s),
                }),
              ],
            }),
          ],
        })),
        {
          id: "resolve",
          label: "Resolve shadow effect",
          code,
          effects: [fx("shadowEffect", { code })],
        },
      ],
      shadowText,
    );
  else prepend(s, fx("shadowEffect", { code }));
}

export function flush(s: GameState) {
  let n = 0;
  while (
    s.queue.length &&
    !s.choice &&
    !s.flow?.pending &&
    s.status === "playing"
  ) {
    requireRule(++n < 200, "Effect queue overflow.");
    // Actual spending may originate in an action before its card effects enqueue.
    const costIndex = s.queue.findIndex((effect) =>
      ["ettenForageDamage", "carnResourceTax"].includes(effect.kind),
    );
    if (costIndex > 0) s.queue.unshift(s.queue.splice(costIndex, 1)[0]);
    const effect = s.queue.shift()!;
    const sharedEffect =
      ANGMAR_SHARED_EFFECTS.has(effect.kind) ||
      ["shadowResolved", "endRoundScenarioDone", "revealCard"].includes(
        effect.kind,
      ) ||
      (effect.kind === "dikeDiscardDeck" && !!effect.ids) ||
      [
        "dikeSetup",
        "dikeSetupReveal",
        "dikeStageTwo",
        "dikeStageReady",
        "dikeShuffle",
        "dikeAttackEffects",
        "dikeAttackFinished",
        "dikeSeal",
        "dikeWorld",
        "dikeBattlements",
        "dikeTombsResponse",
        "dikeTombsRefill",
        "dikePowerRefill",
        "dikeTerror",
        "dikeCurseAttach",
        "dikeTerrorCollect",
        "weatherSetup",
        "weatherEnemyToken",
        "weatherAdvanceStage",
        "weatherStageTwoSetup",
        "weatherRevealAside",
        "weatherStageReady",
        "weatherRevealOrcs",
        "weatherRemoveMission",
        "weatherQuestCost",
        "weatherAllThreat",
        "weatherRidgeDamage",
        "weatherShelterExpired",
        "weatherResetShelter",
        "weatherIceExhaust",
        "weatherColdAttach",
        "weatherCampTokenResponse",
        "weatherCampToken",
        "weatherValleyResponse",
        "weatherValleyHeal",
        "weatherHealResponse",
        "weatherSearchResponse",
        "weatherReduceAllThreat",
        "chetSetup",
        "chetRefreshThreat",
        "chetRescueExpired",
        "chetRescueCards",
        "chetShuffle",
        "chetAssault",
        "chetBorders",
        "crownSetup",
        "crownStageReady",
        "crownAdvance",
        "crownTimeExpired",
        "crownResetTime",
        "crownRavenReveal",
        "crownRemoveAllTime",
        "crownRemoveTimeBatch",
        "crownLocationExpired",
        "crownCryRefill",
        "crownActiveTime",
        "crownAllocateTime",
        "celebSetup",
        "celebStageReady",
        "celebAdvance",
        "celebBellachAttack",
        "celebStealMould",
        "celebTimeExpired",
        "celebResetTime",
        "celebSearchThreat",
        "celebScourAll",
        "celebScour",
        "celebLocationDamage",
        "celebActiveDamage",
        "celebAssignLocationDamage",
        "celebSpiesSurge",
        "celebTravelProgress",
        "ninSetup",
        "ninAdvance",
        "ninStageReady",
        "ninReturnDweller",
        "ninTimeExpired",
        "ninResetTime",
        "ninDwellerResource",
        "ninAddTime",
        "tharbadSetup",
        "tharbadAdvance",
        "tharbadStageReady",
        "tharbadTimeExpired",
        "tharbadResetTime",
        "tharbadLocationProgress",
        "tharbadLotSurge",
        "tharbadGetDwarf",
        "tharbadRemoveThreatSource",
        "trialsChoose",
        "trialsStart",
        "trialsComplete",
        "trialsFinal",
        "trialsStageReady",
        "trialsReturnGuardian",
        "trialsReveal",
        "trialsRevealDone",
        "trialsAddAside",
        "trialsAttachKey",
        "trialsBuryKey",
        "trialsCurseSurge",
        "trialsTimeExpired",
        "trialsResetTime",
        "trialsChooseTime",
        "trialsRemoveTime",
        "trialsFoothillsProgress",
        "trialsContinueProgress",
        "dunlandSetup",
        "dunlandShuffle",
        "dunlandAdvance",
        "dunlandTrapBack",
        "dunlandStageThreeReady",
        "dunlandTimeExpired",
        "dunlandResetTime",
        "dunlandFinalAttacks",
        "dunlandVictory",
        "dunlandFrenziedDone",
        "fangornOrder",
        "fangornAdvance",
        "fangornTimeExpired",
        "fangornResetTime",
        "fangornMaliceDone",
        "fangornShuffle",
        "fangornHinder",
        "resourceCollect",
        "removeQuestTime",
        "catchSetup",
        "catchStageTwo",
        "catchQuestResponse",
        "catchQuestTime",
        "catchAdvance",
        "catchQuestProgressDone",
        "catchTimeExpired",
        "catchResetTime",
        "catchEscape",
        "catchCapture",
        "catchTerritoryAttacks",
        "catchCaveTravel",
        "fordsStageReady",
        "fordsRemoveTime",
        "fordsTimeExpired",
        "fordsResetTime",
        "fordsDrawReactions",
        "ringDelayedReturn",
        "dunlandCloseWindow",
        "dunlandCloseResume",
        "dunlandCouncilStep",
        "eventFinish",
        "shadowFlameStageReady",
        "shadowFlameLastLord",
        "shadowFlameLastLordFinish",
        "shadowFlameRearProgress",
        "shadowFlameRearAdvance",
        "shadowFlameLeavesOrder",
        "shadowFlameLeavesResolve",
        "shadowFlameAlliesChoose",
        "shadowFlameDiscardAllies",
        "shadowFlameAttachmentsChoose",
        "shadowFlameDiscardAttachments",
        "shadowFlameInner",
        "longDarkLost",
        "longDarkLostOrder",
        "longDarkLostResolve",
        "longDarkLocate",
        "longDarkLocateAttempt",
        "longDarkLocateFail",
        "longDarkTwistingPlace",
        "longDarkEast",
        "longDarkEastReveal",
        "longDarkStageReady",
        "longDarkSetupLocations",
        "roadRivendellAllAttacks",
        "roadRivendellOutpost",
        "roadRivendellStageReady",
        "roadRivendellOrderEffects",
        "huntLook",
        "huntReveal",
        "huntClaim",
        "huntProgress",
        "questSucceeded",
        "questSuccessResponses",
        "successfulQuestProgress",
        "prepareCombat",
        "deadBeginEscape",
        "deadDiscardTreachery",
        "deadChooseCapturer",
        "khazadStageReady",
        "khazadFlipQuest",
        "khazadCouncil",
        "khazadCouncilSelect",
        "khazadCouncilVictory",
        "khazadBypass",
        "khazadPresenceDone",
        "khazadDiscardTreachery",
      ].includes(effect.kind);
    if (s.table && (sharedEffect || effect.player !== undefined))
      selectSeat(
        s,
        sharedEffect
          ? firstPlayer(seatView(s, effect.player ?? activeSeat(s)))
          : effect.player!,
      );
    const before = observation(s);
    if (
      sharedEffect ||
      !s.table?.seats[activeSeat(s)].eliminated ||
      [
        "dikeMill",
        "dikeMillDone",
        "dreadMill",
        "gramInterrogation",
        "paidPlayerCardEntry",
        "playerAbilityFinish",
        "nextRound",
        "phaseEnd",
        "startCombat",
        "finishQuestPhase",
        "questSucceeded",
        "questSuccessResponses",
        "successfulQuestProgress",
        "questReady",
        "commitSeat",
        "stageRevealed",
        "refreshEnd",
        "deadBeginEscape",
        "deadDiscardTreachery",
        "deadChooseCapturer",
        "travelDone",
        "travelEnter",
        "reveal",
        "placeEncounter",
        "resolveReveal",
        "engagementRound",
        "automaticEngagement",
        "enemyDone",
        "startQuest",
        "startPlanning",
        "startTravel",
        "startEncounter",
        "endCombat",
        "refreshReady",
        "resourceCollect",
        "dunlandSetup",
        "dunlandShuffle",
        "dunlandAdvance",
        "dunlandTrapBack",
        "dunlandStageThreeReady",
        "dunlandTimeExpired",
        "dunlandResetTime",
        "dunlandFinalAttacks",
        "dunlandVictory",
        "dunlandFrenziedDone",
        "fangornOrder",
        "fangornAdvance",
        "fangornTimeExpired",
        "fangornResetTime",
        "fangornMaliceDone",
        "fangornShuffle",
        "endRound",
        "endRoundAfterCollector",
        "finishQuestDefeat",
      ].includes(effect.kind)
    )
      handle(s, effect);
    if (!s.flow?.pending) check(s);
    if (before) recordObservation(s, before, observation(s)!, effect);
  }
  if (
    s.table &&
    !s.escapeTest &&
    !s.choice &&
    !s.flow?.pending &&
    [
      "setup",
      "resource",
      "planning",
      "quest",
      "encounter",
      "defense",
      "attack",
    ].includes(s.phase)
  )
    selectSeat(s, s.table.turn);
  Gram.gramIdleActor(s);
  syncSeat(s);
}

export function extraEffect(s: GameState, e: Effect) {
  const u = get(s, e.target);
  switch (e.kind) {
    case "cancelReplace": {
      Weather.weatherCanceled(s, e.code!);
      s.encounterDiscard.push(e.code!);
      const afterIndex = s.queue.findIndex(
        (next) =>
          next.kind === "afterEncounterRevealed" && next.code === e.code,
      );
      const after = afterIndex >= 0 ? s.queue.splice(afterIndex, 1) : [];
      prepend(
        s,
        ...after,
        fx("reveal", { source: e.source, revealOrigin: e.revealOrigin }),
      );
      break;
    }
    case "quickAttack":
      if (u) playerAttack(s, u, [e.source!]);
      break;
    case "heal":
      if (u)
        rhosgobelHeal(s, u, e.value ?? 0, {
          source: e.source,
          code: e.code,
          player: e.owner ?? e.player,
        });
      break;
    case "used":
      s.used.push(e.text!);
      break;
    case "peek":
      s.peek = e.code!;
      choose(
        s,
        `Revealed shadow: ${card(e.code!).name}`,
        [{ id: "continue", label: "Continue", code: e.code, effects: [] }],
        card(e.code!).shadow || "This card has no shadow effect.",
      );
      break;
    case "encounterBottom":
      s.encounterDeck.push(s.encounterDeck.shift()!);
      s.peek = null;
      break;
    case "exhaustAttachment": {
      const a = u?.attachments.find((a) => a.id === e.source);
      if (a) a.exhausted = true;
      break;
    }
    case "protector": {
      const h = s.hand.find((h) => h.id === e.source);
      if (u && h) {
        discardHandCard(s, h.id);
        s.used.push(e.text!);
        if (e.flag) u.tempWill = (u.tempWill ?? 0) + 1;
        else u.tempDefense = (u.tempDefense ?? 0) + 1;
      }
      break;
    }
    case "valiant": {
      const controller = activeSeat(s);
      const eligible = playerOrder(s).filter((i) => {
        const p = seatView(s, i);
        return (
          p.hand.some((u) => u.code === "01024") && canPay(p, card("01024"))
        );
      });
      if (eligible.length)
        choose(
          s,
          "Valiant Sacrifice",
          [
            ...eligible.map((player) => ({
              id: s.table ? `play-${player}` : "play",
              label: `Pay ${playCost(s, card("01024"))} Leadership${s.table ? " from " + seatName(s, player) : ""} · ${s.table ? seatName(s, controller) + " draws" : "draw"} 2 cards`,
              code: "01024",
              effects: [
                fx("eventPlay", {
                  code: "01024",
                  player,
                  effects: [fx("draw", { value: 2, player: controller })],
                }),
              ],
            })),
            skip,
          ],
          "An ally has left play. Its controller draws the cards.",
        );
      break;
    }
    case "brok": {
      const brok = s.hand.find((u) => u.code === "01019");
      if (brok && !allCharacters(s).some((u) => u.code === "01019"))
        choosePlayerResponse(
          s,
          brok.id,
          brok.code,
          "Brok Ironfist",
          [
            {
              id: "play",
              label: "Put Brok Ironfist into play",
              code: "01019",
              effects: [fx("freeAlly", { target: brok.id })],
            },
            skip,
          ],
          "A Dwarf hero has left play.",
        );
      break;
    }
    case "freeAlly": {
      const a = s.hand.find((u) => u.id === e.target);
      if (a) {
        s.hand = s.hand.filter((u) => u.id !== a.id);
        enterAlly(s, a);
      }
      break;
    }
    case "swiftStrike": {
      const combat = s.combat;
      const eligible = playerOrder(s).filter((i) => {
        const p = seatView(s, i);
        return (
          p.hand.some((u) => u.code === "01037") && canPay(p, card("01037"))
        );
      });
      if (combat?.defenderId && get(s, combat.enemyId) && eligible.length)
        choose(
          s,
          "Swift Strike",
          [
            ...eligible.map((player) => ({
              id: s.table ? `play-${player}` : "play",
              label: `Pay ${playCost(s, card("01037"))} Tactics${s.table ? " · " + seatName(s, player) : ""} to deal 2 damage`,
              code: "01037",
              effects: [
                fx("eventPlay", {
                  code: "01037",
                  player,
                  effects: [
                    fx("damage", {
                      target: combat.enemyId,
                      value: 2,
                      player: combat.attackPlayer ?? activeSeat(s),
                    }),
                  ],
                }),
              ],
            })),
            skip,
          ],
          "A defender has been declared.",
        );
      break;
    }
    case "strengthOfWill":
      if (
        u &&
        u.code !== CARROCK.carrock &&
        s.hand.some((h) => h.code === "01047") &&
        canPay(s, card("01047")) &&
        characters(s).some(
          (h) => card(h.code).sphere_code === "spirit" && !h.exhausted,
        )
      )
        choose(
          s,
          "Strength of Will",
          [
            ...opts(
              characters(s).filter(
                (h) => card(h.code).sphere_code === "spirit" && !h.exhausted,
              ),
              (h) => [
                fx("eventPlay", {
                  code: "01047",
                  costEffects: [fx("exhaust", { target: h.id })],
                  effects: [fx("locationProgress", { target: u.id, value: 2 })],
                }),
              ],
            ),
            skip,
          ],
          "Exhaust a Spirit character to place 2 progress on the location.",
        );
      break;
    case "searchTake": {
      s.hand.push(takePlayerDeck(s, e.value!));
      const remaining = s.deck.slice(0, (e.count ?? 1) - 1);
      prepend(s, fx("searchOrder", { ids: remaining, value: 0 }));
      break;
    }
    case "searchOrder": {
      const remaining = e.ids ?? [];
      if (!remaining.length) break;
      choose(
        s,
        "Order the remaining cards",
        remaining.map((code, i) => ({
          id: `order${i}`,
          label: card(code).name,
          code,
          effects: [
            fx("searchPlace", {
              code,
              value: e.value ?? 0,
              count: i,
              ids: remaining.filter((_, j) => i !== j),
            }),
          ],
        })),
        `Choose card ${(e.value ?? 0) + 1} from the top.`,
      );
      break;
    }
    case "searchPlace":
      putPlayerDeck(
        s,
        takePlayerDeck(s, (e.value ?? 0) + (e.count ?? 0)),
        e.value ?? 0,
      );
      prepend(s, fx("searchOrder", { ids: e.ids, value: (e.value ?? 0) + 1 }));
      break;
    default:
      if (!scenarioEffect(s, e)) throw new Error(`Unknown effect ${e.kind}`);
  }
}
