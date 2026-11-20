// Hide X and Hide tests (The Black Riders rules insert), and Fortitude tests
// (The Mountain of Fire rules insert), which follow the same steps: commit,
// discard encounter cards, an action window, then the result.
import type { Effect, GameState, Unit } from "./types";
import { card, name } from "./cards";
import {
  choose,
  encounterDraw,
  fx,
  get,
  log,
  prepend,
  requireRule,
  shuffle,
  stats,
} from "./core";
import { exhaustCharacter } from "./board";
import { batch4Scenario } from "./batch4-scenarios";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { ownerOf, playerOrder, seatName, seatView, selectSeat } from "./table";

export interface HideTest {
  /**
   * A Fortitude test: the player exhausts heroes to commit them, discards the
   * top X encounter cards (X is the tens digit of his threat dial) and passes
   * if the committed willpower is greater than their Sauron's Eye icons.
   */
  kind?: "fortitude";
  phase: "committing" | "actions";
  /** The player making the test. */
  player: number;
  /** The Hide X value before modifiers. */
  value: number;
  /** The card that called for the test. */
  source: string;
  committedIds: string[];
  /** Cards discarded from the encounter deck after committing. */
  discarded: string[];
  continuation: Effect[];
  /** Fortitude: extra encounter cards to discard (The Crack of Doom). */
  extra?: number;
  /** Fortitude: the index of the discarded card whose icons are ignored (Gollum). */
  ignored?: number;
  /**
   * The test's own consequence of failing ("If the engaged player fails the
   * hide test, ..."), resolved before the Forced effects a failed Hide test
   * triggers.
   */
  onFail?: Effect[];
}
export const isFortitude = (test: HideTest | undefined) =>
  test?.kind === "fortitude";
/** "Hide 2 test" or "Fortitude test". */
export const hideTestName = (test: HideTest) =>
  isFortitude(test) ? "Fortitude test" : `Hide ${test.value} test`;
/** The printed Sauron's Eye icons of an encounter card. */
export const sauronEyes = (code: string) => card(code).sauron_eyes ?? 0;
/** A failed Hide test, remembered for "this phase" and "this round" effects. */
export interface HideFailure {
  player: number;
  round: number;
  phase: string;
}

/** The printed Hide X keyword of an encounter card. */
export function hideKeyword(code: string) {
  const m = /(?:^|[\s.])Hide (\d+)\./.exec(card(code).text ?? "");
  return m ? Number(m[1]) : 0;
}
const ready = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
export function hideCandidates(s: GameState) {
  const test = s.hideTest;
  if (!test || test.phase !== "committing") return [];
  const p = seatView(s, test.player);
  // A Fortitude test takes only heroes.
  if (isFortitude(test))
    return p.heroes.filter(
      (u) =>
        ready(u) &&
        !test.committedIds.includes(u.id) &&
        !batch4Scenario(s).fortitudeCommitBlocked?.(s, u),
    );
  // A limit on the characters committed (A Shadow of the Past's Nightmare Stock Woods).
  const limit = batch4Scenario(s).hideCommitLimit?.(s, test.player);
  if (limit !== undefined && test.committedIds.length >= limit) return [];
  return [...p.heroes, ...p.allies].filter(
    (u) => ready(u) && !test.committedIds.includes(u.id),
  );
}
/** Each committed character's current willpower, with scenario bonuses. */
export function hideWillpower(s: GameState) {
  const test = s.hideTest;
  if (!test) return 0;
  return test.committedIds.reduce((total, id) => {
    const u = get(s, id);
    return (
      total +
      (u
        ? Math.max(
            0,
            stats(s, u).will + (batch4Scenario(s).hideWillpower?.(s, u) ?? 0),
          )
        : 0)
    );
  }, 0);
}
/**
 * The number of encounter cards to discard: Hide X after modifiers (Woody
 * End, Evil Crow); for a Fortitude test, the tens digit of the player's
 * threat dial and any extra cards.
 */
export function hideValue(s: GameState) {
  const test = s.hideTest;
  if (!test) return 0;
  if (isFortitude(test))
    return (
      (Math.floor(seatView(s, test.player).threat / 10) % 10) +
      (test.extra ?? 0)
    );
  return Math.max(
    0,
    test.value + (batch4Scenario(s).hideValueBonus?.(s, test.player) ?? 0),
  );
}
const printedThreat = (code: string) => {
  const t = card(code).threat;
  return typeof t === "number" ? t : Number(t) || 0;
};
/**
 * Total threat of the discarded cards, with scenario additions; for a
 * Fortitude test, their Sauron's Eye icons with the scenario's additions.
 */
export function hideThreat(s: GameState) {
  const test = s.hideTest;
  if (!test) return 0;
  return (
    test.discarded.reduce(
      (n, code, i) =>
        n +
        (isFortitude(test)
          ? i === test.ignored
            ? 0
            : sauronEyes(code)
          : printedThreat(code)),
      0,
    ) +
    (test.phase === "actions"
      ? (batch4Scenario(s).hideThreatBonus?.(s, test.player) ?? 0)
      : 0)
  );
}
export const hideFailed = (
  s: GameState,
  player: number,
  scope: "phase" | "round",
) =>
  (s.hideFailures ?? []).some(
    (f) =>
      f.player === player &&
      f.round === s.round &&
      (scope === "round" || f.phase === s.phase),
  );

