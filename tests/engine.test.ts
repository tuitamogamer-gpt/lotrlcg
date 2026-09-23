import test from "node:test";
import assert from "node:assert/strict";
import { STARTERS, card, encounterCards } from "../src/game/cards.ts";
import {
  applyAction as act,
  createGame,
  stats,
  stagingThreat,
  questWill,
  score,
  validateSave,
  canPlay,
} from "../src/game/engine.ts";
import type { GameState, Unit, Action } from "../src/game/types.ts";
let counter = 5000;
const unit = (code: string): Unit => ({
  id: `test${counter++}`,
  code,
  damage: 0,
  progress: 0,
  resources: 0,
  exhausted: false,
  committed: false,
  attachments: [],
  boost: 0,
  attacked: false,
  shadows: [],
});
function game(id = "leadership") {
  const d = STARTERS.find((d) => d.id === id)!;
  return act(createGame(42, d.cards, d.heroes, d.id), { type: "KEEP" });
}
function settle(s: GameState) {
  let guard = 0;
  while (s.choice && s.status === "playing") {
    assert.ok(guard++ < 40);
    const o =
      s.choice.options.find((o) => o.id === "skip") ??
      s.choice.options.find((o) => o.id === "resolve") ??
      s.choice.options[0];
    s = act(s, { type: "CHOOSE", id: o.id });
  }
  return s;
}
function hand(s: GameState, code: string) {
  const u = unit(code);
  s.hand = [u];
  s.heroes.forEach((h) => (h.resources = 20));
  return u;
}
function play(
  s: GameState,
  code: string,
  target?: string,
  extra: Partial<Action> = {},
) {
  const u = hand(s, code);
  return act(s, { type: "PLAY", id: u.id, target, ...extra } as Action);
}
for (const d of STARTERS) {
  test(`${d.subtitle}: exact original 30-card starter deck and heroes`, () => {
    assert.equal(
      Object.values(d.cards).reduce((a, b) => a + b, 0),
      30,
    );
    assert.equal(d.cards["01073"], 1);
    const s = createGame(9, d.cards, d.heroes, d.id);
    assert.equal(s.hand.length, 6);
    assert.equal(s.deck.length, 24);
    assert.deepEqual(
      s.heroes.map((h) => h.code),
      d.heroes,
    );
    assert.equal(
      s.threat,
      d.heroes.reduce((n, c) => n + (card(c).threat ?? 0), 0),
    );
    assert.equal(s.encounterDeck.length, 34);
    assert.equal(s.staging.length, 2);
    assert.ok(validateSave(s));
  });
}
test("scenario uses exact 36-card original encounter list", () =>
  assert.equal(
    encounterCards.reduce((n, c) => n + (c.quantity ?? 0), 0),
    36,
  ));
