import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { applyAction, playTargets } from "../src/game/engine";
import { card, SCRIPTED } from "../src/game/cards";
import {
  engagementCost,
  enemyAttackPrevented,
  fx,
  get,
  stats,
} from "../src/game/core";
import { nextRound, phaseEnd } from "../src/game/board";
import { flush } from "../src/game/effects";
import { availableAbilities, canPlay } from "../src/game/actions";
import { DECK_CARDS, HERO_CARDS, deckWarnings } from "../src/game/decks";
import { forOwner, seatView } from "../src/game/table";
import { make } from "../src/game/core";
import { MOUNTAIN_FIRE_PLAYER as P } from "../src/game/mountain-fire-player-cards";
import {
  allies,
  base,
  choose,
  engaged,
  frodo,
  hand,
  reload,
  settle,
  stage,
} from "./mount-doom-fixtures";
import type { GameState, Unit } from "../src/game/types";
import art from "./mountain-fire-player-art.json";
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
    u.resources = 10;
    s.heroes[slot] = u;
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
/** Answer every unrelated decision until the given card's Response is offered. */
const until = (s: GameState, code: string) => {
  for (let n = 0; n < 20 && s.choice && !offered(s, code); n++)
    s = choose(
      s,
      (
        s.choice.options.find((o) =>
          ["skip", "resolve", "undefended", "keep"].includes(o.id),
        ) ?? s.choice.options[0]
      ).id,
    );
  assert.ok(offered(s, code), JSON.stringify(s.choice?.title));
  return s;
};
/** Choose the given card's option (its "use" option unless an id is given). */
const use = (s: GameState, code: string, id = "use") =>
  choose(
    s,
    (s.choice!.options.find((o) => o.ability?.code === code && o.id === id) ??
      s.choice!.options.find((o) => o.ability?.code === code))!.id,
  );
const label = (s: GameState, u: Unit, pattern: RegExp) =>
  availableAbilities(s, u).find((a) => pattern.test(a.label));
const GUARD = "01013",
  SCOUT = "01016",
  OUTRIDER = "07006",
  TOOK = "01043",
  BRANDYBUCK = "10006",
  LEGOLAS = "01005",
  EOWYN = "01007",
  ELROHIR_HERO = "04001",
  WOLF = "01081",
  ORCS = "01089",
  TROLL = "01082",
  WARGS = "01085";
const CODES = [
  P.eomer,
  P.tom,
  P.rosie,
  P.elfhelm,
  P.elladan,
  P.elrohir,
  P.disguise,
  P.captains,
  P.guthwine,
  P.raise,
] as const;

test("The Mountain of Fire player cards are scripted, deckable, pinned to reviewed scans and corrected from them", () => {
  for (const code of [...CODES, P.frodo, P.aragorn, "146012"])
    assert.ok(SCRIPTED.has(code), card(code).name);
  const heroes = HERO_CARDS.map((c) => c.code),
    deckable = DECK_CARDS.map((c) => c.code);
  for (const code of [P.eomer, P.tom]) assert.ok(heroes.includes(code), code);
  for (const code of CODES.filter((c) => c !== P.eomer && c !== P.tom))
    assert.ok(deckable.includes(code), code);
  assert.equal(art.length, 10);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
    assert.equal(card(a.code).imagesrc, a.localPath, a.code);
  }
  const printed = (code: string) =>
    (official as { code: string; text?: string }[])
      .find((c) => c.code === code)!
      .text!.replace(/\r\n/g, "\n")
      .replace(/<\/?[bi]>/g, "")
      .replace(/<b\.Response:/g, "Response:")
      .replace(/ {2,}/g, " ")
      .trim();
  const corrected: Record<string, [string, string][]> = {
    [P.eomer]: [["to immediately declare him", "to declare him"]],
    [P.rosie]: [["[attack], [defense]", "[attack], or [defense]"]],
    [P.disguise]: [
      ["Limit one per hero.", "Limit 1 per hero."],
      ["enagement check", "engagement check"],
      ["Orc Disguise. . Until", "Orc Disguise. Until"],
    ],
    [P.raise]: [["search you entire deck", "search your entire deck"]],
  };
  for (const code of CODES) {
    let text = printed(code);
    for (const [from, to] of corrected[code] ?? []) {
      assert.ok(text.includes(from), `${code}: ${from}`);
      text = text.replace(from, to);
    }
    assert.equal(card(code).text, text, code);
    assert.ok(!/<\/?[bi]>|<b\./.test(card(code).text ?? ""), code);
  }
  assert.match(
    deckWarnings({ heroes: ["01001"], cards: { [P.disguise]: 1 } }).join(" "),
    /Orc Disguise is paid with the Ring-bearer's Fellowship resources/,
  );
});

