import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyAction } from "../src/game/engine";
import { card, encounterCards } from "../src/game/cards";
import { check, progressLocation } from "../src/game/board";
import {
  fx,
  get,
  mainStageInfo,
  make,
  stats,
  threatOf,
  stagingThreat,
} from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { allEngaged, forOwner, ownerOf } from "../src/game/table";
import { sailingSymbols } from "../src/game/sailing";
import { stormcallerArea } from "../src/game/stormcaller";
import {
  STORMCALLER as V,
  STORMCALLER_RECIPES,
} from "../src/game/stormcaller-support";
import {
  NIGHTMARE,
  NIGHTMARE_DC as D,
  nightmareCardOf,
  nightmareStatus,
} from "../src/game/nightmare";
import type { Effect, GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  nightmareForTwo,
  nightmareGame,
  opening,
  valid,
} from "./nightmare-fixtures";
import {
  base,
  choose,
  reload,
  setEnemyStage,
  setPlayerStage,
} from "./stormcaller-fixtures";

const ID = "flight-of-the-stormcaller";
const hooks = (s: GameState) => batch4Scenario(s);
/** A quiet Nightmare pursuit at stage 1 with the fleet in play (the scenario's own fixture). */
function board(players = 1) {
  const s = base(players);
  s.nightmareMode = true;
  s.nightmare = {};
  return s;
}
const queue = (s: GameState, ...effects: Effect[]) => {
  s.queue.unshift(...effects);
  return s;
};
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
const options = (s: GameState) => s.choice?.options.map((o) => o.id) ?? [];
const tally = (list: string[]) =>
  list.reduce<Record<string, number>>(
    (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
    {},
  );
const stage = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
function engaged(s: GameState, code: string, p = 0) {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    s.engaged.push(u);
  });
  return u;
}
/** The given player reveals a known card from the top of the encounter deck. */
function reveal(s: GameState, code: string, p = 0) {
  s.encounterDeck.unshift(code);
  s.queue.push(fx("reveal", { player: p }));
  flush(s);
  return s;
}
function shadowOf(s: GameState, attacker: Unit, code: string) {
  s.combat = {
    enemyId: attacker.id,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
    attackPlayer: 0,
  };
  attacker.shadows = [code];
  attacker.revealedShadowCount = 1;
  const handled = hooks(s).shadow!(s, code);
  flush(s);
  return handled;
}
const ships = (s: GameState) =>
  s.allies.filter((u) => card(u.code).type_code === "ship-objective");
const target = (s: GameState) => get(s, s.stormcaller!.stormcallerId)!;
const area = (s: GameState) => s.stormcaller!.area;

test("Nightmare: Flight of the Stormcaller's setup card and Nightmare Deck carry their scans' texts, stats and Sailing symbols", () => {
  const setup = card(D.stormcallerCard);
  assert.equal(setup.type_code, "nightmare");
  assert.match(
    setup.text!,
    /^Begin with the standard quest deck and encounter deck for the Flight of the Stormcaller scenario\.\n/,
  );
  assert.ok(setup.text!.includes("Then, shuffle the encounter cards"));
  assert.ok(
    setup.text!.includes(
      "\n1*: Some cards in the Flight of the Stormcaller Nightmare Deck",
    ),
  );
  assert.deepEqual(setup.back_text!.split("\n"), [
    "You are playing Nightmare mode.",
    "While you are at the same stage as the Stormcaller, the main quest gets +X quest points, where X is the Stormcaller's remaining hit points.",
  ]);
  assert.equal(card(D.tideRunner).name, "Tide-runner");
  assert.equal(card(D.getaway).name, "Sahír's Getting Away!");
  assert.equal(card(D.tideRunner).text!.split("\n").length, 3);
  assert.ok(
    card(D.jetties).text!.includes("returning any currently active location"),
  );
  assert.equal(card(D.venom).is_unique, true);
  assert.equal(card(D.venom).victory, 5);
  assert.ok(
    card(D.venom).text!.includes("\n*Forced: After this Sailing test ends"),
  );
  assert.deepEqual(
    [D.raider, D.tideRunner, D.venom].map((code) => {
      const c = card(code);
      return [c.engagement, c.threat, c.attack, c.defense, c.health];
    }),
    [
      [28, 0, 3, 3, 4],
      [44, 4, 4, 2, 9],
      [34, 5, 8, 5, 14],
    ],
  );
  assert.deepEqual(
    [D.jetties, D.inlet].map((code) => [card(code).threat, card(code).quest]),
    [
      [2, 6],
      [4, 3],
    ],
  );
  assert.equal(card(D.stormy).traits, "Weather.");
  assert.equal(
    card(D.stormy).shadow,
    "Shadow: Attacking enemy makes an additional attack after this one.",
  );
  // Printed Sailing symbols: Venom's Bite (with the asterisk) and Cliffside Inlet.
  assert.deepEqual(
    [
      D.raider,
      D.tideRunner,
      D.venom,
      D.jetties,
      D.inlet,
      D.stormy,
      D.getaway,
    ].map(sailingSymbols),
    [0, 0, 1, 0, 1, 0, 0],
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Flight of the Stormcaller - Nightmare",
  );
  assert.equal(
    set
      .filter((x) => x.type_code !== "nightmare")
      .reduce((n, x) => n + (x.quantity ?? 1), 0),
    19,
  );
  for (const code of Object.values(D).filter((c) =>
    set.some((x) => x.code === c),
  )) {
    const faces = art.filter((pin) => pin.code === code).map((pin) => pin.face);
    assert.deepEqual(
      faces,
      code === D.stormcallerCard ? ["front", "back"] : ["front"],
    );
    for (const pin of art.filter((x) => x.code === code))
      assert.equal(
        readFileSync(`public${pin.localPath}`).length,
        pin.bytes,
        pin.localPath,
      );
  }
});

