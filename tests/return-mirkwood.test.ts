import { applyAction as act } from "./pass-resource-window.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {
  canCommit,
  canPlay,
  canTravel,
  createGame,
  playTargets,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { card, SCRIPTED, STARTERS } from "../src/game/cards";
import {
  advanceQuest,
  check,
  damage,
  destroy,
  engage,
  progress,
  progressLocation,
  resolveReveal,
  returnAlly,
  shadow,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import { fx, make } from "../src/game/core";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  allHeroes,
  attackersFor,
  defendersFor,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import {
  RETURN as R,
  RETURN_MIRKWOOD_ENCOUNTERS,
  RETURN_MIRKWOOD_QUESTS,
  returnMirkwoodGollum as gollum,
  returnMirkwoodGuard as guard,
  returnMirkwoodCanFight,
} from "../src/game/return-mirkwood";
import { SCENARIOS } from "../src/game/scenarios";
import type { GameState, Unit } from "../src/game/types";
import recipes from "../public/scenarios.json";

const leadership = STARTERS.find((d) => d.id === "leadership")!;
const spirit = STARTERS.find((d) => d.id === "spirit")!;
const lore = STARTERS.find((d) => d.id === "lore")!;
const choose = (s: GameState, id: string) => act(s, { type: "CHOOSE", id });
function settle(s: GameState) {
  for (let i = 0; i < 100 && s.status === "playing"; i++) {
    if (s.choice) {
      const options = s.choice.options;
      s = choose(
        s,
        options.find((o) =>
          ["player-0", "skip", "resolve", "none"].includes(o.id),
        )?.id ?? options[0].id,
      );
    } else if (s.phase === "setup") s = act(s, { type: "KEEP" });
    else return s;
  }
  return s;
}
function base(deck = leadership, players = 1) {
  const seats = [deck, ...STARTERS.filter((d) => d.id !== deck.id)].slice(
    0,
    players,
  );
  let s: GameState | undefined;
  for (let seed = 1; seed < 30; seed++) {
    const candidate = settle(
      createGame(seed, deck.cards, deck.heroes, deck.id, {
        scenarioId: "return-to-mirkwood",
        ...(players > 1
          ? {
              seats: seats.map((d) => ({
                deckId: d.id,
                heroes: [...d.heroes],
              })),
            }
          : {}),
      }),
    );
    if (candidate.status === "playing" && candidate.phase !== "setup") {
      s = candidate;
      break;
    }
  }
  assert.ok(s);
  s.queue = [];
  s.choice = null;
  s.staging = [];
  s.encounterDiscard = [];
  s.encounterDeck = ["01089", "01089", "01089", "01089"];
  s.activeLocation = null;
  delete s.extraActiveLocations;
  s.phase = "planning";
  s.progress = 0;
  s.stage = 1;
  const captive = gollum(s)!;
  const previous = guard(s)!;
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      s.allies = [];
      s.hand = [];
      s.engaged = [];
      s.threat = 20;
    });
  forOwner(s, 0, () => {
    s.allies.push(captive);
  });
  captive.damage = 0;
  captive.exhausted = false;
  captive.attachments = [];
  for (const h of allHeroes(s)) {
    h.damage = 0;
    h.exhausted = false;
    h.committed = false;
    h.resources = 5;
  }
  selectSeat(s, 0);
  if (s.table) {
    s.table.first = 0;
    s.table.turn = 0;
    s.table.passed = [];
  }
  assert.equal(guard(s), 0, `Original guard ${previous}`);
  return s;
}
function reveal(s: GameState, code: string) {
  resolveReveal(s, code);
  flush(s);
  if (s.choice?.options.some((o) => o.id === "resolve"))
    s = choose(s, "resolve");
  return s;
}
function attach(s: GameState, u: Unit, code: string) {
  const a = {
    id: `a${s.nextId++}`,
    code,
    exhausted: false,
    owner: activeSeat(s),
  };
  u.attachments.push(a);
  return a;
}
function combat(
  s: GameState,
  shadowCode: string,
  defended = false,
  player = 0,
) {
  const enemy = make(s, "01089");
  forOwner(s, player, () => s.engaged.push(enemy));
  selectSeat(s, player);
  enemy.shadows = [shadowCode];
  enemy.revealedShadowCount = 1;
  s.phase = "defense";
  s.combat = {
    enemyId: enemy.id,
    defenderId: defended ? seatView(s, player).heroes[0].id : null,
    attackBonus: 0,
    cancelled: false,
    ignoreDefense: false,
    returnToStaging: false,
  };
  return enemy;
}

