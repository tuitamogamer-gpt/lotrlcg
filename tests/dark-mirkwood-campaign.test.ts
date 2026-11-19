import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { card, STARTERS } from "../src/game/cards";
import { discardCharacter, engage, win } from "../src/game/board";
import { flush } from "../src/game/effects";
import { make } from "../src/game/core";
import {
  applyAction,
  availableAbilities,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { continueCampaign, newCampaign } from "../src/game/campaign";
import { hasResourceIcon } from "../src/game/expansion-passives";
import { seatView } from "../src/game/table";
import {
  ADAPTATIONS,
  DOM,
  MIRKWOOD_PATHS_ORDER,
  adaptationUsed,
  applyMirkwoodResolution,
  darkMirkwoodAbilityProblem,
  darkMirkwoodCampaignStatus,
  darkMirkwoodRoundEnd,
  darkMirkwoodShadow,
  mirkwoodLegacy,
  mirkwoodPart,
  mirkwoodResolutionQuestions,
  nextMirkwoodChapter,
} from "../src/game/dark-mirkwood-campaign";
import { OATH } from "../src/game/the-oath-support";
import type { CampaignState, GameState, Unit } from "../src/game/types";
import art from "./dark-mirkwood-campaign-art.json";

const d = STARTERS[0];
const reload = (s: GameState) => restoreSave(JSON.parse(JSON.stringify(s)))!;
const choose = (s: GameState, id: string) =>
  applyAction(reload(s), { type: "CHOOSE", id });
const valid = (s: GameState) => validateSave(JSON.parse(JSON.stringify(s)));
function calm(s: GameState, phase: GameState["phase"] = "planning") {
  Object.assign(s, { phase, choice: null, queue: [] });
  if (s.flow) s.flow.pending = null;
  return s;
}
/** Every seat keeps its hand and the setup choices resolve (`pick` may answer one). */
function opening(
  s: GameState,
  pick: (s: GameState) => string | undefined = () => undefined,
) {
  for (let i = 0; i < 160; i++) {
    if (s.choice) s = choose(s, pick(s) ?? s.choice.options[0].id);
    else if (s.flow?.pending)
      s = applyAction(reload(s), {
        type: "CONTINUE",
        stepId: s.flow.pending.id,
      });
    else if (s.phase === "setup") s = applyAction(reload(s), { type: "KEEP" });
    else break;
  }
  return s;
}
/** Answer an Adaptation choice with the given boon. */
const adaptation = (code: string) => (s: GameState) =>
  /Choose an Adaptation/.test(s.choice!.title) ? code : undefined;
const oath = (campaign?: CampaignState, seed = 5) =>
  createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "the-oath",
    playMode: "campaign",
    ...(campaign ? { campaign } : {}),
  });
/** The Core Set's three parts are recorded: Mendor survived. */
function afterCore(): CampaignState {
  const c = newCampaign(d.heroes);
  c.completed = (["mirkwood", "anduin", "dol-guldur"] as const).map(
    (scenarioId) => ({ scenarioId, score: 10, rounds: 6 }),
  );
  c.boons = ["rc132", "rc135"];
  c.burdens = ["rc136"];
  c.mendorSaved = true;
  return c;
}
/** The Oath is won with `tokens` on its campaign card and `code` chosen. */
function afterOath(tokens = 0, code = DOM.lore, campaign?: CampaignState) {
  const s = opening(oath(campaign), adaptation(code));
  s.darkMirkwood!.tokens = tokens;
  win(s);
  return s;
}
const caves = (campaign = afterOath().campaign!, seed = 5) =>
  createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "the-caves-of-nibin-dum",
    playMode: "campaign",
    campaign,
  });
const adaptationOf = (s: GameState, code: string) => {
  const hero = s.heroes.find((h) =>
    h.attachments.some((a) => a.code === code),
  )!;
  return { hero, a: hero.attachments.find((a) => a.code === code)! };
};
const use = (s: GameState, hero: Unit, attachmentId: string) =>
  applyAction(reload(s), { type: "ABILITY", id: hero.id, attachmentId });

