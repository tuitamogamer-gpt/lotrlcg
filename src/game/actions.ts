import { resolvePlayerAbility } from "./player-ability-triggers";
import {
  dikeCannotLeaveDiscard,
  DIKE_DISCARD_REASON,
} from "./deadmens-discard";
import * as Dike from "./deadmens-dike";
import * as Chetwood from "./chetwood";
import * as Weather from "./weather-hills";
import { WEATHER } from "./weather-hills-support";
import { currentQuestProgress } from "./quest-state";
import { rangerPlayProblem } from "./ranger-north";
import * as Realm from "./lost-realm-player";
import * as Angmar from "./angmar-player";
import { angmarDiscardEvents } from "./angmar-player-support";
import { isHero } from "./card-types";
import * as Wastes from "./wastes-eriador";
import * as Gram from "./mount-gram";
import * as Etten from "./ettenmoors";
import * as Dread from "./dread-realm";
import * as Carn from "./carn-dum";
import * as Rhudaur from "./rhudaur";
import * as Antlered from "./antlered";
import { celebrimborProtected } from "./celebrimbor-support";
import * as Celebrimbor from "./celebrimbor";
import { NIN, ninNoCardEconomy } from "./nin-eilph-support";
import * as Nin from "./nin-eilph";
import * as Tharbad from "./tharbad";
import * as Trials from "./three-trials";
import { playerCardImmune } from "./card-immunity";
import * as DunlandQuest from "./dunland-trap";
import * as Fangorn from "./fangorn";
import * as Catch from "./catch-orc";
import { questTime } from "./quest-time";
import { cannotReady } from "./core";
import { movableHand } from "./hand-rules";
import * as Fords from "./fords-isen";
import { FORDS } from "./fords-isen-support";
import {
  finalRingPlayProblem,
  finalRingPlayTargets,
  finalRingEventCost,
  finalRingAbilityLabel,
  finalRingAbilityProblem,
} from "./ring-maker-final-player";
import {
  ringMakerEventPlayed,
  ringMakerPlayProblem,
  ringMakerPlayTargets,
} from "./ring-maker-player";
import * as Isengard from "./voice-isengard";
import * as BloodQuest from "./blood-gondor";
import * as MorgulQuest from "./morgul-vale";
import * as Druadan from "./druadan-forest";
import * as Amon from "./amon-din";
import * as Osgiliath from "./assault-osgiliath";
import { canGainResources } from "./core";
import {
  dunlandEventPlayed,
  dunlandPlayProblem,
  dunlandPlayTargets,
} from "./dunland-trap-player";
import {
  heirsClaim,
  heirsCanOptionallyEngage,
  heirsCanSpendResources,
  heirsCannotHaveAttachments,
  heirsAbilityLabel,
  heirsAbilityProblem,
  useHeirsAbility,
} from "./heirs-numenor";
import {
  stewardFearTravelProblem,
  stewardFearTravelEffects,
  stewardFearOptionalEngagementProblem,
  stewardFearClaim,
  stewardFearAbilityLabel,
  stewardFearAbilityProblem,
  useStewardFearAbility,
  stewardFearHeroAbilityTriggered,
  stewardFearEventPlayed,
} from "./steward-fear";
import { enemyAttackPrevented } from "./core";
import {
  foundationsResolveQuest,
  foundationsTravelNext,
  foundationsCommitProblem,
  foundationsClaim,
  foundationsAbilityLabel,
  foundationsAbilityProblem,
  useFoundationsAbility,
} from "./foundations-stone";
import {
  osgiliathPlayerPlayProblem,
  osgiliathPlayerPlayTargets,
  osgiliathPlayerAbilityLabel,
  osgiliathPlayerAbilityProblem,
} from "./osgiliath-player-cards";
import {
  bloodPlayerPlayProblem,
  bloodPlayerPlayTargets,
  bloodPlayerAbilityLabel,
  bloodPlayerAbilityProblem,
  bloodPlayerHandAbilityLabel,
  bloodPlayerHandAbilityProblem,
  useBloodPlayerHandAbility,
  bloodPlayerSpecialAttachmentEntry,
} from "./blood-gondor-player-cards";
import {
  morgulPlayerPlayProblem,
  morgulPlayerPlayTargets,
  morgulPlayerAbilityLabel,
  morgulPlayerAbilityProblem,
} from "./morgul-player-cards";
import { resolveEventAbility } from "./event-resolution";
import {
  amonPlayerPlayProblem,
  amonPlayerPlayTargets,
  amonPlayerSpecialAttachmentEntry,
  amonPlayerCanEngage,
  amonPlayerAbilityLabel,
  amonPlayerAbilityProblem,
  useAmonPlayerAbility,
} from "./amon-din-player-cards";
import { SHADOW_FLAME } from "./shadow-flame-support";
import {
  engagedEnemies,
  normalAttackPending,
  consideredEngaged,
} from "./considered-engagement";
import {
  shadowFlameEventCancelled,
  shadowFlameCanMove,
  shadowFlameAbilityLabel,
  shadowFlameAbilityProblem,
  shadowFlameAbility,
} from "./shadow-flame";
import { druadanPlayerPlayProblem } from "./druadan-player-cards";
import {
  stewardPlayerPlayProblem,
  stewardPlayerPlayTargets,
} from "./steward-player-cards";
import {
  HEIRS_ATTACHMENT_ACTIONS,
  heirsPlayerPlayProblem,
  heirsPlayerPlayTargets,
  heirsPlayerEventEffect,
  heirsPlayerAbilityLabel,
  heirsPlayerAbilityProblem,
  heirsPlayerCardPlayed,
  heirsPlayerSpecialAttachmentEntry,
  useHeirsPlayerAbility,
} from "./heirs-player-cards";
import { takePlayerDeck, putPlayerDeck } from "./core";
import { attachToQuest } from "./quest-state";
import {
  collectorAbilityAnyPlayer,
  collectorAbilityLabel,
  collectorAbilityProblem,
  collectorPlayProblem,
  collectorPlayTargets,
  collectorEventEffect,
  useCollectorAbility,
} from "./collector-player-cards";
import {
  watcherWaterCannotExhaust,
  watcherWaterTravelProblem,
  watcherWaterTravelCost,
  watcherWaterOptionalEngageProblem,
  watcherWaterAbilityLabel,
  watcherWaterAbilityProblem,
  watcherWaterAbility,
} from "./watcher-water";
import {
  shadowFlamePlayerPlayProblem,
  shadowFlamePlayerPlayTargets,
  shadowFlamePlayerAbilityLabel,
  shadowFlamePlayerAbilityProblem,
  SHADOW_FLAME_ATTACHMENT_ACTIONS,
} from "./shadow-flame-player-cards";
import {
  foundationsPlayerCardDiscarded,
  foundationsPlayerPlayProblem,
  foundationsPlayerAbilityLabel,
  foundationsPlayerAbilityProblem,
} from "./foundations-player-cards";
import {
  longDarkPlayerPlayProblem,
  longDarkPlayerPlayTargets,
  longDarkPlayerAbilityLabel,
  longDarkPlayerAbilityProblem,
  longDarkPlayerCardPlayed,
} from "./long-dark-player-cards";
import {
  REDHORN,
  redhornCanCommit,
  redhornCanDefend,
  redhornTravelProblem,
  redhornTravelCost,
  redhornBeforeQuestResolution,
} from "./redhorn-gate";
import {
  rohanPlayProblem,
  rohanPlayTargets,
  rohanAbilityLabel,
  rohanAbilityProblem,
  useRohanAbility,
  rohanEventEffect,
  rohanOathPlayers,
} from "./rohan-player-cards";
import {
  watcherPlayerPlayProblem,
  watcherPlayerAbilityLabel,
  watcherPlayerAbilityProblem,
  useWatcherPlayerAbility,
} from "./watcher-player-cards";
import {
  roadPlayerPlayProblem,
  roadPlayerPlayTargets,
  roadPlayerEventEffect,
  roadPlayerAttachmentEntered,
  roadPlayerAbilityLabel,
  roadPlayerAbilityProblem,
  useRoadPlayerAbility,
} from "./road-player-cards";
import {
  redhornPlayerPlayProblem,
  redhornPlayerPlayTargets,
  redhornPlayerEventEffect,
  redhornPlayerEventPlayed,
  redhornPlayerAttachmentPlayed,
  redhornPlayerAbilityLabel,
  redhornPlayerAbilityProblem,
  useRedhornPlayerAbility,
  redhornPlayerHandAbilityLabel,
  redhornPlayerHandAbilityProblem,
  useRedhornPlayerHandAbility,
} from "./redhorn-player-cards";
import {
  KHAZAD,
  khazadCannotPlay,
  khazadCannotExhaust,
  khazadTravelProblem,
  khazadTravelCost,
  khazadClaim,
  khazadAbilityProblem,
  khazadAbility,
  khazadOptionalEngageProblem,
} from "./khazad-dum";
// Player actions, legality checks and the public state projection.
import { card, name, plain } from "./cards";
import type { Action, Card, Effect, GameState, Unit } from "./types";

import {
  firstPlayer,
  forOwner,
  ownerOf,
  activeSeat,
  allCharacters,
  allActiveLocations,
  allHeroes,
  allEngaged,
  livingSeats,
  playerOrder,
  globalPlayerOrder,
  seatIndices,
  seatName,
  seatView,
  selectSeat,
  syncSeat,
  passSeat,
  attackersFor,
  attachmentController,
  startPhase,
} from "./table";

import { recordObservation, REVIEW_MODES } from "./presentation";
import {
  RuleError,
  canFight,
  characters,
  draw,
  eligiblePayers,
  enqueue,
  fx,
  get,
  log,
  objectiveFree,
  observation,
  pay,
  prepend,
  questWill,
  questStat,
  requireRule,
  shuffle,
  stageInfo,
  stagingThreat,
  stats,
  threatOf,
  globalUnits,
  playCost,
  locationQuest,
  hasClue,
} from "./core";
import {
  check,
  engage,
  enterAlly,
  allyCanEnter,
  nextRound,
  raiseThreat,
  exhaustCharacter,
  advanceDefense,
  charactersCommitted,
  takePlayerDiscard,
} from "./board";
import { flush } from "./effects";
import { beginEnemyAttack, playerAttack } from "./combat";
import { eventEffect, useAbility } from "./player-cards";
import {
  expansionPlayTargets,
  expansionPlayProblem,
  questExhausts,
  singlePoolCard,
  restrictedAttachment,
} from "./expansion-passives";
import { CARROCK, isSacked, carrockCanContribute } from "./carrock";
import { huntAbilityLabel, huntAbilityProblem } from "./expansion-player-cards";
import {
  EMYN,
  emynMuilEventsBlocked,
  emynMuilMustCommit,
  emynMuilTravelCost,
} from "./emyn-muil";
import { syncAttachmentText } from "./attachment-text";
import {
  gondorPlayProblem,
  gondorPlayTargets,
  gondorAbilityLabel,
  gondorAbilityProblem,
} from "./gondor-player-cards";
import {
  rhosgobelCanAttach,
  rhosgobelTravelProblem,
  rhosgobelClaim,
  rhosgobelHealingAllowed,
} from "./rhosgobel";
import {
  rhosgobelPlayProblem,
  rhosgobelPlayTargets,
  rhosgobelAbilityLabel,
  rhosgobelAbilityProblem,
} from "./rhosgobel-player-cards";
import {
  utilityAbilityProblem,
  useUtilityAttachment,
} from "./utility-attachments";
import {
  emynPlayerPlayProblem,
  emynPlayerPlayTargets,
  emynPlayerAbilityLabel,
  emynPlayerAbilityProblem,
} from "./emyn-player-cards";
import {
  deadMarshesContinueEscape,
  deadMarshesEscapeStrength,
} from "./dead-marshes";
import {
  marshPlayerAbilityLabel,
  marshPlayerAbilityProblem,
} from "./marsh-player-cards";
import {
  dwarfPlayProblem,
  dwarfPlayTargets,
  dwarfAbilityLabel,
  dwarfAbilityProblem,
  dwarfEventEffect,
  useDwarfAbility,
  DWARF_ATTACHMENT_ACTIONS,
} from "./dwarf-player-cards";

import {
  returnMirkwoodCanCommit,
  returnMirkwoodCannotPlay,
  returnMirkwoodQuestFailed,
  returnMirkwoodTravelProblem,
  returnMirkwoodTravelCost,
} from "./return-mirkwood";

import {
  mirkwoodPlayerPlayProblem,
  mirkwoodPlayerPlayTargets,
  mirkwoodPlayerAbilityProblem,
  mirkwoodPlayerEventEffect,
  useMirkwoodPlayerAbility,
} from "./mirkwood-player-cards";

import {
  khazadPlayerPlayProblem,
  khazadPlayerPlayTargets,
  khazadPlayerAbilityLabel,
  khazadPlayerAbilityProblem,
} from "./khazad-player-cards";

import {
  elfPlayProblem,
  elfPlayTargets,
  elfAbilityLabel,
  elfAbilityProblem,
  useElfAbility,
  ELF_ATTACHMENT_ACTIONS,
  elfEventEffect,
} from "./elf-player-cards";

