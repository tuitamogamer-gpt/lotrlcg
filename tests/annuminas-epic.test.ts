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
import { fx, make, stagingThreat } from "../src/game/core";
import { flush } from "../src/game/effects";
import { selectTeam } from "../src/game/epic";
import { automatedScenarioId, isAutomatedCard } from "../src/game/support";
import { firstPlayer, playerOrder, seatView } from "../src/game/table";
import { mainQuestUnit } from "../src/game/quest-state";
import {
  ANNUMINAS_HOOKS,
  SA,
  SA_EPIC_QUESTS,
  SA_STAGE,
  SA_TEAM_QUESTS,
  annuminasPublicState,
  saRecipe,
  saStageInfo,
  saTeams,
} from "../src/game/annuminas";
import { autoplay } from "./nightmare-fixtures";
import art from "./annuminas-art.json";
import epicCards from "../src/data/annuminas-epic-cards.json";
import type { GameState, ScenarioId, Unit } from "../src/game/types";

const H = ANNUMINAS_HOOKS;
const D = STARTERS[0];
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const seatsFor = (n: number, offset: number) =>
  Array.from({ length: n }, (_, i) => {
    const d = STARTERS[(offset + i) % STARTERS.length];
    return { deckId: d.id, heroes: [...d.heroes] };
  });
