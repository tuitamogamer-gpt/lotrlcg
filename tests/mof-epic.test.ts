import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  applyAction,
  createGame,
  publicState,
  restoreSave,
  retryAdventure,
  validateSave,
} from "../src/game/engine";
import { STARTERS, card } from "../src/game/cards";
import { engagementCost, fx, make, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { epicTeams, selectTeam } from "../src/game/epic";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { automatedScenarioId, isAutomatedCard } from "../src/game/support";
import { firstPlayer, playerOrder, seatView } from "../src/game/table";
import { BG } from "../src/game/black-gate-support";
import { MD } from "../src/game/mount-doom-support";
import {
  ME,
  MOF_EPIC_CARDS,
  meEye,
  mofEpicPublicState,
} from "../src/game/mof-epic-support";
import { autoplay } from "./nightmare-fixtures";
import art from "./mof-epic-art.json";
import type { GameState, ScenarioId, Unit } from "../src/game/types";

const D = STARTERS[0];
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const teamsOf = (sizes: number[]) => {
  let offset = 0;
  return sizes.map((n) =>
    Array.from({ length: n }, () => {
      const d = STARTERS[offset++ % STARTERS.length];
      return { deckId: d.id, heroes: [...d.heroes] };
    }),
  );
};
function create(
  sizes = [1, 1],
  seed = 41,
  scenarioId = "the-black-gate-opens",
) {
  return createGame(seed, D.cards, D.heroes, D.id, {
    scenarioId: scenarioId as ScenarioId,
    epic: teamsOf(sizes),
  });
}
function reload(s: GameState) {
  const raw = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(raw), "the epic save validates");
  const restored = restoreSave(raw);
  assert.ok(restored);
  return restored;
}
function drive(s: GameState, until: (s: GameState) => boolean, limit = 4000) {
  for (let i = 0; s.status === "playing" && !until(s); i++) {
    assert.ok(i < limit, "the epic game reaches the expected point");
    s = autoplay(s, 1);
  }
  return s;
}
const planning = (round: number) => (s: GameState) =>
  s.round === round &&
  s.epicTeam === 0 &&
  s.phase === "planning" &&
  !s.choice &&
  !s.flow?.pending;
const team = (s: GameState, i: number) => epicTeams(s)[i];
/**
 * Each team in its planning phase of the same round with nothing queued and
 * no team waiting.
 */
function quiet(s: GameState) {
  for (const t of epicTeams(s))
    Object.assign(t, {
      round: s.round,
      phase: "planning",
      queue: [],
      choice: null,
      combat: null,
      suspendedCombats: [],
      stageRevealing: false,
    });
  s.epic!.held = [];
  s.epic!.pass = [];
  return s;
}
function table(sizes = [1, 1], seed = 41) {
  return quiet(drive(create(sizes, seed), planning(1)));
}
const run = (s: GameState, ...effects: ReturnType<typeof fx>[]) => {
  s.queue.push(...effects);
  flush(s);
  return s;
};
const choose = (s: GameState, id: string) => {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    JSON.stringify(s.choice?.options.map((o) => o.id)),
  );
  return applyAction(reload(s), { type: "CHOOSE", id });
};
const add = (t: GameState, code: string, patch: Partial<Unit> = {}) => {
  const u = Object.assign(make(t, code), patch);
  t.staging.push(u);
  return u;
};
const staged = (t: GameState, code: string) =>
  t.staging.filter((u) => u.code === code);
const kinds = (t: GameState) => t.queue.map((e) => `${e.kind}:${e.player}`);
const H = (s: GameState) => batch4Scenario(s);
const roundEnd = (s: GameState) => run(s, ...H(s).roundEnd!(s));
/** Every encounter card a team's game holds outside its players' areas. */
const encounterCards = (t: GameState) => [
  ...t.encounterDeck,
  ...t.encounterDiscard,
  ...t.staging.map((u) => u.code),
  ...playerOrder(t).flatMap((p) => seatView(t, p).engaged.map((u) => u.code)),
];

