import test from "node:test";
import assert from "node:assert/strict";
import { applyAction as act } from "./pass-resource-window.ts";
import {
  availableAbilities,
  canPlay,
  createGame,
  playCost,
  playTargets,
  stats,
  validateSave,
} from "../src/game/engine.ts";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import { MORGUL_PLAYER_CARDS } from "../src/game/morgul-player-support.ts";
import { officialStarterDecks } from "../src/game/products.ts";
import { make, get } from "../src/game/core.ts";
import { phaseEnd } from "../src/game/board.ts";
import { flush } from "../src/game/effects.ts";
import { forOwner, seatView, selectSeat, syncSeat } from "../src/game/table.ts";
import { effectiveKeyword } from "../src/game/expansion-passives.ts";
import { KHAZAD } from "../src/game/khazad-dum.ts";
import { EMYN } from "../src/game/emyn-muil.ts";
import { SHADOW_FLAME as S } from "../src/game/shadow-flame-support.ts";
import type { GameState, Unit } from "../src/game/types.ts";

function game(sphere = "lore", players = 1, heroes?: string[]) {
  const d = STARTERS.find((d) => d.id === sphere)!;
  let s = createGame(
    913,
    heroes ? officialStarterDecks[0].cards : d.cards,
    heroes ?? d.heroes,
    heroes ? "custom" : d.id,
    players > 1
      ? {
          seats: [
            { deckId: d.id, heroes: d.heroes },
            {
              deckId: "spirit",
              heroes: STARTERS.find((d) => d.id === "spirit")!.heroes,
            },
          ],
        }
      : {},
  );
  while (s.phase === "setup") s = act(s, { type: "KEEP" });
  Object.assign(s, {
    phase: "planning",
    staging: [],
    queue: [],
    choice: null,
    engaged: [],
    activeLocation: null,
    extraActiveLocations: [],
    encounterDeck: [],
    combat: null,
  });
  for (let p = 0; p < players; p++)
    forOwner(s, p, () => {
      s.hand = [];
      s.allies = [];
      s.discard = [];
      s.deck = ["01013", "01015", "01018", "01019"];
      s.used = [];
      s.heroes.forEach((h) =>
        Object.assign(h, {
          resources: 10,
          attachments: [],
          committed: false,
          exhausted: false,
        }),
      );
    });
  selectSeat(s, 0);
  return s;
}
function choose(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    `Missing ${id}: ${JSON.stringify(s.choice)}`,
  );
  return act(s, { type: "CHOOSE", id });
}
function reload(s: GameState) {
  syncSeat(s);
  const saved = JSON.parse(JSON.stringify(s));
  assert.ok(
    validateSave(saved),
    `Invalid save during ${s.choice?.title ?? s.phase}`,
  );
  return saved as GameState;
}
function play(
  s: GameState,
  code: string,
  target?: string,
  payment?: Record<string, number>,
) {
  const u = make(s, code);
  s.hand.push(u);
  syncSeat(s);
  return act(s, { type: "PLAY", id: u.id, target, payment });
}
function attach(
  s: GameState,
  host: Unit,
  code: string,
  owner = s.table?.active ?? 0,
) {
  const a = {
    id: `morgul-attachment-${s.nextId++}`,
    code,
    owner,
    exhausted: false,
  };
  host.attachments.push(a);
  return a.id;
}
function commit(s: GameState, hero: Unit) {
  s.phase = "quest";
  if (s.table) s.table.turn = s.table.active;
  s = act(s, { type: "TOGGLE_QUEST", id: hero.id });
  return act(s, { type: "COMMIT" });
}
function scroll(
  s: GameState,
  host = s.heroes[0],
  owner = s.table?.active ?? 0,
) {
  return { host, id: attach(s, host, "06142", owner) };
}
function skip(s: GameState) {
  for (let i = 0; s.choice && i < 30; i++) s = choose(s, "skip");
  assert.equal(s.choice, null);
  return s;
}

