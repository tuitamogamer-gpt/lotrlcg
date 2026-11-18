import test from "node:test";
import assert from "node:assert/strict";
import { card, STARTERS } from "../src/game/cards";
import { destroy, win } from "../src/game/board";
import { flush } from "../src/game/effects";
import { fx } from "../src/game/core";
import {
  applyAction,
  createGame,
  restoreSave,
  stats,
  validateSave,
} from "../src/game/engine";
import { continueCampaign } from "../src/game/campaign";
import { automatedScenarioId } from "../src/game/support";
import { fellowshipAragorn } from "../src/game/lotr-saga";
import { reduceThreat } from "../src/game/threat-reduction";
import { playerCardImmune } from "../src/game/card-immunity";
import { JTC } from "../src/game/cross-roads-support";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import {
  applySagaResolution,
  ARAGORN_KEY,
  FOTW_LEFT_BURDENS,
  SAGA,
  SAGA_CAMPAIGN_ORDER,
  sagaCampaignStatus,
  sagaResolutionQuestions,
} from "../src/game/saga-campaign";
import { sagaCampaignFirstPlayerChanged } from "../src/game/saga-campaign-cards";
import { seatView } from "../src/game/table";
import type { CampaignState, GameState } from "../src/game/types";

const d = STARTERS[0];
const HEROES = ["01005", "01006", d.heroes[2]];
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
const chapter = (
  next: (typeof SAGA_CAMPAIGN_ORDER)[number],
  extra: Partial<CampaignState> = {},
  seed = 7,
) =>
  createGame(seed, d.cards, HEROES, d.id, {
    scenarioId: next,
    playMode: "campaign",
    campaign: logAt(next, extra),
  });
const MAN = JTC.man,
  SOLDIER = JTC.soldier,
  CAPTAIN = JTC.captain;