export function commitCharacters(s: GameState) {
  requireRule(s.phase === "quest", "Not at the commit step.");
  const foundationsProblem = foundationsCommitProblem(s);
  requireRule(!foundationsProblem, foundationsProblem ?? "");
  s.used.push("phase:quest-committed");
  if (emynMuilMustCommit(s))
    requireRule(
      characters(s)
        .filter((u) => canCommit(s, u))
        .every((u) => s.committedIds.includes(u.id)),
      "The Falls of Rauros requires every eligible ready character to commit to the quest.",
    );
  requireRule(
    characters(s)
      .filter((u) => Dread.dreadMustCommit(s, u) && canCommit(s, u))
      .every((u) => s.committedIds.includes(u.id)),
    "A Fell Dread requires its attached character to commit if able.",
  );
  const exhaustedIds: string[] = [];
  for (const u of characters(s).filter((u) => s.committedIds.includes(u.id))) {
    requireRule(!u.exhausted, "A selected character is exhausted.");
    if (questExhausts(s, u)) {
      requireRule(
        exhaustCharacter(s, u),
        "This character cannot exhaust to commit.",
      );
      exhaustedIds.push(u.id);
    }
    u.committed = true;
  }
  const committed = characters(s).filter((u) => u.committed);
  charactersCommitted(s, committed, exhaustedIds);
  s.committedIds = [];
  log(s, `${committed.length} characters commit to the quest.`);
  enqueue(s, fx("commitSeat"));
}
export function canCommit(s: GameState, u: Unit): boolean {
  syncAttachmentText(s, u);
  return (
    (u.code !== "08112" || !!u.blanked) &&
    returnMirkwoodCanCommit(s, u) &&
    !s.escapeTest &&
    !(s.ninEilph?.activeQuest === NIN.weary && !s.hand.length) &&
    s.phase === "quest" &&
    characters(s).some((x) => x.id === u.id) &&
    redhornCanCommit(u) &&
    !watcherWaterCannotExhaust(u) &&
    !khazadCannotExhaust(u) &&
    !u.exhausted &&
    !u.committed &&
    !isSacked(u) &&
    (s.scenarioId !== "hunt-for-gollum" ||
      s.stage !== 3 ||
      s.heroes.some(hasClue))
  );
}
export function canTravel(s: GameState, u: Unit): string | null {
  if (
    s.phase !== "travel" ||
    (allActiveLocations(s).length > 0 &&
      !Osgiliath.assaultOsgiliathSecondLocation(s, u))
  )
    return "Travel requires an empty active-location slot in the travel phase.";
  if (
    !s.staging.some((x) => x.id === u.id) ||
    card(u.code).type_code !== "location"
  )
    return "Choose a location in staging.";
  if (u.code === CARROCK.carrock) return "The Carrock cannot be travelled to.";
  if (u.code !== FORDS.road && Fords.fordsMandatoryTravel(s))
    return "You must travel to The King’s Road.";
  const chetwoodProblem = Chetwood.chetwoodTravelProblem(s, u);
  if (chetwoodProblem) return chetwoodProblem;
  const wastesProblem = Wastes.wastesTravelProblem(s, u);
  if (wastesProblem) return wastesProblem;
  const gramProblem = Gram.gramTravelProblem(s, u);
  if (gramProblem) return gramProblem;
  const ettenProblem = Etten.ettenTravelProblem(s, u);
  if (ettenProblem) return ettenProblem;
  const carnProblem = Carn.carnTravelProblem(s, u);
  if (carnProblem) return carnProblem;
  const rhudaurProblem = Rhudaur.rhudaurTravelProblem(s, u);
  if (rhudaurProblem) return rhudaurProblem;
  const dreadProblem = Dread.dreadTravelProblem(s, u);
  if (dreadProblem) return dreadProblem;
  const dikeProblem = Dike.dikeTravelProblem(s, u);
  if (dikeProblem) return dikeProblem;
  const weatherProblem = Weather.weatherTravelProblem(s, u);
  if (weatherProblem) return weatherProblem;
  const celebProblem = Celebrimbor.celebrimborTravelProblem(s, u);
  if (celebProblem) return celebProblem;
  const ninProblem = Nin.ninTravelProblem(s, u);
  if (ninProblem) return ninProblem;
  const tharbadProblem = Tharbad.tharbadTravelProblem(s, u);
  if (tharbadProblem) return tharbadProblem;
  const trialsProblem = Trials.trialsTravelProblem(s, u);
  if (trialsProblem) return trialsProblem;
  const dunlandProblem = DunlandQuest.dunlandTravelProblem(s, u);
  if (dunlandProblem) return dunlandProblem;
  const fangornProblem = Fangorn.fangornTravelProblem(s, u);
  if (fangornProblem) return fangornProblem;
  const druadanProblem = Druadan.druadanForestTravelProblem(s, u);
  if (druadanProblem) return druadanProblem;
  const osgiliathProblem = Osgiliath.assaultOsgiliathTravelProblem(s, u);
  if (osgiliathProblem) return osgiliathProblem;
  const stewardProblem = stewardFearTravelProblem(s, u);
  if (stewardProblem) return stewardProblem;
  const waterProblem = watcherWaterTravelProblem(s, u);
  if (waterProblem) return waterProblem;
  const redhornProblem = redhornTravelProblem(s, u);
  if (redhornProblem) return redhornProblem;
  const kdProblem = khazadTravelProblem(s, u);
  if (kdProblem) return kdProblem;
  const returnProblem = returnMirkwoodTravelProblem(s, u);
  if (returnProblem) return returnProblem;
  const rhosProblem = rhosgobelTravelProblem(s, u);
  if (rhosProblem) return rhosProblem;
  if (u.code !== "01088" && s.staging.some((x) => x.code === "01088"))
    return "You must travel to The East Bight.";
  if (
    u.code === "01077" &&
    !livingSeats(s).every((i) =>
      seatView(s, i).heroes.some((h) => !h.exhausted),
    )
  )
    return "Great Forest Web requires a ready hero from every player.";
  if (u.code === "01094" && seatView(s, firstPlayer(s)).hand.length < 2)
    return "Necromancer’s Pass requires two cards to discard.";
  if (u.code === "01078" && !s.encounterDeck.length)
    return "The travel cost needs an encounter card to reveal.";
  if (u.code === EMYN.highlands && !s.encounterDeck.length)
    return "The Highlands requires an encounter card to reveal.";
  if (
    u.code === EMYN.shores &&
    !seatView(s, firstPlayer(s)).hand.some(
      (x) => card(x.code).type_code === "event",
    )
  )
    return "The Shores of Nen Hithoel requires an event in the first player's hand.";
  return null;
}

export function optionalEngagementProblem(
  s: GameState,
  u: Unit,
): string | null {
  syncAttachmentText(s, u);
  if (s.status !== "playing" || s.choice || s.flow?.pending)
    return "Resolve the current decision first.";
  if (s.table && activeSeat(s) !== s.table.turn)
    return "Wait for this fellowship’s engagement turn.";
  if (
    s.phase !== "encounter" ||
    (s.optionalEngagement && !Realm.realmExtraEngagement(s))
  )
    return "You may optionally engage one enemy during the encounter phase.";
  if (
    card(u.code).type_code !== "enemy" ||
    !s.staging.some((enemy) => enemy.id === u.id)
  )
    return "Choose an enemy in staging.";
  if (!Wastes.wastesOptionalEngagementAllowed(s, u))
    return "This enemy cannot be optionally engaged during the day.";
  if (
    u.code === "01083" &&
    s.staging.some(
      (enemy) => enemy.id !== u.id && card(enemy.code).type_code === "enemy",
    )
  )
    return "Goblin Sniper cannot be optionally engaged while another enemy is in staging.";
  if (!heirsCanOptionallyEngage(s))
    return "This quest stage prevents optional engagement.";
  const stewardProblem = stewardFearOptionalEngagementProblem(s, u);
  if (stewardProblem) return stewardProblem;
  if (Carn.carnCannotEngage(s, u))
    return "Thaurdir cannot leave the staging area.";
  if (!shadowFlameCanMove(s, u))
    return "Durin’s Bane remains in staging and cannot be optionally engaged.";
  if (celebrimborProtected(s, u))
    return "Bellach cannot be engaged until stage two has 12 progress.";
  if (!amonPlayerCanEngage(s, u, activeSeat(s)))
    return "Pippin prevents this enemy from engaging this fellowship this round.";
  return (
    khazadOptionalEngageProblem(s, u) ??
    watcherWaterOptionalEngageProblem(s, u) ??
    null
  );
}

export function canPlay(
  s: GameState,
  u: Unit,
  options: {
    noCost?: boolean;
    resolvingEffect?: boolean;
    target?: Unit;
    playOrigin?: Card["playOrigin"];
  } = {},
): string | null {
  syncAttachmentText(s);
  const crownProblem = Antlered.antleredPlayProblem(s, u.code);
  if (crownProblem) return crownProblem;
  const ninProblem = Nin.ninPlayProblem(s, u.code);
  if (ninProblem) return ninProblem;
  const c = {
    ...card(u.code),
    playOwner: u.owner ?? activeSeat(s),
    ...(options.playOrigin ? { playOrigin: options.playOrigin } : {}),
  };
  if (
    dikeCannotLeaveDiscard(s) &&
    (options.playOrigin === "discard" ||
      ["01049", "01051", "01053", "01054", "02027"].includes(c.code))
  )
    return DIKE_DISCARD_REASON;
  if (c.code === FORDS.tidings)
    return "Ill Tidings cannot leave your hand or be played.";
  const printedPhase =
    c.type_code === "event"
      ? /(?:^|>)\s*(Combat|Quest|Refresh|Planning|Resource|Travel|Encounter) Action:/i
          .exec(c.text ?? "")?.[1]
          ?.toLowerCase()
      : undefined;
  if (
    printedPhase &&
    !(printedPhase === "combat"
      ? ["defense", "attack"].includes(s.phase)
      : printedPhase === "quest"
        ? ["quest", "staging"].includes(s.phase)
        : s.phase === printedPhase)
  )
    return `This is a ${printedPhase[0].toUpperCase() + printedPhase.slice(1)} Action.`;
  if (khazadCannotPlay(s))
    return "Bridge of Khazad-dûm prevents playing cards while active.";
  if (returnMirkwoodCannotPlay(s))
    return "Gollum’s guard cannot play cards during To the Elvin King’s Halls.";
  if (c.type_code === "event" && emynMuilEventsBlocked(s))
    return "Amon Hen prevents players from playing events while active.";
  if (s.flow?.pending && !options.resolvingEffect)
    return "Review the current event before playing another card.";
  if ((s.choice && !options.resolvingEffect) || s.status !== "playing")
    return "Resolve the current choice first.";
  if (s.table?.seats[activeSeat(s)].eliminated)
    return "This fellowship has been eliminated.";
  if (s.phase === "setup" && !s.escapeTest)
    return "Continue to the next action window.";
  if (s.escapeTest && c.type_code !== "event")
    return "Only events and abilities can be used during an escape test.";
  if (c.type_code === "ally" && !allyCanEnter(s, c.code))
    return "This ally cannot enter play because of its unique title or a scenario restriction.";
  if (c.code === "01023" && !s.hand.some((a) => allyCanEnter(s, a.code)))
    return "You need an eligible ally in hand.";
  if (s.scenarioId === "the-morgul-vale" && c.name === "Faramir")
    return "Faramir cannot be used in The Morgul Vale.";
  const isengardProblem = Isengard.isengardEventProblem(s, c.code);
  if (isengardProblem) return isengardProblem;
  const druadanProblem = druadanPlayerPlayProblem(s, c.code);
  const morgulProblem = morgulPlayerPlayProblem(s, c.code);
  if (morgulProblem) return morgulProblem;
  const osgiliathProblem = osgiliathPlayerPlayProblem(s, c.code);
  if (osgiliathProblem) return osgiliathProblem;
  const bloodProblem = bloodPlayerPlayProblem(s, c.code);
  if (bloodProblem) return bloodProblem;
  if (druadanProblem) return druadanProblem;
  const amonProblem = amonPlayerPlayProblem(s, c.code);
  if (amonProblem) return amonProblem;
  const stewardProblem = stewardPlayerPlayProblem(s, c.code);
  if (stewardProblem) return stewardProblem;
  const heirsProblem = heirsPlayerPlayProblem(s, c.code);
  const ringMakerProblem = ringMakerPlayProblem(s, c.code, u.id);
  if (ringMakerProblem) return ringMakerProblem;
  const rangerProblem = rangerPlayProblem(s, c.code);
  if (rangerProblem) return rangerProblem;
  const realmProblem = Realm.realmPlayProblem(s, c.code);
  if (realmProblem) return realmProblem;
  const angmarProblem = Angmar.angmarPlayProblem(
    s,
    c.code,
    options.playOrigin ?? "hand",
  );
  if (angmarProblem) return angmarProblem;
  const finalRingProblem = finalRingPlayProblem(s, c.code);
  if (finalRingProblem) return finalRingProblem;
  const dunlandProblem = dunlandPlayProblem(s, c.code);
  if (dunlandProblem) return dunlandProblem;
  if (heirsProblem) return heirsProblem;
  const collectorProblem = collectorPlayProblem(s, c.code);
  if (collectorProblem) return collectorProblem;
  const expansionProblem = expansionPlayProblem(s, c);
  if (expansionProblem) return expansionProblem;
  const gondorProblem = gondorPlayProblem(s, c.code);
  if (gondorProblem) return gondorProblem;
  const rhosPlayerProblem = rhosgobelPlayProblem(s, c.code);
  if (rhosPlayerProblem) return rhosPlayerProblem;
  const emynProblem = emynPlayerPlayProblem(s, c.code);
  if (emynProblem) return emynProblem;
  const mirkwoodProblem = mirkwoodPlayerPlayProblem(s, c.code);
  if (mirkwoodProblem) return mirkwoodProblem;
  const khazadProblem = khazadPlayerPlayProblem(s, c.code);
  if (khazadProblem) return khazadProblem;
  const longDarkProblem = longDarkPlayerPlayProblem(s, c.code);
  if (longDarkProblem) return longDarkProblem;
  const foundationsProblem = foundationsPlayerPlayProblem(s, c.code);
  if (foundationsProblem) return foundationsProblem;
  const shadowFlameProblem = shadowFlamePlayerPlayProblem(s, c.code);
  if (shadowFlameProblem) return shadowFlameProblem;
  const rohanProblem = rohanPlayProblem(s, c);
  if (rohanProblem) return rohanProblem;
  const watcherProblem = watcherPlayerPlayProblem(s, c.code);
  if (watcherProblem) return watcherProblem;
  const roadProblem = roadPlayerPlayProblem(s, c.code);
  if (roadProblem) return roadProblem;
  const redhornProblem = redhornPlayerPlayProblem(s, c.code);
  if (redhornProblem) return redhornProblem;
  const elfProblem = elfPlayProblem(s, c);
  if (elfProblem) return elfProblem;
  const dwarfProblem = dwarfPlayProblem(s, c.code);
  if (dwarfProblem) return dwarfProblem;
  if (
    !options.resolvingEffect &&
    ["ally", "attachment", "player-side-quest"].includes(c.type_code) &&
    s.table &&
    activeSeat(s) !== s.table.turn
  )
    return "Wait for this hero’s planning turn.";
  if (!options.noCost && !eligiblePayers(s, c, options.target).length)
    return "A matching sphere hero is required.";
  if (
    !options.resolvingEffect &&
    ["ally", "attachment", "player-side-quest"].includes(c.type_code) &&
    s.phase !== "planning"
  )
    return "Play allies, attachments and side quests during planning.";
  if (
    c.type_code === "ally" &&
    s.scenarioId === "dol-guldur" &&
    s.stage < 3 &&
    s.alliesPlayed >= 1
  )
    return "Only one ally may be played each round at this quest stage.";
  if (
    u.code === "rc132" &&
    (s.mendorBoost || !allCharacters(s).some((a) => a.code === "rc135"))
  )
    return "Mendor must be free, and his Support can be played once per round.";
  if (responseCards.includes(u.code))
    return u.code === "05008"
      ? "This action is offered automatically before combat damage."
      : "This response is offered automatically when its trigger occurs.";
  if (
    u.code === "01063" &&
    !allCharacters(s).some((h) => rhosgobelHealingAllowed(s, h))
  )
    return "There is no damaged character that can be healed.";
  if (
    ["01036", "08143", "10085"].includes(u.code) &&
    (options.noCost ||
      playCost(s, c) < 3 ||
      eligiblePayers(s, c).filter(
        (h) => h.resources > 0 && s.heroes.some((u) => u.id === h.id),
      ).length < 3)
  )
    return "This card needs resources from three different heroes' pools.";
  const requiredCost = options.target
    ? playCost(s, c, options.target)
    : c.type_code === "attachment" && needsTarget(u)
      ? Math.min(
          playCost(s, c),
          ...playTargets(s, u).map((host) => playCost(s, c, host)),
        )
      : playCost(s, c);
  if (
    !options.noCost &&
    eligiblePayers(s, c, options.target).reduce(
      (total, payer) => total + payer.resources,
      0,
    ) < requiredCost
  )
    return "Not enough matching resources.";
  if (
    !options.noCost &&
    singlePoolCard(c) &&
    !eligiblePayers(s, c, options.target).some(
      (h) => h.resources >= requiredCost,
    )
  )
    return "This card must be paid from a single hero’s resource pool.";
  if (
    c.is_unique &&
    globalUnits(s).some(
      (x) =>
        card(x.code)
          .name.normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "") ===
          c.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "") ||
        (x.code === REDHORN.arwen &&
          c.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "") ===
            "Arwen Undomiel") ||
        x.attachments.some(
          (a) => !a.facedown && !a.namelessCard && card(a.code).name === c.name,
        ),
    )
  )
    return "A unique card with this name is already in play.";
  return null;
}
export const canPlayAtNoCost = (s: GameState, u: Unit) =>
  canPlay(s, u, { noCost: true, resolvingEffect: true });

