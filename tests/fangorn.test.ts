import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  createGame,
  validateSave,
  publicState,
  canTravel,
  playTargets,
  availableAbilities,
} from "../src/game/engine.ts";
import { card, imageUrl, STARTERS } from "../src/game/cards.ts";
import {
  fx,
  make,
  get,
  objectiveFree,
  locationQuest,
  stageInfo,
  threatOf,
  enemyAttackPrevented,
} from "../src/game/core.ts";
import {
  check,
  damage,
  discardCharacter,
  discardAttachment,
  nextRound,
  progress,
  progressLocation,
  readyCharacter,
  revealed,
} from "../src/game/board.ts";
import { flush, handle as effect } from "../src/game/effects.ts";
import {
  forOwner,
  playerOrder,
  seatView,
  syncSeat,
} from "../src/game/table.ts";
import {
  fangornCarrier,
  fangornCombatStart,
  fangornEncounter,
  fangornShadow,
} from "../src/game/fangorn.ts";
import {
  FANGORN as F,
  FANGORN_ENCOUNTERS,
  FANGORN_QUESTS,
  FANGORN_RECIPES,
} from "../src/game/fangorn-support.ts";
import {
  normalAttackPending,
  prepareEnemyShadows,
} from "../src/game/considered-engagement.ts";
import { removeQuestTime } from "../src/game/quest-time.ts";
import { automatedScenarioId } from "../src/game/support.ts";
import { base, choose, reload } from "./fangorn-fixtures.ts";
import type { GameState } from "../src/game/types.ts";

function settle(s: GameState, limit = 120) {
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
  const h = seatView(s, player).heroes[0];
  h.attachments.push({
    id: `captive-${s.nextId++}`,
    code: F.mugash,
    exhausted: false,
  });
  return h;
}
function condition(s: GameState, host: ReturnType<typeof make>, code: string) {
  host.attachments.push({
    id: `condition-${s.nextId++}`,
    code,
    exhausted: false,
  });
}

