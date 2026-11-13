import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { applyAction, canPlay, playTargets } from "../src/game/engine";
import { card, SCRIPTED } from "../src/game/cards";
import {
  eligiblePayers,
  engagementCost,
  get,
  make,
  playCost,
  stats,
  threatOf,
} from "../src/game/core";
import { check, engage, phaseEnd, nextRound } from "../src/game/board";
import { flush } from "../src/game/effects";
import { availableAbilities, needsTarget } from "../src/game/actions";
import { combatDefenderDefense } from "../src/game/combat";
import { reduceThreat } from "../src/game/threat-reduction";
import { DECK_CARDS, HERO_CARDS, deckWarnings } from "../src/game/decks";
import { forOwner, seatView } from "../src/game/table";
import { ringBearer } from "../src/game/lotr-saga";
import {
  BLACK_RIDERS_PLAYER as B,
  blackRidersPlayerAttackBonus,
} from "../src/game/black-riders-player-cards";
import { KD } from "../src/game/knife-dark-support";
import {
  base,
  choose,
  deck,
  engaged,
  hand,
  reload,
  settle,
  stage,
} from "./shadow-past-fixtures";
import type { GameState, Unit } from "../src/game/types";
import art from "./black-riders-player-art.json";
import official from "../src/data/official-player-cards.json";

const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
/** Replace one of a player's starting heroes (Frodo stays in slot 3). */
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
const icons = (s: GameState, sphere: string, p = 0) =>
  forOwner(s, p, () => {
    for (const h of s.heroes) {
      h.phaseResourceIcons = [sphere];
      h.resources = 5;
    }
  });
const offered = (s: GameState, code: string) =>
  !!s.choice?.options.some((o) => o.ability?.code === code);
const TROLL = "01082",
  SPIDER = "01096",
  ORCS = "01089",
  RIDER = "01081",
  GANDALF = "01073",
  SNEAK = "01023",
  GREETING = "01046",
  SPARE_PIPE = "22115",
  SAM_ALLY = "12035";

test("The Black Riders player cards are scripted, deckable and pinned to reviewed scans", () => {
  const codes = Object.values(B);
  assert.equal(codes.length, 14);
  for (const code of codes) assert.ok(SCRIPTED.has(code), code);
  const heroes = HERO_CARDS.map((c) => c.code),
    deckable = DECK_CARDS.map((c) => c.code);
  for (const code of [B.sam, B.merry, B.pippin, B.fatty])
    assert.ok(heroes.includes(code), code);
  for (const code of codes.filter(
    (c) => ![B.sam, B.merry, B.pippin, B.fatty].includes(c as never),
  ))
    assert.ok(deckable.includes(code), code);
  // The campaign boons need the Saga campaign mode, which is not imported.
  for (const code of ["141017", "141018", "141019", "141020", "141021"])
    assert.ok(!SCRIPTED.has(code), code);
  assert.equal(art.length, 14);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
    assert.equal(card(a.code).imagesrc, a.localPath);
  }
  // Corrections from the printed cards; every other text is the catalog's.
  const printed: Record<string, string> = {
    [B.sam]: "+1 [willpower], +1 [attack], and +1 [defense]",
    [B.merry]: "for each <b><i>Hobbit</i></b> hero you control",
    [B.bill]:
      "Lower the cost to play Bill the Pony by 2 if you control Sam Gamgee. Cannot have attachments.\n",
    [B.notice]: "Lower the cost to play Take No Notice",
    [B.cloak]: "an attack made by an enemy",
    [B.dagger]: "Attach to a hero. Restricted.\n",
    [B.pipe]: "Attach to a <b><i>Hobbit</i></b>. Limit 1 per character.",
  };
  for (const code of codes) {
    const catalog = (official as { code: string; text?: string }[]).find(
      (c) => c.code === code,
    )!.text;
    if (printed[code]) {
      assert.ok(card(code).text!.includes(printed[code]), code);
      assert.notEqual(card(code).text, catalog, code);
    } else assert.equal(card(code).text, catalog, code);
  }
  assert.ok(needsTarget({ code: B.determination } as Unit));
  // The Saga places the Fellowship Ring-bearer; Fellowship cards are paid
  // with his resources only in The Lord of the Rings scenarios.
  assert.ok(!heroes.includes("141001"));
  assert.deepEqual(
    deckWarnings({
      heroes: [B.sam, B.merry, B.pippin],
      cards: { [B.intuition]: 3, [B.determination]: 3 },
    }),
    [
      "Frodo's Intuition is paid with the Ring-bearer's Fellowship resources, so it can only be played in The Lord of the Rings scenarios.",
    ],
  );
});