/** A printed free play still checks restrictions and uses the actual hand card. */
export function freeHandPlayProblem(s: GameState, u: Unit): string | null {
  if (!s.hand.some((h) => h.id === u.id)) return "Choose a card in your hand.";
  const problem = canPlay(s, u, {
    noCost: true,
    resolvingEffect: true,
    playOrigin: "hand",
  });
  if (problem) return problem;
  if (["01067", "06083"].includes(u.code))
    return "At no cost, X is zero and this event cannot change the game state.";
  if (needsTarget(u) && !effectCardPlayTargets(s, u).length)
    return "This card has no legal target.";
  return null;
}

export function playCardFromHandEffect(
  s: GameState,
  id: string,
  target?: string,
) {
  const u = s.hand.find((h) => h.id === id);
  requireRule(u, "Choose the actual card in your hand.");
  const problem = freeHandPlayProblem(s, u);
  requireRule(!problem, problem ?? "");
  if (needsTarget(u))
    requireRule(
      effectCardPlayTargets(s, u).some((t) => t.id === target),
      "Choose a legal target.",
    );
  s.hand = s.hand.filter((h) => h.id !== id);
  if (card(u.code).type_code === "event") {
    redhornPlayerEventPlayed(s, u.code);
    dunlandEventPlayed(s, u.code);
    ringMakerEventPlayed(s, u.code);
    Angmar.angmarEventPlayed(s, u.code);
    Carn.carnEventPlayed(s, u.code);
  }
  resolvePlayerCard(s, u, target, 0, true, true, false, 0);
}

/** Trusted card-effect entry retains restrictions; only cost and framework timing are bypassed. */
export function effectCardPlayProblem(
  s: GameState,
  u: Unit,
  options: { putIntoPlay: boolean },
): string | null {
  const c = card(u.code);
  if (!options.putIntoPlay) {
    if (
      !["ally", "attachment", "event", "player-side-quest"].includes(
        c.type_code,
      )
    )
      return "This card cannot be played from a player deck.";
    const problem = canPlay(s, u, {
      noCost: true,
      resolvingEffect: true,
      playOrigin: "deck",
    });
    if (problem) return problem;
    if (["01067", "06083"].includes(c.code))
      return `At no cost, X is zero and ${c.name} cannot change the game state.`;
  } else {
    if (["05017", "06115"].includes(c.code))
      return "This Trap needs a play effect to enter the staging area.";
    if (!["ally", "attachment", "player-side-quest"].includes(c.type_code))
      return "Only allies, attachments and side quests have a valid put-into-play area.";
    if (c.type_code === "ally" && !allyCanEnter(s, c.code))
      return "The ally's unique title or scenario restriction prevents entry.";
    if (c.type_code === "attachment") {
      const problem = expansionPlayProblem(s, c);
      if (problem) return problem;
      if (
        c.is_unique &&
        globalUnits(s).some(
          (x) =>
            card(x.code).name === c.name ||
            x.attachments.some(
              (a) =>
                !a.facedown && !a.namelessCard && card(a.code).name === c.name,
            ),
        )
      )
        return "That unique attachment is already in play.";
    }
  }
  if (needsTarget(u) && !effectCardPlayTargets(s, u, options).length)
    return "This card has no legal target.";
  return null;
}
export function effectCardPlayTargets(
  s: GameState,
  u: Unit,
  options: { putIntoPlay: boolean } = { putIntoPlay: false },
): Unit[] {
  const targets = playTargets(s, u, options);
  return u.code === "01051"
    ? targets.filter((target) => (Number(card(target.code).cost) || 0) === 0)
    : targets;
}

/** A discard replay retains the event's printed timing, targets and normal resource cost. */
export function replayEventProblem(
  s: GameState,
  u: Unit,
  target?: string,
  amount?: number,
): string | null {
  if (dikeCannotLeaveDiscard(s)) return DIKE_DISCARD_REASON;
  if (card(u.code).type_code !== "event")
    return "Choose an event in your discard pile.";
  if (u.code === "01051" && target === undefined)
    return playTargets(s, u).some(
      (candidate) => !replayEventProblem(s, u, candidate.id),
    )
      ? null
      : "No eligible discarded ally can be paid for.";
  if (["01067", "06083"].includes(u.code) && amount === undefined)
    return replayEventProblem(s, u, target, 1);
  const problem = canPlay(s, u, {
    resolvingEffect: true,
    playOrigin: "discard",
    target: get(s, target),
  });
  if (problem) return problem;
  if (
    needsTarget(u) &&
    !playTargets(s, u).some(
      (candidate) => target === undefined || candidate.id === target,
    )
  )
    return "This event has no legal target.";
  if (
    (card(u.code).printed_stats?.cost === "X" || card(u.code).cost === "X") &&
    !["01051", "01067", "06083", "08010"].includes(u.code)
  )
    return "Choose an event with a fixed resource cost.";
  if (["01067", "06083"].includes(u.code)) {
    const maximum = eventXMaximum(s, u.code);
    if (!Number.isInteger(amount) || amount! <= 0 || amount! > maximum)
      return "Choose a positive X within the available cards.";
  }
  if (!eventReplayPayments(s, u, target, amount).length)
    return "The event's resource payment cannot be made.";
  return null;
}

/** X is a printed choice, independent of any modifiers to its resource payment. */
export function eventXMaximum(s: GameState, code: string): number {
  if (code === "01067")
    return Math.max(
      0,
      ...livingSeats(s).map((i) => seatView(s, i).deck.length),
    );
  if (code === "06083")
    return s.discard.filter(
      (entry) =>
        card(entry).type_code === "ally" &&
        (card(entry).traits ?? "")
          .split(".")
          .some((trait) => trait.trim() === "Outlands"),
    ).length;
  return 0;
}

export function eventReplayPayments(
  s: GameState,
  u: Unit,
  target?: string,
  amount?: number,
): Record<string, number>[] {
  if (u.code === "01051" && target === undefined) return [];
  const definition = card(u.code),
    effectiveCost = replayEventCost(s, u, target, amount),
    c = { ...definition, cost: effectiveCost, playOrigin: "discard" as const },
    payers = eligiblePayers(s, c, get(s, target)),
    cost = playCost(s, c, get(s, target));
  const result: Record<string, number>[] = [];
  const allocate = (
    i: number,
    left: number,
    payment: Record<string, number>,
  ) => {
    if (i === payers.length) {
      if (
        left === 0 &&
        (!singlePoolCard(c) ||
          Object.values(payment).filter((n) => n > 0).length <= 1) &&
        (!["01036", "08143", "10085"].includes(u.code) ||
          Object.values(payment).filter((n) => n > 0).length === 3)
      )
        result.push(payment);
      return;
    }
    for (
      let amount = 0;
      amount <= Math.min(left, payers[i].resources);
      amount++
    )
      allocate(i + 1, left - amount, {
        ...payment,
        ...(amount ? { [payers[i].id]: amount } : {}),
      });
  };
  if (payers.length && Number.isInteger(cost) && cost >= 0)
    allocate(0, cost, {});
  return result;
}

function replayEventCost(
  s: GameState,
  u: Unit,
  target?: string,
  amount?: number,
) {
  if (u.code === "08010") return playerOrder(s).length;
  if (u.code === "01051") {
    const selected = discardTarget(s, target!);
    return (
      Number(card(seatView(s, selected.player).discard[selected.index]).cost) ||
      0
    );
  }
  return ["01067", "06083"].includes(u.code)
    ? (amount ?? 0)
    : Number(card(u.code).cost) || 0;
}

