import { applyAction as rawAct } from "./pass-resource-window.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { STARTERS, card } from "../src/game/cards.ts";
import {
  createGame,
  stats,
  stagingThreat,
  playTargets,
  availableAbilities,
  continueCampaign,
  restoreSave,
  validateSave,
} from "../src/game/engine.ts";
import {
  allCharacters,
  seatView,
  selectSeat,
  syncSeat,
  ownerOf,
} from "../src/game/table.ts";
import type { GameState, Unit, Action } from "../src/game/types.ts";

// Isolated mid-game fixtures cover the 30 findings checked against FFG sources.
// Run every case with and without explicit presentation confirmations.
for (const guided of [false, true]) {
  let counter = 900000;
  function drainReviews(s: GameState) {
    let n = 0;
    while (s.flow?.pending) {
      assert.ok(n++ < 300, "presentation queue must terminate");
      s = rawAct(s, { type: "CONTINUE", stepId: s.flow.pending.id });
    }
    return s;
  }
  function act(s: GameState, a: Action) {
    return drainReviews(rawAct(s, a));
  }
  const unit = (code: string, owner = 0): Unit => ({
    id: `audit-${counter++}`,
    code,
    owner,
    damage: 0,
    progress: 0,
    resources: 0,
    exhausted: false,
    committed: false,
    attachments: [],
    boost: 0,
    attacked: false,
    shadows: [],
  });
  const attach = (u: Unit, code: string, owner = 0) => {
    const a = { id: `audit-a${counter++}`, code, owner, exhausted: false };
    u.attachments.push(a);
    return a;
  };
  function reload(s: GameState) {
    assert.ok(validateSave(s), "pending rules state must remain serializable");
    const loaded = restoreSave(JSON.parse(JSON.stringify(s)));
    assert.ok(loaded);
    assert.deepEqual(loaded, JSON.parse(JSON.stringify(s)));
    return loaded;
  }
  function settle(s: GameState) {
    let n = 0;
    while (s.choice && s.status === "playing") {
      assert.ok(n++ < 100);
      const o =
        s.choice.options.find((o) => o.id === "skip") ??
        s.choice.options.find((o) => o.id === "resolve") ??
        s.choice.options[0];
      s = act(s, { type: "CHOOSE", id: o.id });
    }
    return s;
  }
  function game(id = "leadership", hot = false, campaign = false): GameState {
    const d = STARTERS.find((d) => d.id === id)!;
    let s = drainReviews(
      createGame(42, d.cards, d.heroes, d.id, {
        ...(hot
          ? {
              seats: [
                { heroes: ["01001"], deckId: "leadership" },
                { heroes: ["01007"], deckId: "spirit" },
                { heroes: ["01005"], deckId: "tactics" },
              ],
            }
          : {}),
        playMode: campaign ? "campaign" : "normal",
        guided,
      }),
    );
    while (s.phase === "setup") s = settle(act(s, { type: "KEEP" }));
    s.staging = [];
    s.activeLocation = null;
    s.encounterDiscard = [];
    for (let i = 0; i < (s.table?.seats.length ?? 1); i++) {
      selectSeat(s, i);
      s.hand = [];
      s.engaged = [];
      s.heroes.forEach((h) => (h.resources = 20));
      syncSeat(s);
    }
    selectSeat(s, 0);
    return s;
  }
  function play(s: GameState, code: string, target?: string) {
    const u = unit(code, s.table?.active ?? 0);
    s.hand.push(u);
    syncSeat(s);
    return act(s, { type: "PLAY", id: u.id, target });
  }
  function stage(s: GameState, codes: string[]) {
    s.phase = "quest";
    s.encounterDeck = codes;
    if (s.table) {
      s.table.passed = [];
      s.table.turn = s.table.first;
      selectSeat(s, s.table.first);
    }
    for (let i = 0; i < (s.table?.seats.length ?? 1); i++)
      s = settle(act(s, { type: "COMMIT" }));
    return s;
  }
  function check(
    id: string,
    title: string,
    run: () => { expected: unknown; actual: unknown },
  ) {
    test(`${id} (${guided ? "guided" : "unpaced"}): ${title}`, () => {
      const values = run();
      assert.deepEqual(values.actual, values.expected);
    });
  }

  check(
    "R01",
    "Restricted permits a third attachment followed by a mandatory discard",
    () => {
      let s = game("tactics");
      const h = s.heroes[0];
      const blade = attach(h, "01039");
      attach(h, "01041");
      assert.ok(playTargets(s, unit("01040")).some((u) => u.id === h.id));
      s = play(s, "01040", h.id);
      assert.match(s.choice!.title, /Restricted/);
      assert.equal(s.heroes[0].attachments.length, 3);
      assert.throws(() => act(s, { type: "NEXT" }));
      s = act(reload(s), { type: "CHOOSE", id: blade.id });
      assert.ok(s.discard.includes("01039"));
      return { expected: 2, actual: s.heroes[0].attachments.length };
    },
  );
  check(
    "R02",
    "Massing at Night deals an extra shadow for every player",
    () => {
      let s = game("leadership", true);
      s.phase = "defense";
      const e = unit("01096");
      e.shadows = ["01112"];
      s.engaged = [e];
      s.encounterDeck = ["01097", "01097", "01097", "01099"];
      syncSeat(s);
      s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: s.heroes[0].id });
      assert.equal(seatView(s, 0).heroes[0].damage, 3);
      assert.deepEqual(s.encounterDeck, ["01099"]);
      return { expected: 4, actual: seatView(s, 0).engaged[0].shadows.length };
    },
  );
  check("R03", "Multiple Webs require payment for every copy", () => {
    let s = game();
    s.phase = "attack";
    const h = s.heroes[0];
    h.exhausted = true;
    h.resources = 4;
    attach(h, "01080");
    attach(h, "01080");
    s = act(s, { type: "END_ATTACKS" });
    s = act(s, { type: "CHOOSE", id: "pay" });
    assert.equal(s.heroes[0].exhausted, false);
    return { expected: 0, actual: s.heroes[0].resources };
  });
  check("R04", "For Gondor modifiers stack", () => {
    let s = game();
    const base = stats(s, s.heroes[0]).attack;
    s = play(play(s, "01022"), "01022");
    return { expected: base + 2, actual: stats(s, s.heroes[0]).attack };
  });
  check(
    "R05",
    "Faramir affects only characters present when his ability resolves",
    () => {
      let s = game();
      const f = unit("01014");
      s.allies.push(f);
      s = act(s, { type: "ABILITY", id: f.id });
      s = play(s, "01013");
      const newcomer = s.allies.find((u) => u.code === "01013")!;
      return {
        expected: card(newcomer.code).willpower,
        actual: stats(s, newcomer).will,
      };
    },
  );
  check("R06", "Treacherous Fog affects later locations", () => {
    let s = game("leadership", true);
    s.scenarioId = "anduin";
    s = stage(s, ["01118", "01113", "01114"]);
    return { expected: 6, actual: stagingThreat(s) };
  });
  check("R07", "Eliminating the prisoner fellowship loses Dol Guldur", () => {
    let s = game();
    s.scenarioId = "dol-guldur";
    s.prisoner = s.heroes.shift()!;
    for (const h of s.heroes) {
      h.damage = stats(s, h).health - 1;
      h.exhausted = true;
    }
    s = stage(s, ["01093", "01099"]);
    return { expected: "lost", actual: s.status };
  });
  check(
    "R08",
    "Leaving-play Orc Guards return to the owner discard pile",
    () => {
      let s = game("spirit");
      s.scenarioId = "dol-guldur";
      s.stage = 3;
      const e = unit("orc-guard");
      e.facedownCard = "01044";
      s.engaged = [e];
      s = play(s, "01052", e.id);
      return {
        expected: { staging: false, discard: true },
        actual: {
          staging: s.staging.some((u) => u.id === e.id),
          discard: s.discard.includes("01044"),
        },
      };
    },
  );
  check(
    "R09",
    "Legolas and Blade resolve separately across quest stages",
    () => {
      let s = game("tactics");
      s.phase = "attack";
      s.progress = 7;
      const l = s.heroes.find((h) => h.code === "01005")!;
      attach(l, "01039");
      const e = unit("01096");
      e.damage = 3;
      s.engaged = [e];
      s = act(s, { type: "ATTACK", enemyId: e.id, attackerIds: [l.id] });
      // Blade first finishes 1B; Legolas then supplies both points for 2B.
      assert.ok(s.choice?.title.includes("Victory responses"));
      assert.equal(s.progress, 7);
      s = reload(s);
      s = act(s, {
        type: "CHOOSE",
        id: s.choice!.options.find((o) => o.code === "01039")!.id,
      });
      s = act(s, {
        type: "CHOOSE",
        id: s.choice!.options.find((o) => o.code === "01005")!.id,
      });
      return {
        expected: { stage: 3, progress: 0 },
        actual: { stage: s.stage, progress: s.progress },
      };
    },
  );
  check(
    "R10",
    "Hammersmith distinguishes playing from putting into play",
    () => {
      let s = game();
      const a = unit("01059");
      s.hand = [a];
      s.discard = ["01026"];
      s = play(s, "01023");
      s = act(s, { type: "CHOOSE", id: a.id });
      return {
        expected: false,
        actual: s.hand.some((u) => u.code === "01026"),
      };
    },
  );
  check("R11", "Borrowed Took returns to the original owner hand", () => {
    let s = game("leadership", true);
    s.phase = "defense";
    const a = unit("01043", 1);
    a.exhausted = true;
    s.allies.push(a);
    const e = unit("01096");
    e.shadows = ["01117"];
    s.engaged = [e];
    syncSeat(s);
    s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: s.heroes[0].id });
    s = act(s, { type: "CHOOSE", id: a.id });
    return {
      expected: 1,
      actual: s.table!.seats.findIndex((_, i) =>
        seatView(s, i).hand.some((u) => u.code === a.code),
      ),
    };
  });
  check("R12", "Mendor follows the first-player token", () => {
    let s = game("leadership", true, true);
    s.phase = "refresh";
    s = act(s, { type: "NEXT" });
    const m = allCharacters(s).find((u) => u.code === "rc135")!;
    return { expected: s.table!.first, actual: ownerOf(s, m) };
  });
  check(
    "R13",
    "Scarred responds only to destruction in its controller fellowship",
    () => {
      let s = game("leadership", true);
      attach(s.heroes[0], "rc138");
      const before = s.threat;
      syncSeat(s);
      const a = unit("01043", 1);
      a.exhausted = true;
      a.damage = card(a.code).health! - 1;
      seatView(s, 1).allies.push(a);
      s = stage(s, ["01093", "01099", "01099"]);
      return { expected: before, actual: seatView(s, 0).threat };
    },
  );
  check(
    "R14",
    "Wolf Rider allows Sentinel defenders from other players",
    () => {
      let s = game("leadership", true);
      const sentinel = s.heroes[0].id;
      selectSeat(s, 1);
      s.phase = "defense";
      s.table!.turn = 1;
      const e = unit("01096", 1);
      e.shadows = ["01081"];
      s.engaged = [e];
      s.encounterDeck = [];
      syncSeat(s);
      s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: s.heroes[0].id });
      assert.ok(s.choice?.options.some((o) => o.id === sentinel));
      s = act(s, { type: "CHOOSE", id: sentinel });
      assert.equal(seatView(s, 0).heroes[0].damage, 0);
      return { expected: true, actual: seatView(s, 0).heroes[0].exhausted };
    },
  );
  check(
    "R15",
    "Quick Strike allows Ranged attacks against another player enemy",
    () => {
      let s = game("leadership", true);
      const e = unit("01096");
      s.engaged = [e];
      syncSeat(s);
      selectSeat(s, 2);
      s.phase = "attack";
      s.table!.turn = 2;
      s = play(s, "01035", s.heroes[0].id);
      assert.ok(s.choice?.options.some((o) => o.id === e.id));
      s = act(s, { type: "CHOOSE", id: e.id });
      assert.equal(seatView(s, 2).heroes[0].exhausted, true);
      return { expected: 2, actual: seatView(s, 0).engaged[0].damage };
    },
  );
  check(
    "R16",
    "Conflicting Beorn and Sneak Attack effects offer an order choice",
    () => {
      let s = game();
      const b = unit("01031");
      s.hand = [b];
      s = play(s, "01023");
      s = act(s, { type: "CHOOSE", id: b.id });
      s = act(s, { type: "ABILITY", id: b.id });
      s = act(s, { type: "NEXT" });
      assert.ok(s.choice);
      s = reload(s);
      assert.throws(() => act(s, { type: "NEXT" }));
      const deck = act(s, { type: "CHOOSE", id: "deck" });
      assert.equal(deck.allies.length, 0);
      assert.ok(deck.deck.includes("01031"));
      assert.ok(!deck.hand.some((u) => u.code === "01031"));
      const hand = act(s, { type: "CHOOSE", id: "hand" });
      assert.equal(hand.allies.length, 0);
      assert.equal(hand.phase, "quest");
      return {
        expected: true,
        actual: hand.hand.some((u) => u.code === "01031"),
      };
    },
  );
  check("R17", "Brok responds to a Dwarf hero leaving play by discard", () => {
    let s = game("tactics");
    s.phase = "defense";
    s.hand = [unit("01019")];
    const e = unit("01102");
    e.shadows = ["01103"];
    s.engaged = [e];
    const g = s.heroes.find((h) => h.code === "01004")!,
      t = s.heroes.find((h) => h.code === "01006")!;
    s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: t.id });
    assert.match(s.choice!.title, /Nazgûl/);
    s = act(s, { type: "CHOOSE", id: g.id });
    assert.match(s.choice!.title, /Brok/);
    s = act(s, { type: "CHOOSE", id: "play" });
    return { expected: true, actual: s.allies.some((u) => u.code === "01019") };
  });
  check(
    "R18",
    "Driven by Shadow can discard an encounter attachment from a defender",
    () => {
      let s = game();
      s.phase = "defense";
      const a = attach(s.heroes[0], "01080");
      const e = unit("01096");
      e.shadows = ["01092"];
      s.engaged = [e];
      s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: s.heroes[0].id });
      assert.ok(s.choice?.options.some((o) => o.id === a.id));
      s = act(s, { type: "CHOOSE", id: a.id });
      assert.equal(s.heroes[0].attachments.length, 0);
      return { expected: true, actual: s.encounterDiscard.includes("01080") };
    },
  );
  check(
    "R19",
    "The receiving character controller can use its player attachments",
    () => {
      let s = game("leadership", true);
      s = play(s, "01026", seatView(s, 1).heroes[0].id);
      selectSeat(s, 1);
      const a = s.heroes[0].attachments.find((a) => a.code === "01026")!;
      assert.ok(availableAbilities(s, s.heroes[0]).some((x) => x.id === a.id));
      const before = s.heroes[0].resources;
      s = act(s, { type: "ABILITY", id: s.heroes[0].id, attachmentId: a.id });
      assert.equal(seatView(s, 1).heroes[0].resources, before + 2);
      return {
        expected: 0,
        actual: seatView(s, 1).heroes[0].attachments[0].owner,
      };
    },
  );
  check(
    "R20",
    "Elimination passes first player clockwise to the next survivor",
    () => {
      let s = game("leadership", true);
      s.table!.first = 1;
      selectSeat(s, 1);
      s.threat = 49;
      syncSeat(s);
      s = stage(s, ["01103", "01099", "01099"]);
      return { expected: 2, actual: s.table!.first };
    },
  );
  check(
    "R21",
    "Mountains travel reveals its cost before becoming active",
    () => {
      let s = game();
      s.phase = "travel";
      const loc = unit("01078");
      s.staging = [loc];
      s.encounterDeck = ["01092", "01074"];
      s = settle(act(s, { type: "TRAVEL", id: loc.id }));
      assert.equal(s.activeLocation?.id, loc.id);
      assert.equal(s.encounterDeck[0], "01074");
      return {
        expected: false,
        actual: s.staging.some((u) => u.code === "01074"),
      };
    },
  );
  check("R22", "Wolf Rider waits until the end of combat to return", () => {
    let s = game();
    s.phase = "defense";
    const e = unit("01096"),
      next = unit("01091");
    e.shadows = ["01081"];
    s.engaged = [e, next];
    s.encounterDeck = ["01099", "01099"];
    s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: s.heroes[0].id });
    s = act(s, { type: "CHOOSE", id: s.heroes[2].id });
    assert.equal(s.phase, "defense");
    assert.ok(!s.encounterDeck.includes("01081"));
    s = reload(s);
    s = act(s, {
      type: "DEFEND",
      enemyId: next.id,
      defenderId: s.heroes[1].id,
    });
    s = act(s, { type: "END_ATTACKS" });
    assert.equal(s.pendingWolfReturns?.length, 0);
    return { expected: "01081", actual: s.encounterDeck[0] };
  });
  check(
    "R23",
    "Beastmaster deals its Forced shadow before Spearman responds",
    () => {
      let s = game("tactics");
      s.phase = "defense";
      const e = unit("01091");
      e.damage = card(e.code).health! - 1;
      const d = unit("01029");
      s.allies = [d];
      s.engaged = [e];
      s.encounterDeck = ["01099", "01099"];
      s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: d.id });
      return { expected: 1, actual: s.encounterDeck.length };
    },
  );
  check("R24", "Miner can discard Iron Shackles from a player deck", () => {
    let s = game("lore");
    s.shackles = 1;
    s = play(s, "01061");
    assert.ok(s.choice?.options.some((o) => o.id === "shackles-0"));
    s = act(reload(s), { type: "CHOOSE", id: "shackles-0" });
    assert.equal(s.shackles, 0);
    return { expected: true, actual: s.encounterDiscard.includes("01105") };
  });
  check(
    "R25",
    "Hero replacement increases every player campaign penalty",
    () => {
      let s = game("leadership", true, true);
      s.status = "won";
      s.campaign!.completed = [{ scenarioId: "mirkwood", score: 0, rounds: 1 }];
      s = continueCampaign(
        s,
        ["01002", "01007", "01005"],
        "leadership",
        true,
        42,
      );
      return { expected: [1, 1, 1], actual: s.campaign!.seatPenalties };
    },
  );
  check("R26", "Each player may voluntarily replace one hero", () => {
    const s = game("leadership", true, true);
    s.status = "won";
    s.campaign!.completed = [{ scenarioId: "mirkwood", score: 0, rounds: 1 }];
    const next = continueCampaign(
      s,
      ["01002", "01008", "01005"],
      "leadership",
      true,
      42,
    );
    assert.deepEqual(next.campaign!.seatPenalties, [2, 2, 2]);
    return { expected: 2, actual: next.campaign!.threatPenalty };
  });
  check(
    "R27",
    "Feint protects only the player engaged when it resolved",
    () => {
      let s = game("leadership", true);
      s.phase = "defense";
      const e = unit("01096"),
        other = unit("01096");
      s.engaged = [e, other];
      syncSeat(s);
      selectSeat(s, 2);
      s = play(s, "01034", e.id);
      selectSeat(s, 1);
      s.heroes[0].code = "01002";
      s.startingHeroes = ["01002"];
      s.deckId = "leadership";
      const son = unit("01015", 1);
      s.hand = [son];
      syncSeat(s);
      s = play(s, "01023");
      s = act(s, { type: "CHOOSE", id: son.id });
      s = act(s, { type: "CHOOSE", id: e.id });
      assert.equal(ownerOf(s, seatView(s, 1).engaged[0]), 1);
      assert.equal(s.table!.turn, 0);
      s = act(s, {
        type: "DEFEND",
        enemyId: other.id,
        defenderId: s.heroes[0].id,
      });
      return { expected: "defense", actual: s.phase };
    },
  );
  function chooseHeroes(s: GameState) {
    let n = 0;
    while (s.choice) {
      assert.ok(n++ < 20);
      assert.ok(
        s.choice.options
          .filter((o) => o.id !== "skip")
          .every((o) => s.heroes.some((h) => h.id === o.id)),
        "each player selects their own hero",
      );
      s = act(s, {
        type: "CHOOSE",
        id: s.choice.options.find((o) => o.id !== "skip")!.id,
      });
    }
    return s;
  }
  check("R28", "Every player can earn Valor for defeating a Hill Troll", () => {
    let s = game("leadership", true, true);
    s.scenarioId = "anduin";
    s.phase = "attack";
    const e = unit("01082");
    e.damage = 8;
    s.engaged = [e];
    s.heroes[0].tempAttack = 10;
    syncSeat(s);
    s = chooseHeroes(
      act(s, { type: "ATTACK", enemyId: e.id, attackerIds: [s.heroes[0].id] }),
    );
    return {
      expected: 3,
      actual: allCharacters(s)
        .flatMap((u) => u.attachments)
        .filter((a) => a.code === "rc133").length,
    };
  });
  check(
    "R29",
    "Every player receives Scarred after the first Hill Troll kill",
    () => {
      let s = game("leadership", true, true);
      s.scenarioId = "anduin";
      s.phase = "defense";
      const e = unit("01082"),
        d = unit("01016");
      s.engaged = [e];
      s.allies.push(d);
      syncSeat(s);
      s = chooseHeroes(
        act(s, { type: "DEFEND", enemyId: e.id, defenderId: d.id }),
      );
      return {
        expected: 3,
        actual: allCharacters(s)
          .flatMap((u) => u.attachments)
          .filter((a) => a.code === "rc138").length,
      };
    },
  );
  check("R30", "Only one Appointed by Fate is assigned, to any hero", () => {
    let s = game("leadership", true, true);
    s.status = "won";
    s.campaign!.completed = [
      { scenarioId: "mirkwood", score: 0, rounds: 1 },
      { scenarioId: "anduin", score: 0, rounds: 1 },
    ];
    s.campaign!.prisoner = "01005";
    s = drainReviews(
      continueCampaign(s, ["01001", "01007", "01005"], "leadership", true, 42),
    );
    assert.match(s.choice!.title, /Appointed by Fate/);
    assert.equal(s.choice!.options.length, 3);
    const target = seatView(s, 1).heroes[0].id;
    s = settle(act(s, { type: "CHOOSE", id: target }));
    assert.ok(
      seatView(s, 1).heroes[0].attachments.some((a) => a.code === "rc134"),
    );
    return {
      expected: 1,
      actual: [...allCharacters(s), ...(s.prisoner ? [s.prisoner] : [])]
        .flatMap((u) => u.attachments)
        .filter((a) => a.code === "rc134").length,
    };
  });

  test(`R01 (${guided}): objectives can replace Restricted attachments, and Plate removal checks health`, () => {
    let s = game("tactics");
    s.scenarioId = "dol-guldur";
    const h = s.heroes[0],
      plate = attach(h, "01040");
    attach(h, "01041");
    const objective = unit("01109");
    s.staging = [objective];
    h.damage = 5;
    const threat = s.threat;
    s = act(s, { type: "CLAIM", id: objective.id, heroId: h.id });
    assert.equal(s.threat, threat + 2);
    assert.equal(s.heroes[0].attachments.length, 3);
    s = act(reload(s), { type: "CHOOSE", id: plate.id });
    assert.ok(!s.heroes.some((x) => x.id === h.id));
    assert.ok(s.discard.includes(h.code));
    assert.ok(s.staging.some((x) => x.code === "01109"));
  });
  test(`R03 (${guided}): insufficient Web payment cannot partially pay`, () => {
    let s = game();
    s.phase = "attack";
    const h = s.heroes[0];
    attach(h, "01080");
    attach(h, "01080");
    h.resources = 3;
    h.exhausted = true;
    s = act(s, { type: "END_ATTACKS" });
    assert.equal(s.choice, null);
    assert.equal(s.heroes[0].exhausted, true);
    assert.equal(s.heroes[0].resources, 3);
  });
  test(`R04 R05 (${guided}): snapshot bonuses exclude newcomers and clear at phase end`, () => {
    let s = game();
    const f = unit("01014");
    s.allies.push(f);
    const base = stats(s, f);
    s = act(s, { type: "ABILITY", id: f.id });
    s = play(play(s, "01022"), "01022");
    s = play(s, "01013");
    const faramir = s.allies.find((a) => a.id === f.id)!,
      newcomer = s.allies.find((a) => a.code === "01013")!;
    assert.equal(stats(s, faramir).attack, base.attack + 2);
    assert.equal(stats(s, faramir).defense, base.defense + 2);
    assert.equal(stats(s, faramir).will, base.will + 1);
    assert.equal(stats(s, newcomer).attack, card(newcomer.code).attack);
    assert.equal(stats(s, newcomer).will, card(newcomer.code).willpower);
    s = act(reload(s), { type: "NEXT" });
    assert.deepEqual(
      stats(
        s,
        s.allies.find((a) => a.id === f.id)!,
      ),
      base,
    );
  });
  test(`R06 (${guided}): Fog stacks dynamically while Driven by Shadow affects its snapshot only`, () => {
    let s = game("leadership", true);
    s = stage(s, ["01118", "01118", "01114", "01099"]);
    assert.equal(stagingThreat(s), 5);
    s = act(s, { type: "NEXT" });
    assert.equal(stagingThreat(s), 3);
    s = game("leadership", true);
    s.staging = [unit("01114")];
    s = stage(s, ["01092", "01114", "01114", "01099"]);
    assert.deepEqual(
      s.staging.map((u) => u.tempThreat ?? 0),
      [1, 0, 0],
    );
    assert.equal(stagingThreat(s), 10);
  });
  test(`R07 (${guided}): prisoner owner threat elimination loses the whole hot-seat game`, () => {
    let s = game("leadership", true);
    s.scenarioId = "dol-guldur";
    selectSeat(s, 1);
    s.prisoner = s.heroes.shift()!;
    s.threat = 49;
    syncSeat(s);
    s = stage(s, ["01103", "01099", "01099"]);
    assert.equal(s.status, "lost");
    assert.match(s.reason, /prisoner/);
  });
  test(`R09 (${guided}): response order changes the result, and each response respects an active location`, () => {
    let s = game("tactics");
    s.phase = "attack";
    s.progress = 7;
    const l = s.heroes.find((h) => h.code === "01005")!;
    attach(l, "01039");
    const e = unit("01097");
    s.engaged = [e];
    s = act(s, { type: "ATTACK", enemyId: e.id, attackerIds: [l.id] });
    const skipped = act(s, { type: "CHOOSE", id: "skip" });
    assert.equal(skipped.progress, 7);
    assert.equal(skipped.stage, 1);
    let other = act(s, {
      type: "CHOOSE",
      id: s.choice!.options.find((o) => o.code === "01005")!.id,
    });
    other = act(other, {
      type: "CHOOSE",
      id: other.choice!.options.find((o) => o.code === "01039")!.id,
    });
    assert.equal(other.stage, 2);
    assert.equal(other.progress, 1);
    s.activeLocation = unit("01099");
    s.activeLocation.progress = 2;
    s = act(s, {
      type: "CHOOSE",
      id: s.choice!.options.find((o) => o.code === "01039")!.id,
    });
    assert.equal(s.activeLocation, null);
    assert.equal(s.progress, 7);
    s = act(s, {
      type: "CHOOSE",
      id: s.choice!.options.find((o) => o.code === "01005")!.id,
    });
    assert.equal(s.stage, 2);
    assert.equal(s.progress, 0);
  });
  test(`R10 (${guided}): normally played Hammersmith recovers, Stand and Fight does not`, () => {
    let s = game("lore");
    s.discard = ["01026"];
    s = play(s, "01059");
    s = settle(s);
    assert.ok(s.hand.some((u) => u.code === "01026"));
    s = game("spirit");
    s.discard = ["01026", "01059"];
    s = play(s, "01051", "discard-1");
    assert.ok(s.allies.some((u) => u.code === "01059"));
    assert.deepEqual(s.discard, ["01026", "01051"]);
    assert.ok(!s.hand.some((u) => u.code === "01026"));
  });
  test(`R18 R19 (${guided}): controlled attachments on enemies can be discarded, borrowed hero gear returns to owner`, () => {
    let s = game("leadership", true);
    const hero = seatView(s, 1).heroes[0],
      a = attach(hero, "01026", 0);
    selectSeat(s, 1);
    s.phase = "defense";
    s.table!.turn = 1;
    const enemy = unit("01096", 1);
    enemy.shadows = ["01092"];
    s.engaged = [enemy];
    syncSeat(s);
    s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: hero.id });
    s = act(s, { type: "CHOOSE", id: a.id });
    assert.ok(seatView(s, 0).discard.includes("01026"));
    assert.ok(!seatView(s, 1).discard.includes("01026"));
    s = game("lore");
    s.phase = "defense";
    const trapped = unit("01096"),
      spider = unit("01096");
    spider.shadows = ["01096"];
    const snare = attach(trapped, "01069");
    s.engaged = [spider, trapped];
    s = act(s, {
      type: "DEFEND",
      enemyId: spider.id,
      defenderId: s.heroes[0].id,
    });
    assert.ok(s.choice!.options.some((o) => o.id === snare.id));
    s = act(s, { type: "CHOOSE", id: snare.id });
    assert.ok(s.discard.includes("01069"));
  });
  test(`R22 (${guided}): nested Wolf Rider attacks each return one card only at combat end`, () => {
    let s = game();
    s.phase = "defense";
    const e = unit("01096");
    e.shadows = ["01081"];
    s.engaged = [e];
    s.encounterDeck = ["01081", "01099"];
    s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: s.heroes[0].id });
    s = act(s, { type: "CHOOSE", id: s.heroes[1].id });
    s = act(s, { type: "CHOOSE", id: s.heroes[2].id });
    assert.equal(s.phase, "attack");
    assert.equal(s.pendingWolfReturns?.length, 2);
    assert.ok(!s.encounterDeck.includes("01081"));
    s = act(reload(s), { type: "END_ATTACKS" });
    assert.deepEqual(s.encounterDeck.slice(0, 2), ["01081", "01081"]);
    assert.ok(!s.encounterDiscard.includes("01081"));
  });
  test(`save migration (${guided}): legacy modifiers bind once, invalid new state is rejected`, () => {
    const s = game();
    s.faramir = 1;
    s.gondor = true;
    const saved = JSON.parse(JSON.stringify(s)),
      loaded = restoreSave(saved)!;
    assert.equal(loaded.faramir, 0);
    assert.equal(loaded.gondor, false);
    assert.equal(
      stats(loaded, loaded.heroes[0]).will,
      card(loaded.heroes[0].code).willpower! + 1,
    );
    assert.equal(
      stats(loaded, loaded.heroes[0]).attack,
      card(loaded.heroes[0].code).attack! + 1,
    );
    assert.deepEqual(restoreSave(loaded), loaded);
    for (const patch of [
      { fog: -1 },
      { fog: "1" },
      { pendingWolfReturns: ["01096"] },
    ])
      assert.equal(restoreSave({ ...s, ...patch }), null);
    const enemy = unit("01096");
    s.engaged = [enemy];
    for (const preventedAttacks of [[-1], [0, 0], ["0"]]) {
      const bad = JSON.parse(JSON.stringify(s));
      bad.engaged[0].preventedAttacks = preventedAttacks;
      assert.equal(restoreSave(bad), null);
    }
  });
  test(`R24 (${guided}): Iron Shackles becomes one deck Condition, without a duplicate shadow discard`, () => {
    let s = game("lore");
    s.phase = "defense";
    const e = unit("01096");
    e.shadows = ["01105"];
    s.engaged = [e];
    s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: s.heroes[0].id });
    assert.equal(s.shackles, 1);
    assert.ok(!s.engaged[0].shadows.includes("01105"));
    s = act(s, { type: "END_ATTACKS" });
    assert.ok(!s.encounterDiscard.includes("01105"));
    s = act(s, { type: "NEXT" });
    assert.equal(s.shackles, 0);
    assert.equal(
      s.encounterDiscard.filter((code) => code === "01105").length,
      1,
    );
  });
  test(`R18 R19 (${guided}): Despair discards one controlled attachment when defended, all when undefended`, () => {
    let s = game();
    s.phase = "defense";
    const hero = s.heroes[0],
      blade = attach(hero, "01039");
    attach(hero, "01080");
    const enemy = unit("01096");
    enemy.shadows = ["01103"];
    s.engaged = [enemy];
    let defended = act(s, {
      type: "DEFEND",
      enemyId: enemy.id,
      defenderId: hero.id,
    });
    assert.equal(defended.choice!.options.length, 1);
    defended = act(defended, { type: "CHOOSE", id: blade.id });
    assert.equal(defended.heroes[0].attachments[0].code, "01080");
    const undefended = act(s, { type: "DEFEND", enemyId: enemy.id });
    assert.equal(undefended.heroes[0].attachments.length, 1);
    assert.equal(undefended.heroes[0].attachments[0].code, "01080");
    assert.match(undefended.choice!.description!, /undefended damage/);
  });
  test(`R08 (${guided}): transferred Orc Guard retains its facedown card owner when returned or destroyed`, () => {
    let s = game("leadership", true);
    s.scenarioId = "dol-guldur";
    s.stage = 3;
    const orc = unit("orc-guard", 1);
    orc.facedownCard = "01044";
    seatView(s, 1).engaged.push(orc);
    s = play(s, "01015");
    s = act(s, { type: "CHOOSE", id: orc.id });
    assert.equal(s.engaged[0].owner, 1);
    const combat = structuredClone(s);
    selectSeat(s, 1);
    s = play(s, "01052", orc.id);
    assert.ok(seatView(s, 1).discard.includes("01044"));
    assert.ok(!seatView(s, 0).discard.includes("01044"));
    combat.phase = "attack";
    combat.table!.turn = 0;
    selectSeat(combat, 0);
    const destroyed = act(combat, {
      type: "ATTACK",
      enemyId: orc.id,
      attackerIds: [combat.heroes[0].id],
    });
    assert.ok(seatView(destroyed, 1).discard.includes("01044"));
    assert.ok(!seatView(destroyed, 0).discard.includes("01044"));
  });
}
