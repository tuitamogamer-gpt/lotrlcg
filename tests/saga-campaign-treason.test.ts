import test from "node:test";
import assert from "node:assert/strict";
import { card, STARTERS } from "../src/game/cards";
import { win } from "../src/game/board";
import { flush } from "../src/game/effects";
import { draw, fx, make } from "../src/game/core";
import {
  applyAction,
  availableAbilities,
  createGame,
  restoreSave,
  stats,
  validateSave,
} from "../src/game/engine";
import { playTargets } from "../src/game/actions";
import { playerAttack } from "../src/game/combat";
import { continueCampaign } from "../src/game/campaign";
import { automatedScenarioId } from "../src/game/support";
import {
  applySagaResolution,
  FRODO_BURDENS,
  SAGA,
  sagaCampaignDeckSetup,
  sagaResolutionQuestions,
} from "../src/game/saga-campaign";
import {
  sagaCampaignRevealPlayers,
  sagaCampaignNoTreachery,
} from "../src/game/saga-campaign-cards";
import type { GameState, Unit } from "../src/game/types";

const d = STARTERS[0];
/** Goblin Sniper: a non-unique Orc enemy with 2 attack, 0 defense and 2 hit points. */
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
const hero = (s: GameState, name: string) =>
  s.heroes.find((h) => card(h.code).name === name)!;
/** A campaign that has won Breaking of the Fellowship (Glóin taken captive). */
function afterBreaking(seed = 21) {
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
  return finish(settle(continueCampaign(s, d.heroes, d.id, true, seed + 5)), {
    burden: SAGA.night,
    "captive:0": d.heroes[2],
  });
}

test("The Treason of Saruman campaign cards, boons and Saruman's Voice are registered with the scans' corrections, and its three chapters are supported", () => {
  assert.match(
    card(SAGA.urukCard).text!,
    /Remove Gildor Inglorion and Mr\. Underhill from the Campaign Pool\./,
  );
  assert.match(card(SAGA.urukCard).back_text!, /Beyond All Hope/);
  assert.match(
    card(SAGA.isengardCard).back_text!,
    /the first player has earned the Palantír of Orthanc boon card/,
  );
  assert.equal(card(SAGA.palantir).victory, 5);
  assert.match(
    card(SAGA.hope).text!,
    /\+1 \[willpower\], \+1 \[attack\], \+1 \[defense\]/,
  );
  assert.equal(card(SAGA.voice).type_code, "treachery");
  assert.deepEqual(
    [
      "The Uruk-hai",
      "Helm's Deep",
      "The Road to Isengard",
      "The Tower of Cirith Ungol",
    ].map((name) => automatedScenarioId({ name, mode: "campaign" })),
    ["the-uruk-hai", "helms-deep", "the-road-to-isengard", null],
  );
});

