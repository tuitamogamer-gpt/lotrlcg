import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, restoreSave, validateSave } from "../src/game/engine";
import { fx, make, prepend } from "../src/game/core";
import { discardCharacter, damage, destroy, revealed } from "../src/game/board";
import { flush, handle, shadowResponse } from "../src/game/effects";
import { forOwner, selectSeat, seatView, syncSeat } from "../src/game/table";
import { DIKE as D } from "../src/game/deadmens-dike-support";
import { dikePlayerTriggered } from "../src/game/deadmens-dike";
import { pauseFor } from "../src/game/presentation";
import { CHETWOOD as C } from "../src/game/chetwood-support";
import {
  afterPlayerAbility,
  choosePlayerResponse,
  resolvePlayerAbility,
  responseOptions,
} from "../src/game/player-ability-triggers";
import { base as scenarioFixture } from "./against-shadow-final-fixtures";
import type { GameState } from "../src/game/types";

function base(players = 1, gates = 1) {
  const s = scenarioFixture("mirkwood", players);
  s.scenarioId = "deadmens-dike";
  s.deadmensDike = {
    initialized: true,
    setAside: [make(s, D.thaurdir)],
    undeadRevealRound: -1,
    terrorRound: -1,
    terrorThreat: 0,
  };
  s.allies.push(make(s, C.iarion));
  s.activeLocation = gates ? make(s, D.gate) : null;
  s.extraActiveLocations = Array.from({ length: Math.max(0, gates - 1) }, () =>
    make(s, D.gate),
  );
  for (let player = 0; player < players; player++)
    forOwner(s, player, () => {
      s.deck = Array(20).fill("01016");
    });
  selectSeat(s, 0);
  return s;
}
function reload(s: GameState) {
  syncSeat(s);
  const json = JSON.parse(JSON.stringify(s));
  assert.ok(
    validateSave(json),
    "ability boundary and response metadata survive validation",
  );
  const restored = restoreSave(json);
  assert.ok(restored);
  return restored;
}
function choose(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    JSON.stringify(s.choice),
  );
  return applyAction(reload(s), { type: "CHOOSE", id });
}
function held(s: GameState, code: string, player = 0) {
  const u = make(s, code);
  forOwner(s, player, () => s.hand.push(u));
  return u;
}
function ally(s: GameState, code: string, player = 0) {
  const u = make(s, code);
  forOwner(s, player, () => s.allies.push(u));
  return u;
}
function optionEffect(s: GameState, kind: string) {
  const option = s.choice?.options.find((o) =>
    o.effects.some((e) => e.kind === kind),
  );
  assert.ok(option, JSON.stringify(s.choice));
  return option.id;
}
function spiritHero(s: GameState) {
  const hero = make(s, "01009");
  hero.resources = 10;
  s.heroes[2] = hero;
}
function gateDiscards(s: GameState, player = 0) {
  return seatView(s, player).discard.filter((c) => c === "01016").length;
}

test("Gate boundaries retain true initiation metadata while explicitly declined responses stay unmarked", () => {
  const s = base();
  const options = responseOptions(s, "physical-source", "01002", [
    {
      id: "resource",
      label: "Respond",
      effects: [fx("resource", { target: s.heroes[0].id, value: 1 })],
    },
    { id: "skip", label: "Decline", effects: [fx("draw", { value: 0 })] },
  ]);
  assert.deepEqual(options[0].ability, {
    player: 0,
    source: "physical-source",
    code: "01002",
    type: "response",
  });
  assert.equal(options[1].ability, undefined);
});

test("An ability's serialized finish follows all its queued costs and effects, ahead of interrupted framework", () => {
  const s = base();
  const continuation = fx("threat", { value: 1 });
  s.queue = [continuation];
  resolvePlayerAbility(
    s,
    {
      player: 0,
      source: s.heroes[0].id,
      code: s.heroes[0].code,
      type: "action",
    },
    () => prepend(s, fx("draw", { value: 1 })),
  );
  assert.deepEqual(
    s.queue.map((e) => e.kind),
    ["draw", "playerAbilityFinish", "threat"],
  );
  assert.equal(s.queue[1].player, 0);
  assert.equal(s.queue[2], continuation);
});

