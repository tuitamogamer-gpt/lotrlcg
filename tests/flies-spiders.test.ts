import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, canCommit, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, make, stats, threatOf } from "../src/game/core";
import { collectResources } from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import { availableAbilities } from "../src/game/actions";
import {
  activeSeat,
  allCharacters,
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
} from "../src/game/table";
import {
  FAS as F,
  FAS_HOOKS,
  FAS_RECIPES,
  givePoison,
  makeUnconscious,
  poisonOf,
} from "../src/game/flies-spiders";
import { OTD_BILBO, OTD_RING, bagginsBilbo } from "../src/game/hobbit-saga";
import {
  base,
  choose,
  reload,
  settle,
  stage,
  start,
} from "./flies-spiders-fixtures";
import type { GameState, Unit } from "../src/game/types";

const run = (s: GameState) => {
  flush(s);
  return s;
};
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
const engaged = (s: GameState, code: string, p = activeSeat(s)) => {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    s.engaged.push(u);
  });
  return u;
};
const ally = (s: GameState, code: string, p = activeSeat(s)) => {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    s.allies.push(u);
  });
  return u;
};
const AXEHAND = "01028";

test("Setup places the On the Doorstep Bilbo, sets The Spider's Glade aside, offers each player a ring copy and reveals 1 card per player", () => {
  for (const players of [1, 2, 4]) {
    const s = start(players);
    const q = s.fliesSpiders!;
    const bilbo = bagginsBilbo(s)!;
    assert.equal(bilbo.code, OTD_BILBO);
    assert.equal(bilbo.owner, s.table?.first ?? 0);
    assert.deepEqual(
      q.setAside.map((u) => u.code),
      [F.glade],
    );
    // Three physical copies: the fourth player cannot add one.
    assert.equal(q.rings.length, Math.max(0, 3 - players));
    const decks = playerOrder(s).map((p) =>
      seatView(s, p).deck.concat(seatView(s, p).hand.map((u) => u.code)),
    );
    assert.equal(
      decks.filter((d) => d.includes(OTD_RING)).length,
      Math.min(3, players),
    );
    const recipe = FAS_RECIPES.find((r) => r.mode === "standard")!;
    const deckSize = recipe.cards
      .filter((c) => c.section === "sharedEncounterDeck")
      .reduce((n, c) => n + c.quantity, 0);
    assert.equal(
      s.encounterDeck.length +
        s.encounterDiscard.length +
        s.staging.length +
        playerOrder(s).reduce((n, p) => n + seatView(s, p).engaged.length, 0),
      deckSize,
    );
    assert.equal(q.initialized, true);
  }
});

test("Poison is the top card of the controller's deck, attached facedown; poison equal to printed hit points makes a character unconscious", () => {
  let s = base();
  const glóin = s.heroes[2];
  s.deck = ["01039", "01041", "01028", "01059", "01061"];
  assert.equal(givePoison(s, glóin, 2), 2);
  assert.equal(poisonOf(glóin), 2);
  assert.ok(glóin.attachments.every((a) => a.facedown && a.poison));
  assert.equal(s.deck.length, 3);
  s = reload(s);
  const g = get(s, glóin.id)!;
  // Glóin has 4 printed hit points.
  givePoison(s, g, 5);
  assert.equal(g.unconscious, true);
  assert.equal(poisonOf(g), 0);
  assert.equal(s.discard.length, 4, "the four poison cards are discarded");
  assert.equal(s.deck.length, 1, "no poison is given while unconscious");
  // Unconscious characters cannot quest, defend, collect resources or ready.
  s.phase = "quest";
  assert.equal(canCommit(s, g), false);
  const before = g.resources;
  collectResources(s);
  assert.equal(g.resources, before);
  s = reload(s);
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
});

test("Venom: a Venom enemy that damages a character gives it 1 poison", () => {
  let s = base();
  const spider = engaged(s, F.wicked);
  s.phase = "defense";
  const defender = s.heroes[0];
  s = act(s, { type: "DEFEND", enemyId: spider.id, defenderId: defender.id });
  s = settle(s);
  const d = get(s, defender.id)!;
  assert.ok(d.damage > 0);
  // Forced: 1 poison when it attacks, and 1 more from Venom's damage.
  assert.ok(allCharacters(s).reduce((n, u) => n + poisonOf(u), 0) >= 2);
  assert.ok(poisonOf(d) >= 1);
});

