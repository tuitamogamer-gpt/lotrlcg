import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { card, STARTERS } from "../src/game/cards.ts";
import { createGame } from "../src/game/engine.ts";
import {
  enemyAddedToStaging,
  progressLocation,
  takePlayerDiscard,
} from "../src/game/board.ts";
import { playerAttack } from "../src/game/combat.ts";
import { fx, stats } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { SHADOW_FLAME } from "../src/game/shadow-flame-support.ts";
import type { Effect, GameState, Unit } from "../src/game/types.ts";
let nextId = 1_180_000;
const unit = (code: string): Unit => ({
  id: `counter-player-${nextId++}`,
  code,
  exhausted: false,
  damage: 0,
  progress: 0,
  resources: 0,
  committed: false,
  attachments: [],
  boost: 0,
  attacked: false,
  shadows: [],
});
function game(event: string) {
  const sphere = card(event).sphere_code,
    d = STARTERS.find((d) => d.id === sphere) ?? STARTERS[0];
  const s = act(createGame(731, d.cards, d.heroes, d.id), { type: "KEEP" });
  s.hand = [unit(event), unit("01013")];
  s.staging = [];
  s.heroes.forEach((h) => (h.resources = 10));
  const bane = unit(SHADOW_FLAME.bane);
  bane.attachments.push({
    id: "counter-spell",
    code: SHADOW_FLAME.counter,
    exhausted: false,
  });
  s.staging.push(bane);
  s.encounterDeck = ["01092", "01089", "01088"];
  return s;
}
function resolve(s: GameState, e: Effect) {
  s.queue.push(e);
  flush(s);
}
function choose(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    JSON.stringify(s.choice),
  );
  return act(s, { type: "CHOOSE", id });
}
function canceled(s: GameState, event: string) {
  assert.equal(s.hand.length, 0);
  assert.ok(s.discard.includes(event));
  assert.ok(s.discard.includes("01013"));
  assert.ok(s.encounterDiscard.includes("01092"));
  assert.ok(
    !s.staging
      .find((u) => u.code === SHADOW_FLAME.bane)
      ?.attachments.some((a) => a.code === SHADOW_FLAME.counter),
  );
}

