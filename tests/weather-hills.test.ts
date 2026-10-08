import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { applyAction, canTravel, validateSave } from "../src/game/engine";
import { card, imageUrl, SCRIPTED } from "../src/game/cards";
import { get, make, fx, stats, threatOf, stageInfo } from "../src/game/core";
import {
  check,
  damage,
  destroy,
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
  forOwner,
  playerOrder,
  seatView,
  startPhase,
} from "../src/game/table";
import { currentQuestCode, currentQuestUnit } from "../src/game/quest-state";
import {
  addCurrentQuestProgress,
  sideQuestStart,
} from "../src/game/side-quests";
import { effectiveKeyword, hasTrait } from "../src/game/expansion-passives";
import { syncAttachmentText } from "../src/game/attachment-text";
import { automatedScenarioId } from "../src/game/support";
import { CHETWOOD as C } from "../src/game/chetwood-support";
import {
  WEATHER as W,
  WEATHER_ENCOUNTERS,
  WEATHER_QUESTS,
  WEATHER_RECIPES,
} from "../src/game/weather-hills-support";
import { base, start, choose, reload, settle } from "./weather-hills-fixtures";
import type { GameState, Unit } from "../src/game/types";

function finish(s: GameState) {
  flush(s);
  return settle(s);
}
function mission(s: GameState) {
  return s.staging.find((u) => u.code === W.mission)!;
}
function side(s: GameState, code: string) {
  placeEncounter(s, code, false, 0, undefined, true);
  return [...s.staging].reverse().find((u) => u.code === code)!;
}
function select(s: GameState, u: Unit) {
  s.phase = "quest";
  sideQuestStart(s);
  flush(s);
  return choose(s, u.id);
}
function staged(s: GameState, code: string) {
  const u = make(s, code);
  s.staging.push(u);
  return u;
}
function enemy(s: GameState, code = C.orc, player?: number) {
  const u = make(s, code);
  if (player === undefined) s.staging.push(u);
  else forOwner(s, player, () => s.engaged.push(u));
  return u;
}
function ally(s: GameState, code = "01016", player = 0) {
  const u = make(s, code);
  forOwner(s, player, () => s.allies.push(u));
  return u;
}
function second(s: GameState, tokens = 5) {
  s.stage = 2;
  mission(s).flipped = true;
  mission(s).resources = tokens;
  s.weatherHills!.orcDeck = [];
  s.weatherHills!.setAside = [];
  return s;
}
function effectOption(s: GameState, kind: string) {
  const o = s.choice!.options.find((o) =>
    o.effects.some((e) => e.kind === kind),
  );
  assert.ok(o, JSON.stringify(s.choice));
  return o;
}
function targetOption(s: GameState, id: string, n?: number) {
  const o = s.choice!.options.find(
    (o) =>
      o.id === id ||
      (n !== undefined && o.id === `${id}:${n}`) ||
      o.effects.some(
        (e) =>
          e.target === id &&
          (n === undefined || e.value === n || e.count === n),
      ),
  );
  assert.ok(o, JSON.stringify(s.choice));
  return o;
}
function respond(s: GameState) {
  const o = s.choice!.options.find((o) => o.id !== "skip" && o.effects.length);
  assert.ok(o, JSON.stringify(s.choice));
  return choose(reload(s), o.id);
}
function defend(s: GameState, e: Unit, d: Unit, shadows: string[] = []) {
  s.phase = "defense";
  e.shadows = shadows;
  return applyAction(reload(s), {
    type: "DEFEND",
    enemyId: e.id,
    defenderId: d.id,
  });
}
function allocated(s: GameState, u: Unit, n: number) {
  return choose(reload(s), targetOption(s, u.id, n).id);
}

// Original faces are the authority: catalog inserted an extra Hunt advance and a Cold "Then",
// and mistranscribed Amon Forn as Ford. See docs/INTRUDERS-CHETWOOD-IMPORT.md and local card faces.
test("Weather Hills registers original encounters, both quest stages and authoritative corrected text", () => {
  assert.equal(WEATHER_QUESTS.length, 2);
  for (const c of [...WEATHER_ENCOUNTERS, ...WEATHER_QUESTS]) {
    assert.ok(SCRIPTED.has(c.code));
    for (const path of [imageUrl(c), c.back_imagesrc].filter(Boolean))
      assert.ok(existsSync(`public${path}`));
  }
  assert.equal(card(W.animals).back_quest, 20);
  assert.equal(card(W.scattered).back_quest ?? 0, 0);
  assert.equal(card(W.forn).is_unique, true);
  assert.doesNotMatch(card(W.mission).text!, /advance to stage/i);
  assert.match(card(W.mission).back_text!, /advance to stage 2A/);
  assert.doesNotMatch(card(W.cold).text!, /Then, attach/i);
  assert.match(card(W.scattered).text!, /Amon Forn/);
  assert.match(card(W.animals).text!, /Amon Forn/);
  for (const r of WEATHER_RECIPES)
    assert.equal(automatedScenarioId(r), "the-weather-hills");
  assert.equal(
    automatedScenarioId({ name: "The Weather Hills", mode: "nightmare" }),
    null,
  );
  assert.equal(
    automatedScenarioId({
      name: "The Weather Hills (Campaign)",
      mode: "campaign",
    }),
    null,
  );
});
for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`Weather Hills real ${easy ? "easy" : "standard"} setup retains all recipe zones for ${players} players`, () => {
      const s = start(players, easy),
        q = s.weatherHills!;
      assert.equal(s.phase, "resource");
      assert.equal(s.stage, 1);
      assert.equal(q.initialized, true);
      assert.equal(s.encounterDeck.length, easy ? 24 : 31);
      assert.equal(q.orcDeck.length, easy ? 9 : 11);
      assert.deepEqual(
        q.setAside.map((u) => u.code).sort(),
        [C.ambush, W.forn].sort(),
      );
      assert.equal(s.activeLocation!.code, W.ridge);
      assert.deepEqual(
        s.staging.map((u) => u.code).sort(),
        [W.mission, W.hilltop].sort(),
      );
      assert.equal(mission(s).resources, 0);
      assert.ok(!mission(s).flipped);
      assert.equal(stageInfo(s).questImage, card(W.scattered).back_imagesrc);
      const source = WEATHER_RECIPES.find(
        (r) => r.mode === (easy ? "easy" : "standard"),
      )!;
      const expected = (section: string) =>
        source.cards
          .filter((r) => r.section === section)
          .flatMap((r) => Array<string>(r.quantity).fill(r.code))
          .sort();
      assert.deepEqual(
        [...s.encounterDeck].sort(),
        expected("sharedEncounterDeck"),
      );
      assert.deepEqual([...q.orcDeck].sort(), expected("sharedEncounterDeck2"));
      assert.deepEqual(
        q.setAside.map((u) => u.code).sort(),
        expected("sharedSetAside"),
      );
      assert.ok(validateSave(s));
    });
