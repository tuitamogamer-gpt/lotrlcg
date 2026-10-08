import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  applyAction,
  canTravel,
  optionalEngagementProblem,
  validateSave,
} from "../src/game/engine";
import { card, imageUrl, SCRIPTED } from "../src/game/cards";
import {
  fx,
  get,
  make,
  stats,
  threatOf,
  stagingThreat,
  engagementCost,
  stageInfo,
} from "../src/game/core";
import {
  check,
  damage,
  discardCharacter,
  engage,
  placeEncounter,
  progress,
  progressLocation,
  revealed,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "../src/game/table";
import {
  addQuestProgress,
  addCurrentQuestProgress,
  sideQuestStart,
} from "../src/game/side-quests";
import {
  WASTES as W,
  WASTES_ENCOUNTERS,
  WASTES_QUESTS,
  WASTES_RECIPES,
} from "../src/game/wastes-eriador-support";
import { WEATHER } from "../src/game/weather-hills-support";
import { wastesIsNight } from "../src/game/wastes-eriador";
import {
  base,
  start,
  second,
  third,
  night,
  choose,
  reload,
  settle,
} from "./wastes-eriador-fixtures";
import type { GameState, Unit } from "../src/game/types";
function finish(s: GameState) {
  flush(s);
  return settle(s);
}
function staged(s: GameState, code: string) {
  const u = make(s, code);
  s.staging.push(u);
  return u;
}
function enemy(s: GameState, code = W.northern, player = 0) {
  let u!: Unit;
  forOwner(s, player, () => {
    u = make(s, code);
    s.engaged.push(u);
  });
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
function leader(s: GameState) {
  return [...s.staging, ...allEngaged(s)].find((u) => u.code === W.leader)!;
}
function defend(s: GameState, e: Unit, d: Unit, shadows: string[] = []) {
  s.phase = "defense";
  get(s, e.id)!.shadows = shadows;
  return applyAction(reload(s), {
    type: "DEFEND",
    enemyId: e.id,
    defenderId: d.id,
  });
}
function selected(s: GameState, q: Unit) {
  s.phase = "quest";
  sideQuestStart(s);
  flush(s);
  return choose(reload(s), q.id);
}
function flip(s: GameState, toNight: boolean) {
  handle(s, fx("wastesFlip", { flag: toNight, player: firstPlayer(s) }));
  return finish(s);
}
// Original MEC39 insert and all original card faces define Day/Night. Neither
// switching the first-player token nor an unchanged objective face is a new Day/Night.
test("Wastes registers thirteen new original encounters and three printed stages, reusing corrected TLR identities", () => {
  assert.equal(WASTES_ENCOUNTERS.length, 13);
  assert.equal(WASTES_QUESTS.length, 3);
  for (const c of [...WASTES_ENCOUNTERS, ...WASTES_QUESTS]) {
    assert.ok(SCRIPTED.has(c.code), c.name);
    for (const path of [imageUrl(c), c.back_imagesrc].filter(Boolean))
      assert.ok(existsSync(`public${path}`));
  }
  assert.deepEqual(
    WASTES_QUESTS.slice()
      .sort((a, b) => Number(a.cost) - Number(b.cost))
      .map((c) => c.back_quest),
    [20, 15, 5],
  );
  assert.match(
    card(W.hunting).text!,
    /^Cannot have attachments.[\s\S]*While a player/,
  );
  assert.match(card(W.amarthiul).text!, /players lose/);
  assert.equal(W.cold, WEATHER.cold);
  assert.doesNotMatch(card(W.cold).text!, /Then, attach/);
  assert.deepEqual(WASTES_RECIPES.map((r) => r.mode).sort(), [
    "easy",
    "standard",
  ]);
});

test("Eriador Wastes limits only the physical current quest and Night also blocks explicit off-current placement", () => {
  let s = base();
  staged(s, W.wastes);
  const selectedQuest = staged(s, W.camp);
  const otherQuest = staged(s, W.lost);
  s = selected(s, selectedQuest);
  addCurrentQuestProgress(s, 5);
  addQuestProgress(s, get(s, otherQuest.id)!, 3);
  assert.equal(get(s, selectedQuest.id)!.progress, 5);
  assert.equal(get(s, otherQuest.id)!.progress, 3);
  addCurrentQuestProgress(s, 3);
  assert.equal(get(s, selectedQuest.id)!.progress, 5);
  s = reload(s);
  night(s);
  addQuestProgress(s, get(s, otherQuest.id)!, 1);
  assert.equal(get(s, otherQuest.id)!.progress, 3);
});

test("Sword-thain's effective hero gains the Day bonus and is protected from effects that discard ordinary allies", () => {
  let s = base();
  s.heroes[0] = make(s, "10140");
  s.heroes[0].resources = 10;
  const promoted = ally(s, "10120");
  const thain = make(s, "10149");
  s.hand = [thain];
  s = settle(
    applyAction(reload(s), { type: "PLAY", id: thain.id, target: promoted.id }),
  );
  assert.equal(
    stats(s, get(s, promoted.id)!).will,
    (card(promoted.code).willpower ?? 0) + 1,
  );
  s.stage = 2;
  s = flip(s, true);
  assert.ok(s.heroes.some((u) => u.id === promoted.id));
  s.encounterDeck.unshift(W.northern);
  revealed(s, W.predatory);
  flush(s);
  assert.deepEqual(
    s.choice?.options.map((o) => o.id),
    ["search"],
  );
  reload(s);
});
for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`real ${easy ? "easy" : "normal"} Wastes opening ${players} players preserves exact recipe and setup`, () => {
      const s = start(players, easy),
        r = WASTES_RECIPES.find(
          (r) => r.mode === (easy ? "easy" : "standard"),
        )!;
      assert.equal(s.phase, "resource");
      assert.equal(s.stage, 1);
      assert.ok(s.wastesEriador!.initialized);
      assert.equal(s.activeLocation!.code, W.hills);
      assert.equal(s.activeLocation!.progress, 0);
      assert.deepEqual(
        s.wastesEriador!.setAside.map((u) => u.code),
        [W.leader],
      );
      assert.equal(s.staging.filter((u) => u.code === W.time).length, 1);
      const expected = r.cards
        .filter((x) =>
          ["sharedEncounterDeck", "sharedStagingArea"].includes(x.section),
        )
        .flatMap((x) => Array(x.quantity).fill(x.code))
        .filter((c) => c !== W.amarthiul);
      const actual = [
        ...s.encounterDeck,
        ...s.encounterDiscard,
        ...s.staging.map((u) => u.code),
        ...allEngaged(s).map((u) => u.code),
        ...allEngaged(s).flatMap((u) => u.shadows),
        ...Object.values(s.questAttachments ?? {}).flatMap((a) =>
          a.map((a) => a.code),
        ),
      ];
      assert.deepEqual(
        actual.sort(),
        expected.sort(),
        "every recipe encounter remains in its physical zone, including shadows and Conditions",
      );
      const a = allCharacters(s).find((u) => u.code === W.amarthiul)!;
      assert.ok(a);
      assert.equal(ownerOf(s, a), firstPlayer(s));
      assert.ok(validateSave(s));
    });
test("Across the Wastes grants only heroes +1 willpower during Day and loses the modifier on Night or stage two", () => {
  let s = base();
  const h = s.heroes[0],
    a = s.allies[0];
  assert.equal(stats(s, h).will, card(h.code).willpower! + 1);
  assert.equal(stats(s, a).will, 1);
  s = night(s);
  assert.equal(stats(s, get(s, h.id)!).will, card(h.code).willpower!);
  s = second(s);
  get(s, s.staging.find((u) => u.code === W.time)!.id)!.flipped = false;
  assert.equal(stats(s, get(s, h.id)!).will, card(h.code).willpower!);
});
test("Day prevents automatic engagement checks while optional engagement remains legal", () => {
  let s = base();
  const e = staged(s, W.white);
  s.threat = 49;
  s.phase = "encounter";
  assert.equal(optionalEngagementProblem(s, e), null);
  handle(s, fx("engagementRound"));
  s = finish(s);
  assert.ok(s.staging.some((u) => u.id === e.id));
  assert.equal(allEngaged(s).length, 0);
  s = applyAction(reload(s), { type: "ENGAGE", id: e.id });
  s = finish(s);
  assert.equal(allEngaged(s).length, 1);
  assert.equal(s.heroes[0].damage, 1);
});
test("Night blocks main and side quest progress but permits active-location exploration", () => {
  let s = night(base());
  const q = staged(s, W.lost);
  s = selected(s, q);
  addCurrentQuestProgress(s, 9);
  flush(s);
  assert.equal(get(s, q.id)!.progress, 0);
  assert.equal(s.victory, 0);
  s.phase = "planning";
  delete s.sideQuestSelections;
  addCurrentQuestProgress(s, 12);
  assert.equal(s.progress, 0);
  const loc = make(s, W.downs);
  s.activeLocation = loc;
  progress(s, 10);
  s = finish(s);
  assert.equal(s.activeLocation, null);
  assert.equal(s.progress, 0);
});
test("Eriador Wastes caps total current-quest progress at five per round, with no multiplication from extra copies", () => {
  let s = base();
  staged(s, W.wastes);
  staged(s, W.wastes);
  addCurrentQuestProgress(s, 3);
  addCurrentQuestProgress(s, 9);
  assert.equal(s.progress, 5);
  s = reload(s);
  addCurrentQuestProgress(s, 1);
  assert.equal(s.progress, 5);
  s.round++;
  addCurrentQuestProgress(s, 3);
  assert.equal(s.progress, 8);
});
test("Nightfall becomes Night exactly once, reveals one card globally and applies Across the Wastes' per-player threat", () => {
  let s = base(2);
  s.encounterDeck = [W.downs, W.downs, W.downs];
  s = flip(s, true);
  assert.ok(wastesIsNight(s));
  assert.equal(s.staging.filter((u) => u.code === W.downs).length, 1);
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 21);
  const before = s.encounterDeck.length;
  s = flip(s, true);
  assert.equal(s.encounterDeck.length, before);
});
test("actual end of round flips Time and completes its Nightfall decisions before a new round starts", () => {
  let s = base();
  s.phase = "refresh";
  s.encounterDeck = [W.downs, W.downs];
  const round = s.round;
  s = finish(applyAction(reload(s), { type: "NEXT" }));
  assert.equal(s.round, round + 1);
  assert.ok(wastesIsNight(s));
  assert.equal(s.staging.filter((u) => u.code === W.downs).length, 1);
  assert.equal(
    s.threat,
    21,
    "the refresh threat was already applied before this focused end-of-round fixture",
  );
});
test("Daybreak returns physical enemies from every seat with damage preserved and shadows discarded", () => {
  let s = night(second(base(2)));
  const a = enemy(s, W.northern, 0),
    b = enemy(s, W.white, 1);
  a.damage = 2;
  b.damage = 1;
  a.shadows = [W.downs];
  b.shadows = [W.wolf];
  const hands = playerOrder(s).map((p) => seatView(s, p).hand.length);
  s = flip(s, false);
  assert.equal(allEngaged(s).length, 0);
  assert.equal(get(s, a.id)!.damage, 2);
  assert.equal(get(s, b.id)!.damage, 1);
  assert.deepEqual(get(s, a.id)!.shadows, []);
  assert.ok(s.encounterDiscard.includes(W.downs));
  assert.ok(s.encounterDiscard.includes(W.wolf));
  for (const p of playerOrder(s))
    assert.equal(seatView(s, p).hand.length, hands[p] + 1);
});
for (const players of [1, 2, 3, 4])
  test(`Howling at Night globally discards ${players >= 3 ? 2 : 1} non-objective allies for ${players} players`, () => {
    let s = second(base(players));
    ally(s, "01016", 0);
    ally(s, "01013", players - 1);
    s.encounterDeck = [W.downs, W.downs];
    s = flip(s, true);
    assert.equal(
      allCharacters(s).filter((u) => card(u.code).type_code === "ally").length,
      players >= 3 ? 0 : 1,
    );
    assert.ok(allCharacters(s).some((u) => u.code === W.amarthiul));
  });