test("Canceled Strider's Path pays its resources without moving either location", () => {
  const s = game("02009"),
    location = unit("01088"),
    active = unit("01095"),
    before = s.heroes[0].resources;
  s.staging.push(location);
  s.activeLocation = active;
  resolve(s, fx("huntStriderPath", { target: location.id }));
  canceled(s, "02009");
  assert.equal(s.heroes[0].resources, before - 1);
  assert.equal(s.activeLocation?.id, active.id);
  assert.ok(s.staging.some((u) => u.id === location.id));
});
test("Canceled Renewed Friendship offers none of its benefit choices", () => {
  const s = game("04007"),
    before = s.deck.length;
  resolve(s, fx("redhornFriendshipMode", { value: 0 }));
  canceled(s, "04007");
  assert.equal(s.choice, null);
  assert.equal(s.deck.length, before);
});
test("Canceled Grave Cairn creates no lasting attack modifier", () => {
  const s = game("04054"),
    hero = s.heroes[0],
    before = stats(s, hero).attack;
  resolve(
    s,
    fx("watcherGraveGrant", {
      source: "left-character",
      target: hero.id,
      value: 4,
    }),
  );
  canceled(s, "04054");
  assert.equal(stats(s, hero).attack, before);
  assert.ok(!s.used.some((k) => k.startsWith("round:grave-cairn:")));
});
test("Canceled Short Cut retains its paid Hobbit exhaustion and leaves the location in play", () => {
  const s = game("04060"),
    hero = s.heroes[0],
    location = unit("01088");
  hero.code = "02001";
  s.staging.push(location);
  resolve(
    s,
    fx("watcherShortcutShuffle", { source: hero.id, target: location.id }),
  );
  canceled(s, "04060");
  assert.equal(hero.exhausted, true);
  assert.ok(s.staging.some((u) => u.id === location.id));
  assert.deepEqual(s.encounterDeck, ["01089", "01088"]);
});
test("Canceled Fresh Tracks deals no damage and grants no engagement protection", () => {
  let s = game("04078"),
    enemy = unit("01089");
  s.staging.push(enemy);
  enemyAddedToStaging(s, enemy);
  flush(s);
  s = choose(s, "play");
  canceled(s, "04078");
  assert.equal(s.staging.find((u) => u.id === enemy.id)?.damage, 0);
  assert.ok(!s.used.some((k) => k.startsWith("round:fresh-tracks:")));
});
test("Canceled Dawn Take You All leaves every facedown shadow attached", () => {
  const s = game("02118"),
    enemy = unit("01089");
  s.phase = "defense";
  enemy.shadows = ["01088"];
  s.engaged.push(enemy);
  resolve(s, fx("mirkwoodDawnPay"));
  canceled(s, "02118");
  assert.deepEqual(enemy.shadows, ["01088"]);
  assert.equal(s.choice, null);
});
test("Canceled The End Comes does not shuffle the encounter discard into the deck", () => {
  const s = game("04037");
  s.encounterDiscard = ["01095"];
  resolve(s, fx("roadEndComesShuffle"));
  canceled(s, "04037");
  assert.ok(s.encounterDiscard.includes("01095"));
  assert.deepEqual(s.encounterDeck, ["01089", "01088"]);
});
test("Canceled A Watchful Peace leaves the exact explored location discarded", () => {
  let s = game("05012"),
    location = unit("01088");
  s.activeLocation = location;
  progressLocation(s, location, card(location.code).quest!);
  flush(s);
  s = choose(s, "return");
  canceled(s, "05012");
  assert.ok(s.encounterDiscard.includes(location.code));
  assert.equal(s.encounterDeck[0], "01089");
});
test("Canceled Heavy Stroke preserves its physical-copy limit before Counter discards another copy", () => {
  let s = game("04105"),
    copy = s.hand[0],
    other = unit("04105"),
    hero = s.heroes[0],
    enemy = unit("01089");
  s.hand.push(other);
  s.phase = "attack";
  s.engaged.push(enemy);
  playerAttack(s, enemy, [hero.id]);
  flush(s);
  s = choose(s, "play");
  s = choose(s, hero.id);
  s = choose(s, "damage-2");
  canceled(s, "04105");
  assert.equal(s.engaged[0].damage, 2);
  assert.ok(s.used.includes(`phase:heavy-stroke:${copy.id}`));
  // Counter discards the unused hand copy while the played copy is resolving.
  // The played copy reaches discard only after the canceled event finishes.
  const first = takePlayerDiscard(s, s.discard.lastIndexOf("04105"));
  assert.equal(first.id, copy.id);
  const second = takePlayerDiscard(s, s.discard.indexOf("04105"));
  assert.notEqual(second.id, copy.id);
  assert.ok(!s.used.includes(`phase:heavy-stroke:${second.id}`));
});
test("Canceled A Elbereth leaves the attacking enemy in play and adds no threat", () => {
  const s = game("04132"),
    enemy = unit("01082"),
    before = s.threat;
  s.engaged.push(enemy);
  resolve(s, fx("shadowFlameElberethBottom", { target: enemy.id }));
  canceled(s, "04132");
  assert.ok(s.engaged.some((u) => u.id === enemy.id));
  assert.equal(s.threat, before);
  assert.ok(!s.encounterDeck.includes("01082"));
});
test("Canceled Foe-hammer retains its Weapon exhaustion cost without drawing cards", () => {
  const s = game("131015"),
    hero = s.heroes[0],
    before = s.deck.length;
  hero.attachments.push({ id: "weapon", code: "01041", exhausted: false });
  resolve(
    s,
    fx("gondorFoeHammer", {
      target: hero.id,
      source: "weapon",
      ids: [hero.id],
    }),
  );
  canceled(s, "131015");
  assert.equal(hero.attachments[0].exhausted, true);
  assert.equal(s.deck.length, before);
});
test("Canceled Behind Strong Walls neither readies nor buffs the defender", () => {
  const s = game("05008"),
    hero = s.heroes[0];
  hero.code = "05001";
  hero.exhausted = true;
  s.combat = {
    enemyId: "attacking-enemy",
    defenderId: hero.id,
    attackBonus: 0,
  };
  const before = stats(s, hero).defense;
  resolve(s, fx("gondorStrongWalls", { target: hero.id, ids: [hero.id] }));
  canceled(s, "05008");
  assert.equal(hero.exhausted, true);
  assert.equal(stats(s, hero).defense, before);
});
test("Canceled Ever Onward permits failed-quest threat and leaves no protection marker", () => {
  let s = game("03005"),
    before = s.threat;
  resolve(s, fx("failedQuest", { value: 2 }));
  s = choose(s, "play");
  s = choose(s, "player-0");
  canceled(s, "03005");
  assert.equal(s.threat, before + 2);
  assert.ok(!s.used.some((k) => k.startsWith("phase:ever-onward:")));
});
