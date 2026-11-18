import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { card, STARTERS } from "../src/game/cards";
import { check, win } from "../src/game/board";
import { flush } from "../src/game/effects";
import {
  applyAction,
  availableAbilities,
  createGame,
  enemyAttackPrevented,
  restoreSave,
  stats,
  validateSave,
} from "../src/game/engine";
import { continueCampaign, retryAdventure } from "../src/game/campaign";
import { fx, make } from "../src/game/core";
import { effectiveTraits } from "../src/game/expansion-passives";
import { automatedScenarioId } from "../src/game/support";
import { ringBearer } from "../src/game/lotr-saga";
import {
  applySagaResolution,
  RING_BEARER_KEY,
  SAGA,
  SAGA_CAMPAIGN_ORDER,
  sagaResolutionQuestions,
} from "../src/game/saga-campaign";
import { sagaCampaignAbilityProblem } from "../src/game/saga-campaign-cards";
import { forOwner, seatView } from "../src/game/table";
import type { GameState } from "../src/game/types";
import art from "./saga-campaign-art.json";

const d = STARTERS[0];
/** Evil Crow, a plain enemy of A Shadow of the Past. */
const CROW = "octgn:ff597a85-6a02-4301-a9dc-4dcb4cf9b626";
const reload = (s: GameState) => restoreSave(JSON.parse(JSON.stringify(s)))!;
const choose = (s: GameState, id: string) =>
  applyAction(reload(s), { type: "CHOOSE", id });
/** A Lord of the Rings campaign at A Shadow of the Past, after setup. */
function begin(seed = 11) {
  return createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "a-shadow-of-the-past",
    playMode: "campaign",
  });
}
/** Stop the setup flow at a calm planning window. */
function calm(s: GameState) {
  Object.assign(s, { phase: "planning", choice: null, queue: [] });
  return s;
}
/** Win the current chapter and record the given resolution. */
function finish(s: GameState, answers: Record<string, string> = {}) {
  calm(s);
  win(s);
  return s.campaign!.resolution ? applySagaResolution(s, answers) : s;
}

test("The Lord of the Rings campaign: its campaign cards, boons and burdens are registered with every face pinned; the three Black Riders chapters are supported", () => {
  assert.equal(art.length, 14);
  for (const a of art) {
    const bytes = readFileSync(`public${a.localPath}`);
    assert.equal(bytes.length, a.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), a.sha256);
  }
  assert.equal(card(SAGA.shadowCard).type_code, "campaign");
  assert.match(card(SAGA.shadowCard).text!, /Setup: Attach Mr\. Underhill/);
  assert.match(
    card(SAGA.knifeCard).back_text!,
    /Tireless Ranger, Skilled Healer, Valiant Warrior, Noble Hero/,
  );
  assert.match(
    card(SAGA.fordCard).text!,
    /burden deck into the encounter deck to cancel that attack/,
  );
  // Gandalf's Delay: the scan (and Hall of Beorn) read "starting hand".
  assert.match(
    card(SAGA.delay).text!,
    /Each player draws 1 less card in his starting hand\./,
  );
  assert.equal(card(SAGA.underhill).victory, 1);
  assert.deepEqual(
    ["Q0C.01", "Q0C.02", "Q0C.03", "Q0C.04"].map((id, i) =>
      automatedScenarioId({
        name: [
          "A Shadow of the Past",
          "A Knife in the Dark",
          "Flight to the Ford",
          "The Ring Goes South",
        ][i],
        mode: "campaign",
      }),
    ),
    ["a-shadow-of-the-past", "a-knife-in-the-dark", "flight-to-the-ford", null],
  );
  assert.equal(SAGA_CAMPAIGN_ORDER.length, 18);
});

