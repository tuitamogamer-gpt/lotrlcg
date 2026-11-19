import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { card, STARTERS } from "../src/game/cards";
import {
  damage,
  engage,
  exhaustCharacter,
  progressLocation,
  revealed,
  win,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import { make, prepend, stats } from "../src/game/core";
import { playerAttackKilled } from "../src/game/combat";
import { replayEventProblem } from "../src/game/actions";
import {
  applyAction,
  availableAbilities,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { continueCampaign } from "../src/game/campaign";
import { effectiveKeyword } from "../src/game/expansion-passives";
import { seatView } from "../src/game/table";
import {
  ERED,
  ERED_CAMPAIGN_ORDER,
  ERED_TREASURES,
  anduinTreasureAt,
  applyEredResolution,
  eredCampaignStatus,
  eredForbiddenTitle,
  eredResolutionQuestions,
  newEredCampaign,
  nextEredChapter,
  undiscoveredTreasures,
} from "../src/game/ered-campaign";
import { eredCampaignShadowOptions } from "../src/game/ered-campaign-cards";
import { WILDS_EVIL_CREATURES } from "../src/game/wilds-rhovanion-support";
import type { CampaignState, GameState, Unit } from "../src/game/types";
import art from "./ered-campaign-art.json";

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
const anduin = (campaign?: CampaignState, seed = 5) =>
  createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "journey-up-the-anduin",
    playMode: "campaign",
    ...(campaign ? { campaign } : {}),
  });
/** A hand card of the active player. */
function inHand(s: GameState, code: string) {
  const u = make(s, code);
  s.hand.push(u);
  return u;
}
/** A treasure attached to a hero (as the campaign card attaches it). */
function attached(s: GameState, code: string, host: Unit = s.heroes[0]) {
  const a = { id: `a${s.nextId++}`, code, exhausted: false };
  host.attachments.push(a);
  (s.eredCampaign ??= {}).taken = [...(s.eredCampaign.taken ?? []), code];
  return a;
}
/** A non-unique location from the Core Set's Journey Along the Anduin, explored in the staging area. */
function explore(s: GameState, code = "01114") {
  const l = make(s, code);
  s.staging.push(l);
  progressLocation(s, l, card(code).quest ?? 3);
  flush(s);
  return s;
}

