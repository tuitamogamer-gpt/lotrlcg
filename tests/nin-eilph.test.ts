import assert from "node:assert/strict";
import test from "node:test";
import {
  createGame,
  applyAction,
  validateSave,
  canPlay,
  canCommit,
  canTravel,
  publicState,
} from "../src/game/engine.ts";
import { card, imageUrl, STARTERS, SCRIPTED } from "../src/game/cards.ts";
import {
  make,
  fx,
  get,
  stats,
  threatOf,
  engagementCost,
  stageInfo,
  draw,
  canGainResources,
  canPay,
} from "../src/game/core.ts";
import {
  check,
  damage,
  destroy,
  progress,
  progressLocation,
  discardCharacter,
  placeEncounter,
  collectResources,
  spendEvent,
} from "../src/game/board.ts";
import { flush, handle as effect } from "../src/game/effects.ts";
import {
  forOwner,
  playerOrder,
  seatView,
  ownerOf,
  allCharacters,
  allEngaged,
  syncSeat,
} from "../src/game/table.ts";
import {
  NIN as N,
  NIN_ENCOUNTERS,
  NIN_QUESTS,
  NIN_RECIPES,
  NIN_STAGE_TWO,
  NIN_STAGE_THREE,
  NIN_LOCATIONS,
} from "../src/game/nin-eilph-support.ts";
import {
  ninDweller,
  ninEncounter,
  ninShadow,
  ninEndRound,
} from "../src/game/nin-eilph.ts";
import { tharbadNalir } from "../src/game/tharbad.ts";
import { removeQuestTime } from "../src/game/quest-time.ts";
import { attachToQuest } from "../src/game/quest-state.ts";
import {
  playCardFromEffect,
  effectCardPlayProblem,
} from "../src/game/actions.ts";
import { base, choose, reload } from "./nin-eilph-fixtures.ts";
import type { GameState, Unit } from "../src/game/types.ts";
function settle(s: GameState) {
  flush(s);
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 150, "choices terminate");
    s = choose(
      reload(s),
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  return s;
}
function enemy(s: GameState, code = N.adder, p = 0) {
  let u: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    s.engaged.push(u);
  });
  return u!;
}
function boss(s: GameState) {
  effect(s, fx("ninReturnDweller"));
  return ninDweller(s)!;
}
function attach(s: GameState, u: Unit, code: string) {
  const a = { id: `a${s.nextId++}`, code, exhausted: false };
  u.attachments.push(a);
  return a;
}
test("Nin imports ten encounter designs, eight dynamic quest faces, twenty-six images and exact 31/25 encounter recipes", () => {
  assert.equal(NIN_ENCOUNTERS.length, 10);
  assert.equal(NIN_QUESTS.length, 8);
  let faces = 0;
  for (const c of [...NIN_ENCOUNTERS, ...NIN_QUESTS]) {
    assert.ok(SCRIPTED.has(c.code));
    assert.match(imageUrl(c), /^\/cards\//);
    faces++;
    if (c.back_imagesrc) {
      assert.match(imageUrl({ ...c, imagesrc: c.back_imagesrc }), /^\/cards\//);
      faces++;
    }
  }
  assert.equal(faces, 26);
  for (const r of NIN_RECIPES) {
    const totals = new Map<string, number>();
    for (const row of r.cards.filter((c) => c.section !== "sharedQuestDeck"))
      totals.set(row.code, (totals.get(row.code) ?? 0) + row.quantity);
    assert.equal(
      [...totals.values()].reduce((a, b) => a + b, 0),
      r.mode === "easy" ? 25 : 31,
    );
    for (const [code, n] of totals)
      assert.equal(
        r.mode === "easy" ? card(code).easy_quantity : card(code).quantity,
        n,
      );
  }
});
for (const players of [1, 2, 3, 4])
  for (const easy of [false, true])
    test(`Nin setup ${players} players / ${easy ? "easy" : "normal"} completes hands before distinct location choices and a seeded stage`, () => {
      const d = STARTERS[0];
      let s = createGame(31, d.cards, d.heroes, d.id, {
        scenarioId: "the-nin-in-eilph",
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
      assert.equal(s.encounterDeck.length, easy ? 23 : 29);
      for (let p = 0; p < players; p++) {
        s = applyAction(reload(s), { type: "MULLIGAN" });
        s = applyAction(reload(s), { type: "KEEP" });
      }
      assert.match(s.choice!.title, /different location/);
      const chosen = [];
      for (let p = 0; p < players; p++) {
        assert.equal(s.choice!.options.length, 4 - p);
        const code = s.choice!.options[0].id;
        chosen.push(code);
        s = choose(reload(s), code);
      }
      s = settle(s);
      assert.equal(s.phase, "resource");
      assert.equal(s.stage, 2);
      assert.ok(NIN_STAGE_TWO.includes(s.ninEilph!.activeQuest));
      assert.equal(s.ninEilph!.time, 3);
      assert.equal(s.encounterDeck.length, (easy ? 23 : 29) - players);
      assert.equal(
        s.staging.filter((u) => NIN_LOCATIONS.includes(u.code)).length,
        players,
      );
      assert.equal(new Set(chosen).size, players);
      assert.equal(tharbadNalir(s)!.code, N.nalir);
      assert.ok(playerOrder(s).every((p) => seatView(s, p).hand.length === 7));
      reload(s);
    });
for (const quest of [...NIN_STAGE_TWO, ...NIN_STAGE_THREE])
  test(`Time changes ${card(quest).back_name} to a different parallel stage, loses progress and raises threat`, () => {
    let s = base(1, quest);
    s.progress = 8;
    s.ninEilph!.time = 1;
    removeQuestTime(s);
    s = settle(s);
    assert.notEqual(s.ninEilph!.activeQuest, quest);
    assert.ok(
      (s.stage === 2 ? NIN_STAGE_TWO : NIN_STAGE_THREE).includes(
        s.ninEilph!.activeQuest,
      ),
    );
    assert.equal(s.progress, 0);
    assert.equal(s.threat, 21);
    assert.equal(s.ninEilph!.time, 3);
    assert.equal(stageInfo(s).name, card(s.ninEilph!.activeQuest).back_name);
    assert.match(stageInfo(s).questImage!, /\.B\.jpg$/);
    if (s.stage === 3) assert.ok(ninDweller(s));
    reload(s);
  });
test("Every stage-two and stage-three pairing can reach the final boss and actual victory", () => {
  for (const a of NIN_STAGE_TWO)
    for (const b of NIN_STAGE_THREE) {
      let s = base(1, a);
      progress(s, 13);
      s = settle(s);
      assert.equal(s.stage, 3);
      s.ninEilph!.activeQuest = b;
      const dweller = ninDweller(s)!;
      dweller.damage = 5;
      dweller.resources = 2;
      s.heroes[0].tempDefense = 20;
      s.encounterDeck = Array(15).fill(N.dweller);
      progress(s, 16);
      s = settle(s);
      assert.equal(s.stage, 4);
      assert.equal(ninDweller(s)!.damage, 0);
      assert.equal(ninDweller(s)!.resources, 2);
      damage(s, ninDweller(s)!.id, 99);
      s = settle(s);
      assert.equal(s.status, "won");
    }
});
test("Parallel-stage Time discards The Long Defeat without defeating the old quest", () => {
  let s = base(1, N.weary);
  attachToQuest(s, N.weary, {
    id: "quest-song",
    code: "10122",
    exhausted: false,
  });
  s.ninEilph!.time = 1;
  removeQuestTime(s);
  s = settle(s);
  assert.equal(s.questAttachments?.[N.weary], undefined);
  assert.ok(s.discard.includes("10122"));
  assert.equal(s.choice, null);
});
test("Fen copies exhaust each fellowship once on every advancement, including same-number changes", () => {
  let s = base(2, N.noEnd);
  s.staging = [make(s, N.reeds), make(s, N.reeds)];
  s.ninEilph!.time = 1;
  removeQuestTime(s);
  s = settle(s);
  for (const p of playerOrder(s))
    assert.equal(
      [...seatView(s, p).heroes, ...seatView(s, p).allies].filter(
        (u) => u.exhausted,
      ).length,
      2,
    );
});
test("The Dweller returns from engagement retaining tokens but healing every wound", () => {
  let s = base(2, N.impassable);
  const d = boss(s);
  d.resources = 4;
  d.damage = 3;
  s.staging = [];
  forOwner(s, 1, () => s.engaged.push(d));
  s.ninEilph!.time = 1;
  removeQuestTime(s);
  s = settle(s);
  assert.equal(
    allEngaged(s).some((u) => u.id === d.id),
    false,
  );
  assert.equal(ninDweller(s)!.id, d.id);
  assert.equal(ninDweller(s)!.resources, 5);
  assert.equal(ninDweller(s)!.damage, 0);
});
test("Defeating the Dweller before stage four puts him in victory, and re-entry resets his physical tokens", () => {
  let s = base(1, N.impassable);
  const d = boss(s);
  d.resources = 7;
  damage(s, d.id, 99);
  s = settle(s);
  assert.equal(s.status, "playing");
  assert.ok(s.victoryCards!.includes(N.dweller));
  effect(s, fx("ninReturnDweller"));
  s = settle(s);
  assert.equal(s.victoryCards!.includes(N.dweller), false);
  assert.notEqual(ninDweller(s)!.id, d.id);
  assert.equal(ninDweller(s)!.resources, 0);
});
test("Discarding the final Dweller is not victory and zero quest points never win by progress", () => {
  let s = base(1, N.out);
  const d = boss(s);
  progress(s, 100);
  assert.equal(s.progress, 0);
  assert.equal(s.status, "playing");
  discardCharacter(s, d);
  s = settle(s);
  assert.equal(s.status, "playing");
});
test("One bulk Time removal triggers each creature once, rather than once per counter", () => {
  let s = base(1, N.impassable);
  const d = boss(s),
    a = enemy(s);
  s.allies.push(make(s, "01073"));
  enemy(s, N.neeker);
  s.ninEilph!.time = 3;
  removeQuestTime(s, 2);
  flush(s);
  assert.match(s.choice!.title, /Forced effect/);
  s = settle(s);
  assert.equal(ninDweller(s)!.resources, 1);
  assert.equal(s.ninEilph!.time, 1);
  assert.equal(get(s, a.id)!.shadows.length, 0);
  assert.equal(s.heroes.filter((h) => h.exhausted).length, 1);
  assert.equal(tharbadNalir(s)!.damage, 2);
});
test("Staging Adders and Neekerbreekers do not trigger and exhausted/Feinted Adders obey ordinary attack prevention", () => {
  let s = base();
  s.staging = [make(s, N.adder), make(s, N.neeker)];
  const a = enemy(s);
  a.feinted = true;
  removeQuestTime(s);
  s = settle(s);
  assert.ok(s.heroes.every((h) => !h.exhausted));
  assert.equal(tharbadNalir(s)!.damage, 0);
});
test("A Time-triggered Neekerbreeker choice persists across reload and must include objective ally Nalir", () => {
  let s = base();
  enemy(s, N.neeker);
  removeQuestTime(s);
  flush(s);
  assert.equal(s.choice!.options.length, 1);
  assert.equal(s.choice!.options[0].id, tharbadNalir(s)!.id);
  s = choose(reload(s), tharbadNalir(s)!.id);
  removeQuestTime(s);
  s = settle(s);
  assert.equal(s.status, "lost");
});
test("The final deadline attacks each player in order, keeps engagements and resets Time after all attacks", () => {
  let s = base(2, N.out);
  const d = boss(s);
  for (const p of playerOrder(s))
    forOwner(s, p, () => s.heroes.forEach((h) => (h.tempDefense = 10)));
  s.staging = [];
  forOwner(s, 1, () => s.engaged.push(d));
  s.encounterDeck = Array(12).fill(N.dweller);
  s.ninEilph!.time = 1;
  removeQuestTime(s);
  flush(s);
  s = settle(s);
  assert.equal(s.ninEilph!.time, 2);
  assert.ok(
    playerOrder(s).every((p) => seatView(s, p).heroes.some((h) => h.exhausted)),
  );
  assert.equal(ownerOf(s, ninDweller(s)!), 1);
});
test("Nalir moves with first player, adds threat before refresh readying and loses the game on departure", () => {
  let s = base(2);
  s.table!.first = 1;
  check(s);
  assert.equal(ownerOf(s, tharbadNalir(s)!), 1);
  s.phase = "attack";
  effect(s, fx("refreshReady"));
  s = settle(s);
  assert.equal(seatView(s, 0).threat, 21);
  assert.equal(seatView(s, 1).threat, 23);
  discardCharacter(s, tharbadNalir(s)!);
  assert.equal(s.status, "lost");
});
test("Sinking Bog subtracts Item count from all three stats once per character, even with multiple Bogs", () => {
  const s = base(),
    h = s.heroes[0];
  attach(s, h, "01042");
  attach(s, h, "01039");
  attach(s, h, "01057");
  const before = stats(s, h);
  s.staging = [make(s, N.bog), make(s, N.bog)];
  const after = stats(s, h);
  for (const k of ["will", "attack", "defense"] as const)
    assert.equal(after[k], Math.max(0, before[k] - 2));
  assert.equal(after.health, before.health);
  s.staging = [];
  assert.deepEqual(stats(s, h), before);
});
test("Impassable Marshland boosts all location threat while Creatures only changes staging engagement costs", () => {
  const s = base(1, N.impassable),
    l = make(s, N.eyot),
    e = make(s, N.adder);
  s.staging = [l, e];
  s.activeLocation = make(s, N.bog);
  assert.equal(threatOf(s, l), card(l.code).threat! + 1);
  assert.equal(threatOf(s, s.activeLocation), 2);
  s.ninEilph!.activeQuest = N.creatures;
  assert.equal(threatOf(s, l), card(l.code).threat);
  assert.equal(engagementCost(s, e), card(e.code).engagement! - 20);
  s.staging = [l];
  s.engaged = [e];
  assert.equal(engagementCost(s, e), card(e.code).engagement);
});
test("Finger copies remove progress from every location at round end without going negative", () => {
  const s = base();
  s.staging = [make(s, N.finger), make(s, N.finger), make(s, N.eyot)];
  s.staging[2].progress = 3;
  s.activeLocation = make(s, N.bog);
  s.activeLocation.progress = 1;
  ninEndRound(s);
  assert.equal(s.staging[2].progress, 1);
  assert.equal(s.activeLocation.progress, 0);
});
test("Hidden Eyot travel exhausts one character per player and exploration offers optional extra Time", () => {
  let s = base(2);
  s.phase = "travel";
  const l = make(s, N.eyot);
  s.staging = [l];
  s = applyAction(reload(s), { type: "TRAVEL", id: l.id });
  s = settle(s);
  assert.ok(
    playerOrder(s).every((p) => seatView(s, p).heroes.some((h) => h.exhausted)),
  );
  assert.equal(s.activeLocation!.id, l.id);
  progressLocation(s, s.activeLocation!, 10);
  flush(s);
  assert.match(s.choice!.title, /Hidden Eyot/);
  s = choose(reload(s), "time");
  s = settle(s);
  assert.equal(s.ninEilph!.time, 5);
});
test("Hidden Eyot refuses travel if one player cannot pay their exhaustion cost", () => {
  const s = base(2);
  s.phase = "travel";
  forOwner(s, 1, () => s.heroes.forEach((h) => (h.exhausted = true)));
  const l = make(s, N.eyot);
  s.staging = [l];
  assert.match(canTravel(s, l)!, /every player/);
});
test("No End in Sight blocks player draw and resource generation but retains framework collection", () => {
  let s = base();
  const n = s.hand.length,
    resources = s.heroes[0].resources;
  attach(s, s.heroes[0], "04062");
  draw(s, 2);
  assert.equal(s.hand.length, n);
  effect(s, fx("resource", { target: s.heroes[0].id, value: 3 }));
  assert.equal(s.heroes[0].resources, resources);
  assert.equal(canGainResources(s, s.heroes[0]), false);
  collectResources(s);
  s = settle(s);
  assert.equal(s.heroes[0].resources, resources + 1);
  assert.equal(s.hand.length, n + 1);
});
test("No End in Sight still allows resource moves from Errand-rider and rejects resource creation", () => {
  let s = base();
  const a = s.heroes[0],
    b = s.heroes[1];
  effect(s, fx("gondorMoveResource", { source: a.id, target: b.id }));
  s = settle(s);
  assert.equal(s.heroes[0].resources, 9);
  assert.equal(s.heroes[1].resources, 11);
  assert.equal(canGainResources(s, b, true, true), true);
  assert.equal(canGainResources(s, b), false);
});
test("A Forgotten Land counts every played card and response event, keeps players separate and resets each round", () => {
  let s = base(2, N.forgotten);
  s.hand = [make(s, "01013"), make(s, "01014")];
  s = applyAction(reload(s), { type: "PLAY", id: s.hand[0].id });
  s = settle(s);
  assert.match(canPlay(s, s.hand[0])!, /only one/);
  assert.equal(canPay(s, card("01050")), false);
  forOwner(s, 1, () => {
    s.heroes[0].code = "01007";
    s.hand = [make(s, "01050")];
    assert.equal(canPay(s, card("01050")), true);
    spendEvent(s, "01050");
  });
  s = settle(s);
  assert.ok(seatView(s, 1).used.includes("nin:played"));
  s.phase = "refresh";
  effect(s, fx("endRoundAfterCollector"));
  s = settle(s);
  assert.ok(
    playerOrder(s).every((p) => !seatView(s, p).used.includes("nin:played")),
  );
});
test("Entering A Forgotten Land mid-round retains plays already made under a different stage", () => {
  let s = base(1, N.noEnd);
  s.hand = [make(s, "01013"), make(s, "01014")];
  s = applyAction(reload(s), { type: "PLAY", id: s.hand[0].id });
  s = settle(s);
  s.ninEilph!.activeQuest = N.forgotten;
  assert.match(canPlay(s, s.hand[0])!, /only one/);
});
test("Vilya put-into-play bypasses the one-card cap but an actual free play does not", () => {
  const s = base(1, N.forgotten);
  s.used.push("nin:played");
  s.deck = ["01014"];
  const u = make(s, "01014");
  assert.match(
    effectCardPlayProblem(s, u, { putIntoPlay: false })!,
    /only one/,
  );
  assert.equal(effectCardPlayProblem(s, u, { putIntoPlay: true }), null);
  playCardFromEffect(s, u, { putIntoPlay: true });
  assert.ok(s.allies.some((a) => a.code === "01014"));
});
test("A Weary Passage pays one seeded random card for the group before committing and requires no payment for zero questers", () => {
  let s = base(1, N.weary);
  s.phase = "quest";
  s.hand = [make(s, "01013"), make(s, "01014")];
  s.committedIds = s.heroes.map((h) => h.id);
  s = applyAction(reload(s), { type: "COMMIT" });
  s = settle(s);
  assert.equal(s.hand.length, 1);
  assert.equal(s.discard.length, 1);
  assert.ok(s.heroes.every((h) => h.committed && h.exhausted));
  s = base(1, N.weary);
  s.phase = "quest";
  s = applyAction(reload(s), { type: "COMMIT" });
  assert.notEqual(s.phase, "quest");
  assert.equal(s.discard.length, 0);
});
test("A Weary Passage cannot commit without a hand card and preserves the board after a refused cost", () => {
  const s = base(1, N.weary);
  s.phase = "quest";
  assert.equal(canCommit(s, s.heroes[0]), false);
  s.committedIds = [s.heroes[0].id];
  assert.throws(
    () => applyAction(reload(s), { type: "COMMIT" }),
    /random card/,
  );
  assert.equal(s.heroes[0].exhausted, false);
  assert.equal(s.phase, "quest");
});
test("Treacherous Swamp offers exact five-character refresh choices and blocks a sixth ready effect", () => {
  let s = base(1, N.treacherous);
  s.phase = "attack";
  s.allies.push(...Array.from({ length: 4 }, () => make(s, "01013")));
  allCharacters(s).forEach((u) => (u.exhausted = true));
  effect(s, fx("refreshReady"));
  flush(s);
  assert.match(s.choice!.title, /Treacherous Swamp/);
  s = settle(s);
  assert.equal(allCharacters(s).filter((u) => !u.exhausted).length, 5);
  const left = allCharacters(s).find((u) => u.exhausted)!;
  effect(s, fx("ready", { target: left.id }));
  assert.equal(left.exhausted, true);
});
test("Remnants is uncancelable and each player searches deck or discard for a Creature without When Revealed", () => {
  let s = base(2);
  s.heroes[0].code = "01007";
  s.hand = [make(s, "01050")];
  s.encounterDeck = [N.remnants, N.adder];
  s.encounterDiscard = [N.neeker];
  effect(s, fx("reveal"));
  flush(s);
  assert.match(s.choice!.title, /Remnants/);
  assert.ok(!s.choice!.options.some((o) => o.id.startsWith("cancel")));
  s = choose(reload(s), `deck:${N.adder}`);
  s = choose(reload(s), `discard:${N.neeker}`);
  s = settle(s);
  assert.equal(seatView(s, 0).engaged[0].code, N.adder);
  assert.equal(seatView(s, 1).engaged[0].code, N.neeker);
  assert.equal(s.hand.length, 1);
});
test("Shifting Marshland removes Time and retains printed Surge when its revelation is canceled", () => {
  let s = base();
  s.heroes[0].code = "01007";
  s.hand = [make(s, "01050")];
  s.encounterDeck = [N.shifting, N.bog];
  effect(s, fx("reveal"));
  flush(s);
  s = choose(reload(s), "cancel");
  s = settle(s);
  assert.equal(s.ninEilph!.time, 3);
  assert.ok(s.staging.some((u) => u.code === N.bog));
  s = base();
  ninEncounter(s, N.shifting);
  s = settle(s);
  assert.equal(s.ninEilph!.time, 2);
});
test("Sinking Bog shadows penalize each defender only for the current attack", () => {
  const s = base(),
    e = enemy(s),
    h = s.heroes[0];
  attach(s, h, "01042");
  attach(s, h, "01057");
  s.combat = { enemyId: e.id, attackBonus: 0, defenderId: h.id };
  const before = stats(s, h).defense;
  ninShadow(s, N.bog);
  assert.equal(stats(s, h).defense, Math.max(0, before - 2));
  reload(s);
  s.combat = null;
  assert.equal(stats(s, h).defense, before);
});
test("Fen shadows use current Time and Neekerbreeker shadows deal direct damage before the attack", () => {
  let s = base(),
    e = enemy(s),
    h = s.heroes[0];
  s.combat = { enemyId: e.id, attackBonus: 0, defenderId: h.id };
  s.ninEilph!.time = 5;
  ninShadow(s, N.reeds);
  assert.equal(s.combat.attackBonus, 5);
  ninShadow(s, N.neeker);
  s = settle(s);
  assert.equal(s.heroes[0].damage, 1);
});
test("Finger’s shadow removes quest progress only after actual attack destruction", () => {
  let s = base(1, N.impassable);
  s.progress = 7;
  const a = make(s, "01013");
  s.allies.push(a);
  const e = enemy(s);
  s.encounterDeck = [N.finger];
  effect(s, fx("immediateAttack", { target: e.id }));
  flush(s);
  s = choose(reload(s), a.id);
  s = settle(s);
  assert.equal(get(s, a.id), undefined);
  assert.equal(s.progress, 0);
});
test("Saved parallel identities, physical boss and shadow penalties reject malformed state", () => {
  const s = base();
  assert.ok(validateSave(s));
  for (const change of [
    (s: GameState) => (s.ninEilph!.activeQuest = N.impassable),
    (s: GameState) => (s.ninEilph!.time = -1),
    (s: GameState) => (s.ninEilph!.setupLocations = [N.bog, N.bog]),
    (s: GameState) => s.ninEilph!.setAside.push(make(s, N.dweller)),
  ]) {
    const bad = structuredClone(s);
    change(bad);
    assert.equal(validateSave(bad), false);
  }
  assert.equal(publicState(s).currentQuest, N.noEnd);
  assert.equal(publicState(s).questTime, 3);
});
test("No End in Sight disables draw-only events and draw-only hero actions before costs are paid", () => {
  let s = base();
  s.heroes[0].code = "01012";
  s.hand = [make(s, "01064"), make(s, "04108"), make(s, "04129")];
  for (const u of s.hand) {
    assert.match(canPlay(s, u)!, /No End in Sight/);
    assert.equal(canPay(s, card(u.code)), false);
  }
  assert.throws(
    () => applyAction(reload(s), { type: "ABILITY", id: s.heroes[0].id }),
    /cannot draw/,
  );
  assert.equal(s.heroes[0].exhausted, false);
});
test("No End in Sight preserves Gandalf’s legal threat/damage entry choices while omitting draw", () => {
  let s = base();
  s.hand = [make(s, "01073")];
  s = applyAction(reload(s), { type: "PLAY", id: s.hand[0].id });
  assert.match(s.choice!.title, /Gandalf/);
  assert.ok(s.choice!.options.every((o) => o.id !== "draw"));
  s = choose(reload(s), "threat");
  s = settle(s);
  assert.equal(s.threat, 15);
  assert.ok(s.allies.some((u) => u.code === "01073"));
});
test("No End in Sight permits Parting Gifts transfers between resource pools", () => {
  let s = base();
  const a = s.heroes[0],
    b = s.heroes[1];
  effect(s, fx("rhosGiftsMove", { source: a.id, target: b.id, value: 3 }));
  s = settle(s);
  assert.equal(s.heroes[0].resources, 7);
  assert.equal(s.heroes[1].resources, 13);
});
test("A real Shifting Marshland shadow starts one additional attack after the current attack finishes", () => {
  let s = base();
  const a = enemy(s);
  s.encounterDeck = [N.shifting, N.dweller];
  for (const h of s.heroes) h.tempDefense = 10;
  effect(s, fx("immediateAttack", { target: a.id }));
  s = settle(s);
  assert.equal(s.heroes.filter((h) => h.exhausted).length, 2);
  assert.deepEqual(s.encounterDiscard, [N.shifting, N.dweller]);
  assert.equal(s.ninEilph!.time, 3);
});
test("A prevented final boss attack still resets Time and does not force a defender choice", () => {
  let s = base(1, N.out);
  const d = boss(s);
  d.feinted = true;
  s.ninEilph!.time = 1;
  removeQuestTime(s);
  s = settle(s);
  assert.equal(s.ninEilph!.time, 2);
  assert.ok(s.heroes.every((h) => !h.exhausted));
  assert.equal(ninDweller(s)!.resources, 1);
});
test("The last-Time effects can be ordered so the old stage expires before the Dweller gains its resource", () => {
  let s = base(1, N.impassable);
  boss(s);
  s.ninEilph!.time = 1;
  removeQuestTime(s);
  flush(s);
  assert.equal(s.choice!.options.length, 2);
  const expiry =
    s.choice!.options.find(
      (o) =>
        o.effects.some((e) =>
          e.effects?.some((x) => x.kind === "ninTimeExpired"),
        ) || o.label.includes("Lost in"),
    ) ?? s.choice!.options[1];
  s = choose(reload(s), expiry.id);
  s = settle(s);
  assert.notEqual(s.ninEilph!.activeQuest, N.impassable);
  assert.equal(ninDweller(s)!.resources, 1);
  assert.equal(s.ninEilph!.time, 3);
});
test("A defeated stage triggers The Long Defeat, unlike a Time-driven parallel change", () => {
  let s = base(1, N.weary);
  attachToQuest(s, N.weary, {
    id: "defeat-song",
    code: "10122",
    exhausted: false,
  });
  s.heroes[0].damage = 1;
  progress(s, 13);
  flush(s);
  assert.match(s.choice!.title, /Long Defeat/);
  s = settle(s);
  assert.equal(s.stage, 3);
  assert.ok(s.discard.includes("10122"));
});
test("An expired quest continuation cannot expire the newly revealed parallel card", () => {
  let s = base();
  const old = s.ninEilph!.activeQuest;
  s.ninEilph!.time = 0;
  effect(s, fx("ninTimeExpired", { code: old, value: 2 }));
  s = settle(s);
  const current = s.ninEilph!.activeQuest;
  effect(s, fx("ninTimeExpired", { code: old, value: 2 }));
  s = settle(s);
  assert.equal(s.ninEilph!.activeQuest, current);
  assert.equal(s.ninEilph!.time, 3);
});
test("No End in Sight player draw restrictions end immediately after changing to a different stage", () => {
  let s = base();
  const n = s.hand.length;
  draw(s, 2);
  assert.equal(s.hand.length, n);
  s.ninEilph!.activeQuest = N.weary;
  draw(s, 2);
  assert.equal(s.hand.length, n + 2);
  assert.equal(canGainResources(s, s.heroes[0]), true);
});
test("Sinking Bog shadow damage that does not destroy its defender leaves quest progress untouched", () => {
  let s = base(1, N.impassable);
  s.progress = 5;
  const a = enemy(s);
  s.encounterDeck = [N.finger];
  s.heroes[0].tempDefense = 10;
  effect(s, fx("immediateAttack", { target: a.id }));
  s = settle(s);
  assert.equal(s.progress, 5);
});
test("Saved combat flags and per-defender penalties reject invalid types and negative penalties", () => {
  const s = base();
  s.combat = {
    enemyId: enemy(s).id,
    attackBonus: 0,
    defenderId: s.heroes[0].id,
    ninDefensePenalties: { [s.heroes[0].id]: 1 },
    ninLoseProgressOnKill: true,
  };
  assert.ok(validateSave(s));
  const x = structuredClone(s);
  x.combat!.ninDefensePenalties![s.heroes[0].id] = -1;
  assert.equal(validateSave(x), false);
  const y = structuredClone(s);
  y.combat!.ninKilledCharacter = 1 as unknown as boolean;
  assert.equal(validateSave(y), false);
});
test("Consecutive Neekerbreeker shadows skip a defender destroyed by the first shadow and resolve the undefended attack", () => {
  let s = base();
  const a = make(s, "01013");
  a.damage = 1;
  s.allies.push(a);
  const e = enemy(s);
  e.shadows = [N.neeker, N.neeker];
  s.phase = "defense";
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: e.id,
    defenderId: a.id,
  });
  s = settle(s);
  assert.equal(s.status, "playing");
  assert.equal(get(s, a.id), undefined);
  assert.equal(s.combat, null);
  assert.equal(get(s, e.id)!.revealedShadowCount, 2);
  assert.deepEqual(get(s, e.id)!.shadows, [N.neeker, N.neeker]);
  assert.equal(s.heroes[0].damage, card(N.adder).attack);
});
test("A normal player attack defeats the engaged Dweller and wins only at the final stage", () => {
  let s = base(1, N.out);
  const d = boss(s);
  s.staging = s.staging.filter((u) => u.id !== d.id);
  s.engaged.push(d);
  s.phase = "attack";
  s.heroes[0].tempAttack = 20;
  s = applyAction(reload(s), {
    type: "ATTACK",
    enemyId: d.id,
    attackerIds: [s.heroes[0].id],
  });
  s = settle(s);
  assert.equal(s.status, "won");
  assert.ok(s.victoryCards!.includes(N.dweller));
});