export function playEventFromDiscardEffect(
  s: GameState,
  index: number,
  options: {
    target?: string;
    payment?: Record<string, number>;
    bottom?: boolean;
    amount?: number;
  } = {},
) {
  requireRule(
    index >= 0 && index < s.discard.length,
    "Choose the actual event in your discard pile.",
  );
  const preview = { ...s.heroes[0], code: s.discard[index] } as Unit;
  if (options.target?.startsWith("discard-")) {
    const selected = discardTarget(s, options.target);
    requireRule(
      selected.player !== activeSeat(s) || selected.index !== index,
      "The resolving event cannot target its own physical discard copy.",
    );
  }
  if (["01067", "06083"].includes(preview.code))
    requireRule(
      options.amount !== undefined,
      "Choose an explicit X before playing this event from discard.",
    );
  const problem = replayEventProblem(
    s,
    preview,
    options.target,
    options.amount,
  );
  requireRule(!problem, problem ?? "");
  if (needsTarget(preview))
    requireRule(
      playTargets(s, preview).some((target) => target.id === options.target),
      "Choose a legal event target.",
    );
  if (["01036", "08143", "10085"].includes(preview.code))
    requireRule(
      options.payment &&
        Object.values(options.payment).filter((n) => n > 0).length === 3,
      "This card needs three hero resource pools.",
    );
  const effectiveCost = replayEventCost(
    s,
    preview,
    options.target,
    options.amount,
  );
  pay(
    s,
    { ...card(preview.code), cost: effectiveCost, playOrigin: "discard" },
    options.payment,
    get(s, options.target),
  );
  const physical = takePlayerDiscard(s, index);
  let target = options.target;
  if (target?.startsWith("discard-")) {
    const selected = discardTarget(s, target);
    if (selected.player === activeSeat(s) && selected.index > index)
      target = s.table
        ? `discard-${selected.player}-${selected.index - 1}`
        : `discard-${selected.index - 1}`;
  }
  resolvePaidPlayerCard(
    s,
    physical,
    target,
    effectiveCost,
    true,
    false,
    !!options.bottom,
    options.amount ?? effectiveCost,
  );
}
/** Mandatory reactions to actual resource payment finish before the paid card is played. */
export function resolvePaidPlayerCard(
  s: GameState,
  u: Unit,
  target: string | undefined,
  effectiveCost: number,
  played: boolean,
  fromHand: boolean,
  bottom = false,
  amount = 0,
) {
  const costs = s.queue.filter((e) =>
    ["ettenForageDamage", "carnResourceTax"].includes(e.kind),
  );
  if (!costs.length) {
    if (played && card(u.code).type_code === "event") paidEventPlayed(s, u);
    resolvePlayerCard(
      s,
      u,
      target,
      effectiveCost,
      played,
      fromHand,
      bottom,
      amount,
    );
    return;
  }
  const costSet = new Set(costs);
  s.queue = s.queue.filter((e) => !costSet.has(e));
  (s.pendingPlayerPlays ??= []).push({
    unit: u,
    player: activeSeat(s),
    target,
    effectiveCost,
    played,
    fromHand,
    bottom,
    amount,
  });
  prepend(
    s,
    ...costs,
    fx("paidPlayerCardEntry", { target: u.id, player: activeSeat(s) }),
  );
}
function paidEventPlayed(s: GameState, u: Unit) {
  redhornPlayerEventPlayed(s, u.code);
  dunlandEventPlayed(s, u.code);
  ringMakerEventPlayed(s, u.code);
  Angmar.angmarEventPlayed(s, u.code);
  Carn.carnEventPlayed(s, u.code);
}
/** Resume the reserved physical card once; costs have already been paid and resolved. */
export function handlePaidPlayerCardEntry(s: GameState, e: Effect): boolean {
  if (e.kind !== "paidPlayerCardEntry") return false;
  const pending = s.pendingPlayerPlays?.find(
    (entry) => entry.unit.id === e.target,
  );
  if (!pending) return true;
  s.pendingPlayerPlays = s.pendingPlayerPlays!.filter(
    (entry) => entry !== pending,
  );
  if (!s.pendingPlayerPlays.length) delete s.pendingPlayerPlays;
  const discardReserved = () =>
    forOwner(s, pending.unit.owner ?? pending.player, () => {
      s.discard.push(pending.unit.code);
      foundationsPlayerCardDiscarded(s, pending.unit);
      Dread.dreadPlayerCardDiscarded(s, pending.unit);
    });
  if (s.status !== "playing" || s.table?.seats[pending.player]?.eliminated) {
    discardReserved();
    return true;
  }
  forOwner(s, pending.player, () => {
    if (
      card(pending.unit.code).type_code === "attachment" &&
      !playTargets(s, pending.unit).some(
        (target) => target.id === pending.target,
      )
    ) {
      discardReserved();
      log(
        s,
        `${card(pending.unit.code).name} is discarded because its target left play or became ineligible during payment.`,
      );
      return;
    }
    if (pending.played && card(pending.unit.code).type_code === "event")
      paidEventPlayed(s, pending.unit);
    resolvePlayerCard(
      s,
      pending.unit,
      pending.target,
      pending.effectiveCost,
      pending.played,
      pending.fromHand,
      pending.bottom,
      pending.amount,
    );
  });
  return true;
}

export function resolvePlayerCard(
  s: GameState,
  u: Unit,
  target: string | undefined,
  effectiveCost: number,
  played: boolean,
  fromHand: boolean,
  bottom = false,
  amount = 0,
) {
  const c = card(u.code);
  if (played && s.ninEilph) s.used.push("nin:played");
  log(s, `${played ? "Played" : "Put into play"} ${c.name}.`, "good");
  if (
    c.type_code === "attachment" &&
    u.owner !== undefined &&
    u.owner !== activeSeat(s)
  )
    u.controller = activeSeat(s);
  if (c.type_code === "player-side-quest") {
    u.controller = activeSeat(s);
    s.staging.push(u);
  } else if (c.type_code === "ally") {
    if (played) s.alliesPlayed++;
    enterAlly(s, u, false, played, fromHand);
  } else if (
    c.type_code === "attachment" &&
    played &&
    (heirsPlayerSpecialAttachmentEntry(s, u) ||
      amonPlayerSpecialAttachmentEntry(s, u) ||
      bloodPlayerSpecialAttachmentEntry(s, u))
  ) {
  } else if (c.type_code === "attachment") {
    const host = get(s, target)!;
    const attachment = {
      id: u.id,
      code: u.code,
      exhausted: false,
      ...(u.controller !== undefined ? { controller: u.controller } : {}),
      ...(s.table ? { owner: u.owner ?? activeSeat(s) } : {}),
    };
    if (host.id.startsWith("quest:"))
      requireRule(
        attachToQuest(s, host.code, attachment),
        "Choose the current encounter quest.",
      );
    else if (host.id.startsWith("threat:")) {
      const player = Number(host.id.slice(7));
      requireRule(
        playerOrder(s).includes(player),
        "Choose a living player's threat dial.",
      );
      forOwner(s, player, () => (s.threatAttachments ??= []).push(attachment));
    } else host.attachments.push(attachment);
    if (played)
      redhornPlayerAttachmentPlayed(s, host, attachment, activeSeat(s));
    roadPlayerAttachmentEntered(s, host, attachment);
  } else {
    resolveEventAbility(
      s,
      u,
      () => {
        const abilityCost = finalRingEventCost(s, u.code, target);
        if (played) stewardFearEventPlayed(s);
        s.queue.push(
          fx("playerEventAbility", {
            target: u.id,
            source: target,
            code: u.code,
            value: effectiveCost,
            count: abilityCost ?? amount,
            player: activeSeat(s),
          }),
        );
      },
      bottom,
    );
  }
  if (c.type_code !== "ally")
    Isengard.isengardPlayerPlayed(s, u, played && fromHand);
  if (played && c.type_code !== "ally") heirsPlayerCardPlayed(s, c);
  if (played && c.type_code !== "ally")
    longDarkPlayerCardPlayed(s, c, activeSeat(s));
}
/** Resolve the actual played event after mandatory reactions to its play. */
export function handlePlayerEventAbilityEffect(
  s: GameState,
  e: Effect,
): boolean {
  if (e.kind !== "playerEventAbility") return false;
  const physical = s.resolvingEvents?.find(
    (event) => event.unit.id === e.target,
  )?.unit;
  if (!physical) return true;
  if (
    !shadowFlameEventCancelled(s) &&
    !heirsPlayerEventEffect(s, physical.code, e.source) &&
    !collectorEventEffect(s, physical.code, e.source) &&
    !rohanEventEffect(s, physical.code) &&
    !roadPlayerEventEffect(s, physical.code, e.source) &&
    !redhornPlayerEventEffect(s, physical.code, e.source) &&
    !elfEventEffect(s, physical.code, e.source) &&
    !mirkwoodPlayerEventEffect(s, physical.code) &&
    !dwarfEventEffect(s, physical.code, e.source)
  )
    eventEffect(s, physical.code, e.source, e.value ?? 0, e.count ?? 0);
  return true;
}
/** Vilya resolves the recorded physical top card, never a fabricated hand play. */
export function playCardFromEffect(
  s: GameState,
  u: Unit,
  options: { putIntoPlay: boolean; target?: string },
) {
  const problem = effectCardPlayProblem(s, u, options);
  requireRule(!problem, problem ?? "");
  requireRule(
    s.deck[0] === u.code,
    "The revealed physical card must remain on top of its owner's deck.",
  );
  if (needsTarget(u))
    requireRule(
      effectCardPlayTargets(s, u, options).some(
        (target) => target.id === options.target,
      ),
      "Choose a legal target for the revealed card.",
    );
  const physical = takePlayerDeck(s);
  u.id = physical.id;
  if (!options.putIntoPlay && card(u.code).type_code === "event") {
    redhornPlayerEventPlayed(s, u.code);
    dunlandEventPlayed(s, u.code);
    ringMakerEventPlayed(s, u.code);
    Angmar.angmarEventPlayed(s, u.code);
    Carn.carnEventPlayed(s, u.code);
  }
  // Printed X defaults to zero when an effect pays no cost.
  resolvePlayerCard(
    s,
    u,
    options.target,
    Number(card(u.code).cost) || 0,
    !options.putIntoPlay,
    false,
  );
}

export function discardTarget(s: GameState, target: string) {
  const parts = target.split("-").slice(1).map(Number);
  return {
    player: parts.length > 1 ? parts[0] : activeSeat(s),
    index: parts.at(-1)!,
  };
}

export function playTargets(
  s: GameState,
  u: Unit,
  options: { putIntoPlay: boolean } = { putIntoPlay: false },
): Unit[] {
  return rawPlayTargets(s, u).filter(
    (target) =>
      !playerCardImmune(target) &&
      (card(u.code).type_code !== "attachment" ||
        (!Dike.dikeCannotAttach(s, target) &&
          !Wastes.wastesCannotAttach(s, target) &&
          !Dread.dreadCannotAttach(s, target) &&
          !Carn.carnCannotAttach(s, target) &&
          !Rhudaur.rhudaurCannotAttach(s, target) &&
          !heirsCannotHaveAttachments(target) &&
          Trials.trialsCanAttach(target, u.code))) &&
      (card(u.code).type_code !== "attachment" ||
        target.blanked ||
        !restrictedAttachment(u.code) ||
        !/cannot have restricted attachments/i.test(
          plain(card(target.code).text),
        )) &&
      (card(u.code).type_code !== "attachment" ||
        (rhosgobelCanAttach(s, target) &&
          (options.putIntoPlay ||
            target.code !== SHADOW_FLAME.bane ||
            !!target.blanked))) &&
      (u.code !== "01063" || rhosgobelHealingAllowed(s, target)),
  );
}

function rawPlayTargets(s: GameState, u: Unit): Unit[] {
  syncAttachmentText(s);
  const c = card(u.code);
  const ringMakerTargets = ringMakerPlayTargets(s, c.code);
  if (ringMakerTargets) return ringMakerTargets;
  const realmTargets = Realm.realmPlayTargets(s, c.code);
  if (realmTargets) return realmTargets;
  const angmarTargets = Angmar.angmarPlayTargets(s, c.code);
  if (angmarTargets) return angmarTargets;
  const finalRingTargets = finalRingPlayTargets(s, c.code);
  if (finalRingTargets) return finalRingTargets;
  const dunlandTargets = dunlandPlayTargets(s, c.code);
  if (dunlandTargets) return dunlandTargets;
  const amonTargets = amonPlayerPlayTargets(s, c.code);
  const morgulTargets = morgulPlayerPlayTargets(s, c.code);
  if (morgulTargets) return morgulTargets;
  const osgiliathTargets = osgiliathPlayerPlayTargets(s, c.code);
  if (osgiliathTargets) return osgiliathTargets;
  const bloodTargets = bloodPlayerPlayTargets(s, c.code);
  if (bloodTargets) return bloodTargets;
  if (amonTargets) return amonTargets;
  const stewardTargets = stewardPlayerPlayTargets(s, c.code);
  if (stewardTargets) return stewardTargets;
  const heirsTargets = heirsPlayerPlayTargets(s, c.code);
  if (heirsTargets) return heirsTargets;
  const collectorTargets = collectorPlayTargets(s, c.code);
  if (collectorTargets) return collectorTargets;
  const shadowFlameTargets = shadowFlamePlayerPlayTargets(s, c.code);
  if (shadowFlameTargets) return shadowFlameTargets;
  const longDarkTargets = longDarkPlayerPlayTargets(s, c.code);
  if (longDarkTargets) return longDarkTargets;
  const rohanTargets = rohanPlayTargets(s, c);
  if (rohanTargets) return rohanTargets;
  const expansionTargets = expansionPlayTargets(s, c);
  if (expansionTargets) return expansionTargets;
  const gondorTargets = gondorPlayTargets(s, c.code);
  if (gondorTargets) return gondorTargets;
  const rhosTargets = rhosgobelPlayTargets(s, c.code);
  if (rhosTargets) return rhosTargets;
  const emynTargets = emynPlayerPlayTargets(s, c.code);
  if (emynTargets) return emynTargets;
  const mirkwoodTargets = mirkwoodPlayerPlayTargets(s, c.code);
  if (mirkwoodTargets) return mirkwoodTargets;
  const khazadTargets = khazadPlayerPlayTargets(s, c.code);
  if (khazadTargets) return khazadTargets;
  const roadTargets = roadPlayerPlayTargets(s, c.code);
  if (roadTargets) return roadTargets;
  const redhornTargets = redhornPlayerPlayTargets(s, c.code);
  if (redhornTargets) return redhornTargets;
  const elfTargets = elfPlayTargets(s, c);
  if (elfTargets) return elfTargets;
  const dwarfTargets = dwarfPlayTargets(s, c.code);
  if (dwarfTargets) return dwarfTargets;
  if (c.type_code === "attachment") {
    if (u.code === "01056")
      return [...s.staging, ...allActiveLocations(s)].filter(
        (x) =>
          card(x.code).type_code === "location" && x.code !== CARROCK.carrock,
      );
    if (u.code === "01069")
      return [
        ...new Map(
          playerOrder(s)
            .flatMap((p) => engagedEnemies(s, p))
            .map((e) => [e.id, e]),
        ).values(),
      ].filter((e) => e.code !== "01102");
    if (u.code === "01072") return allCharacters(s);
    return allHeroes(s);
  }
  if (u.code === "01020")
    return allCharacters(s).filter(
      (a) =>
        card(a.code).type_code === "ally" && a.exhausted && !cannotReady(a, s),
    );
  if (u.code === "01021")
    return s.heroes.filter(
      (a) =>
        !a.exhausted &&
        allHeroes(s).some(
          (h) => h.id !== a.id && h.exhausted && !cannotReady(h, s),
        ),
    );
  if (u.code === "01032") return allCharacters(s);
  if (u.code === "01033")
    return characters(s).filter(
      (a) => !a.exhausted && card(a.code).text?.includes("Ranged"),
    );
  if (u.code === "01035")
    return characters(s).filter(
      (a) =>
        !a.exhausted &&
        canFight(a) &&
        [
          ...allEngaged(s),
          ...s.staging.filter((e) => card(e.code).type_code === "enemy"),
        ].some((enemy) => attackersFor(s, enemy).some((x) => x.id === a.id)),
    );
  if (["01034", "01052"].includes(u.code))
    return [
      ...new Map(
        playerOrder(s)
          .flatMap((p) => engagedEnemies(s, p))
          .map((e) => [e.id, e]),
      ).values(),
    ].filter(
      (enemy) =>
        u.code !== "01052" ||
        (shadowFlameCanMove(s, enemy) &&
          !MorgulQuest.morgulCannotLeave(s, enemy)),
    );
  if (u.code === "01063") return allCharacters(s).filter((a) => a.damage > 0);
  if (u.code === "01065")
    return s.staging.filter((a) => card(a.code).type_code === "enemy");
  if (u.code === "01066")
    return s.staging.filter(
      (a) =>
        card(a.code).type_code === "location" && a.code !== CARROCK.carrock,
    );
  if (["01051", "01053", "01054"].includes(u.code))
    return dikeCannotLeaveDiscard(s)
      ? []
      : (s.table && u.code !== "01053"
          ? livingSeats(s)
          : [activeSeat(s)]
        ).flatMap((player) =>
          seatView(s, player)
            .discard.map((code, i) => ({
              ...s.heroes[0],
              code,
              id: s.table ? `discard-${player}-${i}` : `discard-${i}`,
            }))
            .filter((a) =>
              u.code === "01051"
                ? allyCanEnter(s, a.code) &&
                  card(a.code).sphere_code !== "neutral"
                : u.code === "01053"
                  ? card(a.code).sphere_code === "spirit"
                  : card(a.code).type_code === "hero",
            ),
        );
  return [];
}

