import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { STARTERS, card } from "../src/game/cards";
import {
  createGame,
  validateSave,
  restoreSave,
  questWill,
  stats,
  continueCampaign,
  retryAdventure,
  playTargets,
  canPlay,
  characters,
  newCampaign,
} from "../src/game/engine";
import {
  activeSeat,
  allCharacters,
  allEngaged,
  eachSeat,
  seatView,
  selectSeat,
  syncSeat,
  defendersFor,
  attackersFor,
  livingSeats,
  ownerOf,
} from "../src/game/table";
import type { GameState, Unit, ScenarioId, Action } from "../src/game/types";
const config = [
  { heroes: ["01001"], deckId: "leadership" },
  { heroes: ["01007"], deckId: "spirit" },
  { heroes: ["01005"], deckId: "tactics" },
];
const playerConfig = STARTERS.map((d) => ({ heroes: d.heroes, deckId: d.id }));
let counter = 90000;
const unit = (code: string, owner = 0): Unit => ({
  id: `hotseat-${counter++}`,
  owner,
  code,
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
function make(
  n = 3,
  seed = 72,
  scenarioId: ScenarioId = "mirkwood",
  campaign = false,
) {
  const d = STARTERS[0];
  return createGame(seed, d.cards, d.heroes, d.id, {
    seats: config.slice(0, n),
    scenarioId,
    playMode: campaign ? "campaign" : "normal",
  });
}
function settle(s: GameState) {
  let i = 0;
  while (s.choice && s.status === "playing") {
    assert.ok(i++ < 100);
    s = act(s, {
      type: "CHOOSE",
      id: (
        s.choice.options.find((o) => o.id === "skip") ??
        s.choice.options.find((o) => o.id === "resolve") ??
        s.choice.options[0]
      ).id,
    });
  }
  return s;
}
function planning(n = 3) {
  let s = settle(make(n));
  while (s.phase === "setup") s = settle(act(s, { type: "KEEP" }));
  return s;
}
function prepare(s: GameState) {
  syncSeat(s);
  return s;
}
for (const n of [1, 2, 3])
  test(`${n} hero seats: independent starter lists, hand, threat, resources and save round trip`, () => {
    let s = make(n);
    assert.equal(s.table!.seats.length, n);
    assert.equal(s.staging.length, 2);
    assert.equal(s.encounterDeck.length, 34);
    for (let i = 0; i < n; i++) {
      const p = seatView(s, i);
      assert.equal(p.heroes.length, 1);
      assert.equal(p.heroes[0].code, config[i].heroes[0]);
      assert.equal(p.threat, card(config[i].heroes[0]).threat);
      assert.equal(p.hand.length, 6);
      assert.equal(p.deck.length, 24);
    }
    assert.ok(validateSave(s));
    assert.deepEqual(restoreSave(JSON.parse(JSON.stringify(s))), s);
    while (s.phase === "setup") s = act(s, { type: "KEEP" });
    assert.equal(s.round, 1);
    for (let i = 0; i < n; i++) {
      const p = seatView(s, i);
      assert.equal(p.heroes[0].resources, 1);
      assert.equal(p.hand.length, 7);
      assert.equal(p.deck.length, 23);
    }
    assert.equal(allCharacters(s).length, n);
  });
test("mulligans and planning stay with their hero; resources cannot be pooled between seats", () => {
  let s = make(),
    original = JSON.stringify(seatView(s, 1).hand);
  s = act(s, { type: "MULLIGAN" });
  assert.equal(JSON.stringify(seatView(s, 1).hand), original);
  s = act(s, { type: "KEEP" });
  s = act(s, { type: "MULLIGAN" });
  assert.equal(s.mulled, true);
  assert.equal(seatView(s, 0).mulled, true);
  s = act(s, { type: "KEEP" });
  s = act(s, { type: "KEEP" });
  s.hand = [unit("01014")];
  s.heroes[0].resources = 1;
  seatView(s, 1).heroes[0].resources = 10;
  assert.throws(() => act(s, { type: "PLAY", id: s.hand[0].id }), /resources/);
  const phase = s.phase;
  s = act(prepare(s), { type: "NEXT" });
  assert.equal(s.phase, phase);
  assert.equal(activeSeat(s), 1);
  s = act(s, { type: "SELECT_SEAT", seat: 0 });
  assert.throws(() => act(s, { type: "NEXT" }), /turn/);
});
test("every fellowship commits, then exactly one encounter per player is revealed and quest strength is shared", () => {
  let s = planning();
  s.encounterDeck = Array(20).fill("01099");
  for (let i = 0; i < 3; i++) s = act(s, { type: "NEXT" });
  for (let i = 0; i < 3; i++) {
    s = act(s, { type: "TOGGLE_QUEST", id: s.heroes[0].id });
    s = settle(act(s, { type: "COMMIT" }));
    if (i < 2) assert.equal(s.encounterDeck.length, 20);
  }
  assert.equal(s.phase, "staging");
  assert.equal(s.encounterDeck.length, 17);
  assert.equal(questWill(s), 7);
  const threats = s.table!.seats.map((p) => p.threat);
  s = act(s, { type: "NEXT" });
  assert.equal(s.lastQuest!.will, 7);
  assert.deepEqual(
    s.table!.seats.map((p) => p.threat),
    threats,
  );
});
test("failed quests and refresh raise each threat; first player rotates once per full round", () => {
  let s = planning();
  s.phase = "staging";
  s.staging = [unit("01099")];
  s.lastQuest = null;
  const threat = s.table!.seats.map((p) => p.threat);
  s = act(s, { type: "NEXT" });
  assert.deepEqual(
    s.table!.seats.map((p) => p.threat),
    threat.map((n) => n + 1),
  );
  s.phase = "attack";
  s.table!.passed = [];
  s.table!.turn = 0;
  for (let i = 0; i < 3; i++) s = act(s, { type: "END_ATTACKS" });
  assert.equal(s.phase, "refresh");
  assert.deepEqual(
    s.table!.seats.map((p) => p.threat),
    threat.map((n) => n + 2),
  );
  s = act(s, { type: "NEXT" });
  assert.equal(s.round, 2);
  assert.equal(s.table!.first, 1);
  assert.equal(s.table!.turn, 1);
  assert.equal(s.table!.active, 1);
  for (const p of s.table!.seats) assert.equal(p.hand.length, 8);
});
test("engagement checks alternate between eligible fellowships; all defend before player attacks", () => {
  let s = planning();
  s.phase = "encounter";
  s.table!.passed = [];
  s.staging = [unit("01089"), unit("01089"), unit("01089")];
  eachSeat(s, () => {
    s.threat = 25;
  });
  s.encounterDeck = Array(20).fill("01099");
  for (let i = 0; i < 3; i++) s = settle(act(s, { type: "NEXT" }));
  assert.equal(s.phase, "defense");
  assert.deepEqual(
    s.table!.seats.map((p) => p.engaged.length),
    [1, 1, 1],
  );
  for (let i = 0; i < 3; i++) {
    assert.equal(activeSeat(s), i);
    s = settle(
      act(s, {
        type: "DEFEND",
        enemyId: s.engaged[0].id,
        defenderId: s.heroes[0].id,
      }),
    );
    if (i < 2) assert.equal(s.phase, "defense");
  }
  assert.equal(s.phase, "attack");
  assert.equal(activeSeat(s), 0);
});
test("other fellowships can supply Sentinel defenders and Ranged attackers", () => {
  let s = planning();
  s.phase = "defense";
  s.engaged = [unit("01089")];
  s.encounterDeck = [];
  const aragorn = s.heroes[0];
  selectSeat(s, 1);
  s.engaged = [unit("01089", 1)];
  s.table!.turn = 1;
  syncSeat(s);
  assert.ok(defendersFor(s).some((u) => u.id === aragorn.id));
  s = act(s, {
    type: "DEFEND",
    enemyId: s.engaged[0].id,
    defenderId: aragorn.id,
  });
  assert.equal(seatView(s, 0).heroes[0].exhausted, true);
  s = planning();
  s.phase = "attack";
  s.engaged = [unit("01082")];
  const enemy = s.engaged[0],
    legolas = seatView(s, 2).heroes[0];
  assert.ok(attackersFor(s, enemy).some((u) => u.id === legolas.id));
  s = act(s, {
    type: "ATTACK",
    enemyId: enemy.id,
    attackerIds: [s.heroes[0].id, legolas.id],
  });
  assert.equal(seatView(s, 2).heroes[0].exhausted, true);
  assert.equal(s.engaged[0].damage, 3);
  selectSeat(s, 1);
  s.table!.turn = 1;
  assert.throws(
    () =>
      act(prepare(s), {
        type: "ATTACK",
        enemyId: enemy.id,
        attackerIds: [s.heroes[0].id],
      }),
    /ready/,
  );
});
test("one eliminated seat returns enemies to staging while surviving heroes keep playing", () => {
  let s = planning();
  s.phase = "staging";
  s.threat = 49;
  s.staging = [unit("01099")];
  s.engaged = [unit("01096")];
  s = act(prepare(s), { type: "NEXT" });
  assert.equal(s.status, "playing");
  assert.equal(s.table!.seats[0].eliminated, true);
  assert.equal(s.table!.seats[0].heroes.length, 0);
  assert.equal(s.table!.seats[0].engaged.length, 0);
  assert.ok(s.staging.some((u) => u.code === "01096"));
  assert.equal(livingSeats(s).length, 2);
  assert.ok(validateSave(s));
});
test("when-revealed effects apply to each player, with separate serialized choices", () => {
  let s = planning();
  s.phase = "quest";
  s.table!.passed = [0, 1];
  s.table!.turn = 2;
  selectSeat(s, 2);
  s.encounterDeck = ["01074", "01099", "01099"];
  eachSeat(s, () => {
    s.hand = [];
  });
  s = act(s, { type: "COMMIT" });
  assert.equal(s.choice!.title, "Choose a character to exhaust");
  assert.equal(activeSeat(s), 0);
  for (let i = 0; i < 3; i++) {
    assert.ok(validateSave(s));
    s = restoreSave(JSON.parse(JSON.stringify(s)))!;
    assert.equal(activeSeat(s), i);
    s = act(s, { type: "CHOOSE", id: s.choice!.options[0].id });
  }
  assert.equal(s.phase, "staging");
  assert.ok(allCharacters(s).every((u) => u.exhausted));
});
test("Spirit cancels another player's reveal from its own resource pool", () => {
  let s = planning();
  s.phase = "quest";
  s.table!.passed = [0, 1];
  s.table!.turn = 2;
  selectSeat(s, 2);
  s.encounterDeck = ["01093", "01099", "01099"];
  eachSeat(s, (i) => {
    s.hand = i === 1 ? [unit("01050", 1)] : [];
  });
  s = act(s, { type: "COMMIT" });
  assert.ok(s.choice?.options.some((o) => o.id === "cancel-1"));
  s = act(s, { type: "CHOOSE", id: "cancel-1" });
  assert.equal(seatView(s, 1).heroes[0].resources, 0);
  assert.equal(seatView(s, 0).heroes[0].resources, 1);
  assert.ok(seatView(s, 1).discard.includes("01050"));
  assert.equal(s.phase, "staging");
});
test("cross-seat attachments return to their owner and heal targets include the whole company", () => {
  let s = planning();
  s.heroes[0].resources = 5;
  s.hand = [unit("01027")];
  const hero = seatView(s, 1).heroes[0];
  assert.ok(playTargets(s, s.hand[0]).some((u) => u.id === hero.id));
  s = act(s, { type: "PLAY", id: s.hand[0].id, target: hero.id });
  assert.equal(seatView(s, 1).heroes[0].attachments[0].owner, 0);
  s.phase = "staging";
  eachSeat(s, (i) => {
    if (i === 1) s.threat = 49;
  });
  s.staging = [unit("01099")];
  s = act(prepare(s), { type: "NEXT" });
  assert.ok(seatView(s, 0).discard.includes("01027"));
  assert.ok(!seatView(s, 1).discard.includes("01027"));
});
test("campaign continuation and retry preserve all hero decks and the shared replacement penalty", () => {
  let s = make(3, 9, "mirkwood", true);
  while (s.phase === "setup") s = act(s, { type: "KEEP" });
  s.phase = "staging";
  s.stage = 3;
  s.branch = "beorn";
  s.progress = 10;
  s.staging = [];
  s = act(s, { type: "NEXT" });
  assert.equal(s.status, "won");
  const heroes = ["01002", "01007", "01005"];
  s = settle(continueCampaign(s, heroes, "leadership", true, 44));
  assert.equal(s.table!.seats.length, 3);
  assert.deepEqual(
    s.table!.seats.map((p) => p.startingHeroes[0]),
    heroes,
  );
  assert.deepEqual(s.campaign!.seatPenalties, [1, 1, 1]);
  assert.ok(seatView(s, 0).threat >= 9);
  assert.ok(seatView(s, 1).threat >= 9);
  assert.ok(validateSave(s));
  const retry = settle(retryAdventure(s, 78));
  assert.deepEqual(
    retry.table!.seats.map((p) => p.deckId),
    ["leadership", "spirit", "tactics"],
  );
  assert.ok(validateSave(retry));
});
test("the campaign prisoner returns to the correct hero seat after rescue", () => {
  const d = STARTERS[0],
    campaign = newCampaign(config.flatMap((p) => p.heroes));
  campaign.completed = [
    { scenarioId: "mirkwood", score: 70, rounds: 6 },
    { scenarioId: "anduin", score: 80, rounds: 8 },
  ];
  campaign.boons = ["rc132"];
  campaign.prisoner = "01007";
  let s = settle(
    createGame(42, d.cards, d.heroes, d.id, {
      seats: config,
      scenarioId: "dol-guldur",
      playMode: "campaign",
      campaign,
    }),
  );
  assert.equal(s.prisoner?.code, "01007");
  assert.equal(s.prisoner?.owner, 1);
  assert.equal(seatView(s, 1).heroes.length, 0);
  assert.ok(!s.table!.seats[1].eliminated);
  while (s.phase === "setup") s = settle(act(s, { type: "KEEP" }));
  s.phase = "staging";
  s.stage = 2;
  s.staging = [];
  s.activeLocation = null;
  selectSeat(s, 0);
  s.heroes[0].committed = true;
  s.heroes[0].tempWill = 20;
  s = settle(act(prepare(s), { type: "NEXT" }));
  assert.equal(s.prisoner, null);
  assert.equal(seatView(s, 1).heroes[0].code, "01007");
  assert.equal(seatView(s, 1).heroes[0].damage, 1);
  assert.equal(seatView(s, 1).heroes[0].resources, 0);
  assert.equal(seatView(s, 0).heroes.length, 1);
  assert.equal(seatView(s, 2).heroes.length, 1);
  assert.ok(s.staging.some((u) => u.code === "01102"));
  assert.ok(validateSave(s));
});
test("invalid seat indices, duplicate heroes and corrupt saves are rejected", () => {
  const s = make();
  assert.throws(() => act(s, { type: "SELECT_SEAT", seat: 7 }));
  const bad = structuredClone(s);
  bad.table!.seats[1].hand[0].id = bad.table!.seats[0].hand[0].id;
  assert.equal(restoreSave(bad), null);
  const badQueue = structuredClone(s);
  badQueue.queue = [{ kind: "draw", player: 8 }];
  assert.equal(restoreSave(badQueue), null);
  assert.throws(
    () =>
      createGame(9, STARTERS[0].cards, STARTERS[0].heroes, STARTERS[0].id, {
        seats: [config[0], config[0]],
      }),
    /different/,
  );
});
const coreScenarios = ["mirkwood", "anduin", "dol-guldur"] as const;
const importedLostRealmScenario = (id: ScenarioId) =>
  id === "the-weather-hills" || id === "deadmens-dike";
for (const scenarioId of [
  ...coreScenarios,
  "the-weather-hills",
  "deadmens-dike",
] as const)
  for (const campaign of importedLostRealmScenario(scenarioId)
    ? [false]
    : [false, true])
    test(`hot-seat ${scenarioId} ${campaign ? "campaign" : "normal"}: complete seeded games with save checks`, (t) => {
      const outcomes = {
        normal: { won: 0, lost: 0 },
        easy: { won: 0, lost: 0 },
      };
      for (const easy of importedLostRealmScenario(scenarioId)
        ? [false, true]
        : [false])
        for (const n of [1, 2, 3, 4])
          for (let seed = 1; seed <= 8; seed++) {
            const d = STARTERS[0],
              heroes = playerConfig.slice(0, n).flatMap((p) => p.heroes),
              c = campaign ? newCampaign(heroes) : undefined;
            if (c) {
              c.completed = coreScenarios
                .slice(
                  0,
                  coreScenarios.indexOf(
                    scenarioId as (typeof coreScenarios)[number],
                  ),
                )
                .map((scenarioId) => ({ scenarioId, score: 60, rounds: 5 }));
              if (scenarioId !== "mirkwood") c.boons = ["rc132"];
            }
            let s = createGame(seed, d.cards, d.heroes, d.id, {
                seats: playerConfig.slice(0, n),
                scenarioId,
                guided: seed <= 2,
                easy,
                playMode: campaign ? "campaign" : "normal",
                ...(campaign ? { campaign: c } : {}),
              }),
              steps = 0;
            while (
              (s.status === "playing" || s.flow?.pending) &&
              steps++ < 4000
            ) {
              let a: Action;
              if (s.flow?.pending)
                a = { type: "CONTINUE", stepId: s.flow.pending.id };
              else if (s.choice)
                a = {
                  type: "CHOOSE",
                  id: (
                    s.choice.options.find((o) => o.id === "skip") ??
                    s.choice.options.find((o) => o.id === "resolve") ??
                    s.choice.options[0]
                  ).id,
                };
              else if (s.phase === "setup") a = { type: "KEEP" };
              else if (s.phase === "planning") {
                const u = s.hand.find(
                  (u) => !canPlay(s, u) && card(u.code).type_code === "ally",
                );
                a = u ? { type: "PLAY", id: u.id } : { type: "NEXT" };
              } else if (s.phase === "quest") {
                const u = characters(s).find(
                  (u) => !u.exhausted && !s.committedIds.includes(u.id),
                );
                a = u ? { type: "TOGGLE_QUEST", id: u.id } : { type: "COMMIT" };
              } else if (s.phase === "defense") {
                const e = s.engaged.find(
                  (u) =>
                    !u.attacked &&
                    !u.feinted &&
                    !u.attachments.some((a) => a.code === "01069"),
                );
                assert.ok(e, `no pending enemy ${scenarioId}/${seed}/${n}`);
                a = {
                  type: "DEFEND",
                  enemyId: e.id,
                  defenderId: defendersFor(s)[0]?.id ?? null,
                };
              } else if (s.phase === "attack") {
                const e = s.engaged.find(
                  (e) =>
                    !e.attackedBy?.includes(activeSeat(s)) &&
                    attackersFor(s, e).some(
                      (u) => ownerOf(s, u) === activeSeat(s),
                    ),
                );
                a = e
                  ? {
                      type: "ATTACK",
                      enemyId: e.id,
                      attackerIds: attackersFor(s, e).map((u) => u.id),
                    }
                  : { type: "END_ATTACKS" };
              } else if (
                s.phase === "travel" &&
                !s.activeLocation &&
                s.staging.some((u) => u.code === "01088")
              )
                a = {
                  type: "TRAVEL",
                  id: s.staging.find((u) => u.code === "01088")!.id,
                };
              else a = { type: "NEXT" };
              try {
                s = act(s, a);
              } catch (e) {
                throw new Error(
                  `${scenarioId}/${campaign}/${easy ? "easy" : "normal"}/${n}/${seed} ${s.phase} seat ${activeSeat(s)} ${JSON.stringify(a)}: ${e}`,
                );
              }
              assert.ok(
                validateSave(s),
                `invalid save ${scenarioId}/${campaign}/${easy ? "easy" : "normal"}/${n}/${seed} ${s.phase} step ${steps}`,
              );
              const restored = restoreSave(JSON.parse(JSON.stringify(s)));
              assert.ok(restored);
              if (importedLostRealmScenario(scenarioId)) s = restored;
              assert.ok(
                allCharacters(s).every((u) => u.damage < stats(s, u).health),
              );
              assert.equal(
                new Set(allCharacters(s).map((u) => u.id)).size,
                allCharacters(s).length,
              );
            }
            assert.notEqual(
              s.status,
              "playing",
              `stuck ${scenarioId}/${campaign}/${easy ? "easy" : "normal"}/${n}/${seed} phase ${s.phase}`,
            );
            outcomes[easy ? "easy" : "normal"][s.status as "won" | "lost"]++;
          }
      if (importedLostRealmScenario(scenarioId)) {
        assert.equal(outcomes.normal.won + outcomes.normal.lost, 32);
        assert.equal(outcomes.easy.won + outcomes.easy.lost, 32);
        const title =
          scenarioId === "the-weather-hills"
            ? "Weather Hills"
            : "Deadmen's Dike";
        t.diagnostic(`${title} complete games: ${JSON.stringify(outcomes)}`);
      }
    });

test("support events choose the benefiting seat; Galadhrim's Greeting can help everyone", () => {
  let s = planning();
  s.hand = [unit("01046", 1)];
  selectSeat(s, 1);
  s.hand = [unit("01046", 1)];
  s.heroes[0].resources = 3;
  s.table!.turn = 1;
  const before = s.table!.seats.map((p, i) => seatView(s, i).threat);
  s = act(prepare(s), { type: "PLAY", id: s.hand[0].id });
  assert.equal(s.choice!.title, "The Galadhrim’s Greeting");
  s = act(s, { type: "CHOOSE", id: "everyone" });
  assert.deepEqual(
    s.table!.seats.map((p) => p.threat),
    before.map((n) => n - 2),
  );
  s = planning();
  s.allies = [unit("01014")];
  s = act(prepare(s), { type: "ABILITY", id: s.allies[0].id });
  s = act(s, { type: "CHOOSE", id: "player-1" });
  assert.equal(stats(s, seatView(s, 1).heroes[0]).will, 5);
  assert.equal(stats(s, seatView(s, 0).heroes[0]).will, 2);
});
test("Éowyn accepts one discarded card from each player per round", () => {
  let s = planning();
  s.phase = "staging";
  const eowyn = seatView(s, 1).heroes[0];
  for (let i = 0; i < 3; i++) {
    selectSeat(s, i);
    const count = s.hand.length;
    s = act(prepare(s), { type: "ABILITY", id: eowyn.id });
    s = act(s, { type: "CHOOSE", id: s.choice!.options[0].id });
    assert.equal(seatView(s, i).hand.length, count - 1);
    assert.throws(() => act(s, { type: "ABILITY", id: eowyn.id }), /once/);
  }
  assert.equal(stats(s, seatView(s, 1).heroes[0]).will, 7);
});
test("Wandering Took transfers control once and returns to its original owner's discard", () => {
  let s = planning();
  s.phase = "staging";
  s.allies = [unit("01043")];
  const id = s.allies[0].id;
  s = act(prepare(s), { type: "ABILITY", id });
  s = act(s, { type: "CHOOSE", id: "player-1" });
  assert.equal(seatView(s, 0).allies.length, 0);
  assert.equal(seatView(s, 1).allies.length, 1);
  assert.equal(seatView(s, 0).threat, 9);
  assert.equal(seatView(s, 1).threat, 12);
  selectSeat(s, 1);
  assert.throws(() => act(prepare(s), { type: "ABILITY", id }), /once/);
  s.allies[0].damage = 99;
  s = act(s, { type: "NEXT" });
  assert.ok(seatView(s, 0).discard.includes("01043"));
  assert.ok(!seatView(s, 1).discard.includes("01043"));
});
test("Stand and Fight retrieves another player's ally with the correct cost, control and ownership", () => {
  let s = planning();
  s.discard = ["01014"];
  selectSeat(s, 1);
  s.table!.turn = 1;
  s.hand = [unit("01051", 1)];
  s.heroes[0].resources = 4;
  const t = playTargets(s, s.hand[0]).find((u) => u.code === "01014")!;
  assert.ok(t);
  s = act(prepare(s), { type: "PLAY", id: s.hand[0].id, target: t.id });
  assert.equal(s.heroes[0].resources, 0);
  assert.equal(s.allies[0].code, "01014");
  assert.equal(s.allies[0].owner, 0);
  assert.ok(!seatView(s, 0).discard.includes("01014"));
  assert.ok(validateSave(s));
});
test("an attachment is activated by the receiving hero's controller", () => {
  let s = planning();
  s.hand = [unit("01026")];
  s.heroes[0].resources = 3;
  const target = seatView(s, 2).heroes[0].id;
  s = act(prepare(s), { type: "PLAY", id: s.hand[0].id, target });
  const a = seatView(s, 2).heroes[0].attachments[0];
  assert.throws(
    () => act(s, { type: "ABILITY", id: target, attachmentId: a.id }),
    /control/,
  );
  assert.equal(a.owner, 0);
  selectSeat(s, 2);
  s = act(prepare(s), { type: "ABILITY", id: target, attachmentId: a.id });
  assert.equal(seatView(s, 2).heroes[0].resources, 3);
  assert.equal(seatView(s, 0).heroes[0].resources, 1);
});
test("Under the Shadow and Massing at Night scale with active player count", () => {
  let s = planning();
  s.phase = "quest";
  s.table!.passed = [0, 1];
  s.table!.turn = 2;
  selectSeat(s, 2);
  eachSeat(s, () => {
    s.hand = [];
  });
  s.encounterDeck = ["01104", "01112", ...Array(15).fill("01099")];
  s = settle(act(prepare(s), { type: "COMMIT" }));
  assert.equal(s.threatModifier, 3);
  assert.equal(s.encounterDeck.length, 11);
  assert.equal(s.phase, "staging");
});