test("Pippin adds engagement cost; Sam and Pippin respond after their player engages a more threatening enemy", () => {
  let s = base();
  const sam = hero(s, B.sam, 0);
  hero(s, B.pippin, 1);
  // Sam, Pippin and Frodo are Hobbit heroes: +3 engagement cost.
  const troll = stage(s, TROLL);
  const rider = stage(s, RIDER);
  const witch = stage(s, KD.witchKing);
  assert.equal(engagementCost(s, troll), 33);
  assert.equal(engagementCost(s, rider), 13);
  // Immune to player card effects: Pippin's passive is ignored (FAQ 1.47).
  assert.equal(engagementCost(s, witch), 45);
  sam.exhausted = true;
  deck(s, [GANDALF, SNEAK]);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: troll.id });
  assert.ok(offered(s, B.sam), JSON.stringify(s.choice));
  s = choose(s, "use");
  assert.ok(offered(s, B.pippin));
  s = choose(s, "use");
  let now = get(s, sam.id)!;
  assert.equal(now.exhausted, false);
  assert.deepEqual(
    [stats(s, now).will, stats(s, now).attack, stats(s, now).defense],
    [4, 2, 2],
  );
  assert.deepEqual(
    s.hand.map((u) => u.code),
    [GANDALF],
  );
  // Being engaged counts as engaging (FAQ 1.49). Sam is ready, but his
  // bonus does not depend on readying him, so it applies again.
  engage(s, get(s, witch.id)!);
  flush(s);
  assert.ok(offered(s, B.sam));
  s = choose(s, "use");
  s = choose(s, "use");
  now = get(s, sam.id)!;
  assert.deepEqual(
    [stats(s, now).will, stats(s, now).attack, stats(s, now).defense],
    [5, 3, 3],
  );
  assert.deepEqual(
    s.hand.map((u) => u.code),
    [GANDALF, SNEAK],
  );
  // An enemy whose engagement cost is not higher than the threat: no response.
  engage(s, get(s, rider.id)!);
  flush(s);
  assert.equal(s.choice, null);
  // The bonus lasts until the end of the round.
  nextRound(s);
  now = get(s, sam.id)!;
  assert.deepEqual(
    [stats(s, now).will, stats(s, now).attack, stats(s, now).defense],
    [3, 1, 1],
  );
});

test("Pippin counts his own controller's Hobbit heroes for every enemy, and only his player's engagements trigger the responses", () => {
  let s = base(2);
  hero(s, B.pippin, 0, 0);
  hero(s, B.sam, 0, 1);
  // Player 0: Pippin and Frodo. Player 1's Sam does not count for Pippin.
  const spider = engaged(s, SPIDER, 1);
  assert.equal(engagementCost(s, spider), 27);
  const troll = stage(s, TROLL);
  forOwner(s, 1, () => {
    s.threat = 20;
  });
  // Player 1 engages: Sam (player 1) responds, Pippin (player 0) does not.
  forOwner(s, 1, () => engage(s, troll));
  flush(s);
  assert.ok(offered(s, B.sam));
  assert.ok(!offered(s, B.pippin));
  s = settle(s, "skip");
  assert.equal(seatView(s, 0).hand.length, 0);
});

