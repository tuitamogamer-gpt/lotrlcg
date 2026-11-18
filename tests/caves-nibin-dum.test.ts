import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, publicState } from "../src/game/engine";
import { card } from "../src/game/cards";
import { engagementCost, fx, get, stats, threatOf } from "../src/game/core";
import { check, progress } from "../src/game/board";
import { flush } from "../src/game/effects";
import { availableAbilities } from "../src/game/actions";
import { forOwner, hasKeyword, seatView } from "../src/game/table";
import { OATH } from "../src/game/the-oath-support";
import {
  CAVES,
  CAVES_HOOKS,
  cavesPublicState,
  cavesRecipe,
} from "../src/game/caves-nibin-dum";
import { CAVES_ADVENTURES } from "../src/game/caves-nibin-dum-scenario-data";
import {
  activate,
  allies,
  atStage,
  base,
  choose,
  deck,
  engaged,
  reload,
  settle,
  stage,
  start,
} from "./caves-nibin-dum-fixtures";
import type { GameState, ScenarioId, Unit } from "../src/game/types";

const H = CAVES_HOOKS;
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
const run = (s: GameState, ...effects: ReturnType<typeof fx>[]) => {
  s.queue.push(...effects);
  flush(s);
  return s;
};
/** Check the quest stage after progress was placed. */
const advance = (s: GameState) => {
  check(s);
  flush(s);
  return s;
};
const defend = (s: GameState, enemy: Unit, defender?: Unit) =>
  act(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender?.id ?? null,
  });
const threats = (s: GameState) =>
  (s.table?.seats ?? [{ threat: s.threat }]).map((x) => x.threat);
const torchOf = (s: GameState) =>
  s.heroes.flatMap((h) =>
    h.attachments.filter((a) => a.code === CAVES.torch).map((a) => ({ h, a })),
  )[0];
/** Bring a set-aside card into play. */
const fromAside = (s: GameState, code: string) => {
  const q = s.caves!;
  q.setAside = q.setAside.filter((c) => c !== code);
};
const GUARD = "01013",
  SNOWBOURN = "01016";

test("Setup: both editions and their easy modes build the printed encounter decks; Cave Torch is attached, Goblin Chieftain and Cracked Pillar are set aside, and each player adds a different location", () => {
  const sizes: [ScenarioId, boolean, string, number][] = [
    ["the-caves-of-nibin-dum-2018", false, "Q00.02A", 32],
    ["the-caves-of-nibin-dum-2018", true, "Q00.02A-easy", 24],
    ["the-caves-of-nibin-dum", false, "Q00.02B", 36],
    ["the-caves-of-nibin-dum", true, "E00.02B", 28],
  ];
  for (const [scenarioId, easy, id, size] of sizes) {
    assert.equal(cavesRecipe(scenarioId, easy).id, id);
    const s = start(1, easy, scenarioId);
    const q = s.caves!;
    assert.equal(
      q.edition,
      scenarioId === "the-caves-of-nibin-dum" ? "2022" : "2018",
    );
    assert.equal(q.currentQuest, CAVES.dark);
    assert.equal(s.stage, 1);
    assert.deepEqual(
      [...q.setAside].sort(),
      [CAVES.chieftain, CAVES.pillar].sort(),
    );
    // The first player attached Cave Torch to one of his heroes.
    assert.ok(torchOf(s), "Cave Torch is attached to a hero");
    // 1B: one location for the single player, from the encounter deck.
    assert.equal(s.staging.length, 1);
    assert.equal(card(s.staging[0].code).type_code, "location");
    const codes = [
      ...s.encounterDeck,
      ...s.encounterDiscard,
      ...s.staging.map((u) => u.code),
      ...q.setAside,
      CAVES.torch,
    ];
    assert.equal(codes.length, size, `${id}: ${size} encounter cards`);
    // The Dark of Mirkwood adds Crumbling Stairs, Wild Wargs and Obsidian Arrows.
    for (const c of [CAVES.stairs, OATH.wargs, OATH.arrows])
      assert.equal(
        codes.includes(c),
        scenarioId === "the-caves-of-nibin-dum",
        `${id}: ${card(c).name}`,
      );
    // Easy mode removes Goblin Runners, Goblins are Upon You!, Great
    // Cave-troll, Branching Paths and Watchful Eyes.
    for (const c of [
      OATH.runners,
      OATH.upon,
      CAVES.troll,
      CAVES.branching,
      CAVES.eyes,
    ])
      assert.equal(codes.includes(c), !easy, `${id}: ${card(c).name}`);
    reload(s);
  }
  for (const players of [2, 3, 4]) {
    const s = start(players);
    assert.equal(s.staging.length, players);
    assert.equal(
      new Set(s.staging.map((u) => card(u.code).name)).size,
      players,
      "each player adds a different location",
    );
    assert.ok(s.staging.every((u) => card(u.code).type_code === "location"));
    reload(s);
  }
  assert.deepEqual(
    CAVES_ADVENTURES.map((a) => [a.id, a.stages.map((x) => x.quest)]),
    [
      ["the-caves-of-nibin-dum-2018", [8, 0, 0, 8]],
      ["the-caves-of-nibin-dum", [8, 0, 0, 8]],
    ],
  );
});