test("The Dark of Mirkwood: its two campaign cards, boons and burdens are registered with their scans' texts, and every face is pinned", () => {
  const oathCard = card(DOM.oathCard);
  const cavesCard = card(DOM.cavesCard);
  assert.deepEqual(
    [oathCard.name, oathCard.subtitle, oathCard.position],
    ["The Oath", "Mirkwood Paths", 50],
  );
  // The first printing's Response is a Forced effect (the reprint and the
  // designer's ruling).
  assert.match(
    oathCard.text!,
    /^You are playing Campaign Mode\.\nSetup: Each player chooses 1 Adaptation boon attachment and attaches it to one of their heroes\. Shuffle the Stalking Goblin burden enemy into the encounter deck\. Add Stalking Goblin and each attached Adaptation to the Campaign Pool\.\nForced: At the end of each round, place 1 resource token here\.$/,
  );
  assert.match(
    oathCard.back_text!,
    /^Resolution: If there are 6 or more resource tokens here, the thought of the captured villagers suffering weighs heavily on you\. Add the Guilty Conscience treachery burden to the Campaign Pool\.$/,
  );
  assert.deepEqual(
    [cavesCard.name, cavesCard.subtitle, cavesCard.position],
    ["The Caves of Nibin-Dûm", "Mirkwood Paths", 51],
  );
  assert.match(
    cavesCard.text!,
    /Each player adds 1 copy of the "No Time to Waste!" boon to their hand after drawing their starting hand \(including taking a mulligan\)\./,
  );
  assert.match(
    cavesCard.back_text!,
    /If it is under 40, you have rescued a retired Ranger who shares his wisdom with you\. Each player may add 1 copy of Ranger Sense to their deck and to the Campaign Pool\. At the start of your next campaign, each player may also shuffle 1 copy of Ranger Sense into their deck and add it to the Campaign Pool\.$/,
  );
  // The scan corrects the catalog: Stalking Goblin's engagement cost.
  const goblin = card(DOM.stalking);
  assert.deepEqual(
    [
      goblin.type_code,
      goblin.sphere_code,
      goblin.engagement,
      goblin.threat,
      goblin.attack,
      goblin.defense,
      goblin.health,
      goblin.traits,
    ],
    ["enemy", "burden", 10, 2, 2, 2, 2, "Goblin. Orc."],
  );
  assert.match(
    goblin.text!,
    /\nShadow: Add Stalking Goblin to the staging area\.$/,
  );
  assert.match(card(DOM.shiny).text!, /^Surge\. Doomed 1\./);
  assert.match(
    card(DOM.guilty).text!,
    /^Surge\.\nWhen Revealed: Attach to the hero with the highest threat cost\./,
  );
  assert.deepEqual(
    ADAPTATIONS.map((code) => [card(code).traits, card(code).cost]),
    Array(4).fill(["Adaptation.", "0"]),
  );
  assert.match(
    card(DOM.ranger).text!,
    /Remove Ranger Sense from the game and from the Campaign Pool to look at the top 4 cards of your deck\./,
  );
  assert.deepEqual(
    [card(DOM.noTime).quantity, card(DOM.ranger).quantity],
    [4, 4],
  );
  // 13 faces: both sides of each campaign card and the nine cards.
  assert.equal(art.length, 13);
  for (const code of [DOM.oathCard, DOM.cavesCard])
    assert.deepEqual(
      art.filter((a) => a.code === code).map((a) => a.face),
      ["front", "back"],
    );
  for (const a of art) {
    const bytes = readFileSync(
      new URL(`../public${a.localPath}`, import.meta.url),
    );
    assert.equal(bytes.length, a.bytes, a.localPath);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      a.sha256,
      a.localPath,
    );
  }
  // The campaign's burdens never join an ordinary game's encounter deck.
  for (const scenarioId of ["the-oath", "the-caves-of-nibin-dum"] as const) {
    const normal = createGame(5, d.cards, d.heroes, d.id, { scenarioId });
    assert.ok(
      ![DOM.stalking, DOM.shiny, DOM.guilty, DOM.oathCard, DOM.cavesCard].some(
        (code) => normal.encounterDeck.includes(code),
      ),
    );
  }
});

