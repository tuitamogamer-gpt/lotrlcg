import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  canPlay,
  playTargets,
  validateSave,
  availableAbilities,
} from "../src/game/engine";
import { card, imageUrl, playerCards, SCRIPTED } from "../src/game/cards";
import {
  canPay,
  eligiblePayers,
  followFirstPlayer,
  fx,
  get,
  make,
  pay,
  playCost,
  putPlayerDeck,
  spendResources,
  stats,
  takePlayerDeck,
  threatOf,
} from "../src/game/core";
import {
  check,
  damage,
  discardAttachment,
  discardCharacter,
  enterAlly,
  nextRound,
  phaseEnd,
  progress,
  revealed,
  returnAlly,
} from "../src/game/board";
import { flush, shadowResponse } from "../src/game/effects";
import { beginEnemyAttack, resolvePlayerAttack } from "../src/game/combat";
import {
  activeSeat,
  allCharacters,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import { effectiveKeyword } from "../src/game/expansion-passives";
import { finalRingDefenseFinished } from "../src/game/ring-maker-final-player";
import {
  effectCardPlayProblem,
  playEventFromDiscardEffect,
} from "../src/game/actions";
import { base, choose, reload } from "./against-shadow-final-fixtures";
import { SHADOW_FLAME } from "../src/game/shadow-flame-support";
import { KHAZAD } from "../src/game/khazad-dum";
import { rhosgobelHeal, RHOS } from "../src/game/rhosgobel";
import { WATCHER_WATER as W } from "../src/game/watcher-water-support";
import type { GameState, Unit } from "../src/game/types";

function fixture(players = 1) {
  const s = base("mirkwood", players);
  s.heroes[0] = make(s, "08137");
  s.startingHeroes = s.heroes.map((h) => h.code);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      for (const h of s.heroes) {
        h.resources = 10;
        h.phaseResourceIcons = ["leadership", "tactics", "spirit", "lore"];
      }
    });
  return s;
}
function attach(s: GameState, host: Unit, code: string, owner = activeSeat(s)) {
  const a = { id: `a${s.nextId++}`, code, exhausted: false, owner };
  host.attachments.push(a);
  return a;
}
function play(
  s: GameState,
  code: string,
  target?: string,
  payment?: Record<string, number>,
) {
  const u = make(s, code);
  s.hand.push(u);
  return applyAction(s, { type: "PLAY", id: u.id, target, payment });
}
function attack(
  s: GameState,
  defender?: Unit,
  enemyCode = "01096",
  shadow?: string,
) {
  s.phase = "defense";
  const enemy = make(s, enemyCode);
  s.engaged.push(enemy);
  if (shadow) enemy.shadows = [shadow];
  beginEnemyAttack(s, enemy, defender ? [defender.id] : []);
  flush(s);
  return enemy.id;
}