test("Éomer: after he commits to the quest, he spends 1 resource to attack an enemy in the staging area although questing exhausted him", () => {
  let s = base(1, 1);
  const eomer = hero(s, P.eomer, 2);
  const wolf = stage(s, WOLF);
  const orcs = stage(s, ORCS);
  s.phase = "quest";
  s = act(s, { type: "TOGGLE_QUEST", id: eomer.id });
  s = act(s, { type: "COMMIT" });
  s = until(s, P.eomer);
  assert.match(s.choice!.title, /^Éomer · Committed to the quest/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [wolf.id, orcs.id, "skip"],
    "the enemies in the staging area, not its locations",
  );
  assert.equal(get(s, eomer.id)!.exhausted, true, "questing exhausted him");
  s = choose(s, wolf.id);
  s = settle(s);
  const after = get(s, eomer.id)!;
  assert.equal(after.resources, 9);
  assert.equal(after.committed, true, "he stays committed to the quest");
  assert.ok(!s.staging.some((u) => u.id === wolf.id), "3 attack destroys it");
  assert.ok(s.log.some((l) => /Éomer spends 1 resource/.test(l.text)));
  // Without a resource in his pool the Response is not offered.
  s = base(1, 1);
  const poor = hero(s, P.eomer, 2);
  poor.resources = 0;
  stage(s, WOLF);
  s.phase = "quest";
  s = act(s, { type: "TOGGLE_QUEST", id: poor.id });
  s = act(s, { type: "COMMIT" });
  assert.ok(!offered(s, P.eomer));
  // Without an enemy in the staging area there is nothing to attack.
  s = base(1, 1);
  const alone = hero(s, P.eomer, 2);
  s.phase = "quest";
  s = act(s, { type: "TOGGLE_QUEST", id: alone.id });
  s = act(s, { type: "COMMIT" });
  assert.ok(!offered(s, P.eomer));
});

test("Captains of the West: a Quest Action gives each Noble hero +1 willpower and lets it commit without exhausting; a ready Éomer exhausts as he attacks", () => {
  let s = base(1, 1);
  const [captains] = hand(s, [P.captains]);
  const aragorn = s.heroes[0],
    gloin = s.heroes[2],
    fr = frodo(s)!;
  assert.match(canPlay(s, captains) ?? "", /Quest Action/);
  s.phase = "quest";
  assert.ok(!canPlay(s, captains));
  s = act(s, {
    type: "PLAY",
    id: captains.id,
    payment: { [aragorn.id]: 3 },
  });
  s = settle(s);
  assert.equal(stats(s, get(s, gloin.id)!).will, card("01003").willpower! + 1);
  assert.equal(stats(s, get(s, fr.id)!).will, card(P.frodo).willpower!);
  s = act(s, { type: "TOGGLE_QUEST", id: gloin.id });
  s = act(s, { type: "TOGGLE_QUEST", id: fr.id });
  s = act(s, { type: "COMMIT" });
  assert.equal(get(s, gloin.id)!.exhausted, false, "Glóin is Noble");
  assert.equal(get(s, gloin.id)!.committed, true);
  assert.equal(get(s, fr.id)!.exhausted, true, "Frodo is not Noble");
  // Until the end of the phase only.
  phaseEnd(s);
  flush(s);
  assert.equal(stats(s, get(s, gloin.id)!).will, card("01003").willpower!);
  // Éomer is Noble: committed ready, he exhausts when his Response declares him.
  s = base(1, 1);
  const eomer = hero(s, P.eomer, 2);
  const [second] = hand(s, [P.captains]);
  const wolf = stage(s, WOLF);
  s.phase = "quest";
  s = act(s, {
    type: "PLAY",
    id: second.id,
    payment: { [s.heroes[0].id]: 3 },
  });
  s = settle(s);
  s = act(s, { type: "TOGGLE_QUEST", id: eomer.id });
  s = act(s, { type: "COMMIT" });
  s = until(s, P.eomer);
  assert.equal(get(s, eomer.id)!.exhausted, false);
  s = choose(s, wolf.id);
  s = settle(s);
  assert.equal(get(s, eomer.id)!.exhausted, true);
});