test("Merry gets +1 attack per Hobbit hero and readies another character after an attack he joins destroys an enemy", () => {
  let s = base();
  const merry = hero(s, B.merry, 0);
  // Merry and Frodo.
  assert.equal(stats(s, merry).attack, 2);
  hero(s, B.sam, 1);
  assert.equal(stats(s, merry).attack, 3);
  const gloin = s.heroes[2];
  const spider = engaged(s, SPIDER);
  s.phase = "attack";
  // Merry 3 + Glóin 2 − 1 defense = 4: the spider (4 hit points) dies.
  s = act(s, {
    type: "ATTACK",
    enemyId: spider.id,
    attackerIds: [merry.id, gloin.id],
  });
  assert.equal(get(s, spider.id), undefined);
  assert.ok(offered(s, B.merry));
  assert.deepEqual(
    s.choice!.options.filter((o) => o.id !== "skip").map((o) => o.id),
    [gloin.id],
  );
  s = choose(s, gloin.id);
  assert.equal(get(s, gloin.id)!.exhausted, false);
  assert.equal(get(s, merry.id)!.exhausted, true);

  // An attack that does not destroy the enemy gives no response.
  s = base();
  const merry2 = hero(s, B.merry, 0);
  const troll = engaged(s, TROLL);
  s.phase = "attack";
  s = act(s, {
    type: "ATTACK",
    enemyId: troll.id,
    attackerIds: [merry2.id, s.heroes[2].id],
  });
  assert.ok(!offered(s, B.merry));
  assert.ok(get(s, troll.id));
});

test("Fatty Bolger exhausts once per round to raise his player's threat by a staging enemy's threat; it stops contributing until the end of the phase", () => {
  let s = base();
  const fatty = hero(s, B.fatty, 0);
  const spider = stage(s, SPIDER);
  const troll = stage(s, TROLL);
  s.phase = "staging";
  assert.ok(
    availableAbilities(s, fatty).some(
      (a) => /Fatty Bolger/.test(a.label) && !a.disabled,
    ),
  );
  s = act(s, { type: "ABILITY", id: fatty.id });
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [spider.id, troll.id],
  );
  s = choose(s, spider.id);
  assert.equal(s.threat, 22);
  assert.equal(get(s, fatty.id)!.exhausted, true);
  assert.equal(threatOf(s, get(s, spider.id)!), 0);
  assert.equal(threatOf(s, get(s, troll.id)!), 1);
  // Limit once per round, even when he is readied.
  get(s, fatty.id)!.exhausted = false;
  assert.ok(
    availableAbilities(s, get(s, fatty.id)!).some(
      (a) => /Fatty Bolger/.test(a.label) && a.disabled,
    ),
  );
  phaseEnd(s);
  assert.equal(threatOf(s, get(s, spider.id)!), 2);
  // No enemy in the staging area: the action cannot be used.
  s = base();
  const lonely = hero(s, B.fatty, 0);
  assert.ok(
    availableAbilities(s, lonely).some(
      (a) => /Fatty Bolger/.test(a.label) && a.disabled,
    ),
  );
});