test("Mirkwood Paths continues with The Oath and The Caves of Nibin-Dûm as Parts 4 and 5; the mini campaign begins at The Oath with a blank Campaign Log", () => {
  assert.deepEqual(MIRKWOOD_PATHS_ORDER, [
    "mirkwood",
    "anduin",
    "dol-guldur",
    "the-oath",
    "the-caves-of-nibin-dum",
  ]);
  const mini = oath();
  assert.equal(mini.campaign!.mini, true);
  assert.equal(nextMirkwoodChapter(mini.campaign!), "the-oath");
  assert.equal(mirkwoodPart(mini.campaign!, "the-caves-of-nibin-dum"), 2);
  assert.ok(!mini.allies.some((u) => u.code === "rc135"), "no Mendor");
  assert.throws(
    () =>
      createGame(5, d.cards, d.heroes, d.id, {
        scenarioId: "the-caves-of-nibin-dum",
        playMode: "campaign",
      }),
    /begins in Mirkwood, or at The Oath/,
  );
  // Part 4: the Campaign Log of Parts 1–3 carries on.
  const s = oath(afterCore());
  assert.ok(!s.campaign!.mini);
  assert.equal(mirkwoodPart(s.campaign!, "the-oath"), 4);
  assert.deepEqual(
    darkMirkwoodCampaignStatus(calm(reload(s)))[0],
    "Mirkwood Paths · Part 4",
  );
  assert.ok(s.encounterDeck.includes("rc136"), "Ungoliant's Swarm");
  assert.ok(s.encounterDeck.includes(DOM.stalking), "Stalking Goblin");
  assert.equal(
    [...s.deck, ...s.hand.map((u) => u.code)].filter((c) => c === "rc132")
      .length,
    1,
    "Mendor's Support",
  );
  // A designer's ruling: Mendor, in the Campaign Pool, begins Parts 4 and 5
  // in play. Only Parts 1 and 2 are lost when he leaves play.
  const t = calm(reload(opening(s)));
  const mendor = t.allies.find((u) => u.code === "rc135")!;
  assert.ok(mendor);
  discardCharacter(t, mendor);
  assert.equal(t.status, "playing");
  assert.ok(t.removed.includes("rc135"));
  assert.ok(valid(t));
});

test("The Oath's setup: each player attaches a different Adaptation boon to one of their heroes, who gains its resource icon; Stalking Goblin is shuffled in, and a token is placed at the end of each round", () => {
  const seats = [
    { heroes: ["01005", "01006"], deckId: STARTERS[1].id },
    { heroes: ["01007", "01008"], deckId: STARTERS[2].id },
  ];
  let two = createGame(8, STARTERS[1].cards, seats[0].heroes, seats[0].deckId, {
    scenarioId: "the-oath",
    playMode: "campaign",
    seats,
  });
  assert.ok(two.encounterDeck.includes(DOM.stalking));
  const offered: string[][] = [];
  two = opening(two, (s) => {
    if (!/Choose an Adaptation/.test(s.choice!.title)) return undefined;
    offered.push(s.choice!.options.map((o) => o.id));
    return offered.length === 1 ? DOM.spirit : undefined;
  });
  assert.deepEqual(offered, [
    ADAPTATIONS,
    ADAPTATIONS.filter((code) => code !== DOM.spirit),
  ]);
  const chosen = two.darkMirkwood!.adaptations!;
  assert.deepEqual(Object.keys(chosen).sort(), [DOM.lore, DOM.spirit].sort());
  for (const [code, seat] of Object.entries(chosen)) {
    const hero = seatView(two, seat).heroes.find((h) =>
      h.attachments.some((a) => a.code === code),
    )!;
    assert.ok(hero, `${card(code).name} on a hero of seat ${seat}`);
    const sphere = card(code).text!.match(/\[(\w+)\] resource icon/)![1];
    assert.ok(
      hasResourceIcon(hero, sphere),
      `${card(hero.code).name} gains ${sphere}`,
    );
  }
  assert.ok(valid(two));
  // "Forced: At the end of each round, place 1 resource token here."
  const s = calm(reload(opening(oath(), adaptation(DOM.tactics))), "refresh");
  for (let round = 0; round < 3; round++) {
    s.queue.push(...darkMirkwoodRoundEnd(s));
    flush(s);
  }
  assert.equal(s.darkMirkwood!.tokens, 3);
  assert.match(darkMirkwoodCampaignStatus(s)[1], /Resource tokens: 3/);
});