/** " (at most 2 characters)" while a card limits the characters committed. */
function limitNote(s: GameState) {
  const test = s.hideTest;
  if (!test || isFortitude(test)) return "";
  const limit = batch4Scenario(s).hideCommitLimit?.(s, test.player);
  return limit === undefined
    ? ""
    : ` (at most ${limit} ${limit === 1 ? "character" : "characters"})`;
}
function chooseCommitment(s: GameState) {
  const test = s.hideTest;
  if (!test) return;
  selectSeat(s, test.player);
  const fortitude = isFortitude(test);
  choose(
    s,
    `${hideTestName(test)} · Commit ${fortitude ? "heroes" : "characters"}`,
    [
      ...hideCandidates(s).map((u) => ({
        id: u.id,
        code: u.code,
        label: `Exhaust ${name(u)} to commit ${Math.max(0, stats(s, u).will + (batch4Scenario(s).hideWillpower?.(s, u) ?? 0))} willpower`,
        effects: [fx("hideCommit", { target: u.id, player: test.player })],
      })),
      {
        id: "done",
        label: test.committedIds.length
          ? "Finish committing and discard the encounter cards"
          : `Commit no ${fortitude ? "heroes" : "characters"} and discard the encounter cards`,
        effects: [fx("hideCommitDone", { player: test.player })],
      },
    ],
    `${s.table ? `${seatName(s, test.player)} · ` : ""}${card(test.source).name}: ${hideWillpower(s)} willpower committed${limitNote(s)}. Then the top ${hideValue(s)} encounter card${hideValue(s) === 1 ? "" : "s"} are discarded; ${fortitude ? "the test fails unless the committed willpower is greater than their Sauron's Eye icons" : "the test fails if their total threat is greater than the committed willpower"}.`,
  );
}
/** Begin a Hide test; the rest of the queue resumes once it resolves. */
export function beginHideTest(s: GameState, e: Effect, fortitude = false) {
  requireRule(!s.hideTest, "Finish the current test first.");
  const player = e.player ?? playerOrder(s)[0] ?? 0;
  if (s.table?.seats[player]?.eliminated) return;
  s.hideTest = {
    ...(fortitude ? { kind: "fortitude" as const } : {}),
    phase: "committing",
    player,
    value: fortitude ? 0 : (e.value ?? 0),
    source: e.code!,
    committedIds: [],
    discarded: [],
    continuation: s.queue.splice(0),
    ...(fortitude && e.count ? { extra: e.count } : {}),
    ...(!fortitude && e.effects?.length ? { onFail: [...e.effects] } : {}),
  };
  log(
    s,
    `${card(e.code!).name}: ${s.table ? seatName(s, player) : "you"} must make a ${hideTestName(s.hideTest)}.`,
    "danger",
  );
  chooseCommitment(s);
}
function discardForTest(s: GameState) {
  const test = s.hideTest!;
  const count = hideValue(s);
  for (let i = 0; i < count; i++) {
    // "If the encounter deck is ever empty during a Fortitude test, shuffle
    // the encounter discard pile into the encounter deck", in any phase.
    if (
      isFortitude(test) &&
      !s.encounterDeck.length &&
      s.encounterDiscard.length
    ) {
      s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
      log(s, "The encounter discard pile is shuffled back into its deck.");
    }
    const code = encounterDraw(s);
    if (!code) break;
    test.discarded.push(code);
  }
  s.encounterDiscard.push(...test.discarded);
  test.phase = "actions";
  selectSeat(s, test.player);
  if (isFortitude(test)) {
    log(
      s,
      `Fortitude test: ${test.discarded.length ? test.discarded.map((c) => `${card(c).name} (${sauronEyes(c)})`).join(", ") : "no cards"} discarded · ${hideThreat(s)} Sauron's Eye icon${hideThreat(s) === 1 ? "" : "s"} against ${hideWillpower(s)} willpower. Use actions, then resolve the test.`,
    );
    // Gollum discarded during the test (Mount Doom).
    batch4Scenario(s).fortitudeDiscarded?.(s);
    return;
  }
  log(
    s,
    `Hide test: ${test.discarded.length ? test.discarded.map((c) => `${card(c).name} (${printedThreat(c)})`).join(", ") : "no cards"} discarded · ${hideThreat(s)} threat against ${hideWillpower(s)} willpower. Use actions, then resolve the test.`,
  );
}
/** Called by the explicit RESOLVE_HIDE action after the action window. */
export function resolveHideTest(s: GameState) {
  const test = s.hideTest;
  requireRule(
    test && test.phase === "actions" && !s.choice && !s.queue.length,
    "Finish committing characters and resolve the current effect first.",
  );
  const willpower = hideWillpower(s),
    threat = hideThreat(s);
  const fortitude = isFortitude(test);
  // A Fortitude test needs more willpower than Sauron's Eye icons.
  const passed = fortitude ? willpower > threat : willpower >= threat;
  log(
    s,
    fortitude
      ? `Fortitude test: ${willpower} willpower against ${threat} Sauron's Eye icon${threat === 1 ? "" : "s"} · ${passed ? "passed" : "failed"}.`
      : `Hide test: ${willpower} willpower against ${threat} threat · ${passed ? "passed" : "failed"}.`,
    passed ? "good" : "danger",
  );
  delete s.hideTest;
  if (!passed && !fortitude) {
    s.hideFailures = [
      ...(s.hideFailures ?? []).filter((f) => f.round === s.round),
      { player: test.player, round: s.round, phase: s.phase },
    ];
  }
  const follow =
    (passed
      ? batch4Scenario(s).hidePassed?.(s, test.player, test.source)
      : batch4Scenario(s).hideFailed?.(s, test.player, test.source)) ?? [];
  prepend(
    s,
    ...(!passed && test.onFail ? test.onFail : []),
    ...follow,
    ...test.continuation,
  );
}
export function hideTestEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("hide")) return false;
  switch (e.kind) {
    case "hideBegin":
      beginHideTest(s, e);
      return true;
    case "hideFortitude":
      beginHideTest(s, e, true);
      return true;
    case "hideCommit": {
      const test = s.hideTest;
      const u = hideCandidates(s).find((c) => c.id === e.target);
      requireRule(
        test?.phase === "committing" && u,
        `Choose a ready ${isFortitude(test) ? "hero" : "character"} you control for this test.`,
      );
      requireRule(
        exhaustCharacter(s, u),
        "This character cannot exhaust for the test.",
      );
      test.committedIds.push(u.id);
      log(s, `${name(u)} exhausts to commit to the ${hideTestName(test)}.`);
      // Exhaustion responses resolve before the next commitment choice.
      s.queue.push(fx("hideChoose", { player: test.player }));
      return true;
    }
    case "hideChoose":
      chooseCommitment(s);
      return true;
    case "hideCommitDone":
      requireRule(
        s.hideTest?.phase === "committing",
        "There is no test commitment to finish.",
      );
      discardForTest(s);
      return true;
    default:
      return false;
  }
}
export function validateHideTest(
  s: GameState,
  validEffect: (e: Effect) => boolean,
) {
  const failures = s.hideFailures;
  if (
    failures !== undefined &&
    (!Array.isArray(failures) ||
      !failures.every(
        (f) =>
          f &&
          Number.isInteger(f.player) &&
          f.player >= 0 &&
          f.player < (s.table?.seats.length ?? 1) &&
          Number.isInteger(f.round) &&
          f.round >= 0 &&
          f.round <= s.round &&
          typeof f.phase === "string",
      ))
  )
    return false;
  const t = s.hideTest;
  if (t === undefined) return true;
  const seats = s.table?.seats.length ?? 1;
  return (
    !!t &&
    (t.kind === undefined || t.kind === "fortitude") &&
    (t.extra === undefined ||
      (t.kind === "fortitude" &&
        Number.isInteger(t.extra) &&
        t.extra > 0 &&
        t.extra <= 10)) &&
    (t.ignored === undefined ||
      (t.kind === "fortitude" &&
        Number.isInteger(t.ignored) &&
        t.ignored >= 0 &&
        Array.isArray(t.discarded) &&
        t.ignored < t.discarded.length)) &&
    ["committing", "actions"].includes(t.phase) &&
    Number.isInteger(t.player) &&
    t.player >= 0 &&
    t.player < seats &&
    Number.isInteger(t.value) &&
    t.value >= 0 &&
    t.value <= 10 &&
    typeof t.source === "string" &&
    !!card(t.source) &&
    Array.isArray(t.committedIds) &&
    new Set(t.committedIds).size === t.committedIds.length &&
    t.committedIds.every((id) => {
      const u = get(s, id);
      // A committed character may leave play during the action window.
      return typeof id === "string" && (!u || ownerOf(s, u) === t.player);
    }) &&
    Array.isArray(t.discarded) &&
    t.discarded.every((c) => typeof c === "string" && !!card(c)) &&
    (t.phase === "actions" || t.discarded.length === 0) &&
    Array.isArray(t.continuation) &&
    t.continuation.every(validEffect) &&
    (t.onFail === undefined ||
      (t.kind === undefined &&
        Array.isArray(t.onFail) &&
        t.onFail.every(validEffect)))
  );
}
export function hideTestPublic(s: GameState) {
  const t = s.hideTest;
  if (!t) return undefined;
  return {
    kind: t.kind ?? ("hide" as const),
    name: hideTestName(t),
    phase: t.phase,
    player: t.player,
    value: t.value,
    count: hideValue(s),
    source: t.source,
    committedIds: [...t.committedIds],
    discarded: [...t.discarded],
    ...(t.ignored !== undefined ? { ignored: t.ignored } : {}),
    willpower: hideWillpower(s),
    threat: hideThreat(s),
  };
}
