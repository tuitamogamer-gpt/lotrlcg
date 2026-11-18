import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { card, STARTERS } from "../src/game/cards";
import { damage, discardAttachment, win } from "../src/game/board";
import { canCommit } from "../src/game/actions";
import { rhosgobelHealingAllowed } from "../src/game/rhosgobel";
import { syncAttachmentText } from "../src/game/attachment-text";
import { DIKE } from "../src/game/deadmens-dike-support";
import { WASTES } from "../src/game/wastes-eriador-support";
import { THAURDIR_BURDENS } from "../src/game/angmar-campaign-support";
import { flush } from "../src/game/effects";
import { fx, make, stats } from "../src/game/core";
import {
  applyAction,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { continueCampaign } from "../src/game/campaign";
import {
  addQuestProgress,
  checkSideQuestDefeats,
} from "../src/game/side-quests";
import { CHETWOOD } from "../src/game/chetwood-support";
import {
  ANGMAR,
  ANGMAR_CAMPAIGN_CARDS,
  ANGMAR_CAMPAIGN_ORDER,
  ANGMAR_CAMPAIGN_SUPPORTED,
  angmarAmarthiulEntered,
  angmarCampaignAfterReveal,
  angmarCampaignStatus,
  angmarInnocent,
  angmarResolutionQuestions,
  applyAngmarResolution,
  angmarPendantShadowOptions,
  innocentLimit,
  newAngmarCampaign,
  SKILL_BOONS,
} from "../src/game/angmar-campaign";
import { seatView } from "../src/game/table";
import type { CampaignState, GameState, Unit } from "../src/game/types";
import art from "./angmar-campaign-art.json";

const d = STARTERS[0];
const HEROES = ["01005", "01006", d.heroes[2]];
const reload = (s: GameState) => restoreSave(JSON.parse(JSON.stringify(s)))!;
const choose = (s: GameState, id: string) =>
  applyAction(reload(s), { type: "CHOOSE", id });
const valid = (s: GameState) => validateSave(JSON.parse(JSON.stringify(s)));
function calm(s: GameState) {
  Object.assign(s, { phase: "planning", choice: null, queue: [] });
  if (s.flow) s.flow.pending = null;
  return s;
}
/** Resolve the setup choices, keep the hands and reach the first round. */
function opening(s: GameState) {
  for (let i = 0; i < 30 && s.choice; i++)
    s = choose(s, s.choice.options[0].id);
  s = applyAction(reload(s), { type: "KEEP" });
  for (let i = 0; i < 40 && (s.choice || s.flow?.pending); i++)
    s = applyAction(
      reload(s),
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : {
            type: "CHOOSE",
            id: (
              s.choice!.options.find((o) => o.id === "skip") ??
              s.choice!.options[0]
            ).id,
          },
    );
  return s;
}
const chetwood = (seed = 5, campaign = newAngmarCampaign(HEROES)) =>
  createGame(seed, d.cards, HEROES, d.id, {
    scenarioId: "intruders-in-chetwood",
    playMode: "campaign",
    campaign,
  });
/** The Campaign Log after Intruders in Chetwood. */
const afterChetwood = (
  innocent = 6,
  heroes = HEROES,
  seatHeroes?: number[],
): CampaignState => ({
  ...newAngmarCampaign(heroes, seatHeroes),
  burdens: [ANGMAR.innocent],
  innocent,
  completed: [{ scenarioId: "intruders-in-chetwood", score: 0, rounds: 1 }],
});
const weather = (seed = 5, campaign = afterChetwood()) =>
  createGame(seed, d.cards, HEROES, d.id, {
    scenarioId: "the-weather-hills",
    playMode: "campaign",
    campaign,
  });
/** Mysterious Omens, revealed into the staging area. */
function revealOmens(s: GameState) {
  s.encounterDeck = s.encounterDeck.filter((c) => c !== ANGMAR.omens);
  const omens = make(s, ANGMAR.omens);
  s.staging.push(omens);
  return omens;
}
/** An encounter deck's enemy, engaged with the player. */
function engage(s: GameState, code: string) {
  s.encounterDeck.splice(s.encounterDeck.indexOf(code), 1);
  const enemy = make(s, code);
  s.engaged.push(enemy);
  return enemy;
}
function attach(s: GameState, hero: Unit, code: string) {
  const id = `a${s.nextId++}`;
  hero.attachments.push({ id, code, exhausted: false });
  return id;
}

test("The Angmar Awakened campaign: Intruders in Chetwood's campaign card, Iârion's Pendant and Protect the Innocent are registered with the scans' texts, every face is pinned, and the campaign follows its nine chapters", () => {
  assert.equal(ANGMAR_CAMPAIGN_ORDER.length, 9);
  assert.deepEqual(ANGMAR_CAMPAIGN_SUPPORTED, [
    "intruders-in-chetwood",
    "the-weather-hills",
    "deadmens-dike",
  ]);
  const campaignCard = card(ANGMAR_CAMPAIGN_CARDS["intruders-in-chetwood"]!);
  assert.equal(campaignCard.subtitle, "Angmar Awakened Part 1");
  assert.match(
    campaignCard.text!,
    /^You are playing campaign mode\.\nSetup: Attach Iârion's Pendant to Iârion and add the Protect the Innocent side quest to the staging area\. Starting with the first player, each player may place 4 damage on Protect the Innocent to add 1 resource to each of their heroes' resource pools\.$/,
  );
  assert.match(
    campaignCard.back_text!,
    /^Resolution: Note the amount of damage on Protect the Innocent in the Campaign Log and add Protect the Innocent to the Campaign Pool\.$/,
  );
  const pendant = card(ANGMAR.pendant);
  assert.deepEqual(
    [pendant.is_unique, pendant.cost, pendant.victory, pendant.traits],
    [true, "1", 1, "Artifact. Item."],
  );
  const innocent = card(ANGMAR.innocent);
  assert.equal(innocent.type_code, "encounter-side-quest");
  assert.equal(innocent.quest, undefined, 'its quest points are "–"');
  assert.match(
    innocent.text!,
    /If Protect the Innocent has 10 or more damage on it \(20 or more damage if there are 3 or 4 players in the game\), the players lose the game\.$/,
  );
  assert.equal(innocent.back_name, "Arnor Ravaged");
  assert.match(
    innocent.back_text!,
    /^Setup: Add Arnor Ravaged to the staging area with damage on it equal to the amount of damage marked for it in the Campaign Log\./,
  );
  const weatherCard = card(ANGMAR_CAMPAIGN_CARDS["the-weather-hills"]!);
  assert.equal(weatherCard.subtitle, "Angmar Awakened Part 2");
  assert.match(
    weatherCard.text!,
    /^You are playing campaign mode\.\nSetup: Add the Mysterious Omens side quest to the Campaign Log and shuffle it into the encounter deck\. Add the Protect the Innocent side quest to the staging area and place damage on it equal to the amount of damage noted for it in the Campaign Log\.$/,
  );
  assert.match(
    weatherCard.back_text!,
    /^Resolution: Note the amount of damage on Protect the Innocent in the Campaign Log \(replacing the previous number\)\.$/,
  );
  const omens = card(ANGMAR.omens);
  assert.deepEqual(
    [omens.type_code, omens.quest, omens.victory],
    ["encounter-side-quest", 9, 5],
  );
  assert.match(
    omens.text!,
    /^Surge\.\nForced: After Mysterious Omens becomes the current quest, each player discards 1 random card from their hand\./,
  );
  assert.deepEqual(
    SKILL_BOONS.map((code) => [card(code).name, card(code).traits]),
    [
      ["Cunning", "Condition."],
      ["Hardy", "Condition."],
      ["Resolute", "Condition."],
      ["Ruthless", "Condition."],
      ["Stalwart", "Condition."],
    ],
  );
  for (const code of SKILL_BOONS)
    assert.match(card(code).text!, /^Permanent\.\nSetup: Attach to a hero\./);
  const dikeCard = card(ANGMAR_CAMPAIGN_CARDS["deadmens-dike"]!);
  assert.equal(dikeCard.subtitle, "Angmar Awakened Part 3");
  assert.match(
    dikeCard.text!,
    /\nForced: After Thaurdir enters play, randomly select one of the following burdens and attach it to Thaurdir: Thaurdir's Legacy, Thaurdir's Majesty, or Thaurdir's Spite\. Add that card to the Campaign Pool\.$/,
  );
  assert.match(
    dikeCard.back_text!,
    /The players as a group must select either Iârion's Pendant or Amarthiúl's Courage to add to the Campaign Pool\. Any player may add Iârion's Pendant to their deck if it is chosen\.$/,
  );
  assert.deepEqual(
    [ANGMAR.legacy, ANGMAR.majesty, ANGMAR.spite].map((code) => [
      card(code).name,
      card(code).type_code,
      card(code).traits,
    ]),
    [
      ["Thaurdir's Legacy", "objective", "Thaurdir."],
      ["Thaurdir's Majesty", "objective", "Thaurdir."],
      ["Thaurdir's Spite", "objective", "Thaurdir."],
    ],
  );
  assert.match(
    card(ANGMAR.courage).text!,
    /^Setup: Attach to Amarthiúl\. Otherwise, remove Amarthiúl's Courage from the game\./,
  );
  assert.equal(art.length, 19);
  for (const a of art) {
    const bytes = readFileSync(`public${a.localPath}`);
    assert.equal(bytes.length, a.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), a.sha256);
  }
  // A new campaign begins with Intruders in Chetwood; the Amarthiúl hero
  // waits for The Battle of Carn Dûm's campaign card.
  const fresh = createGame(5, d.cards, d.heroes, d.id, {
    scenarioId: "intruders-in-chetwood",
    playMode: "campaign",
  });
  assert.equal(fresh.campaign!.kind, "angmar");
  assert.throws(
    () =>
      createGame(5, d.cards, ["10115", "01006", "01003"], d.id, {
        scenarioId: "intruders-in-chetwood",
        playMode: "campaign",
        campaign: newAngmarCampaign(["10115", "01006", "01003"]),
      }),
    /No card titled Amarthiúl/,
  );
  assert.throws(
    () =>
      createGame(5, d.cards, HEROES, d.id, {
        scenarioId: "the-weather-hills",
        playMode: "campaign",
        campaign: newAngmarCampaign(HEROES),
      }),
    /follows its chapters in order/,
  );
});