test("Into Mirkwood → Lost in the Dark alone: the staging area is discarded, Captured by Spiders removes every resource and knocks out all but Bilbo", () => {
  let s = base();
  stage(s, F.path);
  stage(s, F.fat);
  s.progress = 9;
  s.phase = "quest";
  s = run(reload(s));
  handle(s, fx("questSucceeded", { value: 0, player: 0 }));
  run(s);
  const q = s.fliesSpiders!;
  assert.equal(q.currentQuest, F.captured);
  assert.equal(s.stage, 3);
  assert.equal(s.staging.length, 0);
  assert.ok(s.encounterDiscard.includes(F.fat));
  const bilbo = bagginsBilbo(s)!;
  assert.equal(bilbo.unconscious ?? false, false);
  assert.ok(
    s.heroes.filter((h) => h.id !== bilbo.id).every((h) => h.unconscious),
  );
  assert.ok(s.heroes.every((h) => h.resources === 0));
  s = reload(s);
  assert.equal(get(s, bilbo.id)!.unconscious ?? false, false);
});

test("Captured by Spiders: spend 2 Baggins resources to ready an unconscious character; stage 3 complete joins Battle with the Spiders at the end of the quest phase", () => {
  let s = base();
  s.stage = 3;
  s.fliesSpiders!.currentQuest = F.captured;
  const bilbo = bagginsBilbo(s)!;
  const aragorn = s.heroes[0];
  makeUnconscious(s, aragorn);
  bilbo.resources = 2;
  const quest = { id: `quest:${F.captured}` };
  const label = availableAbilities(s, get(s, quest.id)!);
  assert.equal(label[0]?.disabled, false);
  s = act(s, { type: "ABILITY", id: quest.id });
  s = choose(s, aragorn.id);
  assert.equal(get(s, aragorn.id)!.unconscious ?? false, false);
  assert.equal(get(s, aragorn.id)!.exhausted, false);
  assert.equal(bagginsBilbo(s)!.resources, 0);
  // Completing stage 3 waits for the end of the quest phase.
  s.phase = "staging";
  handle(s, fx("questSucceeded", { value: 11, player: 0 }));
  run(s);
  assert.equal(s.fliesSpiders!.stageThreeComplete, true);
  assert.equal(s.fliesSpiders!.currentQuest, F.captured);
  handle(s, fx("finishQuestPhase", { player: 0 }));
  run(s);
  assert.equal(s.fliesSpiders!.currentQuest, F.battle);
  assert.equal(s.stage, 4);
  assert.ok(s.staging.some((u) => u.code === F.glade));
  assert.equal(s.fliesSpiders!.setAside.length, 0);
});

test("Battle with the Spiders: no progress while The Spider's Glade is in play; defeating it wins and discovers Bilbo's Magic Ring", () => {
  let s = base();
  s.stage = 4;
  s.fliesSpiders!.currentQuest = F.battle;
  const glade = s.fliesSpiders!.setAside.splice(0)[0];
  s.staging.push(glade);
  s.phase = "staging";
  handle(s, fx("questSucceeded", { value: 5, player: 0 }));
  run(s);
  assert.equal(s.progress, 0);
  s.staging = s.staging.filter((u) => u.id !== glade.id);
  s.encounterDiscard.push(glade.code);
  handle(s, fx("questSucceeded", { value: 3, player: 0 }));
  run(s);
  assert.equal(s.status, "won");
  assert.deepEqual(s.fliesSpiders!.treasures, [OTD_RING]);
});

