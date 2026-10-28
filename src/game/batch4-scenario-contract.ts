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
  refreshCharacters?(s: GameState, player: number): Effect[] | undefined;
  whenRevealedCancelled?(s: GameState, code: string): void;
  combatBegin?(s: GameState): void;
  enemyEntered?(s: GameState, unit: Unit): void;
  openingHandsKept?(s: GameState): boolean;
  check?(s: GameState): void;
  playerEliminating?(s: GameState, player: number): void;
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
  engaged?(s: GameState, u: Unit): void;
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
  playerCardPlayed?(s: GameState, u: Unit): void;
  playProblem?(s: GameState, code: string): string | null;
  playerAttackDeclared?(s: GameState, enemy: Unit, ids: string[]): boolean;
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
}