test("1B → 2A: Goblin Chieftain joins the staging area and each player adds a different enemy from the encounter deck or discard pile; 2B has 4 quest points per enemy in play and 0 engagement costs during the encounter phase", () => {
  let s = base(2);
  s.encounterDeck = [CAVES.warg, OATH.sniper, CAVES.passage, CAVES.troll];
  s.encounterDiscard = [OATH.runners];
  s.progress = 8;
  advance(s);
  assert.equal(s.stage, 2);
  assert.equal(s.caves!.currentQuest, CAVES.surprise);
  assert.equal(s.progress, 0);
  assert.ok(s.staging.some((u) => u.code === CAVES.chieftain));
  assert.ok(!s.caves!.setAside.includes(CAVES.chieftain));
  assert.match(s.choice!.title, /^Surprise Attack · Add a different enemy/);
  // Enemies from the deck and the discard pile, by title.
  assert.deepEqual(s.choice!.options.map((o) => card(o.code!).name).sort(), [
    "Cavern Warg",
    "Goblin Runners",
    "Goblin Sniper",
    "Great Cave-troll",
  ]);
  s = choose(s, OATH.runners);
  // The second player cannot take the same title.
  assert.ok(!s.choice!.options.some((o) => o.code === OATH.runners));
  s = choose(s, CAVES.troll);
  s = settle(s);
  assert.deepEqual(
    s.staging.map((u) => u.code).sort(),
    [CAVES.chieftain, OATH.runners, CAVES.troll].sort(),
  );
  assert.deepEqual(s.encounterDiscard, []);
  assert.ok(s.log.some((l) => /encounter deck is shuffled/.test(l.text)));
  // 2B: 4 quest points for each enemy in play.
  assert.equal(H.stageInfo!(s)!.quest, 12);
  engaged(s, CAVES.warg, 1);
  assert.equal(H.stageInfo!(s)!.quest, 16);
  // During the encounter phase each enemy's engagement cost is 0.
  const troll = s.staging.find((u) => u.code === CAVES.troll)!;
  s.phase = "encounter";
  assert.equal(engagementCost(s, troll), 0);
  s.phase = "planning";
  assert.equal(engagementCost(s, troll), card(CAVES.troll).engagement);
  // The stage is defeated at 4 progress per enemy in play.
  s.progress = 15;
  advance(s);
  assert.equal(s.stage, 2);
  s.progress = 16;
  advance(s);
  assert.equal(s.stage, 3);
  reload(s);
});