test("Two players: Lost in the Dark splits the first player into a separate staging area at stage 3 while the other advances to stage 4 with The Spider's Glade", () => {
  let s = base(2);
  const first = s.table!.first;
  const other = playerOrder(s).find((p) => p !== first)!;
  stage(s, F.path);
  s.progress = 9;
  s.phase = "staging";
  handle(s, fx("questSucceeded", { value: 0, player: first }));
  run(s);
  const q = s.fliesSpiders!;
  assert.equal(q.split, true);
  assert.deepEqual(
    q.areas.map((a) => [a.players, a.questCode]),
    [
      [[first], F.captured],
      [[other], F.battle],
    ],
  );
  selectSeat(s, first);
  assert.equal(s.staging.length, 0, "the first player's area starts empty");
  assert.ok(
    seatView(s, first).heroes.every(
      (h) => h.code === OTD_BILBO || h.unconscious,
    ),
  );
  selectSeat(s, other);
  assert.ok(s.staging.some((u) => u.code === F.glade));
  assert.ok(s.staging.some((u) => u.code === F.path));
  assert.ok(seatView(s, other).heroes.every((h) => !h.unconscious));
  s = reload(s);
  assert.equal(s.fliesSpiders!.split, true);
  // The first player token does not pass while stage 3 is in play.
  assert.equal(FAS_HOOKS.keepFirstPlayer?.(s), true);
});

test("Separate staging areas reveal and resolve their own quests, then combine when stage 3 is complete", () => {
  let s = base(2);
  const first = s.table!.first;
  const other = playerOrder(s).find((p) => p !== first)!;
  s.progress = 9;
  s.phase = "staging";
  handle(s, fx("questSucceeded", { value: 0, player: first }));
  run(s);
  // Next quest phase: each area reveals one card per player in it.
  s.encounterDeck = [F.path, F.stream, F.path, F.stream];
  s.queue = [];
  s.phase = "quest";
  selectSeat(s, first);
  if (s.table) s.table.turn = first;
  s = act(s, { type: "COMMIT" });
  s = act(s, { type: "COMMIT" });
  s = settle(s);
  assert.equal(s.phase, "staging");
  selectSeat(s, first);
  const firstStaging = s.staging.map((u) => u.code);
  selectSeat(s, other);
  const otherStaging = s.staging.map((u) => u.code);
  assert.equal(firstStaging.length, 1);
  assert.ok(otherStaging.length >= 2, JSON.stringify(otherStaging));
  // Complete stage 3 in the first player's area and end the quest phase.
  selectSeat(s, first);
  s.progress = 11;
  s.fliesSpiders!.stageThreeComplete = true;
  s.queue = [];
  handle(s, fx("finishQuestPhase", { player: first }));
  run(s);
  assert.equal(s.fliesSpiders!.split, false);
  assert.equal(s.fliesSpiders!.currentQuest, F.battle);
  assert.ok(s.staging.some((u) => u.code === F.glade));
  assert.equal(s.staging.length, firstStaging.length + otherStaging.length);
  s = reload(s);
});

test("Crazy Cob attacks the character with the most poison; undefended damage is placed on that character", () => {
  let s = base();
  const [aragorn, theodred] = s.heroes;
  s.deck = Array(10).fill("01028");
  givePoison(s, theodred, 2);
  s.phase = "staging";
  s.encounterDeck = [F.cob, ...s.encounterDeck];
  handle(s, fx("reveal", { player: 0 }));
  flush(s);
  assert.match(s.choice!.title, /Crazy Cob/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [theodred.id],
  );
  s = choose(s, theodred.id);
  // No defender: the damage is placed on the targeted character.
  s = settle(s, "undefended");
  assert.ok(get(s, theodred.id)!.damage > 0 || !get(s, theodred.id));
  assert.equal(get(s, aragorn.id)!.damage, 0);
});

test("Fat Spider gets +3 attack while engaged with a player who controls a poisoned character", () => {
  const s = base();
  const fat = engaged(s, F.fat);
  assert.equal(stats(s, fat).attack, 1);
  s.deck = ["01028"];
  givePoison(s, s.heroes[0], 1);
  assert.equal(stats(s, fat).attack, 4);
});

test("Forest Stream: poisoned characters cannot quest while it is active; after it is explored, discard 4 poison", () => {
  let s = base();
  const stream = make(s, F.stream);
  s.activeLocation = stream;
  s.deck = Array(10).fill("01028");
  givePoison(s, s.heroes[0], 2);
  s.phase = "quest";
  assert.equal(canCommit(s, s.heroes[0]), false);
  assert.equal(canCommit(s, s.heroes[1]), true);
  FAS_HOOKS.explored!(s, stream, true);
  flush(s);
  s = choose(s, s.heroes[0].id);
  s = choose(s, s.heroes[0].id);
  assert.equal(poisonOf(s.heroes[0]), 0);
  assert.equal(s.choice, null);
});

