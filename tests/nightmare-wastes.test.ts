import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyAction,
  canTravel,
  optionalEngagementProblem,
} from "../src/game/engine";
import { card, encounterCards } from "../src/game/cards";
import { check, damage, engage, progressLocation } from "../src/game/board";
import { engagementCost, fx, get, make, stageInfo } from "../src/game/core";
import { flush, handle } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { addQuestProgress, sideQuestGoal } from "../src/game/side-quests";
import { mainQuestUnit } from "../src/game/quest-state";
import { forOwner, playerOrder, seatView } from "../src/game/table";
import { WASTES as W } from "../src/game/wastes-eriador-support";
import { wastesIsNight } from "../src/game/wastes-eriador";
import {
  NIGHTMARE,
  NIGHTMARE_AA as N,
  nightmareCardOf,
  nightmareEncounterDecks,
  nightmareStatus,
} from "../src/game/nightmare";
import type { Effect, GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  nightmareForTwo,
  nightmareGame,
  opening,
  shadow,
  valid,
} from "./nightmare-fixtures";
import { base, choose, night, reload, settle } from "./wastes-eriador-fixtures";

const ID = "wastes-of-eriador";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
const hooks = (s: GameState) => batch4Scenario(s);
/** A quiet Nightmare table (the scenario's own fixture), at Day. */
function board(players = 1) {
  const s = base(players);
  s.nightmareMode = true;
  s.nightmare = {};
  return s;
}
const queue = (s: GameState, ...effects: Effect[]) => {
  s.queue.unshift(...effects);
  return s;
};
/** Resolve the queue, answering each choice with `answer` (or the first option). */
function run(
  s: GameState,
  answer: (s: GameState) => string | undefined = () => undefined,
) {
  flush(s);
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 80, "decisions terminate");
    s = choose(reload(s), answer(s) ?? s.choice.options[0].id);
  }
  return s;
}
const reveal = (s: GameState, code: string, p = 0) => {
  s.encounterDeck.unshift(code);
  return queue(s, { kind: "reveal", player: p });
};
const stage = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const engaged = (s: GameState, code: string, p = 0) => {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    s.engaged.push(u);
  });
  return u;
};
const ally = (s: GameState, code = "01016", p = 0) => {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    s.allies.push(u);
  });
  return u;
};
const attach = (u: Unit, code: string) => {
  const a = {
    id: `${u.id}-${code}-${u.attachments.length}`,
    code,
    exhausted: false,
  };
  u.attachments.push(a);
  return a;
};
const options = (s: GameState) => s.choice?.options.map((o) => o.id) ?? [];
const count = (list: string[], code: string) =>
  list.filter((c) => c === code).length;
/** Unexpected Courage (an attachment with no restriction). */
const COURAGE = "01057";
/** Steward of Gondor. */
const STEWARD = "01026";