const teamsOf = (sizes: number[]) => {
  let offset = 0;
  return sizes.map((n) => {
    const seats = seatsFor(n, offset);
    offset += n;
    return seats;
  });
};
function create(sizes = [1, 1, 1], seed = 41) {
  return createGame(seed, D.cards, D.heroes, D.id, {
    scenarioId: "the-siege-of-annuminas" as ScenarioId,
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
/** Play on (first options, the simple autoplay policy) until a condition holds. */
function drive(s: GameState, until: (s: GameState) => boolean, limit = 4000) {
  for (let i = 0; s.status === "playing" && !until(s); i++) {
    assert.ok(i < limit, "the epic game reaches the expected point");
    s = autoplay(s, 1);
  }
  return s;
}
/** Team A's planning phase of a round: every team has begun the round. */
const planning = (round: number) => (s: GameState) =>
  s.round === round &&
  s.epicTeam === 0 &&
  s.phase === "planning" &&
  !s.choice &&
  !s.flow?.pending;
const team = (s: GameState, i: number) => saTeams(s)[i];
/**
 * A quiet table: each team in its planning phase with nothing queued and no
 * team waiting at a barrier, so that single effects resolve on their own.
 */
function quiet(s: GameState) {
  for (const t of saTeams(s))
    Object.assign(t, {
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
function table(sizes = [1, 1, 1], seed = 41) {
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
/** Put a team at a quest stage of its own quest deck. */
function atStage(t: GameState, stage: 1 | 2 | 3, progress = 0) {
  t.annuminas!.currentQuest = SA_TEAM_QUESTS[t.epicTeam!][stage - 1];
  t.stage = stage;
  t.progress = progress;
  t.annuminas!.advancing = false;
}
const staged = (t: GameState, code: string) =>
  t.staging.filter((u) => u.code === code);
const add = (t: GameState, code: string, patch: Partial<Unit> = {}) => {
  const u = Object.assign(make(t, code), patch);
  t.staging.push(u);
  return u;
};
const enemies = (t: GameState) =>
  [
    ...t.staging,
    ...playerOrder(t).flatMap((p) => seatView(t, p).engaged),
  ].filter((u) => card(u.code).type_code === "enemy");
const city = (s: GameState) => s.epic!.cityStrength;

test("Q99.09: the epic multiplayer cards follow the reviewed scans and every face is pinned", () => {
  const records = epicCards as {
    code: string;
    name: string;
    type_code: string;
    position: number;
    side?: string;
    back_quest?: number;
    text?: string;
    back_text?: string;
    imagesrc?: string;
    back_imagesrc?: string;
  }[];
  assert.deepEqual(
    records.map((c) => [c.name, c.type_code, c.position, c.side ?? null]),
    [
      ["Epic Multiplayer Mode", "campaign", 2, null],
      ["Raise the Levee", "quest", 6, "C"],
      ["Guard the Gate", "quest", 7, "C"],
      ["Rescue the Captives", "quest", 8, "C"],
      ["Delay the Enemy", "quest", 9, "E"],
      ["Man the Walls", "quest", 10, "E"],
      ["Stop the Attack", "quest", 11, "E"],
    ],
  );
  // The quest decks: 1A–3A, 1C–3C, 1E–3E; only the stage 2s have quest points.
  assert.deepEqual(
    SA_TEAM_QUESTS.map((deck) =>
      deck.map((c) => [card(c).name, card(c).back_quest ?? null]),
    ),
    [
      [
        ["Rebuild the Defenses", null],
        ["Defend the City", 50],
        ["Lead the Sortie", null],
      ],
      [
        ["Raise the Levee", null],
        ["Guard the Gate", 50],
        ["Rescue the Captives", null],
      ],
      [
        ["Delay the Enemy", null],
        ["Man the Walls", 50],
        ["Stop the Attack", null],
      ],
    ],
  );
  assert.deepEqual(
    SA_EPIC_QUESTS.map((q) => SA_STAGE[q.code]),
    [1, 2, 3, 1, 2, 3],
  );
  // The scans correct the catalog.
  assert.match(card(SA.epicMode).text!, /deck for Annúminas, adds it/);
  assert.match(
    card(SA.epicMode).back_text!,
    /each Host of Angmar in the staging area moves to the next staging area in descending alphabetical order[\s\S]*9 damage to Annúminas/,
  );
  assert.match(
    card(SA.epicMode).back_text!,
    /If the last player at a stage is eliminated, the enemy has broken through the city's defenses and all teams lose the game\.$/,
  );
  assert.match(card(SA.levee).back_text!, /^Forced: At the beginning/);
  assert.match(card(SA.levee).text!, /Dúnedain of Annúminas aside/);
  assert.match(card(SA.delay).text!, /Shuffle the encounter deck\.$/);
  for (const c of [SA.captives, SA.stopAttack]) {
    assert.match(card(c).back_text!, /raise each player's threat by 1/);
    assert.match(card(c).back_text!, /won the game\.$/);
  }
  for (const c of records)
    for (const v of [c.text ?? "", c.back_text ?? ""]) {
      assert.doesNotMatch(v, /Annuminas|Dunedain|Carn Dum\b/, c.name);
      assert.doesNotMatch(v, / {2}|\s$|`/, `${c.name}: tidy text`);
    }
  // 14 faces, each pinned by size and hash.
  const faces = art.filter((a) => records.some((c) => c.code === a.code));
  assert.equal(faces.length, 14);
  for (const c of records) {
    assert.deepEqual(
      faces
        .filter((a) => a.code === c.code)
        .map((a) => a.localPath)
        .sort(),
      [c.imagesrc, c.back_imagesrc].sort(),
      c.name,
    );
  }
  for (const a of faces) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  // Registered and scripted, and the catalog recipe maps to the scenario.
  for (const c of records) assert.ok(isAutomatedCard(card(c.code)), c.name);
  assert.equal(
    automatedScenarioId({
      name: "Epic The Siege of Annúminas",
      mode: "standard",
    }),
    "the-siege-of-annuminas",
  );
});

test("Q99.09: each team plays a full copy of the standard recipe, and the copies make up the epic recipe", () => {
  const recipes = JSON.parse(readFileSync("public/scenarios.json", "utf8")) as {
    id: string;
    sections: Record<string, Record<string, number>>;
  }[];
  const epic = recipes.find((r) => r.id === "Q99.09")!;
  const standard = saRecipe().sections;
  const names = (section: Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const [c, n] of Object.entries(section))
      out[card(c).name] = (out[card(c).name] ?? 0) + n;
    return out;
  };
  // Three encounter decks, each the standard deck.
  for (const key of [
    "sharedEncounterDeck",
    "sharedEncounterDeck2",
    "sharedEncounterDeck3",
  ])
    assert.deepEqual(epic.sections[key], standard.sharedEncounterDeck, key);
  // The catalog files 1C and 1E under the set-aside cards; together with the
  // quest deck they are the setup card and the three quest decks.
  const quests = {
    ...names(epic.sections.sharedQuestDeck),
    ...Object.fromEntries(
      Object.entries(names(epic.sections.sharedSetAside)).filter(([n]) =>
        ["Raise the Levee", "Delay the Enemy"].includes(n),
      ),
    ),
  };
  assert.deepEqual(
    Object.keys(quests).sort(),
    [
      "Epic Multiplayer Mode",
      ...SA_TEAM_QUESTS.flat().map((c) => card(c).name),
    ].sort(),
  );
  // The siege cards: three copies, one for each team (and one Annúminas).
  const aside = names(epic.sections.sharedSetAside);
  const one = names(standard.sharedSetAside);
  for (const n of [
    "Lieutenant of Angmar",
    "Battering Ram",
    "Enemy Camp",
    "Siege Tunnel",
    "Host of Angmar",
    "Dúnedain of Annúminas",
  ])
    assert.equal(aside[n], 3 * one[n], n);
  assert.equal(aside["Annúminas"], 1);

  for (const sizes of [
    [1, 1, 1],
    [2, 3, 1],
    [4, 4, 4],
  ]) {
    const s = drive(create(sizes, 7), planning(1));
    const teams = saTeams(s);
    assert.deepEqual(
      teams.map((t) => t.epicTeam),
      [0, 1, 2],
    );
    assert.deepEqual(
      teams.map((t) => t.table!.seats.length),
      sizes,
    );
    // Each team's encounter cards are the standard deck (Annúminas only at A).
    const deck = Object.entries(standard.sharedEncounterDeck)
      .flatMap(([c, n]) => Array<string>(n).fill(c))
      .sort();
    for (const t of teams) {
      const cards = [
        ...t.encounterDeck,
        ...t.encounterDiscard,
        ...t.staging.map((u) => u.code),
        ...playerOrder(t).flatMap((p) =>
          seatView(t, p).engaged.flatMap((u) => [u.code, ...u.shadows]),
        ),
        ...(t.activeLocation ? [t.activeLocation.code] : []),
        ...(t.victoryCards ?? []),
      ].filter((c) => c !== SA.city);
      assert.deepEqual(cards.sort(), deck, `team ${t.epicTeam}`);
      assert.equal(
        [...t.staging, ...(t.activeLocation ? [t.activeLocation] : [])].some(
          (u) => u.code === SA.city,
        ),
        t.epicTeam === 0,
      );
      // The siege cards wait in each team's set-aside area.
      assert.deepEqual(
        [...t.annuminas!.setAside].sort(),
        [
          SA.epicMode,
          SA.rules1,
          SA.rules2,
          SA.rules3,
          SA.lieutenant,
          SA.ram,
          SA.camp,
          SA.tunnel,
          SA.host,
          SA.host,
          SA.host,
          SA.dunedain,
          SA.dunedain,
          SA.dunedain,
        ].sort(),
      );
    }
  }
});

test("Setup: 1A stages Annúminas (city strength 50) and Gate of Annúminas, 1C discards to an enemy or location per player, and 1E stages Vanguard of Carn Dûm and different enemies", () => {
  for (const [sizes, seed] of [
    [[1, 1, 1], 3],
    [[3, 2, 4], 11],
    [[2, 4, 3], 29],
  ] as [number[], number][]) {
    const s = drive(create(sizes, seed), planning(1));
    const [a, c, e] = saTeams(s);
    assert.equal(s.epic!.cityStrength, 50);
    assert.deepEqual(
      [a, c, e].map((t) => t.annuminas!.currentQuest),
      [SA.rebuild, SA.levee, SA.delay],
    );
    assert.deepEqual(
      [a, c, e].map((t) => saStageInfo(t)?.side),
      ["B", "D", "F"],
    );
    // 1A: Annúminas, Gate of Annúminas and a different location per other player.
    const locations = a.staging.slice(1).map((u) => u.code);
    assert.equal(a.staging[0].code, SA.city);
    assert.equal(locations[0], SA.gate);
    assert.equal(new Set(locations).size, sizes[0]);
    assert.ok(locations.every((x) => card(x).type_code === "location"));
    // 1C: each player discarded until an enemy or location.
    const fromDiscard = c.staging.map((u) => u.code);
    assert.equal(fromDiscard.length, sizes[1]);
    assert.ok(
      fromDiscard.every((x) =>
        ["enemy", "location"].includes(card(x).type_code),
      ),
    );
    assert.ok(
      c.encounterDiscard.every(
        (x) => !["enemy", "location"].includes(card(x).type_code),
      ),
    );
    // 1E: Vanguard of Carn Dûm and a different enemy per other player.
    const foes = e.staging.map((u) => u.code);
    assert.equal(foes[0], SA.vanguard);
    assert.equal(new Set(foes).size, sizes[2]);
    assert.ok(foes.every((x) => card(x).type_code === "enemy"));
    // The beginning of round 1 placed a resource on each stage 1.
    assert.deepEqual(
      [a, c, e].map((t) => t.annuminas!.questResources),
      [1, 1, 1],
    );
    assert.match(
      e.log.map((l) => l.text).join("\n"),
      /Epic multiplayer mode · stage 1E, Delay the Enemy: Vanguard of Carn Dûm is added to the staging area/,
    );
  }
  // Only three teams of one to four players, at The Siege of Annúminas, in
  // its normal game mode.
  const bad: Parameters<typeof createGame>[4][] = [
    { scenarioId: "the-siege-of-annuminas", epic: teamsOf([1, 1]) },
    { scenarioId: "the-siege-of-annuminas", epic: teamsOf([1, 5, 1]) },
    { scenarioId: "the-siege-of-annuminas", epic: teamsOf([1, 0, 1]) },
    { scenarioId: "mirkwood", epic: teamsOf([1, 1, 1]) },
    {
      scenarioId: "the-siege-of-annuminas",
      epic: teamsOf([1, 1, 1]),
      nightmare: true,
    },
  ];
  for (const options of bad)
    assert.throws(
      () => createGame(1, D.cards, D.heroes, D.id, options),
      /three teams of one to four players at The Siege of Annúminas/,
    );
});

test("Turns: every team begins the round, then each team plays it, then the end of the round resolves in stage order", () => {
  let s = create([1, 2, 1], 5);
  const turns: string[] = [];
  const mark = (x: GameState) => {
    const key = `${"ACE"[x.epicTeam!]}${x.round}`;
    if (turns.at(-1) !== key) turns.push(key);
  };
  mark(s);
  while (s.status === "playing" && !(s.round === 3 && s.epicTeam === 1)) {
    s = autoplay(s, 1);
    mark(s);
    // While a team plays a round, the teams it waits for hold at their
    // barriers and the waiting teams' games keep every rule check.
    if (s.phase === "planning" && !s.choice) {
      const others = saTeams(s).filter((t) => t !== s);
      for (const t of others) assert.equal(t.round, s.round);
    }
  }
  assert.deepEqual(turns, [
    "A0",
    "C0",
    "E0",
    "A1",
    "C1",
    "E1",
    "A2",
    "C2",
    "E2",
    "A3",
    "C3",
  ]);
  // Annúminas took 1 damage for each enemy at each stage at the end of each
  // round, once a round, at stage A.
  const damage = team(s, 0)
    .log.map((l) => l.text)
    .filter((t) => /^Annúminas: Annúminas takes/.test(t));
  assert.equal(damage.length, 2);
  assert.equal(
    team(s, 1).log.some((l) => /^Annúminas: /.test(l.text)),
    false,
  );
});

test("Turn barriers: a team waits at the end of its round until the last team has played, and the end of the round passes team by team", () => {
  let s = drive(create([1, 1, 1], 9), planning(1));
  // Team A plays round 1 and waits at the end of the round.
  s = drive(s, (x) => x.epicTeam === 1);
  assert.equal(s.round, 1);
  assert.deepEqual(s.epic!.held, [0]);
  assert.equal(team(s, 0).queue[0].kind, "endRound");
  assert.equal(team(s, 0).phase, "refresh");
  // Team C passes its beginning-of-round barrier and plays.
  assert.deepEqual(s.epic!.pass, [2]);
  s = drive(s, (x) => x.epicTeam === 2);
  assert.deepEqual(s.epic!.held, [0, 1]);
  // Once team E has played, the end of the round resolves A, C, E, and round
  // 2 begins for every team before team A plays it.
  s = drive(s, planning(2));
  assert.deepEqual(
    saTeams(s).map((t) => [t.round, t.annuminas!.questResources]),
    [
      [2, 2],
      [2, 2],
      [2, 2],
    ],
  );
  assert.deepEqual(s.epic!.held, []);
  assert.deepEqual(s.epic!.pass, [1, 2]);
  assert.deepEqual(
    saTeams(s)
      .slice(1)
      .map((t) => t.queue[0]?.kind),
    ["epicRoundBegun", "epicRoundBegun"],
  );
  // A waiting team's game is no save on its own: the active team's game
  // holds the others.
  for (const t of saTeams(s).slice(1))
    assert.equal(validateSave(JSON.parse(JSON.stringify(t))), false);
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
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
                ["skip", "resolve", "undefended", "keep"].includes(o.id),
              )?.id ??
              s.choice!.options[0].id,
          },
    );
  }
  return s;
}
const kinds = (t: GameState) => t.queue.map((e) => `${e.kind}:${e.player}`);
const roundEnd = (s: GameState) => run(s, ...H.roundEnd!(s));

test("1D Raise the Levee: remove 10 progress so that the first player at each stage takes control of a set-aside Dúnedain of Annúminas", () => {
  let s = table([2, 2, 1]);
  selectTeam(s, 1);
  s.progress = 9;
  assert.equal(
    H.roundEnd!(s).some((e) => e.kind === "saLeveeResponse"),
    false,
  );
  s.progress = 12;
  s = roundEnd(s);
  assert.match(s.choice!.title, /^Raise the Levee · Remove 10 progress/);
  s = choose(s, "use");
  assert.equal(s.progress, 2);
  for (const t of saTeams(s)) {
    const lead = firstPlayer(t);
    assert.deepEqual(
      seatView(t, lead).allies.map((u) => [u.code, u.owner ?? lead]),
      [[SA.dunedain, lead]],
      `stage ${t.stage}${"BDF"[t.epicTeam!]}`,
    );
    assert.equal(
      t.annuminas!.setAside.filter((c) => c === SA.dunedain).length,
      2,
    );
    for (const p of playerOrder(t).filter((p) => p !== lead))
      assert.equal(seatView(t, p).allies.length, 0);
  }
  assert.match(
    s.log.map((l) => l.text).join("\n"),
    /the first player at stage 1F takes control of a set-aside Dúnedain of Annúminas/,
  );
  // Keeping the progress changes nothing.
  s.progress = 10;
  s = choose(roundEnd(s), "skip");
  assert.equal(s.progress, 10);
});

test("1F Delay the Enemy: remove 10 progress so that each other stage reveals 1 fewer encounter card during its next quest phase", () => {
  let s = table([1, 1, 1]);
  selectTeam(s, 2);
  s.progress = 10;
  s = choose(roundEnd(s), "use");
  assert.equal(s.progress, 0);
  const round = s.round;
  assert.deepEqual(
    saTeams(s).map((t) => t.annuminas!.fewerReveals ?? null),
    [{ round: round + 1, value: 1 }, { round: round + 1, value: 1 }, null],
  );
  const [a, c] = saTeams(s);
  assert.equal(H.extraStagingReveals!(a), 0, "not this round");
  a.round = round + 1;
  assert.equal(H.extraStagingReveals!(a), -1);
  // 2D's additional card and 1F's fewer card cancel out.
  atStage(c, 2);
  c.round = round + 1;
  assert.equal(H.extraStagingReveals!(c), 0);
  c.round = round + 2;
  assert.equal(H.extraStagingReveals!(c), 1);
});

test("Stage 1: each stage advances at the beginning of the round with its fourth resource, without the Standard Game Mode's reinforcements", () => {
  let s = drive(create([2, 1, 1], 13), planning(1));
  for (const t of saTeams(s)) t.annuminas!.questResources = 3;
  s = drive(s, planning(2));
  const teams = saTeams(s);
  assert.deepEqual(
    teams.map((t) => [t.stage, card(t.annuminas!.currentQuest).name]),
    [
      [2, "Defend the City"],
      [2, "Guard the Gate"],
      [2, "Man the Walls"],
    ],
  );
  for (const t of teams) {
    // No Dúnedain of Annúminas or Host of Angmar is shuffled in.
    assert.equal(
      t.annuminas!.setAside.filter((c) => c === SA.dunedain).length,
      3,
    );
    assert.equal(
      [...t.encounterDeck, ...t.encounterDiscard].some((c) =>
        [SA.dunedain, SA.host].includes(c),
      ),
      false,
    );
  }
  // 2F's Forced: a set-aside Host of Angmar enters at the beginning of the
  // round (stage 2 began this round: the next beginning adds one).
  assert.equal(
    teams[2].annuminas!.setAside.filter((c) => c === SA.host).length,
    3,
  );
  // Each stage 2's goal: 50, less 10 for each Host of Angmar in a victory
  // display (any team's), as each team sees it on its turn.
  const goals = () =>
    [0, 1, 2].map((i) => {
      selectTeam(s, i);
      return saStageInfo(s)!.quest;
    });
  assert.deepEqual(goals(), [50, 50, 50]);
  team(s, 1).victoryCards = [SA.host];
  assert.deepEqual(goals(), [40, 40, 40]);
});

test("Stage 2: each stage 2 is defeated only at the beginning of the round, and only once every stage 2 is complete", () => {
  let s = table([1, 1, 1]);
  const [a, c, e] = saTeams(s);
  atStage(a, 2, 50);
  atStage(c, 2, 60);
  atStage(e, 2, 30);
  // The usual defeat at the end of the quest phase is held back.
  assert.equal(H.advance!(s), true);
  assert.equal(a.annuminas!.advancing, false);
  s = run(s, fx("saEpicDefeat", { player: 0 }));
  assert.equal(s.stage, 2, "2F is not complete");
  // A Host of Angmar in a victory display lowers every stage 2.
  team(s, 2).victoryCards = [SA.host, SA.host];
  s = settle(run(s, fx("saEpicDefeat", { player: 0 })));
  assert.equal(s.stage, 3);
  assert.equal(s.annuminas!.currentQuest, SA.sortie);
  assert.match(
    s.log.map((l) => l.text).join("\n"),
    /Each stage 2 is complete \(30 quest points\): Defend the City is defeated at the beginning of the round\./,
  );
  // 3A: Battering Ram and Lieutenant of Angmar.
  assert.deepEqual(
    [SA.ram, SA.lieutenant].map((x) => staged(s, x).length),
    [1, 1],
  );
  // A stage already past stage 2 counts as complete.
  selectTeam(s, 1);
  s = settle(run(s, fx("saEpicDefeat", { player: 0 })));
  assert.equal(s.annuminas!.currentQuest, SA.captives);
  // At stage 2, the beginning of the round checks the defeat; 2F adds a Host.
  selectTeam(s, 2);
  assert.deepEqual(
    H.resourceStart!(s).map((x) => x.kind),
    ["saEpicDefeat", "saManWalls", "epicRoundBegun"],
  );
  atStage(s, 1);
  assert.deepEqual(
    H.resourceStart!(s).map((x) => x.kind),
    ["saRebuild", "epicRoundBegun"],
  );
});

test("Stage 3 entries: 3C adds Enemy Camp and each player at each stage puts a hero under their main quest; 3E adds Siege Tunnel", () => {
  let s = table([2, 1, 1]);
  for (const t of saTeams(s)) atStage(t, 2, 50);
  // A hero with tokens and an attachment goes facedown under the quest.
  const [a] = saTeams(s);
  const PLATE = "01040"; // Citadel Plate, in team A's second player's deck
  const hero = seatView(a, 1).heroes[0];
  selectTeam(s, 1);
  s = run(s, fx("saEpicDefeat", { player: 0 }));
  s = settle(s, ["skip"]);
  // The 3C reveal stops at each player's hero choice at this stage.
  assert.equal(s.annuminas!.currentQuest, SA.captives);
  assert.equal(staged(s, SA.camp).length, 1);
  assert.equal(s.annuminas!.setAside.includes(SA.camp), false);
  assert.equal(s.annuminas!.captives!.length, 1);
  assert.equal(seatView(s, 0).heroes.length, 2);
  // The other stages' players choose at their next turn.
  assert.deepEqual(kinds(team(s, 0)), ["saCaptive:0", "saCaptive:1"]);
  assert.deepEqual(kinds(team(s, 2)), ["saCaptive:0"]);
  selectTeam(s, 0);
  const held = seatView(s, 1).heroes.find((h) => h.id === hero.id)!;
  held.damage = 1;
  held.resources = 2;
  held.attachments.push({
    id: `a${s.nextId++}`,
    code: PLATE,
    exhausted: false,
    owner: 1,
  });
  flush(s);
  s = settle(s, [hero.id]);
  assert.deepEqual(s.annuminas!.captives!.map((x) => x.owner).sort(), [0, 1]);
  assert.ok(s.annuminas!.captives!.some((x) => x.code === hero.code));
  assert.equal(
    seatView(s, 1).heroes.some((h) => h.id === hero.id),
    false,
  );
  // Its attachment is discarded to its owner's discard pile.
  assert.ok(seatView(s, 1).discard.includes(PLATE));
  // 3E: Siege Tunnel enters team E's staging area at its stage entry.
  selectTeam(s, 2);
  s.queue = [];
  atStage(s, 2, 50);
  s = settle(run(s, fx("saEpicDefeat", { player: 0 })));
  assert.equal(s.annuminas!.currentQuest, SA.stopAttack);
  assert.equal(staged(s, SA.tunnel).length, 1);
  // 3D and 3F: no progress while Enemy Camp (Siege Tunnel) is in play.
  assert.equal(H.progress!(s, 4, mainQuestUnit(s)!), 0);
  selectTeam(s, 1);
  assert.equal(H.progress!(s, 4, mainQuestUnit(s)!), 0);
  s.staging = s.staging.filter((u) => u.code !== SA.camp);
  assert.equal(H.progress!(s, 4, mainQuestUnit(s)!), 4);
});

test("2B, 2D and 2F: choose a stage whose players heal 1 damage, add 1 resource to a hero or draw 1 card", () => {
  let s = table([1, 2, 1]);
  for (const t of saTeams(s)) atStage(t, 2, 0);
  // 2B: heal, at the chosen stage (team C), on its next turn.
  s = roundEnd(s);
  assert.match(
    s.choice!.title,
    /^Defend the City · Choose a stage: each player heals 1 damage/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["stage-0", "stage-1", "stage-2", "skip"],
  );
  s = settle(choose(s, "stage-1"));
  assert.deepEqual(kinds(team(s, 1)), ["saHeal:0", "saHeal:1"]);
  selectTeam(s, 1);
  const hurt = seatView(s, 1).heroes[0];
  hurt.damage = 2;
  flush(s);
  s = settle(s, [hurt.id]);
  assert.equal(seatView(s, 1).heroes.find((h) => h.id === hurt.id)!.damage, 1);
  // 2D: a resource on a hero at the chosen stage (team E).
  s = roundEnd(s);
  assert.match(s.choice!.title, /^Guard the Gate · Choose a stage/);
  s = settle(choose(s, "stage-2"));
  assert.deepEqual(kinds(team(s, 2)), ["saGateResource:0"]);
  selectTeam(s, 2);
  const before = seatView(s, 0).heroes.map((h) => h.resources);
  flush(s);
  s = settle(s);
  assert.equal(
    seatView(s, 0).heroes.reduce((n, h) => n + h.resources, 0),
    before.reduce((n, r) => n + r, 0) + 1,
  );
  // 2F: each player at this stage draws 1 card (at once: it is this team's turn).
  const hand = s.hand.length;
  s = roundEnd(s);
  assert.match(s.choice!.title, /^Man the Walls · Choose a stage/);
  s = settle(choose(s, "stage-2"));
  assert.equal(s.hand.length, hand + 1);
});

test("Epic Multiplayer Mode at stage 2: each staged Host of Angmar moves 2F to 2D to 2B; from 2B it is discarded and Annúminas takes 9 damage", () => {
  let s = table([1, 1, 1]);
  for (const t of saTeams(s)) atStage(t, 2, 0);
  const host = add(team(s, 2), SA.host, { damage: 3 });
  for (const [i, n] of [
    [0, 1],
    [1, 1],
    [2, 1],
  ])
    assert.equal(
      H.roundEnd!(team(s, i)).filter((e) => e.kind === "saHostsMove").length,
      n,
    );
  selectTeam(s, 2);
  s = run(s, fx("saHostsMove", { player: 0 }));
  assert.equal(staged(s, SA.host).length, 0);
  const moved = staged(team(s, 1), SA.host);
  assert.equal(moved.length, 1);
  // A new card in team C's game (its own ids), its damage kept.
  assert.equal(
    team(s, 1).staging.filter((u) => u.id === moved[0].id).length,
    1,
  );
  assert.equal(moved[0].damage, host.damage, "its damage stays");
  assert.match(
    s.log.at(-1)!.text,
    /^Host of Angmar moves to the staging area at stage 2D\.$/,
  );
  assert.match(
    team(s, 1).log.at(-1)!.text,
    /^Host of Angmar moves here from stage 2F\.$/,
  );
  selectTeam(s, 1);
  s = run(s, fx("saHostsMove", { player: 0 }));
  assert.equal(staged(team(s, 0), SA.host).length, 1);
  selectTeam(s, 0);
  s = run(s, fx("saHostsMove", { player: 0 }));
  assert.equal(staged(s, SA.host).length, 0);
  assert.ok(s.encounterDiscard.includes(SA.host));
  assert.equal(city(s), 41);
  // Not at stage 1 or 3.
  for (const stage of [1, 3] as const) {
    atStage(s, stage);
    assert.equal(
      H.roundEnd!(s).some((e) => e.kind === "saHostsMove"),
      false,
    );
  }
});

test("2F Man the Walls: at the beginning of the round a set-aside Host of Angmar, from any stage's set-aside area, enters its staging area", () => {
  let s = table([1, 1, 1]);
  selectTeam(s, 2);
  atStage(s, 2);
  s = run(s, fx("saManWalls", { player: 0 }));
  assert.equal(staged(s, SA.host).length, 1);
  assert.equal(s.annuminas!.setAside.filter((c) => c === SA.host).length, 2);
  s.annuminas!.setAside = s.annuminas!.setAside.filter((c) => c !== SA.host);
  s = run(s, fx("saManWalls", { player: 0 }));
  assert.equal(staged(s, SA.host).length, 2);
  assert.equal(
    team(s, 0).annuminas!.setAside.filter((c) => c === SA.host).length,
    2,
  );
  assert.match(
    s.log.at(-1)!.text,
    /Man the Walls: a set-aside Host of Angmar \(from stage 1B\) is added to the staging area\./,
  );
  // 2D: 1 additional encounter card during the quest phase.
  selectTeam(s, 1);
  atStage(s, 2);
  assert.equal(H.extraStagingReveals!(s), 1);
});

test("Lieutenant of Angmar moves once a round to the staging area with the lowest total threat at any stage and attacks its first player", () => {
  let s = table([1, 2, 1]);
  for (const t of saTeams(s)) atStage(t, 3, 0);
  const [a, c, e] = saTeams(s);
  for (const t of [a, c, e])
    t.staging = t.staging.filter((u) => u.code !== SA.city);
  c.staging = [];
  e.staging.push(make(e, SA.orc));
  const lt = add(a, SA.lieutenant, { damage: 2 });
  assert.ok(stagingThreat(c) < stagingThreat(e));
  s = run(s, fx("saLieutenant", { player: 0 }));
  assert.equal(staged(s, SA.lieutenant).length, 0);
  const moved = staged(team(s, 1), SA.lieutenant)[0];
  assert.ok(moved && moved.id !== lt.id);
  assert.equal(moved.damage, 2);
  assert.deepEqual(
    team(s, 1).queue.map((x) => [x.kind, x.target, x.player]),
    [["immediateAttack", moved.id, firstPlayer(team(s, 1))]],
  );
  assert.equal(s.epic!.lieutenantRound, s.round);
  assert.match(
    s.log.at(-1)!.text,
    /Lieutenant of Angmar moves to the staging area at stage 3D \(the lowest total threat, 0\)/,
  );
  // At stage 3D's end of the same round he does not move again.
  selectTeam(s, 1);
  s.queue = [];
  s = run(s, fx("saLieutenant", { player: 0 }));
  assert.equal(staged(s, SA.lieutenant).length, 1);
  assert.deepEqual(s.queue, []);
  // Next round, with the lowest total threat at his own stage, he stays and
  // attacks this stage's first player.
  s.epic!.lieutenantRound = s.round - 1;
  for (const t of saTeams(s)) if (t !== s) t.staging.push(make(t, SA.werewolf));
  assert.ok(H.roundEnd!(s).some((x) => x.kind === "saLieutenant"));
  s = run(s, fx("saLieutenant", { player: 0 }));
  assert.equal(staged(s, SA.lieutenant).length, 1);
  assert.equal(staged(team(s, 0), SA.lieutenant).length, 0);
  assert.equal(s.epic!.lieutenantRound, s.round);
  assert.equal(s.combat?.enemyId, moved.id);
  assert.match(
    s.log.map((l) => l.text).join("\n"),
    /Lieutenant of Angmar moves to the staging area and makes an immediate attack against the first player\./,
  );
});

test("Siege Tunnel: each team discards from its own encounter deck until an enemy and adds it to its staging area", () => {
  let s = table([1, 1, 1]);
  const [a, c, e] = saTeams(s);
  a.encounterDeck = [SA.press, SA.orc, SA.warg];
  c.encounterDeck = [SA.warg];
  e.encounterDeck = [SA.weary, SA.weary];
  for (const t of [a, c, e]) t.encounterDiscard = [];
  selectTeam(s, 2);
  atStage(s, 3);
  add(s, SA.tunnel);
  assert.ok(H.roundEnd!(s).some((x) => x.kind === "saTunnel"));
  const sizes = saTeams(s).map((t) => t.staging.length);
  s = run(s, fx("saTunnel", { player: 0 }));
  assert.deepEqual(
    saTeams(s).map((t) => t.staging.length - sizes[t.epicTeam!]),
    [1, 1, 0],
  );
  assert.equal(team(s, 0).staging.at(-1)!.code, SA.orc);
  assert.deepEqual(team(s, 0).encounterDiscard, [SA.press]);
  assert.equal(team(s, 1).staging.at(-1)!.code, SA.warg);
  assert.deepEqual(s.encounterDiscard, [SA.weary, SA.weary]);
  assert.match(
    s.log.map((l) => l.text).join("\n"),
    /Siege Tunnel · stage 3F: no enemy is discarded\./,
  );
});

test("Enemy Camp: at the end of the round a random captive hero under each stage 3 is discarded; in a victory display, each captive returns", () => {
  let s = table([2, 1, 1]);
  for (const t of saTeams(s)) atStage(t, 3, 0);
  const [a, c, e] = saTeams(s);
  const capture = (t: GameState, p: number) => {
    const view = seatView(t, p);
    const h = view.heroes[0];
    view.heroes.splice(0, 1);
    t.annuminas!.captives!.push({ code: h.code, owner: p });
    return h.code;
  };
  const caught = [capture(a, 0), capture(a, 1), capture(c, 0), capture(e, 0)];
  selectTeam(s, 1);
  add(s, SA.camp);
  assert.ok(H.roundEnd!(s).some((x) => x.kind === "saCamp"));
  assert.equal(
    H.roundEnd!(team(s, 0)).some((x) => x.kind === "saCamp"),
    false,
    "only the stage with Enemy Camp",
  );
  s = run(s, fx("saCamp", { player: 0 }));
  assert.deepEqual(
    saTeams(s).map((t) => t.annuminas!.captives!.length),
    [1, 0, 0],
  );
  const discarded = saTeams(s).flatMap((t) =>
    playerOrder(t).flatMap((p) =>
      seatView(t, p).discard.filter((x) => caught.includes(x)),
    ),
  );
  assert.equal(discarded.length, 3);
  // Enemy Camp in a victory display: the remaining captive returns.
  s.staging = s.staging.filter((u) => u.code !== SA.camp);
  s.victoryCards = [SA.camp];
  assert.ok(H.roundEnd!(s).some((x) => x.kind === "saCamp"));
  const left = team(s, 0).annuminas!.captives![0];
  s = run(s, fx("saCamp", { player: 0 }));
  assert.equal(team(s, 0).annuminas!.captives!.length, 0);
  const back = seatView(team(s, 0), left.owner).heroes.find(
    (h) => h.code === left.code,
  )!;
  assert.ok(back);
  assert.deepEqual(
    [back.damage, back.resources, back.attachments.length],
    [0, 0, 0],
  );
  assert.match(
    s.log.at(-1)!.text,
    /Enemy Camp is in a victory display: each hero under stage 3B returns to its owner's control\./,
  );
});

test("3B, 3D and 3F: raise each player's threat by 1 and reveal an encounter card to discard a non-unique enemy worth no victory points at another stage", () => {
  let s = table([2, 1, 1]);
  for (const t of saTeams(s)) atStage(t, 3, 0);
  const [, c, e] = saTeams(s);
  const orc = add(c, SA.orc);
  add(e, SA.lieutenant);
  add(e, SA.vanguard);
  s.encounterDeck = [SA.evendim, ...s.encounterDeck];
  const threat = s.table!.seats.map((x) => x.threat);
  s = roundEnd(s);
  assert.match(
    s.choice!.title,
    /^Lead the Sortie · Raise each player's threat by 1 and reveal an encounter card/,
  );
  s = choose(s, "use");
  assert.deepEqual(
    s.table!.seats.map((x) => x.threat),
    threat.map((t) => t + 1),
  );
  assert.ok(s.staging.some((u) => u.code === SA.evendim));
  assert.match(
    s.choice!.title,
    /Discard a non-unique enemy worth no victory points at another stage/,
  );
  // Each non-unique enemy worth no victory points at the other stages
  // (Lieutenant of Angmar is unique and worth 4).
  const others = [1, 2].flatMap((i) =>
    enemies(team(s, i))
      .filter((u) => !card(u.code).is_unique && !card(u.code).victory)
      .map((u) => `${card(u.code).name} · stage 3${"BDF"[i]}`),
  );
  assert.ok(others.includes(`${card(SA.orc).name} · stage 3D`));
  assert.ok(others.includes(`${card(SA.vanguard).name} · stage 3F`));
  assert.deepEqual(s.choice!.options.map((o) => o.label).sort(), others.sort());
  s = choose(s, `1-${orc.id}`);
  assert.equal(
    team(s, 1).staging.some((u) => u.id === orc.id),
    false,
  );
  assert.equal(team(s, 1).encounterDiscard.at(-1), SA.orc);
  assert.match(
    team(s, 1).log.at(-1)!.text,
    /Orc of Angmar is discarded by the players at stage 3B\./,
  );
});

test("Win: with Lieutenant of Angmar in any team's victory display at the end of the round, every team wins", () => {
  let s = table([1, 1, 1]);
  for (const t of saTeams(s)) atStage(t, 3, 0);
  selectTeam(s, 2);
  s = run(s, fx("saSortieWin", { player: 0 }));
  assert.equal(s.status, "playing");
  team(s, 0).victoryCards = [SA.lieutenant];
  assert.equal(annuminasPublicState(s)!.lieutenant, "victory");
  s = run(s, fx("saSortieWin", { player: 0 }));
  assert.equal(s.status, "won");
  assert.equal(
    s.reason,
    "Lieutenant of Angmar is in a victory display at the end of the round: the players have routed the enemy and won the game.",
  );
  for (const t of saTeams(s)) {
    assert.equal(t.status, "won");
    assert.equal(t.reason, s.reason);
    assert.deepEqual(t.queue, []);
  }
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
});

test("Loss: the city strength reaching 0 or the last player at a stage being eliminated loses the game for every team", () => {
  // Annúminas takes 1 damage for each enemy at each stage.
  let s = table([1, 1, 1]);
  add(team(s, 0), SA.orc);
  add(team(s, 1), SA.warg);
  const count = saTeams(s).reduce((n, t) => n + enemies(t).length, 0);
  assert.ok(count >= 2);
  s.epic!.cityStrength = count + 1;
  s = run(s, fx("saCityDamage", { player: 0 }));
  assert.equal(city(s), 1);
  assert.equal(s.status, "playing");
  s = run(s, fx("saCityDamage", { player: 0 }));
  assert.equal(city(s), 0);
  assert.equal(s.status, "lost");
  for (const t of saTeams(s)) assert.equal(t.status, "lost");
  // One of two players at a stage eliminated: play goes on, with no Standard
  // Game Mode damage to Annúminas.
  s = table([1, 2, 1]);
  selectTeam(s, 1);
  s.table!.seats[1].threat = 50;
  s = applyAction(reload(s), { type: "NEXT" });
  assert.equal(s.table!.seats[1].eliminated, true);
  assert.equal(s.status, "playing");
  assert.equal(city(s), 50);
  assert.equal(H.playerEliminated!(s, 1), undefined);
  assert.equal(city(s), 50);
  // The last player at a stage.
  s = table([1, 1, 2]);
  selectTeam(s, 0);
  s.threat = 50;
  s.table!.seats[0].threat = 50;
  s = applyAction(reload(s), { type: "NEXT" });
  assert.equal(s.status, "lost");
  assert.equal(
    s.reason,
    "The last player at stage 1B is eliminated: the enemy has broken through the city's defenses and all teams lose the game.",
  );
  for (const t of saTeams(s)) {
    assert.equal(t.status, "lost");
    assert.equal(t.reason, s.reason);
  }
});

test("Saves: the epic state validates as a whole, and tampered teams, barriers or city strength are refused", () => {
  const s = table([1, 2, 1]);
  selectTeam(s, 1);
  const raw = () => JSON.parse(JSON.stringify(s)) as GameState;
  assert.ok(validateSave(raw()));
  assert.equal(restoreSave(raw())?.epic?.active, 1);
  const bad: [string, (x: GameState) => void][] = [
    ["active team", (x) => (x.epic!.active = 0)],
    ["active slot", (x) => (x.epic!.teams[1] = x.epic!.teams[0])],
    ["team count", (x) => x.epic!.teams.pop()],
    ["team letter", (x) => (x.epic!.teams[0]!.epicTeam = 2)],
    ["nested epic", (x) => (x.epic!.teams[2]!.epic = structuredClone(x.epic!))],
    ["team scenario", (x) => (x.epic!.teams[0]!.scenarioId = "mirkwood")],
    ["team table", (x) => delete x.epic!.teams[2]!.table],
    ["held twice", (x) => (x.epic!.held = [0, 0])],
    ["held and passed", (x) => ((x.epic!.held = [2]), (x.epic!.pass = [2]))],
    ["unknown team", (x) => (x.epic!.pass = [3])],
    ["city strength", (x) => (x.epic!.cityStrength = -1)],
    ["fractional city", (x) => (x.epic!.cityStrength = 1.5)],
    ["kind", (x) => ((x.epic as { kind: string }).kind = "other")],
    ["lieutenant round", (x) => (x.epic!.lieutenantRound = -1)],
    ["epic without team", (x) => delete x.epicTeam],
    ["team without epic", (x) => delete x.epic],
    ["team range", (x) => (x.epicTeam = 3)],
    [
      "captive owner",
      (x) => (x.annuminas!.captives = [{ code: D.heroes[0], owner: 2 }]),
    ],
    [
      "fewer reveals",
      (x) => (x.annuminas!.fewerReveals = { round: 2, value: -1 }),
    ],
    [
      "waiting team's quest deck",
      (x) => (x.epic!.teams[2]!.annuminas!.currentQuest = SA.levee),
    ],
  ];
  for (const [label, tamper] of bad) {
    const x = raw();
    tamper(x);
    assert.equal(validateSave(x), false, label);
  }
  // The standard game keeps no epic fields.
  const standard = createGame(3, D.cards, D.heroes, D.id, {
    scenarioId: "the-siege-of-annuminas" as ScenarioId,
  });
  const plain = JSON.parse(JSON.stringify(standard)) as GameState;
  assert.ok(validateSave(plain));
  for (const tamper of [
    (x: GameState) => (x.epicTeam = 0),
    (x: GameState) => (x.annuminas!.captives = []),
    (x: GameState) => (x.annuminas!.fewerReveals = { round: 1, value: 1 }),
  ]) {
    const x = structuredClone(plain);
    tamper(x);
    assert.equal(validateSave(x), false);
  }
});

test("Public state: the panel shows each team's stage, players, progress and enemies, the shared city strength and where the Lieutenant is", () => {
  let s = table([1, 2, 3]);
  const view = publicState(s).annuminas!;
  assert.equal(view.side, "1B");
  assert.equal(view.cityStrength, 50);
  assert.equal(view.lieutenant, "aside");
  assert.deepEqual(
    view.teams!.map((t) => [t.team, t.active, t.side, t.name, t.players]),
    [
      [0, true, "1B", "Rebuild the Defenses", 1],
      [1, false, "1D", "Raise the Levee", 2],
      [2, false, "1F", "Delay the Enemy", 3],
    ],
  );
  assert.deepEqual(
    view.teams!.map((t) => t.enemies),
    saTeams(s).map((t) => enemies(t).length),
  );
  selectTeam(s, 2);
  for (const t of saTeams(s)) atStage(t, 3, 0);
  add(team(s, 1), SA.lieutenant);
  const later = publicState(s).annuminas!;
  assert.equal(later.side, "3F");
  assert.equal(later.lieutenant, "play");
  assert.equal(later.lieutenantStage, "3D");
  assert.deepEqual(
    later.teams!.map((t) => [t.active, t.side]),
    [
      [false, "3B"],
      [false, "3D"],
      [true, "3F"],
    ],
  );
  // The stage cards read C/D and E/F for teams C and E.
  s.stageRevealing = true;
  assert.equal(saStageInfo(s)!.side, "E");
  s.stageRevealing = false;
  assert.equal(saStageInfo(s)!.side, "F");
});

test("Seeded epic games: varied teams play on with valid saves at every step", () => {
  for (const [sizes, seed] of [
    [[1, 1, 1], 101],
    [[2, 1, 3], 202],
    [[4, 2, 1], 303],
  ] as [number[], number][]) {
    let s = create(sizes, seed);
    let steps = 0;
    while (s.status === "playing" && s.round < 3 && steps < 2000) {
      s = autoplay(s, 1);
      steps++;
    }
    assert.ok(
      s.status !== "playing" || s.round >= 3,
      `seed ${seed}: the game reaches round 3 or ends (${s.status}, round ${s.round})`,
    );
    if (s.status !== "playing") {
      assert.match(
        s.reason ?? "",
        /city strength of Annúminas reaches 0|last player at stage|won the game/,
      );
      for (const t of saTeams(s)) assert.equal(t.status, s.status);
    }
    // The teams stay in step: no team is more than one round apart.
    const rounds = saTeams(s).map((t) => t.round);
    assert.ok(Math.max(...rounds) - Math.min(...rounds) <= 1, `${rounds}`);
  }
});

test("A full epic game: every stage reaches stage 2 in the same round, and the stage 2s fall together into stage 3", () => {
  let s = drive(create([1, 1, 1], 9), planning(1));
  for (const t of saTeams(s)) t.annuminas!.questResources = 3;
  // A calm siege: every team survives each round (no enemies, fresh heroes
  // and threat 20 at its start, encounter decks of Shores of Lake Nenuial).
  const calm = (x: GameState) => {
    for (const t of saTeams(x)) {
      for (const seat of t.table!.seats) {
        seat.threat = 20;
        seat.engaged = [];
        for (const h of seat.heroes) h.damage = 0;
      }
      t.threat = 20;
      t.engaged = [];
      for (const h of t.heroes) h.damage = 0;
      t.staging = t.staging.filter((u) => card(u.code).type_code !== "enemy");
      t.encounterDeck = Array<string>(30).fill(SA.nenuial);
      t.encounterDiscard = [];
    }
    x.epic!.cityStrength = 50;
  };
  calm(s);
  s = drive(s, planning(2));
  assert.deepEqual(
    saTeams(s).map((t) => t.stage),
    [2, 2, 2],
  );
  calm(s);
  for (const t of saTeams(s)) t.progress = 50;
  team(s, 2).progress = 20; // 2F is not complete: nobody advances
  s = drive(s, planning(3));
  assert.equal(s.status, "playing");
  assert.deepEqual(
    saTeams(s).map((t) => t.stage),
    [2, 2, 2],
  );
  calm(s);
  // Enough progress that no removal in round 3 undoes a stage.
  for (const t of saTeams(s)) t.progress = 200;
  s = drive(s, planning(4));
  assert.equal(s.status, "playing");
  assert.deepEqual(
    saTeams(s).map((t) => [t.stage, card(t.annuminas!.currentQuest).name]),
    [
      [3, "Lead the Sortie"],
      [3, "Rescue the Captives"],
      [3, "Stop the Attack"],
    ],
  );
  const all = (code: string) =>
    saTeams(s).reduce(
      (n, t) =>
        n +
        [
          ...t.staging,
          ...playerOrder(t).flatMap((p) => seatView(t, p).engaged),
          ...(t.activeLocation ? [t.activeLocation] : []),
        ].filter((u) => u.code === code).length,
      0,
    );
  assert.deepEqual(
    [SA.ram, SA.lieutenant, SA.camp, SA.tunnel].map(all),
    [1, 1, 1, 1],
  );
  // Each player at each stage put a hero under the main quest at its stage.
  assert.deepEqual(
    saTeams(s).map((t) => t.annuminas!.captives!.length),
    [1, 1, 1],
  );
});

test("Try again: a retried epic game sets up the same three teams", () => {
  const s = table([2, 1, 3]);
  selectTeam(s, 1);
  s.status = "lost";
  const decks = (x: GameState) =>
    saTeams(x).map((t) => t.table!.seats.map((p) => p.deckId));
  const again = retryAdventure(s, 77);
  assert.equal(again.epicTeam, 0);
  assert.equal(again.epic!.cityStrength, 50);
  assert.deepEqual(decks(again), decks(s));
  assert.deepEqual(
    saTeams(again).map((t) => t.annuminas!.currentQuest),
    [SA.rebuild, SA.levee, SA.delay],
  );
  assert.ok(validateSave(JSON.parse(JSON.stringify(again))));
});
