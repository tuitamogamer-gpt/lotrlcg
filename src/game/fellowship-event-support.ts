import type { GameState } from "./types";

/**
 * The printed structure and pure projections shared by the 2018 Fellowship
 * event scenarios (The Wizard's Quest and The Woodland Realm).
 */
export interface FellowshipEventState {
  /** The main quest card (1, then the chosen stage 2 and stage 3). */
  currentQuest: string;
  /** The chosen quest cards still to come, in order. */
  questDeck: string[];
  /** The quest cards the players have defeated, in order. */
  defeated: string[];
  /** Out of the game: the quest cards and encounter sets not chosen. */
  box: string[];
  /** The encounter sets in the encounter deck (their numbers). */
  sets: number[];
  /** The quick build in progress before the first round. */
  building: { stage2: string | null; stage3: string | null } | null;
  advancing: boolean;
  /** The card whose 'when revealed' effects cannot be canceled (the A sides' searches). */
  noCancel: string | null;
}
/** A scenario's quest cards, encounter sets and costs. */
export interface FellowshipEventCards {
  title: string;
  /** Stage 1. */
  request: string;
  /** The set-aside location 1A adds to the staging area. */
  special: string;
  stage2: readonly string[];
  stage3: readonly string[];
  sets: { number: number; cards: string[] }[];
  setLabel: (n: number) => string;
  stageOf: (code: string) => number;
  cost: (code: string) => number;
}
/** The state before the quick build: every recipe card but stage 1 is in the box. */
export function fellowshipEventState(
  cards: string[],
  request: string,
): FellowshipEventState {
  return {
    currentQuest: request,
    questDeck: [],
    defeated: [],
    box: cards.filter((c) => c !== request),
    sets: [],
    building: { stage2: null, stage3: null },
    advancing: false,
    noCancel: null,
  };
}
/** The side, the chosen quest cards and the sets, for the scenario panels. */
export function fellowshipEventPublicState(
  s: GameState,
  q: FellowshipEventState,
  cfg: FellowshipEventCards,
) {
  const stage = cfg.stageOf(q.currentQuest);
  const chosen = [...q.defeated, ...q.questDeck, q.currentQuest];
  return {
    currentQuest: q.currentQuest,
    stage,
    side: `${stage}${s.stageRevealing ? "A" : "B"}`,
    building: !!q.building,
    stage2: chosen.find((c) => cfg.stage2.includes(c)) ?? null,
    stage3: chosen.find((c) => cfg.stage3.includes(c)) ?? null,
    sets: [...q.sets],
  };
}
/** The physical quest and boxed cards of the shared state. */
export const fellowshipEventCodes = (q: FellowshipEventState) => [
  q.currentQuest,
  ...q.questDeck,
  ...q.defeated,
  ...q.box,
];
export function validFellowshipEvent(
  s: GameState,
  q: FellowshipEventState,
  cfg: FellowshipEventCards,
  known: (c: string) => boolean,
) {
  const codes = (v: unknown) =>
    Array.isArray(v) && v.every((c) => typeof c === "string" && known(c));
  return (
    known(q.currentQuest) &&
    cfg.stageOf(q.currentQuest) > 0 &&
    s.stage === cfg.stageOf(q.currentQuest) &&
    codes(q.questDeck) &&
    codes(q.defeated) &&
    codes(q.box) &&
    Array.isArray(q.sets) &&
    q.sets.every((n) => cfg.sets.some((x) => x.number === n)) &&
    (q.building === null ||
      (typeof q.building === "object" &&
        (q.building.stage2 === null || known(q.building.stage2)) &&
        (q.building.stage3 === null || known(q.building.stage3)))) &&
    typeof q.advancing === "boolean" &&
    (q.noCancel === null || known(q.noCancel))
  );
}
