import test from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "../src/game/engine";
import { get, globalUnits, make, stats } from "../src/game/core";
import { forOwner, seatView, selectSeat } from "../src/game/table";
import { ETTEN as E } from "../src/game/ettenmoors-support";
import { base, choose, reload } from "./ettenmoors-fixtures";

test("paid card remains physically reserved outside play through a prevention choice and save", () => {
  let s = base();
  s.staging.push(make(s, E.forage));
  const payer = make(s, "01004"),
    guard = make(s, "10004"),
    entrant = make(s, "10004");
  s.heroes[0] = payer;
  payer.resources = 2;
  s.allies.push(guard);
  s.hand = [entrant];
  s = applyAction(reload(s), {
    type: "PLAY",
    id: entrant.id,
    payment: { [payer.id]: 2 },
  });
  assert.match(s.choice!.title, /Prevent damage/);
  assert.equal(s.pendingPlayerPlays?.[0].unit.id, entrant.id);
  assert.ok(!s.hand.some((u) => u.id === entrant.id));
  assert.equal(get(s, entrant.id), undefined);
  assert.ok(!globalUnits(s).some((u) => u.id === entrant.id));
  assert.deepEqual(
    s.choice!.options.filter((o) => o.code === "10004").map((o) => o.id),
    [`${guard.id}-normal`],
  );
  s = choose(reload(s), `${guard.id}-normal`);
  assert.equal(s.pendingPlayerPlays, undefined);
  assert.equal(get(s, payer.id)!.damage, 0);
  assert.equal(get(s, payer.id)!.resources, 0);
  assert.ok(get(s, guard.id)!.exhausted);
  assert.ok(s.allies.some((u) => u.id === entrant.id && !u.exhausted));
  reload(s);
});

test("paid attachment is discarded once if its hero target dies during payment", () => {
  let s = base();
  s.staging.push(make(s, E.forage));
  const payer = s.heroes[0],
    attachment = make(s, "01027");
  payer.damage = stats(s, payer).health - 1;
  payer.resources = 2;
  s.hand = [attachment];
  s = applyAction(reload(s), {
    type: "PLAY",
    id: attachment.id,
    target: payer.id,
    payment: { [payer.id]: 2 },
  });
  assert.equal(get(s, payer.id), undefined);
  assert.equal(s.pendingPlayerPlays, undefined);
  assert.equal(s.discard.filter((code) => code === attachment.code).length, 1);
  assert.ok(
    !s.heroes.some((u) => u.attachments.some((a) => a.id === attachment.id)),
  );
  reload(s);
});

test("an eliminated actor's paid ally stays out of play while the other fellowship continues", () => {
  let s = base(2);
  s.staging.push(make(s, E.forage));
  let payer!: ReturnType<typeof make>, entrant!: ReturnType<typeof make>;
  forOwner(s, 1, () => {
    payer = make(s, "01004");
    payer.damage = stats(s, payer).health - 1;
    payer.resources = 2;
    s.heroes = [payer];
    entrant = make(s, "10004");
    s.hand = [entrant];
  });
  s.table!.turn = 1;
  selectSeat(s, 1);
  s = applyAction(reload(s), {
    type: "PLAY",
    id: entrant.id,
    payment: { [payer.id]: 2 },
  });
  assert.equal(s.status, "playing");
  assert.equal(s.table!.seats[1].eliminated, true);
  assert.equal(s.pendingPlayerPlays, undefined);
  assert.equal(get(s, entrant.id), undefined);
  assert.equal(
    seatView(s, 1).discard.filter((code) => code === entrant.code).length,
    1,
  );
  reload(s);
});

test("losing during a paid card's cost discards its reserved physical card and removes the continuation", () => {
  let s = base();
  s.staging.push(make(s, E.forage));
  const payer = make(s, "01004"),
    entrant = make(s, "10004");
  payer.damage = stats(s, payer).health - 1;
  payer.resources = 2;
  s.heroes = [payer];
  s.hand = [entrant];
  s = applyAction(reload(s), {
    type: "PLAY",
    id: entrant.id,
    payment: { [payer.id]: 2 },
  });
  assert.equal(s.status, "lost");
  assert.equal(s.pendingPlayerPlays, undefined);
  assert.equal(get(s, entrant.id), undefined);
  assert.equal(s.discard.filter((code) => code === entrant.code).length, 1);
  assert.deepEqual(s.queue, []);
  reload(s);
});