test("Nightmare: The Wastes of Eriador's setup card and Nightmare Deck carry their scans' texts and stats", () => {
  const c = card(N.wastesCard);
  assert.deepEqual(
    [c.name, c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    [
      "The Wastes of Eriador",
      "nightmare",
      "nightmare",
      "The Wastes of Eriador - Nightmare",
      true,
    ],
  );
  assert.match(
    c.text!,
    /from the standard encounter deck:\n2x Northern Warg\n1x White Warg\n1x Sudden Darkness\n1x North Downs\n2x Eriador Wastes\n1x Cold from Angmar\n3x Biting Wind\n1x Freezing Blast\n1x Shrouded Hills\n3x Rugged Country\n2x Pressing Needs\nThen, shuffle .*\nFinally, flip this setup card over and place it next to the quest deck\. Its effect remains active throughout the game/,
  );
  assert.equal(c.back_text, "You are playing Nightmare mode.");
  const hunters = card(N.packHunters);
  assert.deepEqual(
    [
      hunters.traits,
      hunters.engagement,
      hunters.threat,
      hunters.attack,
      hunters.defense,
      hunters.health,
      hunters.quantity,
    ],
    ["Creature. Warg.", 45, 3, 2, 1, 3, 5],
  );
  assert.match(
    hunters.text!,
    /–30 engagement cost\.\nForced: When you engage Pack Hunters/,
  );
  const where = (code: string) => {
    const x = card(code);
    return [x.type_code, x.traits, x.threat, x.quest, x.quantity];
  };
  assert.deepEqual(where(N.wilderness), ["location", "Arnor.", 6, 4, 3]);
  assert.deepEqual(where(N.badlands), ["location", "Arnor. Hills.", 3, 5, 3]);
  assert.match(
    card(N.badlands).text!,
    /^While Snowy Badlands is in the staging area/,
    "the scan's title in its text (the catalogue had 'Snow Badlands')",
  );
  assert.deepEqual(
    [card(N.stand).type_code, card(N.stand).quest, card(N.stand).victory],
    ["encounter-side-quest", undefined, 10],
  );
  assert.match(
    card(N.stand).text!,
    /Nightfall\.\nThe Time objective cannot flip to Daybreak\.\nResponse: /,
  );
  assert.deepEqual(
    [card(N.track).type_code, card(N.track).quest, card(N.track).victory],
    ["encounter-side-quest", 8, 10],
  );
  assert.match(
    card(N.track).text!,
    /^Surge\.\nForced: .*\nResponse: .*area\.$/,
  );
  assert.equal(card(N.hail).traits, "Weather.");
  for (const code of [N.wilderness, N.wolves, N.hail])
    assert.match(card(code).shadow!, /^Shadow: /, card(code).name);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Wastes of Eriador - Nightmare",
  );
  assert.equal(set.length, 8);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(art.filter((x) => set.some((y) => y.code === x.code)).length, 9);
});

test("Nightmare: The Wastes of Eriador's Nightmare encounter deck matches its source recipe", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const tally = (list: string[]) =>
    list.reduce<Record<string, number>>(
      (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
      {},
    );
  const pile = (
    r: { cards: { code: string; quantity: number; section: string }[] },
    section: string,
  ) =>
    r.cards
      .filter((c) => c.section === section && c.code !== N.wastesCard)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const nightmare = recipes.find((r) => r.id === "N05.4")!;
  const standard = recipes.find((r) => r.id === "Q05.4")!;
  const [deck] = nightmareEncounterDecks(
    ID,
    [pile(standard, "sharedEncounterDeck")],
    () => 0,
  );
  assert.equal(deck.length, 45);
  assert.deepEqual(tally(deck), tally(pile(nightmare, "sharedEncounterDeck")));
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(
      card(N.wastesCard).text!.includes(`${n}x ${title}`),
      `${n}x ${title}`,
    );
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), N.wastesCard);
    assert.ok(valid(s));
    const cards = [
      ...s.encounterDeck,
      ...s.encounterDiscard,
      ...s.staging.map((u) => u.code),
      ...playerOrder(s).flatMap((p) =>
        seatView(s, p).engaged.map((u) => u.code),
      ),
    ];
    assert.equal(count(cards, N.packHunters), 5);
    assert.equal(count(cards, W.wind), 0, "no Biting Wind");
    assert.equal(count(cards, W.wastes), 0, "no Eriador Wastes");
    assert.match(
      nightmareStatus(s)[0],
      /^The Wastes of Eriador · Nightmare mode/,
    );
  }
});

