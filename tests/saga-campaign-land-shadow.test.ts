import test from "node:test";
import assert from "node:assert/strict";
import { card, SCRIPTED, STARTERS } from "../src/game/cards";
import { DECK_CARDS } from "../src/game/decks";
import { discardAttachment, win } from "../src/game/board";
import { flush } from "../src/game/effects";
import { draw, fx, make } from "../src/game/core";
import {
  applyAction,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { continueCampaign } from "../src/game/campaign";
import { automatedScenarioId } from "../src/game/support";
import { ringBearer } from "../src/game/lotr-saga";
import {
  applySagaResolution,
  blackGateNote,
  HD_RTI_BURDENS,
  SAGA,
  SAGA_CAMPAIGN_ORDER,
  sagaCampaignDeckSetup,
  sagaResolutionQuestions,
} from "../src/game/saga-campaign";
import { forOwner, seatView } from "../src/game/table";
import type { CampaignState, GameState } from "../src/game/types";

const d = STARTERS[0];
/** Heroes without an Aragorn: The Land of Shadow forbids the title. */
const HEROES = ["01005", "01006", d.heroes[2]];
/** Goblin Sniper, a plain enemy. */
const GOBLIN = "01083";
const reload = (s: GameState) => restoreSave(JSON.parse(JSON.stringify(s)))!;
const choose = (s: GameState, id: string) =>
  applyAction(reload(s), { type: "CHOOSE", id });
const valid = (s: GameState) => validateSave(JSON.parse(JSON.stringify(s)));
function calm(s: GameState) {
  Object.assign(s, { phase: "planning", choice: null, queue: [] });
  return s;
}
function settle(s: GameState) {
  for (let i = 0; i < 12 && s.choice; i++)
    s = choose(s, s.choice.options[0].id);
  return s;
}
function finish(s: GameState, answers: Record<string, string> = {}) {
  calm(s);
  win(s);
  return s.campaign!.resolution ? applySagaResolution(s, answers) : s;
}
/** The Uruk-hai's resolution answered without a reward. */
const URUK = {
  reward: "skill",
  "skill:0": "none",
  hope: "none",
  hopeDrop: "none",
};
/**
 * A campaign that has won The Road to Isengard through every chapter, with
 * Poisoned Counsels, Saruman's Voice and the Palantír of Orthanc earned.
 */
function afterIsengard(seed = 21) {
  let s = createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "a-shadow-of-the-past",
    playMode: "campaign",
  });
  s = finish(s, { burden: SAGA.delay, boon: SAGA.underhill });
  s = finish(continueCampaign(s, d.heroes, d.id, true, seed + 1), {
    "boon:0": "none",
  });
  s = finish(continueCampaign(s, d.heroes, d.id, true, seed + 2));
  s = finish(settle(continueCampaign(s, d.heroes, d.id, true, seed + 3)));
  s = finish(settle(continueCampaign(s, d.heroes, d.id, true, seed + 4)), {
    treachery: SAGA.pursued,
    objective: SAGA.wound,
  });
  s = finish(settle(continueCampaign(s, d.heroes, d.id, true, seed + 5)), {
    burden: SAGA.night,
    "captive:0": d.heroes[2],
  });
  s = finish(settle(continueCampaign(s, d.heroes, d.id, true, seed + 6)), URUK);
  const h = calm(settle(continueCampaign(s, d.heroes, d.id, true, seed + 7)));
  h.deck.push(SAGA.counsels);
  s = finish(h);
  const r = calm(settle(continueCampaign(s, d.heroes, d.id, true, seed + 8)));
  r.hand = r.hand.slice(0, 3);
  while (r.hand.length < 3) r.hand.push(make(r, Object.keys(d.cards)[0]));
  return finish(r);
}
/** A Campaign Log that has won every chapter before `next`. */
function logAt(
  next: (typeof SAGA_CAMPAIGN_ORDER)[number],
  extra: Partial<CampaignState> = {},
  heroes = HEROES,
): CampaignState {
  const done = SAGA_CAMPAIGN_ORDER.slice(0, SAGA_CAMPAIGN_ORDER.indexOf(next));
  return {
    kind: "saga",
    heroes: [...heroes],
    fallen: [],
    threatPenalty: 0,
    boons: [],
    burdens: [],
    permanent: {},
    prisoner: null,
    completed: done.map((scenarioId) => ({ scenarioId, score: 0, rounds: 1 })),
    mendorSaved: false,
    resolution: null,
    ...extra,
  };
}
/** Two players, each with their own deck, at a Land of Shadow chapter. */
function hotSeat(
  next: (typeof SAGA_CAMPAIGN_ORDER)[number],
  extra: Partial<CampaignState> = {},
) {
  const seats = [
    { heroes: ["01005", "01006"], deckId: STARTERS[1].id },
    { heroes: ["01007", "01008"], deckId: STARTERS[2].id },
  ];
  return createGame(31, STARTERS[1].cards, seats[0].heroes, seats[0].deckId, {
    scenarioId: next,
    playMode: "campaign",
    seats,
    campaign: logAt(next, { seatHeroes: [2, 2], ...extra }, [
      ...seats[0].heroes,
      ...seats[1].heroes,
    ]),
  });
}