test("Return registers ten encounters and four exact quest faces; initial guard choice precedes 1–4player normal/easy reveals", () => {
  assert.equal(RETURN_MIRKWOOD_ENCOUNTERS.length, 10);
  for (const c of RETURN_MIRKWOOD_ENCOUNTERS)
    assert.ok(SCRIPTED.has(c.code), c.name);
  for (const stage of SCENARIOS.find((q) => q.id === "return-to-mirkwood")!
    .stages) {
    const printed = RETURN_MIRKWOOD_QUESTS.find(
      (c) => c.code === stage.cardCode,
    )!;
    assert.equal(stage.questImage, printed.back_imagesrc);
  }
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      let s = createGame(
        1,
        leadership.cards,
        leadership.heroes,
        leadership.id,
        {
          scenarioId: "return-to-mirkwood",
          easy,
          ...(players > 1
            ? {
                seats: STARTERS.slice(0, players).map((d) => ({
                  deckId: d.id,
                  heroes: [...d.heroes],
                })),
              }
            : {}),
        },
      );
      assert.match(s.choice!.title, /first guard/);
      assert.equal(s.staging.length, 0);
      const actual: Record<string, number> = {};
      for (const code of s.encounterDeck)
        actual[code] = (actual[code] ?? 0) + 1;
      const recipe = recipes.find((q) => q.id === (easy ? "E01.9" : "Q01.9"))!;
      assert.deepEqual(actual, recipe.sections.sharedEncounterDeck);
      assert.equal(s.encounterDeck.length, easy ? 35 : 53);
      assert.equal(gollum(s)!.damage, 0);
      assert.equal(card(gollum(s)!.code).health, 5);
      assert.ok(validateSave(s));
      s.encounterDeck = Array(players + 1).fill("01089");
      s = choose(s, `player-${players - 1}`);
      assert.equal(guard(s), players - 1);
      assert.equal(s.staging.length, players);
      assert.equal(s.encounterDeck.length, 1);
      assert.equal(allHeroes(s)[0].resources, easy ? 1 : 0);
    }
});

test("Gollum is a controlled ally, accepts legal ally attachments and healing, but cannot quest, attack or defend", () => {
  let s = base(lore);
  const captive = gollum(s)!;
  assert.equal(card(captive.code).type_code, "objective-ally");
  assert.equal(ownerOf(s, captive), 0);
  s.phase = "quest";
  assert.equal(canCommit(s, captive), false);
  assert.throws(
    () => act(s, { type: "TOGGLE_QUEST", id: captive.id }),
    /ready|commit/,
  );
  assert.equal(returnMirkwoodCanFight(captive), false);
  assert.ok(!defendersFor(s).some((u) => u.id === captive.id));
  const enemy = make(s, "01089");
  s.engaged.push(enemy);
  assert.ok(!attackersFor(s, enemy).some((u) => u.id === captive.id));
  s.phase = "planning";
  const preservation = make(s, "01072");
  s.hand = [preservation];
  assert.ok(playTargets(s, preservation).some((u) => u.id === captive.id));
  s = act(s, { type: "PLAY", id: preservation.id, target: captive.id });
  const attached = gollum(s)!.attachments[0];
  gollum(s)!.damage = 3;
  s = act(s, { type: "ABILITY", id: captive.id, attachmentId: attached.id });
  assert.equal(gollum(s)!.damage, 1);
});

test("Gollum leaving play loses through destruction, ally return or discard, before optional departure responses", () => {
  for (const removal of ["destroy", "return", "discard"] as const) {
    const s = base();
    const captive = gollum(s)!;
    s.hand = [make(s, "01024")];
    if (removal === "return") returnAlly(s, captive);
    else if (removal === "discard") destroy(s, captive, false);
    else damage(s, captive.id, 5);
    flush(s);
    assert.equal(s.status, "lost");
    assert.match(s.reason, /Gollum/);
    assert.equal(s.choice, null);
  }
});

test("guard elimination loses immediately; another player may be eliminated without ending the quest", () => {
  for (const eliminateGuard of [false, true]) {
    const s = base(leadership, 2);
    forOwner(s, eliminateGuard ? 0 : 1, () => {
      s.threat = 50;
    });
    check(s);
    assert.equal(s.status, eliminateGuard ? "lost" : "playing");
    if (!eliminateGuard) assert.equal(s.table!.seats[1].eliminated, true);
  }
});

