import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  createGame,
  validateSave,
  canTravel,
  publicState,
  playTargets,
} from "../src/game/engine.ts";
import { card, imageUrl, STARTERS, SCRIPTED } from "../src/game/cards.ts";
import {
  make,
  fx,
  get,
  draw,
  stats,
  threatOf,
  stageInfo,
} from "../src/game/core.ts";
import {
  check,
  damage,
  destroy,
  discardCharacter,
  discardAttachment,
  nextRound,
  progressLocation,
  engage,
  revealed,
  collectResources,
} from "../src/game/board.ts";
import { flush, handle as effect } from "../src/game/effects.ts";
import {
  forOwner,
  seatView,
  playerOrder,
  syncSeat,
  ownerOf,
  allEngaged,
} from "../src/game/table.ts";
import { dunlandShadow, dunlandEncounter } from "../src/game/dunland-trap.ts";
import {
  DUNLAND_TRAP as D,
  DUNLAND_TRAP_ENCOUNTERS,
  DUNLAND_TRAP_QUESTS,
  DUNLAND_TRAP_RECIPES,
} from "../src/game/dunland-trap-support.ts";
import { FORDS as F } from "../src/game/fords-isen-support.ts";
import { FANGORN as G } from "../src/game/fangorn-support.ts";
import { removeQuestTime } from "../src/game/quest-time.ts";
import { automatedScenarioId } from "../src/game/support.ts";
import { base, choose, reload } from "./dunland-trap-fixtures.ts";
import type { GameState, Unit } from "../src/game/types.ts";
function settle(s: GameState, limit = 150) {
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
function attach(s: GameState, u: Unit, code: string, owner?: number) {
  u.attachments.push({
    id: `attached-${s.nextId++}`,
    code,
    exhausted: false,
    ...(owner !== undefined ? { owner } : {}),
  });
  return u.attachments.at(-1)!;
}
function finalStage(players = 1) {
  let s = base(players);
  s.stage = 2;
  s.dunlandTrap!.time = 0;
  effect(s, fx("dunlandAdvance", { value: 3 }));
  return settle(s);
}
function combat(s: GameState) {
  const u = make(s, D.warrior);
  s.engaged = [u];
  s.combat = {
    enemyId: u.id,
    defenderId: s.heroes[0].id,
    attackBonus: 0,
    attackPlayer: 0,
  };
  return u;
}

test("Dunland imports fourteen designs, seventeen local faces and exact 45/34 physical recipes", () => {
  assert.equal(DUNLAND_TRAP_ENCOUNTERS.length, 11);
  assert.equal(DUNLAND_TRAP_QUESTS.length, 3);
  const s = base();
  for (const stage of [1, 2, 3]) {
    s.stage = stage;
    assert.match(stageInfo(s).questImage!, /^\/cards\/.+\.B\.jpg$/);
  }
  for (const r of DUNLAND_TRAP_RECIPES) {
    const rows = r.cards.filter((c) => c.section !== "sharedQuestDeck");
    assert.equal(
      rows.reduce((n, c) => n + c.quantity, 0),
      r.mode === "easy" ? 34 : 45,
    );
    for (const c of rows)
      assert.equal(
        r.mode === "easy" ? card(c.code).easy_quantity : card(c.code).quantity,
        c.quantity,
      );
  }
  for (const c of [...DUNLAND_TRAP_ENCOUNTERS, ...DUNLAND_TRAP_QUESTS]) {
    assert.match(imageUrl(c), /^\/cards\//);
    assert.ok(SCRIPTED.has(c.code));
  }
  assert.equal(
    automatedScenarioId({ name: "The Dunland Trap", mode: "standard" }),
    "the-dunland-trap",
  );
  assert.equal(
    automatedScenarioId({ name: "The Dunland Trap (Easy)", mode: "easy" }),
    "the-dunland-trap",
  );
  for (const mode of ["nightmare", "campaign"])
    assert.equal(automatedScenarioId({ name: "The Dunland Trap", mode }), null);
});
for (const players of [1, 2, 3, 4])
  for (const easy of [false, true])
    test(`Dunland setup ${players} players / ${easy ? "easy" : "normal"} allows repeated Boar titles after opening hands`, () => {
      const d = STARTERS[0];
      let s = createGame(11, d.cards, d.heroes, d.id, {
        scenarioId: "the-dunland-trap",
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
      assert.equal(s.choice, null);
      assert.equal(s.dunlandTrap!.initialized, false);
      assert.equal(s.encounterDeck.length, (easy ? 34 : 45) - 3);
      assert.equal(s.dunlandTrap!.setAside.length, 3);
      for (let p = 0; p < players; p++) {
        s = applyAction(reload(s), { type: "MULLIGAN" });
        assert.equal(allEngaged(s).length, 0);
        s = applyAction(reload(s), { type: "KEEP" });
      }
      assert.equal(s.activeLocation!.code, D.road);
      for (let p = 0; p < players; p++) {
        assert.match(s.choice!.title, /Boar Clan/);
        const o = s.choice!.options.find((o) => o.code === D.warrior)!;
        assert.ok(o);
        s = choose(reload(s), o.id);
      }
      s = settle(s);
      assert.equal(s.phase, "resource");
      assert.equal(s.round, 1);
      assert.equal(s.dunlandTrap!.time, 2);
      assert.equal(s.dunlandTrap!.setAside.length, 2);
      assert.equal(
        s.encounterDeck.length,
        (easy ? 34 : 45) - 3 - players - players,
      );
      for (const p of playerOrder(s)) {
        const seat = seatView(s, p);
        assert.equal(seat.hand.length, 7);
        assert.equal(seat.engaged[0].code, D.warrior);
        assert.equal(seat.engaged[0].shadows.length, 1);
      }
      reload(s);
    });
test("Stalker gains one token for any number actually drawn, caps its stats but retains all tokens", () => {
  let s = base();
  const u = make(s, D.stalker);
  s.engaged = [u];
  draw(s, 3);
  s = settle(s);
  assert.equal(get(s, u.id)!.resources, 1);
  assert.equal(stats(s, get(s, u.id)!).attack, 1);
  get(s, u.id)!.resources = 7;
  assert.equal(stats(s, get(s, u.id)!).attack, 4);
  assert.equal(stats(s, get(s, u.id)!).defense, 4);
  draw(s, 0);
  flush(s);
  assert.equal(get(s, u.id)!.resources, 7);
  s.deck = [];
  draw(s, 4);
  flush(s);
  assert.equal(get(s, u.id)!.resources, 7);
});
test("Draw triggers share the first-player ordering choice with Tribesman and Wild Men", () => {
  const s = base();
  s.engaged = [make(s, D.stalker), make(s, D.warrior), make(s, F.tribesman)];
  s.staging = [make(s, D.foothills), make(s, D.hills)];
  s.questAttachments = {
    [D.roadQuest]: [{ id: "wild-condition", code: F.wild, exhausted: false }],
  };
  draw(s, 2);
  flush(s);
  assert.equal(s.choice!.options.length, 6);
  assert.ok(
    s.choice!.options.some((o) => o.label.includes("Boar Clan Stalker")),
  );
  assert.ok(
    s.choice!.options.some((o) => o.label.includes("Hithaeglir Foothills")),
  );
  reload(s);
});
test("Warrior draw shadows belong only to the drawing player and use no empty-deck reshuffle", () => {
  let s = base(2);
  s.engaged = [make(s, D.warrior)];
  forOwner(s, 1, () => {
    s.engaged = [make(s, D.warrior)];
    draw(s, 3);
  });
  s = settle(s);
  assert.equal(seatView(s, 0).engaged[0].shadows.length, 0);
  assert.equal(seatView(s, 1).engaged[0].shadows.length, 1);
  s.encounterDeck = [];
  s.encounterDiscard = [D.plains];
  forOwner(s, 1, () => draw(s, 1));
  s = settle(s);
  assert.equal(seatView(s, 1).engaged[0].shadows.length, 1);
  assert.deepEqual(s.encounterDiscard, [D.plains]);
});
test("Every Foothills gains one token per player draw, including the active location", () => {
  let s = base(2);
  s.activeLocation = make(s, D.foothills);
  s.staging = [make(s, D.foothills)];
  draw(s, 2);
  s = settle(s);
  forOwner(s, 1, () => draw(s, 1));
  s = settle(s);
  assert.equal(s.activeLocation!.resources, 2);
  assert.equal(threatOf(s, s.staging[0]), 2);
  s.staging[0].blanked = true;
  assert.equal(threatOf(s, s.staging[0]), 0);
});
test("Hills does not stack and puts a Dunland enemy into play without When Revealed", () => {
  let s = base();
  s.staging = [make(s, D.hills), make(s, D.hills)];
  s.encounterDeck = [F.tribesman, D.plains];
  const hand = s.hand.length;
  draw(s, 1);
  s = settle(s);
  assert.equal(s.engaged.length, 1);
  assert.equal(s.engaged[0].code, F.tribesman);
  assert.equal(s.engaged[0].roundThreat ?? 0, 0);
  assert.equal(s.hand.length, hand + 1);
  assert.deepEqual(s.encounterDeck, [D.plains]);
});
test("Hills discards non-Dunland cards without reveal, surge or replacement draws", () => {
  let s = base();
  s.staging = [make(s, D.hills)];
  s.encounterDeck = [D.frenzied, D.plains];
  draw(s, 1);
  s = settle(s);
  assert.equal(s.hand.length, 1);
  assert.deepEqual(s.encounterDiscard, [D.frenzied]);
  assert.deepEqual(s.encounterDeck, [D.plains]);
  s.encounterDeck = [];
  draw(s, 1);
  s = settle(s);
  assert.deepEqual(s.encounterDiscard, [D.frenzied]);
});
test("Hills travel requires a card for every player and resolves each draw while Hills is still staging", () => {
  let s = base(2);
  s.phase = "travel";
  const hill = make(s, D.hills);
  s.staging = [hill];
  s.encounterDeck = [D.stalker, D.warrior, D.plains];
  assert.equal(canTravel(s, hill), null);
  forOwner(s, 1, () => (s.shackles = 1));
  assert.match(canTravel(s, hill)!, /every player/);
  forOwner(s, 1, () => (s.shackles = 0));
  s = applyAction(s, { type: "TRAVEL", id: hill.id });
  s = settle(s);
  assert.equal(s.activeLocation!.id, hill.id);
  assert.equal(seatView(s, 0).engaged[0].code, D.stalker);
  assert.equal(seatView(s, 1).engaged[0].code, D.warrior);
  assert.equal(seatView(s, 0).engaged[0].resources, 0);
  assert.equal(seatView(s, 1).engaged[0].shadows.length, 0);
});
for (const [code, n] of [
  [D.plains, 0],
  [D.stream, 2],
] as const)
  test(`${card(code).name} changes only resource framework draws`, () => {
    let s = base();
    s.phase = "resource";
    s.activeLocation = make(s, code);
    s.engaged = [make(s, D.stalker)];
    collectResources(s);
    s = settle(s);
    assert.equal(s.hand.length, n);
    assert.equal(s.engaged[0].resources, n ? 1 : 0);
    draw(s, 1);
    s = settle(s);
    assert.equal(s.hand.length, n + 1);
  });
test("Resource-phase Forced reactions resolve before the next player draws", () => {
  const s = base(2);
  s.phase = "resource";
  s.staging = [make(s, D.foothills), make(s, D.hills)];
  s.encounterDeck = [D.plains];
  collectResources(s);
  flush(s);
  assert.ok(s.choice);
  assert.equal(seatView(s, 0).hand.length, 1);
  assert.equal(seatView(s, 1).hand.length, 0);
  reload(s);
});
test("Stage one timeout discards the physical hand, draws twice and resets Time after reactions", () => {
  let s = base();
  s.hand = [make(s, "01014"), make(s, "01022")];
  s.engaged = [make(s, D.stalker)];
  s.dunlandTrap!.time = 1;
  removeQuestTime(s);
  s = settle(s);
  assert.equal(s.hand.length, 2);
  assert.ok(s.discard.includes("01014"));
  assert.ok(s.discard.includes("01022"));
  assert.equal(s.engaged[0].resources, 1);
  assert.equal(s.dunlandTrap!.time, 2);
  reload(s);
});
test("Old South Road and the Time keyword each remove a counter, even when Road is staging", () => {
  let s = base();
  s.phase = "refresh";
  s.staging = [make(s, D.road)];
  s.hand = [make(s, "01014")];
  effect(s, fx("phaseEnd"));
  flush(s);
  assert.equal(s.choice!.options.length, 2);
  s = settle(s);
  assert.equal(s.dunlandTrap!.time, 2);
  assert.equal(s.hand.length, 2);
  assert.ok(s.discard.includes("01014"));
});
test("Off Track and Old South Road give separate ordered refresh effects and each Rest trigger deals damage", () => {
  let s = base();
  s.phase = "refresh";
  const road = make(s, D.road);
  attach(s, road, G.offTrack);
  s.staging = [road];
  attach(s, s.heroes[0], G.rest);
  effect(s, fx("phaseEnd"));
  flush(s);
  assert.equal(s.choice!.options.length, 3);
  s = settle(s);
  assert.equal(s.dunlandTrap!.time, 1);
  assert.equal(s.heroes[0].damage, 3);
});
test("Stage two returns the active location intact, makes Ravine active and discards only Item/Mount attachments", () => {
  let s = base();
  const old = make(s, D.plains);
  old.progress = 1;
  attach(s, old, G.offTrack);
  s.activeLocation = old;
  const item = attach(s, s.heroes[0], "01041"),
    title = attach(s, s.heroes[0], "01026"),
    skill = attach(s, s.heroes[0], "01048");
  s.allies = [make(s, "01013"), make(s, "01014")];
  s.encounterDeck = [D.stalker, ...Array(10).fill(D.plains)];
  s.progress = 18;
  check(s);
  flush(s);
  assert.match(s.choice!.title, /one ally to keep/);
  const keep = s.allies[1].id;
  s = choose(reload(s), keep);
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.equal(s.activeLocation!.code, D.ravine);
  assert.equal(s.staging.find((u) => u.id === old.id)!.progress, 1);
  assert.equal(
    s.staging.find((u) => u.id === old.id)!.attachments[0].code,
    G.offTrack,
  );
  assert.equal(s.allies.length, 1);
  assert.equal(s.allies[0].id, keep);
  assert.ok(!s.heroes[0].attachments.some((a) => a.id === item.id));
  assert.ok(s.heroes[0].attachments.some((a) => a.id === title.id));
  assert.ok(s.heroes[0].attachments.some((a) => a.id === skill.id));
  assert.equal(s.dunlandTrap!.time, 0);
  assert.equal(s.hand.length, 1);
  reload(s);
});
test("Stage two discards a borrowed Item controlled by the current seat to its physical owner", () => {
  let s = base(2);
  const a = attach(s, s.heroes[0], "01041", 1);
  effect(s, fx("dunlandDiscardEquipment"));
  assert.ok(!s.heroes[0].attachments.some((x) => x.id === a.id));
  assert.ok(seatView(s, 1).discard.includes("01041"));
  assert.ok(!seatView(s, 0).discard.includes("01041"));
  reload(s);
});
test("The trap discards allies without awarding Horn of Gondor destruction resources", () => {
  let s = base();
  attach(s, s.heroes[0], "01042");
  const resources = s.heroes[0].resources;
  s.allies = [make(s, "01013"), make(s, "01014")];
  effect(s, fx("dunlandDiscardOtherAllies", { target: s.allies[0].id }));
  assert.equal(s.heroes[0].resources, resources);
  assert.equal(s.allies.length, 1);
  assert.ok(s.discard.includes("01014"));
});
test("Stage two search can use discard and does not reveal or require distinct Boar names", () => {
  let s = base();
  s.encounterDeck = [D.plains];
  s.encounterDiscard = [D.warrior];
  effect(s, fx("dunlandSearch"));
  assert.equal(s.choice!.options[0].code, D.warrior);
  s = choose(reload(s), s.choice!.options[0].id);
  assert.equal(s.engaged[0].code, D.warrior);
  assert.deepEqual(s.encounterDiscard, []);
});
test("Ravine grants attack and defense to all Dunland enemies in play, even while staging", () => {
  const s = base();
  const ravine = s.dunlandTrap!.setAside.find((u) => u.code === D.ravine)!;
  s.dunlandTrap!.setAside = s.dunlandTrap!.setAside.filter((u) => u !== ravine);
  s.staging = [ravine, make(s, D.stalker)];
  s.engaged = [make(s, D.warrior)];
  assert.equal(stats(s, s.engaged[0]).attack, 4);
  assert.equal(stats(s, s.engaged[0]).defense, 2);
  assert.equal(stats(s, s.staging[1]).attack, 1);
  s.staging = s.staging.filter((u) => u !== ravine);
  assert.equal(stats(s, s.engaged[0]).attack, 3);
});
for (const players of [1, 2, 3, 4])
  test(`Stage three places all ${5 * players} time counters after Turch's initial engagement`, () => {
    const s = finalStage(players);
    assert.equal(s.stage, 3);
    assert.equal(s.dunlandTrap!.time, 5 * players);
    assert.equal(s.dunlandTrap!.stageThreeReady, true);
    assert.equal(seatView(s, 0).engaged[0].code, D.turch);
    assert.equal(publicState(s).timeCounters, 5 * players);
    reload(s);
  });
test("Stage two advances only at combat end and Turch enters before refresh readies", () => {
  let s = base();
  s.stage = 2;
  s.dunlandTrap!.time = 0;
  s.progress = 99;
  s.phase = "attack";
  check(s);
  flush(s);
  assert.equal(s.stage, 2);
  s.heroes[0].exhausted = true;
  effect(s, fx("endCombat"));
  s = settle(s);
  assert.equal(s.stage, 3);
  assert.equal(s.phase, "refresh");
  assert.equal(s.dunlandTrap!.time, 5);
  assert.equal(s.heroes[0].exhausted, false);
  assert.equal(s.engaged[0].shadows.length, 0);
});
test("Chief Turch cannot leave play through lethal damage or discard and cannot have attachments", () => {
  const s = finalStage();
  const u = s.engaged[0];
  assert.equal(damage(s, u.id, 30), true);
  assert.ok(get(s, u.id));
  destroy(s, u, false);
  assert.ok(get(s, u.id));
  check(s);
  assert.equal(s.status, "playing");
  attach(s, u, "01069");
  check(s);
  assert.equal(u.attachments.length, 0);
  assert.ok(!playTargets(s, card("01069")).includes(u.id));
  reload(s);
});
test("Chief Turch follows a new first player, preserves damage and loses Time on that engagement", () => {
  let s = finalStage(2);
  const id = seatView(s, 0).engaged[0].id;
  get(s, id)!.damage = 2;
  s.table!.first = 1;
  check(s);
  s = settle(s);
  assert.equal(ownerOf(s, get(s, id)!), 1);
  assert.equal(get(s, id)!.damage, 2);
  assert.equal(s.dunlandTrap!.time, 9);
  reload(s);
});
test("Every enemy engagement removes Time while Turch is in play, including another player", () => {
  let s = finalStage(2);
  forOwner(s, 1, () => {
    const u = make(s, D.warrior);
    s.staging.push(u);
    engage(s, u);
  });
  s = settle(s);
  assert.equal(s.dunlandTrap!.time, 9);
});
test("A hero destroyed at stage three loses immediately; forced discard and ally death do not", () => {
  let s = finalStage(2);
  forOwner(s, 1, () => damage(s, s.heroes[0].id, 99));
  assert.equal(s.status, "lost");
  assert.match(s.reason, /hero.*destroyed/);
  assert.equal(s.queue.length, 0);
  s = finalStage();
  discardCharacter(s, s.heroes[0]);
  assert.equal(s.status, "playing");
  s.allies = [make(s, "01013")];
  destroy(s, s.allies[0]);
  assert.equal(s.status, "playing");
});
test("Direct destruction outside damage also loses stage three, while stage one hero death is survivable", () => {
  const s = finalStage();
  destroy(s, s.heroes[0]);
  assert.equal(s.status, "lost");
  const early = base();
  destroy(early, early.heroes[0]);
  assert.equal(early.status, "playing");
});
test("The final assault performs engagement checks then fresh-shadow attacks before winning", () => {
  let s = finalStage();
  s.dunlandTrap!.time = 1;
  s.phase = "refresh";
  const enemy = make(s, D.warrior);
  s.staging = [enemy];
  s.encounterDeck = Array(10).fill(D.plains);
  s.allies = [make(s, "01013"), make(s, "01014")];
  removeQuestTime(s);
  flush(s);
  assert.equal(s.status, "playing");
  assert.equal(s.staging.length, 0);
  assert.match(s.choice!.title, /final attack/);
  assert.equal(s.choice!.options.length, 2);
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 40);
    const o =
      s.choice.options.find((o) => s.allies.some((a) => a.id === o.id)) ??
      s.choice.options.find((o) => o.id === "skip") ??
      s.choice.options[0];
    s = choose(reload(s), o.id);
  }
  assert.equal(s.status, "won");
  assert.match(s.reason, /Turch/);
});
test("Final assault cannot win if an undefended attack destroys a hero", () => {
  let s = finalStage();
  s.phase = "refresh";
  s.dunlandTrap!.time = 1;
  s.encounterDeck = [D.plains];
  removeQuestTime(s);
  flush(s);
  assert.ok(s.choice);
  const o = s.choice!.options.find((o) => /undefended/i.test(o.label))!;
  assert.ok(o);
  s = choose(reload(s), o.id);
  s = settle(s);
  assert.equal(s.status, "lost");
});
test("Frenzied Attack draws then discards every ally from every hand without conditional surge", () => {
  let s = base(2);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.hand = [make(s, "01013")];
      s.deck = ["01014", "01022"];
    });
  s.encounterDeck = [D.plains];
  dunlandEncounter(s, D.frenzied);
  s = settle(s);
  for (const p of playerOrder(s)) {
    assert.equal(seatView(s, p).hand.length, 0);
    assert.deepEqual(seatView(s, p).discard, ["01013", "01014"]);
  }
  assert.deepEqual(s.encounterDeck, [D.plains]);
  assert.ok(s.encounterDiscard.includes(D.frenzied));
  reload(s);
});
test("Frenzied Attack gains surge only if no ally was actually discarded", () => {
  let s = base();
  s.deck = ["01022"];
  s.encounterDeck = [D.plains];
  dunlandEncounter(s, D.frenzied);
  s = settle(s);
  assert.equal(s.hand.length, 1);
  assert.equal(s.staging[0].code, D.plains);
  assert.equal(s.encounterDeck.length, 0);
});
test("Canceling Frenzied Attack also cancels its conditional surge", () => {
  let s = base();
  s.hand = [make(s, "01050")];
  s.heroes[0].phaseResourceIcons = ["spirit"];
  s.encounterDeck = [D.plains];
  revealed(s, D.frenzied);
  flush(s);
  const cancel = s.choice!.options.find((o) => o.code === "01050")!;
  assert.ok(cancel);
  s = choose(reload(s), cancel.id);
  assert.deepEqual(s.encounterDeck, [D.plains]);
  assert.equal(s.staging.length, 0);
  assert.equal(s.hand.length, 0);
});
test("Ambush attaches physically to an active location and searches after it is explored", () => {
  let s = base();
  s.activeLocation = make(s, D.plains);
  s.encounterDeck = [D.warrior, D.stalker];
  dunlandEncounter(s, D.ambush);
  s = settle(s);
  assert.equal(s.activeLocation!.attachments[0].code, D.ambush);
  reload(s);
  progressLocation(s, s.activeLocation!, 9);
  s = settle(s);
  assert.equal(s.engaged.length, 1);
  assert.ok(s.encounterDiscard.includes(D.ambush));
  assert.ok(s.encounterDiscard.includes(D.plains));
});
test("Ambush limits one copy per location and whiffs without an active location", () => {
  let s = base();
  dunlandEncounter(s, D.ambush);
  flush(s);
  assert.deepEqual(s.encounterDiscard, [D.ambush]);
  s.activeLocation = make(s, D.plains);
  attach(s, s.activeLocation, D.ambush);
  dunlandEncounter(s, D.ambush);
  flush(s);
  assert.equal(s.activeLocation.attachments.length, 1);
  assert.equal(s.encounterDiscard.length, 2);
});
test("Warrior shadow counts every attached shadow, including unrevealed and itself", () => {
  const s = base();
  const u = combat(s);
  u.shadows = [D.warrior, D.stream, D.plains];
  dunlandShadow(s, D.warrior);
  assert.equal(s.combat!.attackBonus, 3);
});
test("Plains shadow gives +1 defended or +3 undefended; Stream adds +1 and another real shadow", () => {
  const s = base();
  const u = combat(s);
  dunlandShadow(s, D.plains);
  assert.equal(s.combat!.attackBonus, 1);
  delete s.combat!.defenderId;
  dunlandShadow(s, D.plains);
  assert.equal(s.combat!.attackBonus, 4);
  s.encounterDeck = [D.plains];
  dunlandShadow(s, D.stream);
  assert.equal(s.combat!.attackBonus, 5);
  assert.deepEqual(u.shadows, [D.plains]);
  s.encounterDiscard = [D.warrior];
  dunlandShadow(s, D.stream);
  assert.deepEqual(u.shadows, [D.plains]);
});
test("Frenzied shadow prevents all damage until round end, surviving combat cleanup and save reload", () => {
  let s = base();
  const u = combat(s);
  dunlandShadow(s, D.frenzied);
  assert.equal(damage(s, u.id, 1), false);
  effect(s, fx("endCombat"));
  s = settle(s);
  assert.equal(s.phase, "refresh");
  assert.equal(damage(s, u.id, 1), false);
  s = reload(s);
  assert.equal(damage(s, u.id, 1), false);
  nextRound(s);
  s = settle(s);
  assert.equal(damage(s, u.id, 1), true);
  assert.equal(get(s, u.id)!.damage, 1);
});
test("Dunland save validation rejects foreign state, bad timers, duplicate set-aside IDs and invalid lasting protection", () => {
  const s = base();
  const bads = [
    (x: GameState) => (x.dunlandTrap!.time = 3),
    (x: GameState) => (x.dunlandTrap!.time = -1),
    (x: GameState) => x.dunlandTrap!.setAside.push(x.dunlandTrap!.setAside[0]),
    (x: GameState) => (x.dunlandTrap!.setAside[0].id = x.heroes[0].id),
    (x: GameState) => (x.dunlandTrap!.setAside[0].owner = 9),
    (x: GameState) => ((x.heroes[0] as any).roundCannotTakeDamage = "yes"),
    (x: GameState) => (x.scenarioId = "mirkwood"),
  ];
  for (const mutate of bads) {
    const copy = structuredClone(s);
    mutate(copy);
    assert.equal(validateSave(copy), false);
  }
  reload(s);
});

