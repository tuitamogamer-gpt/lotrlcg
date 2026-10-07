import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  availableAbilities,
  canPlay,
  createGame,
  publicState,
  validateSave,
} from "../src/game/engine.ts";
import { card, imageUrl, STARTERS } from "../src/game/cards.ts";
import {
  fx,
  get,
  make,
  stats,
  threatOf,
  engagementCost,
} from "../src/game/core.ts";
import {
  check,
  damage,
  discardCharacter,
  engage,
  nextRound,
  phaseEnd,
  progress,
  progressLocation,
  readyCharacter,
  revealed,
  shadow,
} from "../src/game/board.ts";
import { flush, handle as effect } from "../src/game/effects.ts";
import { enemyAttackStarted } from "../src/game/combat.ts";
import {
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  syncSeat,
} from "../src/game/table.ts";
import {
  catchEncounter,
  catchEncounterStart,
  catchShadow,
  mugashCarrier,
} from "../src/game/catch-orc.ts";
import {
  CATCH_ORC as C,
  CATCH_ORC_ENCOUNTERS,
  CATCH_ORC_QUESTS,
  CATCH_ORC_RECIPES,
} from "../src/game/catch-orc-support.ts";
import { removeQuestTime } from "../src/game/quest-time.ts";
import { automatedScenarioId } from "../src/game/support.ts";
import { base, choose, reload } from "./catch-orc-fixtures.ts";
import type { GameState } from "../src/game/types.ts";
import { finalRingEvent } from "../src/game/ring-maker-final-player.ts";

function settle(s: GameState, limit = 100) {
  flush(s);
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < limit, "choices terminate");
    s = choose(
      reload(s),
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  return s;
}
function captive(s: GameState, player = 0) {
  const hero = seatView(s, player).heroes[0],
    enemy = make(s, C.mugash);
  hero.attachments.push({ id: enemy.id, code: C.mugash, exhausted: false });
  hero.exhausted = true;
  return hero;
}

test("Catch imports all 17 designs and exact 37/31 normal/easy quantities with original local art", () => {
  assert.equal(CATCH_ORC_ENCOUNTERS.length, 14);
  assert.equal(CATCH_ORC_QUESTS.length, 3);
  for (const r of CATCH_ORC_RECIPES) {
    const cards = r.cards.filter((c) => c.section !== "sharedQuestDeck");
    assert.equal(
      cards.reduce((n, c) => n + c.quantity, 0),
      r.mode === "easy" ? 31 : 37,
    );
    for (const c of cards)
      assert.equal(
        r.mode === "easy" ? card(c.code).easy_quantity : card(c.code).quantity,
        c.quantity,
      );
  }
  assert.ok(
    [...CATCH_ORC_ENCOUNTERS, ...CATCH_ORC_QUESTS].every((c) =>
      imageUrl(c).startsWith("/cards/"),
    ),
  );
  assert.equal(
    automatedScenarioId({ name: "To Catch an Orc", mode: "standard" }),
    "to-catch-an-orc",
  );
  assert.equal(
    automatedScenarioId({
      name: "To Catch an Orc (Nightmare)",
      mode: "nightmare",
    }),
    null,
  );
});
for (const players of [1, 2, 3, 4])
  for (const easy of [false, true])
    test(`Catch setup ${players} players / ${easy ? "easy" : "normal"}: full mulligans precede the hidden decks`, () => {
      const d = STARTERS[0];
      let s = createGame(144, d.cards, d.heroes, d.id, {
        scenarioId: "to-catch-an-orc",
        easy,
        ...(players > 1
          ? {
              seats: STARTERS.slice(0, players).map((d) => ({
                deckId: d.id,
                heroes: [...d.heroes],
              })),
            }
          : {}),
      });
      const original = playerOrder(s).map((p) => seatView(s, p).deck.length);
      assert.equal(s.catchOrc!.initialized, false);
      assert.equal(s.choice, null);
      for (let p = 0; p < players; p++) {
        s = applyAction(reload(s), { type: "MULLIGAN" });
        assert.equal(s.hand.length, 6);
        assert.equal(s.deck.length, original[p]);
        s = applyAction(s, { type: "KEEP" });
        if (p < players - 1) assert.equal(s.catchOrc!.initialized, false);
      }
      assert.equal(s.catchOrc!.initialized, true);
      const hidden = Object.values(s.catchOrc!.decks).flat();
      assert.equal(hidden.filter((u) => u.code === C.mugash).length, 1);
      assert.equal(
        hidden.filter((u) => u.code === C.guard).length,
        players - 1,
      );
      assert.equal(s.catchOrc!.setAside.length, 4 - players);
      for (const p of playerOrder(s)) {
        assert.equal(s.catchOrc!.decks[p].length, 21);
        assert.equal(seatView(s, p).deck.length, original[p] - 20);
      }
      for (let p = 0; p < players; p++) {
        assert.match(s.choice!.title, /Choose a Mountain/);
        assert.ok(
          s.choice!.options.every((o) =>
            /Mountain/.test(card(o.code!).traits!),
          ),
        );
        s = choose(reload(s), `deck:${C.methedras}`);
      }
      assert.equal(s.stage, 2);
      assert.equal(s.catchOrc!.time, 2);
      assert.equal(s.phase, "resource");
      assert.equal(s.staging.length, players);
      assert.equal(s.encounterDeck.length, (easy ? 27 : 33) - players);
      assert.ok(s.heroes.every((h) => h.resources === (easy ? 2 : 1)));
      assert.ok(!JSON.stringify(publicState(s)).includes('"decks"'));
      assert.equal(publicState(s).outOfPlayDecks!.length, players);
      reload(s);
    });
