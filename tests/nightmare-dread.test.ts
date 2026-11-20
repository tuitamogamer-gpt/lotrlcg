import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyAction } from "../src/game/engine";
import { card, encounterCards } from "../src/game/cards";
import {
  check,
  damage,
  discardAttachment,
  progressLocation,
  revealed,
} from "../src/game/board";
import { draw, fx, get, make, stats } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { addQuestProgress } from "../src/game/side-quests";
import { forOwner, playerOrder, seatView } from "../src/game/table";
import { mainQuestUnit } from "../src/game/quest-state";
import { DREAD as D } from "../src/game/dread-realm-support";
import { dreadReanimate } from "../src/game/dread-realm";
import {
  NIGHTMARE,
  NIGHTMARE_AA as N,
  nightmareCardOf,
  nightmareStatus,
} from "../src/game/nightmare";
import { validNightmareDread } from "../src/game/nightmare-dread";
import type { Effect, GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  nightmareForTwo,
  nightmareGame,
  opening,
  valid,
} from "./nightmare-fixtures";
import { base, choose, reload, second, settle } from "./dread-realm-fixtures";

const ID = "the-dread-realm";
const hooks = (s: GameState) => batch4Scenario(s);
/** A quiet Nightmare table (the scenario's own fixture) at stage 1. */
function board(players = 1) {
  const s = base(players);
  s.nightmareMode = true;
  s.nightmare = {};
  return s;
}
const queue = (s: GameState, ...effects: Effect[]) => {
  s.queue.unshift(...effects);
  return s;
};
/** Resolve the queue, answering each choice with `answer` (or the first option). */
function run(
  s: GameState,
  answer: (s: GameState) => string | undefined = () => undefined,
) {
  flush(s);
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 120, "decisions terminate");
    s = choose(reload(s), answer(s) ?? s.choice.options[0].id);
  }
  return s;
}
function staged(s: GameState, code: string) {
  const u = make(s, code);
  s.staging.push(u);
  return u;
}
function engaged(s: GameState, code: string, player = 0) {
  let u!: Unit;
  forOwner(s, player, () => {
    u = make(s, code);
    s.engaged.push(u);
  });
  return u;
}
/** A Reanimated Dead engaged with `player` (a facedown copy of `code`). */
function dead(s: GameState, player = 0, code = "01057") {
  let u!: Unit;
  forOwner(s, player, () => {
    u = dreadReanimate(s, make(s, code), player);
  });
  flush(s);
  return u;
}
const boss = (s: GameState) =>
  [...s.staging, ...s.engaged].find((u) => u.code === D.daechanar)!;