test("The Oath's resolution: Stalking Goblin and the Adaptations join the Campaign Pool, and 6 or more tokens add Guilty Conscience", () => {
  const few = afterOath(5, DOM.tactics);
  const c = few.campaign!;
  assert.deepEqual(
    c.completed.map((q) => q.scenarioId),
    ["the-oath"],
  );
  assert.deepEqual(c.burdens, [DOM.stalking]);
  assert.deepEqual(c.boons, [DOM.tactics]);
  assert.deepEqual(c.adaptations, { [DOM.tactics]: 0 });
  assert.ok(valid(few));
  const many = afterOath(6, DOM.tactics);
  assert.deepEqual(many.campaign!.burdens, [DOM.stalking, DOM.guilty]);
  assert.ok(valid(many));
  // The log keeps no Adaptation without the player it belongs to.
  const bad = structuredClone(many);
  delete bad.campaign!.adaptations;
  assert.ok(!valid(bad));
  const order = structuredClone(many);
  order.campaign!.completed[0].scenarioId = "the-caves-of-nibin-dum";
  assert.ok(!valid(order));
});

test("The Caves of Nibin-Dûm's setup: the Campaign Pool's burdens and Shiny Distraction are shuffled in, the Adaptation returns to a hero, and \"No Time to Waste!\" joins each starting hand through a mulligan", () => {
  const c = afterOath(6, DOM.leadership).campaign!;
  let s = caves(c);
  // The setup's choices resolve before the opening hand is kept.
  for (let i = 0; i < 20 && (s.choice || s.flow?.pending); i++)
    s = s.choice
      ? choose(s, s.choice.options[0].id)
      : applyAction(reload(s), {
          type: "CONTINUE",
          stepId: s.flow!.pending!.id,
        });
  for (const code of [DOM.stalking, DOM.guilty, DOM.shiny])
    assert.equal(
      s.encounterDeck.filter((x) => x === code).length,
      1,
      card(code).name,
    );
  const noTime = s.hand.find((u) => u.code === DOM.noTime)!;
  assert.ok(noTime);
  s = applyAction(reload(s), { type: "MULLIGAN" });
  assert.ok(
    s.hand.some((u) => u.id === noTime.id),
    "kept through a mulligan",
  );
  assert.equal(s.hand.length, 7);
  s = opening(s);
  assert.ok(adaptationOf(s, DOM.leadership).hero, "The Secret of Leadership");
  assert.deepEqual(s.darkMirkwood!.noTime, [0]);
  assert.ok(valid(s));
});

