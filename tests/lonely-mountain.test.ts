import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  canTravel,
  playCost,
  playTargets,
  validateSave,
} from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  fx,
  get,
  make,
  stats,
  threatOf,
  spendResources,
} from "../src/game/core";
import { damage } from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import { availableAbilities } from "../src/game/actions";
import { consideredEngaged } from "../src/game/considered-engagement";
import {
  activeSeat,
  allCharacters,
  forOwner,
  seatView,
  selectSeat,
} from "../src/game/table";
import {
  BURGLES,
  TLM as T,
  TLM_HOOKS,
  TLM_RECIPES,
} from "../src/game/lonely-mountain";
import { EREBOR, ereborAttackBonus } from "../src/game/erebor-treasures";
import {
  EREBOR_TREASURES,
  OTD_BILBO,
  OTD_RING,
  HOBBIT_TREASURES,
  bagginsBilbo,
  scenarioTreasures,
} from "../src/game/hobbit-saga";
import {
  base,
  choose,
  deck,
  hand,
  reload,
  settle,
  stage,
  start,
} from "./lonely-mountain-fixtures";
import type { GameState, Unit } from "../src/game/types";

const run = (s: GameState) => {
  flush(s);
  return s;
};
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
const golden = (s: GameState) => s.staging.find((u) => u.code === T.golden);
const magnificent = (s: GameState) =>
  s.staging.find((u) => u.code === T.magnificent);
const mountain = (s: GameState) =>
  s.staging.find((u) => u.code === T.mountain)!;
const engaged = (s: GameState, code: string, p = activeSeat(s)) => {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    s.engaged.push(u);
  });
  return u;
};
const questSucceeded = (s: GameState, value = 1) => {
  s.phase = "quest";
  handle(s, fx("questSucceeded", { value, player: 0 }));
  return run(s);
};
const GUARD = "01013"; // Guard of the Citadel: leadership ally, cost 2
const EVER = "01020"; // Ever Vigilant: leadership event, cost 1
const SCOUT = "01016"; // Snowbourn Scout: leadership ally, cost 1
const AXEHAND = "01028"; // Veteran Axehand: tactics ally, cost 2
/** Move straight to stage 3 with Smaug the Magnificent and A Bare Patch staged. */
function stageThree(s: GameState) {
  handle(s, fx("tlmStageThree", { player: 0 }));
  return run(s);
}

test("Setup stages Smaug the Golden and The Lonely Mountain over the five Erebor treasures, sets Smaug the Magnificent and A Bare Patch aside and skips stage 1's quest phase", () => {
  for (const easy of [false, true]) {
    const s = start(1, easy);
    const q = s.lonelyMountain!;
    assert.equal(q.currentQuest, T.welcome);
    assert.equal(s.stage, 1);
    assert.deepEqual(
      s.staging.map((u) => u.code).sort(),
      [T.golden, T.mountain].sort(),
    );
    assert.deepEqual([...q.stack].sort(), [...EREBOR_TREASURES].sort());
    assert.deepEqual(
      q.setAside.map((u) => u.code).sort(),
      [T.magnificent, T.patch].sort(),
    );
    const recipe = TLM_RECIPES.find(
      (r) => r.mode === (easy ? "easy" : "standard"),
    )!;
    assert.equal(
      s.encounterDeck.length,
      recipe.cards
        .filter((c) => c.section === "sharedEncounterDeck")
        .reduce((n, c) => n + c.quantity, 0),
    );
    assert.equal(s.encounterDeck.length, easy ? 24 : 35);
    assert.equal(bagginsBilbo(s)?.code, OTD_BILBO);
    assert.equal(TLM_HOOKS.skipQuestPhase!(s), true);
  }
});

test("A Warm Welcome: the first round has no quest phase and its Forced effect advances to stage 2 at the end of the round", () => {
  let s = start();
  assert.equal(s.round, 1);
  for (let n = 0; s.round === 1 && s.status === "playing"; n++) {
    assert.ok(n < 60, "round 1 ends");
    assert.notEqual(s.phase, "staging", "no staging step in round 1");
    s =
      s.choice || s.flow?.pending
        ? settle(s)
        : act(
            s,
            s.phase === "quest"
              ? { type: "COMMIT" }
              : s.phase === "attack"
                ? { type: "END_ATTACKS" }
                : { type: "NEXT" },
          );
  }
  assert.equal(s.lonelyMountain!.currentQuest, T.burglar);
  assert.equal(s.stage, 2);
  assert.equal(s.encounterDeck.length, 35, "no encounter card was revealed");
});