test("Stage one defeat offers The Long Defeat before the trap; stage two card-effect advancement does not", () => {
  let s = base();
  s.questAttachments = {
    [D.roadQuest]: [{ id: "defeat-reward", code: "10122", exhausted: false }],
  };
  s.progress = 18;
  check(s);
  flush(s);
  assert.match(s.choice!.title, /Long Defeat/);
  assert.equal(s.stage, 1);
  s = choose(reload(s), "skip");
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.ok(!s.questAttachments?.[D.roadQuest]?.length);
  s.questAttachments = {
    [D.trap]: [{ id: "trap-attachment", code: "10122", exhausted: false }],
  };
  effect(s, fx("dunlandAdvance", { value: 3 }));
  s = settle(s);
  assert.equal(s.choice, null);
  assert.equal(s.stage, 3);
  assert.ok(s.discard.includes("10122"));
  assert.ok(!s.questAttachments?.[D.trap]?.length);
});
test("A lethal In Need of Rest trigger when the final counter is removed prevents victory", () => {
  let s = base();
  s.stage = 3;
  s.dunlandTrap!.time = 1;
  s.dunlandTrap!.stageThreeReady = true;
  s.dunlandTrap!.setAside = [];
  const hero = s.heroes[0];
  hero.damage = card(hero.code).health! - 1;
  attach(s, hero, G.rest);
  removeQuestTime(s);
  flush(s);
  assert.ok(s.choice);
  const rest = s.choice!.options.find((o) => o.code === G.rest)!;
  s = choose(reload(s), rest.id);
  assert.equal(s.status, "lost");
  assert.equal(s.queue.length, 0);
});
test("Stage-three initial engagement does not reorder pre-existing counter losses ahead of Time placement", () => {
  let s = base();
  s.stage = 2;
  s.dunlandTrap!.time = 0;
  s.queue = [fx("removeQuestTime")];
  effect(s, fx("dunlandAdvance", { value: 3 }));
  s = settle(s);
  assert.equal(s.dunlandTrap!.time, 4);
});
