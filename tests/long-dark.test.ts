import { applyAction as act } from "./pass-resource-window.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {
  createGame,
  restoreSave,
  validateSave,
  availableAbilities,
} from "../src/game/engine";
import { card, STARTERS, SCRIPTED } from "../src/game/cards";
import {
  advanceQuest,
  check,
  damage,
  discardAttachment,
  discardCharacter,
  engage,
  progress,
  progressLocation,
  resolveReveal,
  shadow,
} from "../src/game/board";
import { fx, make, stats, threatOf } from "../src/game/core";
import { flush, handle } from "../src/game/effects";
import { playerAttack, combatDamage } from "../src/game/combat";
import {
  allActiveLocations,
  allCharacters,
  allEngaged,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
  attackersFor,
} from "../src/game/table";
import {
  LONG_DARK as L,
  LONG_DARK_ENCOUNTERS,
  LONG_DARK_QUESTS,
  LONG_DARK_PASS,
  longDarkCanAttack,
  longDarkLost,
  longDarkQuestFailed,
  longDarkRoundEnd,
  longDarkProgressLocation,
  longDarkCheck,
} from "../src/game/long-dark";
import { KHAZAD } from "../src/game/khazad-dum";
import { EMYN } from "../src/game/emyn-muil";
import { CARROCK } from "../src/game/carrock";
import { attachToQuest, currentQuestCode } from "../src/game/quest-state";
import recipes from "../public/scenarios.json";
import type { GameState, Unit } from "../src/game/types";
const leadership = STARTERS[0];
const choose = (s: GameState, id: string) => act(s, { type: "CHOOSE", id });
function settle(s: GameState) {
  for (let i = 0; i < 500 && s.status === "playing"; i++) {
    if (s.choice)
      s = choose(
        s,
        s.choice.options.find((o) =>
          ["skip", "resolve", "done", "fail"].includes(o.id),
        )?.id ?? s.choice.options[0].id,
      );
    else if (s.phase === "setup") s = act(s, { type: "KEEP" });
    else break;
  }
  return s;
}
function start(players = 1, easy = false, seed = 1) {
  return createGame(seed, leadership.cards, leadership.heroes, leadership.id, {
    scenarioId: "the-long-dark",
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
}
function base(players = 1) {
  let s = settle(start(players));
  Object.assign(s, {
    status: "playing",
    phase: "planning",
    stage: 1,
    stageRevealing: false,
    progress: 0,
    victory: 0,
    victoryCards: [],
    queue: [],
    choice: null,
    staging: [],
    encounterDiscard: [],
    encounterDeck: Array(20).fill(L.spider),
    activeLocation: null,
    extraActiveLocations: [],
    longDark: { adderDamagedIds: [] },
  });
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      s.threat = 20;
      s.hand = [];
      s.allies = [];
      s.engaged = [];
      s.used = [];
      s.committedIds = [];
      for (const h of s.heroes)
        Object.assign(h, {
          resources: 10,
          damage: 0,
          exhausted: false,
          committed: false,
          attachments: [],
          tempAttack: 0,
          tempWill: 0,
          tempDefense: 0,
        });
    });
  selectSeat(s, s.table?.first ?? 0);
  syncSeat(s);
  return s;
}
function enemy(s: GameState, code: string, player = 0) {
  let e!: Unit;
  forOwner(s, player, () => {
    e = make(s, code);
    s.engaged.push(e);
  });
  return e;
}
function attach(s: GameState, u: Unit, code: string) {
  const a = { id: `a${s.nextId++}`, code, exhausted: false };
  u.attachments.push(a);
  return a;
}
function reveal(s: GameState, code: string) {
  resolveReveal(s, code);
  flush(s);
  if (s.choice?.options.some((o) => o.id === "resolve"))
    s = choose(s, "resolve");
  return s;
}
function saved(s: GameState) {
  assert.ok(validateSave(s));
  const r = restoreSave(JSON.parse(JSON.stringify(s)));
  assert.ok(r);
  return r!;
}
function physical(s: GameState) {
  return [
    ...s.encounterDeck,
    ...s.encounterDiscard,
    ...s.staging.map((u) => u.code),
    ...allEngaged(s).map((u) => u.code),
    ...allActiveLocations(s).map((u) => u.code),
    ...allCharacters(s).flatMap((u) =>
      u.attachments
        .filter((a) => card(a.code).sphere_code === "encounter")
        .map((a) => a.code),
    ),
    ...s.removed,
  ];
}

