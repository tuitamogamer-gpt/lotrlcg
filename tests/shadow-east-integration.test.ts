import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  applyAction,
  restoreSave,
  validateSave,
  publicState,
} from "../src/game/engine";
import { DECK } from "../src/game/cards";
import { check, damage, discardAttachment } from "../src/game/board";
import { make, restrictAttachments, fx, get } from "../src/game/core";
import { handle, flush } from "../src/game/effects";
import { finalRingEvent } from "../src/game/ring-maker-final-player";
import {
  defendersFor,
  forOwner,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import { threatElimination } from "../src/game/threat-elimination";
import { shadowEastPlayerScenarioProblem } from "../src/game/deck-setup";
import {
  SHADOW_EAST_PLAYER as P,
  shadowEastRing,
} from "../src/game/shadow-east-player-support";
import { fixture, ring, pick, settle } from "./shadow-east-player-fixtures";
import { base as dorwinion } from "./danger-dorwinion-fixtures";
import { base as temple } from "./temple-doom-fixtures";
import { DANGER_DORWINION as D } from "../src/game/danger-dorwinion-support";
import { TEMPLE_DOOM as T } from "../src/game/temple-doom-support";
import type { GameState, ScenarioId } from "../src/game/types";

function saved(s: GameState) {
  syncSeat(s);
  const raw = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(raw), "the actual suspended state is restorable");
  return restoreSave(raw)!;
}

for (const scenarioId of [
  "mirkwood",
  "trouble-in-tharbad",
  "the-river-running",
  "danger-in-dorwinion",
  "temple-of-doom",
] as ScenarioId[]) {
  test(`Ring setup in ${scenarioId} saves before the scenario and opening hand exist`, () => {
    let s = createGame(
      2468,
      { ...DECK, [P.ring]: 1, [P.master]: 1 },
      [P.frodo, "01004", "01012"],
      "custom",
      { scenarioId },
    );
    assert.equal(s.setupPending, true);
    assert.equal(s.hand.length, 0);
    assert.match(s.choice!.title, /bearer/);
    assert.ok(s.queue.some((e) => e.kind === "gameSetupContinue"));
    s = saved(s);
    s = pick(s, s.heroes[0].id);
    s = settle(s);
    assert.equal(s.setupPending, undefined);
    assert.ok(shadowEastRing(s));
    assert.ok(s.hand.some((u) => u.code === P.master));
    saved(s);
  });
}

test("One Ring's searched physical Master survives the six-card mulligan", () => {
  let s = createGame(
    77,
    { ...DECK, [P.ring]: 1, [P.master]: 1 },
    [P.frodo, "01004", "01012"],
    "custom",
  );
  s = pick(s, s.heroes[0].id);
  s = pick(s, s.choice!.options.find((o) => o.code === P.master)!.id);
  const master = s.hand.find((u) => u.code === P.master)!;
  assert.equal(s.hand.length, 7);
  s = applyAction(saved(s), { type: "MULLIGAN" });
  assert.equal(s.hand.length, 7);
  assert.ok(s.hand.some((u) => u.id === master.id && u.code === P.master));
  assert.ok(!s.deck.includes(P.ring));
  saved(s);
});

test("Ring and Sauron Worship compose their actual controller's elimination threshold", () => {
  const s = dorwinion(2);
  s.staging = s.staging.filter((u) => u.code !== D.worship);
  const plot = make(s, D.worship);
  plot.damage = 4;
  s.staging.push(plot);
  ring(s, 1);
  assert.equal(threatElimination(s, 0), 46);
  assert.equal(threatElimination(s, 1), 41);
  forOwner(s, 1, () => {
    s.threat = 41;
  });
  check(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /One Ring/);
});

test("The Tower and One Ring reduce the limit independently of the active seat", () => {
  const s = temple(2);
  s.staging.push(make(s, T.tower));
  ring(s, 1);
  assert.equal(threatElimination(s, 0), 45);
  assert.equal(threatElimination(s, 1), 40);
  forOwner(s, 1, () => {
    assert.equal(threatElimination(s), 40);
    assert.equal(threatElimination(s, 0), 45);
  });
});

test("the restricted-attachment framework can discard the Ring and loses the game", () => {
  let s = fixture();
  const host = ring(s),
    oneRing = host.attachments[0];
  for (const code of ["01040", "01041"])
    host.attachments.push({ id: `a${s.nextId++}`, code, exhausted: false });
  discardAttachment(s, host, oneRing);
  assert.ok(
    host.attachments.some((a) => a.id === oneRing.id),
    "ordinary non-Master effects cannot discard it",
  );
  restrictAttachments(s, host);
  assert.ok(s.choice?.options.some((o) => o.id === oneRing.id));
  s = pick(s, oneRing.id);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /One Ring/);
});

