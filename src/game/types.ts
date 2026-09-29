export type Sphere =
  "leadership" | "spirit" | "tactics" | "lore" | "neutral" | "encounter";
export interface Card {
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
  engagement?: number;
  quest?: number;
  victory?: number;
  encounter_set?: string;
  url?: string;
}
export interface Attachment {
  owner?: number;
  id: string;
  code: string;
  exhausted: boolean;
}
export interface Unit {
  owner?: number;
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
  tempWill?: number;
  tempAttack?: number;
  tempDefense?: number;
  suppressed?: boolean;
  feinted?: boolean;
  /** Players protected from this enemy's attacks for the current phase. */
  preventedAttacks?: number[];
  beornReturn?: boolean;
  shadows: string[];
  guarding?: string;
  facedownCard?: string;
}
export type ScenarioId = "mirkwood" | "anduin" | "dol-guldur";
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
  | "planning"
  | "quest"
  | "staging"
  | "travel"
  | "encounter"
  | "defense"
  | "attack"
  | "refresh";
export interface Effect {
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
export interface Option {
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
  startingHeroes: string[];
  prisoner: Unit | null;
  captiveMendor: Unit | null;
  nazgulDefeated: boolean;
  stageRevealing: boolean;
  alliesPlayed: number;
  threatModifier: number;
  fog?: number;
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
  stage: 1 | 2 | 3;
  branch: "unknown" | "beorn" | "spider";
  progress: number;
  victory: number;
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
  combat: {
    enemyId: string;
    defenderId: string | null;
    attackBonus: number;
    defenderIds?: string[];
    ignoreDefense?: boolean;
    returnToStaging?: boolean;
    returnWolf?: boolean;
  } | null;
  suspendedCombats: NonNullable<GameState["combat"]>[];
  log: LogEntry[];
  lastReveal: string | null;
  lastQuest: { will: number; threat: number; net: number } | null;
}
export type Action =
  | { type: "CONTINUE"; stepId: number }
  | { type: "SET_REVIEW_MODE"; mode: ReviewMode }
  | { type: "SELECT_SEAT"; seat: number }
  | { type: "KEEP" | "MULLIGAN" | "NEXT" | "COMMIT" | "END_ATTACKS" }
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