test("Nightmare: Flight of the Stormcaller's encounter deck and Corsair deck match the source recipe", () => {
  const deck = NIGHTMARE[ID]!;
  assert.equal(nightmareCardOf(opening(nightmareGame(ID))), D.stormcallerCard);
  assert.deepEqual(deck.removals, {
    "Calm Waters": 2,
    "Corsair Skiff": 2,
    "Southron Sailor": 2,
    "Serpent's Blade": 2,
    "Hidden Cove": 1,
    "Jagged Reef": 2,
  });
  const recipe = STORMCALLER_RECIPES.find((r) => r.mode === "standard")!;
  const section = (name: string) =>
    tally(
      recipe.cards
        .filter((r) => r.section === name)
        .flatMap((r) => Array<string>(r.quantity).fill(r.code)),
    );
  for (const s of [opening(nightmareGame(ID)), opening(nightmareForTwo(ID))]) {
    const q = s.stormcaller!;
    const players = s.table?.seats.length ?? 1;
    assert.ok(valid(s));
    // The standard encounter deck (with its Rolling Seas in the staging area)
    // without the removed cards, with the 15 Nightmare encounter cards.
    const expected = section("sharedEncounterDeck");
    expected[V.rolling] += section("sharedStagingArea")[V.rolling] ?? 0;
    for (const [code, n] of [
      [V.calm, 2],
      [V.skiff, 2],
      [V.cove, 1],
      [V.reef, 2],
    ] as const) {
      expected[code] -= n;
      if (!expected[code]) delete expected[code];
    }
    Object.assign(expected, {
      [D.tideRunner]: 2,
      [D.venom]: 1,
      [D.jetties]: 3,
      [D.inlet]: 3,
      [D.stormy]: 3,
      [D.getaway]: 3,
    });
    const encounter = [
      ...s.encounterDeck,
      ...s.encounterDiscard,
      ...s.staging.map((u) => u.code),
    ];
    assert.deepEqual(tally(encounter), expected, `${players} player(s)`);
    assert.equal(
      s.staging.filter((u) => u.code === V.rolling).length,
      1,
      "one Rolling Seas for one or two players",
    );
    // The Corsair deck: Raider of the Storm instead of Southron Sailor and
    // Serpent's Blade.
    assert.deepEqual(tally(q.corsairDeck), {
      [V.seafarer]: 2,
      [V.pirate]: 3,
      [V.marauder]: 2,
      [V.captain]: 2,
      [D.raider]: 4,
    });
    assert.match(
      nightmareStatus(s)[0],
      /^Flight of the Stormcaller · Nightmare mode: Raider of the Storm joins the Corsair deck/,
    );
  }
});

