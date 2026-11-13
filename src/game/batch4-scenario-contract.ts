import type { Attachment, Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";

type Combat = NonNullable<GameState["combat"]>;
export interface Batch4ScenarioHooks {
  setup?(s: GameState): void;
  cardsDrawn?(s: GameState, player: number, count: number): void;
  threatRaised?(s: GameState, player: number, amount: number): void;
  threatEliminationReduction?(s: GameState, player: number): number;
  cannotHeal?(s: GameState, unit: Unit): boolean;
  canSelectSideQuest?(s: GameState, unit: Unit): boolean;
  /** The main quest cannot be chosen as the current quest while a side quest can. */
  mainQuestUnavailable?(s: GameState): boolean;
  /** Player card effects cannot draw cards or gain resources. */
  playerCardEconomyBlocked?(s: GameState): boolean;
  refreshCharacters?(s: GameState, player: number): Effect[] | undefined;
  whenRevealedCancelled?(s: GameState, code: string): void;
  combatBegin?(s: GameState): void;
  enemyEntered?(s: GameState, unit: Unit): void;
  openingHandsKept?(s: GameState): boolean;
  check?(s: GameState): void;
  playerEliminating?(s: GameState, player: number): void;
  playerEliminationReason?(s: GameState, player: number): string | undefined;
  playerEliminated?(s: GameState, player: number): void;
  advance?(s: GameState): boolean;
  stageInfo?(s: GameState):
    | {
        name: string;
        cardCode: string;
        quest: number;
        story: string;
        questImage?: string;
        side?: "A" | "B";
      }
    | undefined;
  stats?(
    s: GameState,
    u: Unit,
  ): Partial<{ will: number; attack: number; defense: number; health: number }>;
  willpowerOverride?(s: GameState, u: Unit): number | undefined;
  threatBonus?(s: GameState, u: Unit): number;
  stagingThreat?(s: GameState): number;
  engagementBonus?(s: GameState, u: Unit): number;
  locationQuestBonus?(s: GameState, u: Unit): number;
  locationProgressAmount?(s: GameState, u: Unit, amount: number): number;
  progress?(s: GameState, amount: number, quest: Unit): number;
  questProgressPlaced?(s: GameState, quest: Unit, amount: number): void;
  locationProgressBlocked?(s: GameState, u: Unit): boolean;
  /** The most progress this location can receive now (a per-round cap). */
  locationProgressCapacity?(s: GameState, u: Unit): number | undefined;
  /**
   * Active locations that receive progress one after another, in this order,
   * instead of the players dividing it; leaving one out places none on it.
   */
  progressLocations?(s: GameState, locations: Unit[]): Unit[] | undefined;
  sideDefeatBlocked?(s: GameState, u: Unit): boolean;
  sideDefeated?(s: GameState, u: Unit): void;
  sideQuestChosen?(s: GameState, u: Unit): void;
  cannotReady?(s: GameState, u: Unit): boolean;
  cannotPlayerReady?(s: GameState): boolean;
  cannotPlayerReadyCharacter?(s: GameState, u: Unit): boolean;
  characterBlanked?(s: GameState, u: Unit): boolean;
  immune?(s: GameState, u: Unit): boolean;
  cannotLeave?(s: GameState, u: Unit, destruction?: boolean): boolean;
  indestructible?(s: GameState, u: Unit): boolean;
  cannotEngage?(s: GameState, u: Unit): boolean;
  cannotOptionallyEngage?(s: GameState, u: Unit): boolean;
  cannotDefend?(s: GameState, enemy: Unit, defender?: Unit): boolean;
  cannotAttack?(s: GameState, character: Unit, enemy: Unit): boolean;
  /** This enemy cannot attack the given player right now. */
  enemyCannotAttack?(s: GameState, enemy: Unit, player: number): boolean;
  consideredEngaged?(s: GameState, u: Unit, player: number): boolean;
  extraOptionalEngagements?(s: GameState, player: number): number;
  cannotCancel?(s: GameState, shadow?: boolean, code?: string): boolean;
  cannotReduceThreat?(s: GameState): boolean;
  threatReduction?(s: GameState, amount: number, reason?: string): number;
  allyCost?(s: GameState): number;
  planningEnd?(s: GameState): void;
  skipQuestPhase?(s: GameState): boolean;
  questBegin?(s: GameState): Effect[] | void;
  encounterBegin?(s: GameState): void;
  encounterEnd?(s: GameState): Effect[];
  combatEnd?(s: GameState): void;
  refreshThreatBonus?(s: GameState): number;
  roundEnd?(s: GameState): Effect[];
  endQuest?(s: GameState): void;
  committed?(s: GameState): void;
  missingHeroAllowed?(s: GameState, player: number): boolean;
  /** After an enemy engages the active player; optional for an optional engagement. */
  engaged?(s: GameState, u: Unit, optional?: boolean): void;
  hostLeaves?(s: GameState, u: Unit, defeated?: boolean): void;
  /** Printed replacement effects run before defeat and leave-play reactions. */
  beforeDestroy?(
    s: GameState,
    u: Unit,
    destruction: boolean,
    context: DamageContext,
  ): boolean;
  /** Capture an explored location without discarding it or its attachments. */
  locationDestination?(s: GameState, u: Unit): boolean;
  /** Schedule simultaneous When-explored effects ahead of queued After responses. */
  explorationWhen?(
    s: GameState,
    u: Unit,
    wasActive: boolean,
    playerEffects: Effect[],
  ): boolean;
  attachmentLeaves?(
    s: GameState,
    host: Unit,
    attachment: Attachment,
    leaving?: boolean,
  ): boolean;
  characterDestroyed?(s: GameState, u: Unit, context: DamageContext): void;
  characterLeft?(
    s: GameState,
    u: Unit,
    controller: number,
    destination?: string,
  ): void;
  replaceDamage?(
    s: GameState,
    u: Unit,
    amount: number,
    context: DamageContext,
  ): boolean;
  damageAmount?(
    s: GameState,
    u: Unit,
    amount: number,
    context: DamageContext,
  ): number;
  damageDealt?(
    s: GameState,
    u: Unit,
    amount: number,
    context: DamageContext,
  ): void;
  explored?(s: GameState, u: Unit, wasActive: boolean): void;
  travelEffects?(s: GameState, u: Unit): Effect[] | undefined;
  travelEntered?(s: GameState, u: Unit, actualTravel: boolean): void;
  travelProblem?(s: GameState, u: Unit): string | null;
  allyEntered?(
    s: GameState,
    u: Unit,
    played: boolean,
    fromHand: boolean,
  ): boolean;
  eventPlayed?(s: GameState, u: Unit): void;
  eventCancelled?(s: GameState, id: string): boolean;
  playerCardPlayed?(s: GameState, u: Unit, fromHand?: boolean): void;
  /** Allies cannot be put into play from a player's hand right now. */
  handEntryBlocked?(s: GameState): boolean;
  /** A commit cost: return true after offering the payment that then commits. */
  payCommit?(s: GameState): boolean;
  /** The beginning of the travel phase, before any travel decision. */
  travelBegin?(s: GameState): void;
  /** Additional doomed gained by a card as it is revealed. */
  revealedDoomed?(
    s: GameState,
    code: string,
    revealOrigin: Effect["revealOrigin"],
  ): number;
  playProblem?(s: GameState, code: string): string | null;
  /** A declared player attack that the scenario forbids, with the reason. */
  attackProblem?(s: GameState, enemy: Unit, ids: string[]): string | null;
  /** Replaces the printed Doomed keyword read from a card's text. */
  printedDoomed?(s: GameState, code: string): number | undefined;
  /** This character may trigger an ability even while Sacked. */
  abilitySackExempt?(s: GameState, u: Unit): boolean;
  /** This character cannot commit to the quest. */
  cannotCommit?(s: GameState, u: Unit): boolean;
  /** Additional encounter cards revealed during the staging step. */
  extraStagingReveals?(s: GameState): number;
  /** Separate staging areas: the scenario runs one staging step per area. */
  beginStaging?(s: GameState): boolean;
  /** Separate staging areas: the scenario resolves the active area's quest. */
  resolveQuest?(s: GameState): boolean;
  /** Separate staging areas: a travel decision passes to the next area. */
  travelNext?(s: GameState): boolean;
  /** The first player token does not pass in the refresh phase. */
  keepFirstPlayer?(s: GameState): boolean;
  /** A hero actually spent resources from its pool. */
  resourcesSpent?(s: GameState, hero: Unit, amount: number): void;
  /** Effects at the beginning of the round, before resources are collected. */
  resourceStart?(s: GameState): Effect[];
  /** The stat characters count while questing (Battle or Siege). */
  questStat?(s: GameState): "attack" | "defense" | undefined;
  /** The stat characters count when attacking this enemy (Spectral). */
  attackStat?(s: GameState, enemy: Unit): "will" | undefined;
  /** At the beginning of the planning phase. */
  planningBegin?(s: GameState): void;
  /** Heroes that do not collect a resource in the resource phase. */
  cannotCollectResources?(s: GameState, hero: Unit): boolean;
  /** Characters that lose their sphere resource icons. */
  resourceIconsLost?(s: GameState, u: Unit): boolean;
  /**
   * The defending player must declare one of these characters as the
   * defender, even if it is exhausted.
   */
  forcedDefenders?(s: GameState, enemy: Unit): Unit[] | undefined;
  playerAttackDeclared?(s: GameState, enemy: Unit, ids: string[]): boolean;
  /** Responses after attackers are declared, resolved before the attack's damage. */
  attackersDeclared?(s: GameState, enemy: Unit, ids: string[]): Effect[];
  /** Responses after defenders are declared, resolved before shadows and damage. */
  defendersDeclared?(s: GameState, enemy: Unit, defenders: Unit[]): Effect[];
  playerAttackResolved?(
    s: GameState,
    enemy: Unit,
    ids: string[],
    amount: number,
    remainingHealth: number,
  ): void;
  enemyAttackStarted?(s: GameState, enemy: Unit, player: number): void;
  attackFinished?(s: GameState, combat: Combat, skipped?: boolean): Effect[];
  cannotDiscardShadow?(s: GameState, u: Unit, code: string): boolean;
  usesExistingShadows?(s: GameState, u: Unit): boolean;
  immediateShadows?(s: GameState, u: Unit, noDeal: boolean): boolean;
  combatEndShadows?(s: GameState, u: Unit): boolean;
  skipShadowDeal?(s: GameState, u: Unit): boolean;
  beginShadows?(s: GameState, u: Unit): boolean;
  finishShadows?(s: GameState, u: Unit, fresh?: boolean): boolean;
  abilityLabel?(code: string): string | undefined;
  abilityProblem?(s: GameState, u: Unit, attachmentId?: string): string | null;
  ability?(s: GameState, u: Unit, attachmentId?: string): boolean;
  cardEntered?(
    s: GameState,
    u: Unit,
    fromReveal: boolean,
    cancelled: boolean,
  ): void;
  revealed?(
    s: GameState,
    code: string,
    revealOrigin: Effect["revealOrigin"],
  ): void;
  encounter?(
    s: GameState,
    code: string,
    replay: boolean,
    fromReveal: boolean,
  ): boolean;
  shadow?(s: GameState, code: string): boolean;
  shadowDealt?(s: GameState, enemy: Unit, code: string): void;
  shadowResolved?(s: GameState, enemy: Unit, code: string): void;
  cannotDiscardHand?(
    s: GameState,
    u: Unit,
    byPlayerCardEffect: boolean,
  ): boolean;
  handDiscardDestination?(s: GameState, u: Unit): boolean;
  effect?(s: GameState, e: Effect): boolean;
  enemyDestination?(s: GameState, u: Unit): boolean;
  cannotAttach?(s: GameState, u: Unit, code: string): boolean;
  doesNotExhaustToQuest?(s: GameState, u: Unit): boolean;
  mustTravel?(s: GameState): boolean;
  revealedSurge?(s: GameState, code: string): boolean;
  characterReadied?(s: GameState, u: Unit): void;
  characterExhausted?(s: GameState, u: Unit): void;
  locationProgressPlaced?(s: GameState, u: Unit, amount: number): void;
  shadowCards?(s: GameState, u: Unit, amount: number): number;
  shadowImmune?(s: GameState, enemy: Unit): boolean;
  defenseOverride?(
    s: GameState,
    defender: Unit,
    enemy: Unit,
  ): number | undefined;
  sideQuestGoalBonus?(s: GameState, quest: Unit): number;
  failedQuest?(s: GameState, amount: number): boolean;
  successfulQuestProgressBlocked?(s: GameState): boolean;
  questSucceeded?(s: GameState, amount: number): void;
  successfulQuestProgress?(s: GameState, amount: number): void;
  eventFinished?(s: GameState, u: Unit): void;
  sharedEffect?(e: Effect): boolean;
  /** A location the players may travel to as a second active location. */
  secondActiveLocation?(s: GameState, u: Unit): boolean;
  /** An objective in the staging area that the players may claim. */
  claimableObjective?(s: GameState, u: Unit): boolean;
  /** Claim an objective with a hero; true when the scenario handled it. */
  claim?(s: GameState, objective: Unit, hero: Unit): boolean;
  /** The Lord of the Rings Saga: The One Ring has just exhausted. */
  oneRingExhausted?(s: GameState): void;
  /** Hide tests: willpower added to a committed character. */
  hideWillpower?(s: GameState, u: Unit): number;
  /** Hide tests: added to the Hide X value of a player's test. */
  hideValueBonus?(s: GameState, player: number): number;
  /** Hide tests: added to the total threat of the discarded cards. */
  hideThreatBonus?(s: GameState, player: number): number;
  /** Effects after a player passes a Hide test. */
  hidePassed?(s: GameState, player: number, source: string): Effect[];
  /** Effects after a player fails a Hide test. */
  hideFailed?(s: GameState, player: number, source: string): Effect[];
}
