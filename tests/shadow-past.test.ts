import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, canTravel, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, make, stats, threatOf } from "../src/game/core";
import { flush, handle } from "../src/game/effects";
import { engagementCost } from "../src/game/core";
import { playerOrder, seatView } from "../src/game/table";
import {
  ONE_RING,
  SAGA_FRODO,
  oneRing,
  ringBearer,
} from "../src/game/lotr-saga";
import {
  hideFailed,
  hideThreat,
  hideValue,
  hideWillpower,
} from "../src/game/hide-test";
import {
  SP,
  SHADOW_PAST_HOOKS as H,
  SHADOW_PAST_RECIPES,
  shadowPastPublicState,
} from "../src/game/shadow-past";
import {
  allies,
  base,
  choose,
  deck,
  engaged,
  hand,
  reload,
  settle,
  stage,
  start,
} from "./shadow-past-fixtures";
import type { Effect, GameState } from "../src/game/types";

const run = (s: GameState) => {
  flush(s);
  return s;
};
const play = (s: GameState, ...effects: Effect[]) => {
  s.queue.push(...effects);
  return run(s);
};
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
const GUARD = "01013";
/** Reveal one encounter card as the given player during staging. */
const reveal = (
  s: GameState,
  code: string,
  rest: string[] = [],
  player = 0,
) => {
  s.phase = "staging";
  s.encounterDeck = [code, ...rest];
  handle(s, fx("reveal", { player }));
  return run(s);
};
/** Commit the listed characters to the pending Hide test, then discard. */
function hide(s: GameState, ids: string[]) {
  assert.match(s.choice!.title, /Hide \d+ test · Commit characters/);
  for (const id of ids) s = choose(s, id);
  s = choose(s, "done");
  assert.equal(s.hideTest?.phase, "actions");
  return s;
}
const resolveHide = (s: GameState) => act(s, { type: "RESOLVE_HIDE" });

test("Setup: the first player claims The One Ring with Frodo Baggins, a Black Rider waits unrevealed, Bag End is active and Bucklebury Ferry is set aside", () => {
  for (const [easy, deckSize] of [
    [false, 40],
    [true, 28],
  ] as const) {
    const recipe = SHADOW_PAST_RECIPES.find(
      (r) => r.mode === (easy ? "easy" : "standard"),
    )!;
    assert.equal(
      recipe.cards
        .filter((c) => c.section === "sharedEncounterDeck")
        .reduce((n, c) => n + c.quantity, 0),
      deckSize,
    );
    for (const players of [1, 2, 3]) {
      const s = start(players, easy, 50 + players);
      assert.equal(s.encounterDeck.length, deckSize);
      assert.deepEqual(
        s.staging.map((u) => u.code),
        [SP.rider],
      );
      assert.equal(s.activeLocation!.code, SP.bagEnd);
      assert.deepEqual(s.shadowPast!.setAside, [SP.ferry]);
      assert.ok(!s.log.some((l) => /Hide 2 test/.test(l.text)), "not revealed");
      const bearer = ringBearer(s)!;
      assert.equal(bearer.code, SAGA_FRODO);
      const first = s.table?.first ?? 0;
      assert.ok(seatView(s, first).heroes.some((h) => h.id === bearer.id));
      assert.equal(
        seatView(s, first).heroes.length,
        4,
        "Frodo is a fourth hero",
      );
      assert.equal(oneRing(s)!.code, ONE_RING);
      assert.equal(card(SAGA_FRODO).threat, 0);
    }
  }
  // Frodo and other Fellowship heroes are never chosen.
  assert.throws(() => start(1, false, 1, false, false, [SAGA_FRODO]));
});

test("The Ring-bearer follows the first player token with his resources and The One Ring; the players lose if The One Ring leaves play", () => {
  let s = base(2);
  const bearer = ringBearer(s)!;
  bearer.resources = 3;
  const first = s.table!.first;
  s.phase = "refresh";
  play(s, fx("refreshEnd", { player: first }));
  s = settle(s);
  const next = s.table!.first;
  assert.notEqual(next, first, "the first player token passes");
  assert.ok(seatView(s, next).heroes.some((h) => h.code === SAGA_FRODO));
  assert.ok(!seatView(s, first).heroes.some((h) => h.code === SAGA_FRODO));
  assert.equal(ringBearer(s)!.resources, 3);
  assert.ok(ringBearer(s)!.attachments.some((a) => a.code === ONE_RING));
  // Frodo leaves play: The One Ring leaves play and the players lose.
  const t = base();
  const frodo = ringBearer(t)!;
  play(t, fx("damage", { target: frodo.id, value: 9, player: 0 }));
  assert.equal(t.status, "lost");
  assert.match(t.reason ?? "", /The One Ring has left play/);
});