test("Bill the Pony costs 2 less with Sam Gamgee, gives each Hobbit character +1 hit point and cannot have attachments", () => {
  let s = base();
  assert.equal(playCost(s, card(B.bill)), 2);
  ally(s, SAM_ALLY);
  assert.equal(playCost(s, card(B.bill)), 0);
  s = base();
  const sam = hero(s, B.sam, 0);
  assert.equal(playCost(s, card(B.bill)), 0);
  const frodo = ringBearer(s)!;
  const aragorn = s.heroes[1];
  assert.equal(stats(s, frodo).health, 2);
  const bill = ally(s, B.bill);
  assert.equal(stats(s, frodo).health, 3);
  assert.equal(stats(s, sam).health, 4);
  assert.equal(stats(s, bill).health, 2);
  assert.equal(stats(s, aragorn).health, card(aragorn.code).health);
  // No attachment can be played on him.
  const pipe = hand(s, [SPARE_PIPE])[0];
  assert.ok(playTargets(s, pipe).some((u) => u.id === sam.id));
  assert.ok(!playTargets(s, pipe).some((u) => u.id === bill.id));
  // Anything attached while his text was blank goes as his text returns.
  bill.attachments.push({ id: "spare", code: SPARE_PIPE, exhausted: false });
  check(s);
  assert.deepEqual(get(s, bill.id)!.attachments, []);
  assert.ok(s.discard.includes(SPARE_PIPE));
  // Losing the hit point when he leaves can destroy a damaged Hobbit.
  get(s, sam.id)!.damage = 3;
  check(s);
  assert.ok(get(s, sam.id));
  s.allies = s.allies.filter((u) => u.id !== bill.id);
  check(s);
  assert.equal(get(s, sam.id), undefined);
});

test("Barliman Butterbur may take undefended damage while each hero of his player is a Hobbit", () => {
  let s = base();
  hero(s, B.sam, 0);
  hero(s, B.merry, 1);
  hero(s, B.pippin, 2);
  const barliman2 = ally(s, B.barliman);
  const spider2 = engaged(s, SPIDER);
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: spider2.id, defenderIds: [] });
  for (
    let n = 0;
    n < 10 && s.choice && !s.choice.title.startsWith("Assign");
    n++
  )
    s = choose(
      s,
      (
        s.choice.options.find((o) => o.id === "skip") ??
        s.choice.options.find((o) => o.id === "resolve") ??
        s.choice.options[0]
      ).id,
    );
  assert.match(s.choice!.title, /Assign 2 damage/);
  assert.ok(s.choice!.options.some((o) => o.id === barliman2.id));
  s = choose(s, barliman2.id);
  assert.equal(get(s, barliman2.id)!.damage, 2);
  // With a non-Hobbit hero he is not a legal target.
  s = base();
  const barliman3 = ally(s, B.barliman);
  const spider3 = engaged(s, SPIDER);
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: spider3.id, defenderIds: [] });
  for (
    let n = 0;
    n < 10 && s.choice && !s.choice.title.startsWith("Assign");
    n++
  )
    s = choose(s, s.choice.options[0].id);
  assert.match(s.choice!.title, /Assign 2 damage/);
  assert.ok(!s.choice!.options.some((o) => o.id === barliman3.id));
});

test("Farmer Maggot deals 1 damage to an enemy engaged with his player when he enters play, 2 if its engagement cost is higher than the threat", () => {
  let s = base();
  icons(s, "tactics");
  const spider = engaged(s, SPIDER);
  const orcs = engaged(s, ORCS);
  const maggot = hand(s, [B.maggot])[0];
  s = act(s, { type: "PLAY", id: maggot.id });
  assert.ok(offered(s, B.maggot));
  assert.deepEqual(
    s.choice!.options.map((o) => o.label),
    [
      `${card(SPIDER).name} · 2 damage`,
      `${card(ORCS).name} · 1 damage`,
      "Continue without using this ability",
    ],
  );
  s = choose(s, spider.id);
  assert.equal(get(s, spider.id)!.damage, 2);
  assert.equal(get(s, orcs.id)!.damage, 0);
  // Put into play by Sneak Attack, he responds too.
  s = base();
  icons(s, "leadership");
  engaged(s, ORCS);
  const [sneak, maggot2] = hand(s, [SNEAK, B.maggot]);
  s = act(s, { type: "PLAY", id: sneak.id, target: maggot2.id });
  for (let n = 0; n < 5 && s.choice && !offered(s, B.maggot); n++)
    s = choose(s, s.choice.options[0].id);
  assert.ok(offered(s, B.maggot));
  // No enemy engaged with his player: no response.
  s = base();
  icons(s, "tactics");
  stage(s, SPIDER);
  s = act(s, { type: "PLAY", id: hand(s, [B.maggot])[0].id });
  assert.ok(!offered(s, B.maggot));
});

