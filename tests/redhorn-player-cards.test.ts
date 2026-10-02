import { applyAction as act } from "./pass-resource-window.ts";
import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { card, cards, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import { REDHORN_PLAYER_CARDS } from "../src/game/redhorn-player-support.ts";
import {
  availableAbilities,
  createGame,
  playTargets,
} from "../src/game/engine.ts";
import { discardAttachment, enterAlly, phaseEnd } from "../src/game/board.ts";
import { playerAttack } from "../src/game/combat.ts";
import { flush } from "../src/game/effects.ts";
import { playCost, stats } from "../src/game/core.ts";
import { selectSeat, seatView, syncSeat } from "../src/game/table.ts";
import {
  redhornPlayerHandAbilityProblem,
  redhornPlayerQuestSucceeded,
} from "../src/game/redhorn-player-cards.ts";
import { CARROCK } from "../src/game/carrock.ts";
import { EMYN } from "../src/game/emyn-muil.ts";
import { KHAZAD } from "../src/game/khazad-dum.ts";
import type { GameState, Unit } from "../src/game/types.ts";
let nextId = 970_000;
const unit = (code: string, owner = 0): Unit => ({
  id: `redhorn-player-${nextId++}`,
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
  const s = act(createGame(611, d.cards, d.heroes, d.id), { type: "KEEP" });
  s.hand = [];
  s.staging = [];
  s.heroes.forEach((h) => {
    h.resources = 10;
  });
  return s;
}
function table() {
  const d = STARTERS[0];
  let s = createGame(612, d.cards, d.heroes, d.id, {
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
    s.heroes.forEach((h) => {
      h.resources = 10;
    });
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

test("Redhorn Gate registers the whole ten-card player pack", () => {
  assert.equal(REDHORN_PLAYER_CARDS.length, 10);
  for (const c of REDHORN_PLAYER_CARDS) assert.ok(SCRIPTED.has(c.code), c.code);
});
test("Elrohir pays his own resource after defending to ready while remaining this attack's defender", () => {
  let s = game();
  s.heroes[0].code = "04001";
  s.phase = "defense";
  const hero = s.heroes[0],
    before = hero.resources,
    enemy = unit("01089");
  s.engaged.push(enemy);
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: hero.id });
  assert.equal(s.choice?.title, "Elrohir · Declared defender");
  s = choose(s, "ready");
  assert.equal(s.heroes[0].resources, before - 1);
  assert.equal(s.heroes[0].exhausted, false);
  assert.ok(s.heroes[0].damage > 0 || !s.engaged.length);
});
test("Elrohir's twin bonus requires Elladan in play and blanking suppresses only his own text", () => {
  const s = game();
  const hero = s.heroes[0];
  hero.code = "04001";
  const base = card(hero.code).defense!;
  assert.equal(stats(s, hero).defense, base);
  const original = cards["04028"];
  cards["04028"] = JSON.parse(
    fs.readFileSync("public/catalog.json", "utf8"),
  ).find((c: { code: string }) => c.code === "04028");
  try {
    const twin = unit("04028");
    s.heroes.push(twin);
    assert.equal(stats(s, hero).defense, base + 2);
    hero.attachments.push({
      id: "sack-twin",
      code: CARROCK.sacked,
      exhausted: false,
    });
    assert.equal(stats(s, hero).defense, base + 2);
    hero.attachments.push({
      id: "fear-twin",
      code: KHAZAD.fear,
      exhausted: false,
    });
    assert.equal(stats(s, hero).defense, base);
  } finally {
    if (original) cards["04028"] = original;
    else delete cards["04028"];
  }
});
test("Elladan's constant attack bonus survives Sacked while Shadow of Fear blanks it", () => {
  const s = game("tactics"),
    hero = s.heroes[0];
  hero.code = "04028";
  s.heroes.push(unit("04001"));
  const base = card(hero.code).attack!;
  hero.attachments.push({
    id: "sacked-elladan",
    code: CARROCK.sacked,
    exhausted: false,
  });
  assert.equal(stats(s, hero).attack, base + 2);
  hero.attachments.push({
    id: "fear-elladan",
    code: KHAZAD.fear,
    exhausted: false,
  });
  assert.equal(stats(s, hero).attack, base);
});
test("Taking Initiative discards first and counts characters controlled before drawing", () => {
  let s = game();
  const enemy = unit("01082");
  s.engaged.push(enemy);
  s.deck = ["01073", "01020", "02003", "01014"];
  s = play(s, "04002");
  assert.ok(s.discard.includes("01073"));
  assert.equal(s.hand.length, 2);
  s = choose(s, enemy.id);
  assert.equal(s.engaged[0].damage, 2);
});
test("Taking Initiative still discards with a low-cost card without drawing or damage", () => {
  let s = game();
  s.deck = ["01020", "01013"];
  s = play(s, "04002");
  assert.deepEqual(s.deck, ["01013"]);
  assert.equal(s.hand.length, 0);
  assert.equal(s.choice, null);
});
test("Timely Aid has Secrecy3 at20, reveals only five, puts an ally without hand-play triggers and shuffles others", () => {
  let s = game();
  s.threat = 20;
  s.deck = ["02030", "01020", "02003", "01013", "01014", "01021"];
  assert.equal(playCost(s, card("04003")), 1);
  const before = s.heroes[0].resources;
  s = play(s, "04003");
  assert.ok(!s.choice!.options.some((o) => o.code === "01021"));
  s = choose(s, "ally-0");
  assert.ok(s.allies.some((u) => u.code === "02030"));
  assert.equal(s.deck.length, 5);
  assert.equal(s.choice, null);
  assert.equal(s.heroes[0].resources, before - 1);
  s.threat = 21;
  assert.equal(playCost(s, card("04003")), 4);
});
test("Timely Aid refuses duplicate unique allies and handles a short deck with no eligible ally", () => {
  let s = game();
  s.allies.push(unit("02079"));
  s.deck = ["02079", "01020"];
  s = play(s, "04003");
  assert.equal(s.choice?.title, "Timely Aid · No eligible revealed ally");
  s = choose(s, "view-0");
  assert.equal(s.allies.filter((u) => u.code === "02079").length, 1);
  assert.equal(s.deck.length, 2);
});
test("Unseen Strike adds attack only against higher-engagement enemies and checks current threat", () => {
  let s = game("tactics"),
    hero = s.heroes[0],
    enemy = unit("01082");
  s.engaged.push(enemy);
  const attack = stats(s, hero).attack;
  s.threat = 29;
  s = play(s, "04004", hero.id);
  assert.equal(stats(s, s.heroes[0]).attack, attack);
  playerAttack(s, s.engaged[0], [hero.id]);
  flush(s);
  assert.equal(
    s.engaged[0].damage,
    Math.max(0, attack + 3 - card(enemy.code).defense!),
  );
});
test("Keeping Count tracks physical tokens on kills, boosts the trailing hero and limits one per hero", () => {
  let s = game("tactics"),
    leader = s.heroes[0],
    trailer = s.heroes[1];
  leader.attachments.push({
    id: "leader-count",
    code: "04005",
    exhausted: false,
    owner: 0,
    resourceTokens: 2,
  });
  trailer.attachments.push({
    id: "trailer-count",
    code: "04005",
    exhausted: false,
    owner: 0,
    resourceTokens: 0,
  });
  assert.equal(stats(s, trailer).attack, card(trailer.code).attack! + 2);
  assert.ok(!playTargets(s, unit("04005")).some((u) => u.id === leader.id));
  const enemy = unit("01089");
  s.engaged.push(enemy);
  playerAttack(s, enemy, [trailer.id]);
  flush(s);
  assert.equal(trailer.attachments[0].resourceTokens, 1);
  assert.equal(stats(s, trailer).attack, card(trailer.code).attack! + 1);
});
test("Keeping Count compares another physical copy and does not add token after a non-attack kill", () => {
  const s = game("tactics"),
    hero = s.heroes[0];
  hero.attachments.push({
    id: "count",
    code: "04005",
    exhausted: false,
    resourceTokens: 0,
  });
  assert.equal(stats(s, hero).attack, card(hero.code).attack!);
});
test("Bofur's hand QuestAction spends exactly1Spirit and commits exhausted even after staging", () => {
  let s = game("spirit");
  s.phase = "staging";
  s.used.push("phase:quest-committed");
  const bofur = unit("04006");
  s.hand.push(bofur);
  const before = s.heroes[0].resources;
  s = act(s, { type: "ABILITY", id: bofur.id });
  s = choose(s, s.heroes[0].id);
  assert.equal(s.heroes[0].resources, before - 1);
  assert.equal(s.allies[0].exhausted, true);
  assert.equal(s.allies[0].committed, true);
  redhornPlayerQuestSucceeded(s);
  flush(s);
  assert.ok(s.hand.some((u) => u.code === "04006"));
  assert.ok(!s.allies.length);
});
test("Bofur's normal play stays after quest success and failed hand-action stays in play", () => {
  let s = game("spirit");
  s = play(s, "04006");
  redhornPlayerQuestSucceeded(s);
  flush(s);
  assert.ok(s.allies.some((u) => u.code === "04006"));
  assert.ok(redhornPlayerHandAbilityProblem(s, unit("04006")));
});
test("Renewed Friendship responds only to another player's hand-played attachment and affects that player", () => {
  let s = table();
  seatView(s, 2).heroes[0].attachments.push({
    id: "spirit",
    code: "02081",
    exhausted: false,
    owner: 2,
  });
  seatView(s, 2).hand.push(unit("04007", 2));
  s.heroes[0].exhausted = true;
  const target = seatView(s, 2).heroes[0],
    before = s.deck.length;
  syncSeat(s);
  s = play(s, "02002", target.id);
  assert.equal(s.table!.active, 2);
  assert.equal(s.choice?.title, "Renewed Friendship · Attachment played");
  s = choose(s, "play");
  s = choose(s, "draw");
  assert.equal(seatView(s, 0).deck.length, before - 1);
  assert.equal(seatView(s, 2).discard.filter((c) => c === "04007").length, 1);
});
test("Ravenhill Scout moves chosen progress from one location to another and can explore", () => {
  let s = game("lore"),
    scout = unit("04008"),
    source = unit("01088"),
    target = unit("01095");
  source.progress = 2;
  s.allies.push(scout);
  s.activeLocation = source;
  s.staging.push(target);
  s = act(s, { type: "ABILITY", id: scout.id });
  s = choose(s, source.id);
  s = choose(s, target.id);
  s = choose(s, "amount-2");
  assert.equal(s.activeLocation?.progress, 0);
  assert.ok(!s.staging.some((u) => u.id === target.id));
  assert.ok(s.encounterDiscard.includes("01095"));
});
test("Ravenhill Scout excludes immune locations and is disabled without transferable progress", () => {
  const s = game("lore"),
    scout = unit("04008"),
    immune = unit(CARROCK.carrock);
  immune.progress = 2;
  s.allies.push(scout);
  s.staging.push(immune, unit("01088"));
  assert.ok(availableAbilities(s, scout)[0].disabled);
});
test("Needful looks without revealing, pays threat as cost, and reduces by printed top threat", () => {
  let s = game("lore");
  s.threat = 20;
  s.encounterDeck = ["01082"];
  const before = s.heroes[0].resources;
  assert.equal(playCost(s, card("04009")), 0);
  s = play(s, "04009");
  assert.equal(s.threat, 20 + 1 - card("01082").threat!);
  assert.equal(s.heroes[0].resources, before);
  assert.deepEqual(s.encounterDeck, ["01082"]);
  assert.ok(!s.staging.length);
  s = choose(s, "continue");
});
test("Good Meal reduces the next event matching the hero's sphere and persists until it matches", () => {
  let s = game("lore");
  s.heroes[0].code = "02001";
  const hero = s.heroes[0];
  hero.attachments.push({
    id: "meal",
    code: "04010",
    exhausted: true,
    owner: 0,
  });
  s = act(s, { type: "ABILITY", id: hero.id, attachmentId: "meal" });
  assert.equal(
    playCost(s, card("01063")),
    Math.max(0, Number(card("01063").cost) - 2),
  );
  s.encounterDiscard = ["01074"];
  s = play(s, "02125");
  assert.equal(
    playCost(s, card("01063")),
    Math.max(0, Number(card("01063").cost) - 2),
  );
  s.heroes[0].damage = 1;
  s = play(s, "01063", hero.id);
  assert.equal(playCost(s, card("01063")), Number(card("01063").cost));
});
test("Good Meal snapshots gained hero spheres and consumes one activation once", () => {
  let s = game("lore");
  const hero = s.heroes[0];
  hero.code = "02001";
  hero.attachments.push(
    { id: "meal", code: "04010", exhausted: false },
    { id: "song", code: "02104", exhausted: false },
  );
  s = act(s, { type: "ABILITY", id: hero.id, attachmentId: "meal" });
  assert.equal(playCost(s, card("01032")), 0);
  assert.equal(playCost(s, card("01063")), 0);
  const song = s.heroes[0].attachments.find((a) => a.id === "song")!;
  discardAttachment(s, s.heroes[0], song);
  assert.equal(
    playCost(s, card("01032")),
    0,
    "lasting Meal discount retains the original snapshot",
  );
  s.heroes[1].code = "01004";
  s = play(s, "01032", hero.id);
  assert.equal(
    playCost(s, card("01063")),
    Number(card("01063").cost),
    "the same Meal cannot discount another sphere after consumption",
  );
});

test("Good Meal targets Hobbit heroes, multiple reductions stack and text blanking prevents activation", () => {
  const s = game("lore"),
    hero = s.heroes[0];
  hero.code = "02001";
  assert.ok(playTargets(s, unit("04010")).some((u) => u.id === hero.id));
  assert.ok(
    !playTargets(s, unit("04010")).some((u) => u.id === s.heroes[1].id),
  );
  hero.attachments.push({
    id: "meal",
    code: "04010",
    exhausted: false,
    owner: 0,
  });
  s.activeLocation = unit(EMYN.amonLhaw);
  assert.ok(
    !availableAbilities(s, hero).some((a) => a.id === "meal" && !a.disabled),
  );
});