test("Hunting counts any defeated enemy and never advances through ordinary main-quest progress", () => {
  let s = base();
  progress(s, 80);
  check(s);
  assert.equal(s.stage, 1);
  assert.equal(s.status, "playing");
  const e = enemy(s, "01096");
  destroy(s, e);
  s = finish(s);
  assert.equal(mission(s).resources, 1);
  assert.equal(s.stage, 1);
});
test("discarding an enemy without defeating it never awards a Hunting resource", () => {
  let s = base();
  const e = enemy(s);
  discardCharacter(s, e);
  s = finish(s);
  assert.equal(mission(s).resources, 0);
});
for (const players of [1, 2, 3, 4])
  test(`Hunting threshold is three plus ${players} players and transfers every token`, () => {
    let s = base(players);
    mission(s).resources = players + 2;
    s.phase = "attack";
    for (const p of playerOrder(s)) forOwner(s, p, () => (s.deck = ["01057"]));
    s.weatherHills!.orcDeck = [W.orcCamp];
    s.encounterDeck = [C.orc, C.orc, C.orc, C.orc];
    const e = enemy(s, C.orc, 0);
    destroy(s, e);
    s = finish(s);
    assert.equal(s.stage, 2);
    assert.equal(mission(s).flipped, true);
    assert.equal(mission(s).resources, players + 3);
    assert.equal(s.weatherHills!.orcDeck.length, 0);
    assert.equal(s.weatherHills!.setAside.length, 0);
    assert.ok(s.staging.some((u) => u.code === W.forn));
    assert.ok(s.staging.some((u) => u.code === C.ambush));
    assert.equal(allEngaged(s).length, players);
    assert.equal(s.phase, "refresh", "stage 2A ends the attack phase");
    assert.ok(validateSave(s));
  });
test("Orc-camp's optional resource Response never flips Hunting on its own and can replenish Savage", () => {
  let s = base();
  mission(s).resources = 3;
  const camp = make(s, W.orcCamp);
  s.activeLocation = camp;
  progressLocation(s, camp, 2);
  flush(s);
  s = respond(s);
  s = finish(s);
  assert.equal(mission(s).resources, 4);
  assert.equal(s.stage, 1);
  assert.ok(!mission(s).flipped);
  s.phase = "attack";
  destroy(s, enemy(s, C.orc));
  s = finish(s);
  assert.equal(s.stage, 2);
  assert.equal(mission(s).resources, 5);
  s = second(base(), 2);
  const again = make(s, W.orcCamp);
  s.activeLocation = again;
  progressLocation(s, again, 2);
  flush(s);
  s = respond(s);
  s = finish(s);
  assert.equal(mission(s).resources, 3);
});
test("Hunting flip merges the encounter discard and remaining Orc deck once, retaining physical set-aside ids", () => {
  let s = base();
  s.phase = "attack";
  mission(s).resources = 4;
  const setIds = s.weatherHills!.setAside.map((u) => u.id);
  s.weatherHills!.orcDeck = [W.orcCamp, C.marauder];
  s.encounterDeck = [W.ridge];
  s.encounterDiscard = [W.ice, C.orc];
  s.phase = "attack";
  destroy(s, enemy(s, C.orc));
  s = finish(s);
  assert.equal(s.stage, 2);
  assert.equal(mission(s).resources, 5);
  assert.ok(s.staging.some((u) => u.code === W.forn && setIds.includes(u.id)));
  assert.ok(
    s.staging.some((u) => u.code === C.ambush && setIds.includes(u.id)),
  );
  const physical = [
    ...s.encounterDeck,
    ...s.encounterDiscard,
    ...allEngaged(s).map((u) => u.code),
    ...s.staging
      .filter(
        (u) => u.code !== W.mission && u.code !== W.forn && u.code !== C.ambush,
      )
      .map((u) => u.code),
  ];
  assert.deepEqual(
    physical.sort(),
    [W.orcCamp, C.marauder, W.ridge, W.ice, C.orc, C.orc].sort(),
  );
  assert.equal(s.weatherHills!.orcDeck.length, 0);
});
test("Stage 2 victory waits for Amon Forn, then accepts twenty main-quest progress", () => {
  let s = second(base());
  const forn = staged(s, W.forn);
  progress(s, 20);
  s = finish(s);
  check(s);
  assert.equal(s.status, "playing");
  assert.equal(s.progress, 20);
  s.activeLocation = forn;
  s.staging = s.staging.filter((u) => u.id !== forn.id);
  progress(s, 6, false, true);
  s = finish(s);
  check(s);
  assert.equal(s.status, "won");
  assert.ok(s.victoryCards?.includes(W.forn));
  assert.equal(s.victory, 3);
});
test("Savage loses as soon as its last resource disappears and normal enemy defeats do not refill it", () => {
  let s = second(base(), 2);
  destroy(s, enemy(s));
  s = finish(s);
  assert.equal(mission(s).resources, 2);
  mission(s).resources = 0;
  check(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Savage|resource|counter/i);
});
for (const players of [1, 2, 3, 4])
  test(`Only active-location exploration reveals ${players >= 3 ? 2 : 1} Orc-deck cards for ${players} players`, () => {
    let s = base(players);
    s.weatherHills!.orcDeck = [C.marauder, C.captain, W.orcCamp];
    const loc = make(s, W.ridge);
    s.activeLocation = loc;
    progressLocation(s, loc, 3);
    s = finish(s);
    assert.equal(s.weatherHills!.orcDeck.length, players >= 3 ? 1 : 2);
    assert.equal(
      s.staging.filter((u) => [C.marauder, C.captain].includes(u.code)).length,
      players >= 3 ? 2 : 1,
    );
    s = base(players);
    s.weatherHills!.orcDeck = [C.marauder];
    const stagedLoc = staged(s, W.ridge);
    progressLocation(s, stagedLoc, 3);
    s = finish(s);
    assert.deepEqual(s.weatherHills!.orcDeck, [C.marauder]);
  });
