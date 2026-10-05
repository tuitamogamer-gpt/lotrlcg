import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { card, cards, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import { DRUADAN_PLAYER_CARDS } from "../src/game/druadan-player-support.ts";
import {
  applyAction as rawAct,
  canPlay,
  createGame,
  playTargets,
} from "../src/game/engine.ts";
import {
  check,
  discardCharacter,
  nextRound,
  phaseEnd,
  returnAlly,
} from "../src/game/board.ts";
import { beginEnemyAttack, playerAttack } from "../src/game/combat.ts";
import { fx, stats, questWill } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import {
  druadanPlayerStartingThreat,
  druadanPlayerPhaseStarted,
  druadanPlayerQuestStat,
  druadanPlayerUndefendedTargets,
} from "../src/game/druadan-player-cards.ts";
import { gondorResourcesGained } from "../src/game/gondor-player-cards.ts";
import { hasResourceIcon } from "../src/game/expansion-passives.ts";
import {
  selectSeat,
  seatView,
  startPhase,
  syncSeat,
} from "../src/game/table.ts";
import { KHAZAD } from "../src/game/khazad-dum.ts";
import { WATCHER_WATER } from "../src/game/watcher-water.ts";
import { validateSave } from "../src/game/save.ts";
import type { GameState, Phase, Unit } from "../src/game/types.ts";
let nextId = 1_160_000;
const unit = (code: string, owner = 0): Unit => ({
  id: `druadan-player-${nextId++}`,
  owner,
  code,
  exhausted: false,
  damage: 0,
  progress: 0,
  resources: 0,
  committed: false,
  attachments: [],
  boost: 0,
  attacked: false,
  shadows: [],
});
function game(sphere = "leadership") {
  const d = STARTERS.find((d) => d.id === sphere)!;
  const s = act(createGame(721, d.cards, d.heroes, d.id), { type: "KEEP" });
  s.hand = [];
  s.staging = [];
  s.heroes.forEach((h) => (h.resources = 10));
  return s;
}
function table() {
  const d = STARTERS[0];
  let s = createGame(722, d.cards, d.heroes, d.id, {
    seats: [
      { heroes: ["01001", "01002"], deckId: "leadership" },
      { heroes: ["01004", "01005"], deckId: "tactics" },
      { heroes: ["01011", "01012"], deckId: "lore" },
    ],
  });
  while (s.phase === "setup") s = act(s, { type: "KEEP" });
  for (let i = 0; i < 3; i++) {
    selectSeat(s, i);
    s.hand = [];
    s.heroes.forEach((h) => (h.resources = 10));
    syncSeat(s);
  }
  selectSeat(s, 0);
  s.staging = [];
  return s;
}
function choose(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    `Missing ${id}: ${JSON.stringify(s.choice)}`,
  );
  return act(s, { type: "CHOOSE", id });
}
function play(s: GameState, code: string, target?: string) {
  const u = unit(code, s.table?.active ?? 0);
  s.hand.push(u);
  syncSeat(s);
  return act(s, { type: "PLAY", id: u.id, target });
}
function customDeck() {
  return Object.fromEntries(
    Object.values(cards)
      .filter(
        (c) =>
          SCRIPTED.has(c.code) &&
          ["ally", "attachment", "event"].includes(c.type_code) &&
          c.sphere_code !== "encounter" &&
          (c.deck_limit ?? 3) >= 3 &&
          !c.code.startsWith("rc"),
      )
      .slice(0, 17)
      .map((c) => [c.code, 3]),
  );
}
function outlands(s: GameState) {
  const f = unit("06033");
  s.allies.push(f, unit("06004"), unit("06006"), unit("06008"));
  return f;
}

