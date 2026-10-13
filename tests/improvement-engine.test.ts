import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  canPlay,
  createGame,
  playTargets,
  publicState,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { enqueue, fx, make, stats } from "../src/game/core";
import { flush } from "../src/game/effects";
import { returnAlly } from "../src/game/board";
import { startGuided, wantsPause } from "../src/game/presentation";
import { forOwner, seatView, syncSeat } from "../src/game/table";
import { STORMCALLER as C } from "../src/game/stormcaller-support";
import { DEPTHS as D } from "../src/game/depths-support";
import { base, reload } from "./against-shadow-final-fixtures";
import { base as stormBase, setPlayerStage } from "./stormcaller-fixtures";
import { stage3 } from "./depths-fixtures";
import type { GameState, ResolutionStep, ReviewMode } from "../src/game/types";

function settleReviews(s: GameState) {
  const reviews: ResolutionStep[] = [];
  for (let n = 0; s.flow?.pending || s.choice; n++) {
    assert.ok(n < 100, "reviews and choices terminate");
    s = reload(s);
    if (s.flow?.pending) {
      reviews.push(structuredClone(s.flow.pending));
      s = applyAction(s, { type: "CONTINUE", stepId: s.flow.pending.id });
    } else {
      s = applyAction(s, {
        type: "CHOOSE",
        id: s.choice!.options.some((o) => o.id === "resolve")
          ? "resolve"
          : s.choice!.options[0].id,
      });
    }
  }
  return { s, reviews };
}

test("hidden reviews pause for each actual 4B Weather ship loss and preserve save/rules parity", () => {
  const outcomes = [];
  for (const mode of ["all", "hidden", "decisions"] as ReviewMode[]) {
    let s = stormBase();
    setPlayerStage(s, 4);
    s.phase = "quest";
    s.encounterDeck = [C.squall, C.skiff];
    s.committedIds = [s.heroes[0].id];
    startGuided(s);
    s.flow!.mode = mode;
    s = applyAction(reload(s), { type: "COMMIT" });
    const result = settleReviews(s);
    s = result.s;
    const ships = s.allies.filter((u) =>
      [C.dream, C.narelenya].includes(u.code),
    );
    assert.deepEqual(
      ships.map((u) => u.damage),
      [1, 1],
    );
    const losses = result.reviews.flatMap((review) =>
      review.changes.filter(
        (change) =>
          ships.some((ship) => ship.code === change.code) &&
          change.label.endsWith("· Damage"),
      ),
    );
    assert.equal(losses.length, mode === "decisions" ? 0 : 2);
    if (mode === "hidden")
      assert.ok(
        result.reviews.some((review) => review.kind === "reveal"),
        "the Weather reveal still has its separate review",
      );
    delete s.flow;
    outcomes.push(reload(s));
  }
  assert.deepEqual(outcomes[0], outcomes[1]);
  assert.deepEqual(outcomes[1], outcomes[2]);
});

test("hidden reviews classify a real objective ally's damage as a player loss", () => {
  const s = stage3();
  const captain = s.allies.find((u) => u.code === D.sahirAlly)!;
  assert.ok(captain);
  startGuided(s);
  s.flow!.mode = "hidden";
  enqueue(s, fx("damage", { target: captain.id, value: 1 }));
  flush(s);
  assert.equal(captain.damage, 1);
  assert.ok(
    s.flow!.pending?.changes.some((change) => change.code === captain.code),
  );
  reload(s);
});

test("enemy and ship enemy damage or defeat still do not count as hidden-mode player losses", () => {
  for (const code of ["01089", C.stormcaller])
    for (const change of [
      { label: "Enemy · Damage", before: "0 / 10", after: "1 / 10", code },
      { label: "Enemy", before: "Staging area", after: "Left play", code },
    ])
      assert.equal(
        wantsPause(
          "hidden",
          { kind: "effect", changes: [change] },
          fx("damage"),
        ),
        false,
      );
});

