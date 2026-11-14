import type { Unit } from "./types";

/** A Captive hero: in play, but under no player's control. */
export type UrukHaiCaptive = {
  /** The hero card, with its damage. */
  unit: Unit;
  /** The player who owns the hero. */
  owner: number;
  /** Grishnákh's unit while the Captive is attached to him. */
  holder?: string;
};

export type UrukHaiState = {
  /** The current quest card: Follow the Orcs or Rescue the Captives. */
  currentQuest: string;
  /** A stage defeat is being resolved. */
  advancing: boolean;
  /** The pursuit value, tracked from 10; it is each stage's quest points. */
  pursuit: number;
  /** The Captive heroes, underneath To Isengard! or attached to Grishnákh. */
  captives: UrukHaiCaptive[];
  /** Treachery cards while their When Revealed effects resolve. */
  resolving: Unit[];
  /** Unseen Barrier: the round it limits progress, and the progress placed. */
  barrier?: { round: number; placed: number };
  /** Fighting Uruk-hai: players whose engaged enemies add their threat this round. */
  fighting?: { round: number; players: number[] };
};