const options = (s: GameState) => s.choice?.options.map((o) => o.id) ?? [];
const tally = (list: string[]) =>
  list.reduce<Record<string, number>>(
    (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
    {},
  );
/** Old Forest Road: no shadow or 'when revealed' effect. */
const ROAD = "01099";
/** For Gondor! (Action: a leadership event with no target). */
const GONDOR = "01022";

test("Nightmare: The Dread Realm's setup card and Nightmare Deck carry their scans' texts and stats", () => {
  const c = card(N.dreadCard);
  assert.deepEqual(
    [c.name, c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    [
      "The Dread Realm",
      "nightmare",
      "nightmare",
      "The Dread Realm - Nightmare",
      true,
    ],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for The Dread Realm scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n3x Witch of Angmar\n2x A Fell Dread\n1x Unholy Crypt\n1x Sinister Dungeon\n2x Dead Lord\n3x Terror of the North\nThen, /,
    "paragraphs (the catalogue had one paragraph)",
  );
  assert.equal(c.back_text, "You are playing Nightmare mode.");
  const stat = (code: string) => {
    const x = card(code);
    return [x.type_code, x.engagement, x.threat, x.attack, x.defense, x.health];
  };
  assert.deepEqual(
    stat(N.guardian),
    ["enemy", 36, 4, 2, 4, 10],
    "10 hit points (the catalogue had 1)",
  );
  assert.deepEqual(stat(N.necromancer), ["enemy", 28, 2, undefined, 3, 3]);
  assert.equal(card(N.necromancer).printed_stats?.attack, "-");
  assert.match(
    card(N.necromancer).text!,
    /^Forced: When Necromancer of Carn Dûm would attack you, instead reanimate the top card of your deck and deal it each of the Necromancer of Carn Dûm's shadow cards\.$/,
    "accented (the catalogue had Carn Dum)",
  );
  assert.deepEqual(
    [N.sanctum, N.cursedHalls].map((code) => [
      card(code).threat,
      card(code).quest,
    ]),
    [
      [6, 4],
      [3, 5],
    ],
  );
  assert.equal(card(N.daechanarCurse).name, "Daechanar's Curse");
  for (const code of [N.powerBeyond, N.daechanarCurse, N.allIsLost])
    assert.equal(card(code).traits, "Sorcery.");
  assert.match(card(N.powerBeyond).text!, /^Surge\.\n/);
  assert.match(card(N.daechanarCurse).text!, /^Surge\.\n/);
  const gift = card(N.gift);
  assert.equal(gift.name, "The Witch-king's Gift");
  assert.deepEqual(
    [gift.type_code, gift.quest, gift.victory],
    ["encounter-side-quest", 8, undefined],
  );
  assert.equal(
    gift.text,
    "Time 5. Forced: When the last time counter is removed from this quest, reanimate each card in each player's discard pile. Then, remove The Witch-king's Gift from the game.\nWhen this quest is defeated, place it in the encounter discard pile.",
    "no flavour text (the catalogue kept it)",
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Dread Realm - Nightmare",
  );
  assert.equal(set.length, 9);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(
    art.filter((x) => set.some((y) => y.code === x.code)).length,
    10,
  );
});

test("Nightmare: The Dread Realm's Nightmare encounter deck matches its source recipe", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const recipe = recipes.find((r) => r.id === "N05.9")!;
  const pile = recipe.cards
    .filter((c) => c.section === "sharedEncounterDeck")
    .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.dreadCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [opening(nightmareGame(ID)), opening(nightmareForTwo(ID))]) {
    assert.equal(nightmareCardOf(s), N.dreadCard);
    // The setup reveals an encounter card for each player (and their surges).
    const inPlay = [
      ...s.encounterDeck,
      ...s.encounterDiscard,
      ...s.staging.map((u) => u.code),
      ...playerOrder(s).flatMap((p) =>
        seatView(s, p).engaged.map((u) => u.code),
      ),
      ...(s.questAttachments
        ? Object.values(s.questAttachments).flat()
        : []
      ).map((a) => a.code),
      ...playerOrder(s).flatMap((p) =>
        (seatView(s, p).threatAttachments ?? []).map((a) => a.code),
      ),
      ...(s.nightmare?.dreadCurses ?? []).map(() => N.daechanarCurse),
    ].filter((code) => code !== D.reanimated);
    assert.deepEqual(tally(inPlay), tally(pile));
    assert.match(nightmareStatus(s)[0], /^The Dread Realm · Nightmare mode: /);
    assert.ok(valid(s));
  }
});

test("Nightmare: Necromancer of Carn Dûm's attack is replaced: the top card of the deck is reanimated with its shadow cards, which attack in its place", () => {
  let s = board();
  const nec = engaged(s, N.necromancer);
  nec.shadows = [ROAD];
  s.deck = ["01057", "01057", "01057"];
  s.phase = "defense";
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: nec.id,
    defenderId: s.heroes[0].id,
  });
  s = settle(s);
  const rd = s.engaged.find((u) => u.code === D.reanimated)!;
  assert.ok(rd, "the top card is reanimated");
  assert.deepEqual(rd.shadows, [ROAD], "dealt the Necromancer's shadow card");
  assert.deepEqual(get(s, nec.id)!.shadows, []);
  assert.equal(get(s, nec.id)!.attacked, true);
  assert.equal(s.heroes[0].exhausted, false, "no defender was declared");
  assert.equal(s.deck.length, 2);
  assert.ok(
    s.log.some((l) => /Necromancer of Carn Dûm does not attack/.test(l.text)),
  );
  // The Reanimated Dead attacks this step, with that shadow card.
  assert.ok(!rd.attacked);
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: rd.id,
    defenderId: s.heroes[1].id,
  });
  s = settle(s);
  assert.ok(s.log.some((l) => /Shadow: Old Forest Road/.test(l.text)));
  assert.equal(s.heroes[1].damage, 1, "2 [attack] against 1 [defense]");
  assert.equal(s.phase, "attack", "every enemy has attacked");
  // An empty deck: nothing is reanimated and nothing attacks.
  s = board();
  const lone = engaged(s, N.necromancer);
  s.deck = [];
  s.phase = "defense";
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: lone.id,
    defenderId: null,
  });
  s = settle(s);
  assert.ok(!s.engaged.some((u) => u.code === D.reanimated));
  assert.ok(s.log.some((l) => /deck is empty/.test(l.text)));
  assert.equal(s.phase, "attack");
  assert.equal(
    s.heroes.reduce((n, h) => n + h.damage, 0),
    0,
    "it never attacks",
  );
});

