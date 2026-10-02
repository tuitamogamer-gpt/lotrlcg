import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import { MIRKWOOD_PLAYER_CARDS } from "../src/game/mirkwood-player-support.ts";
import {
  availableAbilities,
  createGame,
  playTargets,
  validateSave,
} from "../src/game/engine.ts";
import {
  damage,
  discardAttachment,
  discardCharacter,
  enterAlly,
  phaseEnd,
  returnAlly,
  revealed,
} from "../src/game/board.ts";
import { playerAttack } from "../src/game/combat.ts";
import { flush, shadowResponse } from "../src/game/effects.ts";
import { stats } from "../src/game/core.ts";
import {
  allActiveLocations,
  selectSeat,
  seatView,
  syncSeat,
} from "../src/game/table.ts";
import { mirkwoodPlayerPlayProblem } from "../src/game/mirkwood-player-cards.ts";
import { EMYN } from "../src/game/emyn-muil.ts";
import { CARROCK } from "../src/game/carrock.ts";
import { SHADOW_FLAME } from "../src/game/shadow-flame-support.ts";
import type { GameState, Unit } from "../src/game/types.ts";
let nextId = 930_000;
const unit = (code: string, owner = 0): Unit => ({
  id: `return-player-${nextId++}`,
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
  const s = act(createGame(591, d.cards, d.heroes, d.id), { type: "KEEP" });
  s.hand = [];
  s.staging = [];
  s.heroes.forEach((h) => {
    h.resources = 10;
  });
  return s;
}
function table() {
  const d = STARTERS[0];
  let s = createGame(592, d.cards, d.heroes, d.id, {
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

test("Return to Mirkwood registers all ten designs with existing Dáin semantics", () => {
  assert.equal(MIRKWOOD_PLAYER_CARDS.length, 10);
  for (const c of MIRKWOOD_PLAYER_CARDS)
    assert.ok(SCRIPTED.has(c.code), c.code);
  const s = game(),
    dain = unit("02116"),
    dwarf = unit("03011");
  s.heroes.push(dain);
  s.allies.push(dwarf);
  const base = card(dwarf.code).attack!;
  assert.equal(stats(s, dwarf).attack, base + 1);
  dain.exhausted = true;
  assert.equal(stats(s, dwarf).attack, base);
});
test("Dúnedain Signal grants Sentinel and moves by attached hero resource", () => {
  let s = table();
  const host = s.heroes[0],
    target = seatView(s, 2).heroes[0],
    before = host.resources;
  s = play(s, "02117", host.id);
  const a = s.heroes[0].attachments.find((a) => a.code === "02117")!;
  s = act(s, { type: "ABILITY", id: host.id, attachmentId: a.id });
  s = choose(s, target.id);
  assert.equal(seatView(s, 0).heroes[0].resources, before - 2);
  assert.ok(seatView(s, 2).heroes[0].attachments.some((x) => x.id === a.id));
});
test("Dawn removes one face-down shadow per engaged player without revealing or resolving", () => {
  let s = table();
  s.phase = "defense";
  const enemy = unit("01082", 0),
    other = unit("01082", 1),
    staged = unit("01082");
  enemy.shadows = ["01074", "01075"];
  enemy.revealedShadowCount = 1;
  other.shadows = ["01074"];
  staged.shadows = ["01074"];
  s.engaged.push(enemy);
  seatView(s, 1).engaged.push(other);
  s.staging.push(staged);
  syncSeat(s);
  s = play(s, "02118");
  assert.ok(s.choice!.options.every((o) => !o.code));
  s = choose(s, `${enemy.id}-shadow-1`);
  s = choose(s, "skip");
  assert.deepEqual(seatView(s, 0).engaged[0].shadows, ["01074"]);
  assert.deepEqual(seatView(s, 1).engaged[0].shadows, ["01074"]);
  assert.ok(s.encounterDiscard.includes("01075"));
  assert.equal(s.staging[0].shadows.length, 1);
});
test("Dawn is illegal before shadows, with only revealed shadows, or after any resolved attack", () => {
  const s = game();
  const enemy = unit("01082");
  s.engaged.push(enemy);
  assert.ok(mirkwoodPlayerPlayProblem(s, "02118"));
  s.phase = "defense";
  enemy.shadows = ["01074"];
  enemy.revealedShadowCount = 1;
  assert.ok(mirkwoodPlayerPlayProblem(s, "02118"));
  enemy.revealedShadowCount = 0;
  assert.equal(mirkwoodPlayerPlayProblem(s, "02118"), null);
  s.used.push("phase:attack-resolved");
  assert.ok(mirkwoodPlayerPlayProblem(s, "02118"));
});
test("Dawn can be paid during the pre-shadow window and removes a queued shadow safely", () => {
  let s = game();
  s.phase = "defense";
  const enemy = unit("01082");
  enemy.shadows = ["01074"];
  s.engaged.push(enemy);
  s.hand.push(unit("02118"));
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: s.heroes[0].id });
  assert.equal(
    s.choice?.title,
    "Dawn Take You All · Before an attack resolves",
  );
  s = choose(s, "play");
  s = choose(s, `${enemy.id}-shadow-0`);
  while (s.choice?.options.some((o) => o.id === "skip")) s = choose(s, "skip");
  assert.ok(s.encounterDiscard.includes("01074"));
  assert.ok(!s.log.some((l) => /Shadow.*Necromancer/.test(l.text)));
});
test("Eagles collect a discarded physical Eagle and gain attack and defense per face-down attachment", () => {
  let s = game("tactics");
  const collector = unit("02119"),
    bird = unit("02098");
  s.allies.push(collector, bird);
  s.discard.push("02098");
  discardCharacter(s, bird);
  flush(s);
  s = choose(s, collector.id);
  const c = s.allies.find((u) => u.id === collector.id)!;
  assert.equal(c.attachments.length, 1);
  assert.equal(c.attachments[0].facedown, true);
  assert.equal(s.discard.filter((code) => code === "02098").length, 1);
  assert.equal(stats(s, c).attack, card(c.code).attack! + 1);
  assert.equal(stats(s, c).defense, card(c.code).defense! + 1);
});
test("Eagles collect returned-to-hand cards across players and return face-down cards to their owners", () => {
  let s = table();
  const collector = unit("02119", 0),
    bird = unit("02004", 2);
  s.allies.push(collector);
  seatView(s, 2).allies.push(bird);
  syncSeat(s);
  returnAlly(s, bird);
  flush(s);
  s = choose(s, collector.id);
  assert.ok(!seatView(s, 2).hand.some((u) => u.code === "02004"));
  const c = seatView(s, 0).allies.find((u) => u.id === collector.id)!;
  assert.equal(c.attachments[0].owner, 2);
  discardCharacter(s, c);
  flush(s);
  assert.ok(seatView(s, 2).discard.includes("02004"));
  assert.ok(seatView(s, 0).discard.includes("02119"));
});
test("Multiple Eagle collectors cannot consume an older same-title copy", () => {
  let s = table();
  const a = unit("02119", 0),
    b = unit("02119", 1),
    bird = unit("02004", 2);
  s.allies.push(a);
  seatView(s, 1).allies.push(b);
  seatView(s, 2).allies.push(bird);
  seatView(s, 2).discard.push("02004");
  syncSeat(s);
  discardCharacter(s, bird);
  flush(s);
  s = choose(s, a.id);
  assert.equal(s.choice, null);
  assert.equal(seatView(s, 1).allies[0].attachments.length, 0);
  assert.deepEqual(seatView(s, 2).discard, ["02004"]);
});
test("Face-down Eagles retain no printed abilities and collectors cannot take Restricted attachments", () => {
  const s = game("tactics"),
    collector = unit("02119");
  s.allies.push(collector);
  collector.attachments.push({
    id: "hidden",
    code: "02103",
    facedown: true,
    exhausted: false,
    owner: 0,
  });
  assert.ok(!availableAbilities(s, collector).some((a) => a.id === "hidden"));
  assert.ok(!playTargets(s, unit("19003")).some((u) => u.id === collector.id));
});
test("Support adds an Eagle's stat through the phase after source Eagle and attachment leave", () => {
  let s = game("tactics"),
    bird = unit("02004");
  s.allies.push(bird);
  const hero = s.heroes[0],
    before = stats(s, hero).defense;
  s = play(s, "02120", hero.id);
  let a = s.heroes[0].attachments.find((a) => a.code === "02120")!;
  s = act(s, { type: "ABILITY", id: hero.id, attachmentId: a.id });
  s = choose(s, bird.id);
  s = choose(s, "defense");
  assert.equal(stats(s, s.heroes[0]).defense, before + 4);
  returnAlly(s, s.allies[0]);
  discardAttachment(s, s.heroes[0], a);
  flush(s);
  assert.equal(stats(s, s.heroes[0]).defense, before + 4);
  phaseEnd(s);
  flush(s);
  assert.equal(stats(s, s.heroes[0]).defense, before);
});
test("Support can select another player's Eagle and uses its current boosted stat", () => {
  let s = table();
  selectSeat(s, 1);
  s.table!.turn = 1;
  const bird = unit("02119", 2);
  bird.attachments.push({
    id: "feather",
    code: "02004",
    facedown: true,
    exhausted: false,
    owner: 2,
  });
  seatView(s, 2).allies.push(bird);
  const hero = s.heroes[0],
    before = stats(s, hero).attack;
  s = play(s, "02120", hero.id);
  const a = seatView(s, 1).heroes[0].attachments.find(
    (a) => a.code === "02120",
  )!;
  s = act(s, { type: "ABILITY", id: hero.id, attachmentId: a.id });
  s = choose(s, bird.id);
  s = choose(s, "attack");
  assert.equal(
    stats(s, seatView(s, 1).heroes[0]).attack,
    before + card("02119").attack! + 1,
  );
});
test("Support targets Tactics heroes including gained icons, and blanking disables its ability", () => {
  const s = game("lore"),
    hero = s.heroes[0];
  assert.ok(!playTargets(s, unit("02120")).some((u) => u.id === hero.id));
  hero.attachments.push({
    id: "song",
    code: "02104",
    exhausted: false,
    owner: 0,
  });
  assert.ok(playTargets(s, unit("02120")).some((u) => u.id === hero.id));
  hero.code = "01004";
  assert.ok(playTargets(s, unit("02120")).some((u) => u.id === hero.id));
  hero.attachments.push({
    id: "support",
    code: "02120",
    exhausted: false,
    owner: 0,
  });
  s.allies.push(unit("02004"));
  assert.ok(
    availableAbilities(s, hero).some((a) => a.id === "support" && !a.disabled),
  );
  s.activeLocation = unit(EMYN.amonLhaw);
  assert.ok(
    availableAbilities(s, hero).every((a) => a.id !== "support" || a.disabled),
  );
});
test("West Road Traveller switches locations only when played from hand without travel effects", () => {
  let s = game("spirit");
  const old = unit("01088"),
    next = unit("01100");
  old.progress = 2;
  next.progress = 1;
  old.attachments.push({
    id: "mathom",
    code: "02056",
    exhausted: false,
    owner: 0,
  });
  s.activeLocation = old;
  s.staging.push(next);
  s = play(s, "02121");
  s = choose(s, "switch");
  s = choose(s, next.id);
  assert.equal(s.activeLocation?.id, next.id);
  assert.equal(s.activeLocation?.progress, 1);
  assert.equal(s.staging[0].progress, 2);
  assert.equal(s.staging[0].attachments.length, 1);
  assert.ok(!s.log.some((l) => l.text.startsWith("Travelled to")));
  const other = unit("02121");
  enterAlly(s, other, false, false);
  flush(s);
  assert.equal(s.choice, null);
});
test("West Traveller's first-player choice swaps one of multiple active locations", () => {
  let s = table();
  selectSeat(s, 2);
  s.table!.turn = 2;
  s.heroes[0].attachments.push({
    id: "spirit",
    code: "02081",
    exhausted: false,
    owner: 2,
  });
  const old = unit("01088"),
    extra = unit("01100"),
    staged = unit("01095");
  s.activeLocation = old;
  s.extraActiveLocations = [extra];
  s.staging.push(staged);
  s = play(s, "02121");
  s = choose(s, "switch");
  assert.equal(s.table!.active, 0);
  s = choose(s, extra.id);
  s = choose(s, staged.id);
  assert.deepEqual(
    allActiveLocations(s).map((u) => u.id),
    [old.id, staged.id],
  );
  assert.ok(s.staging.some((u) => u.id === extra.id));
});
test("West Traveller cannot switch an immune active or staging location", () => {
  const s = game("spirit");
  s.activeLocation = unit(CARROCK.carrock);
  s.staging.push(unit("01088"));
  enterAlly(s, unit("02121"), false, true);
  flush(s);
  assert.equal(s.choice, null);
});
test("Astonishing Speed stacks on the existing Rohan set and excludes later entrants", () => {
  let s = table();
  const rohan = unit("02006", 1);
  seatView(s, 1).allies.push(rohan);
  s.heroes[0].attachments.push({
    id: "spirit",
    code: "02081",
    exhausted: false,
    owner: 0,
  });
  s = play(s, "02122");
  s = play(s, "02122");
  const late = unit("02121", 2);
  seatView(s, 2).allies.push(late);
  assert.equal(
    stats(s, seatView(s, 1).allies[0]).will,
    card(rohan.code).willpower! + 4,
  );
  assert.equal(stats(s, late).will, card(late.code).willpower!);
  phaseEnd(s);
  flush(s);
  assert.equal(stats(s, late).will, card(late.code).willpower!);
});
test("Mirkwood Runner ignores defending enemy defense only when it attacks alone", () => {
  for (const alone of [true, false]) {
    const s = game("lore"),
      runner = unit("02123"),
      second = unit("01016"),
      enemy = unit("01082");
    s.allies.push(runner, second);
    s.engaged.push(enemy);
    playerAttack(s, enemy, alone ? [runner.id] : [runner.id, second.id]);
    flush(s);
    assert.equal(
      enemy.damage,
      alone
        ? card(runner.code).attack!
        : Math.max(
            0,
            card(runner.code).attack! +
              card(second.code).attack! -
              card(enemy.code).defense!,
          ),
    );
  }
});
test("Rumour looks without drawing or revealing and optionally spends a separate Lore resource", () => {
  let s = game("lore");
  s.encounterDeck = ["01090", "01074"];
  const before = s.heroes[0].resources,
    top = [...s.encounterDeck];
  s = play(s, "02124");
  assert.equal(s.choice!.options[0].code, "01090");
  assert.deepEqual(s.encounterDeck, top);
  s = choose(s, s.heroes[0].id);
  assert.equal(s.heroes[0].resources, before - 1);
  assert.ok(s.hand.some((u) => u.code === "02124"));
  assert.ok(!s.discard.includes("02124"));
  assert.equal(s.threat, 30);
});
test("Rumour may stay discarded and Radagast cannot pay its return cost", () => {
  let s = game("lore");
  s.encounterDeck = ["01074"];
  s.heroes.forEach((h) => {
    h.resources = 0;
  });
  const radagast = unit("02059");
  radagast.resources = 5;
  s.allies.push(radagast);
  s = play(s, "02124");
  assert.equal(s.choice!.options.length, 1);
  s = choose(s, "leave");
  assert.ok(s.discard.includes("02124"));
  assert.equal(s.allies[0].resources, 5);
});
test("Rumour returns the resolving physical copy after saving, preserving an older discarded copy and paying its Lore cost once", () => {
  let s = game("lore");
  const copy = unit("02124"),
    payer = s.heroes[0],
    before = payer.resources;
  s.discard = ["02124"];
  s.hand = [copy];
  s.encounterDeck = ["01090", "01074"];
  const top = [...s.encounterDeck],
    lastReveal = s.lastReveal;
  s = act(s, { type: "PLAY", id: copy.id });
  assert.equal(
    s.choice?.title,
    "Rumour from the Earth · Look at top encounter card",
  );
  assert.equal(s.resolvingEvents?.[0].unit.id, copy.id);
  assert.equal(s.resolvingEvents?.[0].destination, "discard");
  assert.deepEqual(s.discard, ["02124"]);
  assert.equal(
    s.choice!.options.find((o) => o.id === payer.id)!.effects[0].source,
    copy.id,
  );
  s = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(s));
  s = choose(s, payer.id);
  assert.equal(s.heroes[0].resources, before - 1);
  assert.equal(s.hand.filter((u) => u.code === "02124").length, 1);
  assert.equal(s.hand.find((u) => u.code === "02124")!.id, copy.id);
  assert.deepEqual(s.discard, ["02124"]);
  assert.deepEqual(s.encounterDeck, top);
  assert.equal(s.lastReveal, lastReveal);
  assert.equal(s.resolvingEvents, undefined);
  assert.ok(validateSave(s));
});
test("Rumour's leave option discards its resolving copy without replacing an older copy", () => {
  let s = game("lore");
  const copy = unit("02124"),
    before = s.heroes[0].resources;
  s.discard = ["02124"];
  s.hand = [copy];
  s.encounterDeck = ["01090"];
  s = act(s, { type: "PLAY", id: copy.id });
  s = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(s));
  s = choose(s, "leave");
  assert.deepEqual(s.discard, ["02124", "02124"]);
  assert.ok(!s.hand.some((u) => u.code === "02124"));
  assert.equal(s.heroes[0].resources, before);
  assert.equal(s.resolvingEvents, undefined);
});
test("Counter-Spell cancels Rumour before its optional peek and additional Lore payment", () => {
  let s = game("lore");
  const bane = unit(SHADOW_FLAME.bane),
    copy = unit("02124");
  bane.attachments = [
    { id: "rumour-counter", code: SHADOW_FLAME.counter, exhausted: false },
  ];
  s.staging = [bane];
  s.discard = ["02124"];
  s.hand = [copy];
  s.encounterDeck = [SHADOW_FLAME.flame, "01090"];
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = act(s, { type: "PLAY", id: copy.id });
  assert.equal(s.choice, null);
  assert.equal(s.resolvingEvents, undefined);
  assert.deepEqual(s.discard, ["02124", "02124"]);
  assert.equal(s.hand.length, 0);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before,
  );
  assert.deepEqual(s.encounterDeck, ["01090"]);
});
test("Shadow of the Past moves only the top discard without revealing it", () => {
  let s = game();
  s.encounterDiscard = ["01074", "01090"];
  s.encounterDeck = ["01075"];
  s = play(s, "02125");
  assert.deepEqual(s.encounterDeck, ["01090", "01075"]);
  assert.deepEqual(s.encounterDiscard, ["01074"]);
  assert.equal(s.choice, null);
  s.encounterDiscard = [];
  assert.ok(mirkwoodPlayerPlayProblem(s, "02125"));
});
test("Extra active Eaves still prevents shadow cancellation", () => {
  const s = game();
  s.activeLocation = unit("01088");
  s.extraActiveLocations = [unit("02016")];
  s.allies.push(unit("02096"));
  shadowResponse(s, "01074");
  assert.ok(!s.choice?.options.some((o) => o.id.startsWith("watcher-")));
});
test("Strider's Path replaces only the first player's chosen active location", () => {
  let s = game("lore");
  const old = unit("01088"),
    extra = unit("01100"),
    location = unit("01095");
  s.activeLocation = old;
  s.extraActiveLocations = [extra];
  s.hand.push(unit("02009"));
  revealed(s, location.code);
  flush(s);
  s = choose(s, "strider-0");
  s = choose(s, extra.id);
  assert.equal(s.activeLocation?.code, location.code);
  assert.deepEqual(
    new Set(allActiveLocations(s).map((u) => u.code)),
    new Set([old.code, location.code]),
  );
  assert.ok(s.staging.some((u) => u.id === extra.id));
});
