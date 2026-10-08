import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { applyAction, canTravel, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, make, stats, threatOf } from "../src/game/core";
import {
  check,
  damage,
  destroy,
  discardAttachment,
  placeEncounter,
  progress,
  progressLocation,
  takePlayerDiscard,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import { allEngaged, forOwner, playerOrder, seatView } from "../src/game/table";
import {
  DREAD as D,
  DREAD_ENCOUNTERS,
  DREAD_QUESTS,
  DREAD_RECIPES,
} from "../src/game/dread-realm-support";
import {
  dreadReanimate,
  dreadQuestEnd,
  dreadQuestProgress,
  dreadRoundEnd,
  dreadShadowResolved,
  setupDreadRealm,
} from "../src/game/dread-realm";
import { currentQuestUnit } from "../src/game/quest-state";
import {
  sideQuestStart,
  addCurrentQuestProgress,
} from "../src/game/side-quests";
import {
  base,
  choose,
  reload,
  second,
  settle,
  start,
} from "./dread-realm-fixtures";
import type { GameState, Unit } from "../src/game/types";
function staged(s: GameState, code: string) {
  const u = make(s, code);
  s.staging.push(u);
  return u;
}
function ally(s: GameState, code = "01016", player = 0) {
  let u!: Unit;
  forOwner(s, player, () => {
    u = make(s, code);
    s.allies.push(u);
  });
  return u;
}
function finish(s: GameState) {
  flush(s);
  return settle(s);
}
function pick(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    JSON.stringify(s.choice),
  );
  return choose(reload(s), id);
}
function boss(s: GameState) {
  return [...s.staging, ...allEngaged(s)].find((u) => u.code === D.daechanar)!;
}