test("Ered Mithrin: Journey Up the Anduin's campaign card, Turayn, A Growing Threat and the nine treasures carry their scans' texts, and every face is pinned", () => {
  const campaignCard = card(ERED.anduinCard);
  assert.deepEqual(
    [campaignCard.name, campaignCard.subtitle, campaignCard.position],
    ["Journey Up the Anduin", "Ered Mithrin Part 1", 164],
  );
  assert.match(
    campaignCard.text!,
    /^You are playing campaign mode\.\nSetup: Any player gains control of Turayn\. Shuffle A Growing Threat into the encounter deck\.\nResponse: After you explore a non-unique location, put a resource here\. Then, if there are X resources here, the players look at 3 random undiscovered treasures and choose 1 to attach to an eligible character\. X is 3 more than the number of players in the game\.$/,
  );
  assert.match(
    campaignCard.back_text!,
    /^Resolution: .*“Turayn has taken an oath of vigilance”.*\nThe players discover each treasure they control\.\nAdd A Growing Threat and each Evil Creatures enemy in play to the campaign pool\.$/,
  );
  // The scans add the keywords the catalog lacks.
  const turayn = card(ERED.turayn);
  assert.deepEqual(
    [turayn.type_code, turayn.sphere_code, turayn.cost, turayn.is_unique],
    ["ally", "boon", "2", true],
  );
  assert.deepEqual(
    [turayn.willpower, turayn.attack, turayn.defense, turayn.health],
    [1, 2, 3, 3],
  );
  assert.match(turayn.text!, /^Sentinel\.\nResponse: After Turayn exhausts/);
  assert.match(card(ERED.growing).text!, /^Surge\.\nWhen Revealed: Set aside/);
  assert.equal(card(ERED.growing).sphere_code, "burden");
  for (const code of ERED_TREASURES) {
    const c = card(code);
    assert.equal(c.type_code, "attachment", c.name);
    assert.equal(c.type_name, "Treasure", c.name);
    assert.equal(c.treasure, true, c.name);
    assert.equal(c.is_unique, true, c.name);
    assert.equal(c.encounter_set, "Ered Mithrin Campaign", c.name);
  }
  assert.deepEqual(
    ERED_TREASURES.map((code) => card(code).cost),
    ["0", "0", "1", "2", "0", "0", "0", "0", "0"],
  );
  // 12 cards, 13 faces (the campaign card has a back).
  assert.equal(art.length, 13);
  for (const pin of art) {
    const bytes = readFileSync(`public${pin.localPath}`);
    assert.equal(bytes.length, pin.bytes, pin.localPath);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      pin.sha256,
      pin.localPath,
    );
    assert.match(
      pin.source,
      /^https:\/\/dragncards-lotrlcg\.s3\.amazonaws\.com\/cards\/English\//,
    );
  }
  // The burdens and boons never join an ordinary game.
  const normal = createGame(5, d.cards, d.heroes, d.id, {
    scenarioId: "journey-up-the-anduin",
  });
  assert.ok(!normal.encounterDeck.includes(ERED.growing));
  assert.ok(!normal.allies.some((u) => u.code === ERED.turayn));
  // The scans show The Old Ford, Woodmen Village and the other unique
  // Wilds of Rhovanion cards with the unique symbol.
  for (const name of [
    "The Old Ford",
    "Woodmen Village",
    "Bare Hilltop",
    "Overgrown Path",
    "Forest Clearing",
    "Abandoned Village",
    "Dragon Hoard",
    "Fire-drake",
  ]) {
    const x = Object.values(
      JSON.parse(
        readFileSync("src/data/wilds-rhovanion-encounter-cards.json", "utf8"),
      ) as { name: string; is_unique: boolean }[],
    ).find((c) => c.name === name)!;
    assert.equal(x.is_unique, true, name);
  }
});

test("Ered Mithrin: the campaign begins with Journey Up the Anduin, follows its nine chapters and forbids Haldan until The King's Quest", () => {
  assert.equal(ERED_CAMPAIGN_ORDER.length, 9);
  assert.equal(nextEredChapter({ completed: [] }), "journey-up-the-anduin");
  assert.equal(eredForbiddenTitle("journey-up-the-anduin"), "Haldan");
  assert.equal(eredForbiddenTitle("lost-in-mirkwood"), "Haldan");
  assert.equal(eredForbiddenTitle("the-kings-quest"), undefined);
  assert.equal(eredForbiddenTitle("the-fate-of-wilderland"), undefined);
  const s = anduin();
  assert.equal(s.campaign!.kind, "ered");
  assert.match(s.log.at(-1)!.text, /The Ered Mithrin campaign/);
  assert.ok(valid(s));
  // Another chapter cannot begin a new campaign, and the next one is not
  // available yet.
  assert.throws(
    () =>
      createGame(5, d.cards, d.heroes, d.id, {
        scenarioId: "lost-in-mirkwood",
        playMode: "campaign",
        campaign: newEredCampaign(d.heroes),
      }),
    /follows its chapters in order/,
  );
  // "Haldan cannot be used as a hero in this campaign."
  assert.throws(
    () =>
      createGame(5, d.cards, d.heroes, d.id, {
        scenarioId: "journey-up-the-anduin",
        playMode: "campaign",
        seats: [
          { heroes: ["19026"], deckId: STARTERS[0].id },
          { heroes: [STARTERS[1].heroes[0]], deckId: STARTERS[1].id },
        ],
      }),
    /No card titled Haldan/,
  );
});