test("The Land of Shadow campaign cards, Brace of Coneys, The Searching Eye and A Heavy Burden are registered with the scans' corrections, and its three chapters are supported", () => {
  // The Passage of the Marshes' scan adds the free hero change the catalog
  // leaves out; Shelob's Lair's scan shows Helm's Deep's icon, not "RD".
  assert.match(
    card(SAGA.marshesCard).text!,
    /Each player may change hero cards without incurring the \+1 threat penalty\. Each player shuffles 1 copy of The Searching Eye into his deck\./,
  );
  for (const code of [SAGA.marshesCard, SAGA.crossroadsCard, SAGA.shelobCard])
    assert.match(
      card(code).text!,
      /from the encounter deck and each player's deck: \(Helm's Deep, The Road to Isengard\)$/,
    );
  assert.match(
    card(SAGA.marshesCard).back_text!,
    /either take a permanent \+2 starting threat penalty, or earn 1 copy of The Searching Eye/,
  );
  assert.match(
    card(SAGA.crossroadsCard).back_text!,
    /Record the name and quantity of each enemy underneath The Black Gate in the notes section of the campaign log\./,
  );
  assert.match(
    card(SAGA.shelobCard).text!,
    /Attach A Heavy Burden to the Ring-bearer\./,
  );
  // The scans: Brace of Coneys is a Gift with Victory 2; A Heavy Burden is
  // Permanent.
  assert.equal(card(SAGA.coneys).traits, "Gift.");
  assert.equal(card(SAGA.coneys).victory, 2);
  assert.match(
    card(SAGA.heavy).text!,
    /^Permanent\.\nSetup: Attach to the Ring-bearer\./,
  );
  assert.match(
    card(SAGA.searchingEye).text!,
    /^The Searching Eye functions like a player card\./,
  );
  // Scripted for campaign mode, never part of a player deck.
  for (const code of [SAGA.coneys, SAGA.searchingEye, SAGA.heavy]) {
    assert.ok(SCRIPTED.has(code), code);
    assert.ok(!DECK_CARDS.some((c) => c.code === code), code);
  }
  assert.deepEqual(
    [
      "The Passage of the Marshes",
      "Journey to the Cross-roads",
      "Shelob's Lair",
      "The Tower of Cirith Ungol",
    ].map((name) => automatedScenarioId({ name, mode: "campaign" })),
    [
      "the-passage-of-the-marshes",
      "journey-to-the-cross-roads",
      "shelobs-lair",
      null,
    ],
  );
});