test("Intruders in Chetwood: Protect the Innocent enters the staging area, each player may trade 4 of its damage for a resource on each hero, and Iârion's Pendant is attached to Iârion (+1 willpower)", () => {
  let s = chetwood();
  const quest = angmarInnocent(s)!;
  assert.ok(quest, "Protect the Innocent is in the staging area");
  assert.match(s.choice!.title, /may place 4 damage on Protect the Innocent$/);
  s = choose(s, "damage");
  assert.equal(angmarInnocent(s)!.damage, 4);
  assert.deepEqual(
    s.heroes.map((h) => h.resources),
    [1, 1, 1],
  );
  assert.ok(valid(s));
  s = opening(s);
  const iarion = s.allies.find((u) => u.code === CHETWOOD.iarion)!;
  assert.ok(iarion, "Iârion enters play with the scenario's setup");
  assert.deepEqual(
    iarion.attachments.map((a) => a.code),
    [ANGMAR.pendant],
  );
  const bare = structuredClone(s);
  bare.allies.find((u) => u.id === iarion.id)!.attachments = [];
  assert.equal(
    stats(s, iarion).will,
    stats(
      bare,
      bare.allies.find((u) => u.id === iarion.id)!,
    ).will + 1,
  );
  assert.deepEqual(angmarCampaignStatus(s), [
    "Protect the Innocent has 4 damage: each attack that damages a character adds 1, progress placed on it removes damage instead, and the players lose at 10.",
  ]);
  assert.ok(valid(s));
  // Hot-seat: the choice passes from the first player to the second.
  const seats = [
    { heroes: ["01005", "01006"], deckId: STARTERS[1].id },
    { heroes: ["01007", "01008"], deckId: STARTERS[2].id },
  ];
  let two = createGame(8, STARTERS[1].cards, seats[0].heroes, seats[0].deckId, {
    scenarioId: "intruders-in-chetwood",
    playMode: "campaign",
    seats,
  });
  assert.equal(two.campaign!.kind, "angmar");
  assert.deepEqual(two.campaign!.seatHeroes, [2, 2]);
  two = choose(two, "skip");
  assert.match(two.choice!.title, /may place 4 damage/);
  two = choose(two, "damage");
  assert.equal(angmarInnocent(two)!.damage, 4);
  assert.deepEqual(
    seatView(two, 1).heroes.map((h) => h.resources),
    [1, 1],
  );
  assert.deepEqual(
    seatView(two, 0).heroes.map((h) => h.resources),
    [0, 0],
  );
  assert.ok(valid(two));
});