test("Nightmare: at the Stormcaller's stage, the main quest gets the Stormcaller's remaining hit points; each Cliffside Inlet in the staging area adds 2", () => {
  const s = board();
  setEnemyStage(s, 3);
  setPlayerStage(s, 2);
  assert.equal(mainStageInfo(s)!.quest, 12);
  setEnemyStage(s, 2);
  const boss = target(s);
  assert.ok(
    s.staging.some((u) => u.id === boss.id),
    "caught up: in staging",
  );
  assert.equal(mainStageInfo(s)!.quest, 12 + 18);
  boss.damage = 5;
  assert.equal(mainStageInfo(s)!.quest, 12 + 13);
  stage(s, D.inlet);
  stage(s, D.inlet);
  assert.equal(mainStageInfo(s)!.quest, 12 + 13 + 4);
  // The stage is not defeated by its printed quest points.
  s.progress = 20;
  check(s);
  assert.equal(s.stormcaller!.currentQuest, V.full);
  // At a different stage, only the staging area's Cliffside Inlets count.
  setPlayerStage(s, 3);
  assert.equal(mainStageInfo(s)!.quest, 18 + 4);
  assert.ok(valid(s));
});

test("Nightmare: Raider of the Storm strengthens the Ship enemies engaged with its player and makes them contribute their threat", () => {
  const s = board(2);
  const raider = engaged(s, D.raider, 0);
  const swift = engaged(s, V.swift, 0);
  const other = engaged(s, V.swift, 1);
  const base = [
    threatOf(s, other),
    stats(s, other).attack,
    stats(s, other).defense,
  ];
  assert.deepEqual(
    [threatOf(s, swift), stats(s, swift).attack, stats(s, swift).defense],
    base.map((n) => n + 1),
  );
  assert.deepEqual(
    [threatOf(s, other), stats(s, other).attack, stats(s, other).defense],
    [3, 5, 4],
  );
  assert.equal(threatOf(s, raider), 0, "not a Ship enemy");
  const staged = s.staging.reduce((n, u) => n + threatOf(s, u), 0);
  assert.equal(stagingThreat(s), staged + threatOf(s, swift));
  // A second Raider adds another +1; the contribution is not doubled.
  engaged(s, D.raider, 0);
  assert.equal(threatOf(s, swift), 5);
  assert.equal(stagingThreat(s), staged + 5);
  assert.ok(valid(s));
});

test("Nightmare: Tide-runner's When Revealed engages a chosen player (Boarding 1) or joins the Stormcaller's area with surge", () => {
  let s = board(2);
  s = reveal(s, D.tideRunner);
  assert.deepEqual(options(s), ["engage-0", "engage-1", "area"]);
  const corsair = s.stormcaller!.corsairDeck[0];
  s = choose(s, "engage-1");
  s = flushChoices(s);
  const tide = allEngaged(s).find((u) => u.code === D.tideRunner)!;
  assert.ok(tide, "Tide-runner engages the chosen player");
  assert.equal(ownerOf(s, tide), 1);
  // Boarding 1: the top Corsair boards the same player's fleet.
  const boarded = allEngaged(s).find(
    (u) => u.code === corsair && u.id !== tide.id,
  )!;
  assert.ok(boarded, "Boarding 1 draws a Corsair");
  assert.equal(ownerOf(s, boarded), 1);
  assert.ok(valid(s));

  s = board();
  s.encounterDeck.unshift(D.inlet);
  s = reveal(s, D.tideRunner);
  s = choose(s, "area");
  s = flushChoices(s);
  assert.ok(area(s).some((u) => u.code === D.tideRunner));
  assert.ok(
    s.staging.some((u) => u.code === D.inlet),
    "surge reveals the next card",
  );
  assert.ok(valid(s));
});
function flushChoices(s: GameState) {
  for (let i = 0; i < 20 && s.choice; i++) {
    const skip = s.choice.options.find(
      (o) => o.id === "skip" || o.id === "pass",
    );
    s = choose(s, (skip ?? s.choice.options[0]).id);
  }
  return s;
}

test("Nightmare: off-course, Tide-runner is in the staging area and the Stormcaller's area wherever it is", () => {
  const s = board();
  setPlayerStage(s, 1);
  const tide = engaged(s, D.tideRunner, 0);
  const staged = () => s.staging.reduce((n, u) => n + threatOf(s, u), 0);
  assert.equal(stagingThreat(s), staged(), "on-course: only engaged");
  assert.equal(hooks(s).immune!(s, tide), false);
  s.sailing!.heading = 1;
  assert.equal(stagingThreat(s), staged() + 4, "off-course: its threat counts");
  // At a different stage than the Stormcaller, cards in its area are immune
  // to player card effects and cannot leave it.
  assert.equal(hooks(s).immune!(s, tide), true);
  assert.equal(hooks(s).indestructible!(s, tide), true);
  tide.damage = 9;
  check(s);
  assert.ok(
    allEngaged(s).some((u) => u.id === tide.id),
    "not destroyed",
  );
  // Back on-course it is destroyed.
  s.sailing!.heading = 0;
  check(s);
  assert.ok(!allEngaged(s).some((u) => u.id === tide.id));
  // Sahír's Getting Away! counts an off-course Tide-runner in the area.
  const other = engaged(s, D.tideRunner, 0);
  s.sailing!.heading = 2;
  queue(s, fx("nfcGetaway", { player: 0 }));
  flush(s);
  // The Stormcaller (in its area) and Tide-runner.
  assert.equal(s.stormcaller!.enemyProgress, 2);
  assert.ok(other);
  assert.ok(valid(s));
});