test("The Passage of the Marshes: free hero changes without an Aragorn, the burdens of Helm's Deep and The Road to Isengard stay out, and each player's Searching Eye is shuffled in after the starting hand, out of a mulligan's reach", () => {
  const s = afterIsengard();
  for (const code of HD_RTI_BURDENS)
    assert.ok(s.campaign!.burdens.includes(code));
  assert.throws(
    () => continueCampaign(s, d.heroes, d.id, true, 80),
    /No card titled Aragorn/,
  );
  const m = continueCampaign(s, HEROES, d.id, true, 81);
  assert.equal(m.scenarioId, "the-passage-of-the-marshes");
  assert.equal(m.campaign!.threatPenalty, 0, "two changes, both free");
  assert.ok(!m.encounterDeck.includes(SAGA.voice));
  assert.ok(!m.deck.includes(SAGA.counsels));
  // Frodo's burdens are back: Gandalf's Delay and Grievous Wound wait in the
  // staging area, Pursued by the Enemy and Followed by Night in the deck.
  assert.ok(m.staging.some((u) => u.code === SAGA.delay));
  assert.ok(m.staging.some((u) => u.code === SAGA.wound));
  assert.ok(m.encounterDeck.includes(SAGA.pursued));
  assert.ok(m.encounterDeck.includes(SAGA.night));
  assert.equal(m.hand.length, 5, "Gandalf's Delay");
  assert.equal(m.deck.filter((c) => c === SAGA.searchingEye).length, 1);
  assert.ok(!m.hand.some((u) => u.code === SAGA.searchingEye));
  assert.deepEqual(m.sagaCards!.lateDeck, [[SAGA.searchingEye]]);
  assert.ok(valid(m));
  // The mulligan's new hand cannot draw it (after the earned Gift's Setup).
  const top = settle(reload(m));
  assert.equal(top.phase, "setup");
  top.deck.splice(top.deck.indexOf(SAGA.searchingEye), 1);
  top.deck.unshift(SAGA.searchingEye);
  const mulled = applyAction(top, { type: "MULLIGAN" });
  assert.equal(mulled.hand.length, 5);
  assert.ok(!mulled.hand.some((u) => u.code === SAGA.searchingEye));
  assert.equal(mulled.deck.filter((c) => c === SAGA.searchingEye).length, 1);
  // No card titled Aragorn can be used: not even in a deck.
  const deck = calm(structuredClone(m));
  deck.deck.push("01001");
  sagaCampaignDeckSetup(deck);
  assert.ok(!deck.deck.includes("01001"));
  assert.throws(
    () =>
      createGame(5, d.cards, d.heroes, d.id, {
        scenarioId: "the-passage-of-the-marshes",
        playMode: "campaign",
        campaign: logAt("the-passage-of-the-marshes", {}, d.heroes),
      }),
    /No card titled Aragorn/,
  );
});

test("The Searching Eye: after it is drawn its player exhausts each hero they control or reveals the top encounter card (only an option that can be performed in full), then it is discarded; the resolution records a +2 penalty or an earned copy", () => {
  let m = settle(
    createGame(5, d.cards, HEROES, d.id, {
      scenarioId: "the-passage-of-the-marshes",
      playMode: "campaign",
      campaign: logAt("the-passage-of-the-marshes"),
    }),
  );
  calm(m);
  m.deck.splice(m.deck.indexOf(SAGA.searchingEye), 1);
  m.deck.unshift(SAGA.searchingEye);
  draw(m, 1);
  flush(m);
  assert.match(m.choice!.title, /^The Searching Eye/);
  assert.deepEqual(
    m.choice!.options.map((o) => o.id),
    ["exhaust", "reveal"],
  );
  const exhausted = choose(m, "exhaust");
  assert.ok(
    exhausted.heroes.every((h) => h.exhausted),
    "Frodo too",
  );
  assert.ok(exhausted.discard.includes(SAGA.searchingEye));
  assert.ok(!exhausted.hand.some((u) => u.code === SAGA.searchingEye));
  // An exhausted hero: exhausting each hero cannot be performed in full.
  const tired = reload(m);
  Object.assign(tired, { choice: null, queue: [] });
  tired.heroes[0].exhausted = true;
  const eye = tired.hand.find((u) => u.code === SAGA.searchingEye)!;
  tired.encounterDeck.unshift(GOBLIN);
  tired.queue.push(fx("sagaSearchingEye", { target: eye.id, player: 0 }));
  flush(tired);
  assert.deepEqual(
    tired.choice!.options.map((o) => o.id),
    ["reveal"],
  );
  m = choose(tired, "reveal");
  assert.ok(m.staging.some((u) => u.code === GOBLIN));
  assert.ok(m.discard.includes(SAGA.searchingEye));
  // The resolution: a permanent +2 starting threat penalty, or a copy.
  const penalty = finish(reload(m), { "eye:0": "penalty" });
  assert.deepEqual(penalty.campaign!.playerPenalty, [2]);
  assert.ok(!penalty.campaign!.burdens.includes(SAGA.searchingEye));
  assert.ok(valid(penalty));
  const next = continueCampaign(penalty, HEROES, d.id, true, 82);
  assert.equal(next.scenarioId, "journey-to-the-cross-roads");
  const fresh = createGame(82, d.cards, HEROES, d.id, {
    scenarioId: "journey-to-the-cross-roads",
    playMode: "campaign",
    campaign: logAt("journey-to-the-cross-roads"),
  });
  assert.equal(next.threat, fresh.threat + 2);
  const earned = calm(reload(m));
  win(earned);
  assert.deepEqual(
    sagaResolutionQuestions(earned).map((q) => q.options.map((o) => o.id)),
    [["penalty", "eye"]],
  );
  const eyeLog = applySagaResolution(earned, { "eye:0": "eye" });
  assert.ok(eyeLog.campaign!.burdens.includes(SAGA.searchingEye));
  assert.deepEqual(eyeLog.campaign!.deckBurdens, { [SAGA.searchingEye]: [0] });
  assert.equal(eyeLog.campaign!.playerPenalty, undefined);
  const later = continueCampaign(eyeLog, HEROES, d.id, true, 83);
  assert.equal(later.deck.filter((c) => c === SAGA.searchingEye).length, 1);
  assert.ok(!later.hand.some((u) => u.code === SAGA.searchingEye));
  assert.equal(later.threat, fresh.threat);
});

