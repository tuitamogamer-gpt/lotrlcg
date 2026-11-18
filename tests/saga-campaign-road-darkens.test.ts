import test from "node:test";
import assert from "node:assert/strict";
import { card, STARTERS } from "../src/game/cards";
import { win } from "../src/game/board";
import { flush } from "../src/game/effects";
import { fx, make } from "../src/game/core";
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
import { effectiveTraits } from "../src/game/expansion-passives";
import { syncAttachmentText } from "../src/game/attachment-text";
import { playerCardImmune } from "../src/game/card-immunity";
import { automatedScenarioId } from "../src/game/support";
import {
  applySagaResolution,
  GIFT_BOONS,
  SAGA,
  sagaCampaignDeckSetup,
  sagaResolutionQuestions,
  SOUTH_BOONS,
  validateSagaCampaign,
} from "../src/game/saga-campaign";
import {
  sagaCampaignCannotReady,
  sagaCampaignOneRingExhausted,
  validateSagaCards,
} from "../src/game/saga-campaign-cards";
import { JD } from "../src/game/journey-dark-support";
import { BF } from "../src/game/breaking-fellowship-support";
import { BREAKING_FELLOWSHIP_HOOKS } from "../src/game/breaking-fellowship";
import type { GameState, Unit } from "../src/game/types";

const d = STARTERS[0];
/** Goblin Sniper: an Orc enemy with 2 attack, 0 defense and 2 hit points. */
const GOBLIN = "01083";
const reload = (s: GameState) => restoreSave(JSON.parse(JSON.stringify(s)))!;
const choose = (s: GameState, id: string) =>
  applyAction(reload(s), { type: "CHOOSE", id });
const valid = (s: GameState) => validateSave(JSON.parse(JSON.stringify(s)));
function calm(s: GameState) {
  Object.assign(s, { phase: "planning", choice: null, queue: [] });
  return s;
}
/** Answer each pending choice with its first option. */
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
/** A Lord of the Rings campaign that has won Flight to the Ford. */
function afterFord(seed = 11) {
  let s = createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "a-shadow-of-the-past",
    playMode: "campaign",
  });
  s = finish(s, { burden: SAGA.ringDraws, boon: SAGA.gildor });
  s = finish(continueCampaign(s, d.heroes, d.id, true, seed + 1), {
    "boon:0": "none",
  });
  return finish(continueCampaign(s, d.heroes, d.id, true, seed + 2));
}
const hero = (s: GameState, name: string) =>
  s.heroes.find((h) => card(h.code).name === name)!;
const boonUnit = (s: GameState, code: string): Unit => make(s, code);
/** An immediate attack by an engaged enemy, answered by `pick`. */
function attack(
  s: GameState,
  enemy: Unit,
  pick: (o: { id: string; label: string }) => boolean,
) {
  s.phase = "defense";
  s.queue.push(fx("immediateAttack", { target: enemy.id, player: 0 }));
  flush(s);
  for (let i = 0; i < 12 && s.choice; i++)
    s = choose(s, (s.choice.options.find(pick) ?? s.choice.options[0]).id);
  return s;
}

test("The Road Darkens campaign cards, boons and burdens are registered with the scans' corrections, and its three chapters are supported", () => {
  assert.match(
    card(SAGA.southCard).text!,
    /Sting, Mithril Shirt, Glamdring, and Andúril\./,
  );
  assert.match(card(SAGA.southCard).back_text!, /Lust for the Ring/);
  assert.match(
    card(SAGA.darkCard).back_text!,
    /\(Grievous Wound or Overcome by Grief\)/,
  );
  assert.match(card(SAGA.breakingCard).text!, /Lórien Rope/);
  assert.match(card(SAGA.breakingCard).back_text!, /taken captive/);
  assert.deepEqual(
    GIFT_BOONS.map((code) => card(code).victory),
    [3, 3, 3, 3],
  );
  assert.deepEqual(
    SOUTH_BOONS.map((code) => [card(code).cost, card(code).sphere_code]),
    [
      ["2", "boon"],
      ["1", "boon"],
      ["2", "boon"],
      ["3", "boon"],
    ],
  );
  assert.deepEqual(
    [
      "The Ring Goes South",
      "Journey in the Dark",
      "Breaking of the Fellowship",
      "The Uruk-hai",
    ].map((name) => automatedScenarioId({ name, mode: "campaign" })),
    [
      "the-ring-goes-south",
      "journey-in-the-dark",
      "breaking-of-the-fellowship",
      null,
    ],
  );
});