test("all thirty final Ring-maker player designs have original provenance and local art", () => {
  for (const [start, end, pack] of [
    [84, 93, "The Nîn-in-Eilph"],
    [112, 121, "Celebrimbor's Secret"],
    [137, 146, "The Antlered Crown"],
  ] as const)
    for (let n = start; n <= end; n++) {
      const code = `08${String(n).padStart(3, "0")}`;
      assert.ok(SCRIPTED.has(code));
      assert.equal(card(code).pack_name, pack);
      assert.match(imageUrl(card(code)), /^\/cards\//);
    }
  assert.equal(playerCards.filter((c) => c.type_code === "hero").length, 50);
});
test("Follow Me draws and transfers the first-player token without moving the active planning turn", () => {
  let s = fixture(2);
  selectSeat(s, 1);
  const turn = s.table!.turn,
    before = s.deck.length;
  s = play(s, "08085");
  assert.equal(s.table!.first, 1);
  assert.equal(s.table!.turn, turn);
  assert.equal(seatView(s, 1).deck.length, before - 1);
  assert.equal(seatView(s, 1).hand.length, 1);
  assert.equal(reload(s).table!.first, 1);
});
test("Tighten Our Belts distinguishes costs, zero spending and transfers and has a shared round limit", () => {
  let s = fixture(2);
  const [a, b, c] = s.heroes;
  spendResources(s, a, 1);
  spendResources(s, b, 0);
  b.resources--;
  c.resources++; // moving a resource is not spending it
  s.phase = "refresh";
  s = play(s, "08086");
  s = choose(reload(s), "player-0");
  assert.deepEqual(
    s.heroes.map((h) => h.resources),
    [9, 10, 12],
  );
  selectSeat(s, 1);
  const copy = make(s, "08086");
  s.hand.push(copy);
  assert.match(canPlay(s, copy)!, /Only one/);
  nextRound(s);
  s.phase = "refresh";
  assert.equal(canPlay(s, copy), null);
});
test("resource payment from hand and discard counts for Belts across phases and reload", () => {
  let s = fixture();
  const id = s.heroes[0].id;
  s = play(s, "08085", undefined, { [id]: 1 });
  assert.equal(get(s, id)!.resourcesSpentRound, s.round);
  s.discard.push("08085");
  playEventFromDiscardEffect(s, s.discard.length - 1, {
    payment: { [s.heroes[1].id]: 1 },
  });
  flush(s);
  phaseEnd(s);
  s = reload(s);
  s.heroes.forEach((h) => (h.phaseResourceIcons = ["leadership"]));
  s.phase = "refresh";
  s = choose(play(s, "08086"), "player-0");
  assert.deepEqual(
    s.heroes.map((h) => h.resources),
    [9, 9, 11],
  );
});
test("a canceled Tighten Our Belts still consumes the shared play limit", () => {
  let s = fixture();
  s.phase = "refresh";
  const enemy = make(s, SHADOW_FLAME.bane);
  s.staging.push(enemy);
  attach(s, enemy, SHADOW_FLAME.counter);
  s.encounterDeck = ["01093"];
  s = play(s, "08086");
  assert.equal(s.choice, null);
  assert.match(canPlay(s, make(s, "08086"))!, /Only one/);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    30,
  );
});
test("Celduin Traveler has Secrecy 2 and optionally looks without revealing or consuming a location", () => {
  let s = fixture();
  assert.equal(playCost(s, card("08089")), 1);
  s.encounterDeck = ["01099", "01093"];
  s = play(s, "08089");
  s = choose(reload(s), "look");
  assert.deepEqual(s.encounterDeck, ["01099", "01093"]);
  s = choose(reload(s), "discard");
  assert.deepEqual(s.encounterDeck, ["01093"]);
  assert.ok(s.encounterDiscard.includes("01099"));
  assert.equal(s.staging.length, 0);
  s.threat = 21;
  assert.equal(playCost(s, card("08089")), 3);
});
test("Traveler cannot discard a non-location and its response can be declined", () => {
  let s = fixture();
  s.encounterDeck = ["01093"];
  s = choose(play(s, "08089"), "look");
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["keep"],
  );
  s = choose(s, "keep");
  s = choose(play(s, "08089"), "skip");
  assert.deepEqual(s.encounterDeck, ["01093"]);
});
test("Island Amid Perils returns a Silvan ally as a cost, using printed cost and original ownership", () => {
  let s = fixture(2);
  const ally = make(s, "08087");
  ally.owner = 1;
  s.allies.push(ally);
  s = play(s, "08090", ally.id);
  assert.equal(s.threat, 18);
  assert.equal(s.allies.length, 0);
  assert.ok(seatView(s, 1).hand.some((u) => u.code === ally.code));
  assert.ok(!s.hand.some((u) => u.code === ally.code));
});
test("Island pays its return cost even when Counter-Spell cancels the threat reduction", () => {
  let s = fixture();
  const ally = make(s, "08087");
  s.allies.push(ally);
  const enemy = make(s, SHADOW_FLAME.bane);
  s.staging.push(enemy);
  attach(s, enemy, SHADOW_FLAME.counter);
  s.encounterDeck = ["01093"];
  s = play(s, "08090", ally.id);
  assert.equal(s.threat, 20);
  assert.equal(s.allies.length, 0);
  // Counter-Spell discards the returned ally from hand after the cost is paid.
  assert.ok(s.discard.includes(ally.code));
  assert.ok(
    s.log.some(
      (l) =>
        l.text.includes("returns to") && l.text.includes("Galadhon Archer"),
    ),
  );
});
test("Pioneer's optional Doomed 1 affects everyone and its suppression survives phase/source departure", () => {
  let s = fixture(2);
  const enemy = make(s, "01096");
  s.staging.push(enemy);
  s = play(s, "08091");
  s = choose(reload(s), "doomed");
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    [21, 21],
  );
  s = choose(reload(s), enemy.id);
  assert.equal(threatOf(s, get(s, enemy.id)!), 0);
  discardCharacter(
    s,
    s.allies.find((u) => u.code === "08091")!,
  );
  flush(s);
  phaseEnd(s);
  assert.equal(threatOf(s, get(s, enemy.id)!), 0);
  s = reload(s);
  nextRound(s);
  assert.ok(threatOf(s, get(s, enemy.id)!) > 0);
});
test("optional Doomed is not printed Doomed and putting Pioneer into play gives no response", () => {
  let s = fixture();
  s.staging = [make(s, "01096")];
  s = choose(play(s, "08091"), "skip");
  assert.equal(s.threat, 20);
  assert.equal(s.choice, null);
  const other = make(s, "08091");
  enterAlly(s, other, false, false, true);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(s.threat, 20);
});
test("Guard grants defense and sentinel to another player's character until round end", () => {
  let s = fixture(2);
  const id = seatView(s, 1).heroes[0].id;
  const before = stats(s, get(s, id)!).defense;
  s = choose(play(s, "08115"), "doomed");
  s = choose(reload(s), id);
  assert.equal(stats(s, get(s, id)!).defense, before + 2);
  assert.equal(effectiveKeyword(get(s, id)!, "Sentinel"), true);
  discardCharacter(
    s,
    s.allies.find((u) => u.code === "08115")!,
  );
  flush(s);
  phaseEnd(s);
  s = reload(s);
  assert.equal(stats(s, get(s, id)!).defense, before + 2);
  nextRound(s);
  assert.equal(stats(s, get(s, id)!).defense, before);
});
test("Bow needs Silvan and ranged and adds its larger bonus only against an enemy not engaged with the attacker", () => {
  let s = fixture(2);
  const archer = make(s, "08087");
  s.allies.push(archer);
  const bow = make(s, "08088");
  s.hand.push(bow);
  assert.ok(playTargets(s, bow).some((u) => u.id === archer.id));
  assert.ok(!playTargets(s, bow).some((u) => u.id === s.heroes[0].id));
  s = applyAction(s, { type: "PLAY", id: bow.id, target: archer.id });
  assert.equal(stats(s, get(s, archer.id)!).attack, 3);
  const enemy = make(s, "01082");
  forOwner(s, 1, () => s.engaged.push(enemy));
  resolvePlayerAttack(s, enemy, [archer.id], 0);
  flush(s);
  assert.equal(get(s, enemy.id)!.damage, 1); // attack 4 against defense 3
});
test("Defender of the West attaches only to unique allies and follows the token with attachments intact", () => {
  let s = fixture(2);
  const ally = make(s, "08114");
  s.allies.push(ally);
  attach(s, ally, "08088");
  s.allies.push(make(s, "08087"));
  s.allies.push(make(s, "rc135"));
  const event = make(s, "08093");
  s.hand.push(event);
  assert.deepEqual(
    playTargets(s, event).map((u) => u.id),
    [ally.id],
  );
  s = applyAction(s, { type: "PLAY", id: event.id, target: ally.id });
  selectSeat(s, 1);
  s = play(s, "08085");
  assert.equal(ownerOf(s, get(s, ally.id)!), 1);
  assert.equal(get(s, ally.id)!.owner, 0);
  assert.equal(get(s, ally.id)!.attachments.length, 2);
  s = reload(s);
  s.table!.first = 0;
  followFirstPlayer(s);
  assert.equal(ownerOf(s, get(s, ally.id)!), 0);
});
test("removing Defender leaves control with its last controller; return-to-hand still uses the owner", () => {
  let s = fixture(2);
  const ally = make(s, "08114");
  s.allies.push(ally);
  attach(s, ally, "08093");
  check(s);
  s.table!.first = 1;
  followFirstPlayer(s);
  s = reload(s);
  const u = get(s, ally.id)!;
  discardAttachment(s, u, u.attachments[0]);
  check(s);
  assert.equal(ownerOf(s, u), 1);
  s.table!.first = 0;
  followFirstPlayer(s);
  assert.equal(ownerOf(s, u), 1);
  returnAlly(s, u);
  flush(s);
  assert.ok(seatView(s, 0).hand.some((h) => h.code === u.code));
  assert.ok(!seatView(s, 1).allies.some((h) => h.id === u.id));
});
test("Defender's controller can assign undefended damage to the ally", () => {
  let s = fixture();
  const ally = make(s, "08146");
  s.allies.push(ally);
  attach(s, ally, "08093");
  attack(s);
  assert.ok(s.choice!.options.some((o) => o.id === ally.id));
  s = choose(reload(s), ally.id);
  assert.equal(get(s, ally.id)!.damage, 2);
});
test("Charge snapshots mounted Rohan characters and survives loss of the qualifying attachment", () => {
  let s = fixture();
  const hero = s.heroes[0];
  attach(s, hero, "06139");
  assert.match(card("06139").traits!, /Mount/);
  const before = stats(s, hero).attack;
  s = play(s, "08116");
  const h = get(s, hero.id)!;
  assert.equal(stats(s, h).attack, before + 3);
  discardAttachment(s, h, h.attachments[0]);
  assert.equal(stats(s, h).attack, before + 3);
  const later = make(s, "08138");
  s.allies.push(later);
  attach(s, later, "06139");
  assert.equal(later.tempAttack ?? 0, 0);
  phaseEnd(s);
  assert.equal(stats(s, h).attack, before);
});
test("Mirror attaches to Galadriel, searches only ten, shuffles and discards a random physical hand card", () => {
  let s = fixture(2);
  s.heroes[1] = make(s, "08112");
  s.startingHeroes = s.heroes.map((h) => h.code);
  const galadriel = s.heroes[1],
    mirror = attach(s, galadriel, "08118");
  s.deck = [...Array(10).fill("01020"), "01073"];
  s.hand = [];
  const foreign = make(s, "08085");
  foreign.owner = 1;
  putPlayerDeck(s, foreign, 0);
  s = applyAction(s, {
    type: "ABILITY",
    id: galadriel.id,
    attachmentId: mirror.id,
  });
  assert.equal(s.choice!.options.length, 11);
  assert.ok(!s.choice!.options.some((o) => o.code === "01073"));
  s = choose(reload(s), "card-0");
  assert.equal(s.hand.length, 0);
  assert.ok(seatView(s, 1).discard.includes("08085"));
  assert.equal(s.deck.length, 11);
  assert.equal(get(s, galadriel.id)!.attachments[0].exhausted, true);
});
test("Mirror can search fewer than ten, decline the search, and repeat deterministic random results after reload", () => {
  let s = fixture();
  s.heroes[1] = make(s, "08112");
  s.startingHeroes = s.heroes.map((h) => h.code);
  const a = attach(s, s.heroes[1], "08118");
  s.deck = ["01020", "01073"];
  s.hand = [make(s, "01048")];
  s = applyAction(s, {
    type: "ABILITY",
    id: s.heroes[1].id,
    attachmentId: a.id,
  });
  const restored = reload(s);
  const one = choose(s, "card-0"),
    two = choose(restored, "card-0");
  assert.deepEqual(one.hand, two.hand);
  assert.deepEqual(one.discard, two.discard);
  assert.equal(one.hand.length, 1);
  s = choose(restored, "skip");
  assert.equal(s.hand.length, 1);
  assert.equal(s.deck.length, 2);
  assert.equal(s.discard.length, 0);
});
for (const code of ["08119", "08141", "08146"])
  test(`${card(code).name} enters exhausted on any entry and cannot have restricted attachments`, () => {
    const s = fixture();
    const u = make(s, code);
    enterAlly(s, u);
    flush(s);
    assert.equal(u.exhausted, true);
    assert.ok(!playTargets(s, make(s, "01039")).some((t) => t.id === u.id));
  });