test("Nightmare: Silent Guardian reanimates the first event card its engaged player plays each round instead of discarding it", () => {
  let s = board();
  engaged(s, N.guardian);
  for (const h of s.heroes) h.resources = 6;
  const first = make(s, GONDOR),
    next = make(s, GONDOR);
  s.hand.push(first, next);
  s = applyAction(reload(s), { type: "PLAY", id: first.id });
  s = settle(s);
  const rd = s.engaged.find((u) => u.code === D.reanimated)!;
  assert.ok(rd, "the event is reanimated");
  assert.equal(rd.facedownCard, GONDOR);
  assert.equal(rd.id, first.id, "the same physical card");
  assert.ok(!s.discard.includes(GONDOR));
  // The second event this round is discarded.
  s = applyAction(reload(s), { type: "PLAY", id: next.id });
  s = settle(s);
  assert.equal(s.discard.filter((c) => c === GONDOR).length, 1);
  assert.equal(s.engaged.filter((u) => u.code === D.reanimated).length, 1);
  // Next round, the first event again.
  s.round++;
  const third = make(s, GONDOR);
  s.hand.push(third);
  s = applyAction(reload(s), { type: "PLAY", id: third.id });
  s = settle(s);
  assert.equal(s.engaged.filter((u) => u.code === D.reanimated).length, 2);
  assert.ok(valid(s));
  // Not engaged with it (in the staging area): discarded.
  s = board();
  staged(s, N.guardian);
  for (const h of s.heroes) h.resources = 6;
  const free = make(s, GONDOR);
  s.hand.push(free);
  s = applyAction(reload(s), { type: "PLAY", id: free.id });
  s = settle(s);
  assert.ok(s.discard.includes(GONDOR));
  assert.ok(!s.engaged.some((u) => u.code === D.reanimated));
});

test("Nightmare: Daechanar's Curse surges onto the first player's deck, reanimates the next draw from it, and is a Sorcery card in play for Daechanar", () => {
  let s = second(board(2));
  s.encounterDeck = [ROAD, ROAD, ROAD];
  const attack = stats(s, boss(s)).attack;
  revealed(s, N.daechanarCurse);
  s = run(s);
  assert.deepEqual(
    s.nightmare!.dreadCurses?.map((c) => c.player),
    [0],
    "the first player's deck",
  );
  assert.equal(s.staging.filter((u) => u.code === ROAD).length, 1, "surge");
  assert.match(
    nightmareStatus(s)[0],
    /Daechanar's Curse is attached to the top of .+'s deck/,
  );
  assert.equal(stats(s, boss(s)).attack, attack + 1, "a Sorcery card in play");
  assert.ok(valid(s));
  // Another player's draw is not from that deck.
  forOwner(s, 1, () => {
    const hand = s.hand.length;
    draw(s, 1);
    assert.equal(s.hand.length, hand + 1);
  });
  // The first player's next draw (2 cards) is reanimated instead.
  const hand = s.hand.length,
    deck = s.deck.length;
  draw(s, 2);
  flush(s);
  assert.equal(s.hand.length, hand);
  assert.equal(s.deck.length, deck - 2);
  assert.equal(s.engaged.filter((u) => u.code === D.reanimated).length, 2);
  assert.equal(s.nightmare!.dreadCurses, undefined);
  assert.ok(s.encounterDiscard.includes(N.daechanarCurse));
  // Then draws normally.
  draw(s, 1);
  assert.equal(s.hand.length, hand + 1);
  // Daechanar removes it from the game when he is damaged.
  s = second(board());
  s.nightmare!.dreadCurses = [{ id: "a-curse", player: 0 }];
  const daechanar = boss(s);
  damage(s, daechanar.id, 3);
  flush(s);
  assert.ok(options(s).includes("a-curse"));
  s = choose(reload(s), "a-curse");
  s = settle(s);
  assert.equal(s.nightmare!.dreadCurses, undefined);
  assert.ok(s.removedEncounter!.includes(N.daechanarCurse));
  assert.equal(get(s, daechanar.id)!.damage, 0);
});

