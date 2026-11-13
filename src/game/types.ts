export type Sphere =
  "leadership" | "spirit" | "tactics" | "lore" | "neutral" | "encounter";
export interface Card {
  /** A Saga treasure: played as an attachment, added only when discovered. */
  treasure?: boolean;
  /** Cost context for plays from another zone; never changes the printed definition. */
  playOrigin?: "hand" | "deck" | "discard";
  /** Physical owner for costs that inspect an owner’s private zones. */
  playOwner?: number;
  code: string;
  name: string;
  type_code: string;
  /** Objective-locations follow every location rule and retain their printed card kind. */
  objectiveLocation?: boolean;
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
  /** Printed wheel symbols used only when looking at cards during Sailing tests. */
  sailing?: number;
  /** Printed mark in the lower right corner of Beneath the Sands encounter cards. */
  on_track?: boolean;
  /** Printed Track keyword value used after travel while Search is Off Track. */
  track?: number;
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
  back_type_code?: string;
  back_sphere_code?: Sphere;
  back_engagement?: number;
  back_threat?: number;
  back_willpower?: number;
  back_attack?: number;
  back_defense?: number;
  back_health?: number;
  back_quest?: number;
  back_name?: string;
  back_traits?: string;
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
  /** Flies and Spiders: a facedown player card attached as poison. */
  poison?: boolean;
  owner?: number;
  id: string;
  code: string;
  exhausted: boolean;
  /** Derived from active effects; restoration recalculates this value. */
  blanked?: boolean;
}
export interface Unit {
  /** Thalion becomes a hero while three side quests are in the victory display. */
  eredThalionHero?: boolean;
  /** Captured Corsair Skirmishers retain their physical card as Ship objectives. */
  cobasShipObjective?: boolean;
  cobasGuarding?: string[];
  /** Physical encounter card belonging to the Stormcaller's separate area. */
  stormcallerArea?: boolean;
  /** Physical encounter card belonging to the Orc staging area. */
  raceHaradArea?: boolean;
  /** Na'asiyah's resource bonus is fixed when this attack begins. */
  raidCombatResourceBonus?: number;
  /** The Mission objective retains its physical identity when turned over. */
  flipped?: boolean;
  /** Cold from Angmar preserves printed keywords and traits while blanking abilities. */
  printedKeywordsPreserved?: boolean;
  /** Revealed in Wrath preserves printed traits while blanking printed keywords. */
  printedTraitsPreserved?: boolean;
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
  /** Willpower modifiers that last until the end of the round. */
  roundWill?: number;
  /** Resolved shadow protections expire when the attached shadows are discarded. */
  shadowCancelsDamage?: boolean;
  /** Frenzied Attack lasts through refresh, until the round ends. */
  roundCannotTakeDamage?: boolean;
  /** Time tokens on revealed encounter cards, independent of resource pools. */
  timeCounters?: number;
  /** Derived immunity granted by an active scenario effect. */
  immuneToPlayerEffects?: boolean;
  /** Flies and Spiders: an unconscious character (rotated 180 degrees). */
  unconscious?: boolean;
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
  /** Derived resource icons granted by current engagement conditions. */
  dynamicResourceIcons?: string[];
  /** Derived: the character has lost its sphere resource icons (Haunted Valley). */
  noResourceIcons?: boolean;
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
  | "wastes-of-eriador"
  | "escape-from-mount-gram"
  | "across-the-ettenmoors"
  | "the-treachery-of-rhudaur"
  | "the-battle-of-carn-dum"
  | "the-dread-realm"
  | "voyage-across-belegaer"
  | "the-fate-of-numenor"
  | "raid-on-the-grey-havens"
  | "flight-of-the-stormcaller"
  | "the-thing-in-the-depths"
  | "temple-of-the-deceived"
  | "the-drowned-ruins"
  | "a-storm-on-cobas-haven"
  | "the-city-of-corsairs"
  | "escape-from-umbar"
  | "desert-crossing"
  | "the-long-arm-of-mordor"
  | "the-mumakil"
  | "race-across-harad"
  | "beneath-the-sands"
  | "the-black-serpent"
  | "the-dungeons-of-cirith-gurat"
  | "the-crossings-of-poros"
  | "journey-up-the-anduin"
  | "lost-in-mirkwood"
  | "the-kings-quest"
  | "the-withered-heath"
  | "roam-across-rhovanion"
  | "fire-in-the-night"
  | "the-ghost-of-framsburg"
  | "mount-gundabad"
  | "the-fate-of-wilderland"
  | "the-river-running"
  | "danger-in-dorwinion"
  | "temple-of-doom"
  | "the-land-of-sorrow"
  | "the-fortress-of-nurn"
  | "the-massing-at-osgiliath"
  | "we-must-away-ere-break-of-day"
  | "over-the-misty-mountains-grim"
  | "dungeons-deep-and-caverns-dim"
  | "flies-and-spiders"
  | "the-lonely-mountain"
  | "the-battle-of-five-armies"
  | "the-battle-of-lake-town"
  | "a-shadow-of-the-past"
  | "a-knife-in-the-dark"
  | "flight-to-the-ford"
  | "the-stone-of-erech"
  | "the-old-forest"
  | "the-ring-goes-south"
  | "under-the-ash-mountains"
  | "challenge-of-the-wainriders"
  | "the-city-of-ulfast"
  | "wrath-and-ruin"
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
  /** Enemy whose resolving shadow caused this effect and its continuations. */
  shadowEnemyId?: string;
  /** Objective that must receive undefended damage from this attack. */
  damageTarget?: string;
  /** Printed attacks may explicitly omit their ordinary shadow deal. */
  noShadow?: boolean;
  revealOrigin?: "encounter" | "underworld" | "power" | "discard";
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
  /** A saved early Ring decision resumes before opening hands/scenario initialization. */
  setupPending?: boolean;
  /** Innermost printed player ability; retained across choices and nested responses. */
  playerAbilitySources?: { source: string; code: string }[];
  sailing?: import("./sailing").SailingState;
  voyageBelegaer?: import("./voyage-belegaer-support").VoyageState;
  fateNumenor?: import("./fate-numenor-support").FateNumenorState;
  raidGreyHavens?: import("./raid-grey-havens-support").RaidGreyHavensState;
  stormcaller?: import("./stormcaller-support").StormcallerState;
  depths?: import("./depths-support").DepthsState;
  temple?: import("./temple-support").TempleState;
  drowned?: import("./drowned-support").DrownedState;
  cobas?: import("./cobas-support").CobasState;
  city?: import("./city-support").CityState;
  umbar?: import("./escape-umbar-support").EscapeUmbarState;
  desertCrossing?: import("./desert-crossing-support").DesertCrossingState;
  mordor?: import("./long-arm-mordor-support").MordorState;
  mumakil?: import("./mumakil-support").MumakilState;
  raceHarad?: import("./race-harad-support").RaceHaradState;
  beneathSands?: import("./beneath-sands-support").BeneathSandsState;
  blackSerpent?: import("./black-serpent-support").BlackSerpentState;
  cirithGurat?: import("./cirith-gurat-support").CirithGuratState;
  crossingsPoros?: import("./crossings-poros-support").CrossingsPorosState;
  wildsRhovanion?: import("./wilds-rhovanion-support").WildsRhovanionState;
  witheredHeath?: import("./withered-heath-types").WitheredHeathState;
  roamRhovanion?: import("./roam-rhovanion-types").RoamRhovanionState;
  fireNight?: import("./fire-night-types").FireNightState;
  ghostFramsburg?: import("./ghost-framsburg-types").GhostFramsburgState;
  mountGundabad?: import("./mount-gundabad-types").MountGundabadState;
  fateWilderland?: import("./fate-wilderland-types").FateWilderlandState;
  riverRunning?: import("./river-running-types").RiverRunningState;
  dangerDorwinion?: import("./danger-dorwinion-types").DangerDorwinionState;
  templeDoom?: import("./temple-doom-types").TempleDoomState;
  landSorrow?: import("./land-sorrow-types").LandSorrowState;
  landSorrowPlayers?: import("./land-sorrow-types").LandSorrowPlayersState;
  fortressNurn?: import("./fortress-nurn-types").FortressNurnState;
  fortressNurnPlayers?: import("./fortress-nurn-types").FortressNurnPlayersState;
  massing?: import("./massing-osgiliath-types").MassingState;
  weMustAway?: import("./we-must-away-types").WeMustAwayState;
  mistyMountains?: import("./misty-mountains-types").MistyMountainsState;
  dungeonsDeep?: import("./dungeons-deep-types").DungeonsDeepState;
  fliesSpiders?: import("./flies-spiders-types").FliesSpidersState;
  lonelyMountain?: import("./lonely-mountain-types").LonelyMountainState;
  battleFiveArmies?: import("./battle-five-armies-types").BattleFiveArmiesState;
  lakeTown?: import("./lake-town-types").LakeTownState;
  shadowPast?: import("./shadow-past-types").ShadowPastState;
  knifeDark?: import("./knife-dark-types").KnifeDarkState;
  flightFord?: import("./flight-ford-types").FlightFordState;
  stoneErech?: import("./stone-erech-types").StoneErechState;
  oldForest?: import("./old-forest-types").OldForestState;
  ringSouth?: import("./ring-south-types").RingSouthState;
  /** Transient: Wolves from Mordor being shuffled into the encounter deck. */
  massingShuffle?: string;
  ashMountains?: import("./ash-mountains-types").AshMountainsState;
  ashPlayers?: import("./ash-mountains-types").AshPlayersState;
  wainriders?: import("./wainriders-types").WainridersState;
  wainridersPlayers?: import("./wainriders-player-types").WainridersPlayersState;
  ulfast?: import("./ulfast-types").UlfastState;
  ulfastPlayers?: import("./ulfast-player-types").UlfastPlayersState;
  wrathRuin?: import("./wrath-ruin-types").WrathRuinState;
  burglarContract?: import("./burglar-contract-types").BurglarContractState;
  wrathRuinPlayers?: import("./wrath-ruin-player-types").WrathRuinPlayersState;
  shadowEastPlayers?: import("./shadow-east-player-types").ShadowEastPlayersState;
  /** Up to three copies of each Encounter design per player; never replenished on departure. */
  rangerReserves?: Record<number, number>;
  batch4WindReserves?: Record<number, number>;
  eredEagleReserves?: Record<number, number>;
  wrathBombadilReserves?: Record<number, number>;
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
  wastesEriador?: import("./wastes-eriador-support").WastesState;
  mountGram?: import("./mount-gram-support").MountGramState;
  carnDum?: import("./carn-dum-support").CarnDumState;
  ettenmoors?: import("./ettenmoors-support").EttenmoorsState;
  rhudaur?: import("./rhudaur-support").RhudaurState;
  dreadRealm?: import("./dread-realm-support").DreadRealmState;
  /** Physical player hands hidden under the shared Lost in the Wilderness side quest. */
  encounterHiddenHands?: Record<string, Unit[]>;
  removedEncounter?: string[];
  /** Player cards attached to this player's threat dial, independent of characters. */
  threatAttachments?: Attachment[];
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
    fromHand?: boolean;
    player: number;
    destination:
      "discard" | "bottom" | "removed" | "victory" | "hand" | "spent";
  }[];
  /** Paid physical cards wait out mandatory cost triggers before entering play. */
  pendingPlayerPlays?: {
    unit: Unit;
    player: number;
    target?: string;
    effectiveCost: number;
    played: boolean;
    fromHand: boolean;
    bottom: boolean;
    amount: number;
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
  /** A Hide test suspends ordinary effects until its action window resolves. */
  hideTest?: import("./hide-test").HideTest;
  /** Failed Hide tests this round, for "this phase" and "this round" effects. */
  hideFailures?: import("./hide-test").HideFailure[];
  /** Scoped "as if engaged" attacks keep the enemy in its physical staging zone. */
  playerAttackContexts?: { enemyId: string; player: number }[];
  combat: {
    /** Ramming Speed tracks actual damage from this physical attack. */
    cobasRamming?: boolean;
    cityHoldLine?: import("./city-hold-line").CityHoldLineAttack;
    cityWatchShadows?: number;
    cityBelfalasShadows?: number;
    cityKilledAllyCosts?: number[];
    fateBottomOnAllyKill?: boolean;
    /** Each independently resolved Furious Rainstorm shadow applies on a kill. */
    templeRainOnKill?: number;
    voyageShiftOnCharacterKilled?: number;
    voyageShiftOnShipDamaged?: number;
    voyageExcessCopies?: number;
    voyageCharacterKilled?: boolean;
    voyageShipDamaged?: boolean;
    raidKilledCharacter?: boolean;
    mordorSavageShadows?: number;
    mordorAdditionalAttacks?: number;
    mordorDestroyedCharacter?: boolean;
    mumakilKilledCharacter?: boolean;
    mumakilSavageReturn?: boolean;
    raceHaradDestroyedCharacter?: boolean;
    raceHaradPursuerShadows?: number;
    raceHaradReturnToOrcs?: boolean;
    beneathSandsPoisonShadow?: boolean;
    blackSerpentKilled?: number;
    blackSerpentQuarter?: number;
    blackSerpentChaos?: boolean;
    porosKilled?: number;
    porosDangerShadows?: number;
    porosThreatShadows?: number;
    porosPoisonShadow?: boolean;
    wildsBlankShadow?: boolean;
    wildsDiscardAlly?: boolean;
    wildsCannotReady?: boolean;
    wildsGuardDefense?: number;
    desertPoisonShadow?: boolean;
    umbarKilled?: number;
    umbarInjuredShadows?: number;
    /** Printed Depths shadows continue only after this physical enemy attack. */
    depthsAfterAttack?: Effect[];
    raidFiresOnKill?: number;
    /** Every defender that actually took damage during this attack, including costs. */
    damagedDefenders?: string[];
    heathSpiderDamageIds?: string[];
    stewardRemoveTokensIfKilled?: boolean;
    heirsScrollDamage?: boolean;
    bloodTurnOnKill?: boolean;
    bloodKilledPlayers?: { player: number; shadows: boolean }[];
    timeOnKill?: number;
    extraAttacks?: number;
    chetwoodAllyKilled?: boolean;
    weatherCharacterKilled?: boolean;
    wastesNextPlayerAttacks?: number;
    wastesExtraAttacks?: number;
    wastesRemoveQuestOnKill?: number;
    wastesCharacterKilled?: boolean;
    gramCaptureDamage?: boolean;
    dreadKilled?: import("./dread-realm-support").DreadKilledCharacter[];
    dreadReanimateOnKill?: number;
    dreadRevealOnKill?: number;
    rhudaurProgressPerDamage?: number;
    rhudaurDestroyedWill?: number;
    rhudaurCovenantShadows?: number;
    carnFlipAfter?: number;
    carnExtraAttacks?: number;
    carnVileSearch?: number;
    carnKilledAllies?: string[];
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
    /** Damage resolution began with a live attacker after declaration and shadows. */
    attackResolved?: boolean;
    /** This attack's fresh shadow must be discarded even if virtual engagement ends. */
    freshConsideredShadows?: boolean;
    defenderId: string | null;
    attackBonus: number;
    /** Each defender's defense is reduced by this much for the attack ("gets −X defense"). */
    defensePenalty?: number;
    /** An encounter shadow may redirect otherwise undefended damage. */
    undefendedTargetId?: string;
    riverPursuitOnKill?: number;
    dorwinionKilledCharacter?: boolean;
    dorwinionKilledAlly?: boolean;
    dorwinionUnderGuard?: number;
    doomUlchor?: boolean;
    doomTributeOnKill?: number;
    doomKilledCharacter?: boolean;
    ulfastAgent?: number;
    ulfastExcess?: number;
    ulfastUnderGuard?: number;
    ulfastKilled?: boolean;
    sorrowEnemy?: string;
    sorrowKilled?: boolean;
    sorrowExcess?: number;
    nurnEnemy?: string;
    nurnKilled?: boolean;
    nurnSoldier?: number;
    nurnUnderGuard?: number;
    massingEnemy?: string;
    massingKilled?: boolean;
    /** A Suspicious Crow shadows to shuffle back if this attack dealt damage. */
    wmaCrow?: number;
    wmaDamaged?: boolean;
    ommEnemy?: string;
    /** Chaos in the Cavern's shadow returns the attacker after its attack. */
    ommChaosReturn?: boolean;
    /** Bilbo's Magic Ring cancelled all damage from this attack. */
    ringCancel?: boolean;
    /** Balins whose once-per-attack response was used during this attack. */
    otdBalin?: string[];
    /** Weighed Down's shadow: a destroyed defender raises its controller's threat by 5. */
    fasWeighed?: boolean;
    /** Dark Bats damaged this character and attaches to it after the attack. */
    fasBats?: string;
    /** Hatred Rekindled shadow: the enemy attacks again after this attack. */
    bofaAgain?: boolean;
    /** Vanguard of Bolg shadow: a destroyed character clears the current quest. */
    bofaVanguard?: boolean;
    /** The Battle of Lake-town: this attack destroyed a character. */
    lakeKilled?: boolean;
    /** Dire Magnificence's shadow: Smaug engages the next player after a kill. */
    lakeLeap?: boolean;
    /** Reckless in His Rage's shadow: a kill resolves all burn damage. */
    lakeReckless?: boolean;
    /** The Master's Manor's shadow: a kill discards the defending player's hand. */
    lakeManor?: boolean;
    /** A Shadow of the Past: return the attacking enemy to the staging area after this attack. */
    spReturn?: boolean;
    /** Pathless Country's shadow: the enemy engages the next player and attacks. */
    spPathless?: boolean;
    /** Flight to the Ford: The Enemy is Upon Us!'s shadow (a kill removes the quest's progress). */
    ffUponUs?: boolean;
    /** Flight to the Ford: Pain Assailed Him's shadow (a kill reduces the Ring-bearer's life). */
    ffPain?: boolean;
    /** Flight to the Ford: this attack destroyed a character. */
    ffDestroyed?: boolean;
    /** The Stone of Erech: Banks of Morthond's shadow (a kill adds Night progress). */
    seBanks?: boolean;
    /** The Stone of Erech: this attack destroyed a character. */
    seDestroyed?: boolean;
    /** The Old Forest: Strange Woods' shadow (a kill raises each player's threat by 2). */
    otfStrange?: boolean;
    /** The Old Forest: this attack destroyed a character. */
    otfDestroyed?: boolean;
    /** The Old Forest: Ending and Failing's shadow returns the attacker to the staging area. */
    otfReturn?: boolean;
    /** This attack deals no damage (The Road Darkens' Frodo Baggins). */
    noDamage?: boolean;
    /** The Ring Goes South: Howling Warg's shadow (a kill damages an active location). */
    rgsHowling?: boolean;
    /** The Ring Goes South: this attack destroyed a character. */
    rgsDestroyed?: boolean;
    ashKilled?: boolean;
    ashWolf?: boolean;
    ashTroll?: boolean;
    ashExcess?: number;
    ashDiscardOnKill?: number;
    ashAttachmentOnKill?: number;
    wainRacerKilled?: boolean;
    wainReturnOnKill?: boolean;
    wainDamageOnKill?: number;
    wrathKilledPlayers?: number[];
    wrathReturnHighest?: number;
    wrathExtraAttacks?: number;
    wilderAssaultOnKill?: number;
    wilderKilledCharacter?: boolean;
    wilderPackAttacks?: number;
    wilderDiscardAlly?: number;
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
        | "RESOLVE_ESCAPE"
        | "RESOLVE_SAILING"
        | "RESOLVE_HIDE";
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
  | {
      type: "PLAY_DISCARD";
      index: number;
      target?: string;
      payment?: Record<string, number>;
      amount?: number;
    }
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
  | "threatAttachments"
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