test("Nightmare: Pack Hunters gets −30 engagement cost at Night and, as it is engaged, puts a Warg enemy from the top 5 cards (10 at Night) into play engaged", () => {
  let s = board();
  const hunters = stage(s, N.packHunters);
  assert.equal(engagementCost(s, hunters), 45);
  night(s);
  assert.equal(engagementCost(s, hunters), 15);
  // By day: the top 5 cards; a choice between two Wargs.
  s = board();
  const first = stage(s, N.packHunters);
  s.encounterDeck = [W.downs, W.wolf, W.downs, W.white, W.downs, W.blood];
  forOwner(s, 0, () => engage(s, first));
  flush(s);
  assert.deepEqual(options(s).sort(), [W.white, W.wolf].sort());
  s = choose(reload(s), W.white);
  s = settle(s);
  assert.ok(s.engaged.some((u) => u.code === W.white));
  assert.equal(count(s.encounterDeck, W.white), 0);
  assert.equal(
    count(s.encounterDeck, W.blood),
    1,
    "the sixth card is not searched",
  );
  // At Night: the top 10 cards; a lone Warg is put into play at once.
  s = night(board());
  const second = stage(s, N.packHunters);
  s.encounterDeck = [...Array(8).fill(W.downs), W.blood, W.downs];
  forOwner(s, 0, () => engage(s, second));
  s = run(s);
  assert.ok(s.engaged.some((u) => u.code === W.blood));
  // No Warg: the deck is shuffled.
  s = board();
  const third = stage(s, N.packHunters);
  s.encounterDeck = Array(12).fill(W.downs);
  forOwner(s, 0, () => engage(s, third));
  s = run(s);
  assert.ok(
    s.log.some((l) => /finds? no Warg enemy in the top 5 cards/.test(l.text)),
  );
});

test("Nightmare: Shrouded Wilderness takes no progress at Night, its Travel flips the Time objective to Nightfall, and its shadow gives +1 attack and another shadow card at Night", () => {
  let s = board();
  const w = stage(s, N.wilderness);
  progressLocation(s, w, 2);
  assert.equal(w.progress, 2, "by day");
  night(s);
  progressLocation(s, w, 2);
  assert.equal(w.progress, 2, "no progress at Night");
  // Travel.
  s = board();
  const there = stage(s, N.wilderness);
  s.phase = "travel";
  assert.equal(canTravel(s, there), null);
  s = applyAction(reload(s), { type: "TRAVEL", id: there.id });
  s = settle(s);
  assert.equal(s.activeLocation?.id, there.id);
  assert.equal(wastesIsNight(s), true, "Nightfall");
  // Its shadow.
  s = board();
  const enemy = engaged(s, W.northern);
  assert.equal(shadow(s, enemy, N.wilderness, s.heroes[0]), true);
  assert.equal(s.combat!.attackBonus, 1);
  assert.ok(!s.queue.some((e) => e.kind === "khazadExtraShadows"));
  s = night(board());
  const other = engaged(s, W.northern);
  shadow(s, other, N.wilderness, s.heroes[0]);
  assert.ok(
    s.queue.some((e) => e.kind === "khazadExtraShadows" && e.count === 1),
  );
});

test("Nightmare: while Snowy Badlands is staged the staged enemies cannot take damage, and its Travel has each player deal damage to an exhausted character (2 at Night)", () => {
  let s = board();
  stage(s, N.badlands);
  const staged = stage(s, W.northern);
  const fighting = engaged(s, W.northern);
  damage(s, staged.id, 2);
  damage(s, fighting.id, 2);
  assert.equal(staged.damage, 0);
  assert.equal(fighting.damage, 2);
  // Travel: each player needs an exhausted character.
  s = board(2);
  const there = stage(s, N.badlands);
  s.phase = "travel";
  assert.match(canTravel(s, there)!, /exhausted character/);
  forOwner(s, 0, () => (s.heroes[0].exhausted = true));
  assert.match(canTravel(s, there)!, /exhausted character/);
  forOwner(s, 1, () => {
    s.heroes[0].exhausted = true;
    s.heroes[1].exhausted = true;
  });
  assert.equal(canTravel(s, there), null);
  night(s);
  s = applyAction(reload(s), { type: "TRAVEL", id: there.id });
  s = settle(s);
  assert.equal(s.activeLocation?.id, there.id);
  assert.equal(
    seatView(s, 0).heroes[0].damage,
    2,
    "a lone exhausted character",
  );
  assert.equal(
    seatView(s, 1).heroes.reduce((n, h) => n + h.damage, 0),
    2,
    "2 damage at Night",
  );
});