test("Nightmare: Venom's Bite, discarded by a Sailing test, enters the staging area off-course or the Stormcaller's area on-course", () => {
  for (const heading of [2, 0] as const) {
    let s = board();
    s.phase = "quest";
    s.sailing!.heading = heading;
    s.encounterDeck.unshift(D.venom);
    queue(s, fx("sailingBegin"));
    flush(s);
    const dream = s.allies.find((u) => u.code === V.dream)!;
    s = act(s, { type: "CHOOSE", id: dream.id });
    // Commit only the Dream-chaser; beginning the test shifts the heading
    // off-course, and its success either stays there or returns on-course.
    for (let i = 0; i < 20 && s.sailing?.test; i++)
      if (s.sailing.test.phase === "actions")
        s = act(s, { type: "RESOLVE_SAILING" });
      else if (s.choice) {
        const id = s.choice.options.some((o) => o.id === "done")
          ? "done"
          : heading
            ? "sailing-heading-0"
            : "sailing-heading-1";
        s = act(s, { type: "CHOOSE", id });
      }
    assert.equal(s.sailing!.test, undefined);
    assert.equal(s.sailing!.heading, heading ? 3 : 0);
    assert.ok(!s.encounterDiscard.includes(D.venom));
    if (heading)
      assert.ok(
        s.staging.some((u) => u.code === D.venom && !u.stormcallerArea),
        "off-course: the staging area",
      );
    else
      assert.ok(
        area(s).some((u) => u.code === D.venom),
        "on-course: the Stormcaller's area",
      );
    assert.ok(valid(s));
  }
});

test("Nightmare: Sharp Jetties becomes the active location off-course; progress on it costs quest progress or damage to each Ship objective", () => {
  let s = board();
  const active = make(s, V.rolling);
  s.activeLocation = active;
  s = reveal(s, D.jetties);
  assert.ok(
    s.staging.some((u) => u.code === D.jetties),
    "on-course: staged",
  );
  assert.equal(s.activeLocation!.id, active.id);
  s = board();
  s.activeLocation = make(s, V.rolling);
  s.sailing!.heading = 1;
  s = reveal(s, D.jetties);
  assert.equal(s.activeLocation!.code, D.jetties);
  assert.ok(
    s.staging.some((u) => u.code === V.rolling),
    "returned to staging",
  );
  // Progress on it: remove that much from the current quest...
  s.progress = 5;
  progressLocation(s, s.activeLocation!, 3);
  flush(s);
  assert.deepEqual(options(s), ["progress", "damage"]);
  s = choose(s, "progress");
  assert.equal(s.progress, 2);
  // ...or deal that much damage to each Ship objective.
  progressLocation(s, s.activeLocation!, 2);
  flush(s);
  s = choose(s, "damage");
  s = flushChoices(s);
  assert.deepEqual(
    ships(s).map((u) => u.damage),
    [2, 2],
  );
  // Without quest progress, only the damage remains.
  s.progress = 0;
  progressLocation(s, s.activeLocation!, 1);
  flush(s);
  assert.deepEqual(options(s), ["damage"]);
  assert.ok(valid(s));
});

test("Nightmare: Cliffside Inlet's Travel cost puts the first discarded Ship enemy into play in the Stormcaller's area", () => {
  let s = board();
  s.phase = "travel";
  const inlet = stage(s, D.inlet);
  s.encounterDeck.unshift(V.thrown, V.rolling, V.swift, V.escort);
  s = act(s, { type: "TRAVEL", id: inlet.id });
  s = flushChoices(s);
  assert.equal(s.activeLocation?.code, D.inlet);
  assert.deepEqual(s.encounterDiscard.slice(-2), [V.thrown, V.rolling]);
  assert.ok(area(s).some((u) => u.code === V.swift));
  assert.equal(s.encounterDeck[0], V.escort);
  assert.ok(valid(s));
});