test("Ered Mithrin: Journey Up the Anduin's setup gives Turayn to a player and shuffles A Growing Threat into the encounter deck", () => {
  const s = anduin();
  assert.deepEqual(
    s.allies.map((u) => u.code),
    [ERED.turayn],
  );
  assert.equal(s.encounterDeck.filter((c) => c === ERED.growing).length, 1);
  assert.ok(effectiveKeyword(s.allies[0], "Sentinel"));
  // Two players: the first player chooses who gains control of Turayn.
  const two = createGame(5, d.cards, d.heroes, d.id, {
    scenarioId: "journey-up-the-anduin",
    playMode: "campaign",
    seats: [
      { heroes: [STARTERS[0].heroes[0]], deckId: STARTERS[0].id },
      { heroes: [STARTERS[1].heroes[0]], deckId: STARTERS[1].id },
    ],
  });
  assert.match(two.choice!.title, /Any player gains control of Turayn/);
  const after = choose(two, "seat-1");
  assert.ok(seatView(after, 1).allies.some((u) => u.code === ERED.turayn));
  assert.ok(!seatView(after, 0).allies.some((u) => u.code === ERED.turayn));
  assert.equal(anduinTreasureAt(after), 5);
  assert.ok(valid(after));
});

test("Ered Mithrin: each explored non-unique location puts a resource on the campaign card; at X the players attach 1 of 3 random undiscovered treasures to an eligible character", () => {
  let s = calm(opening(anduin()));
  assert.equal(anduinTreasureAt(s), 4);
  // A unique location (The Old Ford) does not count.
  s = explore(s, "octgn:56634de4-2ef2-4739-b549-fa591e7032eb");
  assert.equal(s.eredCampaign?.tokens, undefined);
  for (let i = 0; i < 3; i++) s = explore(s);
  assert.equal(s.eredCampaign!.tokens, 3);
  assert.equal(s.choice, null);
  assert.match(eredCampaignStatus(s)[0], /3 of 4 resources/);
  s = explore(s);
  assert.equal(s.eredCampaign!.tokens, 4);
  assert.match(s.choice!.title, /look at 3 random undiscovered treasures/);
  const looked = s.choice!.options.map((o) => o.code!);
  assert.equal(looked.length, 3);
  assert.ok(looked.every((code) => ERED_TREASURES.includes(code)));
  assert.deepEqual(s.eredCampaign!.looking, looked);
  // The look survives a reload unchanged.
  assert.deepEqual(
    reload(s).choice!.options.map((o) => o.code),
    looked,
  );
  const pick = looked.find((code) => code !== ERED.crown) ?? looked[0];
  s = choose(s, pick);
  assert.match(s.choice!.title, /Attach to an eligible character/);
  // Turayn and the heroes are eligible (Dwarf-Lord's Crown attaches to a hero only).
  const ids = s.choice!.options.map((o) => o.id);
  assert.ok(ids.includes(s.allies[0].id));
  const hero = s.heroes[0];
  s = choose(s, hero.id);
  assert.ok(s.heroes[0].attachments.some((a) => a.code === pick));
  assert.deepEqual(s.eredCampaign!.taken, [pick]);
  assert.deepEqual(s.eredCampaign!.looking, []);
  assert.ok(!undiscoveredTreasures(s).includes(pick));
  assert.equal(undiscoveredTreasures(s).length, 8);
  // A fifth explored location adds a resource but no second treasure.
  s = explore(calm(s));
  assert.equal(s.eredCampaign!.tokens, 5);
  assert.equal(s.choice, null);
  assert.ok(valid(s));
  // Dwarf-Lord's Crown is offered only heroes.
  const t = calm(opening(anduin(undefined, 9)));
  t.eredCampaign = { tokens: 3, looking: [ERED.crown, ERED.axe, ERED.bow] };
  const u = choose(explore(t), ERED.crown);
  assert.ok(u.choice!.options.every((o) => card(o.code!).type_code === "hero"));
});

