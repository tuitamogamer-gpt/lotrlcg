import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { applyAction, playTargets } from "../src/game/engine";
import { card, SCRIPTED } from "../src/game/cards";
import { get, make, playCost, stats } from "../src/game/core";
import { phaseEnd } from "../src/game/board";
import { flush } from "../src/game/effects";
import { availableAbilities, canPlay } from "../src/game/actions";
import { effectiveKeyword } from "../src/game/expansion-passives";
import { DECK_CARDS, HERO_CARDS, deckWarnings } from "../src/game/decks";
import { forOwner } from "../src/game/table";
import { TREASON_PLAYER as P } from "../src/game/treason-saruman-player-cards";
import { TOS_ARAGORN } from "../src/game/lotr-saga-codes";
import { RI } from "../src/game/road-isengard-support";
import {
  base,
  choose,
  deck,
  engaged,
  hand,
  reload,
  settle,
  stage,
} from "./road-isengard-fixtures";
import type { GameState, Unit } from "../src/game/types";
import art from "./treason-saruman-player-art.json";
import official from "../src/data/official-player-cards.json";

const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
/** Replace one of a player's starting heroes (Aragorn stays in slot 2). */
const hero = (s: GameState, code: string, slot: number, p = 0) => {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    s.heroes[slot] = u;
  });
  return u;
};
const ally = (s: GameState, code: string, p = 0) => {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    s.allies.push(u);
  });
  return u;
};
/** Attach a fresh copy of a player attachment to a character. */
const attach = (s: GameState, host: Unit, code: string, p = 0) => {
  const a = { id: `c${s.nextId++}`, code, exhausted: false, owner: p };
  host.attachments.push(a);
  return a;
};
const offered = (s: GameState, code: string) =>
  !!s.choice?.options.some((o) => o.ability?.code === code);
const SNOWBOURN = "01016",
  GLEOWINE = "01062",
  GUARD = "01013",
  BLADE = "01039",
  CORE_GANDALF = "01073",
  GIMLI = "143004",
  LEGOLAS = "143005",
  DRAUGHT = "143009",
  RIDER = "01081",
  ORC = "01089";
const ent = (s: GameState) =>
  s.heroes.find((h) => h.code === P.treebeard) ?? hero(s, P.treebeard, 1);

test("The Treason of Saruman player cards are scripted, deckable and pinned to reviewed scans", () => {
  const codes = Object.values(P).filter((c) => c !== TOS_ARAGORN);
  assert.equal(codes.length, 10);
  for (const code of [...codes, GIMLI, LEGOLAS, DRAUGHT])
    assert.ok(SCRIPTED.has(code), code);
  const heroes = HERO_CARDS.map((c) => c.code),
    deckable = DECK_CARDS.map((c) => c.code);
  for (const code of [P.theoden, P.treebeard])
    assert.ok(heroes.includes(code), code);
  for (const code of codes.filter(
    (c) => ![P.theoden, P.treebeard].includes(c as never),
  ))
    assert.ok(deckable.includes(code), code);
  // The six boons need the Saga's campaign mode.
  for (const code of [
    "143015",
    "143016",
    "143017",
    "143018",
    "143019",
    "143020",
  ])
    assert.ok(!SCRIPTED.has(code), code);
  assert.equal(art.length, 13);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
    assert.equal(card(a.code).imagesrc, a.localPath, a.code);
  }
  // The Three Hunters is paid with the Fellowship Aragorn's resources.
  assert.deepEqual(
    deckWarnings({
      heroes: [P.theoden, P.treebeard, "01002"],
      cards: { [P.hunters]: 1, [P.entmoot]: 1 },
    }),
    [
      "The Three Hunters is paid with the Fellowship Aragorn's resources, so it can only be played in The Treason of Saruman scenarios.",
    ],
  );
  // Every printed text matches the catalog.
  for (const code of [...codes, GIMLI, LEGOLAS, DRAUGHT]) {
    const catalog = (official as { code: string; text?: string }[])
      .find((c) => c.code === code)!
      .text!.replace(/<\/?[bi]>/g, "");
    assert.equal(card(code).text!.replace(/<\/?[bi]>/g, ""), catalog, code);
  }
});

