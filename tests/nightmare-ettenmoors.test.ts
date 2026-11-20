import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyAction, canTravel } from "../src/game/engine";
import { card, encounterCards } from "../src/game/cards";
import { check, destroy, revealed } from "../src/game/board";
import { fx, get, locationQuest, make, stageInfo } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { addQuestProgress, sideQuestStart } from "../src/game/side-quests";
import { mainQuestCode } from "../src/game/quest-state";
import { forOwner, playerOrder, seatView } from "../src/game/table";
import { ettenQuestStart } from "../src/game/ettenmoors";
import {
  ETTEN as E,
  ETTEN_SAFE,
  ETTEN_SIDES,
} from "../src/game/ettenmoors-support";
import { WASTES as W } from "../src/game/wastes-eriador-support";
import { CHETWOOD as C } from "../src/game/chetwood-support";
import {
  NIGHTMARE,
  NIGHTMARE_AA as N,
  nightmareCardOf,
  nightmareStatus,
} from "../src/game/nightmare";
import type { Effect, GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  nightmareForTwo,
  nightmareGame,
  opening,
  shadow,
  valid,
} from "./nightmare-fixtures";
import { base, choose, reload, settle } from "./ettenmoors-fixtures";

const ID = "across-the-ettenmoors";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
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
    assert.ok(i < 80, "decisions terminate");
    s = choose(reload(s), answer(s) ?? s.choice.options[0].id);
  }
  return s;
}
const stage = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const engaged = (s: GameState, code: string, p = 0) => {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    s.engaged.push(u);
  });
  return u;
};
const reveal = (s: GameState, code: string) => {
  revealed(s, code);
  return s;
};
const options = (s: GameState) => s.choice?.options.map((o) => o.id) ?? [];
const sides = (codes: string[]) =>
  codes.filter((c) => {
    try {
      return card(c).type_code === "encounter-side-quest";
    } catch {
      return false; // the rules card is not a playable card
    }
  });
/** Make Camp and Lost in the Wilderness, the Eriador Wilds side quests of the standard encounter deck. */
const MAKE_CAMP = "octgn:5388683d-3240-433a-9602-a7367e428406";
const SCOUT = "01016",
  ROAD = "01099";

