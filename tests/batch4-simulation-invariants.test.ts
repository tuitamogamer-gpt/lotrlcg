import assert from "node:assert/strict";
import test from "node:test";
import { STARTERS, card } from "../src/game/cards";
import { createGame, restoreSave, publicState } from "../src/game/engine";
import { revealed } from "../src/game/board";
import { fx, make } from "../src/game/core";
import {
  BATCH4_SCENARIOS,
  type Batch4Scenario,
} from "./batch4-simulation-policy";
import {
  assertBatch4SaveRestoration,
  batch4PhysicalCards,
  batch4SimulationObserver,
  batch4State,
} from "./batch4-simulation-invariants";
import type { GameState } from "../src/game/types";
function initial(scenarioId: Batch4Scenario, players = 1, easy = false) {
  const d = STARTERS[0];
  return createGame(11, d.cards, d.heroes, d.id, {
    scenarioId,
    easy,
    seats: STARTERS.slice(0, players).map((p) => ({
      heroes: p.heroes,
      deckId: p.id,
    })),
  });
}
function restored(s: GameState) {
  const saved = JSON.parse(JSON.stringify(s)),
    r = restoreSave(saved);
  assert.ok(r);
  assertBatch4SaveRestoration(saved, r);
  return r;
}
for (const id of BATCH4_SCENARIOS)
  test(`${id}: conservation starts with every original standard/easy component and 1–4 players`, () => {
    for (const n of [1, 2, 3, 4])
      for (const easy of [false, true])
        batch4SimulationObserver().observe(restored(initial(id, n, easy)));
  });
for (const id of BATCH4_SCENARIOS)
  test(`${id}: exact conservation rejects missing deck, private, shadow, removed and duplicated physical cards`, () => {
    const s = initial(id),
      observer = batch4SimulationObserver();
    observer.observe(restored(s));
    const missing = structuredClone(s);
    missing.encounterDeck.pop();
    assert.throws(() => observer.observe(missing), /conserves every original/);
    const held = batch4State(s)!.setAside;
    if (held.length) {
      const noHeld = structuredClone(s);
      batch4State(noHeld)!.setAside.pop();
      assert.throws(() => observer.observe(noHeld), /conserves every original/);
      const duplicate = structuredClone(s);
      duplicate.staging.push(structuredClone(held[0]));
      assert.throws(() => observer.observe(duplicate), /exactly one zone/);
    }
    const moved = structuredClone(s),
      code = moved.encounterDeck.shift()!;
    (moved.removedEncounter ??= []).push(code);
    observer.observe(restored(moved));
    moved.removedEncounter!.pop();
    assert.throws(() => observer.observe(moved), /conserves every original/);
  });
for (const id of BATCH4_SCENARIOS)
  test(`${id}: a native reviewed reveal owns exactly one physical continuation`, () => {
    const s = initial(id);
    s.phase = "staging";
    batch4State(s)!.initialized = true;
    s.flow = { mode: "all", nextId: 1, pending: null, history: [] };
    const i = s.encounterDeck.findIndex((c) => card(c).type_code === "enemy");
    assert.ok(i >= 0);
    const code = s.encounterDeck.splice(i, 1)[0];
    revealed(s, code);
    assert.ok(s.flow.pending);
    const o = batch4SimulationObserver();
    o.observe(restored(s));
    const missing = structuredClone(s);
    missing.queue = missing.queue.filter((e) => e.kind !== "resolveReveal");
    assert.throws(() => o.observe(missing), /conserves every original/);
  });