test("Théoden: Sentinel, and the first Rohan ally played from hand each round costs 1 less; Herugrim costs 1 less on Théoden", () => {
  let s = base(1, 2);
  const theoden = hero(s, P.theoden, 0);
  assert.ok(effectiveKeyword(theoden, "Sentinel"));
  const [scout] = hand(s, [SNOWBOURN, GLEOWINE, GUARD]);
  assert.equal(playCost(s, card(SNOWBOURN)), 0);
  assert.equal(playCost(s, card(GLEOWINE)), 1);
  assert.equal(playCost(s, card(GUARD)), 2, "not a Rohan ally");
  // A play from the discard pile is not a play from hand.
  assert.equal(playCost(s, { ...card(GLEOWINE), playOrigin: "discard" }), 2);
  s = act(s, { type: "PLAY", id: scout.id, payment: {} });
  s = settle(s);
  assert.ok(s.allies.some((u) => u.code === SNOWBOURN));
  // The second Rohan ally this round pays the full cost.
  assert.equal(playCost(s, card(GLEOWINE)), 2);
  // A new round resets the reduction.
  s.used = s.used.filter((k) => k.startsWith("game:"));
  assert.equal(playCost(s, card(GLEOWINE)), 1);
  // Herugrim: Rohan heroes only (restricted); 2 on Théoden, 3 on Théodred.
  s = base(1, 2);
  const king = hero(s, P.theoden, 0);
  const theodred =
    s.heroes.find((h) => h.code === "01002") ?? hero(s, "01002", 1);
  const [herugrim] = hand(s, [P.herugrim]);
  const targets = playTargets(s, herugrim).map((u) => u.code);
  assert.ok(targets.includes(P.theoden));
  assert.ok(targets.includes("01002"));
  assert.ok(!targets.includes(TOS_ARAGORN), "Aragorn is not Rohan");
  assert.equal(playCost(s, card(P.herugrim), king), 2);
  assert.equal(playCost(s, card(P.herugrim), theodred), 3);
});

test("Treebeard: 1 damage gives +1 willpower and +1 attack until the end of the phase, 5 times per phase; he cannot have restricted attachments", () => {
  let s = base(1, 2);
  const tree = ent(s);
  // Ent Draught: 7 hit points survive the five uses.
  attach(s, tree, DRAUGHT);
  assert.equal(stats(s, tree).health, 7);
  const before = stats(s, tree);
  for (let i = 1; i <= 5; i++) {
    s = act(s, { type: "ABILITY", id: tree.id });
    const u = get(s, tree.id)!;
    assert.equal(u.damage, i);
    assert.equal(stats(s, u).will, before.will + i);
    assert.equal(stats(s, u).attack, before.attack + i);
  }
  assert.throws(
    () => act(s, { type: "ABILITY", id: tree.id }),
    /5 times per phase/,
  );
  s = base(1, 2);
  const tree2 = ent(s);
  s = act(s, { type: "ABILITY", id: tree2.id });
  phaseEnd(s);
  flush(s);
  assert.equal(stats(s, get(s, tree2.id)!).will, before.will);
  assert.ok(
    availableAbilities(s, get(s, tree2.id)!).some(
      (a) => a.label.startsWith("Treebeard") && !a.disabled,
    ),
    "a new phase resets the limit",
  );
  // Cannot have restricted attachments.
  const [blade] = hand(s, [BLADE]);
  assert.ok(!playTargets(s, blade).some((u) => u.id === tree2.id));
  assert.ok(playTargets(s, blade).length > 0);
});

test("Quickbeam enters play exhausted and may take 1 damage to ready", () => {
  let s = base(1, 2);
  const tree = ent(s);
  tree.resources = 5;
  const [quickbeam] = hand(s, [P.quickbeam]);
  s = act(s, {
    type: "PLAY",
    id: quickbeam.id,
    payment: { [tree.id]: 2 },
  });
  assert.ok(offered(s, P.quickbeam), JSON.stringify(s.choice?.title));
  const played = s.allies.find((u) => u.code === P.quickbeam)!;
  assert.equal(played.exhausted, true);
  s = choose(s, "use");
  const ready = get(s, played.id)!;
  assert.equal(ready.exhausted, false);
  assert.equal(ready.damage, 1);
  // Declined, he stays exhausted.
  s = base(1, 2);
  const tree2 = ent(s);
  tree2.resources = 5;
  const [second] = hand(s, [P.quickbeam]);
  s = act(s, { type: "PLAY", id: second.id, payment: { [tree2.id]: 2 } });
  s = choose(s, "skip");
  const tired = s.allies.find((u) => u.code === P.quickbeam)!;
  assert.equal(tired.exhausted, true);
  assert.equal(tired.damage, 0);
});