test("Ered Mithrin: the treasures' bonuses, keywords and Restricted follow their printed text", () => {
  const s = calm(opening(anduin()));
  const hero = s.heroes[0];
  const before = stats(s, hero);
  attached(s, ERED.axe, hero);
  attached(s, ERED.lute, hero);
  assert.equal(stats(s, hero).attack, before.attack + 2);
  assert.equal(stats(s, hero).will, before.will + 2);
  const other = s.heroes[1];
  const b2 = stats(s, other);
  attached(s, ERED.shield, other);
  attached(s, ERED.bow, other);
  attached(s, ERED.jewels, other);
  assert.equal(stats(s, other).defense, b2.defense + 1);
  assert.equal(stats(s, other).attack, b2.attack + 1);
  assert.equal(stats(s, other).will, b2.will + 1);
  assert.ok(effectiveKeyword(other, "Sentinel"));
  assert.ok(effectiveKeyword(other, "Ranged"));
  const third = s.heroes[2];
  const b3 = stats(s, third);
  attached(s, ERED.helm, third);
  attached(s, ERED.dagger, third);
  assert.equal(stats(s, third).defense, b3.defense + 2);
  assert.equal(stats(s, third).attack, b3.attack + 1);
  assert.ok(valid(s));
});

test("Ered Mithrin: A Growing Threat surges, sets aside the topmost non-unique, non-objective, non-burden card of the discard pile and leaves the game", () => {
  const s = calm(opening(anduin()), "staging");
  s.encounterDeck = s.encounterDeck.filter((c) => c !== ERED.growing);
  // Topmost is the end of the pile: a unique location and a burden are skipped.
  s.encounterDiscard = [
    "01114",
    "01111",
    "octgn:56634de4-2ef2-4739-b549-fa591e7032eb",
  ];
  const top = s.encounterDeck[0];
  const n = s.log.length;
  revealed(s, ERED.growing);
  // Surge: another encounter card is revealed after it.
  assert.ok(s.queue.some((e) => e.kind === "reveal"));
  flush(s);
  assert.deepEqual(s.eredCampaign!.growing, ["01111"]);
  assert.ok(!s.encounterDiscard.includes("01111"));
  assert.ok(!s.encounterDiscard.includes(ERED.growing));
  assert.ok(
    s.log.slice(n).some((l) => l.text === `Revealed ${card(top).name}.`),
  );
  assert.match(
    eredCampaignStatus(s).join(" "),
    /A Growing Threat set aside Misty Mountain Goblins/,
  );
  assert.ok(valid(s));
});

test("Ered Mithrin: Journey Up the Anduin's resolution discovers the treasures in play, adds A Growing Threat, its set-aside cards and the Evil Creatures enemies in play to the Campaign Pool, and asks about Turayn", () => {
  let s = calm(opening(anduin()));
  attached(s, ERED.helm);
  // A taken treasure that left play is not discovered.
  (s.eredCampaign!.taken ??= []).push(ERED.lute);
  s.eredCampaign!.growing = ["01111", "01111", "01111", "01111"];
  const hill = make(s, WILDS_EVIL_CREATURES[1]);
  const wargs = make(s, "01085");
  s.staging.push(hill);
  s.staging.push(wargs);
  win(s);
  const c = s.campaign!;
  assert.deepEqual(c.treasures, [ERED.helm]);
  assert.deepEqual(c.burdens, [ERED.growing]);
  // Misty Mountain Goblins has 3 copies in the collection: the fourth is not added.
  assert.equal(c.encounterPool!["01111"], 3);
  assert.equal(c.encounterPool![WILDS_EVIL_CREATURES[1]], 1);
  assert.equal(c.encounterPool!["01085"], 1);
  assert.equal(c.resolution, "journey-up-the-anduin");
  assert.equal(c.completed.at(-1)!.scenarioId, "journey-up-the-anduin");
  assert.ok(valid(s));
  // The interlude waits for the resolution.
  assert.throws(
    () => continueCampaign(s, c.heroes, s.deckId, true, 9),
    /Record the campaign card's resolution/,
  );
  const q = eredResolutionQuestions(s);
  assert.deepEqual(
    q.map((x) => x.id),
    ["turayn"],
  );
  const aid = applyEredResolution(s, { turayn: "aid" });
  assert.deepEqual(aid.campaign!.boons, [ERED.turayn]);
  assert.equal(aid.campaign!.notes, undefined);
  assert.equal(aid.campaign!.resolution, null);
  assert.ok(valid(aid));
  const oath = applyEredResolution(s, { turayn: "oath" });
  assert.deepEqual(oath.campaign!.boons, []);
  assert.deepEqual(oath.campaign!.notes, ["turayn"]);
  assert.ok(valid(oath));
  // Lost in Mirkwood is not available in campaign mode yet.
  assert.throws(
    () => continueCampaign(aid, aid.campaign!.heroes, aid.deckId, true, 9),
    /not available in campaign mode yet/,
  );
});

