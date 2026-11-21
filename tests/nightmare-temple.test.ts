import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { STARTERS, card, encounterCards, name } from "../src/game/cards";
import { revealed } from "../src/game/board";
import {
  draw,
  fx,
  get,
  locationQuest,
  stats,
  threatOf,
} from "../src/game/core";
import { flush } from "../src/game/effects";
import { applyAction, createGame } from "../src/game/engine";
import { canPlay } from "../src/game/actions";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { forOwner, playerOrder, selectSeat } from "../src/game/table";
import {
  templeCannotAttach,
  templeMapUnits,
  templePublicState,
  templeSyncMap,
  templeTravelStart,
} from "../src/game/temple";
import {
  TEMPLE as T,
  TEMPLE_EDGE_FACES,
  TEMPLE_LOST_FACES,
  templeCell,
  templeFrontOf,
} from "../src/game/temple-support";
import {
  NIGHTMARE,
  NIGHTMARE_DC as N,
  nightmareCardOf,
  nightmareStatus,
} from "../src/game/nightmare";
import type { GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import { autoplay, opening, valid } from "./nightmare-fixtures";
import { add, cell, choose, reload, settle } from "./temple-fixtures";

const ID = "temple-of-the-deceived";
const hooks = (s: GameState) => batch4Scenario(s);
const finish = (s: GameState) => {
  flush(s);
  return settle(s);
};
const tally = (list: string[]) =>
  list.reduce<Record<string, number>>(
    (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
    {},
  );
/** A Nightmare mode game through the setup's choices (the scenario's own fixture). */
function start(players = 1, seed = 50) {
  const d = STARTERS[0];
  let s = createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: ID,
    nightmare: true,
    ...(players > 1
      ? {
          seats: STARTERS.slice(0, players).map((d) => ({
            deckId: d.id,
            heroes: [...d.heroes],
          })),
        }
      : {}),
  });
  for (let i = 0; s.phase === "setup"; i++) {
    assert.ok(i < 100, "Temple setup terminates");
    s = applyAction(
      s,
      s.choice
        ? { type: "CHOOSE", id: s.choice.options[0].id }
        : { type: "KEEP" },
    );
  }
  return settle(s);
}
/** A quiet Nightmare board in the planning phase (temple-fixtures' base, in Nightmare mode). */
function board(players = 1) {
  const s = start(players);
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    combat: null,
    suspendedCombats: [],
    progress: 0,
    encounterDiscard: [],
    encounterDeck: Array(30).fill(T.rain),
  });
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      s.engaged = [];
      s.used = [];
      s.hand = [];
      s.discard = [];
      s.committedIds = [];
      s.allies = s.allies.filter((u) =>
        [T.sahirAlly, T.naasiyahAlly].includes(u.code),
      );
      for (const u of [...s.heroes, ...s.allies])
        Object.assign(u, {
          damage: 0,
          resources: 10,
          exhausted: false,
          committed: false,
          attachments: [],
        });
    });
  selectSeat(s, 0);
  if (s.table) {
    s.table.first = 0;
    s.table.turn = 0;
    s.table.passed = [];
  }
  return s;
}
/** Places a printed identity at a map position, faceup or on its shared Uncharted side. */
function place(
  s: GameState,
  row: number,
  column: number,
  code: string,
  hidden = false,
) {
  const q = s.temple!;
  const u = cell(s, row, column);
  if (q.originalCodes[u.id] !== code) {
    const other = templeMapUnits(s).find(
      (x) => x.id !== u.id && q.originalCodes[x.id] === code,
    )!;
    assert.ok(other, `a physical ${card(code).name} exists`);
    const previous = q.originalCodes[u.id];
    q.originalCodes[other.id] = previous;
    if (q.hiddenBacks[other.id]) {
      q.hiddenBacks[other.id] = previous;
      other.code = templeFrontOf(previous);
    } else other.code = previous;
    delete q.lookedBy[other.id];
  }
  q.originalCodes[u.id] = code;
  u.progress = 0;
  delete q.lookedBy[u.id];
  if (hidden) {
    u.code = templeFrontOf(code);
    q.hiddenBacks[u.id] = code;
  } else {
    u.code = code;
    delete q.hiddenBacks[u.id];
  }
  templeSyncMap(s);
  return u;
}
/** The active location moves to a faceup map card. */
function activate(s: GameState, row: number, column: number, code: string) {
  const u = place(s, row, column, code);
  const old = s.activeLocation;
  if (old && old.id !== u.id) s.temple!.outOfStaging.push(old);
  s.activeLocation = null;
  s.temple!.activeId = u.id;
  templeSyncMap(s);
  return u;
}
function engagedEnemy(s: GameState, code: string, p = 0) {
  return add(s, code, "engaged", p);
}
function defend(
  s: GameState,
  enemy: Unit,
  defender: Unit | null,
  shadows: string[] = [],
) {
  enemy.shadows = shadows;
  s.phase = "defense";
  return applyAction(reload(s), {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender?.id ?? null,
  });
}
/** The first player travels from the completed active location. */
function travel(s: GameState, target: Unit) {
  s.phase = "travel";
  s.activeLocation!.progress = locationQuest(s, s.activeLocation!);
  templeTravelStart(s);
  return finish(applyAction(reload(s), { type: "TRAVEL", id: target.id }));
}