test("Háma: a Combat Action readies him with +3 defense; he is discarded at the end of the phase, once per round", () => {
  let s = base(1, 2);
  const hama = ally(s, P.hama);
  hama.exhausted = true;
  assert.throws(() => act(s, { type: "ABILITY", id: hama.id }), /combat phase/);
  s.phase = "defense";
  s = act(s, { type: "ABILITY", id: hama.id });
  const ready = get(s, hama.id)!;
  assert.equal(ready.exhausted, false);
  assert.equal(stats(s, ready).defense, 2 + 3);
  assert.throws(
    () => act(s, { type: "ABILITY", id: hama.id }),
    /once per round/,
  );
  phaseEnd(s);
  flush(s);
  assert.equal(get(s, hama.id), undefined, "Háma is discarded");
  assert.ok(s.discard.includes(P.hama));
});

test("Arod attaches to a hero or Legolas; after its character destroys an enemy, it may place 1 progress on any location", () => {
  let s = base(1, 2);
  const legolas = ally(s, LEGOLAS);
  const guard = ally(s, GUARD);
  const [arod] = hand(s, [P.arod]);
  const targets = playTargets(s, arod).map((u) => u.id);
  assert.ok(targets.includes(legolas.id));
  assert.ok(!targets.includes(guard.id));
  assert.ok(s.heroes.every((h) => targets.includes(h.id)));
  // The attached hero destroys a goblin: 1 progress on Ring-wall of Isengard.
  s = base(1, 2);
  const attacker = s.heroes.find((h) => h.code === TOS_ARAGORN)!;
  const mount = attach(s, attacker, P.arod);
  const wall = stage(s, RI.ringWall);
  const goblin = engaged(s, RIDER);
  s.phase = "attack";
  s = act(s, {
    type: "ATTACK",
    enemyId: goblin.id,
    attackerIds: [attacker.id],
  });
  for (let n = 0; n < 10 && s.choice && !offered(s, P.arod); n++)
    s = choose(s, s.choice.options[0].id);
  assert.ok(offered(s, P.arod), JSON.stringify(s.choice?.title));
  s = choose(s, wall.id);
  assert.equal(s.staging.find((u) => u.id === wall.id)!.progress, 1);
  assert.equal(
    get(s, attacker.id)!.attachments.find((a) => a.id === mount.id)!.exhausted,
    true,
  );
});

test("Herugrim: after the attached hero is declared as an attacker, it may add the hero's willpower to its attack for this attack", () => {
  let s = base(1, 2);
  const theoden = hero(s, P.theoden, 0);
  const blade = attach(s, theoden, P.herugrim);
  const orc = engaged(s, ORC);
  s.phase = "attack";
  const attack = stats(s, theoden).attack,
    will = stats(s, theoden).will;
  s = act(s, { type: "ATTACK", enemyId: orc.id, attackerIds: [theoden.id] });
  assert.ok(offered(s, P.herugrim), JSON.stringify(s.choice?.title));
  s = choose(s, "use");
  s = settle(s);
  assert.ok(
    s.log.some((l) =>
      new RegExp(
        `Herugrim: Théoden gets \\+${will} attack for this attack`,
      ).test(l.text),
    ),
  );
  assert.equal(
    get(s, theoden.id)!.attachments.find((a) => a.id === blade.id)!.exhausted,
    true,
  );
  // The bonus ends with the attack.
  assert.equal(stats(s, get(s, theoden.id)!).attack, attack);
});