test("Ered Mithrin: the Campaign Pool's encounter cards and burdens join the encounter deck, and discovered treasures and boons join the decks the interlude chose", () => {
  const c = newEredCampaign(d.heroes);
  c.burdens = [ERED.growing];
  c.encounterPool = { "01085": 2 };
  c.boons = [ERED.turayn];
  c.treasures = [ERED.axe, ERED.jewels];
  c.deckBoons = { [ERED.turayn]: 0, [ERED.axe]: 0 };
  const s = anduin(c);
  assert.equal(s.encounterDeck.filter((x) => x === ERED.growing).length, 1);
  assert.equal(s.encounterDeck.filter((x) => x === "01085").length, 2);
  const cards = [...s.deck, ...s.hand.map((u) => u.code)];
  assert.ok(cards.includes(ERED.turayn));
  assert.ok(cards.includes(ERED.axe));
  assert.ok(!cards.includes(ERED.jewels));
  // An undiscovered treasure or a boon outside the pool cannot be assigned.
  const bad = structuredClone(c);
  bad.deckBoons = { [ERED.bow]: 0 };
  const t = anduin(bad);
  assert.ok(![...t.deck, ...t.hand.map((u) => u.code)].includes(ERED.bow));
});

test("Ered Mithrin: Turayn's Response cancels 1 of the chosen character's next damage this round", () => {
  const t = calm(opening(anduin()), "quest");
  const turayn = t.allies.find((x) => x.code === ERED.turayn)!;
  // Exhausting Turayn (for any reason) offers the Response: another character.
  exhaustCharacter(t, turayn);
  flush(t);
  assert.match(t.choice!.title, /Turayn exhausted/);
  assert.ok(!t.choice!.options.some((o) => o.id === turayn.id));
  assert.ok(t.choice!.options.some((o) => o.id === "decline"));
  const v = choose(t, t.heroes[0].id);
  assert.deepEqual(v.eredCampaign!.shields, [
    { target: v.heroes[0].id, round: v.round },
  ]);
  assert.match(eredCampaignStatus(v).join(" "), /Turayn: the next time/);
  damage(v, v.heroes[0].id, 2);
  assert.equal(v.heroes[0].damage, 1);
  // Only the next damage is reduced.
  damage(v, v.heroes[0].id, 1);
  assert.equal(v.heroes[0].damage, 2);
  assert.ok(valid(v));
  // Damage paid as a cost is not canceled, and the effect ends with the round.
  const w = choose(t, t.heroes[1].id);
  damage(w, w.heroes[1].id, 1, { cost: true });
  assert.equal(w.heroes[1].damage, 1);
  w.round++;
  damage(w, w.heroes[1].id, 1);
  assert.equal(w.heroes[1].damage, 2);
  // Declining leaves no lasting effect.
  const x = choose(t, "decline");
  assert.equal(x.eredCampaign?.shields, undefined);
});