test("Nightmare: All is Lost on the first player's threat dial raises it for each attack against a Reanimated Dead; its shadow makes a Reanimated Dead attack again", () => {
  let s = board();
  revealed(s, N.allIsLost);
  s = run(s);
  assert.deepEqual(
    s.threatAttachments?.map((a) => a.code),
    [N.allIsLost],
  );
  assert.ok(valid(s));
  const rd = dead(s);
  const other = engaged(s, D.dwimmerlaik);
  s.phase = "attack";
  const threat = s.threat;
  s = applyAction(reload(s), {
    type: "ATTACK",
    enemyId: other.id,
    attackerIds: [s.heroes[0].id],
  });
  s = settle(s);
  assert.equal(s.threat, threat, "not a Reanimated Dead");
  s = applyAction(reload(s), {
    type: "ATTACK",
    enemyId: rd.id,
    attackerIds: [s.heroes[1].id],
  });
  s = settle(s);
  assert.equal(s.threat, threat + 1);
  // Its shadow.
  s = board();
  const foe = dead(s);
  s.combat = {
    enemyId: foe.id,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
    attackPlayer: 0,
  };
  assert.equal(hooks(s).shadow!(s, N.allIsLost), true);
  assert.equal(s.combat.nmAttackAgain, 1);
  assert.deepEqual(
    hooks(s).attackFinished!(s, s.combat).map((e) => [e.kind, e.target]),
    [["immediateAttack", foe.id]],
  );
  s = board();
  const plain = engaged(s, D.dwimmerlaik);
  s.combat = {
    enemyId: plain.id,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
    attackPlayer: 0,
  };
  hooks(s).shadow!(s, N.allIsLost);
  assert.equal(s.combat.nmAttackAgain, undefined);
});

test("Nightmare: Power Beyond Death surges onto the main quest (Daechanar +2 [defense]), travels to stage 2, and its shadow attaches it after a destroyed character", () => {
  let s = board();
  s.encounterDeck = [ROAD, ROAD, ROAD];
  revealed(s, N.powerBeyond);
  s = run(s);
  const quest = mainQuestUnit(s)!;
  assert.deepEqual(
    quest.attachments.map((a) => a.code),
    [N.powerBeyond],
  );
  assert.equal(s.staging.filter((u) => u.code === ROAD).length, 1, "surge");
  // Stage 1's Sorcery attachments transfer to stage 2.
  s.progress = 18;
  check(s);
  s = run(s);
  assert.equal(s.stage, 2);
  const daechanar = boss(s);
  assert.deepEqual(
    mainQuestUnit(s)!.attachments.map((a) => a.code),
    [N.powerBeyond],
  );
  const printed = card(D.daechanar);
  assert.equal(stats(s, daechanar).defense, (printed.defense ?? 0) + 2);
  assert.equal(stats(s, daechanar).attack, (printed.attack ?? 0) + 1);
  // Its shadow: a destroyed character attaches it to the main quest.
  s = second(board());
  const foe = engaged(s, D.dwimmerlaik);
  foe.shadows = [N.powerBeyond];
  s.combat = {
    enemyId: foe.id,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
    attackPlayer: 0,
  };
  hooks(s).shadow!(s, N.powerBeyond);
  assert.deepEqual(hooks(s).attackFinished!(s, s.combat), [], "no kill");
  s.combat.nmDestroyed = true;
  queue(s, ...hooks(s).attackFinished!(s, s.combat));
  s.combat = null;
  s = run(s);
  assert.deepEqual(get(s, foe.id)!.shadows, []);
  assert.deepEqual(
    mainQuestUnit(s)!.attachments.map((a) => a.code),
    [N.powerBeyond],
  );
});