test("2B → 3A: Goblin Chieftain is set aside with its damage, Cracked Pillar enters the staging area; 3B reveals an additional encounter card and only Cracked Pillar's exploration advances", () => {
  let s = base();
  atStage(s, 2);
  fromAside(s, CAVES.chieftain);
  const chieftain = engaged(s, CAVES.chieftain);
  chieftain.damage = 2;
  s.progress = 4;
  advance(s);
  assert.equal(s.stage, 3);
  assert.equal(s.caves!.currentQuest, CAVES.chasm);
  assert.ok(!s.engaged.some((u) => u.code === CAVES.chieftain));
  assert.ok(s.caves!.setAside.includes(CAVES.chieftain));
  assert.ok(!s.caves!.setAside.includes(CAVES.pillar));
  const pillar = s.staging.find((u) => u.code === CAVES.pillar)!;
  assert.ok(pillar);
  // An additional encounter card during the quest phase.
  assert.equal(H.extraStagingReveals!(s), 1);
  // No progress on Cracked Pillar while it is in the staging area.
  assert.equal(H.locationProgressBlocked!(s, pillar), true);
  // "–" quest points: progress never defeats 3B.
  s.progress = 30;
  advance(s);
  assert.equal(s.stage, 3);
  // Cracked Pillar can be traveled to only with 4 damage, which it loses.
  s.progress = 0;
  s.phase = "travel";
  assert.match(H.travelProblem!(s, pillar)!, /remove 4 damage/);
  pillar.damage = 5;
  assert.equal(H.travelProblem!(s, pillar), null);
  s = act(s, { type: "TRAVEL", id: pillar.id });
  s = settle(s);
  assert.equal(s.activeLocation?.code, CAVES.pillar);
  assert.equal(s.activeLocation?.damage, 1);
  assert.equal(cavesPublicState(s)!.pillar, "active");
  // Exploring it advances to 4A: Goblin Chieftain returns to the staging area.
  progress(s, 2);
  flush(s);
  s = settle(s);
  advance(s);
  assert.equal(s.stage, 4);
  assert.equal(s.caves!.currentQuest, CAVES.oathkeepers);
  const back = s.staging.find((u) => u.code === CAVES.chieftain)!;
  assert.ok(back);
  assert.equal(back.damage, 0, "the Chieftain left play with its damage");
  assert.equal(cavesPublicState(s)!.pillar, "explored");
  reload(s);
});

test("Cracked Pillar: the first player attacks it in the combat phase once per round, with his characters and other players' Ranged characters, against its threat as defense", () => {
  let s = base(2);
  atStage(s, 3);
  fromAside(s, CAVES.pillar);
  const pillar = stage(s, CAVES.pillar);
  s.phase = "attack";
  // Only during the combat phase, only the first player.
  assert.equal(availableAbilities(s, pillar).length > 0, true);
  s.phase = "planning";
  assert.match(H.abilityProblem!(s, pillar)!, /combat phase/);
  s.phase = "attack";
  forOwner(s, 1, () => {
    for (const h of s.heroes) h.exhausted = false;
  });
  s = act(s, { type: "ABILITY", id: pillar.id });
  assert.match(s.choice!.title, /^Cracked Pillar · Declare attackers/);
  // The other player's characters are offered only if Ranged.
  const others = seatView(s, 1).heroes;
  for (const h of others)
    assert.equal(
      s.choice!.options.some((o) => o.id === h.id),
      hasKeyword(h, "Ranged"),
      card(h.code).name,
    );
  assert.ok(others.some((h) => hasKeyword(h, "Ranged")));
  const [a, b] = s.heroes;
  s = choose(s, a.id);
  s = choose(s, b.id);
  const total = stats(s, get(s, a.id)!).attack + stats(s, get(s, b.id)!).attack;
  s = choose(s, "attack");
  const dealt = Math.max(0, total - threatOf(s, pillar));
  assert.equal(s.staging.find((u) => u.code === CAVES.pillar)!.damage, dealt);
  assert.ok(get(s, a.id)!.exhausted && get(s, b.id)!.exhausted);
  assert.equal(cavesPublicState(s)!.pillarDamage, dealt);
  // Once per round.
  assert.match(
    H.abilityProblem!(
      s,
      s.staging.find((u) => u.code === CAVES.pillar)!,
    )!,
    /already attacked this round/,
  );
  reload(s);
});