test("Nightmare: Dark and Stormy deals a shadow card to each Ship enemy in play and keeps shadow effects from being canceled this round", () => {
  let s = board();
  const swift = stage(s, V.swift);
  const tide = engaged(s, D.tideRunner, 0);
  s.encounterDeck.unshift(V.thrown, V.calm, V.rough, "01096", "01096");
  const deck = s.encounterDeck.length;
  s = reveal(s, D.stormy);
  s = flushChoices(s);
  for (const u of [get(s, swift.id)!, get(s, tide.id)!, target(s)])
    assert.equal(u.shadows.length >= 1, true, card(u.code).name);
  assert.ok(deck - s.encounterDeck.length >= 4, "3 shadows and surge");
  assert.equal(hooks(s).cannotCancel!(s, true), true);
  assert.equal(hooks(s).cannotCancel!(s, false), false);
  // The Stormcaller's area discards its shadow cards at the end of combat.
  hooks(s).combatEnd!(s);
  assert.equal(target(s).shadows.length, 0);
  s.round++;
  assert.equal(hooks(s).cannotCancel!(s, true), false);
  assert.ok(valid(s));
  // Its shadow: an additional attack.
  shadowOf(s, get(s, tide.id)!, D.stormy);
  assert.equal(s.combat!.extraAttacks, 1);
});

test("Nightmare: Sahír's Getting Away! advances the Stormcaller for its area's Ship enemies, then shifts the heading or adds 8 threat for the phase; its shadow follows a Ship's damage", () => {
  let s = board();
  s.phase = "staging";
  const q = s.stormcaller!;
  const escort = make(s, V.escort);
  escort.stormcallerArea = true;
  q.area.push(escort);
  s = reveal(s, D.getaway);
  assert.equal(s.stormcaller!.enemyProgress, 2);
  assert.deepEqual(options(s), ["heading", "threat"]);
  const before = stagingThreat(s);
  s = choose(s, "threat");
  assert.equal(stagingThreat(s), before + 8);
  s.phase = "travel";
  assert.equal(stagingThreat(s), before, "until the end of the phase");
  assert.ok(valid(s));
  s.phase = "staging";
  s.sailing!.heading = 3;
  s = reveal(s, D.getaway);
  assert.deepEqual(options(s), ["threat"], "at the worst heading");
  s = choose(s, "threat");
  assert.equal(
    s.nightmare!.stormcallerThreat!.n,
    16,
    "two copies in the same phase",
  );
  // Its shadow: 1 progress if the attack damages a Ship objective.
  s = board();
  const pirate = engaged(s, V.pirate, 0);
  shadowOf(s, pirate, D.getaway);
  assert.equal(s.combat!.nfcGetaway, 1);
  const effects = hooks(s).attackFinished!(s, s.combat!);
  assert.deepEqual(effects, []);
  s.combat!.voyageShipDamaged = true;
  queue(s, ...hooks(s).attackFinished!(s, s.combat!));
  flush(s);
  assert.equal(s.stormcaller!.enemyProgress, 1);
});

test("Nightmare: Flight of the Stormcaller's lasting effects survive a reload, and invalid ones are rejected", () => {
  const s = board();
  s.round = 3;
  s.nightmare = {
    stormcallerStormy: 3,
    stormcallerThreat: { round: 3, phase: "quest", n: 16 },
  };
  assert.ok(valid(s));
  assert.deepEqual(reload(s).nightmare, s.nightmare);
  for (const bad of [
    { stormcallerStormy: 4 },
    { stormcallerThreat: { round: 3, phase: "quest", n: 5 } },
    { stormcallerThreat: { round: 9, phase: "quest", n: 8 } },
  ]) {
    s.nightmare = bad as never;
    assert.equal(valid(s), false, JSON.stringify(bad));
  }
  s.nightmare = { stormcallerStormy: 1 };
  s.nightmareMode = false;
  assert.equal(valid(s), false, "only in Nightmare mode");
});

test("Nightmare: Flight of the Stormcaller Nightmare games keep valid saves to their end", () => {
  for (const seed of [1, 2, 3])
    for (const s of [nightmareGame(ID, seed), nightmareForTwo(ID, seed)]) {
      const end = autoplay(s, 2500);
      assert.ok(valid(end), `seed ${seed}`);
    }
});