test("The Lonely Mountain gets -2 threat per stacked card, is immune and cannot leave the staging area while cards remain, and Secret Entrance halves its threat", () => {
  const s = base();
  const m = mountain(s);
  assert.equal(threatOf(s, m), 2);
  s.lonelyMountain!.stack = EREBOR_TREASURES.slice(0, 2);
  assert.equal(threatOf(s, m), 8);
  assert.equal(TLM_HOOKS.immune!(s, m), true);
  s.phase = "travel";
  assert.ok(canTravel(s, m), "it cannot be travelled to");
  s.activeLocation = make(s, T.entrance);
  assert.equal(threatOf(s, m), 4);
  s.activeLocation = null;
  s.lonelyMountain!.stack = [];
  assert.equal(threatOf(s, m), 12);
  assert.equal(TLM_HOOKS.immune!(s, m), false);
  assert.equal(canTravel(s, m), null);
  assert.equal(card(T.mountain).victory, 10);
});

test("Smaug the Golden: X threat counts committed non-Burglar characters; he cannot be engaged, is immune and indestructible", () => {
  const s = base();
  const g = golden(s)!;
  assert.equal(threatOf(s, g), 0);
  bagginsBilbo(s)!.committed = true;
  assert.equal(threatOf(s, g), 0, "Bilbo is a Burglar");
  s.heroes[0].committed = true;
  s.heroes[1].committed = true;
  assert.equal(threatOf(s, g), 2);
  assert.equal(TLM_HOOKS.cannotEngage!(s, g), true);
  assert.equal(TLM_HOOKS.immune!(s, g), true);
  damage(s, g.id, 30);
  run(s);
  assert.ok(golden(s), "Indestructible");
});

test("The Burglar's Turn: after questing successfully Smaug the Golden gains progress, a burgle attempt discards to the first burgle card, and success takes the top treasure and may advance to stage 3", () => {
  let s = base();
  const top = EREBOR.arkenstone;
  s.lonelyMountain!.stack = [top, EREBOR.cup];
  s.encounterDeck = [T.path, T.belching, T.path];
  deck(s, Array(4).fill(GUARD));
  hand(s, [GUARD, EVER]);
  s = questSucceeded(s, 3);
  assert.equal(golden(s)!.progress, 1);
  assert.deepEqual(s.encounterDiscard, [T.path, T.belching]);
  assert.match(s.choice!.title, /Belching Fire · Burgle attempt/);
  assert.equal(s.lonelyMountain!.burgle?.revealed, GUARD);
  s = choose(s, "discard");
  assert.ok(
    !s.hand.some((u) => u.code === GUARD),
    "the matching card is discarded",
  );
  assert.ok(s.discard.includes(GUARD));
  assert.ok(s.hand.some((u) => u.code === top));
  assert.deepEqual(s.lonelyMountain!.stack, [EREBOR.cup]);
  assert.deepEqual(s.lonelyMountain!.treasures, [top]);
  assert.match(s.choice!.title, /Advance to stage 3/);
  s = choose(s, "advance");
  s = settle(s);
  assert.equal(s.lonelyMountain!.currentQuest, T.inside);
  assert.equal(s.stage, 3);
  assert.equal(golden(s), undefined);
  assert.ok(s.lonelyMountain!.setAside.some((u) => u.code === T.golden));
  assert.equal(
    s.lonelyMountain!.setAside.find((u) => u.code === T.golden)!.progress,
    0,
  );
  assert.ok(magnificent(s));
  assert.ok(s.staging.some((u) => u.code === T.patch));
});

