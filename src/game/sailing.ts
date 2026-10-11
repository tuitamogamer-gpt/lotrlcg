import { card, name } from "./cards";
import type { Effect, GameState, Unit } from "./types";
import { choose, fx, get, log, prepend, requireRule, shuffle } from "./core";
import { exhaustCharacter } from "./board";
import {
  allCharacters,
  firstPlayer,
  ownerOf,
  selectSeat,
  seatName,
} from "./table";
import {
  voyageSailingExtraCards,
  voyageSailingCancelledIcons,
} from "./voyage-belegaer";
import symbols from "../data/grey-havens-sailing-icons.json";
import { voyageCurrentQuest } from "./voyage-belegaer-support";

const printedSailingSymbols = new Map(
  symbols.cards.map((c) => [c.code, c.sailingSymbols]),
);
export const sailingSymbols = (code: string) =>
  printedSailingSymbols.get(code) ?? card(code).sailing ?? 0;

export type Heading = 0 | 1 | 2 | 3;
export interface SailingTest {
  phase: "committing" | "actions" | "results";
  player: number;
  committedIds: string[];
  continuation: Effect[];
  looked?: string[];
  successes?: number;
}
export interface SailingState {
  /** 0 is on-course; 3 is the worst possible heading. */
  heading: Heading;
  test?: SailingTest;
}

export const sailingOnCourse = (s: GameState) => s.sailing?.heading === 0;
export const sailingHeadingLabel = (heading: number) =>
  ["On-course", "Off-course · ¼", "Off-course · ½", "Off-course · ¾"][
    heading
  ] ?? "Unknown heading";

/** Positive movement goes off-course, negative movement goes on-course, one step at a time. */
export function shiftHeading(s: GameState, delta: number) {
  if (!s.sailing) return;
  const before = s.sailing.heading;
  s.sailing.heading = Math.max(0, Math.min(3, before + delta)) as Heading;
  if (s.sailing.heading !== before)
    log(
      s,
      `Heading shifts to ${sailingHeadingLabel(s.sailing.heading)}.`,
      delta < 0 ? "good" : "danger",
    );
}

export const isDreamChaser = (u: Unit) =>
  card(u.code).type_code === "ship-objective" &&
  card(u.code).name === "Dream-chaser";

/** Only the first player's characters participate, with the printed Dream-chaser exception. */
export function sailingCandidates(s: GameState) {
  const test = s.sailing?.test;
  if (!test || test.phase !== "committing") return [];
  return allCharacters(s).filter(
    (u) =>
      !u.exhausted &&
      !test.committedIds.includes(u.id) &&
      (ownerOf(s, u) === test.player || isDreamChaser(u)),
  );
}
export function sailingCommitCount(s: GameState) {
  return (s.sailing?.test?.committedIds ?? []).reduce((total, id) => {
    const u = get(s, id);
    return total + (u ? (isDreamChaser(u) ? 2 : 1) : 0);
  }, 0);
}
function chooseSailors(s: GameState) {
  const test = s.sailing?.test;
  if (!test) return;
  selectSeat(s, test.player);
  choose(
    s,
    "Sailing test · Commit characters",
    [
      ...sailingCandidates(s).map((u) => ({
        id: u.id,
        label: `Commit ${name(u)}`,
        code: u.code,
        detail: `Exhaust; look at ${isDreamChaser(u) ? 2 : 1} encounter card${isDreamChaser(u) ? "s" : ""}`,
        effects: [fx("sailingCommit", { target: u.id, player: test.player })],
      })),
      {
        id: "done",
        label: "Finish Sailing commitment",
        effects: [fx("sailingCommitDone", { player: test.player })],
      },
    ],
    `${seatName(s, test.player)} · ${sailingCommitCount(s)} cards committed. The Dream-chaser may participate under any player's control.`,
  );
}

/** Beginning the test immediately shifts the fleet off-course before commitment. */
export function beginSailingTest(s: GameState, continuation: Effect[] = []) {
  requireRule(
    s.sailing && !s.sailing.test,
    "The fleet must have a Heading card and no active Sailing test.",
  );
  shiftHeading(s, 1);
  s.sailing.test = {
    phase: "committing",
    player: firstPlayer(s),
    committedIds: [],
    continuation: [...continuation, ...s.queue.splice(0)],
  };
  chooseSailors(s);
}

/** The main quest's keyword resolves before ordinary quest commitments and side quest selection. */
export function sailingQuestStart(s: GameState, continuation: Effect[] = []) {
  const quest = voyageCurrentQuest(s);
  if (!s.sailing || !quest || !/\bSailing\b/.test(card(quest).back_text ?? ""))
    return false;
  beginSailingTest(s, continuation);
  return true;
}