test("Entmoot searches the top 5 cards for Ent cards; Helm! Helm! discards a non-unique enemy after the enemy attacks", () => {
  let s = base(1, 2);
  ent(s);
  const [moot] = hand(s, [P.entmoot]);
  deck(s, [P.quickbeam, GUARD, DRAUGHT, GUARD, GUARD, P.quickbeam, GUARD]);
  s = act(s, { type: "PLAY", id: moot.id, payment: {} });
  assert.match(s.choice!.title, /^Entmoot · Add an Ent card/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["take-0", "take-2", "done"],
    "the sixth card is not searched",
  );
  s = choose(s, "take-0");
  // The remaining searched cards: Ent Draught is still offered.
  assert.deepEqual(
    s.choice!.options.map((o) => o.code ?? o.id),
    [DRAUGHT, "done"],
  );
  s = choose(s, s.choice!.options.find((o) => o.code === DRAUGHT)!.id);
  // No Ent card is left among them: the deck is shuffled.
  assert.equal(s.choice, null);
  assert.ok(
    s.log.some((l) => /^Entmoot: the other cards are shuffled/.test(l.text)),
  );
  assert.deepEqual(
    s.hand.map((u) => u.code).sort(),
    [DRAUGHT, P.quickbeam].sort(),
  );
  assert.equal(s.deck.length, 5);
  // Without an Ent character, Entmoot cannot be played.
  s = base(1, 2);
  const [moot2] = hand(s, [P.entmoot]);
  assert.match(canPlay(s, moot2)!, /Ent character/);
  // Helm! Helm!: after the enemy attacks, exhaust and discard a Rohan ally.
  s = base(1, 2);
  const theoden = hero(s, P.theoden, 0);
  theoden.resources = 5;
  const scout = ally(s, SNOWBOURN);
  const orc = engaged(s, ORC);
  const [helm] = hand(s, [P.helm]);
  s.phase = "defense";
  assert.match(canPlay(s, helm)!, /resolving enemy attacks/);
  s.phase = "attack";
  assert.equal(canPlay(s, helm), null);
  s = act(s, {
    type: "PLAY",
    id: helm.id,
    target: scout.id,
    payment: { [theoden.id]: 2 },
  });
  assert.equal(get(s, scout.id), undefined, "the Rohan ally pays the cost");
  assert.ok(s.discard.includes(SNOWBOURN));
  assert.match(s.choice!.title, /^Helm! Helm! · Discard a non-unique enemy/);
  s = choose(s, orc.id);
  assert.ok(!s.engaged.some((u) => u.id === orc.id));
  assert.ok(s.encounterDiscard.includes(ORC));
});

test("The Three Hunters readies 3 committed heroes with +1 willpower, attack and defense until the end of the round; Shadowfax gives Gandalf ranged and sentinel and readies him", () => {
  let s = base(1, 2);
  const aragorn = s.heroes.find((h) => h.code === TOS_ARAGORN)!;
  aragorn.resources = 3;
  const [hunters] = hand(s, [P.hunters]);
  assert.match(canPlay(s, hunters)!, /Quest Action/);
  s.phase = "quest";
  assert.match(canPlay(s, hunters)!, /committed to the quest/);
  for (const h of s.heroes) {
    h.committed = true;
    h.exhausted = true;
  }
  s.committedIds = s.heroes.map((h) => h.id);
  const before = s.heroes.map((h) => stats(s, h));
  s = act(s, {
    type: "PLAY",
    id: hunters.id,
    payment: { [aragorn.id]: 3 },
  });
  s = settle(s);
  s.heroes.forEach((h, i) => {
    assert.equal(h.exhausted, false);
    assert.equal(stats(s, h).will, before[i].will + 1);
    assert.equal(stats(s, h).attack, before[i].attack + 1);
    assert.equal(stats(s, h).defense, before[i].defense + 1);
  });
  // Without the Fellowship Aragorn it cannot be played.
  s = base(1, 2);
  s.heroes = s.heroes.filter((h) => h.code !== TOS_ARAGORN);
  const [other] = hand(s, [P.hunters]);
  s.phase = "quest";
  assert.match(canPlay(s, other)!, /Fellowship Aragorn/);
  // Shadowfax attaches only to Gandalf.
  s = base(1, 2);
  const gandalf = ally(s, CORE_GANDALF);
  const [horse] = hand(s, [P.shadowfax]);
  assert.deepEqual(
    playTargets(s, horse).map((u) => u.id),
    [gandalf.id],
  );
  const shadowfax = attach(s, gandalf, P.shadowfax);
  assert.ok(effectiveKeyword(gandalf, "Ranged"));
  assert.ok(effectiveKeyword(gandalf, "Sentinel"));
  gandalf.exhausted = true;
  s = act(s, { type: "ABILITY", id: gandalf.id, attachmentId: shadowfax.id });
  assert.equal(get(s, gandalf.id)!.exhausted, false);
  assert.equal(
    get(s, gandalf.id)!.attachments.find((a) => a.id === shadowfax.id)!
      .exhausted,
    true,
  );
  assert.throws(() =>
    act(s, { type: "ABILITY", id: gandalf.id, attachmentId: shadowfax.id }),
  );
});