test("Saga staging: each player reveals their own encounter card in player order", () => {
  let s = base(3);
  s.phase = "quest";
  s.encounterDeck = Array(12).fill(SP.rider);
  const order = playerOrder(s);
  for (let i = 0; i < 3 && s.phase === "quest" && !s.hideTest; i++) {
    s = act(s, { type: "SELECT_SEAT", seat: s.table!.turn });
    s = act(s, { type: "COMMIT" });
  }
  assert.equal(
    s.hideTest!.player,
    order[0],
    "the first card is the first player's",
  );
  assert.deepEqual(
    s
      .hideTest!.continuation.filter((e) => e.kind === "reveal")
      .map((e) => e.player),
    [order[1], order[2]],
    "the next players reveal theirs in player order",
  );
});

test("Hide test: commit by exhausting characters, discard the top X cards, an action window, then willpower against threat; a failure engages the Nazgûl and Black Riders attack", () => {
  // Pass: 2 Green Hill Country (4 threat) against Aragorn, Théodred and Glóin (5 willpower).
  let s = base();
  const [aragorn, théodred, glóin] = s.heroes;
  reveal(s, SP.rider, [SP.greenHill, SP.greenHill, SP.greenHill]);
  assert.equal(s.hideTest!.player, 0);
  assert.equal(s.hideTest!.source, SP.rider);
  s = hide(s, [aragorn.id, théodred.id, glóin.id]);
  assert.ok(get(s, aragorn.id)!.exhausted);
  assert.deepEqual(s.hideTest!.discarded, [SP.greenHill, SP.greenHill]);
  assert.equal(hideThreat(s), 4);
  assert.equal(
    hideWillpower(s),
    stats(s, aragorn).will + stats(s, théodred).will + stats(s, glóin).will,
  );
  assert.equal(hideWillpower(s), 5);
  // The action window allows events and abilities, not other actions.
  assert.throws(() => act(s, { type: "NEXT" }), /Hide test/);
  s = resolveHide(s);
  s = settle(s);
  assert.equal(s.hideTest, undefined);
  assert.equal(hideFailed(s, 0, "round"), false);
  assert.ok(
    s.staging.some((u) => u.code === SP.rider),
    "the Black Rider stays in the staging area",
  );
  assert.ok(s.encounterDiscard.filter((c) => c === SP.greenHill).length === 2);
  // Fail: no character committed; the revealed Black Rider engages and attacks.
  let t = base();
  stage(t, SP.rider);
  reveal(t, SP.rider, [SP.greenHill, SP.greenHill]);
  t = hide(t, []);
  t = resolveHide(t);
  assert.equal(hideFailed(t, 0, "phase"), true);
  assert.equal(
    t.engaged.filter((u) => u.code === SP.rider).length,
    2,
    "each Nazgûl in the staging area engages",
  );
  assert.match(t.choice!.title, /Black Rider · Immediate attack/);
  t = settle(t);
  const attacks = t.log.filter((l) =>
    /^Black Rider attacks/.test(l.text),
  ).length;
  assert.equal(
    attacks,
    2,
    "each engaged Black Rider makes an immediate attack",
  );
});