test("An empty Orc deck is ignored without touching or reshuffling encounter discard", () => {
  let s = base(4);
  s.encounterDiscard = [C.marauder];
  const loc = make(s, W.ridge);
  s.activeLocation = loc;
  progressLocation(s, loc, 3);
  s = finish(s);
  assert.deepEqual(s.weatherHills!.orcDeck, []);
  assert.equal(s.staging.filter((u) => u.code === C.marauder).length, 0);
  assert.ok(s.encounterDiscard.includes(C.marauder));
});
test("Orc-deck reveals resolve Angmar Orc's when-revealed choice and then discard to the normal pile", () => {
  let s = base();
  const a = ally(s);
  s.weatherHills!.orcDeck = [C.orc];
  const loc = make(s, W.ridge);
  s.activeLocation = loc;
  progressLocation(s, loc, 3);
  flush(s);
  assert.ok(s.choice);
  s = choose(reload(s), a.id);
  s = finish(s);
  const orc = s.staging.find((u) => u.code === C.orc)!;
  assert.ok(orc);
  assert.ok(!get(s, a.id));
  destroy(s, orc);
  s = finish(s);
  assert.ok(s.encounterDiscard.includes(C.orc));
  assert.deepEqual(s.weatherHills!.orcDeck, []);
});
test("Only the first Weather treachery each round surges, even if its when-revealed effect is canceled", () => {
  let s = base();
  const hill = staged(s, W.hilltop);
  s.hand.push(make(s, "01050"));
  s.heroes[2] = make(s, "01008");
  s.heroes[2].resources = 10;
  s.encounterDeck = [W.ridge, W.valley];
  revealed(s, W.blast);
  flush(s);
  const cancel = s.choice!.options.find((o) => o.code === "01050")!;
  assert.ok(cancel);
  s = choose(reload(s), cancel.id);
  s = finish(s);
  assert.equal(s.encounterDeck.length, 1);
  assert.equal(get(s, hill.id)!.resources, 1);
  assert.equal(threatOf(s, get(s, hill.id)!), 2);
  s.heroes.find((h) => h.code === "01008")!.exhausted = true;
  revealed(s, W.blast);
  s = finish(s);
  assert.equal(s.encounterDeck.length, 1);
  assert.equal(get(s, hill.id)!.resources, 2);
  s.round++;
  revealed(s, W.blast);
  s = finish(s);
  assert.equal(s.encounterDeck.length, 0);
  assert.equal(get(s, hill.id)!.resources, 3);
});
test("Stage 2 never grants the stage-1 Weather surge but Hilltop still gains resources", () => {
  let s = second(base());
  const hill = staged(s, W.hilltop);
  s.encounterDeck = [W.ridge];
  revealed(s, W.blast);
  s = finish(s);
  assert.equal(s.encounterDeck.length, 1);
  assert.equal(get(s, hill.id)!.resources, 1);
});
test("Ruins of Arnor reacts per in-play copy only to treachery when-revealed cancellation", () => {
  let s = base(2);
  staged(s, W.ruins);
  const loc = make(s, W.ruins);
  s.activeLocation = loc;
  forOwner(s, 1, () => {
    s.hand.push(make(s, "01050"));
    s.heroes[2] = make(s, "01008");
    s.heroes[2].resources = 10;
  });
  const before = playerOrder(s).map((p) => seatView(s, p).threat);
  s.encounterDeck = [W.ridge];
  revealed(s, W.ice);
  flush(s);
  const cancel = s.choice!.options.find((o) => o.code === "01050")!;
  s = choose(reload(s), cancel.id);
  s = finish(s);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    before.map((n) => n + 4),
  );
  assert.equal(
    allCharacters(s).reduce((n, u) => n + u.damage, 0),
    0,
  );
});
test("Ice Storm assigns each player one damage per main/side quest, then exhausts every already damaged character", () => {
  let s = second(base(2));
  side(s, W.camp);
  side(s, W.search);
  const ids = playerOrder(s).map((p) => seatView(s, p).heroes[0].id);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.heroes[1].damage = 1;
      s.heroes[1].exhausted = false;
    });
  revealed(s, W.ice);
  flush(s);
  s = allocated(s, get(s, ids[0])!, 3);
  s = allocated(s, get(s, ids[1])!, 3);
  s = finish(s);
  for (const p of playerOrder(s)) {
    assert.equal(seatView(s, p).heroes[0].damage, 3);
    assert.equal(seatView(s, p).heroes[0].exhausted, true);
    assert.equal(seatView(s, p).heroes[1].damage, 1);
    assert.equal(seatView(s, p).heroes[1].exhausted, true);
    assert.equal(seatView(s, p).heroes[2].exhausted, false);
  }
});
test("Biting Wind assigns one shared pool among committed characters across players without overassigning HP", () => {
  let s = second(base(2));
  const h0 = s.heroes[0],
    h1 = seatView(s, 1).heroes[0];
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      for (const h of s.heroes) {
        h.committed = true;
        s.committedIds.push(h.id);
      }
    });
  revealed(s, W.wind);
  flush(s);
  assert.ok(
    !s.choice!.options.some(
      (o) =>
        o.id.startsWith(`${h0.id}:`) &&
        Number(o.id.split(":").at(-1)) > stats(s, h0).health - h0.damage,
    ),
  );
  s = allocated(s, h0, 4);
  s = allocated(s, get(s, h1.id)!, 2);
  s = finish(s);
  assert.equal(get(s, h0.id)!.damage, 4);
  assert.equal(get(s, h1.id)!.damage, 2);
  assert.equal(
    allCharacters(s).reduce((n, u) => n + u.damage, 0),
    6,
  );
});
test("Freezing Blast removes exactly the damaged questers and keeps Doomed 2 when canceled", () => {
  let s = second(base(2));
  const damaged = s.heroes[0],
    healthy = s.heroes[1];
  damaged.damage = 1;
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      for (const h of s.heroes) {
        h.committed = true;
        s.committedIds.push(h.id);
      }
    });
  revealed(s, W.blast);
  s = finish(s);
  assert.equal(get(s, damaged.id)!.committed, false);
  assert.equal(get(s, healthy.id)!.committed, true);
  assert.ok(!s.committedIds.includes(damaged.id));
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    [22, 22],
  );
  s = second(base());
  s.hand.push(make(s, "01050"));
  s.heroes[2] = make(s, "01008");
  s.heroes[2].resources = 10;
  s.heroes[0].damage = 1;
  s.heroes[0].committed = true;
  s.committedIds = [s.heroes[0].id];
  revealed(s, W.blast);
  flush(s);
  s = choose(reload(s), s.choice!.options.find((o) => o.code === "01050")!.id);
  s = finish(s);
  assert.equal(s.heroes[0].committed, true);
  assert.equal(s.threat, 22);
});