test("Halfling Determination gives a Hobbit character +2 willpower, attack and defense until the end of the phase", () => {
  let s = base();
  icons(s, "tactics");
  const frodo = ringBearer(s)!;
  const event = hand(s, [B.determination])[0];
  assert.deepEqual(
    playTargets(s, event).map((u) => u.id),
    [frodo.id],
  );
  s = act(s, { type: "PLAY", id: event.id, target: frodo.id });
  const now = get(s, frodo.id)!;
  assert.deepEqual(
    [stats(s, now).will, stats(s, now).attack, stats(s, now).defense],
    [4, 3, 4],
  );
  phaseEnd(s);
  assert.equal(stats(s, get(s, frodo.id)!).will, 2);
});

test("Smoke Rings reduces the threat by the Pipes its player controls and gives each hero with a Pipe +1 willpower; Hobbit Pipe draws after event threat reduction", () => {
  let s = base();
  icons(s, "spirit");
  const frodo = ringBearer(s)!;
  const sam = hero(s, B.sam, 0);
  sam.resources = 5;
  sam.phaseResourceIcons = ["spirit"];
  const smoke = hand(s, [B.smoke])[0];
  assert.match(canPlay(s, smoke)!, /Pipe/);
  const pipe = hand(s, [B.pipe])[0];
  // Hobbit characters only, one Hobbit Pipe each.
  assert.deepEqual(
    playTargets(s, pipe)
      .map((u) => u.id)
      .sort(),
    [sam.id, frodo.id].sort(),
  );
  s = act(s, { type: "PLAY", id: pipe.id, target: frodo.id });
  assert.ok(
    !playTargets(s, hand(s, [B.pipe])[0]).some((u) => u.id === frodo.id),
  );
  get(s, sam.id)!.attachments.push({
    id: "pipe-2",
    code: B.pipe,
    exhausted: false,
  });
  deck(s, [GANDALF, SNEAK, GANDALF]);
  s = act(s, { type: "PLAY", id: smoke.id });
  assert.equal(s.threat, 18);
  assert.equal(stats(s, get(s, frodo.id)!).will, 3);
  assert.equal(stats(s, get(s, sam.id)!).will, 4);
  // Each ready Hobbit Pipe its player controls may respond.
  assert.ok(offered(s, B.pipe));
  s = choose(s, "use");
  assert.ok(offered(s, B.pipe));
  s = choose(s, "skip");
  assert.equal(s.hand.filter((u) => u.code === GANDALF).length, 1);
  assert.equal(
    [...get(s, frodo.id)!.attachments, ...get(s, sam.id)!.attachments].filter(
      (a) => a.code === B.pipe && a.exhausted,
    ).length,
    1,
  );
  phaseEnd(s);
  assert.equal(stats(s, get(s, frodo.id)!).will, 2);
  // A reduction by a hero or quest effect does not trigger the Pipe.
  get(s, sam.id)!.attachments.forEach((a) => (a.exhausted = false));
  get(s, frodo.id)!.attachments.forEach((a) => (a.exhausted = false));
  reduceThreat(s, 1, B.sam);
  reduceThreat(s, 1, undefined, "quest-card");
  flush(s);
  assert.equal(s.choice, null);
  // Another event's reduction does.
  reduceThreat(s, 2, GREETING);
  flush(s);
  assert.ok(offered(s, B.pipe));
});

