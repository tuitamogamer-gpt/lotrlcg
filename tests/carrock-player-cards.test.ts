import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import { CARROCK_PLAYER_CARDS } from "../src/game/carrock-player-support.ts";
import { CARROCK } from "../src/game/carrock.ts";
import {
  availableAbilities,
  createGame,
  playTargets,
  stats,
} from "../src/game/engine.ts";
import { damage, destroy, phaseEnd, returnAlly } from "../src/game/board.ts";
import { combatDamage } from "../src/game/combat.ts";
import { flush } from "../src/game/effects.ts";
import { expansionShadowOptions } from "../src/game/expansion-player-cards.ts";
import { restrictedSlots } from "../src/game/expansion-passives.ts";
import { selectSeat, seatView, syncSeat } from "../src/game/table.ts";
import type { GameState, Unit } from "../src/game/types.ts";

let nextId = 300_000;
const unit = (code: string, owner = 0): Unit => ({
  id: `carrock-player-${nextId++}`,
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
  const s = act(createGame(271, d.cards, d.heroes, d.id), { type: "KEEP" });
  s.hand = [];
  s.staging = [];
  s.heroes.forEach((h) => {
    h.resources = 5;
  });
  return s;
}
function table() {
  const d = STARTERS[0];
  let s = createGame(272, d.cards, d.heroes, d.id, {
    seats: [
      { heroes: ["01001"], deckId: "leadership" },
      { heroes: ["01007"], deckId: "spirit" },
      { heroes: ["01012"], deckId: "lore" },
    ],
  });
  while (s.phase === "setup") s = act(s, { type: "KEEP" });
  s.staging = [];
  s.hand = [];
  syncSeat(s);
  return s;
}
function choose(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    `Missing choice ${id}: ${JSON.stringify(s.choice)}`,
  );
  return act(s, { type: "CHOOSE", id });
}
function play(s: GameState, code: string, target?: string) {
  const u = unit(code, s.table?.active ?? 0);
  s.hand.push(u);
  syncSeat(s);
  return act(s, { type: "PLAY", id: u.id, target });
}
function withFrodo() {
  const s = game("spirit");
  s.heroes[0] = unit("02025");
  s.heroes[0].resources = 5;
  return s;
}

test("Conflict at the Carrock registers all ten complete player scripts", () => {
  assert.equal(CARROCK_PLAYER_CARDS.length, 10);
  for (const c of CARROCK_PLAYER_CARDS) assert.ok(SCRIPTED.has(c.code), c.code);
});

test("Frodo cancels lethal damage, preserves previous damage, and raises only his own threat", () => {
  let s = table();
  const frodo = unit("02025", 1);
  frodo.damage = 1;
  seatView(s, 1).heroes.push(frodo);
  const threats = [0, 1, 2].map((i) => seatView(s, i).threat);
  assert.equal(damage(s, frodo.id, 5), false);
  flush(s);
  assert.equal(s.table!.active, 1);
  assert.equal(frodo.damage, 1);
  s = choose(s, "cancel-damage");
  assert.ok(
    seatView(s, 1).heroes.some((h) => h.id === frodo.id && h.damage === 1),
  );
  assert.deepEqual(
    [0, 1, 2].map((i) => seatView(s, i).threat),
    [threats[0], threats[1] + 5, threats[2]],
  );
});

test("Frodo's response is once per phase and resets only when the phase ends", () => {
  let s = withFrodo();
  const id = s.heroes[0].id;
  damage(s, id, 5);
  flush(s);
  s = choose(s, "cancel-damage");
  damage(s, id, 1);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(s.heroes[0].damage, 1);
  phaseEnd(s);
  flush(s);
  damage(s, id, 1);
  flush(s);
  assert.equal(s.choice?.title, "Frodo Baggins · Damage response");
  s = choose(s, "cancel-damage");
  assert.equal(s.heroes[0].damage, 1);
});

test("Declining Frodo's response does not consume its limit; accepting lethal damage discards him", () => {
  let s = withFrodo();
  const id = s.heroes[0].id,
    threat = s.threat;
  damage(s, id, 1);
  flush(s);
  s = choose(s, "accept-damage");
  assert.equal(s.heroes[0].damage, 1);
  assert.equal(s.threat, threat);
  assert.ok(!s.used.includes(`phase:frodo:${id}`));
  damage(s, id, 5);
  flush(s);
  s = choose(s, "accept-damage");
  assert.ok(!s.heroes.some((h) => h.id === id));
  assert.ok(s.discard.includes("02025"));
});

test("Canceling Frodo's Hill Troll damage also cancels the excess-damage threat consequence", () => {
  for (const accept of [false, true]) {
    let s = withFrodo();
    const frodo = s.heroes[0],
      enemy = unit("01082"),
      threat = s.threat;
    s.engaged = [enemy];
    combatDamage(s, frodo, enemy, 4);
    flush(s);
    assert.equal(s.threat, threat);
    s = choose(s, accept ? "accept-damage" : "cancel-damage");
    assert.equal(s.threat, threat + (accept ? 2 : 4));
    assert.equal(
      s.heroes.some((h) => h.id === frodo.id),
      !accept,
    );
  }
});