test("Nightmare: Across the Ettenmoors' setup card, stage 1 and Nightmare Deck carry their scans' texts and stats", () => {
  const c = card(N.ettenCard);
  assert.deepEqual(
    [c.name, c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    [
      "Across the Ettenmoors",
      "nightmare",
      "nightmare",
      "Across the Ettenmoors - Nightmare",
      true,
    ],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for the Across the Ettenmoors scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n1x Into the Ettenmoors\n2x Shrouded Hills\n1x No Rest\n2x Arador's Bane\n2x Troll-fells\n2x Goblin Pursuer\n2x Cold from Angmar\nThen, /,
  );
  assert.match(
    c.back_text!,
    /^You are playing Nightmare mode\.\nForced: When resolving the 'when revealed' effect on stage 2A or stage 3A, also discard cards from the top of the encounter deck until a location with the safe keyword is discarded\. Attach that location to the newly revealed side quest, as a guarded objective\.$/,
    'the scan\'s "You are" (the catalogue had "Your are")',
  );
  const q = card(N.ettenQuest);
  assert.deepEqual(
    [q.name, q.type_code, q.back_quest, q.encounter_set],
    ["Into the Ettenmoors", "quest", 10, "Across the Ettenmoors - Nightmare"],
  );
  assert.match(
    q.text!,
    /^Setup: Set aside each side quest and each location with the safe keyword\./,
  );
  assert.match(
    q.text!,
    /\. Shuffle the remaining side quests .*The first player gains control of Amarthiúl\.$/,
  );
  assert.equal(
    q.back_text,
    "Forced: At the beginning of the quest phase, if there are no encounter side quests in play, discard cards from the top of the encounter deck until a side quest is discarded, reveal it, and add it to the staging area.",
    "no flavour, and no progress for a defeated side quest",
  );
  const stat = (code: string) => {
    const x = card(code);
    return [x.engagement, x.threat, x.attack, x.defense, x.health, x.traits];
  };
  assert.deepEqual(stat(N.serpent), [38, 3, 4, 3, 5, "Creature."]);
  assert.deepEqual(stat(N.stoneTroll), [42, 1, 7, 2, 14, "Troll."]);
  assert.deepEqual(stat(N.beetle), [14, 2, 3, 3, 3, "Creature. Insect."]);
  assert.match(
    card(N.serpent).text!,
    /\nForced: When you engage Hoarwell River Serpent, deal 1 damaged to each damaged character you control\.$/,
    'the printed "1 damaged"',
  );
  assert.match(card(N.stoneTroll).text!, /cannot leave that discard pile\.$/);
  assert.deepEqual(
    [
      card(N.foothills).threat,
      card(N.foothills).quest,
      card(N.vastFells).threat,
      card(N.vastFells).quest,
    ],
    [2, 2, 3, 4],
  );
  assert.equal(card(N.thunder).traits, "Weather.");
  assert.match(
    card(N.barren).text!,
    /^Surge\.\nWhen Revealed: Attach to a side quest\./,
  );
  assert.equal(
    card(N.isolated).text,
    "Surge. Players cannot draw cards by card effects.\nForced: When this stage is defeated, each player draws 1 card.",
    "no flavour, and one Surge",
  );
  assert.deepEqual(
    [
      card(N.isolated).quest,
      card(N.isolated).victory,
      card(N.rescue).quest,
      card(N.rescue).victory,
    ],
    [7, 10, 15, 10],
  );
  assert.equal(card(N.rescue).text!.split("\n").length, 3);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Across the Ettenmoors - Nightmare",
  );
  assert.equal(set.length, 11);
  assert.equal(
    set.reduce(
      (n, x) =>
        n +
        (["nightmare", "quest"].includes(x.type_code) ? 0 : (x.quantity ?? 1)),
      0,
    ),
    18,
  );
  assert.equal(
    art.filter((x) => set.some((y) => y.code === x.code)).length,
    13,
  );
});

test("Nightmare: Across the Ettenmoors' Nightmare encounter deck matches its source recipe (with the 2 No Rest the setup card keeps), and stage 1 is the Nightmare Deck's", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const tally = (list: string[]) =>
    list.reduce<Record<string, number>>(
      (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
      {},
    );
  const pile = (
    r: { cards: { code: string; quantity: number; section: string }[] },
    section: string,
  ) =>
    r.cards
      .filter((c) => c.section === section && c.code !== N.ettenCard)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const recipe = recipes.find((r) => r.id === "N05.6")!;
  assert.ok(pile(recipe, "sharedQuestDeck").includes(N.ettenQuest));
  // The encounter deck before stage 1A sets the side quests aside: the
  // recipe's, its side quests from the encounter deck, and the second No
  // Rest (the setup card removes 1 of the 3).
  const deckSides = sides(pile(recipe, "sharedSetAside")).filter(
    (c) => !ETTEN_SIDES.includes(c),
  );
  assert.deepEqual(deckSides.map((c) => card(c).name).sort(), [
    "Isolated",
    "Lost in the Wilderness",
    "Make Camp",
    "Rescue from the Trolls",
  ]);
  assert.deepEqual(
    tally(game().encounterDeck),
    tally([...pile(recipe, "sharedEncounterDeck"), ...deckSides, E.noRest]),
  );
  for (const [title, n] of Object.entries({
    ...NIGHTMARE[ID]!.removals,
    ...NIGHTMARE[ID]!.questRemovals,
  }))
    assert.ok(card(N.ettenCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), N.ettenCard);
    assert.ok(valid(s));
    assert.equal(mainQuestCode(s), N.ettenQuest);
    const info = stageInfo(s);
    assert.deepEqual(
      [info.name, info.quest, info.cardCode],
      ["Into the Ettenmoors", 10, N.ettenQuest],
    );
    const all = [
      ...s.encounterDeck,
      ...s.encounterDiscard,
      ...s.staging.map((u) => u.code),
      ...(s.victoryCards ?? []),
    ];
    assert.equal(sides(all).length, 7, "the seven side quests");
    assert.equal(all.filter((c) => ETTEN_SAFE.includes(c)).length, 4);
    const safe = s.staging.find((u) => ETTEN_SAFE.includes(u.code))!;
    assert.ok(s.staging.some((u) => u.guarding === safe.id));
    assert.ok(s.allies.some((u) => u.code === E.amarthiul));
    assert.match(
      nightmareStatus(s)[0],
      /^Across the Ettenmoors · Nightmare mode/,
    );
  }
  // A standard game keeps the standard stage 1.
  const standard = base();
  assert.notEqual(mainQuestCode(standard), N.ettenQuest);
});