test("Protect the Innocent: an attack that damages a character adds 1 damage, progress removes damage instead and never defeats it, and the players lose at 10 (20 with three or four players)", () => {
  const s = calm(reload(opening(chetwood())));
  const quest = angmarInnocent(s)!;
  quest.damage = 0;
  const hero = s.heroes[0];
  damage(s, hero.id, 2, { combatDamage: true, enemyId: "enemy" });
  assert.equal(quest.damage, 1);
  damage(s, hero.id, 1, {});
  assert.equal(quest.damage, 1, "not an attack");
  quest.damage = 5;
  addQuestProgress(s, quest, 3);
  assert.equal(quest.damage, 2);
  assert.equal(quest.progress, 0);
  checkSideQuestDefeats(s);
  assert.ok(
    s.staging.some((u) => u.id === quest.id),
    "never defeated",
  );
  quest.damage = innocentLimit(s) - 1;
  damage(s, hero.id, 1, { combatDamage: true, enemyId: "enemy" });
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Protect the Innocent has 10 damage/);
  const three = createGame(3, STARTERS[0].cards, ["01005"], STARTERS[0].id, {
    scenarioId: "intruders-in-chetwood",
    playMode: "campaign",
    seats: [0, 1, 2].map((i) => ({
      heroes: [["01005"], ["01006"], ["01007"]][i],
      deckId: STARTERS[i].id,
    })),
  });
  assert.equal(innocentLimit(three), 20);
});

test("Iârion's Pendant: its Response cancels a revealed card's when revealed effects or a shadow effect, and it goes to the victory display", () => {
  const s = calm(reload(opening(chetwood())));
  // A shadow effect just triggered.
  const options = angmarPendantShadowOptions(s, true);
  assert.equal(options.length, 1);
  assert.match(options[0].label, /cancel the shadow effect$/);
  // A treachery revealed from the encounter deck.
  s.encounterDeck.unshift(CHETWOOD.needs);
  s.queue.push({ kind: "reveal", player: 0 });
  flush(s);
  const window = s.choice!;
  const pendant = window.options.find((o) => o.code === ANGMAR.pendant)!;
  assert.ok(pendant, JSON.stringify(window.options.map((o) => o.label)));
  const t = choose(s, pendant.id);
  assert.ok(
    !t.allies.some((u) => u.attachments.some((a) => a.code === ANGMAR.pendant)),
  );
  assert.ok(t.victoryCards!.includes(ANGMAR.pendant));
  assert.ok(valid(t));
});