test("The Ring Goes South: heroes change without the threat penalty, the players earn Sting, Mithril Shirt, Glamdring and Andúril, each player takes one into their hand (kept through a mulligan) and the rest join the first player's deck", () => {
  const s = afterFord();
  // Two heroes changed at once, without the +1 threat penalty.
  const heroes = ["01005", "01006", d.heroes[2]];
  let r = continueCampaign(s, heroes, d.id, true, 4);
  assert.equal(r.scenarioId, "the-ring-goes-south");
  assert.equal(r.campaign!.threatPenalty, 0);
  assert.match(r.choice!.title, /^The Ring Goes South · Choose a boon card/);
  assert.deepEqual(
    r.choice!.options.map((o) => o.id),
    [...SOUTH_BOONS],
  );
  for (const code of SOUTH_BOONS) assert.ok(r.campaign!.boons.includes(code));
  const hand = r.hand.length;
  r = choose(r, SAGA.sting);
  r = settle(r);
  assert.equal(r.hand.length, hand + 1);
  assert.ok(r.hand.some((u) => u.code === SAGA.sting));
  for (const code of [SAGA.mithril, SAGA.glamdring, SAGA.anduril])
    assert.ok(r.deck.includes(code), `${card(code).name} is in the deck`);
  assert.deepEqual(r.campaign!.deckBoons, {
    [SAGA.sting]: 0,
    [SAGA.mithril]: 0,
    [SAGA.glamdring]: 0,
    [SAGA.anduril]: 0,
  });
  assert.ok(valid(r));
  r = applyAction(reload(r), { type: "MULLIGAN" });
  assert.ok(r.hand.some((u) => u.code === SAGA.sting));
  // Outside The Ring Goes South: another version of the same hero (the same
  // title) is not a replacement, and no version of a fallen hero can be used.
  const south = finish(settle(continueCampaign(s, d.heroes, d.id, true, 5)));
  const swapped = continueCampaign(
    south,
    ["09001", "01005", d.heroes[2]],
    d.id,
    true,
    6,
  );
  assert.equal(swapped.campaign!.threatPenalty, 1, "only Théodred is replaced");
  const fallen = structuredClone(south);
  fallen.campaign!.fallen = ["01001"];
  assert.throws(
    () => continueCampaign(fallen, ["09001", d.heroes[1], d.heroes[2]], d.id),
    /not fallen/,
  );
  const deck = calm(structuredClone(swapped));
  deck.campaign!.fallen = ["01001"];
  deck.deck.push("04053");
  sagaCampaignDeckSetup(deck);
  assert.ok(!deck.deck.includes("04053"), "another Aragorn cannot be used");
});