test("Dread Realm: original faces, shared canonical cards and exact easy recipe", () => {
  assert.equal(DREAD_ENCOUNTERS.length, 12);
  assert.equal(DREAD_QUESTS.length, 3);
  for (const c of [...DREAD_ENCOUNTERS, ...DREAD_QUESTS]) {
    assert.equal(card(c.code).name, c.name);
    assert.ok(existsSync(`public${c.imagesrc}`));
  }
  for (const [mode, n] of [
    ["standard", 46],
    ["easy", 29],
  ] as const) {
    const r = DREAD_RECIPES.find((r) => r.mode === mode)!;
    assert.equal(
      r.cards
        .filter((c) => c.section === "sharedEncounterDeck")
        .reduce((a, c) => a + c.quantity, 0),
      n,
    );
    assert.equal(
      r.cards.filter((c) => c.section === "sharedSetAside").length,
      2,
    );
    assert.equal(
      r.cards.filter((c) => c.section === "sharedQuestDeck").length,
      3,
    );
    assert.ok(!r.card_codes.some((c) => c.includes("74f12c0b")));
  }
});
test("Dread Realm: normal/easy setup for 1–4 players reveals and reanimates after opening decisions", () => {
  for (const easy of [false, true])
    for (let players = 1; players <= 4; players++) {
      const s = start(players, easy);
      assert.equal(s.scenarioId, "the-dread-realm");
      assert.equal(s.dreadRealm!.initialized, true);
      assert.equal(s.dreadRealm!.setAside.length, 2);
      assert.equal(s.stage, 1);
      for (const p of playerOrder(s))
        assert.ok(
          seatView(s, p).engaged.some(
            (u) => u.code === D.reanimated && u.facedownCard && u.owner === p,
          ),
        );
      assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
    }
});
test("Dread Realm: facedown physical identity follows owner rather than defending controller", () => {
  let s = base(2);
  const physical = make(s, "01013");
  physical.owner = 1;
  const e = dreadReanimate(s, physical, 0);
  assert.equal(e.id, physical.id);
  assert.equal(e.facedownCardId, physical.id);
  assert.equal(e.owner, 1);
  assert.equal(card(e.code).type_code, "enemy");
  assert.equal(stats(s, e).health, 2);
  s = reload(s);
  destroy(s, get(s, e.id)!, false);
  assert.deepEqual(seatView(s, 0).discard, []);
  assert.deepEqual(seatView(s, 1).discard, [physical.code]);
  let returned!: Unit;
  forOwner(s, 1, () => {
    returned = takePlayerDiscard(s, 0, { encounterEffect: true });
  });
  assert.equal(returned.id, physical.id);
  assert.equal(returned.code, physical.code);
});
test("Dread Realm: Dark Halls stacks only in staging and Unholy Crypt counts all reanimated enemies", () => {
  const s = base(2);
  const e = dreadReanimate(s, make(s, "01013"), 1);
  staged(s, D.halls);
  staged(s, D.halls);
  const crypt = staged(s, D.crypt);
  assert.equal(stats(s, e).attack, 4);
  assert.equal(stats(s, e).defense, 4);
  assert.equal(threatOf(s, crypt), 2);
  const hall = s.staging.find((u) => u.code === D.halls)!;
  s.staging = s.staging.filter((u) => u.id !== hall.id);
  assert.equal(stats(s, e).attack, 3);
  s.activeLocation = s.staging.find((u) => u.code === D.halls)!;
  s.staging = s.staging.filter((u) => u.id !== s.activeLocation!.id);
  assert.equal(stats(s, e).attack, 2);
});
test("Dread Realm: stage1 transfers physical quest Sorceries before stage2 setup and Altar buffers while boss lives", () => {
  let s = base(2);
  const ids = s.dreadRealm!.setAside.map((u) => u.id);
  s.questAttachments = {
    [D.catacombs]: [
      { id: "a900", code: D.curse, exhausted: false },
      { id: "a901", code: D.calamity, exhausted: false },
    ],
  };
  const old = staged(s, D.halls);
  s.activeLocation = old;
  s.staging = [];
  s.progress = 18;
  check(s);
  s = finish(s);
  assert.equal(s.stage, 2);
  assert.deepEqual(
    currentQuestUnit(s)!.attachments.map((a) => a.id),
    ["a900", "a901"],
  );
  assert.equal(boss(s).id, ids[0]);
  assert.equal(s.activeLocation!.id, ids[1]);
  assert.ok(s.staging.some((u) => u.id === old.id));
  assert.equal(s.encounterDiscard.includes(D.curse), false);
  assert.equal(s.encounterDiscard.includes(D.calamity), false);
  const altar = s.activeLocation!;
  progressLocation(s, altar, 100);
  progress(s, 100);
  flush(s);
  assert.equal(altar.progress, 0);
  assert.equal(s.progress, 0);
  assert.equal(s.stage, 2);
});
test("Dread Realm: Daechanar cancels an entire damage event and removes one Sorcery without discarding Possession", () => {
  let s = second();
  const e = dreadReanimate(s, make(s, "01016"), 0, true);
  e.attachments.push({ id: "a910", code: D.possession, exhausted: false });
  const b = boss(s);
  assert.equal(stats(s, b).attack, 5);
  damage(s, b.id, 20);
  flush(s);
  assert.equal(b.damage, 0);
  assert.ok(s.choice);
  s = pick(s, "a910");
  assert.ok(get(s, e.id));
  assert.ok(s.removedEncounter!.includes(D.possession));
  assert.equal(s.encounterDiscard.includes(D.possession), false);
  assert.equal(stats(s, get(s, b.id)!).attack, 4);
  damage(s, b.id, 12);
  s = finish(s);
  assert.equal(s.stage, 3);
  assert.ok(s.victoryCards!.includes(D.daechanar));
});
test("Dread Realm: Wraith leaves as the same Sorcery attachment and returns as enemy only when host leaves", () => {
  let s = base();
  const w = staged(s, D.wraith);
  const h = s.heroes[0];
  const before = stats(s, h).attack;
  damage(s, w.id, 5);
  flush(s);
  s = pick(s, h.id);
  assert.equal(s.encounterDiscard.includes(D.wraith), false);
  assert.equal(get(s, h.id)!.attachments[0].id, w.id);
  assert.equal(stats(s, get(s, h.id)!).attack, Math.max(0, before - 1));
  const host = get(s, h.id)!;
  destroy(s, host, false);
  assert.ok(s.staging.some((u) => u.id === w.id && u.code === D.wraith));
  const returned = get(s, w.id)!;
  assert.equal(returned.damage, 0);
  assert.equal(returned.shadows.length, 0);
});
test("Dread Realm: Possession destroys, reanimates a borrowed highest-cost ally in staging, and discards host with attachment", () => {
  let s = base(2);
  const low = ally(s, "01016", 0),
    high = ally(s, "01073", 1);
  high.owner = 0;
  placeEncounter(s, D.possession);
  flush(s);
  assert.equal(s.choice!.options.length, 1);
  s = pick(s, high.id);
  const e = get(s, high.id)!;
  assert.equal(e.code, D.reanimated);
  assert.equal(e.owner, 0);
  assert.ok(s.staging.some((u) => u.id === high.id));
  assert.ok(get(s, low.id));
  assert.ok(!seatView(s, 1).discard.includes(high.code));
  discardAttachment(s, e, e.attachments[0]);
  s = finish(s);
  assert.equal(get(s, e.id), undefined);
  assert.ok(seatView(s, 0).discard.includes(high.code));
});
test("Dread Realm: Witch Sorcery resolves after shadow text and physical attaching shadow leaves shadow pile", () => {
  let s = base();
  const e = staged(s, D.witch);
  s.staging = [];
  s.engaged.push(e);
  e.shadows = [D.calamity, D.curse];
  e.revealedShadowCount = 1;
  s.combat = {
    enemyId: e.id,
    defenderId: s.heroes[0].id,
    attackBonus: 0,
    defenseBonus: 0,
    attackPlayer: 0,
  };
  dreadShadowResolved(s, e, D.calamity);
  s = finish(s);
  const q = currentQuestUnit(s)!;
  assert.equal(q.attachments.filter((a) => a.code === D.calamity).length, 1);
  assert.deepEqual(get(s, e.id)!.shadows, [D.curse]);
  assert.equal(get(s, e.id)!.revealedShadowCount, 0);
  assert.equal(s.engaged.filter((u) => u.code === D.reanimated).length, 1);
  assert.equal(s.encounterDiscard.includes(D.calamity), false);
});
test("Dread Realm: Sinister Dungeon explores into physical shadow of random hand card", () => {
  let s = base();
  const physical = make(s, "01013");
  s.hand.push(physical);
  const dungeon = staged(s, D.dungeon);
  progressLocation(s, dungeon, 1);
  s = finish(s);
  const enemy = get(s, physical.id)!;
  assert.equal(enemy.facedownCard, physical.code);
  assert.deepEqual(enemy.shadows, [D.dungeon]);
  assert.equal(s.hand.length, 0);
  assert.equal(s.encounterDiscard.includes(D.dungeon), false);
});
test("Dread Realm: stage3 progress divides after buffering, side quest remains separate, victory waits for quest end", () => {
  let s = base();
  s.stage = 3;
  s.dreadRealm!.setAside = [];
  s.dreadRealm!.daechanarDefeated = true;
  const a = staged(s, D.halls),
    b = staged(s, D.tombs);
  assert.equal(dreadQuestProgress(s, 7), true);
  flush(s);
  s = pick(s, `${a.id}:4`);
  s = pick(s, `${b.id}:3`);
  assert.equal(
    s.staging.some((u) => [a.id, b.id].includes(u.id)),
    false,
  );
  assert.equal(s.status, "playing");
  s.queue.push(...dreadQuestEnd(s));
  s = finish(s);
  assert.equal(s.status, "won");
});
test("Dread Realm: surviving locations cause end-quest damage and zero player deck is legal", () => {
  const s = base(2);
  s.stage = 3;
  s.dreadRealm!.setAside = [];
  s.dreadRealm!.daechanarDefeated = true;
  staged(s, D.halls);
  forOwner(s, 0, () => {
    s.deck = [];
  });
  check(s);
  assert.equal(s.status, "playing");
  assert.equal(s.table!.seats[0].eliminated, false);
  s.queue.push(...dreadQuestEnd(s));
  finish(s);
  for (const p of playerOrder(s))
    for (const h of seatView(s, p).heroes) assert.equal(h.damage, 1);
});
test("Dread Realm: Tombs discards each player's actual top ally and reanimates without triggering fake reveals", () => {
  let s = base(2);
  staged(s, D.tombs);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.deck = ["01013", "01057"];
      s.discard = ["01013"];
    });
  s.queue.push(...dreadRoundEnd(s));
  s = finish(s);
  for (const p of playerOrder(s)) {
    assert.deepEqual(seatView(s, p).discard, ["01013"]);
    assert.equal(
      seatView(s, p).engaged.filter((u) => u.code === D.reanimated).length,
      1,
    );
    assert.deepEqual(seatView(s, p).deck, ["01057"]);
  }
});
test("Dread Realm: save rejects malformed aside/bindings and preserves pending physical Wraith decision", () => {
  let s = base();
  const w = staged(s, D.wraith);
  damage(s, w.id, 5);
  flush(s);
  s = reload(s);
  assert.equal(s.dreadRealm!.pendingWraiths[0].id, w.id);
  assert.ok(s.choice);
  const json = JSON.parse(JSON.stringify(s));
  json.dreadRealm.discardBindings = [
    { id: "cBAD", code: "01013", owner: 99, index: 0 },
  ];
  assert.equal(validateSave(json), false);
  json.dreadRealm.discardBindings = [];
  json.dreadRealm.setAside.push(make(s, D.halls));
  assert.equal(validateSave(json), false);
});

