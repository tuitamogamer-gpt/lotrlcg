import type { Attachment, Unit } from "./types";
import type { FellowshipEventState } from "./fellowship-event-support";

/**
 * The Mines of Moria (2019 Fellowship event), played cooperatively; the quick
 * build, the quest deck and the box are the Fellowship event state (its sets
 * are numbered 1 to 14).
 */
export interface MinesMoriaState extends FellowshipEventState {
  /** Narrow Paths: the attachments guarded under the stage, with their owners. */
  guarded: { owner: number; attachment: Attachment }[];
  /** Transient: the attachment Narrow Paths is taking under the stage. */
  guarding: { id: string; owner: number } | null;
  /** Hidden Threat: the cards facedown under the main quest. */
  hidden: string[];
  /** Totals added to the staging area's threat until the end of the phase. */
  stagingBonus: { key: string; amount: number; source: string }[];
  /** Signs of Conflict: +1 threat per copy to staged enemies and locations this phase. */
  signs: { key: string; count: number } | null;
  /** Zigil Mineshaft's Quest Action: its threat reduction this phase. */
  zigil: { id: string; key: string; amount: number }[];
  /** No more than `limit` progress on the current quest this phase (Web-spinner, The Fate of Balin). */
  caps: { key: string; limit: number; placed: number; source: string }[];
  /** Brood Mother: the progress placed on the main quest this round. */
  brood: { round: number; placed: number } | null;
  /** Lightless Passage: the progress placed on each staged location this round. */
  lightless: { id: string; round: number; amount: number }[];
  /** Stairs of Náin: the first treachery revealed this round (open until the next reveal). */
  firstTreachery: { round: number; code: string; open: boolean } | null;
  /** Foul Air: the round whose quest phase ended without resolving the quest. */
  questEnded: number | null;
  /** Grabbed by Spiders' shadow: the defending character cannot ready this round. */
  noReady: { id: string; round: number }[];
  /** Abandoned Mines' and Sudden Pitfall's shadows: the attacker cannot take damage this phase. */
  noDamage: { id: string; key: string }[];
  /** The enemies that engaged a player this round (Abandoned Mines' shadow). */
  engagedRound: { id: string; round: number }[];
  /** Massing in the Deep's shadow: each enemy engaged with the player gets +1 attack this phase. */
  massing: { player: number; key: string }[];
  /** Goblin Warlord: the copies whose 'enters play' search has resolved. */
  warlords: string[];
  /** The treacheries being resolved. */
  resolving: Unit[];
}