test("Oathkeepers (4B): Goblin Chieftain has X = 4 threat, attack and defense and takes damage only with 8 progress on the stage; the stage cannot be defeated while it is in play, and its defeat wins", () => {
  let s = base();
  atStage(s, 4);
  fromAside(s, CAVES.chieftain);
  const chieftain = engaged(s, CAVES.chieftain);
  assert.equal(stats(s, chieftain).attack, 4);
  assert.equal(stats(s, chieftain).defense, 4);
  assert.equal(threatOf(s, chieftain), 4);
  assert.equal(H.cannotAttach!(s, chieftain), true);
  // Cannot take damage below 8 progress.
  s.progress = 7;
  assert.equal(H.damageAmount!(s, chieftain, 3, {}), 0);
  s.progress = 8;
  assert.equal(H.damageAmount!(s, chieftain, 3, {}), 3);
  // At 2B the X is 2 and it never takes damage.
  atStage(s, 2);
  assert.equal(stats(s, chieftain).attack, 2);
  assert.equal(H.damageAmount!(s, chieftain, 3, {}), 0);
  atStage(s, 4);
  // 8 progress do not defeat the stage while the Chieftain is in play.
  s.progress = 9;
  advance(s);
  assert.equal(s.status, "playing");
  // Destroyed with 8 progress, the players win.
  chieftain.damage = 8;
  advance(s);
  assert.equal(s.status, "won");
  assert.match(s.reason ?? "", /rescue the captives/);
  reload(s);
});

test("Goblin Chieftain: after it attacks, remove X progress or return it to the staging area (only from engagement); Goblin Runners' additional attack is not made from the staging area", () => {
  let s = base();
  atStage(s, 2);
  fromAside(s, CAVES.chieftain);
  let chieftain = engaged(s, CAVES.chieftain);
  s.progress = 5;
  s.phase = "defense";
  s = defend(s, chieftain, s.heroes[0]);
  s = settle(s, "progress");
  assert.equal(s.progress, 3, "X = 2 progress are removed at 2B");
  assert.ok(s.engaged.some((u) => u.code === CAVES.chieftain));
  // With no progress it returns to the staging area.
  s = base();
  atStage(s, 4);
  fromAside(s, CAVES.chieftain);
  chieftain = engaged(s, CAVES.chieftain);
  s.phase = "defense";
  s = defend(s, chieftain, s.heroes[0]);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === CAVES.chieftain));
  assert.ok(!s.engaged.some((u) => u.code === CAVES.chieftain));
  assert.ok(
    s.log.some((l) =>
      /Goblin Chieftain returns to the staging area/.test(l.text),
    ),
  );
  // Goblin Runners' shadow: the additional attack is not made after the
  // Chieftain returned to the staging area, and it is not lost.
  s = base();
  atStage(s, 4);
  fromAside(s, CAVES.chieftain);
  chieftain = engaged(s, CAVES.chieftain);
  chieftain.shadows = [OATH.runners];
  s.progress = 12;
  s.phase = "defense";
  s = defend(s, chieftain, s.heroes[0]);
  s = settle(s, "return");
  assert.equal(s.progress, 12);
  assert.equal(
    [...s.staging, ...s.engaged].filter((u) => u.code === CAVES.chieftain)
      .length,
    1,
  );
  assert.ok(s.staging.some((u) => u.code === CAVES.chieftain));
  assert.equal(
    s.log.filter((l) => /Goblin Chieftain attacks/.test(l.text)).length,
    1,
  );
  assert.ok(s.encounterDiscard.includes(OATH.runners));
  // Attacking from the staging area, only the progress option remains.
  s.queue = [];
  s.choice = null;
  const staged = s.staging.find((u) => u.code === CAVES.chieftain)!;
  run(s, fx("cavesChieftainForced", { target: staged.id }));
  assert.equal(s.progress, 8);
  assert.equal(s.choice, null);
  reload(s);
});