test("seeded shuffling is deterministic and inputs remain immutable", () => {
  const s = game(),
    before = JSON.stringify(s);
  const n = act(s, { type: "NEXT" });
  assert.equal(JSON.stringify(s), before);
  assert.equal(n.phase, "quest");
  assert.deepEqual(game(), s);
});
test("one mulligan is allowed, then round 1 grants resources and seventh card", () => {
  const d = STARTERS[0];
  let s = createGame(3, d.cards, d.heroes, d.id);
  s = act(s, { type: "MULLIGAN" });
  assert.throws(() => act(s, { type: "MULLIGAN" }));
  s = act(s, { type: "KEEP" });
  assert.equal(s.hand.length, 7);
  assert.equal(s.deck.length, 23);
  assert.ok(s.heroes.every((h) => h.resources === 1));
});
test("wrong phase, sphere and malformed payment are rejected without changing state", () => {
  const s = game();
  const u = hand(s, "01013");
  assert.throws(() =>
    act(s, { type: "PLAY", id: u.id, payment: { [s.heroes[0].id]: -2 } }),
  );
  s.phase = "quest";
  assert.throws(() => act(s, { type: "PLAY", id: u.id }));
  s.phase = "planning";
  const w = hand(s, "01028");
  assert.throws(() => act(s, { type: "PLAY", id: w.id }));
});
test("quest commits exhaust, Théodred supplies a chosen hero and Aragorn can ready", () => {
  let s = game();
  s = act(s, { type: "NEXT" });
  for (const h of s.heroes.slice(0, 2))
    s = act(s, { type: "TOGGLE_QUEST", id: h.id });
  s.encounterDeck = ["01099"];
  s = act(s, { type: "COMMIT" });
  assert.match(s.choice!.title, /Théodred/);
  s = act(s, { type: "CHOOSE", id: s.heroes[0].id });
  s = act(s, { type: "CHOOSE", id: "ready" });
  assert.equal(s.phase, "staging");
  assert.equal(s.heroes[0].exhausted, false);
  assert.equal(s.heroes[0].committed, true);
  assert.equal(s.heroes[0].resources, 1);
});
test("quest progress explores active location before current quest", () => {
  let s = game("spirit");
  s.phase = "staging";
  s.staging = [];
  s.heroes[0].committed = true;
  s.activeLocation = unit("01077");
  s = act(s, { type: "NEXT" });
  assert.equal(s.activeLocation, null);
  assert.equal(s.progress, 2);
  assert.equal(s.phase, "travel");
});
test("quest failure raises threat, and 50 threat loses immediately", () => {
  let s = game();
  s.phase = "staging";
  s.threat = 49;
  s = act(s, { type: "NEXT" });
  assert.equal(s.status, "lost");
});
test("travel costs reject unaffordable choices and old road readies a selected character", () => {
  let s = game();
  s.phase = "travel";
  const web = unit("01077");
  s.staging = [web];
  s.heroes.forEach((h) => (h.exhausted = true));
  assert.throws(() => act(s, { type: "TRAVEL", id: web.id }));
  const road = unit("01099");
  s.staging = [road];
  s = act(s, { type: "TRAVEL", id: road.id });
  s = act(s, { type: "CHOOSE", id: s.heroes[0].id });
  assert.equal(s.heroes[0].exhausted, false);
  assert.equal(s.phase, "encounter");
});
test("engagement threshold, optional one-enemy cap and Forest Spider bonus", () => {
  let s = game();
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: s.staging[0].id });
  assert.equal(stats(s, s.engaged[0]).attack, 3);
  assert.throws(() => act(s, { type: "ENGAGE", id: s.staging[0].id }));
  s = act(s, { type: "NEXT" });
  assert.equal(s.phase, "defense");
  assert.equal(s.engaged[0].shadows.length, 1);
});
test("defense subtracts armor; undefended attacks put full damage on one hero", () => {
  let s = game();
  s.phase = "defense";
  s.engaged = [unit("01096")];
  s.engaged[0].shadows = [];
  const aragorn = s.heroes[0].id;
  s = act(s, { type: "DEFEND", enemyId: s.engaged[0].id, defenderId: aragorn });
  assert.equal(s.heroes[0].damage, 0);
  assert.equal(s.heroes[0].exhausted, true);
  assert.equal(s.phase, "attack");
  s.phase = "defense";
  s.engaged[0].attacked = false;
  s = act(s, { type: "DEFEND", enemyId: s.engaged[0].id, defenderId: null });
  assert.ok(s.choice);
  s = act(s, { type: "CHOOSE", id: aragorn });
  assert.equal(s.heroes[0].damage, 2);
});
test("Hasty Stroke cancels a revealed shadow", () => {
  let s = game("spirit");
  hand(s, "01048");
  s.phase = "defense";
  s.engaged = [unit("01096")];
  s.engaged[0].shadows = ["01076"];
  const before = s.threat;
  s = act(s, {
    type: "DEFEND",
    enemyId: s.engaged[0].id,
    defenderId: s.heroes[1].id,
  });
  assert.ok(s.choice);
  s = act(s, { type: "CHOOSE", id: "cancel" });
  assert.equal(s.threat, before);
  assert.equal(s.discard.at(-1), "01048");
});
test("A Test of Will cancels treachery and spends a Spirit resource", () => {
  let s = game("spirit");
  hand(s, "01050");
  s.phase = "quest";
  s.heroes[0].exhausted = true;
  s.encounterDeck = ["01093", "01099"];
  s = act(s, { type: "COMMIT" });
  s = act(s, { type: "CHOOSE", id: "cancel" });
  assert.equal(s.heroes[0].damage, 0);
  assert.ok(s.encounterDiscard.includes("01093"));
});
test("Gandalf enters, chooses damage or threat or draw, and departs at round end", () => {
  let s = play(game(), "01073");
  assert.equal(s.choice!.options.length, 3);
  const threat = s.threat;
  s = act(s, { type: "CHOOSE", id: "threat" });
  assert.equal(s.threat, threat - 5);
  s.phase = "attack";
  s = settle(act(s, { type: "END_ATTACKS" }));
  assert.equal(s.allies.length, 1);
  s = settle(act(s, { type: "NEXT" }));
  assert.equal(s.allies.length, 0);
  assert.ok(s.discard.includes("01073"));
});
test("Steward and Unexpected Courage exhaust and reset at refresh", () => {
  let s = game("spirit");
  const hero = s.heroes[0].id;
  s = play(s, "01057", hero);
  s.heroes[0].exhausted = true;
  s = act(s, {
    type: "ABILITY",
    id: hero,
    attachmentId: s.heroes[0].attachments[0].id,
  });
  assert.equal(s.heroes[0].exhausted, false);
  assert.throws(() =>
    act(s, {
      type: "ABILITY",
      id: hero,
      attachmentId: s.heroes[0].attachments[0].id,
    }),
  );
  s.phase = "attack";
  s = act(s, { type: "END_ATTACKS" });
  assert.equal(s.heroes[0].attachments[0].exhausted, false);
});
test("Gloin resources and Gimli attack scale with damage", () => {
  let s = game();
  s.phase = "defense";
  s.engaged = [unit("01097")];
  s = act(s, {
    type: "DEFEND",
    enemyId: s.engaged[0].id,
    defenderId: s.heroes[2].id,
  });
  assert.equal(s.heroes[2].resources, 3);
  assert.equal(s.heroes[2].damage, 2);
  const t = game("tactics");
  t.heroes[0].damage = 2;
  assert.equal(stats(t, t.heroes[0]).attack, 4);
});
test("Thalin damages enemies as revealed", () => {
  let s = game("tactics");
  s.phase = "quest";
  s.encounterDeck = ["01096"];
  s = act(s, { type: "TOGGLE_QUEST", id: s.heroes[2].id });
  s = act(s, { type: "COMMIT" });
  assert.equal(s.staging.at(-1)!.damage, 1);
});
test("Legolas and Blade of Gondolin add progress on a kill", () => {
  let s = game("tactics");
  s.phase = "attack";
  const h = s.heroes[1];
  h.attachments.push({ id: "blade", code: "01039", exhausted: false });
  const enemy = unit("01097");
  s.engaged = [enemy];
  s = act(s, { type: "ATTACK", enemyId: enemy.id, attackerIds: [h.id] });
  assert.equal(s.engaged.length, 0);
  assert.equal(s.progress, 3);
});
test("Eleanor cancels and replaces a treachery", () => {
  let s = game("spirit");
  s.hand = [];
  s.phase = "quest";
  s.encounterDeck = ["01093", "01099", "01099"];
  s = act(s, { type: "COMMIT" });
  s = act(s, { type: "CHOOSE", id: "eleanor" });
  assert.equal(s.heroes[1].exhausted, true);
  assert.ok(s.encounterDiscard.includes("01093"));
  assert.equal(s.staging.at(-1)!.code, "01099");
});
test("Dunhere attacks staging alone with +1 attack", () => {
  let s = game("spirit");
  s.phase = "attack";
  const e = unit("01097");
  s.staging = [e];
  s = act(s, { type: "ATTACK", enemyId: e.id, attackerIds: [s.heroes[2].id] });
  assert.equal(s.staging.length, 0);
});
test("Denethor can move a scouted encounter to bottom", () => {
  let s = game("lore");
  const top = s.encounterDeck[0];
  s = act(s, { type: "ABILITY", id: s.heroes[0].id });
  assert.equal(s.peek, top);
  s = act(s, { type: "CHOOSE", id: "bottom" });
  assert.equal(s.encounterDeck.at(-1), top);
});
test("Beravor once-per-round limit survives being readied", () => {
  let s = game("lore");
  const id = s.heroes[2].id,
    before = s.hand.length;
  s = act(s, { type: "ABILITY", id });
  assert.equal(s.hand.length, before + 2);
  s.heroes[2].exhausted = false;
  assert.throws(() => act(s, { type: "ABILITY", id }));
});
test("Glorfindel pays his own resource and heals once", () => {
  let s = game("lore");
  const id = s.heroes[1].id;
  s.heroes[0].damage = 2;
  s = act(s, { type: "ABILITY", id });
  s = act(s, { type: "CHOOSE", id: s.heroes[0].id });
  assert.equal(s.heroes[0].damage, 1);
  assert.equal(s.heroes[1].resources, 0);
});
test("Feint prevents enemy attack without preventing player attack", () => {
  let s = game("tactics");
  s.phase = "defense";
  s.engaged = [unit("01096")];
  s = play(s, "01034", s.engaged[0].id);
  assert.equal(s.phase, "attack");
  s = act(s, {
    type: "ATTACK",
    enemyId: s.engaged[0].id,
    attackerIds: s.heroes.slice(0, 2).map((h) => h.id),
  });
  assert.equal(s.engaged.length, 0);
});
test("Thicket of Spears rejects payment from a single hero", () => {
  const s = game("tactics");
  s.phase = "defense";
  const h = hand(s, "01036");
  assert.throws(() =>
    act(s, { type: "PLAY", id: h.id, payment: { [s.heroes[0].id]: 3 } }),
  );
  const n = act(s, {
    type: "PLAY",
    id: h.id,
    payment: Object.fromEntries(s.heroes.map((h) => [h.id, 1])),
  });
  assert.equal(n.phase, "attack");
});
test("Stand Together combines defenders and assigns damage to one", () => {
  let s = game("tactics");
  s.phase = "defense";
  s.engaged = [unit("01076")];
  s = play(s, "01038");
  s = act(s, {
    type: "DEFEND",
    enemyId: s.engaged[0].id,
    defenderId: s.heroes[0].id,
    defenderIds: [s.heroes[0].id, s.heroes[1].id],
  });
  assert.ok(s.choice);
  s = act(s, { type: "CHOOSE", id: s.heroes[0].id });
  assert.equal(s.heroes[0].damage, 2);
  assert.equal(s.heroes[1].damage, 0);
});
test("Citadel Plate and Dwarven Axe modify health and attack", () => {
  let s = game("tactics");
  const id = s.heroes[0].id;
  s = play(s, "01040", id);
  s = play(s, "01041", id);
  assert.equal(stats(s, s.heroes[0]).health, 9);
  assert.equal(stats(s, s.heroes[0]).attack, 4);
  assert.throws(() => play(s, "01039", id));
});
test("Beorn fury returns Beorn to deck at end of combat", () => {
  let s = game("tactics");
  const b = unit("01031");
  s.allies = [b];
  s.phase = "attack";
  s = act(s, { type: "ABILITY", id: b.id });
  assert.equal(stats(s, s.allies[0]).attack, 8);
  s = act(s, { type: "END_ATTACKS" });
  assert.equal(s.allies.length, 0);
  assert.ok(s.deck.includes("01031"));
});
test("Forest Snare skips trapped enemy attacks", () => {
  let s = game("lore");
  s.engaged = [unit("01076")];
  s = play(s, "01069", s.engaged[0].id);
  s.phase = "encounter";
  s.staging = [];
  s = act(s, { type: "NEXT" });
  assert.equal(s.phase, "attack");
});
test("Enchanted Stream blocks draw including resource and abilities", () => {
  let s = game("lore");
  s.activeLocation = unit("01095");
  const before = s.hand.length;
  assert.throws(() => act(s, { type: "ABILITY", id: s.heroes[2].id }));
  s.phase = "refresh";
  s = act(s, { type: "NEXT" });
  assert.equal(s.hand.length, before);
});
test("Power in the Earth reduces location threat, not below zero", () => {
  let s = game("spirit");
  const u = s.staging.find((u) => u.code === "01099")!;
  s = play(s, "01056", u.id);
  assert.equal(stagingThreat(s), 2);
});
test("Will of the West shuffles discard and removes itself", () => {
  let s = game("spirit");
  s.discard = ["01043", "01044"];
  s = play(s, "01049");
  assert.equal(s.discard.length, 0);
  assert.deepEqual(s.removed, ["01049"]);
  assert.ok(s.deck.includes("01043"));
});
test("Stand and Fight pays the ally cost and cannot revive neutral Gandalf", () => {
  let s = game("spirit");
  s.discard = ["01043", "01073"];
  s = play(s, "01051", "discard-0");
  assert.equal(s.allies[0].code, "01043");
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    58,
  );
  const u = hand(s, "01051");
  assert.throws(() => act(s, { type: "PLAY", id: u.id, target: "discard-0" }));
});
test("Miner removes a Condition and Hammersmith recovers top attachment", () => {
  let s = game("lore");
  s.heroes[0].attachments = [{ id: "web", code: "01080", exhausted: false }];
  s = play(s, "01061");
  s = act(s, { type: "CHOOSE", id: "web" });
  assert.equal(s.heroes[0].attachments.length, 0);
  s.discard = ["01072", "01069"];
  s = play(s, "01059");
  assert.equal(s.hand.at(-1)!.code, "01069");
});
test("Protector of Lorien is capped at 3 uses each phase", () => {
  let s = game("lore");
  const id = s.heroes[0].id;
  s = play(s, "01070", id);
  const aid = s.heroes[0].attachments[0].id;
  for (let i = 0; i < 3; i++) {
    s.hand = [unit("01063")];
    s = act(s, { type: "ABILITY", id, attachmentId: aid });
    s = act(s, { type: "CHOOSE", id: s.choice!.options[0].id });
  }
  assert.equal(stats(s, s.heroes[0]).will, 4);
  s.hand = [unit("01063")];
  assert.throws(() => act(s, { type: "ABILITY", id, attachmentId: aid }));
  s = act(s, { type: "NEXT" });
  assert.equal(stats(s, s.heroes[0]).will, 1);
});
test("Gandalf Search chooses and reorders remaining top cards", () => {
  let s = game("lore");
  s.deck = ["01058", "01059", "01060", "01061"];
  s = play(s, "01067", undefined, { amount: 3 });
  s = act(s, { type: "CHOOSE", id: "search-1" });
  s = act(s, { type: "CHOOSE", id: "order1" });
  s = act(s, { type: "CHOOSE", id: "order0" });
  assert.equal(s.hand.at(-1)!.code, "01059");
  assert.deepEqual(s.deck.slice(0, 3), ["01060", "01058", "01061"]);
});
test("Beorns Path requires 10 progress and no Spawn in play", () => {
  let s = game("spirit");
  s.stage = 3;
  s.branch = "beorn";
  s.progress = 9;
  s.phase = "staging";
  s.staging = [];
  s.heroes[0].committed = true;
  s = act(s, { type: "NEXT" });
  assert.equal(s.status, "won");
  assert.ok(Number.isFinite(score(s)));
});
test("Dont Leave the Path wins only when Spawn is defeated during that stage", () => {
  let s = game("tactics");
  s.stage = 3;
  s.branch = "spider";
  s.phase = "attack";
  const e = unit("01076");
  e.damage = 8;
  s.engaged = [e];
  s = act(s, { type: "ATTACK", enemyId: e.id, attackerIds: [s.heroes[1].id] });
  assert.equal(s.status, "won");
});
test("save roundtrip preserves pending response and deterministic future", () => {
  let s = game();
  s.phase = "quest";
  s.committedIds = [s.heroes[0].id];
  s = act(s, { type: "COMMIT" });
  const loaded = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(loaded));
  assert.deepEqual(settle(s), settle(loaded));
});
test("no full deck information leaks through normal browser text state", async () => {
  const { publicState } = await import("../src/game/engine.ts");
  const p = publicState(game());
  assert.ok(!("encounterDeck" in p));
  assert.ok(!("deck" in p) || typeof p.deck === "string");
});