test("Journey to the Cross-roads: each player chooses resources or Brace of Coneys; Brace of Coneys is a Planning Action for the Ring-bearer's controller that goes to the victory display with 2 of its 4 effects; the resolution earns each shuffled copy and notes the enemies under The Black Gate", () => {
  let j = createGame(90, d.cards, HEROES, d.id, {
    scenarioId: "journey-to-the-cross-roads",
    playMode: "campaign",
    campaign: logAt("journey-to-the-cross-roads"),
  });
  for (
    let i = 0;
    i < 8 && j.choice && !/^Journey to the Cross-roads/.test(j.choice.title);
    i++
  )
    j = choose(j, j.choice.options[0].id);
  assert.deepEqual(
    j.choice!.options.map((o) => o.id),
    ["resources", "coneys"],
  );
  const rich = choose(j, "resources");
  assert.ok(
    rich.heroes.every((h, i) => h.resources === j.heroes[i].resources + 1),
  );
  assert.equal(rich.sagaCards?.coneys, undefined);
  j = choose(j, "coneys");
  assert.deepEqual(j.sagaCards!.coneys, [0]);
  assert.equal(j.deck.filter((c) => c === SAGA.coneys).length, 1);
  assert.deepEqual(j.sagaCards!.lateDeck, [[SAGA.coneys]]);
  j = settle(j);
  assert.ok(valid(j));
  // Brace of Coneys from hand: a Planning Action, only with the Ring-bearer.
  calm(j);
  j.deck.splice(j.deck.indexOf(SAGA.coneys), 1);
  const coneys = make(j, SAGA.coneys);
  coneys.owner = 0;
  j.hand.push(coneys);
  const frodo = ringBearer(j)!;
  frodo.damage = 1;
  const threat = j.threat;
  const hand = j.hand.length;
  const quest = reload(j);
  quest.phase = "quest";
  assert.throws(
    () => applyAction(quest, { type: "PLAY", id: coneys.id, payment: {} }),
    /Planning Action/,
  );
  let p = applyAction(reload(j), { type: "PLAY", id: coneys.id, payment: {} });
  for (
    let i = 0;
    i < 4 && p.choice && !/^Brace of Coneys/.test(p.choice.title);
    i++
  )
    p = choose(p, p.choice.options[0].id);
  assert.match(p.choice!.title, /Choose an effect \(1 of 2\)/);
  assert.deepEqual(
    p.choice!.options.map((o) => o.id),
    ["heal", "resources", "draw", "threat"],
  );
  p = choose(p, "heal");
  assert.match(p.choice!.title, /Heal up to 2 damage/);
  p = choose(p, frodo.id);
  assert.match(p.choice!.title, /Choose an effect \(2 of 2\)/);
  assert.deepEqual(
    p.choice!.options.map((o) => o.id),
    ["resources", "draw", "threat"],
  );
  p = choose(p, "threat");
  p = settle(p);
  assert.equal(ringBearer(p)!.damage, 0);
  assert.equal(p.threat, threat - 2);
  assert.equal(p.hand.length, hand - 1);
  assert.ok(p.victoryCards!.includes(SAGA.coneys));
  assert.ok(!p.discard.includes(SAGA.coneys));
  // Without the Ring-bearer, Brace of Coneys cannot be played.
  const lost = reload(j);
  for (const h of lost.heroes) h.attachments = [];
  assert.throws(
    () => applyAction(lost, { type: "PLAY", id: coneys.id, payment: {} }),
    /control the Ring-bearer/,
  );
  // The resolution: each shuffled copy is earned; the Black Gate is noted.
  const done = calm(reload(j));
  done.crossRoads!.underBlackGate = [];
  const harad = Object.values(
    done.encounterDeck.reduce<Record<string, string>>((m, code) => {
      if (card(code).type_code === "enemy") m[card(code).name] = code;
      return m;
    }, {}),
  ).slice(0, 2);
  done.crossRoads!.underBlackGate.push(harad[0], harad[0], harad[1]);
  win(done);
  assert.equal(done.campaign!.resolution, null);
  assert.ok(done.campaign!.boons.includes(SAGA.coneys));
  assert.deepEqual(done.campaign!.boonCopies, { [SAGA.coneys]: [0] });
  assert.deepEqual(done.campaign!.blackGateEnemies, [
    harad[0],
    harad[0],
    harad[1],
  ]);
  assert.equal(
    blackGateNote(done.campaign!.blackGateEnemies),
    `${card(harad[0]).name} ×2, ${card(harad[1]).name}`,
  );
  assert.ok(valid(done));
  const bad = structuredClone(done);
  bad.campaign!.blackGateEnemies = [SAGA.heavy];
  assert.ok(!valid(bad), "only enemies are noted");
  const many = structuredClone(done);
  many.campaign!.boonCopies = { [SAGA.palantir]: [0] };
  assert.ok(!valid(many), "only Brace of Coneys is earned copy by copy");
});