test("Dread Realm: a real Dwimmerlaik attack reanimates the same borrowed defender once despite a second reanimation shadow", () => {
  let s = base(2);
  const e = make(s, D.dwimmerlaik);
  s.engaged.push(e);
  const victim = ally(s, "01016", 0);
  victim.owner = 1;
  s.phase = "defense";
  e.shadows = [D.crypt];
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: e.id,
    defenderId: victim.id,
  });
  s = settle(s);
  const returned = get(s, victim.id)!;
  assert.ok(returned);
  assert.equal(returned.code, D.reanimated);
  assert.equal(returned.owner, 1);
  assert.ok(seatView(s, 0).engaged.some((u) => u.id === victim.id));
  assert.equal(seatView(s, 1).discard.includes(victim.code), false);
  assert.equal(returned.shadows.length, 1);
  assert.equal(
    allEngaged(s).filter((u) => u.facedownCardId === victim.id).length,
    1,
  );
});

test("Dread Realm: a Sorcery shadow still resolves Witch's Forced text when Hasty Stroke cancels its shadow effect", () => {
  let s = base();
  const e = make(s, D.witch);
  s.engaged.push(e);
  s.phase = "defense";
  e.shadows = [D.calamity];
  s.hand.push(make(s, "01048"));
  s.heroes[0].attachments.push({ id: "a920", code: "02081", exhausted: false });
  for (const h of s.heroes) h.resources = 5;
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: e.id,
    defenderId: s.heroes[0].id,
  });
  assert.ok(s.choice!.options.some((o) => o.id === "cancel"));
  s = pick(s, "cancel");
  s = settle(s);
  assert.equal(
    currentQuestUnit(s)!.attachments.filter((a) => a.code === D.calamity)
      .length,
    1,
  );
  assert.equal(get(s, e.id)!.shadows.includes(D.calamity), false);
  assert.ok(s.engaged.some((u) => u.code === D.reanimated));
  assert.ok(s.discard.includes("01048"));
});