test("Hide modifiers: Woody End lowers X, Evil Crow raises it, Green Hill Country adds willpower, Stock Road and stage 2B's allies add threat", () => {
  let s = base();
  s.activeLocation = make(s, SP.woody);
  reveal(s, SP.rider, Array(5).fill(SP.greenHill));
  assert.equal(hideValue(s), 1, "Hide 2 − 1");
  s = hide(s, []);
  assert.equal(s.hideTest!.discarded.length, 1);
  let t = base();
  engaged(t, SP.crow);
  engaged(t, SP.crow);
  reveal(t, SP.rider, Array(5).fill(SP.greenHill));
  assert.equal(hideValue(t), 4, "Hide 2 + 2 Evil Crows");
  // Green Hill Country active: +1 willpower per committed character.
  let g = base();
  g.activeLocation = make(g, SP.greenHill);
  const hero = g.heroes[0];
  reveal(g, SP.rider, Array(5).fill(SP.greenHill));
  g = hide(g, [hero.id]);
  assert.equal(hideWillpower(g), stats(g, hero).will + 1);
  // Stock Road in the staging area: +2 threat; stage 2B: +1 per ally.
  let r = base();
  stage(r, SP.stockRoad);
  r.stage = 2;
  r.shadowPast!.currentQuest = SP.mushrooms;
  allies(r, [GUARD, GUARD]);
  reveal(r, SP.rider, Array(5).fill(SP.greenHill));
  r = hide(r, []);
  assert.equal(hideThreat(r), 4 + 2 + 2);
});

test("Frodo Baggins: spend 1 resource and exhaust The One Ring to cancel the effects of an encounter card just revealed; it is shuffled back and another is revealed", () => {
  let s = base();
  const frodo = ringBearer(s)!;
  frodo.resources = 1;
  reveal(s, SP.rider, [SP.greenHill, SP.greenHill, SP.greenHill]);
  assert.match(s.choice!.title, /Revealed · Black Rider/);
  const option = s.choice!.options.find((o) => o.code === SAGA_FRODO)!;
  assert.ok(option, "Frodo's response is offered");
  s = choose(s, option.id);
  s = settle(s);
  assert.equal(get(s, frodo.id)!.resources, 0);
  assert.equal(oneRing(s)!.exhausted, true);
  assert.equal(
    s.hideTest,
    undefined,
    "no Hide test: the card's effects are canceled",
  );
  assert.ok(!s.staging.some((u) => u.code === SP.rider));
  assert.ok(s.encounterDeck.includes(SP.rider), "shuffled back");
  assert.ok(
    s.staging.some((u) => u.code === SP.greenHill),
    "another card is revealed",
  );
  // An exhausted One Ring or an empty pool offers nothing.
  const u = base();
  reveal(u, SP.rider, [SP.greenHill, SP.greenHill]);
  assert.match(u.choice!.title, /Hide 2 test/, "no resource, no response");
  const x = base();
  ringBearer(x)!.resources = 1;
  oneRing(x)!.exhausted = true;
  reveal(x, SP.rider, [SP.greenHill, SP.greenHill]);
  assert.match(
    x.choice!.title,
    /Hide 2 test/,
    "an exhausted One Ring, no response",
  );
});

test("Stage 1B cannot be defeated until Bag End is in the victory display; exploring Bag End draws a card per Hobbit hero; 2B reveals a Black Rider that cannot be canceled", () => {
  let s = base();
  const bagEnd = make(s, SP.bagEnd);
  s.activeLocation = bagEnd;
  s.phase = "quest";
  handle(s, fx("successfulQuestProgress", { value: 1, player: 0 }));
  run(s);
  assert.equal(s.stage, 1, "1 progress on Bag End; it needs 3");
  const handBefore = s.hand.length;
  deck(s, ["01013", "01013", "01013"]);
  handle(s, fx("successfulQuestProgress", { value: 2, player: 0 }));
  run(s);
  s = settle(s);
  assert.ok(s.victoryCards!.includes(SP.bagEnd));
  assert.equal(s.hand.length, handBefore + 1, "Frodo is the only Hobbit hero");
  assert.equal(s.stage, 1, "the quest itself still needs its progress");
  // With Bag End in the victory display, 1 progress defeats 1B.
  ringBearer(s)!.resources = 5;
  s.encounterDeck = [SP.rider, SP.greenHill, SP.greenHill, SP.greenHill];
  handle(s, fx("successfulQuestProgress", { value: 1, player: 0 }));
  run(s);
  assert.equal(s.stage, 2);
  assert.equal(s.shadowPast!.currentQuest, SP.mushrooms);
  assert.match(
    s.choice!.title,
    /Hide 2 test/,
    "no cancel window for the 2B Black Rider",
  );
  assert.ok(s.staging.some((u) => u.code === SP.rider));
  s = hide(
    s,
    s.heroes.map((h) => h.id),
  );
  s = settle(resolveHide(s));
  assert.equal(s.shadowPast!.noCancel, false);
});