test("Hidden assignment is deterministic for a seed and varies between seeds without exposing the assigned enemy", () => {
  const d = STARTERS[0];
  const run = (seed: number) =>
    applyAction(
      createGame(seed, d.cards, d.heroes, d.id, {
        scenarioId: "to-catch-an-orc",
      }),
      { type: "KEEP" },
    );
  assert.deepEqual(run(22).catchOrc, run(22).catchOrc);
  assert.notDeepEqual(run(22).catchOrc!.decks, run(23).catchOrc!.decks);
  const publicText = JSON.stringify(publicState(run(22)));
  assert.ok(!publicText.includes(C.mugash));
});
test("Methedras searches three for each player, preserves physical identities and offers a card choice after enemies enter", () => {
  let s = base(2);
  const first = make(s, "01022"),
    second = make(s, "01023"),
    mugash = make(s, C.mugash);
  s.catchOrc!.decks[0] = [first, mugash, second, make(s, "01024")];
  forOwner(
    s,
    1,
    () =>
      (s.catchOrc!.decks[1] = [
        make(s, "01050"),
        make(s, "01051"),
        make(s, C.guard),
      ]),
  );
  const location = make(s, C.methedras);
  s.staging = [location];
  progressLocation(s, location, 3);
  flush(s);
  assert.equal(s.staging.find((u) => u.code === C.mugash)!.id, mugash.id);
  assert.equal(s.choice!.options.length, 2);
  s = choose(reload(s), first.id);
  assert.equal(seatView(s, 0).hand[0].id, first.id);
  assert.ok(seatView(s, 0).discard.includes(second.code));
  s = choose(reload(s), s.choice!.options[1].id);
  assert.equal(seatView(s, 1).hand.length, 1);
  assert.equal(s.catchOrc!.decks[0].length, 1);
  assert.equal(s.catchOrc!.decks[1].length, 0);
  assert.equal(s.catchOrc!.searched.length, 0);
  assert.ok(s.staging.some((u) => u.code === C.guard));
  reload(s);
});
test("Search recovery is not a draw and discarded cards return to their physical owner's discard", () => {
  let s = base(2);
  const borrowed = { ...make(s, "01022"), owner: 1 };
  const own = make(s, "01023");
  s.catchOrc!.decks[0] = [borrowed, own];
  effect(s, fx("catchSearch", { value: 5, player: 0 }));
  flush(s);
  s = choose(reload(s), own.id);
  assert.equal(seatView(s, 0).hand[0].id, own.id);
  assert.ok(seatView(s, 1).discard.includes(borrowed.code));
  assert.ok(
    !s.log.some(
      (l) => /Drew .*cards?/.test(l.text) && l.text.includes("Search"),
    ),
  );
});
test("Orc Cave searches five only for the first player and an exhausted out-of-play deck is not reshuffled", () => {
  let s = base(2);
  s.table!.first = 1;
  forOwner(s, 1, () => (s.catchOrc!.decks[1] = [make(s, "01050")]));
  s.catchOrc!.decks[0] = [make(s, C.mugash)];
  const cave = make(s, C.cave);
  s.activeLocation = cave;
  progressLocation(s, cave, 4);
  flush(s);
  assert.equal(s.table!.active, 1);
  s = choose(reload(s), s.choice!.options[0].id);
  assert.equal(s.catchOrc!.decks[1].length, 0);
  assert.equal(s.catchOrc!.decks[0].length, 1);
  assert.equal(seatView(s, 1).hand.length, 1);
});
test("Every Mugash's Lair reveals one card per player at encounter start, discarding player cards without recovery", () => {
  let s = base(2);
  s.staging = [make(s, C.lair)];
  s.activeLocation = make(s, C.lair);
  s.catchOrc!.decks[0] = [make(s, "01022"), make(s, C.mugash)];
  forOwner(
    s,
    1,
    () => (s.catchOrc!.decks[1] = [make(s, C.guard), make(s, "01050")]),
  );
  catchEncounterStart(s);
  s = settle(s);
  assert.equal(s.choice, null);
  assert.ok(s.staging.some((u) => u.code === C.mugash));
  assert.ok(s.staging.some((u) => u.code === C.guard));
  assert.ok(seatView(s, 0).discard.includes("01022"));
  assert.ok(seatView(s, 1).discard.includes("01050"));
  assert.equal(seatView(s, 0).hand.length, 0);
  assert.equal(seatView(s, 1).hand.length, 0);
});
test("Methedras Orc shuffles exactly one actual random hand card at attack start, before defender selection", () => {
  let s = base();
  const enemy = make(s, C.methedrasOrc);
  s.engaged = [enemy];
  s.hand = [make(s, "01022"), make(s, "01023")];
  const ids = s.hand.map((u) => u.id);
  enemyAttackStarted(s, enemy, 0);
  s = settle(s);
  assert.equal(s.hand.length, 1);
  assert.equal(s.catchOrc!.decks[0].length, 1);
  assert.ok(ids.includes(s.catchOrc!.decks[0][0].id));
  assert.ok(
    !s.log.at(-1)!.text.includes(card(s.catchOrc!.decks[0][0].code).name),
  );
  enemy.feinted = true;
  enemyAttackStarted(s, enemy, 0);
  flush(s);
  assert.equal(s.hand.length, 1);
});
test("Searching for Mugash cannot gain time when the active location absorbs all progress", () => {
  const s = base();
  s.activeLocation = make(s, C.lair);
  effect(s, fx("questSucceeded", { value: 2 }));
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(s.activeLocation, null);
  assert.equal(s.catchOrc!.time, 2);
  assert.equal(s.stage, 2);
});
test("A successful quest response adds one time and still explores the active location; it can exceed printed Time 2", () => {
  let s = base();
  s.activeLocation = make(s, C.lair);
  effect(s, fx("questSucceeded", { value: 5 }));
  flush(s);
  assert.match(s.choice!.title, /Successful quest/);
  assert.equal(s.activeLocation!.progress, 0);
  s = choose(reload(s), "time");
  assert.equal(s.catchOrc!.time, 3);
  assert.equal(s.progress, 0);
  assert.equal(s.activeLocation, null);
  effect(s, fx("questSucceeded", { value: 1 }));
  flush(s);
  s = choose(s, "time");
  assert.equal(s.catchOrc!.time, 4);
  reload(s);
});
test("Mugash found by this quest's exploration cannot unlock stage three in the earlier response window", () => {
  let s = base();
  s.activeLocation = make(s, C.methedras);
  s.catchOrc!.decks[0] = [make(s, C.mugash)];
  effect(s, fx("questSucceeded", { value: 4 }));
  flush(s);
  assert.ok(!s.choice!.options.some((o) => o.id === "advance"));
  s = choose(reload(s), "time");
  assert.equal(s.stage, 2);
  assert.ok(s.staging.some((u) => u.code === C.mugash));
  effect(s, fx("questSucceeded", { value: 1 }));
  flush(s);
  s = choose(reload(s), "advance");
  assert.equal(s.stage, 3);
  assert.equal(s.catchOrc!.time, 3);
  assert.equal(s.progress, 0);
});
test("The stage-two response is optional and card-effect progress never offers it", () => {
  let s = base();
  effect(s, fx("questSucceeded", { value: 3 }));
  flush(s);
  s = choose(s, "skip");
  assert.equal(s.progress, 3);
  assert.equal(s.stage, 2);
  assert.equal(s.catchOrc!.time, 2);
  progress(s, 2, true);
  assert.equal(s.progress, 5);
  assert.equal(s.choice, null);
});
test("Stage advancement finishes quest-attachment responses before moving on and cancelling the quest progress", () => {
  let s = base();
  captive(s);
  s.questAttachments = {
    [C.search]: [{ id: "long-defeat", code: "10122", exhausted: false }],
  };
  effect(s, fx("questSucceeded", { value: 3 }));
  flush(s);
  s = choose(reload(s), "advance");
  assert.match(s.choice!.title, /The Long Defeat/);
  assert.equal(s.stage, 2);
  s = choose(reload(s), "skip");
  assert.equal(s.stage, 3);
  assert.equal(s.progress, 0);
  assert.equal(s.pendingQuestDefeat, undefined);
});
test("Eliminating the captive's controller loses even while another fellowship survives", () => {
  const s = base(2);
  captive(s, 1);
  forOwner(s, 1, () => (s.threat = 50));
  check(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Mugash/);
});
test("Readying costs and target menus exclude Mugash's captor before any resources or attachments are spent", () => {
  const s = base(),
    hero = captive(s),
    swift = make(s, "08003");
  s.hand = [swift];
  hero.attachments.push({ id: "courage", code: "01057", exhausted: false });
  assert.ok(canPlay(s, swift));
  assert.equal(
    availableAbilities(s, hero).find((a) => a.id === "courage")!.disabled,
    true,
  );
  assert.throws(
    () =>
      applyAction(s, { type: "ABILITY", id: hero.id, attachmentId: "courage" }),
    /cannot be readied/,
  );
  assert.equal(
    hero.attachments.find((a) => a.id === "courage")!.exhausted,
    false,
  );
});
test("Ride Them Down prevents the stage-two response and instead damages its selected enemy after the active buffer", () => {
  const s = base(),
    target = make(s, C.guard);
  s.staging = [target];
  s.activeLocation = make(s, C.lair);
  finalRingEvent(s, "08142", target.id);
  effect(s, fx("questSucceeded", { value: 5 }));
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(target.damage, 3);
  assert.equal(s.catchOrc!.time, 2);
  assert.equal(s.progress, 0);
});
test("Stage-two timeout shuffles the discard into the encounter deck, reveals two cards per player, then resets Time", () => {
  const s = base(2);
  s.encounterDeck = [C.methedras, C.methedras];
  s.encounterDiscard = [C.lair, C.lair];
  s.catchOrc!.time = 1;
  removeQuestTime(s);
  flush(s);
  assert.equal(s.staging.length, 4);
  assert.equal(s.catchOrc!.time, 2);
  assert.equal(s.encounterDeck.length, 0);
  assert.equal(s.encounterDiscard.length, 0);
  reload(s);
});
test("Refresh removes Time only after the refresh action window", () => {
  let s = base();
  s.phase = "refresh";
  s.catchOrc!.time = 2;
  s = applyAction(s, { type: "NEXT" });
  assert.equal(s.catchOrc!.time, 1);
  assert.equal(s.phase, "resource");
});
test("Defeated Mugash becomes a physical captive on the first player's chosen hero, without entering discard", () => {
  let s = base(2);
  s.table!.first = 1;
  const enemy = make(s, C.mugash);
  s.engaged = [enemy];
  damage(s, enemy.id, 8);
  flush(s);
  assert.equal(s.table!.active, 1);
  assert.equal(s.catchOrc!.capturing!.id, enemy.id);
  assert.ok(!s.encounterDiscard.includes(C.mugash));
  const hero = seatView(s, 1).heroes[1];
  s = choose(reload(s), hero.id);
  assert.equal(mugashCarrier(s)!.id, hero.id);
  assert.equal(mugashCarrier(s)!.attachments[0].id, enemy.id);
  assert.equal(mugashCarrier(s)!.exhausted, true);
  readyCharacter(s, mugashCarrier(s)!);
  assert.equal(mugashCarrier(s)!.exhausted, true);
  reload(s);
});
test("A captive hero cannot ready at refresh and destroying or discarding that hero loses the game", () => {
  for (const discard of [false, true]) {
    const s = base(),
      hero = captive(s);
    effect(s, fx("refreshReady"));
    assert.equal(hero.exhausted, true);
    if (discard) discardCharacter(s, hero);
    else damage(s, hero.id, 100);
    assert.equal(s.status, "lost");
    assert.match(s.reason, /Mugash/);
  }
});
test("End-of-refresh escape leaves the former captor exhausted because the ready step has already passed", () => {
  let s = base();
  s.stage = 3;
  s.catchOrc!.time = 1;
  const hero = captive(s);
  effect(s, fx("refreshReady"));
  flush(s);
  assert.equal(hero.exhausted, true);
  s = applyAction(reload(s), { type: "NEXT" });
  assert.equal(s.phase, "resource");
  assert.equal(mugashCarrier(s), undefined);
  assert.equal(get(s, hero.id)!.exhausted, true);
});
test("Mugash's Guard continuously engages the captive's controller, including from another player's area", () => {
  const s = base(2),
    guard = make(s, C.guard);
  s.engaged = [guard];
  captive(s, 1);
  check(s);
  assert.equal(ownerOf(s, guard), 1);
  assert.ok(!seatView(s, 0).engaged.some((u) => u.id === guard.id));
  assert.equal(
    seatView(s, 1).engaged.filter((u) => u.id === guard.id).length,
    1,
  );
  reload(s);
});
test("A guard's actual combat kill frees Mugash, while noncombat damage does not", () => {
  for (const combatDamage of [false, true]) {
    let s = base(),
      hero = captive(s),
      guard = make(s, C.guard),
      ally = make(s, "01014");
    s.engaged = [guard];
    s.allies = [ally];
    s.combat = { enemyId: guard.id, attackBonus: 0 };
    damage(s, ally.id, 100, { enemyId: guard.id, combatDamage });
    s = settle(s);
    assert.equal(!!mugashCarrier(s), !combatDamage);
    assert.equal(
      s.staging.some((u) => u.code === C.mugash),
      combatDamage,
    );
    assert.equal(get(s, hero.id)!.exhausted, true);
  }
});
test("A guard killing Mugash's own captor still loses immediately", () => {
  const s = base(),
    hero = captive(s),
    guard = make(s, C.guard);
  s.engaged = [guard];
  s.combat = { enemyId: guard.id, attackBonus: 0 };
  damage(s, hero.id, 100, { enemyId: guard.id, combatDamage: true });
  flush(s);
  assert.equal(s.status, "lost");
  assert.ok(!s.staging.some((u) => u.code === C.mugash));
});
test("Stage three buffers active locations but cannot receive any progress or win without the captive", () => {
  const s = base();
  s.stage = 3;
  s.activeLocation = make(s, C.lair);
  progress(s, 20, false, true);
  assert.equal(s.activeLocation, null);
  assert.equal(s.progress, 0);
  assert.equal(s.status, "playing");
  progress(s, 2, true);
  assert.equal(s.progress, 0);
  captive(s);
  progress(s, 15, false, true);
  check(s);
  assert.equal(s.status, "won");
});
test("Stage-three timeout returns the same captive to staging, reveals players minus one, and resets to three", () => {
  let s = base(2);
  s.stage = 3;
  s.catchOrc!.time = 1;
  const hero = captive(s),
    id = hero.attachments[0].id;
  s.encounterDeck = [C.lair, C.methedras];
  removeQuestTime(s);
  s = settle(s);
  assert.equal(s.staging.find((u) => u.code === C.mugash)!.id, id);
  assert.equal(s.staging.filter((u) => u.code === C.lair).length, 1);
  assert.equal(s.encounterDeck.length, 1);
  assert.equal(s.catchOrc!.time, 3);
  assert.equal(mugashCarrier(s), undefined);
});
test("Stage-three timeout also returns engaged Mugash without healing him", () => {
  const s = base();
  s.stage = 3;
  s.catchOrc!.time = 1;
  const m = make(s, C.mugash);
  m.damage = 4;
  s.engaged = [m];
  removeQuestTime(s);
  flush(s);
  assert.equal(s.engaged.length, 0);
  assert.equal(s.staging[0].id, m.id);
  assert.equal(s.staging[0].damage, 4);
  assert.equal(s.catchOrc!.time, 3);
});
test("Methedras raises only staging location threat and multiple active copies stack", () => {
  const s = base(),
    l = make(s, C.lair),
    enemy = make(s, C.hunter);
  s.staging = [l, enemy];
  s.activeLocation = make(s, C.methedras);
  s.extraActiveLocations = [make(s, C.methedras)];
  assert.equal(threatOf(s, l), 6);
  assert.equal(threatOf(s, enemy), 2);
  assert.equal(threatOf(s, s.activeLocation), 2);
});
test("Broken Lands prevents progress on every staging location, including itself, until it leaves staging", () => {
  const s = base(),
    land = make(s, C.lands),
    lair = make(s, C.lair);
  s.staging = [land, lair];
  progressLocation(s, land, 1);
  progressLocation(s, lair, 1);
  assert.equal(land.progress, 0);
  assert.equal(lair.progress, 0);
  s.staging = [lair];
  s.activeLocation = land;
  progressLocation(s, land, 1);
  progressLocation(s, lair, 1);
  assert.equal(land.progress, 1);
  assert.equal(lair.progress, 1);
});
test("Prowling Wolf gains attack only while engaged and counts current staging locations", () => {
  const s = base(),
    wolf = make(s, C.wolf);
  s.staging = [wolf, make(s, C.methedras), make(s, C.lair)];
  assert.equal(stats(s, wolf).attack, 1);
  engage(s, wolf);
  assert.equal(stats(s, wolf).attack, 3);
  s.activeLocation = s.staging.pop()!;
  assert.equal(stats(s, wolf).attack, 2);
});
test("Orc Cave's travel discards per player, adds only discarded Orcs without their When Revealed and never reshuffles", () => {
  let s = base(2);
  s.phase = "travel";
  const cave = make(s, C.cave);
  s.staging = [cave];
  s.encounterDeck = [C.hunter, C.hound];
  s.encounterDiscard = [C.methedras];
  s = applyAction(s, { type: "TRAVEL", id: cave.id });
  s = settle(s);
  assert.equal(s.activeLocation!.id, cave.id);
  assert.ok(s.staging.some((u) => u.code === C.hunter));
  assert.ok(!s.staging.some((u) => u.code === C.hound));
  assert.ok(s.encounterDiscard.includes(C.hound));
  assert.equal(s.catchOrc!.time, 2);
  assert.equal(s.encounterDeck.length, 0);
});
test("Orc Territory offers locations from both zones to each player and allows repeated location titles", () => {
  let s = base(2);
  s.encounterDeck = [C.lair, C.lair];
  s.encounterDiscard = [C.methedras];
  revealed(s, C.territory);
  flush(s);
  assert.ok(s.choice!.options.some((o) => o.id === `discard:${C.methedras}`));
  s = choose(reload(s), `deck:${C.lair}`);
  s = choose(reload(s), `deck:${C.lair}`);
  assert.equal(s.staging.filter((u) => u.code === C.lair).length, 2);
  assert.equal(s.choice, null);
});
test("Orc Territory attacks only engaged Orcs when total staging threat is strictly less than committed willpower", () => {
  let s = base();
  const orc = make(s, C.hunter),
    wolf = make(s, C.wolf);
  s.engaged = [orc, wolf];
  s.heroes[0].committed = true;
  s.heroes[0].tempWill = 8;
  s.encounterDeck = [C.methedras, C.methedras];
  revealed(s, C.territory);
  flush(s);
  s = choose(s, `deck:${C.methedras}`);
  assert.equal(s.combat!.enemyId, orc.id);
  assert.match(s.choice!.title, /Immediate attack/);
  s = choose(reload(s), s.heroes[1].id);
  s = settle(s);
  assert.equal(s.combat, null);
  assert.equal(get(s, wolf.id)!.attacked, false);
});
test("Orc Hunting Party deals one shadow to every Orc, reduces engagement until round end, and checks surge before resolution", () => {
  const s = base(),
    orc = make(s, C.hunter),
    wolf = make(s, C.wolf),
    guard = make(s, C.guard);
  s.staging = [orc, wolf];
  s.engaged = [guard];
  s.encounterDeck = [C.methedras, C.lair, C.lands];
  catchEncounter(s, C.party);
  assert.equal(orc.shadows.length, 1);
  assert.equal(guard.shadows.length, 1);
  assert.equal(wolf.shadows.length, 0);
  assert.equal(
    engagementCost(s, orc),
    Math.max(0, card(orc.code).engagement! - 15),
  );
  phaseEnd(s);
  assert.equal(orc.tempEngagement, -15);
  effect(s, fx("endRoundAfterCollector"));
  assert.equal(orc.tempEngagement, undefined);
});
test("Orc Hunting Party gains surge even with engaged Orcs if staging has no Orc", () => {
  let s = base();
  s.engaged = [make(s, C.guard)];
  s.encounterDeck = [C.methedras, C.lair];
  revealed(s, C.party);
  s = settle(s);
  assert.equal(s.engaged[0].shadows[0], C.methedras);
  assert.ok(s.staging.some((u) => u.code === C.lair));
});
test("Hunting Party's extra shadows survive phase changes but all physical staging shadows are discarded at combat end", () => {
  const s = base(),
    enemy = make(s, C.hunter);
  s.staging = [enemy];
  s.encounterDeck = [C.methedras];
  catchEncounter(s, C.party);
  phaseEnd(s);
  assert.deepEqual(enemy.shadows, [C.methedras]);
  effect(s, fx("endCombat"));
  assert.deepEqual(enemy.shadows, []);
  assert.ok(s.encounterDiscard.includes(C.methedras));
});
test("Canceling Orc Hunting Party cancels its conditional Surge as well as shadows and engagement reduction", () => {
  let s = base();
  s.hand = [make(s, "01050")];
  s.heroes[0].phaseResourceIcons = ["spirit"];
  s.engaged = [make(s, C.guard)];
  s.encounterDeck = [C.methedras, C.lair];
  revealed(s, C.party);
  flush(s);
  assert.ok(s.choice!.options.some((o) => o.id === "cancel"));
  s = choose(reload(s), "cancel");
  assert.equal(s.encounterDeck.length, 2);
  assert.equal(s.staging.length, 0);
  assert.equal(s.engaged[0].shadows.length, 0);
  assert.equal(s.engaged[0].tempEngagement, undefined);
});
test("Orc Hunter offers a reveal or actual time loss, and zero counters disables that alternative during timeout", () => {
  let s = base();
  s.encounterDeck = [C.methedras];
  revealed(s, C.hunter);
  flush(s);
  s = choose(reload(s), "time");
  assert.equal(s.catchOrc!.time, 1);
  assert.equal(s.encounterDeck.length, 1);
  s.catchOrc!.time = 0;
  revealed(s, C.hunter);
  flush(s);
  assert.ok(!s.choice!.options.some((o) => o.id === "time"));
  s = choose(s, "reveal");
  assert.ok(s.staging.some((u) => u.code === C.methedras));
});
test("Orc Skirmisher's engagement choice uses only the engaged player's characters or removes one time", () => {
  let s = base(2);
  const enemy = make(s, C.skirmisher);
  forOwner(s, 1, () => engage(s, enemy));
  flush(s);
  const hero = seatView(s, 1).heroes[1];
  assert.ok(s.choice!.options.some((o) => o.id === hero.id));
  assert.ok(
    !s.choice!.options.some((o) => o.id === seatView(s, 0).heroes[0].id),
  );
  s = choose(reload(s), hero.id);
  assert.equal(get(s, hero.id)!.damage, 3);
  assert.equal(s.catchOrc!.time, 2);
});
test("Orc Hound's Surge is separate from its engagement exhaust choice", () => {
  let s = base();
  s.encounterDeck = [C.methedras];
  revealed(s, C.hound);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === C.methedras));
  assert.ok(s.heroes.every((h) => !h.exhausted));
  const hound = s.staging.find((u) => u.code === C.hound)!;
  engage(s, hound);
  flush(s);
  const hero = s.heroes[0];
  s = choose(reload(s), hero.id);
  assert.equal(get(s, hero.id)!.exhausted, true);
});
test("Take Cover deals one damage to all exhausted characters across seats and still resolves Surge", () => {
  let s = base(2);
  s.heroes[0].exhausted = true;
  forOwner(s, 1, () => (s.heroes[1].exhausted = true));
  s.encounterDeck = [C.methedras];
  revealed(s, C.cover);
  flush(s);
  s = choose(reload(s), "damage");
  s = settle(s);
  assert.equal(seatView(s, 0).heroes[0].damage, 1);
  assert.equal(seatView(s, 1).heroes[1].damage, 1);
  assert.equal(seatView(s, 0).heroes[1].damage, 0);
  assert.equal(s.catchOrc!.time, 2);
  assert.ok(s.staging.some((u) => u.code === C.methedras));
});
test("Methedras Orc shadow removes time only on a real combat destruction by the same attack", () => {
  const s = base(),
    enemy = make(s, C.wolf),
    ally = make(s, "01014");
  s.engaged = [enemy];
  s.allies = [ally];
  s.combat = { enemyId: enemy.id, attackBonus: 0 };
  shadow(s, C.methedrasOrc);
  damage(s, ally.id, 1, { enemyId: enemy.id, combatDamage: true });
  flush(s);
  assert.equal(s.catchOrc!.time, 2);
  damage(s, ally.id, 100, { enemyId: enemy.id, combatDamage: true });
  flush(s);
  assert.equal(s.catchOrc!.time, 1);
});
test("Separate time-removal shadows resolve a timeout before the next physical copy removes another counter", () => {
  const s = base(),
    enemy = make(s, C.hunter),
    ally = make(s, "01014");
  s.engaged = [enemy];
  s.allies = [ally];
  s.catchOrc!.time = 1;
  s.encounterDeck = [C.methedras, C.methedras];
  s.combat = { enemyId: enemy.id, attackBonus: 0 };
  shadow(s, C.methedrasOrc);
  shadow(s, C.methedrasOrc);
  damage(s, ally.id, 100, { enemyId: enemy.id, combatDamage: true });
  flush(s);
  assert.equal(s.staging.length, 2);
  assert.equal(s.catchOrc!.time, 1);
});
test("Orc Hunter shadow schedules an extra attack after the current one and survives reload", () => {
  let s = base(),
    enemy = make(s, C.hunter);
  s.phase = "defense";
  s.engaged = [enemy];
  s.encounterDeck = [C.methedras];
  s.combat = { enemyId: enemy.id, attackBonus: 0, defenderId: s.heroes[0].id };
  catchShadow(s, C.hunter);
  s = reload(s);
  assert.equal(s.combat!.extraAttacks, 1);
  effect(s, fx("enemyDone"));
  flush(s);
  assert.equal(s.combat!.enemyId, enemy.id);
  assert.match(s.choice!.title, /Immediate attack/);
});
test("Orc Skirmisher and Broken Lands shadows compute their printed attack bonuses", () => {
  const s = base(),
    enemy = make(s, C.hunter);
  s.engaged = [enemy];
  s.staging = [make(s, C.methedras), make(s, C.lair)];
  s.combat = { enemyId: enemy.id, attackBonus: 0 };
  shadow(s, C.skirmisher);
  shadow(s, C.lands);
  assert.equal(s.combat.attackBonus, 3);
});
test("Prowling Wolf shadow exhausts only the defending player's character, including cross-seat combat", () => {
  let s = base(2),
    enemy = make(s, C.hunter);
  s.engaged = [enemy];
  s.combat = { enemyId: enemy.id, attackBonus: 0, attackPlayer: 1 };
  shadow(s, C.wolf);
  flush(s);
  const hero = seatView(s, 1).heroes[0];
  s = choose(reload(s), hero.id);
  assert.equal(get(s, hero.id)!.exhausted, true);
  assert.equal(seatView(s, 0).heroes[0].exhausted, false);
});
test("Mugash's Lair shadow discards an attachment controlled by the defending player", () => {
  let s = base(2),
    enemy = make(s, C.hunter);
  s.engaged = [enemy];
  const host = seatView(s, 1).heroes[0];
  host.attachments.push({
    id: "borrowed-attachment",
    code: "01027",
    exhausted: false,
    owner: 1,
    controller: 1,
  });
  s.combat = { enemyId: enemy.id, attackBonus: 0, attackPlayer: 1 };
  shadow(s, C.lair);
  flush(s);
  s = choose(reload(s), "borrowed-attachment");
  assert.equal(get(s, host.id)!.attachments.length, 0);
  assert.ok(seatView(s, 1).discard.includes("01027"));
});
test("Malformed hidden decks, duplicate physical cards, invalid counters and pending capture states are rejected", () => {
  const s = base();
  s.catchOrc!.decks[0] = [make(s, "01022")];
  syncSeat(s);
  assert.ok(validateSave(s));
  const mutations = [
    (v: any) => (v.catchOrc.time = -1),
    (v: any) => (v.catchOrc.time = 1.5),
    (v: any) => (v.catchOrc.decks[4] = []),
    (v: any) => v.catchOrc.decks[0].push(v.heroes[0]),
    (v: any) => v.catchOrc.searched.push(v.catchOrc.decks[0][0]),
    (v: any) => (v.catchOrc.capturing = v.heroes[0]),
    (v: any) => (v.catchOrc.decks[0][0].code = C.cover),
    (v: any) => delete v.catchOrc,
  ];
  for (const mutate of mutations) {
    const v = structuredClone(s);
    mutate(v);
    assert.equal(validateSave(v), false);
  }
});