test("Howling stage entry shuffles discard and adds discarded Wargs without revealing WR or Surge", () => {
  let s = base();
  s.encounterDeck = [W.northern, W.wolf, W.white];
  s.encounterDiscard = [W.downs];
  s.progress = 20;
  check(s);
  s = finish(s);
  assert.equal(s.stage, 2);
  assert.equal(s.progress, 0);
  const found = s.staging.find((u) =>
    [W.northern, W.wolf, W.white].includes(u.code),
  )!;
  assert.ok(found);
  assert.equal(found.tempThreat ?? 0, 0);
  assert.equal(s.encounterDiscard.includes(found.code), false);
  assert.equal(s.staging.filter((u) => u.code === W.downs).length, 0);
  assert.equal(stageInfo(s).cardCode, W.howling);
});
test("Battle stage preserves the reserved boss identity, becomes Night, and its damage gate uses main progress", () => {
  let s = second(base());
  const id = s.wastesEriador!.setAside[0].id;
  s.encounterDeck = [W.downs, W.downs];
  s.progress = 15;
  check(s);
  s = finish(s);
  assert.equal(s.stage, 3);
  assert.ok(wastesIsNight(s));
  assert.equal(leader(s).id, id);
  assert.equal(s.wastesEriador!.setAside.length, 0);
  damage(s, id, 8);
  assert.equal(leader(s).damage, 0);
  s.progress = 5;
  damage(s, id, 4);
  assert.equal(leader(s).damage, 4);
  s = flip(s, false);
  assert.equal(s.progress, 0);
  damage(s, id, 4);
  assert.equal(leader(s).damage, 4);
});
test("Pack Leader cannot be optionally engaged or attached, but physical destruction wins at once", () => {
  let s = third(base());
  const t = leader(s);
  s.phase = "encounter";
  assert.match(optionalEngagementProblem(s, t)!, /optionally|Pack Leader/i);
  s.progress = 5;
  damage(s, t.id, 8);
  check(s);
  assert.equal(s.status, "won");
  assert.ok(s.victoryCards!.includes(W.leader));
});
test("Amarthiúl transfer after a real engagement is optional, saved, and does not follow the first-player token", () => {
  let s = base(2);
  const a = allCharacters(s).find((u) => u.code === W.amarthiul)!;
  const e = staged(s, W.northern);
  forOwner(s, 1, () => engage(s, e));
  flush(s);
  assert.match(s.choice!.title, /Amarthiúl/);
  s = choose(reload(s), "transfer");
  s = finish(s);
  assert.equal(ownerOf(s, get(s, a.id)!), 1);
  s.table!.first = 0;
  check(s);
  assert.equal(ownerOf(s, get(s, a.id)!), 1);
});
test("Amarthiúl's printed leaves-play loss remains mandatory while his other printed abilities are blanked", () => {
  let s = base();
  const a = allCharacters(s).find((u) => u.code === W.amarthiul)!;
  a.blanked = true;
  discardCharacter(s, a);
  check(s);
  assert.equal(s.status, "lost");
  assert.equal(s.choice, null);
});