test("Stage 3A adds Bucklebury Ferry to the staging area and 3B reveals another Black Rider; after a successful Hide test the players may place 2 progress per player on a non-unique location", () => {
  let s = base();
  s.stage = 2;
  s.shadowPast!.currentQuest = SP.mushrooms;
  s.encounterDeck = [SP.greenHill, SP.greenHill, SP.rider];
  s.encounterDiscard = [];
  play(s, fx("spNextStage", { player: 0 }));
  assert.equal(s.stage, 3);
  assert.ok(s.staging.some((u) => u.code === SP.ferry));
  assert.deepEqual(s.shadowPast!.setAside, []);
  assert.match(s.choice!.title, /Hide 2 test/);
  const road = stage(s, SP.stockRoad);
  s = hide(
    s,
    s.heroes.map((h) => h.id),
  );
  s = resolveHide(s);
  assert.match(s.choice!.title, /Escape to Buckland · Place 2 progress/);
  assert.ok(!s.choice!.options.some((o) => o.code === SP.ferry), "unique");
  s = choose(s, road.id);
  assert.equal(get(s, road.id)!.progress, 2);
});

test("Bucklebury Ferry: no travel while another location is in play; travelling makes the first player take a Hide 3 test; exploring it wins the game", () => {
  let s = base();
  s.stage = 3;
  s.shadowPast!.currentQuest = SP.buckland;
  s.shadowPast!.setAside = [];
  const ferry = stage(s, SP.ferry);
  const marish = stage(s, SP.marish);
  s.phase = "travel";
  assert.match(canTravel(s, ferry) ?? "", /Bucklebury Ferry/);
  s.staging = s.staging.filter((u) => u.id !== marish.id);
  s.encounterDeck = Array(5).fill(SP.greenHill);
  assert.equal(canTravel(s, ferry), null);
  assert.equal(H.immune!(s, ferry), true);
  s = act(s, { type: "TRAVEL", id: ferry.id });
  assert.match(s.choice!.title, /Hide 3 test/);
  s = hide(s, []);
  s = settle(resolveHide(s));
  assert.equal(
    s.activeLocation!.id,
    ferry.id,
    "the players travel whatever the result",
  );
  s.phase = "quest";
  handle(s, fx("successfulQuestProgress", { value: 9, player: 0 }));
  run(s);
  assert.equal(s.status, "won");
  assert.match(s.reason ?? "", /Bucklebury Ferry/);
  // Stock Road's travel cost is a Hide 1 test.
  let t = base();
  const road = stage(t, SP.stockRoad);
  t.phase = "travel";
  t = act(t, { type: "TRAVEL", id: road.id });
  assert.match(t.choice!.title, /Hide 1 test/);
});

test("Lure of the Ring: the first player exhausts The One Ring or raises their threat by 3; its shadow gives +1 attack, +2 with The One Ring exhausted", () => {
  let s = base();
  reveal(s, SP.lure, [SP.greenHill, SP.greenHill]);
  assert.match(s.choice!.title, /Lure of the Ring/);
  s = choose(s, "exhaust");
  s = settle(s);
  assert.equal(oneRing(s)!.exhausted, true);
  assert.ok(
    s.staging.some((u) => u.code === SP.greenHill),
    "surge",
  );
  let t = base();
  oneRing(t)!.exhausted = true;
  reveal(t, SP.lure, [SP.greenHill]);
  t = settle(t);
  assert.equal(t.threat, 23);
  for (const exhausted of [false, true]) {
    const u = base();
    oneRing(u)!.exhausted = exhausted;
    const rider = engaged(u, SP.rider);
    u.combat = {
      enemyId: rider.id,
      defenderId: null,
      defenderIds: [],
      attackBonus: 0,
      attackPlayer: 0,
    };
    H.shadow!(u, SP.lure);
    assert.equal(u.combat.attackBonus, exhausted ? 2 : 1);
  }
});