export const needsTarget = (u: Unit) =>
  u.code === "09008" ||
  (!["05017", "06064", "06115"].includes(u.code) &&
    (card(u.code).type_code === "attachment" ||
      [
        "01020",
        "01021",
        "01032",
        "01033",
        "01034",
        "01035",
        "01051",
        "01052",
        "01053",
        "01054",
        "01063",
        "01065",
        "01066",
        "02052",
        "02058",
        "02074",
        "02076",
        "02078",
        "03004",
        "04084",
        "04131",
        "08060",
        "05006",
        "06003",
        "06140",
        "06089",
        "06113",
        "08003",
        "08033",
        "08061",
        "08090",
        "08142",
      ].includes(u.code)));

export const responseCards = [
  "09009",
  "08144",
  "08062",
  "08005",
  "01024",
  "01037",
  "01047",
  "01048",
  "01050",
  "02009",
  "131015",
  "05008",
  "02054",
];

export function availableAbilities(s: GameState, u: Unit) {
  syncAttachmentText(s, u);
  if (u.code === FORDS.grima)
    return [
      {
        label: "Exhaust Gríma to draw a card",
        disabled: !!Fords.fordsAbilityProblem(s, u),
      },
    ];
  const bloodScenarioLabel = BloodQuest.bloodGondorAbilityLabel(u.code);
  if (bloodScenarioLabel)
    return [
      {
        label: bloodScenarioLabel,
        disabled: !!BloodQuest.bloodGondorAbilityProblem(s, u),
      },
    ];
  const heirsScenarioLabel = heirsAbilityLabel(u.code);
  if (heirsScenarioLabel)
    return [
      { label: heirsScenarioLabel, disabled: !!heirsAbilityProblem(s, u) },
    ];
  const foundationsScenarioLabel = foundationsAbilityLabel(u.code);
  if (foundationsScenarioLabel)
    return [
      {
        label: foundationsScenarioLabel,
        disabled: !!foundationsAbilityProblem(s, u),
      },
    ];
  if (s.hand.some((x) => x.id === u.id)) {
    const bloodHandLabel = bloodPlayerHandAbilityLabel(u.code);
    const label =
      Angmar.angmarAbilityLabel(u.code) ??
      bloodHandLabel ??
      redhornPlayerHandAbilityLabel(u.code);
    const problem = Angmar.angmarAbilityLabel(u.code)
      ? Angmar.angmarAbilityProblem(s, u)
      : bloodHandLabel
        ? bloodPlayerHandAbilityProblem(s, u)
        : redhornPlayerHandAbilityProblem(s, u);
    return label
      ? [
          {
            label,
            disabled: (s.phase === "setup" && !s.escapeTest) || !!problem,
          },
        ]
      : [];
  }
  const rhudaurLabel = Rhudaur.rhudaurAbilityLabel(s, u);
  if (rhudaurLabel)
    return [{ label: rhudaurLabel, disabled: s.phase === "setup" }];
  const results: { id?: string; label: string; disabled: boolean }[] = [];
  const angmarLabel = Angmar.angmarAbilityLabel(u.code);
  if (angmarLabel)
    results.push({
      label: angmarLabel,
      disabled: !!Angmar.angmarAbilityProblem(s, u),
    });
  const finalRingLabel = finalRingAbilityLabel(u.code);
  if (finalRingLabel)
    results.push({
      label: finalRingLabel,
      disabled: !!finalRingAbilityProblem(s, u),
    });
  const isengardLabel = Isengard.isengardAbilityLabel(u.code);
  if (isengardLabel)
    results.push({
      label: isengardLabel,
      disabled: !!Isengard.isengardAbilityProblem(s, u),
    });
  const osgiliathLabel = Osgiliath.assaultOsgiliathAbilityLabel(u.code);
  if (osgiliathLabel)
    results.push({
      label: osgiliathLabel,
      disabled: !!Osgiliath.assaultOsgiliathAbilityProblem(s, u),
    });
  const bloodLabel = bloodPlayerAbilityLabel(u.code);
  if (bloodLabel)
    results.push({
      label: bloodLabel,
      disabled: !!bloodPlayerAbilityProblem(s, u),
    });
  const waterLabel = watcherWaterAbilityLabel(u);
  if (waterLabel)
    results.push({
      label: waterLabel,
      disabled: !!watcherWaterAbilityProblem(s, u),
    });
  const heirsLabel = heirsPlayerAbilityLabel(u.code);
  if (heirsLabel)
    results.push({
      label: heirsLabel,
      disabled: !!heirsPlayerAbilityProblem(s, u),
    });
  const collectorLabel = collectorAbilityLabel(u.code);
  if (collectorLabel)
    results.push({
      label: collectorLabel,
      disabled: !!collectorAbilityProblem(s, u),
    });
  const shadowFlameLabel = shadowFlamePlayerAbilityLabel(u.code);
  if (shadowFlameLabel)
    results.push({
      label: shadowFlameLabel,
      disabled: !!shadowFlamePlayerAbilityProblem(s, u),
    });
  const foundationsLabel = foundationsPlayerAbilityLabel(u.code);
  if (foundationsLabel)
    results.push({
      label: foundationsLabel,
      disabled: !!foundationsPlayerAbilityProblem(s, u),
    });
  const shadowLabel = shadowFlameAbilityLabel(u);
  if (shadowLabel)
    results.push({
      label: shadowLabel,
      disabled: !!shadowFlameAbilityProblem(s, u),
    });
  const longDarkLabel = longDarkPlayerAbilityLabel(u.code);
  if (longDarkLabel)
    results.push({
      label: longDarkLabel,
      disabled: !!longDarkPlayerAbilityProblem(s, u),
    });
  const rohanLabel = rohanAbilityLabel(u.code);
  if (rohanLabel)
    results.push({ label: rohanLabel, disabled: !!rohanAbilityProblem(s, u) });
  const watcherLabel = watcherPlayerAbilityLabel(u.code);
  if (watcherLabel)
    results.push({
      label: watcherLabel,
      disabled: !!watcherPlayerAbilityProblem(s, u),
    });
  const roadLabel = roadPlayerAbilityLabel(u.code);
  if (roadLabel)
    results.push({
      label: roadLabel,
      disabled: !!roadPlayerAbilityProblem(s, u),
    });
  const redhornLabel = redhornPlayerAbilityLabel(u.code);
  if (redhornLabel)
    results.push({
      label: redhornLabel,
      disabled: !!redhornPlayerAbilityProblem(s, u),
    });
  if (u.code === KHAZAD.shaft)
    results.push({
      label: "Raise each player’s threat · place 1 progress",
      disabled: !!khazadAbilityProblem(s, u),
    });
  const huntLabel = huntAbilityLabel(u.code);
  if (huntLabel)
    results.push({ label: huntLabel, disabled: !!huntAbilityProblem(s, u) });
  const gondorLabel = gondorAbilityLabel(u.code);
  if (gondorLabel)
    results.push({
      label: gondorLabel,
      disabled: !!gondorAbilityProblem(s, u),
    });
  const rhosLabel = rhosgobelAbilityLabel(u.code);
  if (rhosLabel)
    results.push({
      label: rhosLabel,
      disabled: !!rhosgobelAbilityProblem(s, u),
    });
  const emynLabel = emynPlayerAbilityLabel(u.code);
  if (emynLabel)
    results.push({
      label: emynLabel,
      disabled: !!emynPlayerAbilityProblem(s, u),
    });
  const marshLabel = marshPlayerAbilityLabel(u.code);
  if (marshLabel)
    results.push({
      label: marshLabel,
      disabled: !!marshPlayerAbilityProblem(s, u),
    });
  const khazadLabel = khazadPlayerAbilityLabel(u.code);
  if (khazadLabel)
    results.push({
      label: khazadLabel,
      disabled: !!khazadPlayerAbilityProblem(s, u),
    });
  const elfLabel = elfAbilityLabel(u.code);
  if (elfLabel)
    results.push({ label: elfLabel, disabled: !!elfAbilityProblem(s, u) });
  const dwarfLabel = dwarfAbilityLabel(u.code);
  if (dwarfLabel)
    results.push({ label: dwarfLabel, disabled: !!dwarfAbilityProblem(s, u) });
  if (u.code === CARROCK.grimbeorn)
    results.push({
      label: "Help Grimbeorn · Pay 1 resource",
      disabled: !carrockCanContribute(s, u),
    });
  const heroAbility: Record<string, string> = {
    "01007": "Strength of spirit",
    "01010": "Look ahead",
    "01011": "Healing touch",
    "01012": "Draw 2 cards",
    "01014": "Rally fellowship",
    "01031": "Beorn’s fury",
    "01058": "Heal a hero",
    "01060": "Scout the path",
    "01062": "Draw a card",
    ...(s.table ? { "01043": "Visit another fellowship" } : {}),
  };
  if (heroAbility[u.code] && !u.blanked)
    results.push({
      label: heroAbility[u.code],
      disabled:
        (["01012", "01062"].includes(u.code) && ninNoCardEconomy(s)) ||
        (u.code === "01007"
          ? s.eowynUsed || !movableHand(s).length
          : u.code === "01011"
            ? s.used.includes(u.id) ||
              u.resources < 1 ||
              !heirsCanSpendResources(s, u) ||
              !allCharacters(s).some((h) => rhosgobelHealingAllowed(s, h))
            : u.code === "01031"
              ? s.used.includes(u.id)
              : u.code === "01058"
                ? u.exhausted ||
                  !allHeroes(s).some((h) => rhosgobelHealingAllowed(s, h))
                : s.used.includes(u.id) || u.exhausted),
    });
  for (const a of u.attachments) {
    if (a.blanked) continue;
    const angmarLabel = Angmar.angmarAbilityLabel(a.code);
    if (angmarLabel && attachmentController(s, u, a) === activeSeat(s))
      results.push({
        id: a.id,
        label: angmarLabel,
        disabled: !!Angmar.angmarAbilityProblem(s, u, a.id),
      });
    const realmLabel = Realm.realmAbilityLabel(a.code);
    if (realmLabel && attachmentController(s, u, a) === activeSeat(s))
      results.push({
        id: a.id,
        label: realmLabel,
        disabled: !!Realm.realmAbilityProblem(s, u, a.id),
      });
    const finalRingAttachmentLabel = finalRingAbilityLabel(a.code);
    if (
      finalRingAttachmentLabel &&
      attachmentController(s, u, a) === activeSeat(s)
    )
      results.push({
        id: a.id,
        label: finalRingAttachmentLabel,
        disabled: !!finalRingAbilityProblem(s, u, a.id),
      });
    const stewardLabel = stewardFearAbilityLabel(u, a.id);
    if (stewardLabel && attachmentController(s, u, a) === activeSeat(s))
      results.push({
        id: a.id,
        label: stewardLabel,
        disabled: !!stewardFearAbilityProblem(s, u, a.id),
      });
    const osgiliathLabel = osgiliathPlayerAbilityLabel(a.code);
    if (osgiliathLabel && attachmentController(s, u, a) === activeSeat(s))
      results.push({
        id: a.id,
        label: osgiliathLabel,
        disabled: !!osgiliathPlayerAbilityProblem(s, u, a.id),
      });
    const bloodAttachmentLabel = bloodPlayerAbilityLabel(a.code);
    if (bloodAttachmentLabel && attachmentController(s, u, a) === activeSeat(s))
      results.push({
        id: a.id,
        label: bloodAttachmentLabel,
        disabled: !!bloodPlayerAbilityProblem(s, u, a.id),
      });
    const morgulLabel = morgulPlayerAbilityLabel(a.code);
    if (morgulLabel && attachmentController(s, u, a) === activeSeat(s))
      results.push({
        id: a.id,
        label: morgulLabel,
        disabled: !!morgulPlayerAbilityProblem(s, u, a.id),
      });
    const amonLabel = amonPlayerAbilityLabel(a.code);
    if (amonLabel && attachmentController(s, u, a) === activeSeat(s))
      results.push({
        id: a.id,
        label: amonLabel,
        disabled: !!amonPlayerAbilityProblem(s, u, a.id),
      });
    const waterAttachmentLabel = watcherWaterAbilityLabel(u, a.id);
    if (waterAttachmentLabel)
      results.push({
        id: a.id,
        label: waterAttachmentLabel,
        disabled: !!watcherWaterAbilityProblem(s, u, a.id),
      });
    const active = [
      KHAZAD.torch,
      KHAZAD.tools,
      KHAZAD.fear,
      "04010",
      ...SHADOW_FLAME_ATTACHMENT_ACTIONS,
      ...HEIRS_ATTACHMENT_ACTIONS,
      ...ELF_ATTACHMENT_ACTIONS,
      "02117",
      "02120",
      ...DWARF_ATTACHMENT_ACTIONS,
      "01026",
      "01057",
      "01070",
      "01071",
      "01072",
      "02002",
      "02026",
      "02029",
      "02051",
      "02097",
      "02099",
      "02103",
      "04109",
      "04110",
    ].includes(a.code);
    if (active && attachmentController(s, u, a) === activeSeat(s))
      results.push({
        id: a.id,
        label: card(a.code).name,
        disabled:
          (a.exhausted &&
            !["04010", "04133", ...HEIRS_ATTACHMENT_ACTIONS].includes(
              a.code,
            )) ||
          !!heirsPlayerAbilityProblem(s, u, a.id) ||
          !!shadowFlamePlayerAbilityProblem(s, u, a.id) ||
          (a.code === "01026" && !canGainResources(s, u)) ||
          (a.code === "01057" && (!u.exhausted || cannotReady(u, s))) ||
          !!huntAbilityProblem(s, u, a.id) ||
          !!utilityAbilityProblem(s, u, a.id) ||
          !!marshPlayerAbilityProblem(s, u, a.id) ||
          !!dwarfAbilityProblem(s, u, a.id) ||
          !!mirkwoodPlayerAbilityProblem(s, u, a.id) ||
          !!elfAbilityProblem(s, u, a.id) ||
          !!redhornPlayerAbilityProblem(s, u, a.id) ||
          !!khazadAbilityProblem(s, u, a.id),
      });
  }
  return results.map((a) =>
    (s.phase === "setup" && !s.escapeTest) ||
    (!a.id && (isSacked(u) || u.blanked))
      ? { ...a, disabled: true }
      : a,
  );
}

