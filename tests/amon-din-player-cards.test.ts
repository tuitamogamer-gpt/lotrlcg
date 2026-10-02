import test from "node:test";
import assert from "node:assert/strict";
import { applyAction as act } from "./pass-resource-window.ts";
import {
  availableAbilities,
  canPlay,
  createGame,
  playTargets,
  validateSave,
} from "../src/game/engine.ts";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import { AMON_PLAYER_CARDS } from "../src/game/amon-din-player-support.ts";
import {
  damage,
  engage,
  enemyAddedToStaging,
  enterAlly,
  revealed,
  check,
} from "../src/game/board.ts";
import { playerAttack, beginEnemyAttack } from "../src/game/combat.ts";
import { fx, get, stats } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { playCardFromEffect } from "../src/game/actions.ts";
import {
  amonPlayerAbilityProblem,
  amonPlayerEnemyAttackTarget,
  amonPlayerCanEngage,
  amonPlayerEnemyCannotAttack,
  amonPlayerCannotDeclareAttack,
} from "../src/game/amon-din-player-cards.ts";
import { ROAD } from "../src/game/road-rivendell.ts";
import {
  forOwner,
  seatView,
  syncSeat,
  selectSeat,
  attackersFor,
} from "../src/game/table.ts";
import { SHADOW_FLAME } from "../src/game/shadow-flame.ts";
import {
  encodeDamageContext,
  readDamageContext,
} from "../src/game/damage-context.ts";
import type { GameState, Unit } from "../src/game/types.ts";

let serial = 1_600_000;
const unit = (code: string, owner = 0): Unit => ({
  id: `amon-player-${serial++}`,
  owner,
  code,
  damage: 0,
  resources: 0,
  exhausted: false,
  progress: 0,
  committed: false,
  attachments: [],
  boost: 0,
  attacked: false,
  shadows: [],
});
function game(sphere = "leadership", players = 1): GameState {
  const d = STARTERS.find((d) => d.id === sphere)!;
  let s = createGame(
    811,
    d.cards,
    d.heroes,
    d.id,
    players > 1
      ? {
          seats: STARTERS.slice(0, players).map((d) => ({
            deckId: d.id,
            heroes: [...d.heroes],
          })),
        }
      : {},
  );
  while (s.phase === "setup") s = act(s, { type: "KEEP" });
  Object.assign(s, {
    phase: "planning",
    choice: null,
    queue: [],
    staging: [],
    engaged: [],
    activeLocation: null,
    extraActiveLocations: [],
    encounterDeck: Array(20).fill("01099"),
    encounterDiscard: [],
    combat: null,
  });
  for (let p = 0; p < players; p++)
    forOwner(s, p, () => {
      s.hand = [];
      s.allies = [];
      s.used = [];
      s.threat = 20;
      s.heroes.forEach((h) =>
        Object.assign(h, {
          resources: 10,
          damage: 0,
          exhausted: false,
          committed: false,
          attachments: [],
        }),
      );
    });
  selectSeat(s, 0);
  return s;
}
function choose(s: GameState, id: string): GameState {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    `Missing ${id}: ${JSON.stringify(s.choice)}`,
  );
  return act(s, { type: "CHOOSE", id });
}
function play(s: GameState, code: string, target?: string): GameState {
  const c = unit(code, s.table?.active ?? 0);
  s.hand.push(c);
  syncSeat(s);
  return act(s, { type: "PLAY", id: c.id, target });
}
function hobbits(s: GameState) {
  s.heroes = [unit("06056"), unit("02001"), unit("02025")];
  s.heroes.forEach((h) => (h.resources = 10));
  syncSeat(s);
  return s;
}
function reload(s: GameState): GameState {
  const parsed = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(parsed), "Amon response must survive save validation");
  return parsed;
}
function counter(s: GameState) {
  const bane = unit(SHADOW_FLAME.bane);
  bane.attachments = [
    {
      id: `amon-counter-${serial++}`,
      code: SHADOW_FLAME.counter,
      exhausted: false,
    },
  ];
  s.staging.push(bane);
  s.encounterDeck = [SHADOW_FLAME.flame, "01099"];
  return bane;
}
function book(s: GameState) {
  const hero = s.heroes[0];
  hero.attachments.push({
    id: `amon-book-${serial++}`,
    code: "06059",
    exhausted: false,
  });
  return { hero, id: hero.attachments.at(-1)!.id };
}
function settleOptional(s: GameState): GameState {
  for (let i = 0; i < 50 && s.choice; i++)
    s = choose(
      s,
      s.choice.options.find((o) => ["skip", "resolve"].includes(o.id))?.id ??
        s.choice.options[0].id,
    );
  return s;
}

