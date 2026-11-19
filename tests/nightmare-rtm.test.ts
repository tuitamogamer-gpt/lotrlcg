import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { check, progressLocation, revealed } from "../src/game/board";
import { fx, make } from "../src/game/core";
import { flush } from "../src/game/effects";
import { applyAction, optionalEngagementProblem } from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import {
  RETURN as R,
  advanceReturnMirkwood,
  returnMirkwoodGollum as gollum,
  returnMirkwoodGuard as guard,
  returnMirkwoodShadow,
} from "../src/game/return-mirkwood";
import {
  NIGHTMARE,
  NIGHTMARE_SOM as G,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { currentQuestUnit } from "../src/game/quest-state";
import {
  defendersFor,
  forOwner,
  losesRanged,
  ownerOf,
  seatView,
} from "../src/game/table";
import { automatedScenarioId } from "../src/game/support";
import { scenario } from "../src/game/scenarios";
import type { GameState } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  calm,
  choose,
  nightmareForTwo,
  nightmareGame,
  opening,
  pick,
  reload,
  reveal,
  shadow,
  valid,
} from "./nightmare-fixtures";

const HILL = "01082",
  KING = "01074",
  SNARE = "01069",
  WEB = "01080";
const rtm = (seed = 5) => nightmareGame("return-to-mirkwood", seed);
/** A quiet board in `phase`: nothing staged, engaged or discarded. */
function quiet(s: GameState) {
  s.staging = [];
  s.encounterDiscard = [];
  delete s.questAttachments;
  return s;
}
const board = (phase: GameState["phase"], seed = 5) => {
  const s = quiet(calm(opening(rtm(seed)), phase));
  s.engaged = [];
  for (const h of s.heroes) h.exhausted = false;
  return s;
};
/** A quiet two-player board; the first player guards Gollum. */
const twoBoard = (phase: GameState["phase"] = "planning") => {
  const s = quiet(calm(opening(nightmareForTwo("return-to-mirkwood")), phase));
  for (const p of [0, 1])
    forOwner(s, p, () => {
      s.engaged = [];
      for (const h of s.heroes) h.exhausted = false;
    });
  // The setup's reveals may have moved Gollum already.
  const g = gollum(s)!,
    from = ownerOf(s, g);
  forOwner(s, from, () => (s.allies = s.allies.filter((u) => u.id !== g.id)));
  forOwner(s, 0, () => s.allies.push(g));
  return s;
};
const hooks = (s: GameState) => batch4Scenario(s);
const run = (s: GameState, kind: string, data: object = {}) => {
  s.queue.push(fx(kind, data));
  flush(s);
  return s;
};