test("Fangorn imports all sixteen designs, nineteen local faces and exact 35/25 encounter quantities", () => {
  const state = base();
  for (const stage of [1, 2, 3]) {
    state.stage = stage;
    assert.match(stageInfo(state).questImage!, /^\/cards\/.+\.B\.jpg$/);
  }
  assert.equal(FANGORN_ENCOUNTERS.length, 13);
  assert.equal(FANGORN_QUESTS.length, 3);
  for (const r of FANGORN_RECIPES) {
    const rows = r.cards.filter((c) => c.section !== "sharedQuestDeck");
    assert.equal(
      rows.reduce((n, c) => n + c.quantity, 0),
      r.mode === "easy" ? 25 : 35,
    );
    for (const c of rows)
      assert.equal(
        r.mode === "easy" ? card(c.code).easy_quantity : card(c.code).quantity,
        c.quantity,
      );
  }
  assert.ok(
    [...FANGORN_ENCOUNTERS, ...FANGORN_QUESTS].every((c) =>
      imageUrl(c).startsWith("/cards/"),
    ),
  );
  assert.equal(
    automatedScenarioId({ name: "Into Fangorn", mode: "standard" }),
    "into-fangorn",
  );
  assert.equal(
    automatedScenarioId({ name: "Into Fangorn (Easy)", mode: "easy" }),
    "into-fangorn",
  );
  assert.equal(
    automatedScenarioId({ name: "Into Fangorn", mode: "nightmare" }),
    null,
  );
  assert.equal(
    automatedScenarioId({ name: "Into Fangorn (Campaign)", mode: "campaign" }),
    null,
  );
});
for (const players of [1, 2, 3, 4])
  for (const easy of [false, true])
    test(`Fangorn ${players}-player ${easy ? "easy" : "normal"} setup guards Mugash and survives opening choices and reload`, () => {
      const d = STARTERS[0];
      let s = createGame(144, d.cards, d.heroes, d.id, {
        scenarioId: "into-fangorn",
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
      const edge = s.staging.find((u) => u.code === F.edge),
        mugash = s.staging.find((u) => u.code === F.mugash);
      assert.ok(edge && mugash);
      assert.equal(edge.guarding, mugash.id);
      assert.equal(objectiveFree(s, mugash), false);
      assert.equal(s.encounterDeck.includes(F.mugash), false);
      assert.equal(s.encounterDeck.includes(F.edge), false);
      for (let i = 0; s.phase === "setup" && i < 100; i++)
        s = s.choice
          ? choose(reload(s), s.choice.options[0].id)
          : applyAction(reload(s), { type: "KEEP" });
      s = settle(s);
      assert.equal(s.phase, "resource");
      assert.equal(s.fangorn!.time, 4);
      reload(s);
    });
test("Mugash must be unguarded and claimed by exhausting an eligible hero without raising threat", () => {
  let s = base();
  const m = make(s, F.mugash),
    l = make(s, F.edge);
  l.guarding = m.id;
  s.staging = [m, l];
  const h = s.heroes[0],
    threat = s.threat;
  assert.equal(objectiveFree(s, m), false);
  progressLocation(s, l, 2);
  flush(s);
  assert.equal(objectiveFree(s, m), true);
  s = applyAction(reload(s), { type: "CLAIM", id: m.id, heroId: h.id });
  assert.equal(fangornCarrier(s)!.id, h.id);
  assert.equal(get(s, h.id)!.exhausted, true);
  assert.equal(s.threat, threat);
  readyCharacter(s, get(s, h.id)!);
  assert.equal(get(s, h.id)!.exhausted, false);
  assert.equal(get(s, h.id)!.attachments[0].id, m.id);
});
test("An exhausted Mugash claimant is rejected without moving the objective", () => {
  const s = base(),
    m = make(s, F.mugash);
  s.staging = [m];
  s.heroes[0].exhausted = true;
  assert.throws(
    () => applyAction(s, { type: "CLAIM", id: m.id, heroId: s.heroes[0].id }),
    /ready hero/,
  );
  assert.equal(s.staging[0].id, m.id);
});
test("Actual bearer damage puts Mugash on top; prevented and zero damage leave him attached", () => {
  const s = base(),
    h = captive(s);
  h.shadowCancelsDamage = true;
  damage(s, h.id, 2);
  assert.ok(fangornCarrier(s));
  delete h.shadowCancelsDamage;
  damage(s, h.id, 0);
  assert.ok(fangornCarrier(s));
  damage(s, h.id, 1);
  assert.equal(fangornCarrier(s), undefined);
  assert.equal(s.encounterDeck[0], F.mugash);
});
test("Lethal damage returns Mugash to the deck; a non-damage departure discards the attachment normally", () => {
  for (const lethal of [false, true]) {
    const s = base(),
      h = captive(s);
    if (lethal) damage(s, h.id, 99);
    else discardCharacter(s, h);
    assert.equal(
      s.encounterDeck.filter((c) => c === F.mugash).length,
      lethal ? 1 : 0,
    );
    assert.equal(s.encounterDiscard.includes(F.mugash), !lethal);
  }
});
test("Stage one can accumulate nine progress but advances only when Mugash is held", () => {
  let s = base();
  s.encounterDeck = [F.dark, F.dark];
  progress(s, 9);
  flush(s);
  assert.equal(s.stage, 1);
  const m = make(s, F.mugash);
  s.staging.push(m);
  s = applyAction(s, { type: "CLAIM", id: m.id, heroId: s.heroes[0].id });
  assert.equal(s.stage, 2);
  assert.equal(s.fangorn!.time, 4);
  assert.match(s.choice!.title, /Huorn/);
  s = choose(reload(s), `deck:${F.dark}`);
  assert.equal(s.progress, 0);
  assert.equal(s.staging[0].code, F.dark);
});
test("Stage two entry searches deck and discard for each player, allowing duplicate Huorn titles", () => {
  let s = base(2);
  captive(s);
  s.encounterDeck = [F.dark];
  s.encounterDiscard = [F.dark];
  progress(s, 9);
  flush(s);
  s = choose(reload(s), `deck:${F.dark}`);
  s = choose(reload(s), `discard:${F.dark}`);
  assert.equal(s.staging.filter((u) => u.code === F.dark).length, 2);
  assert.equal(s.phase, "planning");
  reload(s);
});
test("Stage two victory needs twelve progress and a captive; losing the captive blocks completion", () => {
  let s = base();
  s.stage = 2;
  progress(s, 12);
  flush(s);
  assert.equal(s.status, "playing");
  captive(s);
  check(s);
  flush(s);
  assert.equal(s.status, "won");
  s = base();
  s.stage = 2;
  const h = captive(s);
  damage(s, h.id, 1);
  progress(s, 12);
  flush(s);
  assert.equal(s.status, "playing");
});
for (const stage of [1, 2])
  test(`Stage ${stage} timeout detaches Mugash, shuffles one physical objective and enters stage three`, () => {
    const s = base();
    s.stage = stage;
    captive(s);
    s.fangorn!.time = 1;
    s.progress = 5;
    removeQuestTime(s);
    flush(s);
    assert.equal(s.stage, 3);
    assert.equal(s.progress, 0);
    assert.equal(s.fangorn!.time, 3);
    assert.equal(fangornCarrier(s), undefined);
    assert.equal(s.encounterDeck.filter((c) => c === F.mugash).length, 1);
    reload(s);
  });
test("Timeout releases Mugash's guard and does not duplicate an objective already in the deck", () => {
  for (const onBoard of [true, false]) {
    const s = base();
    s.fangorn!.time = 1;
    if (onBoard) {
      const m = make(s, F.mugash),
        l = make(s, F.edge);
      l.guarding = m.id;
      s.staging = [m, l];
    } else s.encounterDeck.push(F.mugash);
    removeQuestTime(s);
    flush(s);
    assert.equal(s.encounterDeck.filter((c) => c === F.mugash).length, 1);
    assert.ok(s.staging.every((u) => !u.guarding));
  }
});
test("Stage three must place new progress while holding Mugash; claiming after six progress does not advance", () => {
  let s = base();
  s.stage = 3;
  s.fangorn!.time = 3;
  progress(s, 6);
  flush(s);
  const m = make(s, F.mugash);
  s.staging.push(m);
  s = applyAction(s, { type: "CLAIM", id: m.id, heroId: s.heroes[0].id });
  assert.equal(s.stage, 3);
  progress(s, 1);
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.equal(s.fangorn!.time, 4);
});
test("Stage three active-location progress does not trigger the six-progress escape response", () => {
  const s = base();
  s.stage = 3;
  s.fangorn!.time = 3;
  s.progress = 6;
  captive(s);
  s.activeLocation = make(s, F.heart);
  progress(s, 2);
  flush(s);
  assert.equal(s.stage, 3);
  assert.equal(s.activeLocation.progress, 2);
});
test("Stage three timeout chooses from the whole discard, reveals Mugash with Guarded and resets Time", () => {
  let s = base();
  s.stage = 3;
  s.fangorn!.time = 1;
  s.encounterDeck = Array(6).fill(F.tangled);
  s.encounterDiscard = [F.mugash, F.dark];
  removeQuestTime(s);
  flush(s);
  assert.ok(s.choice!.options.some((o) => o.id === F.mugash));
  s = choose(reload(s), F.mugash);
  assert.equal(s.fangorn!.time, 3);
  assert.ok(s.staging.some((u) => u.code === F.mugash));
  assert.ok(s.staging.some((u) => u.guarding));
  reload(s);
});
test("Stage three timeout never reshuffles merely to discard five cards", () => {
  const s = base();
  s.stage = 3;
  s.fangorn!.time = 1;
  s.encounterDeck = [F.tangled];
  s.encounterDiscard = [F.heart];
  removeQuestTime(s);
  flush(s);
  assert.equal(s.encounterDeck.length, 0);
  assert.equal(s.encounterDiscard.length, 2);
  assert.equal(s.fangorn!.time, 3);
});
test("Hinder removes quest progress first, then active progress across the whole table", () => {
  const s = base(2);
  s.progress = 1;
  s.activeLocation = make(s, F.heart);
  s.activeLocation.progress = 2;
  s.engaged = [make(s, F.dark), make(s, F.angry)];
  syncSeat(s);
  forOwner(s, 1, () => (s.engaged = [make(s, F.deadly)]));
  fangornCombatStart(s);
  flush(s);
  assert.equal(s.progress, 0);
  assert.equal(s.activeLocation.progress, 0);
});
test("Hinder neither deals ordinary shadows nor makes framework attacks but permits player attacks", () => {
  const s = base(),
    u = make(s, F.dark);
  s.engaged = [u];
  s.phase = "defense";
  const count = s.encounterDeck.length;
  prepareEnemyShadows(s, u);
  assert.equal(u.shadows.length, 0);
  assert.equal(s.encounterDeck.length, count);
  assert.equal(normalAttackPending(s, u), false);
  assert.equal(enemyAttackPrevented(s, u), true);
  s.phase = "resource";
  assert.equal(enemyAttackPrevented(s, u), false);
  u.blanked = true;
  assert.equal(normalAttackPending(s, u), true);
});
test("Resource-phase Forced effects occur before collecting resources or drawing and survive reload", () => {
  let s = base();
  s.engaged = [make(s, F.dark), make(s, F.deadly)];
  const resources = s.heroes[0].resources,
    hand = s.hand.length;
  nextRound(s);
  flush(s);
  assert.match(s.choice!.title, /Forced/);
  assert.equal(s.heroes[0].resources, resources);
  assert.equal(s.hand.length, hand);
  s = choose(reload(s), "order-0");
  assert.equal(s.threat, 22);
  assert.match(s.choice!.title, /Deadly/);
  const h = s.heroes[0];
  s = choose(reload(s), h.id);
  assert.equal(get(s, h.id)!.damage, 3);
  assert.equal(get(s, h.id)!.resources, resources + 1);
  assert.equal(s.hand.length, hand + 1);
});
test("Angry Huorn makes a fresh-shadow attack at resource start, then collection resumes", () => {
  let s = base();
  const u = make(s, F.angry);
  s.engaged = [u];
  s.encounterDeck = [F.tangled];
  const resource = s.heroes[0].resources;
  nextRound(s);
  flush(s);
  assert.equal(s.combat!.enemyId, u.id);
  assert.equal(s.heroes[0].resources, resource);
  assert.equal(u.shadows.length, 1);
  s = choose(reload(s), s.heroes[0].id);
  s = settle(s);
  assert.equal(s.combat, null);
  assert.equal(s.heroes[1].resources, resource + 1);
});
test("Ancient Forest's threat and quest bonus does not stack and only affects staging Forests", () => {
  const s = base(),
    a = make(s, F.ancient),
    b = make(s, F.ancient),
    l = make(s, F.heart);
  s.staging = [a, b, l];
  assert.equal(threatOf(s, a), 3);
  assert.equal(locationQuest(s, a), 8);
  assert.equal(threatOf(s, l), 4);
  assert.equal(locationQuest(s, l), 6);
  s.staging = [a, b];
  s.activeLocation = l;
  assert.equal(threatOf(s, l), 3);
  assert.equal(locationQuest(s, l), 3);
});
test("Tangled Woods adds one hero-exhaustion cost even with two copies", () => {
  let s = base();
  s.phase = "travel";
  const a = make(s, F.tangled),
    b = make(s, F.tangled);
  s.staging = [a, b];
  s = applyAction(s, { type: "TRAVEL", id: a.id });
  assert.match(s.choice!.title, /Tangled/);
  const h = s.heroes[0];
  s = choose(reload(s), h.id);
  assert.equal(s.activeLocation!.id, a.id);
  assert.equal(s.heroes.filter((h) => h.exhausted).length, 1);
});
test("Tangled Woods prevents travel without a hero; Edge requires enough Huorns for the full travel cost", () => {
  const s = base(3);
  s.phase = "travel";
  const a = make(s, F.tangled),
    edge = make(s, F.edge);
  s.staging = [a, edge];
  s.encounterDeck = [F.dark];
  s.encounterDiscard = [];
  assert.match(canTravel(s, edge)!, /enough Huorns/);
  s.encounterDiscard = [F.dark];
  assert.equal(canTravel(s, edge), null);
  for (const p of playerOrder(s))
    forOwner(s, p, () => s.heroes.forEach((h) => (h.exhausted = true)));
  assert.match(canTravel(s, edge)!, /ready hero/);
});
test("Edge of Fangorn with Tangled Woods pays both costs, searches twice with three players and keeps the guard", () => {
  let s = base(3);
  s.phase = "travel";
  const t = make(s, F.tangled),
    edge = make(s, F.edge),
    m = make(s, F.mugash);
  edge.guarding = m.id;
  s.staging = [t, edge, m];
  s.encounterDeck = [F.dark, F.dark];
  s = applyAction(s, { type: "TRAVEL", id: edge.id });
  s = choose(reload(s), s.heroes[0].id);
  s = choose(reload(s), `deck:${F.dark}`);
  s = choose(reload(s), `deck:${F.dark}`);
  assert.equal(s.activeLocation!.id, edge.id);
  assert.equal(s.activeLocation!.guarding, m.id);
  assert.equal(s.staging.filter((u) => u.code === F.dark).length, 2);
});
test("Heart of Fangorn readies only five distinct characters, preserves paid choices and blocks further readying", () => {
  let s = base();
  s.staging = [make(s, F.heart)];
  s.allies = [
    make(s, "01013"),
    make(s, "01015"),
    make(s, "01016"),
    make(s, "01017"),
  ];
  [...s.heroes, ...s.allies].forEach((u) => (u.exhausted = true));
  effect(s, fx("refreshReady"));
  flush(s);
  assert.match(s.choice!.title, /Heart of Fangorn/);
  s = settle(s);
  const chars = [...s.heroes, ...s.allies];
  assert.equal(chars.filter((u) => !u.exhausted).length, 5);
  const exhausted = chars.find((u) => u.exhausted)!;
  readyCharacter(s, exhausted);
  assert.equal(exhausted.exhausted, true);
  const ready = chars.find((u) => !u.exhausted)!;
  ready.exhausted = true;
  readyCharacter(s, ready);
  assert.equal(ready.exhausted, false);
  s.phase = "planning";
  readyCharacter(s, exhausted);
  assert.equal(exhausted.exhausted, false);
  reload(s);
});
test("Heart of Fangorn's five-character limit is per player and multiple copies do not stack", () => {
  let s = base(2);
  s.staging = [make(s, F.heart), make(s, F.heart)];
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.allies = Array.from({ length: 3 }, () => make(s, "01013"));
      [...s.heroes, ...s.allies].forEach((u) => (u.exhausted = true));
    });
  effect(s, fx("refreshReady"));
  s = settle(s);
  for (const p of playerOrder(s)) {
    const seat = seatView(s, p);
    assert.equal(
      [...seat.heroes, ...seat.allies].filter((u) => !u.exhausted).length,
      5,
    );
  }
  reload(s);
});
test("An active Heart of Fangorn does not restrict refresh", () => {
  const s = base();
  s.activeLocation = make(s, F.heart);
  s.allies = Array.from({ length: 5 }, () => make(s, "01013"));
  [...s.heroes, ...s.allies].forEach((u) => (u.exhausted = true));
  effect(s, fx("refreshReady"));
  flush(s);
  assert.ok([...s.heroes, ...s.allies].every((u) => !u.exhausted));
});
test("Forest's Malice cannot be canceled and searches for an engaged Huorn if no attack occurred", () => {
  let s = base();
  s.hand = [make(s, "01050")];
  s.heroes[0].phaseResourceIcons = ["spirit"];
  s.encounterDeck = [F.dark];
  revealed(s, F.malice);
  flush(s);
  assert.match(s.choice!.title, /Huorn to engage/);
  assert.ok(!s.choice!.options.some((o) => o.id === "cancel"));
  s = choose(reload(s), `deck:${F.dark}`);
  assert.equal(s.engaged[0].code, F.dark);
  assert.ok(s.encounterDiscard.includes(F.malice));
});
test("Forest's Malice counts actual attacks and preserves immediate-combat saves", () => {
  let s = base();
  s.engaged = [make(s, F.dark)];
  s.encounterDeck = [F.tangled, F.dark];
  revealed(s, F.malice);
  flush(s);
  assert.ok(s.fangorn!.maliceAttacked);
  s = choose(reload(s), s.heroes[0].id);
  s = settle(s);
  assert.equal(s.engaged.length, 1);
  assert.equal(s.fangorn!.maliceAttacked, undefined);
  assert.equal(s.combat, null);
});
test("If every Malice attack is prevented, players still search for Huorns", () => {
  let s = base();
  const enemy = make(s, F.dark);
  enemy.feinted = true;
  s.engaged = [enemy];
  s.encounterDeck = [F.tangled, F.deadly];
  revealed(s, F.malice);
  flush(s);
  assert.match(s.choice!.title, /Huorn to engage/);
  s = choose(reload(s), `deck:${F.deadly}`);
  assert.equal(s.engaged.length, 2);
});
test("Low on Provisions assigns each player's own character count among their own characters", () => {
  let s = base(2);
  s.allies = [make(s, "01013")];
  syncSeat(s);
  revealed(s, F.provisions);
  flush(s);
  assert.match(s.choice!.title, /4 damage/);
  const first = s.heroes[0].id;
  s = choose(reload(s), `${first}:4`);
  assert.equal(get(s, first)!.damage, 4);
  assert.ok(
    s.choice!.options.every((o) =>
      seatView(s, 1).heroes.some((h) => o.id.startsWith(`${h.id}:`)),
    ),
  );
});
test("Off Track attaches once per location, adds two quest points and retains Surge", () => {
  let s = base();
  const a = make(s, F.heart);
  s.staging = [a];
  s.encounterDeck = [F.tangled];
  revealed(s, F.offTrack);
  flush(s);
  s = choose(reload(s), a.id);
  assert.equal(locationQuest(s, get(s, a.id)!), 5);
  assert.ok(s.staging.some((u) => u.code === F.tangled));
  assert.ok(!s.encounterDiscard.includes(F.offTrack));
  s.encounterDeck = [];
  s.staging = s.staging.filter((u) => u.id === a.id);
  fangornEncounter(s, F.offTrack);
  flush(s);
  assert.equal(s.choice, null);
  assert.ok(s.encounterDiscard.includes(F.offTrack));
});
test("Each Off Track removes an additional end-refresh counter; the next stage can lose remaining counters", () => {
  let s = base();
  s.phase = "refresh";
  s.fangorn!.time = 1;
  const a = make(s, F.heart),
    b = make(s, F.tangled);
  condition(s, a, F.offTrack);
  condition(s, b, F.offTrack);
  s.staging = [a, b];
  effect(s, fx("phaseEnd"));
  flush(s);
  assert.match(s.choice!.title, /Forced/);
  s = settle(s);
  assert.equal(s.stage, 3);
  assert.equal(s.fangorn!.time, 1);
});
test("In Need of Rest targets a questing hero, removes it and damages on each actual counter removed", () => {
  let s = base();
  const hero = s.heroes[0];
  hero.committed = true;
  s.committedIds = [hero.id];
  revealed(s, F.rest);
  flush(s);
  s = choose(reload(s), hero.id);
  assert.equal(get(s, hero.id)!.committed, false);
  assert.ok(!s.committedIds.includes(hero.id));
  removeQuestTime(s, 2);
  s = settle(s);
  assert.equal(get(s, hero.id)!.damage, 2);
  removeQuestTime(s, 0);
  flush(s);
  assert.equal(get(s, hero.id)!.damage, 2);
});
test("A Rest condition on Mugash's bearer releases him on counter damage and remains removable", () => {
  let s = base();
  const h = captive(s);
  condition(s, h, F.rest);
  removeQuestTime(s);
  flush(s);
  assert.equal(s.encounterDeck[0], F.mugash);
  discardAttachment(
    s,
    h,
    h.attachments.find((a) => a.code === F.rest)!,
  );
  removeQuestTime(s);
  flush(s);
  assert.equal(h.damage, 1);
  assert.ok(s.encounterDiscard.includes(F.rest));
});
test("In Need of Rest whiffs with no questing hero and enforces one copy per hero", () => {
  const s = base();
  revealed(s, F.rest);
  flush(s);
  assert.ok(s.encounterDiscard.includes(F.rest));
  s.heroes[0].committed = true;
  condition(s, s.heroes[0], F.rest);
  revealed(s, F.rest);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(s.heroes[0].attachments.length, 1);
});
test("Turned Around only offers resolvable alternatives and returning a location preserves its physical state", () => {
  let s = base();
  fangornEncounter(s, F.turned);
  flush(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["time"],
  );
  s = choose(s, "time");
  assert.equal(s.fangorn!.time, 3);
  s.activeLocation = make(s, F.edge);
  s.activeLocation.progress = 1;
  const id = s.activeLocation.id;
  fangornEncounter(s, F.turned);
  flush(s);
  s = choose(reload(s), "location");
  assert.equal(s.activeLocation, null);
  assert.equal(s.staging[0].id, id);
  assert.equal(s.staging[0].progress, 1);
});
test("All Fangorn shadow effects use actual defending state and ordinary additional attacks", () => {
  let s = base();
  s.engaged = [make(s, F.dark)];
  const enemy = s.engaged[0];
  s.combat = {
    enemyId: enemy.id,
    defenderId: s.heroes[0].id,
    attackBonus: 0,
    attackPlayer: 0,
  };
  fangornShadow(s, F.provisions);
  assert.equal(s.combat.attackBonus, 2);
  s.heroes[0].damage = 1;
  fangornShadow(s, F.provisions);
  assert.equal(s.combat.attackBonus, 3);
  fangornShadow(s, F.heart);
  assert.equal(s.combat.extraAttacks, 1);
  s.activeLocation = make(s, F.heart);
  fangornShadow(s, F.turned);
  flush(s);
  assert.ok(s.activeLocation);
  s.combat.defenderId = null;
  fangornShadow(s, F.turned);
  flush(s);
  assert.equal(s.activeLocation, null);
  fangornShadow(s, F.ancient);
  flush(s);
  assert.match(s.choice!.title, /Exhaust/);
  reload(s);
});
test("Fangorn Time and refresh ledgers validate strictly and public state exposes the objective status", () => {
  const s = base();
  captive(s);
  assert.equal(publicState(s).mugashCaptured, true);
  assert.equal(publicState(s).timeCounters, 4);
  reload(s);
  for (const bad of [-1, 5, NaN, "4", null]) {
    const x = structuredClone(s);
    x.fangorn!.time = bad as number;
    assert.equal(validateSave(x), false);
  }
  for (const bad of [
    null,
    [],
    { "9": [] },
    { "0": [7] },
    { "0": ["a", "a"] },
  ]) {
    const x = structuredClone(s);
    x.refreshReadied = bad as never;
    assert.equal(validateSave(x), false);
  }
  const no = structuredClone(s);
  delete no.fangorn;
  assert.equal(validateSave(no), false);
});
test("Huorns reject Forest Snare and shed existing attachments when their printed text becomes active", () => {
  const s = base(),
    u = make(s, F.dark),
    snare = make(s, "01069");
  s.engaged = [u];
  assert.ok(!playTargets(s, snare).some((t) => t.id === u.id));
  condition(s, u, "01069");
  check(s);
  assert.equal(u.attachments.length, 0);
  assert.ok(s.discard.includes("01069"));
});
test("Removing Ancient Forest immediately explores locations whose stored progress meets the reduced quest points", () => {
  const s = base(),
    a = make(s, F.ancient),
    l = make(s, F.heart);
  s.staging = [a, l];
  l.progress = 3;
  check(s);
  assert.ok(s.staging.some((u) => u.id === l.id));
  progressLocation(s, a, 8);
  check(s);
  assert.ok(!s.staging.some((u) => u.id === l.id));
  assert.ok(s.encounterDiscard.includes(F.heart));
});
test("A real Hinder combat lets players attack Huorns without selecting defenders", () => {
  let s = base();
  const u = make(s, F.dark);
  s.engaged = [u];
  s.progress = 2;
  s.encounterDeck = [F.tangled];
  effect(s, fx("startCombat"));
  flush(s);
  assert.equal(s.phase, "attack");
  assert.equal(s.progress, 1);
  assert.equal(s.choice, null);
  assert.equal(u.shadows.length, 0);
  s.heroes[0].tempAttack = 20;
  s = applyAction(reload(s), {
    type: "ATTACK",
    enemyId: u.id,
    attackerIds: [s.heroes[0].id],
  });
  assert.equal(s.engaged.length, 0);
});
test("Heart of Fangorn blocks paid Unexpected Courage before its cost is spent", () => {
  let s = base();
  s.staging = [make(s, F.heart)];
  s.allies = Array.from({ length: 3 }, () => make(s, "01013"));
  [...s.heroes, ...s.allies].forEach((u) => (u.exhausted = true));
  effect(s, fx("refreshReady"));
  flush(s);
  while (s.choice)
    s = choose(
      reload(s),
      s.choice.options.find((o) => s.allies.some((a) => a.id === o.id))?.id ??
        s.choice.options[0].id,
    );
  const u = s.heroes.find((u) => u.exhausted)!;
  condition(s, u, "01057");
  const a = u.attachments.at(-1)!;
  assert.equal(
    availableAbilities(s, u).find((x) => x.id === a.id)!.disabled,
    true,
  );
  assert.throws(
    () => applyAction(s, { type: "ABILITY", id: u.id, attachmentId: a.id }),
    /ready|ability|cannot|available/i,
  );
  assert.equal(a.exhausted, false);
});
test("In Need of Rest and the last-counter effect offer a saved first-player ordering choice", () => {
  let s = base();
  const h = captive(s);
  condition(s, h, F.rest);
  s.fangorn!.time = 1;
  removeQuestTime(s);
  flush(s);
  assert.equal(s.choice!.options.length, 2);
  s = choose(reload(s), "order-0");
  s = settle(s);
  assert.equal(s.stage, 3);
  assert.equal(s.encounterDeck.filter((c) => c === F.mugash).length, 1);
  assert.equal(get(s, h.id)!.damage, 1);
});
test("Stage-three recovery searches independently for all players and adds enemies with their physical reveal rules", () => {
  let s = base(2);
  s.stage = 3;
  s.fangorn!.time = 1;
  s.encounterDeck = [];
  s.encounterDiscard = [F.dark, F.dark];
  removeQuestTime(s);
  flush(s);
  s = choose(reload(s), F.dark);
  s = choose(reload(s), F.dark);
  assert.equal(s.staging.filter((u) => u.code === F.dark).length, 2);
  assert.equal(s.fangorn!.time, 3);
  assert.equal(s.encounterDiscard.length, 0);
});
test("A resource-phase threat elimination does not collect resources for the eliminated player or strand the surviving player", () => {
  let s = base(2);
  s.threat = 49;
  s.engaged = [make(s, F.dark)];
  syncSeat(s);
  const survivor = seatView(s, 1).heroes[0],
    resources = survivor.resources;
  nextRound(s);
  s = settle(s);
  assert.equal(s.table!.seats[0].eliminated, true);
  assert.equal(s.status, "playing");
  assert.equal(get(s, survivor.id)!.resources, resources + 1);
  reload(s);
});
test("Cancelling Off Track preserves its separate Surge without attaching a condition", () => {
  let s = base();
  s.hand = [make(s, "01050")];
  s.heroes[0].phaseResourceIcons = ["spirit"];
  s.staging = [make(s, F.heart)];
  s.encounterDeck = [F.tangled];
  revealed(s, F.offTrack);
  flush(s);
  s = choose(reload(s), "cancel");
  assert.ok(s.staging.some((u) => u.code === F.tangled));
  assert.ok(s.staging.every((u) => !u.attachments.length));
});