test("Long Dark imports all thirteen designs, both physical quest faces and six printed PASS corners", () => {
  assert.equal(LONG_DARK_ENCOUNTERS.length, 13);
  assert.equal(LONG_DARK_QUESTS.length, 2);
  assert.equal(LONG_DARK_PASS.length, 6);
  assert.deepEqual(
    new Set(LONG_DARK_PASS),
    new Set([L.mine, L.forge, L.air, L.gathering, L.caverns, L.twisting]),
  );
  for (const c of [...LONG_DARK_ENCOUNTERS, ...LONG_DARK_QUESTS])
    assert.ok(SCRIPTED.has(c.code), c.name);
  for (const c of LONG_DARK_QUESTS) {
    assert.ok(c.back_text);
    assert.ok(c.back_imagesrc);
  }
  const easy = recipes.find((r) => r.id === "E02.7")!;
  for (const c of LONG_DARK_ENCOUNTERS)
    assert.equal(
      c.easy_quantity,
      easy.sections.sharedEncounterDeck?.[
        c.code as keyof typeof easy.sections.sharedEncounterDeck
      ] ?? 0,
      c.name,
    );
});
for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`${players}-player ${easy ? "easy" : "normal"} setup selects a Cave Torch bearer and adds max(1,players−1) locations without revealing`, () => {
      let s = start(players, easy);
      assert.match(s.choice!.title, /Cave Torch/);
      s = choose(s, s.choice!.options[0].id);
      s = settle(s);
      assert.equal(s.staging.length, Math.max(1, players - 1));
      assert.ok(s.staging.every((u) => card(u.code).type_code === "location"));
      assert.equal(
        allCharacters(s)
          .flatMap((u) => u.attachments)
          .filter((a) => a.code === KHAZAD.torch).length,
        1,
      );
      assert.equal(physical(s).length, easy ? 43 : 59);
      assert.ok(!s.queue.length && !s.choice);
    });