test("Crawling Towards Him: its Hide 2 test resolves first, then a player who failed a Hide test this phase removes their characters from the quest; its shadow returns the attacker to the staging area", () => {
  let s = base();
  s.phase = "staging";
  const [a, b] = s.heroes;
  a.committed = true;
  s.committedIds = [a.id];
  reveal(s, SP.crawling, [SP.greenHill, SP.greenHill]);
  s.phase = "staging";
  s = hide(s, [b.id]);
  s = settle(resolveHide(s));
  assert.equal(
    get(s, a.id)!.committed,
    false,
    "failed: removed from the quest",
  );
  let t = base();
  const [c] = t.heroes;
  c.committed = true;
  t.committedIds = [c.id];
  reveal(t, SP.crawling, [SP.rider, SP.rider]);
  t = hide(
    t,
    t.heroes.slice(1).map((h) => h.id),
  );
  t.hideTest!.discarded = [];
  t = settle(resolveHide(t));
  assert.equal(get(t, c.id)!.committed, true, "passed: still questing");
  // Shadow (also Rode Like a Gale): return the attacker after the attack.
  for (const shadow of [SP.crawling, SP.gale]) {
    let u = base();
    const rider = engaged(u, SP.rider);
    rider.shadows = [shadow];
    u.phase = "defense";
    u = act(u, {
      type: "DEFEND",
      enemyId: rider.id,
      defenderId: u.heroes[0].id,
    });
    u = settle(u);
    assert.ok(
      u.staging.some((x) => x.id === rider.id),
      "back in the staging area",
    );
  }
});

test("Hunting for the Ring: starting with the last player, each player returns an engaged Nazgûl enemy to the staging area or makes a Hide 2 test", () => {
  const s = base(2);
  const order = playerOrder(s);
  const last = order[1];
  const rider = engaged(s, SP.rider, last);
  let t = base(2);
  const r2 = engaged(t, SP.rider, last);
  t.phase = "staging";
  t.encounterDeck = [SP.hunting, ...Array(8).fill(SP.greenHill)];
  handle(t, fx("reveal", { player: order[0] }));
  run(t);
  assert.match(t.choice!.title, /Hunting for the Ring/);
  assert.equal(t.table!.active, last, "the last player resolves first");
  t = choose(t, r2.id);
  assert.ok(t.staging.some((u) => u.id === r2.id));
  assert.match(
    t.choice!.title,
    /Hide 2 test/,
    "then the first player, with no Nazgûl, tests",
  );
  assert.equal(t.hideTest!.player, order[0]);
  for (const p of order) assert.equal(seatView(t, p).threat, 22, "Doomed 2");
  void rider;
});

test("Have you seen Baggins? attaches to a hero, which is discarded when a player fails a Hide test", () => {
  let s = base();
  const glóin = s.heroes[2];
  reveal(s, SP.baggins, [SP.greenHill, SP.greenHill, SP.greenHill]);
  assert.match(s.choice!.title, /Have you seen Baggins\?/);
  s = choose(s, glóin.id);
  assert.ok(get(s, glóin.id)!.attachments.some((a) => a.code === SP.baggins));
  s = settle(s);
  assert.ok(
    s.staging.some((u) => u.code === SP.greenHill),
    "surge",
  );
  // A failed Hide test discards the hero.
  s.encounterDeck = [SP.rider, SP.greenHill, SP.greenHill];
  s.phase = "staging";
  handle(s, fx("reveal", { player: 0 }));
  run(s);
  s = hide(s, []);
  s = settle(resolveHide(s), "undefended");
  assert.ok(!get(s, glóin.id), "Glóin is discarded");
  assert.ok(s.discard.includes(glóin.code));
  assert.ok(s.encounterDiscard.includes(SP.baggins));
});

test("Piercing Cry finds a Nazgûl enemy for the staging area or engaged with the first player; its shadow gives an additional attack", () => {
  for (const where of ["staging", "engaged"] as const) {
    let s = base();
    s.encounterDiscard = [SP.rider];
    reveal(s, SP.cry, [SP.greenHill, SP.greenHill]);
    s = choose(s, where);
    s = settle(s);
    const inStaging = s.staging.some((u) => u.code === SP.rider);
    assert.equal(inStaging, where === "staging");
    assert.equal(
      s.engaged.some((u) => u.code === SP.rider),
      where === "engaged",
    );
    assert.ok(
      !s.log.some((l) => /Hide 2 test/.test(l.text)),
      "not revealed: no Hide test",
    );
  }
  const u = base();
  const rider = engaged(u, SP.rider);
  u.combat = {
    enemyId: rider.id,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
    attackPlayer: 0,
  };
  H.shadow!(u, SP.cry);
  assert.equal(u.combat.extraAttacks, 1);
});