test("Nightmare: Into the Ettenmoors 1A sets each side quest and safe location aside, reveals one guarding a safe location, and stages the first X enemies discarded", () => {
  let s = board(2);
  s.ettenmoors!.initialized = false;
  s.allies = s.allies.filter((u) => u.code !== E.amarthiul);
  s.encounterDeck = [
    ...Array<string>(3).fill(E.spawn),
    ...Array<string>(6).fill(ROAD),
  ];
  s = run(queue(s, { kind: "ettenSetup" }));
  const enemies = s.staging.filter((u) => card(u.code).type_code === "enemy");
  assert.equal(enemies.length, 2, "one enemy for each player");
  assert.ok(s.encounterDiscard.every((c) => card(c).type_code !== "enemy"));
  const safe = s.staging.filter((u) => ETTEN_SAFE.includes(u.code));
  assert.equal(safe.length, 1);
  const guard = s.staging.find((u) => u.guarding === safe[0].id)!;
  assert.ok(ETTEN_SIDES.includes(guard.code));
  // The others were shuffled in (the search for enemies may discard some).
  const rest = [...s.encounterDeck, ...s.encounterDiscard];
  assert.equal(sides(rest).length, 2);
  assert.equal(rest.filter((c) => ETTEN_SAFE.includes(c)).length, 3);
  assert.ok(s.ettenmoors!.initialized);
  assert.equal(
    playerOrder(s).filter((p) =>
      seatView(s, p).allies.some((u) => u.code === E.amarthiul),
    ).length,
    1,
  );
  assert.ok(valid(s));
  // The side quests of the encounter deck join them.
  s = board();
  s.ettenmoors!.initialized = false;
  s.encounterDeck = [
    MAKE_CAMP,
    C.wilderness,
    N.isolated,
    N.rescue,
    E.spawn,
    ...Array<string>(8).fill(ROAD),
  ];
  s = run(queue(s, { kind: "ettenSetup" }));
  const every = [
    ...s.encounterDeck,
    ...s.encounterDiscard,
    ...s.staging.map((u) => u.code),
  ];
  assert.equal(sides(every).length, 7);
});

test("Nightmare: stage 1B reveals the side quest it finds (the standard stage adds it), and a defeated side quest gives the Nightmare stage no progress", () => {
  let s = board();
  s.phase = "quest";
  s.hand = [make(s, SCOUT), make(s, SCOUT)];
  s.encounterDeck = [ROAD, C.wilderness, ROAD];
  ettenQuestStart(s);
  s = run(s);
  assert.ok(s.staging.some((u) => u.code === C.wilderness));
  assert.equal(
    s.hand.length,
    0,
    "Lost in the Wilderness: the hands go underneath it",
  );
  assert.deepEqual(s.encounterDiscard, [ROAD]);
  // The standard stage adds it without its When Revealed.
  let t = base();
  t.phase = "quest";
  t.hand = [make(t, SCOUT)];
  t.encounterDeck = [C.wilderness];
  ettenQuestStart(t);
  t = run(t);
  assert.ok(t.staging.some((u) => u.code === C.wilderness));
  assert.equal(t.hand.length, 1);
  // A defeated side quest: no progress on the Nightmare stage 1.
  s = board();
  const lie = stage(s, E.lieLow);
  lie.progress = card(E.lieLow).quest! - 1;
  addQuestProgress(s, lie, 1);
  s = run(s);
  assert.equal(s.progress, 0);
  t = base();
  const side = stage(t, E.lieLow);
  side.progress = card(E.lieLow).quest! - 1;
  addQuestProgress(t, side, 1);
  t = run(t);
  assert.equal(t.progress, card(E.lieLow).quest);
});