test("An interrupted framework continuation can explicitly resume after the triggering response's finish", () => {
  const s = base();
  resolvePlayerAbility(
    s,
    { player: 0, source: "copy", code: "06060", type: "response" },
    () => prepend(s, fx("draw", { value: 1 })),
  );
  afterPlayerAbility(s, fx("threat", { value: 1, player: 0 }));
  assert.deepEqual(
    s.queue.map((e) => e.kind),
    ["draw", "playerAbilityFinish", "threat"],
  );
});

test("A real hero Action resolves healing and its resource cost before the active Gate discards the final deck card", () => {
  let s = base();
  const glorfindel = make(s, "01011");
  s.heroes[2] = glorfindel;
  glorfindel.resources = 1;
  const target = ally(s, "01028");
  target.damage = 1;
  s.deck = ["01016"];
  s = applyAction(s, { type: "ABILITY", id: glorfindel.id });
  assert.ok(s.choice);
  assert.equal(s.deck.length, 1);
  s = choose(s, optionEffect(s, "heal"));
  assert.equal(s.allies.find((u) => u.id === target.id)?.damage, 0);
  assert.equal(s.heroes.find((u) => u.id === glorfindel.id)?.resources, 0);
  assert.equal(s.status, "lost");
  assert.equal(gateDiscards(s), 1);
});

test("Ordinary ally play and its target continuation do not trigger Gate; accepting its printed entry Response does once", () => {
  let s = base();
  const envoy = held(s, "05018");
  s = applyAction(s, { type: "PLAY", id: envoy.id });
  assert.match(s.choice?.title ?? "", /Envoy/);
  assert.equal(gateDiscards(s), 0);
  const target = s.heroes[0];
  const resources = target.resources;
  s = choose(s, target.id);
  assert.equal(s.heroes[0].resources, resources + 1);
  assert.equal(gateDiscards(s), 1);
});

test("Declining an ally entry Response leaves Gate and all player decks untouched", () => {
  let s = base();
  const envoy = held(s, "05018");
  s = applyAction(s, { type: "PLAY", id: envoy.id });
  s = choose(s, "skip");
  assert.equal(gateDiscards(s), 0);
  assert.equal(s.deck.length, 20);
});

test("A real Hasty Stroke Response event resolves once, reaches discard, then Gate discards one card", () => {
  let s = base();
  spiritHero(s);
  const event = held(s, "01048");
  shadowResponse(s, "01092");
  s = choose(s, optionEffect(s, "eventPlay"));
  assert.equal(gateDiscards(s), 1);
  assert.ok(s.discard.includes(event.code));
  assert.equal(s.resolvingEvents, undefined);
});

test("A real ordinary PLAY event Action finishes and enters discard before its single Gate trigger", () => {
  let s = base();
  spiritHero(s);
  const event = held(s, "01046");
  s = applyAction(s, { type: "PLAY", id: event.id });
  assert.equal(s.threat, 14);
  assert.equal(gateDiscards(s), 1);
  assert.ok(s.discard.includes(event.code));
  assert.equal(s.resolvingEvents, undefined);
});

test("An explicitly annotated Test of Will event Response is charged once by its physical identity", () => {
  let s = base();
  spiritHero(s);
  const event = held(s, "01050");
  revealed(s, D.fog);
  flush(s);
  const option = s.choice!.options.find((option) => option.code === "01050")!;
  assert.ok(option);
  assert.equal(option.ability?.source, event.id);
  s = choose(s, option.id);
  assert.equal(gateDiscards(s), 1);
  assert.ok(s.discard.includes(event.code));
  assert.ok(s.encounterDiscard.includes(D.fog));
  assert.equal(s.resolvingEvents, undefined);
});

