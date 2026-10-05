import test from "node:test";
import assert from "node:assert/strict";
import { applyAction as act } from "./pass-resource-window.ts";
import {
  availableAbilities,
  canPlay,
  createGame,
  playTargets,
  validateSave,
  playCost,
} from "../src/game/engine.ts";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import { OSGILIATH_PLAYER_CARDS } from "../src/game/osgiliath-player-support.ts";
import { osgiliathPlayerAbilityProblem } from "../src/game/osgiliath-player-cards.ts";
import {
  enterAlly,
  engage,
  phaseEnd,
  readyCharacter,
  discardAttachment,
} from "../src/game/board.ts";
import { stats, get } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { hasTrait, restrictedSlots } from "../src/game/expansion-passives.ts";
import {
  forOwner,
  seatView,
  syncSeat,
  selectSeat,
  hasKeyword,
} from "../src/game/table.ts";
import { SHADOW_FLAME } from "../src/game/shadow-flame.ts";
import type { GameState, Unit } from "../src/game/types.ts";

let serial = 1_700_000;
const unit = (code: string, owner = 0): Unit => ({
  id: `osgiliath-player-${serial++}`,
  code,
  owner,
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
    911,
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
function play(
  s: GameState,
  code: string,
  target?: string,
  amount?: number,
): GameState {
  const c = unit(code, s.table?.active ?? 0);
  s.hand.push(c);
  syncSeat(s);
  return act(s, { type: "PLAY", id: c.id, target, amount });
}
function reload(s: GameState): GameState {
  const parsed = JSON.parse(JSON.stringify(s));
  assert.ok(
    validateSave(parsed),
    "Osgiliath choices must survive save validation",
  );
  return parsed;
}
function attached(s: GameState, code: string, hero = s.heroes[0]) {
  const id = `osgiliath-attachment-${serial++}`;
  hero.attachments.push({
    id,
    code,
    exhausted: false,
    owner: s.table?.active ?? 0,
  });
  return { hero, id };
}
function counter(s: GameState) {
  const bane = unit(SHADOW_FLAME.bane);
  bane.attachments = [
    { id: `counter-${serial++}`, code: SHADOW_FLAME.counter, exhausted: false },
  ];
  s.staging.push(bane);
  s.encounterDeck = [SHADOW_FLAME.flame, "01099"];
}

test("Osgiliath registers all ten exact designs and reuses Sword's existing passive", () => {
  assert.equal(OSGILIATH_PLAYER_CARDS.length, 10);
  for (const c of OSGILIATH_PLAYER_CARDS) {
    assert.ok(SCRIPTED.has(c.code), c.code);
    assert.equal(card(c.code).text, c.text);
  }
  const s = game(),
    ally = unit("01029");
  s.allies = [ally, unit("06008")];
  const before = stats(s, ally).health;
  ally.attachments.push({ id: "sword", code: "06082", exhausted: false });
  assert.equal(hasTrait(ally, "Outlands"), true);
  assert.equal(stats(s, ally).health, before + 1);
});
test("Faramir's Ranged and attack track every staging enemy and change on engagement", () => {
  const s = game("lore"),
    hero = unit("06081"),
    enemy = unit("01082");
  s.heroes = [hero];
  s.staging = [enemy, unit("01089"), unit("01099")];
  assert.equal(hasKeyword(hero, "Ranged"), true);
  assert.equal(stats(s, hero).attack, 4);
  engage(s, enemy);
  assert.equal(stats(s, hero).attack, 3);
});
test("Pelargir Shipwright counts only its owner's printed Spirit heroes, including itself only as an ally", () => {
  const s = game("leadership", 2),
    ship = unit("06086", 0);
  s.allies = [ship];
  s.heroes[0].attachments.push({
    id: "spirit-icon",
    code: "02081",
    exhausted: false,
  });
  forOwner(s, 1, () => {
    s.heroes.forEach((u) => (u.code = "01007"));
  });
  assert.equal(stats(s, ship).will, 0);
  s.heroes[1].code = "01007";
  assert.equal(stats(s, ship).will, 1);
  s.heroes.splice(1, 1);
  assert.equal(stats(s, ship).will, 0);
});
test("Men of the West pays declared X and selects actual duplicate discarded Outlands allies across saves", () => {
  let s = game();
  s.discard = ["06002", "01028", "06002", "06008"];
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = play(s, "06083", undefined, 2);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 2,
  );
  assert.equal(
    s.choice?.options.some((o) => o.code === "01028"),
    false,
  );
  s = choose(reload(s), "discard-2");
  s = choose(reload(s), "discard-0");
  assert.equal(s.hand.filter((u) => u.code === "06002").length, 2);
  assert.equal(new Set(s.hand.map((u) => u.id)).size, 2);
  assert.deepEqual(
    s.discard.filter((c) => c !== "06083"),
    ["01028", "06008"],
  );
});
test("Men of the West's surcharge changes payment without changing X", () => {
  let s = game();
  s.discard = ["06002", "06008"];
  s.activeLocation = unit("02019");
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = play(s, "06083", undefined, 1);
  s = choose(s, "discard-0");
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 2,
  );
  assert.equal(s.hand.filter((u) => u.code === "06002").length, 1);
  assert.ok(s.discard.includes("06008"));
});
test("Men of the West rejects zero, fractional and excessive X before costs and ignores a gained Outlands trait in discard", () => {
  for (const amount of [0, -1, 0.5, 3]) {
    const s = game();
    s.discard = ["06002", "06008"];
    assert.throws(
      () => play(s, "06083", undefined, amount),
      /positive X|Outlands/i,
    );
  }
  const s = game();
  s.discard = ["01028"];
  assert.match(canPlay(s, unit("06083")) ?? "", /Outlands/);
});
test("Counter-Spell cancels Men of the West after paying X, without recovering allies", () => {
  let s = game();
  s.discard = ["06002", "06008"];
  counter(s);
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = play(s, "06083", undefined, 2);
  assert.equal(s.choice, null);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 2,
  );
  assert.ok(s.discard.includes("06002"));
  assert.ok(s.discard.includes("06083"));
});
test("Knight engages and immediately exhausts to attack when played by printed mono-Tactics heroes", () => {
  let s = game("tactics"),
    enemy = unit("01096");
  s.staging = [enemy];
  s = play(s, "06084");
  const knight = s.allies.find((u) => u.code === "06084")!;
  assert.equal(s.choice?.title, "Knight of Minas Tirith · Entered play");
  s = choose(reload(s), enemy.id);
  assert.equal(get(s, knight.id)!.exhausted, true);
  assert.ok(s.engaged.some((u) => u.id === enemy.id));
  assert.equal(get(s, enemy.id)!.damage, 2);
  assert.equal(get(s, enemy.id)!.attacked, false);
});
test("Knight's entry response also fires when put into play and stays optional", () => {
  let s = game("tactics"),
    knight = unit("06084");
  s.staging = [unit("01082")];
  enterAlly(s, knight, false, false);
  flush(s);
  assert.equal(s.choice?.title, "Knight of Minas Tirith · Entered play");
  s = choose(s, "skip");
  assert.equal(get(s, knight.id)!.exhausted, false);
  assert.equal(s.engaged.length, 0);
});
test("Knight uses printed icons and cannot engage immune or movement-protected enemies", () => {
  const s = game("leadership"),
    knight = unit("06084");
  s.heroes.forEach((h) =>
    h.attachments.push({ id: `icon-${h.id}`, code: "02104", exhausted: false }),
  );
  s.staging = [unit("01082")];
  enterAlly(s, knight, false, false);
  flush(s);
  assert.equal(s.choice, null);
  const t = game("tactics");
  t.staging = [unit(SHADOW_FLAME.bane)];
  enterAlly(t, unit("06084"), false, false);
  flush(t);
  assert.equal(t.choice, null);
});
test("Knight must actually exhaust even under Path of Need", () => {
  let s = game("tactics"),
    enemy = unit("01082");
  s.staging = [enemy];
  s.activeLocation = unit("01099");
  s.activeLocation.attachments = [
    { id: "path", code: "04103", exhausted: false },
  ];
  s = play(s, "06084");
  const knight = s.allies.find((u) => u.code === "06084")!;
  s = choose(s, enemy.id);
  assert.equal(get(s, knight.id)!.exhausted, true);
});
test("Gondorian Fire spends attached hero's pool, snapshots post-cost resources and limits each physical attachment", () => {
  let s = game("tactics");
  const b = attached(s, "06085");
  b.hero.resources = 5;
  const base = stats(s, b.hero).attack;
  s = act(s, { type: "ABILITY", id: b.hero.id, attachmentId: b.id });
  assert.equal(get(s, b.hero.id)!.resources, 4);
  assert.equal(stats(s, get(s, b.hero.id)!).attack, base + 4);
  get(s, b.hero.id)!.resources = 8;
  assert.equal(stats(s, get(s, b.hero.id)!).attack, base + 4);
  assert.throws(
    () => act(s, { type: "ABILITY", id: b.hero.id, attachmentId: b.id }),
    /used this phase/,
  );
  const second = attached(s, "06085", get(s, b.hero.id)!);
  s = act(s, { type: "ABILITY", id: b.hero.id, attachmentId: second.id });
  assert.equal(stats(s, get(s, b.hero.id)!).attack, base + 11);
});
test("Gondorian Fire's lasting bonus survives source discard and save but expires at phase end", () => {
  let s = game("tactics");
  const b = attached(s, "06085");
  b.hero.resources = 3;
  const base = stats(s, b.hero).attack;
  s = act(s, { type: "ABILITY", id: b.hero.id, attachmentId: b.id });
  const host = get(s, b.hero.id)!;
  discardAttachment(
    s,
    host,
    host.attachments.find((a) => a.id === b.id)!,
  );
  s = reload(s);
  assert.equal(stats(s, get(s, b.hero.id)!).attack, base + 2);
  phaseEnd(s);
  flush(s);
  assert.equal(stats(s, get(s, b.hero.id)!).attack, base);
});
test("Gondorian Fire cannot borrow another hero's resources or target a non-Gondor non-Dunedain hero", () => {
  const s = game("tactics"),
    b = attached(s, "06085");
  b.hero.resources = 0;
  assert.match(
    osgiliathPlayerAbilityProblem(s, b.hero, b.id) ?? "",
    /resource/,
  );
  assert.ok(
    !playTargets(s, unit("06085")).some((u) => card(u.code).name === "Gimli"),
  );
});
test("Map cost counts printed Spirit icons while gained icons can host and pay for it", () => {
  let s = game("spirit");
  assert.equal(playCost(s, card("06087")), 1);
  s = game("leadership");
  s.heroes[0].attachments.push({ id: "song", code: "02081", exhausted: false });
  assert.equal(playCost(s, card("06087")), 4);
  assert.ok(playTargets(s, unit("06087")).some((u) => u.id === s.heroes[0].id));
});
test("Map replays a paid Spirit event and puts that physical event on the bottom after its effect", () => {
  let s = game("spirit");
  const b = attached(s, "06087");
  s.discard = ["01046", "01046"];
  s.deck = ["01020"];
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = act(s, { type: "ABILITY", id: b.hero.id, attachmentId: b.id });
  s = choose(reload(s), "discard-0");
  s = choose(reload(s), "pay-0");
  assert.equal(s.threat, 14);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 3,
  );
  assert.ok(!get(s, b.hero.id)!.attachments.some((a) => a.id === b.id));
  assert.deepEqual(s.discard, ["01046", "06087"]);
  assert.equal(s.deck.at(-1), "01046");
});
test("Map validates targets before costs and Dwarven Tomb cannot retrieve its own resolving event", () => {
  let s = game("spirit");
  const b = attached(s, "06087");
  s.discard = ["01053"];
  assert.match(
    osgiliathPlayerAbilityProblem(s, b.hero, b.id) ?? "",
    /Spirit event/,
  );
  s.discard.push("01046");
  s.deck = ["01020"];
  s = act(s, { type: "ABILITY", id: b.hero.id, attachmentId: b.id });
  s = choose(s, "discard-0");
  assert.equal(
    s.choice?.options.some((o) => o.id === "discard-0"),
    false,
  );
  s = choose(reload(s), "discard-1");
  s = choose(s, "pay-0");
  assert.ok(s.hand.some((u) => u.code === "01046"));
  assert.equal(s.deck.at(-1), "01053");
});
test("Counter-Spell consumes Map and event payment then sends cancelled event to the bottom", () => {
  let s = game("spirit");
  const b = attached(s, "06087");
  s.discard = ["01046", "01046"];
  s.deck = ["01020"];
  counter(s);
  s = act(s, { type: "ABILITY", id: b.hero.id, attachmentId: b.id });
  s = choose(s, "discard-0");
  s = choose(s, "pay-0");
  assert.equal(s.threat, 20);
  assert.equal(s.discard.filter((c) => c === "01046").length, 1);
  assert.equal(s.deck.at(-1), "01046");
  assert.ok(s.discard.includes("06087"));
});
test("Ranger Bow attaches only to Rangers, uses restricted slots and exhausts both costs", () => {
  let s = game("lore"),
    hero = unit("06081"),
    enemy = unit("01082");
  hero.resources = 10;
  s.heroes = [hero];
  s.staging = [enemy];
  s = play(s, "06088", hero.id);
  const host = get(s, hero.id)!,
    b = host.attachments.find((a) => a.code === "06088")!;
  assert.equal(restrictedSlots(host), 1);
  s = act(s, { type: "ABILITY", id: host.id, attachmentId: b.id });
  s = choose(reload(s), enemy.id);
  assert.equal(get(s, hero.id)!.exhausted, true);
  assert.equal(
    get(s, hero.id)!.attachments.find((a) => a.id === b.id)!.exhausted,
    true,
  );
  assert.equal(get(s, enemy.id)!.damage, 1);
  readyCharacter(s, get(s, hero.id)!);
  assert.ok(
    availableAbilities(s, get(s, hero.id)!).find((a) => a.id === b.id)
      ?.disabled,
  );
});
test("Ranger Bow refuses engagement targets and an exhausted attached character before payment", () => {
  const s = game("lore"),
    hero = s.heroes[0],
    b = attached(s, "06088", hero);
  s.engaged = [unit("01082")];
  assert.match(osgiliathPlayerAbilityProblem(s, hero, b.id) ?? "", /staging/);
  s.staging = [unit("01082")];
  hero.exhausted = true;
  assert.match(osgiliathPlayerAbilityProblem(s, hero, b.id) ?? "", /ready/);
});
test("Forest Patrol requires your Ranger and damages a trapped enemy in either staging or engagement", () => {
  for (const area of ["staging", "engaged"] as const) {
    let s = game("lore"),
      enemy = unit("01089");
    s.heroes[0].code = "06081";
    enemy.attachments = [{ id: "trap", code: "06064", exhausted: false }];
    s[area] = [enemy];
    s = play(s, "06089", enemy.id);
    assert.ok(!get(s, enemy.id));
    assert.ok(s.encounterDiscard.includes("01089"));
  }
});
test("Forest Patrol rejects a non-Trap attachment and another player's Ranger", () => {
  const s = game("leadership", 2),
    enemy = unit("01082");
  enemy.attachments = [{ id: "trap", code: "06064", exhausted: false }];
  s.staging = [enemy];
  forOwner(s, 1, () => (s.heroes[0].code = "06081"));
  s.heroes[0].code = "01010";
  assert.match(canPlay(s, unit("06089")) ?? "", /Ranger/);
  s.heroes[0].code = "06081";
  enemy.attachments[0].code = "06082";
  assert.match(canPlay(s, unit("06089")) ?? "", /Trap/);
});
test("Counter-Spell cancels Forest Patrol after payment without damaging the trapped enemy", () => {
  let s = game("lore"),
    enemy = unit("01082");
  s.heroes[0].code = "06081";
  enemy.attachments = [{ id: "trap", code: "06064", exhausted: false }];
  s.engaged = [enemy];
  counter(s);
  s = play(s, "06089", enemy.id);
  assert.equal(get(s, enemy.id)!.damage, 0);
  assert.ok(s.discard.includes("06089"));
});
test("Palantir names before inspection, preserves order and resolves matching draws and mismatching threat", () => {
  let s = game(),
    b = attached(s, "06090");
  s.encounterDeck = ["01082", "01099", "01093", "01089"];
  s.deck = ["01020", "01021", "01022"];
  const encounter = [...s.encounterDeck];
  s = act(s, { type: "ABILITY", id: b.hero.id, attachmentId: b.id });
  assert.equal(s.peek, null);
  s = choose(reload(s), "enemy");
  assert.equal(get(s, b.hero.id)!.exhausted, true);
  assert.equal(s.peek, "01082");
  s = choose(reload(s), "continue");
  assert.equal(s.peek, "01099");
  s = choose(reload(s), "continue");
  assert.equal(s.peek, "01093");
  s = choose(reload(s), "continue");
  assert.equal(s.peek, null);
  assert.deepEqual(s.encounterDeck, encounter);
  assert.equal(s.threat, 24);
  assert.equal(s.hand.length, 1);
  assert.equal(s.heroes[0].damage, 0);
});
test("Palantir inspects only the existing cards in a short encounter deck and honors blocked draw", () => {
  let s = game(),
    b = attached(s, "06090");
  s.encounterDeck = ["01082", "01089"];
  s.activeLocation = unit("01095");
  s = act(s, { type: "ABILITY", id: b.hero.id, attachmentId: b.id });
  s = choose(s, "enemy");
  s = choose(s, "continue");
  s = choose(s, "continue");
  assert.equal(s.hand.length, 0);
  assert.equal(s.threat, 20);
  assert.equal(s.encounterDeck.length, 2);
});
test("Palantir draws once per matching card so Iron Shackles blocks only the first instruction", () => {
  let s = game(),
    b = attached(s, "06090");
  s.encounterDeck = ["01082", "01089", "01096"];
  s.shackles = 1;
  s.deck = ["01020", "01021", "01022"];
  s = act(s, { type: "ABILITY", id: b.hero.id, attachmentId: b.id });
  s = choose(s, "enemy");
  for (let i = 0; i < 3; i++) s = choose(s, "continue");
  assert.equal(s.hand.length, 2);
  assert.equal(s.shackles, 0);
  assert.equal(s.threat, 20);
});
test("Palantir honors Planning timing, Noble targets and ready attachment and hero costs", () => {
  const s = game(),
    b = attached(s, "06090");
  assert.ok(
    playTargets(s, unit("06090")).some((u) => card(u.code).name === "Aragorn"),
  );
  s.phase = "quest";
  assert.match(
    osgiliathPlayerAbilityProblem(s, b.hero, b.id) ?? "",
    /Planning/,
  );
  s.phase = "planning";
  b.hero.exhausted = true;
  assert.match(osgiliathPlayerAbilityProblem(s, b.hero, b.id) ?? "", /ready/);
});
test("Attachment abilities follow their host controller while discarded Map returns to its physical owner", () => {
  let s = game("leadership", 2),
    hero = seatView(s, 1).heroes[0];
  hero.attachments = [
    { id: "owned-map", code: "06087", owner: 0, exhausted: false },
  ];
  assert.equal(
    availableAbilities(s, hero).some((a) => a.id === "owned-map"),
    false,
  );
  selectSeat(s, 1);
  s.discard = ["01046"];
  s.heroes[0].attachments.push({ id: "song", code: "02081", exhausted: false });
  syncSeat(s);
  s = act(s, { type: "ABILITY", id: hero.id, attachmentId: "owned-map" });
  s = choose(s, "discard-0");
  s = choose(s, "pay-0");
  const physical = s.resolvingEvents![0].unit.id;
  assert.equal(s.resolvingEvents![0].destination, "bottom");
  assert.equal(seatView(s, 1).discard.includes("01046"), false);
  s = reload(s);
  assert.equal(s.resolvingEvents![0].unit.id, physical);
  s = choose(s, "player-1");
  assert.ok(seatView(s, 0).discard.includes("06087"));
  assert.equal(seatView(s, 1).deck.at(-1), "01046");
});