test("Malice allows the first player to order multiple Huorn attacks before choosing a defender", () => {
  let s = base();
  s.engaged = [make(s, F.dark), make(s, F.deadly)];
  s.encounterDeck = [F.tangled, F.tangled];
  revealed(s, F.malice);
  flush(s);
  assert.match(s.choice!.title, /next Huorn/);
  s = choose(reload(s), "order-1");
  assert.equal(s.combat!.enemyId, s.engaged[1].id);
  s = choose(reload(s), s.heroes[0].id);
  assert.equal(s.combat!.enemyId, s.engaged[0].id);
});

test("Stage-three advancement resolves its Forced effect before subsequent queued counter removal", () => {
  let s = base();
  s.stage = 3;
  s.fangorn!.time = 1;
  s.progress = 5;
  captive(s);
  s.queue = [fx("removeQuestTime")];
  progress(s, 1);
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.equal(s.fangorn!.time, 3);
});
test("Only defeating a Fangorn stage offers The Long Defeat, while Time and stage-three advancement discard it normally", () => {
  for (const stage of [1, 3]) {
    let s = base();
    s.stage = stage;
    s.fangorn!.time = stage === 3 ? 3 : 1;
    captive(s);
    const code = stage === 1 ? F.woods : F.angryForest;
    s.questAttachments = {
      [code]: [{ id: "quest-attachment", code: "10122", exhausted: false }],
    };
    if (stage === 1) removeQuestTime(s);
    else progress(s, 6);
    flush(s);
    assert.equal(s.choice, null);
    assert.ok(s.discard.includes("10122"));
    assert.equal(s.stage, stage === 1 ? 3 : 2);
  }
  let s = base();
  captive(s);
  s.questAttachments = {
    [F.woods]: [
      { id: "won-quest-attachment", code: "10122", exhausted: false },
    ],
  };
  progress(s, 9);
  flush(s);
  assert.match(s.choice!.title, /Long Defeat/);
  assert.equal(s.stage, 1);
  s = choose(reload(s), "skip");
  assert.equal(s.stage, 2);
});