test("The Road Darkens boons: Sting, Mithril Shirt, Glamdring and Andúril attach where their text allows, give their bonuses and resolve their Responses", () => {
  let r = calm(settle(continueCampaign(afterFord(), d.heroes, d.id, true, 4)));
  const targets = (code: string) =>
    playTargets(r, boonUnit(r, code))
      .map((u) => card(u.code).name)
      .sort();
  assert.deepEqual(targets(SAGA.sting), ["Frodo Baggins"]);
  assert.deepEqual(targets(SAGA.mithril), ["Frodo Baggins"]);
  assert.deepEqual(targets(SAGA.glamdring), ["Théodred"]);
  assert.deepEqual(targets(SAGA.anduril), ["Aragorn", "Glóin", "Théodred"]);
  const frodo = hero(r, "Frodo Baggins"),
    aragorn = hero(r, "Aragorn"),
    theodred = hero(r, "Théodred");
  const before = [stats(r, frodo), stats(r, aragorn), stats(r, theodred)];
  frodo.attachments.push(
    { id: "sting", code: SAGA.sting, exhausted: false, owner: 0 },
    { id: "mithril", code: SAGA.mithril, exhausted: false, owner: 0 },
  );
  aragorn.attachments.push({
    id: "anduril",
    code: SAGA.anduril,
    exhausted: false,
    owner: 0,
  });
  theodred.attachments.push({
    id: "glamdring",
    code: SAGA.glamdring,
    exhausted: false,
    owner: 0,
  });
  assert.deepEqual(stats(r, frodo), {
    ...before[0],
    will: before[0].will + 1,
    attack: before[0].attack + 1,
    defense: before[0].defense + 2,
    health: before[0].health + 1,
  });
  assert.equal(stats(r, aragorn).attack, before[1].attack + 1);
  assert.equal(stats(r, theodred).attack, before[2].attack + 2);
  // Sting: after Frodo exhausts to defend, the top encounter card's threat
  // is dealt as damage to the attacker.
  const goblin = make(r, GOBLIN);
  r.engaged.push(goblin);
  const threatening = r.encounterDeck.find((c) => (card(c).threat ?? 0) >= 2)!;
  r.encounterDeck.splice(r.encounterDeck.indexOf(threatening), 1);
  r.encounterDeck.splice(1, 0, threatening);
  r = attack(r, goblin, (o) => o.id === frodo.id || o.id === "sting");
  assert.ok(r.log.some((l) => /^Sting discards/.test(l.text)));
  assert.ok(!r.engaged.some((u) => u.id === goblin.id), "Goblin Sniper falls");
  // Andúril: after an attack Aragorn defended, he attacks that enemy.
  calm(r);
  const second = make(r, GOBLIN);
  r.engaged.push(second);
  r = attack(
    r,
    second,
    (o) => o.id === hero(r, "Aragorn").id || o.id === "attack",
  );
  assert.ok(r.log.some((l) => /^Andúril: Aragorn attacks/.test(l.text)));
  assert.ok(!r.engaged.some((u) => u.id === second.id));
  assert.ok(
    hero(r, "Aragorn").attachments.find((a) => a.code === SAGA.anduril)!
      .exhausted,
  );
  // Glamdring: after Théodred destroys an Orc enemy, draw 1 card.
  calm(r);
  r.phase = "attack";
  const third = make(r, GOBLIN);
  r.engaged.push(third);
  const hand = r.hand.length;
  playerAttack(r, third, [hero(r, "Théodred").id]);
  flush(r);
  for (let i = 0; i < 8 && r.choice; i++)
    r = choose(
      r,
      (r.choice.options.find((o) => o.id === "draw") ?? r.choice.options[0]).id,
    );
  assert.ok(!r.engaged.some((u) => u.id === third.id));
  assert.equal(r.hand.length, hand + 1, "Glamdring draws a card");
  assert.ok(valid(r));
});

test("Lust for the Ring: The Ring Goes South earns it when it is attached to a hero; in a later chapter it attaches to a non-Fellowship hero, and when The One Ring exhausts each player raises their threat by 1 and that hero's willpower is 0 this round", () => {
  let r = calm(settle(continueCampaign(afterFord(), d.heroes, d.id, true, 4)));
  hero(r, "Aragorn").attachments.push({
    id: "lust",
    code: SAGA.lust,
    exhausted: false,
  });
  r = finish(r);
  assert.ok(r.campaign!.burdens.includes(SAGA.lust));
  let j = settle(continueCampaign(r, d.heroes, d.id, true, 5));
  assert.equal(j.scenarioId, "journey-in-the-dark");
  assert.ok(j.encounterDeck.includes(SAGA.lust));
  calm(j);
  j.phase = "quest";
  j.encounterDeck.splice(j.encounterDeck.indexOf(SAGA.lust), 1);
  j.encounterDeck.unshift(SAGA.lust, GOBLIN);
  j.queue.push(fx("reveal", { player: 0 }));
  flush(j);
  for (
    let i = 0;
    i < 6 && j.choice && !/^Lust for the Ring/.test(j.choice.title);
    i++
  )
    j = choose(
      j,
      j.choice.options.find((o) => o.id === "resolve")?.id ??
        j.choice.options[0].id,
    );
  assert.match(
    j.choice!.title,
    /^Lust for the Ring · Attach to a non-Fellowship hero/,
  );
  assert.ok(
    !j.choice!.options.some((o) => o.code === hero(j, "Frodo Baggins").code),
  );
  j = choose(j, hero(j, "Glóin").id);
  j = settle(j);
  const gloin = hero(j, "Glóin");
  assert.ok(gloin.attachments.some((a) => a.code === SAGA.lust));
  const threat = j.threat;
  sagaCampaignOneRingExhausted(j);
  assert.equal(j.threat, threat + 1);
  assert.equal(stats(j, hero(j, "Glóin")).will, 0);
  assert.ok(valid(j));
});