test("Shelob's Lair: A Heavy Burden is attached to the Ring-bearer, each earned Brace of Coneys joins its deck before the starting hand, the Forced effect raises threat or exhausts the Ring-bearer at the end of the planning phase, and the resolution earns the burden", () => {
  const log = logAt("shelobs-lair", {
    boons: [SAGA.coneys],
    boonCopies: { [SAGA.coneys]: [0] },
    blackGateEnemies: [],
  });
  let sl = createGame(95, d.cards, HEROES, d.id, {
    scenarioId: "shelobs-lair",
    playMode: "campaign",
    campaign: log,
  });
  const frodo = ringBearer(sl)!;
  assert.ok(frodo.attachments.some((a) => a.code === SAGA.heavy));
  assert.equal(
    sl.deck.filter((c) => c === SAGA.coneys).length +
      sl.hand.filter((u) => u.code === SAGA.coneys).length,
    1,
  );
  assert.equal(
    sl.sagaCards?.lateDeck,
    undefined,
    "a deck boon, not a late card",
  );
  sl = settle(sl);
  assert.ok(valid(sl));
  // Permanent: a card effect cannot discard it.
  const kept = calm(reload(sl));
  const bearer = ringBearer(kept)!;
  discardAttachment(
    kept,
    bearer,
    bearer.attachments.find((a) => a.code === SAGA.heavy)!,
  );
  assert.ok(ringBearer(kept)!.attachments.some((a) => a.code === SAGA.heavy));
  // The end of the planning phase.
  const end = calm(reload(sl));
  ringBearer(end)!.exhausted = false;
  end.queue.push(fx("phaseEnd"));
  flush(end);
  for (
    let i = 0;
    i < 6 && end.choice && !/^A Heavy Burden/.test(end.choice.title);
    i++
  )
    Object.assign(end, choose(end, end.choice.options[0].id));
  assert.match(end.choice!.title, /^A Heavy Burden/);
  assert.deepEqual(
    end.choice!.options.map((o) => o.id),
    ["threat", "exhaust"],
  );
  const raised = choose(end, "threat");
  assert.equal(raised.threat, end.threat + 1);
  const weary = choose(end, "exhaust");
  assert.ok(ringBearer(weary)!.exhausted);
  assert.equal(weary.threat, end.threat);
  // An exhausted Ring-bearer leaves only the threat.
  const tired = calm(reload(sl));
  ringBearer(tired)!.exhausted = true;
  const before = tired.threat;
  tired.queue.push(fx("sagaHeavyBurden", { player: 0 }));
  flush(tired);
  assert.equal(tired.threat, before + 1);
  // The resolution.
  const done = finish(reload(sl));
  assert.ok(done.campaign!.burdens.includes(SAGA.heavy));
  assert.ok(valid(done));
  // The Flame of the West follows: A Heavy Burden stays out of its chapters.
  const next = continueCampaign(done, HEROES, d.id, true, 96);
  assert.equal(next.scenarioId, "the-passing-of-the-grey-company");
  assert.ok(
    !next.heroes.some((h) => h.attachments.some((a) => a.code === SAGA.heavy)),
  );
});