test("the same Gollum transfers with wounds and attachments at round end after the old guard raises threat", () => {
  let s = base(leadership, 2);
  const id = gollum(s)!.id;
  gollum(s)!.damage = 2;
  const preservation = attach(s, gollum(s)!, "01072");
  const oldThreat = seatView(s, 0).threat;
  handle(s, fx("refreshEnd"));
  flush(s);
  s = act(s, { type: "NEXT" });
  assert.match(s.choice!.title, /new guard/);
  assert.equal(
    seatView(s, 0).threat,
    oldThreat + 4,
    "ordinary refresh +1 plus Gollum +3",
  );
  s = choose(s, "player-1");
  assert.equal(guard(s), 1);
  assert.equal(gollum(s)!.id, id);
  assert.equal(gollum(s)!.damage, 2);
  assert.equal(gollum(s)!.attachments[0].id, preservation.id);
  assert.ok(!seatView(s, 0).allies.some((u) => u.id === id));
});

test("a guard reaching fifty from Gollum's round-end threat cannot transfer the captive to avoid loss", () => {
  let s = base(leadership, 2);
  s.threat = 46;
  syncSeat(s);
  handle(s, fx("refreshEnd"));
  flush(s);
  s = act(s, { type: "NEXT" });
  assert.equal(s.status, "lost");
  assert.equal(s.choice, null);
});

test("The Spider's Ring prevents mandatory tantrum transfers and optional round-end or travel transfers", () => {
  let s = base(leadership, 2);
  s.activeLocation = make(s, R.ring);
  s = reveal(s, R.anguish);
  assert.equal(s.choice, null);
  assert.equal(guard(s), 0);
  assert.equal(s.threat, 28);
  handle(s, fx("returnChooseGuard", { player: 0 }));
  flush(s);
  assert.equal(s.choice, null);
  s.activeLocation = make(s, R.path);
  s.extraActiveLocations = [make(s, R.ring)];
  handle(s, fx("returnChooseGuard", { player: 0 }));
  flush(s);
  assert.equal(
    s.choice,
    null,
    "an additional active Ring still prohibits transfers",
  );
});

test("Anguish raises the current guard's threat by eight, then forces a different guard when available", () => {
  let s = base(leadership, 2);
  const before = s.threat;
  s = reveal(s, R.anguish);
  assert.equal(s.threat, before + 8);
  assert.ok(
    !s.choice!.options.some((o) => o.id === "skip" || o.id === "player-0"),
  );
  s = choose(s, "player-1");
  assert.equal(guard(s), 1);
  assert.ok(s.encounterDiscard.includes(R.anguish));
  const solo = reveal(base(), R.anguish);
  assert.equal(solo.choice, null);
  assert.equal(guard(solo), 0);
});

test("Bite damages a chosen hero of the guard before forcing a transfer; it never targets the captive or other player's hero", () => {
  let s = base(leadership, 2);
  const heroId = s.heroes[0].id;
  s = reveal(s, R.bite);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    seatView(s, 0).heroes.map((h) => h.id),
  );
  s = choose(s, heroId);
  assert.equal(seatView(s, 0).heroes[0].damage, 4);
  assert.equal(gollum(s)!.damage, 0);
  assert.match(s.choice!.title, /new guard/);
  s = choose(s, "player-1");
  assert.equal(guard(s), 1);
});

test("Wasted Provisions discards exactly the top ten or all available cards, then forces a new guard", () => {
  for (const count of [3, 12]) {
    let s = base(leadership, 2);
    s.deck = Array(count).fill("01013");
    s.discard = [];
    s = reveal(s, R.provisions);
    assert.equal(seatView(s, 0).deck.length, Math.max(0, count - 10));
    assert.equal(seatView(s, 0).discard.length, Math.min(10, count));
    s = choose(s, "player-1");
    assert.equal(guard(s), 1);
  }
});

test("Dry Watercourse expands treachery threat, hero damage and deck discard across all players", () => {
  for (const code of [R.anguish, R.bite, R.provisions]) {
    let s = base(leadership, 2);
    s.activeLocation = make(s, R.watercourse);
    for (const player of playerOrder(s))
      forOwner(s, player, () => {
        s.deck = Array(12).fill("01013");
        s.discard = [];
      });
    s = reveal(s, code);
    if (code === R.bite)
      for (const player of [0, 1])
        s = choose(s, seatView(s, player).heroes[0].id);
    for (const player of [0, 1]) {
      if (code === R.anguish) assert.equal(seatView(s, player).threat, 28);
      if (code === R.bite)
        assert.equal(seatView(s, player).heroes[0].damage, 4);
      if (code === R.provisions)
        assert.equal(seatView(s, player).deck.length, 2);
    }
    s = choose(s, "player-1");
    s = choose(s, "player-0");
    assert.equal(guard(s), 0);
    assert.equal(s.choice, null);
  }
});