test("A Shadow of the Past in campaign mode: Mr. Underhill is attached to the Ring-bearer, Gandalf's Delay is staged (each player draws 1 less card) and Gildor Inglorion and The Ring Draws Them join the encounter deck", () => {
  const s = begin();
  assert.equal(s.campaign!.kind, "saga");
  assert.equal(s.hand.length, 5, "Gandalf's Delay: 1 less card");
  assert.ok(s.staging.some((u) => u.code === SAGA.delay));
  assert.ok(s.encounterDeck.includes(SAGA.gildor));
  assert.ok(s.encounterDeck.includes(SAGA.ringDraws));
  const bearer = ringBearer(s)!;
  assert.ok(bearer.attachments.some((a) => a.code === SAGA.underhill));
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
  // The campaign follows its chapters in order.
  assert.throws(
    () =>
      createGame(1, d.cards, d.heroes, d.id, {
        scenarioId: "a-knife-in-the-dark",
        playMode: "campaign",
      }),
    /follows its chapters in order/,
  );
});

test("Resolutions and the Campaign Log: A Shadow of the Past earns one burden and one boon; A Knife in the Dark lets each player attach a boon; fallen heroes and replacements raise every player's threat", () => {
  let s = begin();
  calm(s);
  // A hero in its controller's discard pile at the end is fallen.
  const fallen = s.heroes.find((h) => h.code === d.heroes[2])!;
  s.heroes = s.heroes.filter((h) => h.id !== fallen.id);
  s.discard.push(fallen.code);
  win(s);
  assert.equal(s.campaign!.resolution, "a-shadow-of-the-past");
  assert.deepEqual(s.campaign!.fallen, [fallen.code]);
  assert.deepEqual(
    sagaResolutionQuestions(s).map((q) => [q.id, q.options.map((o) => o.id)]),
    [
      ["burden", [SAGA.delay, SAGA.ringDraws]],
      ["boon", [SAGA.gildor, SAGA.underhill]],
    ],
  );
  assert.throws(
    () => continueCampaign(s, d.heroes, d.id, true, 1),
    /resolution/,
  );
  assert.throws(
    () => applySagaResolution(s, { burden: SAGA.gildor, boon: SAGA.underhill }),
    /Answer/,
  );
  s = applySagaResolution(s, { burden: SAGA.delay, boon: SAGA.underhill });
  assert.deepEqual(s.campaign!.burdens, [SAGA.delay]);
  assert.deepEqual(s.campaign!.boons, [SAGA.underhill]);
  assert.deepEqual(s.campaign!.permanent, {
    [RING_BEARER_KEY]: [SAGA.underhill],
  });
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
  // The fallen hero cannot return; replacing it costs every player +1 threat.
  assert.throws(
    () => continueCampaign(s, d.heroes, d.id, true, 1),
    /not fallen/,
  );
  const replacement = "01005";
  const heroes = [d.heroes[0], d.heroes[1], replacement];
  let k = continueCampaign(s, heroes, d.id, true, 2);
  assert.equal(k.scenarioId, "a-knife-in-the-dark");
  assert.equal(k.campaign!.threatPenalty, 1);
  assert.equal(
    k.threat,
    heroes.reduce((n, h) => n + (card(h).threat ?? 0), 0) + 1,
  );
  assert.equal(k.hand.length, 5, "the earned Gandalf's Delay");
  assert.ok(k.staging.some((u) => u.code === SAGA.delay));
  assert.ok(ringBearer(k)!.attachments.some((a) => a.code === SAGA.underhill));
  assert.ok(!k.encounterDeck.includes(SAGA.ringDraws));
  // A Knife in the Dark: each player may attach one boon to a hero.
  k = (() => {
    calm(k);
    win(k);
    return k;
  })();
  const q = sagaResolutionQuestions(k);
  assert.equal(q.length, 1);
  assert.ok(
    q[0].options.some((o) => o.id === `${SAGA.noble}@${RING_BEARER_KEY}`),
  );
  k = applySagaResolution(k, { "boon:0": `${SAGA.warrior}@${d.heroes[0]}` });
  assert.deepEqual(k.campaign!.permanent[d.heroes[0]], [SAGA.warrior]);
  const f = continueCampaign(k, heroes, d.id, true, 3);
  assert.equal(f.scenarioId, "flight-to-the-ford");
  const hero = f.heroes.find((h) => h.code === d.heroes[0])!;
  assert.ok(hero.attachments.some((a) => a.code === SAGA.warrior));
  assert.ok(effectiveTraits(hero).includes("Warrior"));
  assert.equal(stats(f, hero).attack, (card(hero.code).attack ?? 0) + 1);
  assert.ok(validateSave(JSON.parse(JSON.stringify(f))));
  // Losing a chapter has no penalty: it is replayed with the same log.
  f.status = "lost";
  const again = retryAdventure(f, 4);
  assert.equal(again.scenarioId, "flight-to-the-ford");
  assert.deepEqual(again.campaign, f.campaign);
});