test("Cold from Angmar damages each player's chosen hero and attaches to the physical current side quest", () => {
  let s = second(base(2));
  const q = side(s, W.camp);
  s = select(s, q);
  const ids = playerOrder(s).map((p) => seatView(s, p).heroes[0].id);
  revealed(s, W.cold);
  flush(s);
  s = allocated(s, get(s, ids[0])!, 1);
  s = allocated(s, get(s, ids[1])!, 1);
  s = finish(s);
  assert.equal(currentQuestCode(s), W.camp);
  assert.equal(
    currentQuestUnit(s)!.attachments.filter((a) => a.code === W.cold).length,
    1,
  );
  for (const id of ids) assert.equal(get(s, id)!.damage, 1);
  assert.ok(!s.encounterDiscard.includes(W.cold));
  assert.ok(validateSave(s));
  addCurrentQuestProgress(s, 6);
  s = finish(s);
  assert.ok(s.encounterDiscard.includes(W.cold));
  syncAttachmentText(s);
  for (const id of ids) assert.ok(!get(s, id)!.blanked);
});
test("Cold attaches even when every chosen hero prevents its damage; its original face has no Then", () => {
  let s = second(base());
  for (const h of s.heroes) h.roundCannotTakeDamage = true;
  revealed(s, W.cold);
  s = finish(s);
  assert.equal(
    allCharacters(s).reduce((n, u) => n + u.damage, 0),
    0,
  );
  assert.equal(
    currentQuestUnit(s)!.attachments.filter((a) => a.code === W.cold).length,
    1,
  );
});
test("Cold's continuous blanking preserves printed Traits, keywords and attachment bonuses and ends on healing/removal", () => {
  const s = second(base());
  const gimli = make(s, "01004");
  s.heroes[0] = gimli;
  gimli.damage = 2;
  gimli.attachments.push({
    id: `a${s.nextId++}`,
    code: "01041",
    owner: 0,
    exhausted: false,
  });
  const sentinel = ally(s, "143004");
  sentinel.damage = 1;
  const cold = { id: `a${s.nextId++}`, code: W.cold, exhausted: false };
  s.questAttachments = { [W.animals]: [cold] };
  syncAttachmentText(s);
  assert.equal(gimli.blanked, true);
  assert.equal(stats(s, gimli).attack, card(gimli.code).attack! + 2);
  assert.ok(hasTrait(gimli, "Dwarf"));
  assert.ok(effectiveKeyword(sentinel, "Sentinel"));
  const q = side(s, W.camp);
  assert.equal(
    sentinel.blanked,
    true,
    "blanking is active even when another quest is current",
  );
  s.phase = "quest";
  s.sideQuestSelections = { shared: { id: q.id, code: q.code } };
  syncAttachmentText(s);
  assert.equal(gimli.blanked, true);
  // The constant effect follows current damage, rather than the damage at reveal time.
  gimli.damage = 0;
  syncAttachmentText(s);
  assert.ok(!gimli.blanked);
  gimli.damage = 1;
  syncAttachmentText(s);
  assert.equal(gimli.blanked, true);
  handle(
    s,
    fx("discardAttachment", { target: `quest:${W.animals}`, source: cold.id }),
  );
  syncAttachmentText(s);
  assert.ok(!gimli.blanked);
  assert.equal(stats(s, gimli).attack, card(gimli.code).attack! + 3);
});
test("Cold does not grant immunity to characters and a damaged character still retains an attachment's readying ability", () => {
  let s = second(base());
  s.heroes[0].damage = 1;
  s.questAttachments = {
    [W.animals]: [{ id: `a${s.nextId++}`, code: W.cold, exhausted: false }],
  };
  const a = { id: `a${s.nextId++}`, code: "01057", owner: 0, exhausted: false };
  s.heroes[0].attachments.push(a);
  s.heroes[0].exhausted = true;
  syncAttachmentText(s);
  assert.equal(s.heroes[0].blanked, true);
  s = applyAction(reload(s), {
    type: "ABILITY",
    id: s.heroes[0].id,
    attachmentId: a.id,
  });
  assert.equal(s.heroes[0].exhausted, false);
  assert.equal(
    s.heroes[0].attachments.find((x) => x.id === a.id)!.exhausted,
    true,
  );
});
test("Tragic Discovery raises all threat by the actual active Hilltop threat, including its resources", () => {
  let s = second(base(2));
  const loc = make(s, W.hilltop);
  loc.resources = 4;
  s.activeLocation = loc;
  revealed(s, W.discovery);
  s = finish(s);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    [25, 25],
  );
  s.activeLocation = null;
  revealed(s, W.discovery);
  s = finish(s);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    [25, 25],
  );
});
test("Make Camp prevents all healing while in play and its optional defeated Response heals one hero per player", () => {
  let s = second(base(2));
  const q = side(s, W.camp);
  const ids = playerOrder(s).map((p) => seatView(s, p).heroes[0].id);
  for (const id of ids) get(s, id)!.damage = 3;
  handle(s, fx("heal", { target: ids[0], value: 3 }));
  assert.equal(get(s, ids[0])!.damage, 3);
  s = select(s, q);
  addCurrentQuestProgress(s, 6);
  flush(s);
  s = respond(s);
  s = choose(reload(s), targetOption(s, ids[0], 3).id);
  s = choose(reload(s), targetOption(s, ids[1], 3).id);
  s = finish(s);
  assert.equal(get(s, ids[0])!.damage, 0);
  assert.equal(get(s, ids[1])!.damage, 0);
  assert.ok(s.victoryCards?.includes(W.camp));
});
test("Make Camp's healing Response can be passed, and defeating it permits ordinary healing afterwards", () => {
  let s = second(base());
  const q = side(s, W.camp);
  s.heroes[0].damage = 2;
  s = select(s, q);
  addCurrentQuestProgress(s, 6);
  flush(s);
  s = choose(reload(s), "skip");
  assert.equal(s.heroes[0].damage, 2);
  handle(s, fx("heal", { target: s.heroes[0].id, value: 2 }));
  assert.equal(s.heroes[0].damage, 0);
});
test("Search the Ruins raises each player's threat at refresh end and offers optional reduction on defeat", () => {
  let s = second(base(2));
  const q = side(s, W.search);
  s.phase = "refresh";
  handle(s, fx("phaseEnd"));
  s = finish(s);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    [22, 22],
  );
  s = select(s, get(s, q.id)!);
  addCurrentQuestProgress(s, 8);
  flush(s);
  s = respond(s);
  s = finish(s);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    [19, 19],
  );
  assert.ok(s.victoryCards?.includes(W.search));
});
test("Search the Ruins' defeated reduction is a Response that can be passed", () => {
  let s = second(base());
  const q = side(s, W.search);
  s = select(s, q);
  addCurrentQuestProgress(s, 8);
  flush(s);
  s = choose(reload(s), "skip");
  assert.equal(s.threat, 20);
});
test("Find Shelter enters with four Time, expires while main quest is current, deals four to a chosen hero and resets to four", () => {
  let s = second(base(2));
  const q = side(s, W.shelter);
  assert.equal(q.timeCounters, 4);
  q.timeCounters = 1;
  for (const p of playerOrder(s))
    forOwner(s, p, () =>
      s.heroes[0].attachments.push({
        id: `a${s.nextId++}`,
        code: "01040",
        owner: p,
        exhausted: false,
      }),
    );
  const ids = playerOrder(s).map((p) => seatView(s, p).heroes[0].id);
  s.phase = "refresh";
  handle(s, fx("phaseEnd"));
  flush(s);
  s = allocated(s, get(s, ids[0])!, 4);
  s = allocated(s, get(s, ids[1])!, 4);
  s = finish(s);
  for (const id of ids) assert.equal(get(s, id)!.damage, 4);
  assert.equal(get(s, q.id)!.timeCounters, 4);
  s.phase = "refresh";
  handle(s, fx("phaseEnd"));
  s = finish(s);
  assert.equal(get(s, q.id)!.timeCounters, 3);
});
test("Exposed Ridge only damages each player's own character while active and resolves at refresh end", () => {
  let s = second(base(2));
  const loc = make(s, W.ridge);
  s.activeLocation = loc;
  const ids = playerOrder(s).map((p) => seatView(s, p).heroes[0].id);
  s.phase = "refresh";
  handle(s, fx("phaseEnd"));
  flush(s);
  assert.ok(
    s.choice!.options.every((o) => !o.effects.some((e) => e.target === ids[1])),
  );
  s = allocated(s, get(s, ids[0])!, 1);
  s = allocated(s, get(s, ids[1])!, 1);
  s = finish(s);
  for (const id of ids) assert.equal(get(s, id)!.damage, 1);
  s.activeLocation = null;
  s.staging.push(loc);
  s.phase = "refresh";
  handle(s, fx("phaseEnd"));
  s = finish(s);
  for (const id of ids) assert.equal(get(s, id)!.damage, 1);
});
for (const active of [false, true])
  test(`Ancient Causeway's mandatory explored threat applies in ${active ? "active slot" : "staging"}`, () => {
    let s = second(base(2));
    const loc = make(s, W.causeway);
    if (active) s.activeLocation = loc;
    else s.staging.push(loc);
    progressLocation(s, loc, 2);
    s = finish(s);
    assert.deepEqual(
      playerOrder(s).map((p) => seatView(s, p).threat),
      [22, 22],
    );
  });