test("Batch 4 active event effects own one card while cancelled alternatives and review history own none", () => {
  const s = initial("the-crossings-of-poros"),
    code = s.encounterDeck.shift()!;
  s.queue.push(
    fx("eventPlay", {
      code: "01050",
      effects: [
        fx("afterPlayerAbility", {
          effects: [
            fx("placeEncounter", { code, text: "revealed", flag: true }),
          ],
        }),
      ],
      cancelledEffects: [fx("placeEncounter", { code, text: "revealed" })],
    }),
  );
  const o = batch4SimulationObserver();
  o.observe(restored(s));
  s.queue[0].effects = [];
  assert.throws(() => o.observe(s), /conserves every original/);
});
test("Poros all seven physical quest variants and removed set aside cards count once", () => {
  const s = initial("the-crossings-of-poros"),
    q = s.crossingsPoros!,
    o = batch4SimulationObserver();
  o.observe(restored(s));
  const missing = structuredClone(s);
  missing.crossingsPoros!.questDeck.pop();
  assert.throws(() => o.observe(missing), /conserves every original/);
  q.removed.push(q.setAside.pop()!);
  o.observe(restored(s));
  const duplicate = structuredClone(s);
  duplicate.crossingsPoros!.setAside.push(structuredClone(q.removed[0]));
  assert.throws(() => o.observe(duplicate), /exactly one zone/);
});
test("Wilds conservation includes Caves/Evil Creatures, stored cards and guarded heroes without counting links twice", () => {
  for (const id of ["journey-up-the-anduin", "the-kings-quest"] as const) {
    const s = initial(id),
      o = batch4SimulationObserver();
    o.observe(restored(s));
    const missing = structuredClone(s);
    if (id === "journey-up-the-anduin") missing.wildsRhovanion!.evilDeck.pop();
    else missing.wildsRhovanion!.cavesDeck.pop();
    assert.throws(() => o.observe(missing), /conserves every original/);
    assert.ok(batch4PhysicalCards(s).codes.length > 0);
  }
  const s = initial("journey-up-the-anduin"),
    q = s.wildsRhovanion!;
  const i = s.encounterDeck.findIndex((c) => card(c).type_code === "location"),
    host = make(s, s.encounterDeck.splice(i, 1)[0]);
  s.staging.push(host);
  const h = s.heroes.pop()!;
  q.guardedHeroes.push({ hero: h, player: 0, guardId: host.id });
  const o = batch4SimulationObserver();
  o.observe(s);
  q.guardedHeroes = [];
  assert.throws(() => o.observe(s), /conserves original heroes/);
});
test("A pending event is physical until Lonely Lands stores it, then spent ability metadata references that same card once", () => {
  const s = initial("journey-up-the-anduin"),
    q = s.wildsRhovanion!;
  const index = s.encounterDeck.findIndex(
    (code) => card(code).name === "Lonely Lands",
  );
  assert.ok(index >= 0);
  const lands = make(s, s.encounterDeck.splice(index, 1)[0]);
  s.staging.push(lands);
  const handIndex = s.hand.findIndex((u) => u.code === "01022");
  const deckIndex = s.deck.indexOf("01022");
  assert.ok(handIndex >= 0 || deckIndex >= 0);
  const event =
    handIndex >= 0
      ? s.hand.splice(handIndex, 1)[0]
      : make(s, s.deck.splice(deckIndex, 1)[0]);
  s.resolvingEvents = [{ unit: event, player: 0, destination: "discard" }];
  const observer = batch4SimulationObserver();
  observer.observe(restored(s));
  assert.equal(
    batch4PhysicalCards(s).units.filter((u) => u.id === event.id).length,
    1,
  );
  s.resolvingEvents[0].destination = "spent";
  q.storedCards.push({ locationId: lands.id, player: 0, cards: [event] });
  observer.observe(restored(s));
  assert.equal(
    batch4PhysicalCards(s).units.filter((u) => u.id === event.id).length,
    1,
  );
  const other = s.hand.pop()!;
  q.storedCards[0].cards.push(other);
  const alternate = structuredClone(s);
  alternate.wildsRhovanion!.storedCards[0].cards.reverse();
  assert.deepEqual(
    publicState(alternate),
    publicState(s),
    "stored event and player-card identities remain concealed independently of other hidden decks",
  );
  observer.observe(restored(s));
  const missing = structuredClone(s);
  missing.wildsRhovanion!.storedCards = [];
  assert.throws(() => observer.observe(missing), /spent event metadata/);
  const duplicate = structuredClone(s);
  duplicate.hand.push(structuredClone(event));
  assert.throws(() => observer.observe(duplicate), /exactly one zone/);
});