test("The Adaptations' Actions: each is used once per campaign, recorded in the Campaign Log when the scenario is won", () => {
  // The Fervor of Lore: discard 3 cards to heal all damage from a hero.
  let s = calm(reload(opening(oath(), adaptation(DOM.lore))));
  let { hero, a } = adaptationOf(s, DOM.lore);
  assert.match(
    darkMirkwoodAbilityProblem(s, hero, a.id)!,
    /No hero has damage/,
  );
  s.heroes[1].damage = 3;
  s.hand = s.hand.slice(0, 4);
  assert.ok(
    availableAbilities(s, hero).some(
      (x) => /The Fervor of Lore/.test(x.label) && !x.disabled,
    ),
  );
  s = use(s, hero, a.id);
  for (let i = 0; i < 3; i++) s = choose(s, s.choice!.options[0].id);
  s = choose(s, s.heroes[1].id);
  assert.equal(s.heroes[1].damage, 0);
  assert.equal(s.hand.length, 1);
  assert.equal(s.discard.length, 3);
  assert.ok(adaptationUsed(s, DOM.lore));
  ({ hero, a } = adaptationOf(s, DOM.lore));
  assert.match(darkMirkwoodAbilityProblem(s, hero, a.id)!, /already used/);
  win(s);
  assert.deepEqual(s.campaign!.adaptationsUsed, [DOM.lore]);
  // The next chapter remembers it.
  const next = calm(reload(opening(caves(s.campaign!))));
  ({ hero, a } = adaptationOf(next, DOM.lore));
  assert.match(darkMirkwoodAbilityProblem(next, hero, a.id)!, /already used/);
  assert.ok(valid(next));

  // The Might of Tactics: 1 damage to the attached hero, 3 to an engaged enemy.
  s = calm(reload(opening(oath(), adaptation(DOM.tactics))));
  ({ hero, a } = adaptationOf(s, DOM.tactics));
  assert.match(
    darkMirkwoodAbilityProblem(s, hero, a.id)!,
    /No enemy is engaged/,
  );
  const enemy = make(s, OATH.troop);
  s.engaged.push(enemy);
  s = use(s, hero, a.id);
  s = choose(s, enemy.id);
  assert.equal(s.heroes.find((h) => h.id === hero.id)!.damage, 1);
  assert.equal(s.engaged.find((e) => e.id === enemy.id)!.damage, 3);

  // The Power of Spirit: exhaust the attached hero, 3 progress on a location.
  s = calm(reload(opening(oath(), adaptation(DOM.spirit))));
  ({ hero, a } = adaptationOf(s, DOM.spirit));
  // Goblin Trail has 6 quest points.
  const location = make(s, OATH.trail);
  s.staging.push(location);
  s = use(s, hero, a.id);
  s = choose(s, location.id);
  assert.ok(s.heroes.find((h) => h.id === hero.id)!.exhausted);
  assert.equal(s.staging.find((u) => u.id === location.id)!.progress, 3);

  // The Secret of Leadership: spend 1 resource from the attached hero to ready a hero.
  s = calm(reload(opening(oath(), adaptation(DOM.leadership))));
  ({ hero, a } = adaptationOf(s, DOM.leadership));
  s.heroes.find((h) => h.id === hero.id)!.resources = 1;
  assert.match(
    darkMirkwoodAbilityProblem(s, hero, a.id)!,
    /No hero is exhausted/,
  );
  const tired = s.heroes.find((h) => h.id !== hero.id)!;
  tired.exhausted = true;
  s = use(s, hero, a.id);
  s = choose(s, tired.id);
  assert.ok(!s.heroes.find((h) => h.id === tired.id)!.exhausted);
  assert.equal(s.heroes.find((h) => h.id === hero.id)!.resources, 0);
  assert.ok(valid(s));
});

test("Stalking Goblin: after it engages a player, a Goblin Sniper comes from the encounter deck, the discard pile or the collection, and its shadow adds it to the staging area", () => {
  const s = calm(reload(opening(oath())), "encounter");
  const sniper = (st: GameState) =>
    st.staging.filter((u) => card(u.code).name === "Goblin Sniper").length;
  const fromDeck = s.encounterDeck.filter(
    (c) => card(c).name === "Goblin Sniper",
  ).length;
  assert.ok(fromDeck > 0);
  let t = structuredClone(s);
  let goblin = make(t, DOM.stalking);
  t.staging.push(goblin);
  engage(t, goblin);
  flush(t);
  assert.equal(sniper(t), 1);
  assert.equal(
    t.encounterDeck.filter((c) => card(c).name === "Goblin Sniper").length,
    fromDeck - 1,
  );
  // The discard pile, then the collection.
  t = structuredClone(s);
  t.encounterDiscard.push(
    ...t.encounterDeck.filter((c) => card(c).name === "Goblin Sniper"),
  );
  t.encounterDeck = t.encounterDeck.filter(
    (c) => card(c).name !== "Goblin Sniper",
  );
  goblin = make(t, DOM.stalking);
  t.staging.push(goblin);
  engage(t, goblin);
  flush(t);
  assert.equal(sniper(t), 1);
  assert.equal(
    t.encounterDiscard.filter((c) => card(c).name === "Goblin Sniper").length,
    fromDeck - 1,
  );
  t.encounterDiscard = t.encounterDiscard.filter(
    (c) => card(c).name !== "Goblin Sniper",
  );
  goblin = make(t, DOM.stalking);
  t.staging.push(goblin);
  engage(t, goblin);
  flush(t);
  assert.equal(sniper(t), 2, "the collection's copy");
  assert.ok(valid(t));
  // "Shadow: Add Stalking Goblin to the staging area."
  const u = structuredClone(s);
  const attacker = make(u, OATH.troop);
  attacker.shadows.push(DOM.stalking);
  u.engaged.push(attacker);
  u.combat = { enemyId: attacker.id, attackBonus: 0 } as GameState["combat"];
  assert.ok(darkMirkwoodShadow(u, DOM.stalking));
  assert.ok(u.staging.some((x) => x.code === DOM.stalking));
  assert.deepEqual(attacker.shadows, []);
});