test("Sheltered Valley requires a Mission token to travel, spends it and heals any player's character only when active", () => {
  let s = second(base(2), 3);
  const loc = staged(s, W.valley);
  s.phase = "travel";
  assert.equal(canTravel(s, loc), null);
  s = applyAction(reload(s), { type: "TRAVEL", id: loc.id });
  s = finish(s);
  assert.equal(mission(s).resources, 2);
  assert.equal(s.activeLocation!.id, loc.id);
  const other = seatView(s, 1).heroes[0];
  other.damage = 3;
  progressLocation(s, s.activeLocation!, 4);
  flush(s);
  s = choose(reload(s), targetOption(s, other.id).id);
  s = finish(s);
  assert.equal(get(s, other.id)!.damage, 0);
  s = base();
  const noToken = staged(s, W.valley);
  s.phase = "travel";
  assert.match(canTravel(s, noToken)!, /resource|token/i);
});
test("Sheltered Valley's travel cost can remove Savage's last token and immediately lose", () => {
  let s = second(base(), 1);
  const loc = staged(s, W.valley);
  s.phase = "travel";
  s = applyAction(reload(s), { type: "TRAVEL", id: loc.id });
  assert.equal(s.status, "lost");
  assert.equal(mission(s).resources, 0);
});
test("Sheltered Valley explored from staging offers no healing Response", () => {
  let s = second(base());
  s.heroes[0].damage = 2;
  const loc = staged(s, W.valley);
  progressLocation(s, loc, 4);
  s = finish(s);
  assert.equal(s.heroes[0].damage, 2);
  assert.equal(s.choice, null);
});
test("Concealed Orc-camp travel searches only normal encounter zones, puts a physical Orc engaged without its when-revealed effect", () => {
  let s = base(2);
  s.table!.first = 1;
  const loc = staged(s, W.orcCamp);
  s.phase = "travel";
  s.encounterDeck = [C.orc, W.ridge];
  s.encounterDiscard = [C.captain];
  s.weatherHills!.orcDeck = [C.marauder];
  const a = ally(s, "01016", 1);
  s = applyAction(reload(s), { type: "TRAVEL", id: loc.id });
  assert.ok(s.choice!.options.every((o) => o.code !== C.marauder));
  const selected = s.choice!.options.find((o) => o.code === C.orc)!;
  assert.ok(selected);
  s = choose(reload(s), selected.id);
  s = finish(s);
  assert.ok(seatView(s, 1).engaged.some((u) => u.code === C.orc));
  assert.ok(get(s, a.id));
  assert.equal(s.activeLocation!.id, loc.id);
  assert.deepEqual(s.weatherHills!.orcDeck, [C.marauder]);
  assert.deepEqual([...s.encounterDeck], [W.ridge]);
});
test("Concealed Orc-camp travel selecting Cornered Orc still triggers its engagement attack", () => {
  let s = second(base());
  const loc = staged(s, W.orcCamp);
  s.phase = "travel";
  s.encounterDeck = [W.cornered, W.ridge];
  s = applyAction(reload(s), { type: "TRAVEL", id: loc.id });
  s = choose(
    reload(s),
    s.choice!.options.find((o) => o.code === W.cornered)!.id,
  );
  assert.ok(s.combat);
  assert.match(s.choice!.title, /attack|defend/i);
  assert.equal(s.combat!.attackPlayer ?? 0, 0);
  s = choose(reload(s), s.heroes[0].id);
  s = finish(s);
  assert.equal(s.activeLocation!.id, loc.id);
});
test("Amon Forn blocks player progress and makes freshly staged Orcs attack the first player only while active", () => {
  let s = second(base(2));
  s.table!.first = 1;
  const loc = make(s, W.forn);
  s.activeLocation = loc;
  progress(s, 6, true);
  assert.equal(s.activeLocation!.progress, 0);
  revealed(s, C.marauder);
  flush(s);
  assert.ok(s.combat);
  assert.equal(s.combat!.attackPlayer, 1);
  s = choose(reload(s), seatView(s, 1).heroes[0].id);
  s = finish(s);
  assert.ok(s.staging.some((u) => u.code === C.marauder));
  assert.equal(seatView(s, 0).heroes[0].damage, 0);
  s = second(base());
  staged(s, W.forn);
  revealed(s, C.marauder);
  s = finish(s);
  assert.equal(s.combat, null);
});
test("Cornered Orc's immediate engagement attack does not replace its normal combat attack", () => {
  let s = second(base());
  const e = enemy(s, W.cornered);
  engage(s, e);
  flush(s);
  assert.ok(s.combat);
  assert.match(s.choice!.title, /attack|defend/i);
  s = choose(reload(s), s.heroes[0].id);
  s = finish(s);
  assert.equal(get(s, e.id)!.attacked, false);
  s.heroes[1].tempDefense = 10;
  s = finish(defend(s, get(s, e.id)!, s.heroes[1]));
  assert.equal(s.phase, "attack");
  assert.equal(get(s, s.heroes[1].id)!.exhausted, true);
});