test("Black Steed: a Morgul Mount on a Nazgûl enemy (−10 engagement cost) that returns it to the staging area at the end of the round; Black Riders take no other attachments", () => {
  let s = base();
  const rider = stage(s, SP.rider);
  const before = engagementCost(s, rider);
  reveal(s, SP.steed, [SP.greenHill, SP.greenHill]);
  s = choose(s, rider.id);
  s = settle(s);
  assert.ok(get(s, rider.id)!.attachments.some((a) => a.code === SP.steed));
  assert.equal(engagementCost(s, get(s, rider.id)!), before - 10);
  assert.ok(!s.encounterDiscard.includes(SP.steed), "attached, not discarded");
  assert.equal(H.cannotAttach!(s, get(s, rider.id)!, SP.steed), false);
  assert.equal(
    H.cannotAttach!(s, get(s, rider.id)!, "01073"),
    true,
    "a non-Morgul attachment",
  );
  // End of the round: an engaged Black Rider with a Steed returns.
  const r2 = engaged(s, SP.rider);
  r2.attachments.push({ id: "steed-2", code: SP.steed, exhausted: false });
  play(s, ...H.roundEnd!(s));
  assert.ok(s.staging.some((u) => u.id === r2.id));
  // No Nazgûl in play: it is discarded (and surges).
  let t = base();
  reveal(t, SP.steed, [SP.greenHill, SP.greenHill, SP.greenHill]);
  t = settle(t);
  assert.ok(t.encounterDiscard.includes(SP.steed));
});

test("Rode Like a Gale returns each engaged Nazgûl enemy to the staging area, or gains surge", () => {
  let s = base(2);
  const a = engaged(s, SP.rider, 0);
  const b = engaged(s, SP.rider, 1);
  reveal(s, SP.gale, [SP.greenHill]);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === a.id));
  assert.ok(s.staging.some((u) => u.id === b.id));
  assert.ok(!s.staging.some((u) => u.code === SP.greenHill), "no surge");
  let t = base();
  reveal(t, SP.gale, [SP.greenHill]);
  t = settle(t);
  assert.ok(
    t.staging.some((u) => u.code === SP.greenHill),
    "surge",
  );
});

test("The Marish shuffles a Nazgûl enemy from the discard pile back after a failed Hide test; Marish, Green Hill Country and Evil Crow shadows punish a failure this round", () => {
  let s = base();
  stage(s, SP.marish);
  s.encounterDiscard = [SP.rider, SP.greenHill];
  reveal(s, SP.rider, [SP.greenHill, SP.greenHill]);
  s = hide(s, []);
  s = settle(resolveHide(s), "undefended");
  assert.ok(!s.encounterDiscard.includes(SP.rider));
  assert.ok(s.encounterDeck.includes(SP.rider));
  for (const failed of [false, true]) {
    for (const code of [SP.marish, SP.greenHill]) {
      const u = base();
      if (failed)
        u.hideFailures = [{ player: 0, round: u.round, phase: "staging" }];
      const rider = engaged(u, SP.rider);
      u.combat = {
        enemyId: rider.id,
        defenderId: u.heroes[0].id,
        defenderIds: [u.heroes[0].id],
        attackBonus: 0,
        attackPlayer: 0,
      };
      H.shadow!(u, code);
      assert.equal(u.combat.attackBonus, failed ? 2 : 1);
      H.shadow!(u, SP.crow);
      assert.equal(u.combat.defenderIds!.length, failed ? 0 : 1);
    }
  }
});

test("Pathless Country has +4 quest points in the staging area; its shadow sends the attacker to the next player for an immediate attack", () => {
  const s = base();
  const p = stage(s, SP.pathless);
  assert.equal(H.locationQuestBonus!(s, p), 4);
  s.staging = [];
  s.activeLocation = p;
  assert.equal(H.locationQuestBonus!(s, p), 0);
  let t = base(2);
  const first = t.table!.first;
  const rider = engaged(t, SP.rider, first);
  rider.shadows = [SP.pathless];
  t.phase = "defense";
  t = act(t, {
    type: "DEFEND",
    enemyId: rider.id,
    defenderId: seatView(t, first).heroes[0].id,
  });
  for (let n = 0; n < 20 && !t.choice?.title.includes("Immediate attack"); n++)
    t = t.flow?.pending
      ? applyAction(reload(t), { type: "CONTINUE", stepId: t.flow.pending.id })
      : choose(t, t.choice!.options[0].id);
  assert.ok(seatView(t, 1 - first).engaged.some((u) => u.id === rider.id));
});