/** Resolve staging after mandatory stat choices and pre-resolution effects. */
export function resolveQuestResult(s: GameState) {
  if (
    Osgiliath.assaultOsgiliathPrepareQuest(
      s,
      fx("resolveQuestResult", { player: firstPlayer(s) }),
    )
  )
    return;
  if (foundationsResolveQuest(s)) return;
  if (Gram.gramResolveQuest(s)) return;
  if (redhornBeforeQuestResolution(s)) return;
  const will = questWill(s),
    threat = stagingThreat(s),
    net = will - threat;
  const stat = questStat(s);
  const statLabel = stat === "will" ? "willpower" : stat;
  s.lastQuest = { will, threat, net, stat };
  if (net > 0) {
    log(
      s,
      `Quest succeeds: ${will} ${statLabel} − ${threat} threat = ${net} progress.`,
      "good",
    );
    enqueue(s, fx("questSucceeded", { value: net, player: firstPlayer(s) }));
  } else if (net < 0) {
    if (returnMirkwoodQuestFailed(s)) return;
    enqueue(s, fx("failedQuest", { value: -net, player: firstPlayer(s) }));
  } else log(s, `${statLabel} matches threat. No progress or threat increase.`);
  enqueue(s, fx("finishQuestPhase"));
}

export function applyAction(input: GameState, action: Action): GameState {
  const s = structuredClone(input);
  syncAttachmentText(s);
  if (action.type === "CONTINUE") {
    requireRule(
      s.flow?.pending && s.flow.pending.id === action.stepId,
      "This event is no longer waiting for confirmation.",
    );
    s.flow.pending = null;
    flush(s);
    syncSeat(s);
    return s;
  }
  if (action.type === "SET_REVIEW_MODE") {
    requireRule(
      REVIEW_MODES.includes(action.mode),
      "Choose a supported event review mode.",
    );
    requireRule(!!s.flow, "This game does not use event reviews.");
    // A pending review stays until it is confirmed; only later events follow the new mode.
    s.flow!.mode = action.mode;
    return s;
  }
  if (action.type === "SELECT_SEAT") {
    requireRule(
      s.table &&
        Number.isInteger(action.seat) &&
        action.seat >= 0 &&
        action.seat < s.table.seats.length,
      "Choose an existing hero seat.",
    );
    requireRule(!s.choice, "Resolve the current choice first.");
    selectSeat(s, action.seat);
    syncSeat(s);
    return s;
  }
  requireRule(!s.flow?.pending, "Review the current event before continuing.");
  const before = observation(s);
  requireRule(s.status === "playing", "This adventure has ended.");
  requireRule(
    !s.table?.seats[activeSeat(s)].eliminated,
    "This hero's seat has been eliminated. Switch to a surviving hero.",
  );
  if (
    s.table &&
    ([
      "KEEP",
      "MULLIGAN",
      "COMMIT",
      "TOGGLE_QUEST",
      "END_ATTACKS",
      "DEFEND",
    ].includes(action.type) ||
      (action.type === "NEXT" &&
        ["resource", "planning", "encounter"].includes(s.phase)))
  )
    requireRule(
      activeSeat(s) === s.table.turn,
      `It is ${seatName(s, s.table.turn)}’s turn.`,
    );
  if (action.type === "CHOOSE") {
    requireRule(s.choice, "There is no pending choice.");
    const option = s.choice.options.find((o) => o.id === action.id);
    requireRule(option, "Invalid choice.");
    log(s, option.label);
    s.choice = null;
    if (option.ability)
      resolvePlayerAbility(s, option.ability, () =>
        prepend(s, ...option.effects),
      );
    else prepend(s, ...option.effects);
    flush(s);
    return s;
  }
  requireRule(!s.choice, "Resolve the current choice first.");
  if (s.escapeTest) {
    requireRule(
      ["PLAY", "ABILITY", "RESOLVE_ESCAPE"].includes(action.type),
      "Resolve the escape test before continuing the adventure.",
    );
    if (action.type === "PLAY")
      requireRule(
        card(s.hand.find((u) => u.id === action.id)?.code ?? "").type_code ===
          "event",
        "Only events and abilities can be used during an escape test.",
      );
  }
  switch (action.type) {
    case "RESOLVE_ESCAPE":
      deadMarshesContinueEscape(s);
      break;
    case "MULLIGAN":
      requireRule(
        s.phase === "setup" && !s.mulled,
        "You may mulligan once before the first round.",
      );
      for (const u of s.hand) putPlayerDeck(s, u);
      s.hand = [];
      shuffle(s, s.deck);
      draw(s, 6);
      s.mulled = true;
      log(s, "You take your one mulligan.");
      break;
    case "KEEP":
      requireRule(s.phase === "setup", "Your opening hand is already kept.");
      if (
        passSeat(s) &&
        !Catch.catchOpeningHandsKept(s) &&
        !DunlandQuest.dunlandOpeningHandsKept(s) &&
        !Trials.trialsOpeningHandsKept(s) &&
        !Tharbad.tharbadOpeningHandsKept(s) &&
        !Nin.ninOpeningHandsKept(s) &&
        !Celebrimbor.celebrimborOpeningHandsKept(s) &&
        !Antlered.antleredOpeningHandsKept(s) &&
        !Chetwood.chetwoodOpeningHandsKept(s) &&
        !Weather.weatherOpeningHandsKept(s) &&
        !Dike.dikeOpeningHandsKept(s) &&
        !Wastes.wastesOpeningHandsKept(s) &&
        !Gram.gramOpeningHandsKept(s) &&
        !Etten.ettenOpeningHandsKept(s) &&
        !Rhudaur.rhudaurOpeningHandsKept(s) &&
        !Carn.carnOpeningHandsKept(s) &&
        !Dread.dreadOpeningHandsKept(s)
      )
        nextRound(s);
      break;
    case "TOGGLE_QUEST": {
      requireRule(
        s.phase === "quest",
        "Choose questers during the quest phase.",
      );
      const u = get(s, action.id);
      requireRule(
        u && (s.committedIds.includes(u.id) || canCommit(s, u)),
        s.scenarioId === "hunt-for-gollum" &&
          s.stage === 3 &&
          !s.heroes.some(hasClue)
          ? "On the Trail: only a player whose hero holds a Clue may commit characters."
          : "Only ready characters may commit.",
      );
      requireRule(
        s.scenarioId !== "hunt-for-gollum" ||
          s.stage !== 3 ||
          s.heroes.some(hasClue),
        "On the Trail: only a player whose hero holds a Clue may commit characters.",
      );
      s.committedIds = s.committedIds.includes(u.id)
        ? s.committedIds.filter((x) => x !== u.id)
        : [...s.committedIds, u.id];
      break;
    }
    case "COMMIT": {
      if (Nin.ninPayCommit(s)) break;
      commitCharacters(s);
      break;
    }
    case "NEXT": {
      if (s.phase === "resource") {
        if (!passSeat(s)) break;
        enqueue(s, fx("phaseEnd"), fx("startPlanning"));
      } else if (s.phase === "planning") {
        if (!passSeat(s)) break;
        enqueue(s, fx("phaseEnd"), fx("startQuest"));
      } else if (s.phase === "staging") {
        resolveQuestResult(s);
      } else if (s.phase === "travel") {
        if (Gram.gramTravelNext(s) || foundationsTravelNext(s)) break;
        requireRule(
          !Fords.fordsMandatoryTravel(s),
          "You must travel to The King’s Road.",
        );
        requireRule(
          allActiveLocations(s).length > 0 ||
            !s.staging.some((u) => u.code === "01088"),
          "You must travel to The East Bight.",
        );
        enqueue(s, fx("phaseEnd"), fx("startEncounter"));
      } else if (s.phase === "encounter") {
        if (!passSeat(s)) break;
        enqueue(s, fx("engagementAllAreas"));
        enqueue(s, fx("phaseEnd"), fx("startCombat"));
      } else if (s.phase === "refresh") {
        enqueue(s, fx("phaseEnd"), fx("endRound"));
      } else throw new RuleError("Finish the current phase action first.");
      break;
    }
    case "PLAY_DISCARD": {
      requireRule(
        Number.isSafeInteger(action.index) &&
          action.index >= 0 &&
          action.index < s.discard.length,
        "Choose an actual event in your discard pile.",
      );
      requireRule(
        angmarDiscardEvents.includes(s.discard[action.index]),
        "This event needs a card effect to play it from discard.",
      );
      playEventFromDiscardEffect(s, action.index, {
        target: action.target,
        payment: action.payment,
        amount: action.amount,
      });
      break;
    }
    case "PLAY": {
      const u = s.hand.find((u) => u.id === action.id);
      requireRule(u, "Card is not in your hand.");
      const reason = canPlay(s, u);
      requireRule(!reason, reason ?? "");
      const c = card(u.code);
      if (needsTarget(u))
        requireRule(
          playTargets(s, u).some((x) => x.id === action.target),
          "Choose a legal target.",
        );
      if (u.code === "01034")
        requireRule(
          ["defense", "attack"].includes(s.phase),
          "Feint is a Combat Action.",
        );
      if (["01065", "01066"].includes(u.code))
        requireRule(
          ["quest", "staging"].includes(s.phase),
          "This is a Quest Action.",
        );
      if (u.code === "01023")
        requireRule(
          s.hand.some((a) => allyCanEnter(s, a.code)),
          "You need an eligible ally in hand.",
        );
      if (["01036", "08143", "10085"].includes(u.code))
        requireRule(
          action.payment &&
            Object.values(action.payment).filter((v) => v > 0).length === 3,
          "This card must use 3 different heroes’ resource pools.",
        );
      let effectiveCost =
        c.code === "08010" ? playerOrder(s).length : Number(c.cost) || 0;
      if (u.code === "01051") {
        const target = discardTarget(s, action.target!);
        effectiveCost =
          Number(card(seatView(s, target.player).discard[target.index]).cost) ||
          0;
      }
      if (["01067", "06083"].includes(u.code)) {
        effectiveCost = action.amount ?? 0;
        requireRule(
          Number.isInteger(effectiveCost) &&
            effectiveCost > 0 &&
            effectiveCost <= eventXMaximum(s, u.code),
          "Choose a positive X within the available cards.",
        );
      }
      pay(
        s,
        { ...c, cost: effectiveCost, playOwner: u.owner ?? activeSeat(s) },
        action.payment,
        get(s, action.target),
      );
      s.hand = s.hand.filter((x) => x.id !== u.id);
      resolvePaidPlayerCard(
        s,
        u,
        action.target,
        effectiveCost,
        true,
        true,
        false,
        action.amount ?? effectiveCost,
      );
      break;
    }
    case "ABILITY": {
      const origin =
        s.hand.find((u) => u.id === action.id) ?? get(s, action.id);
      const abilityCard = action.attachmentId
        ? origin?.attachments.find((a) => a.id === action.attachmentId)
        : origin;
      requireRule(abilityCard, "Choose an actual card ability.");
      resolvePlayerAbility(
        s,
        {
          player: activeSeat(s),
          source: abilityCard.id,
          code: abilityCard.code,
          type: "action",
        },
        () => {
          const shadowTarget = get(s, action.id);
          if (shadowTarget && shadowFlameAbility(s, shadowTarget)) return;
          requireRule(
            s.phase !== "setup" || !!s.escapeTest,
            "Wait for an action window.",
          );
          const handUnit = s.hand.find((u) => u.id === action.id);
          if (handUnit) {
            requireRule(
              !action.attachmentId &&
                (Angmar.useAngmarAbility(s, handUnit) ||
                  useBloodPlayerHandAbility(s, handUnit) ||
                  useRedhornPlayerHandAbility(s, handUnit)),
              "This card has no action from hand.",
            );
            return;
          }
          const u = get(s, action.id);
          if (
            u &&
            !action.attachmentId &&
            (Fords.fordsAbility(s, u) ||
              BloodQuest.bloodGondorAbility(s, u) ||
              Osgiliath.useAssaultOsgiliathAbility(s, u) ||
              useFoundationsAbility(s, u) ||
              useHeirsAbility(s, u) ||
              Rhudaur.rhudaurAbility(s, u))
          )
            return;
          if (u && watcherWaterAbilityLabel(u, action.attachmentId)) {
            watcherWaterAbility(s, u, action.attachmentId);
            return;
          }
          if (u && !action.attachmentId)
            requireRule(
              !isSacked(u) && !u.blanked,
              "A Sacked hero cannot trigger its own ability.",
            );
          if (u && action.attachmentId)
            requireRule(
              !u.attachments.find((a) => a.id === action.attachmentId)?.blanked,
              "Amon Lhaw blanks this attachment's printed ability.",
            );
          requireRule(
            u &&
              (action.attachmentId
                ? u.attachments.some(
                    (a) =>
                      a.id === action.attachmentId &&
                      !a.blanked &&
                      attachmentController(s, u, a) === activeSeat(s),
                  )
                : characters(s).some((x) => x.id === u.id) ||
                  u.code === "01007" ||
                  u.code === "03002" ||
                  u.code === CARROCK.grimbeorn ||
                  u.code === KHAZAD.shaft ||
                  collectorAbilityAnyPlayer(u.code)),
            "Choose a character or attachment you control.",
          );
          if (!action.attachmentId && u.code === "01011")
            requireRule(
              heirsCanSpendResources(s, u),
              "Orc Vanguard prevents Glorfindel from spending the resource cost.",
            );
          if (Angmar.useAngmarAbility(s, u, action.attachmentId)) {
          } else if (useStewardFearAbility(s, u, action.attachmentId)) {
          } else if (u.code === CARROCK.grimbeorn && !action.attachmentId)
            enqueue(s, fx("carrockContribute", { target: u.id }));
          else if (useAmonPlayerAbility(s, u, action.attachmentId)) {
          } else if (useHeirsPlayerAbility(s, u, action.attachmentId)) {
          } else if (!action.attachmentId && useCollectorAbility(s, u)) {
          } else if (useRohanAbility(s, u, action.attachmentId)) {
          } else if (
            !action.attachmentId &&
            (useWatcherPlayerAbility(s, u) || useRoadPlayerAbility(s, u))
          ) {
          } else if (
            !khazadAbility(s, u, action.attachmentId) &&
            !useRedhornPlayerAbility(s, u, action.attachmentId) &&
            !useElfAbility(s, u, action.attachmentId) &&
            !useMirkwoodPlayerAbility(s, u, action.attachmentId) &&
            !useUtilityAttachment(s, u, action.attachmentId) &&
            !useDwarfAbility(s, u, action.attachmentId)
          )
            useAbility(s, u, action.attachmentId);
          if (
            !action.attachmentId &&
            isHero(u) &&
            !["01007", "01011", "03002", "02095", "08056", "06107"].includes(
              u.code,
            )
          )
            stewardFearHeroAbilityTriggered(s, u);
          return;
        },
      );
      break;
    }
    case "CLAIM": {
      requireRule(s.phase !== "setup", "Wait for an action window.");
      const attachedBook = allHeroes(s)
        .flatMap((h) => h.attachments)
        .find((a) => a.id === action.id && a.code === KHAZAD.book);
      const objective =
        s.staging.find((u) => u.id === action.id) ??
        (attachedBook
          ? ({ id: attachedBook.id, code: attachedBook.code } as Unit)
          : undefined);
      const hero = s.heroes.find((h) => h.id === action.heroId);
      requireRule(
        objective && objectiveFree(s, objective) && hero,
        "Choose an unguarded objective and a free hero.",
      );
      if (Fangorn.fangornClaim(s, objective, hero)) break;
      if (stewardFearClaim(s, objective, hero)) break;
      if (heirsClaim(s, objective, hero)) break;
      if (khazadClaim(s, objective, hero)) break;
      if (foundationsClaim(s, objective, hero)) break;
      if (rhosgobelClaim(s, objective, hero)) break;
      raiseThreat(s, 2, "cost");
      s.staging = s.staging.filter((u) => u.id !== objective.id);
      hero.attachments.push({
        id: objective.id,
        code: objective.code,
        exhausted: false,
      });
      log(
        s,
        `${name(hero)} claims ${name(objective)}. Threat rises by 2.`,
        "good",
      );
      if (s.captiveMendor) {
        const m = s.captiveMendor;
        s.captiveMendor = null;
        m.damage = 1;
        s.allies.push(m);
        log(s, "Mendor is rescued with 1 damage.", "good");
      }
      break;
    }
    case "TRAVEL": {
      requireRule(
        s.phase === "travel",
        "You may travel only during the travel phase.",
      );
      const u = s.staging.find(
        (x) => x.id === action.id && card(x.code).type_code === "location",
      );
      requireRule(u, "Choose a location in staging.");
      requireRule(!canTravel(s, u), canTravel(s, u) ?? "");
      const scenarioCost =
        Wastes.wastesTravel(s, u) ??
        Gram.gramTravel(s, u) ??
        Etten.ettenTravelEffects(s, u) ??
        Rhudaur.rhudaurTravelEffects(s, u) ??
        Carn.carnTravel(s, u) ??
        Dread.dreadTravel(s, u) ??
        Dike.dikeTravel(s, u) ??
        Weather.weatherTravel(s, u) ??
        Chetwood.chetwoodTravel(s, u) ??
        Celebrimbor.celebrimborTravel(s, u) ??
        Nin.ninTravel(s, u) ??
        Tharbad.tharbadTravel(s, u) ??
        Trials.trialsTravel(s, u) ??
        DunlandQuest.dunlandTravel(s, u) ??
        Fangorn.fangornTravel(s, u) ??
        Catch.catchTravel(s, u) ??
        BloodQuest.bloodGondorTravel(s, u) ??
        Amon.amonDinTravelEffects(s, u) ??
        Osgiliath.assaultOsgiliathTravelEffects(s, u) ??
        (Druadan.druadanForestTravelEffects(s, u).length
          ? Druadan.druadanForestTravelEffects(s, u)
          : undefined);
      if (scenarioCost) {
        prepend(
          s,
          ...scenarioCost,
          fx("travelEnter", {
            target: u.id,
            player: firstPlayer(s),
            text: Osgiliath.assaultOsgiliathSecondLocation(s, u)
              ? "osgiliath-second"
              : undefined,
          }),
        );
        break;
      }
      const stewardCost = stewardFearTravelEffects(s, u);
      if (stewardCost) {
        prepend(
          s,
          ...stewardCost,
          fx("travelEnter", { target: u.id, player: firstPlayer(s) }),
        );
        break;
      }
      const waterCost = watcherWaterTravelCost(s, u);
      if (waterCost) {
        prepend(
          s,
          ...waterCost,
          fx("travelEnter", { target: u.id, player: firstPlayer(s) }),
        );
        break;
      }
      if (redhornTravelCost(s, u)) break;
      if (khazadTravelCost(s, u)) break;
      if (emynMuilTravelCost(s, u)) break;
      if (returnMirkwoodTravelCost(s, u)) break;
      requireRule(
        u.code !== CARROCK.carrock,
        "The Carrock is immune to player effects and cannot be travelled to.",
      );
      requireRule(
        u.code === "01088" || !s.staging.some((x) => x.code === "01088"),
        "You must travel to The East Bight.",
      );
      if (u.code === "01077")
        requireRule(
          livingSeats(s).every((i) =>
            seatView(s, i).heroes.some((h) => !h.exhausted),
          ),
          "Great Forest Web requires a ready hero.",
        );
      if (u.code === "01094")
        requireRule(
          seatView(s, firstPlayer(s)).hand.length >= 2,
          "Necromancer’s Pass requires 2 cards to discard.",
        );
      if (u.code === "01078")
        requireRule(
          s.encounterDeck.length > 0,
          "There is no encounter card to reveal for this travel cost.",
        );
      if (u.code === "01077")
        enqueue(
          s,
          ...playerOrder(s).map((player) => fx("travelExhaust", { player })),
        );
      if (u.code === "01094")
        enqueue(s, fx("payPass", { player: firstPlayer(s) }));
      if (u.code === "01078")
        enqueue(s, fx("reveal", { player: firstPlayer(s) }));
      enqueue(s, fx("travelEnter", { target: u.id, player: firstPlayer(s) }));
      break;
    }
    case "ENGAGE": {
      const u = s.staging.find(
        (x) => x.id === action.id && card(x.code).type_code === "enemy",
      );
      requireRule(u, "Choose an enemy in staging.");
      requireRule(
        !optionalEngagementProblem(s, u),
        optionalEngagementProblem(s, u) ?? "",
      );
      if (s.optionalEngagement) s.used.push("phase:halbarad-extra-engagement");
      s.optionalEngagement = true;
      engage(s, u, true);
      break;
    }
    case "DEFEND": {
      requireRule(
        s.phase === "defense" && !s.combat,
        "Resolve attacks one at a time.",
      );
      const enemy = engagedEnemies(s).find(
        (u) =>
          u.id === action.enemyId &&
          normalAttackPending(s, u) &&
          !enemyAttackPrevented(s, u),
      );
      requireRule(enemy, "This enemy cannot attack again.");
      const defenderIds =
        action.defenderIds ?? (action.defenderId ? [action.defenderId] : []);
      requireRule(
        defenderIds.every((id) => {
          const defender = get(s, id);
          return defender && redhornCanDefend(enemy, defender);
        }),
        "Snow Warg can only be defended by a hero.",
      );
      for (const p of playerOrder(s))
        forOwner(s, p, () => s.used.push(Realm.REALM_ATTACKS_STARTED));
      beginEnemyAttack(s, enemy, defenderIds);
      break;
    }
    case "ATTACK": {
      requireRule(
        !s.table || activeSeat(s) === s.table.turn,
        "Wait for this fellowship’s attack turn.",
      );
      requireRule(s.phase === "attack", "Enemies must finish attacking first.");
      const enemy = [
        ...allEngaged(s),
        ...s.staging.filter((u) => card(u.code).type_code === "enemy"),
      ].find(
        (u) =>
          u.id === action.enemyId &&
          (s.table ||
          s.earlyAttackPlayers ||
          playerOrder(s).some((p) => consideredEngaged(s, u, p))
            ? !u.attackedBy?.includes(activeSeat(s))
            : !u.attacked),
      );
      requireRule(enemy, "You may attack each enemy once per round.");
      playerAttack(s, enemy, action.attackerIds, true);
      break;
    }
    case "END_ATTACKS":
      requireRule(s.phase === "attack", "Finish enemy attacks first.");
      if (s.earlyAttackPlayers) {
        s.earlyAttackPlayers = s.earlyAttackPlayers.filter(
          (i) => i !== activeSeat(s) && livingSeats(s).includes(i),
        );
        if (s.earlyAttackPlayers.length) {
          if (s.table) s.table.turn = s.earlyAttackPlayers[0];
          selectSeat(s, s.earlyAttackPlayers[0]);
        } else {
          delete s.earlyAttackPlayers;
          startPhase(s, "defense");
          advanceDefense(s);
        }
        break;
      }
      if (s.table) {
        if (!s.table.passed.includes(activeSeat(s)))
          s.table.passed.push(activeSeat(s));
        const next = globalPlayerOrder(s).find(
          (i) =>
            !rohanOathPlayers(s).includes(i) && !s.table!.passed.includes(i),
        );
        if (next !== undefined) {
          s.table.turn = next;
          selectSeat(s, next);
          break;
        }
      }
      enqueue(s, fx("phaseEnd"), fx("endCombat"));
      break;
    default:
      throw new RuleError("Unknown action.");
  }
  if (before) {
    if (!s.queue.length) check(s);
    recordObservation(s, before, observation(s)!, action);
  }
  flush(s);
  if (!s.flow?.pending) {
    check(s);
    if (!s.flow?.pending && !s.choice) flush(s);
  }
  syncSeat(s);
  return s;
}