test("Dry Watercourse expands matching treachery shadows too, without forcing guard changes", () => {
  for (const code of [R.anguish, R.bite, R.provisions]) {
    let s = base(leadership, 2);
    s.activeLocation = make(s, R.path);
    s.extraActiveLocations = [make(s, R.watercourse)];
    for (const player of playerOrder(s))
      forOwner(s, player, () => {
        s.deck = Array(8).fill("01013");
        s.discard = [];
      });
    combat(s, code, true);
    shadow(s, code);
    flush(s);
    if (code === R.bite)
      for (const player of [0, 1])
        s = choose(s, seatView(s, player).heroes[0].id);
    for (const player of [0, 1]) {
      if (code === R.anguish) assert.equal(seatView(s, player).threat, 24);
      if (code === R.bite)
        assert.equal(seatView(s, player).heroes[0].damage, 2);
      if (code === R.provisions)
        assert.equal(seatView(s, player).deck.length, 3);
    }
    assert.equal(guard(s), 0);
    assert.equal(s.choice, null);
  }
});

test("the three treachery shadows affect the guard even during another player's attack and do not transfer Gollum", () => {
  for (const code of [R.anguish, R.bite, R.provisions]) {
    let s = base(leadership, 2);
    forOwner(s, 0, () => {
      s.deck = Array(8).fill("01013");
    });
    combat(s, code, true, 1);
    shadow(s, code);
    flush(s);
    if (code === R.bite) s = choose(s, seatView(s, 0).heroes[0].id);
    assert.equal(guard(s), 0);
    assert.equal(s.choice, null);
    if (code === R.anguish) {
      assert.equal(seatView(s, 0).threat, 24);
      assert.equal(seatView(s, 1).threat, 20);
    }
    if (code === R.bite) assert.equal(seatView(s, 0).heroes[0].damage, 2);
    if (code === R.provisions) assert.equal(seatView(s, 0).deck.length, 3);
  }
});

test("Attercop automatically moves to Gollum's guard at encounter start regardless of threat or current engagement", () => {
  const s = base(leadership, 2);
  const staged = make(s, R.attercop),
    engaged = make(s, R.attercop);
  s.staging.push(staged);
  seatView(s, 1).engaged.push(engaged);
  handle(s, fx("startEncounter"));
  flush(s);
  assert.equal(s.phase, "encounter");
  assert.equal(seatView(s, 0).engaged.length, 2);
  assert.equal(seatView(s, 1).engaged.length, 0);
  assert.equal(s.staging.length, 0);
});

test("Bats wounds every character of Gollum's guard on any engagement, including a different player's engagement", () => {
  const s = base(leadership, 2);
  const bats = make(s, R.bats);
  s.staging.push(bats);
  forOwner(s, 1, () => engage(s, bats));
  flush(s);
  assert.equal(gollum(s)!.damage, 1);
  assert.ok(seatView(s, 0).heroes.every((h) => h.damage === 1));
  assert.ok(seatView(s, 1).heroes.every((h) => h.damage === 0));
});

test("Thalin kills Bats before its Surge and engagement Forced effect can fire", () => {
  const tactics = STARTERS.find((d) => d.id === "tactics")!;
  let s = base(tactics);
  s.phase = "quest";
  s.encounterDeck = ["01089"];
  const thalin = s.heroes.find((h) => h.code === "01006")!;
  thalin.committed = true;
  thalin.exhausted = true;
  s = reveal(s, R.bats);
  assert.ok(!s.staging.some((u) => u.code === R.bats));
  assert.equal(
    s.encounterDeck.length,
    1,
    "Surge does not resolve when Thalin kills the enemy before its keywords",
  );
  assert.equal(gollum(s)!.damage, 0);
});