test("Intruders in Chetwood's resolution notes Protect the Innocent's damage and adds it to the Campaign Pool; the campaign continues with The Weather Hills", () => {
  const s = calm(reload(opening(chetwood())));
  angmarInnocent(s)!.damage = 6;
  // A hero in its controller's discard pile is fallen.
  const fallen = s.heroes[0];
  s.heroes = s.heroes.filter((u) => u.id !== fallen.id);
  s.discard.push(fallen.code);
  win(s);
  const c = s.campaign!;
  assert.equal(c.innocent, 6);
  assert.deepEqual(c.burdens, [ANGMAR.innocent]);
  assert.deepEqual(c.fallen, [fallen.code]);
  assert.deepEqual(
    c.completed.map((q) => q.scenarioId),
    ["intruders-in-chetwood"],
  );
  assert.ok(valid(s));
  assert.throws(
    () => continueCampaign(s, HEROES, d.id, true, 9),
    /have not fallen/,
  );
  const next = HEROES.map((h) => (h === fallen.code ? "01007" : h));
  const t = continueCampaign(s, next, d.id, true, 9);
  assert.equal(t.scenarioId, "the-weather-hills");
  assert.equal(
    t.campaign!.threatPenalty,
    1,
    "replacing a fallen hero adds the +1 threat penalty",
  );
  assert.equal(angmarInnocent(t)!.damage, 6);
  assert.ok(valid(t));
});

test("The Weather Hills: Protect the Innocent returns with its noted damage, and Mysterious Omens joins the Campaign Log and is shuffled into the encounter deck", () => {
  const s = weather();
  const quest = angmarInnocent(s)!;
  assert.ok(quest, "Protect the Innocent is in the staging area");
  assert.equal(quest.damage, 6);
  assert.deepEqual(s.campaign!.burdens, [ANGMAR.innocent, ANGMAR.omens]);
  assert.equal(
    s.encounterDeck.filter((c) => c === ANGMAR.omens).length,
    1,
    "Mysterious Omens is in the encounter deck",
  );
  const t = opening(s);
  assert.ok(
    [
      ...t.encounterDeck,
      ...t.staging.map((u) => u.code),
      ...t.encounterDiscard,
    ].includes(ANGMAR.omens),
  );
  assert.deepEqual(angmarCampaignStatus(calm(reload(t))).slice(0, 2), [
    `Protect the Innocent has ${angmarInnocent(t)!.damage} damage: each attack that damages a character adds 1, progress placed on it removes damage instead, and the players lose at 10.`,
    "Mysterious Omens is shuffled into the encounter deck: defeating it removes it from the Campaign Pool and lets each player attach Cunning, Hardy, Resolute, Ruthless or Stalwart to a hero.",
  ]);
  assert.ok(valid(t));
  // A replayed chapter keeps a single Mysterious Omens in the log.
  const replay = weather(6, structuredClone(s.campaign!));
  assert.deepEqual(replay.campaign!.burdens, [ANGMAR.innocent, ANGMAR.omens]);
  assert.equal(
    replay.encounterDeck.filter((c) => c === ANGMAR.omens).length,
    1,
  );
});

