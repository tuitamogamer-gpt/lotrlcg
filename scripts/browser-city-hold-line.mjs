import assert from "node:assert/strict";
import { card } from "../src/game/cards.ts";
import { get, make } from "../src/game/core.ts";
import {
  activeSeat,
  forOwner,
  playerOrder,
  seatView,
} from "../src/game/table.ts";
import { HOLD_THE_LINE } from "../src/game/city-hold-line.ts";

/** Actual combat controls, physical response and both saved resource choices. */
export async function runCityHoldLine(
  p,
  { fixture, load, shot, choose, saved, reviewedState, width, boardCard },
) {
  let s = fixture(2);
  s.phase = "defense";
  const one = s.heroes[0],
    two = s.heroes[1],
    remotePayer = seatView(s, 1).heroes[0],
    enemy = make(s, "01089");
  s.engaged.push(enemy);
  let event, sentinel;
  forOwner(s, 1, () => {
    event = make(s, HOLD_THE_LINE);
    sentinel = make(s, "01029");
    s.hand.push(event);
    s.allies.push(sentinel);
  });
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      for (const h of s.heroes) h.resources = 0;
    });
  one.resources = remotePayer.resources = 1;
  two.damage = 1;
  await load(p, s);

  await boardCard(p, enemy.id)
    .getByRole("button", { name: "Defend", exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: card(one.code).name, exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Resolve enemy attack", exact: true })
    .click();
  await reviewedState(p);
  s = await saved(p);
  assert.match(s.choice.title, /Hold the Line/);
  assert.equal(get(s, one.id).exhausted, false);
  assert.ok(s.choice.options.some((o) => o.id === event.id));
  await shot(p, "hold-line-remote-physical-response", width);

  await choose(p, event.id);
  s = await saved(p);
  assert.equal(activeSeat(s), 0, "the attacked player chooses the defenders");
  assert.ok(s.choice.options.some((o) => o.id === sentinel.id));
  await choose(p, one.id);
  await choose(p, two.id);
  await choose(p, sentinel.id);
  s = await saved(p);
  assert.match(s.choice.title, /Then spend 2 Tactics/);
  assert.deepEqual(s.combat.defenderIds, [one.id, two.id, sentinel.id]);
  assert.equal(s.standTogether, false);
  assert.equal(get(s, one.id).exhausted, true);
  assert.equal(get(s, two.id).exhausted, true);
  assert.equal(get(s, sentinel.id).exhausted, true);
  await shot(p, "hold-line-three-defenders-before-shadows", width);

  await choose(p, "pay");
  await choose(p, one.id);
  s = await saved(p);
  assert.match(s.choice.title, /resource 2 of 2/);
  assert.equal(get(s, one.id).resources, 1);
  assert.equal(get(s, remotePayer.id).resources, 1);
  await load(p, s);
  s = await saved(p);
  assert.deepEqual(s.choice.options[0].effects[0].ids, [
    one.id,
    remotePayer.id,
  ]);
  await shot(p, "hold-line-saved-shared-payment", width);

  await choose(p, remotePayer.id);
  s = await saved(p);
  assert.equal(s.combat, null);
  assert.equal(get(s, one.id).resources, 0);
  assert.equal(get(s, remotePayer.id).resources, 0);
  assert.equal(get(s, one.id).exhausted, false);
  assert.equal(get(s, two.id).exhausted, false);
  assert.equal(get(s, sentinel.id).exhausted, false);
  assert.equal(get(s, two.id).damage, 1);
  assert.equal(
    get(s, enemy.id).damage,
    1,
    "the real Sentinel declaration response resolves",
  );
  assert.ok(seatView(s, 1).discard.includes(HOLD_THE_LINE));
  assert.ok(!seatView(s, 1).hand.some((u) => u.id === event.id));
  await shot(p, "hold-line-undamaged-defenders-ready-after-attack", width);
}