test("Nightmare: as stages 2A and 3A reveal their side quest, the setup card discards to a safe location that guards it", () => {
  let s = board();
  s.stage = 2;
  s.encounterDeck = [ROAD, E.forage, ROAD, E.camp, ROAD];
  s = run(queue(s, { kind: "ettenFindSide", flag: true }));
  const forage = s.staging.find((u) => u.code === E.forage)!;
  const camp = s.staging.find((u) => u.code === E.camp)!;
  assert.equal(forage.guarding, camp.id);
  assert.deepEqual(s.encounterDiscard, [ROAD, ROAD]);
  assert.deepEqual(s.encounterDeck, [ROAD]);
  // No safe location is left: the side quest stays unguarded.
  s = board();
  s.stage = 3;
  s.encounterDeck = [E.lieLow, ROAD];
  s = run(queue(s, { kind: "ettenFindSide", flag: true }));
  assert.equal(s.staging.find((u) => u.code === E.lieLow)!.guarding, undefined);
  // A standard game finds no safe location.
  let t = base();
  t.stage = 2;
  t.encounterDeck = [E.forage, ROAD, E.camp];
  t = run(queue(t, { kind: "ettenFindSide", flag: true }));
  assert.ok(t.encounterDeck.includes(E.camp));
});

test("Nightmare: to travel to a safe location, one player engages each staged Hoarwell River Serpent, which deals 1 damage to each damaged character of that player", () => {
  let s = board(2);
  const serpent = stage(s, N.serpent);
  const safe = stage(s, E.cave);
  const [hurt, whole] = seatView(s, 1).heroes;
  forOwner(s, 1, () => {
    s.heroes[0].damage = 1;
  });
  s.phase = "travel";
  s = applyAction(reload(s), { type: "TRAVEL", id: safe.id });
  assert.deepEqual(options(s), ["player-0", "player-1"]);
  s = run(s, (x) => (options(x).includes("player-1") ? "player-1" : undefined));
  assert.deepEqual([get(s, hurt.id)!.damage, get(s, whole.id)!.damage], [2, 0]);
  assert.equal(s.activeLocation?.id, safe.id);
  assert.ok(
    s.staging.some((u) => u.id === serpent.id),
    "the Safe returns it to the staging area",
  );
  assert.ok(valid(s));
  // An engaged Serpent asks nothing more.
  s = board();
  engaged(s, N.serpent);
  s.heroes[0].damage = 1;
  const camp = stage(s, E.camp);
  s.phase = "travel";
  s = settle(applyAction(reload(s), { type: "TRAVEL", id: camp.id }));
  assert.equal(s.heroes[0].damage, 1);
});

test("Nightmare: Scavenging Stone-troll keeps the players from a safe location while it has no damage, and while staged keeps each discard pile's cards", () => {
  let s = board();
  const troll = stage(s, N.stoneTroll);
  const safe = stage(s, E.camp);
  s.phase = "travel";
  assert.match(canTravel(s, safe)!, /Scavenging Stone-troll/);
  troll.damage = 1;
  assert.equal(canTravel(s, safe), null);
  // An engaged one still forbids it.
  s = board();
  engaged(s, N.stoneTroll);
  const camp = stage(s, E.camp);
  s.phase = "travel";
  assert.match(canTravel(s, camp)!, /Scavenging Stone-troll/);
  // Staged, it keeps the discard piles: Abandoned Camp returns nothing.
  s = board();
  stage(s, N.stoneTroll);
  s.discard = [SCOUT];
  assert.equal(hooks(s).discardCardKept!(s, SCOUT), true);
  s = run(queue(s, fx("ettenCampRecover", { player: 0 })));
  assert.equal(s.choice, null);
  assert.deepEqual(s.discard, [SCOUT]);
  s = board();
  engaged(s, N.stoneTroll);
  s.discard = [SCOUT];
  assert.equal(hooks(s).discardCardKept!(s, SCOUT), false);
  flush(queue(s, fx("ettenCampRecover", { player: 0 })));
  assert.match(s.choice!.title, /Abandoned Camp/);
});