test("Cave Torch: exhaust it to place up to 3 progress on a Dark location; its Forced effect discards the top encounter card and stages an enemy; revealed again from the encounter deck it is attached to a hero", () => {
  let s = base();
  const { h, a } = torchOf(s);
  const tunnels = stage(s, CAVES.tunnels);
  const stairs = stage(s, CAVES.stairs);
  s.encounterDeck = [CAVES.warg, CAVES.passage];
  assert.equal(H.abilityProblem!(s, h, a.id), null);
  s = act(s, { type: "ABILITY", id: h.id, attachmentId: a.id });
  assert.match(s.choice!.title, /^Cave Torch · Place up to 3 progress/);
  // Only Dark locations: Crumbling Stairs is not Dark.
  assert.ok(!s.choice!.options.some((o) => o.id === stairs.id));
  s = choose(s, tunnels.id);
  s = settle(s);
  assert.equal(s.staging.find((u) => u.id === tunnels.id)!.progress, 3);
  assert.equal(torchOf(s).a.exhausted, true);
  // Forced: the top card is discarded; an enemy is added to the staging area.
  assert.ok(s.staging.some((u) => u.code === CAVES.warg));
  assert.deepEqual(s.encounterDeck, [CAVES.passage]);
  assert.equal(cavesPublicState(s)!.torch, "exhausted");
  assert.match(
    H.abilityProblem!(s, torchOf(s).h, torchOf(s).a.id)!,
    /exhausted/,
  );
  // Only the progress the location still needs.
  s = base();
  const passage = activate(s, CAVES.passage);
  passage.progress = 3;
  s.encounterDeck = [CAVES.passage];
  const t = torchOf(s);
  s = act(s, { type: "ABILITY", id: t.h.id, attachmentId: t.a.id });
  s = choose(s, passage.id);
  s = settle(s);
  assert.ok(
    s.log.some((l) =>
      /Cave Torch: 1 progress on Lightless Passage/.test(l.text),
    ),
  );
  assert.ok(
    s.encounterDiscard.includes(CAVES.passage),
    "the top card is discarded",
  );
  // Without a Dark location the action cannot be used.
  s = base();
  const t2 = torchOf(s);
  assert.match(H.abilityProblem!(s, t2.h, t2.a.id)!, /no Dark location/);
  // Its hero leaves play: Cave Torch goes to the encounter discard pile;
  // revealed again, the first player attaches it to a hero.
  s = base();
  const holder = torchOf(s).h;
  holder.damage = 99;
  check(s);
  flush(s);
  assert.ok(s.encounterDiscard.includes(CAVES.torch));
  assert.equal(cavesPublicState(s)!.torch, "gone");
  s.encounterDiscard = [];
  s.encounterDeck = [CAVES.torch];
  run(s, fx("reveal"));
  s = settle(s);
  assert.ok(torchOf(s), "Cave Torch is attached again");
  assert.ok(!s.staging.some((u) => u.code === CAVES.torch));
  assert.equal(cavesPublicState(s)!.torch, "ready");
  reload(s);
});

test("Cavern Warg: when it attacks the player with Cave Torch, exhausting the torch cancels the attack and returns it; its shadow returns an attacker that destroys a character", () => {
  let s = base();
  const warg = engaged(s, CAVES.warg);
  s.encounterDeck = [CAVES.passage];
  s.phase = "defense";
  s = defend(s, warg, s.heroes[0]);
  assert.match(s.choice!.title, /^Cavern Warg · Exhaust Cave Torch/);
  s = choose(s, "torch");
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === warg.id));
  assert.ok(!s.engaged.some((u) => u.id === warg.id));
  assert.equal(torchOf(s).a.exhausted, true);
  assert.equal(s.heroes[0].damage, 0, "the attack is canceled");
  assert.ok(
    s.encounterDiscard.includes(CAVES.passage),
    "the torch's Forced effect",
  );
  // The response may be declined.
  s = base();
  const warg2 = engaged(s, CAVES.warg);
  s.phase = "defense";
  s = defend(s, warg2, s.heroes[0]);
  s = choose(s, "skip");
  s = settle(s);
  assert.ok(s.engaged.some((u) => u.id === warg2.id));
  // Shadow: the attacker returns after an attack that destroys a character.
  s = base();
  const troll = engaged(s, CAVES.troll);
  troll.shadows = [CAVES.warg];
  const [guard] = allies(s, [GUARD]);
  s.phase = "defense";
  s = defend(s, troll, guard);
  s = settle(s);
  assert.ok(!s.allies.some((u) => u.id === guard.id));
  assert.ok(s.staging.some((u) => u.id === troll.id));
  reload(s);
});