test("Nightmare: Return to Mirkwood's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(G.rtmCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "Return to Mirkwood - Nightmare", true],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for the Return to Mirkwood scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n3x Woodman's Glade\n3x Wood Elf Path\n3x Mountains of Mirkwood\n2x Goblin Sniper\n1x Marsh Adder\n2x Wargs\n2x Despair\n2x The Brown Lands\n2x The East Bight\nThen, shuffle/,
  );
  assert.equal(
    c.back_text,
    'You are playing Nightmare mode.\nForced: At the beginning of the quest phase, the player who is guarding Gollum must either exhaust a hero he controls or resolve the "when revealed" effect of the topmost Tantrum card in the encounter discard pile.\nForced: When Stage 4A is revealed, search the encounter deck and discard pile for 1 copy of Attercop, Attercop and add it to the staging area, if able. Shuffle the encounter deck.',
  );
  // The scans correct the catalog ("the player", "Guarding", "Surge").
  assert.equal(
    card(G.webSpinner).shadow,
    "Shadow: The player guarding Gollum must exhaust a character he controls.",
  );
  assert.match(
    card(G.wargRider).text!,
    /^Cannot be optionally engaged\.\nForced: After the player guarding Gollum changes, Pursuing Warg-rider engages the player guarding Gollum and makes an immediate attack against that player\.$/,
  );
  assert.match(
    card(G.isolation).text!,
    /^Surge\.\nWhen Revealed: Attach Isolation to the current quest\. \(Counts as a Condition attachment with the text: "All characters lose the ranged and sentinel keywords\. The player guarding Gollum cannot choose a new player to guard Gollum\."\)$/,
  );
  const stat = (code: string) => {
    const x = card(code);
    return [x.engagement, x.threat, x.attack, x.defense, x.health];
  };
  assert.deepEqual(stat(G.ambushing), [28, 2, 4, 3, 7]);
  assert.deepEqual(stat(G.wargRider), [48, 3, 4, 2, 4]);
  assert.deepEqual(stat(G.webSpinner), [33, 3, 3, 2, 5]);
  assert.deepEqual([card(G.deceptive).threat, card(G.deceptive).quest], [4, 1]);
  assert.deepEqual([card(G.webWall).threat, card(G.webWall).quest], [3, 6]);
  assert.deepEqual(
    [G.ambushing, G.wargRider, G.webSpinner, G.befouled, G.wickedness].map(
      (x) => card(x).traits,
    ),
    [
      "Mordor. Orc.",
      "Goblin. Orc.",
      "Creature. Spider.",
      "Tantrum.",
      "Tantrum.",
    ],
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Return to Mirkwood - Nightmare",
  );
  assert.equal(set.length, 9);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(
    art.filter((a) => set.some((x) => x.code === a.code)).length,
    10,
  );
});