test("Amon Dîn registers all ten exact player designs", () => {
  assert.equal(AMON_PLAYER_CARDS.length, 10);
  for (const c of AMON_PLAYER_CARDS) {
    assert.ok(SCRIPTED.has(c.code), c.code);
    assert.equal(card(c.code).text, c.text);
  }
});
test("Pippin returns an engaged enemy and prevents only this player's reengagement for the round", () => {
  let s = hobbits(game("spirit")),
    enemy = unit("01089");
  s.phase = "encounter";
  s.staging = [enemy];
  engage(s, enemy);
  flush(s);
  assert.equal(s.choice?.title, "Pippin · Return engaged enemy");
  s = choose(reload(s), "return");
  assert.equal(s.threat, 23);
  assert.ok(s.staging.some((u) => u.id === enemy.id));
  assert.equal(s.engaged.length, 0);
  assert.equal(amonPlayerCanEngage(s, get(s, enemy.id)!, 0), false);
  assert.throws(
    () => act(s, { type: "ENGAGE", id: enemy.id }),
    /Pippin|engage/i,
  );
});
test("Pippin remains optional and needs every controlled hero to be a Hobbit", () => {
  let s = hobbits(game("spirit")),
    enemy = unit("01089");
  s.staging = [enemy];
  engage(s, enemy);
  flush(s);
  s = choose(s, "skip");
  assert.equal(s.threat, 20);
  assert.equal(s.engaged[0].id, enemy.id);
  s = hobbits(game("spirit"));
  s.heroes[2].code = "01007";
  enemy = unit("01089");
  s.staging = [enemy];
  engage(s, enemy);
  flush(s);
  assert.equal(s.choice, null);
});
test("Denethor's penalty counts his controller's damaged heroes and his zero-willpower discard is not destruction", () => {
  const s = game(),
    denethor = unit("06057");
  s.allies = [denethor];
  s.heroes[0].damage = 1;
  s.heroes[1].damage = 1;
  assert.equal(stats(s, denethor).will, 1);
  s.heroes[2].damage = 1;
  check(s);
  assert.ok(!s.allies.some((u) => u.id === denethor.id));
  assert.ok(s.discard.includes("06057"));
});
test("Denethor's continuous condition uses modified willpower and does not discard a buffed copy", () => {
  const s = game(),
    denethor = unit("06057");
  s.allies = [denethor];
  s.heroes.forEach((h) => (h.damage = 1));
  denethor.tempWill = 1;
  check(s);
  assert.equal(stats(s, denethor).will, 1);
  assert.ok(s.allies.some((u) => u.id === denethor.id));
  denethor.tempWill = 0;
  check(s);
  assert.ok(!s.allies.some((u) => u.id === denethor.id));
});
test("Lord of Morthond's printed restriction accepts gained icons only for paying the played ally", () => {
  let s = game();
  s.heroes[0].attachments = [
    { id: "morthond", code: "06058", exhausted: false },
    { id: "wisdom", code: "02034", exhausted: false },
  ];
  s.deck = ["01020", "01021"];
  s = play(s, "06039");
  assert.equal(s.choice?.title, "Lord of Morthond · Ally played");
  s = choose(reload(s), "draw");
  assert.equal(s.hand.filter((u) => u.code === "01020").length, 1);
});
test("Lord of Morthond triggers from an ally played from a deck, but not put into play", () => {
  let s = game();
  s.heroes[0].attachments = [
    { id: "morthond", code: "06058", exhausted: false },
  ];
  s.deck = ["06039", "01020"];
  playCardFromEffect(s, unit("06039"), { putIntoPlay: false });
  flush(s);
  assert.equal(s.choice?.title, "Lord of Morthond · Ally played");
  s = choose(s, "skip");
  s = game();
  s.heroes[0].attachments = [
    { id: "morthond", code: "06058", exhausted: false },
  ];
  enterAlly(s, unit("06039"), false, false, false);
  flush(s);
  assert.equal(s.choice, null);
});
test("Lord of Morthond needs printed Leadership heroes and a Gondor or Outlands hero host", () => {
  const s = game();
  s.heroes[0].code = "01007";
  s.heroes[0].attachments = [
    { id: "kings", code: "02010", exhausted: false },
    { id: "morthond", code: "06058", exhausted: false },
  ];
  s.heroes[1].attachments = [{ id: "wisdom", code: "02034", exhausted: false }];
  enterAlly(s, unit("06039"), false, true, true);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(playTargets(s, unit("06058")).length, 0);
  s.heroes[1].attachments.push({
    id: "steward",
    code: "01026",
    exhausted: false,
  });
  assert.ok(playTargets(s, unit("06058")).some((h) => h.id === s.heroes[1].id));
});
test("Book of Eldacar discounts by printed Tactics heroes and requires a Tactics hero host", () => {
  let s = game("tactics");
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = play(s, "06059", s.heroes[0].id);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 1,
  );
  assert.ok(s.heroes[0].attachments.some((a) => a.code === "06059"));
  s = game("leadership");
  s.heroes[0].attachments.push({
    id: "battle",
    code: "02104",
    exhausted: false,
  });
  const u = unit("06059");
  assert.ok(playTargets(s, u).some((h) => h.id === s.heroes[0].id));
  s.hand = [u];
  assert.equal(canPlay(s, u), null);
  s = act(s, { type: "PLAY", id: u.id, target: s.heroes[0].id });
  assert.equal(s.heroes[0].resources, 6);
});
test("Book replays Feint at normal cost after saved target and payment choices, then bottoms one physical event", () => {
  let s = game("tactics"),
    b = book(s),
    enemy = unit("01082");
  s.phase = "defense";
  s.engaged = [enemy];
  s.discard = ["01034", "01034"];
  s.deck = ["01020"];
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  assert.ok(availableAbilities(s, b.hero).some((a) => a.id === b.id));
  s = act(s, { type: "ABILITY", id: b.hero.id, attachmentId: b.id });
  s = choose(reload(s), "discard-0");
  s = choose(reload(s), enemy.id);
  s = choose(reload(s), "pay-0");
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 1,
  );
  assert.ok(!get(s, b.hero.id)!.attachments.some((a) => a.id === b.id));
  assert.equal(s.discard.filter((c) => c === "01034").length, 1);
  assert.equal(s.deck.at(-1), "01034");
  assert.ok(s.discard.includes("06059"));
  assert.ok(get(s, enemy.id)!.feinted);
});
test("Book action refuses unavailable response timing and unaffordable Tactics events before discarding its cost", () => {
  const s = game("tactics"),
    b = book(s);
  s.discard = ["06060", "04105"];
  assert.match(
    amonPlayerAbilityProblem(s, b.hero, b.id) ?? "",
    /discard pile|event/i,
  );
  assert.throws(
    () => act(s, { type: "ABILITY", id: b.hero.id, attachmentId: b.id }),
    /discard pile|event/i,
  );
  assert.ok(get(s, b.hero.id)!.attachments.some((a) => a.id === b.id));
  s.discard = ["01035"];
  s.heroes.forEach((h) => (h.resources = 0));
  assert.ok(availableAbilities(s, b.hero).find((a) => a.id === b.id)?.disabled);
});
test("Counter-Spell cancels a Book replay after resource and attachment costs, then the same event still goes to the bottom", () => {
  let s = game("tactics"),
    b = book(s),
    enemy = unit("01082");
  s.phase = "defense";
  s.engaged = [enemy];
  s.discard = ["01034", "01034"];
  s.deck = ["01020"];
  counter(s);
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = act(s, { type: "ABILITY", id: b.hero.id, attachmentId: b.id });
  s = choose(s, "discard-0");
  s = choose(s, enemy.id);
  s = choose(s, "pay-0");
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 1,
  );
  assert.ok(!get(s, b.hero.id)!.attachments.some((a) => a.id === b.id));
  assert.equal(get(s, enemy.id)!.feinted, undefined);
  assert.equal(s.deck.at(-1), "01034");
  assert.equal(s.discard.filter((c) => c === "01034").length, 1);
});
test("Gondorian Discipline interrupts lethal damage, explicitly cancels up to two and survives saved response choices", () => {
  let s = game("tactics"),
    hero = s.heroes[1];
  hero.attachments.push({ id: "gondor", code: "01026", exhausted: false });
  hero.damage = 2;
  s.hand = [unit("06060")];
  damage(s, hero.id, 2);
  flush(s);
  assert.match(s.choice?.title ?? "", /Gondorian Discipline/);
  const event = s.hand[0];
  s = choose(reload(s), event.id);
  s = choose(reload(s), "cancel-2");
  assert.equal(get(s, hero.id)!.damage, 2);
  assert.ok(s.discard.includes("06060"));
  assert.equal(s.choice, null);
});
test("Gondorian Discipline can cancel one damage and uses remaining assigned damage for actual combat consequences", () => {
  let s = game("tactics"),
    hero = s.heroes[1],
    enemy = unit("01082");
  hero.attachments.push({ id: "gondor", code: "01026", exhausted: false });
  hero.damage = 2;
  s.engaged = [enemy];
  s.combat = {
    enemyId: enemy.id,
    defenderId: hero.id,
    attackBonus: 0,
    damageDealt: 0,
  };
  s.hand = [unit("06060")];
  damage(s, hero.id, 2, { enemyId: enemy.id, combatDamage: true });
  flush(s);
  s = choose(s, s.hand[0].id);
  s = choose(s, "cancel-1");
  assert.equal(get(s, hero.id)!.damage, 3);
  assert.equal(s.combat?.damageDealt, 1);
  assert.equal(s.threat, 20);
});
test("declining Gondorian Discipline preserves combat context and assigns original damage only once", () => {
  let s = game("tactics"),
    hero = s.heroes[1],
    enemy = unit("01082");
  hero.attachments.push({ id: "gondor", code: "01026", exhausted: false });
  s.engaged = [enemy];
  s.hand = [unit("06060")];
  s.combat = {
    enemyId: enemy.id,
    defenderId: hero.id,
    attackBonus: 0,
    damageDealt: 0,
  };
  damage(s, hero.id, 1, {
    enemyId: enemy.id,
    combatDamage: true,
    bypassFrodo: true,
    mockingVisited: ["old"],
  });
  flush(s);
  s = choose(reload(s), "skip");
  assert.equal(get(s, hero.id)!.damage, 1);
  assert.equal(s.combat?.damageDealt, 1);
  assert.equal(s.hand[0].code, "06060");
});
test("Counter-Spell cancels Discipline while another player's physical copy may still prevent the same damage", () => {
  let s = game("leadership", 2),
    hero = seatView(s, 1).heroes[0];
  hero.attachments.push({ id: "gondor", code: "01026", exhausted: false });
  s.heroes[0].attachments.push({
    id: "tactics",
    code: "02104",
    exhausted: false,
  });
  s.hand = [unit("06060")];
  forOwner(s, 1, () => {
    s.hand = [unit("06060", 1)];
  });
  syncSeat(s);
  counter(s);
  damage(s, hero.id, 2);
  flush(s);
  s = choose(s, seatView(s, 0).hand[0].id);
  s = choose(s, "cancel-2");
  assert.match(s.choice?.title ?? "", /Gondorian Discipline/);
  s = choose(s, seatView(s, 1).hand[0].id);
  s = choose(s, "cancel-2");
  assert.equal(get(s, hero.id)!.damage, 0);
  assert.ok(seatView(s, 0).discard.includes("06060"));
  assert.ok(seatView(s, 1).discard.includes("06060"));
});
test("Discipline cannot cancel encounter damage under The Eaves of Mirkwood or affect a non-Gondor character", () => {
  const s = game("tactics"),
    hero = s.heroes[1];
  s.hand = [unit("06060")];
  damage(s, hero.id, 1);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(hero.damage, 1);
  hero.attachments.push({ id: "gondor", code: "01026", exhausted: false });
  s.activeLocation = unit("02016");
  damage(s, hero.id, 1);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(hero.damage, 2);
});
test("Lampwright names the next surge reveal, cancels its entire encounter effects and survives save/reload", () => {
  let s = game("spirit"),
    lamp = unit("06061");
  s.allies = [lamp];
  s.encounterDeck = ["01093"];
  s.heroes[0].exhausted = true;
  revealed(s, "01115");
  flush(s);
  assert.equal(
    s.choice?.title,
    "Minas Tirith Lampwright · Card with surge revealed",
  );
  s = choose(reload(s), "treachery");
  assert.ok(!get(s, lamp.id));
  assert.ok(s.discard.includes("06061"));
  assert.ok(s.encounterDiscard.includes("01093"));
  assert.equal(s.heroes[0].damage, 0);
});
test("Lampwright consumes its named next reveal even on a type mismatch", () => {
  let s = game("spirit");
  s.allies = [unit("06061")];
  s.encounterDeck = ["01089"];
  revealed(s, "01115");
  flush(s);
  s = choose(s, "treachery");
  assert.ok(s.staging.some((u) => u.code === "01089"));
  assert.ok(!s.used.some((k) => k.startsWith("game:lampwright-next:")));
  s.heroes[0].exhausted = true;
  revealed(s, "01093");
  flush(s);
  s = settleOptional(s);
  assert.equal(s.heroes[0].damage, 1);
});
test("Lampwright is optional and requires actual Surge rather than any revealed card", () => {
  let s = game("spirit");
  s.allies = [unit("06061")];
  revealed(s, "01089");
  flush(s);
  assert.equal(s.choice, null);
  s.encounterDeck = ["01099"];
  revealed(s, "01115");
  flush(s);
  s = choose(s, "skip");
  assert.ok(s.allies.some((u) => u.code === "06061"));
  assert.ok(s.staging.some((u) => u.code === "01099"));
});
test("Small Target redirects a shadowless enemy attack to the chosen enemy after a Hobbit actually exhausts", () => {
  let s = hobbits(game("spirit")),
    attacker = unit("01082"),
    target = unit("01089"),
    hero = s.heroes[0];
  s.phase = "defense";
  s.engaged = [attacker, target];
  attacker.shadows = ["01099"];
  s.hand = [unit("06062")];
  beginEnemyAttack(s, attacker, [hero.id]);
  flush(s);
  assert.equal(s.choice?.title, "Small Target · Hobbit hero defended");
  s = choose(reload(s), target.id);
  assert.ok(!get(s, target.id));
  assert.equal(get(s, hero.id)!.damage, 0);
  assert.ok(s.discard.includes("06062"));
  assert.equal(s.choice, null);
});
test("Small Target reveals and resolves a printed shadow exactly once, then attack resolves against the defender", () => {
  let s = hobbits(game("spirit")),
    attacker = unit("01089"),
    target = unit("01101"),
    hero = s.heroes[1];
  s.phase = "defense";
  s.engaged = [attacker, target];
  attacker.shadows = ["01089"];
  s.hand = [unit("06062")];
  beginEnemyAttack(s, attacker, [hero.id]);
  flush(s);
  s = choose(s, target.id);
  s = settleOptional(s);
  assert.equal(get(s, hero.id)?.damage, 1);
  assert.equal(get(s, target.id)!.damage, 0);
  assert.equal(
    s.log.filter((l) => l.text.includes("gets +1 attack")).length <= 1,
    true,
  );
});
test("Small Target cannot fire for a non-Hobbit defender or one that never exhausted", () => {
  let s = game("spirit"),
    attacker = unit("01089"),
    target = unit("01101");
  s.engaged = [attacker, target];
  attacker.shadows = ["01099"];
  s.hand = [unit("06062")];
  beginEnemyAttack(s, attacker, [s.heroes[0].id]);
  flush(s);
  assert.notEqual(s.choice?.title, "Small Target · Hobbit hero defended");
  s = hobbits(game("spirit"));
  attacker = unit("01089");
  target = unit("01101");
  s.engaged = [attacker, target];
  attacker.shadows = ["01099"];
  s.hand = [unit("06062")];
  // Explicit scenario bypass provides a legal defender without an exhaustion transition.
  s.activeLocation = unit("01099");
  s.activeLocation.attachments.push({
    id: "path-need",
    code: "04103",
    exhausted: false,
  });
  beginEnemyAttack(s, attacker, [s.heroes[0].id]);
  flush(s);
  assert.notEqual(s.choice?.title, "Small Target · Hobbit hero defended");
});
test("Counter-Spell cancels Small Target before revealing its shadow or redirecting combat", () => {
  let s = hobbits(game("spirit")),
    attacker = unit("01089"),
    target = unit("01101"),
    hero = s.heroes[0];
  s.engaged = [attacker, target];
  attacker.shadows = ["01099"];
  s.hand = [unit("06062")];
  counter(s);
  beginEnemyAttack(s, attacker, [hero.id]);
  flush(s);
  s = choose(s, target.id);
  s = settleOptional(s);
  assert.equal(get(s, target.id)!.damage, 0);
  assert.ok(get(s, hero.id)!.damage > 0);
  assert.ok(s.discard.includes("06062"));
});
test("Ithilien Archer's optional response returns only an enemy actually damaged by its attack", () => {
  let s = game("lore"),
    archer = unit("06063"),
    enemy = unit("01101");
  archer.tempAttack = 2;
  s.allies = [archer];
  s.engaged = [enemy];
  s.phase = "attack";
  playerAttack(s, enemy, [archer.id], true);
  flush(s);
  assert.equal(s.choice?.title, "Ithilien Archer · Enemy damaged");
  s = choose(reload(s), "return");
  assert.equal(get(s, enemy.id)!.damage, 1);
  assert.ok(s.staging.some((u) => u.id === enemy.id));
  assert.ok(!s.engaged.some((u) => u.id === enemy.id));
  s = game("lore");
  archer = unit("06063");
  enemy = unit("01101");
  s.allies = [archer];
  s.engaged = [enemy];
  playerAttack(s, enemy, [archer.id]);
  flush(s);
  assert.equal(enemy.damage, 0);
  assert.equal(s.choice, null);
});
test("Ithilien Archer's Ranged response belongs to its controller and clears enemy's old shadows when returning it", () => {
  let s = game("leadership", 2),
    archer = unit("06063", 0),
    enemy = unit("01082", 1);
  archer.tempAttack = 2;
  enemy.shadows = ["01089"];
  s.allies = [archer];
  forOwner(s, 1, () => {
    s.engaged = [enemy];
  });
  syncSeat(s);
  playerAttack(s, enemy, [archer.id]);
  flush(s);
  s = choose(s, "return");
  assert.equal(seatView(s, 1).engaged.length, 0);
  assert.ok(s.staging.some((u) => u.id === enemy.id));
  assert.equal(get(s, enemy.id)!.shadows.length, 0);
  assert.ok(s.encounterDiscard.includes("01089"));
});
test("Ithilien Pit enters staging unattached, ignores existing enemies and attaches to the next eligible entry", () => {
  let s = game("lore"),
    old = unit("01089");
  s.staging = [old];
  s = play(s, "06064");
  const trap = s.staging.find((u) => u.code === "06064")!;
  assert.ok(trap);
  assert.equal(get(s, old.id)!.attachments.length, 0);
  const next = unit("01082");
  s.staging.push(next);
  enemyAddedToStaging(s, next);
  assert.ok(!s.staging.some((u) => u.id === trap.id));
  assert.ok(next.attachments.some((a) => a.id === trap.id));
  assert.equal(next.attachments[0].owner, 0);
});
test("Ithilien Pit permits ordinary ready characters to attack its enemy in staging and survives attachment save/reload", () => {
  let s = game("lore"),
    enemy = unit("01082");
  enemy.attachments = [
    { id: "pit", code: "06064", exhausted: false, owner: 0 },
  ];
  s.staging = [enemy];
  s.phase = "attack";
  s.heroes[0].tempAttack = 5;
  s = reload(s);
  const hero = s.heroes[0];
  assert.ok(attackersFor(s, get(s, enemy.id)!).some((u) => u.id === hero.id));
  s = act(s, { type: "ATTACK", enemyId: enemy.id, attackerIds: [hero.id] });
  s = settleOptional(s);
  assert.ok(get(s, enemy.id)!.damage > 0);
  assert.equal(get(s, hero.id)!.exhausted, true);
});
test("Ithilien Pit leaves an ineligible immune enemy unattached", () => {
  const s = game("lore"),
    trap = unit("06064"),
    fear = unit("octgn:51223bd0-ffd1-11df-a976-0801207c9080");
  s.staging = [trap, fear];
  enemyAddedToStaging(s, fear);
  assert.ok(s.staging.some((u) => u.id === trap.id));
  assert.equal(fear.attachments.length, 0);
});
test("Hobbit-sense snapshots engaged enemies and prevents the declaring player from any attack this round", () => {
  let s = hobbits(game("spirit")),
    enemy = unit("01089");
  s.engaged = [enemy];
  s.phase = "defense";
  s = play(s, "06065");
  assert.equal(amonPlayerEnemyCannotAttack(s, get(s, enemy.id)!, 0), true);
  assert.equal(amonPlayerCannotDeclareAttack(s), true);
  s = reload(s);
  s.phase = "attack";
  assert.throws(
    () => playerAttack(s, get(s, enemy.id)!, [s.heroes[0].id]),
    /Hobbit|declare/i,
  );
  const next = unit("01101");
  s.engaged.push(next);
  assert.equal(amonPlayerEnemyCannotAttack(s, next, 0), false);
});
test("Hobbit-sense needs all Hobbit heroes, correct combat timing and does not survive the round", () => {
  let s = game("spirit"),
    event = unit("06065");
  s.hand = [event];
  s.phase = "defense";
  assert.match(canPlay(s, event) ?? "", /Hobbit/);
  s = hobbits(game("spirit"));
  s.hand = [event];
  assert.match(canPlay(s, event) ?? "", /Combat/);
  s.phase = "defense";
  s = act(s, { type: "PLAY", id: event.id });
  s.phase = "refresh";
  s = act(s, { type: "NEXT" });
  s = settleOptional(s);
  assert.equal(amonPlayerCannotDeclareAttack(s), false);
});
test("Counter-Spell consumes Hobbit-sense's cost without preventing attacks or declarations", () => {
  let s = hobbits(game("spirit")),
    enemy = unit("01089");
  s.phase = "defense";
  s.engaged = [enemy];
  counter(s);
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = play(s, "06065");
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 2,
  );
  assert.equal(amonPlayerEnemyCannotAttack(s, get(s, enemy.id)!, 0), false);
  assert.equal(amonPlayerCannotDeclareAttack(s), false);
});
test("Damage context serializes all cancellation and replacement flags, while old queued saves retain their original source", () => {
  const context = {
    enemyId: "enemy",
    combatDamage: true,
    bypassFrodo: true,
    bypassDori: true,
    bypassDiscipline: true,
    mockingVisited: ["a", "b"],
  };
  assert.deepEqual(
    readDamageContext({ text: encodeDamageContext(context) }),
    context,
  );
  assert.deepEqual(readDamageContext({ source: "enemy", ids: ["a"] }), {
    enemyId: "enemy",
    combatDamage: true,
    mockingVisited: ["a"],
  });
  assert.deepEqual(readDamageContext({ text: '["a"]', source: "enemy" }), {
    enemyId: "enemy",
    combatDamage: true,
    mockingVisited: ["a"],
  });
});
test("Book's replayed Quick Strike stays outside discard through Háma's nested response and preserves its physical identity through saving", () => {
  let s = game("tactics"),
    b = book(s),
    enemy = unit("01082");
  s.heroes[0].code = "04076";
  s.engaged = [enemy];
  s.discard = ["01035", "01035"];
  s.deck = ["01020"];
  s.hand = [unit("01032")];
  s.phase = "attack";
  s = act(s, { type: "ABILITY", id: b.hero.id, attachmentId: b.id });
  s = choose(s, "discard-0");
  s = choose(s, b.hero.id);
  s = choose(s, "pay-0");
  assert.equal(s.choice?.title, "Quick Strike");
  const id = s.resolvingEvents![0].unit.id;
  assert.equal(s.resolvingEvents![0].destination, "bottom");
  assert.equal(s.discard.filter((c) => c === "01035").length, 1);
  s = choose(reload(s), enemy.id);
  assert.equal(s.choice?.title, "Háma · Declared attacker");
  assert.equal(s.resolvingEvents![0].unit.id, id);
  assert.equal(s.choice!.options.filter((o) => o.code === "01035").length, 1);
  s = choose(reload(s), "event-0");
  const recovered = s.hand.find((u) => u.code === "01035")!;
  assert.notEqual(recovered.id, id);
  s = choose(s, s.hand.find((u) => u.code === "01032")!.id);
  s = settleOptional(s);
  assert.equal(s.resolvingEvents, undefined);
  assert.equal(s.deck.at(-1), "01035");
  assert.equal(s.hand.find((u) => u.code === "01035")!.id, recovered.id);
  assert.equal(s.discard.filter((c) => c === "01035").length, 0);
});
test("Ithilien Pit can automatically attach to Durin's Bane because this entry puts an attachment into play", () => {
  const s = game("lore"),
    trap = unit("06064"),
    bane = unit(SHADOW_FLAME.bane);
  s.staging = [trap, bane];
  enemyAddedToStaging(s, bane);
  assert.ok(!s.staging.some((u) => u.id === trap.id));
  assert.equal(bane.attachments.find((a) => a.code === "06064")!.id, trap.id);
});
test("declined Discipline keeps its damage context across Song of Mocking and Dori replacements without reopening the declined window", () => {
  let s = game("tactics"),
    hero = s.heroes[0],
    recipient = s.heroes[1],
    enemy = unit("01082"),
    dori = unit("131009");
  hero.attachments = [{ id: "gondor-one", code: "01026", exhausted: false }];
  recipient.attachments = [
    { id: "gondor-two", code: "01026", exhausted: false },
  ];
  s.allies = [dori];
  s.engaged = [enemy];
  s.hand = [unit("06060")];
  s.used.push(`phase:mocking:1:${hero.id}:${recipient.id}`);
  s.combat = {
    enemyId: enemy.id,
    defenderId: hero.id,
    attackBonus: 0,
    damageDealt: 0,
  };
  damage(s, hero.id, 2, {
    enemyId: enemy.id,
    combatDamage: true,
    bypassFrodo: true,
    mockingVisited: ["prior"],
  });
  flush(s);
  s = choose(reload(s), "skip");
  assert.match(s.choice?.title ?? "", /^Dori/);
  s = choose(reload(s), dori.id);
  assert.equal(get(s, hero.id)!.damage, 0);
  assert.equal(get(s, recipient.id)!.damage, 0);
  assert.equal(get(s, dori.id)!.damage, 2);
  assert.equal(s.combat!.damageDealt, 2);
  assert.ok(s.hand.some((u) => u.code === "06060"));
});
test("Small Target consumes an already selected redirect when the chosen enemy has left play", () => {
  const s = game("spirit"),
    enemy = unit("01082");
  s.engaged = [enemy];
  s.used.push(`phase:small-target:${enemy.id}:left-enemy`);
  assert.equal(amonPlayerEnemyAttackTarget(s, enemy), null);
  assert.equal(amonPlayerEnemyAttackTarget(s, enemy), undefined);
  assert.ok(!s.used.some((k) => k.startsWith("phase:small-target:")));
});
test("Road to Rivendell Ambush skips a Pippin-protected player and can engage the next eligible player", () => {
  const s = game("leadership", 2),
    enemy = unit(ROAD.taskmaster);
  s.staging = [enemy];
  forOwner(s, 0, () => {
    s.threat = 49;
    s.used.push(`round:pippin:${enemy.id}:0`);
  });
  forOwner(s, 1, () => {
    s.threat = 49;
  });
  s.queue = [fx("roadRivendellAmbush", { target: enemy.id })];
  flush(s);
  assert.ok(!s.staging.some((u) => u.id === enemy.id));
  assert.ok(!seatView(s, 0).engaged.some((u) => u.id === enemy.id));
  assert.ok(seatView(s, 1).engaged.some((u) => u.id === enemy.id));
});