test("stage-one location threat applies everywhere and ends immediately on stage-two advance", () => {
  let s = base();
  const l = make(s, L.mine);
  s.staging.push(l);
  assert.equal(threatOf(s, l), 4);
  s.stage = 2;
  assert.equal(threatOf(s, l), 3);
});
test("stage two begins an explicit first-player locate test and successful PASS avoids revelation and Lost", () => {
  let s = base(2);
  s.phase = "quest";
  s.hand = [make(s, "01023")];
  s.encounterDeck = [L.mine, L.spider];
  s.progress = 13;
  advanceQuest(s);
  flush(s);
  assert.equal(s.stage, 2);
  assert.match(s.choice!.title, /Continuing Eastward.*Locate/);
  assert.equal(s.longDark?.locate?.player, s.table?.first);
  s = choose(s, s.hand[0].id);
  assert.equal(s.choice, null);
  assert.equal(s.stageRevealing, false);
  assert.deepEqual(s.encounterDiscard, [L.mine]);
  assert.equal(s.staging.length, 0);
});
test("locate may be retried after a non-PASS discard and preserves both its continuations and hand identity through reload", () => {
  let s = base();
  s.hand = [make(s, "01023"), make(s, "01022")];
  s.encounterDeck = [L.spider, L.mine];
  s = reveal(s, L.air);
  const firstId = s.hand[0].id;
  s = choose(s, firstId);
  assert.match(s.choice!.title, /Locate/);
  assert.ok(s.encounterDiscard.includes(L.spider));
  s = saved(s);
  s = choose(s, s.hand[0].id);
  assert.equal(s.longDark?.locate, undefined);
  assert.equal(s.heroes[0].damage, 0);
  assert.equal(s.hand.length, 0);
  assert.ok(s.encounterDiscard.includes(L.mine));
});
test("a first-player locate failure reveals one complete encounter per living player before Lost effects", () => {
  let s = base(2);
  s.phase = "quest";
  s.progress = 13;
  s.encounterDeck = [L.mine, L.forge];
  s.hand = [make(s, "01023")];
  forOwner(s, 1, () => {
    s.hand = [make(s, "01022")];
  });
  advanceQuest(s);
  flush(s);
  s = choose(s, "fail");
  assert.equal(s.staging.length, 2);
  assert.match(s.choice!.title, /Lost effects/);
  assert.equal(s.stageRevealing, true);
  s = choose(s, s.staging.find((u) => u.code === L.forge)!.id);
  s = settle(s);
  assert.equal(seatView(s, 0).hand.length, 0);
  assert.equal(seatView(s, 1).hand.length, 0);
  assert.equal(s.stageRevealing, false);
});
test("a locate with no hand or no possible encounter discard fails without inventing a free attempt", () => {
  let s = base();
  s.encounterDeck = [L.spider];
  s = reveal(s, L.air);
  assert.equal(s.longDark?.locate, undefined);
  assert.equal(s.heroes[0].damage, 2);
  s = base();
  s.hand = [make(s, "01023")];
  s.encounterDeck = [];
  s = reveal(s, L.air);
  assert.equal(s.longDark?.locate, undefined);
  assert.equal(s.hand.length, 1);
  assert.equal(s.heroes[0].damage, 2);
});
test("Vast failure raises every threat by seven, clears all physical progress and triggers Lost", () => {
  let s = base(2);
  s.hand = [make(s, "01023")];
  s.progress = 8;
  s.heroes[0].progress = 2;
  const l = make(s, L.caverns);
  l.progress = 1;
  s.staging = [l];
  s = reveal(s, L.vast);
  s = choose(s, "fail");
  s = settle(s);
  for (const player of playerOrder(s))
    assert.equal(seatView(s, player).threat, 27);
  assert.equal(s.progress, 0);
  assert.equal(s.staging.find((u) => u.id === l.id)!.progress, 0);
  assert.equal(s.heroes[0].progress, 0);
  assert.ok(allCharacters(s).every((c) => c.exhausted));
});
test("Foul Air failure damages all controlled characters including off-seat allies before the Lost snapshot", () => {
  let s = base(2);
  const ally = make(s, "01073");
  forOwner(s, 1, () => s.allies.push(ally));
  s.hand = [make(s, "01023")];
  s.encounterDeck = [L.spider];
  s = reveal(s, L.air);
  s = choose(s, "fail");
  assert.ok(allCharacters(s).every((c) => c.damage === 2));
  assert.equal(allCharacters(s).find((u) => u.id === ally.id)!.damage, 2);
  assert.ok(s.encounterDiscard.includes(L.air));
});
test("PASS cards discarded for locate are not revealed or explored and award no victory", () => {
  let s = base();
  s.hand = [make(s, "01023")];
  s.encounterDeck = [L.air];
  s = reveal(s, L.vast);
  s = choose(s, s.hand[0].id);
  assert.equal(s.threat, 20);
  assert.equal(s.heroes[0].damage, 0);
  assert.equal(s.victory, 0);
  assert.ok(s.encounterDiscard.includes(L.air));
});
test("Twisting Passage passes before actual progress, explores normally and carries excess framework progress only after that test", () => {
  let s = base();
  s.phase = "quest";
  const l = make(s, L.twisting);
  l.progress = 4;
  s.activeLocation = l;
  s.hand = [make(s, "01023")];
  s.encounterDeck = [L.mine];
  progress(s, 3);
  flush(s);
  assert.equal(l.progress, 4);
  assert.equal(s.progress, 0);
  assert.match(s.choice!.title, /Twisting Passage/);
  s = saved(s);
  s = choose(s, s.hand[0].id);
  assert.equal(s.activeLocation, null);
  assert.equal(s.progress, 2);
  assert.ok(s.encounterDiscard.includes(L.twisting));
});
test("failed Twisting placement blocks its entire buffered quest-progress remainder and triggers Lost", () => {
  let s = base();
  s.phase = "quest";
  const l = make(s, L.twisting);
  l.progress = 4;
  s.activeLocation = l;
  s.staging = [make(s, L.forge)];
  s.hand = [make(s, "01023")];
  progress(s, 5);
  flush(s);
  s = choose(s, "fail");
  s = settle(s);
  assert.equal(s.activeLocation!.progress, 4);
  assert.equal(s.progress, 0);
  assert.equal(s.hand.length, 0);
});
test("a direct player-card placement on staged Twisting also requires locate; zero progress and blanked text do not", () => {
  let s = base();
  let l = make(s, L.twisting);
  s.staging = [l];
  s.hand = [make(s, "01023")];
  s.encounterDeck = [L.mine];
  progressLocation(s, l, 1);
  flush(s);
  assert.equal(l.progress, 0);
  s = choose(s, s.hand[0].id);
  l = s.staging.find((u) => u.id === l.id)!;
  assert.equal(l.progress, 1);
  assert.equal(longDarkProgressLocation(s, l, 0), false);
  s.activeLocation = make(s, EMYN.amonLhaw);
  l.blanked = true;
  progressLocation(s, l, 1);
  assert.equal(l.progress, 2);
});
test("Lost snapshots let the first player order effects and do not trigger a newly returning Warlord", () => {
  let s = base();
  const mine = make(s, L.mine),
    forge = make(s, L.forge);
  s.staging = [mine, forge];
  s.encounterDiscard = [L.warlord];
  const ally = make(s, "01030");
  s.allies = [ally];
  s.hand = [make(s, "01023")];
  longDarkLost(s);
  flush(s);
  s = choose(s, mine.id);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === L.warlord));
  assert.ok(s.allies.some((u) => u.id === ally.id));
  assert.equal(s.hand.length, 0);
});
test("Abandoned Mine returns the top two Goblin enemies in discard without revealing them and supports a partial non-targeting return", () => {
  let s = base();
  s.staging = [make(s, L.mine)];
  s.encounterDiscard = [L.sneak, L.spider, KHAZAD.spearman, L.warlord];
  longDarkLost(s);
  flush(s);
  s = settle(s);
  assert.deepEqual(
    s.staging
      .filter((u) => card(u.code).type_code === "enemy")
      .map((u) => u.code),
    [L.warlord, KHAZAD.spearman],
  );
  assert.deepEqual(s.encounterDiscard, [L.sneak, L.spider]);
  s = base();
  s.staging = [make(s, L.mine)];
  s.encounterDiscard = [L.warlord];
  longDarkLost(s);
  flush(s);
  assert.ok(s.staging.some((u) => u.code === L.warlord));
});
test("Warlord chooses an ally from each fellowship, includes objective allies, and uses discard rather than destruction", () => {
  let s = base(2);
  const one = make(s, "01030");
  let two!: Unit;
  s.allies = [one];
  forOwner(s, 1, () => {
    two = make(s, "01028");
    s.allies = [two];
  });
  s.staging = [make(s, L.warlord)];
  longDarkLost(s);
  flush(s);
  s = choose(s, one.id);
  assert.ok(allCharacters(s).some((u) => u.id === one.id));
  s = choose(s, two.id);
  assert.ok(!allCharacters(s).some((u) => [one.id, two.id].includes(u.id)));
  assert.ok(seatView(s, 0).discard.includes(one.code));
  assert.ok(seatView(s, 1).discard.includes(two.code));
});
test("Silent Caverns Lost exhausts all characters even across fellowships and leaves already exhausted or prohibited characters unchanged", () => {
  const s = base(2);
  s.staging = [make(s, L.caverns)];
  s.heroes[0].exhausted = true;
  attach(s, s.heroes[1], KHAZAD.fear);
  longDarkLost(s);
  flush(s);
  assert.equal(s.heroes[1].exhausted, false);
  assert.ok(
    allCharacters(s)
      .filter((u) => u.id !== s.heroes[1].id)
      .every((c) => c.exhausted),
  );
});
test("unsuccessful quest triggers Lost even when Ever Onward cancels failed-quest threat", () => {
  let s = base();
  s.phase = "quest";
  s.staging = [make(s, L.caverns)];
  s.hand = [make(s, "03005")];
  handle(s, fx("failedQuest", { value: 3 }));
  flush(s);
  if (s.choice) {
    s = choose(s, "play");
    s = settle(s);
  }
  assert.ok(allCharacters(s).every((c) => c.exhausted));
});
test("Cave Spider draws before selecting exactly four hand cards, atomically discards four, and leaves fewer than four untouched", () => {
  let s = base();
  s.hand = [make(s, "01023"), make(s, "01022"), make(s, "01028")];
  s.deck = ["01034"];
  s = reveal(s, L.spider);
  assert.match(s.choice!.title, /four cards/);
  s = choose(s, s.hand[0].id);
  assert.equal(s.hand.length, 4);
  s = saved(s);
  while (s.choice?.title.includes("four cards"))
    s = choose(s, s.choice.options[0].id);
  assert.equal(s.hand.length, 0);
  assert.equal(s.discard.length, 4);
  s = base();
  s.hand = [make(s, "01023")];
  s.deck = ["01034"];
  s = reveal(s, L.spider);
  assert.equal(s.hand.length, 2);
  assert.equal(s.choice, null);
});
test("Cave Spider's Then discard is suppressed if its first-player draw is prevented", () => {
  let s = base();
  s.hand = Array.from({ length: 4 }, () => make(s, "01023"));
  s.activeLocation = make(s, "01095");
  s.deck = ["01034"];
  s = reveal(s, L.spider);
  assert.equal(s.hand.length, 4);
  assert.equal(s.choice, null);
});
test("Cave Spider's engagement discards exactly one card from the engaged player", () => {
  let s = base(2);
  forOwner(s, 1, () => (s.hand = [make(s, "01023")]));
  const e = make(s, L.spider);
  s.staging = [e];
  forOwner(s, 1, () => engage(s, e));
  flush(s);
  assert.equal(s.table?.active, 1);
  s = choose(s, s.choice!.options[0].id);
  assert.equal(seatView(s, 1).hand.length, 0);
});
test("Goblin Sneak cycles to the next living player only after a discarded treachery and retains its physical identity", () => {
  let s = base(3);
  const e = make(s, L.sneak);
  s.staging = [e];
  s.encounterDeck = [L.air, L.vast, L.mine];
  engage(s, e);
  flush(s);
  s = settle(s);
  assert.equal(
    ownerOf(
      s,
      allEngaged(s).find((u) => u.id === e.id)!,
    ),
    2,
  );
  assert.deepEqual(s.encounterDiscard, [L.air, L.vast, L.mine]);
  assert.equal(s.threat, 20);
});
test("Goblin Sneak discards once but has no next-player transfer in solo", () => {
  const s = base();
  const e = make(s, L.sneak);
  s.staging = [e];
  s.encounterDeck = [L.air, L.vast];
  engage(s, e);
  flush(s);
  assert.equal(s.engaged[0].id, e.id);
  assert.deepEqual(s.encounterDiscard, [L.air]);
  assert.deepEqual(s.encounterDeck, [L.vast]);
});
test("Goblin Sneak shadow moves the actual shadow card into staging and does not copy the attacker", () => {
  let s = base();
  const e = enemy(s, L.spider);
  e.shadows = [L.sneak];
  e.revealedShadowCount = 1;
  s.combat = { enemyId: e.id, defenderId: null, attackBonus: 0 };
  shadow(s, L.sneak);
  flush(s);
  s = settle(s);
  const current = s.engaged.find((u) => u.id === e.id)!;
  assert.ok(s.staging.some((u) => u.code === L.sneak));
  assert.equal(current.shadows.length, 0);
  assert.equal(current.revealedShadowCount, 0);
  assert.ok(s.engaged.some((u) => u.id === e.id));
});
test("Fatigue selects one controlled ready character per player before simultaneous exhaustion and gains surge only if some player has none ready afterward", () => {
  let s = base(2);
  forOwner(s, 1, () => {
    s.heroes[0].exhausted = true;
    s.heroes[1].exhausted = true;
  });
  s.encounterDeck = [L.mine];
  s = reveal(s, L.fatigue);
  const one = s.heroes[0].id;
  s = choose(s, one);
  assert.equal(allCharacters(s).find((u) => u.id === one)!.exhausted, false);
  s = choose(s, s.choice!.options[0].id);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === L.mine));
  assert.ok(s.encounterDiscard.includes(L.fatigue));
  assert.equal(
    seatView(s, 1).heroes.every((c) => c.exhausted),
    true,
  );
  s = base();
  s.encounterDeck = [L.mine];
  s = reveal(s, L.fatigue);
  s = choose(s, s.choice!.options[0].id);
  assert.equal(s.staging.length, 0);
  assert.deepEqual(s.encounterDeck, [L.mine]);
});
test("Fatigue shadow selects only the defending fellowship and a Sacked hero may satisfy its exhaustion", () => {
  let s = base(2);
  const e = enemy(s, L.spider, 1);
  forOwner(s, 1, () => attach(s, s.heroes[0], CARROCK.sacked));
  s.combat = { enemyId: e.id, defenderId: null, attackBonus: 0 };
  shadow(s, L.fatigue);
  flush(s);
  assert.ok(
    s.choice!.options.every(
      (o) =>
        ownerOf(
          s,
          allCharacters(s).find((c) => c.id === o.id)!,
        ) === 1,
    ),
  );
  s = choose(s, seatView(s, 1).heroes[0].id);
  assert.equal(seatView(s, 1).heroes[0].exhausted, true);
});
test("Durin's Greaves attaches to a first-player hero as an uncontrolled objective and grants exactly one defense", () => {
  let s = base(2);
  s = reveal(s, L.greaves);
  const h = s.heroes[0],
    before = stats(s, h).defense;
  s = choose(s, h.id);
  assert.equal(stats(s, s.heroes[0]).defense, before + 1);
  const a = s.heroes[0].attachments.find((a) => a.code === L.greaves)!;
  assert.equal(a.owner, undefined);
  assert.ok(!s.staging.some((u) => u.code === L.greaves));
  discardAttachment(s, s.heroes[0], a);
  assert.ok(s.encounterDiscard.includes(L.greaves));
});
test("Gathering Ground selects the highest combined card threat and remaining quest points, includes ties and follows active-location movement", () => {
  let s = base();
  let one = make(s, L.mine);
  const two = make(s, L.twisting);
  two.progress = 3;
  s.staging = [one, two];
  s = reveal(s, L.gathering);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [one.id],
  );
  s = choose(s, one.id);
  one = s.staging.find((u) => u.id === one.id)!;
  assert.ok(one.attachments.some((a) => a.code === L.gathering));
  s.staging = s.staging.filter((u) => u.id !== one.id);
  s.activeLocation = one;
  s.encounterDeck = [L.forge];
  s = reveal(s, L.spider);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === L.forge));
});
test("Gathering's passive surge survives When Revealed cancellation and blanking suppresses it", () => {
  let s = base();
  const l = make(s, L.mine);
  s.staging = [l];
  attach(s, l, L.gathering);
  s.hand = [make(s, "01050")];
  s.heroes[0].code = "01007";
  s.encounterDeck = [L.forge];
  s = reveal(s, L.spider);
  if (s.choice?.options.some((o) => o.id.includes("01050")))
    s = choose(s, s.choice.options.find((o) => o.id.includes("01050"))!.id);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === L.forge));
  s = base();
  const other = make(s, L.mine);
  s.staging = [other];
  attach(s, other, L.gathering);
  s.activeLocation = make(s, EMYN.amonLhaw);
  s.encounterDeck = [L.forge];
  s = reveal(s, L.spider);
  s = settle(s);
  assert.ok(!s.staging.some((u) => u.code === L.forge));
});
test("Rock Adder cannot be attacked until actual damage is placed this round, and cancelling its damage keeps the restriction", () => {
  let s = base();
  s.phase = "attack";
  const e = enemy(s, L.adder);
  assert.equal(longDarkCanAttack(s, e), false);
  assert.deepEqual(attackersFor(s, e), []);
  assert.throws(() => playerAttack(s, e, [s.heroes[0].id], true));
  combatDamage(s, s.heroes[0], e, 1);
  assert.equal(longDarkCanAttack(s, e), true);
  longDarkRoundEnd(s);
  assert.equal(longDarkCanAttack(s, e), false);
  s = base();
  s.heroes[0].code = "02025";
  const adder = enemy(s, L.adder);
  combatDamage(s, s.heroes[0], adder, 1);
  flush(s);
  assert.match(s.choice!.title, /Frodo/);
  s = choose(s, "cancel-damage");
  assert.equal(longDarkCanAttack(s, adder), false);
});
test("blanking Rock Adder allows attacks, and damage dealt while blanked still satisfies the printed condition when restored", () => {
  const s = base();
  const e = enemy(s, L.adder);
  attach(s, e, KHAZAD.fear);
  assert.equal(longDarkCanAttack(s, e), false);
  e.blanked = true;
  assert.equal(longDarkCanAttack(s, e), true);
  damage(s, s.heroes[0].id, 1, { enemyId: e.id });
  delete e.blanked;
  assert.equal(longDarkCanAttack(s, e), true);
});
test("Rock Adder undefended shadow discards a controlled character rather than destroying it; defended shadow does nothing", () => {
  let s = base();
  const e = enemy(s, L.spider);
  s.combat = { enemyId: e.id, defenderId: null, attackBonus: 0 };
  shadow(s, L.adder);
  flush(s);
  s = choose(s, s.heroes[0].id);
  assert.equal(s.heroes.length, 2);
  assert.equal(s.choice, null);
  s = base();
  const other = enemy(s, L.spider);
  s.combat = { enemyId: other.id, defenderId: s.heroes[0].id, attackBonus: 0 };
  shadow(s, L.adder);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(s.heroes.length, 3);
});
test("Cave Torch remains available in Long Dark and is removed from game if its bearer leaves play", () => {
  const s = base();
  const h = s.heroes[0],
    a = attach(s, h, KHAZAD.torch);
  s.staging = [make(s, L.mine)];
  assert.ok(availableAbilities(s, h).some((o) => o.id === a.id && !o.disabled));
  discardCharacter(s, h);
  assert.ok(s.removed.includes(KHAZAD.torch));
  assert.ok(!s.encounterDiscard.includes(KHAZAD.torch));
});
test("nonfinal Long Defeat response precedes stage-two locate; final seventeen progress wins immediately", () => {
  let s = base();
  attachToQuest(s, currentQuestCode(s)!, {
    id: "long-defeat",
    code: "10122",
    exhausted: false,
    owner: 0,
  });
  s.progress = 13;
  advanceQuest(s);
  flush(s);
  assert.equal(s.stage, 1);
  assert.match(s.choice!.title, /Long Defeat/);
  s = choose(s, "skip");
  s = settle(s);
  assert.equal(s.stage, 2);
  s.progress = 17;
  advanceQuest(s);
  assert.equal(s.status, "won");
});