test("Nightmare: Temple of the Deceived's setup card and Nightmare Deck carry their scans' texts, stats and faces", () => {
  const setup = card(N.templeCard);
  assert.equal(setup.type_code, "nightmare");
  assert.match(
    setup.text!,
    /^Begin with the standard quest deck and encounter deck for the Temple of the Deceived scenario\.\n/,
  );
  assert.ok(
    setup.text!.includes(
      "1x Jungle Path\n2x Cursed Temple\n1x Deeper into the Ruins\n3x Sunken Ruins\n2x Aimless Wandering\n2x Curse of the Downfallen\n1x Dwindling Supplies\n3x Faithless Desecrator\n",
    ),
  );
  const back = setup.back_text!.split("\n");
  assert.equal(back.length, 3);
  assert.equal(back[0], "You are playing Nightmare mode.");
  assert.ok(
    back[1].includes(
      'create two middle columns using the six new "Edge of the Temple" cards',
    ),
  );
  assert.ok(
    back[2].startsWith("Forced: After the active location is explored"),
  );
  // The Edge of the Temple cards: the revealed side in front, the shared
  // Edge of the Temple side behind (it has no traits).
  for (const [code, name, threat, quest] of [
    [N.desecrated, "Desecrated Ruins", 4, 6],
    [N.foothills, "Temple Foothills", 2, 5],
    [N.cursedTemple, "Cursed Temple", 3, 4],
  ] as const) {
    const c = card(code);
    const guid = code.split(":")[1];
    assert.deepEqual(
      [
        c.name,
        c.threat,
        c.quest,
        c.traits,
        c.back_name,
        c.back_threat,
        c.back_traits,
      ],
      [name, threat, quest, "Ruins.", "Edge of the Temple", 3, ""],
    );
    assert.equal(c.back_text!.split("\n").length, 4);
    assert.equal(c.imagesrc, `/cards/${guid}.jpg`);
    assert.equal(c.back_imagesrc, `/cards/${guid}.B.jpg`);
  }
  assert.equal(card(N.cursedTemple).text!.split("\n").length, 2);
  const edge = card(N.edge);
  assert.deepEqual(
    [
      edge.name,
      edge.threat,
      edge.quest,
      edge.traits,
      edge.quantity,
      edge.imagesrc,
    ],
    [
      "Edge of the Temple",
      3,
      undefined,
      "",
      0,
      "/cards/temple-edge-of-the-temple.jpg",
    ],
  );
  assert.ok(
    edge.text!.includes("Action: Remove 8 progress from Edge of the Temple"),
  );
  assert.deepEqual(
    [N.knight, N.soldier].map((code) => {
      const c = card(code);
      return [c.engagement, c.threat, c.attack, c.defense, c.health, c.traits];
    }),
    [
      [23, 4, 4, 4, 6, "Undead."],
      [28, 3, 3, 3, 4, "Undead."],
    ],
  );
  assert.equal(card(N.soldier).text!.split("\n").length, 3);
  assert.ok(
    card(N.deceitful).text!.startsWith("Doomed 3.\nWhen Revealed: Switch"),
  );
  assert.ok(card(N.knight).shadow!.startsWith("Shadow: If no damage is dealt"));
  assert.ok(card(N.call).shadow!.includes("'when revealed' effect"));
  assert.ok(card(N.precipice).shadow!.includes("additional attack"));
  const set = encounterCards.filter(
    (c) => c.encounter_set === "Temple of the Deceived - Nightmare",
  );
  assert.equal(set.length, 10);
  assert.equal(
    set.reduce(
      (n, c) => n + (c.type_code === "nightmare" ? 0 : (c.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(
    art.filter((a) => set.some((c) => c.code === a.code)).length,
    13,
  );
  // The generic public side is the printed shared scan: it does not encode a
  // hidden identity.
  const generic = createHash("sha256")
    .update(readFileSync("public/cards/temple-edge-of-the-temple.jpg"))
    .digest("hex");
  const backs = art.filter(
    (a) => TEMPLE_EDGE_FACES.includes(a.code) && a.face === "back",
  );
  assert.equal(backs.length, 3);
  assert.ok(backs.every((a) => a.sha256 === generic));
  assert.equal(nightmareCardOf(start()), N.templeCard);
});

test("Nightmare: Temple of the Deceived's encounter deck and Island Map match the source recipe", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const recipe = recipes.find((r) => r.id === "N06.6")!;
  const section = (name: string) =>
    tally(
      recipe.cards
        .filter((c) => c.section === name)
        .flatMap((c) => Array<string>(c.quantity).fill(c.code)),
    );
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.templeCard).text!.includes(`${n}x ${title}`), title);
  // The recipe keeps 2 Deeper into the Ruins (its standard recipe lists 3);
  // the printed set has 4 (docs/TEMPLE-SOURCES.md), so 3 remain.
  const encounter = section("sharedEncounterDeck");
  encounter[T.deeper] += 1;
  assert.deepEqual(NIGHTMARE[ID]!.removals, {
    "Jungle Path": 1,
    "Cursed Temple": 2,
    "Deeper into the Ruins": 1,
    "Sunken Ruins": 3,
    "Aimless Wandering": 2,
    "Curse of the Downfallen": 2,
    "Dwindling Supplies": 1,
    "Faithless Desecrator": 3,
  });
  for (const players of [1, 2]) {
    const s = start(players);
    const q = s.temple!;
    const deck = tally([...s.encounterDeck, ...s.encounterDiscard]);
    assert.deepEqual(deck, encounter);
    assert.deepEqual(
      tally(Object.values(q.originalCodes)),
      section("sharedEncounterDeck2"),
    );
    assert.equal(s.encounterDeck.length + s.encounterDiscard.length, 33);
    for (const code of [T.desecrator, T.sunken, T.curse])
      assert.equal(deck[code], undefined);
    assert.deepEqual(
      [deck[T.deeper], deck[T.supplies], deck[T.wandering]],
      [3, 2, 1],
    );
    assert.deepEqual(
      [N.knight, N.soldier, N.deceitful, N.call, N.precipice].map(
        (c) => deck[c],
      ),
      [2, 3, 2, 3, 3],
    );
    // Three Lost Island columns, two Edge of the Temple columns, then the
    // Temple column: 18 cards in a fixed 3 by 6 grid.
    assert.equal(q.map.length, 18);
    assert.equal(templeMapUnits(s).length, 18);
    assert.deepEqual(
      q.map.map((c) => [c.row, c.column]),
      Array.from({ length: 18 }, (_, i) => [Math.floor(i / 6), i % 6]),
    );
    const originals = tally(Object.values(q.originalCodes));
    for (const c of TEMPLE_LOST_FACES)
      assert.equal(
        originals[c] ?? 0,
        c === T.jungle ? 1 : c === T.cursed ? 0 : 2,
      );
    assert.deepEqual(
      [
        originals[T.grotto],
        originals[T.halls],
        ...TEMPLE_EDGE_FACES.map((c) => originals[c]),
      ],
      [1, 2, 2, 2, 2],
    );
    for (const c of q.map) {
      const original = q.originalCodes[c.id];
      if (c.column === 5) assert.ok([T.grotto, T.halls].includes(original));
      else if (c.column >= 3) assert.ok(TEMPLE_EDGE_FACES.includes(original));
      else assert.ok(TEMPLE_LOST_FACES.includes(original));
    }
    assert.equal(templeMapUnits(s).filter((u) => u.code === N.edge).length, 6);
    assert.equal(
      templeMapUnits(s).filter((u) => u.code === T.temple).length,
      3,
    );
    assert.equal(templePublicState(s)!.columns, 6);
    assert.ok(valid(s));
    assert.deepEqual(reload(s).temple!.map, q.map);
  }
  assert.match(nightmareStatus(start())[0], /two Edge of the Temple columns/);
});

test("Nightmare: Edge of the Temple is an Uncharted location with 3 threat and no player card attachments; its Action removes 8 progress to look, and it flips as it becomes active", () => {
  let s = board();
  activate(s, 1, 2, T.flooded);
  const edge = place(s, 1, 3, N.foothills, true);
  assert.equal(edge.code, N.edge);
  assert.ok(s.staging.some((u) => u.id === edge.id));
  assert.equal(threatOf(s, edge), 3);
  assert.equal(locationQuest(s, edge), Infinity);
  assert.ok(templeCannotAttach(s, edge));
  const pub = templePublicState(s)!.cells.find((c) => c.id === edge.id)!;
  assert.deepEqual([pub.peekCost, pub.name], [8, "Edge of the Temple"]);
  edge.progress = 7;
  assert.match(
    templePublicState(s)!.cells.find((c) => c.id === edge.id)!.peekProblem!,
    /costs 8 progress/,
  );
  edge.progress = 9;
  s = applyAction(reload(s), { type: "ABILITY", id: edge.id });
  assert.equal(templeMapUnits(s).find((u) => u.id === edge.id)!.progress, 1);
  assert.deepEqual(s.temple!.lookedBy[edge.id], [0]);
  assert.equal(s.choice?.options[0].code, N.foothills);
  s = finish(s);
  assert.ok(valid(s));
  // Travelling there flips it over (and clears its progress).
  s = travel(
    s,
    templeMapUnits(s).find((u) => u.id === edge.id)!,
  );
  assert.equal(s.activeLocation!.id, edge.id);
  assert.equal(s.activeLocation!.code, N.foothills);
  assert.equal(s.activeLocation!.progress, 0);
  assert.equal(s.temple!.hiddenBacks[edge.id], undefined);
  assert.ok(valid(s));
});

test("Nightmare: Desecrated Ruins empties each hero and objective-ally as it flips while active; Cursed Temple discards 3 random cards from each hand and stops card-effect draws", () => {
  let s = board(2);
  activate(s, 1, 2, T.flooded);
  let target = place(s, 1, 3, N.desecrated, true);
  s = travel(s, target);
  assert.equal(s.activeLocation!.code, N.desecrated);
  for (const p of [0, 1])
    forOwner(s, p, () => {
      for (const u of [...s.heroes, ...s.allies])
        assert.equal(u.resources, 0, u.code);
    });
  assert.ok(valid(s));
  s = board(2);
  activate(s, 1, 2, T.flooded);
  target = place(s, 1, 3, N.cursedTemple, true);
  for (const p of [0, 1])
    forOwner(s, p, () => {
      for (let i = 0; i < 4; i++)
        add(s, s.deck[i] ?? STARTERS[0].cards[i], "hand", p);
    });
  s = travel(s, target);
  assert.equal(s.activeLocation!.code, N.cursedTemple);
  for (const p of [0, 1])
    forOwner(s, p, () => {
      assert.equal(s.hand.length, 1);
      assert.equal(s.discard.length, 3);
    });
  assert.ok(hooks(s).cannotDraw!(s));
  const hand = s.hand.length;
  draw(s, 2);
  assert.equal(s.hand.length, hand, "a card-effect draw is prevented");
  draw(s, 1, false);
  assert.equal(
    s.hand.length,
    hand + 1,
    "the resource phase draw still happens",
  );
  assert.ok(valid(s));
});

test("Nightmare: while Temple Foothills is the active location, the players as a group cannot play more than 1 card each round", () => {
  const s = board(2);
  activate(s, 1, 1, N.foothills);
  const first = add(s, "01023", "hand", 0);
  const second = add(s, "01023", "hand", 1);
  assert.doesNotMatch(canPlay(s, first) ?? "", /Temple Foothills/);
  hooks(s).playerCardPlayed!(s, first, true);
  selectSeat(s, 1);
  assert.match(canPlay(s, second) ?? "", /Temple Foothills/);
  // The count is the group's, for this round only.
  s.round++;
  assert.equal(hooks(s).playProblem!(s, second.code), null);
  hooks(s).playerCardPlayed!(s, second, true);
  assert.match(hooks(s).playProblem!(s, first.code) ?? "", /as a group/);
  // Elsewhere, cards are played freely.
  activate(s, 1, 0, T.flooded);
  assert.equal(hooks(s).playProblem!(s, first.code), null);
  assert.ok(valid(s));
});

test("Nightmare: King's Knight returns to the staging area after an attack that deals no damage; its shadow returns any attacking enemy that deals none", () => {
  let s = board();
  activate(s, 1, 1, T.flooded);
  const hero = s.heroes[0];
  hero.tempDefense = 10;
  let knight = engagedEnemy(s, N.knight);
  s = finish(defend(s, knight, hero));
  assert.equal(hero.damage ?? 0, 0);
  assert.ok(
    s.staging.some((u) => u.id === knight.id),
    "it returns to the staging area",
  );
  assert.ok(!s.engaged.some((u) => u.id === knight.id));
  assert.ok(valid(s));
  // An attack that deals damage keeps it engaged.
  s = board();
  activate(s, 1, 1, T.flooded);
  knight = engagedEnemy(s, N.knight);
  s = finish(defend(s, knight, null));
  assert.ok(s.engaged.some((u) => u.id === knight.id));
  // The shadow returns another enemy.
  s = board();
  activate(s, 1, 1, T.flooded);
  const def = s.heroes[0];
  def.tempDefense = 10;
  const watcher = engagedEnemy(s, T.watcher);
  s = finish(defend(s, watcher, def, [N.knight]));
  assert.ok(s.staging.some((u) => u.id === watcher.id));
  assert.ok(s.encounterDiscard.includes(N.knight));
  assert.ok(valid(s));
});

test("Nightmare: Cursed Soldier gets +3 threat, attack or defense from the active location's row", () => {
  const s = board();
  const soldier = add(s, N.soldier);
  const printed = card(N.soldier);
  for (const [row, bonus] of [
    [0, [3, 0, 0]],
    [1, [0, 3, 0]],
    [2, [0, 0, 3]],
  ] as const) {
    activate(s, row, 1, [T.flooded, T.graves, T.caverns][row]);
    assert.deepEqual(
      [
        threatOf(s, soldier),
        stats(s, soldier).attack,
        stats(s, soldier).defense,
      ],
      [
        printed.threat! + bonus[0],
        printed.attack! + bonus[1],
        printed.defense! + bonus[2],
      ],
      `row ${row + 1}`,
    );
  }
  assert.ok(valid(s));
});

test("Nightmare: Deceitful Island switches the active location with the location above, below or to its left, then flips each adjacent location to its Lost Island or Edge of the Temple side", () => {
  let s = board(2);
  const active = activate(s, 1, 1, T.flooded);
  const above = place(s, 0, 1, T.caverns);
  place(s, 0, 0, T.graves);
  place(s, 0, 2, T.cliffs, true);
  const left = place(s, 1, 0, T.halls);
  above.progress = 2;
  s.encounterDeck = [N.deceitful];
  s.queue.push(fx("reveal", { player: 0 }));
  flush(s);
  assert.equal(s.threat, 23, "Doomed 3");
  assert.deepEqual(
    s.choice!.options.map((o) => [o.id, o.label]),
    [
      [above.id, `Switch with ${card(T.caverns).name} · above`],
      [cell(s, 2, 1).id, `Switch with ${name(cell(s, 2, 1))} · below`],
      [left.id, `Switch with ${card(T.halls).name} · to its left`],
    ],
  );
  s = choose(s, above.id);
  s = settle(s);
  const q = s.temple!;
  assert.equal(q.activeId, active.id, "the active location does not change");
  assert.deepEqual(
    [templeCell(s, active.id)!.row, templeCell(s, active.id)!.column],
    [0, 1],
  );
  assert.deepEqual(
    [templeCell(s, above.id)!.row, templeCell(s, above.id)!.column],
    [1, 1],
  );
  // The switched location and the top-left one flip to their Lost Island side;
  // the facedown one stays.
  const moved = templeMapUnits(s).find((u) => u.id === above.id)!;
  assert.equal(moved.code, T.lost);
  assert.equal(moved.progress, 0);
  assert.equal(q.hiddenBacks[moved.id], T.caverns);
  assert.deepEqual(q.lookedBy[moved.id], [0, 1]);
  assert.equal(cell(s, 0, 0).code, T.lost);
  assert.equal(cell(s, 0, 2).code, T.lost);
  assert.equal(q.lookedBy[cell(s, 0, 2).id], undefined);
  // The location now to the left of the old position is unchanged.
  assert.equal(templeMapUnits(s).find((u) => u.id === left.id)!.code, T.halls);
  assert.ok(valid(s));
  assert.deepEqual(reload(s).temple!.map, q.map);
});

test("Nightmare: Deceitful Island flips an adjacent Edge card to its Edge of the Temple side and discards its player card attachments, but not a Temple card", () => {
  let s = board();
  const active = activate(s, 1, 4, N.foothills);
  const edge = place(s, 1, 3, N.desecrated);
  edge.attachments.push({
    id: "a-power",
    code: "01056",
    exhausted: false,
    owner: 0,
    controller: 0,
  });
  const halls = place(s, 0, 3, T.halls);
  s.encounterDeck = [N.deceitful];
  s.queue.push(fx("reveal", { player: 0 }));
  flush(s);
  // Switching with the location to its left: the active location moves to
  // (2, 4) in the printed numbering, and the Edge card takes its place.
  s = settle(choose(s, edge.id));
  assert.deepEqual(
    [templeCell(s, active.id)!.row, templeCell(s, active.id)!.column],
    [1, 3],
  );
  const flipped = templeMapUnits(s).find((u) => u.id === edge.id)!;
  assert.deepEqual(
    [templeCell(s, edge.id)!.row, templeCell(s, edge.id)!.column],
    [1, 4],
  );
  assert.equal(flipped.code, N.edge);
  assert.equal(s.temple!.hiddenBacks[edge.id], N.desecrated);
  assert.deepEqual(flipped.attachments, []);
  assert.ok(s.discard.includes("01056"));
  // A Temple card has neither side.
  assert.equal(templeMapUnits(s).find((u) => u.id === halls.id)!.code, T.halls);
  assert.ok(valid(s));
});

test("Nightmare: Call of the Curse gives each Undead enemy +X attack and defense this round (X: locations left of the active location), surging when X is 0 or 1; its shadow resolves the same effect", () => {
  let s = board();
  activate(s, 1, 3, T.flooded);
  const knight = add(s, N.knight);
  const printed = card(N.knight);
  s.encounterDeck = [N.call, N.soldier];
  s.queue.push(fx("reveal", { player: 0 }));
  flush(s);
  s = settle(s);
  assert.deepEqual(
    [stats(s, knight).attack, stats(s, knight).defense],
    [printed.attack! + 3, printed.defense! + 3],
  );
  assert.equal(s.encounterDeck.length, 1, "X is 3: no surge");
  // A later Undead enemy is affected, and X is recalculated.
  activate(s, 1, 1, T.graves);
  const soldier = add(s, N.soldier);
  assert.equal(stats(s, soldier).defense, card(N.soldier).defense! + 1);
  s.queue.push(fx("reveal", { player: 0 }));
  s.encounterDeck.unshift(N.call);
  flush(s);
  s = settle(s);
  assert.equal(
    stats(s, knight).attack,
    printed.attack! + 2,
    "two copies, X is 1",
  );
  assert.equal(s.encounterDeck.length, 0, "X is 1: it surges");
  assert.equal(s.staging.filter((u) => u.code === N.soldier).length, 2);
  assert.ok(valid(s));
  // Next round the effect has ended.
  s.round++;
  assert.equal(stats(s, knight).attack, printed.attack);
  // As a shadow, it resolves the same effect for this round.
  s = board();
  activate(s, 1, 2, T.flooded);
  const attacker = engagedEnemy(s, N.knight);
  const hero = s.heroes[0];
  s = finish(defend(s, attacker, hero, [N.call]));
  assert.equal(s.nightmare?.templeCall?.count, 1);
  assert.ok(valid(s));
});

test("Nightmare: Sudden Precipice attaches to the active location; travelling from it to the right deals 2 damage to each exhausted character, and its shadow makes an additional attack", () => {
  let s = board();
  const origin = activate(s, 1, 1, T.flooded);
  place(s, 0, 1, T.caverns);
  place(s, 1, 2, T.graves);
  s.encounterDeck = [N.precipice];
  s.queue.push(fx("reveal", { player: 0 }));
  flush(s);
  assert.deepEqual(
    origin.attachments.map((a) => a.code),
    [N.precipice],
  );
  // The map shows it on its location.
  assert.deepEqual(
    templePublicState(s)!
      .cells.find((c) => c.id === origin.id)!
      .attachments.map((a) => a.name),
    ["Sudden Precipice"],
  );
  assert.ok(!s.encounterDiscard.includes(N.precipice));
  assert.ok(valid(s));
  const tired = s.heroes[0].id;
  const rested = s.heroes[1].id;
  const hero = (s: GameState, id: string) => s.heroes.find((u) => u.id === id)!;
  hero(s, tired).exhausted = true;
  // Travelling up (not to the right) deals no damage.
  s = travel(s, cell(s, 0, 1));
  assert.equal(hero(s, tired).damage, 0);
  s = travel(
    s,
    templeMapUnits(s).find((u) => u.id === origin.id)!,
  );
  assert.equal(s.activeLocation!.id, origin.id);
  hero(s, tired).exhausted = true;
  s = travel(s, cell(s, 1, 2));
  assert.equal(hero(s, tired).damage, 2);
  assert.equal(hero(s, rested).damage, 0);
  assert.ok(valid(s));
  // The shadow: an additional attack after this one.
  s = board();
  const enemy = engagedEnemy(s, T.drowned);
  s.combat = {
    enemyId: enemy.id,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
    attackPlayer: 0,
  };
  assert.ok(hooks(s).shadow!(s, N.precipice));
  assert.equal(s.combat.extraAttacks, 1);
});

test("Nightmare: after the active location is explored, the player cards attached to it are discarded", () => {
  let s = board();
  const from = activate(s, 1, 1, T.flooded);
  from.attachments.push({
    id: "a-power",
    code: "01056",
    exhausted: false,
    owner: 0,
    controller: 0,
  });
  place(s, 1, 2, T.graves);
  s = travel(s, cell(s, 1, 2));
  const old = templeMapUnits(s).find((u) => u.id === from.id)!;
  assert.equal(old.attachments.length, 0);
  assert.ok(s.discard.includes("01056"));
  assert.ok(valid(s));
});

test("Nightmare: Temple of the Deceived's lasting effects survive a reload, and invalid ones are rejected", () => {
  const s = board();
  activate(s, 1, 2, T.flooded);
  s.nightmare = {
    templeCall: { round: s.round, count: 2 },
    templePlayed: { round: s.round, count: 1 },
  };
  assert.ok(valid(s));
  assert.deepEqual(reload(s).nightmare, s.nightmare);
  for (const bad of [
    { templeCall: { round: s.round + 1, count: 1 } },
    { templeCall: { round: s.round, count: 0 } },
    { templePlayed: { round: -1, count: 1 } },
  ]) {
    const t = structuredClone(s);
    t.nightmare = bad;
    assert.ok(!valid(t), JSON.stringify(bad));
  }
  // A Nightmare game's Island Map has 18 cards.
  const t = structuredClone(s);
  t.temple!.map = t.temple!.map.slice(0, 15);
  assert.ok(!valid(t));
});

test("Nightmare: Temple of the Deceived Nightmare games keep valid saves to their end", () => {
  for (const players of [1, 2])
    for (const seed of [3, 7, 11]) {
      const s = autoplay(opening(start(players, seed)), 3000);
      assert.ok(valid(s), `${players} players, seed ${seed}`);
    }
});
