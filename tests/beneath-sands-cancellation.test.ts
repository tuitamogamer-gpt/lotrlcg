import assert from "node:assert/strict";
import test from "node:test";
import { applyAction } from "../src/game/engine";
import { card } from "../src/game/cards";
import { get, make } from "../src/game/core";
import { placeEncounter } from "../src/game/board";
import { flush } from "../src/game/effects";
import { syncSeat } from "../src/game/table";
import { BENEATH_SANDS as B } from "../src/game/beneath-sands-support";
import { base, choose, reload, setStage } from "./beneath-sands-fixtures";
import { sandsShadow } from "./beneath-sands-browser-fixtures";
import type { GameState, Unit } from "../src/game/types";

const cancellations = [
  { name: "Frodo", hero: "02025", event: undefined },
  { name: "Gondorian Discipline", hero: "01010", event: "06060" },
  { name: "Close Call", hero: "01010", event: "08005" },
] as const;

function prepare(
  s: GameState,
  target: Unit,
  source: (typeof cancellations)[number],
) {
  target.code = source.hero;
  if (source.event) s.hand.push(make(s, source.event));
  if (source.event) {
    s.heroes.find((u) => u.id !== target.id)!.code = "01006";
  }
  syncSeat(s);
}

/** Resolve actual serialized response, amount and payment choices. */
function resolveCancellation(
  s: GameState,
  source: (typeof cancellations)[number],
) {
  let offered = false;
  flush(s);
  for (
    let i = 0;
    s.status === "playing" && (s.choice || s.flow?.pending);
    i++
  ) {
    assert.ok(i < 100, "damage response completes");
    if (s.flow?.pending) {
      s = applyAction(reload(s), {
        type: "CONTINUE",
        stepId: s.flow.pending.id,
      });
      continue;
    }
    const choice = s.choice!;
    const response = choice.title.includes(source.name);
    offered ||= response;
    const id =
      choice.options.find((o) => o.id === "damage")?.id ??
      (response
        ? choice.options.find(
            (o) =>
              o.id === "cancel-damage" ||
              o.id === "cancel-1" ||
              o.code === source.event,
          )?.id
        : undefined) ??
      choice.options.find((o) => o.id === "skip")?.id ??
      choice.options[0].id;
    s = choose(reload(s), id);
  }
  return { s: reload(s), offered };
}

for (const source of cancellations) {
  for (const onTrack of [false, true])
    test(`Stage two ${onTrack ? "On" : "Off"} Track: Forced Off Track direct damage ${onTrack ? "suppresses" : "allows"} ${source.name}`, () => {
      let s = base();
      setStage(s, 2, onTrack);
      s.phase = "quest";
      const target = s.heroes[1];
      prepare(s, target, source);
      target.committed = true;
      s.committedIds = [target.id];
      placeEncounter(s, B.forcedOff, false, 0, undefined, true);
      const result = resolveCancellation(s, source);
      s = result.s;
      assert.equal(result.offered, !onTrack);
      assert.equal(get(s, target.id)!.damage, onTrack ? 1 : 0);
      if (source.event)
        assert.equal(s.discard.includes(source.event), !onTrack);
    });

  test(`Stage two On Track: native enemy combat damage remains cancelable by ${source.name}`, () => {
    const f = sandsShadow(B.burrow, true);
    setStage(f.s, 2, true);
    prepare(f.s, f.defender, source);
    // Hive Guardian attacks for five while On Track: one damage after defense.
    f.defender.tempDefense = 4 - (card(f.defender.code).defense ?? 0);
    let s = applyAction(reload(f.s), {
      type: "DEFEND",
      enemyId: f.enemy.id,
      defenderId: f.defender.id,
    });
    const result = resolveCancellation(s, source);
    s = result.s;
    assert.equal(result.offered, true);
    assert.equal(get(s, f.defender.id)!.damage, 0);
    if (source.event) assert.ok(s.discard.includes(source.event));
  });
}