test("Shiny Distraction and Guilty Conscience: resources for 5 threat, and a burden on the hero with the highest threat cost that raises threat each round until 2 resources discard it", () => {
  let s = calm(reload(opening(caves())), "quest");
  s.encounterDeck.unshift(DOM.shiny, "01087");
  const threat = s.threat;
  s = applyAction(reload(s), { type: "COMMIT" });
  for (
    let i = 0;
    i < 20 && s.choice && !/Shiny Distraction/.test(s.choice.title);
    i++
  )
    s = choose(s, s.choice.options[0].id);
  assert.match(s.choice!.title, /Shiny Distraction/);
  const resources = s.heroes.map((h) => h.resources);
  s = choose(s, "take");
  assert.deepEqual(
    s.heroes.map((h) => h.resources),
    resources.map((r) => r + 1),
  );
  assert.ok(s.threat >= threat + 5, "threat +5 (and doomed 1)");
  assert.ok(s.encounterDiscard.includes(DOM.shiny));

  // Guilty Conscience: Aragorn (12) has the highest threat cost.
  let t = calm(reload(opening(caves())), "quest");
  t.encounterDeck.unshift(DOM.guilty, "01087");
  t = applyAction(reload(t), { type: "COMMIT" });
  for (let i = 0; i < 20 && t.choice; i++)
    t = choose(t, t.choice.options[0].id);
  const top = Math.max(...t.heroes.map((h) => card(h.code).threat ?? 0));
  const host = t.heroes.find((h) =>
    h.attachments.some((a) => a.code === DOM.guilty),
  )!;
  assert.equal(card(host.code).threat, top);
  t = calm(t, "refresh");
  const before = t.threat;
  t.queue.push(...darkMirkwoodRoundEnd(t));
  flush(t);
  assert.equal(t.threat, before + 2);
  const guilty = host.attachments.find((a) => a.code === DOM.guilty)!;
  const h = t.heroes.find((x) => x.id === host.id)!;
  h.resources = 1;
  assert.match(
    darkMirkwoodAbilityProblem(t, h, guilty.id)!,
    /needs 2 resources/,
  );
  h.resources = 2;
  t = use(t, h, guilty.id);
  assert.ok(
    !t.heroes
      .find((x) => x.id === host.id)!
      .attachments.some((a) => a.code === DOM.guilty),
  );
  assert.ok(t.encounterDiscard.includes(DOM.guilty));
  assert.equal(t.heroes.find((x) => x.id === host.id)!.resources, 0);
  assert.ok(valid(t));
});

test('"No Time to Waste!": a Quest Action that either leaves the game and the Campaign Pool to reduce each player\'s threat by 3 and reveal an encounter card, or draws a card', () => {
  let s = calm(reload(opening(caves())));
  const card0 = s.hand.find((u) => u.code === DOM.noTime)!;
  assert.throws(
    () => applyAction(reload(s), { type: "PLAY", id: card0.id }),
    /Quest Action/,
  );
  s = calm(s, "quest");
  s.threat = 30;
  s.encounterDeck.unshift("01087");
  s = applyAction(reload(s), { type: "PLAY", id: card0.id });
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["remove", "draw"],
  );
  s = choose(s, "remove");
  for (let i = 0; i < 10 && s.choice; i++)
    s = choose(s, s.choice.options[0].id);
  assert.equal(s.threat, 27);
  assert.ok(s.removed.includes(DOM.noTime));
  assert.ok(
    s.staging.some((u) => u.code === "01087"),
    "the revealed card",
  );
  assert.deepEqual(s.darkMirkwood!.noTimeSpent, [0]);
  assert.ok(valid(s));
  win(s);
  assert.deepEqual(s.campaign!.noTimeToWaste, []);
  // The other option draws a card; the copy stays in the Campaign Pool.
  let t = calm(reload(opening(caves())), "quest");
  const other = t.hand.find((u) => u.code === DOM.noTime)!;
  const hand = t.hand.length;
  t = applyAction(reload(t), { type: "PLAY", id: other.id });
  t = choose(t, "draw");
  assert.equal(t.hand.length, hand);
  assert.ok(t.discard.includes(DOM.noTime));
  t.threat = 41;
  win(t);
  assert.deepEqual(t.campaign!.noTimeToWaste, [0]);
});