test("Morgul Vale registers all ten published player designs with exact printed rules", () => {
  assert.equal(MORGUL_PLAYER_CARDS.length, 10);
  for (const c of MORGUL_PLAYER_CARDS) {
    assert.ok(SCRIPTED.has(c.code), c.name);
    assert.equal(card(c.code).text, c.text);
  }
});

test("Théoden gives all printed Tactics heroes willpower, including himself, and retains Sentinel", () => {
  const s = game("tactics", 1, ["06134", "01005", "01006"]),
    h = s.heroes[0];
  assert.equal(stats(s, h).will, 3);
  assert.ok(effectiveKeyword(h, "Sentinel"));
  assert.equal(stats(s, s.heroes[1]).will, 2);
  const ally = make(s, "01018");
  s.allies.push(ally);
  assert.equal(stats(s, ally).will, card(ally.code).willpower);
  const other = make(s, "01007");
  attach(s, other, "02104");
  s.heroes.push(other);
  assert.equal(stats(s, other).will, card(other.code).willpower);
  attach(s, h, KHAZAD.fear);
  assert.equal(stats(s, h).will, 2);
  assert.equal(stats(s, s.heroes[1]).will, 1);
});

test("Théoden's printed-icon aura reaches another fellowship without changing a gained icon", () => {
  const s = game("tactics", 2);
  s.heroes[0].code = "06134";
  const other = seatView(s, 1).heroes[0];
  attach(s, other, "02104", 1);
  assert.equal(stats(s, other).will, card(other.code).willpower);
  other.code = "01006";
  assert.equal(stats(s, other).will, 2);
});

test("Spear targets Rohan characters and uses the existing Restricted overflow decision", () => {
  let s = game("tactics", 1, ["06134", "01005", "01006"]),
    hero = s.heroes[0];
  const ally = make(s, "01016"); // Snowbourn Scout is Rohan.
  s.allies.push(ally);
  assert.ok(playTargets(s, make(s, "06137")).some((u) => u.id === ally.id));
  assert.ok(
    !playTargets(s, make(s, "06137")).some((u) => u.id === s.heroes[1].id),
  );
  attach(s, hero, "06137");
  attach(s, hero, "06137");
  s = play(s, "06137", hero.id);
  assert.match(s.choice?.title ?? "", /Restricted/);
  s = choose(s, s.choice!.options[0].id);
  assert.equal(get(s, hero.id)!.attachments.length, 2);
  assert.equal(stats(s, get(s, hero.id)!).attack, 5);
});

test("Each Spear gives +2 against staging and +1 against an engaged enemy", () => {
  for (const [staging, expected] of [
    [true, 4],
    [false, 2],
  ] as const) {
    let s = game("tactics", 1, ["06134", "01005", "01006"]),
      h = s.heroes[0];
    attach(s, h, "06137");
    attach(s, h, "06137");
    const enemy = make(s, "01082");
    if (staging) s.staging = [enemy];
    else s.engaged = [enemy];
    s.phase = "attack";
    if (staging) s = play(s, "06138");
    s = act(s, { type: "ATTACK", enemyId: enemy.id, attackerIds: [h.id] });
    assert.equal(get(s, enemy.id)!.damage, expected);
  }
});

test("Blank Spear loses its bonus while the attached hero keeps his printed statistics", () => {
  const s = game("tactics", 1, ["06134", "01005", "01006"]),
    h = s.heroes[0];
  attach(s, h, "06137");
  s.activeLocation = make(s, EMYN.amonLhaw);
  assert.equal(stats(s, h).attack, 3);
});

test("Lay snapshots resources after payment and its fixed bonus survives subsequent spending and saving", () => {
  let s = game("spirit"),
    h = s.heroes[0];
  h.resources = 5;
  s = play(s, "06140", h.id, { [h.id]: 1 });
  assert.equal(get(s, h.id)!.resources, 4);
  assert.equal(stats(s, get(s, h.id)!).will, 8);
  s = reload(s);
  get(s, h.id)!.resources = 1;
  assert.equal(stats(s, get(s, h.id)!).will, 8);
  phaseEnd(s);
  flush(s);
  assert.equal(stats(s, get(s, h.id)!).will, 4);
});