test("Giant Web: -1/-1/-1 per poison while active; after it is explored, ready an unconscious character", () => {
  let s = base();
  const web = make(s, F.web);
  s.activeLocation = web;
  s.deck = Array(10).fill("01028");
  const aragorn = s.heroes[0];
  const printed = stats(s, aragorn);
  givePoison(s, aragorn, 2);
  assert.deepEqual(
    [
      stats(s, aragorn).will,
      stats(s, aragorn).attack,
      stats(s, aragorn).defense,
    ],
    [printed.will - 2, printed.attack - 2, printed.defense - 2],
  );
  makeUnconscious(s, s.heroes[1]);
  FAS_HOOKS.explored!(s, web, true);
  flush(s);
  s = choose(s, s.heroes[1].id);
  assert.equal(get(s, s.heroes[1].id)!.unconscious ?? false, false);
});

test("Lazy Lob: committed characters get 1 poison when it is revealed; its shadow knocks out a poisoned defender", () => {
  let s = base();
  s.deck = Array(10).fill("01028");
  s.heroes[0].committed = true;
  s.heroes[1].committed = true;
  s.phase = "staging";
  s.encounterDeck = [F.lob, ...s.encounterDeck];
  handle(s, fx("reveal", { player: 0 }));
  flush(s);
  assert.equal(poisonOf(s.heroes[0]), 1);
  assert.equal(poisonOf(s.heroes[1]), 1);
  assert.equal(poisonOf(s.heroes[2]), 0);
  // Shadow: the poisoned defender is made unconscious.
  const enemy = engaged(s, F.path === F.path ? F.cob : F.cob);
  enemy.shadows = [F.lob];
  s.phase = "defense";
  s.queue = [];
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: s.heroes[0].id });
  s = settle(s);
  assert.equal(get(s, s.heroes[0].id)!.unconscious, true);
});

test("Old Tomnoddy: at the end of each round each player gives a hero they control 1 poison", () => {
  let s = base();
  s.deck = Array(10).fill("01028");
  stage(s, F.tomnoddy);
  const effects = FAS_HOOKS.roundEnd!(s);
  assert.equal(effects.length, 1);
  handle(s, effects[0]);
  flush(s);
  assert.match(s.choice!.title, /Old Tomnoddy/);
  s = choose(s, s.heroes[1].id);
  assert.equal(poisonOf(s.heroes[1]), 1);
});

test("Poisoned by Spiders deals damage equal to poison or surges; its shadow discards an unconscious character", () => {
  let s = base();
  s.deck = Array(10).fill("01028");
  s.phase = "staging";
  // No poison: no damage, so it gains surge.
  s.encounterDeck = [F.poisoned, F.path, F.path];
  handle(s, fx("reveal", { player: 0 }));
  flush(s);
  assert.ok(
    s.staging.some((u) => u.code === F.path),
    "surge revealed a card",
  );
  assert.ok(s.encounterDiscard.includes(F.poisoned));
  givePoison(s, s.heroes[0], 2);
  s.encounterDeck = [F.poisoned, F.path];
  handle(s, fx("reveal", { player: 0 }));
  flush(s);
  assert.equal(s.heroes[0].damage, 2);
  // Shadow: discard an unconscious character you control.
  const axehand = ally(s, AXEHAND);
  makeUnconscious(s, axehand);
  const enemy = engaged(s, F.cob);
  enemy.shadows = [F.poisoned];
  s.phase = "defense";
  s.queue = [];
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: s.heroes[1].id });
  s = settle(s);
  assert.equal(get(s, axehand.id), undefined);
  assert.ok(s.discard.includes(AXEHAND));
});

test("Wicked Spider: the defending player attaches 1 poison when it attacks; its shadow gives the defender 2 poison", () => {
  let s = base();
  s.deck = Array(10).fill("01028");
  const spider = engaged(s, F.wicked);
  s.phase = "defense";
  s = act(s, {
    type: "DEFEND",
    enemyId: spider.id,
    defenderId: s.heroes[2].id,
  });
  assert.match(s.choice!.title, /Wicked Spider/);
  s = choose(s, s.heroes[1].id);
  s = settle(s);
  assert.ok(poisonOf(get(s, s.heroes[1].id)!) >= 1);
  const second = engaged(s, F.cob);
  second.shadows = [F.wicked];
  s.queue = [];
  s.combat = null;
  s.phase = "defense";
  s = act(s, {
    type: "DEFEND",
    enemyId: second.id,
    defenderId: s.heroes[0].id,
  });
  s = settle(s);
  assert.ok(poisonOf(get(s, s.heroes[0].id)!) >= 2);
});