test("The Gate's forced discard follows a canceled When Revealed Response before the interrupted encounter continues", () => {
  let s = base();
  spiritHero(s);
  held(s, "01050");
  s.deck = ["01016"];
  revealed(s, D.fog);
  flush(s);
  const option = s.choice!.options.find((option) => option.code === "01050")!;
  s = choose(s, option.id);
  assert.equal(s.status, "lost");
  assert.equal(gateDiscards(s), 1);
  assert.ok(!s.encounterDiscard.includes(D.fog));
});

test("A genuine Iârion objective Response counts once while its decline does not initiate an ability", () => {
  for (const accept of [false, true]) {
    let s = base();
    const iarion = s.allies.find((u) => u.code === C.iarion)!;
    iarion.exhausted = true;
    handle(s, fx("chetReadyIarion", { target: iarion.id, player: 0 }));
    s = choose(s, accept ? "ready" : "skip");
    assert.equal(s.allies.find((u) => u.id === iarion.id)?.exhausted, !accept);
    assert.equal(gateDiscards(s), accept ? 1 : 0);
  }
});

test("Horn of Gondor on its destroyed host cannot initiate a discarded attachment's Response or charge Gate", () => {
  const s = base();
  const hero = s.heroes[0];
  hero.attachments.push({
    id: "vanishing-horn",
    code: "01042",
    exhausted: false,
  });
  destroy(s, hero);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(gateDiscards(s), 0);
});

test("A skipped shadow Response and continuing a review do not trigger Gate", () => {
  let s = base();
  spiritHero(s);
  held(s, "01048");
  shadowResponse(s, "01092");
  s = choose(s, "resolve");
  assert.equal(gateDiscards(s), 0);
  s.flow = { nextId: 1, pending: null, history: [], mode: "all" };
  s = applyAction(s, { type: "SET_REVIEW_MODE", mode: "all" });
  pauseFor(s, {
    kind: "reveal",
    title: "Review encounter",
    detail: "The encounter has already resolved.",
  });
  assert.ok(s.flow?.pending);
  s = applyAction(reload(s), { type: "CONTINUE", stepId: s.flow.pending.id });
  assert.equal(gateDiscards(s), 0);
});

test("A printed Forced after defending pays its discard without generating a player ability trigger", () => {
  let s = base();
  const watcher = ally(s, "04056");
  held(s, "01016");
  handle(s, fx("watcherBruinenForced", { target: watcher.id, player: 0 }));
  s = choose(s, "discard-ally");
  assert.equal(gateDiscards(s), 0);
  assert.equal(s.deck.length, 20);
});

test("An accepted response from a character that has left play retains its source and controller after reload", () => {
  let s = base();
  s.heroes[0] = make(s, "02095");
  const squire = ally(s, "06108");
  discardCharacter(s, squire);
  flush(s);
  assert.match(s.choice?.title ?? "", /Squire/);
  assert.equal(
    s.choice?.options.find((o) => o.id !== "skip")?.ability?.source,
    squire.id,
  );
  s = choose(s, s.heroes[0].id);
  assert.equal(gateDiscards(s), 1);
});

test("Multiple active Gate copies each discard one after a single real Action", () => {
  let s = base(1, 2);
  const hero = s.heroes[0];
  hero.attachments.push({
    id: "steward-trigger",
    code: "01026",
    exhausted: false,
  });
  s = applyAction(s, {
    type: "ABILITY",
    id: hero.id,
    attachmentId: "steward-trigger",
  });
  assert.equal(gateDiscards(s), 2);
  assert.equal(s.deck.length, 18);
});

test("A staging-only Gate never triggers for a player Action", () => {
  let s = base(1, 0);
  s.staging.push(make(s, D.gate));
  const hero = s.heroes[0];
  hero.attachments.push({
    id: "steward-trigger",
    code: "01026",
    exhausted: false,
  });
  s = applyAction(s, {
    type: "ABILITY",
    id: hero.id,
    attachmentId: "steward-trigger",
  });
  assert.equal(gateDiscards(s), 0);
});