test("The Caves of Nibin-Dûm's resolution: under 40 threat rescues the Ranger, each player may add Ranger Sense, the campaign is complete, and Ranger Sense joins the next campaign", () => {
  const high = calm(reload(opening(caves())));
  high.threat = 40;
  win(high);
  assert.ok(!high.campaign!.rangerRescued);
  assert.equal(high.campaign!.resolution, undefined);
  assert.throws(() => continueCampaign(high), /The campaign is complete/);
  const s = calm(reload(opening(caves())));
  s.threat = 39;
  win(s);
  assert.equal(s.campaign!.resolution, "the-caves-of-nibin-dum");
  assert.deepEqual(
    mirkwoodResolutionQuestions(s).map((q) => q.id),
    ["ranger-0"],
  );
  assert.throws(() => continueCampaign(s), /The campaign is complete/);
  const done = applyMirkwoodResolution(s, { "ranger-0": "add" });
  assert.deepEqual(done.campaign!.rangerSense, [0]);
  assert.equal(done.campaign!.resolution, null);
  assert.deepEqual(mirkwoodLegacy(done.campaign), {
    mendor: false,
    ranger: true,
  });
  assert.ok(valid(done));
  // "At the start of your next campaign, each player may also shuffle 1 copy
  // of Ranger Sense into their deck and add it to the Campaign Pool."
  const saga = createGame(11, d.cards, d.heroes, d.id, {
    scenarioId: "a-shadow-of-the-past",
    playMode: "campaign",
    rangerLegacy: [0],
  });
  assert.deepEqual(saga.campaign!.rangerSense, [0]);
  assert.equal(
    [...saga.deck, ...saga.hand.map((u) => u.code)].filter(
      (c) => c === DOM.ranger,
    ).length,
    1,
  );
  assert.ok(valid(saga));
  assert.throws(
    () =>
      createGame(11, d.cards, d.heroes, d.id, {
        scenarioId: "a-shadow-of-the-past",
        playMode: "campaign",
        rangerLegacy: [1],
      }),
    /Ranger Sense joins a new campaign/,
  );
});

test("Ranger Sense: an Action that either leaves the game and the Campaign Pool to look at the top 4 cards, add 1 to the hand and put the rest back in any order, or draws a card", () => {
  let s = calm(
    reload(
      opening(
        createGame(11, d.cards, d.heroes, d.id, {
          scenarioId: "mirkwood",
          playMode: "campaign",
          rangerLegacy: [0],
        }),
      ),
    ),
  );
  let ranger = s.hand.find((u) => u.code === DOM.ranger);
  if (!ranger) {
    ranger = make(s, DOM.ranger);
    s.deck.splice(s.deck.indexOf(DOM.ranger), 1);
    s.hand.push(ranger);
  }
  s.deck = ["01050", "01073", "01051", "01063", ...s.deck.slice(4)];
  s = applyAction(reload(s), { type: "PLAY", id: ranger.id });
  s = choose(s, "remove");
  assert.deepEqual(
    s.choice!.options.map((o) => o.code),
    ["01050", "01073", "01051", "01063"],
  );
  s = choose(s, "take-1");
  assert.ok(s.hand.some((u) => u.code === "01073"));
  // The rest go back in the chosen order: 01063, 01050, then 01051.
  s = choose(s, "put-2");
  s = choose(s, "put-0");
  assert.deepEqual(s.deck.slice(0, 3), ["01063", "01050", "01051"]);
  assert.ok(s.removed.includes(DOM.ranger));
  win(s);
  assert.deepEqual(
    s.campaign!.rangerSense,
    [],
    "removed from the Campaign Pool",
  );
  assert.ok(valid(s));
});