test("Mysterious Omens: becoming the current quest discards a random card from each hand; when it is defeated each player may attach a different Permanent boon, earned with the chapter's resolution", () => {
  let s = calm(reload(opening(weather())));
  const omens = revealOmens(s);
  const hand = s.hand.length;
  const discard = s.discard.length;
  s.queue.push(fx("sideQuestSelect", { target: omens.id, code: omens.code }));
  flush(s);
  assert.equal(s.hand.length, hand - 1);
  assert.equal(s.discard.length, discard + 1);
  // Defeating it.
  addQuestProgress(
    s,
    s.staging.find((u) => u.id === omens.id)!,
    9,
  );
  assert.ok(s.victoryCards!.includes(ANGMAR.omens));
  flush(s);
  assert.equal(
    s.choice!.title,
    "Mysterious Omens · You may attach a boon to a hero",
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [...SKILL_BOONS, "skip"],
  );
  s = choose(s, ANGMAR.hardy);
  const legolas = s.heroes.find((h) => h.code === "01005")!;
  s = choose(s, legolas.id);
  const hero = s.heroes.find((h) => h.code === "01005")!;
  assert.deepEqual(
    hero.attachments.map((a) => a.code),
    [ANGMAR.hardy],
  );
  const bare = structuredClone(s);
  bare.heroes.find((h) => h.code === "01005")!.attachments = [];
  assert.equal(
    stats(s, hero).health,
    stats(
      bare,
      bare.heroes.find((h) => h.code === "01005")!,
    ).health + 2,
  );
  assert.ok(
    angmarCampaignStatus(s).includes(
      "Earned once this chapter is won (Permanent): Hardy on Legolas.",
    ),
  );
  assert.ok(valid(s));
  angmarInnocent(s)!.damage = 3;
  win(s);
  const c = s.campaign!;
  assert.deepEqual(c.boons, [ANGMAR.hardy]);
  assert.deepEqual(c.permanent, { "01005": [ANGMAR.hardy] });
  assert.deepEqual(
    c.burdens,
    [ANGMAR.innocent],
    "Mysterious Omens leaves the Campaign Pool",
  );
  assert.equal(c.innocent, 3);
  assert.deepEqual(
    c.completed.map((q) => q.scenarioId),
    ["intruders-in-chetwood", "the-weather-hills"],
  );
  assert.ok(valid(s));
  // The campaign continues with Deadmen's Dike; Hardy returns to Legolas.
  const next = continueCampaign(s, HEROES, d.id, true, 9);
  assert.equal(next.scenarioId, "deadmens-dike");
  assert.equal(angmarInnocent(next)!.damage, 3);
  assert.deepEqual(
    next.heroes.find((h) => h.code === "01005")!.attachments.map((a) => a.code),
    [ANGMAR.hardy],
  );
  assert.ok(valid(next));
  // Hot-seat: each player in turn, and a boon taken is no longer offered.
  const heroes = ["01005", "01006", "01007", "01008"];
  const seats = [
    { heroes: heroes.slice(0, 2), deckId: STARTERS[1].id },
    { heroes: heroes.slice(2), deckId: STARTERS[2].id },
  ];
  let two = calm(
    reload(
      opening(
        createGame(8, STARTERS[1].cards, seats[0].heroes, seats[0].deckId, {
          scenarioId: "the-weather-hills",
          playMode: "campaign",
          seats,
          campaign: afterChetwood(2, heroes, [2, 2]),
        }),
      ),
    ),
  );
  const shared = revealOmens(two);
  addQuestProgress(two, shared, 9);
  flush(two);
  two = choose(two, ANGMAR.cunning);
  two = choose(two, two.choice!.options[0].id);
  assert.match(
    two.choice!.title,
    /^Mysterious Omens · .+ may attach a boon to a hero$/,
  );
  assert.ok(!two.choice!.options.some((o) => o.id === ANGMAR.cunning));
  two = choose(two, ANGMAR.stalwart);
  two = choose(two, two.choice!.options[0].id);
  assert.deepEqual(
    two.angmarCards!.skills!.map((x) => x.code),
    [ANGMAR.cunning, ANGMAR.stalwart],
  );
  assert.deepEqual(
    seatView(two, 1).heroes.flatMap((h) => h.attachments.map((a) => a.code)),
    [ANGMAR.stalwart],
  );
  assert.ok(valid(two));
  // The Campaign Log changes only with a won chapter's resolution.
  assert.deepEqual(two.campaign!.boons, []);
  assert.deepEqual(two.campaign!.permanent, {});
  assert.deepEqual(two.campaign!.burdens, [ANGMAR.innocent, ANGMAR.omens]);
});