test("Great Cave-troll: each point of excess combat damage removes 1 progress from the quest; it cannot have attachments", () => {
  let s = base();
  const troll = engaged(s, CAVES.troll);
  const [guard] = allies(s, [GUARD]);
  s.progress = 6;
  s.phase = "defense";
  s = defend(s, troll, guard);
  s = settle(s);
  const excess = stats(s, troll).attack - 2;
  assert.equal(s.progress, 6 - excess);
  assert.ok(
    s.log.some((l) => /Great Cave-troll: \d progress are removed/.test(l.text)),
  );
  assert.equal(H.cannotAttach!(s, troll), true);
  reload(s);
});

test("Locations: Goblin Tunnels, Lightless Passage, Branching Paths, Collapsed Mine, Goblin Dungeon and Crumbling Stairs", () => {
  // Goblin Tunnels: a revealed Goblin removes a progress from the quest.
  let s = base();
  stage(s, CAVES.tunnels);
  s.progress = 3;
  s.encounterDeck = [OATH.sniper];
  run(s, fx("reveal"));
  s = settle(s);
  assert.equal(s.progress, 2);
  // Lightless Passage: travel needs a ready Cave Torch, which it exhausts.
  s = base();
  const passage = stage(s, CAVES.passage);
  s.phase = "travel";
  assert.equal(H.travelProblem!(s, passage), null);
  s = act(s, { type: "TRAVEL", id: passage.id });
  s = settle(s);
  assert.equal(s.activeLocation?.code, CAVES.passage);
  assert.equal(torchOf(s).a.exhausted, true);
  const other = stage(s, CAVES.passage);
  assert.match(H.travelProblem!(s, other)!, /exhaust a Cave Torch/);
  // Branching Paths: +1 threat to Dark locations; explored, the players
  // reveal 1 of the top 3 and the others go to the bottom.
  s = base();
  const branching = stage(s, CAVES.branching);
  const tunnels = stage(s, CAVES.tunnels);
  assert.equal(threatOf(s, tunnels), 3);
  assert.equal(threatOf(s, branching), 2);
  s.staging = s.staging.filter((u) => u.id !== branching.id);
  s.encounterDeck = [CAVES.troll, CAVES.mine, CAVES.warg, CAVES.passage];
  H.explored!(s, branching, true);
  flush(s);
  assert.match(s.choice!.title, /^Branching Paths · Choose 1 of the top 3/);
  s = choose(s, "1");
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === CAVES.mine));
  assert.deepEqual(s.encounterDeck, [CAVES.passage, CAVES.troll, CAVES.warg]);
  // Collapsed Mine: no more than 4 progress on the quest each round.
  s = base();
  stage(s, CAVES.mine);
  progress(s, 3);
  progress(s, 3);
  assert.equal(s.progress, 4);
  // Its shadow raises the threat by the damage dealt.
  s = base();
  const sniper = engaged(s, OATH.sniper);
  sniper.shadows = [CAVES.mine];
  const before = threats(s)[0];
  s.phase = "defense";
  s = defend(s, sniper);
  s = settle(s);
  assert.equal(threats(s)[0], before + stats(s, sniper).attack);
  // Goblin Dungeon: travel reveals the top card; explored, the first player
  // may put an ally from his top 5 cards into play.
  s = base();
  const dungeon = stage(s, CAVES.dungeon);
  s.phase = "travel";
  s.encounterDeck = [CAVES.passage, CAVES.passage];
  s = act(s, { type: "TRAVEL", id: dungeon.id });
  s = settle(s);
  assert.equal(s.activeLocation?.code, CAVES.dungeon);
  assert.equal(s.staging.filter((u) => u.code === CAVES.passage).length, 1);
  deck(s, ["01026", SNOWBOURN, "01026", "01026", "01026", GUARD]);
  s.activeLocation = null;
  H.explored!(s, dungeon, true);
  flush(s);
  s = choose(s, "use");
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [SNOWBOURN, "skip"],
    "only the top 5 cards",
  );
  s = choose(s, SNOWBOURN);
  s = settle(s);
  assert.ok(s.allies.some((u) => u.code === SNOWBOURN));
  assert.equal(s.deck.length, 5);
  // Crumbling Stairs: no progress in the staging area; explored, a location
  // on top of the encounter deck becomes the active location.
  s = base();
  const stairs = stage(s, CAVES.stairs);
  assert.equal(H.locationProgressBlocked!(s, stairs), true);
  s.staging = [];
  s.encounterDeck = [CAVES.mine, CAVES.passage];
  H.explored!(s, stairs, true);
  flush(s);
  assert.equal(s.activeLocation?.code, CAVES.mine);
  s.activeLocation = null;
  s.encounterDeck = [CAVES.warg];
  H.explored!(s, stairs, true);
  flush(s);
  assert.equal(s.activeLocation, null);
  assert.deepEqual(s.encounterDiscard, [CAVES.warg]);
  reload(s);
});