test("The Flame of the West campaign cards, the Army of the Dead boon and the Pelennor's Corsair Fleet are registered with the scans' texts, and its three chapters are supported", () => {
  assert.match(
    card(SAGA.greyCard).text!,
    /^Setup: Each player may change heroes without incurring the \+1 threat penalty\. The first player may raise each player's threat by 1 to search his deck for Andúril/,
  );
  for (const code of [SAGA.greyCard, SAGA.siegeCard, SAGA.pelennorCard])
    assert.match(
      card(code).text!,
      /\(A Shadow of the Past, Flight to the Ford, The Ring Goes South, The Passage of the Marshes, Shelob's Lair\)$/,
    );
  assert.match(
    card(SAGA.greyCard).back_text!,
    /record the name of each player it was attached to\. If Army of the Dead is in the victory display/,
  );
  assert.match(
    card(SAGA.siegeCard).back_text!,
    /Remove Army of the Dead from the campaign pool\./,
  );
  assert.match(
    card(SAGA.pelennorCard).back_text!,
    /^Forced: When the players advance to stage 5B, add each set aside Harad enemy to the staging area\.\nResolution: Add 1 copy, per player, of Wraith on Wings/,
  );
  const army = card(SAGA.army);
  assert.deepEqual(
    [army.type_code, army.willpower, army.attack, army.defense, army.health],
    ["objective-ally", 4, 6, 2, 8],
  );
  assert.equal(army.subtitle, "The Siege of Gondor");
  assert.match(
    card(SAGA.gondorFleet).text!,
    /^Forced: At the beginning of the quest phase, remove 1 resource from The Corsair Fleet\. Then, if there are no resources here, the first player takes control of Aragorn/,
  );
  assert.equal(card(SAGA.gondorFleet).traits, "Gondor.");
  // The catalog's identity: the box's card 72, in the Pelennor's set.
  assert.deepEqual(
    [
      SAGA.gondorFleet,
      card(SAGA.gondorFleet).position,
      card(SAGA.gondorFleet).encounter_set,
    ],
    [
      "octgn:b002c7a6-f827-4a7d-8432-c3f2f995089e",
      72,
      "The Battle of the Pelennor Fields",
    ],
  );
  assert.deepEqual(
    [
      "The Passing of the Grey Company",
      "The Siege of Gondor",
      "The Battle of the Pelennor Fields",
      "Intruders in Chetwood",
    ].map((name) => automatedScenarioId({ name, mode: "campaign" })),
    [
      "the-passing-of-the-grey-company",
      "the-siege-of-gondor",
      "the-battle-of-the-pelennor-fields",
      null,
    ],
  );
});

test("The Passing of the Grey Company: free hero changes without Frodo Baggins, Frodo's and the Land of Shadow's burdens stay out, the first player may search for Andúril, and the resolution earns each Overcome by Fear and the Army of the Dead", () => {
  // Continue from a won Shelob's Lair.
  const sl = calm(
    settle(
      createGame(5, d.cards, HEROES, d.id, {
        scenarioId: "shelobs-lair",
        playMode: "campaign",
        campaign: logAt("shelobs-lair", {
          boons: [SAGA.anduril, SAGA.coneys],
          deckBoons: { [SAGA.anduril]: 0 },
          boonCopies: { [SAGA.coneys]: [0] },
          burdens: [SAGA.delay, SAGA.searchingEye, SAGA.pursued],
          deckBurdens: { [SAGA.searchingEye]: [0] },
        }),
      }),
    ),
  );
  win(sl);
  assert.ok(sl.campaign!.burdens.includes(SAGA.heavy));
  assert.throws(
    () => continueCampaign(sl, ["02025", "01006", d.heroes[2]], d.id),
    /No card titled Frodo Baggins/,
  );
  const g = continueCampaign(
    sl,
    ["01007", "01008", d.heroes[2]],
    d.id,
    true,
    8,
  );
  assert.equal(g.scenarioId, "the-passing-of-the-grey-company");
  assert.equal(g.campaign!.threatPenalty, 0, "two free changes");
  assert.ok(fellowshipAragorn(g), "the Fellowship Aragorn leads");
  for (const code of FOTW_LEFT_BURDENS) {
    assert.ok(!g.encounterDeck.includes(code), card(code).name);
    assert.ok(!g.deck.includes(code), card(code).name);
    assert.ok(!g.staging.some((u) => u.code === code), card(code).name);
  }
  assert.ok(
    !g.heroes.some((h) => h.attachments.some((a) => a.code === SAGA.heavy)),
  );
  assert.ok(g.encounterDeck.includes(SAGA.pursued), "Journey in the Dark's");
  assert.equal(g.hand.length, 6, "no Gandalf's Delay");
  assert.ok(valid(g));
  // The Andúril search.
  const search = calm(reload(g));
  search.hand = search.hand.filter((u) => u.code !== SAGA.anduril);
  if (!search.deck.includes(SAGA.anduril)) search.deck.push(SAGA.anduril);
  search.queue.push(fx("sagaAndurilSearch", { player: 0 }));
  flush(search);
  assert.deepEqual(
    search.choice!.options.map((o) => o.id),
    ["search", "skip"],
  );
  const found = choose(search, "search");
  assert.equal(found.threat, search.threat + 1);
  assert.ok(found.hand.some((u) => u.code === SAGA.anduril));
  assert.ok(!found.deck.includes(SAGA.anduril));
  // The resolution.
  const done = calm(reload(g));
  done.victoryCards = [...(done.victoryCards ?? []), SAGA.armyEnemy];
  assert.ok((done.threatAttachments ?? []).some((a) => a.code === SAGA.fear));
  win(done);
  assert.deepEqual(done.campaign!.threatDials, [0]);
  assert.ok(done.campaign!.burdens.includes(SAGA.fear));
  assert.ok(done.campaign!.boons.includes(SAGA.army));
  assert.ok(valid(done));
  const none = calm(reload(g));
  none.threatAttachments = [];
  win(none);
  assert.equal(none.campaign!.threatDials, undefined);
  assert.ok(!none.campaign!.boons.includes(SAGA.army));
});

test("The Siege of Gondor: Overcome by Fear returns to the recorded threat dial (no reduction, +1 threat each round, detached for a Fellowship resource), the Army of the Dead follows the first player and leaves the game, and the resolution records The Corsair Fleet and removes the Army", () => {
  let sg = settle(
    chapter("the-siege-of-gondor", {
      boons: [SAGA.army],
      burdens: [SAGA.fear],
      threatDials: [0],
    }),
  );
  assert.ok((sg.threatAttachments ?? []).some((a) => a.code === SAGA.fear));
  const army = sg.allies.find((u) => u.code === SAGA.army)!;
  assert.ok(army, "the first player takes control of Army of the Dead");
  assert.ok(playerCardImmune(army));
  assert.ok(valid(sg));
  // Your threat cannot be reduced.
  const locked = calm(reload(sg));
  const threat = locked.threat;
  reduceThreat(locked, 3, "test");
  assert.equal(locked.threat, threat);
  // At the end of the round: +1 threat, then a Fellowship resource detaches it.
  const round = calm(reload(sg));
  fellowshipAragorn(round)!.resources = 1;
  round.queue.push(fx("sagaFearRound", { player: 0 }));
  flush(round);
  assert.equal(round.threat, threat + 1);
  assert.match(round.choice!.title, /^Overcome by Fear · Spend 1 Fellowship/);
  const free = choose(round, "detach");
  assert.equal(fellowshipAragorn(free)!.resources, 0);
  assert.ok(!(free.threatAttachments ?? []).some((a) => a.code === SAGA.fear));
  // The Army of the Dead leaves the game when destroyed.
  const gone = calm(reload(sg));
  destroy(
    gone,
    gone.allies.find((u) => u.code === SAGA.army)!,
  );
  assert.ok(gone.removed.includes(SAGA.army));
  assert.ok(!gone.encounterDiscard.includes(SAGA.army));
  // The resolution.
  sg = calm(reload(sg));
  sg.staging.find((u) => u.code === SAGA.corsairFleet)!.resources = 4;
  win(sg);
  assert.equal(sg.campaign!.corsairFleet, 4);
  assert.ok(!sg.campaign!.boons.includes(SAGA.army));
  assert.ok(valid(sg));
  const bad = structuredClone(sg);
  bad.campaign!.corsairFleet = -1;
  assert.ok(!valid(bad));
});

test("Hot-seat: the Army of the Dead passes to the new first player", () => {
  const seats = [
    { heroes: ["01005", "01006"], deckId: STARTERS[1].id },
    { heroes: ["01007", "01008"], deckId: STARTERS[2].id },
  ];
  const sg = createGame(
    31,
    STARTERS[1].cards,
    seats[0].heroes,
    seats[0].deckId,
    {
      scenarioId: "the-siege-of-gondor",
      playMode: "campaign",
      seats,
      campaign: logAt(
        "the-siege-of-gondor",
        {
          boons: [SAGA.army],
          burdens: [SAGA.fear],
          threatDials: [1],
          seatHeroes: [2, 2],
        },
        [...seats[0].heroes, ...seats[1].heroes],
      ),
    },
  );
  assert.ok(seatView(sg, 0).allies.some((u) => u.code === SAGA.army));
  // Overcome by Fear returns to the recorded second player's dial only; a
  // seat's dial is valid in a saved hot-seat campaign.
  assert.ok(
    !(seatView(sg, 0).threatAttachments ?? []).some(
      (a) => a.code === SAGA.fear,
    ),
  );
  assert.ok(
    (seatView(sg, 1).threatAttachments ?? []).some((a) => a.code === SAGA.fear),
  );
  assert.ok(valid(sg));
  const loose = structuredClone(sg);
  loose.campaign = null;
  loose.playMode = "normal";
  assert.ok(!valid(loose), "outside the campaign, only Grey Company has it");
  const next = calm(reload(sg));
  next.table!.first = 1;
  sagaCampaignFirstPlayerChanged(next);
  assert.ok(!seatView(next, 0).allies.some((u) => u.code === SAGA.army));
  assert.ok(seatView(next, 1).allies.some((u) => u.code === SAGA.army));
});

test("The Battle of the Pelennor Fields: the recorded Harad enemies wait for stage 5B, Aragorn waits with Andúril and Banner of Elendil until The Corsair Fleet runs out of resources, the Harad enemies keep their printed text, and the resolution earns the Wraiths and the Esquires", () => {
  let pf = chapter("the-battle-of-the-pelennor-fields", {
    boons: [SAGA.anduril],
    deckBoons: { [SAGA.anduril]: 0 },
    corsairFleet: 2,
    blackGateEnemies: [MAN, SOLDIER, CAPTAIN],
  });
  assert.equal(pf.status, "playing", "Aragorn set aside is not a loss");
  assert.ok(!fellowshipAragorn(pf));
  assert.deepEqual(
    pf.sagaCards!.aragornAside!.attachments.map((a) => a.code).sort(),
    [SAGA.anduril, SAGA.banner].sort(),
  );
  assert.ok(
    ![...pf.deck, ...pf.hand.map((u) => u.code)].includes(SAGA.anduril),
    "Andúril leaves the deck",
  );
  assert.deepEqual(pf.sagaCards!.haradAside, [MAN, SOLDIER, CAPTAIN]);
  assert.deepEqual(sagaCampaignStatus(pf), [
    `Aragorn waits with ${pf
      .sagaCards!.aragornAside!.attachments.map((a) => card(a.code).name)
      .join(" and ")} until The Corsair Fleet has no resources.`,
    `${[MAN, SOLDIER, CAPTAIN].map((code) => card(code).name).join(", ")} wait for stage 5B.`,
  ]);
  const fleet = pf.staging.find((u) => u.code === SAGA.gondorFleet)!;
  assert.equal(fleet.resources, 2);
  pf = settle(pf);
  assert.ok(valid(pf));
  // A save from the release that named the fleet "pelennor-corsair-fleet".
  const legacy = restoreSave(
    JSON.parse(
      JSON.stringify(pf).replaceAll(
        JSON.stringify(SAGA.gondorFleet),
        JSON.stringify("pelennor-corsair-fleet"),
      ),
    ),
  );
  assert.ok(legacy, "the older save is restored");
  assert.equal(
    legacy!.staging.find((u) => u.code === SAGA.gondorFleet)?.resources,
    2,
  );
  // The beginning of the quest phase.
  const quest = calm(reload(pf));
  const f = quest.staging.find((u) => u.code === SAGA.gondorFleet)!;
  quest.queue.push(fx("sagaGondorFleet", { target: f.id, player: 0 }));
  flush(quest);
  assert.equal(f.resources, 1);
  assert.ok(!fellowshipAragorn(quest));
  quest.queue.push(fx("sagaGondorFleet", { target: f.id, player: 0 }));
  flush(quest);
  const aragorn = fellowshipAragorn(quest)!;
  assert.ok(aragorn, "the first player takes control of Aragorn");
  assert.ok(aragorn.attachments.some((a) => a.code === SAGA.anduril));
  assert.ok(quest.victoryCards!.includes(SAGA.gondorFleet));
  assert.ok(!quest.staging.some((u) => u.code === SAGA.gondorFleet));
  // Stage 5B: the Harad enemies arrive.
  quest.queue.push(fx("sagaHaradArrive", { player: 0 }));
  flush(quest);
  for (const code of [MAN, SOLDIER, CAPTAIN])
    assert.ok(
      quest.staging.some((u) => u.code === code),
      card(code).name,
    );
  assert.equal(quest.sagaCards!.haradAside, undefined);
  assert.ok(valid(quest));
  // Captain of Harad engages: each Harad enemy +1 attack, -10 engagement.
  const captain = quest.staging.find((u) => u.code === CAPTAIN)!;
  const man = quest.staging.find((u) => u.code === MAN)!;
  const attack = stats(quest, man).attack;
  quest.staging = quest.staging.filter((u) => u.id !== captain.id);
  quest.engaged.push(captain);
  batch4Scenario(quest).engaged?.(quest, captain);
  assert.equal(stats(quest, man).attack, attack + 1);
  // Man of Harad engages: 1 random card is discarded.
  const hand = quest.hand.length;
  calm(quest);
  quest.staging = quest.staging.filter((u) => u.id !== man.id);
  quest.engaged.push(man);
  batch4Scenario(quest).engaged?.(quest, man);
  flush(quest);
  assert.equal(quest.hand.length, Math.max(0, hand - 1));
  // The resolution.
  const done = calm(reload(pf));
  done.heroes[0].attachments.push({
    id: "esquire",
    code: SAGA.esquireRohan,
    exhausted: false,
  });
  win(done);
  assert.ok(done.campaign!.burdens.includes(SAGA.wraith));
  assert.deepEqual(done.campaign!.burdenCopies, { [SAGA.wraith]: 1 });
  assert.ok(done.campaign!.boons.includes(SAGA.esquireRohan));
  assert.deepEqual(done.campaign!.permanent[done.heroes[0].code], [
    SAGA.esquireRohan,
  ]);
  assert.ok(valid(done));
  // The Mountain of Fire follows.
  const next = continueCampaign(done, HEROES, d.id, true, 96);
  assert.equal(next.scenarioId, "the-tower-of-cirith-ungol");
  assert.ok(valid(next));
});

test("The Fellowship Aragorn: a fallen Aragorn leaves the list with a +1 penalty, and a recorded Aragorn's Permanent cards are transferred to the Fellowship Aragorn", () => {
  const sl = calm(
    settle(
      createGame(5, d.cards, HEROES, d.id, {
        scenarioId: "shelobs-lair",
        playMode: "campaign",
        campaign: logAt("shelobs-lair", {
          fallen: ["01001"],
          boons: [SAGA.ranger],
          permanent: {},
        }),
      }),
    ),
  );
  win(sl);
  const g = continueCampaign(sl, HEROES, d.id, true, 9);
  assert.ok(!g.campaign!.fallen.includes("01001"));
  assert.equal(g.campaign!.threatPenalty, 1);
  // A recorded Aragorn's Permanent cards move to the Fellowship Aragorn.
  const tos = calm(
    settle(
      createGame(5, d.cards, d.heroes, d.id, {
        scenarioId: "breaking-of-the-fellowship",
        playMode: "campaign",
        campaign: logAt(
          "breaking-of-the-fellowship",
          {
            boons: [SAGA.ranger],
            permanent: { "01001": [SAGA.ranger] },
          },
          d.heroes,
        ),
      }),
    ),
  );
  win(tos);
  const answers = Object.fromEntries(
    sagaResolutionQuestions(tos).map((q) => [q.id, q.options[0].id]),
  );
  const resolved = applySagaResolution(tos, answers);
  const uruk = continueCampaign(resolved, d.heroes, d.id, true, 10);
  assert.deepEqual(uruk.campaign!.permanent[ARAGORN_KEY], [SAGA.ranger]);
  assert.equal(uruk.campaign!.permanent["01001"], undefined);
  assert.ok(
    fellowshipAragorn(uruk)!.attachments.some((a) => a.code === SAGA.ranger),
  );
  assert.ok(valid(uruk));
});