test("The Uruk-hai: Gildor Inglorion and Mr. Underhill leave the Campaign Pool, Frodo's burden sets stay out, each captive comes from the Campaign Log, and the resolution earns the Skill boons or Beyond All Hope", () => {
  const s = afterBreaking();
  assert.deepEqual(s.campaign!.captives, [d.heroes[2]]);
  let u = continueCampaign(s, d.heroes, d.id, true, 30);
  assert.equal(u.scenarioId, "the-uruk-hai");
  assert.ok(!u.campaign!.boons.includes(SAGA.underhill));
  assert.ok(!u.campaign!.permanent["ring-bearer"]);
  for (const code of FRODO_BURDENS) {
    assert.ok(!u.encounterDeck.includes(code), card(code).name);
    assert.ok(!u.staging.some((x) => x.code === code), card(code).name);
  }
  assert.ok(u.encounterDeck.includes(SAGA.pursued));
  assert.equal(u.hand.length, 6, "Gandalf's Delay stays out");
  u = settle(u);
  assert.ok(valid(u));
  // The captive is the hero recorded in the Campaign Log.
  calm(u);
  u.queue.push(fx("uhSetupCaptive", { player: 0 }));
  flush(u);
  assert.deepEqual(
    u.choice!.options.map((o) => o.code),
    [d.heroes[2]],
  );
  u = settle(u);
  // The resolution: the pursuit value must be 25 or lower.
  const far = calm(structuredClone(u));
  far.urukHai!.pursuit = 26;
  win(far);
  assert.equal(far.campaign!.resolution, null);
  assert.equal(far.campaign!.captives, undefined, "the captives are rescued");
  const near = calm(structuredClone(u));
  near.urukHai!.pursuit = 25;
  win(near);
  const questions = sagaResolutionQuestions(near);
  assert.deepEqual(
    questions.map((q) => [q.id, q.options.map((o) => o.id)]),
    [
      ["reward", ["skill"]],
      [
        "skill:0",
        [
          "none",
          `${SAGA.intimidation}@${d.heroes[1]}`,
          `${SAGA.leader}@${d.heroes[1]}`,
          `${SAGA.leader}@${d.heroes[2]}`,
        ],
      ],
      ["hope", ["none"]],
      ["hopeDrop", ["none", ...d.heroes]],
    ],
  );
  const skill = applySagaResolution(near, {
    reward: "skill",
    "skill:0": `${SAGA.leader}@${d.heroes[2]}`,
    hope: "none",
    hopeDrop: "none",
  });
  assert.deepEqual(skill.campaign!.permanent[d.heroes[2]], [SAGA.leader]);
  assert.ok(skill.campaign!.boons.includes(SAGA.leader));
  // Beyond All Hope brings a fallen hero back in place of another.
  const hope = calm(structuredClone(u));
  hope.campaign!.fallen = ["01005"];
  hope.urukHai!.pursuit = 12;
  win(hope);
  assert.deepEqual(
    sagaResolutionQuestions(hope)[0].options.map((o) => o.id),
    ["skill", "hope"],
  );
  assert.throws(
    () =>
      applySagaResolution(hope, {
        reward: "hope",
        "skill:0": "none",
        hope: "0@01005",
        hopeDrop: "none",
      }),
    /remove from the Campaign Log/,
  );
  const back = applySagaResolution(hope, {
    reward: "hope",
    "skill:0": "none",
    hope: "0@01005",
    hopeDrop: d.heroes[1],
  });
  assert.deepEqual(back.campaign!.heroes, [d.heroes[0], "01005", d.heroes[2]]);
  assert.deepEqual(back.campaign!.fallen, []);
  assert.deepEqual(back.campaign!.permanent["01005"], [SAGA.hope]);
  const next = continueCampaign(back, back.campaign!.heroes, d.id, true, 31);
  assert.equal(next.campaign!.threatPenalty, 0, "no threat penalty");
  const legolas = next.heroes.find((h) => h.code === "01005")!;
  assert.ok(legolas.attachments.some((a) => a.code === SAGA.hope));
  assert.equal(
    stats(next, legolas).attack,
    (card("01005").attack ?? 0) + 1,
    "Beyond All Hope: +1 attack",
  );
  assert.ok(sagaCampaignNoTreachery(legolas));
  assert.ok(valid(next));
});

test("Helm's Deep: heroes change without the penalty; each player with Poisoned Counsels earns it, and later it is shuffled into that player's deck, discarding the rest of the hand when drawn", () => {
  const s = afterBreaking();
  const u = finish(settle(continueCampaign(s, d.heroes, d.id, true, 40)), URUK);
  let h = continueCampaign(u, ["01005", "01006", d.heroes[2]], d.id, true, 41);
  assert.equal(h.scenarioId, "helms-deep");
  assert.equal(h.campaign!.threatPenalty, 0);
  h = settle(h);
  calm(h);
  h.deck.push(SAGA.counsels);
  h = finish(h);
  assert.ok(h.campaign!.burdens.includes(SAGA.counsels));
  assert.deepEqual(h.campaign!.deckBurdens, { [SAGA.counsels]: [0] });
  assert.ok(valid(h));
  let r = settle(continueCampaign(h, h.campaign!.heroes, d.id, true, 42));
  assert.equal(r.scenarioId, "the-road-to-isengard");
  assert.ok(
    r.deck.includes(SAGA.counsels),
    "shuffled in after the starting hand",
  );
  calm(r);
  r.deck.splice(r.deck.indexOf(SAGA.counsels), 1);
  r.deck.unshift(SAGA.counsels);
  const hand = r.hand.length;
  const discard = r.discard.length;
  draw(r, 1);
  assert.deepEqual(
    r.hand.map((x) => x.code),
    [SAGA.counsels],
  );
  assert.equal(r.discard.length, discard + hand);
});