test("Treacheries and shadows: Crumbling Ruin, Lost in the Dark, Watchful Eyes, Goblin Tunnels and Lightless Passage", () => {
  // Crumbling Ruin: each player exhausts a character and discards his top
  // card; a cost at least the character's remaining hit points discards it.
  let s = base(2);
  const [guard] = allies(s, [GUARD]);
  deck(s, ["01026"]);
  forOwner(s, 1, () => (s.deck = ["01013"]));
  s.encounterDeck = [CAVES.ruin];
  run(s, fx("reveal"));
  assert.match(s.choice!.title, /^Crumbling Ruin · Exhaust a character/);
  s = choose(s, guard.id);
  s = settle(s);
  assert.ok(!s.allies.some((u) => u.id === guard.id), "cost 2 ≥ 1 hit point");
  assert.ok(s.discard.includes("01026"));
  assert.ok(s.encounterDiscard.includes(CAVES.ruin));
  // Lost in the Dark: the torch's player chooses; without the torch the
  // quest takes no progress this phase, but the active location does.
  s = base();
  s.phase = "staging";
  s.encounterDeck = [CAVES.lost];
  run(s, fx("reveal"));
  assert.match(s.choice!.title, /^Lost in the Dark · Exhaust Cave Torch/);
  s = choose(s, "dark");
  s = settle(s);
  progress(s, 3);
  assert.equal(s.progress, 0);
  // The active location still takes progress.
  const active = activate(s, CAVES.mine);
  progress(s, 3);
  assert.equal(active.progress, 3);
  s = base();
  s.phase = "staging";
  s.encounterDeck = [CAVES.lost, CAVES.passage];
  run(s, fx("reveal"));
  s = choose(s, "torch");
  s = settle(s);
  assert.equal(torchOf(s).a.exhausted, true);
  progress(s, 3);
  assert.equal(s.progress, 3);
  // Shadow: 1 damage to the defending character.
  s = base();
  const sniper = engaged(s, OATH.sniper);
  sniper.shadows = [CAVES.lost];
  s.phase = "defense";
  s = defend(s, sniper, s.heroes[1]);
  s = settle(s);
  assert.ok(
    s.log.some((l) =>
      /Lost in the Dark: 1 damage to the defending character/.test(l.text),
    ),
  );
  // Watchful Eyes: attached to a hero of the first player; at the end of the
  // combat phase an exhausted attached hero reveals an encounter card.
  s = base();
  s.encounterDeck = [CAVES.eyes, CAVES.passage];
  run(s, fx("reveal"));
  s = choose(s, s.heroes[1].id);
  s = settle(s);
  assert.ok(s.heroes[1].attachments.some((a) => a.code === CAVES.eyes));
  assert.deepEqual(s.caves!.resolving, []);
  s.heroes[1].exhausted = true;
  H.combatEnd!(s);
  flush(s);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === CAVES.passage));
  // Goblin Tunnels' shadow: +1 attack, +3 for a Goblin.
  s = base();
  const goblin = engaged(s, OATH.sniper);
  goblin.shadows = [CAVES.tunnels];
  s.phase = "defense";
  s = defend(s, goblin, s.heroes[0]);
  s = settle(s);
  assert.ok(
    s.log.some((l) =>
      /Goblin Tunnels: the attacking enemy gets \+3 attack/.test(l.text),
    ),
  );
  // Lightless Passage's shadow cancels combat damage to the attacker.
  s = base();
  const warg = engaged(s, CAVES.warg);
  warg.shadows = [CAVES.passage];
  torchOf(s).a.exhausted = true;
  s.phase = "defense";
  s = defend(s, warg, s.heroes[0]);
  s = settle(s);
  assert.equal(H.damageAmount!(s, warg, 5, { combatDamage: true }), 0);
  assert.equal(H.damageAmount!(s, warg, 5, {}), 5);
  reload(s);
});

