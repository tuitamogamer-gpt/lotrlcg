import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { STARTERS } from "../src/game/cards.ts";
import { availableAbilities, canPlay, createGame } from "../src/game/engine.ts";
import { fx } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { longDarkPlayerEnemyCannotAttack } from "../src/game/long-dark-player-cards.ts";
import { mirkwoodPlayerPlayProblem } from "../src/game/mirkwood-player-cards.ts";
import { SHADOW_FLAME } from "../src/game/shadow-flame-support.ts";
import { selectSeat, seatView, syncSeat } from "../src/game/table.ts";
import type { GameState, Unit } from "../src/game/types.ts";
let nextId = 1_190_000;
const unit = (code: string, owner = 0): Unit => ({
  id: `considered-player-${nextId++}`,
  owner,
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
function game() {
  const d = STARTERS.find((d) => d.id === "spirit")!;
  const s = act(createGame(741, d.cards, d.heroes, d.id), { type: "KEEP" });
  s.hand = [];
  s.staging = [unit(SHADOW_FLAME.bane)];
  s.heroes.forEach((h) => (h.resources = 10));
  return s;
}
function table() {
  const d = STARTERS[0];
  let s = createGame(742, d.cards, d.heroes, d.id, {
    seats: [
      { heroes: ["01007", "01008"], deckId: "spirit" },
      { heroes: ["01004", "01005"], deckId: "tactics" },
    ],
  });
  while (s.phase === "setup") s = act(s, { type: "KEEP" });
  for (let i = 0; i < 2; i++) {
    selectSeat(s, i);
    s.hand = [];
    s.heroes.forEach((h) => (h.resources = 10));
    syncSeat(s);
  }
  selectSeat(s, 0);
  s.staging = [unit(SHADOW_FLAME.bane)];
  return s;
}
function choose(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    JSON.stringify(s.choice),
  );
  return act(s, { type: "CHOOSE", id });
}
function play(s: GameState, code: string) {
  const u = unit(code, s.table?.active ?? 0);
  s.hand.push(u);
  syncSeat(s);
  return act(s, { type: "PLAY", id: u.id });
}

test("Out of Sight includes the single considered-engaged Bane and protects only its own player", () => {
  let s = table(),
    bane = s.staging[0];
  s = play(s, "04081");
  assert.equal(longDarkPlayerEnemyCannotAttack(s, bane, 0), true);
  assert.equal(longDarkPlayerEnemyCannotAttack(s, bane, 1), false);
  assert.equal(s.staging.filter((u) => u.code === SHADOW_FLAME.bane).length, 1);
  assert.equal(s.engaged.length, 0);
});
test("Out of Sight cannot use a staging Bane when the player's threat is zero", () => {
  const s = game();
  s.threat = 0;
  assert.match(canPlay(s, unit("04081")) ?? "", /engaged with you/);
});
test("Boromir can discard to damage a considered-engaged Bane once without moving it", () => {
  let s = game(),
    hero = s.heroes[0];
  hero.code = "02095";
  const bane = s.staging[0];
  s = act(s, { type: "ABILITY", id: hero.id });
  assert.ok(s.choice?.options.some((o) => o.id === "discard-0"));
  s = choose(s, "discard-0");
  assert.equal(s.staging.find((u) => u.id === bane.id)?.damage, 2);
  assert.ok(!s.heroes.some((u) => u.id === hero.id));
  assert.equal(s.staging.filter((u) => u.id === bane.id).length, 1);
  assert.equal(s.engaged.length, 0);
});
test("Boromir can choose another player's considered engagement while his own threat is zero", () => {
  let s = table(),
    hero = s.heroes[0];
  hero.code = "02095";
  s.threat = 0;
  s = act(s, { type: "ABILITY", id: hero.id });
  assert.ok(!s.choice?.options.some((o) => o.id === "discard-0"));
  assert.ok(s.choice?.options.some((o) => o.id === "discard-1"));
  s = choose(s, "discard-1");
  assert.equal(s.staging[0].damage, 2);
});
test("Boromir's damage action has no enemy when every player has threat zero", () => {
  const s = table(),
    hero = s.heroes[0];
  hero.code = "02095";
  s.threat = 0;
  s.table!.seats[1].threat = 0;
  assert.equal(availableAbilities(s, hero)[0]?.disabled, true);
});
test("Dawn targets a dealt facedown Bane shadow through considered engagement", () => {
  let s = game(),
    bane = s.staging[0];
  s.phase = "defense";
  bane.shadows = ["01088"];
  assert.equal(mirkwoodPlayerPlayProblem(s, "02118"), null);
  s.heroes[0].attachments.push({ id: "lead", code: "02010", exhausted: false });
  s = play(s, "02118");
  assert.ok(s.choice?.options.some((o) => o.id === `${bane.id}-shadow-0`));
  s = choose(s, `${bane.id}-shadow-0`);
  assert.equal(s.staging[0].shadows.length, 0);
  assert.ok(s.encounterDiscard.includes("01088"));
  assert.equal(s.staging.length, 1);
});
test("Dawn's global shadow scan does not treat a threat-zero Bane as engaged", () => {
  const s = game();
  s.phase = "defense";
  s.threat = 0;
  s.staging[0].shadows = ["01088"];
  assert.match(mirkwoodPlayerPlayProblem(s, "02118") ?? "", /dealt face-down/);
});
test("Rider's new controller may discard a Bane shadow while Bane stays in staging", () => {
  let s = table(),
    rider = unit("04033"),
    bane = s.staging[0];
  s.allies.push(rider);
  bane.shadows = ["01088"];
  s = act(s, { type: "ABILITY", id: rider.id });
  s = choose(s, s.heroes[0].id);
  s = choose(s, "player-1");
  assert.equal(s.table?.active, 1);
  assert.equal(s.choice?.title, "Rider of the Mark · Control changed");
  s = choose(s, `${bane.id}-shadow-0`);
  assert.equal(s.staging[0].shadows.length, 0);
  assert.equal(s.staging.length, 1);
  assert.ok(seatView(s, 1).allies.some((u) => u.id === rider.id));
});
test("Rider has no shadow response for a staging Bane with which its new controller is not engaged", () => {
  const s = table(),
    rider = unit("04033", 1);
  s.table!.seats[1].threat = 0;
  seatView(s, 1).allies.push(rider);
  s.staging[0].shadows = ["01088"];
  s.queue.push(fx("roadRiderResponse", { source: rider.id, player: 1 }));
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(s.staging[0].shadows.length, 1);
});