test("Tom Cotton: engaged with an enemy above your threat, the first Hobbit ally you play each round needs no resource match; a Hobbit ally entering play gets +2 attack until the end of the round", () => {
  let s = base(1, 1);
  hero(s, P.tom, 2);
  const aragorn = s.heroes[0];
  const [took, brandybuck] = hand(s, [TOOK, BRANDYBUCK]);
  // Wandering Took is Spirit: no hero here has the Spirit icon.
  assert.ok(canPlay(s, took), "a resource match is required");
  // The Hill Troll's engagement cost (30) is higher than the threat (20).
  engaged(s, TROLL);
  assert.ok(!canPlay(s, took));
  s = act(s, { type: "PLAY", id: took.id, payment: { [aragorn.id]: 2 } });
  s = until(s, P.tom);
  assert.match(s.choice!.title, /^Tom Cotton · Wandering Took entered play/);
  s = use(s, P.tom);
  s = settle(s);
  const ally = s.allies.find((u) => u.code === TOOK)!;
  assert.equal(stats(s, ally).attack, card(TOOK).attack! + 2);
  assert.equal(get(s, aragorn.id)!.resources, 8);
  // The second Hobbit ally of the round needs its resource match again.
  assert.ok(
    canPlay(
      s,
      s.hand.find((u) => u.id === brandybuck.id)!,
    ),
  );
  // The bonus lasts until the end of the round; the next round has a new first.
  nextRound(s);
  s = settle(s);
  assert.equal(
    stats(
      s,
      s.allies.find((u) => u.code === TOOK)!,
    ).attack,
    card(TOOK).attack!,
  );
  s.phase = "planning";
  assert.ok(
    !canPlay(
      s,
      s.hand.find((u) => u.id === brandybuck.id)!,
    ),
  );
  // Not engaged with an enemy above your threat: the match is required.
  s = base(1, 1);
  hero(s, P.tom, 2);
  const [third] = hand(s, [TOOK]);
  engaged(s, WARGS);
  assert.ok(canPlay(s, third), "Wargs' engagement cost equals the threat");
});

test("Rosie Cotton: exhaust her to add her willpower to a Hobbit hero's willpower, attack or defense until the end of the phase, once per phase", () => {
  let s = base(1, 1);
  const [rosie] = allies(s, [P.rosie]);
  const fr = frodo(s)!;
  const pattern = /^Rosie Cotton · Exhaust her/;
  assert.ok(!label(s, rosie, pattern)!.disabled);
  s = act(s, { type: "ABILITY", id: rosie.id });
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [`${fr.id}:will`, `${fr.id}:attack`, `${fr.id}:defense`],
    "Frodo is the only Hobbit hero",
  );
  s = choose(s, `${fr.id}:attack`);
  assert.equal(stats(s, frodo(s)!).attack, card(P.frodo).attack! + 2);
  const exhausted = get(s, rosie.id)!;
  assert.equal(exhausted.exhausted, true);
  exhausted.exhausted = false;
  assert.ok(label(s, exhausted, pattern)!.disabled, "limit once per phase");
  phaseEnd(s);
  flush(s);
  assert.equal(stats(s, frodo(s)!).attack, card(P.frodo).attack!);
  assert.ok(!label(s, get(s, rosie.id)!, pattern)!.disabled);
  // Without a Hobbit hero she has no target.
  s = base(1, 1);
  const [lonely] = allies(s, [P.rosie]);
  s.heroes = s.heroes.filter((h) => h.code !== P.frodo);
  assert.ok(label(s, lonely, pattern)!.disabled);
});