test("A Gate whose printed text is blank does not collect a Forced trigger", () => {
  const s = base();
  s.activeLocation!.blanked = true;
  dikePlayerTriggered(s, 0);
  assert.deepEqual(s.queue, []);
  assert.equal(s.deck.length, 20);
});

test("An Action whose target choice changes seat credits only its original initiating player after restoration", () => {
  let s = base(2);
  const gleowine = ally(s, "01062", 0);
  s = applyAction(s, { type: "ABILITY", id: gleowine.id });
  assert.ok(s.choice);
  assert.equal(gateDiscards(s, 0), 0);
  s = choose(s, "player-1");
  assert.equal(gateDiscards(s, 0), 1);
  assert.equal(gateDiscards(s, 1), 0);
  assert.equal(seatView(s, 1).hand.length, 1);
  assert.equal(seatView(s, 1).deck.length, 19);
});

test("Nested independent hero Response and ally Action each charge their own controller after healing completes", () => {
  let s = base(2);
  const daughter = ally(s, "01058", 0);
  const target = seatView(s, 1).heroes[0];
  target.damage = 3;
  const elrond = make(s, "04128");
  elrond.resources = 10;
  forOwner(s, 1, () => {
    s.heroes[2] = elrond;
  });
  s = applyAction(s, { type: "ABILITY", id: daughter.id });
  assert.equal(gateDiscards(s, 0), 0);
  s = choose(s, target.id);
  assert.match(s.choice?.title ?? "", /Elrond/);
  assert.equal(seatView(s, 1).heroes[0].damage, 1);
  assert.equal(gateDiscards(s, 0), 0);
  assert.equal(gateDiscards(s, 1), 0);
  s = choose(s, "heal");
  assert.equal(seatView(s, 1).heroes[0].damage, 0);
  assert.equal(gateDiscards(s, 0), 1);
  assert.equal(gateDiscards(s, 1), 1);
});

test("A genuine Norbury Tombs encounter Response refills deck before paying Gate, with no duplicate charge", () => {
  let s = base();
  const tomb = make(s, D.tombs);
  s.deck = ["01016"];
  s.discard = ["01016", "01016", "01016"];
  handle(
    s,
    fx("dikeTombsResponse", { source: tomb.id, code: tomb.code, player: 0 }),
  );
  assert.ok(s.choice);
  s = choose(s, s.choice.options.find((o) => o.id !== "skip")!.id);
  assert.equal(s.status, "playing");
  assert.equal(s.deck.length, 3);
  assert.equal(gateDiscards(s), 1);
});

test("Gondorian Discipline resumes the interrupted damage only after its own Gate boundary", () => {
  let s = base(2);
  const target = ally(s, "05018", 0);
  held(s, "06060", 1);
  damage(s, target.id, 1);
  flush(s);
  assert.match(s.choice?.title ?? "", /Gondorian Discipline/);
  const response = s.choice!.options.find((o) => o.id !== "skip")!;
  assert.equal(response.ability?.player, 1);
  s = choose(s, response.id);
  assert.equal(gateDiscards(s, 1), 0);
  s = choose(s, s.choice!.options[0].id);
  assert.equal(s.allies.find((u) => u.id === target.id)?.damage, 0);
  assert.equal(gateDiscards(s, 0), 0);
  assert.equal(gateDiscards(s, 1), 1);
});

test("Independent Nori and Fili entry Responses do not charge Gate when both are explicitly declined", () => {
  let s = base();
  const hero = s.heroes[0];
  const robe = make(s, "131003");
  s.heroes[2] = robe;
  const dwarf = held(s, "131006");
  s = applyAction(s, { type: "PLAY", id: dwarf.id });
  assert.ok(s.choice);
  // Both Nori and Fili are independent optional Responses caused by this ordinary play.
  for (let i = 0; s.choice && i < 10; i++) s = choose(s, "skip");
  assert.equal(gateDiscards(s), 0);
  assert.ok(hero);
});