test("Drúadan Forest registers all ten exact player designs", () => {
  assert.equal(DRUADAN_PLAYER_CARDS.length, 10);
  for (const c of DRUADAN_PLAYER_CARDS) {
    assert.ok(SCRIPTED.has(c.code), c.code);
    assert.equal(card(c.code).text, c.text);
  }
});
test("Mirlonde lowers the initial threat of each printed Lore hero including herself", () => {
  const d = STARTERS.find((d) => d.id === "lore")!,
    heroes = ["06032", "01011", "01012"],
    printed = heroes.reduce((n, c) => n + card(c).threat!, 0),
    s = createGame(723, customDeck(), heroes, "custom");
  assert.equal(s.threat, printed - 3);
  assert.equal(s.startingThreat, printed - 3);
  assert.equal(druadanPlayerStartingThreat(heroes), -3);
});
test("Mirlonde's preview adjustment requires her presence and excludes gained icons", () => {
  assert.equal(druadanPlayerStartingThreat(["06032", "01001", "01012"]), -2);
  assert.equal(druadanPlayerStartingThreat(["01011", "01012"]), 0);
  assert.equal(
    druadanPlayerStartingThreat([card("06032"), card("01001"), card("01012")]),
    -2,
  );
  assert.equal(druadanPlayerStartingThreat(["unknown"]), 0);
});
test("Mirlonde starting threat is independent per player and remains unchanged after hero removal", () => {
  const d = STARTERS[0],
    s = createGame(724, d.cards, d.heroes, "leadership", {
      seats: [
        { heroes: ["06032", "01012"], deckId: "custom", cards: customDeck() },
        { heroes: ["01011"], deckId: "lore" },
      ],
    });
  assert.equal(
    seatView(s, 0).startingThreat,
    card("06032").threat! + card("01012").threat! - 2,
  );
  assert.equal(seatView(s, 1).startingThreat, card("01011").threat!);
  const before = seatView(s, 0).startingThreat;
  selectSeat(s, 0);
  s.heroes.pop();
  assert.equal(s.startingThreat, before);
});
test("Forlong readies at all seven real phase boundaries including Resource", () => {
  const s = game(),
    f = outlands(s);
  s.phase = "refresh";
  for (const phase of [
    "resource",
    "planning",
    "quest",
    "travel",
    "encounter",
    "defense",
    "refresh",
  ] as Phase[]) {
    f.exhausted = true;
    startPhase(s, phase);
    assert.equal(f.exhausted, false, phase);
  }
});
test("Forlong does not ready at quest staging or the player-attack step of the same phase", () => {
  const s = game(),
    f = outlands(s);
  s.phase = "quest";
  f.exhausted = true;
  startPhase(s, "staging");
  assert.equal(f.exhausted, true);
  s.phase = "defense";
  startPhase(s, "attack");
  assert.equal(f.exhausted, true);
});
test("The real Resource action window preserves Forlong's Resource and Planning transitions", () => {
  const s = game(),
    f = outlands(s);
  f.exhausted = true;
  nextRound(s);
  assert.equal(s.phase, "resource");
  assert.equal(f.exhausted, false);
  f.exhausted = true;
  const next = rawAct(s, { type: "NEXT" });
  assert.equal(next.phase, "planning");
  assert.equal(next.allies.find((u) => u.id === f.id)?.exhausted, false);
});
test("Forlong requires four spheres of controlled Outlands allies and counts his own Leadership sphere", () => {
  const s = table(),
    f = outlands(s);
  s.allies = s.allies.filter((u) => u.code !== "06008");
  seatView(s, 1).allies.push(unit("06008", 1));
  f.exhausted = true;
  druadanPlayerPhaseStarted(s, "planning", "quest");
  assert.equal(f.exhausted, true);
  s.allies.push(unit("06008"));
  druadanPlayerPhaseStarted(s, "planning", "quest");
  assert.equal(f.exhausted, false);
});
test("Forlong's blanked text and an inability to ready suppress the phase readiness", () => {
  const s = game(),
    f = outlands(s);
  f.attachments.push({
    id: "wrapped",
    code: WATCHER_WATER.wrapped,
    exhausted: false,
  });
  f.exhausted = true;
  startPhase(s, "quest");
  assert.equal(f.exhausted, true);
  f.attachments = [];
  f.blanked = true;
  druadanPlayerPhaseStarted(s, "quest", "travel");
  assert.equal(f.exhausted, true);
});
test("Strength of Arms readies allies belonging to every player while leaving heroes exhausted", () => {
  let s = table(),
    own = unit("05018"),
    other = unit("05007", 1);
  own.exhausted = other.exhausted = true;
  s.allies.push(own);
  seatView(s, 1).allies.push(other);
  s.heroes[0].exhausted = true;
  s = play(s, "06034");
  assert.equal(s.allies.find((u) => u.id === own.id)?.exhausted, false);
  assert.equal(
    seatView(s, 1).allies.find((u) => u.id === other.id)?.exhausted,
    false,
  );
  assert.equal(s.heroes[0].exhausted, true);
});
test("The mono-sphere event restrictions use printed icons rather than gained Songs", () => {
  const s = game("lore");
  for (const h of s.heroes)
    h.attachments.push({ id: `lead-${h.id}`, code: "02010", exhausted: false });
  s.allies.push({ ...unit("05018"), exhausted: true });
  assert.equal(hasResourceIcon(s.heroes[0], "leadership"), true);
  assert.match(canPlay(s, unit("06034")) ?? "", /printed leadership/);
  assert.match(canPlay(s, unit("06036")) ?? "", /printed tactics/);
});
test("Strength of Arms requires at least one exhausted ally able to ready", () => {
  const s = game(),
    a = unit("05018");
  a.exhausted = true;
  a.attachments.push({
    id: "wrapped",
    code: WATCHER_WATER.wrapped,
    exhausted: false,
  });
  s.allies.push(a);
  assert.match(canPlay(s, unit("06034")) ?? "", /exhausted ally/);
});
test("Mighty Prowess responds to an attack kill and damages another enemy sharing a captured trait", () => {
  let s = game("tactics"),
    hero = s.heroes[0],
    victim = unit("01089"),
    other = unit("01089");
  hero.damage = 1;
  hero.attachments.push({ id: "prowess", code: "06035", exhausted: false });
  s.engaged.push(victim);
  s.staging.push(other);
  s.phase = "attack";
  playerAttack(s, victim, [hero.id]);
  flush(s);
  assert.equal(s.choice?.title, "Mighty Prowess · Attack destroyed enemy");
  s = choose(s, other.id);
  assert.equal(s.staging.find((u) => u.id === other.id)?.damage, 1);
  assert.equal(s.discard.includes("06035"), false);
});
test("Mighty Prowess's attachment restrictions accept gained Tactics icons, limit one and use no Restricted slot", () => {
  const s = game(),
    hero = s.heroes[0];
  hero.attachments.push(
    { id: "tactics", code: "02104", exhausted: false },
    { id: "restricted-1", code: "01040", exhausted: false },
    { id: "restricted-2", code: "01041", exhausted: false },
  );
  assert.ok(playTargets(s, unit("06035")).some((u) => u.id === hero.id));
  hero.attachments.push({ id: "prowess", code: "06035", exhausted: false });
  assert.ok(!playTargets(s, unit("06035")).some((u) => u.id === hero.id));
});
test("Mighty Prowess has no response when an enemy leaves through a card effect rather than attack damage", () => {
  const s = game("tactics"),
    hero = s.heroes[0];
  hero.attachments.push({ id: "prowess", code: "06035", exhausted: false });
  const enemy = unit("01089");
  s.engaged.push(enemy);
  discardCharacter(s, enemy);
  flush(s);
  assert.notEqual(s.choice?.title, "Mighty Prowess · Attack destroyed enemy");
});
test("Silvan Refugees are forced to discard after another player's character returns to hand", () => {
  const s = table(),
    a = unit("06037"),
    b = unit("06037", 1),
    leaver = unit("05007", 1);
  s.allies.push(a);
  seatView(s, 1).allies.push(b, leaver);
  s.heroes[0].attachments.push({ id: "horn", code: "01042", exhausted: false });
  const resources = s.heroes[0].resources;
  returnAlly(s, leaver);
  flush(s);
  assert.ok(!seatView(s, 0).allies.some((u) => u.code === "06037"));
  assert.ok(!seatView(s, 1).allies.some((u) => u.code === "06037"));
  assert.equal(seatView(s, 0).heroes[0].resources, resources);
});
test("Silvan Refugee ignores an enemy's departure", () => {
  const s = game(),
    refugee = unit("06037"),
    enemy = unit("01089");
  s.allies.push(refugee);
  s.engaged.push(enemy);
  discardCharacter(s, enemy);
  flush(s);
  assert.ok(s.allies.some((u) => u.id === refugee.id));
});
test("Harbor Master adds one optional defense per positive card-effect resource occurrence", () => {
  let s = game("lore"),
    master = unit("06039"),
    hero = s.heroes[0];
  s.allies.push(master);
  gondorResourcesGained(s, hero, 3, true);
  flush(s);
  assert.equal(s.choice?.title, "Harbor Master · Card-effect resource gain");
  assert.equal(stats(s, master).defense, 0);
  s = choose(s, "defense");
  assert.equal(stats(s, s.allies[0]).defense, 1);
  gondorResourcesGained(s, s.heroes[0], 1, true);
  flush(s);
  s = choose(s, "defense");
  assert.equal(stats(s, s.allies[0]).defense, 2);
  phaseEnd(s);
  assert.equal(stats(s, s.allies[0]).defense, 2);
  nextRound(s);
  assert.equal(stats(s, s.allies[0]).defense, 0);
});
test("Harbor Master ignores framework gains and zero resources", () => {
  const s = game("lore"),
    master = unit("06039");
  s.allies.push(master);
  gondorResourcesGained(s, s.heroes[0], 1, false);
  gondorResourcesGained(s, s.heroes[0], 0, true);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(stats(s, master).defense, 0);
});
test("Harbor Master responses are per physical copy and belong to the recipient hero's controller", () => {
  let s = table(),
    a = unit("06039", 1),
    b = unit("06039", 1),
    foreign = unit("06039", 0);
  seatView(s, 1).allies.push(a, b);
  s.allies.push(foreign);
  gondorResourcesGained(s, seatView(s, 1).heroes[0], 2, true);
  flush(s);
  assert.equal(s.table?.active, 1);
  s = choose(s, "defense");
  assert.equal(s.choice?.title, "Harbor Master · Card-effect resource gain");
  s = choose(s, "defense");
  assert.equal(stats(s, seatView(s, 1).allies[0]).defense, 1);
  assert.equal(stats(s, seatView(s, 1).allies[1]).defense, 1);
  assert.equal(stats(s, seatView(s, 0).allies[0]).defense, 0);
});
test("Trained for War changes the current quest to Battle, using current attack through phase end", () => {
  let s = game("tactics");
  s.phase = "quest";
  s.heroes.forEach((h) => (h.committed = true));
  s = play(s, "06036");
  assert.equal(druadanPlayerQuestStat(s), "attack");
  assert.equal(
    questWill(s),
    s.heroes.reduce((n, h) => n + stats(s, h).attack, 0),
  );
  phaseEnd(s);
  assert.equal(druadanPlayerQuestStat(s), "will");
});
test("Trained for War does not transfer its keyword to a subsequently advanced quest", () => {
  let s = game("tactics");
  s = play(s, "06036");
  s.stage = 2;
  assert.equal(druadanPlayerQuestStat(s), "will");
});
test("Battle quest resolution retains its actual statistic after the phase keyword expires", () => {
  let s = game("tactics");
  s.phase = "quest";
  s.heroes.forEach((h) => (h.committed = true));
  s = play(s, "06036");
  const strength = questWill(s);
  s.phase = "staging";
  s = rawAct(s, { type: "NEXT" });
  assert.equal(s.lastQuest?.stat, "attack");
  assert.equal(s.lastQuest?.will, strength);
  assert.ok(s.log.some((entry) => entry.text.includes(`${strength} attack`)));
  assert.equal(druadanPlayerQuestStat(s), "will");
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
});
test("Against the Shadow uses current willpower instead of defense and ignores defense-only bonuses", () => {
  let s = game("spirit"),
    hero = s.heroes[0];
  hero.tempDefense = 5;
  s = play(s, "06038");
  assert.equal(stats(s, s.heroes[0]).defense, stats(s, s.heroes[0]).will);
  s.heroes[0].tempWill = 2;
  assert.equal(stats(s, s.heroes[0]).defense, card(hero.code).willpower! + 2);
  phaseEnd(s);
  assert.equal(stats(s, s.heroes[0]).defense, card(hero.code).defense);
});
test("Against the Shadow snapshots eligible existing characters and its substitution survives printed text blanking", () => {
  let s = game("spirit"),
    ally = unit("01043");
  s.allies.push(ally);
  s = play(s, "06038");
  const future = unit("01043");
  s.allies.push(future);
  assert.equal(stats(s, future).defense, card(future.code).defense);
  s.heroes[0].attachments.push({
    id: "grasping",
    code: WATCHER_WATER.grasping,
    exhausted: false,
  });
  assert.equal(stats(s, s.heroes[0]).defense, stats(s, s.heroes[0]).will);
});
test("Advance Warning prevents engagement checks this phase while optional engagement remains legal", () => {
  let s = game("lore");
  s.phase = "encounter";
  s.threat = 45;
  s = play(s, "06040");
  const enemy = unit("01084");
  s.staging.push(enemy);
  s.queue.push(fx("engagementRound"));
  flush(s);
  assert.ok(s.staging.some((u) => u.id === enemy.id));
  s = act(s, { type: "ENGAGE", id: enemy.id });
  assert.ok(s.engaged.some((u) => u.id === enemy.id));
});
test("White Tower Watchman can take all undefended damage while exhausted when heroes share a sphere", () => {
  let s = game("leadership"),
    watchman = unit("06041"),
    enemy = unit("01082");
  watchman.exhausted = true;
  s.allies.push(watchman);
  s.engaged.push(enemy);
  s.phase = "defense";
  beginEnemyAttack(s, enemy, []);
  flush(s);
  assert.ok(s.choice?.options.some((o) => o.id === watchman.id));
  s = choose(s, watchman.id);
  assert.ok(!s.allies.some((u) => u.id === watchman.id));
  assert.ok(s.heroes.every((h) => h.damage === 0));
});
test("Watchman's shared sphere accepts gained icons and excludes another player's Watchman", () => {
  const s = table(),
    own = unit("06041"),
    other = unit("06041", 1);
  s.allies.push(own);
  seatView(s, 1).allies.push(other);
  s.heroes[1].code = "01012";
  assert.equal(druadanPlayerUndefendedTargets(s).length, 0);
  s.heroes[1].attachments.push({ id: "song", code: "02010", exhausted: false });
  assert.deepEqual(
    druadanPlayerUndefendedTargets(s).map((u) => u.id),
    [own.id],
  );
  s.heroes = [];
  assert.equal(druadanPlayerUndefendedTargets(s).length, 0);
});
test("Pending Harbor Master response and resolved phase effects survive save validation", () => {
  let s = game("lore");
  s.allies.push(unit("06039"));
  gondorResourcesGained(s, s.heroes[0], 1, true);
  flush(s);
  assert.ok(validateSave(s));
  s = choose(s, "defense");
  s = play(s, "06040");
  assert.ok(validateSave(s));
});
test("Another player's elimination discards their characters and triggers the surviving Refugee", () => {
  const s = table(),
    refugee = unit("06037");
  s.allies.push(refugee);
  seatView(s, 1).allies.push(unit("05007", 1));
  s.table!.seats[1].threat = 50;
  check(s);
  flush(s);
  assert.equal(s.status, "playing");
  assert.equal(s.table?.seats[1].eliminated, true);
  assert.ok(!seatView(s, 0).allies.some((u) => u.id === refugee.id));
  assert.ok(seatView(s, 0).discard.includes(refugee.code));
});
test("Harbor Master reacts once to Steward's two-resource effect and remains optional", () => {
  let s = game("lore"),
    hero = s.heroes[0];
  s.allies.push(unit("06039"));
  hero.attachments.push({ id: "steward", code: "01026", exhausted: false });
  const before = hero.resources;
  s = act(s, { type: "ABILITY", id: hero.id, attachmentId: "steward" });
  assert.equal(s.heroes[0].resources, before + 2);
  assert.equal(s.choice?.title, "Harbor Master · Card-effect resource gain");
  s = choose(s, "skip");
  assert.equal(stats(s, s.allies[0]).defense, 0);
  assert.equal(s.choice, null);
});
test("Mighty Prowess can respond to its hero participating in another player's attack", () => {
  let s = table(),
    ranged = s.heroes[0],
    victim = unit("01089", 1),
    other = unit("01089");
  ranged.attachments.push(
    { id: "bow", code: "04057", exhausted: false },
    { id: "song", code: "02104", exhausted: false },
    { id: "prowess", code: "06035", exhausted: false },
  );
  seatView(s, 1).engaged.push(victim);
  s.staging.push(other);
  syncSeat(s);
  selectSeat(s, 1);
  s.phase = "attack";
  playerAttack(s, victim, [s.heroes[0].id, ranged.id]);
  flush(s);
  assert.equal(s.table?.active, 0);
  assert.equal(s.choice?.title, "Mighty Prowess · Attack destroyed enemy");
  s = choose(s, other.id);
  assert.equal(s.staging.find((u) => u.id === other.id)?.damage, 1);
});
test("Siege quests use Against the Shadow's substituted current willpower", () => {
  let s = game("spirit"),
    original = card("01119");
  cards["01119"] = {
    ...original,
    back_text: `Siege. ${original.back_text ?? ""}`,
  };
  try {
    s.heroes.forEach((h) => (h.committed = true));
    assert.equal(druadanPlayerQuestStat(s), "defense");
    s = play(s, "06038");
    assert.equal(
      questWill(s),
      s.heroes.reduce((n, h) => n + stats(s, h).will, 0),
    );
  } finally {
    cards["01119"] = original;
  }
});