test("Woodman's Glade travel exhausts a ready hero controlled by Gollum's guard, regardless of the acting seat", () => {
  let s = base(leadership, 2);
  s.phase = "travel";
  const glade = make(s, R.glade);
  s.staging.push(glade);
  selectSeat(s, 1);
  assert.equal(canTravel(s, glade), null);
  s = act(s, { type: "TRAVEL", id: glade.id });
  assert.equal(s.table!.active, 0);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    seatView(s, 0).heroes.map((h) => h.id),
  );
  const heroId = seatView(s, 0).heroes[0].id;
  s = choose(s, heroId);
  assert.equal(s.activeLocation!.id, glade.id);
  assert.ok(seatView(s, 0).heroes[0].exhausted);
  const blocked = base(leadership, 2);
  for (const h of seatView(blocked, 0).heroes) h.exhausted = true;
  const next = make(blocked, R.glade);
  blocked.staging.push(next);
  blocked.phase = "travel";
  assert.match(canTravel(blocked, next)!, /guard/);
});

test("Wood Elf Path offers an optional guard transfer only after actual travel", () => {
  let s = base(leadership, 2);
  const path = make(s, R.path);
  s.staging.push(path);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: path.id });
  assert.match(s.choice!.title, /new guard/);
  assert.ok(s.choice!.options.some((o) => o.id === "skip"));
  s = choose(s, "player-1");
  assert.equal(guard(s), 1);
});

test("Woodman's Glade exploration optionally lowers every player's threat except the current guard", () => {
  let s = base(leadership, 3);
  const glade = make(s, R.glade);
  s.staging.push(glade);
  progressLocation(s, glade, 2);
  flush(s);
  assert.match(s.choice!.title, /Exploration/);
  s = choose(s, "reduce");
  assert.equal(seatView(s, 0).threat, 20);
  assert.equal(seatView(s, 1).threat, 18);
  assert.equal(seatView(s, 2).threat, 18);
});

test("Escape Attempt forbids the guard's characters while another player survives; the last player can commit", () => {
  const s = base(leadership, 2);
  s.phase = "quest";
  s.stage = 2;
  assert.equal(canCommit(s, seatView(s, 0).heroes[0]), false);
  selectSeat(s, 1);
  assert.equal(canCommit(s, s.heroes[0]), true);
  s.threat = 50;
  check(s);
  selectSeat(s, 0);
  assert.equal(s.status, "playing");
  assert.equal(canCommit(s, s.heroes[0]), true);
});

test("a failed stage-two quest immediately loses while a tie remains in play", () => {
  for (const failed of [false, true]) {
    let s = base();
    s.stage = 2;
    s.phase = "staging";
    s.staging = failed ? [make(s, "01089")] : [];
    s = act(s, { type: "NEXT" });
    assert.equal(s.status, failed ? "lost" : "playing");
    if (failed) assert.match(s.reason, /unsuccessfully|escapes/);
  }
});

test("stage three forbids every hand card and response event for the guard but permits controlled abilities and another player's cards", () => {
  let s = base(spirit, 2);
  s.stage = 3;
  s.hand = [make(s, "01050"), make(s, "01021"), make(s, "01043")];
  for (const u of s.hand) assert.match(canPlay(s, u)!, /guard/);
  const eowynId = s.heroes.find((h) => h.code === "01007")!.id;
  s = act(s, { type: "ABILITY", id: eowynId });
  s = choose(s, s.hand[1].id);
  resolveReveal(s, R.anguish);
  flush(s);
  assert.ok(!s.choice!.options.some((o) => o.code === "01050"));
  s = choose(
    s,
    s.choice!.options.some((o) => o.id === "resolve")
      ? "resolve"
      : s.choice!.options[0].id,
  );
  while (s.choice)
    s = choose(
      s,
      s.choice.options.find((o) => o.id === "player-1")?.id ??
        s.choice.options[0].id,
    );
  selectSeat(s, 0);
  assert.equal(guard(s), 1);
  assert.ok(
    !canPlay(
      s,
      s.hand.find((u) => u.code === "01050")!,
    )?.includes("guard"),
  );
});

test("stage four moves every enemy to the guard before shadows and Bats damage precedes attacks", () => {
  const s = base(leadership, 2);
  s.stage = 4;
  s.phase = "encounter";
  const bats = make(s, R.bats),
    spider = make(s, "01089"),
    sniper = make(s, "01083");
  s.staging.push(bats, sniper);
  seatView(s, 1).engaged.push(spider);
  handle(s, fx("startCombat"));
  assert.equal(
    s.encounterDeck.length,
    4,
    "beginning-combat Forced effects precede shadow dealing",
  );
  flush(s);
  assert.equal(seatView(s, 0).engaged.length, 3);
  assert.equal(seatView(s, 1).engaged.length, 0);
  assert.equal(s.staging.length, 0);
  assert.equal(gollum(s)!.damage, 1);
  assert.ok(allEngaged(s).every((u) => u.shadows.length === 1));
  const batsLine = s.log.findLastIndex((l) => /Bats wound/.test(l.text));
  const attackLine = s.log.findLastIndex((l) => /attacks/.test(l.text));
  assert.ok(attackLine < 0 || batsLine < attackLine);
});