test("Nightmare: each engaged Giant Beetle attacks its engaged player as a cost to travel to a safe location, and damaged characters cannot attack or defend against it", () => {
  let s = board();
  const beetle = engaged(s, N.beetle);
  const safe = stage(s, E.woods);
  s.phase = "travel";
  s = applyAction(reload(s), { type: "TRAVEL", id: safe.id });
  assert.deepEqual([s.combat?.enemyId, s.combat?.attackPlayer], [beetle.id, 0]);
  const [hero] = s.heroes;
  hero.damage = 1;
  assert.equal(hooks(s).cannotDefend!(s, get(s, beetle.id)!, hero), true);
  assert.equal(hooks(s).cannotAttack!(s, hero, get(s, beetle.id)!), true);
  hero.damage = 0;
  assert.equal(hooks(s).cannotDefend!(s, get(s, beetle.id)!, hero), false);
  const other = engaged(s, E.spawn);
  hero.damage = 1;
  assert.equal(hooks(s).cannotAttack!(s, hero, other), false);
});

test("Nightmare: the players must travel to Rocky Foothills, which gets +2 quest points for each quest in play; its shadow adds the defender's damage", () => {
  let s = board();
  const foothills = stage(s, N.foothills);
  const road = stage(s, ROAD);
  s.phase = "travel";
  assert.equal(hooks(s).mustTravel!(s), true);
  assert.match(canTravel(s, road)!, /Rocky Foothills/);
  assert.equal(canTravel(s, foothills), null);
  assert.equal(locationQuest(s, foothills), 4);
  stage(s, E.lieLow);
  assert.equal(locationQuest(s, foothills), 6);
  s.activeLocation = make(s, ROAD);
  assert.equal(hooks(s).mustTravel!(s), false, "no option to travel");
  // Its shadow.
  s = board();
  const enemy = engaged(s, E.spawn);
  s.heroes[0].damage = 2;
  shadow(s, enemy, N.foothills, s.heroes[0]);
  assert.equal(s.combat!.attackBonus, 2);
});

test("Nightmare: Vast Troll-fells makes each player spend 1 resource to travel to a safe location, keeps heroes from gaining resources by card effects, and its shadow adds +4 [attack] without side quest progress this round", () => {
  let s = board(2);
  stage(s, N.vastFells);
  const safe = stage(s, E.woods);
  forOwner(s, 1, () => s.heroes.forEach((h) => (h.resources = 0)));
  s.phase = "travel";
  assert.match(canTravel(s, safe)!, /Vast Troll-fells/);
  forOwner(s, 1, () => (s.heroes[1].resources = 1));
  assert.equal(canTravel(s, safe), null);
  const before = seatView(s, 0).heroes.reduce((n, h) => n + h.resources, 0);
  s = run(applyAction(reload(s), { type: "TRAVEL", id: safe.id }));
  assert.equal(
    seatView(s, 0).heroes.reduce((n, h) => n + h.resources, 0),
    before - 1,
    "1 spent; Patch of Woods' travel response then gains nothing",
  );
  assert.equal(seatView(s, 1).heroes[1].resources, 0);
  // No resource gain from a card effect.
  s = board();
  stage(s, N.vastFells);
  const hero = s.heroes[0];
  assert.equal(hooks(s).cannotGainResources!(s, hero), true);
  flush(queue(s, fx("resource", { target: hero.id, value: 2 })));
  assert.equal(hero.resources, 10);
  // Its shadow.
  s = board();
  const enemy = engaged(s, E.spawn);
  shadow(s, enemy, N.vastFells, s.heroes[0]);
  assert.equal(s.combat!.attackBonus, 4);
  s = board();
  const side = stage(s, E.lieLow);
  addQuestProgress(s, side, 1);
  assert.equal(s.nightmare!.ettenSideProgress, s.round);
  const foe = engaged(s, E.spawn);
  shadow(s, foe, N.vastFells, s.heroes[0]);
  assert.equal(s.combat!.attackBonus, 0);
});