test("The Land of Shadow in hot-seat: each player's own penalty, Searching Eye and Brace of Coneys; the interlude assigns each earned copy to a deck", () => {
  let m = hotSeat("the-passage-of-the-marshes");
  for (const seat of [0, 1])
    assert.equal(
      seatView(m, seat).deck.filter((c) => c === SAGA.searchingEye).length,
      1,
    );
  assert.deepEqual(m.sagaCards!.lateDeck, [
    [SAGA.searchingEye],
    [SAGA.searchingEye],
  ]);
  m = calm(settle(m));
  win(m);
  m = applySagaResolution(m, { "eye:0": "penalty", "eye:1": "eye" });
  assert.deepEqual(m.campaign!.playerPenalty, [2, 0]);
  assert.deepEqual(m.campaign!.deckBurdens, { [SAGA.searchingEye]: [1] });
  assert.ok(valid(m));
  let j = continueCampaign(m, m.campaign!.heroes, d.id, true, 97, [
    "tactics",
    "spirit",
  ]);
  assert.equal(j.scenarioId, "journey-to-the-cross-roads");
  const plain = hotSeat("journey-to-the-cross-roads");
  assert.equal(seatView(j, 0).threat, seatView(plain, 0).threat + 2);
  assert.equal(seatView(j, 1).threat, seatView(plain, 1).threat);
  assert.equal(
    seatView(j, 0).deck.filter((c) => c === SAGA.searchingEye).length,
    0,
  );
  assert.equal(
    seatView(j, 1).deck.filter((c) => c === SAGA.searchingEye).length,
    1,
  );
  // Each player chooses: player 1 shuffles Brace of Coneys, player 2 takes
  // the resources.
  for (let i = 0; i < 10 && j.choice; i++)
    j = choose(
      j,
      /^Journey to the Cross-roads · Legolas/.test(j.choice.title)
        ? "coneys"
        : /^Journey to the Cross-roads · Éowyn/.test(j.choice.title)
          ? "resources"
          : j.choice.options[0].id,
    );
  assert.deepEqual(j.sagaCards!.coneys, [0]);
  calm(j);
  win(j);
  assert.deepEqual(j.campaign!.boonCopies, { [SAGA.coneys]: [0] });
  // The interlude gives that copy to player 2's deck.
  const sl = continueCampaign(
    j,
    j.campaign!.heroes,
    d.id,
    true,
    98,
    ["tactics", "spirit"],
    undefined,
    { [`${SAGA.coneys}#0`]: 1 },
  );
  assert.deepEqual(sl.campaign!.boonCopies, { [SAGA.coneys]: [1] });
  const count = (seat: number) => {
    let n = 0;
    forOwner(sl, seat, () => {
      n =
        sl.deck.filter((c) => c === SAGA.coneys).length +
        sl.hand.filter((u) => u.code === SAGA.coneys).length;
    });
    return n;
  };
  assert.deepEqual([count(0), count(1)], [0, 1]);
  assert.throws(
    () =>
      continueCampaign(
        j,
        j.campaign!.heroes,
        d.id,
        true,
        99,
        ["tactics", "spirit"],
        undefined,
        {
          [`${SAGA.coneys}#1`]: 0,
        },
      ),
    /Each earned copy/,
  );
});