/** Looked cards are never revealed and cannot trigger Surge, Doomed or When Revealed. */
export function sailingContinue(s: GameState) {
  const test = s.sailing?.test;
  requireRule(
    test?.phase === "actions",
    "Finish committing characters before resolving the Sailing test.",
  );
  selectSeat(s, test.player);
  const count = sailingCommitCount(s) + voyageSailingExtraCards(s);
  if (s.encounterDeck.length < count && s.encounterDiscard.length) {
    s.encounterDeck.push(...s.encounterDiscard.splice(0));
    shuffle(s, s.encounterDeck);
    log(
      s,
      "The encounter discard pile is shuffled into the encounter deck before the Sailing test.",
    );
  }
  test.looked = s.encounterDeck.splice(0, count);
  test.successes = Math.max(
    0,
    test.looked.reduce((sum, code) => sum + sailingSymbols(code), 0) -
      voyageSailingCancelledIcons(s),
  );
  test.phase = "results";
  const shifts = Math.min(test.successes, s.sailing!.heading);
  log(
    s,
    `Sailing test: ${test.looked.length} cards looked at; ${test.successes} uncancelled Sailing symbol${test.successes === 1 ? "" : "s"}.`,
  );
  if (!shifts) {
    finishSailing(s, 0);
    return;
  }
  choose(
    s,
    "Sailing test · Choose heading",
    Array.from({ length: shifts + 1 }, (_, value) => ({
      id: `sailing-heading-${value}`,
      label: value
        ? `Shift on-course ${value} step${value === 1 ? "" : "s"}`
        : "Keep the current heading",
      detail: sailingHeadingLabel(Math.max(0, s.sailing!.heading - value)),
      effects: [fx("sailingFinish", { value, player: test.player })],
    })),
    `${test.successes} successes; ${sailingHeadingLabel(s.sailing!.heading)}. Looked cards: ${test.looked.map((c) => card(c).name).join(", ")}.`,
  );
}
function finishSailing(s: GameState, shifts: number) {
  const test = s.sailing?.test;
  requireRule(
    test?.phase === "results",
    "There are no Sailing results to resolve.",
  );
  requireRule(
    Number.isInteger(shifts) &&
      shifts >= 0 &&
      shifts <= Math.min(test.successes ?? 0, s.sailing!.heading),
    "Choose a heading allowed by the Sailing successes.",
  );
  shiftHeading(s, -shifts);
  s.encounterDiscard.push(...(test.looked ?? []));
  delete s.sailing!.test;
  prepend(s, ...test.continuation);
}

export function sailingEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("sailing")) return false;
  switch (e.kind) {
    case "sailingBegin":
      beginSailingTest(s, e.effects ?? []);
      break;
    case "sailingShift":
      shiftHeading(s, e.value ?? 1);
      break;
    case "sailingCommit": {
      const test = s.sailing?.test;
      const u = sailingCandidates(s).find((c) => c.id === e.target);
      requireRule(
        test?.phase === "committing" && u,
        "Choose a ready character eligible for this Sailing test.",
      );
      requireRule(
        exhaustCharacter(s, u),
        "This character cannot exhaust for Sailing.",
      );
      test.committedIds.push(u.id);
      log(s, `${name(u)} commits to the Sailing test.`);
      // Actual exhaustion responses resolve before the next mandatory commitment choice.
      s.queue.push(fx("sailingChoose"));
      break;
    }
    case "sailingChoose":
      chooseSailors(s);
      break;
    case "sailingCommitDone":
      requireRule(
        s.sailing?.test?.phase === "committing",
        "There is no Sailing commitment to finish.",
      );
      s.sailing.test.phase = "actions";
      log(
        s,
        "Sailing commitment is complete. Look at the encounter cards to resolve the test; player Actions wait until the test ends.",
      );
      break;
    case "sailingFinish":
      finishSailing(s, e.value ?? 0);
      break;
    default:
      return false;
  }
  return true;
}

export function validateSailing(
  s: GameState,
  validEffect: (v: Effect) => boolean,
) {
  if (s.sailing === undefined) return s.scenarioId !== "voyage-across-belegaer";
  const fleet = s.sailing;
  if (
    s.scenarioId !== "voyage-across-belegaer" ||
    !fleet ||
    !Number.isInteger(fleet.heading) ||
    fleet.heading < 0 ||
    fleet.heading > 3
  )
    return false;
  const t = fleet.test;
  if (t === undefined) return true;
  const count = s.table?.seats.length ?? 1;
  if (
    !t ||
    s.phase !== "quest" ||
    !["committing", "actions", "results"].includes(t.phase) ||
    !Number.isInteger(t.player) ||
    t.player < 0 ||
    t.player >= count ||
    t.player !== firstPlayer(s) ||
    !Array.isArray(t.committedIds) ||
    new Set(t.committedIds).size !== t.committedIds.length ||
    !t.committedIds.every((id) => {
      const character = allCharacters(s).find((u) => u.id === id);
      return (
        typeof id === "string" &&
        character &&
        (ownerOf(s, character) === t.player || isDreamChaser(character))
      );
    }) ||
    !Array.isArray(t.continuation) ||
    !t.continuation.every(validEffect)
  )
    return false;
  if (
    t.looked !== undefined &&
    (!Array.isArray(t.looked) ||
      t.looked.some(
        (code) =>
          ![
            "enemy",
            "ship-enemy",
            "location",
            "treachery",
            "encounter-side-quest",
          ].includes(card(code).type_code),
      ))
  )
    return false;
  if (t.phase === "results")
    return (
      Array.isArray(t.looked) &&
      Number.isInteger(t.successes) &&
      t.successes! >= 0 &&
      t.looked.length <= sailingCommitCount(s) + voyageSailingExtraCards(s) &&
      t.successes! <= t.looked.reduce((n, code) => n + sailingSymbols(code), 0)
    );
  return t.looked === undefined && t.successes === undefined;
}