test("Lay's chosen hero remains valid when the event pays its last resource", () => {
  let s = game("spirit"),
    h = s.heroes[0];
  s.heroes.forEach((u) => (u.resources = 0));
  h.resources = 1;
  s = play(s, "06140", h.id, { [h.id]: 1 });
  assert.equal(get(s, h.id)!.resources, 0);
  assert.equal(stats(s, get(s, h.id)!).will, 4);
  assert.ok(s.discard.includes("06140"));
});

test("Lay accepts a Spirit icon gained by a hero and can target another player's hero", () => {
  let s = game("lore", 2),
    own = s.heroes[0],
    other = seatView(s, 1).heroes[0];
  attach(s, own, "02081"); // Song of Travel.
  own.resources = 4;
  other.resources = 7;
  assert.ok(playTargets(s, make(s, "06140")).some((u) => u.id === own.id));
  s = play(s, "06140", other.id, { [own.id]: 1 });
  assert.equal(stats(s, get(s, other.id)!).will, 11);
  assert.equal(get(s, own.id)!.resources, 3);
  assert.equal(get(s, other.id)!.resources, 7);
  assert.ok(validateSave(s));
});

test("Lay rejects an ally, a non-Spirit hero and an empty target pool without paying", () => {
  const s = game("spirit"),
    u = make(s, "06140"),
    ally = make(s, "01045");
  s.allies.push(ally);
  s.hand.push(u);
  assert.throws(
    () => act(s, { type: "PLAY", id: u.id, target: ally.id }),
    /target/i,
  );
  s.heroes.forEach((h) => (h.resources = 0));
  assert.match(canPlay(s, u) ?? "", /resources/);
});

test("Steed requires a Gondor or Rohan hero, readies optionally and preserves commitment through saves", () => {
  let s = game("spirit"),
    h = s.heroes[0];
  const outsider = make(s, "01012");
  s.heroes.push(outsider);
  assert.ok(
    !playTargets(s, make(s, "06139")).some((u) => u.id === outsider.id),
  );
  s.heroes.pop();
  s = play(s, "06139", h.id);
  const before = get(s, h.id)!.resources;
  s = commit(s, get(s, h.id)!);
  assert.match(s.choice?.title ?? "", /Steed/);
  s = choose(reload(s), "ready");
  assert.equal(get(s, h.id)!.exhausted, false);
  assert.equal(get(s, h.id)!.committed, true);
  assert.equal(get(s, h.id)!.resources, before - 1);
});

test("Steed can be declined and cannot ready without host resources or against a readying prohibition", () => {
  let s = game("spirit"),
    h = s.heroes[0];
  attach(s, h, "06139");
  s = commit(s, h);
  s = choose(s, "skip");
  assert.equal(get(s, h.id)!.exhausted, true);
  for (const blocked of ["resources", "facedown"] as const) {
    s = game("spirit");
    h = s.heroes[0];
    attach(s, h, "06139");
    if (blocked === "resources") h.resources = 0;
    if (blocked === "facedown") h.attachments[0].facedown = true;
    s = commit(s, h);
    assert.ok(!s.choice?.title.includes("Steed"));
    assert.equal(get(s, h.id)!.exhausted, true);
  }
  s = game("spirit");
  h = s.heroes[0];
  attach(s, h, "06139");
  s = commit(s, h);
  attach(s, get(s, h.id)!, KHAZAD.fear);
  const before = get(s, h.id)!.resources;
  assert.throws(() => choose(s, "ready"), /Steed|exhausted hero/);
  assert.equal(get(s, h.id)!.resources, before);
});

test("Foreign-owned Steed follows its host controller and spends only the attached hero's resource", () => {
  let s = game("lore", 2),
    h = seatView(s, 1).heroes[0];
  attach(s, h, "06139", 0);
  const ownBefore = s.heroes[0].resources,
    otherBefore = h.resources;
  selectSeat(s, 1);
  s = commit(s, h);
  s = choose(reload(s), "ready");
  assert.equal(get(s, h.id)!.resources, otherBefore - 1);
  assert.equal(seatView(s, 0).heroes[0].resources, ownBefore);
  assert.equal(get(s, h.id)!.attachments[0].owner, 0);
});