test("The Permanent boons: their bonuses, Cunning's, Hardy's, Ruthless's and Stalwart's once-per-game Actions, Resolute's Response, and their return to their heroes at the next setup", () => {
  const base = calm(reload(opening(weather())));
  const hero = (s: GameState) => s.heroes.find((h) => h.code === "01005")!;
  const ability = (s: GameState, attachmentId: string) =>
    applyAction(reload(s), { type: "ABILITY", id: hero(s).id, attachmentId });
  // The bonuses.
  const bonus = structuredClone(base);
  for (const code of SKILL_BOONS) attach(bonus, hero(bonus), code);
  const [plain, boosted] = [stats(base, hero(base)), stats(bonus, hero(bonus))];
  assert.deepEqual(
    [
      boosted.will - plain.will,
      boosted.attack - plain.attack,
      boosted.defense - plain.defense,
      boosted.health - plain.health,
    ],
    [1, 1, 1, 2],
  );
  // Cunning: +2 willpower, +2 attack and +2 defense until the end of the phase.
  let s = structuredClone(base);
  const cunning = attach(s, hero(s), ANGMAR.cunning);
  const before = stats(s, hero(s));
  s = ability(s, cunning);
  const after = stats(s, hero(s));
  assert.deepEqual(
    [
      after.will - before.will,
      after.attack - before.attack,
      after.defense - before.defense,
    ],
    [2, 2, 2],
  );
  assert.throws(() => ability(s, cunning), /Cunning was used this game/);
  s.phase = "quest";
  assert.equal(
    stats(s, hero(s)).will,
    before.will,
    "until the end of the phase",
  );
  assert.ok(valid(s));
  // Hardy: ready attached hero.
  s = structuredClone(base);
  const hardy = attach(s, hero(s), ANGMAR.hardy);
  assert.throws(() => ability(s, hardy), /already ready/);
  hero(s).exhausted = true;
  s = ability(s, hardy);
  assert.equal(hero(s).exhausted, false);
  hero(s).exhausted = true;
  assert.throws(() => ability(s, hardy), /Hardy was used this game/);
  // Ruthless: move damage from attached hero to an enemy engaged with you.
  s = structuredClone(base);
  const ruthless = attach(s, hero(s), ANGMAR.ruthless);
  assert.throws(() => ability(s, ruthless), /no damage to move/);
  hero(s).damage = 2;
  assert.throws(() => ability(s, ruthless), /No enemy is engaged with you/);
  // The Weather Hills' Cornered Orc (2 hit points).
  const code = s.encounterDeck.find((c) => card(c).type_code === "enemy")!;
  const enemy = engage(s, code);
  assert.equal(stats(s, enemy).health, 2);
  let lethal = structuredClone(s);
  s = ability(s, ruthless);
  assert.equal(s.choice!.title, "Ruthless · Choose an enemy engaged with you");
  s = choose(s, enemy.id);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["1", "2"],
  );
  s = choose(s, "1");
  assert.equal(hero(s).damage, 1);
  assert.equal(s.engaged.find((u) => u.id === enemy.id)!.damage, 1);
  assert.throws(() => ability(s, ruthless), /Ruthless was used this game/);
  assert.ok(valid(s));
  // Moved damage can destroy the enemy.
  lethal = ability(lethal, ruthless);
  lethal = choose(lethal, enemy.id);
  lethal = choose(lethal, "2");
  assert.equal(hero(lethal).damage, 0);
  assert.ok(!lethal.engaged.some((u) => u.id === enemy.id), "destroyed");
  assert.ok(valid(lethal));
  // Stalwart: a Planning Action plays an attachment from the discard pile.
  s = structuredClone(base);
  const stalwart = attach(s, hero(s), ANGMAR.stalwart);
  assert.throws(
    () => ability(s, stalwart),
    /No attachment in your discard pile/,
  );
  s.discard.push("01039", "01001");
  hero(s).resources = 1;
  s.phase = "quest";
  assert.throws(() => ability(s, stalwart), /This is a Planning Action/);
  s.phase = "planning";
  s = ability(s, stalwart);
  assert.equal(
    s.choice!.title,
    "Stalwart · Play an attachment from your discard pile",
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["01039"],
  );
  s = choose(s, "01039");
  assert.ok(hero(s).attachments.some((a) => a.code === "01039"));
  assert.equal(hero(s).resources, 0, "its cost is paid");
  assert.ok(!s.discard.includes("01039"));
  assert.ok(valid(s));
  // Resolute: cancel up to 2 points of damage just dealt (once per game).
  s = structuredClone(base);
  attach(s, hero(s), ANGMAR.resolute);
  damage(s, hero(s).id, 3, {});
  flush(s);
  assert.equal(s.choice!.title, "Resolute · 3 damage is dealt to Legolas");
  s = choose(s, "cancel");
  assert.equal(hero(s).damage, 1);
  s = calm(s);
  damage(s, hero(s).id, 2, {});
  assert.equal(hero(s).damage, 3, "once per game");
  assert.equal(s.choice, null);
  assert.ok(valid(s));
  // The next setup attaches the Campaign Log's Permanent boons again, and
  // Cunning adds 2 resources to its hero's pool.
  const next = weather(7, {
    ...afterChetwood(1),
    boons: [ANGMAR.cunning, ANGMAR.hardy],
    permanent: { "01005": [ANGMAR.cunning, ANGMAR.hardy] },
  });
  assert.deepEqual(
    hero(next).attachments.map((a) => a.code),
    [ANGMAR.cunning, ANGMAR.hardy],
  );
  assert.equal(hero(next).resources, 2);
  assert.ok(valid(next));
});

/** The Campaign Log after The Weather Hills (Mysterious Omens still in the pool). */
const afterWeather = (innocent = 3, heroes = HEROES): CampaignState => ({
  ...afterChetwood(innocent, heroes),
  burdens: [ANGMAR.innocent, ANGMAR.omens],
  completed: [
    { scenarioId: "intruders-in-chetwood", score: 0, rounds: 1 },
    { scenarioId: "the-weather-hills", score: 0, rounds: 1 },
  ],
});
const dike = (seed = 5, campaign = afterWeather()) =>
  createGame(seed, d.cards, HEROES, d.id, {
    scenarioId: "deadmens-dike",
    playMode: "campaign",
    campaign,
  });
/** Thaurdir, out of the set-aside cards and into the staging area. */
function thaurdirInPlay(s: GameState) {
  const q = s.deadmensDike!;
  const thaurdir = q.setAside.find((u) => u.code === DIKE.thaurdir)!;
  q.setAside = q.setAside.filter((u) => u.id !== thaurdir.id);
  s.staging.push(thaurdir);
  s.stage = 2;
  return thaurdir;
}

test("Deadmen's Dike: Protect the Innocent returns with its noted damage, Iârion's Pendant is attached to Iârion, and Thaurdir takes one of his three burdens at random as he enters play", () => {
  const s = dike();
  assert.equal(angmarInnocent(s)!.damage, 3);
  assert.equal(
    s.encounterDeck.filter((c) => c === ANGMAR.omens).length,
    1,
    "Mysterious Omens stays in the pool",
  );
  const t = calm(reload(opening(s)));
  const iarion = t.allies.find((u) => u.code === CHETWOOD.iarion)!;
  assert.ok(iarion, "Iârion enters play with the scenario's setup");
  assert.deepEqual(
    iarion.attachments.map((a) => a.code),
    [ANGMAR.pendant],
  );
  // Stage 2 brings Thaurdir into play.
  t.stage = 2;
  t.queue.push(fx("dikeStageTwo", { player: 0 }));
  flush(t);
  const thaurdir = t.staging.find((u) => u.code === DIKE.thaurdir)!;
  assert.ok(thaurdir);
  const burdens = thaurdir.attachments.map((a) => a.code);
  assert.equal(burdens.length, 1);
  assert.ok(THAURDIR_BURDENS.includes(burdens[0]));
  assert.equal(t.angmarCards!.thaurdir, burdens[0]);
  assert.ok(
    angmarCampaignStatus(t).some((line) =>
      line.startsWith(
        `${card(burdens[0]).name} is attached to Thaurdir: after a Sorcery treachery is revealed it moves to the hero with the most`,
      ),
    ),
  );
  assert.ok(valid(t));
  // Each burden can be drawn.
  const drawn = new Set(
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seed) => {
      const u = calm(reload(opening(dike(seed))));
      u.stage = 2;
      u.queue.push(fx("dikeStageTwo", { player: 0 }));
      flush(u);
      return u.angmarCards!.thaurdir;
    }),
  );
  assert.equal(drawn.size, 3);
});

