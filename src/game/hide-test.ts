// Hide X and Hide tests (The Black Riders rules insert).
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
  stats,
} from "./core";
import { exhaustCharacter } from "./board";
import { batch4Scenario } from "./batch4-scenarios";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { ownerOf, playerOrder, seatName, seatView, selectSeat } from "./table";

export interface HideTest {
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
}
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
/** The X value after modifiers (Woody End, Evil Crow). */
export function hideValue(s: GameState) {
  const test = s.hideTest;
  if (!test) return 0;
  return Math.max(
    0,
    test.value + (batch4Scenario(s).hideValueBonus?.(s, test.player) ?? 0),
  );
}
const printedThreat = (code: string) => {
  const t = card(code).threat;
  return typeof t === "number" ? t : Number(t) || 0;
};
/** Total threat of the discarded cards, with scenario additions. */
export function hideThreat(s: GameState) {
  const test = s.hideTest;
  if (!test) return 0;
  return (
    test.discarded.reduce((n, code) => n + printedThreat(code), 0) +
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

function chooseCommitment(s: GameState) {
  const test = s.hideTest;
  if (!test) return;
  selectSeat(s, test.player);
  choose(
    s,
    `Hide ${test.value} test · Commit characters`,
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
          : "Commit no characters and discard the encounter cards",
        effects: [fx("hideCommitDone", { player: test.player })],
      },
    ],
    `${s.table ? `${seatName(s, test.player)} · ` : ""}${card(test.source).name}: ${hideWillpower(s)} willpower committed. Then the top ${hideValue(s)} encounter card${hideValue(s) === 1 ? "" : "s"} are discarded; the test fails if their total threat is greater than the committed willpower.`,
  );
}
/** Begin a Hide test; the rest of the queue resumes once it resolves. */
export function beginHideTest(s: GameState, e: Effect) {
  requireRule(!s.hideTest, "Finish the current Hide test first.");
  const player = e.player ?? playerOrder(s)[0] ?? 0;
  if (s.table?.seats[player]?.eliminated) return;
  s.hideTest = {
    phase: "committing",
    player,
    value: e.value ?? 0,
    source: e.code!,
    committedIds: [],
    discarded: [],
    continuation: s.queue.splice(0),
  };
  log(
    s,
    `${card(e.code!).name}: ${s.table ? seatName(s, player) : "you"} must make a Hide ${e.value ?? 0} test.`,
    "danger",
  );
  chooseCommitment(s);
}
function discardForTest(s: GameState) {
  const test = s.hideTest!;
  const count = hideValue(s);
  for (let i = 0; i < count; i++) {
    const code = encounterDraw(s);
    if (!code) break;
    test.discarded.push(code);
  }
  s.encounterDiscard.push(...test.discarded);
  test.phase = "actions";
  selectSeat(s, test.player);
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
  const passed = willpower >= threat;
  log(
    s,
    `Hide test: ${willpower} willpower against ${threat} threat · ${passed ? "passed" : "failed"}.`,
    passed ? "good" : "danger",
  );
  delete s.hideTest;
  if (!passed) {
    s.hideFailures = [
      ...(s.hideFailures ?? []).filter((f) => f.round === s.round),
      { player: test.player, round: s.round, phase: s.phase },
    ];
  }
  const follow =
    (passed
      ? batch4Scenario(s).hidePassed?.(s, test.player, test.source)
      : batch4Scenario(s).hideFailed?.(s, test.player, test.source)) ?? [];
  prepend(s, ...follow, ...test.continuation);
}
export function hideTestEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("hide")) return false;
  switch (e.kind) {
    case "hideBegin":
      beginHideTest(s, e);
      return true;
    case "hideCommit": {
      const test = s.hideTest;
      const u = hideCandidates(s).find((c) => c.id === e.target);
      requireRule(
        test?.phase === "committing" && u,
        "Choose a ready character you control for this Hide test.",
      );
      requireRule(
        exhaustCharacter(s, u),
        "This character cannot exhaust for the Hide test.",
      );
      test.committedIds.push(u.id);
      log(s, `${name(u)} exhausts to commit to the Hide test.`);
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
        "There is no Hide test commitment to finish.",
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
    t.continuation.every(validEffect)
  );
}
export function hideTestPublic(s: GameState) {
  const t = s.hideTest;
  if (!t) return undefined;
  return {
    phase: t.phase,
    player: t.player,
    value: t.value,
    count: hideValue(s),
    source: t.source,
    committedIds: [...t.committedIds],
    discarded: [...t.discarded],
    willpower: hideWillpower(s),
    threat: hideThreat(s),
  };
}