test("An unsuccessful burgle attempt at stage 2B makes Smaug the Golden attack the first player", () => {
  let s = base();
  s.encounterDeck = [T.hall, T.path, T.path];
  deck(s, Array(4).fill(GUARD));
  hand(s, [GUARD]);
  bagginsBilbo(s)!.resources = 0;
  s = questSucceeded(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["fail"],
    "Great Hall needs 3 matching cards",
  );
  s = choose(s, "fail");
  assert.match(s.choice!.title, /Smaug the Golden · Immediate attack/);
  const glóin = s.heroes[2];
  s = choose(s, glóin.id);
  s = settle(s);
  assert.ok(
    s.log.some(
      (l) => /Smaug the Golden/.test(l.text) && /attack/i.test(l.text),
    ),
  );
  assert.ok((get(s, glóin.id)?.damage ?? 99) > 0 || !get(s, glóin.id));
});

test("The Lonely Mountain: during a burgle attempt the first player may spend 2 Baggins resources to take the revealed card and reveal the next", () => {
  let s = base();
  s.encounterDeck = [T.belching, T.path];
  deck(s, Array(3).fill(GUARD));
  bagginsBilbo(s)!.resources = 2;
  s = questSucceeded(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["mountain", "fail"],
  );
  s = choose(s, "mountain");
  assert.equal(bagginsBilbo(s)!.resources, 0);
  assert.equal(s.hand.filter((u) => u.code === GUARD).length, 1);
  assert.equal(s.deck.length, 2);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["discard", "fail"],
  );
  s = choose(s, "discard");
  assert.equal(s.lonelyMountain!.treasures.length, 1);
  s = settle(s, "stay");
  assert.equal(s.lonelyMountain!.currentQuest, T.burglar);
});

test("Burgle effects match type, sphere and cost; more matching cards than needed are chosen one at a time", () => {
  let s = base();
  // Western Slopes: discard 2 cards that match the revealed card's sphere.
  s.encounterDeck = [T.slopes];
  deck(s, Array(3).fill(SCOUT));
  const [a, b] = hand(s, [GUARD, EVER, AXEHAND, GUARD]);
  s = questSucceeded(s);
  assert.match(s.choice!.description ?? "", /Leadership/);
  s = choose(s, "discard");
  assert.match(s.choice!.title, /Discard a matching card \(2 more\)/);
  assert.ok(!s.choice!.options.some((o) => o.code === AXEHAND));
  s = choose(s, a.id);
  s = choose(s, b.id);
  assert.deepEqual(
    s.hand.map((u) => u.code).sort(),
    [AXEHAND, GUARD, EREBOR_TREASURES[0]].sort(),
  );
  assert.equal(BURGLES[T.hall].cards, 3);
  assert.deepEqual(BURGLES[T.crows].items, ["sphere", "type"]);
});

test("Smaug the Golden's 6th progress token advances to stage 4A at once: he is set aside and Smaug the Magnificent enters the staging area", () => {
  let s = base();
  golden(s)!.progress = 5;
  s.encounterDeck = [T.belching];
  s = questSucceeded(s);
  assert.equal(s.choice, null, "stage 2B's burgle attempt no longer resolves");
  assert.equal(s.lonelyMountain!.currentQuest, T.thieves);
  assert.equal(s.stage, 4);
  assert.equal(golden(s), undefined);
  assert.equal(
    s.lonelyMountain!.setAside.find((u) => u.code === T.golden)!.progress,
    0,
  );
  assert.ok(magnificent(s));
  assert.equal(threatOf(s, magnificent(s)!), 6);
  assert.equal(TLM_HOOKS.consideredEngaged!(s, magnificent(s)!, 0), true);
  // Stage 4B: after its 7th progress token the quest resets to stage 2B.
  magnificent(s)!.damage = 5;
  s.phase = "quest";
  handle(s, fx("successfulQuestProgress", { value: 7, player: 0 }));
  run(s);
  assert.equal(s.lonelyMountain!.currentQuest, T.burglar);
  assert.equal(s.stage, 2);
  assert.equal(magnificent(s), undefined);
  assert.equal(
    s.lonelyMountain!.setAside.find((u) => u.code === T.magnificent)!.damage,
    0,
  );
  assert.equal(golden(s)!.progress, 0);
});