test("Elfhelm: spend 1 resource from a Rohan hero's pool to put him into play from your hand; he is discarded at the end of the phase", () => {
  let s = base(1, 1);
  const [elfhelm] = hand(s, [P.elfhelm]);
  const theodred = s.heroes[1];
  const pattern = /^Elfhelm · Spend 1 resource from a Rohan hero's pool/;
  assert.ok(!label(s, elfhelm, pattern)!.disabled);
  s = act(s, { type: "ABILITY", id: elfhelm.id });
  s = settle(s);
  assert.ok(s.allies.some((u) => u.code === P.elfhelm));
  assert.ok(!s.hand.some((u) => u.code === P.elfhelm));
  assert.equal(get(s, theodred.id)!.resources, 9, "Théodred is the Rohan hero");
  phaseEnd(s);
  flush(s);
  s = settle(s);
  assert.ok(!s.allies.some((u) => u.code === P.elfhelm));
  assert.ok(s.discard.includes(P.elfhelm));
  // Two Rohan heroes: the player chooses which pool pays.
  s = base(1, 1);
  const eowyn = hero(s, EOWYN, 2);
  const [second] = hand(s, [P.elfhelm]);
  s = act(s, { type: "ABILITY", id: second.id });
  assert.deepEqual(
    s.choice!.options.map((o) => o.id).sort(),
    [s.heroes[1].id, eowyn.id].sort(),
  );
  s = choose(s, eowyn.id);
  assert.equal(get(s, eowyn.id)!.resources, 9);
  assert.ok(s.allies.some((u) => u.code === P.elfhelm));
  // No Rohan hero with a resource: the Action is unavailable.
  s = base(1, 1);
  const [third] = hand(s, [P.elfhelm]);
  s.heroes[1].resources = 0;
  assert.ok(label(s, third, pattern)!.disabled);
});

test("Elladan and Elrohir: +2 attack and +2 defense while the other is in play (either version); each readies after you optionally engage an Orc", () => {
  let s = base(1, 1);
  const [elladan] = allies(s, [P.elladan]);
  assert.equal(stats(s, elladan).attack, card(P.elladan).attack!);
  const [elrohir] = allies(s, [P.elrohir]);
  assert.equal(stats(s, elladan).attack, card(P.elladan).attack! + 2);
  assert.equal(stats(s, elrohir).defense, card(P.elrohir).defense! + 2);
  elladan.exhausted = true;
  elrohir.exhausted = true;
  const wolf = stage(s, WOLF);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: wolf.id });
  s = until(s, P.elladan);
  s = use(s, P.elladan);
  s = until(s, P.elrohir);
  s = use(s, P.elrohir);
  s = settle(s);
  assert.equal(get(s, elladan.id)!.exhausted, false);
  assert.equal(get(s, elrohir.id)!.exhausted, false);
  // A non-Orc enemy optionally engaged readies neither.
  s = base(1, 1);
  const [twin] = allies(s, [P.elladan]);
  twin.exhausted = true;
  const wargs = stage(s, WARGS);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: wargs.id });
  assert.ok(!offered(s, P.elladan));
  // An Orc engaging through the engagement check is not optional.
  s = base(1, 1);
  const [other] = allies(s, [P.elrohir]);
  other.exhausted = true;
  stage(s, WOLF);
  s.phase = "encounter";
  s.queue.push(fx("engagementRound"));
  flush(s);
  assert.ok(!offered(s, P.elrohir));
  // The hero Elrohir finds The Mountain of Fire's Elladan by title.
  s = base(1, 1);
  const heroElrohir = hero(s, ELROHIR_HERO, 2);
  assert.equal(stats(s, heroElrohir).defense, card(ELROHIR_HERO).defense!);
  allies(s, [P.elladan]);
  assert.equal(stats(s, heroElrohir).defense, card(ELROHIR_HERO).defense! + 2);
});