test("Stock-brook makes the players travel there at once, returning the active location; after travelling to Bamfurlong each player engaged with a Nazgûl may ready a hero", () => {
  let s = base();
  const old = make(s, SP.greenHill);
  s.activeLocation = old;
  reveal(s, SP.stockBrook, [SP.greenHill]);
  s = settle(s);
  assert.equal(s.activeLocation!.code, SP.stockBrook);
  assert.ok(s.staging.some((u) => u.id === old.id));
  let t = base();
  engaged(t, SP.rider);
  const hero = t.heroes[0];
  hero.exhausted = true;
  const bam = stage(t, SP.bamfurlong);
  t.phase = "travel";
  t = act(t, { type: "TRAVEL", id: bam.id });
  assert.match(t.choice!.title, /Bamfurlong · Ready a hero/);
  t = choose(t, hero.id);
  assert.equal(get(t, hero.id)!.exhausted, false);
});

test("Saves keep a Hide test in progress, failures this round and the set-aside Ferry; malformed state is rejected", () => {
  let s = base();
  reveal(s, SP.crawling, [SP.greenHill, SP.greenHill]);
  assert.ok(s.hideTest);
  s = reload(s);
  assert.equal(s.hideTest!.phase, "committing");
  assert.deepEqual(
    s.shadowPast!.resolving.map((u) => u.code),
    [SP.crawling],
  );
  s = hide(s, []);
  s = reload(s);
  assert.equal(s.hideTest!.discarded.length, 2);
  s = settle(resolveHide(s));
  assert.deepEqual(s.shadowPast!.resolving, []);
  assert.ok(s.encounterDiscard.includes(SP.crawling));
  assert.equal(hideFailed(s, 0, "round"), true);
  const raw = () => JSON.parse(JSON.stringify(s));
  const bad = (mutate: (x: GameState) => void, why: string) => {
    const x = raw();
    mutate(x);
    assert.equal(validateSave(x), false, why);
  };
  bad(
    (x) => (x.shadowPast!.setAside = [SP.rider]),
    "only the Ferry is set aside",
  );
  bad((x) => (x.shadowPast!.currentQuest = SP.buckland), "quest matches stage");
  bad(
    (x) => (x.hideFailures = [{ player: 5, round: 1, phase: "quest" }]),
    "failure seat",
  );
  bad(
    (x) =>
      (x.hideTest = {
        phase: "actions",
        player: 0,
        value: 2,
        source: SP.rider,
        committedIds: [],
        discarded: [],
        continuation: "x",
      } as never),
    "hide test shape",
  );
});

test("The scenario panel's public state reports Bag End, the Ferry and the Hide test", () => {
  const s = base();
  assert.deepEqual(shadowPastPublicState(s), {
    currentQuest: SP.company,
    bagEndExplored: false,
    ferryAside: true,
    ferryInPlay: false,
    resolving: 0,
  });
  s.victoryCards = [SP.bagEnd];
  assert.equal(shadowPastPublicState(s)!.bagEndExplored, true);
  void threatOf;
  void hand;
});

test("An enemy destroyed during its additional attack discards the shadow card held from its first attack", () => {
  let s = base();
  const crow = engaged(s, SP.crow);
  crow.shadows = [SP.cry];
  crow.damage = 1;
  s.encounterDeck = [SP.greenHill, SP.greenHill, SP.greenHill];
  const [spear] = allies(s, ["01029"]);
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: crow.id, defenderId: s.heroes[0].id });
  for (
    let n = 0;
    n < 20 && s.status === "playing" && (s.choice || s.flow?.pending);
    n++
  )
    s = s.choice
      ? choose(
          s,
          s.choice.options.find((o) => o.id === spear.id)?.id ??
            s.choice.options[0].id,
        )
      : applyAction(reload(s), {
          type: "CONTINUE",
          stepId: s.flow!.pending!.id,
        });
  assert.ok(!get(s, crow.id), "Gondorian Spearman destroys the Evil Crow");
  assert.ok(s.encounterDiscard.includes(SP.cry), "Piercing Cry is discarded");
});
