import test from "node:test";
import assert from "node:assert/strict";
import { destroy } from "../src/game/board";
import { make } from "../src/game/core";
import { COBAS } from "../src/game/cobas-support";
import {
  act,
  fixture,
  hand,
  reload,
  settle,
} from "./ered-mithrin-player-fixtures";
import { base as cobasFixture } from "./cobas-fixtures";
import { second as raidFixture } from "./raid-grey-havens-fixtures";
import { RAID } from "../src/game/raid-grey-havens-support";

test("Discarding a Victory enemy gives no victory while defeating it still does", () => {
  for (const defeated of [false, true]) {
    const s = fixture(),
      enemy = make(s, "01082"),
      before = s.victory;
    s.staging.push(enemy);
    destroy(s, enemy, defeated);
    assert.equal(s.victory - before, defeated ? 4 : 0);
    assert.equal(s.victoryCards?.includes(enemy.code) ?? false, defeated);
    assert.equal(s.encounterDiscard.includes(enemy.code), !defeated);
    assert.ok(!s.staging.some((u) => u.id === enemy.id));
    reload(s);
  }
});

test("A scenario's captured-enemy destination retains priority over generic enemy piles", () => {
  const s = cobasFixture(),
    enemy = make(s, COBAS.skirmisher);
  s.engaged.push(enemy);
  destroy(s, enemy);
  assert.equal(
    s.cobas!.capturePending.filter((u) => u.id === enemy.id).length,
    1,
  );
  assert.ok(
    s.queue.some(
      (e) => e.kind === "cobasCaptureOffer" && e.target === enemy.id,
    ),
  );
  assert.ok(!s.encounterDiscard.includes(enemy.code));
  assert.ok(!s.victoryCards?.includes(enemy.code));
  reload(s);
});

test("The Great Hunt discards Eastern Crows without triggering its defeated-only shuffle", () => {
  let s = fixture();
  const crows = make(s, "01115"),
    event = hand(s, "19149");
  s.staging.push(crows);
  s.phase = "attack";
  s.heroes.forEach((hero) => {
    hero.resources = 1;
  });
  s = settle(
    act(s, {
      type: "PLAY",
      id: event.id,
      target: crows.id,
      payment: Object.fromEntries(s.heroes.map((hero) => [hero.id, 1])),
    }),
  );
  assert.ok(s.encounterDiscard.includes(crows.code));
  assert.ok(!s.encounterDeck.includes(crows.code));
  assert.ok(s.discard.includes(event.code));
  assert.ok(s.heroes.every((hero) => hero.resources === 0));
  reload(s);
});

test("Defeated Eastern Crows still use their printed shuffle destination", () => {
  const s = fixture(),
    crows = make(s, "01115");
  s.staging.push(crows);
  destroy(s, crows);
  assert.ok(s.encounterDeck.includes(crows.code));
  assert.ok(!s.encounterDiscard.includes(crows.code));
  reload(s);
});

test("The Raid insert sends both Elite enemies to victory on discard as well as defeat", () => {
  for (const code of [RAID.sahir, RAID.naasiyah])
    for (const defeated of [false, true]) {
      const s = raidFixture(),
        enemy = s.staging.find((u) => u.code === code)!;
      destroy(s, enemy, defeated);
      assert.equal(s.victoryCards?.filter((c) => c === code).length, 1);
      assert.ok(!s.encounterDiscard.includes(code));
      assert.ok(!s.encounterDeck.includes(code));
      reload(s);
    }
});