test("The Mountain of Fire's epic cards follow the reviewed scans and every face is pinned", () => {
  assert.deepEqual(
    MOF_EPIC_CARDS.map((c) => [
      c.name,
      c.type_code,
      c.quantity,
      !!c.is_unique,
      c.position,
    ]),
    [
      ["Epic Multiplayer Mode", "campaign", 1, false, 80],
      ["The Eye of Sauron", "objective", 1, true, 81],
      ["The Eye of Sauron", "objective", 1, true, 82],
      ["In Darkness Bind Them", "treachery", 2, false, 64],
    ],
  );
  // The scans correct the catalog.
  const mode = card(ME.mode);
  assert.match(
    mode.back_text!,
    /if the last player at either scenario is eliminated, both teams lose the game\. If the Mount Doom scenario is defeated, both teams win the game\.$/,
  );
  assert.equal(mode.back_text!.split("\n").length, 3, "three paragraphs");
  assert.doesNotMatch(mode.back_text!, /straining|Gandalf/, "no flavour");
  assert.match(
    card(ME.eyeDoom).text!,
    /^Add \[sauron\] to each Fortitude test\.\n/,
  );
  assert.match(
    card(ME.eyeDoom).text!,
    /to The Black Gate Opens staging area\. The first player may raise each player's threat by 3 to cancel this effect\.$/,
  );
  assert.match(
    card(ME.eyeGate).text!,
    /^Each enemy in the staging area gets \+1 \[threat\] and -10 engagement cost\.\nForced: .* to the Mount Doom staging area\./,
  );
  assert.match(
    card(ME.bind).shadow!,
    /^Shadow: If The Eye of Sauron is in the staging area, attacking enemy gets \+2 \[attack\] and returns to the staging area after this attack\.$/,
  );
  for (const c of MOF_EPIC_CARDS) {
    assert.ok(isAutomatedCard(card(c.code)), c.name);
    for (const v of [c.text ?? "", c.back_text ?? "", c.shadow ?? ""])
      assert.doesNotMatch(v, / {2}|\s$|`|\(S\)/, `${c.name}: tidy text`);
  }
  // 5 faces: the setup card's two and the other cards' fronts.
  assert.equal(art.length, 5);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.deepEqual(
    art.map((a) => [card(a.code).name, a.face]),
    [
      ["Epic Multiplayer Mode", "front"],
      ["Epic Multiplayer Mode", "back"],
      ["The Eye of Sauron", "front"],
      ["The Eye of Sauron", "front"],
      ["In Darkness Bind Them", "front"],
    ],
  );
  // No catalog recipe is the epic mode's: the scenarios keep their own.
  assert.equal(
    automatedScenarioId({ name: "The Black Gate Opens", mode: "standard" }),
    "the-black-gate-opens",
  );
});

test("Setup: The Black Gate Opens and Mount Doom teams, a copy of In Darkness Bind Them in each encounter deck and The Eye of Sauron at Mount Doom", () => {
  for (const [sizes, seed, scenario] of [
    [[1, 1], 3, "the-black-gate-opens"],
    [[2, 1], 11, "mount-doom"],
    [[4, 4], 29, "the-black-gate-opens"],
    [[3, 2], 47, "mount-doom"],
  ] as [number[], number, string][]) {
    const s = drive(create(sizes, seed, scenario), planning(1));
    const [gate, doom] = epicTeams(s);
    assert.equal(s.epic!.kind, "mountain-of-fire");
    assert.equal(s.epic!.cityStrength, 0);
    assert.deepEqual(
      [gate, doom].map((t) => [
        t.epicTeam,
        t.scenarioId,
        t.table!.seats.length,
      ]),
      [
        [0, "the-black-gate-opens", sizes[0]],
        [1, "mount-doom", sizes[1]],
      ],
    );
    // Aragorn at The Black Gate Opens, Frodo Baggins at Mount Doom.
    assert.ok(
      seatView(gate, firstPlayer(gate)).heroes.some((h) => h.code === "146002"),
    );
    assert.ok(
      seatView(doom, firstPlayer(doom)).heroes.some((h) => h.code === "146001"),
    );
    for (const t of [gate, doom])
      assert.equal(
        encounterCards(t).filter((c) => c === ME.bind).length,
        1,
        `${t.scenarioId}: one In Darkness Bind Them`,
      );
    assert.equal(meEye(gate), undefined);
    assert.equal(meEye(doom)?.code, ME.eyeDoom);
    assert.equal(mofEpicPublicState(s)!.eye, "doom");
  }
  // Two teams of one to four players, no more at Mount Doom.
  const bad: Parameters<typeof createGame>[4][] = [
    { scenarioId: "the-black-gate-opens", epic: teamsOf([1, 2]) },
    { scenarioId: "mount-doom", epic: teamsOf([5, 1]) },
    { scenarioId: "mount-doom", epic: teamsOf([1, 1, 1]) },
    { scenarioId: "the-black-gate-opens", epic: teamsOf([1, 0]) },
    {
      scenarioId: "the-black-gate-opens",
      epic: teamsOf([1, 1]),
      nightmare: true,
    },
  ];
  for (const options of bad)
    assert.throws(
      () => createGame(1, D.cards, D.heroes, D.id, options),
      /two teams of one to four players at The Black Gate Opens and Mount Doom/,
    );
});

test("Turns: The Black Gate Opens' team plays each round, then Mount Doom's, and the end of the round resolves in that order", () => {
  let s = create([1, 1], 5);
  const turns: string[] = [];
  const mark = (x: GameState) => {
    const key = `${"GD"[x.epicTeam!]}${x.round}`;
    if (turns.at(-1) !== key) turns.push(key);
  };
  mark(s);
  while (s.status === "playing" && !(s.round === 3 && s.epicTeam === 1)) {
    s = autoplay(s, 1);
    mark(s);
  }
  assert.equal(s.status, "playing");
  // The teams alternate, The Black Gate Opens first: each round's turns, then
  // (when its effects ask for choices) each team's end of the round.
  assert.deepEqual(turns.slice(0, 6), ["G0", "D0", "G1", "D1", "G2", "D2"]);
  turns.forEach((x, i) => assert.equal(x[0], "GD"[i % 2], turns.join()));
  const rounds = turns.map((x) => Number(x.slice(1)));
  assert.deepEqual(
    rounds,
    [...rounds].sort((a, b) => a - b),
  );
  assert.equal(turns.at(-1), "D3");
  // The Epic Multiplayer Mode card resolved at Mount Doom's end of each round.
  assert.equal(
    team(s, 1).log.filter((l) =>
      /^Epic Multiplayer Mode: .* is chosen/.test(l.text),
    ).length,
    2,
  );
  assert.equal(
    team(s, 0).log.some((l) =>
      /^Epic Multiplayer Mode: .* is chosen/.test(l.text),
    ),
    false,
  );
});

test("The Eye of Sauron: +1 threat and -10 engagement cost at The Black Gate Opens, +1 icon in each Fortitude test at Mount Doom", () => {
  const s = table([1, 1]);
  const [gate, doom] = epicTeams(s);
  const orc = add(gate, BG.orc);
  const before = [threatOf(gate, orc), engagementCost(gate, orc)];
  // The Eye of Sauron, The Black Gate Opens side, in that staging area.
  doom.staging = doom.staging.filter((u) => u.code !== ME.eyeDoom);
  add(gate, ME.eyeGate);
  assert.deepEqual(
    [threatOf(gate, orc), engagementCost(gate, orc)],
    [before[0] + 1, before[1] - 10],
  );
  // Not for an engaged enemy.
  const engaged = make(gate, BG.orc);
  assert.equal(H(gate).threatBonus!(gate, engaged), 0);
  // The Mount Doom side at Mount Doom: one more icon in a Fortitude test.
  selectTeam(s, 1);
  s.hideTest = {
    kind: "fortitude",
    phase: "actions",
    player: 0,
    value: 0,
    source: MD.fumes,
    committedIds: [],
    discarded: [],
    continuation: [],
  };
  const without = H(s).hideThreatBonus!(s, 0);
  add(s, ME.eyeDoom);
  assert.equal(H(s).hideThreatBonus!(s, 0), without + 1);
  delete s.hideTest;
});

function settle(s: GameState, prefer: string[] = []) {
  for (
    let n = 0;
    s.status === "playing" && (s.choice || s.flow?.pending);
    n++
  ) {
    assert.ok(n < 300, "the epic decisions terminate");
    s = applyAction(
      reload(s),
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : {
            type: "CHOOSE",
            id:
              s.choice!.options.find((o) => prefer.includes(o.id))?.id ??
              s.choice!.options.find((o) =>
                ["skip", "keep", "resolve", "undefended"].includes(o.id),
              )?.id ??
              s.choice!.options[0].id,
          },
    );
  }
  return s;
}

test("The Eye of Sauron's Forced effect: at the end of the round it flips and moves with each Nazgûl enemy in the staging area, unless each player raises his threat by 3; once a round", () => {
  let s = table([2, 1]);
  // The Eye at The Black Gate Opens with a Nazgûl of Mordor carrying a Hell-hawk.
  team(s, 1).staging = team(s, 1).staging.filter((u) => u.code !== ME.eyeDoom);
  add(s, ME.eyeGate);
  const nazgul = add(s, BG.nazgul, { damage: 2 });
  nazgul.attachments.push({
    id: `a${s.nextId++}`,
    code: BG.hawk,
    exhausted: false,
  });
  const troll = add(s, BG.troll);
  assert.ok(H(s).roundEnd!(s).some((e) => e.kind === "meEye"));
  s = roundEnd(s);
  // Mount Doom has no Eye this round: only The Black Gate Opens' end of round.
  assert.match(
    s.choice!.title,
    /^The Eye of Sauron · Raise each player's threat by 3 to keep it at The Black Gate Opens\?/,
  );
  s = settle(choose(s, "move"));
  assert.equal(meEye(s), undefined);
  assert.equal(staged(s, BG.nazgul).length, 0);
  assert.equal(staged(s, BG.troll).length, 1, "only the Nazgûl move");
  const doom = team(s, 1);
  assert.equal(meEye(doom)?.code, ME.eyeDoom, "flipped to its Mount Doom side");
  const moved = staged(doom, BG.nazgul)[0];
  assert.ok(moved);
  assert.equal(moved.damage, 2);
  assert.deepEqual(
    moved.attachments.map((a) => a.code),
    [BG.hawk],
  );
  assert.equal(s.epic!.eyeRound, s.round);
  assert.match(
    s.log.map((l) => l.text).join("\n"),
    /The Eye of Sauron flips and moves to the Mount Doom staging area, with Nazgûl of Mordor\./,
  );
  // Carried to Mount Doom, the Hell-hawk still gives +2 threat, attack and
  // defense and immunity, and Nazgûl of Mordor takes no non-Morgul attachment.
  selectTeam(s, 1);
  assert.equal(H(s).threatBonus!(s, moved), 2);
  assert.deepEqual(
    [H(s).stats!(s, moved).attack, H(s).stats!(s, moved).defense],
    [2, 2],
  );
  assert.equal(H(s).immune!(s, moved), true);
  assert.equal(H(s).cannotAttach!(s, moved, "01040"), true);
  // At Mount Doom's end of the same round it does not move again.
  assert.equal(
    H(s).roundEnd!(s).some((e) => e.kind === "meEye"),
    false,
  );
  // Next round, canceled: each player raises his threat by 3 and it stays.
  for (const t of epicTeams(s)) t.round += 1;
  const threat = s.threat;
  s = choose(run(s, fx("meEye", { player: 0 })), "cancel");
  assert.equal(meEye(s)?.code, ME.eyeDoom);
  assert.equal(s.threat, threat + 3);
  assert.equal(s.epic!.eyeRound, s.round);
  void troll;
});

test("In Darkness Bind Them: each player exhausts a character; with The Eye of Sauron in the staging area no player card readies characters this round, and its shadow returns a stronger attacker", () => {
  let s = table([2, 2]);
  selectTeam(s, 1);
  s.encounterDeck = [ME.bind, ...s.encounterDeck];
  const ready = playerOrder(s).map(
    (p) => seatView(s, p).heroes.filter((h) => !h.exhausted).length,
  );
  s = run(s, fx("reveal", { player: 0 }));
  s = settle(s);
  assert.deepEqual(
    playerOrder(s).map(
      (p) => seatView(s, p).heroes.filter((h) => !h.exhausted).length,
    ),
    ready.map((n) => n - 1),
  );
  assert.equal(s.encounterDiscard.at(-1), ME.bind);
  assert.equal(s.mountDoom!.resolving.length, 0);
  // The Eye of Sauron is at Mount Doom: no readying by player cards this round.
  assert.equal(s.epicBound, s.round);
  assert.equal(H(s).cannotPlayerReady!(s), true);
  s.round += 1;
  assert.equal(H(s).cannotPlayerReady!(s), false);
  s.round -= 1;
  // Without the Eye, nothing more.
  selectTeam(s, 0);
  s.encounterDeck = [ME.bind, ...s.encounterDeck];
  s = settle(run(s, fx("reveal", { player: 0 })));
  assert.equal(s.epicBound, undefined);
  // The shadow: +2 attack and back to the staging area, only with the Eye.
  const enemy = add(s, BG.orc);
  s.combat = {
    enemyId: enemy.id,
    attackPlayer: 0,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
    damageDealt: 0,
  } as NonNullable<GameState["combat"]>;
  assert.equal(H(s).shadow!(s, ME.bind), true);
  assert.deepEqual(
    [s.combat!.attackBonus, !!s.combat!.returnToStaging],
    [0, false],
  );
  add(s, ME.eyeGate);
  assert.equal(H(s).shadow!(s, ME.bind), true);
  assert.deepEqual(
    [s.combat!.attackBonus, !!s.combat!.returnToStaging],
    [2, true],
  );
  s.combat = null;
});

test("Epic Multiplayer Mode: Mount Doom's first player chooses a scenario whose players draw 1 card while the other's reduce their threat by 3; then Gwaihir may change hands, across the scenarios", () => {
  let s = table([2, 1]);
  // Gwaihir under the second player's control at The Black Gate Opens.
  const g = make(s, BG.gwaihir);
  g.owner = 1;
  seatView(s, 1).allies.push(g);
  selectTeam(s, 1);
  assert.ok(H(s).roundEnd!(s).some((e) => e.kind === "meEpic"));
  assert.equal(
    H(team(s, 0)).roundEnd!(team(s, 0)).some((e) => e.kind === "meEpic"),
    false,
    "only at Mount Doom",
  );
  for (const t of epicTeams(s))
    for (const seat of t.table!.seats) seat.threat = 30;
  s.threat = 30;
  s = run(s, fx("meEpic", { player: 0 }));
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["team-0", "team-1"],
  );
  s = choose(s, "team-0");
  // Mount Doom's players reduce their threat by 3 at once.
  assert.equal(s.threat, 27);
  // The Black Gate Opens' players draw at their next turn, then Gwaihir's
  // controller may give him away.
  assert.deepEqual(kinds(team(s, 0)), ["meGwaihirOffer:1", "draw:0", "draw:1"]);
  selectTeam(s, 0);
  const hands = playerOrder(s).map((p) => seatView(s, p).hand.length);
  flush(s);
  assert.match(
    s.choice!.title,
    /^Gwaihir · Give control of Gwaihir to another player\?/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["keep", "give-0-0", "give-1-0"],
  );
  s = settle(choose(s, "give-1-0"));
  assert.equal(
    seatView(s, 1).allies.some((u) => u.code === BG.gwaihir),
    false,
  );
  const doom = team(s, 1);
  assert.deepEqual(
    seatView(doom, 0).allies.map((u) => u.code),
    [BG.gwaihir],
  );
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).hand.length),
    hands.map((n) => n + 1),
  );
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
});

test("Nazgûl of Mordor at Mount Doom: after it attacks, raise your threat by 4 or return it to the staging area; Ringwraith of Sauron at The Black Gate Opens takes no non-Morgul attachment", () => {
  let s = table([1, 1]);
  selectTeam(s, 1);
  const nazgul = make(s, BG.nazgul);
  s.engaged.push(nazgul);
  const combat = {
    enemyId: nazgul.id,
    attackPlayer: 0,
  } as NonNullable<GameState["combat"]>;
  const effects = H(s).attackFinished!(s, combat, false);
  assert.deepEqual(
    effects.map((e) => e.kind),
    ["meNazgul"],
  );
  s = run(s, ...effects);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["threat", "return"],
  );
  s = settle(choose(s, "return"));
  assert.ok(staged(s, BG.nazgul).length === 1);
  assert.equal(
    s.engaged.some((u) => u.code === BG.nazgul),
    false,
  );
  // At The Black Gate Opens its own hooks handle it (no second choice).
  selectTeam(s, 0);
  const own = make(s, BG.nazgul);
  s.engaged.push(own);
  assert.deepEqual(
    H(s).attackFinished!(
      s,
      { enemyId: own.id, attackPlayer: 0 } as NonNullable<GameState["combat"]>,
      false,
    ).map((e) => e.kind),
    ["bgNazgul"],
  );
  s.engaged = s.engaged.filter((u) => u.id !== own.id);
  const wraith = add(s, MD.wraith);
  assert.equal(H(s).cannotAttach!(s, wraith, "01040"), true);
});

test("Win and loss: Mount Doom defeated wins for both teams; the last player at either scenario eliminated, or any other defeat, loses for both", () => {
  // The Crack of Doom: the last Fortitude test passed or failed at Mount Doom.
  for (const [value, status] of [
    [1, "won"],
    [0, "lost"],
  ] as const) {
    const s = table([1, 1]);
    selectTeam(s, 1);
    s.mountDoom!.currentQuest = MD.crack;
    s.stage = 4;
    run(s, fx("mdCrack", { value, player: 0 }));
    assert.equal(s.status, status);
    for (const t of epicTeams(s)) {
      assert.equal(t.status, status);
      assert.equal(t.reason, s.reason);
      assert.deepEqual(t.queue, []);
    }
    assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
  }
  // The last player at The Black Gate Opens.
  let s = table([1, 1]);
  selectTeam(s, 0);
  s.threat = 99;
  s.table!.seats[0].threat = 99;
  s = applyAction(reload(s), { type: "NEXT" });
  assert.equal(s.status, "lost");
  assert.equal(
    s.reason,
    "The last player at The Black Gate Opens is eliminated: both teams lose the game.",
  );
  assert.doesNotMatch(s.reason!, /Morannon/);
  for (const t of epicTeams(s)) {
    assert.equal(t.status, "lost");
    assert.equal(t.reason, s.reason);
  }
});

test("Saves: the two teams validate together, and a swapped scenario, a city strength, a second Eye or a stray In Darkness Bind Them round are refused", () => {
  const s = table([2, 1]);
  selectTeam(s, 1);
  const raw = () => JSON.parse(JSON.stringify(s)) as GameState;
  assert.ok(validateSave(raw()));
  assert.equal(restoreSave(raw())?.epic?.kind, "mountain-of-fire");
  const bad: [string, (x: GameState) => void][] = [
    ["kind", (x) => (x.epic!.kind = "annuminas")],
    ["team scenario", (x) => (x.epic!.teams[0]!.scenarioId = "mount-doom")],
    ["active scenario", (x) => (x.scenarioId = "the-black-gate-opens")],
    ["city strength", (x) => (x.epic!.cityStrength = 50)],
    ["lieutenant", (x) => (x.epic!.lieutenantRound = 1)],
    ["eye round", (x) => (x.epic!.eyeRound = -1)],
    [
      "third team",
      (x) => x.epic!.teams.push(structuredClone(x.epic!.teams[0])),
    ],
    ["second Eye", (x) => x.epic!.teams[0]!.staging.push(make(x, ME.eyeGate))],
    [
      "no Eye",
      (x) => (x.staging = x.staging.filter((u) => u.code !== ME.eyeDoom)),
    ],
    ["bound round", (x) => (x.epicBound = -2)],
    ["team range", (x) => (x.epicTeam = 2)],
  ];
  for (const [label, tamper] of bad) {
    const x = raw();
    tamper(x);
    assert.equal(validateSave(x), false, label);
  }
  // A standard game keeps no epic fields.
  const plain = JSON.parse(
    JSON.stringify(
      createGame(3, D.cards, D.heroes, D.id, {
        scenarioId: "mount-doom" as ScenarioId,
      }),
    ),
  ) as GameState;
  assert.ok(validateSave(plain));
  for (const tamper of [
    (x: GameState) => (x.epicTeam = 1),
    (x: GameState) => (x.epicBound = 1),
  ]) {
    const x = structuredClone(plain);
    tamper(x);
    assert.equal(validateSave(x), false);
  }
  // Try again: the same two teams.
  const again = retryAdventure({ ...s, status: "lost" }, 9);
  assert.equal(again.epic?.kind, "mountain-of-fire");
  assert.deepEqual(
    epicTeams(again).map((t) => [t.scenarioId, t.table!.seats.length]),
    [
      ["the-black-gate-opens", 2],
      ["mount-doom", 1],
    ],
  );
});

test("Public state and seeded epic games: the panel follows both teams and The Eye of Sauron; varied teams play on with valid saves at every step", () => {
  const s = table([2, 2]);
  const view = publicState(s).mofEpic!;
  assert.deepEqual([view.team, view.eye, view.bound], [0, "doom", false]);
  assert.deepEqual(
    view.teams.map((t) => [t.name, t.active, t.players, t.eye]),
    [
      ["The Black Gate Opens", true, 2, false],
      ["Mount Doom", false, 2, true],
    ],
  );
  for (const [sizes, seed] of [
    [[1, 1], 101],
    [[3, 2], 202],
    [[4, 4], 303],
  ] as [number[], number][]) {
    let g = create(sizes, seed);
    let steps = 0;
    while (g.status === "playing" && g.round < 3 && steps < 2000) {
      g = autoplay(g, 1);
      steps++;
    }
    assert.ok(g.status !== "playing" || g.round >= 3, `seed ${seed}`);
    if (g.status !== "playing")
      for (const t of epicTeams(g)) assert.equal(t.status, g.status);
    const rounds = epicTeams(g).map((t) => t.round);
    assert.ok(Math.max(...rounds) - Math.min(...rounds) <= 1);
  }
});