test("Stage 2 damages reduce every damaged character's willpower exactly once, even during side questing", () => {
  let s = second(base());
  const h = s.heroes[0];
  const before = stats(s, h).will;
  h.damage = 1;
  assert.equal(stats(s, h).will, Math.max(0, before - 1));
  h.damage = 3;
  assert.equal(stats(s, h).will, Math.max(0, before - 1));
  const q = side(s, W.camp);
  s = select(s, q);
  assert.equal(stats(s, get(s, h.id)!).will, Math.max(0, before - 1));
  get(s, h.id)!.damage = 0;
  assert.equal(stats(s, get(s, h.id)!).will, before);
});
for (const option of ["token", "reveal"])
  test(`Cornered Animals' quest-start choice ${option} affects this phase once`, () => {
    let s = second(base(2), 4);
    s.phase = "planning";
    handle(s, fx("startQuest"));
    flush(s);
    assert.match(s.choice!.title, /Cornered Animals/);
    s = choose(reload(s), option);
    assert.equal(mission(s).resources, option === "token" ? 3 : 4);
    assert.equal(
      s.encounterDeck.length,
      30,
      "additional encounter is revealed during staging, not at quest start",
    );
    const bonus = s.used.includes("phase:weather-additional-reveal");
    assert.equal(bonus, option === "reveal");
    handle(s, fx("phaseEnd"));
    startPhase(s, "travel");
    assert.ok(!s.used.includes("phase:weather-additional-reveal"));
  });
test("Cornered Animals' resource option loses immediately if it spends Savage's last token", () => {
  let s = second(base(), 1);
  s.phase = "planning";
  handle(s, fx("startQuest"));
  flush(s);
  s = choose(reload(s), "token");
  assert.equal(s.status, "lost");
  assert.equal(mission(s).resources, 0);
});
test("Savage only loses resources from enemy combat destruction, including hero victims; unrelated damage does not count", () => {
  let s = second(base(), 4);
  const harmless = ally(s);
  damage(s, harmless.id, 1);
  s = finish(s);
  assert.equal(mission(s).resources, 4);
  const e = enemy(s, W.cornered, 0),
    victim = ally(s);
  s = finish(defend(s, e, victim));
  assert.equal(mission(s).resources, 3);
  s = second(base(), 4);
  const h = s.heroes[0];
  h.damage = card(h.code).health! - 1;
  const attacker = enemy(s, C.captain, 0);
  s = finish(defend(s, attacker, h));
  assert.ok(!get(s, h.id));
  assert.equal(mission(s).resources, 3);
});
for (const damaged of [false, true])
  test(`Cornered Orc shadow adds ${damaged ? 2 : 1} attack according to defender damage`, () => {
    let s = second(base());
    const e = enemy(s, W.cornered, 0);
    const h = s.heroes[0];
    h.damage = damaged ? 1 : 0;
    s = finish(defend(s, e, h, [W.cornered]));
    assert.equal(
      get(s, h.id)!.damage,
      (damaged ? 1 : 0) + 2 + (damaged ? 2 : 1) - card(h.code).defense!,
    );
  });
for (const code of [W.ridge, W.blast])
  test(`${card(code).name} shadow counts damaged characters controlled by the attacked player`, () => {
    let s = second(base(2));
    const e = enemy(s, W.cornered, 0),
      h = s.heroes[0];
    s.heroes[1].damage = 1;
    s.heroes[2].damage = 1;
    forOwner(s, 1, () => {
      for (const h of s.heroes) h.damage = 1;
    });
    const attacking = s.phase;
    s.phase = "defense";
    e.shadows = [code];
    s = applyAction(reload(s), {
      type: "DEFEND",
      enemyId: e.id,
      defenderId: h.id,
    });
    // Combat completion clears its bonus; the physical outcome must stay with the attacked seat.
    s = finish(s);
    assert.equal(get(s, h.id)!.damage, 2 + 2 - card(h.code).defense!);
    assert.equal(s.phase, "attack");
    assert.deepEqual(get(s, e.id)!.shadows, [code]);
    assert.equal(attacking, "planning");
  });