test("Ered Mithrin: Axe of the Edain, Glittering Lute and Anvil of Gundabad resolve their Responses when played", () => {
  // Axe of the Edain: 2 damage to a non-unique enemy engaged with you.
  let s = calm(opening(anduin()));
  s.heroes[0].resources = 5;
  const goblin = make(s, "01111");
  s.staging.push(goblin);
  engage(s, goblin);
  s.campaign!.treasures = [ERED.axe];
  const axe = inHand(s, ERED.axe);
  s = applyAction(reload(s), {
    type: "PLAY",
    id: axe.id,
    target: s.heroes[0].id,
  });
  assert.match(s.choice!.title, /Axe of the Edain · Deal 2 damage/);
  s = choose(s, goblin.id);
  assert.equal(s.engaged.find((e) => e.id === goblin.id)!.damage, 2);
  assert.ok(valid(s));
  // Glittering Lute: each player may discard a card to reduce their threat by 2.
  let t = calm(opening(anduin()));
  t.heroes[0].resources = 5;
  t.threat = 30;
  const lute = inHand(t, ERED.lute);
  t = applyAction(reload(t), {
    type: "PLAY",
    id: lute.id,
    target: t.heroes[1].id,
  });
  t = choose(t, "use");
  const discarded = t.choice!.options[0].id;
  t = choose(t, discarded);
  assert.equal(t.threat, 28);
  assert.ok(t.discard.length >= 1);
  // Anvil of Gundabad: search the top 5 for Item attachments.
  let a = calm(opening(anduin()));
  a.heroes[0].resources = 5;
  a.deck.unshift(ERED.dagger, "01001", ERED.jewels);
  const anvil = inHand(a, ERED.anvil);
  const handBefore = a.hand.length;
  a = applyAction(reload(a), {
    type: "PLAY",
    id: anvil.id,
    target: a.heroes[0].id,
  });
  a = choose(a, "search");
  assert.match(a.choice!.title, /Add any number of Item attachments/);
  const items = a.choice!.options.filter((o) => o.id.startsWith("item-"));
  assert.ok(items.some((o) => o.code === ERED.dagger));
  assert.ok(items.some((o) => o.code === ERED.jewels));
  a = choose(a, items.find((o) => o.code === ERED.dagger)!.id);
  a = choose(a, "done");
  assert.ok(a.hand.some((u) => u.code === ERED.dagger));
  assert.equal(a.hand.length, handBefore);
  assert.ok(valid(a));
});

test("Ered Mithrin: Anvil of Gundabad's Action plays an Item attachment for 1 less, Dwarf-Lord's Crown boosts allies sharing a Trait, and Jewels of Wilderland trades a card", () => {
  let s = calm(opening(anduin()), "quest");
  const hero = s.heroes[0];
  const anvil = attached(s, ERED.anvil, hero);
  const dagger = inHand(s, ERED.dagger);
  for (const h of s.heroes) h.resources = 0;
  // Durin's Dagger costs 1: 0 after Anvil's reduction, outside the planning phase.
  const label = availableAbilities(s, hero).find((x) => x.id === anvil.id);
  assert.ok(
    label && !label.disabled,
    JSON.stringify(availableAbilities(s, hero)),
  );
  s = applyAction(reload(s), {
    type: "ABILITY",
    id: hero.id,
    attachmentId: anvil.id,
  });
  assert.equal(s.heroes[0].exhausted, true);
  s = choose(s, dagger.id);
  s = choose(s, s.heroes[1].id);
  assert.ok(s.heroes[1].attachments.some((a) => a.code === ERED.dagger));
  assert.ok(!s.hand.some((u) => u.code === ERED.dagger));
  assert.equal(s.eredCampaign!.anvil, undefined);
  assert.ok(valid(s));
  // Dwarf-Lord's Crown: allies sharing a Trait with the attached hero.
  let c = calm(opening(anduin()), "quest");
  const harad = c.allies.find((u) => u.code === ERED.turayn)!;
  const crownHost = c.heroes.find((h) =>
    (card(h.code).traits ?? "").includes("Warrior"),
  );
  assert.ok(crownHost, "Théodred shares the Warrior trait with Turayn");
  {
    const crown = attached(c, ERED.crown, crownHost);
    const before = stats(c, harad);
    c = applyAction(reload(c), {
      type: "ABILITY",
      id: crownHost.id,
      attachmentId: crown.id,
    });
    const turayn = c.allies.find((u) => u.code === ERED.turayn)!;
    assert.equal(stats(c, turayn).will, before.will + 1);
    assert.equal(stats(c, turayn).attack, before.attack + 1);
    assert.equal(stats(c, turayn).defense, before.defense + 1);
  }
  // Jewels of Wilderland: discard a card to draw a card.
  let j = calm(opening(anduin()));
  const jewels = attached(j, ERED.jewels, j.heroes[2]);
  const hand = j.hand.length;
  const deck = j.deck.length;
  j = applyAction(reload(j), {
    type: "ABILITY",
    id: j.heroes[2].id,
    attachmentId: jewels.id,
  });
  j = choose(j, j.choice!.options[0].id);
  assert.equal(j.hand.length, hand);
  assert.equal(j.deck.length, deck - 1);
  assert.equal(
    j.heroes[2].attachments.find((a) => a.code === ERED.jewels)!.exhausted,
    true,
  );
});