test("Take No Notice costs 1 less per Hobbit or Ranger hero and adds 5 to each enemy's engagement cost until the end of the round", () => {
  let s = base();
  icons(s, "lore");
  // Aragorn is a Ranger and Frodo a Hobbit.
  assert.equal(playCost(s, card(B.notice)), 1);
  const event = hand(s, [B.notice])[0];
  assert.match(canPlay(s, event)!, /enemy/);
  const troll = stage(s, TROLL);
  const spider = engaged(s, SPIDER);
  s = act(s, { type: "PLAY", id: event.id });
  assert.equal(engagementCost(s, get(s, troll.id)!), 35);
  assert.equal(engagementCost(s, get(s, spider.id)!), 30);
  // Fixed when it resolves (FAQ 1.55): a later enemy is not affected.
  const late = stage(s, ORCS);
  assert.equal(engagementCost(s, late), 10);
  s.queue = [{ kind: "endRoundScenarioDone" }];
  flush(s);
  assert.equal(engagementCost(s, get(s, troll.id)!), 30);
});

test("Frodo's Intuition is paid with Fellowship resources, gives each hero +1 willpower this round and draws per Hobbit hero", () => {
  let s = base();
  const frodo = ringBearer(s)!;
  hero(s, B.pippin, 0);
  const event = hand(s, [B.intuition])[0];
  assert.deepEqual(
    eligiblePayers(s, card(B.intuition)).map((u) => u.id),
    [frodo.id],
  );
  frodo.resources = 2;
  deck(s, [GANDALF, SNEAK, GANDALF]);
  s = act(s, { type: "PLAY", id: event.id });
  s = settle(s);
  // Pippin and Frodo: draw 2.
  assert.deepEqual(
    s.hand.map((u) => u.code),
    [GANDALF, SNEAK],
  );
  assert.equal(stats(s, get(s, frodo.id)!).will, 3);
  assert.equal(
    stats(s, s.heroes[1]).will,
    card(s.heroes[1].code).willpower! + 1,
  );
  phaseEnd(s);
  assert.equal(stats(s, get(s, frodo.id)!).will, 3);
  nextRound(s);
  assert.equal(stats(s, get(s, frodo.id)!).will, 2);
});

test("Hobbit Cloak and Dagger of Westernesse reward enemies with a higher engagement cost than the threat", () => {
  let s = base();
  icons(s, "leadership");
  const sam = hero(s, B.sam, 0);
  sam.resources = 5;
  const frodo = ringBearer(s)!;
  const cloak = hand(s, [B.cloak])[0];
  // Hobbit heroes only, one each.
  assert.deepEqual(
    playTargets(s, cloak)
      .map((u) => u.id)
      .sort(),
    [sam.id, frodo.id].sort(),
  );
  s = act(s, { type: "PLAY", id: cloak.id, target: sam.id });
  const troll = engaged(s, TROLL);
  const orcs = engaged(s, ORCS);
  const combat = { defensePenalty: 0 } as NonNullable<GameState["combat"]>;
  const cloaked = get(s, sam.id)!;
  assert.equal(combatDefenderDefense(s, cloaked, troll, combat), 3);
  assert.equal(combatDefenderDefense(s, cloaked, orcs, combat), 1);
  // A real defense against the Forest Spider (25): 2 attack − 3 defense.
  const spider = engaged(s, SPIDER);
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: spider.id, defenderId: sam.id });
  s = settle(s);
  assert.equal(get(s, sam.id)!.damage, 0);

  s = base();
  icons(s, "tactics");
  const aragorn = s.heroes[0];
  const dagger = hand(s, [B.dagger])[0];
  s = act(s, { type: "PLAY", id: dagger.id, target: aragorn.id });
  const armed = get(s, aragorn.id)!;
  assert.equal(stats(s, armed).attack, card(aragorn.code).attack! + 1);
  const big = engaged(s, SPIDER);
  const small = engaged(s, ORCS);
  assert.equal(blackRidersPlayerAttackBonus(s, armed, big), 1);
  assert.equal(blackRidersPlayerAttackBonus(s, armed, small), 0);
  // Aragorn 3 + 2 − 1 defense = 4 against the 4 hit point spider.
  s.phase = "attack";
  s = act(s, { type: "ATTACK", enemyId: big.id, attackerIds: [aragorn.id] });
  s = settle(s);
  assert.equal(get(s, big.id), undefined);
});
