import { currentQuestCode } from "./quest-state";
// Original Dead Marshes rules, including the escape-test action window.
import encounters from "../data/dead-marshes-encounter-cards.json";
import quests from "../data/dead-marshes-quest-cards.json";
import { card, name } from "./cards";
import type { Card, Effect, GameState, Unit } from "./types";
import {
  choose,
  encounterDraw,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  requireRule,
  shuffle,
  stats,
} from "./core";
import { questDefeated, check, raiseThreat, win } from "./board";
import { hasResourceIcon } from "./expansion-passives";
import {
  activeSeat,
  allActiveLocations,
  allEngaged,
  allHeroes,
  eachSeat,
  forOwner,
  livingSeats,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
  selectSeat,
} from "./table";

export const DEAD_MARSHES_ENCOUNTERS = encounters as Card[];
export const DEAD_MARSHES_QUESTS = quests as Card[];
const code = (suffix: string) =>
  `octgn:51223bd0-ffd1-11df-a976-0801205c${suffix}`;
export const DEAD = {
  wisp: code("9001"),
  fens: code("9007"),
  worm: code("9008"),
  gollum: code("9009"),
  bog: code("9010"),
  into: code("9011"),
  nightfall: code("9013"),
  capture: code("9017"),
  heart: code("9019"),
  lights: code("9020"),
  mist: code("9021"),
} as const;

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
const gollum = (s: GameState) => s.staging.find((u) => u.code === DEAD.gollum);

export function setupDeadMarshes(s: GameState) {
  s.encounterDeck = s.encounterDeck.filter((c) => c !== DEAD.gollum);
  s.staging.push(make(s, DEAD.gollum));
  shuffle(s, s.encounterDeck);
  prepend(s, ...playerOrder(s).map((player) => fx("reveal", { player })));
  log(
    s,
    "Gollum enters staging. Reveal one encounter per player before beginning the hunt.",
    "chapter",
  );
}

export function deadMarshesCheck(s: GameState) {
  if (s.escapeTest?.source === DEAD.gollum)
    s.escapeTest.count = livingSeats(s).length;
  if (s.escapeTest?.capture) s.escapeTest.count = gollum(s)?.resources ?? 0;
  const objective = gollum(s);
  if (!objective || objective.resources < 8) return;
  s.staging = s.staging.filter((u) => u.id !== objective.id);
  for (const u of [...s.staging, ...allEngaged(s), ...allActiveLocations(s)])
    if (u.guarding === objective.id) delete u.guarding;
  s.encounterDeck.push(objective.code);
  shuffle(s, s.encounterDeck);
  log(
    s,
    "Gollum reaches eight resource tokens and escapes into the encounter deck. His tokens are removed.",
    "danger",
  );
}
export function deadMarshesAddResources(s: GameState, amount: number) {
  const objective = gollum(s);
  if (!objective) return;
  objective.resources += amount;
  log(
    s,
    `Gollum gains ${amount} resource token${amount === 1 ? "" : "s"} (${objective.resources}/8).`,
    "danger",
  );
  deadMarshesCheck(s);
}
function resetQuest(s: GameState) {
  s.stage = 1;
  s.progress = 0;
  s.stageRevealing = false;
  log(
    s,
    "Gollum was not captured. Reset the quest to stage 1B; the active location and all other cards remain unchanged.",
    "danger",
  );
}
export function advanceDeadMarshes(s: GameState) {
  if (s.scenarioId !== "dead-marshes") return false;
  if (
    s.status !== "playing" ||
    s.phase === "setup" ||
    s.stageRevealing ||
    s.escapeTest ||
    s.choice ||
    s.queue.length
  )
    return true;
  if (s.stage === 1 && s.progress >= 12) {
    if (questDefeated(s, currentQuestCode(s)!)) return true;
    s.stage = 2;
    s.progress = 0;
    log(
      s,
      "The Capture: defeat this stage to attempt Gollum's final escape test.",
      "chapter",
    );
  } else if (s.stage === 2 && s.progress >= 3) {
    s.stageRevealing = true;
    prepend(s, fx("deadChooseCapturer", { player: s.table?.first ?? 0 }));
  }
  return true;
}

/** This preserves the action window between quest resolution and the end-phase Forced test. */
export function deadMarshesQuestEnd(s: GameState) {
  if (s.scenarioId !== "dead-marshes" || !gollum(s)) return false;
  prepend(
    s,
    fx("deadBeginEscape", {
      code: DEAD.gollum,
      count: livingSeats(s).length,
      flag: true,
    }),
    fx("finishQuestPhase", { flag: true }),
  );
  return true;
}
export function deadMarshesRoundEnd(s: GameState) {
  for (const worm of [...s.staging, ...allEngaged(s)].filter(
    (u) => u.code === DEAD.worm,
  ))
    worm.damage = Math.max(0, worm.damage - 2);
}
export function deadMarshesTravel(s: GameState, location: Unit) {
  if (location.code === DEAD.fens) deadMarshesAddResources(s, 1);
}