test("Nightmare: Return to Mirkwood's Nightmare encounter deck matches its source recipe, and its setup card's Forced effects resolve", () => {
  const sets = scenario("return-to-mirkwood").sets as readonly string[];
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  const deck = nightmareEncounterDeck("return-to-mirkwood", standard);
  const count = (list: string[]) =>
    list.reduce<Record<string, number>>(
      (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
      {},
    );
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const recipe = recipes.find((r) => r.id === "N01.9")!;
  const expected: Record<string, number> = {};
  for (const c of recipe.cards)
    if (
      ["sharedEncounterDeck", "sharedStagingArea"].includes(c.section) &&
      c.code !== G.rtmCard
    )
      expected[c.code] = (expected[c.code] ?? 0) + c.quantity;
  assert.deepEqual(count(deck), expected);
  for (const [title, n] of Object.entries(
    NIGHTMARE["return-to-mirkwood"]!.removals,
  ))
    assert.ok(card(G.rtmCard).text!.includes(`${n}x ${title}`), title);
  assert.equal(
    automatedScenarioId({
      name: "Return to Mirkwood (Nightmare)",
      mode: "nightmare",
    }),
    "return-to-mirkwood",
  );
  const s = opening(rtm());
  assert.equal(nightmareCardOf(s), G.rtmCard);
  assert.match(
    nightmareStatus(s)[0],
    /the player guarding Gollum exhausts a hero or resolves the topmost Tantrum/,
  );
  assert.equal(guard(s), 0);
  assert.ok(valid(s));
  assert.ok(valid(opening(nightmareForTwo("return-to-mirkwood"))));
  // At the beginning of the quest phase, Gollum's guard exhausts a hero...
  const q = run(board("planning"), "startQuest", { player: 0 });
  assert.match(
    q.choice!.title,
    /^Return to Mirkwood · Exhaust a hero, or resolve the topmost Tantrum/,
  );
  assert.deepEqual(
    q.choice!.options.map((o) => o.id),
    q.heroes.map((h) => h.id),
  );
  const tired = q.heroes[1];
  const r = choose(q, tired.id);
  assert.ok(r.heroes.find((h) => h.id === tired.id)!.exhausted);
  assert.ok(valid(r));
  // ...or resolves the topmost Tantrum's "when revealed" effect, which stays
  // in the discard pile.
  const t = board("planning");
  t.encounterDiscard = [R.anguish, HILL];
  const threat = t.threat;
  run(t, "startQuest", { player: 0 });
  assert.equal(t.choice!.options.at(-1)!.id, "tantrum");
  const u = choose(t, "tantrum");
  assert.equal(u.threat, threat + 8);
  assert.deepEqual(u.encounterDiscard, [HILL, R.anguish]);
  assert.ok(u.heroes.every((h) => !h.exhausted));
  // No ready hero and no Tantrum: nothing to resolve.
  const v = board("planning");
  for (const h of v.heroes) h.exhausted = true;
  run(v, "startQuest", { player: 0 });
  assert.ok(!v.choice?.title.startsWith("Return to Mirkwood ·"));
  // The guard decides, in the guard's own seat.
  const two = twoBoard();
  assert.equal(guard(two), 0);
  run(two, "returnSetGuard", { value: 1 });
  assert.equal(guard(two), 1);
  run(two, "startQuest", { player: 0 });
  assert.deepEqual(
    two.choice!.options.map((o) => o.id),
    seatView(two, 1).heroes.map((h) => h.id),
  );
  assert.ok(valid(two));
  // Stage 4A brings 1 Attercop, Attercop from the encounter deck...
  const a = board("planning");
  Object.assign(a, { stage: 3, progress: 7 });
  a.encounterDeck = [HILL, R.attercop, HILL, R.attercop];
  advanceReturnMirkwood(a);
  assert.equal(a.stage, 4);
  assert.equal(a.staging.filter((x) => x.code === R.attercop).length, 1);
  assert.equal(a.encounterDeck.length, 3);
  assert.ok(valid(a));
  // ...or its discard pile; with none left, nothing is added.
  const b = board("planning");
  Object.assign(b, { stage: 3, progress: 7 });
  b.encounterDeck = [HILL];
  b.encounterDiscard = [R.attercop, HILL];
  advanceReturnMirkwood(b);
  assert.ok(b.staging.some((x) => x.code === R.attercop));
  assert.deepEqual(b.encounterDiscard, [HILL]);
  const c = board("planning");
  Object.assign(c, { stage: 3, progress: 7 });
  c.encounterDeck = [HILL];
  advanceReturnMirkwood(c);
  assert.equal(c.stage, 4);
  assert.equal(c.staging.length, 0);
  assert.ok(c.log.some((l) => /no Attercop, Attercop is left/.test(l.text)));
});

test("Nightmare: Pursuing Warg-rider, Ambushing Orcs and Isolation follow the player guarding Gollum", () => {
  // Pursuing Warg-rider cannot be optionally engaged; after the guard
  // changes, it engages the new guard and makes an immediate attack.
  const s = twoBoard("encounter");
  const rider = make(s, G.wargRider);
  s.staging.push(rider);
  assert.match(
    optionalEngagementProblem(s, rider)!,
    /cannot be optionally engaged/,
  );
  run(s, "returnSetGuard", { value: 1 });
  assert.equal(guard(s), 1);
  assert.ok(seatView(s, 1).engaged.some((u) => u.id === rider.id));
  assert.ok(!s.staging.some((u) => u.id === rider.id));
  assert.equal(s.combat?.enemyId, rider.id);
  assert.equal(s.combat?.immediate, true);
  // Engaged with the old guard, it moves to the new one.
  const t = twoBoard("encounter");
  const other = make(t, G.wargRider);
  forOwner(t, 0, () => t.engaged.push(other));
  run(t, "returnSetGuard", { value: 1 });
  assert.ok(!seatView(t, 0).engaged.some((u) => u.id === other.id));
  assert.ok(seatView(t, 1).engaged.some((u) => u.id === other.id));
  // Ambushing Orcs: a shadow card that targets the player guarding Gollum
  // also targets each other player.
  const u = twoBoard("defense");
  const orcs = make(u, G.ambushing),
    troll = make(u, HILL);
  forOwner(u, 1, () => u.engaged.push(orcs, troll));
  const fill = () => {
    for (const p of [0, 1])
      for (const h of seatView(u, p).heroes) h.resources = 2;
  };
  const pools = (p: number) =>
    seatView(u, p).heroes.reduce((n, h) => n + h.resources, 0);
  fill();
  forOwner(u, 1, () => shadow(u, troll, G.webWall, undefined, 1));
  assert.deepEqual([pools(0), pools(1)], [0, 6]);
  fill();
  forOwner(u, 1, () => shadow(u, orcs, G.webWall, undefined, 1));
  assert.deepEqual([pools(0), pools(1)], [0, 0]);
  // The scenario's own Tantrum shadows too.
  const threats = [0, 1].map((p) => seatView(u, p).threat);
  forOwner(u, 1, () => {
    shadow(u, orcs, R.anguish, undefined, 1);
    returnMirkwoodShadow(u, R.anguish);
    flush(u);
  });
  assert.deepEqual(
    [0, 1].map((p) => seatView(u, p).threat),
    threats.map((x) => x + 4),
  );
  // Isolation surges, attaches to the current quest, takes the ranged and
  // sentinel keywords away and locks Gollum's guard.
  const v = board("staging");
  v.encounterDeck = [HILL, HILL];
  const w = reveal(v, G.isolation);
  assert.ok(
    currentQuestUnit(w)!.attachments.some((x) => x.code === G.isolation),
  );
  assert.ok(!w.encounterDiscard.includes(G.isolation));
  assert.equal(w.encounterDeck.length, 1, "Surge");
  assert.ok(losesRanged(w, w.heroes[0]));
  assert.ok(hooks(w).losesKeyword!(w, w.heroes[0], "Sentinel"));
  assert.ok(!hooks(w).losesKeyword!(w, w.heroes[0], "Doomed"));
  assert.ok(valid(w));
  // It is discarded as the quest advances.
  w.progress = 12;
  advanceReturnMirkwood(w);
  check(w);
  assert.equal(w.stage, 2);
  assert.ok(w.encounterDiscard.includes(G.isolation));
  assert.ok(!losesRanged(w, w.heroes[0]));
  // Two players: no sentinel defence for another player, and no new guard.
  const x = twoBoard("defense");
  const spider = make(x, HILL);
  forOwner(x, 0, () => x.engaged.push(spider));
  const sentinel = seatView(x, 1).heroes[0];
  sentinel.roundKeywords = ["Sentinel"];
  const can = () => {
    let ok = false;
    forOwner(x, 0, () => {
      ok = defendersFor(x, spider).some((d) => d.id === sentinel.id);
    });
    return ok;
  };
  assert.equal(can(), true);
  run(x, "returnChooseGuard", { player: 0 });
  assert.match(x.choice!.title, /Choose Gollum's new guard/);
  x.choice = null;
  x.encounterDeck = [HILL, HILL];
  forOwner(x, 0, () => {
    revealed(x, G.isolation);
    flush(x);
  });
  assert.equal(can(), false);
  run(x, "returnChooseGuard", { player: 0 });
  assert.equal(x.choice, null);
  assert.throws(
    () => run(x, "returnSetGuard", { value: 1 }),
    /prevents changing Gollum's guard/,
  );
  assert.equal(guard(x), 0);
});

test("Nightmare: Web-spinner, Web-wall and Deceptive Path", () => {
  // Web-spinner: the guard exhausts a hero, or it gains surge.
  const s = board("staging");
  s.encounterDeck = [HILL, HILL];
  revealed(s, G.webSpinner);
  flush(s);
  assert.match(
    s.choice!.title,
    /^Web-spinner · Exhaust a hero, or Web-spinner gains surge/,
  );
  const hero = s.heroes[2];
  const t = choose(s, hero.id);
  assert.ok(t.heroes.find((h) => h.id === hero.id)!.exhausted);
  assert.equal(t.encounterDeck.length, 2);
  assert.ok(t.staging.some((u) => u.code === G.webSpinner));
  const u = choose(s, "surge");
  assert.equal(u.encounterDeck.length, 1);
  assert.ok(u.staging.some((x) => x.code === HILL));
  assert.ok(valid(u));
  // Its shadow: the guard exhausts a character.
  const v = board("defense");
  const enemy = make(v, HILL);
  v.engaged.push(enemy);
  shadow(v, enemy, G.webSpinner);
  flush(v);
  assert.match(
    v.choice!.title,
    /^Web-spinner · Exhaust a character you control/,
  );
  const victim = v.choice!.options[0].id;
  pick(v, victim);
  assert.ok(v.heroes.find((h) => h.id === victim)!.exhausted);
  // Web-wall: the topmost Spider enemy of the discard pile is revealed.
  const w = board("staging");
  w.encounterDiscard = [G.webSpinner, KING, HILL];
  const x = reveal(w, G.webWall);
  assert.ok(x.staging.some((u) => u.code === G.webWall));
  assert.ok(x.staging.some((u) => u.code === KING));
  assert.deepEqual(x.encounterDiscard, [G.webSpinner, HILL]);
  const y = reveal(board("staging"), G.webWall);
  assert.ok(
    y.log.some((l) =>
      /No Spider enemy is in the encounter discard pile/.test(l.text),
    ),
  );
  // Its shadow: the guard's heroes lose their resources.
  const z = board("defense");
  for (const h of z.heroes) h.resources = 3;
  const orc = make(z, HILL);
  z.engaged.push(orc);
  shadow(z, orc, G.webWall);
  assert.ok(z.heroes.every((h) => h.resources === 0));
  // Deceptive Path: no progress while staged; once active, the discard pile
  // is shuffled in and cards are discarded until a location, which becomes
  // the active location, and Deceptive Path is discarded.
  const a = board("travel");
  const path = make(a, G.deceptive);
  a.staging.push(path);
  progressLocation(a, path, 1);
  assert.equal(path.progress, 0);
  a.encounterDeck = [HILL, HILL];
  a.encounterDiscard = [R.watercourse];
  const b = applyAction(reload(a), { type: "TRAVEL", id: path.id });
  assert.equal(b.activeLocation?.code, R.watercourse);
  assert.ok(b.encounterDiscard.includes(G.deceptive));
  assert.ok(!b.staging.some((u) => u.code === G.deceptive));
  assert.equal(
    b.encounterDeck.length +
      b.encounterDiscard.filter((c) => c === HILL).length,
    2,
  );
  assert.ok(valid(b));
  // No location left: Deceptive Path is simply discarded.
  const c = board("travel");
  const lost = make(c, G.deceptive);
  c.staging.push(lost);
  c.encounterDeck = [HILL];
  const d = applyAction(reload(c), { type: "TRAVEL", id: lost.id });
  assert.equal(d.activeLocation, null);
  assert.deepEqual(d.encounterDiscard.sort(), [HILL, G.deceptive].sort());
  assert.ok(valid(d));
});

test("Nightmare: Befouled Equipment and Wickedness and Mischief", () => {
  // Befouled Equipment: the attachments the guard controls are discarded
  // (on an enemy too), then the guard's discard pile leaves the game;
  // encounter attachments stay.
  const s = board("staging");
  const hero = s.heroes[0];
  hero.attachments.push(
    { id: "b1", code: SNARE, exhausted: false },
    { id: "b2", code: WEB, exhausted: false },
  );
  const snared = make(s, HILL);
  snared.attachments.push({ id: "b4", code: SNARE, exhausted: false });
  s.engaged.push(snared);
  s.discard = ["01057"];
  s.encounterDeck = [HILL, HILL];
  const t = reveal(s, G.befouled);
  const kept = t.heroes.find((h) => h.id === hero.id)!;
  assert.deepEqual(
    kept.attachments.map((a) => a.code),
    [WEB],
  );
  assert.equal(
    t.engaged.find((u) => u.id === snared.id)!.attachments.length,
    0,
  );
  assert.deepEqual(t.discard, []);
  assert.deepEqual([...t.removed].sort(), ["01057", SNARE, SNARE].sort());
  assert.equal(t.encounterDeck.length, 2, "no surge");
  assert.deepEqual(t.encounterDiscard, [G.befouled]);
  assert.ok(valid(t));
  // Nothing discarded: it gains surge.
  const u = board("staging");
  u.encounterDeck = [HILL, HILL];
  const v = reveal(u, G.befouled);
  assert.equal(v.encounterDeck.length, 1, "surge");
  assert.ok(v.encounterDiscard.includes(G.befouled));
  // Its shadow discards the attachments only.
  const w = board("defense");
  w.heroes[1].attachments.push({ id: "b3", code: SNARE, exhausted: false });
  w.discard = ["01057"];
  const orc = make(w, HILL);
  w.engaged.push(orc);
  shadow(w, orc, G.befouled);
  flush(w);
  assert.equal(w.heroes[1].attachments.length, 0);
  assert.deepEqual([...w.discard].sort(), ["01057", SNARE].sort());
  // Wickedness and Mischief: the guard reveals the topmost Tantrum of the
  // discard pile, or 2 encounter cards.
  const x = board("staging");
  x.encounterDiscard = [R.bite, HILL];
  x.encounterDeck = [HILL, HILL, HILL];
  revealed(x, G.wickedness);
  flush(x);
  assert.match(
    x.choice!.title,
    /^Wickedness and Mischief · Reveal the topmost Tantrum, or 2 encounter cards/,
  );
  assert.deepEqual(
    x.choice!.options.map((o) => o.id),
    ["tantrum", "reveal"],
  );
  const y = choose(x, "reveal");
  assert.equal(y.staging.filter((u) => u.code === HILL).length, 2);
  assert.equal(y.encounterDeck.length, 1);
  assert.deepEqual(y.encounterDiscard, [R.bite, HILL, G.wickedness]);
  const z = choose(x, "tantrum");
  assert.match(z.choice!.title, /Gollum's Bite/);
  const bitten = z.heroes[0];
  const damage = bitten.damage;
  const a = choose(z, bitten.id);
  assert.equal(a.heroes.find((h) => h.id === bitten.id)!.damage, damage + 4);
  assert.equal(a.encounterDeck.length, 3);
  assert.deepEqual(a.encounterDiscard, [HILL, R.bite, G.wickedness]);
  assert.ok(valid(a));
  // Its own copy is not in the discard pile while it resolves.
  const b = board("staging");
  b.encounterDeck = [HILL, HILL];
  revealed(b, G.wickedness);
  flush(b);
  assert.deepEqual(
    b.choice!.options.map((o) => o.id),
    ["reveal"],
  );
  // Its shadow deals the topmost Tantrum as a new shadow card, which
  // resolves.
  const c = board("defense");
  delete c.flow;
  c.encounterDiscard = [R.anguish, HILL];
  const troll = make(c, HILL);
  c.engaged.push(troll);
  const threat = c.threat;
  shadow(c, troll, G.wickedness);
  flush(c);
  assert.deepEqual(troll.shadows, [G.wickedness, R.anguish]);
  assert.equal(troll.revealedShadowCount, 2);
  assert.equal(c.threat, threat + 4);
  assert.deepEqual(c.encounterDiscard, [HILL]);
  // None in the discard pile: nothing more happens.
  const d = board("defense");
  const other = make(d, HILL);
  d.engaged.push(other);
  shadow(d, other, G.wickedness);
  assert.deepEqual(other.shadows, [G.wickedness]);
});

test("Nightmare: seeded Return to Mirkwood games finish with valid saves", () => {
  for (const seed of [1, 2]) {
    const s = autoplay(rtm(seed));
    assert.notEqual(s.status, "playing", `return-to-mirkwood seed ${seed}`);
  }
  const t = autoplay(nightmareForTwo("return-to-mirkwood", 7), 4000);
  assert.notEqual(t.status, "playing", "two-player return-to-mirkwood");
});