test("Northern Warg boosts the current Warg snapshot through phase end, including engaged enemies", () => {
  let s = base(2);
  const a = enemy(s, W.white, 0),
    b = enemy(s, W.wolf, 1),
    ordinary = staged(s, "01096");
  revealed(s, W.northern);
  s = finish(s);
  const n = s.staging.find((u) => u.code === W.northern)!;
  for (const u of [a, b, n])
    assert.equal(threatOf(s, get(s, u.id)!), (card(u.code).threat ?? 0) + 1);
  assert.equal(threatOf(s, ordinary), card(ordinary.code).threat);
  const later = staged(s, W.white);
  assert.equal(threatOf(s, later), 2);
  handle(s, fx("phaseEnd"));
  s = finish(s);
  for (const u of [a, b, n])
    assert.equal(threatOf(s, get(s, u.id)!), card(u.code).threat);
});
test("Blood-thirsty Warg's Night transition engagement creates a real immediate attack against the first player", () => {
  let s = base(2);
  s.table!.first = 1;
  const e = staged(s, W.blood);
  forOwner(s, 1, () => (s.heroes[0].tempDefense = 20));
  handle(s, fx("wastesFlip", { flag: true, player: 1 }));
  flush(s);
  for (let i = 0; i < 8 && !s.combat; i++) {
    assert.ok(s.choice);
    s = choose(
      reload(s),
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  assert.equal(s.combat!.attackPlayer, 1);
  assert.ok(seatView(s, 1).engaged.some((u) => u.id === e.id));
  s = choose(reload(s), seatView(s, 1).heroes[0].id);
  s = finish(s);
  assert.equal(
    get(s, e.id)!.attacked,
    false,
    "its normal combat attack remains available",
  );
  assert.equal(seatView(s, 0).heroes[0].damage, 0);
});
test("Hunting Pack's engagement threshold counts only damaged characters of the player being checked", () => {
  const s = night(base(2)),
    e = staged(s, W.hunting);
  s.heroes[0].damage = 2;
  ally(s).damage = 1;
  forOwner(s, 1, () => {
    s.heroes[0].damage = 1;
  });
  forOwner(s, 0, () => assert.equal(engagementCost(s, e), 38));
  forOwner(s, 1, () => assert.equal(engagementCost(s, e), 39));
  e.blanked = true;
  assert.equal(engagementCost(s, e), 40);
});
for (const atNight of [false, true])
  test(`White Warg engagement deals ${atNight ? 2 : 1} damage to one controlled character and preserves other seats`, () => {
    let s = atNight ? night(base(2)) : base(2);
    const e = staged(s, W.white);
    forOwner(s, 1, () => engage(s, e));
    flush(s);
    assert.match(s.choice!.title, /White Warg/);
    const h = seatView(s, 1).heroes[0];
    assert.ok(
      !s.choice!.options.some((o) => o.id === seatView(s, 0).heroes[0].id),
    );
    s = choose(reload(s), h.id);
    s = finish(s);
    assert.equal(get(s, h.id)!.damage, atNight ? 2 : 1);
    assert.equal(seatView(s, 0).heroes[0].damage, 0);
  });
test("Wolf of Angmar and North Downs gain their printed continuous Night bonuses and lose them by Day", () => {
  let s = base();
  const w = staged(s, W.wolf),
    d = staged(s, W.downs);
  assert.equal(stats(s, w).attack, 2);
  assert.equal(threatOf(s, d), 1);
  s = night(s);
  assert.equal(stats(s, get(s, w.id)!).attack, 4);
  assert.equal(threatOf(s, get(s, d.id)!), 3);
  s = flip(s, false);
  assert.equal(stats(s, get(s, w.id)!).attack, 2);
  assert.equal(threatOf(s, get(s, d.id)!), 1);
});
test("Eriador Wastes travel pays the first player's physical Warg engagement plus shadow card", () => {
  let s = base(2);
  s.table!.first = 1;
  const q = staged(s, W.wastes);
  s.phase = "travel";
  assert.match(canTravel(s, q)!, /Warg/);
  const e = staged(s, W.northern);
  s.encounterDeck = [W.downs, W.downs];
  assert.equal(canTravel(s, q), null);
  s = applyAction(reload(s), { type: "TRAVEL", id: q.id });
  s = choose(reload(s), e.id);
  s = finish(s);
  assert.equal(s.activeLocation!.id, q.id);
  assert.ok(seatView(s, 1).engaged.some((u) => u.id === e.id));
  assert.deepEqual(get(s, e.id)!.shadows, [W.downs]);
  assert.equal(seatView(s, 0).engaged.length, 0);
});
test("Warg's Den search reveals the chosen Warg's WR and Surge, then engages that physical copy", () => {
  let s = base(2);
  s.table!.first = 1;
  const q = staged(s, W.den);
  s.phase = "travel";
  s.encounterDeck = [W.northern, W.downs, W.downs];
  s.encounterDiscard = [W.wolf];
  assert.equal(canTravel(s, q), null);
  s = applyAction(reload(s), { type: "TRAVEL", id: q.id });
  assert.match(s.choice!.title, /Warg/);
  s = choose(reload(s), W.wolf);
  assert.match(s.choice!.title, /Amarthiúl/);
  const physical = seatView(s, 1).engaged.find((u) => u.code === W.wolf)!;
  assert.equal(
    threatOf(s, physical),
    2,
    "Northern Warg's revealed effect applies before travel ends",
  );
  s = finish(s);
  assert.equal(s.activeLocation!.id, q.id);
  assert.ok(seatView(s, 1).engaged.some((u) => u.id === physical.id));
  assert.ok(s.staging.some((u) => u.code === W.northern));
  assert.equal(
    threatOf(s, get(s, physical.id)!),
    1,
    "the revealed threat modifier expires at the end of travel",
  );
});
test("Warg's Den immunity excludes actual player location targets, while quest exploration remains legal", () => {
  let s = base();
  const q = staged(s, W.den);
  s.heroes[2] = make(s, "01012");
  s.heroes[2].resources = 10;
  s.phase = "quest";
  const event = make(s, "01066");
  s.hand = [event];
  assert.throws(
    () => applyAction(reload(s), { type: "PLAY", id: event.id, target: q.id }),
    /target|immune/i,
  );
  s.activeLocation = q;
  s.staging = s.staging.filter((u) => u.id !== q.id);
  progress(s, 1);
  s = finish(s);
  assert.equal(s.activeLocation, null);
});
test("Sudden Darkness at Night raises every player's threat by four without another objective transition reveal", () => {
  let s = night(base(2));
  const before = s.encounterDeck.length;
  revealed(s, W.darkness);
  s = finish(s);
  assert.equal(s.encounterDeck.length, before);
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 24);
  assert.ok(s.encounterDiscard.includes(W.darkness));
});
test("Predatory Wolves enforces each seat's highest printed-cost ally and lets its controller choose tied physical copies", () => {
  let s = base(2);
  const cheap = ally(s, "01016", 0),
    a = ally(s, "01013", 0),
    b = ally(s, "01013", 0),
    remote = ally(s, "01028", 1);
  s.encounterDeck = [W.northern, W.downs];
  revealed(s, W.predatory);
  flush(s);
  s = choose(reload(s), "discard");
  assert.equal(s.choice!.options.length, 2);
  assert.ok(
    !s.choice!.options.some((o) => o.id === cheap.id || o.id === remote.id),
  );
  s = choose(reload(s), a.id);
  assert.match(s.choice!.title, /Predatory/);
  s = choose(reload(s), "discard");
  s = finish(s);
  assert.equal(get(s, a.id), undefined);
  assert.ok(get(s, b.id));
  assert.ok(get(s, cheap.id));
  assert.equal(get(s, remote.id), undefined);
});
test("Predatory Wolves with no ordinary ally requires a real Warg search, and searched Northern Warg resolves its WR", () => {
  let s = base();
  s.encounterDeck = [W.northern, W.downs];
  revealed(s, W.predatory);
  flush(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["search"],
  );
  s = choose(reload(s), "search");
  s = choose(reload(s), W.northern);
  s = finish(s);
  assert.equal(
    threatOf(
      s,
      s.staging.find((u) => u.code === W.northern)!,
    ),
    3,
  );
  assert.ok(s.allies.some((u) => u.code === W.amarthiul));
});
test("Pack Leader engagement exhausts one controlled ready character per engaged Warg, including himself", () => {
  let s = night(third(base(2)));
  const t = leader(s);
  enemy(s, W.northern, 1);
  enemy(s, "01096", 1);
  forOwner(s, 1, () => engage(s, t));
  flush(s);
  assert.match(s.choice!.title, /exhaust/i);
  const a = seatView(s, 1).heroes[0],
    b = seatView(s, 1).heroes[1];
  assert.ok(
    !s.choice!.options.some((o) => o.id === seatView(s, 0).heroes[0].id),
  );
  s = choose(reload(s), a.id);
  s = choose(reload(s), b.id);
  s = finish(s);
  assert.equal(get(s, a.id)!.exhausted, true);
  assert.equal(get(s, b.id)!.exhausted, true);
  assert.equal(seatView(s, 1).heroes[2].exhausted, false);
});
for (const atNight of [false, true])
  test(`Wolf of Angmar shadow adds ${atNight ? 2 : 1} attack according to Time's physical face`, () => {
    let s = atNight ? night(base()) : base();
    const e = enemy(s, W.northern),
      h = s.heroes[0];
    s = finish(defend(s, e, h, [W.wolf]));
    assert.equal(get(s, h.id)!.damage, 3 + (atNight ? 2 : 1) - 2);
  });
for (const atNight of [false, true])
  test(`White Warg shadow ${atNight ? "makes a fresh additional attack" : "has no extra attack during Day"}`, () => {
    let s = atNight ? night(base()) : base();
    const e = enemy(s, W.northern),
      h = s.heroes[0];
    h.tempDefense = 20;
    s.heroes[1].tempDefense = 20;
    s.encounterDeck = [W.downs, W.downs];
    s = defend(s, e, h, [W.white]);
    if (atNight) {
      assert.ok(s.combat!.immediate);
      assert.deepEqual(get(s, e.id)!.shadows, [W.downs]);
      s = choose(reload(s), s.heroes[1].id);
      s = finish(s);
      assert.equal(s.encounterDeck.length, 1);
    } else {
      s = finish(s);
      assert.equal(s.combat, null);
      assert.equal(s.encounterDeck.length, 2);
    }
  });
test("Northern Warg shadow moves the same damaged enemy to the next player and deals a fresh immediate shadow", () => {
  let s = base(2);
  const e = enemy(s, W.northern, 0);
  e.damage = 2;
  s.heroes[0].tempDefense = 20;
  forOwner(s, 1, () => (s.heroes[0].tempDefense = 20));
  s.encounterDeck = [W.downs, W.downs];
  s = defend(s, e, s.heroes[0], [W.northern]);
  if (s.choice!.options.some((o) => o.id === "skip"))
    s = choose(reload(s), "skip");
  assert.equal(s.combat!.attackPlayer, 1);
  assert.equal(get(s, e.id)!.damage, 2);
  assert.deepEqual(get(s, e.id)!.shadows, [W.downs]);
  s = choose(reload(s), seatView(s, 1).heroes[0].id);
  s = finish(s);
  assert.equal(seatView(s, 0).engaged.length, 0);
  assert.ok(seatView(s, 1).engaged.some((u) => u.id === e.id));
});
for (const killed of [false, true])
  test(`North Downs shadow clears the main quest after the side quest phase ends only if attack strength ${killed ? "destroys" : "does not destroy"} its defender`, () => {
    let s = base();
    const q = staged(s, W.lost);
    q.progress = 3;
    s = selected(s, q);
    // An encounter side quest is current only until the quest phase ends.
    // Combat's current quest is the main quest; the physical side retains its progress.
    s.progress = 3;
    const e = enemy(s, W.northern),
      d = killed ? ally(s) : s.heroes[0];
    if (!killed) d.tempDefense = 20;
    s = finish(defend(s, e, d, [W.downs]));
    assert.equal(get(s, q.id)!.progress, 3);
    assert.equal(s.progress, killed ? 0 : 3);
  });
test("Sudden Darkness shadow engages the topmost discarded Warg without revealing its WR and deals it a shadow", () => {
  let s = base();
  const e = enemy(s, W.northern);
  s.heroes[0].tempDefense = 20;
  s.encounterDiscard = [W.white, W.downs, W.northern, W.predatory];
  s.encounterDeck = [W.downs, W.downs];
  s = finish(defend(s, e, s.heroes[0], [W.darkness]));
  const returned = s.engaged.find((u) => u.id !== e.id)!;
  assert.equal(returned.code, W.northern);
  assert.deepEqual(returned.shadows, [W.downs]);
  assert.equal(returned.tempThreat ?? 0, 0);
  assert.deepEqual(s.encounterDiscard, [W.white, W.downs, W.predatory]);
});
test("Predatory Wolves shadow exhausts a ready local character, excluding the exhausted defender and other seats", () => {
  let s = base(2);
  const e = enemy(s, W.northern),
    d = s.heroes[0],
    a = ally(s);
  d.tempDefense = 20;
  s = defend(s, e, d, [W.predatory]);
  assert.ok(!s.choice!.options.some((o) => o.id === d.id));
  assert.ok(
    !s.choice!.options.some((o) => o.id === seatView(s, 1).heroes[0].id),
  );
  s = choose(reload(s), a.id);
  s = finish(s);
  assert.equal(get(s, a.id)!.exhausted, true);
});
test("Night prohibits Test of Will, Eleanor and Hasty Stroke encounter cancellation but still resolves printed Weather effects", () => {
  let s = night(base());
  s.heroes[2] = make(s, "01008");
  s.heroes[2].resources = 10;
  s.hand = [make(s, "01050"), make(s, "01048")];
  revealed(s, W.darkness);
  s = finish(s);
  assert.equal(s.threat, 24);
  assert.equal(s.heroes[2].exhausted, false);
  assert.equal(s.hand.length, 2);
  const e = enemy(s, W.northern),
    d = s.heroes[0];
  d.tempDefense = 20;
  s = defend(s, e, d, [W.wolf]);
  assert.ok(!s.choice?.options.some((o) => o.code === "01048"));
  s = finish(s);
  assert.equal(s.hand.length, 2);
});
test("shared Cold attaches to a real selected side quest, blanks damaged abilities preserving traits, and shared Make Camp healing lock applies", () => {
  let s = base();
  placeEncounter(s, W.camp, false, 0, undefined, true);
  const q = s.staging.find((u) => u.code === W.camp)!;
  s = selected(s, q);
  revealed(s, W.cold);
  flush(s);
  s = choose(reload(s), s.heroes[0].id);
  s = finish(s);
  assert.ok(get(s, q.id)!.attachments.some((a) => a.code === W.cold));
  assert.equal(s.heroes[0].blanked, true);
  assert.equal(s.heroes[0].printedKeywordsPreserved, true);
  handle(s, fx("heal", { target: s.heroes[0].id, value: 1 }));
  s = finish(s);
  assert.equal(s.heroes[0].damage, 1);
});
test("shared Lost in the Wilderness preserves physical hand ownership under the side quest through save and actual defeat", () => {
  let s = base(2);
  const a = make(s, "01013");
  s.hand = [a];
  let b!: Unit;
  forOwner(s, 1, () => {
    b = make(s, "01016");
    s.hand = [b];
  });
  revealed(s, W.lost);
  s = finish(s);
  const q = s.staging.find((u) => u.code === W.lost)!;
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).hand.length, 0);
  s = selected(s, q);
  addCurrentQuestProgress(s, 4);
  s = finish(s);
  assert.equal(seatView(s, 0).hand[0].id, a.id);
  assert.equal(seatView(s, 1).hand[0].id, b.id);
  assert.equal(seatView(s, 1).hand[0].owner, 1);
});
test("Wastes save validation rejects missing/duplicate Time, wrong boss reservations and impossible progress tracking", () => {
  const s = base();
  assert.ok(validateSave(reload(s)));
  for (const change of [
    (v: GameState) => {
      v.staging = v.staging.filter((u) => u.code !== W.time);
    },
    (v: GameState) => {
      v.staging.push(make(v, W.time));
    },
    (v: GameState) => {
      v.wastesEriador!.setAside = [];
    },
    (v: GameState) => {
      v.wastesEriador!.progressRound = v.round + 1;
    },
    (v: GameState) => {
      v.wastesEriador!.progressPlaced = { "quest:bad": -1 };
    },
    (v: GameState) => {
      v.scenarioId = "mirkwood";
    },
  ]) {
    const v = structuredClone(reload(s));
    change(v);
    assert.equal(validateSave(v), false);
  }
});