test("Inside Information: Smaug the Magnificent is considered engaged with the first player, attacks again when dealt a burgle shadow, and A Bare Patch lowers his defense by 3", () => {
  let s = base(2);
  s = stageThree(s);
  const m = magnificent(s)!;
  assert.equal(consideredEngaged(s, m, s.table!.first), true);
  assert.equal(consideredEngaged(s, m, 1 - s.table!.first), false);
  assert.equal(stats(s, m).defense, 8);
  // A burgle shadow card gives him an additional attack.
  s.encounterDeck = [T.hall, T.path, T.path];
  handle(s, fx("immediateAttack", { target: m.id, player: s.table!.first }));
  run(s);
  s = settle(s, "undefended");
  assert.ok(
    s.log.some((l) => /additional attack/.test(l.text)),
    "Smaug the Magnificent attacks again",
  );
  // A Bare Patch: after questing successfully, burgle to attach it.
  s.encounterDeck = [T.belching, T.path];
  selectSeat(s, s.table!.first);
  deck(s, Array(3).fill(GUARD), s.table!.first);
  hand(s, [GUARD], s.table!.first);
  s.phase = "quest";
  handle(s, fx("questSucceeded", { value: 1, player: s.table!.first }));
  run(s);
  s = choose(s, "burgle");
  s = choose(s, "discard");
  s = settle(s);
  assert.ok(
    magnificent(s)!.attachments.some((a) => a.code === T.patch),
    "A Bare Patch is attached",
  );
  assert.equal(stats(s, magnificent(s)!).defense, 5);
});

test("Inside Information cannot be defeated while Smaug the Magnificent is in play; progress above his remaining hit points removes him; defeating the stage wins and discovers the burgled treasures", () => {
  let s = base();
  s.lonelyMountain!.treasures = [EREBOR.shirt];
  s.lonelyMountain!.stack = EREBOR_TREASURES.filter((c) => c !== EREBOR.shirt);
  s = stageThree(s);
  const m = magnificent(s)!;
  m.damage = 15;
  s.staging = s.staging.filter((u) => u.code !== T.patch);
  s.phase = "quest";
  handle(s, fx("successfulQuestProgress", { value: 5, player: 0 }));
  run(s);
  assert.ok(magnificent(s), "5 progress does not exceed 5 hit points");
  handle(s, fx("successfulQuestProgress", { value: 1, player: 0 }));
  run(s);
  assert.equal(magnificent(s), undefined);
  assert.ok(s.removedEncounter?.includes(T.magnificent));
  assert.equal(s.status, "playing");
  handle(s, fx("successfulQuestProgress", { value: 14, player: 0 }));
  run(s);
  assert.equal(s.status, "won");
  assert.deepEqual(s.lonelyMountain!.treasures, [EREBOR.shirt]);
  // With Smaug in play, 20 progress does not defeat the stage.
  let t = stageThree(base());
  t.phase = "quest";
  magnificent(t)!.damage = 0;
  t.staging = t.staging.filter((u) => u.code !== T.patch);
  handle(t, fx("successfulQuestProgress", { value: 20, player: 0 }));
  run(t);
  assert.equal(t.status, "playing");
  assert.ok(magnificent(t));
  t = reload(t);
  assert.equal(t.progress, 20);
});

test("Belching Fire: each Dragon in the staging area attacks the player with the most committed willpower, without a shadow card", () => {
  let s = base(2);
  const other = 1 - s.table!.first;
  forOwner(s, other, () => {
    for (const h of s.heroes) h.committed = true;
  });
  s.phase = "staging";
  s.encounterDeck = [T.belching, T.path, T.path];
  selectSeat(s, s.table!.first);
  handle(s, fx("reveal", { player: s.table!.first }));
  run(s);
  assert.match(s.choice!.title, /Smaug the Golden · Immediate attack/);
  assert.equal(activeSeat(s), other);
  assert.equal(golden(s)!.shadows.length, 0, "no shadow card");
  s = settle(s, "undefended");
});