export function deadMarshesEscapeCandidates(
  s: GameState,
  player = s.escapeTest?.participants[s.escapeTest.cursor] ?? activeSeat(s),
) {
  const selected = s.escapeTest?.committedIds ?? [];
  const p = seatView(s, player);
  return [...p.heroes, ...p.allies].filter(
    (u) => !u.exhausted && !selected.includes(u.id),
  );
}
export function deadMarshesEscapeStrength(s: GameState) {
  return (s.escapeTest?.committedIds ?? []).reduce((total, id) => {
    const u = get(s, id);
    return (
      total + (u ? stats(s, u)[s.escapeTest?.attack ? "attack" : "will"] : 0)
    );
  }, 0);
}
function chooseCommitment(s: GameState) {
  const escape = s.escapeTest;
  if (!escape) return;
  const player = escape.participants[escape.cursor];
  if (!livingSeats(s).includes(player)) {
    finishCommitment(s);
    return;
  }
  selectSeat(s, player);
  choose(
    s,
    `Escape test · Commit ${escape.attack ? "attack" : "willpower"}`,
    [
      ...opts(
        deadMarshesEscapeCandidates(s, player),
        (u) => [fx("deadEscapeCommit", { target: u.id, player })],
        (u) =>
          `Exhaust to contribute ${stats(s, u)[escape.attack ? "attack" : "will"]}`,
      ),
      {
        id: "done",
        label: "Finish this player's escape commitment",
        effects: [fx("deadEscapeCommitDone", { player })],
      },
    ],
    `${seatName(s, player)} · ${deadMarshesEscapeStrength(s)} strength committed so far. Cards are dealt after the action window.`,
  );
}
function finishCommitment(s: GameState) {
  const escape = s.escapeTest;
  if (!escape) return;
  escape.cursor++;
  if (escape.cursor < escape.participants.length) {
    chooseCommitment(s);
    return;
  }
  escape.phase = "actions";
  selectSeat(s, s.table?.first ?? escape.participants[0]);
  log(
    s,
    `Escape commitment finished: ${deadMarshesEscapeStrength(s)} ${escape.attack ? "attack" : "willpower"}. Use actions or events, then resolve the test.`,
  );
}
function beginEscape(s: GameState, e: Effect) {
  requireRule(
    !s.escapeTest,
    "Finish the current escape test before starting another.",
  );
  const source = e.code!,
    party = source === DEAD.gollum;
  if (source === DEAD.lights && !livingSeats(s).includes(e.player ?? 0)) return;
  s.escapeTest = {
    phase: e.flag ? "preparing" : "committing",
    source,
    participants: party ? playerOrder(s) : [e.player ?? s.table?.first ?? 0],
    cursor: 0,
    committedIds: [],
    count: e.count ?? 0,
    attack: source === DEAD.mist,
    capture: source === DEAD.capture,
    continuation: s.queue.splice(0),
  };
  if (s.escapeTest.phase === "committing") chooseCommitment(s);
  else
    log(
      s,
      "The quest is resolved. Use end-of-quest actions, then choose characters for Gollum's escape test.",
    );
}

