import type { Unit } from "./types";
import type { FellowshipEventState } from "./fellowship-event-support";

/**
 * The Woodland Realm (2018 Fellowship event), played cooperatively; the quick
 * build, the quest deck and the box are the Fellowship event state (its sets
 * are numbered 1 to 14).
 */
export interface WoodlandRealmState extends FellowshipEventState {
  /** Mendor, once Spider Den is explored: the players lose if it leaves play. */
  mendorId: string | null;
  /** The Forest of Great Fear: the enemy with a resource on it. */
  markedId: string | null;
  /** Stage 2 after the commit: no more than `limit` progress on it this round. */
  cap: { round: number; limit: number; placed: number } | null;
  /** Lost in the Dark: the first treachery revealed this round (open until the next reveal). */
  firstTreachery: { round: number; code: string; open: boolean } | null;
  /** To the Elvenking's Halls: the progress placed on it this quest phase. */
  hallsProgress: { key: string; amount: number } | null;
  /** The threat each player reduced this round (Dry Watercourse, the Halls). */
  reduced: { player: number; round: number; amount: number }[];
  /** Despair: each character's printed text box is blank this round. */
  despairRound: number | null;
  /** Despair's shadow: the defending character's text box is blank this phase. */
  blankShadow: { id: string; key: string }[];
  /** Exhaustion: characters cannot be readied by player card effects this round. */
  noPlayerReady: number | null;
  /** Exhaustion's shadow: the defending character cannot ready this round. */
  noReady: { id: string; round: number }[];
  /** Enchanted Stream's travel: these heroes cannot ready while it is active. */
  streamHeroes: string[];
  /** Labyrinthine Woods: staged locations get +1 threat per copy this phase. */
  labyrinth: { key: string; count: number } | null;
  /** Labyrinthine Woods' shadow: enemies engaged with the player get +1 attack. */
  labyrinthShadow: { player: number; key: string }[];
  /** Wild Bear's shadow: +X defense until the end of the phase. */
  defenseBoosts: { id: string; key: string; value: number }[];
  /** Wicked Spider's shadow: the attacker cannot take damage this phase. */
  noDamage: { id: string; key: string }[];
  /** The Eaves of Mirkwood: progress placed on each staged location this round. */
  eaves: { id: string; round: number; amount: number }[];
  /** Mirkwood Patrol's shadow: the enemies that engaged a player this round. */
  engagedRound: { id: string; round: number }[];
  /** Caught in a Web: heroes whose controller spent 2 resources so they may ready. */
  webPaid: string[];
  /** Hatred Rekindled's shadow: shadow cards whose effects cannot be canceled. */
  uncancelable: string[];
  /** The treacheries being resolved. */
  resolving: Unit[];
}