test("Swift Strike can destroy an attacker before its shadow resolves", () => {
  let s = game("tactics");
  s.phase = "defense";
  const e = unit("01097");
  e.shadows = ["01076"];
  s.engaged = [e];
  hand(s, "01037");
  const threat = s.threat;
  s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: s.heroes[0].id });
  s = act(s, { type: "CHOOSE", id: "play" });
  assert.equal(s.engaged.length, 0);
  assert.equal(s.threat, threat);
  assert.equal(s.phase, "attack");
});
test("Losing Citadel Plate immediately defeats an already heavily damaged hero", () => {
  let s = game("tactics");
  const h = s.heroes[0];
  h.attachments = [{ id: "plate", code: "01040", exhausted: false }];
  h.damage = 6;
  s.phase = "defense";
  const e = unit("01096");
  e.shadows = ["01096"];
  s.engaged = [e];
  s.hand = [];
  s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: s.heroes[1].id });
  s = act(s, { type: "CHOOSE", id: "plate" });
  assert.ok(!s.heroes.some((u) => u.id === h.id));
  assert.ok(s.discard.includes("01004"));
});
test("Shadow cards stay on an enemy until combat ends", () => {
  let s = game();
  s.phase = "defense";
  const e = unit("01096");
  e.shadows = ["01099"];
  s.engaged = [e];
  s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: s.heroes[0].id });
  assert.deepEqual(s.engaged[0].shadows, ["01099"]);
  s = settle(act(s, { type: "END_ATTACKS" }));
  assert.deepEqual(s.engaged[0].shadows, []);
  assert.ok(s.encounterDiscard.includes("01099"));
});
test("Effects lasting for one phase expire between encounter and combat", () => {
  let s = game();
  s.phase = "encounter";
  s = play(s, "01022");
  assert.equal(stats(s, s.heroes[0]).attack, 4);
  s = act(s, { type: "NEXT" });
  assert.equal(stats(s, s.heroes[0]).attack, 3);
});
test("The empty encounter deck reshuffles during the quest phase", () => {
  let s = game("tactics");
  s.phase = "quest";
  s.hand = [];
  s.encounterDeck = ["01093"];
  s.encounterDiscard = ["01099"];
  s = act(s, { type: "COMMIT" });
  assert.ok(s.encounterDeck.length > 0);
  assert.ok(s.encounterDeck.includes("01099"));
});
test("Malformed imported unit and choice structures are rejected", () => {
  const s = game();
  const a = structuredClone(s) as any;
  delete a.heroes[0].attachments;
  assert.equal(validateSave(a), false);
  const b = structuredClone(s) as any;
  b.choice = { title: "Invalid", options: [{ label: "bad", effects: [] }] };
  assert.equal(validateSave(b), false);
  assert.equal(validateSave({ version: 1 }), false);
});
test("Valiant Sacrifice can respond to a fallen ally", () => {
  let s = game();
  const ally = unit("01016");
  s.allies = [ally];
  hand(s, "01024");
  s.phase = "defense";
  s.engaged = [unit("01096")];
  s = act(s, { type: "DEFEND", enemyId: s.engaged[0].id, defenderId: ally.id });
  assert.match(s.choice!.title, /Valiant Sacrifice/);
  const n = s.hand.length;
  s = act(s, { type: "CHOOSE", id: "play" });
  assert.equal(s.hand.length, n + 1);
  assert.equal(s.allies.length, 0);
});
test("Brok can enter without payment after a Dwarf hero falls", () => {
  let s = game();
  hand(s, "01019");
  s.heroes[2].damage = 3;
  s.phase = "defense";
  const e = unit("01096");
  s.engaged = [e];
  s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: s.heroes[2].id });
  assert.match(s.choice!.title, /Brok/);
  s = act(s, { type: "CHOOSE", id: "play" });
  assert.equal(s.allies[0].code, "01019");
});
test("Strength of Will pays by exhausting a Spirit character after travel", () => {
  let s = game("spirit");
  s.phase = "travel";
  hand(s, "01047");
  const loc = unit("01077");
  s.staging = [loc];
  s = act(s, { type: "TRAVEL", id: loc.id });
  s = act(s, { type: "CHOOSE", id: s.heroes[0].id });
  assert.match(s.choice!.title, /Strength of Will/);
  s = act(s, { type: "CHOOSE", id: s.heroes[1].id });
  assert.equal(s.activeLocation, null);
  assert.equal(s.heroes[1].exhausted, true);
});
test("Sneak Attack returns its ally at the end of the current phase", () => {
  let s = game();
  hand(s, "01023");
  const a = unit("01013");
  s.hand.push(a);
  s = act(s, { type: "PLAY", id: s.hand[0].id });
  s = act(s, { type: "CHOOSE", id: a.id });
  assert.equal(s.allies.length, 1);
  s = act(s, { type: "NEXT" });
  assert.equal(s.allies.length, 0);
  assert.ok(s.hand.some((u) => u.code === "01013"));
});

test("Quick Strike killing the last enemy cannot leave defense stuck", () => {
  let s = game("tactics");
  const e = unit("01097");
  s.engaged = [e];
  s.phase = "defense";
  s = play(s, "01035", s.heroes[1].id);
  s = act(s, { type: "CHOOSE", id: e.id });
  assert.equal(s.engaged.length, 0);
  assert.equal(s.phase, "attack");
});
test("Using an exhaust ability removes a preselected character from quest selection", () => {
  let s = game();
  const faramir = unit("01014");
  s.allies = [faramir];
  s.phase = "quest";
  s = act(s, { type: "TOGGLE_QUEST", id: faramir.id });
  s = act(s, { type: "ABILITY", id: faramir.id });
  assert.deepEqual(s.committedIds, []);
  assert.doesNotThrow(() => act(s, { type: "COMMIT" }));
});
