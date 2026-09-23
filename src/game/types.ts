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
  id: string;
  code: string;
  exhausted: boolean;
}
export interface Unit {
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
  beornReturn?: boolean;
  shadows: string[];
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
  id: number;
  round: number;
  text: string;
  kind: "normal" | "good" | "danger" | "chapter";
}
export interface GameState {
  version: 1;
  deckId: string;
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
  } | null;
  log: LogEntry[];
  lastReveal: string | null;
  lastQuest: { will: number; threat: number; net: number } | null;
}
export type Action =
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
  | {
      type: "DEFEND";
      enemyId: string;
      defenderId: string | null;
      defenderIds?: string[];
    }
  | { type: "ATTACK"; enemyId: string; attackerIds: string[] };
