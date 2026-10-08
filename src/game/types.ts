export type Sphere =
  "leadership" | "spirit" | "tactics" | "lore" | "neutral" | "encounter";
export interface Card {
  /** Cost context for plays from another zone; never changes the printed definition. */
  playOrigin?: "hand" | "deck" | "discard";
  /** Physical owner for costs that inspect an owner’s private zones. */
  playOwner?: number;
  code: string;
  name: string;
  type_code: string;
  sphere_code: string;
  cost?: number | string;
  threat?: number;
  willpower?: number;
  attack?: number;
  defense?: number;
  health?: number;
  traits?: string;
  text?: string;
  shadow?: string;
  is_unique?: boolean;
  pack_name?: string;
  pack_code?: string;
  imagesrc?: string;
  illustrator?: string;
  quantity?: number;
  /** Printed maximum copies per player's deck, when stricter than the default three. */
  deck_limit?: number;
  /** Copies in the official easy-mode encounter deck when fewer than `quantity`. */
  easy_quantity?: number;
  engagement?: number;
  quest?: number;
  victory?: number;
  encounter_set?: string;
  url?: string;
  /** Reference-catalog provenance does not confer automated gameplay support. */
  source_url?: string;
  source?: "ringsdb" | "octgn" | "ffg" | "dragncards";
  octgnid?: string;
  official?: boolean;
  nightmare?: boolean;
  back_text?: string;
  back_quest?: number;
  back_name?: string;
  back_imagesrc?: string;
  /** Printed X, dash or variable values retained alongside numeric game fields. */
  printed_stats?: Partial<
    Record<
      | "cost"
      | "threat"
      | "willpower"
      | "attack"
      | "defense"
      | "health"
      | "quest"
      | "engagement"
      | "victory",
      string
    >
  >;
  side?: "A" | "B";
  packs?: (string | { pack_code: string; pack_name?: string })[];
  /** Exact alias of an existing scripted definition, when identifiers differ by source. */
  engine_code?: string;
}
export interface Attachment {
  /** Borrowed attachments on encounter cards retain the player who played them. */
  controller?: number;
  /** Cards attached by Nameless enemies retain only their printed cost. */
  namelessCard?: boolean;
  dynamicTraits?: string[];
  resourceTokens?: number;
  /** Face-down Eagle cards retain physical ownership but no printed abilities. */
  facedown?: boolean;
  owner?: number;
  id: string;
  code: string;
  exhausted: boolean;
  /** Derived from active effects; restoration recalculates this value. */
  blanked?: boolean;
}
export interface Unit {
  /** The Mission objective retains its physical identity when turned over. */
  flipped?: boolean;
  /** Cold from Angmar preserves printed keywords and traits while blanking abilities. */
  printedKeywordsPreserved?: boolean;
  /** Actual resource spending, independent of transfers and forced losses. */
  resourcesSpentRound?: number;
  ignoreThreatRound?: number;
  roundDefense?: number;
  /** Controller of a borrowed player attachment waiting in staging. */
  controller?: number;
  /** Noiseless Movement's lasting restriction; optional engagement stays legal. */
  noEngagementRound?: number;
  /** Physical shadow visibility is independent of resolved shadow effects. */
  faceupShadows?: boolean[];
  morgulExtraAttacks?: number;
  /** Dunland Tribesman bonuses expire at round end. */
  roundThreat?: number;
  roundAttack?: number;
  /** Resolved shadow protections expire when the attached shadows are discarded. */
  shadowCancelsDamage?: boolean;
  /** Frenzied Attack lasts through refresh, until the round ends. */
  roundCannotTakeDamage?: boolean;
  /** Time tokens on revealed encounter cards, independent of resource pools. */
  timeCounters?: number;
  /** Derived immunity granted by an active scenario effect. */
  immuneToPlayerEffects?: boolean;
  shadowCancelsCombatDamage?: boolean;
  /** Derived global continuous traits and keywords. */
  dynamicTraits?: string[];
  dynamicKeywords?: string[];
  /** Lasting keyword grants survive phase ends and end with the round. */
  roundKeywords?: string[];
  /** Derived printed-text blanking; lasting modifiers remain separate. */
  blanked?: boolean;
  /** Lasting grants remain until phase end even if their source leaves play. */
  phaseResourceIcons?: string[];
  owner?: number;
  consideredEnemyAttackedBy?: number[];
  attackedBy?: number[];
  id: string;
  code: string;
  exhausted: boolean;
  damage: number;
  progress: number;
  resources: number;
  committed: boolean;
  attachments: Attachment[];
  boost: number;
  attacked: boolean;
  temporary?: boolean;
  tempThreat?: number;
  tempEngagement?: number;
  tempWill?: number;
  tempAttack?: number;
  tempDefense?: number;
  suppressed?: boolean;
  feinted?: boolean;
  /** Players protected from this enemy's attacks for the current phase. */
  preventedAttacks?: number[];
  beornReturn?: boolean;
  shadows: string[];
  revealedShadowCount?: number;
  guarding?: string;
  facedownCard?: string;
  facedownCardId?: string;
}
export type ScenarioId =
  | "mirkwood"
  | "anduin"
  | "dol-guldur"
  | "hunt-for-gollum"
  | "conflict-at-the-carrock"
  | "hills-of-emyn-muil"
  | "journey-to-rhosgobel"
  | "dead-marshes"
  | "return-to-mirkwood"
  | "into-the-pit"
  | "the-seventh-level"
  | "flight-from-moria"
  | "redhorn-gate"
  | "road-to-rivendell"
  | "watcher-in-the-water"
  | "the-long-dark"
  | "foundations-of-stone"
  | "peril-in-pelargir"
  | "into-ithilien"
  | "siege-of-cair-andros"
  | "the-stewards-fear"
  | "the-druadan-forest"
  | "encounter-at-amon-din"
  | "assault-on-osgiliath"
  | "the-blood-of-gondor"
  | "the-morgul-vale"
  | "fords-of-isen"
  | "to-catch-an-orc"
  | "into-fangorn"
  | "the-dunland-trap"
  | "intruders-in-chetwood"
  | "the-weather-hills"
  | "deadmens-dike"
  | "the-antlered-crown"
  | "celebrimbors-secret"
  | "the-nin-in-eilph"
  | "trouble-in-tharbad"
  | "the-three-trials"
  | "shadow-and-flame";