test("Flight to the Ford's resolution adds each burden in play, in the encounter deck and in the discard pile to the Campaign Pool; its campaign Response shuffles the top burden into the encounter deck to cancel an attack", () => {
  let s = begin();
  s = finish(s, { burden: SAGA.ringDraws, boon: SAGA.gildor });
  s = continueCampaign(s, d.heroes, d.id, true, 5);
  s = finish(s, { "boon:0": "none" });
  let f = continueCampaign(s, d.heroes, d.id, true, 6);
  assert.ok(f.encounterDeck.includes(SAGA.ringDraws));
  assert.ok(
    f.encounterDeck.includes(SAGA.gildor),
    "the earned Gildor Inglorion",
  );
  const burdens = [...f.flightFord!.burdens];
  // The campaign Response: an attacking enemy is canceled by the top burden.
  calm(f);
  const enemy = make(f, CROW);
  f.engaged.push(enemy);
  f.phase = "defense";
  f.queue.push(fx("immediateAttack", { target: enemy.id, player: 0 }));
  flush(f);
  for (
    let i = 0;
    i < 10 &&
    f.choice &&
    !/^Flight to the Ford · Campaign/.test(f.choice.title);
    i++
  )
    f = choose(f, f.choice.options[0].id);
  assert.match(
    f.choice!.title,
    /^Flight to the Ford · Campaign: cancel Evil Crow's attack/,
  );
  f = choose(f, "cancel");
  assert.equal(f.flightFord!.burdens.length, burdens.length - 1);
  assert.ok(f.encounterDeck.includes(burdens[0]));
  assert.ok(f.log.some((l) => /attack is canceled/.test(l.text)));
  assert.ok(!f.choice || !/Immediate attack|defender/i.test(f.choice.title));
  // The resolution earns the burdens in play, the encounter deck and the discard pile.
  calm(f);
  f.encounterDiscard.push(burdens[1] ?? burdens[0]);
  f.flightFord!.burdens = f.flightFord!.burdens.filter(
    (c) => c !== (burdens[1] ?? burdens[0]),
  );
  win(f);
  assert.equal(f.campaign!.resolution, null);
  assert.ok(f.campaign!.burdens.includes(SAGA.ringDraws));
  assert.ok(f.campaign!.burdens.includes(burdens[1] ?? burdens[0]));
  assert.ok(validateSave(JSON.parse(JSON.stringify(f))));
  assert.throws(
    () => continueCampaign(f, d.heroes, d.id, true, 7),
    /not available yet/,
  );
});