test("Ered Mithrin: Durin's Dagger is played from the discard pile", () => {
  let s = calm(opening(anduin()));
  s.heroes[0].resources = 3;
  s.discard.push(ERED.dagger);
  const index = s.discard.length - 1;
  s = applyAction(reload(s), {
    type: "PLAY_DISCARD",
    index,
    target: s.heroes[1].id,
  });
  assert.ok(s.heroes[1].attachments.some((a) => a.code === ERED.dagger));
  assert.ok(!s.discard.includes(ERED.dagger));
  assert.ok(valid(s));
});

test("Ered Mithrin: Gondolin Shield cancels a shadow effect for a resource and deals another shadow card; Helm of Heroes and Masterwork Bow respond in combat", () => {
  const s = calm(opening(anduin()), "defense");
  const hero = s.heroes[0];
  const shield = attached(s, ERED.shield, hero);
  for (const h of s.heroes) h.resources = 0;
  hero.resources = 1;
  const goblin = make(s, "01111");
  s.engaged.push(goblin);
  s.combat = {
    enemyId: goblin.id,
    defenderId: hero.id,
    defenderIds: [hero.id],
    attackBonus: 0,
  } as never;
  const options = eredCampaignShadowOptions(s, "01111", true);
  assert.equal(options.length, 1);
  assert.match(options[0].label, /Exhaust Gondolin Shield/);
  assert.deepEqual(
    options[0].effects.map((e) => e.kind),
    ["emcShieldCost", "emcShieldDeal"],
  );
  // Its effects: exhaust it, spend the resource, deal another shadow card
  // (revealed in this attack); the triggered shadow effect does not resolve.
  const deckTop = s.encounterDeck[0];
  const n = s.log.length;
  prepend(s, ...options[0].effects);
  flush(s);
  assert.equal(shield.exhausted, true);
  assert.equal(hero.resources, 0);
  assert.ok(
    s.log
      .slice(n)
      .some((l) => l.text.startsWith(`Shadow: ${card(deckTop).name}`)),
  );
  assert.ok(valid(s));
  // Exhausted or without a resource, it cannot be used.
  shield.exhausted = true;
  assert.equal(eredCampaignShadowOptions(s, "01111", true).length, 0);
  shield.exhausted = false;
  hero.resources = 0;
  assert.equal(eredCampaignShadowOptions(s, "01111", true).length, 0);
  // Helm of Heroes: damage from an enemy's attack adds 1 resource to a hero.
  const t = calm(opening(anduin()), "defense");
  const helmHero = t.heroes[1];
  attached(t, ERED.helm, helmHero);
  const enemy = make(t, "01085");
  t.engaged.push(enemy);
  damage(t, helmHero.id, 1, { enemyId: enemy.id, combatDamage: true });
  flush(t);
  assert.match(t.choice!.title, /Helm of Heroes/);
  const before = t.heroes[2].resources;
  const u = choose(t, t.heroes[2].id);
  assert.equal(u.heroes[2].resources, before + 1);
  // Damage that is not from an attack does not trigger it.
  const v = calm(opening(anduin()), "quest");
  attached(v, ERED.helm, v.heroes[1]);
  damage(v, v.heroes[1].id, 1);
  flush(v);
  assert.equal(v.choice, null);
  // Masterwork Bow: after attached character attacks and defeats an enemy,
  // place 1 progress on a location in the staging area.
  const b = calm(opening(anduin()), "attack");
  const archer = b.heroes[0];
  attached(b, ERED.bow, archer);
  const lands = make(b, "01114");
  b.staging.push(lands);
  const victim = make(b, "01085");
  playerAttackKilled(b, victim, [archer.id]);
  flush(b);
  assert.match(b.choice!.title, /Masterwork Bow/);
  const after = choose(b, lands.id);
  assert.equal(after.staging.find((l) => l.id === lands.id)!.progress, 1);
});

