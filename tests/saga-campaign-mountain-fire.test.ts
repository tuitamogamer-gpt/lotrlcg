import test from "node:test";
import assert from "node:assert/strict";
import { card, STARTERS } from "../src/game/cards";
import { check, destroy, win } from "../src/game/board";
import { flush } from "../src/game/effects";
import { engagementCost, fx, make, threatOf } from "../src/game/core";
import {
  applyAction,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { continueCampaign } from "../src/game/campaign";
import { automatedScenarioId } from "../src/game/support";
import { fellowshipAragorn, ringBearer } from "../src/game/lotr-saga";
import { CU } from "../src/game/cirith-ungol";
import { firstPlayer, forOwner, seatView } from "../src/game/table";
import {
  applySagaResolution,
  FOTW_LEFT_BURDENS,
  MOF_LEFT_BURDENS,
  SAGA,
  SAGA_CAMPAIGN_JOURNAL,
  SAGA_CAMPAIGN_ORDER,
  SAGA_CAMPAIGN_SUPPORTED,
  sagaBurdenLeftOut,
  sagaCampaignLossCompletion,
  sagaCampaignStatus,
  sagaForbiddenTitle,
  sagaResolutionQuestions,
} from "../src/game/saga-campaign";
import {
  sagaCampaignAttackBonus,
  sagaCampaignRoundEnd,
  sagaCampaignWillBonus,
} from "../src/game/saga-campaign-cards";
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
const attached = (s: GameState, code: string) =>
  [
    ...s.heroes,
    ...s.allies,
    ...(s.sagaCards?.aragornAside ? [s.sagaCards.aragornAside] : []),
  ].filter((u) => u.attachments.some((a) => a.code === code));

test("The Mountain of Fire campaign cards are registered with the scans' texts, and the whole campaign (18 chapters and the two inserts) is supported", () => {
  assert.match(
    card(SAGA.cirithCard).text!,
    /^Setup: Each player may change heroes he controls without incurring the \+1 threat penalty\. Attach A Heavy Burden to the hero with Last of the Company attached\. Each player chooses an Item boon \(excluding Andúril\) from the campaign pool and sets it aside, out of play\./,
  );
  assert.match(
    card(SAGA.cirithCard).back_text!,
    /^Forced: When the players advance to stage 3A, attach A Heavy Burden to the Ring-bearer\. Attach each set aside Item boon to Shagrat as a guarded objective\. When Shagrat is defeated, return each guarded boon to its owner's hand\.\nResolution: If Shagrat is in play, remove each Item boon attached to it from the campaign pool\./,
  );
  for (const code of [SAGA.cirithCard, SAGA.doomCard])
    assert.match(
      card(code).text!,
      /\(Helm's Deep, The Road to Isengard, The Passing of the Grey Company\)/,
    );
  assert.match(
    card(SAGA.gateCard).text!,
    /The first player may raise each player's threat by 1 to search his deck for Andúril and add it to his hand\. .*\(A Shadow of the Past, Flight to the Ford, The Ring Goes South, The Passage of the Marshes, Shelob's Lair\)$/,
  );
  assert.match(
    card(SAGA.gateCard).back_text!,
    /^Resolution: Record the number of resource tokens on The Black Gate .*If the first player controls Gwaihir, add him to the campaign pool\. The players have earned that boon\. If a hero is in its controller's discard pile, do not add that hero's name to the list of fallen heroes\.$/,
  );
  assert.match(
    card(SAGA.doomCard).text!,
    /Place X resource tokens on this card, where X is the number of resource tokens on The Black Gate, as recorded in the campaign log\..*\nForced: At the end of the round, remove 1 resource token from this card\. Then, if there are no resource tokens here, the players lose the game\.$/s,
  );
  assert.match(
    card(SAGA.doomCard).back_text!,
    /- Keep The One Ring card and succumb to the power of Sauron\. Then, the players lose the campaign\.\n- Destroy The One Ring card and defeat the power of Sauron\. Then, the players win the campaign\.$/,
  );
  assert.deepEqual(
    [SAGA.cirithCard, SAGA.gateCard, SAGA.doomCard].map(
      (code) => card(code).subtitle,
    ),
    [16, 17, 18].map((n) => `The Lord of the Rings Part ${n}`),
  );
  // Gwaihir: earned at The Black Gate Opens, then an encounter card.
  assert.equal(card(SAGA.gwaihir).type_code, "objective-ally");
  assert.match(
    card(SAGA.gwaihir).text!,
    /either take control of Gwaihir, or spend 1 \[fellowship\] resource and discard Gwaihir to discard a non-unique enemy/,
  );
  assert.deepEqual(
    [
      "The Tower of Cirith Ungol",
      "The Black Gate Opens",
      "Mount Doom",
      "Intruders in Chetwood",
    ].map((name) => automatedScenarioId({ name, mode: "campaign" })),
    ["the-tower-of-cirith-ungol", "the-black-gate-opens", "mount-doom", null],
  );
  assert.deepEqual(
    [...SAGA_CAMPAIGN_SUPPORTED].sort(),
    [...SAGA_CAMPAIGN_JOURNAL].sort(),
  );
  // The burden sets each chapter's campaign card removes.
  for (const id of ["the-tower-of-cirith-ungol", "mount-doom"] as const) {
    for (const code of [SAGA.counsels, SAGA.voice, SAGA.fear])
      assert.ok(sagaBurdenLeftOut(id, code), `${id} ${card(code).name}`);
    assert.ok(!sagaBurdenLeftOut(id, SAGA.heavy));
    assert.ok(!sagaBurdenLeftOut(id, SAGA.wraith));
    assert.equal(sagaForbiddenTitle(id), "Aragorn");
  }
  assert.deepEqual(MOF_LEFT_BURDENS, [SAGA.counsels, SAGA.voice, SAGA.fear]);
  for (const code of FOTW_LEFT_BURDENS)
    assert.ok(sagaBurdenLeftOut("the-black-gate-opens", code), code);
  assert.ok(!sagaBurdenLeftOut("the-black-gate-opens", SAGA.fear));
  assert.equal(sagaForbiddenTitle("the-black-gate-opens"), "Frodo Baggins");
});

test("The Tower of Cirith Ungol: each player sets an Item boon aside (never Andúril), A Heavy Burden goes to the Last of the Company hero and then the Ring-bearer, Shagrat guards the set-aside boons, and the resolution loses the boons Shagrat still guards", () => {
  let cu = chapter("the-tower-of-cirith-ungol", {
    boons: [SAGA.sting, SAGA.mithril, SAGA.anduril],
    deckBoons: { [SAGA.sting]: 0, [SAGA.mithril]: 0, [SAGA.anduril]: 0 },
    burdens: [SAGA.heavy, SAGA.fear, SAGA.wraith, SAGA.counsels],
    deckBurdens: { [SAGA.counsels]: [0] },
    threatDials: [0],
    burdenCopies: { [SAGA.wraith]: 1 },
  });
  // The earned Wraith on Wings enters the staging area; Overcome by Fear and
  // Poisoned Counsels stay out.
  assert.equal(cu.staging.filter((u) => u.code === SAGA.wraith).length, 1);
  assert.deepEqual(cu.threatAttachments ?? [], []);
  for (const code of [SAGA.fear, SAGA.wraith, SAGA.heavy, SAGA.counsels])
    assert.ok(!cu.encounterDeck.includes(code), card(code).name);
  assert.ok(!cu.deck.includes(SAGA.counsels));
  assert.match(cu.choice!.title, /Set aside an Item boon$/);
  assert.deepEqual(
    cu.choice!.options.map((o) => o.id),
    [SAGA.sting, SAGA.mithril],
  );
  cu = choose(cu, SAGA.sting);
  assert.deepEqual(cu.sagaCards!.itemsAside, [{ code: SAGA.sting, owner: 0 }]);
  assert.ok(
    ![...cu.deck, ...cu.hand.map((u) => u.code)].includes(SAGA.sting),
    "Sting leaves the deck",
  );
  assert.ok(valid(cu));
  // The starting hand: Last of the Company, then A Heavy Burden.
  let kept = applyAction(reload(settle(cu)), { type: "KEEP" });
  kept = settle(kept);
  const [lotc] = attached(kept, CU.company);
  assert.ok(lotc, "Last of the Company is attached");
  assert.deepEqual(
    attached(kept, SAGA.heavy).map((u) => u.id),
    [lotc.id],
  );
  assert.deepEqual(sagaCampaignStatus(kept), [
    "Set aside until stage 3A, then guarded by Shagrat: Sting.",
  ]);
  assert.ok(valid(kept));
  // The players advance to stage 3A with Shagrat in the staging area and the
  // Ring-bearer free of Topmost Chamber.
  const t = calm(reload(kept));
  const q = t.cirithUngol!;
  const frodo = q.captive!;
  delete q.captive;
  const first = firstPlayer(t);
  frodo.owner = first;
  frodo.controller = first;
  forOwner(t, first, () => t.heroes.push(frodo));
  q.setAside = q.setAside.filter((code) => code !== CU.shagrat);
  const shagrat = make(t, CU.shagrat);
  t.staging.push(shagrat);
  const heavyId = attached(t, SAGA.heavy)[0].attachments.find(
    (a) => a.code === SAGA.heavy,
  )!.id;
  t.queue.push(fx("cuStageThree", { player: first }));
  flush(t);
  const three = settle(t);
  assert.equal(ringBearer(three)?.code, frodo.code);
  assert.deepEqual(
    attached(three, SAGA.heavy).map((u) => u.code),
    [frodo.code],
    "A Heavy Burden moves to the Ring-bearer",
  );
  assert.equal(
    ringBearer(three)!.attachments.find((a) => a.code === SAGA.heavy)!.id,
    heavyId,
  );
  const guard = three.staging.find((u) => u.code === CU.shagrat)!;
  assert.deepEqual(
    guard.attachments.map((a) => a.code),
    [SAGA.sting],
  );
  assert.deepEqual(three.sagaCards!.guarded, [guard.attachments[0].id]);
  assert.equal(three.sagaCards!.itemsAside, undefined);
  assert.deepEqual(sagaCampaignStatus(three), [
    "Shagrat guards Sting: defeat him to return it to its owner's hand, or the players lose that boon.",
  ]);
  assert.ok(valid(three));
  // A win with Shagrat in play loses Sting.
  const lost = calm(reload(three));
  win(lost);
  assert.deepEqual(lost.campaign!.boons, [SAGA.mithril, SAGA.anduril]);
  assert.equal(lost.campaign!.deckBoons![SAGA.sting], undefined);
  assert.ok(valid(lost));
  // Shagrat defeated: Sting returns to its owner's hand and stays earned.
  const freed = calm(reload(three));
  Object.assign(freed, { phase: "combat" });
  destroy(
    freed,
    freed.staging.find((u) => u.code === CU.shagrat)!,
  );
  assert.ok(freed.hand.some((u) => u.code === SAGA.sting));
  assert.deepEqual(freed.sagaCards!.guarded, []);
  calm(freed);
  win(freed);
  assert.deepEqual(freed.campaign!.boons, [
    SAGA.sting,
    SAGA.mithril,
    SAGA.anduril,
  ]);
  assert.ok(valid(freed));
  // The Black Gate Opens follows, with the Fellowship Aragorn.
  const bgo = continueCampaign(freed, HEROES, d.id, true, 31);
  assert.equal(bgo.scenarioId, "the-black-gate-opens");
  assert.ok(fellowshipAragorn(bgo));
  assert.ok(valid(bgo));
});

test("The Black Gate Opens: the first player may search for Andúril, a loss still completes the chapter without fallen heroes, and the resolution records The Black Gate's tokens, the slain Wraiths on Wings and Gwaihir", () => {
  let bg = chapter(
    "the-black-gate-opens",
    {
      boons: [SAGA.anduril],
      deckBoons: { [SAGA.anduril]: 0 },
      burdens: [SAGA.fear, SAGA.wraith, SAGA.heavy, SAGA.searchingEye],
      deckBurdens: { [SAGA.searchingEye]: [0] },
      threatDials: [0],
      burdenCopies: { [SAGA.wraith]: 2 },
    },
    8,
  );
  assert.ok(fellowshipAragorn(bg), "Aragorn leads the Black Gate");
  assert.equal(bg.staging.filter((u) => u.code === SAGA.wraith).length, 2);
  assert.deepEqual(
    (bg.threatAttachments ?? []).map((a) => a.code),
    [SAGA.fear],
    "Overcome by Fear stays on the recorded threat dial",
  );
  // The burdens of The Passage of the Marshes and Shelob's Lair stay out.
  assert.deepEqual(attached(bg, SAGA.heavy), []);
  assert.ok(!bg.deck.includes(SAGA.searchingEye));
  assert.match(
    bg.choice!.title,
    /^The Black Gate Opens · You may search for Andúril$/,
  );
  bg = choose(bg, "search");
  assert.equal(bg.threat, 28, "each player raises their threat by 1");
  assert.ok(bg.hand.some((u) => u.code === SAGA.anduril));
  bg = applyAction(reload(bg), { type: "KEEP" });
  bg = settle(bg);
  assert.equal(bg.phase, "resource");
  bg = applyAction(reload(bg), { type: "NEXT" });
  assert.equal(bg.phase, "planning");
  // At the beginning of the quest phase The Black Gate raises the threat to
  // 99 (Dire): the only player is eliminated, and the loss still completes
  // the chapter (the applyAction wrapper resolves the campaign card).
  const t = reload(bg);
  t.threat = 98;
  t.staging.find((u) => u.code === SAGA.blackGate)!.resources = 2;
  t.victoryCards = [...(t.victoryCards ?? []), SAGA.wraith];
  const gwaihir = make(t, SAGA.gwaihir);
  gwaihir.owner = 0;
  t.allies.push(gwaihir);
  // A hero in its controller's discard pile is not recorded as fallen.
  const fallen = t.heroes.find((u) => u.code === HEROES[0])!;
  t.heroes = t.heroes.filter((u) => u.id !== fallen.id);
  t.discard.push(fallen.code);
  const lost = applyAction(t, { type: "NEXT" });
  assert.equal(lost.status, "lost");
  assert.match(lost.reason!, /threat reached 99/);
  const c = lost.campaign!;
  assert.equal(c.completed.at(-1)?.scenarioId, "the-black-gate-opens");
  assert.deepEqual(c.fallen, []);
  assert.equal(c.blackGateTokens, 3);
  assert.deepEqual(c.burdenCopies, { [SAGA.wraith]: 1 });
  assert.ok(c.burdens.includes(SAGA.wraith));
  assert.ok(c.boons.includes(SAGA.gwaihir));
  assert.ok(valid(lost));
  // Mount Doom: X tokens from the Campaign Log, Gwaihir in the encounter deck,
  // the remaining Wraith on Wings, A Heavy Burden on the Ring-bearer, and no
  // Overcome by Fear or Aragorn.
  const md = continueCampaign(lost, HEROES, d.id, true, 32);
  assert.equal(md.scenarioId, "mount-doom");
  assert.equal(md.sagaCards!.doomTokens, 3);
  assert.ok(md.encounterDeck.includes(SAGA.gwaihir));
  assert.equal(md.staging.filter((u) => u.code === SAGA.wraith).length, 1);
  assert.deepEqual(md.threatAttachments ?? [], []);
  assert.ok(!fellowshipAragorn(md));
  assert.ok(
    ringBearer(md)!.attachments.some((a) => a.code === SAGA.heavy),
    "A Heavy Burden is attached to the Ring-bearer",
  );
  assert.ok(valid(md));
});

test("Hot-seat: Gwaihir is earned when the first player controlled him as the last fellowships fell, not when the first player fell earlier", () => {
  const seats = [
    { heroes: ["01005", "01006"], deckId: STARTERS[1].id },
    { heroes: ["01007", "01008"], deckId: STARTERS[2].id },
  ];
  const bg = calm(
    createGame(41, STARTERS[1].cards, seats[0].heroes, seats[0].deckId, {
      scenarioId: "the-black-gate-opens",
      playMode: "campaign",
      seats,
      campaign: logAt("the-black-gate-opens", { seatHeroes: [2, 2] }, [
        ...seats[0].heroes,
        ...seats[1].heroes,
      ]),
    }),
  );
  const eagle = (t: GameState) =>
    forOwner(t, 0, () => {
      const g = make(t, SAGA.gwaihir);
      g.owner = 0;
      g.controller = 0;
      t.allies.push(g);
    });
  const fall = (t: GameState, p: number) => {
    forOwner(t, p, () => {
      t.threat = 99;
    });
    check(t);
  };
  // Both fellowships fall at once (The Black Gate raises each threat).
  const both = calm(reload(bg));
  eagle(both);
  forOwner(both, 1, () => {
    both.threat = 99;
  });
  fall(both, 0);
  assert.equal(both.status, "lost");
  assert.ok(!seatView(both, 0).allies.length, "the cards left play");
  sagaCampaignLossCompletion(both);
  assert.ok(both.campaign!.boons.includes(SAGA.gwaihir));
  assert.equal(
    both.campaign!.completed.at(-1)?.scenarioId,
    "the-black-gate-opens",
  );
  assert.ok(valid(both));
  // The first player falls first: Gwaihir leaves play with their cards.
  const apart = calm(reload(bg));
  eagle(apart);
  fall(apart, 0);
  assert.equal(apart.status, "playing");
  assert.equal(apart.sagaCards?.gwaihirAtLoss, undefined);
  fall(apart, 1);
  assert.equal(apart.status, "lost");
  sagaCampaignLossCompletion(apart);
  assert.ok(!apart.campaign!.boons.includes(SAGA.gwaihir));
});

test("Mount Doom: a token leaves the campaign card at the end of each round and the players lose with none left, and the resolution's choice wins or loses the campaign", () => {
  const md = settle(
    chapter("mount-doom", {
      blackGateTokens: 2,
      boons: [SAGA.gwaihir],
    }),
  );
  assert.equal(md.sagaCards!.doomTokens, 2);
  assert.deepEqual(sagaCampaignStatus(md), [
    "2 resource tokens remain on the campaign card: 1 is removed at the end of each round, and the players lose when none remain.",
  ]);
  const r = calm(reload(md));
  Object.assign(r, { phase: "refresh" });
  assert.ok(
    sagaCampaignRoundEnd(r).some((e) => e.kind === "sagaDoomToken"),
    "the campaign card's Forced effect at the end of the round",
  );
  r.queue.push(fx("sagaDoomToken", { player: 0 }));
  flush(r);
  assert.equal(r.sagaCards!.doomTokens, 1);
  assert.equal(r.status, "playing");
  r.queue.push(fx("sagaDoomToken", { player: 0 }));
  flush(r);
  assert.equal(r.status, "lost");
  assert.match(r.reason!, /no resource token remains on the campaign card/);
  assert.ok(
    !r.campaign!.completed.some((q) => q.scenarioId === "mount-doom"),
    "a lost Mount Doom is replayed",
  );
  assert.ok(valid(r));
  // The resolution: the first player destroys or keeps The One Ring.
  for (const [answer, outcome] of [
    ["destroy", "won"],
    ["keep", "lost"],
  ] as const) {
    const w = calm(reload(md));
    win(w);
    assert.equal(w.campaign!.resolution, "mount-doom");
    const [question] = sagaResolutionQuestions(w);
    assert.deepEqual(
      question.options.map((o) => o.id),
      ["destroy", "keep"],
    );
    const done = applySagaResolution(w, { ring: answer });
    assert.equal(done.campaign!.outcome, outcome);
    assert.equal(done.campaign!.resolution, null);
    assert.ok(valid(done));
    assert.throws(
      () => continueCampaign(done, HEROES, d.id, true, 33),
      /The campaign is complete\./,
    );
  }
});

test("Gwaihir, Wraith on Wings and the Esquires keep their text outside their own scenarios", () => {
  const md = calm(
    reload(
      settle(
        chapter("mount-doom", {
          blackGateTokens: 5,
          boons: [SAGA.gwaihir, SAGA.esquireRohan, SAGA.esquireGondor],
          permanent: {
            [HEROES[0]]: [SAGA.esquireRohan],
            [HEROES[1]]: [SAGA.esquireGondor],
          },
          burdens: [SAGA.wraith],
          burdenCopies: { [SAGA.wraith]: 1 },
        }),
      ),
    ),
  );
  // Gwaihir revealed: the first player takes control of him (no Fellowship
  // resource to discard an enemy).
  md.encounterDeck.unshift(SAGA.gwaihir);
  md.queue.push({ kind: "reveal", player: 0 });
  flush(md);
  let s = md;
  while (s.choice && !/^Gwaihir/.test(s.choice.title))
    s = choose(s, s.choice.options[0].id);
  assert.match(s.choice!.title, /^Gwaihir · Choose one/);
  s = choose(s, "control");
  assert.ok(s.allies.some((u) => u.code === SAGA.gwaihir));
  // Wraith on Wings: a resource at the beginning of the quest phase, +1
  // threat and -1 engagement cost for each.
  const wraith = s.staging.find((u) => u.code === SAGA.wraith)!;
  const threat = threatOf(s, wraith);
  const engagement = engagementCost(s, wraith);
  s.queue.push(fx("sagaWraithResource", { target: wraith.id, player: 0 }));
  flush(s);
  assert.equal(wraith.resources, 1);
  assert.equal(threatOf(s, wraith), threat + 1);
  assert.equal(engagementCost(s, wraith), engagement - 1);
  // The Esquires: Permanent, attached at setup.
  const rohan = s.heroes.find((u) => u.code === HEROES[0])!;
  const gondor = s.heroes.find((u) => u.code === HEROES[1])!;
  assert.ok(rohan.attachments.some((a) => a.code === SAGA.esquireRohan));
  assert.ok(gondor.attachments.some((a) => a.code === SAGA.esquireGondor));
  const other = s.heroes.find((u) => u.code === HEROES[2])!;
  other.attachments.push({
    id: "other-rohan",
    code: SAGA.esquireRohan,
    exhausted: false,
  });
  assert.equal(sagaCampaignAttackBonus(s, rohan, [rohan, other]), 1);
  assert.equal(sagaCampaignAttackBonus(s, rohan, [rohan]), 0);
  other.attachments = [
    { id: "other-gondor", code: SAGA.esquireGondor, exhausted: false },
  ];
  gondor.committed = true;
  other.committed = true;
  assert.equal(sagaCampaignWillBonus(s, gondor), 1);
  other.committed = false;
  assert.equal(sagaCampaignWillBonus(s, gondor), 0);
});