test("Nightmare: Crashing Thunder has each player assign X damage (the quests in play) and exhausts each damaged character; its shadow shuffles the Weather cards back", () => {
  let s = board(2);
  stage(s, E.lieLow);
  const elsewhere = seatView(s, 1).heroes[2];
  forOwner(s, 1, () => (s.heroes[2].damage = 1));
  s.phase = "quest";
  s = run(reveal(s, N.thunder));
  for (const p of playerOrder(s)) {
    const heroes = seatView(s, p).heroes;
    const dealt = heroes.reduce((n, h) => n + h.damage, 0) - (p === 1 ? 1 : 0);
    assert.equal(dealt, 2, `player ${p} assigned 2 damage`);
    for (const h of heroes) assert.equal(h.exhausted, h.damage > 0);
  }
  assert.ok(get(s, elsewhere.id)!.exhausted);
  assert.ok(s.encounterDiscard.includes(N.thunder));
  // Its shadow.
  s = board();
  s.encounterDiscard = [W.wind, ROAD, N.thunder];
  s.encounterDeck = [ROAD];
  const enemy = engaged(s, E.spawn);
  shadow(s, enemy, N.thunder, s.heroes[0]);
  assert.deepEqual(s.encounterDiscard, [ROAD]);
  assert.deepEqual(
    [...s.encounterDeck].sort(),
    [ROAD, W.wind, N.thunder].sort(),
  );
});

test("Nightmare: Barren and Desolate surges and attaches to a side quest (limit 1 per quest), giving each character -1 [willpower] while it is the current quest", () => {
  let s = board();
  const lie = stage(s, E.lieLow);
  const forage = stage(s, E.forage);
  s.encounterDeck = [ROAD, ROAD];
  s.phase = "quest";
  s = run(reveal(s, N.barren), (x) =>
    options(x).includes(forage.id) ? forage.id : undefined,
  );
  assert.deepEqual(
    get(s, forage.id)!.attachments.map((a) => a.code),
    [N.barren],
  );
  assert.equal(s.encounterDeck.length, 1, "Surge");
  const hero = s.heroes[0];
  const will = hooks(s).stats!(s, hero).will ?? 0;
  assert.equal(will, 0, "not the current quest");
  s.phase = "quest";
  sideQuestStart(s);
  flush(s);
  s = choose(reload(s), forage.id);
  assert.equal(hooks(s).stats!(s, s.heroes[0]).will, -1);
  // The limit: a second copy goes to the other side quest, a third is discarded.
  s = board();
  const only = stage(s, E.lieLow);
  only.attachments.push({ id: "b1", code: N.barren, exhausted: false });
  s.encounterDeck = [ROAD, ROAD];
  s = run(reveal(s, N.barren));
  assert.equal(only.attachments.length, 1);
  assert.ok(s.encounterDiscard.includes(N.barren));
  void lie;
});

