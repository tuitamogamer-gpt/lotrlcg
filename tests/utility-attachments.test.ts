import { applyAction } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { STARTERS, DECK } from "../src/game/cards";
import {
  createGame,
  availableAbilities,
  canPlay,
  playTargets,
  restoreSave,
  stats,
} from "../src/game/engine";
import { make } from "../src/game/core";
import {
  nextRound,
  discardAttachment,
  phaseEndPlayer,
} from "../src/game/board";
import { beginEnemyAttack, playerAttack } from "../src/game/combat";
import { flush } from "../src/game/effects";
import { questExhausts, hasResourceIcon } from "../src/game/expansion-passives";
import { validateDeckList } from "../src/game/setup";
import { deckProblems } from "../src/game/decks";
import { CARROCK } from "../src/game/carrock";
import { RHOS } from "../src/game/rhosgobel";
import type { GameState, Unit } from "../src/game/types";
import {
  allCharacters,
  selectSeat,
  seatView,
  syncSeat,
} from "../src/game/table";
const wilyador = (s: GameState) =>
  s.allies.find((u) => u.code === RHOS.wilyador);

function base(id = "lore", scenarioId: GameState["scenarioId"] = "mirkwood") {
  const d = STARTERS.find((d) => d.id === id)!;
  let s = createGame(57, d.cards, d.heroes, id, { scenarioId });
  while (s.choice)
    s = applyAction(s, { type: "CHOOSE", id: s.choice.options.at(-1)!.id });
  s = applyAction(s, { type: "KEEP" });
  s.heroes.forEach((h) => (h.resources = 10));
  s.staging = [];
  s.encounterDeck = [];
  s.encounterDiscard = [];
  s.hand = [];
  return s;
}
function attach(s: GameState, host: Unit, code: string) {
  const a = make(s, code);
  host.attachments.push({ id: a.id, code, exhausted: false });
  return a.id;
}
function play(s: GameState, code: string, target: string) {
  const u = make(s, code);
  s.hand.push(u);
  return applyAction(s, { type: "PLAY", id: u.id, target });
}
test("Resourceful's Secrecy cost and resource-phase bonus stack without offering an action", () => {
  let s = base();
  s.threat = 20;
  const h = s.heroes[0],
    resources = h.resources;
  s = play(s, "04062", h.id);
  assert.equal(s.heroes[0].resources, resources - 1);
  s = play(s, "04062", h.id);
  const before = s.heroes[0].resources;
  nextRound(s);
  assert.equal(s.heroes[0].resources, before + 3);
  assert.ok(
    !availableAbilities(s, s.heroes[0]).some(
      (a) => a.id === s.heroes[0].attachments[0].id,
    ),
  );
  attach(s, s.heroes[0], CARROCK.sacked);
  const blocked = s.heroes[0].resources;
  nextRound(s);
  assert.equal(s.heroes[0].resources, blocked);
});
test("Resourceful costs its full printed four above the Secrecy threshold", () => {
  let s = base();
  s.threat = 21;
  const before = s.heroes[0].resources;
  s = play(s, "04062", s.heroes[0].id);
  assert.equal(s.heroes[0].resources, before - 4);
});
test("Path of Need enforces its one-copy deck limit in setup and the builder", () => {
  assert.throws(() => validateDeckList({ ...DECK, "04103": 2 }), /at most 1/);
  assert.ok(
    deckProblems({
      heroes: STARTERS[0].heroes,
      cards: { ...DECK, "04103": 2 },
    }).some((p) => p.includes("at most 1")),
  );
});
test("Path of Need only keeps heroes ready while its attached location is active", () => {
  const s = base();
  const loc = make(s, "01087");
  s.staging.push(loc);
  attach(s, loc, "04103");
  assert.equal(questExhausts(s, s.heroes[0]), true);
  s.staging = [];
  s.activeLocation = loc;
  assert.equal(questExhausts(s, s.heroes[0]), false);
  const ally = make(s, "01058");
  s.allies.push(ally);
  assert.equal(questExhausts(s, ally), true);
  const enemy = make(s, "01091");
  s.engaged.push(enemy);
  playerAttack(s, enemy, [s.heroes[0].id]);
  flush(s);
  assert.equal(s.heroes[0].exhausted, false);
  s.queue = [];
  s.choice = null;
  beginEnemyAttack(s, enemy, [s.heroes[0].id]);
  assert.equal(s.heroes[0].exhausted, false);
  s.queue = [];
  s.combat = null;
  s.heroes[0].exhausted = true;
  assert.throws(() => playerAttack(s, enemy, [s.heroes[0].id]), /ready/);
  discardAttachment(s, loc, loc.attachments[0]);
  assert.equal(questExhausts(s, s.heroes[0]), true);
});
test("Asfaloth offers only non-immune locations, grants Glorfindel two progress and saves its choice", () => {
  let s = base();
  const h = s.heroes.find((h) => h.code === "01011")!;
  const loc = make(s, "01100"),
    immune = make(s, CARROCK.carrock);
  s.staging.push(loc, immune);
  s = play(s, "04110", h.id);
  const host = s.heroes.find((u) => u.id === h.id)!,
    id = host.attachments[0].id;
  s = applyAction(s, { type: "ABILITY", id: h.id, attachmentId: id });
  assert.ok(s.choice?.options.some((o) => o.id === loc.id));
  assert.ok(!s.choice?.options.some((o) => o.id === immune.id));
  assert.ok(restoreSave(JSON.parse(JSON.stringify(s))));
  s = applyAction(s, { type: "CHOOSE", id: loc.id });
  assert.equal(s.staging.find((u) => u.id === loc.id)?.progress, 2);
  assert.equal(
    s.heroes.find((u) => u.id === h.id)!.attachments[0].exhausted,
    true,
  );
  const duplicate = make(s, "04110");
  s.hand.push(duplicate);
  assert.match(canPlay(s, duplicate)!, /unique/);
});
test("Healing Herbs pays both costs and heals a chosen character, preserving the attached hero", () => {
  let s = base();
  const h = s.heroes[0];
  s.heroes[1].damage = 2;
  s = play(s, "04109", h.id);
  const id = s.heroes[0].attachments[0].id;
  s = applyAction(s, { type: "ABILITY", id: h.id, attachmentId: id });
  s = applyAction(s, { type: "CHOOSE", id: s.heroes[1].id });
  assert.equal(s.heroes[1].damage, 0);
  assert.equal(s.heroes[0].exhausted, true);
  assert.equal(s.heroes[0].attachments.length, 0);
  assert.ok(s.discard.includes("04109"));
});
test("Healing Herbs cannot spend its costs when the attached hero is exhausted", () => {
  const s = base();
  const h = s.heroes[0];
  h.damage = 1;
  h.exhausted = true;
  const id = attach(s, h, "04109");
  assert.equal(
    availableAbilities(s, h).find((a) => a.id === id)?.disabled,
    true,
  );
  assert.throws(
    () => applyAction(s, { type: "ABILITY", id: h.id, attachmentId: id }),
    /ready attached hero/,
  );
});
test("Healing Herbs respects Rhosgobel's block, cap, and removal of the discarded healer card", () => {
  let s = base("lore", "journey-to-rhosgobel");
  // Preserve the quest's objective ally when simplifying its encounter fixtures.
  const eagle = wilyador(s)!;
  eagle.damage = 12;
  s.stage = 2;
  s.staging = [make(s, RHOS.rhosgobel)];
  s = play(s, "04109", s.heroes[0].id);
  const id = s.heroes[0].attachments[0].id;
  assert.equal(
    availableAbilities(s, s.heroes[0]).find((a) => a.id === id)?.disabled,
    true,
  );
  s.staging = [];
  s = applyAction(s, { type: "ABILITY", id: s.heroes[0].id, attachmentId: id });
  s = applyAction(s, { type: "CHOOSE", id: eagle.id });
  assert.equal(wilyador(s)!.damage, 7);
  assert.ok(s.removed.includes("04109"));
  assert.ok(!s.discard.includes("04109"));
  assert.equal(s.heroes.length, 3);
});
test("Borrowed Healing Herbs follows its host's controller but is removed from its physical owner's discard", () => {
  const d = STARTERS.find((d) => d.id === "lore")!;
  let s = createGame(72, d.cards, d.heroes, "lore", {
    scenarioId: "journey-to-rhosgobel",
    seats: [
      { heroes: ["01008", "01009"], deckId: "spirit" },
      { heroes: ["01010", "01011"], deckId: "lore" },
    ],
  });
  s.phase = "planning";
  s.stage = 2;
  s.queue = [];
  s.choice = null;
  s.staging = [];
  const eagle = allCharacters(s).find((u) => u.code === RHOS.wilyador)!;
  eagle.damage = 10;
  selectSeat(s, 1);
  const hero = s.heroes[0],
    herbs = make(s, "04109");
  hero.attachments.push({
    id: herbs.id,
    code: herbs.code,
    owner: 0,
    exhausted: false,
  });
  syncSeat(s);
  s = applyAction(s, { type: "ABILITY", id: hero.id, attachmentId: herbs.id });
  s = applyAction(s, { type: "CHOOSE", id: eagle.id });
  assert.equal(allCharacters(s).find((u) => u.id === eagle.id)!.damage, 5);
  assert.ok(seatView(s, 0).removed.includes("04109"));
  assert.ok(!seatView(s, 0).discard.includes("04109"));
  assert.ok(!seatView(s, 1).removed.includes("04109"));
  assert.equal(seatView(s, 1).heroes[0].exhausted, true);
});
test("Rivendell Blade reduces the defending enemy until phase end, with defense floored at zero", () => {
  const s = base();
  const h = s.heroes.find((h) => h.code === "01011")!,
    enemy = make(s, "01091");
  s.engaged.push(enemy);
  attach(s, h, "04031");
  playerAttack(s, enemy, [h.id]);
  assert.equal(stats(s, enemy).defense, 0);
  assert.equal(enemy.tempDefense, -2);
  flush(s);
  assert.equal(enemy.damage, stats(s, h).attack);
  phaseEndPlayer(s);
  assert.equal(stats(s, enemy).defense, 1);
});
test("Narvi-style lasting resource grants survive source removal and expire at phase end", () => {
  const s = base();
  const h = s.heroes[0];
  h.phaseResourceIcons = ["tactics"];
  assert.equal(hasResourceIcon(h, "tactics"), true);
  assert.ok(restoreSave(JSON.parse(JSON.stringify(s))));
  phaseEndPlayer(s);
  assert.equal(hasResourceIcon(h, "tactics"), false);
});