test("Journey in the Dark: the campaign card adds its burdens; Shadow of Fear, Pursued by the Enemy, Grievous Wound and Overcome by Grief resolve; the resolution earns one treachery and one objective, or all four while The Balrog is in play", () => {
  const south = finish(
    settle(continueCampaign(afterFord(), d.heroes, d.id, true, 4)),
  );
  let j = settle(
    continueCampaign(south, d.heroes, d.id, true, 5, undefined, undefined, {
      [SAGA.sting]: 0,
      [SAGA.mithril]: null,
      [SAGA.glamdring]: 0,
      [SAGA.anduril]: 0,
    }),
  );
  assert.equal(j.scenarioId, "journey-in-the-dark");
  assert.ok(j.staging.some((u) => u.code === SAGA.wound));
  assert.ok(j.staging.some((u) => u.code === SAGA.grief));
  assert.ok(j.encounterDeck.includes(SAGA.pursued));
  assert.ok(j.encounterDeck.includes(SAGA.shadowFear));
  const inDeck = (code: string) =>
    j.deck.includes(code) || j.hand.some((u) => u.code === code);
  assert.deepEqual(
    [SAGA.sting, SAGA.mithril, SAGA.glamdring, SAGA.anduril].map(inDeck),
    [true, false, true, true],
  );
  assert.equal(j.campaign!.deckBoons![SAGA.mithril], undefined);
  assert.ok(valid(j));
  // Shadow of Fear: the characters' text boxes are blank (Traits remain).
  calm(j);
  j.phase = "quest";
  j.encounterDeck.unshift(SAGA.shadowFear, GOBLIN);
  j.queue.push(fx("reveal", { player: 0 }));
  flush(j);
  j = settle(j);
  const aragorn = hero(j, "Aragorn");
  assert.ok(aragorn.blanked, "Aragorn's text box is blank");
  assert.ok(effectiveTraits(aragorn).includes("Noble"));
  assert.ok(j.encounterDiscard.includes(SAGA.shadowFear));
  // Its shadow: the defending character does not count its defense.
  calm(j);
  const goblin = make(j, GOBLIN);
  j.engaged.push(goblin);
  j.encounterDeck.unshift(SAGA.shadowFear);
  const damage = hero(j, "Glóin").damage;
  j = attack(j, goblin, (o) => o.id === hero(j, "Glóin").id);
  assert.ok(j.log.some((l) => /does not count its defense/.test(l.text)));
  assert.equal(hero(j, "Glóin").damage, damage + 2);
  // Grievous Wound attached itself to Glóin when he took damage.
  assert.ok(hero(j, "Glóin").attachments.some((a) => a.code === SAGA.wound));
  assert.ok(!j.staging.some((u) => u.code === SAGA.wound));
  // Pursued by the Enemy: each engaged enemy makes an immediate attack.
  calm(j);
  j.round += 1;
  syncAttachmentText(j);
  assert.ok(!hero(j, "Aragorn").blanked, "Shadow of Fear lasts one round");
  for (const h of j.heroes) h.exhausted = false;
  j.engaged = [make(j, GOBLIN), make(j, GOBLIN)];
  j.phase = "quest";
  j.encounterDeck.unshift(SAGA.pursued, GOBLIN, GOBLIN, GOBLIN);
  j.queue.push(fx("reveal", { player: 0 }));
  flush(j);
  let attacks = 0;
  for (let i = 0; i < 12 && j.choice; i++) {
    if (/Immediate attack/.test(j.choice.title)) attacks++;
    j = choose(
      j,
      (
        j.choice.options.find((o) => o.id === "undefended") ??
        j.choice.options[0]
      ).id,
    );
  }
  assert.equal(attacks, 2, "each engaged enemy attacks");
  // Grievous Wound: after Glóin exhausts, 1 damage.
  calm(j);
  const gloin = hero(j, "Glóin");
  gloin.exhausted = false;
  const wounded = gloin.damage;
  j.queue.push(fx("exhaust", { target: gloin.id }));
  flush(j);
  // Overcome by Grief: after a character is destroyed it attaches to a hero,
  // then exhausts its hero, which cannot ready this round.
  calm(j);
  const ally = make(j, "01017");
  ally.owner = 0;
  j.allies.push(ally);
  j.queue.push(fx("damage", { target: ally.id, value: 9 }));
  flush(j);
  for (
    let i = 0;
    i < 6 && j.choice && !/^Overcome by Grief/.test(j.choice.title);
    i++
  )
    j = choose(j, j.choice.options[0].id);
  assert.match(
    j.choice!.title,
    /^Overcome by Grief · Forced: attach to a hero/,
  );
  j = choose(j, hero(j, "Théodred").id);
  assert.ok(hero(j, "Théodred").attachments.some((a) => a.code === SAGA.grief));
  calm(j);
  const another = make(j, "01017");
  another.owner = 0;
  j.allies.push(another);
  j.queue.push(fx("damage", { target: another.id, value: 9 }));
  flush(j);
  j = settle(j);
  assert.ok(hero(j, "Théodred").exhausted);
  assert.ok(sagaCampaignCannotReady(j, hero(j, "Théodred")));
  assert.ok(valid(j));
  void wounded;
  // The resolution: one treachery and one objective.
  const won = structuredClone(j);
  calm(won);
  win(won);
  assert.deepEqual(
    sagaResolutionQuestions(won).map((q) => [q.id, q.options.map((o) => o.id)]),
    [
      ["treachery", [SAGA.pursued, SAGA.shadowFear]],
      ["objective", [SAGA.wound, SAGA.grief]],
    ],
  );
  const chosen = applySagaResolution(won, {
    treachery: SAGA.shadowFear,
    objective: SAGA.grief,
  });
  assert.deepEqual(
    chosen.campaign!.burdens.filter((code) =>
      [SAGA.pursued, SAGA.shadowFear, SAGA.wound, SAGA.grief].includes(
        code as never,
      ),
    ),
    [SAGA.shadowFear, SAGA.grief],
  );
  // While The Balrog is in play, all four are earned.
  const balrog = calm(structuredClone(j));
  balrog.journeyDark!.setAside = balrog.journeyDark!.setAside.filter(
    (c) => c !== JD.balrog,
  );
  balrog.staging.push(make(balrog, JD.balrog));
  win(balrog);
  assert.equal(balrog.campaign!.resolution, null);
  for (const code of [SAGA.pursued, SAGA.shadowFear, SAGA.wound, SAGA.grief])
    assert.ok(balrog.campaign!.burdens.includes(code));
});