test("Known to an Ounce: each player discards 2 random cards; Dragons get +1 threat per discarded event until the end of the phase", () => {
  let s = base();
  hand(s, [EVER, EVER]);
  s.phase = "staging";
  s.encounterDeck = [T.ounce, T.path];
  handle(s, fx("reveal", { player: 0 }));
  run(s);
  s = settle(s);
  assert.equal(s.hand.length, 0);
  const g = golden(s)!;
  assert.equal(threatOf(s, g), 2);
  s.phase = "quest";
  assert.equal(
    threatOf(s, g),
    2,
    "the staging step is part of the quest phase",
  );
  s.phase = "travel";
  assert.equal(threatOf(s, g), 0);
});

test("Pretending to Sleep: 1 progress on Smaug the Golden, then spend X Baggins resources or advance to stage 4A", () => {
  let s = base();
  golden(s)!.progress = 2;
  bagginsBilbo(s)!.resources = 5;
  s.phase = "staging";
  s.encounterDeck = [T.pretending, T.path, T.path];
  handle(s, fx("reveal", { player: 0 }));
  run(s);
  assert.equal(golden(s)!.progress, 3);
  assert.match(s.choice!.title, /Spend 3 Baggins resources or advance/);
  s = choose(s, "spend");
  assert.equal(bagginsBilbo(s)!.resources, 2);
  s = settle(s);
  assert.equal(s.lonelyMountain!.currentQuest, T.burglar);
  // Without enough Baggins resources the players must advance.
  s.queue = [];
  s.choice = null;
  s.encounterDeck = [T.pretending, T.path, T.path];
  handle(s, fx("reveal", { player: 0 }));
  run(s);
  s = settle(s);
  assert.equal(s.lonelyMountain!.currentQuest, T.thieves);
});

test("Dragon-Spell attaches to the hero with the most resources: -1 willpower per resource, and spending resources deals that much damage", () => {
  let s = base();
  const aragorn = s.heroes[0];
  for (const h of s.heroes) h.resources = 1;
  aragorn.resources = 3;
  aragorn.tempWill = 4;
  const will = stats(s, aragorn).will;
  s.phase = "staging";
  s.encounterDeck = [T.spell, T.path];
  handle(s, fx("reveal", { player: 0 }));
  run(s);
  s = settle(s);
  const a = get(s, aragorn.id)!;
  assert.ok(a.attachments.some((x) => x.code === T.spell));
  assert.equal(stats(s, a).will, will - 3);
  spendResources(s, a, 2);
  run(s);
  assert.equal(get(s, aragorn.id)!.damage, 2);
  assert.equal(stats(s, get(s, aragorn.id)!).will, will - 1);
});

test("Croaking Crows place progress on Smaug the Golden when a location is revealed; Great Hall does so at the end of each round while active", () => {
  let s = base();
  stage(s, T.crows);
  s.phase = "staging";
  s.encounterDeck = [T.path, T.path];
  handle(s, fx("reveal", { player: 0 }));
  run(s);
  s = settle(s);
  assert.equal(golden(s)!.progress, 1);
  s.activeLocation = make(s, T.hall);
  const effects = TLM_HOOKS.roundEnd!(s);
  assert.deepEqual(
    effects.map((e) => e.kind),
    ["tlmHallProgress"],
  );
  s.queue = [];
  for (const e of effects) handle(s, e);
  run(s);
  assert.equal(golden(s)!.progress, 2);
});

test("Western Slopes: when explored, the first player draws 2 cards or removes 1 progress from Smaug the Golden", () => {
  let s = base();
  golden(s)!.progress = 2;
  deck(s, Array(5).fill(GUARD));
  s.activeLocation = make(s, T.slopes);
  s.phase = "quest";
  handle(s, fx("successfulQuestProgress", { value: 5, player: 0 }));
  run(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["draw", "progress", "skip"],
  );
  s = choose(s, "progress");
  assert.equal(golden(s)!.progress, 1);
});

