import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import { MARSH_PLAYER_CARDS } from "../src/game/marsh-player-support.ts";
import {
  availableAbilities,
  createGame,
  playTargets,
} from "../src/game/engine.ts";
import {
  damage,
  discardAttachment,
  phaseEnd,
  raiseThreat,
  readyCharacter,
  revealed,
} from "../src/game/board.ts";
import { combatDamage, playerAttack } from "../src/game/combat.ts";
import { flush, shadowResponse } from "../src/game/effects.ts";
import { fx } from "../src/game/core.ts";
import { selectSeat, seatView, syncSeat } from "../src/game/table.ts";
import { EMYN } from "../src/game/emyn-muil.ts";
import type { GameState, Unit } from "../src/game/types.ts";

let nextId = 900_000;
const unit = (code: string, owner = 0): Unit => ({
  id: `marsh-player-${nextId++}`,
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
function game(sphere = "leadership") {
  const d = STARTERS.find((d) => d.id === sphere)!;
  const s = act(createGame(571, d.cards, d.heroes, d.id), { type: "KEEP" });
  s.hand = [];
  s.staging = [];
  s.heroes.forEach((h) => {
    h.resources = 10;
  });
  return s;
}
function table() {
  const d = STARTERS[0];
  let s = createGame(572, d.cards, d.heroes, d.id, {
    seats: [
      { heroes: ["01001", "01002"], deckId: "leadership" },
      { heroes: ["01004", "01005"], deckId: "tactics" },
      { heroes: ["01011", "01012"], deckId: "lore" },
    ],
  });
  while (s.phase === "setup") s = act(s, { type: "KEEP" });
  for (let i = 0; i < 3; i++) {
    selectSeat(s, i);
    s.hand = [];
    s.heroes.forEach((h) => {
      h.resources = 10;
    });
    syncSeat(s);
  }
  selectSeat(s, 0);
  s.staging = [];
  return s;
}
function choose(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    `Missing ${id}: ${JSON.stringify(s.choice)}`,
  );
  return act(s, { type: "CHOOSE", id });
}
function play(s: GameState, code: string, target?: string) {
  const u = unit(code, s.table?.active ?? 0);
  s.hand.push(u);
  syncSeat(s);
  return act(s, { type: "PLAY", id: u.id, target });
}
function mocking(s: GameState, host: Unit, target: Unit, id: string) {
  host.attachments.push({
    id,
    code: "02099",
    exhausted: false,
    owner: s.table?.active ?? 0,
  });
  s = act(s, { type: "ABILITY", id: host.id, attachmentId: id });
  return choose(s, target.id);
}

test("The Dead Marshes registers its complete ten-card player set", () => {
  assert.equal(MARSH_PLAYER_CARDS.length, 10);
  for (const c of MARSH_PLAYER_CARDS) assert.ok(SCRIPTED.has(c.code), c.code);
});
test("Boromir raises threat to ready once per phase, and his cost does not trigger Elfhelm", () => {
  let s = game("tactics");
  s.heroes[0].code = "02095";
  s.heroes[0].exhausted = true;
  s.allies.push(unit("02100"));
  const id = s.heroes[0].id,
    threat = s.threat;
  s = act(s, { type: "ABILITY", id });
  s = choose(s, "ready");
  assert.equal(s.heroes[0].exhausted, false);
  assert.equal(s.threat, threat + 1);
  assert.equal(s.choice, null);
  s.heroes[0].exhausted = true;
  assert.equal(availableAbilities(s, s.heroes[0])[0].disabled, true);
  phaseEnd(s);
  flush(s);
  s = act(s, { type: "ABILITY", id });
  s = choose(s, "ready");
  assert.equal(s.threat, threat + 2);
});
test("Boromir's discard action damages only enemies engaged with one chosen player", () => {
  let s = table();
  selectSeat(s, 1);
  s.heroes[0].code = "02095";
  const id = s.heroes[0].id,
    ownEnemy = unit("01082", 1),
    otherEnemy = unit("01082", 2),
    staged = unit("01082");
  s.engaged.push(ownEnemy);
  seatView(s, 2).engaged.push(otherEnemy);
  s.staging.push(staged);
  syncSeat(s);
  s = act(s, { type: "ABILITY", id });
  s = choose(s, "discard-2");
  assert.ok(seatView(s, 1).discard.includes("02095"));
  assert.equal(seatView(s, 1).engaged[0].damage, 0);
  assert.equal(seatView(s, 2).engaged[0].damage, 2);
  assert.equal(s.staging[0].damage, 0);
  assert.notEqual(s.choice?.title, "Landroval · Destroyed hero");
});
test("Dúnedain Watcher cancels a triggered shadow by discard even while exhausted and without resources", () => {
  let s = table();
  const watcher = unit("02096", 2);
  watcher.exhausted = true;
  seatView(s, 2).allies.push(watcher);
  seatView(s, 2).heroes.forEach((h) => {
    h.resources = 0;
  });
  shadowResponse(s, "01074");
  s = choose(s, `watcher-${watcher.id}`);
  assert.ok(seatView(s, 2).discard.includes("02096"));
  assert.ok(!seatView(s, 2).allies.some((u) => u.id === watcher.id));
  assert.equal(s.choice, null);
});
test("The Eaves prevents Watcher's shadow cancellation", () => {
  const s = game();
  s.allies.push(unit("02096"));
  s.activeLocation = unit("02016");
  shadowResponse(s, "01074");
  assert.ok(!s.choice?.options.some((o) => o.id.startsWith("watcher-")));
});
test("Dúnedain Cache grants Ranged and moves by paying the attached hero's resource", () => {
  let s = table();
  const source = s.heroes[0],
    target = seatView(s, 2).heroes[0],
    before = source.resources;
  source.attachments.push({
    id: "cache",
    code: "02097",
    exhausted: false,
    owner: 0,
  });
  assert.ok(playTargets(s, unit("02097")).some((u) => u.id === target.id));
  s = act(s, { type: "ABILITY", id: source.id, attachmentId: "cache" });
  s = choose(s, target.id);
  assert.equal(seatView(s, 0).heroes[0].resources, before - 1);
  assert.ok(seatView(s, 2).heroes[0].attachments.some((a) => a.id === "cache"));
});
test("Vassal of the Windlord is forcibly discarded after successful and unsuccessful attacks", () => {
  for (const kill of [false, true]) {
    const s = game("tactics"),
      vassal = unit("02098"),
      enemy = unit("01074");
    enemy.damage = kill ? 1 : 0;
    s.allies.push(vassal);
    s.engaged.push(enemy);
    s.phase = "attack";
    playerAttack(s, enemy, [vassal.id]);
    flush(s);
    assert.ok(s.discard.includes("02098"));
    assert.ok(!s.allies.some((u) => u.id === vassal.id));
    assert.equal(
      s.engaged.some((u) => u.id === enemy.id),
      !kill,
    );
  }
});
test("Vassal's Ranged participation in another player's attack still discards it and bans Restricted attachments", () => {
  const s = table(),
    vassal = unit("02098", 1),
    enemy = unit("01082");
  seatView(s, 1).allies.push(vassal);
  s.engaged.push(enemy);
  s.phase = "attack";
  assert.ok(!playTargets(s, unit("19003")).some((u) => u.id === vassal.id));
  playerAttack(s, enemy, [s.heroes[0].id, vassal.id]);
  flush(s);
  assert.ok(seatView(s, 1).discard.includes("02098"));
});
test("Song of Mocking redirects every assigned damage occurrence through the phase", () => {
  let s = game();
  const host = s.heroes[0],
    target = s.heroes[1];
  s = mocking(s, host, target, "mock");
  assert.equal(s.heroes[0].attachments[0].exhausted, true);
  damage(s, target.id, 1);
  flush(s);
  damage(s, target.id, 2);
  flush(s);
  assert.equal(s.heroes[0].damage, 3);
  assert.equal(s.heroes[1].damage, 0);
  phaseEnd(s);
  flush(s);
  damage(s, target.id, 1);
  flush(s);
  assert.equal(s.heroes[1].damage, 1);
});
test("Song of Mocking's phase effect persists after the activated attachment is discarded", () => {
  let s = game();
  const host = s.heroes[0],
    target = s.heroes[1];
  s = mocking(s, host, target, "mock");
  discardAttachment(s, s.heroes[0], s.heroes[0].attachments[0]);
  damage(s, target.id, 1);
  flush(s);
  assert.equal(s.heroes[0].damage, 1);
  assert.equal(s.heroes[1].damage, 0);
});
test("The most recently initiated Song replacement wins across players", () => {
  let s = table();
  const original = s.heroes[1],
    first = s.heroes[0],
    latest = seatView(s, 2).heroes[0];
  s = mocking(s, first, original, "first-mock");
  selectSeat(s, 2);
  s = mocking(
    s,
    seatView(s, 2).heroes[0],
    seatView(s, 0).heroes[1],
    "latest-mock",
  );
  damage(s, original.id, 2);
  flush(s);
  assert.equal(seatView(s, 0).heroes[0].damage, 0);
  assert.equal(seatView(s, 0).heroes[1].damage, 0);
  assert.equal(
    seatView(s, 2).heroes.find((u) => u.id === latest.id)!.damage,
    2,
  );
});
test("Song replacement chains terminate once each assignment is visited, including Frodo's decline", () => {
  let s = game("spirit");
  s.heroes[0].code = "02025";
  const frodo = s.heroes[0],
    other = s.heroes[1];
  s = mocking(s, frodo, other, "to-frodo");
  s = mocking(s, s.heroes[1], s.heroes[0], "to-other");
  damage(s, frodo.id, 1);
  flush(s);
  assert.equal(s.choice?.title, "Frodo Baggins · Damage response");
  s = choose(s, "accept-damage");
  assert.equal(s.heroes[0].damage, 1);
  assert.equal(s.heroes[1].damage, 0);
  assert.equal(s.choice, null);
});
test("Song's actual recipient may cancel with Frodo while Hill Troll excess threat belongs to the defending player", () => {
  for (const cancel of [false, true]) {
    let s = table();
    s.heroes[0].code = "02025";
    const host = s.heroes[0],
      original = seatView(s, 2).heroes[0],
      troll = unit("01082", 2);
    seatView(s, 2).engaged.push(troll);
    s = mocking(s, host, original, "mock");
    const before = [0, 1, 2].map((i) => seatView(s, i).threat);
    combatDamage(s, seatView(s, 2).heroes[0], troll, 4);
    flush(s);
    assert.equal(s.choice?.title, "Frodo Baggins · Damage response");
    s = choose(s, cancel ? "cancel-damage" : "accept-damage");
    assert.equal(seatView(s, 2).heroes[0].damage, 0);
    assert.equal(seatView(s, 0).threat, before[0] + (cancel ? 4 : 0));
    assert.equal(seatView(s, 2).threat, before[2] + (cancel ? 0 : 2));
  }
});
test("Amon Lhaw blanks Song of Mocking before activation", () => {
  const s = game();
  s.activeLocation = unit(EMYN.amonLhaw);
  s.heroes[0].attachments.push({ id: "mock", code: "02099", exhausted: false });
  assert.ok(!availableAbilities(s, s.heroes[0]).some((a) => a.id === "mock"));
  assert.throws(
    () => act(s, { type: "ABILITY", id: s.heroes[0].id, attachmentId: "mock" }),
    /blanks/,
  );
});
test("Ready Elfhelm offers one reduction per qualifying threat increase and can decline", () => {
  let s = game();
  s.allies.push(unit("02100"));
  const before = s.threat;
  raiseThreat(s, 3, "encounter");
  flush(s);
  assert.equal(s.choice?.title, "Elfhelm · Threat response");
  s = choose(s, "reduce");
  assert.equal(s.threat, before + 2);
  raiseThreat(s, 1, "quest-card");
  flush(s);
  s = choose(s, "skip");
  assert.equal(s.threat, before + 3);
});
test("Elfhelm's response affects only its controller and requires him to remain ready", () => {
  let s = table();
  const elfhelm = unit("02100", 2);
  seatView(s, 2).allies.push(elfhelm);
  raiseThreat(s, 2, "encounter");
  flush(s);
  assert.equal(s.choice, null);
  selectSeat(s, 2);
  const before = s.threat;
  raiseThreat(s, 2, "quest-failure");
  flush(s);
  s = choose(s, "reduce");
  assert.equal(seatView(s, 2).threat, before + 1);
  seatView(s, 2).allies[0].exhausted = true;
  selectSeat(s, 2);
  raiseThreat(s, 2, "encounter");
  flush(s);
  assert.equal(s.choice, null);
});
test("Elfhelm reacts to Doomed and Hill Troll's converted excess damage", () => {
  let s = game();
  s.allies.push(unit("02100"));
  const before = s.threat;
  revealed(s, "01103");
  flush(s);
  s = choose(s, "reduce");
  assert.equal(s.threat, before);
  const hero = s.heroes[0],
    troll = unit("01082");
  s.engaged.push(troll);
  combatDamage(s, hero, troll, (card(hero.code).health ?? 0) + 1);
  flush(s);
  s = choose(s, "reduce");
  assert.equal(s.threat, before); // One excess threat, reduced by Elfhelm.
});
test("Framework refresh increases and player-card costs do not trigger Elfhelm", () => {
  const s = game();
  s.allies.push(unit("02100"));
  const before = s.threat;
  raiseThreat(s, 1, "cost");
  raiseThreat(s, 2, "player-card");
  s.queue.push(fx("refreshEnd"));
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(s.threat, before + 4);
});
test("We Do Not Sleep prevents Rohan characters across players from exhausting to commit only this phase", () => {
  let s = table();
  s.heroes[0].code = "01007";
  s.phase = "quest";
  const rohan = unit("02006", 2);
  seatView(s, 2).allies.push(rohan);
  s = play(s, "02101");
  s.committedIds = [s.heroes[0].id];
  s = act(s, { type: "COMMIT" });
  assert.equal(seatView(s, 0).heroes[0].exhausted, false);
  s = act(s, { type: "COMMIT" });
  s.committedIds = [rohan.id];
  s = act(s, { type: "COMMIT" });
  assert.equal(seatView(s, 2).allies[0].exhausted, false);
  phaseEnd(s);
  flush(s);
  assert.ok(
    ![0, 1, 2].some((i) =>
      seatView(s, i).used.some((k) => k.startsWith("phase:we-do-not-sleep:")),
    ),
  );
});
test("We Do Not Sleep excludes Rohan characters entering after the lasting effect", () => {
  let s = game("spirit");
  s.phase = "quest";
  s = play(s, "02101");
  const late = unit("02006");
  s.allies.push(late);
  s.committedIds = [late.id];
  s = act(s, { type: "COMMIT" });
  assert.equal(s.allies[0].exhausted, true);
});
test("Silvan Tracker reacts only to actual refresh readying, and multiple trackers can each heal one", () => {
  let s = game("lore");
  const silvan = unit("02057"),
    a = unit("02102"),
    b = unit("02102");
  silvan.damage = 2;
  silvan.exhausted = true;
  s.allies = [silvan, a, b];
  s.phase = "refresh";
  readyCharacter(s, silvan);
  flush(s);
  s = choose(s, "heal");
  s = choose(s, "heal");
  assert.equal(s.allies[0].damage, 0);
  s.allies[0].damage = 1;
  readyCharacter(s, s.allies[0]);
  flush(s);
  assert.equal(s.choice, null);
  s.allies[0].exhausted = true;
  s.phase = "planning";
  readyCharacter(s, s.allies[0]);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(s.allies[0].damage, 1);
});
test("Silvan Tracker can heal another player's Silvan character and itself after framework refresh", () => {
  let s = table();
  const tracker = unit("02102"),
    silvan = unit("02057", 2);
  tracker.damage = 1;
  tracker.exhausted = true;
  silvan.damage = 1;
  silvan.exhausted = true;
  s.allies.push(tracker);
  seatView(s, 2).allies.push(silvan);
  syncSeat(s);
  s.queue.push(fx("refreshReady"));
  flush(s);
  assert.equal(s.choice?.title, "Silvan Tracker · Refresh healing");
  s = choose(s, "heal");
  s = choose(s, "heal");
  assert.equal(seatView(s, 0).allies[0].damage, 0);
  assert.equal(seatView(s, 2).allies[0].damage, 0);
});
test("Fast Hitch targets Hobbit characters, exhausts only the attachment and uses refresh healing hooks", () => {
  let s = game("lore");
  s.heroes[0].code = "02025";
  const hobbit = s.heroes[0];
  hobbit.exhausted = true;
  assert.deepEqual(
    playTargets(s, unit("02103")).map((u) => u.id),
    [hobbit.id],
  );
  s = play(s, "02103", hobbit.id);
  const attachment = s.heroes[0].attachments[0];
  s = act(s, { type: "ABILITY", id: hobbit.id, attachmentId: attachment.id });
  assert.equal(s.heroes[0].exhausted, false);
  assert.equal(s.heroes[0].attachments[0].exhausted, true);
});
test("Fast Hitch cannot activate on a ready character or when its text is blank", () => {
  const s = game("lore");
  s.heroes[0].code = "02025";
  s.heroes[0].attachments.push({
    id: "hitch",
    code: "02103",
    exhausted: false,
  });
  assert.equal(
    availableAbilities(s, s.heroes[0]).find((a) => a.id === "hitch")!.disabled,
    true,
  );
  s.activeLocation = unit(EMYN.amonLhaw);
  assert.ok(!availableAbilities(s, s.heroes[0]).some((a) => a.id === "hitch"));
});
test("Song of Battle grants its attached hero a Tactics resource icon", () => {
  let s = game();
  const hero = s.heroes[0];
  s = play(s, "02104", hero.id);
  s = play(s, "02098");
  assert.ok(s.allies.some((u) => u.code === "02098"));
});