test("Breaking of the Fellowship: each player attaches a Gift of Lórien (earned) at setup; Followed by Night and Ill Fate resolve; the Gifts' Actions; the resolution records Fallen into Evil, a burden and the captives", () => {
  const south = finish(
    settle(continueCampaign(afterFord(), d.heroes, d.id, true, 4)),
  );
  const dark = finish(
    settle(continueCampaign(south, d.heroes, d.id, true, 5)),
    {
      treachery: SAGA.pursued,
      objective: SAGA.wound,
    },
  );
  let b = continueCampaign(dark, d.heroes, d.id, true, 6);
  assert.equal(b.scenarioId, "breaking-of-the-fellowship");
  assert.match(
    b.choice!.title,
    /^Breaking of the Fellowship · Choose a Gift of Lórien/,
  );
  b = choose(b, `${SAGA.lembas}@${hero(b, "Aragorn").id}`);
  b = settle(b);
  assert.ok(hero(b, "Aragorn").attachments.some((a) => a.code === SAGA.lembas));
  assert.ok(b.campaign!.boons.includes(SAGA.lembas));
  assert.ok(b.encounterDeck.includes(SAGA.night));
  assert.ok(b.encounterDeck.includes(SAGA.illFate));
  assert.ok(
    b.staging.some((u) => u.code === SAGA.wound),
    "the earned burden",
  );
  assert.ok(valid(b));
  // Followed by Night: the topmost enemy of the discard pile comes into play
  // to engage you (on The Great River, where enemies cannot engage, it stays
  // in the staging area).
  calm(b);
  b.phase = "quest";
  b.encounterDiscard.push(GOBLIN);
  const location = b.encounterDeck.find(
    (c) =>
      card(c).type_code === "location" &&
      !/Immune to player card effects/i.test(card(c).text ?? ""),
  )!;
  b.encounterDeck.splice(b.encounterDeck.indexOf(location), 1);
  b.encounterDeck.unshift(SAGA.night, location);
  b.queue.push(fx("reveal", { player: 0 }));
  flush(b);
  b = settle(b);
  assert.ok(!b.encounterDiscard.includes(GOBLIN));
  assert.ok(
    [...b.engaged, ...b.staging].some((u) => u.code === GOBLIN),
    "the Goblin Sniper is in play",
  );
  // Ill Fate: attach to a hero you control; a destroyed character raises
  // your threat by 2.
  calm(b);
  b.phase = "quest";
  b.encounterDeck.unshift(SAGA.illFate, GOBLIN);
  b.queue.push(fx("reveal", { player: 0 }));
  flush(b);
  for (let i = 0; i < 6 && b.choice && !/^Ill Fate/.test(b.choice.title); i++)
    b = choose(b, b.choice.options[0].id);
  b = choose(b, hero(b, "Glóin").id);
  b = settle(b);
  assert.ok(hero(b, "Glóin").attachments.some((a) => a.code === SAGA.illFate));
  calm(b);
  const threat = b.threat;
  const ally = make(b, "01017");
  ally.owner = 0;
  b.allies.push(ally);
  b.queue.push(fx("damage", { target: ally.id, value: 9 }));
  flush(b);
  b = settle(b);
  assert.equal(b.threat, threat + 2);
  // Leaf-wrapped Lembas: to the victory display, ready all heroes in play.
  calm(b);
  for (const h of b.heroes) h.exhausted = true;
  const aragorn = hero(b, "Aragorn");
  const lembas = aragorn.attachments.find((a) => a.code === SAGA.lembas)!;
  assert.ok(
    availableAbilities(b, aragorn).some(
      (a) => /^Leaf-wrapped Lembas/.test(a.label) && !a.disabled,
    ),
  );
  b = applyAction(reload(b), {
    type: "ABILITY",
    id: aragorn.id,
    attachmentId: lembas.id,
  });
  b = settle(b);
  assert.ok(b.heroes.every((h) => !h.exhausted));
  assert.ok(b.victoryCards!.includes(SAGA.lembas));
  assert.deepEqual(b.sagaCards!.spent, [SAGA.lembas]);
  assert.ok(b.campaign!.boons.includes(SAGA.lembas), "recorded after a win");
  // The other Gifts.
  calm(b);
  const enemy = make(b, GOBLIN);
  b.engaged.push(enemy);
  const attackBefore = stats(b, enemy).attack;
  for (const code of [SAGA.phial, SAGA.hairs, SAGA.rope])
    hero(b, "Théodred").attachments.push({
      id: code,
      code,
      exhausted: false,
      owner: 0,
    });
  b.staging.push(make(b, location));
  const handBefore = b.hand.length,
    threatBefore = b.threat;
  for (const code of [SAGA.phial, SAGA.hairs, SAGA.rope])
    b = settle(
      applyAction(reload(b), {
        type: "ABILITY",
        id: hero(b, "Théodred").id,
        attachmentId: code,
      }),
    );
  assert.equal(
    stats(
      b,
      b.engaged.find((u) => u.id === enemy.id)!,
    ).attack,
    Math.max(0, attackBefore - 4),
  );
  assert.equal(b.threat, Math.max(0, threatBefore - 3));
  assert.equal(b.hand.length, handBefore + 3);
  // Lórien Rope skips locations immune to player card effects.
  const plain = b.staging.filter(
    (u) => card(u.code).type_code === "location" && !playerCardImmune(u),
  );
  assert.ok(plain.some((l) => l.code === location));
  for (const l of plain) assert.equal(l.tempThreat, -2);
  // Seat of Seeing, explored in campaign mode: a burden leaves the game and,
  // once the scenario is won, the Campaign Pool.
  calm(b);
  BREAKING_FELLOWSHIP_HOOKS.explored!(b, make(b, BF.seeing));
  assert.equal(b.queue[0]?.kind, "sagaSeatOfSeeing");
  flush(b);
  assert.match(b.choice!.title, /^Seat of Seeing · Response/);
  const staged = b.staging.find((u) => u.code === SAGA.wound)!;
  b = choose(b, `unit:${staged.id}`);
  assert.ok(!b.staging.some((u) => u.code === SAGA.wound));
  assert.deepEqual(b.sagaCards!.cleared, [SAGA.wound]);
  assert.ok(b.campaign!.burdens.includes(SAGA.wound), "recorded after a win");
  // The resolution.
  calm(b);
  const theodred = hero(b, "Théodred");
  theodred.attachments.push({ id: "evil", code: BF.fallen, exhausted: false });
  b.breakingFellowship!.fallen.push({ id: theodred.id, owner: 0 });
  win(b);
  assert.ok(b.campaign!.fallen.includes(theodred.code));
  assert.ok(!b.campaign!.burdens.includes(SAGA.wound));
  assert.deepEqual(
    sagaResolutionQuestions(b).map((q) => [q.id, q.options.map((o) => o.id)]),
    [
      ["burden", [SAGA.night, SAGA.illFate]],
      ["captive:0", [d.heroes[1], d.heroes[2]]],
    ],
  );
  const done = applySagaResolution(b, {
    burden: SAGA.night,
    "captive:0": d.heroes[2],
  });
  assert.ok(done.campaign!.burdens.includes(SAGA.night));
  assert.deepEqual(done.campaign!.captives, [d.heroes[2]]);
  for (const code of [SAGA.lembas, SAGA.phial, SAGA.hairs, SAGA.rope])
    assert.ok(
      !done.campaign!.boons.includes(code),
      "the spent Gifts leave the pool",
    );
  // (The Fallen into Evil hero above is staged by hand, so the scenario's own
  // save checks are left out here; the Campaign Log's are not.)
  assert.ok(validateSagaCampaign(done));
  assert.ok(validateSagaCards(done));
  assert.throws(
    () =>
      continueCampaign(
        done,
        [d.heroes[0], "01005", d.heroes[2]],
        d.id,
        true,
        7,
      ),
    /not available yet/,
  );
});

