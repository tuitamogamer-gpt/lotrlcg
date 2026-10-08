import assert from "node:assert/strict";
import test from "node:test";
import { base, choose, reload } from "./deadmens-dike-fixtures.ts";
import { make } from "../src/game/core.ts";
import { DIKE as D } from "../src/game/deadmens-dike-support.ts";
import { charactersCommitted, damage, destroy } from "../src/game/board.ts";
import { flush, shadowResponse } from "../src/game/effects.ts";
import { card } from "../src/game/cards.ts";
import { canPay } from "../src/game/core.ts";
import { forOwner, seatView } from "../src/game/table.ts";
import { canPlay, playTargets, validateSave } from "../src/game/engine.ts";

function gate(players = 1) {
  const s = base(players);
  s.activeLocation = make(s, D.gate);
  return s;
}

test("a borrowed Response event uses its physical owner's discard for both its offer and payment", () => {
  let s = gate(2);
  const hero = make(s, "01009");
  hero.resources = 1;
  s.heroes[2] = hero;
  const event = make(s, "01048");
  event.owner = 1;
  s.hand = [event];
  forOwner(s, 1, () => (s.discard = [event.code]));
  s.questAttachments = {
    [D.shades]: [{ id: `a${s.nextId++}`, code: D.curse, exhausted: false }],
  };
  assert.equal(
    canPay(s, card(event.code)),
    false,
    "the owner's Heavy Curse surcharge applies before an offer",
  );
  hero.resources = 2;
  shadowResponse(s, "01092");
  const option = s.choice?.options.find((o) =>
    o.effects.some((e) => e.kind === "eventPlay"),
  );
  assert.ok(option);
  s = choose(reload(s), option.id);
  assert.equal(s.heroes.find((u) => u.id === hero.id)!.resources, 0);
  assert.equal(s.deck.length, 29, "the Response charges Gate once");
  assert.deepEqual(
    seatView(s, 1).discard,
    [event.code, event.code],
    "the physical event returns to its original owner",
  );
});

test("Glóin can decline his automatic response at the Gate without gaining resources or discarding", () => {
  let s = gate();
  const gloin = s.heroes.find((u) => u.code === "01003")!;
  assert.ok(gloin);
  const resources = gloin.resources;
  damage(s, gloin.id, 1);
  flush(s);
  assert.equal(s.choice?.title, "Glóin · Response");
  assert.equal(gloin.resources, resources);
  assert.ok(validateSave(s));
  s = choose(reload(s), "skip");
  assert.equal(s.heroes.find((u) => u.id === gloin.id)?.resources, resources);
  assert.equal(s.deck.length, 30);
  assert.deepEqual(s.discard, []);
});

test("accepting Glóin's response gains resources before the Gate discards once", () => {
  let s = gate();
  const gloin = s.heroes.find((u) => u.code === "01003")!;
  const resources = gloin.resources;
  damage(s, gloin.id, 2);
  flush(s);
  s = choose(reload(s), "use");
  assert.equal(
    s.heroes.find((u) => u.id === gloin.id)?.resources,
    resources + 2,
  );
  assert.equal(s.deck.length, 29);
  assert.deepEqual(s.discard, ["01057"]);
});

test("Horn of Gondor's Response charges its controller rather than the destroyed character's controller", () => {
  let s = gate(2);
  const host = seatView(s, 1).heroes[0];
  host.attachments.push({
    id: "gate-horn",
    code: "01042",
    exhausted: false,
    owner: 0,
  });
  const resources = host.resources;
  const victim = make(s, "01016");
  s.allies.push(victim);
  destroy(s, victim);
  flush(s);
  assert.equal(s.choice?.title, "Horn of Gondor · Response");
  assert.equal(s.table?.active, 1);
  assert.equal(
    seatView(s, 1).heroes.find((u) => u.id === host.id)?.resources,
    resources,
  );
  s = choose(reload(s), "use");
  assert.equal(
    seatView(s, 1).heroes.find((u) => u.id === host.id)?.resources,
    resources + 1,
  );
  assert.equal(seatView(s, 0).deck.length, 30);
  assert.equal(seatView(s, 1).deck.length, 29);
  assert.deepEqual(seatView(s, 1).discard, ["01057"]);
});

test("Horn's response remains optional at the Gate and never fires for a discard cost", () => {
  let s = gate();
  const host = s.heroes[0];
  host.attachments.push({
    id: "gate-horn-skip",
    code: "01042",
    exhausted: false,
  });
  const victim = make(s, "01016");
  s.allies.push(victim);
  const resources = host.resources;
  destroy(s, victim);
  flush(s);
  s = choose(reload(s), "skip");
  assert.equal(s.deck.length, 30);
  assert.equal(s.heroes.find((u) => u.id === host.id)?.resources, resources);
  const discarded = make(s, "01016");
  s.allies.push(discarded);
  destroy(s, discarded, false);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(s.deck.length, 30);
});

test("Northern Tracker's progress on several locations is a single Response at the Gate", () => {
  let s = gate();
  const tracker = make(s, "01045");
  tracker.committed = true;
  tracker.exhausted = true;
  s.allies.push(tracker);
  const square = make(s, D.square);
  const battlements = make(s, D.battlements);
  s.staging.push(square, battlements);
  charactersCommitted(s, [tracker]);
  flush(s);
  assert.equal(s.choice?.title, "Northern Tracker · Response");
  s = choose(reload(s), "use");
  assert.equal(s.staging.find((u) => u.id === square.id)?.progress, 1);
  assert.equal(s.staging.find((u) => u.id === battlements.id)?.progress, 1);
  assert.equal(s.deck.length, 29);
  assert.equal(s.staging.find((u) => u.id === square.id)?.resources, 1);
});

test("Power disables Core discard-recovery events and their targets before payment", () => {
  const s = base(2);
  s.staging.push(make(s, D.power));
  forOwner(s, 1, () => {
    s.discard = ["01016", "01008", "01050", "04031"];
  });
  s.discard = ["01016", "01008", "01050", "04031"];
  for (const code of ["01049", "01051", "01053", "01054", "02027"]) {
    const event = make(s, code);
    s.hand.push(event);
    assert.match(
      String(canPlay(s, event)),
      /The Power of Angmar/,
      `${code} is disabled by Power`,
    );
    if (["01051", "01053", "01054"].includes(code))
      assert.deepEqual(
        playTargets(s, event),
        [],
        `${code} has no protected discard targets`,
      );
  }
  assert.ok(s.heroes.every((h) => h.resources === 10));
});