test("a flipped sole Sméagol keeps its owner alive but is immune to ordinary card damage", () => {
  const s = fixture(2);
  forOwner(s, 1, () => {
    s.heroes = [];
    s.startingHeroes = [P.smeagol];
  });
  const gollum = make(s, P.gollum);
  gollum.owner = 1;
  s.engaged.push(gollum);
  s.shadowEastPlayers = {
    contracts: [],
    pendingRings: [],
    smeagol: { id: gollum.id, owner: 1, stinkersAdded: true },
  };
  check(s);
  assert.equal(s.status, "playing");
  assert.equal(s.table!.seats[1].eliminated, false);
  assert.equal(damage(s, gollum.id, 1), false);
  assert.equal(gollum.damage, 0);
  saved(s);
});

test("Sméagol's original scenario restriction excludes the cycle but permits Core quests", () => {
  assert.match(
    shadowEastPlayerScenarioProblem("dead-marshes", [P.smeagol])!,
    /Shadows of Mirkwood/,
  );
  assert.equal(shadowEastPlayerScenarioProblem("mirkwood", [P.smeagol]), null);
  assert.throws(
    () =>
      createGame(1, DECK, [P.smeagol], "custom", {
        scenarioId: "return-to-mirkwood",
      }),
    /Shadows of Mirkwood/,
  );
});

test("saved early setup cannot bypass scenario validation without its continuation", () => {
  const s = createGame(
    111,
    { ...DECK, [P.ring]: 1 },
    [P.frodo, "01004", "01012"],
    "custom",
    { scenarioId: "temple-of-doom" },
  );
  assert.ok(validateSave(s));
  s.queue = [];
  assert.equal(validateSave(s), false);
});

test("Black Númenórean's unknown shadows do not disclose their text through Destrier choices", () => {
  const views: unknown[] = [];
  for (const code of ["01085", "01099"]) {
    let s = dorwinion();
    const hero = s.heroes[0],
      boss = make(s, D.black);
    hero.exhausted = true;
    const mount = { id: `a${s.nextId++}`, code: "12059", exhausted: false };
    hero.attachments.push(mount);
    boss.shadows = [code];
    boss.faceupShadows = [false];
    s.engaged = [boss];
    handle(
      s,
      fx("templePlayerDestrierReady", {
        source: hero.id,
        target: mount.id,
        text: "previous-attacker",
        owner: 0,
      }),
    );
    flush(s);
    assert.equal(hero.exhausted, false);
    assert.equal(mount.exhausted, true);
    assert.equal(
      s.choice?.options.length,
      1,
      "the hidden text cannot change the legal choices shown",
    );
    views.push(publicState(s));
    s = pick(saved(s), s.choice!.options[0].id);
    assert.equal(
      get(s, hero.id)!.exhausted,
      false,
      "the resolved ready effect remains applied",
    );
    assert.equal(
      get(s, hero.id)!.attachments[0].exhausted,
      true,
      "the resolved cost remains paid",
    );
    assert.deepEqual(get(s, boss.id)!.shadows, code === "01085" ? [code] : []);
    saved(s);
  }
  assert.deepEqual(
    views[0],
    views[1],
    "the two hidden shadow identities produce identical public states and choices",
  );
});

test("Shadows Give Way skips protected shadows and still discards later blank shadows", () => {
  const s = dorwinion(),
    boss = make(s, D.black);
  boss.shadows = ["01085", "01099"];
  boss.faceupShadows = [true, true];
  boss.revealedShadowCount = 2;
  s.engaged.push(boss);
  assert.equal(finalRingEvent(s, "08143"), true);
  assert.deepEqual(boss.shadows, ["01085"]);
  assert.ok(s.encounterDiscard.includes("01099"));
  assert.equal(boss.revealedShadowCount, 1);
});

test("Khamûl's normal and immediate defender pickers match the native defense restriction", () => {
  let s = temple(2);
  s.table!.first = 1;
  s.table!.turn = 1;
  selectSeat(s, 1);
  const khamul = make(s, T.khamul);
  s.staging.push(khamul);
  check(s);
  const sentinel = seatView(s, 0).heroes.find((u) => u.code === "01001")!;
  const local = s.heroes[0];
  local.tempDefense = 100;
  assert.ok(
    defendersFor(s, make(s, "01097")).some((u) => u.id === sentinel.id),
    "Aragorn remains a legal remote Sentinel against an ordinary enemy",
  );
  assert.ok(!defendersFor(s, khamul).some((u) => u.id === sentinel.id));
  assert.ok(defendersFor(s, khamul).some((u) => u.id === local.id));
  s.phase = "defense";
  s = saved(s);
  assert.throws(
    () =>
      applyAction(s, {
        type: "DEFEND",
        enemyId: khamul.id,
        defenderIds: [sentinel.id],
      }),
    /Choose ready characters able to defend/,
  );
  const normal = applyAction(s, {
    type: "DEFEND",
    enemyId: khamul.id,
    defenderIds: [local.id],
  });
  assert.equal(get(normal, local.id)!.exhausted, true);

  handle(
    s,
    fx("immediateAttack", { target: khamul.id, noShadow: true, player: 1 }),
  );
  flush(s);
  assert.ok(!s.choice!.options.some((o) => o.id === sentinel.id));
  assert.ok(s.choice!.options.some((o) => o.id === local.id));
  s = pick(saved(s), local.id);
  assert.equal(get(s, local.id)!.exhausted, true);
  saved(s);
});