test("Ice Storm shadow assigns quest-count damage only among the defending player's characters and does not exhaust them", () => {
  let s = second(base(2));
  side(s, W.camp);
  const e = enemy(s, W.cornered, 0),
    h = s.heroes[0],
    other = s.heroes[1];
  h.tempDefense = 20;
  s = defend(s, e, h, [W.ice]);
  assert.match(s.choice!.title, /Assign/);
  s = allocated(s, get(s, other.id)!, 2);
  s = finish(s);
  assert.equal(get(s, other.id)!.damage, 2);
  assert.equal(get(s, other.id)!.exhausted, false);
  assert.equal(
    seatView(s, 1).heroes.reduce((n, u) => n + u.damage, 0),
    0,
  );
});
test("Biting Wind shadow kills a one-HP defender and makes the remaining attack undefended", () => {
  let s = second(base(), 4);
  const e = enemy(s, W.cornered, 0),
    victim = ally(s);
  s = defend(s, e, victim, [W.wind]);
  assert.ok(!get(s, victim.id));
  assert.match(s.choice!.title, /undefended|damage/i);
  const h = s.heroes[0];
  s = choose(reload(s), h.id);
  s = finish(s);
  assert.equal(get(s, h.id)!.damage, 2);
  assert.equal(
    mission(s).resources,
    4,
    "shadow direct damage is not an enemy's combat damage",
  );
});
test("Ruins of Arnor shadow's +1 attack and conditional +2 threat follow actual combat destruction", () => {
  let s = second(base(), 5);
  const e = enemy(s, W.cornered, 0),
    victim = ally(s);
  s = finish(defend(s, e, victim, [W.ruins]));
  assert.equal(s.threat, 22);
  assert.equal(mission(s).resources, 4);
  s = second(base());
  const safe = enemy(s, W.cornered, 0);
  s.heroes[0].tempDefense = 20;
  s = finish(defend(s, safe, s.heroes[0], [W.ruins]));
  assert.equal(s.threat, 20);
  assert.equal(mission(s).resources, 5);
});
for (const option of ["threat", "undefended"])
  test(`Tragic Discovery shadow's ${option} choice survives reload and resolves its attack`, () => {
    let s = second(base());
    const e = enemy(s, W.cornered, 0),
      h = s.heroes[0];
    h.tempDefense = 20;
    s = defend(s, e, h, [W.discovery]);
    assert.match(s.choice!.title, /Tragic Discovery/);
    s = choose(reload(s), option);
    if (option === "undefended") {
      assert.match(s.choice!.title, /undefended|damage/i);
      s = choose(reload(s), h.id);
    }
    s = finish(s);
    assert.equal(s.threat, option === "threat" ? 23 : 20);
    assert.equal(get(s, h.id)!.damage, option === "undefended" ? 2 : 0);
  });
test("Weather Hills reuses Angmar Marauder's return and Captain's additional attack handlers", () => {
  let s = second(base(), 6);
  const marauder = enemy(s, C.marauder, 0),
    victim = ally(s);
  s = finish(defend(s, marauder, victim));
  assert.ok(s.staging.some((u) => u.id === marauder.id));
  assert.equal(mission(s).resources, 5);
  s = second(base(), 6);
  const captain = enemy(s, C.captain, 0),
    a = ally(s);
  s.deck = ["01016", "01057"];
  s.encounterDeck = [W.cold];
  s = defend(s, captain, a);
  // Both printed after-attack Forced effects must finish before the next normal combat turn.
  while (s.choice && !s.choice.options.some((o) => o.id === s.heroes[0].id))
    s = choose(reload(s), s.choice.options[0].id);
  assert.ok(s.combat);
  assert.equal(s.combat!.enemyId, captain.id);
  assert.deepEqual(get(s, captain.id)!.shadows, [W.cold]);
  assert.deepEqual(s.deck, ["01057"]);
  assert.equal(
    mission(s).resources,
    6,
    "Savage's simultaneous Forced effect waits behind the Captain's attack",
  );
  assert.ok(validateSave(s));
});
test("Encounter side quests cannot have their when-revealed effects canceled, and their shadow faces are blank", () => {
  let s = second(base());
  s.hand.push(make(s, "01050"));
  s.encounterDeck = [W.ridge];
  revealed(s, W.shelter);
  s = finish(s);
  assert.equal(s.choice, null);
  assert.equal(
    get(s, s.staging.find((u) => u.code === W.shelter)!.id)!.timeCounters,
    4,
  );
  assert.equal(s.hand.filter((u) => u.code === "01050").length, 1);
  const e = enemy(s, W.cornered, 0);
  s.heroes[0].tempDefense = 20;
  s = finish(defend(s, e, s.heroes[0], [W.shelter]));
  assert.equal(s.staging.filter((u) => u.code === W.shelter).length, 1);
  assert.deepEqual(get(s, e.id)!.shadows, [W.shelter]);
  handle(s, fx("endCombat"));
  flush(s);
  assert.equal(s.encounterDiscard.filter((c) => c === W.shelter).length, 1);
});
test("Weather saves preserve separate physical Orc deck, set-aside units, Mission face and Time through choices", () => {
  const s = start(4);
  const re = reload(s);
  assert.deepEqual(re.weatherHills, s.weatherHills);
  const bad = JSON.parse(JSON.stringify(s));
  bad.weatherHills.orcDeck.push(W.ice);
  assert.equal(validateSave(bad), false);
  const duplicate = JSON.parse(JSON.stringify(s));
  duplicate.weatherHills.setAside[0].id = duplicate.staging[0].id;
  assert.equal(validateSave(duplicate), false);
  const stage = JSON.parse(JSON.stringify(s));
  stage.stage = 2;
  assert.equal(validateSave(stage), false);
  const negative = JSON.parse(JSON.stringify(s));
  negative.weatherHills.weatherSurgeRound = -1;
  assert.equal(validateSave(negative), false);
  const missing = JSON.parse(JSON.stringify(s));
  delete missing.weatherHills;
  assert.equal(validateSave(missing), false);
  const sideGame = second(base());
  const q = side(sideGame, W.shelter);
  q.timeCounters = 5;
  assert.equal(validateSave(sideGame), false);
});