test("Dread Realm: Death and Calamity attaches to a selected side quest and counts all physical copies", () => {
  let s = base();
  placeEncounter(s, D.power);
  flush(s);
  s.phase = "quest";
  sideQuestStart(s);
  flush(s);
  const side = s.staging.find((u) => u.code === D.power)!;
  s = pick(s, side.id);
  placeEncounter(s, D.calamity);
  s = finish(s);
  placeEncounter(s, D.calamity);
  s = finish(s);
  assert.equal(
    get(s, side.id)!.attachments.filter((a) => a.code === D.calamity).length,
    2,
  );
  assert.equal(s.engaged.filter((u) => u.code === D.reanimated).length, 3);
  s.stage = 3;
  s.dreadRealm!.setAside = [];
  s.dreadRealm!.daechanarDefeated = true;
  const location = staged(s, D.halls);
  progress(s, 2);
  flush(s);
  assert.equal(get(s, side.id)!.progress, 2);
  assert.equal(get(s, location.id)!.progress, 0);
});

test("Dread Realm: Terror counts distinct types across all players and Power defeat restores top five despite its own restriction", () => {
  let s = base(2);
  forOwner(s, 0, () => {
    s.deck = ["01013", "01050", "01042", "01057"];
  });
  forOwner(s, 1, () => {
    s.deck = ["01013", "01050", "01050", "01057"];
  });
  placeEncounter(s, D.terror);
  s = finish(s);
  assert.equal(s.dreadRealm!.terrorThreat, 6);
  placeEncounter(s, D.power);
  flush(s);
  const side = s.staging.find((u) => u.code === D.power)!;
  s.phase = "quest";
  sideQuestStart(s);
  flush(s);
  s = pick(s, side.id);
  addCurrentQuestProgress(s, 8);
  s = finish(s);
  assert.ok(s.victoryCards!.includes(D.power));
  for (const p of playerOrder(s)) {
    assert.equal(seatView(s, p).discard.length, 0);
    assert.equal(seatView(s, p).deck.length, 4);
  }
});

test("Dread Realm: Tombs travel pays every Undead enemy's shadow cost in full", () => {
  const s = base(),
    tombs = staged(s, D.tombs),
    first = staged(s, D.dwimmerlaik),
    second = staged(s, D.witch);
  s.phase = "travel";
  s.encounterDeck = ["01099"];
  assert.match(canTravel(s, tombs)!, /one available shadow card/);
  s.encounterDeck.push("01099");
  assert.equal(canTravel(s, tombs), null);
  const t = applyAction(reload(s), { type: "TRAVEL", id: tombs.id });
  assert.equal(t.activeLocation?.id, tombs.id);
  assert.equal(get(t, first.id)?.shadows.length, 1);
  assert.equal(get(t, second.id)?.shadows.length, 1);
  assert.equal(t.encounterDeck.length, 0);
  reload(t);
});