test("Orc Disguise: attached to the Ring-bearer, an Orc making an engagement check with you gets +5 engagement cost; after an Orc engages you, discard it and that enemy cannot attack you this round", () => {
  let s = base(1, 1);
  const fr = frodo(s)!;
  const [disguise] = hand(s, [P.disguise]);
  assert.deepEqual(
    playTargets(s, disguise).map((u) => u.id),
    [fr.id],
    "the Ring-bearer only",
  );
  s = act(s, {
    type: "PLAY",
    id: disguise.id,
    target: fr.id,
    payment: { [fr.id]: 1 },
  });
  s = settle(s);
  assert.ok(frodo(s)!.attachments.some((a) => a.code === P.disguise));
  assert.equal(
    playTargets(s, make(s, P.disguise)).length,
    0,
    "limit 1 per hero",
  );
  // A non-Orc is not disguised against: Wargs (20) engages at threat 20.
  const wargs = stage(s, WARGS);
  s.phase = "encounter";
  s.queue.push(fx("engagementRound"));
  flush(s);
  s = settle(s);
  assert.ok(s.engaged.some((u) => u.id === wargs.id));
  // Threat 12: Wolf Rider (10) checks at 15 and stays in the staging area.
  s.threat = 12;
  const wolf = stage(s, WOLF);
  s.queue.push(fx("engagementRound"));
  flush(s);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === wolf.id));
  assert.equal(engagementCost(s, wolf), 10, "only during the engagement check");
  // Threat 15: the Orc engages; the Response discards Orc Disguise.
  s.threat = 15;
  s.queue.push(fx("engagementRound"));
  flush(s);
  s = until(s, P.disguise);
  assert.match(s.choice!.title, /^Orc Disguise · Wolf Rider engaged you/);
  s = use(s, P.disguise);
  s = settle(s);
  assert.ok(s.engaged.some((u) => u.id === wolf.id));
  assert.ok(!frodo(s)!.attachments.some((a) => a.code === P.disguise));
  assert.ok(s.discard.includes(P.disguise));
  assert.ok(enemyAttackPrevented(s, get(s, wolf.id)!, 0));
  // Until the end of the round only.
  nextRound(s);
  s = settle(s);
  assert.ok(!enemyAttackPrevented(s, get(s, wolf.id)!, 0));
});

test("Orc Disguise in a two-player game protects only its controller", () => {
  let s = base(2, 1);
  const fr = frodo(s)!;
  attach(s, fr, P.disguise, 0);
  forOwner(s, 1, () => {
    s.threat = 12;
  });
  forOwner(s, 0, () => {
    s.threat = 12;
  });
  const wolf = stage(s, WOLF);
  s.phase = "encounter";
  s.queue.push(fx("engagementRound"));
  flush(s);
  s = settle(s);
  assert.ok(
    seatView(s, 1).engaged.some((u) => u.id === wolf.id),
    "the second player has no disguise",
  );
  assert.ok(!seatView(s, 0).engaged.some((u) => u.id === wolf.id));
});

test("Gúthwinë: a restricted Rohan hero's weapon; exhausted after its hero is declared as an attacker, +2 attack for this attack and a Rohan ally back from the discard pile when it destroys an enemy", () => {
  let s = base(1, 1);
  const aragorn = s.heroes[0],
    theodred = s.heroes[1];
  const [guthwine] = hand(s, [P.guthwine]);
  assert.deepEqual(
    playTargets(s, guthwine).map((u) => u.id),
    [theodred.id],
    "Théodred is the only Rohan hero",
  );
  s = act(s, {
    type: "PLAY",
    id: guthwine.id,
    target: theodred.id,
    payment: { [aragorn.id]: 2 },
  });
  s = settle(s);
  s.discard.push(SCOUT, GUARD);
  const orcs = engaged(s, ORCS);
  s.phase = "attack";
  s.combat = null;
  s = act(s, { type: "ATTACK", enemyId: orcs.id, attackerIds: [theodred.id] });
  s = until(s, P.guthwine);
  s = use(s, P.guthwine);
  s = settle(s);
  assert.ok(!s.engaged.some((u) => u.id === orcs.id), "4 attack destroys it");
  assert.ok(
    s.hand.some((u) => u.code === SCOUT),
    "Snowbourn Scout returns",
  );
  assert.ok(!s.discard.includes(SCOUT));
  assert.ok(s.discard.includes(GUARD), "only a Rohan ally returns");
  const after = get(s, theodred.id)!;
  assert.equal(
    stats(s, after).attack,
    card("01002").attack!,
    "this attack only",
  );
  assert.ok(after.attachments.find((a) => a.code === P.guthwine)!.exhausted);
  // Two different Rohan allies: the player chooses one.
  s = base(1, 1);
  const host = s.heroes[1];
  attach(s, host, P.guthwine);
  s.discard.push(SCOUT, OUTRIDER);
  const second = engaged(s, ORCS);
  s.phase = "attack";
  s.combat = null;
  s = act(s, { type: "ATTACK", enemyId: second.id, attackerIds: [host.id] });
  s = until(s, P.guthwine);
  s = use(s, P.guthwine);
  for (
    let n = 0;
    n < 10 && !s.choice?.title.startsWith("Gúthwinë · Return");
    n++
  )
    s = choose(s, s.choice!.options[0].id);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [SCOUT, OUTRIDER],
  );
  s = choose(s, OUTRIDER);
  assert.ok(s.hand.some((u) => u.code === OUTRIDER));
  assert.ok(s.discard.includes(SCOUT));
  // A tougher enemy survives: +2 attack, no ally returns.
  s = base(1, 1);
  const third = s.heroes[1];
  attach(s, third, P.guthwine);
  s.discard.push(SCOUT);
  const troll = engaged(s, TROLL);
  s.phase = "attack";
  s.combat = null;
  s = act(s, { type: "ATTACK", enemyId: troll.id, attackerIds: [third.id] });
  s = until(s, P.guthwine);
  s = use(s, P.guthwine);
  s = settle(s);
  assert.equal(get(s, troll.id)!.damage, 1, "4 attack against 3 defense");
  assert.ok(s.discard.includes(SCOUT));
});