/** Called by the explicit RESOLVE_ESCAPE action: prepare commitments, or deal/resolve. */
export function deadMarshesContinueEscape(s: GameState) {
  const escape = s.escapeTest;
  requireRule(
    escape && !s.choice && !s.queue.length,
    "Finish the current escape choice or card effect first.",
  );
  if (escape.phase === "preparing") {
    escape.phase = "committing";
    chooseCommitment(s);
    return;
  }
  requireRule(
    escape.phase === "actions",
    "Finish committing characters before dealing escape cards.",
  );
  const strength = deadMarshesEscapeStrength(s),
    dealt: string[] = [];
  // The per-player or per-token amount is evaluated when cards are dealt,
  // after the explicit action window, rather than retaining an eliminated seat.
  if (escape.source === DEAD.gollum) escape.count = livingSeats(s).length;
  else if (escape.capture) escape.count = gollum(s)?.resources ?? 0;
  for (let i = 0; i < escape.count; i++) {
    const c = encounterDraw(s);
    if (c) dealt.push(c);
  }
  const heart = allActiveLocations(s).filter(
    (u) => u.code === DEAD.heart,
  ).length;
  const difficulty = dealt.reduce(
    (total, c) =>
      total +
      (Number(/Escape:\s*(\d+)/i.exec(card(c).text ?? "")?.[1]) || 0) +
      heart,
    0,
  );
  const passed = strength > difficulty;
  log(
    s,
    `Escape test: ${strength} ${escape.attack ? "attack" : "willpower"} against ${difficulty} Escape from ${dealt.length} card${dealt.length === 1 ? "" : "s"} · ${passed ? "passed" : "failed"}.`,
    passed ? "good" : "danger",
  );
  delete s.escapeTest;
  if (escape.capture) {
    s.stageRevealing = false;
    if (passed && gollum(s)) {
      s.encounterDiscard.push(...dealt);
      win(s);
      return;
    }
    resetQuest(s);
  } else if (!passed) {
    if (escape.source === DEAD.gollum) deadMarshesAddResources(s, 2);
    else {
      deadMarshesAddResources(s, 1);
      if (escape.source === DEAD.lights)
        forOwner(s, escape.participants[0], () => {
          raiseThreat(s, 1, "encounter");
        });
      else
        eachSeat(s, () => {
          raiseThreat(s, escape.source === DEAD.nightfall ? 2 : 1, "encounter");
        });
    }
  }
  s.encounterDiscard.push(...dealt);
  s.queue.push(...escape.continuation);
  check(s);
}

export function deadMarshesEncounter(s: GameState, encounterCode: string) {
  switch (encounterCode) {
    case DEAD.bog:
      deadMarshesAddResources(
        s,
        s.staging.filter((u) => card(u.code).type_code === "location").length,
      );
      return true;
    case DEAD.wisp:
      if (gollum(s))
        prepend(
          s,
          fx("deadWisp", { player: s.table?.first ?? 0 }),
          fx("deadDiscardTreachery", { code: encounterCode }),
        );
      else s.encounterDiscard.push(encounterCode);
      break;
    case DEAD.nightfall:
    case DEAD.mist:
      prepend(
        s,
        fx("deadBeginEscape", {
          code: encounterCode,
          count: 2,
          player: s.table?.first ?? 0,
        }),
        fx("deadDiscardTreachery", { code: encounterCode }),
      );
      break;
    case DEAD.lights:
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("deadBeginEscape", { code: encounterCode, count: 2, player }),
        ),
        fx("deadDiscardTreachery", { code: encounterCode }),
      );
      break;
    default:
      return false;
  }
  return true;
}

export function deadMarshesEffect(s: GameState, e: Effect) {
  switch (e.kind) {
    case "deadDiscardTreachery":
      s.encounterDiscard.push(e.code!);
      break;
    case "deadWisp": {
      const heroes = allHeroes(s).filter(
        (h) => !h.exhausted && hasResourceIcon(h, "lore"),
      );
      choose(s, "A Wisp of Pale Sheen", [
        ...opts(
          heroes,
          (h) => [
            fx("exhaust", { target: h.id }),
            fx("deadResources", { value: 1 }),
          ],
          () => "Exhaust this Lore hero to place only one token",
        ),
        {
          id: "accept",
          label: "Place two resource tokens on Gollum",
          effects: [fx("deadResources", { value: 2 })],
        },
      ]);
      break;
    }
    case "deadResources":
      deadMarshesAddResources(s, e.value ?? 0);
      break;
    case "deadChooseCapturer": {
      if (!gollum(s)) {
        resetQuest(s);
        break;
      }
      selectSeat(s, s.table?.first ?? 0);
      choose(
        s,
        "The Capture · Choose the player",
        livingSeats(s).map((player) => ({
          id: `player-${player}`,
          label: seatName(s, player),
          effects: [
            fx("deadBeginEscape", {
              code: DEAD.capture,
              count: gollum(s)!.resources,
              player,
            }),
          ],
        })),
        "Only the selected player can commit characters to the final escape test.",
      );
      break;
    }
    case "deadBeginEscape":
      beginEscape(s, e);
      break;
    case "deadEscapeCommit": {
      const escape = s.escapeTest;
      requireRule(
        escape?.phase === "committing",
        "This escape test is not accepting characters.",
      );
      const player = escape.participants[escape.cursor];
      const u = deadMarshesEscapeCandidates(s, player).find(
        (u) => u.id === e.target,
      );
      requireRule(
        u && ownerOf(s, u) === player,
        "Choose a ready character controlled by this player.",
      );
      u.exhausted = true;
      escape.committedIds.push(u.id);
      log(s, `${name(u)} exhausts for the escape test.`);
      chooseCommitment(s);
      break;
    }
    case "deadEscapeCommitDone":
      finishCommitment(s);
      break;
    default:
      return false;
  }
  return true;
}
