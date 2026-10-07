import { allActiveLocations } from "./table";
import { card } from "./cards";
import { locationQuest } from "./core";
import { activeSeat, seatIndices, seatName, seatView } from "./table";
import type {
  Action,
  Effect,
  GameState,
  ResolutionStep,
  ReviewMode,
  Unit,
} from "./types";

export const phaseLabel: Record<GameState["phase"], string> = {
  resource: "Resource actions",
  setup: "Opening hands",
  planning: "Planning",
  quest: "Commit to the quest",
  staging: "Quest resolution",
  travel: "Travel",
  encounter: "Engagement",
  defense: "Enemy attacks",
  attack: "Player attacks",
  refresh: "Refresh",
};
type Numbers = {
  will: number;
  attack: number;
  defense: number;
  health: number;
};
type SeenUnit = { code: string; zone: string; values: Record<string, string> };
export interface Observation {
  logId: number;
  round: number;
  phase: GameState["phase"];
  stage: number;
  status: GameState["status"];
  turn: number;
  first: number;
  values: Record<string, string>;
  units: Record<string, SeenUnit>;
  hands: Record<string, { code: string; owner: string }>;
}
// Only public information is observed. Deck order and facedown shadows never
// enter a review, the chronicle, or its public-state representation.
export function observe(
  s: GameState,
  getStats: (s: GameState, u: Unit) => Numbers,
  getStagingThreat: (s: GameState) => number,
  getThreat?: (s: GameState, u: Unit) => number,
): Observation {
  const values: Record<string, string> = {
    "Quest progress": String(s.progress),
    "Staging threat": String(getStagingThreat(s)),
    ...(s.bloodGondor
      ? Object.fromEntries(
          seatIndices(s).map((p) => [
            `${seatName(s, p)} · Hidden cards`,
            String(s.bloodGondor!.hidden[p]?.length ?? 0),
          ]),
        )
      : {}),
    ...(s.amonDin
      ? { "Villagers on the quest": String(s.amonDin.questVillagers) }
      : {}),
  };
  const seen: Record<string, SeenUnit> = {},
    hands: Record<string, { code: string; owner: string }> = {};
  const add = (u: Unit, zone: string) => {
    const c = card(u.code),
      stats = getStats(s, u);
    const character = c.type_code === "hero" || c.type_code === "ally";
    const enemy = c.type_code === "enemy";
    seen[u.id] = {
      code: u.code,
      zone,
      values: {
        ...(character || enemy
          ? { Damage: `${u.damage} / ${stats.health}` }
          : {}),
        ...(character
          ? {
              State: u.exhausted ? "Exhausted" : "Ready",
              Questing: u.committed ? "Yes" : "No",
              Willpower: String(stats.will),
            }
          : {}),
        ...(c.type_code === "hero" ? { Resources: String(u.resources) } : {}),
        ...(c.name === "To the Tower"
          ? { "Tower progress": `${u.progress} / 10` }
          : {}),
        ...(s.amonDin &&
        (c.type_code === "location" || c.name === "Rescued Villagers")
          ? { Villagers: String(u.resources) }
          : {}),
        ...(s.amonDin && c.name === "Dead Villagers"
          ? { "Dead villagers": String(u.damage) }
          : {}),
        ...(character || enemy
          ? { Attack: String(stats.attack), Defense: String(stats.defense) }
          : {}),
        ...(c.type_code === "location"
          ? { Progress: `${u.progress} / ${locationQuest(s, u)}` }
          : {}),
        ...((enemy || c.type_code === "location") && getThreat
          ? { Threat: String(getThreat(s, u)) }
          : {}),
        Attachments:
          u.attachments
            .map((a) =>
              a.facedown
                ? "Facedown attachment"
                : `${card(a.code).name}${a.exhausted ? " (exhausted)" : ""}${a.resourceTokens !== undefined ? ` (${a.resourceTokens} resources)` : ""}`,
            )
            .join(", ") || "None",
      },
    };
  };
  for (const i of seatIndices(s)) {
    const p = seatView(s, i),
      label = s.table ? seatName(s, i) : "Fellowship";
    values[`${label} · Threat`] = String(p.threat);
    values[`${label} · Hand`] = String(p.hand.length);
    values[`${label} · Deck`] = String(p.deck.length);
    values[`${label} · Discard`] = String(p.discard.length);
    if (s.table)
      values[`${label} · Status`] = s.table.seats[i].eliminated
        ? "Eliminated"
        : "In play";
    for (const u of [...p.heroes, ...p.allies]) add(u, label);
    for (const u of p.engaged) add(u, `Engaged with ${label}`);
    for (const u of p.hand) hands[u.id] = { code: u.code, owner: label };
  }
  for (const u of s.staging) add(u, "Staging area");
  for (const location of allActiveLocations(s))
    add(location, "Active location");
  for (const location of s.assaultOsgiliath?.controlled ?? [])
    add(
      location,
      `Controlled by ${s.table ? seatName(s, location.owner ?? 0) : "your fellowship"}`,
    );
  if (s.prisoner) add(s.prisoner, "Prisoner");
  if (s.captiveMendor) add(s.captiveMendor, "Captive");
  if (s.combat) {
    values["Enemy attack · Shadow bonus"] = String(s.combat.attackBonus);
    values["Enemy attack · Defense"] = s.combat.ignoreDefense
      ? "Ignored"
      : "Counts";
  }
  return {
    logId: s.log.at(-1)?.id ?? 0,
    round: s.round,
    phase: s.phase,
    stage: s.stage,
    status: s.status,
    turn: s.table?.turn ?? 0,
    first: s.table?.first ?? 0,
    values,
    units: seen,
    hands,
  };
}
export function startGuided(s: GameState): GameState {
  s.flow ??= { nextId: 1, pending: null, history: [] };
  return s;
}
export const REVIEW_MODES = ["all", "hidden", "decisions"] as const;
export const reviewModeLabel: Record<ReviewMode, string> = {
  all: "Every event",
  hidden: "Hidden information & losses",
  decisions: "Decisions only",
};
/** Effects that come from the encounter deck or the scenario rather than a player's own choice. */
const ENCOUNTER_EFFECTS = new Set([
  "resolveReveal",
  "placeEncounter",
  "automaticEngagement",
  "engagementRound",
  "stageRevealed",
  "capturePrisoner",
  "nazgulDiscard",
  "web",
  "webRefresh",
  "venom",
  "bats",
  "jailor",
  "findSpider",
  "fetchSpider",
  "ensureTroll",
  "encounterBottom",
  "guardObjective",
  "shuffleObjective",
  "wolfAttack",
  "wolfDefend",
  "chooseDamage",
  "chooseExhaust",
  "earnPermanent",
  "huntReveal",
  "huntAttach",
  "clueShuffle",
]);
/** Player-driven combat results that need no confirmation when only hidden information pauses. */
const OWN_ATTACKS = new Set(["resolvePlayerAttack", "quickAttack"]);
const isLoss = (c: ResolutionStep["changes"][number]) => {
  const playerCard =
    c.code &&
    ["hero", "ally", "attachment", "objective"].includes(
      card(c.code).type_code,
    );
  if (c.label.endsWith("· Damage") && playerCard)
    return Number(c.after.split(" / ")[0]) > Number(c.before.split(" / ")[0]);
  if (c.label.endsWith("· Threat")) return Number(c.after) > Number(c.before);
  return !!playerCard && c.after === "Left play";
};
/**
 * Decide whether a recorded event should stop the table. Every event is still
 * written to the chronicle; this only controls the confirmation dialog.
 */