test("Nightmare: Isolated surges and keeps the players from drawing by card effects (not at a safe location); when it is defeated, each player draws 1 card", () => {
  let s = board(2);
  s.encounterDeck = [ROAD, ROAD];
  s.phase = "quest";
  for (const p of playerOrder(s))
    forOwner(s, p, () => (s.deck = Array<string>(5).fill(SCOUT)));
  s = run(reveal(s, N.isolated));
  const isolated = s.staging.find((u) => u.code === N.isolated)!;
  assert.equal(s.encounterDeck.length, 1, "Surge");
  assert.equal(hooks(s).cannotDraw!(s), true);
  flush(queue(s, fx("draw", { value: 1, player: 0 })));
  assert.equal(seatView(s, 0).hand.length, 0);
  // At a safe location its text is blank.
  s.activeLocation = make(s, E.cave);
  assert.equal(hooks(s).cannotDraw!(s), false);
  s.activeLocation = null;
  // Defeated: each player draws 1 card.
  isolated.progress = 6;
  addQuestProgress(s, get(s, isolated.id)!, 1);
  s = run(s);
  assert.ok(!s.staging.some((u) => u.id === isolated.id));
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).hand.length),
    [1, 1],
  );
});

test("Nightmare: Rescue from the Trolls takes each player's lowest-threat-cost hero out of play, gains 3 progress as a Troll enemy is destroyed, and gives the heroes back when it is defeated", () => {
  let s = board(2);
  s.phase = "quest";
  const [, theodred] = seatView(s, 0).heroes;
  const thalin = seatView(s, 1).heroes.find((h) => h.code === "01006")!;
  s = run(reveal(s, N.rescue), (x) =>
    options(x).includes(thalin.id) ? thalin.id : undefined,
  );
  const rescue = s.staging.find((u) => u.code === N.rescue)!;
  assert.deepEqual(
    s.nightmare!.ettenRescue!.map((r) => r.unit.code).sort(),
    [theodred.code, thalin.code].sort(),
    "Théodred (8) and the chosen Thalin (9, tied with Legolas)",
  );
  assert.ok(!seatView(s, 0).heroes.some((h) => h.code === theodred.code));
  assert.ok(valid(s));
  // A Troll enemy is destroyed: 3 progress.
  const troll = s.staging[s.staging.push(make(s, E.spawn)) - 1];
  destroy(s, troll);
  s = run(s);
  assert.equal(get(s, rescue.id)!.progress, 3);
  // Defeated: the heroes come back.
  addQuestProgress(s, get(s, rescue.id)!, 12);
  s = run(s);
  assert.ok(seatView(s, 0).heroes.some((h) => h.code === theodred.code));
  assert.ok(seatView(s, 1).heroes.some((h) => h.code === thalin.code));
  assert.equal(s.nightmare!.ettenRescue, undefined);
  assert.ok(valid(s));
  // Defeated with its text blank at a safe location: they are discarded.
  s = board();
  s = run(reveal(s, N.rescue));
  const r = s.staging.find((u) => u.code === N.rescue)!;
  const lost = s.nightmare!.ettenRescue![0].unit.code;
  s.activeLocation = make(s, E.cave);
  addQuestProgress(s, get(s, r.id)!, 15);
  s = run(s);
  assert.ok(s.discard.includes(lost));
  assert.ok(!s.heroes.some((h) => h.code === lost));
  check(s);
});

test("Nightmare: Across the Ettenmoors' Nightmare state survives saves, malformed state is refused, and seeded games finish with valid saves", () => {
  let s = board();
  s = run(reveal(s, N.rescue));
  const side = stage(s, E.lieLow);
  addQuestProgress(s, side, 1);
  assert.deepEqual(reload(s).nightmare, s.nightmare);
  const broken = (f: (x: GameState) => void) => {
    const x = JSON.parse(JSON.stringify(s)) as GameState;
    f(x);
    return valid(x);
  };
  assert.equal(
    broken((x) => (x.nightmare!.ettenSideProgress = 99)),
    false,
  );
  assert.equal(
    broken((x) => (x.nightmare!.ettenRescue![0].questId = "nowhere")),
    false,
  );
  assert.equal(
    broken((x) => (x.nightmare!.ettenRescue![0].unit.code = SCOUT)),
    false,
  );
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 4000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
    assert.ok(valid(g));
  }
  const g2 = autoplay(two(3), 5000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
  assert.ok(valid(g2));
});