export type PlayMode = "normal" | "campaign";
export interface CampaignState {
  seatPenalties?: number[];
  heroes: string[];
  fallen: string[];
  threatPenalty: number;
  boons: string[];
  burdens: string[];
  permanent: Record<string, string[]>;
  prisoner: string | null;
  completed: { scenarioId: ScenarioId; score: number; rounds: number }[];
  mendorSaved: boolean;
}
export type Phase =
  | "setup"
  | "resource"
  | "planning"
  | "quest"
  | "staging"
  | "travel"
  | "encounter"
  | "defense"
  | "attack"
  | "refresh";
export interface Effect {
  /** Objective that must receive undefended damage from this attack. */
  damageTarget?: string;
  revealOrigin?: "encounter" | "underworld";
  /** Serializable event resolution retains paid costs and cancellation continuations. */
  effects?: Effect[];
  cancelledEffects?: Effect[];
  costEffects?: Effect[];
  /** Physical source owner when a controlled attachment has already left play. */
  owner?: number;
  player?: number;
  kind: string;
  target?: string;
  source?: string;
  code?: string;
  value?: number;
  count?: number;
  ids?: string[];
  text?: string;
  flag?: boolean;
}
export interface EscapeTest {
  phase: "preparing" | "committing" | "actions";
  source: string;
  participants: number[];
  cursor: number;
  committedIds: string[];
  count: number;
  attack: boolean;
  capture: boolean;
  continuation: Effect[];
}
export interface Option {
  ability?: import("./player-ability-triggers").PlayerAbilityTrigger;
  id: string;
  label: string;
  detail?: string;
  code?: string;
  effects: Effect[];
}
export interface Choice {
  title: string;
  description?: string;
  options: Option[];
}
export interface LogEntry {
  player?: number;
  id: number;
  round: number;
  text: string;
  kind: "normal" | "good" | "danger" | "chapter";
}
export interface ResolutionStep {
  id: number;
  kind:
    | "reveal"
    | "shadow"
    | "effect"
    | "quest"
    | "combat"
    | "round"
    | "phase"
    | "action"
    | "setup";
  title: string;
  detail: string;
  cards: { code: string; label: string; instanceId?: string }[];
  changes: { label: string; before: string; after: string; code?: string }[];
  lines: LogEntry[];
  round: number;
  phase: Phase;
  player: number;
}
/**
 * How often the table waits for confirmation. "all" pauses on every recorded
 * event, "hidden" only for hidden information and losses, "decisions" never.
 */