test("Nightmare: Cunning Wolves attaches to the current quest for +3 quest points and keeps Warg enemies from optional engagement; its shadow deals 2 additional shadow cards at Night", () => {
  let s = board();
  s.phase = "quest";
  s = run(reveal(s, N.wolves));
  assert.deepEqual(
    mainQuestUnit(s)!.attachments.map((a) => a.code),
    [N.wolves],
  );
  assert.ok(!s.encounterDiscard.includes(N.wolves));
  assert.equal(hooks(s).mainQuestGoalBonus!(s), 3);
  assert.equal(stageInfo(s).quest, 23, "Across the Wastes needs 23 progress");
  s.phase = "planning";
  s.queue = [];
  s.progress = 20;
  check(s);
  assert.equal(s.stage, 1, "20 progress no longer clears the stage");
  s.progress = 23;
  check(s);
  assert.equal(s.stage, 2, "23 progress does");
  // Warg enemies cannot be optionally engaged while it is attached.
  let t = board();
  const warg = stage(t, W.northern);
  t.phase = "encounter";
  assert.equal(optionalEngagementProblem(t, warg), null, "without it");
  t.phase = "quest";
  t = run(reveal(t, N.wolves));
  t.phase = "encounter";
  assert.equal(
    optionalEngagementProblem(t, get(t, warg.id)!),
    "This enemy cannot be optionally engaged.",
  );
  assert.equal(
    optionalEngagementProblem(t, stage(t, W.leader)),
    "This enemy cannot be optionally engaged.",
  );
  // On a side quest: +3 to its quest points.
  s = board();
  const track = stage(s, N.track);
  assert.equal(sideQuestGoal(s, track), 8);
  track.attachments.push({
    id: "wolves-on-track",
    code: N.wolves,
    exhausted: false,
  });
  assert.equal(sideQuestGoal(s, track), 11);
  // Its shadow.
  s = board();
  const enemy = engaged(s, W.northern);
  shadow(s, enemy, N.wolves, s.heroes[0]);
  assert.ok(!s.queue.some((e) => e.kind === "khazadExtraShadows"));
  s = night(board());
  const attacker = engaged(s, W.northern);
  shadow(s, attacker, N.wolves, s.heroes[0]);
  assert.ok(
    s.queue.some((e) => e.kind === "khazadExtraShadows" && e.count === 2),
  );
});

test("Nightmare: Torrent of Hail deals 1 damage to each questing character, at Night discarding an attachment from each one damaged; its shadow discards 1 attachment (2 at Night)", () => {
  let s = board();
  const [a, b] = s.heroes;
  a.committed = true;
  b.committed = true;
  attach(a, COURAGE);
  s = run(reveal(s, N.hail));
  assert.deepEqual([a.damage, b.damage], [1, 1]);
  assert.equal(get(s, a.id)!.attachments.length, 1, "by day, no discard");
  assert.ok(s.encounterDiscard.includes(N.hail));
  // At Night: each damaged character discards an attachment (a choice
  // between two).
  s = night(board());
  const [c, d, e] = s.heroes;
  c.committed = true;
  d.committed = true;
  attach(c, COURAGE);
  const steward = attach(c, STEWARD);
  attach(e, COURAGE);
  s = run(reveal(s, N.hail), (x) =>
    x.choice!.options.some((o) => o.id === steward.id) ? steward.id : undefined,
  );
  assert.deepEqual(
    get(s, c.id)!.attachments.map((x) => x.code),
    [COURAGE],
  );
  assert.equal(get(s, e.id)!.attachments.length, 1, "not questing");
  // Its shadow: 1 attachment by day, 2 at Night.
  s = board();
  attach(s.heroes[0], COURAGE);
  attach(s.heroes[1], COURAGE);
  shadow(s, engaged(s, W.northern), N.hail, s.heroes[0]);
  s = run(s);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.attachments.length, 0),
    1,
  );
  s = night(board());
  attach(s.heroes[0], COURAGE);
  attach(s.heroes[1], COURAGE);
  attach(s.heroes[2], COURAGE);
  shadow(s, engaged(s, W.northern), N.hail, s.heroes[0]);
  s = run(s);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.attachments.length, 0),
    1,
  );
});