test("Greaves is chosen by the first player but may attach to another fellowship's hero", () => {
  let s = base(2);
  const h = seatView(s, 1).heroes[0];
  s = reveal(s, L.greaves);
  assert.equal(s.table!.active, s.table!.first);
  assert.ok(s.choice!.options.some((o) => o.id === h.id));
  s = choose(s, h.id);
  assert.ok(
    seatView(s, 1).heroes[0].attachments.some((a) => a.code === L.greaves),
  );
  assert.equal(
    stats(s, seatView(s, 1).heroes[0]).defense,
    card(h.code).defense! + 1,
  );
});
test("Forge selects every player's hand card before either physical discard and survives reload", () => {
  let s = base(2);
  s.staging = [make(s, L.forge)];
  s.hand = [make(s, "01023")];
  forOwner(s, 1, () => (s.hand = [make(s, "01034")]));
  longDarkLost(s);
  flush(s);
  const firstCard = s.hand[0].id;
  s = choose(s, firstCard);
  assert.equal(seatView(s, 0).hand.length, 1);
  assert.equal(seatView(s, 1).hand.length, 1);
  s = saved(s);
  s = choose(s, s.choice!.options[0].id);
  assert.equal(seatView(s, 0).hand.length, 0);
  assert.equal(seatView(s, 1).hand.length, 0);
  assert.deepEqual(seatView(s, 0).discard, ["01023"]);
  assert.deepEqual(seatView(s, 1).discard, ["01034"]);
});
test("Warlord can discard an objective ally and places that physical card in encounter discard", () => {
  let s = base();
  const grim = make(s, CARROCK.grimbeorn);
  s.allies = [grim];
  s.staging = [make(s, L.warlord)];
  longDarkLost(s);
  flush(s);
  s = choose(s, grim.id);
  assert.equal(s.allies.length, 0);
  assert.ok(s.encounterDiscard.includes(grim.code));
  assert.ok(!s.discard.includes(grim.code));
});
test("partial allocation across two active locations waits for the Twisting locate and loses remainder on failure", () => {
  let s = base();
  const twisting = make(s, L.twisting),
    mine = make(s, L.mine);
  s.activeLocation = twisting;
  s.extraActiveLocations = [mine];
  s.hand = [make(s, "01023")];
  progress(s, 3);
  flush(s);
  assert.match(s.choice!.title, /Divide progress/);
  s = choose(s, `${twisting.id}:1`);
  assert.match(s.choice!.title, /Locate/);
  s = saved(s);
  s = choose(s, "fail");
  assert.equal(s.progress, 0);
  assert.ok(allActiveLocations(s).every((l) => l.progress === 0));
});
test("partial allocation across two active locations resumes only after a passed Twisting locate", () => {
  let s = base();
  const twisting = make(s, L.twisting),
    mine = make(s, L.mine);
  s.activeLocation = twisting;
  s.extraActiveLocations = [mine];
  s.hand = [make(s, "01023")];
  s.encounterDeck = [L.forge];
  progress(s, 3);
  flush(s);
  s = choose(s, `${twisting.id}:1`);
  s = choose(s, s.hand[0].id);
  assert.equal(s.activeLocation!.progress, 1);
  assert.match(s.choice!.title, /Divide progress/);
  s = choose(s, `${mine.id}:2`);
  assert.equal(s.extraActiveLocations![0].progress, 2);
  assert.equal(s.progress, 0);
});
test("an eliminated locate tester fails the original test and remaining fellowship continues", () => {
  let s = base(2);
  s.hand = [make(s, "01023")];
  s = reveal(s, L.vast);
  forOwner(s, 0, () => (s.threat = 50));
  check(s);
  flush(s);
  s = settle(s);
  assert.equal(s.table!.seats[0].eliminated, true);
  assert.equal(s.table!.first, 1);
  assert.equal(s.longDark!.locate, undefined);
  assert.equal(seatView(s, 1).threat, 27);
  assert.equal(s.status, "playing");
  assert.ok(validateSave(s));
});
test("save validation rejects invalid locate seat, continuation shape and duplicate damage ledger", () => {
  let s = base(2);
  s.hand = [make(s, "01023")];
  s = reveal(s, L.air);
  const out = JSON.parse(JSON.stringify(s));
  out.longDark.locate.player = 2;
  assert.equal(validateSave(out), false);
  out.longDark.locate.player = 0;
  out.longDark.locate.pass = null;
  assert.equal(validateSave(out), false);
  out.longDark.locate.pass = [];
  out.longDark.adderDamagedIds = ["x", "x"];
  assert.equal(validateSave(out), false);
});