test("Desolation of Smaug: while active, the first treachery revealed each round gains surge", () => {
  const s = base();
  s.activeLocation = make(s, T.desolation);
  s.round = 3;
  TLM_HOOKS.revealed!(s, T.weighed, "encounter");
  assert.equal(TLM_HOOKS.revealedSurge!(s, T.weighed), true);
  TLM_HOOKS.revealed!(s, T.weighed, "encounter");
  assert.equal(TLM_HOOKS.revealedSurge!(s, T.weighed), false);
  s.round = 4;
  TLM_HOOKS.revealed!(s, T.belching, "encounter");
  assert.equal(TLM_HOOKS.revealedSurge!(s, T.belching), true);
});

test("Secret Entrance: exhaust a hero and name a card type to travel; if the top encounter card is another type it returns and no travel remains this round", () => {
  let s = base();
  const entrance = stage(s, T.entrance);
  s.phase = "travel";
  s.encounterDeck = [T.belching, T.path];
  s = act(s, { type: "TRAVEL", id: entrance.id });
  const hero = s.heroes[0];
  s = choose(s, hero.id);
  s = choose(s, "treachery");
  assert.equal(s.activeLocation?.code, T.entrance);
  assert.equal(get(s, hero.id)!.exhausted, true);
  assert.equal(s.encounterDeck[0], T.belching, "the card is only looked at");
  // A mismatch returns it to the staging area.
  let t = base();
  const e2 = stage(t, T.entrance);
  const path = stage(t, T.path);
  t.phase = "travel";
  t.encounterDeck = [T.belching, T.path];
  t = act(t, { type: "TRAVEL", id: e2.id });
  t = choose(t, t.heroes[0].id);
  t = choose(t, "enemy");
  t = settle(t);
  assert.equal(t.activeLocation, null);
  assert.ok(t.staging.some((u) => u.code === T.entrance));
  assert.match(TLM_HOOKS.travelProblem!(t, path) ?? "", /cannot travel again/);
});

test("Erebor treasures: Mithril Shirt on Bilbo, Thrór's Battle Axe and Hunting Bow are restricted weapons, The Arkenstone discounts the next ally and Thrór's Golden Cup draws 3", () => {
  let s = base();
  const bilbo = bagginsBilbo(s)!;
  s.phase = "planning";
  const [shirt, axe, bow, stone, cup] = hand(s, [
    EREBOR.shirt,
    EREBOR.axe,
    EREBOR.bow,
    EREBOR.arkenstone,
    EREBOR.cup,
  ]);
  assert.deepEqual(
    playTargets(s, shirt).map((u) => u.id),
    [bilbo.id],
  );
  assert.ok(
    playTargets(s, axe).every((u) => card(u.code).type_code === "hero"),
  );
  const def = stats(s, bilbo).defense,
    hp = stats(s, bilbo).health;
  s = act(s, { type: "PLAY", id: shirt.id, target: bilbo.id });
  s = settle(s);
  assert.equal(stats(s, bagginsBilbo(s)!).defense, def + 1);
  assert.equal(stats(s, bagginsBilbo(s)!).health, hp + 1);
  const glóin = s.heroes[2];
  const attack = stats(s, glóin).attack;
  s = act(s, { type: "PLAY", id: axe.id, target: glóin.id });
  s = act(s, { type: "PLAY", id: bow.id, target: glóin.id });
  s = settle(s);
  assert.equal(stats(s, get(s, glóin.id)!).attack, attack + 2);
  // The Arkenstone on Aragorn (leadership): the next leadership ally costs X less.
  const aragorn = s.heroes[0];
  s = act(s, { type: "PLAY", id: stone.id, target: aragorn.id });
  s = settle(s);
  const holder = get(s, aragorn.id)!;
  const arkenstone = holder.attachments.find(
    (a) => a.code === EREBOR.arkenstone,
  )!;
  assert.equal(
    availableAbilities(s, holder).find((x) => x.id === arkenstone.id)?.disabled,
    false,
  );
  const guard = hand(s, [GUARD, AXEHAND]);
  const threat = s.threat;
  s = act(s, { type: "ABILITY", id: aragorn.id, attachmentId: arkenstone.id });
  s = choose(s, "x-2");
  assert.equal(s.threat, threat + 2);
  assert.equal(playCost(s, card(GUARD)), 0);
  assert.equal(
    playCost(s, card(AXEHAND)),
    2,
    "only the attached hero's sphere",
  );
  s = act(s, { type: "PLAY", id: guard[0].id });
  s = settle(s);
  assert.equal(playCost(s, card(GUARD)), 2, "the discount is spent");
  // Thrór's Golden Cup: victory display, draw 3.
  deck(s, Array(5).fill(GUARD));
  s = act(s, { type: "PLAY", id: cup.id, target: aragorn.id });
  s = settle(s);
  const cupHost = get(s, aragorn.id)!;
  const cupCard = cupHost.attachments.find((a) => a.code === EREBOR.cup)!;
  const handSize = s.hand.length;
  s = act(s, { type: "ABILITY", id: aragorn.id, attachmentId: cupCard.id });
  assert.equal(s.hand.length, handSize + 3);
  assert.ok(s.victoryCards?.includes(EREBOR.cup));
  assert.equal(s.victory, 3);
});