test("Théodred can fund a Steed response during the same commitment window", () => {
  let s = game("leadership"),
    h = s.heroes.find((h) => h.code === "01002")!;
  h.resources = 0;
  attach(s, h, "06139");
  s = commit(s, h);
  assert.match(s.choice?.title ?? "", /Théodred/);
  s = choose(s, h.id);
  assert.match(s.choice?.title ?? "", /Steed/);
  s = choose(s, "ready");
  assert.equal(get(s, h.id)!.resources, 0);
  assert.equal(get(s, h.id)!.exhausted, false);
});

test("Scroll discounts only printed Lore heroes while a gained Lore icon can host and pay it", () => {
  let s = game();
  assert.equal(playCost(s, card("06142")), 1);
  s = game("spirit");
  const h = s.heroes[0];
  attach(s, h, "02034");
  assert.equal(playCost(s, card("06142")), 4);
  assert.ok(playTargets(s, make(s, "06142")).some((u) => u.id === h.id));
  assert.ok(
    !playTargets(s, make(s, "06142")).some((u) => u.id === s.heroes[1].id),
  );
  s = play(s, "06142", h.id);
  assert.equal(get(s, h.id)!.resources, 6);
});

test("Scroll pays the event, discards itself and bottoms exactly the selected duplicate after resolving", () => {
  let s = game(),
    b = scroll(s);
  s.discard = ["01064", "01064"];
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = act(s, { type: "ABILITY", id: b.host.id, attachmentId: b.id });
  s = choose(reload(s), "discard-1");
  s = choose(reload(s), "pay-0");
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 3,
  );
  assert.ok(!get(s, b.host.id)!.attachments.some((a) => a.id === b.id));
  assert.equal(s.hand.length, 3);
  assert.deepEqual(s.deck, ["01019", "01064"]);
  assert.equal(s.discard.filter((c) => c === "01064").length, 1);
  assert.ok(s.discard.includes("06142"));
});

test("Scroll's X replay pays explicit X and holds the event outside discard through saved search choices", () => {
  let s = game(),
    b = scroll(s);
  s.discard = ["01067"];
  s.deck = ["01013", "01015", "01018"];
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = act(s, { type: "ABILITY", id: b.host.id, attachmentId: b.id });
  s = choose(reload(s), "discard-0");
  assert.ok(!s.choice!.options.some((o) => o.id === "x-0"));
  s = choose(reload(s), "x-2");
  s = choose(reload(s), "pay-0");
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 2,
  );
  assert.equal(s.discard.includes("01067"), false);
  assert.equal(s.deck.includes("01067"), false);
  assert.equal(s.resolvingEvents?.[0].unit.code, "01067");
  s = choose(reload(s), "search-1");
  s = choose(reload(s), "order0");
  assert.deepEqual(
    s.hand.map((u) => u.code),
    ["01015"],
  );
  assert.deepEqual(s.deck, ["01013", "01018", "01067"]);
  assert.equal(s.resolvingEvents, undefined);
});

test("Scroll can replay a targeted Lore event and offers only an actual damaged target", () => {
  let s = game(),
    b = scroll(s),
    h = s.heroes[1];
  h.damage = 1;
  s.discard = ["01063"];
  s = act(s, { type: "ABILITY", id: b.host.id, attachmentId: b.id });
  s = choose(s, "discard-0");
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [h.id],
  );
  s = choose(reload(s), h.id);
  s = choose(reload(s), "pay-0");
  assert.equal(get(s, h.id)!.damage, 0);
  assert.equal(s.deck.at(-1), "01063");
});