test("Nightmare: Cursed Halls makes Sorcery attachments immune to player card effects while staged; its shadow counts the defending player's Reanimated Dead until the end of the phase", () => {
  let s = board();
  const host = dead(s);
  host.attachments.push({ id: "a-poss", code: D.possession, exhausted: false });
  staged(s, N.cursedHalls);
  // A player card effect (Miner of the Iron Hills') cannot discard it.
  s.playerAbilitySources = [{ source: s.heroes[0].id, code: "01061" }];
  discardAttachment(s, host, host.attachments[0]);
  assert.equal(host.attachments.length, 1);
  assert.ok(
    s.log.some((l) => /Cursed Halls: Possession is immune/.test(l.text)),
  );
  // An encounter card effect can.
  delete s.playerAbilitySources;
  discardAttachment(s, host, host.attachments[0], false, true);
  flush(s);
  assert.equal(get(s, host.id)?.attachments.length ?? 0, 0);
  // Not staged: no immunity.
  s = board();
  const other = dead(s);
  other.attachments.push({ id: "a-p2", code: D.possession, exhausted: false });
  s.playerAbilitySources = [{ source: s.heroes[0].id, code: "01061" }];
  assert.equal(
    hooks(s).attachmentImmune!(s, other, other.attachments[0], "01061"),
    false,
  );
  // Its shadow: +1 [attack] and +1 [defense] for each Reanimated Dead
  // engaged with the defending player, counted as it changes.
  s = board();
  const attacker = engaged(s, D.dwimmerlaik);
  dead(s);
  s.phase = "defense";
  s.combat = {
    enemyId: attacker.id,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
    attackPlayer: 0,
  };
  const before = stats(s, attacker);
  hooks(s).shadow!(s, N.cursedHalls);
  assert.equal(stats(s, attacker).attack, before.attack + 1);
  dead(s);
  assert.equal(stats(s, attacker).attack, before.attack + 2);
  assert.equal(stats(s, attacker).defense, before.defense + 2);
  s.phase = "attack";
  assert.equal(
    stats(s, attacker).defense,
    before.defense + 2,
    "the combat phase goes on",
  );
  s.phase = "refresh";
  assert.equal(stats(s, attacker).attack, before.attack, "the phase ended");
});

test("Nightmare: Inner Sanctum takes no progress in the staging area; its travel cost discards 3 encounter cards and resolves each Sorcery card's 'when revealed' effect", () => {
  let s = board();
  const sanctum = staged(s, N.sanctum);
  progressLocation(s, sanctum, 2);
  assert.equal(sanctum.progress, 0);
  s.encounterDeck = [N.powerBeyond, ROAD, D.curse, ROAD];
  s.phase = "travel";
  s = applyAction(reload(s), { type: "TRAVEL", id: sanctum.id });
  flush(s);
  // Two Sorcery cards: the first player orders them.
  assert.equal(options(s).length, 2);
  s = settle(s);
  assert.equal(s.activeLocation?.id, sanctum.id);
  assert.deepEqual(s.encounterDeck, [ROAD]);
  assert.deepEqual(s.encounterDiscard, [ROAD], "the attached Sorceries left");
  assert.deepEqual(
    mainQuestUnit(s)!
      .attachments.map((a) => a.code)
      .sort(),
    [N.powerBeyond, D.curse].sort(),
  );
  // As the active location, it takes progress.
  progressLocation(s, get(s, sanctum.id)!, 2);
  assert.equal(get(s, sanctum.id)!.progress, 2);
});