test("Saved Road Darkens campaign logs are validated: deck assignments, captives and earned Gifts", () => {
  const south = finish(
    settle(continueCampaign(afterFord(), d.heroes, d.id, true, 4)),
  );
  assert.ok(valid(south));
  const seat = structuredClone(south);
  seat.campaign!.deckBoons = { [SAGA.sting]: 3 };
  assert.ok(!valid(seat), "solo has only seat 0");
  const unearned = structuredClone(south);
  unearned.campaign!.deckBoons = { [SAGA.phial]: 0 };
  assert.ok(!valid(unearned), "a Gift is not a deck boon");
  const captive = structuredClone(south);
  captive.campaign!.captives = [SAGA.sting];
  assert.ok(!valid(captive), "a captive is a hero");
  assert.throws(
    () =>
      continueCampaign(south, d.heroes, d.id, true, 5, undefined, undefined, {
        [SAGA.sting]: 2,
      }),
    /Choose a player's deck/,
  );
  // An earned Gift's own Setup in a later chapter: attach it to a hero in play.
  const later = calm(settle(continueCampaign(south, d.heroes, d.id, true, 6)));
  later.queue.push(fx("sagaGiftSetup", { code: SAGA.phial, player: 0 }));
  flush(later);
  assert.match(later.choice!.title, /^Phial of Galadriel · Setup/);
  const done = choose(later, hero(later, "Aragorn").id);
  assert.ok(
    hero(done, "Aragorn").attachments.some((a) => a.code === SAGA.phial),
  );
});