test("The Road to Isengard: Saruman's Voice joins the encounter deck, attaches to a questing hero and makes its controller discard; the resolution earns Saruman's Voice and the Palantír of Orthanc by hand size", () => {
  const s = afterBreaking();
  const u = finish(settle(continueCampaign(s, d.heroes, d.id, true, 50)), URUK);
  const h = finish(settle(continueCampaign(u, d.heroes, d.id, true, 51)));
  let r = settle(continueCampaign(h, d.heroes, d.id, true, 52));
  assert.equal(r.scenarioId, "the-road-to-isengard");
  assert.ok(r.encounterDeck.includes(SAGA.voice));
  assert.ok(valid(r));
  // Saruman's Voice: remove a questing hero from the quest and attach.
  calm(r);
  const theodred = hero(r, "Théodred");
  theodred.committed = true;
  r.phase = "quest";
  r.encounterDeck.unshift(SAGA.voice, GOBLIN);
  r.queue.push(fx("reveal", { player: 0 }));
  flush(r);
  for (
    let i = 0;
    i < 6 && r.choice && !/^Saruman's Voice/.test(r.choice.title);
    i++
  )
    r = choose(
      r,
      r.choice.options.find((o) => o.id === "resolve")?.id ??
        r.choice.options[0].id,
    );
  assert.deepEqual(
    r.choice!.options.map((o) => o.code),
    [theodred.code],
    "only the questing hero",
  );
  r = choose(r, theodred.id);
  r = settle(r);
  assert.ok(!hero(r, "Théodred").committed);
  assert.ok(hero(r, "Théodred").attachments.some((a) => a.code === SAGA.voice));
  // When that hero is declared as a defender, its controller discards 1 card.
  calm(r);
  const goblin = make(r, GOBLIN);
  r.engaged.push(goblin);
  hero(r, "Théodred").exhausted = false;
  const hand = r.hand.length;
  r.phase = "defense";
  r.queue.push(fx("immediateAttack", { target: goblin.id, player: 0 }));
  flush(r);
  let discarded = false;
  for (let i = 0; i < 10 && r.choice; i++) {
    if (/^Saruman's Voice · Discard/.test(r.choice.title)) discarded = true;
    r = choose(
      r,
      (
        r.choice.options.find((o) => o.id === hero(r, "Théodred").id) ??
        r.choice.options[0]
      ).id,
    );
  }
  assert.ok(discarded);
  assert.equal(r.hand.length, hand - 1);
  // The resolution by hand size: exactly 3 cards earn both.
  const both = calm(structuredClone(r));
  both.hand = both.hand.slice(0, 3);
  while (both.hand.length < 3)
    both.hand.push(make(both, d.cards ? Object.keys(d.cards)[0] : GOBLIN));
  win(both);
  assert.ok(both.campaign!.burdens.includes(SAGA.voice));
  assert.ok(both.campaign!.boons.includes(SAGA.palantir));
  assert.equal(both.campaign!.deckBoons![SAGA.palantir], 0);
  const many = calm(structuredClone(r));
  while (many.hand.length < 5)
    many.hand.push(make(many, Object.keys(d.cards)[0]));
  win(many);
  assert.ok(!many.campaign!.burdens.includes(SAGA.voice));
  assert.ok(many.campaign!.boons.includes(SAGA.palantir));
  assert.ok(valid(many));
  assert.throws(
    () => continueCampaign(many, d.heroes, d.id, true, 53),
    /No card titled Aragorn/,
  );
});

test("The Treason of Saruman boons: Intimidation, Hands of a Healer, Forewarned, Leader of Men and the Palantír of Orthanc", () => {
  const s = afterBreaking();
  let r = calm(settle(continueCampaign(s, d.heroes, d.id, true, 60)));
  const theodred = hero(r, "Théodred"),
    gloin = hero(r, "Glóin");
  const aragorn = r.heroes.find(
    (h) => card(h.code).sphere_code === "fellowship",
  )!;
  theodred.attachments.push({
    id: "int",
    code: SAGA.intimidation,
    exhausted: false,
    owner: 0,
  });
  gloin.attachments.push(
    { id: "hands", code: SAGA.hands, exhausted: false, owner: 0 },
    { id: "fore", code: SAGA.forewarned, exhausted: false, owner: 0 },
    { id: "lead", code: SAGA.leader, exhausted: false, owner: 0 },
  );
  // Intimidation: -2 defense when its hero attacks a non-unique enemy alone.
  const uruk = make(r, "octgn:51223bd0-ffd1-11df-a976-0801207c9010");
  r.engaged.push(uruk);
  r.phase = "attack";
  playerAttack(r, uruk, [theodred.id]);
  flush(r);
  assert.match(r.choice!.title, /^Intimidation/);
  r = choose(r, "use");
  r = settle(r);
  assert.ok(
    r.log.some((l) => /attack − 1 defense|− 1 defense/.test(l.text)),
    "3 defense − 2",
  );
  // Hands of a Healer: exhaust it and its hero to heal up to 3 from a hero.
  calm(r);
  hero(r, "Glóin").exhausted = false;
  hero(r, "Théodred").damage = 3;
  const g = hero(r, "Glóin");
  assert.ok(
    availableAbilities(r, g).some(
      (a) => /^Hands of a Healer/.test(a.label) && !a.disabled,
    ),
  );
  r = applyAction(reload(r), {
    type: "ABILITY",
    id: g.id,
    attachmentId: "hands",
  });
  r = choose(r, hero(r, "Théodred").id);
  assert.equal(hero(r, "Théodred").damage, 0);
  assert.ok(hero(r, "Glóin").exhausted);
  // Forewarned: its hero defends a non-unique enemy; 1 shadow card is discarded.
  calm(r);
  hero(r, "Glóin").exhausted = false;
  const goblin = make(r, GOBLIN);
  r.engaged.push(goblin);
  r.phase = "defense";
  r.queue.push(fx("immediateAttack", { target: goblin.id, player: 0 }));
  flush(r);
  let forewarned = false;
  for (let i = 0; i < 10 && r.choice; i++) {
    if (/^Forewarned/.test(r.choice.title)) forewarned = true;
    r = choose(
      r,
      (
        r.choice.options.find(
          (o) => o.id === hero(r, "Glóin").id || o.id === "use",
        ) ?? r.choice.options[0]
      ).id,
    );
  }
  assert.ok(forewarned);
  assert.ok(r.log.some((l) => /^Forewarned: a shadow card/.test(l.text)));
  // Leader of Men: after its hero quests successfully, 1 resource.
  calm(r);
  const lead = hero(r, "Glóin");
  lead.committed = true;
  const resources = lead.resources;
  r.lastQuest = { ...(r.lastQuest ?? {}), net: 2 } as never;
  r.queue.push(fx("questSuccessResponses", { player: 0 }));
  flush(r);
  assert.match(r.choice!.title, /^Leader of Men/);
  r = choose(r, "use");
  assert.equal(hero(r, "Glóin").resources, resources + 1);
  // The Palantír of Orthanc: only the Fellowship Aragorn; a Quest Action.
  calm(r);
  const palantir = make(r, SAGA.palantir);
  assert.deepEqual(
    playTargets(r, palantir).map((x) => x.code),
    [aragorn.code],
  );
  const ar = r.heroes.find((h) => h.id === aragorn.id)!;
  ar.exhausted = false;
  ar.attachments.push({
    id: "pal",
    code: SAGA.palantir,
    exhausted: false,
    owner: 0,
  });
  r.phase = "quest";
  const low = r.encounterDeck.find((c) => (card(c).threat ?? 0) === 0)!;
  r.encounterDeck.splice(r.encounterDeck.indexOf(low), 1);
  r.encounterDeck.unshift(low);
  r = applyAction(reload(r), {
    type: "ABILITY",
    id: ar.id,
    attachmentId: "pal",
  });
  assert.match(r.choice!.title, /^Palantír of Orthanc/);
  r = choose(r, "player-0");
  assert.ok(r.victoryCards!.includes(SAGA.palantir));
  assert.deepEqual(
    sagaCampaignRevealPlayers(r, [0]),
    [],
    "1 fewer encounter card",
  );
  assert.ok(valid(r));
});

test("The Treason of Saruman's restrictions: no card titled Frodo Baggins, and a recorded Aragorn gives way to the Fellowship Aragorn without the penalty", () => {
  const s = afterBreaking();
  assert.throws(
    () => continueCampaign(s, ["02025", d.heroes[1], d.heroes[2]], d.id),
    /Frodo Baggins/,
  );
  const u = continueCampaign(
    s,
    ["01005", d.heroes[1], d.heroes[2]],
    d.id,
    true,
    70,
  );
  assert.equal(
    u.campaign!.threatPenalty,
    0,
    "the recorded Aragorn is replaced for free",
  );
  const deck = calm(structuredClone(u));
  deck.deck.push("21002");
  sagaCampaignDeckSetup(deck);
  assert.ok(!deck.deck.includes("21002"));
  const bad = structuredClone(u);
  bad.campaign!.deckBurdens = { [SAGA.counsels]: [0] };
  assert.ok(!valid(bad), "Poisoned Counsels must be earned");
});