test("Frodo cancellation suppresses Muck Adder's damage-triggered discard", () => {
  for (const accept of [false, true]) {
    let s = withFrodo();
    const frodo = s.heroes[0],
      enemy = unit(CARROCK.muckAdder);
    s.engaged = [enemy];
    combatDamage(s, frodo, enemy, 1);
    flush(s);
    s = choose(s, accept ? "accept-damage" : "cancel-damage");
    assert.equal(
      s.heroes.some((h) => h.id === frodo.id),
      !accept,
    );
  }
});

test("Frodo cannot use his own ability while Sacked and may lose by paying threat", () => {
  const sacked = withFrodo();
  sacked.heroes[0].attachments.push({
    id: "sack",
    code: CARROCK.sacked,
    exhausted: false,
  });
  damage(sacked, sacked.heroes[0].id, 1);
  flush(sacked);
  assert.equal(sacked.choice, null);
  assert.equal(sacked.heroes[0].damage, 1);
  let s = withFrodo();
  s.threat = 49;
  damage(s, s.heroes[0].id, 1);
  flush(s);
  s = choose(s, "cancel-damage");
  assert.equal(s.status, "lost");
  assert.equal(s.threat, 50);
});

test("Dúnedain Warning stacks defense and spends the attached hero's pool to move", () => {
  let s = game("lore");
  const host = s.heroes[0],
    target = s.heroes[1];
  host.resources = 1;
  host.attachments.push({ id: "warning", code: "02026", exhausted: false });
  host.attachments.push({ id: "warning-two", code: "02026", exhausted: false });
  assert.equal(stats(s, host).defense, (card(host.code).defense ?? 0) + 2);
  s = act(s, { type: "ABILITY", id: host.id, attachmentId: "warning" });
  s = choose(s, target.id);
  assert.equal(s.heroes[0].resources, 0);
  assert.equal(
    stats(s, s.heroes[0]).defense,
    (card(host.code).defense ?? 0) + 1,
  );
  assert.equal(
    stats(s, s.heroes[1]).defense,
    (card(target.code).defense ?? 0) + 1,
  );
});

test("Second Breakfast returns each player's topmost attachment, skipping newer non-attachment cards", () => {
  let s = table();
  for (let i = 0; i < 3; i++) {
    selectSeat(s, i);
    s.hand = [];
    s.discard =
      i === 0
        ? ["02002", "01020", "02026", "01016"]
        : i === 1
          ? ["01016", "01020"]
          : ["01016", "02010", "01020"];
    s.heroes[0].resources = 5;
    syncSeat(s);
  }
  selectSeat(s, 0);
  s = play(s, "02027");
  assert.deepEqual(
    seatView(s, 0).hand.map((u) => u.code),
    ["02026"],
  );
  assert.deepEqual(seatView(s, 1).hand, []);
  assert.deepEqual(
    seatView(s, 2).hand.map((u) => u.code),
    ["02010"],
  );
  assert.deepEqual(seatView(s, 0).discard, [
    "02002",
    "01020",
    "01016",
    "02027",
  ]);
  assert.equal(seatView(s, 0).heroes[0].resources, 4);
});

test("Beorning Beekeeper discards itself, damages each staging enemy, and leaves engaged enemies untouched", () => {
  let s = game("tactics");
  const beekeeper = unit("02028"),
    enemy = unit("01089"),
    doomed = unit("01081"),
    engaged = unit("01096"),
    location = unit("01095");
  beekeeper.exhausted = true;
  doomed.damage = 1;
  s.allies = [beekeeper];
  s.staging = [enemy, doomed, location];
  s.engaged = [engaged];
  assert.equal(availableAbilities(s, beekeeper)[0].disabled, false);
  s = act(s, { type: "ABILITY", id: beekeeper.id });
  assert.equal(s.allies.length, 0);
  assert.ok(s.discard.includes("02028"));
  assert.equal(s.staging.find((u) => u.id === enemy.id)!.damage, 1);
  assert.ok(!s.staging.some((u) => u.id === doomed.id));
  assert.equal(s.staging.find((u) => u.id === location.id)!.damage, 0);
  assert.equal(s.engaged[0].damage, 0);
});