export type ReviewMode = "all" | "hidden" | "decisions";
export interface GuidedFlow {
  nextId: number;
  pending: ResolutionStep | null;
  history: ResolutionStep[];
  mode?: ReviewMode;
}
export interface GameState {
  /** Up to three Encounter allies set aside by each player; never replenished on departure. */
  rangerReserves?: Record<number, number>;
  /** Selection survives defeat until the end of this quest phase. */
  sideQuestSelections?: Record<
    string,
    { id: string; code: string; defeated?: boolean; phase?: Phase }
  >;
  ringMaker?: import("./ring-maker-player").RingMakerState;
  isengard?: import("./voice-isengard").IsengardState;
  bloodGondor?: import("./blood-gondor-support").BloodGondorState;
  chetwood?: import("./chetwood-support").ChetwoodState;
  weatherHills?: import("./weather-hills-support").WeatherState;
  deadmensDike?: import("./deadmens-dike-support").DeadmensDikeState;
  antlered?: import("./antlered-support").AntleredState;
  celebrimbor?: import("./celebrimbor-support").CelebrimborState;
  ninEilph?: import("./nin-eilph-support").NinState;
  tharbad?: import("./tharbad-support").TharbadState;
  threeTrials?: import("./three-trials-support").ThreeTrialsState;
  dunlandTrap?: import("./dunland-trap-support").DunlandTrapState;
  fangorn?: import("./fangorn-support").FangornState;
  refreshReadied?: Record<number, string[]>;
  catchOrc?: import("./catch-orc-support").CatchOrcState;
  fordsIsen?: import("./fords-isen-support").FordsIsenState;
  morgulVale?: import("./morgul-vale-support").MorgulValeState;
  druadanForest?: import("./druadan-forest-support").DruadanForestState;
  amonDin?: import("./amon-din-support").AmonDinState;
  assaultOsgiliath?: import("./assault-osgiliath-support").AssaultOsgiliathState;
  foundationsStone?: import("./foundations-stone-support").FoundationsStoneState;
  stewardFear?: import("./steward-fear-support").StewardFearState;
  heirsNumenor?: import("./heirs-numenor").HeirsNumenorState;
  resolvingEvents?: {
    unit: Unit;
    player: number;
    destination: "discard" | "bottom" | "removed" | "victory" | "hand";
  }[];
  shadowFlame?: { roundAttackBonus: number; heroCommittedRound?: number };
  longDark?: {
    adderDamagedIds: string[];
    locate?: { player: number; source: string; pass: Effect[]; fail: Effect[] };
  };
  watcherWater?: {
    setAside: string[];
    swampPlaced: Record<string, number>;
    doorsUsedRound?: number;
    thrashing?: { enemyId: string; attackerIds: string[]; players: number[] };
  };
  questAttachments?: Record<string, Attachment[]>;
  pendingQuestDefeat?: string;
  roadRivendell?: { gateEnemyId?: string; gateSeenRound?: number };
  redhorn?: {
    setAside: string[];
    snowstorms: number;
    fanuidholResolved?: boolean;
    fanuidholPaid?: string[];
    snowShadowIds?: string[];
  };
  /** Players still resolving their Oath of Eorl attacks before enemies. */
  earlyAttackPlayers?: number[];
  khazad?: {
    victoryCards: string[];
    questDeck: string[];
    activeQuest?: string;
    questSide?: "A" | "B";
    narrowIds?: string[];
    toolsFound?: boolean;
  };
  flow?: GuidedFlow;
  table?: {
    seats: PlayerSeat[];
    active: number;
    first: number;
    turn: number;
    passed: number[];
  };
  version: 2;
  scenarioId: ScenarioId;
  playMode: PlayMode;
  campaign: CampaignState | null;
  /** Immutable setup threat, retained when a starting hero leaves play. */
  startingThreat?: number;
  startingHeroes: string[];
  prisoner: Unit | null;
  captiveMendor: Unit | null;
  nazgulDefeated: boolean;
  stageRevealing: boolean;
  alliesPlayed: number;
  threatModifier: number;
  fog?: number;
  emynMuilTreacherySeen?: boolean;
  pendingWolfReturns?: string[];
  shackles: number;
  mendorBoost: boolean;
  campaignScarred: boolean;
  includeSupport: boolean;
  deckId: string;
  /** The complete custom player deck list, kept so campaigns and retries can rebuild it. */
  customDeck?: Record<string, number>;
  /** Official easy mode: each hero began with one extra resource. */
  easyMode?: boolean;
  used: string[];
  standTogether: boolean;
  peek: string | null;
  seed: number;
  originalSeed: number;
  nextId: number;
  phase: Phase;
  round: number;
  threat: number;
  status: "playing" | "won" | "lost";
  reason: string;
  heroes: Unit[];
  allies: Unit[];
  hand: Unit[];
  deck: string[];
  discard: string[];
  removed: string[];
  encounterDeck: string[];
  encounterDiscard: string[];
  staging: Unit[];
  engaged: Unit[];
  activeLocation: Unit | null;
  extraActiveLocations?: Unit[];
  stage: number;
  branch: "unknown" | "beorn" | "spider";
  progress: number;
  victory: number;
  /** Physical identities placed in the shared victory display by player effects. */
  victoryCards?: string[];
  fallenThreat: number;
  committedIds: string[];
  questDebuff: number;
  faramir: number;
  gondor: boolean;
  eowynUsed: boolean;
  mulled: boolean;
  optionalEngagement: boolean;
  choice: Choice | null;
  queue: Effect[];
  /** An escape test suspends ordinary encounter/phase effects until resolved. */
  escapeTest?: EscapeTest;
  combat: {
    /** Every defender that actually took damage during this attack, including costs. */
    damagedDefenders?: string[];
    stewardRemoveTokensIfKilled?: boolean;
    heirsScrollDamage?: boolean;
    bloodTurnOnKill?: boolean;
    bloodKilledPlayers?: { player: number; shadows: boolean }[];
    timeOnKill?: number;
    extraAttacks?: number;
    chetwoodAllyKilled?: boolean;
    weatherCharacterKilled?: boolean;
    dikeDestroyedPlayers?: number[];
    dikeRevealOnCharacterKill?: number;
    dikeCharacterKilled?: boolean;
    weatherRuinsThreat?: number;
    chetwoodReturnOnAllyKill?: boolean;
    chetwoodReturnAfterAttack?: boolean;
    crownTimeOnKill?: number;
    celebExcessCopies?: number;
    celebCaptureDestroyed?: boolean;
    celebThreatCopies?: number;
    celebAllyCostCopies?: number;
    celebCapturedIds?: string[];
    ninLoseProgressOnKill?: boolean;
    ninKilledCharacter?: boolean;
    ninDefensePenalties?: Record<string, number>;
    tharbadDamageThreat?: number;
    trialsTimeOnKill?: number;
    trialsGuardianThreat?: number;
    fordsTimeOnKill?: number;
    fordsExtraAttacks?: number;
    morgulProgressOnKill?: boolean;
    morgulKilledCharacter?: boolean;
    amonDinKilledCharacter?: boolean;
    amonDinShadowVillagers?: number;
    osgiliathReturnIfKilled?: boolean;
    osgiliathUndefended?: boolean;
    redirectedToEnemy?: boolean;
    damageDealt?: number;
    defenseBonuses?: Record<string, number>;
    desperateDefenderIds?: string[];
    enemyId: string;
    /** Original player attacked, independent of Sentinel defense or damage replacement. */
    attackPlayer?: number;
    defenderId: string | null;
    attackBonus: number;
    defensePenalty?: number;
    /** An encounter shadow may redirect otherwise undefended damage. */
    undefendedTargetId?: string;
    defenderIds?: string[];
    ignoreDefense?: boolean;
    returnToStaging?: boolean;
    returnWolf?: boolean;
    immediate?: boolean;
    immediatePreviousAttacked?: boolean;
    /** Suspended physical shadows are restored after a nested immediate attack. */
    immediatePreviousShadows?: string[];
    immediatePreviousFaceupShadows?: boolean[];
    immediatePreviousRevealedShadowCount?: number;
    immediatePreviousShadowCancelsDamage?: boolean;
    immediatePreviousShadowCancelsCombatDamage?: boolean;
    immediatePendingDeclaration?: boolean;
    cancelEnemyDamage?: boolean;
    cancelCombatDamage?: boolean;
  } | null;
  suspendedCombats: NonNullable<GameState["combat"]>[];
  log: LogEntry[];
  lastReveal: string | null;
  lastQuest: {
    will: number;
    threat: number;
    net: number;
    stat?: "will" | "attack" | "defense";
  } | null;
}
export type Action =
  | { type: "CONTINUE"; stepId: number }
  | { type: "SET_REVIEW_MODE"; mode: ReviewMode }
  | { type: "SELECT_SEAT"; seat: number }
  | {
      type:
        | "KEEP"
        | "MULLIGAN"
        | "NEXT"
        | "COMMIT"
        | "END_ATTACKS"
        | "RESOLVE_ESCAPE";
    }
  | { type: "TOGGLE_QUEST"; id: string }
  | { type: "CHOOSE"; id: string }
  | {
      type: "PLAY";
      id: string;
      target?: string;
      payment?: Record<string, number>;
      amount?: number;
    }
  | { type: "ABILITY"; id: string; attachmentId?: string }
  | { type: "TRAVEL" | "ENGAGE"; id: string }
  | { type: "CLAIM"; id: string; heroId: string }
  | {
      type: "DEFEND";
      enemyId: string;
      defenderId: string | null;
      defenderIds?: string[];
    }
  | { type: "ATTACK"; enemyId: string; attackerIds: string[] };

export type SeatConfig = {
  heroes: string[];
  deckId: string;
  /** A custom 50-card list; when present the seat's deckId is recorded as "custom". */
  cards?: Record<string, number>;
};
export type PlayerSeat = Pick<
  GameState,
  | "deckId"
  | "customDeck"
  | "startingHeroes"
  | "startingThreat"
  | "threat"
  | "heroes"
  | "allies"
  | "hand"
  | "deck"
  | "discard"
  | "removed"
  | "engaged"
  | "fallenThreat"
  | "committedIds"
  | "faramir"
  | "eowynUsed"
  | "mulled"
  | "optionalEngagement"
  | "shackles"
  | "peek"
  | "used"
  | "standTogether"
> & { eliminated: boolean };