test("Thaurdir's burdens: a revealed Sorcery treachery moves each to the hero with the most resources, non-objective attachments or damage (the first player breaks ties); on a hero each counts as a Sorcery attachment", () => {
  const base = calm(reload(opening(dike())));
  const sorcery = base.encounterDeck.find(
    (c) =>
      card(c).type_code === "treachery" &&
      (card(c).traits ?? "").includes("Sorcery"),
  )!;
  assert.ok(sorcery, "Deadmen's Dike has Sorcery treacheries");
  const hero = (s: GameState, code: string) =>
    s.heroes.find((h) => h.code === code)!;
  // Thaurdir's Legacy: the hero with the most resources; -2 willpower and a
  // blank text box.
  let s = structuredClone(base);
  const thaurdir = thaurdirInPlay(s);
  attach(s, thaurdir, ANGMAR.legacy);
  s.heroes.forEach((h, i) => (h.resources = [0, 1, 3][i]));
  const before = stats(s, hero(s, "01003")).will;
  assert.equal(before, 2);
  angmarCampaignAfterReveal(s, sorcery);
  flush(s);
  assert.deepEqual(
    hero(s, "01003").attachments.map((a) => a.code),
    [ANGMAR.legacy],
  );
  assert.equal(thaurdir.attachments.length, 0);
  assert.equal(stats(s, hero(s, "01003")).will, 0);
  syncAttachmentText(s);
  assert.equal(hero(s, "01003").blanked, true);
  assert.ok(valid(s));
  // A treachery without the Sorcery trait leaves it where it is.
  const other = s.encounterDeck.find(
    (c) =>
      card(c).type_code === "treachery" &&
      !(card(c).traits ?? "").includes("Sorcery"),
  );
  if (other) {
    s.heroes.forEach((h, i) => (h.resources = [5, 0, 0][i]));
    angmarCampaignAfterReveal(s, other);
    flush(s);
    assert.ok(
      hero(s, "01003").attachments.some((a) => a.code === ANGMAR.legacy),
    );
  }
  // Thaurdir's Majesty: a tie for the most non-objective attachments is
  // broken by the first player; -2 attack and no questing.
  s = structuredClone(base);
  attach(s, thaurdirInPlay(s), ANGMAR.majesty);
  attach(s, hero(s, "01005"), "01039");
  attach(s, hero(s, "01006"), "01041");
  const attack = stats(s, hero(s, "01006")).attack;
  angmarCampaignAfterReveal(s, sorcery);
  flush(s);
  assert.match(
    s.choice!.title,
    /^Thaurdir's Majesty · Choose the hero with the most non-objective attachments$/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.code),
    ["01005", "01006"],
  );
  s = choose(s, hero(s, "01006").id);
  assert.ok(
    hero(s, "01006").attachments.some((a) => a.code === ANGMAR.majesty),
  );
  assert.equal(stats(s, hero(s, "01006")).attack, attack - 2);
  s.phase = "quest";
  assert.equal(canCommit(s, hero(s, "01006")), false);
  assert.equal(canCommit(s, hero(s, "01005")), true);
  // Thaurdir's Spite: the hero with the most damage; -2 defense and no healing.
  s = structuredClone(base);
  attach(s, thaurdirInPlay(s), ANGMAR.spite);
  hero(s, "01003").damage = 2;
  const defense = stats(s, hero(s, "01003")).defense;
  angmarCampaignAfterReveal(s, sorcery);
  flush(s);
  assert.ok(hero(s, "01003").attachments.some((a) => a.code === ANGMAR.spite));
  assert.equal(defense, 1);
  assert.equal(
    stats(s, hero(s, "01003")).defense,
    0,
    "-2 defense, never below 0",
  );
  assert.equal(rhosgobelHealingAllowed(s, hero(s, "01003")), false);
  assert.equal(
    rhosgobelHealingAllowed(s, hero(s, "01005")),
    false,
    "no damage",
  );
  hero(s, "01005").damage = 1;
  assert.equal(rhosgobelHealingAllowed(s, hero(s, "01005")), true);
  assert.ok(
    angmarCampaignStatus(s).includes(
      "Thaurdir's Spite is attached to Glóin (-2 defense, it cannot be healed); after a Sorcery treachery is revealed it moves to the hero with the most damage.",
    ),
  );
  assert.ok(valid(s));
  // A burden leaving play is removed from the game.
  const spite = hero(s, "01003").attachments.find(
    (a) => a.code === ANGMAR.spite,
  )!;
  discardAttachment(s, hero(s, "01003"), spite, true);
  assert.ok(!hero(s, "01003").attachments.some((a) => a.code === ANGMAR.spite));
  assert.ok(
    ![...s.encounterDiscard, ...s.discard].includes(ANGMAR.spite),
    "neither discard pile",
  );
});