test("Born Aloft requires an ally, discards the attachment, and returns its host to the owner's hand", () => {
  let s = table();
  const ally = unit("01043", 1);
  s.allies.push(ally);
  ally.attachments = [
    { id: "born", code: "02029", exhausted: false, owner: 2 },
    { id: "condition", code: "01080", exhausted: false },
  ];
  assert.ok(playTargets(s, unit("02029")).some((u) => u.id === ally.id));
  assert.ok(
    !playTargets(s, unit("02029")).some((u) => u.id === s.heroes[0].id),
  );
  syncSeat(s);
  const handCount = seatView(s, 1).hand.length;
  s = act(s, { type: "ABILITY", id: ally.id, attachmentId: "born" });
  assert.equal(seatView(s, 0).allies.length, 0);
  assert.equal(seatView(s, 1).hand.length, handCount + 1);
  assert.equal(seatView(s, 1).hand.at(-1)!.code, "01043");
  assert.ok(seatView(s, 2).discard.includes("02029"));
  assert.ok(s.encounterDiscard.includes("01080"));
});

test("Éomund's optional leave-play response readies printed and granted Rohan characters across players", () => {
  for (const returned of [false, true]) {
    let s = table();
    const eomund = unit("02030", 0);
    s.allies.push(eomund);
    const printedRohan = seatView(s, 1).heroes[0],
      grantedRohan = seatView(s, 2).heroes[0];
    printedRohan.exhausted = true;
    grantedRohan.exhausted = true;
    grantedRohan.attachments.push({
      id: "stranger",
      code: "02031",
      exhausted: false,
    });
    s.heroes[0].exhausted = true;
    syncSeat(s);
    if (returned) returnAlly(s, eomund);
    else destroy(s, eomund);
    flush(s);
    assert.equal(s.choice?.title, "Éomund's response");
    s = choose(s, "ready-rohan");
    assert.equal(seatView(s, 1).heroes[0].exhausted, false);
    assert.equal(seatView(s, 2).heroes[0].exhausted, false);
    assert.equal(seatView(s, 0).heroes[0].exhausted, true);
  }
});

test("Longbeard Map-Maker repeatedly spends Lore resources without exhausting and loses its bonus at phase end", () => {
  let s = game("lore");
  const ally = unit("02032");
  ally.exhausted = true;
  s.allies.push(ally);
  const payer = s.heroes[0];
  payer.resources = 2;
  s.heroes[1].resources = s.heroes[2].resources = 0;
  for (let i = 0; i < 2; i++) {
    s = act(s, { type: "ABILITY", id: ally.id });
    s = choose(s, payer.id);
  }
  assert.equal(s.allies[0].exhausted, true);
  assert.equal(stats(s, s.allies[0]).will, (card("02032").willpower ?? 0) + 2);
  assert.equal(availableAbilities(s, s.allies[0])[0].disabled, true);
  phaseEnd(s);
  flush(s);
  assert.equal(stats(s, s.allies[0]).will, card("02032").willpower);
});

test("A Burning Brand requires a Lore character, counts as restricted, and cancels only the defender's triggered shadow", () => {
  let s = game("lore");
  const defender = s.heroes[1];
  defender.attachments.push({ id: "brand", code: "02033", exhausted: false });
  assert.equal(restrictedSlots(defender), 1);
  const enemy = unit("01089"),
    second = unit("01089");
  enemy.shadows = ["01085"];
  second.shadows = ["01085"];
  s.engaged = [enemy, second];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: defender.id });
  assert.ok(s.choice!.options.some((o) => o.id === "brand-brand"));
  s = choose(s, "brand-brand");
  assert.equal(s.heroes[1].damage, 1);
  assert.equal(s.heroes[1].attachments[0].exhausted, true);
  s.heroes[1].exhausted = false;
  s = act(s, { type: "DEFEND", enemyId: second.id, defenderId: defender.id });
  assert.equal(s.choice, null);
  assert.equal(s.heroes[1].damage, 3);
  const unready = game("lore");
  unready.heroes[0].attachments.push({
    id: "other-brand",
    code: "02033",
    exhausted: false,
  });
  unready.combat = {
    enemyId: "enemy",
    defenderId: unready.heroes[1].id,
    attackBonus: 0,
  };
  assert.equal(expansionShadowOptions(unready, "01085").length, 0);
  const spirit = game("spirit");
  const songHero = spirit.heroes[0];
  assert.ok(
    !playTargets(spirit, unit("02033")).some((u) => u.id === songHero.id),
  );
  songHero.attachments.push({ id: "wisdom", code: "02034", exhausted: false });
  assert.ok(
    playTargets(spirit, unit("02033")).some((u) => u.id === songHero.id),
  );
});

test("The Eaves prevents Burning Brand shadow cancellation, while Song of Wisdom grants Lore payments", () => {
  const s = game("lore"),
    host = s.heroes[1];
  host.attachments.push({ id: "brand", code: "02033", exhausted: false });
  s.combat = { enemyId: "enemy", defenderId: host.id, attackBonus: 0 };
  s.activeLocation = unit("02016");
  assert.equal(expansionShadowOptions(s, "01085").length, 0);
  let spirit = game("spirit");
  spirit = play(spirit, "02034", spirit.heroes[0].id);
  spirit = play(spirit, "02008");
  spirit = choose(spirit, "skip");
  assert.equal(spirit.heroes[0].resources, 1);
  assert.equal(spirit.allies[0].code, "02008");
});