test("Booming Ent counts damaged Ent characters controlled by its current controller, including itself", () => {
  const s = fixture(2),
    booming = make(s, "08141"),
    wandering = make(s, "08119");
  s.allies.push(booming, wandering);
  booming.damage = 1;
  wandering.damage = 1;
  forOwner(s, 1, () => {
    const other = make(s, "08119");
    other.damage = 1;
    s.allies.push(other);
  });
  assert.equal(stats(s, booming).attack, 4);
  wandering.damage = 0;
  assert.equal(stats(s, booming).attack, 3);
  attach(s, booming, KHAZAD.fear);
  assert.equal(stats(s, booming).attack, 2);
});
test("Treebeard gets resources each resource phase and pays only Ent cards played from hand", () => {
  let s = fixture();
  const tree = make(s, "08146");
  s.allies.push(tree);
  nextRound(s);
  nextRound(s);
  assert.equal(tree.resources, 2);
  for (const h of s.heroes) h.resources = 0;
  assert.ok(eligiblePayers(s, card("08119")).some((u) => u.id === tree.id));
  assert.ok(
    !eligiblePayers(s, { ...card("08119"), playOrigin: "discard" }).some(
      (u) => u.id === tree.id,
    ),
  );
  assert.ok(
    !eligiblePayers(s, { ...card("08119"), playOrigin: "deck" }).some(
      (u) => u.id === tree.id,
    ),
  );
  assert.ok(!eligiblePayers(s, card("01020")).some((u) => u.id === tree.id));
  s.phase = "planning";
  s = play(s, "08119", undefined, { [tree.id]: 2 });
  assert.equal(get(s, tree.id)!.resources, 0);
  assert.equal(s.allies.find((u) => u.code === "08119")!.exhausted, true);
});
test("Treebeard spends two resources to ready another player's Ent without exhausting himself", () => {
  let s = fixture(2);
  const tree = make(s, "08146");
  tree.resources = 2;
  tree.exhausted = true;
  s.allies.push(tree);
  let id = "";
  forOwner(s, 1, () => {
    const u = make(s, "08119");
    u.exhausted = true;
    s.allies.push(u);
    id = u.id;
  });
  assert.equal(availableAbilities(s, tree)[0].disabled, false);
  s = applyAction(s, { type: "ABILITY", id: tree.id });
  s = choose(reload(s), id);
  assert.equal(get(s, id)!.exhausted, false);
  assert.equal(get(s, tree.id)!.resources, 0);
  assert.equal(get(s, tree.id)!.exhausted, true);
});
test("Erkenbrand cancels a shadow by taking real damage; Close Call cannot cancel the cost", () => {
  let s = fixture();
  const h = s.heroes[0];
  s.hand = [make(s, "08005")];
  attack(s, h, "01096", "01097");
  assert.match(s.choice!.title, /shadow/);
  s = choose(reload(s), `erkenbrand-${h.id}`);
  assert.equal(get(s, h.id)!.damage, 1);
  assert.ok(s.hand.some((u) => u.code === "08005"));
  assert.equal(s.combat, null);
});
test("Erkenbrand can pay lethal damage and cannot respond if not defending or blanked", () => {
  let s = fixture();
  const h = s.heroes[0];
  h.damage = stats(s, h).health - 1;
  attack(s, h, "01096", "01097");
  s = choose(s, `erkenbrand-${h.id}`);
  assert.ok(!get(s, h.id));
  assert.ok(s.choice?.title.includes("damage"));
  const t = fixture();
  attach(t, t.heroes[0], KHAZAD.fear);
  t.combat = { enemyId: "none", defenderId: t.heroes[0].id, attackBonus: 0 };
  check(t);
  shadowResponse(t, "01097");
  assert.equal(t.choice, null);
});
test("The Day's Rising responds after a damage-free defense and resource gain can trigger Heir of Mardil", () => {
  let s = fixture();
  const h = s.heroes[0],
    a = attach(s, h, "08139");
  attach(s, h, "08113");
  const before = h.resources;
  attack(s, h);
  assert.match(s.choice!.title, /Day's Rising/);
  s = choose(reload(s), "resource");
  assert.equal(get(s, h.id)!.resources, before + 1);
  assert.equal(
    get(s, h.id)!.attachments.find((x) => x.id === a.id)!.exhausted,
    true,
  );
  assert.match(s.choice!.title, /Heir of Mardil/);
});
test("The Day's Rising remembers damage taken during the attack even if it is healed before completion", () => {
  let s = fixture();
  const h = s.heroes[0];
  attach(s, h, "08139");
  s.combat = {
    enemyId: "pending",
    defenderId: h.id,
    defenderIds: [h.id],
    attackBonus: 0,
  };
  damage(s, h.id, 1);
  rhosgobelHeal(s, h, 1);
  s = reload(s);
  finalRingDefenseFinished(s);
  flush(s);
  assert.equal(s.choice, null);
});
test("Ride Them Down buffers the active location first and replaces only successful quest progress", () => {
  let s = fixture();
  s.phase = "quest";
  s.activeLocation = make(s, "01087");
  const enemy = make(s, "01082");
  s.staging = [enemy];
  s = play(s, "08142", enemy.id);
  s = reload(s);
  s.queue.push(fx("successfulQuestProgress", { value: 3 }));
  flush(s);
  assert.equal(s.activeLocation, null);
  assert.equal(get(s, enemy.id)!.damage, 2);
  assert.equal(s.progress, 0);
  progress(s, 2, true);
  assert.equal(s.progress, 2);
  assert.equal(get(s, enemy.id)!.damage, 2);
});
test("Ride persists after the target leaves, latest replacement wins, and expires with the phase", () => {
  let s = fixture();
  s.phase = "quest";
  const a = make(s, "01082"),
    b = make(s, "01082");
  s.staging = [a, b];
  s = play(s, "08142", a.id);
  s = play(s, "08142", b.id);
  s.queue.push(fx("successfulQuestProgress", { value: 1 }));
  flush(s);
  assert.equal(get(s, a.id)!.damage, 0);
  assert.equal(get(s, b.id)!.damage, 1);
  s.staging = s.staging.filter((u) => u.id !== b.id);
  s.queue.push(fx("successfulQuestProgress", { value: 2 }));
  flush(s);
  assert.equal(s.progress, 0);
  phaseEnd(s);
  s.queue.push(fx("successfulQuestProgress", { value: 2 }));
  flush(s);
  assert.equal(s.progress, 2);
});
test("Shadows Give Way requires three real hero pools and removes all attached shadows across players", () => {
  let s = fixture(2);
  const enemy = make(s, "01096");
  enemy.shadows = ["01093", "01099"];
  enemy.faceupShadows = [true, false];
  enemy.revealedShadowCount = 1;
  s.staging = [enemy];
  forOwner(s, 1, () => {
    const e = make(s, "01096");
    e.shadows = ["01093"];
    s.engaged = [e];
  });
  assert.throws(
    () => play(s, "08143", undefined, { [s.heroes[0].id]: 3 }),
    /three|3/,
  );
  const payment = Object.fromEntries(s.heroes.map((h) => [h.id, 1]));
  s = play(s, "08143", undefined, payment);
  assert.equal(get(s, enemy.id)!.shadows.length, 0);
  assert.equal(get(s, enemy.id)!.revealedShadowCount, 0);
  assert.equal(seatView(s, 1).engaged[0].shadows.length, 0);
  assert.equal(s.encounterDiscard.length, 3);
});
test("Shadows Give Way cannot satisfy three pools after reducing its cost below three", () => {
  const s = fixture();
  s.used.push("round:grima-next");
  assert.equal(playCost(s, card("08143")), 2);
  assert.equal(canPay(s, card("08143")), false);
  assert.match(canPlay(s, make(s, "08143"))!, /three/);
});
test("Don't Be Hasty resolves before keywords and When Revealed and persists its reveal continuation through reload", () => {
  let s = fixture();
  s.phase = "staging";
  const h = s.heroes[0];
  h.committed = h.exhausted = true;
  s.committedIds = [h.id];
  s.hand = [make(s, "08144")];
  revealed(s, "01093");
  flush(s);
  assert.match(s.choice!.title, /Don't Be Hasty/);
  assert.equal(h.damage, 0);
  s = choose(reload(s), `hasty-0-${h.id}`);
  assert.equal(get(s, h.id)!.committed, false);
  assert.equal(get(s, h.id)!.exhausted, false);
  assert.equal(get(s, h.id)!.damage, 0);
  assert.ok(s.encounterDiscard.includes("01093"));
});
test("Thalin's passive is preserved when withdrawn by Don't Be Hasty and kills Crows before that window", () => {
  let s = fixture();
  s.heroes[0] = make(s, "01006");
  s.startingHeroes = s.heroes.map((h) => h.code);
  const h = s.heroes[0];
  h.committed = h.exhausted = true;
  s.hand = [make(s, "08144")];
  revealed(s, "01096");
  flush(s);
  s = choose(reload(s), `hasty-0-${h.id}`);
  assert.equal(s.staging[0].damage, 1);
  const t = fixture();
  t.heroes[0] = make(t, "01006");
  t.heroes[0].committed = true;
  t.hand = [make(t, "08144")];
  revealed(t, "01115");
  flush(t);
  assert.equal(t.choice, null);
  assert.equal(t.staging.length, 0);
  assert.ok(t.encounterDeck.includes("01115"));
});
test("Waters of Nimrodel raises all threat before healing all eligible characters in play", () => {
  let s = fixture(2);
  for (const u of allCharacters(s)) u.damage = 1;
  const ally = make(s, "08119");
  ally.damage = 2;
  s.allies.push(ally);
  s = play(s, "08145");
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    [23, 23],
  );
  assert.ok(allCharacters(s).every((u) => u.damage === 0));
  assert.match(canPlay(s, make(s, "08145"))!, /No damaged/);
});
test("new saved round and combat fields reject malformed values", () => {
  const s = fixture();
  s.heroes[0].roundDefense = -1;
  assert.equal(validateSave(s), false);
  delete s.heroes[0].roundDefense;
  s.heroes[0].resourcesSpentRound = -1;
  assert.equal(validateSave(s), false);
  delete s.heroes[0].resourcesSpentRound;
  s.combat = {
    enemyId: "enemy",
    defenderId: null,
    attackBonus: 0,
    damagedDefenders: [3 as unknown as string],
  };
  assert.equal(validateSave(s), false);
});
test("free deck plays cannot bypass Shadows Give Way's three-hero payment requirement", () => {
  const s = fixture(),
    u = make(s, "08143");
  s.deck.unshift(u.code);
  assert.match(effectCardPlayProblem(s, u, { putIntoPlay: false })!, /three/);
});
test("a discard replay of Shadows Give Way does not consume Gríma's next hand-play discount", () => {
  const s = fixture();
  s.used.push("round:grima-next");
  s.discard = ["08143"];
  const enemy = make(s, "01096");
  enemy.shadows = ["01097"];
  s.engaged = [enemy];
  playEventFromDiscardEffect(s, 0, {
    payment: Object.fromEntries(s.heroes.map((h) => [h.id, 1])),
  });
  flush(s);
  assert.equal(enemy.shadows.length, 0);
  assert.ok(s.used.includes("round:grima-next"));
});
test("The Day's Rising is not offered after paying Erkenbrand's shadow cancellation cost", () => {
  let s = fixture();
  const h = s.heroes[0],
    a = attach(s, h, "08139");
  attack(s, h, "01096", "01097");
  s = choose(reload(s), `erkenbrand-${h.id}`);
  assert.equal(s.choice, null);
  assert.equal(
    get(s, h.id)!.attachments.find((x) => x.id === a.id)!.exhausted,
    false,
  );
});
test("Erkenbrand can cancel while defending another player's attack with sentinel", () => {
  let s = fixture(2);
  const h = s.heroes[0];
  selectSeat(s, 1);
  attack(s, h, "01096", "01097");
  s = choose(reload(s), `erkenbrand-${h.id}`);
  assert.equal(get(s, h.id)!.damage, 1);
  assert.equal(get(s, h.id)!.exhausted, true);
});
test("shadow cancellation prohibitions also block Erkenbrand", () => {
  const s = fixture();
  s.activeLocation = make(s, "02016");
  attack(s, s.heroes[0], "01096", "01097");
  assert.equal(s.choice, null);
  assert.equal(s.heroes[0].damage, 0);
});
test("The Day's Rising and Bow attachment targets accept granted keywords but reject missing keywords", () => {
  const s = fixture();
  const rising = make(s, "08139"),
    bow = make(s, "08088");
  assert.ok(playTargets(s, rising).some((u) => u.id === s.heroes[0].id));
  assert.ok(!playTargets(s, rising).some((u) => u.id === s.heroes[1].id));
  attach(s, s.heroes[1], "02117");
  assert.ok(playTargets(s, rising).some((u) => u.id === s.heroes[1].id));
  const ally = make(s, "08117");
  s.allies.push(ally);
  assert.ok(!playTargets(s, bow).some((u) => u.id === ally.id));
  attach(s, ally, "04057");
  assert.ok(playTargets(s, bow).some((u) => u.id === ally.id));
});
test("Treebeard's action excludes Ents prevented from readying and remains usable while exhausted", () => {
  const s = fixture(),
    tree = make(s, "08146"),
    ent = make(s, "08119");
  tree.resources = 2;
  tree.exhausted = false;
  ent.exhausted = true;
  s.allies = [tree, ent];
  attach(s, ent, W.wrapped);
  assert.equal(availableAbilities(s, tree)[0].disabled, true);
  tree.exhausted = true;
  assert.equal(availableAbilities(s, tree)[0].disabled, false);
});
test("Waters obeys Wilyador's five-damage healing cap and removes its physical event at stage two", () => {
  let s = fixture();
  s.scenarioId = "journey-to-rhosgobel";
  s.stage = 2;
  const eagle = make(s, RHOS.wilyador);
  eagle.damage = 8;
  s.allies.push(eagle);
  s.heroes[0].damage = 1;
  s = play(s, "08145");
  assert.equal(get(s, eagle.id)!.damage, 3);
  assert.equal(s.heroes[0].damage, 0);
  assert.ok(s.removed.includes("08145"));
  assert.ok(!s.discard.includes("08145"));
});
test("Waters pays Doomed before a cancellation and leaves the damage in place", () => {
  let s = fixture();
  s.heroes[0].damage = 1;
  const enemy = make(s, SHADOW_FLAME.bane);
  s.staging = [enemy];
  attach(s, enemy, SHADOW_FLAME.counter);
  s.encounterDeck = ["01093"];
  s = play(s, "08145");
  assert.equal(s.threat, 23);
  assert.equal(s.heroes[0].damage, 1);
});
test("Ride cannot bypass a still-active location whose progress is capped", () => {
  let s = fixture();
  s.phase = "quest";
  s.activeLocation = make(s, W.swamp);
  const enemy = make(s, "01082");
  s.staging = [enemy];
  s = play(s, "08142", enemy.id);
  s.queue.push(fx("successfulQuestProgress", { value: 6 }));
  flush(s);
  assert.equal(s.activeLocation!.progress, 1);
  assert.equal(get(s, enemy.id)!.damage, 0);
  assert.equal(s.progress, 0);
});
test("Ride replaces excess successful quest progress with multiple active locations", () => {
  let s = fixture();
  s.phase = "quest";
  s.activeLocation = make(s, "01087");
  s.extraActiveLocations = [make(s, "01087")];
  const enemy = make(s, "01082");
  s.staging = [enemy];
  s = play(s, "08142", enemy.id);
  s.queue.push(fx("successfulQuestProgress", { value: 4 }));
  flush(s);
  assert.equal(s.activeLocation, null);
  assert.equal(s.extraActiveLocations!.length, 0);
  assert.equal(get(s, enemy.id)!.damage, 2);
  assert.equal(s.progress, 0);
});
test("Don't Be Hasty can remove a ready quester and every physical copy can respond before the same reveal", () => {
  let s = fixture(2);
  s.phase = "staging";
  s.hand = [make(s, "08144"), make(s, "08144")];
  const a = s.heroes[0],
    b = seatView(s, 1).heroes[0];
  a.committed = b.committed = true;
  b.exhausted = true;
  revealed(s, "01093");
  flush(s);
  s = choose(reload(s), `hasty-0-${a.id}`);
  assert.match(s.choice!.title, /Hasty/);
  s = choose(reload(s), `hasty-0-${b.id}`);
  assert.equal(get(s, a.id)!.committed, false);
  assert.equal(get(s, b.id)!.committed, false);
  assert.equal(get(s, b.id)!.damage, 0);
  assert.equal(s.choice, null);
});
test("optional Doomed 1 combines with Gríma before Guard's saved response", () => {
  let s = fixture(2);
  s.used.push("round:grima-next");
  s = play(s, "08115");
  s = choose(reload(s), "doomed");
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    [22, 22],
  );
  assert.match(s.choice!.title, /Henneth/);
  s = choose(s, "skip");
  assert.equal(s.choice, null);
});