test("Raise the Shire: after you engage an enemy, search the top 5 cards (your entire deck above your threat) for a Hobbit ally to put into play, shuffle, and return it to your hand at the end of the round", () => {
  let s = base(1, 1);
  const legolas = hero(s, LEGOLAS, 2);
  const [raise] = hand(s, [P.raise]);
  s.deck = [GUARD, GUARD, GUARD, BRANDYBUCK, GUARD, GUARD, TOOK, GUARD];
  // Wolf Rider's engagement cost (10) is not higher than the threat (20).
  const wolf = stage(s, WOLF);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: wolf.id });
  s = until(s, P.raise);
  assert.match(s.choice!.options[0].label, /the top 5 cards of your deck/);
  s = use(s, P.raise, "play");
  for (
    let n = 0;
    n < 10 && !s.choice?.title.startsWith("Raise the Shire · Put");
    n++
  )
    s = choose(s, s.choice!.options[0].id);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["ally-3", "none"],
    "Wandering Took is the seventh card",
  );
  s = choose(s, "ally-3");
  s = settle(s);
  const brandybuck = s.allies.find((u) => u.code === BRANDYBUCK)!;
  assert.ok(brandybuck);
  assert.equal(s.deck.length, 7);
  assert.ok(s.discard.includes(P.raise));
  assert.ok(!s.hand.some((u) => u.id === raise.id));
  assert.equal(get(s, legolas.id)!.resources, 9);
  // At the end of the round it returns to its owner's hand.
  s.queue.push(fx("endRound"));
  flush(s);
  s = settle(s);
  assert.ok(!s.allies.some((u) => u.code === BRANDYBUCK));
  assert.ok(s.hand.some((u) => u.code === BRANDYBUCK));
  // Above your threat, the entire deck is searched.
  s = base(1, 1);
  hero(s, LEGOLAS, 2);
  hand(s, [P.raise]);
  s.deck = [GUARD, GUARD, GUARD, GUARD, GUARD, GUARD, TOOK];
  const troll = stage(s, TROLL);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: troll.id });
  s = until(s, P.raise);
  assert.match(s.choice!.options[0].label, /your entire deck/);
  s = use(s, P.raise, "play");
  for (
    let n = 0;
    n < 10 && !s.choice?.title.startsWith("Raise the Shire · Put");
    n++
  )
    s = choose(s, s.choice!.options[0].id);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["ally-6", "none"],
  );
  // Unplayable in an action window: it answers an engagement.
  s = base(1, 1);
  hero(s, LEGOLAS, 2);
  const [idle] = hand(s, [P.raise]);
  assert.match(canPlay(s, idle) ?? "", /in response to engaging an enemy/);
});