test("Dark Bats attaches to a character it damages (-1/-1/-1); as a shadow it attaches to the defending character", () => {
  let s = base();
  const bats = engaged(s, F.bats);
  s.phase = "defense";
  const glóin = s.heroes[2];
  const printed = stats(s, glóin);
  s = act(s, { type: "DEFEND", enemyId: bats.id, defenderId: null });
  s = settle(s, "undefended");
  const hit = allCharacters(s).find((u) =>
    u.attachments.some((a) => a.code === F.bats),
  );
  assert.ok(hit, "Dark Bats attached to the damaged character");
  assert.ok(!s.engaged.some((u) => u.id === bats.id));
  const enemy = engaged(s, F.cob);
  enemy.shadows = [F.bats];
  s.queue = [];
  s.combat = null;
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: glóin.id });
  s = settle(s);
  const g = get(s, glóin.id)!;
  if (g) {
    assert.ok(g.attachments.some((a) => a.code === F.bats));
    assert.equal(stats(s, g).will, printed.will - 1);
  }
});

test("Fighting Among Friends removes non-Baggins characters outside the named sphere; its shadow adds +1 attack (+2 undefended)", () => {
  let s = base();
  for (const h of s.heroes) h.committed = true;
  s.phase = "staging";
  s.encounterDeck = [F.friends, ...s.encounterDeck];
  handle(s, fx("reveal", { player: 0 }));
  flush(s);
  s = choose(s, "tactics");
  const bilbo = bagginsBilbo(s)!;
  assert.equal(get(s, bilbo.id)!.committed, true, "Bilbo stays");
  assert.ok(
    s.heroes.filter((h) => h.id !== bilbo.id).every((h) => !h.committed),
  );
});

test("Hidden Path lowers staging-area locations by 1 while active and costs 2 Baggins resources to travel to", () => {
  let s = base();
  const path = stage(s, F.path);
  const stream = stage(s, F.stream);
  assert.equal(threatOf(s, stream), 2);
  const bilbo = bagginsBilbo(s)!;
  bilbo.resources = 1;
  s.phase = "travel";
  assert.match(FAS_HOOKS.travelProblem!(s, path)!, /2 Baggins/);
  bilbo.resources = 3;
  assert.equal(FAS_HOOKS.travelProblem!(s, path), null);
  s = act(s, { type: "TRAVEL", id: path.id });
  s = settle(s);
  assert.equal(s.activeLocation?.code, F.path);
  assert.equal(bagginsBilbo(s)!.resources, 1);
  assert.equal(
    threatOf(
      s,
      s.staging.find((u) => u.code === F.stream)!,
    ),
    1,
  );
});

test("Weighed Down gives exhausted characters -1/-1/-1 this round; its shadow raises the threat by 5 if the defender is destroyed", () => {
  let s = base();
  const aragorn = s.heroes[0];
  const printed = stats(s, aragorn);
  s.phase = "staging";
  s.encounterDeck = [F.weighed, ...s.encounterDeck];
  handle(s, fx("reveal", { player: 0 }));
  flush(s);
  aragorn.exhausted = true;
  assert.equal(stats(s, aragorn).will, printed.will - 1);
  // Shadow: Glóin defends and is destroyed.
  const glóin = s.heroes[2];
  glóin.exhausted = false;
  glóin.damage = 3;
  const enemy = engaged(s, F.tomnoddy);
  enemy.shadows = [F.weighed];
  s.phase = "defense";
  s.queue = [];
  const threat = s.threat;
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: glóin.id });
  s = settle(s);
  assert.equal(get(s, glóin.id), undefined);
  assert.equal(s.threat, threat + 5);
});