test("Deadmen's Dike's resolution notes Protect the Innocent's damage and turns it to Arnor Ravaged, pools Thaurdir's burden, and asks the players for Iârion's Pendant or Amarthiúl's Courage before the campaign continues", () => {
  const s = calm(reload(opening(dike())));
  angmarInnocent(s)!.damage = 4;
  s.angmarCards!.thaurdir = ANGMAR.spite;
  win(s);
  const c = s.campaign!;
  assert.equal(c.innocent, 4);
  assert.equal(c.ravaged, true);
  assert.deepEqual(c.burdens, [ANGMAR.innocent, ANGMAR.omens, ANGMAR.spite]);
  assert.equal(c.resolution, "deadmens-dike");
  assert.ok(valid(s));
  assert.throws(
    () => continueCampaign(s, HEROES, d.id, true, 9),
    /Record the campaign card's resolution before continuing/,
  );
  const [question] = angmarResolutionQuestions(s);
  assert.deepEqual(
    question.options.map((o) => o.id),
    [ANGMAR.pendant, ANGMAR.courage],
  );
  assert.throws(
    () => applyAngmarResolution(s, { boon: "01039" }),
    /Answer: The players as a group select Iârion's Pendant or Amarthiúl's Courage/,
  );
  const t = applyAngmarResolution(s, { boon: ANGMAR.courage });
  assert.deepEqual(t.campaign!.boons, [ANGMAR.courage]);
  assert.equal(t.campaign!.resolution, null);
  assert.deepEqual(angmarResolutionQuestions(t), []);
  assert.ok(valid(t));
  assert.throws(
    () => applyAngmarResolution(t, { boon: ANGMAR.pendant }),
    /no resolution waiting/,
  );
  assert.throws(
    () => continueCampaign(t, HEROES, d.id, true, 9),
    /not available in campaign mode yet/,
  );
  const pendant = applyAngmarResolution(s, { boon: ANGMAR.pendant });
  assert.deepEqual(pendant.campaign!.boons, [ANGMAR.pendant]);
  assert.ok(valid(pendant));
});

test("Amarthiúl's Courage: attached to Amarthiúl as he enters play with a scenario's setup (the objective ally, or the Amarthiúl hero), +1 willpower and +1 hit point, and its Action readies him once per game", () => {
  // The Wastes of Eriador, Across the Ettenmoors and The Treachery of Rhudaur
  // bring the objective ally into play with their setup (each calls the same
  // hook), and The Battle of Carn Dûm allows the Amarthiúl hero.
  const base = calm(reload(opening(dike())));
  base.campaign!.boons = [ANGMAR.courage];
  let s = structuredClone(base);
  const ally = make(s, WASTES.amarthiul);
  delete ally.owner;
  ally.controller = 0;
  s.allies.push(ally);
  angmarAmarthiulEntered(s, ally);
  const amarthiul = () => s.allies.find((u) => u.id === ally.id)!;
  const courage = amarthiul().attachments.find(
    (a) => a.code === ANGMAR.courage,
  )!;
  assert.ok(courage);
  const bare = structuredClone(s);
  bare.allies.find((u) => u.id === ally.id)!.attachments = [];
  const [plain, brave] = [
    stats(
      bare,
      bare.allies.find((u) => u.id === ally.id)!,
    ),
    stats(s, amarthiul()),
  ];
  assert.deepEqual(
    [brave.will - plain.will, brave.health - plain.health],
    [1, 1],
  );
  // A second Amarthiúl does not take another copy.
  const twin = make(s, WASTES.amarthiul);
  angmarAmarthiulEntered(s, twin);
  assert.equal(twin.attachments.length, 0);
  // Its Action readies Amarthiúl once per game.
  assert.ok(valid(s));
  const use = () =>
    applyAction(reload(s), {
      type: "ABILITY",
      id: ally.id,
      attachmentId: courage.id,
    });
  assert.throws(use, /already ready/);
  amarthiul().exhausted = true;
  s = use();
  assert.equal(amarthiul().exhausted, false);
  amarthiul().exhausted = true;
  assert.throws(use, /Amarthiúl's Courage was used this game/);
  // Without the boon in the Campaign Pool nothing is attached.
  const none = structuredClone(base);
  none.campaign!.boons = [];
  const lone = make(none, WASTES.amarthiul);
  angmarAmarthiulEntered(none, lone);
  assert.equal(lone.attachments.length, 0);
  // The Amarthiúl hero.
  const hero = make(structuredClone(base), "10115");
  const withHero = structuredClone(base);
  angmarAmarthiulEntered(withHero, hero);
  assert.deepEqual(
    hero.attachments.map((a) => a.code),
    [ANGMAR.courage],
  );
});