test("Nightmare: The Witch-king's Gift counts down 5 time counters, then reanimates each card in each player's discard pile and leaves the game; defeated, it goes to the encounter discard pile", () => {
  let s = board(2);
  revealed(s, N.gift);
  s = run(s);
  const gift = s.staging.find((u) => u.code === N.gift)!;
  assert.equal(gift.timeCounters, 5);
  forOwner(s, 0, () => {
    s.discard = ["01057", "01020"];
  });
  forOwner(s, 1, () => {
    s.discard = ["01057"];
  });
  for (let round = 0; round < 5; round++) {
    queue(s, ...hooks(s).refreshEndForced!(s));
    s = run(s);
  }
  assert.ok(!s.staging.some((u) => u.code === N.gift));
  assert.ok(s.removedEncounter!.includes(N.gift));
  assert.deepEqual(
    playerOrder(s).map((p) => [
      seatView(s, p).discard.length,
      seatView(s, p).engaged.filter((u) => u.code === D.reanimated).length,
    ]),
    [
      [0, 2],
      [0, 1],
    ],
  );
  assert.ok(valid(s));
  // Defeated: the encounter discard pile, not the victory display.
  s = board();
  revealed(s, N.gift);
  s = run(s);
  const quest = s.staging.find((u) => u.code === N.gift)!;
  addQuestProgress(s, quest, 8);
  flush(s);
  assert.ok(!s.staging.some((u) => u.code === N.gift));
  assert.ok(s.encounterDiscard.includes(N.gift));
  assert.ok(!(s.victoryCards ?? []).includes(N.gift));
});

test("Nightmare: Sinister Dungeon's shadow resolves a discarded Nightmare Sorcery card's 'when revealed' effect", () => {
  let s = board();
  s.encounterDiscard = [N.allIsLost];
  queue(s, fx("dreadDiscardSorcery", { code: N.allIsLost, player: 0 }));
  s = run(s);
  assert.deepEqual(s.encounterDiscard, []);
  assert.deepEqual(
    s.threatAttachments?.map((a) => a.code),
    [N.allIsLost],
  );
});

test("Nightmare: The Dread Realm's Nightmare state survives saves and malformed state is rejected", () => {
  const s = board(2);
  s.nightmare = {
    dreadCurses: [{ id: "a1", player: 1 }],
    dreadEventRounds: { 0: 1 },
    dreadGuardianEvents: [{ id: "c9", round: 1 }],
    dreadHalls: [{ enemy: "e1", player: 0, round: 1, phase: "combat" }],
  };
  assert.ok(validNightmareDread(s));
  assert.ok(valid(s));
  const bad = (patch: object) => {
    const x = reload(s);
    Object.assign(x.nightmare!, patch);
    return validNightmareDread(x);
  };
  assert.equal(bad({ dreadCurses: [{ id: "a1", player: 2 }] }), false);
  assert.equal(
    bad({
      dreadCurses: [
        { id: "a1", player: 0 },
        { id: "a1", player: 1 },
      ],
    }),
    false,
  );
  assert.equal(bad({ dreadEventRounds: { 5: 1 } }), false);
  assert.equal(bad({ dreadGuardianEvents: [{ id: 3, round: 1 }] }), false);
  assert.equal(
    bad({ dreadHalls: [{ enemy: "e1", player: 0, round: -1, phase: "x" }] }),
    false,
  );
  // Outside Nightmare mode.
  const plain = reload(s);
  plain.nightmareMode = false;
  assert.equal(validNightmareDread(plain), false);
  // All is Lost on a threat dial only in this Nightmare mode.
  const dial = board();
  dial.threatAttachments = [
    { id: "x1", code: N.allIsLost, exhausted: false },
    { id: "x2", code: N.allIsLost, exhausted: false },
  ];
  assert.ok(valid(dial));
  dial.nightmareMode = false;
  dial.nightmare = undefined;
  assert.equal(valid(dial), false);
});

test("Nightmare: The Dread Realm Nightmare games keep valid saves to their end", () => {
  for (const seed of [1, 2, 3])
    for (const s of [nightmareGame(ID, seed), nightmareForTwo(ID, seed)]) {
      const end = autoplay(s, 2500);
      assert.ok(valid(end), `seed ${seed}`);
    }
});