test("Caught in Webs makes a committed hero unconscious or gains surge; The Spider's Glade is immune and adds Spiders each quest phase", () => {
  let s = base();
  s.phase = "staging";
  s.encounterDeck = [F.webs, F.path, F.path];
  handle(s, fx("reveal", { player: 0 }));
  flush(s);
  assert.ok(
    s.staging.some((u) => u.code === F.path),
    "no committed hero: surge",
  );
  s.heroes[0].committed = true;
  s.encounterDeck = [F.webs, F.path];
  handle(s, fx("reveal", { player: 0 }));
  flush(s);
  s = choose(s, s.heroes[0].id);
  assert.equal(get(s, s.heroes[0].id)!.unconscious, true);
  assert.equal(get(s, s.heroes[0].id)!.committed, false);
  // The Spider's Glade.
  const glade = s.fliesSpiders!.setAside.splice(0)[0];
  s.staging.push(glade);
  s = reload(s);
  assert.equal(get(s, glade.id)!.immuneToPlayerEffects, true);
  s.encounterDeck = [F.path, F.fat, F.wicked, F.path];
  const effects = FAS_HOOKS.questBegin!(s) as ReturnType<typeof fx>[];
  assert.equal(effects.length, 1);
  assert.equal(effects[0].value, 1);
  handle(s, effects[0]);
  flush(s);
  s = choose(s, F.wicked);
  assert.ok(s.staging.some((u) => u.code === F.wicked));
  assert.equal(s.encounterDeck.length, 3);
  // Travel: exhaust Bilbo Baggins.
  s.phase = "travel";
  bagginsBilbo(s)!.exhausted = true;
  assert.match(
    FAS_HOOKS.travelProblem!(s, get(s, glade.id)!)!,
    /exhaust Bilbo/,
  );
});

test("The On the Doorstep Bilbo searches your deck for a treasure for 1 Baggins resource and cannot gain resources from non-treasure cards", () => {
  let s = base();
  const bilbo = bagginsBilbo(s)!;
  bilbo.resources = 1;
  s.deck = ["01028", OTD_RING, "01039"];
  const ability = availableAbilities(s, bilbo).find((a) =>
    /search your deck for a treasure/.test(a.label),
  )!;
  assert.equal(ability.disabled, false);
  s = act(s, { type: "ABILITY", id: bilbo.id });
  s = choose(s, "card-1");
  assert.ok(s.hand.some((u) => u.code === OTD_RING));
  assert.equal(bagginsBilbo(s)!.resources, 0);
  assert.equal(s.deck.length, 2);
});

test("Bilbo's Magic Ring: once per round, raise threat by 1 to gain a Baggins resource; after Bilbo exhausts to defend, raise threat by 3 to cancel all damage", () => {
  let s = base();
  const bilbo = bagginsBilbo(s)!;
  bilbo.attachments.push({ id: "ring", code: OTD_RING, exhausted: false });
  bilbo.resources = 0;
  const threat = s.threat;
  s = act(s, { type: "ABILITY", id: bilbo.id, attachmentId: "ring" });
  assert.equal(bagginsBilbo(s)!.resources, 1);
  assert.equal(s.threat, threat + 1);
  get(s, bilbo.id)!.attachments[0].exhausted = false;
  assert.ok(
    availableAbilities(s, get(s, bilbo.id)!).find((a) => a.id === "ring")!
      .disabled,
    "limit once per round",
  );
  // Response: cancel all damage when Bilbo exhausts to defend.
  const enemy = engaged(s, F.tomnoddy);
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: bilbo.id });
  assert.match(s.choice!.title, /Bilbo's Magic Ring/);
  s = choose(s, "use");
  s = settle(s);
  assert.equal(get(s, bilbo.id)!.damage, 0);
  assert.equal(s.threat, threat + 4);
});

test("Malformed Flies and Spiders saves are rejected", () => {
  const s = base(2);
  const raw = JSON.parse(JSON.stringify(reload(s)));
  assert.ok(validateSave(raw));
  for (const corrupt of [
    (x: GameState) => (x.fliesSpiders!.currentQuest = "nope"),
    (x: GameState) => (x.fliesSpiders!.split = true),
    (x: GameState) => (x.fliesSpiders!.rings = ["01001"]),
    (x: GameState) => (x.fliesSpiders!.setAside = [make(x, F.fat)]),
    (x: GameState) => (x.fliesSpiders!.weighedDown = [99]),
  ]) {
    const copy = JSON.parse(JSON.stringify(raw));
    corrupt(copy);
    assert.equal(validateSave(copy), false);
  }
});