export function score(s: GameState) {
  return (
    (s.round - 1) * 10 +
    seatIndices(s).reduce((n, i) => {
      const p = seatView(s, i);
      return (
        n +
        p.threat +
        p.fallenThreat +
        p.heroes.reduce((n, h) => n + h.damage, 0)
      );
    }, 0) -
    s.victory
  );
}

export function publicState(s: GameState) {
  return {
    ...(s.wastesEriador
      ? {
          wastesEriador: {
            initialized: s.wastesEriador.initialized,
            timeOfDay: Wastes.wastesIsNight(s) ? "night" : "day",
            progressThisRound: Object.values(
              s.wastesEriador.progressPlaced,
            ).reduce((a, b) => a + b, 0),
          },
        }
      : {}),
    ...(s.mountGram
      ? {
          mountGram: {
            initialized: s.mountGram.initialized,
            split: s.mountGram.split,
            activeArea: s.mountGram.activeArea,
            areas: s.mountGram.areas.map((a) => ({
              id: a.id,
              players: a.players,
              quest: a.quest.code,
              progress: a.progress,
            })),
            capturedDecks: Object.entries(s.mountGram.capturedDecks).map(
              ([player, cards]) => ({
                player: Number(player),
                count: cards.length,
              }),
            ),
            captured: Object.entries(s.mountGram.captured).map(
              ([host, cards]) => ({ host, count: cards.length }),
            ),
            orcDeck: s.mountGram.orcDeck.length,
          },
        }
      : {}),
    ...(s.ettenmoors
      ? {
          ettenmoors: {
            safe: Etten.ettenSafeActive(s),
            engagementChecks: !Etten.ettenNoEngagementChecks(s),
          },
        }
      : {}),
    ...(s.rhudaur
      ? {
          rhudaur: {
            initialized: s.rhudaur.initialized,
            time: s.rhudaur.time,
            setAside: s.rhudaur.setAside.map((u) => ({
              id: u.id,
              code: u.code,
            })),
          },
        }
      : {}),
    ...(s.carnDum
      ? {
          carnDum: {
            initialized: s.carnDum.initialized,
            defensePenalty:
              s.carnDum.furiousRound === s.round ? s.carnDum.furiousPenalty : 0,
            terrorThreat:
              s.carnDum.terrorRound === s.round ? s.carnDum.terrorThreat : 0,
          },
        }
      : {}),
    ...(s.dreadRealm
      ? {
          dreadRealm: {
            initialized: s.dreadRealm.initialized,
            daechanarDefeated: s.dreadRealm.daechanarDefeated,
            reanimated: globalUnits(s)
              .filter((u) => u.code === "dread:reanimated-dead")
              .map((u) => ({ id: u.id, owner: u.owner })),
            terrorThreat:
              s.dreadRealm.terrorRound === s.round
                ? s.dreadRealm.terrorThreat
                : 0,
          },
        }
      : {}),
    ...(s.weatherHills
      ? {
          weatherHills: {
            orcDeck: s.weatherHills.orcDeck.length,
            missionTokens:
              s.staging.find((u) => u.code === WEATHER.mission)?.resources ?? 0,
            missionFlipped: !!s.staging.find((u) => u.code === WEATHER.mission)
              ?.flipped,
          },
        }
      : {}),
    ...(s.chetwood
      ? {
          chetwood: {
            iarionCaptured: !!s.chetwood.captive,
            capturedHands: Object.entries(s.chetwood.hiddenHands).map(
              ([questId, cards]) => ({ questId, count: cards.length }),
            ),
            sideQuestTime: s.staging
              .filter((u) => u.timeCounters !== undefined)
              .map((u) => ({ id: u.id, time: u.timeCounters })),
          },
        }
      : {}),
    ...(s.antlered
      ? {
          questTime: s.antlered.time,
          ravenDeck: s.antlered.ravenDeck.length,
          ravenDiscard: s.antlered.ravenDiscard.length,
        }
      : {}),
    ...(s.celebrimbor
      ? {
          questTime: s.celebrimbor.time,
          orcsSearch: s.celebrimbor.search.length,
        }
      : {}),
    ...(s.ninEilph
      ? { currentQuest: s.ninEilph.activeQuest, questTime: s.ninEilph.time }
      : {}),
    ...(s.tharbad
      ? { threatElimination: s.tharbad.elimination, questTime: s.tharbad.time }
      : {}),
    ...(s.threeTrials
      ? {
          currentTrial: s.threeTrials.activeQuest,
          completedTrials: s.threeTrials.completed,
          keysHeld: Trials.trialsKeys(s).map((x) => ({
            code: x.key.code,
            hero: x.hero.id,
            player: ownerOf(s, x.hero),
          })),
          enemyTime: [...s.staging, ...allEngaged(s)]
            .filter((u) => u.timeCounters !== undefined)
            .map((u) => ({ id: u.id, code: u.code, time: u.timeCounters })),
        }
      : {}),
    ...(s.bloodGondor
      ? {
          hiddenCards: playerOrder(s).map((player) => ({
            player,
            count: s.bloodGondor!.hidden[player]?.length ?? 0,
          })),
          captives: s.bloodGondor.captured.map((u) => ({
            id: u.id,
            code: u.code,
            name: card(u.code).name,
          })),
        }
      : {}),
    ...(s.morgulVale
      ? {
          towerProgress: MorgulQuest.morgulTowerProgress(s),
          defeatedCaptains: s.morgulVale.defeated,
        }
      : {}),
    ...(s.amonDin
      ? {
          villagers: {
            remaining: s.amonDin.questVillagers,
            rescued:
              s.staging.find((u) => card(u.code).name === "Rescued Villagers")
                ?.resources ?? 0,
            dead:
              s.staging.find((u) => card(u.code).name === "Dead Villagers")
                ?.damage ?? 0,
          },
        }
      : {}),
    ...(s.assaultOsgiliath
      ? {
          controlledLocations: s.assaultOsgiliath.controlled.map((u) => ({
            id: u.id,
            code: u.code,
            name: name(u),
            owner: u.owner ?? 0,
            progress: u.progress,
            attachments: u.attachments,
          })),
        }
      : {}),
    escapeTest: s.escapeTest
      ? {
          phase: s.escapeTest.phase,
          source: s.escapeTest.source,
          participants: s.escapeTest.participants,
          cursor: s.escapeTest.cursor,
          committedIds: s.escapeTest.committedIds,
          count: s.escapeTest.count,
          attack: s.escapeTest.attack,
          capture: s.escapeTest.capture,
          strength: deadMarshesEscapeStrength(s),
        }
      : null,
    awaitingConfirmation: !!s.flow?.pending,
    easyMode: !!s.easyMode,
    reviewMode: s.flow ? (s.flow.mode ?? "all") : null,
    resolution: s.flow?.pending ?? null,
    recentEvents: s.flow?.history.slice(-8) ?? [],
    mode: s.status,
    table: s.table
      ? {
          active: s.table.active,
          first: s.table.first,
          turn: s.table.turn,
          seats: seatIndices(s).map((i) => {
            const p = seatView(s, i);
            return {
              name: seatName(s, i),
              hero: p.startingHeroes[0],
              startingHeroes: p.startingHeroes,
              deckId: p.deckId,
              eliminated: s.table!.seats[i].eliminated,
              threat: p.threat,
              threatAttachments: p.threatAttachments ?? [],
              hand: p.hand.map((u) => ({ id: u.id, code: u.code })),
              deckCount: p.deck.length,
              heroes: p.heroes,
              allies: p.allies,
              engaged: p.engaged.map(
                ({ shadows, facedownCard: _facedown, ...u }) => ({
                  ...u,
                  shadowCount: shadows.length,
                  faceupShadowCards: Isengard.faceupShadowCards({
                    ...u,
                    shadows,
                  }),
                }),
              ),
              passed: s.table!.passed.includes(i),
            };
          }),
        }
      : null,
    playMode: s.playMode,
    scenario: s.scenarioId,
    deadmensDike: s.deadmensDike
      ? {
          initialized: s.deadmensDike.initialized,
          setAside: s.deadmensDike.setAside.map((u) => ({
            id: u.id,
            code: u.code,
          })),
          terrorThreat: Dike.dikeStagingThreat(s),
          decks: seatIndices(s).map((player) => ({
            player,
            remaining: seatView(s, player).deck.length,
          })),
        }
      : null,
    campaign: s.campaign,
    prisoner: s.prisoner ? name(s.prisoner) : null,
    captiveMendor: !!s.captiveMendor,
    objectives: s.staging
      .filter((u) => card(u.code).type_code === "objective")
      .map((u) => ({ id: u.id, name: name(u), free: objectiveFree(s, u) })),
    deck: s.deckId,
    peek: s.peek ? card(s.peek).name : null,
    round: s.round,
    phase: s.phase,
    threat: s.threat,
    threatAttachments: s.threatAttachments ?? [],
    quest: {
      ...stageInfo(s),
      stage: s.stage,
      progress: currentQuestProgress(s),
      ...(s.stewardFear ? { resources: s.stewardFear.questResources } : {}),
      ...(s.amonDin ? { villagers: s.amonDin.questVillagers } : {}),
      stat: questStat(s),
    },
    heroes: s.heroes.map((u) => ({ ...u, name: name(u), stats: stats(s, u) })),
    allies: s.allies.map((u) => ({ ...u, name: name(u), stats: stats(s, u) })),
    hand: s.hand.map((u) => ({
      id: u.id,
      code: u.code,
      name: name(u),
      playable: canPlay(s, u) === null,
    })),
    deckCount: s.deck.length,
    encounterCount: s.encounterDeck.length,
    pendingWolfReturns: s.pendingWolfReturns?.length ?? 0,
    ...(s.stewardFear
      ? {
          underworldCount: s.stewardFear.underworldDeck.length,
          pendingUnderworldCount: s.stewardFear.pendingUnderworld.length,
        }
      : {}),
    ...(questTime(s) ? { timeCounters: questTime(s)!.time } : {}),
    ...(s.fangorn ? { mugashCaptured: !!Fangorn.fangornCarrier(s) } : {}),
    ...(s.catchOrc
      ? {
          outOfPlayDecks: playerOrder(s).map((player) => ({
            player,
            count: s.catchOrc!.decks[player]?.length ?? 0,
          })),
          mugashCaptured: !!Catch.mugashCarrier(s),
        }
      : {}),
    outOfPlay:
      s.isengard?.outOfPlay.flatMap((g) =>
        g.cards.map((u) => ({
          id: u.id,
          code: u.code,
          name: name(u),
          source: g.source,
        })),
      ) ?? [],
    staging: s.staging.map((u) => ({
      id: u.id,
      code: u.code,
      resources: u.resources,
      name: name(u),
      ...stats(s, u),
      threat: threatOf(s, u),
      progress: u.progress,
      faceupShadowCards: Isengard.faceupShadowCards(u),
      damage: u.damage,
      ...(s.stewardFear
        ? { underworldCount: s.stewardFear.underneath[u.id]?.length ?? 0 }
        : {}),
    })),
    consideredEngagements: s.staging
      .filter((u) => playerOrder(s).some((p) => consideredEngaged(s, u, p)))
      .map((u) => ({
        id: u.id,
        name: name(u),
        players: playerOrder(s).filter((p) => consideredEngaged(s, u, p)),
      })),
    engaged: engagedEnemies(s).map((u) => ({
      id: u.id,
      name: name(u),
      ...stats(s, u),
      damage: u.damage,
      attacked: u.attacked,
      faceupShadowCards: Isengard.faceupShadowCards(u),
    })),
    activeLocations: allActiveLocations(s).map((l) => ({
      id: l.id,
      code: l.code,
      name: name(l),
      progress: l.progress,
      quest: locationQuest(s, l),
      resources: l.resources,
      ...(s.stewardFear
        ? { underworldCount: s.stewardFear.underneath[l.id]?.length ?? 0 }
        : {}),
    })),
    activeLocation: s.activeLocation
      ? {
          name: name(s.activeLocation),
          progress: s.activeLocation.progress,
          quest: locationQuest(s, s.activeLocation),
        }
      : null,
    willpower: questWill(s),
    stagingThreat: stagingThreat(s),
    choice: s.choice
      ? {
          title: s.choice.title,
          options: s.choice.options.map((o) => ({ id: o.id, label: o.label })),
        }
      : null,
    lastQuest: s.lastQuest,
    lastLog: s.log.slice(-5),
    coordinateSystem:
      "DOM card table; origin top-left, x right, y down. No spatial movement.",
  };
}