test("Scroll's controller uses their discard, resources and deck while another player can receive the event effect", () => {
  let s = game("lore", 2),
    b = scroll(s, s.heroes[0], 1),
    other = seatView(s, 1);
  s.discard = ["01064"];
  other.discard.push("01064");
  const otherResources = other.heroes.reduce((n, h) => n + h.resources, 0);
  s = act(s, { type: "ABILITY", id: b.host.id, attachmentId: b.id });
  s = choose(reload(s), "discard-0");
  s = choose(reload(s), "pay-0");
  assert.match(s.choice?.title ?? "", /Wealth/);
  s = choose(reload(s), "player-1");
  assert.equal(seatView(s, 1).hand.length, 3);
  assert.equal(seatView(s, 1).discard.filter((c) => c === "01064").length, 1);
  assert.ok(seatView(s, 1).discard.includes("06142"));
  assert.equal(seatView(s, 0).deck.at(-1), "01064");
  assert.equal(seatView(s, 0).discard.includes("01064"), false);
  assert.equal(
    seatView(s, 1).heroes.reduce((n, h) => n + h.resources, 0),
    otherResources,
  );
});

test("Scroll does not offer response-only, wrong-sphere, unaffordable or no-target events and retains its cost", () => {
  const s = game(),
    b = scroll(s);
  s.discard = ["01034", "02054", "01063"];
  assert.ok(availableAbilities(s, b.host).find((a) => a.id === b.id)?.disabled);
  assert.throws(
    () => act(s, { type: "ABILITY", id: b.host.id, attachmentId: b.id }),
    /discard pile/,
  );
  assert.ok(get(s, b.host.id)!.attachments.some((a) => a.id === b.id));
  s.discard = ["01064"];
  s.heroes.forEach((h) => (h.resources = 0));
  assert.ok(availableAbilities(s, b.host).find((a) => a.id === b.id)?.disabled);
});

test("Scroll remains optional before its costs are paid", () => {
  let s = game(),
    b = scroll(s);
  s.discard = ["01064"];
  s = act(s, { type: "ABILITY", id: b.host.id, attachmentId: b.id });
  s = choose(s, "skip");
  assert.ok(get(s, b.host.id)!.attachments.some((a) => a.id === b.id));
  assert.deepEqual(s.discard, ["01064"]);
});

test("A canceled Scroll replay preserves paid costs and bottoms that physical event without drawing", () => {
  let s = game(),
    b = scroll(s),
    bane = make(s, S.bane);
  attach(s, bane, S.counter);
  s.staging.push(bane);
  s.encounterDeck = [S.flame];
  s.discard = ["01064", "01064"];
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = act(s, { type: "ABILITY", id: b.host.id, attachmentId: b.id });
  s = choose(s, "discard-0");
  s = choose(s, "pay-0");
  assert.equal(s.hand.length, 0);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 3,
  );
  assert.equal(s.deck.at(-1), "01064");
  assert.equal(s.discard.filter((code) => code === "01064").length, 1);
  assert.ok(s.discard.includes("06142"));
});

test("Existing Captain, Visionary Leadership and Hidden Cache scripts remain active under the pack registration", () => {
  let s = game("leadership"),
    donor = s.heroes[0],
    recipient = s.heroes[1];
  s = play(s, "06135");
  s = choose(s, "move");
  const before = get(s, donor.id)!.resources;
  s = choose(s, donor.id);
  s = choose(s, recipient.id);
  assert.equal(get(s, donor.id)!.resources, before - 1);
  attach(s, get(s, donor.id)!, "01026");
  s = play(s, "06136", donor.id);
  assert.equal(
    stats(s, get(s, donor.id)!).will,
    (card(donor.code).willpower ?? 0) + 1,
  );
  const handBefore = s.hand.length;
  const resourceBefore = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = play(s, "06143");
  assert.equal(s.hand.length, handBefore + 1);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    resourceBefore - 1,
  );
  s = skip(s);
});

test("Existing Prospector discards three before choosing recovery and preserves Hidden Cache mining response", () => {
  let s = game();
  s.deck = ["06143", "01018", "01019"];
  s.discard = ["01013"];
  s = play(s, "06141");
  s = choose(s, "delve");
  assert.match(s.choice?.title ?? "", /Recover one card/);
  s = choose(reload(s), "recover-0");
  assert.deepEqual(s.deck, ["01013"]);
  assert.match(s.choice?.title ?? "", /Hidden Cache/);
  const hero = s.heroes[0],
    before = hero.resources;
  s = choose(reload(s), hero.id);
  assert.equal(get(s, hero.id)!.resources, before + 2);
});