export function wantsPause(
  mode: ReviewMode,
  step: Pick<ResolutionStep, "kind" | "changes">,
  source?: Action | Effect,
): boolean {
  if (mode === "all") return true;
  if (mode === "decisions") return false;
  const effect = source && "kind" in source ? source.kind : "";
  switch (step.kind) {
    case "reveal":
    case "shadow":
    case "setup":
    case "round":
    case "quest":
      return true;
    case "combat":
      return !OWN_ATTACKS.has(effect);
    case "effect":
      return (
        effect !== "refreshEnd" &&
        (ENCOUNTER_EFFECTS.has(effect) || step.changes.some(isLoss))
      );
    default:
      return false;
  }
}
export function pauseFor(
  s: GameState,
  step: Pick<ResolutionStep, "title" | "detail" | "kind"> &
    Partial<Pick<ResolutionStep, "cards" | "changes" | "lines">>,
  source?: Action | Effect,
) {
  if (!s.flow) return;
  const entry: ResolutionStep = {
    id: s.flow.nextId++,
    round: s.round,
    phase: s.phase,
    player: activeSeat(s),
    cards: [],
    changes: [],
    lines: [],
    ...step,
  };
  if (wantsPause(s.flow.mode ?? "all", entry, source)) s.flow.pending = entry;
  s.flow.history.push(entry);
  s.flow.history = s.flow.history.slice(-80);
}
const effectNames: Record<string, string> = {
  placeEncounter: "Encounter resolved",
  resolveReveal: "Revealed card effects",
  shadowEffect: "Shadow effect",
  enemyDamage: "Enemy attack result",
  combatDamage: "Combat damage",
  enemyDone: "Enemy attack complete",
  resolvePlayerAttack: "Player attack result",
  nextRound: "A new round begins",
  refreshEnd: "Refresh complete",
  phaseEnd: "End-of-phase effects",
  finishQuestPhase: "Quest phase complete",
  startCombat: "Combat begins",
  questReady: "Staging complete",
  commitSeat: "Quest commitment complete",
  travelDone: "Travel complete",
  capturePrisoner: "The prisoner is taken",
  draw: "Cards drawn",
  resource: "Resources changed",
  damage: "Damage dealt",
  heal: "Healing",
  ready: "Character readies",
  exhaust: "Character exhausts",
  attachBoon: "Boon attached",
  spendEvent: "Response played",
  ensureTroll: "The Hill Troll awaits",
  engage: "Enemy engagement",
  automaticEngagement: "Engagement check",
  threat: "Threat changes",
  locationProgress: "Location progress",
};
export const nextResolutionLabel = (s: GameState) => {
  if (s.choice) return "Make the next decision";
  if (s.status !== "playing") return "View the adventure result";
  const next = s.queue[0]?.kind;
  if (next === "reveal" || next === "guardObjective")
    return "Reveal the next encounter";
  if (next === "resolveReveal") return "Resolve the revealed card";
  if (next === "shadowReveal") return "Reveal the next shadow";
  if (next === "shadowResponse") return "Continue to the shadow response";
  if (next === "enemyDamage") return "Resolve combat damage";
  if (next) return effectNames[next] ?? "Resolve the next effect";
  return `Return to ${phaseLabel[s.phase].toLowerCase()}`;
};
export function recordObservation(
  s: GameState,
  before: Observation,
  after: Observation,
  source: Action | Effect,
  context?: string,
) {
  if (!s.flow) return;
  const changes: ResolutionStep["changes"] = [];
  const cards: ResolutionStep["cards"] = [];
  for (const [label, value] of Object.entries(after.values))
    if (before.values[label] !== undefined && before.values[label] !== value)
      changes.push({ label, before: before.values[label], after: value });
  for (const [id, u] of Object.entries(after.units)) {
    const previous = before.units[id];
    if (!previous) {
      changes.push({
        label: card(u.code).name,
        before: before.hands[id] ? "Hand" : "—",
        after: u.zone,
        code: u.code,
      });
      cards.push({ code: u.code, label: u.zone });
      continue;
    }
    if (previous.zone !== u.zone)
      changes.push({
        label: card(u.code).name,
        before: previous.zone,
        after: u.zone,
        code: u.code,
      });
    for (const [label, value] of Object.entries(u.values))
      if (
        previous.values[label] !== value &&
        previous.values[label] !== undefined
      )
        changes.push({
          label: `${card(u.code).name} · ${label}`,
          before: previous.values[label],
          after: value,
          code: u.code,
        });
  }
  for (const [id, u] of Object.entries(before.units))
    if (!after.units[id]) {
      changes.push({
        label: card(u.code).name,
        before: u.zone,
        after: after.hands[id] ? "Hand" : "Left play",
        code: u.code,
      });
      cards.push({ code: u.code, label: "Left play" });
    }
  for (const [id, hand] of Object.entries(after.hands))
    if (!before.hands[id])
      cards.push({ code: hand.code, label: `Added to ${hand.owner}’s hand` });
  if (before.phase !== after.phase)
    changes.push({
      label: "Phase",
      before: phaseLabel[before.phase],
      after: phaseLabel[after.phase],
    });
  if (before.stage !== after.stage)
    changes.push({
      label: "Quest stage",
      before: String(before.stage),
      after: String(after.stage),
    });
  if (s.table && before.turn !== after.turn)
    changes.push({
      label: "Acting hero",
      before: seatName(s, before.turn),
      after: seatName(s, after.turn),
    });
  if (s.table && before.first !== after.first)
    changes.push({
      label: "First player",
      before: seatName(s, before.first),
      after: seatName(s, after.first),
    });
  const lines = s.log.filter((l) => l.id > before.logId);
  if (s.flow.pending) {
    const step = s.flow.pending;
    step.changes.push(...changes);
    step.lines.push(...lines);
    // Serialize history independently from the pending reference after save restore.
    s.flow.history = s.flow.history.map((h) => (h.id === step.id ? step : h));
    return;
  }
  if (!changes.length && !lines.length) return;
  const action = "type" in source ? source.type : null;
  if (
    action === "TOGGLE_QUEST" ||
    action === "SELECT_SEAT" ||
    action === "SET_REVIEW_MODE" ||
    action === "CHOOSE"
  )
    return;
  const effect = "kind" in source ? source.kind : "";
  let title =
    context ??
    effectNames[effect] ??
    (action
      ? {
          KEEP: "Opening hand kept",
          MULLIGAN: "Your new opening hand",
          PLAY: "Card played",
          ABILITY: "Ability used",
          COMMIT: "Characters committed",
          RESOLVE_ESCAPE: "Escape test",
          DEFEND: "Defense declared",
          ATTACK: "Attack declared",
          TRAVEL: "A new path",
          ENGAGE: "Enemy engaged",
          CLAIM: "Objective claimed",
          END_ATTACKS: "Combat complete",
          NEXT: "The company continues",
          CONTINUE: "Resolution continues",
          SET_REVIEW_MODE: "Event reviews changed",
        }[action]
      : "Effect resolved");
  let kind: ResolutionStep["kind"] = effect.includes("shadow")
    ? "shadow"
    : effect.includes("Damage") || effect.includes("Attack")
      ? "combat"
      : action
        ? "action"
        : "effect";
  if (before.round !== after.round) {
    title = `Round ${s.round} · Resources and cards`;
    kind = "round";
  } else if (s.lastQuest && before.phase === "staging" && action === "NEXT") {
    title =
      s.lastQuest.net > 0
        ? "Quest successful"
        : s.lastQuest.net < 0
          ? "Quest failed"
          : "Quest stalemate";
    kind = "quest";
  } else if (before.phase !== after.phase) {
    title = `Next phase · ${phaseLabel[after.phase]}`;
    kind = "phase";
  }
  if (before.status !== after.status)
    title = s.status === "won" ? "Victory is secured" : "The fellowship falls";
  if ("code" in source && source.code)
    cards.unshift({ code: source.code, label: "Resolving" });
  if ("target" in source && source.target) {
    const u = after.units[source.target] ?? before.units[source.target];
    if (u) cards.unshift({ code: u.code, label: "Affected card" });
  }
  if (action && "id" in source) {
    const code = before.hands[source.id]?.code ?? before.units[source.id]?.code;
    if (code)
      cards.unshift({
        code,
        label: action === "PLAY" ? "Played" : "Activated",
      });
  }
  // Keep both sides of a resolved attack visible, including defeated units.
  // These are public card faces only; facedown shadows remain private.
  const participant = (id: string | undefined, label: string) => {
    if (!id) return;
    const unit = before.units[id] ?? after.units[id];
    if (unit) cards.push({ code: unit.code, label, instanceId: id });
  };
  if ("type" in source && source.type === "ATTACK") {
    source.attackerIds.forEach((id) => participant(id, "Attacker"));
    participant(source.enemyId, "Target");
  } else if ("type" in source && source.type === "DEFEND") {
    participant(source.enemyId, "Attacker");
    (
      source.defenderIds ?? (source.defenderId ? [source.defenderId] : [])
    ).forEach((id) => participant(id, "Defender"));
  } else if (effect === "resolvePlayerAttack" && "kind" in source) {
    source.ids?.forEach((id) => participant(id, "Attacker"));
    participant(source.target, "Target");
  } else if (effect === "enemyDamage" && !s.choice && s.combat) {
    participant(s.combat.enemyId, "Attacker");
    (
      s.combat.defenderIds ?? (s.combat.defenderId ? [s.combat.defenderId] : [])
    ).forEach((id) => participant(id, "Defender"));
  } else if (effect === "combatDamage" && "kind" in source) {
    participant(source.source, "Attacker");
    participant(source.target, "Defender");
  }
  for (const change of changes) {
    if (change.code && !cards.some((c) => c.code === change.code))
      cards.push({ code: change.code, label: "Affected card" });
  }
  const detail =
    kind === "quest" && s.lastQuest
      ? `${s.lastQuest.will} ${s.lastQuest.stat === "attack" ? "attack" : s.lastQuest.stat === "defense" ? "defense" : "willpower"} − ${s.lastQuest.threat} staging threat = ${Math.abs(s.lastQuest.net)} ${s.lastQuest.net < 0 ? "threat added to each player" : "progress"}.`
      : (lines.at(-1)?.text ?? "Review the changes before the game continues.");
  pauseFor(
    s,
    {
      title: title ?? "Effect resolved",
      detail,
      kind,
      changes,
      lines,
      cards: cards.filter(
        (c, i) =>
          cards.findIndex(
            (x) =>
              x.code === c.code &&
              x.label === c.label &&
              x.instanceId === c.instanceId,
          ) === i,
      ),
    },
    source,
  );
}
export function validFlow(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== "object") return false;
  const f = value as GameState["flow"];
  const text = (x: unknown) => typeof x === "string" && x.length <= 16000;
  const valid = (v: unknown): boolean => {
    if (!v || typeof v !== "object") return false;
    const r = v as ResolutionStep;
    return (
      Number.isInteger(r.id) &&
      r.id > 0 &&
      r.id < f!.nextId &&
      [
        "reveal",
        "shadow",
        "effect",
        "quest",
        "combat",
        "round",
        "phase",
        "action",
        "setup",
      ].includes(r.kind) &&
      text(r.title) &&
      text(r.detail) &&
      Number.isInteger(r.round) &&
      r.round >= 0 &&
      Object.hasOwn(phaseLabel, r.phase) &&
      Number.isInteger(r.player) &&
      r.player >= 0 &&
      r.player < 4 &&
      Array.isArray(r.cards) &&
      r.cards.length <= 500 &&
      r.cards.every(
        (c) =>
          text(c.code) &&
          !!card(c.code).code &&
          text(c.label) &&
          (c.instanceId === undefined || text(c.instanceId)),
      ) &&
      Array.isArray(r.changes) &&
      r.changes.length <= 2000 &&
      r.changes.every(
        (c) =>
          text(c.label) &&
          text(c.before) &&
          text(c.after) &&
          (c.code === undefined || (text(c.code) && !!card(c.code).code)),
      ) &&
      Array.isArray(r.lines) &&
      r.lines.length <= 250 &&
      r.lines.every(
        (l) =>
          text(l.text) &&
          Number.isInteger(l.id) &&
          Number.isInteger(l.round) &&
          ["normal", "good", "danger", "chapter"].includes(l.kind),
      )
    );
  };
  return (
    !!f &&
    Number.isInteger(f.nextId) &&
    f.nextId > 0 &&
    (f.mode === undefined || REVIEW_MODES.includes(f.mode)) &&
    Array.isArray(f.history) &&
    f.history.length <= 80 &&
    f.history.every(valid) &&
    new Set(f.history.map((h) => h.id)).size === f.history.length &&
    (f.pending === null ||
      (valid(f.pending) && f.history.some((h) => h.id === f.pending!.id)))
  );
}