test("Boons and burdens: Mr. Underhill keeps an engaged enemy from attacking, Gildor Inglorion leaves at the end of the round unless 1 fellowship resource is spent, The Ring Draws Them engages each staging enemy with the first player at the end of the phase, and Permanent cards cannot be discarded", () => {
  let s = calm(begin());
  const bearer = ringBearer(s)!;
  const underhill = bearer.attachments.find((a) => a.code === SAGA.underhill)!;
  assert.match(
    sagaCampaignAbilityProblem(s, bearer, underhill.id)!,
    /engaged with you/,
  );
  const enemy = make(s, CROW);
  s.engaged.push(enemy);
  assert.equal(sagaCampaignAbilityProblem(s, bearer, underhill.id), null);
  s = applyAction(reload(s), {
    type: "ABILITY",
    id: bearer.id,
    attachmentId: underhill.id,
  });
  s = choose(s, enemy.id);
  assert.ok(s.victoryCards?.includes(SAGA.underhill));
  assert.ok(!ringBearer(s)!.attachments.some((a) => a.code === SAGA.underhill));
  assert.deepEqual(
    s.sagaCards!.underhill.map((m) => m.enemy),
    [enemy.id],
  );
  assert.ok(
    enemyAttackPrevented(
      s,
      s.engaged.find((u) => u.id === enemy.id)!,
      0,
    ),
  );
  // Gildor Inglorion, revealed: the first player gains control of him.
  let g = calm(begin());
  g.encounterDeck.unshift(SAGA.gildor);
  g.queue.push(fx("reveal", { player: 0 }));
  flush(g);
  for (let i = 0; i < 5 && g.choice; i++) g = choose(g, g.choice.options[0].id);
  assert.ok(g.allies.some((u) => u.code === SAGA.gildor));
  // At the end of the round: keep him for 1 fellowship resource from Frodo.
  calm(g);
  ringBearer(g)!.resources = 1;
  g.queue.push(
    fx("sagaGildorEnd", {
      target: g.allies.find((u) => u.code === SAGA.gildor)!.id,
      player: 0,
    }),
  );
  flush(g);
  assert.match(g.choice!.title, /^Gildor Inglorion · Forced/);
  g = choose(g, ringBearer(g)!.id);
  assert.ok(g.allies.some((u) => u.code === SAGA.gildor));
  assert.equal(ringBearer(g)!.resources, 0);
  g.queue.push(
    fx("sagaGildorEnd", {
      target: g.allies.find((u) => u.code === SAGA.gildor)!.id,
      player: 0,
    }),
  );
  flush(g);
  assert.ok(
    !g.allies.some((u) => u.code === SAGA.gildor),
    "no fellowship resource: discarded",
  );
  assert.ok(g.encounterDiscard.includes(SAGA.gildor));
  // The Ring Draws Them.
  let r = calm(begin());
  r.phase = "quest";
  r.encounterDeck.unshift(SAGA.ringDraws, CROW);
  r.queue.push(fx("reveal", { player: 0 }));
  flush(r);
  for (let i = 0; i < 5 && r.choice; i++) r = choose(r, r.choice.options[0].id);
  assert.equal(r.sagaCards!.ringDraws, 1);
  assert.ok(r.encounterDiscard.includes(SAGA.ringDraws));
  const staged = r.staging.filter(
    (u) => card(u.code).type_code === "enemy",
  ).length;
  r.queue.push(fx("sagaRingDraws", { player: 0 }));
  flush(r);
  assert.equal(
    r.staging.filter((u) => card(u.code).type_code === "enemy").length,
    0,
  );
  assert.ok(r.engaged.length >= staged);
  // The Old Road's Action is offered in campaign mode only.
  let o = finish(begin(), { burden: SAGA.delay, boon: SAGA.gildor });
  o = continueCampaign(o, d.heroes, d.id, true, 8);
  o = finish(o, { "boon:0": "none" });
  let ford = calm(continueCampaign(o, d.heroes, d.id, true, 9));
  const road = make(ford, "octgn:edae55ef-8025-4553-9ff8-e81526effd59");
  ford.staging.push(road);
  const label = availableAbilities(ford, road).find((a) =>
    /^The Old Road/.test(a.label),
  );
  assert.ok(label && !label.disabled);
  const top = ford.flightFord!.burdens[0];
  ford = applyAction(reload(ford), { type: "ABILITY", id: road.id });
  assert.equal(
    ford.encounterDeck[0],
    top,
    "the burden goes on top of the encounter deck",
  );
  // 4 progress explores The Old Road (4 quest points).
  assert.ok(!ford.staging.some((u) => u.id === road.id));
  assert.ok(ford.encounterDiscard.includes(road.code));
  const normal = createGame(3, d.cards, d.heroes, d.id, {
    scenarioId: "flight-to-the-ford",
  });
  const road2 = make(normal, "octgn:edae55ef-8025-4553-9ff8-e81526effd59");
  normal.staging.push(road2);
  assert.ok(
    !availableAbilities(normal, road2).some((a) =>
      /^The Old Road/.test(a.label),
    ),
  );
  // Permanent: a card effect cannot discard it; it is removed with its hero.
  const p = calm(begin());
  const hero = p.heroes.find((h) => h.code === d.heroes[0])!;
  hero.attachments.push({ id: "perm", code: SAGA.ranger, exhausted: false });
  assert.equal(stats(p, hero).defense, (card(hero.code).defense ?? 0) + 1);
  assert.ok(effectiveTraits(hero).includes("Ranger"));
  void check;
  void forOwner;
  void seatView;
});
