import test from "node:test";
import assert from "node:assert/strict";
import { STARTERS } from "../src/game/cards";
import {
  applyAction as act,
  createGame,
  restoreSave,
  validateSave,
  publicState,
} from "../src/game/engine";
import { startGuided } from "../src/game/presentation";
import { eachSeat, syncSeat, seatView } from "../src/game/table";
import type { GameState, Unit } from "../src/game/types";
const seats = [
  { hero: "01001", deckId: "leadership" },
  { hero: "01007", deckId: "spirit" },
  { hero: "01005", deckId: "tactics" },
];
const next = (s: GameState) =>
  act(s, { type: "CONTINUE", stepId: s.flow!.pending!.id });
function drain(s: GameState) {
  for (let i = 0; s.flow?.pending && i < 200; i++) {
    assert.ok(validateSave(s), `invalid paused state: ${s.flow.pending.title}`);
    s = next(s);
  }
  assert.ok(!s.flow?.pending, "all reviews can be acknowledged");
  return s;
}
function until(s: GameState, kind: string) {
  for (let i = 0; i < 100; i++) {
    if (s.flow?.pending?.kind === kind) return s;
    assert.ok(s.flow?.pending, `expected a pause before ${kind}`);
    s = next(s);
  }
  throw Error(`did not reach ${kind}`);
}
function base(id = "leadership", hotseat = false) {
  const d = STARTERS.find((d) => d.id === id)!;
  let s = createGame(77, d.cards, d.heroes, d.id, hotseat ? { seats } : {});
  while (s.phase === "setup") s = act(s, { type: "KEEP" });
  eachSeat(s, () => {
    s.hand = [];
  });
  return startGuided(s);
}
function unit(s: GameState, code: string): Unit {
  return {
    id: `c${s.nextId++}`,
    code,
    damage: 0,
    progress: 0,
    resources: 0,
    exhausted: false,
    committed: false,
    attachments: [],
    boost: 0,
    attacked: false,
    shadows: [],
  };
}
test("guided setup is a durable pause, and a stale confirmation cannot advance twice", () => {
  const d = STARTERS[0];
  let s = createGame(77, d.cards, d.heroes, d.id, { seats, guided: true });
  assert.equal(s.flow!.pending!.kind, "setup");
  assert.equal(s.round, 0);
  assert.throws(() => act(s, { type: "KEEP" }), /Review/);
  const id = s.flow!.pending!.id;
  assert.ok(validateSave(s));
  assert.deepEqual(restoreSave(JSON.parse(JSON.stringify(s))), s);
  s = next(s);
  assert.equal(s.flow!.pending, null);
  assert.throws(() => act(s, { type: "CONTINUE", stepId: id }), /no longer/);
  for (let i = 0; i < 3; i++) s = drain(act(s, { type: "KEEP" }));
  assert.equal(s.round, 1);
  const round = s.flow!.history.find((h) => h.kind === "round")!;
  assert.equal(round.cards.filter((c) => c.label.includes("hand")).length, 3);
  assert.equal(
    round.changes.filter((c) => c.label.includes("Resources")).length,
    3,
  );
});
test("an encounter pauses before its revealed effect, then shows damage before any next card", () => {
  let s = base();
  s.phase = "quest";
  s.heroes[0].exhausted = true;
  s.encounterDeck = ["01093", "01099"];
  s = until(act(s, { type: "COMMIT" }), "reveal");
  assert.equal(s.flow!.pending!.cards[0].code, "01093");
  assert.equal(s.heroes[0].damage, 0);
  assert.equal(s.encounterDeck.length, 1);
  assert.throws(() => act(s, { type: "NEXT" }), /Review/);
  s = next(s);
  assert.equal(s.heroes[0].damage, 1);
  assert.ok(
    s.flow!.pending!.changes.some(
      (c) => c.label.includes("Damage") && c.after.startsWith("1 /"),
    ),
  );
  assert.equal(s.phase, "quest");
  s = drain(s);
  assert.equal(s.phase, "staging");
});
test("three hot-seat encounters require three separate confirmations even for identical cards", () => {
  let s = base("leadership", true);
  s.phase = "quest";
  s.table!.passed = [];
  s.encounterDeck = Array(5).fill("01099");
  for (let i = 0; i < 2; i++) s = drain(act(s, { type: "COMMIT" }));
  s = until(act(s, { type: "COMMIT" }), "reveal");
  const counts = [];
  for (let i = 0; i < 3; i++) {
    assert.equal(s.flow!.pending!.kind, "reveal");
    counts.push(s.encounterDeck.length);
    s = next(s);
    if (i < 2) s = until(s, "reveal");
  }
  assert.deepEqual(counts, [4, 3, 2]);
  s = drain(s);
  assert.equal(s.phase, "staging");
  assert.equal(s.flow!.history.filter((h) => h.kind === "reveal").length, 3);
});
test("shadow reveal, shadow modifier, damage, and next attack are separate observable steps", () => {
  let s = base();
  s.phase = "defense";
  s.staging = [];
  const enemy = unit(s, "01089");
  enemy.shadows = ["01085"];
  s.engaged = [enemy];
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: s.heroes[0].id });
  assert.equal(s.flow!.pending!.title, "Defense declared");
  assert.equal(s.heroes[0].damage, 0);
  assert.ok(!JSON.stringify(publicState(s).resolution).includes("01085"));
  s = until(s, "shadow");
  assert.equal(s.flow!.pending!.cards[0].code, "01085");
  assert.equal(s.combat!.attackBonus, 0);
  const restored = restoreSave(JSON.parse(JSON.stringify(s)))!;
  assert.ok(restored);
  s = next(restored);
  assert.equal(s.combat!.attackBonus, 1);
  assert.equal(s.heroes[0].damage, 0);
  s = next(s);
  assert.equal(s.heroes[0].damage, 1);
  assert.ok(s.flow!.pending);
  assert.equal(s.phase, "defense");
  s = drain(s);
  assert.equal(s.phase, "attack");
});
test("a player can cancel a displayed encounter after reading it", () => {
  let s = base("spirit");
  s.hand = [unit(s, "01050")];
  s.phase = "quest";
  s.heroes[0].exhausted = true;
  s.encounterDeck = ["01093", "01099"];
  s = until(act(s, { type: "COMMIT" }), "reveal");
  assert.equal(s.choice, null);
  s = next(s);
  assert.ok(s.choice);
  assert.equal(s.heroes[0].damage, 0);
  s = drain(act(s, { type: "CHOOSE", id: "cancel" }));
  assert.equal(s.heroes[0].damage, 0);
  assert.ok(s.discard.includes("01050"));
  assert.ok(s.encounterDiscard.includes("01093"));
});
test("inspecting another hero during a pause preserves the attack owner and queued damage", () => {
  let s = base("leadership", true);
  s.phase = "defense";
  s.staging = [];
  const enemy = unit(s, "01089");
  enemy.shadows = ["01085"];
  s.engaged = [enemy];
  s = until(
    act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: s.heroes[0].id }),
    "shadow",
  );
  const step = structuredClone(s.flow!.pending);
  s = act(s, { type: "SELECT_SEAT", seat: 1 });
  assert.deepEqual(s.flow!.pending, step);
  assert.equal(s.table!.active, 1);
  assert.throws(() => act(s, { type: "NEXT" }), /Review/);
  s = restoreSave(JSON.parse(JSON.stringify(s)))!;
  s = next(s);
  assert.equal(s.table!.active, 0);
  assert.equal(s.combat!.attackBonus, 1);
  s = next(s);
  assert.equal(seatView(s, 0).heroes[0].damage, 1);
  assert.equal(seatView(s, 1).heroes[0].damage, 0);
  assert.equal(seatView(s, 2).heroes[0].damage, 0);
});
test("a quest result waits before moving to travel", () => {
  let s = base();
  s.phase = "staging";
  s.staging = [];
  s.heroes[0].committed = true;
  s = act(s, { type: "NEXT" });
  assert.equal(s.phase, "staging");
  assert.equal(s.flow!.pending!.kind, "quest");
  assert.equal(s.progress, 2);
  assert.match(s.flow!.pending!.detail, /2 willpower/);
  s = drain(s);
  assert.equal(s.phase, "travel");
});
test("engagement checks pause per enemy and do not silently start combat", () => {
  let s = base();
  s.phase = "encounter";
  s.staging = [unit(s, "01089"), unit(s, "01096")];
  s.encounterDeck = Array(8).fill("01099");
  s = act(s, { type: "NEXT" });
  assert.equal(s.engaged.length, 1);
  assert.equal(s.phase, "encounter");
  assert.ok(
    s.flow!.pending!.changes.some((c) => c.after.startsWith("Engaged")),
  );
  s = next(s);
  assert.equal(s.engaged.length, 2);
  assert.equal(s.phase, "encounter");
  s = drain(s);
  assert.equal(s.phase, "defense");
  assert.ok(s.engaged.every((u) => u.shadows.length === 1));
});
test("a final result can be acknowledged after elimination and review imports reject corruption", () => {
  let s = base();
  s.phase = "staging";
  s.threat = 49;
  s.staging = [unit(s, "01076")];
  s = act(s, { type: "NEXT" });
  s = drain(s);
  assert.equal(s.status, "lost");
  assert.equal(s.flow!.pending, null);
  const bad = structuredClone(s);
  bad.flow!.history[0].kind = "unknown" as never;
  assert.equal(restoreSave(bad), null);
  const badId = structuredClone(s);
  badId.flow!.pending = { ...badId.flow!.history[0], id: 99999 };
  assert.equal(restoreSave(badId), null);
});
test("public hot-seat state never exposes facedown shadow identities", () => {
  const s = base("leadership", true);
  s.engaged = [unit(s, "01089")];
  s.engaged[0].shadows = ["01115"];
  syncSeat(s);
  const shown = publicState(s);
  assert.equal(shown.table!.seats[0].engaged[0].shadowCount, 1);
  assert.ok(!JSON.stringify(shown).includes("01115"));
});