test("stage four needs two progress and no enemies anywhere; defeating the final enemy completes the quest", () => {
  for (const staged of [false, true]) {
    const s = base();
    s.stage = 4;
    s.progress = 2;
    const enemy = make(s, "01089");
    (staged ? s.staging : s.engaged).push(enemy);
    advanceQuest(s);
    assert.equal(s.status, "playing");
    destroy(s, enemy);
    flush(s);
    assert.equal(s.status, "won");
    assert.match(s.reason, /Gollum|Thranduil/);
  }
});

test("undefended attack against the guard automatically damages Gollum; other players still assign a hero", () => {
  for (const player of [0, 1]) {
    const s = base(leadership, 2);
    const enemy = combat(s, "01089", false, player);
    enemy.shadows = [];
    handle(s, fx("enemyDamage"));
    flush(s);
    if (player === 0) {
      assert.equal(gollum(s)!.damage, 2);
      assert.ok(!s.choice);
    } else {
      assert.equal(gollum(s)!.damage, 0);
      assert.match(s.choice!.title, /Assign 2 damage/);
    }
  }
});

test("Spider's Ring shadow becomes active even after a defended attack, keeping a previous active location", () => {
  const s = base();
  const path = make(s, R.path);
  path.progress = 1;
  s.activeLocation = path;
  const enemy = combat(s, R.ring, true);
  shadow(s, R.ring);
  assert.deepEqual(
    allActiveLocations(s).map((u) => u.code),
    [R.path, R.ring],
  );
  assert.equal(path.progress, 1);
  assert.equal(enemy.shadows.length, 0);
  assert.equal(enemy.revealedShadowCount, 0);
  assert.ok(!s.encounterDiscard.includes(R.ring));
  assert.ok(validateSave(s));
});

test("undefended Ring shadow lets the first player choose one active location to return with its progress", () => {
  let s = base();
  const a = make(s, R.path),
    b = make(s, R.glade);
  a.progress = 1;
  b.progress = 1;
  s.activeLocation = a;
  s.extraActiveLocations = [b];
  combat(s, R.ring);
  shadow(s, R.ring);
  assert.match(s.choice!.title, /Return an active location/);
  s = choose(s, a.id);
  assert.deepEqual(
    allActiveLocations(s).map((u) => u.code),
    [R.glade, R.ring],
  );
  assert.ok(s.staging.some((u) => u.id === a.id));
  assert.ok(!s.staging.some((u) => u.id === b.id));
  assert.equal(a.progress, 1);
  assert.equal(b.progress, 1);
});

test("two active locations buffer progress together, accept first-player allocation and survive save/reload", () => {
  let s = base();
  const path = make(s, R.path),
    ring = make(s, R.ring);
  s.activeLocation = path;
  s.extraActiveLocations = [ring];
  progress(s, 2);
  flush(s);
  assert.match(s.choice!.title, /Divide progress/);
  syncSeat(s);
  assert.ok(validateSave(s));
  s = restoreSave(s)!;
  s = choose(s, `${path.id}:1`);
  s = choose(s, `${ring.id}:1`);
  assert.equal(
    allActiveLocations(s).find((u) => u.id === path.id)!.progress,
    1,
  );
  assert.equal(
    allActiveLocations(s).find((u) => u.id === ring.id)!.progress,
    1,
  );
  assert.equal(s.progress, 0);
  progress(s, 5);
  flush(s);
  assert.equal(allActiveLocations(s).length, 0);
  assert.equal(s.progress, 2);
});

test("all four printed progress thresholds advance in order with no enemy-free premature stage-four victory", () => {
  const s = base();
  s.phase = "quest";
  for (const [stage, threshold] of [
    [1, 12],
    [2, 3],
    [3, 7],
  ]) {
    s.stage = stage;
    s.progress = threshold - 1;
    advanceQuest(s);
    assert.equal(s.stage, stage);
    s.progress = threshold;
    advanceQuest(s);
    assert.equal(s.stage, stage + 1);
    assert.equal(s.progress, 0);
  }
  s.progress = 1;
  advanceQuest(s);
  assert.equal(s.status, "playing");
  s.progress = 2;
  advanceQuest(s);
  assert.equal(s.status, "won");
});