test("Removing Cold from a defeated side quest restores damaged Mendor before his ready-and-draw Response", () => {
  let s = second(base(2));
  const q = side(s, W.camp);
  q.attachments.push({ id: `a${s.nextId++}`, code: W.cold, exhausted: false });
  const m = ally(s, "rc135");
  m.damage = 1;
  m.exhausted = true;
  syncAttachmentText(s);
  assert.equal(m.blanked, true);
  const hands = playerOrder(s).map((p) => seatView(s, p).hand.length);
  s = select(s, q);
  addCurrentQuestProgress(s, 6);
  flush(s);
  assert.equal(get(s, m.id)!.exhausted, false);
  assert.ok(!get(s, m.id)!.blanked);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).hand.length),
    hands.map((n) => n + 1),
  );
  if (s.choice) s = choose(reload(s), "skip");
  assert.ok(s.encounterDiscard.includes(W.cold));
});
test("Cold suppresses damaged Eleanor's cancellation until her damage is healed", () => {
  let s = second(base());
  s.heroes[0] = make(s, "01008");
  s.heroes[0].damage = 1;
  s.questAttachments = {
    [W.animals]: [{ id: `a${s.nextId++}`, code: W.cold, exhausted: false }],
  };
  s.activeLocation = make(s, W.ridge);
  syncAttachmentText(s);
  revealed(s, W.discovery);
  flush(s);
  assert.ok(!s.choice?.options.some((o) => o.code === "01008"));
  s = finish(s);
  assert.equal(s.threat, 23);
  handle(s, fx("heal", { target: s.heroes[0].id, value: 1 }));
  syncAttachmentText(s);
  s.encounterDeck = [W.ridge];
  revealed(s, W.discovery);
  flush(s);
  const cancel = s.choice!.options.find((o) => o.code === "01008")!;
  assert.ok(cancel);
  s = choose(reload(s), cancel.id);
  s = finish(s);
  assert.equal(s.threat, 23);
});

for (const split of [false, true])
  test(`Ice damage allocated to Frodo in ${split ? "two parts" : "one part"} remains one cancelable damage event`, () => {
    let s = second(base());
    s.heroes[0] = make(s, "02025");
    const frodo = s.heroes[0];
    side(s, W.camp);
    revealed(s, W.ice);
    flush(s);
    s = allocated(s, frodo, split ? 1 : 2);
    if (split) s = allocated(s, get(s, frodo.id)!, 1);
    assert.match(s.choice!.title, /Frodo/);
    assert.match(
      s.choice!.options.find((o) => o.id === "cancel-damage")!.label,
      /2/,
    );
    s = choose(reload(s), "cancel-damage");
    s = finish(s);
    assert.equal(get(s, frodo.id)!.damage, 0);
    assert.equal(s.threat, 22);
    assert.equal(
      get(s, frodo.id)!.exhausted,
      false,
      "Ice does not exhaust a character whose damage was canceled",
    );
  });
for (const captainFirst of [false, true])
  test(`Captain and Savage simultaneous Forced effects resolve in chosen order: Captain first=${captainFirst}`, () => {
    let s = second(base(), 5);
    const e = enemy(s, C.captain, 0),
      victim = ally(s);
    s.deck = ["01016", "01057"];
    s.encounterDeck = [W.cold];
    s.heroes[0].tempDefense = 20;
    s = defend(s, e, victim);
    assert.match(s.choice!.title, /after-attack/i);
    const option = effectOption(
      s,
      captainFirst ? "chetCaptain" : "weatherRemoveMission",
    );
    s = choose(reload(s), option.id);
    assert.ok(s.combat);
    assert.equal(s.combat!.enemyId, e.id);
    assert.match(s.choice!.title, /attack|defend/i);
    assert.equal(mission(s).resources, captainFirst ? 5 : 4);
    assert.deepEqual(get(s, e.id)!.shadows, [W.cold]);
    s = choose(reload(s), s.heroes[0].id);
    s = finish(s);
    assert.equal(mission(s).resources, 4);
    assert.deepEqual(s.deck, ["01057"]);
    assert.equal(s.phase, "attack");
  });
for (const option of ["token", "reveal"])
  test(`Real two-player staging reveals ${option === "reveal" ? 3 : 2} encounters after stage-2 quest choice ${option}`, () => {
    let s = second(base(2), 5);
    s.phase = "planning";
    s.encounterDeck = [W.ridge, W.causeway, W.valley, W.hilltop];
    handle(s, fx("startQuest"));
    flush(s);
    s = choose(reload(s), option);
    for (let i = 0; s.phase === "quest"; i++) {
      assert.ok(i < 3);
      s = applyAction(reload(s), { type: "COMMIT" });
      s = finish(s);
    }
    assert.equal(s.phase, "staging");
    assert.equal(s.encounterDeck.length, option === "reveal" ? 1 : 2);
    assert.equal(
      s.staging.filter((u) => card(u.code).type_code === "location").length,
      option === "reveal" ? 3 : 2,
    );
    s = applyAction(reload(s), { type: "NEXT" });
    s = finish(s);
    assert.equal(s.phase, "travel");
    assert.ok(!s.used.includes("phase:weather-additional-reveal"));
  });
test("A camp's WHEN-explored optional token response occurs before stage-1 AFTER-explored Orc reveal", () => {
  let s = base();
  const camp = make(s, W.orcCamp);
  s.activeLocation = camp;
  s.weatherHills!.orcDeck = [C.orc];
  const spare = ally(s);
  progressLocation(s, camp, 2);
  flush(s);
  assert.match(s.choice!.title, /Concealed Orc-camp/);
  assert.equal(s.weatherHills!.orcDeck.length, 1);
  s = choose(reload(s), "token");
  assert.equal(mission(s).resources, 1);
  assert.equal(s.weatherHills!.orcDeck.length, 0);
  assert.match(s.choice!.title, /Angmar Orc/);
  s = choose(reload(s), spare.id);
  s = finish(s);
  assert.ok(s.staging.some((u) => u.code === C.orc));
});
test("Assignment reserves each target's remaining HP across earlier choices and discards no damage while another target has room", () => {
  let s = second(base());
  const frodo = make(s, "02025");
  s.heroes[0] = frodo;
  for (const h of s.heroes) {
    h.committed = true;
    s.committedIds.push(h.id);
  }
  revealed(s, W.wind);
  flush(s);
  s = allocated(s, frodo, 1);
  assert.ok(!s.choice!.options.some((o) => o.id === `${frodo.id}:2`));
  s = allocated(s, get(s, frodo.id)!, 1);
  assert.ok(s.choice!.options.every((o) => !o.id.startsWith(`${frodo.id}:`)));
  const another = s.heroes[1];
  s = allocated(s, another, 1);
  assert.match(s.choice!.title, /Frodo/);
  s = choose(reload(s), "cancel-damage");
  s = finish(s);
  assert.equal(get(s, frodo.id)!.damage, 0);
  assert.equal(get(s, another.id)!.damage, 1);
  assert.equal(s.threat, 22);
});