test("Ered Mithrin: fewer undiscovered treasures are looked at when fewer remain, and none when all are discovered", () => {
  const c = newEredCampaign(d.heroes);
  c.treasures = ERED_TREASURES.slice(0, 7);
  let s = calm(opening(anduin(c)));
  s.eredCampaign = { tokens: 3 };
  s = explore(s);
  assert.equal(s.choice!.options.length, 2);
  assert.match(s.choice!.title, /look at 2 random undiscovered treasures/);
  const all = newEredCampaign(d.heroes);
  all.treasures = [...ERED_TREASURES];
  const t = calm(opening(anduin(all)));
  t.eredCampaign = { tokens: 3 };
  explore(t);
  assert.equal(t.choice, null);
  assert.ok(t.log.some((l) => l.text === "No undiscovered treasure is left."));
});

test("Ered Mithrin: the UI's discard play accepts Durin's Dagger, and malformed Campaign Logs are rejected", () => {
  const s = calm(opening(anduin()));
  s.heroes[0].resources = 2;
  s.discard.push(ERED.dagger);
  const index = s.discard.length - 1;
  const preview = {
    ...s.heroes[0],
    id: `discard-play:${index}`,
    code: ERED.dagger,
    attachments: [],
  };
  assert.equal(replayEventProblem(s, preview), null);
  assert.equal(replayEventProblem(s, preview, s.heroes[1].id), null);
  const won = calm(opening(anduin()));
  win(won);
  const ok = applyEredResolution(won, { turayn: "aid" });
  assert.ok(valid(ok));
  const broken = (f: (c: CampaignState) => void) => {
    const x = structuredClone(ok);
    f(x.campaign!);
    return valid(x);
  };
  assert.equal(
    broken((c) => (c.treasures = ["01001"])),
    false,
  );
  assert.equal(
    broken((c) => (c.treasures = [ERED.axe, ERED.axe])),
    false,
  );
  assert.equal(
    broken((c) => (c.notes = ["unknown"])),
    false,
  );
  assert.equal(
    broken((c) => (c.encounterPool = { "01111": 4 })),
    false,
  );
  assert.equal(
    broken((c) => (c.encounterPool = { [ERED.growing]: 1 })),
    false,
  );
  assert.equal(
    broken((c) => (c.deckBoons = { [ERED.bow]: 0 })),
    false,
  );
  assert.equal(
    broken((c) => (c.deckBoons = { [ERED.turayn]: 3 })),
    false,
  );
  assert.equal(
    broken((c) => c.burdens.push("41042")),
    false,
  );
  assert.equal(
    broken((c) => (c.completed[0].scenarioId = "lost-in-mirkwood")),
    false,
  );
  assert.equal(
    broken((c) => {
      c.treasures = [ERED.bow];
      c.deckBoons = { [ERED.bow]: 0, [ERED.turayn]: 0 };
      c.encounterPool = { "01085": 2 };
      c.notes = ["turayn"];
    }),
    true,
  );
});