test("The Goblins set in the caves: Goblin Troop, Goblins are Upon You!, Eyes in the Dark, Obsidian Arrows and Wild Wargs", () => {
  // Goblin Troop: other engaged Goblins get +1/+1; no attachments.
  let s = base();
  const troop = engaged(s, OATH.troop);
  const sniper = engaged(s, OATH.sniper);
  assert.equal(stats(s, sniper).attack, card(OATH.sniper).attack! + 1);
  assert.equal(H.cannotAttach!(s, troop), true);
  // Goblins are Upon You!: each player puts a Goblin enemy into play.
  s = base(2);
  s.encounterDeck = [OATH.upon, OATH.runners, CAVES.passage];
  s.encounterDiscard = [OATH.scavengers];
  run(s, fx("reveal"));
  s = settle(s);
  assert.equal(
    [0, 1].map((p) => seatView(s, p).engaged.length).join(","),
    "1,1",
  );
  // Eyes in the Dark: doomed 1, then threat for the questing characters or
  // one of them is discarded.
  s = base();
  const [questing] = allies(s, [GUARD]);
  questing.committed = true;
  s.heroes[0].committed = true;
  s.encounterDeck = [OATH.eyes, CAVES.passage];
  run(s, fx("reveal"));
  assert.deepEqual(threats(s), [21], "doomed 1");
  assert.match(s.choice!.title, /^Eyes in the Dark · Choose/);
  s = choose(s, "threat");
  s = settle(s);
  assert.deepEqual(threats(s), [23]);
  // Obsidian Arrows (The Dark of Mirkwood): 2 damage to a character.
  s = base();
  s.encounterDeck = [OATH.arrows];
  run(s, fx("reveal"));
  s = settle(s);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.damage, 0),
    2,
  );
  // Wild Wargs: a discarded Goblin enemy engages the player.
  s = base();
  s.encounterDeck = [OATH.sniper];
  const wargs = stage(s, OATH.wargs);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: wargs.id });
  s = settle(s);
  assert.ok(s.engaged.some((u) => u.code === OATH.sniper));
  reload(s);
});

test("Saves, both editions and the scenario panel", () => {
  for (const scenarioId of [
    "the-caves-of-nibin-dum-2018",
    "the-caves-of-nibin-dum",
  ] as const) {
    const s = base(2, scenarioId);
    atStage(s, 3);
    fromAside(s, CAVES.pillar);
    const pillar = stage(s, CAVES.pillar);
    pillar.damage = 2;
    s.caves!.pillarAttacked = s.round;
    s.caves!.noDamage = [{ id: pillar.id, round: s.round, phase: "combat" }];
    const restored = reload(s);
    assert.deepEqual(restored.caves, s.caves);
    const view = cavesPublicState(restored)!;
    assert.equal(view.side, "3B");
    assert.equal(view.stage, 3);
    assert.equal(
      view.edition,
      scenarioId === "the-caves-of-nibin-dum" ? "2022" : "2018",
    );
    assert.equal(view.chieftain, "aside");
    assert.equal(view.pillar, "staging");
    assert.equal(view.pillarDamage, 2);
    assert.equal(view.torch, "ready");
    assert.equal(view.torchHero, s.heroes[0].code);
    assert.deepEqual(publicState(restored).caves, view);
    const raw = JSON.parse(JSON.stringify(s));
    raw.stage = 2;
    assert.throws(() => reload(raw));
    const wrong = JSON.parse(JSON.stringify(s));
    wrong.caves.edition =
      scenarioId === "the-caves-of-nibin-dum" ? "2018" : "2022";
    assert.throws(() => reload(wrong));
  }
});