function loreGame() {
  const deck = STARTERS.find((d) => d.id === "lore")!;
  let s = createGame(31, deck.cards, deck.heroes, deck.id);
  s = applyAction(s, { type: "KEEP" });
  s = applyAction(s, { type: "NEXT" });
  assert.equal(s.phase, "planning");
  s.staging = [];
  s.hand = [];
  s.heroes.forEach((h) => (h.resources = 10));
  return s;
}

test("public hand playability agrees with actual targetless PLAY rejection and later legal play", () => {
  let s = loreGame();
  const snare = make(s, "01069");
  s.hand.push(snare);
  assert.equal(
    canPlay(s, snare),
    null,
    "resources and timing alone are affordable",
  );
  assert.deepEqual(playTargets(s, snare), []);
  assert.equal(
    publicState(s).hand.find((u) => u.id === snare.id)!.playable,
    false,
  );
  const before = structuredClone(s);
  assert.throws(
    () => applyAction(s, { type: "PLAY", id: snare.id }),
    /legal target/,
  );
  assert.deepEqual(
    s,
    before,
    "rejected PLAY spends no resources and keeps the card",
  );
  const enemy = make(s, "01089");
  s.engaged.push(enemy);
  assert.equal(
    publicState(s).hand.find((u) => u.id === snare.id)!.playable,
    true,
  );
  s = applyAction(reload(s), { type: "PLAY", id: snare.id, target: enemy.id });
  assert.ok(
    s.engaged
      .find((u) => u.id === enemy.id)!
      .attachments.some((a) => a.id === snare.id),
  );
  assert.ok(!s.hand.some((u) => u.id === snare.id));
  reload(s);
});

for (const players of [1, 2])
  test(`${players}-player actual facedown Eagle collection retains private identity and public bonuses`, () => {
    let s = base("mirkwood", players);
    const collector = make(s, "02119");
    collector.owner = 0;
    s.allies.push(collector);
    const bird = make(s, "02004");
    bird.owner = players - 1;
    forOwner(s, players - 1, () => s.allies.push(bird));
    const visible = {
      id: `c${s.nextId++}`,
      code: "01072",
      exhausted: false,
      owner: 0,
    };
    collector.attachments.push(visible);
    const beforeAttack = stats(s, collector).attack;
    syncSeat(s);
    returnAlly(s, bird);
    flush(s);
    assert.ok(s.choice?.options.some((o) => o.id === collector.id));
    s = applyAction(reload(s), { type: "CHOOSE", id: collector.id });
    s = reload(s);
    const physical = s.allies.find((u) => u.id === collector.id)!;
    assert.equal(
      physical.attachments.find((a) => a.id === bird.id)!.code,
      bird.code,
    );
    assert.equal(
      physical.attachments.find((a) => a.id === bird.id)!.owner,
      bird.owner,
    );
    const shown = publicState(s);
    const publicCollector = shown.allies.find((u) => u.id === collector.id)!;
    assert.equal(publicCollector.stats.attack, beforeAttack + 1);
    assert.equal(publicCollector.attachments.length, 2);
    const faceDown = publicCollector.attachments.find((a) => a.id === bird.id)!;
    assert.equal(faceDown.facedown, true);
    assert.equal(faceDown.owner, bird.owner);
    assert.equal("code" in faceDown, false);
    assert.equal("name" in faceDown, false);
    assert.deepEqual(
      publicCollector.attachments.find((a) => a.id === visible.id),
      physical.attachments.find((a) => a.id === visible.id),
    );
    if (players > 1) {
      const remote = shown.table!.seats[0].allies.find(
        (u) => u.id === collector.id,
      )!;
      assert.equal(
        "code" in remote.attachments.find((a) => a.id === bird.id)!,
        false,
      );
      const other = applyAction(s, { type: "SELECT_SEAT", seat: 1 });
      assert.equal(
        "code" in
          publicState(other)
            .table!.seats[0].allies.find((u) => u.id === collector.id)!
            .attachments.find((a) => a.id === bird.id)!,
        false,
      );
    }
    assert.ok(validateSave(s));
    assert.ok(restoreSave(JSON.parse(JSON.stringify(s))));
  });