test("Thrór's Battle Axe: after the attached hero destroys an enemy, deal 1 damage to another enemy engaged with you; Thrór's Hunting Bow adds +2 only to ranged attacks", () => {
  let s = base(2);
  const first = s.table!.first;
  selectSeat(s, first);
  const glóin = s.heroes[2];
  glóin.attachments.push({ id: "axe", code: EREBOR.axe, exhausted: false });
  const weak = engaged(s, T.crows);
  const other = engaged(s, T.crows);
  s.phase = "attack";
  s = act(s, { type: "ATTACK", enemyId: weak.id, attackerIds: [glóin.id] });
  s = settle(s, other.id);
  assert.equal(get(s, weak.id), undefined);
  assert.equal(get(s, other.id)!.damage, 1);
  // Hunting Bow: ranged against an enemy engaged with the other player.
  const t = base(2);
  const f = t.table!.first;
  selectSeat(t, f);
  const archer = t.heroes[0];
  archer.attachments.push({ id: "bow", code: EREBOR.bow, exhausted: false });
  const own = engaged(t, T.crows, f);
  const far = engaged(t, T.crows, 1 - f);
  assert.equal(ereborAttackBonus(t, archer, own), 0);
  assert.equal(ereborAttackBonus(t, archer, far), 2);
});

test("Treasure sets: Flies and Spiders accepts the Trolls' hoard, The Lonely Mountain also accepts Bilbo's Magic Ring; the Erebor treasures can be discovered", () => {
  assert.deepEqual(scenarioTreasures("flies-and-spiders"), [
    ...HOBBIT_TREASURES,
  ]);
  assert.deepEqual(scenarioTreasures("the-lonely-mountain"), [
    ...HOBBIT_TREASURES,
    OTD_RING,
  ]);
  assert.deepEqual(scenarioTreasures("mirkwood"), []);
  for (const code of EREBOR_TREASURES) {
    const t = card(code);
    assert.equal(t.treasure, true);
    assert.equal(t.type_code, "attachment");
    assert.equal(Number(t.cost), 0);
    assert.ok(t.is_unique);
  }
  assert.equal(card(EREBOR.cup).victory, 3);
});

test("Malformed Lonely Mountain saves are rejected", () => {
  const s = base();
  const raw = () => JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(raw()));
  for (const mutate of [
    (x: GameState) => (x.lonelyMountain!.currentQuest = "nope"),
    (x: GameState) => (x.stage = 3),
    (x: GameState) => (x.lonelyMountain!.stack = ["131020"]),
    (x: GameState) =>
      (x.lonelyMountain!.treasures = [x.lonelyMountain!.stack[0]]),
    (x: GameState) => (x.lonelyMountain!.setAside = [make(x, T.crows)]),
    (x: GameState) =>
      (x.lonelyMountain!.burgle = {
        reason: "stage",
        code: T.path,
        revealed: GUARD,
      }),
    (x: GameState) => (x.lonelyMountain!.entranceNamed = "hero"),
    (x: GameState) => (x.lonelyMountain!.weighedDown = [x.round + 1]),
  ]) {
    const bad = raw();
    mutate(bad);
    assert.equal(validateSave(bad), false);
  }
  assert.equal(seatView(s, 0).heroes.length > 0, true);
  assert.ok(allCharacters(s).length > 0);
});