test("Nightmare: Make a Stand brings Nightfall, holds back Daybreak, gains a token for each defeated enemy and leaves for the victory display at 2 per player or with no enemy in play", () => {
  let s = board(2);
  s.phase = "quest";
  s = run(reveal(s, N.stand));
  const stand = s.staging.find((u) => u.code === N.stand)!;
  assert.ok(stand, "in the staging area");
  assert.equal(wastesIsNight(s), true, "Nightfall");
  // The Time objective cannot flip to Daybreak.
  handle(s, fx("wastesFlip", { flag: false, player: 0 }));
  s = settle(s);
  assert.equal(wastesIsNight(s), true);
  // Progress never defeats it.
  addQuestProgress(s, stand, 5);
  assert.ok(s.staging.some((u) => u.id === stand.id));
  // Defeated enemies: 1 token each; 4 tokens for two players.
  const enemies = [0, 1, 2, 3, 4].map(() => engaged(s, W.northern));
  for (const [i, e] of enemies.slice(0, 3).entries()) {
    damage(s, e.id, 10);
    s = run(s);
    assert.equal(s.staging.find((u) => u.id === stand.id)?.resources, i + 1);
  }
  damage(s, enemies[3].id, 10);
  s = run(s);
  assert.ok(!s.staging.some((u) => u.id === stand.id), "4 tokens");
  assert.ok(s.victoryCards?.includes(N.stand));
  // With no enemy left in play, one token is enough.
  s = board();
  const solo = stage(s, N.stand);
  const last = engaged(s, W.northern);
  damage(s, last.id, 10);
  s = run(s);
  assert.ok(!s.staging.some((u) => u.id === solo.id));
  // Daybreak flips again once it is gone.
  handle(s, fx("wastesFlip", { flag: false, player: 0 }));
  s = settle(s);
  assert.equal(wastesIsNight(s), false);
});

test("Nightmare: Forced off Track surges, removes 1 progress from the main quest for each Warg enemy at the end of the round, and its defeat discards a non-unique Warg enemy in the staging area", () => {
  let s = board();
  s.phase = "quest";
  s.encounterDeck = [N.track, W.downs, W.downs];
  s = run(queue(s, { kind: "reveal", player: 0 }));
  const track = s.staging.find((u) => u.code === N.track)!;
  assert.ok(track);
  assert.ok(
    s.staging.some((u) => u.code === W.downs),
    "Surge",
  );
  // End of the round: X Warg enemies in play.
  s.progress = 6;
  stage(s, W.northern);
  engaged(s, W.white);
  const effects = hooks(s).roundEnd!(s);
  assert.equal(effects.length, 1);
  s = run(queue(s, ...effects));
  assert.equal(s.progress, 4);
  // Its defeat: a choice of non-unique Warg enemies in the staging area.
  s = board();
  const quest = stage(s, N.track);
  const a = stage(s, W.northern);
  const b = stage(s, W.wolf);
  quest.progress = 7;
  addQuestProgress(s, quest, 1);
  s = run(s, (x) =>
    x.choice!.options.some((o) => o.id === b.id) ? b.id : undefined,
  );
  assert.ok(!s.staging.some((u) => u.id === quest.id));
  assert.ok(s.victoryCards?.includes(N.track));
  assert.ok(!s.staging.some((u) => u.id === b.id));
  assert.ok(s.staging.some((u) => u.id === a.id));
});

test("Nightmare: The Wastes of Eriador's Nightmare state survives saves, and seeded games finish with valid saves", () => {
  let s = board();
  const stand = stage(s, N.stand);
  stand.resources = 1;
  mainQuestUnit(s);
  s.phase = "quest";
  s = run(reveal(s, N.wolves));
  const back = reload(s);
  assert.deepEqual(back.staging.find((u) => u.code === N.stand)?.resources, 1);
  assert.equal(hooks(back).mainQuestGoalBonus!(back), 3);
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
    assert.ok(valid(g));
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
  assert.ok(valid(g2));
});
